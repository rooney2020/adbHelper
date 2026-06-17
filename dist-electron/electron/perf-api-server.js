import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".json": "application/json",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
};
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function execFileAsync(file, args, options = {}) {
    return new Promise((resolve, reject) => {
        execFile(file, args, { encoding: "utf8", maxBuffer: options.maxBuffer ?? 1024 * 1024, timeout: options.timeout }, (err, stdout, stderr) => {
            if (err)
                reject(err);
            else
                resolve({ stdout, stderr });
        });
    });
}
/** Fixed port for perf API server to preserve localStorage origin across restarts */
const FIXED_PORT = 23456;
export function startPerfApiServer(_stateRoot) {
    return new Promise((resolve, reject) => {
        const distRoot = join(__dirname, "../../dist");
        const server = createServer(async (req, res) => {
            if (!req.url) {
                res.statusCode = 400;
                res.end("Bad request");
                return;
            }
            // ── API routes ────────────────────────────────────────────────────────
            if (req.url.startsWith("/api/adb-helper/")) {
                await handleApiRoute(req, res, _stateRoot);
                return;
            }
            // ── Static file serving ───────────────────────────────────────────────
            const url = new URL(req.url, "http://localhost");
            let filePath = join(distRoot, url.pathname === "/" ? "index.html" : url.pathname);
            try {
                await stat(filePath);
            }
            catch {
                // SPA fallback: serve index.html for non-file routes
                filePath = join(distRoot, "index.html");
            }
            try {
                const content = await readFile(filePath);
                const ext = extname(filePath).toLowerCase();
                res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.end(content);
            }
            catch (e) {
                res.statusCode = 500;
                res.end(`Internal server error: ${e instanceof Error ? e.message : String(e)}`);
            }
        });
        server.on("error", (err) => {
            if (err.code === "EADDRINUSE") {
                console.warn(`[Perf API] Port ${FIXED_PORT} in use, falling back to random port`);
                server.listen(0, "127.0.0.1");
            }
            else {
                reject(err);
            }
        });
        server.listen(FIXED_PORT, "127.0.0.1", () => {
            const addr = server.address();
            if (addr && typeof addr === "object") {
                resolve(addr.port);
            }
            else {
                reject(new Error("Failed to get server port"));
            }
        });
    });
}
async function handleApiRoute(req, res, stateDir) {
    const defaultRoot = join(__dirname, "../../backend/state");
    const activeStateDir = stateDir ?? defaultRoot;
    const panelsFilePath = join(activeStateDir, "panels.json");
    const macroTasksFilePath = join(activeStateDir, "macro_tasks.json");
    const scenariosFilePath = join(activeStateDir, "perf_scenarios.json");
    const baselinesFilePath = join(activeStateDir, "perf_baselines.json");
    const url = new URL(req.url, "http://localhost");
    const route = url.pathname.replace("/api/adb-helper/", "");
    try {
        let result;
        if (route === "perf-top-activity") {
            const deviceId = url.searchParams.get("deviceId") ?? "";
            try {
                const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys window | grep mCurrentFocus"], { timeout: 5000 }).catch(() => ({ stdout: "" }));
                const match = stdout.match(/mCurrentFocus=.*?\{.*?\s+(\S+)\/(\S+)\}/);
                if (match) {
                    const pkg = match[1];
                    const activity = match[2].startsWith(".") ? pkg + match[2] : match[2];
                    result = { status: "ok", package: pkg, activity };
                }
                else {
                    result = { status: "error", message: "无法获取当前 Activity" };
                }
            }
            catch (e) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
            }
        }
        else if (route === "perf-fps") {
            const deviceId = url.searchParams.get("deviceId") ?? "";
            const pkg = url.searchParams.get("package") ?? "";
            const mode = url.searchParams.get("mode") ?? "gfxinfo";
            try {
                if (mode === "gfxinfo" && pkg) {
                    const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "gfxinfo", pkg, "framestats"], { timeout: 5000 });
                    result = { status: "ok", data: stdout, mode: "gfxinfo" };
                }
                else {
                    const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "SurfaceFlinger", "--latency"], { timeout: 5000 });
                    result = { status: "ok", data: stdout, mode: "surfaceflinger" };
                }
            }
            catch (e) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
            }
        }
        else if (route === "perf-startup") {
            const deviceId = url.searchParams.get("deviceId") ?? "";
            const pkg = url.searchParams.get("package") ?? "";
            const activity = url.searchParams.get("activity") ?? "";
            const type = url.searchParams.get("type") ?? "cold";
            try {
                if (type === "cold") {
                    await execFileAsync("adb", ["-s", deviceId, "shell", "am", "force-stop", pkg], { timeout: 5000 });
                    await new Promise((r) => setTimeout(r, 1000));
                }
                const component = activity ? `${pkg}/${activity}` : pkg;
                const args = ["-s", deviceId, "shell", "am", "start", "-W"];
                if (type === "cold")
                    args.push("-S");
                args.push(component);
                const { stdout } = await execFileAsync("adb", args, { timeout: 30000 });
                const totalMatch = stdout.match(/TotalTime:\s*(\d+)/);
                const thisMatch = stdout.match(/ThisTime:\s*(\d+)/);
                const waitMatch = stdout.match(/WaitTime:\s*(\d+)/);
                result = {
                    status: "ok",
                    totalTime: totalMatch ? Number(totalMatch[1]) : null,
                    thisTime: thisMatch ? Number(thisMatch[1]) : null,
                    waitTime: waitMatch ? Number(waitMatch[1]) : null,
                    raw: stdout,
                    type,
                };
            }
            catch (e) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
            }
        }
        else if (route === "perf-cpu-mem") {
            const deviceId = url.searchParams.get("deviceId") ?? "";
            const pkg = url.searchParams.get("package") ?? "";
            try {
                const cpuResult = await execFileAsync("adb", ["-s", deviceId, "shell", "top", "-n", "1", "-b", "-o", "%CPU,%MEM,PID,NAME"], { timeout: 5000 }).catch(() => ({ stdout: "" }));
                let cpuPercent = null;
                let pid = null;
                // Parse CPU + extract PID from top output
                const lines = cpuResult.stdout.split("\n");
                for (const line of lines) {
                    if (pkg && line.includes(pkg)) {
                        const cpuMatch = line.match(/^\s*([\d.]+)/);
                        if (cpuMatch) {
                            cpuPercent = Number(cpuMatch[1]);
                        }
                        const pidMatch = line.match(/^\s*[\d.]+\s+[\d.]+\s+(\d+)/);
                        if (pidMatch) {
                            pid = pidMatch[1];
                        }
                        if (cpuPercent !== null && pid !== null)
                            break;
                    }
                }
                if (cpuPercent === null) {
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed.startsWith("User") || trimmed.startsWith("System") || trimmed.startsWith("PID"))
                            continue;
                        const cpuMatch = trimmed.match(/^\s*([\d.]+)/);
                        if (cpuMatch) {
                            const val = Number(cpuMatch[1]);
                            if (!isNaN(val) && val > 0) {
                                cpuPercent = val;
                                break;
                            }
                        }
                    }
                }
                let totalPss = null;
                let memRaw = "";
                if (pkg) {
                    // Use PID if found (more reliable), otherwise fall back to package name
                    let memResult;
                    if (pid) {
                        memResult = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "meminfo", pid], { timeout: 5000 }).catch(() => ({ stdout: "" }));
                    }
                    else {
                        memResult = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "meminfo", pkg], { timeout: 5000 }).catch(() => ({ stdout: "" }));
                    }
                    memRaw = memResult.stdout.slice(0, 3000);
                    const pssMatch = memResult.stdout.match(/TOTAL\s+(\d+)/);
                    if (pssMatch) {
                        totalPss = Number(pssMatch[1]);
                    }
                    else {
                        // Try alternative "TOTAL PSS:" format
                        const pssMatch2 = memResult.stdout.match(/TOTAL PSS:\s+(\d+)/i);
                        if (pssMatch2)
                            totalPss = Number(pssMatch2[1]);
                    }
                    // If still null and no pid, app is not running
                    if (totalPss === null && !pid) {
                        // Will return null; frontend shows N/A with hint
                    }
                }
                result = { status: "ok", cpuPercent, totalPssKb: totalPss, cpuRaw: cpuResult.stdout.slice(0, 2000), memRaw };
            }
            catch (e) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
            }
        }
        else if (route === "perf-reset-gfxinfo") {
            const deviceId = url.searchParams.get("deviceId") ?? "";
            const pkg = url.searchParams.get("package") ?? "";
            try {
                await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "gfxinfo", pkg, "reset"], { timeout: 5000 });
                result = { status: "ok" };
            }
            catch (e) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
            }
        }
        else if (route === "perf-traffic") {
            const deviceId = url.searchParams.get("deviceId") ?? "";
            const pkg = url.searchParams.get("package") ?? "";
            try {
                let uid = null;
                let pid = null;
                // First try to get PID from running process
                try {
                    const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "pidof", pkg], { timeout: 5000 });
                    pid = stdout.trim() || null;
                }
                catch { /* ignore */ }
                let rxBytes = null;
                let txBytes = null;
                // Method 1: Use /proc/<pid>/net/dev if app is running (works on all Android versions)
                if (pid) {
                    try {
                        const { stdout: netDev } = await execFileAsync("adb", ["-s", deviceId, "shell", "cat", `/proc/${pid}/net/dev`], { timeout: 3000 });
                        let totalRx = 0, totalTx = 0;
                        for (const line of netDev.split("\n")) {
                            const trimmed = line.trim();
                            if (!trimmed || trimmed.startsWith("Inter-") || trimmed.startsWith(" face") || trimmed.startsWith("lo:"))
                                continue;
                            const parts = trimmed.split(/\s+/);
                            if (parts.length >= 10) {
                                totalRx += Number(parts[1]) || 0;
                                totalTx += Number(parts[9]) || 0;
                            }
                        }
                        if (totalRx > 0 || totalTx > 0) {
                            rxBytes = totalRx;
                            txBytes = totalTx;
                        }
                    }
                    catch { /* ignore */ }
                }
                // Method 2: If app not running, try legacy uid_stat (deprecated on Android 10+)
                if (rxBytes === null || txBytes === null) {
                    try {
                        const { stdout: uidOut } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "package", pkg], { timeout: 5000 });
                        const uidMatch = uidOut.match(/userId=(\d+)/);
                        if (uidMatch)
                            uid = uidMatch[1];
                    }
                    catch { /* ignore */ }
                    if (!uid) {
                        try {
                            const { stdout: pmOut } = await execFileAsync("adb", ["-s", deviceId, "shell", "pm", "list", "packages", "-U", pkg], { timeout: 5000 });
                            const uidMatch = pmOut.match(new RegExp(`package:${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+uid:(\\d+)`));
                            if (uidMatch)
                                uid = uidMatch[1];
                        }
                        catch { /* ignore */ }
                    }
                    if (uid) {
                        try {
                            const { stdout: rx } = await execFileAsync("adb", ["-s", deviceId, "shell", "cat", `/proc/uid_stat/${uid}/tcp_rcv`], { timeout: 3000 });
                            const { stdout: tx } = await execFileAsync("adb", ["-s", deviceId, "shell", "cat", `/proc/uid_stat/${uid}/tcp_snd`], { timeout: 3000 });
                            rxBytes = Number(rx.trim()) || null;
                            txBytes = Number(tx.trim()) || null;
                        }
                        catch {
                            // Method 3: qtaguid fallback
                            try {
                                const { stdout: qtaguid } = await execFileAsync("adb", ["-s", deviceId, "shell", "cat", "/proc/net/xt_qtaguid/stats"], { timeout: 5000, maxBuffer: 5 * 1024 * 1024 });
                                let totalRx = 0, totalTx = 0;
                                for (const line of qtaguid.split("\n")) {
                                    const cols = line.trim().split(/\s+/);
                                    if (cols[3] === uid && cols[2] === "0") {
                                        totalRx += Number(cols[5]) || 0;
                                        totalTx += Number(cols[7]) || 0;
                                    }
                                }
                                if (totalRx > 0 || totalTx > 0) {
                                    rxBytes = totalRx;
                                    txBytes = totalTx;
                                }
                            }
                            catch { /* ignore */ }
                        }
                    }
                }
                result = { status: "ok", uid, rxBytes, txBytes, pid, netDevMethod: pid ? "proc_net_dev" : uid ? "uid_stat" : "none" };
            }
            catch (e) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
            }
        }
        else if (route === "perf-battery") {
            const deviceId = url.searchParams.get("deviceId") ?? "";
            const pkg = url.searchParams.get("package") ?? "";
            try {
                const { stdout: battOut } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "battery"], { timeout: 5000 });
                const level = battOut.match(/level:\s*(\d+)/)?.[1];
                const temperature = battOut.match(/temperature:\s*(\d+)/)?.[1];
                const voltage = battOut.match(/voltage:\s*(\d+)/)?.[1];
                const status = battOut.match(/status:\s*(\d+)/)?.[1];
                const plugged = battOut.match(/plugged:\s*(\d+)/)?.[1];
                const current = battOut.match(/current now:\s*(-?\d+)/i)?.[1];
                let wakelocks = null;
                if (pkg) {
                    try {
                        const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "batterystats", pkg], { timeout: 8000 });
                        const wlIdx = stdout.indexOf("Wake lock");
                        wakelocks = wlIdx >= 0 ? stdout.slice(wlIdx, wlIdx + 3000) : stdout.slice(0, 3000);
                    }
                    catch { /* ignore */ }
                }
                result = {
                    status: "ok",
                    level: level ? Number(level) : null,
                    temperature: temperature ? Number(temperature) / 10 : null,
                    voltage: voltage ? Number(voltage) : null,
                    batteryStatus: status ? Number(status) : null,
                    plugged: plugged ? Number(plugged) : null,
                    currentNow: current ? Number(current) : null,
                    wakelocks,
                };
            }
            catch (e) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
            }
        }
        else if (route === "perf-gpu") {
            const deviceId = url.searchParams.get("deviceId") ?? "";
            const pkg = url.searchParams.get("package") ?? "";
            try {
                let gpuData = "";
                if (pkg) {
                    const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "gfxinfo", pkg], { timeout: 5000 });
                    gpuData = stdout;
                }
                else {
                    const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "gpu"], { timeout: 5000 });
                    gpuData = stdout;
                }
                const totalFrames = gpuData.match(/Total frames rendered:\s*(\d+)/)?.[1];
                const janky = gpuData.match(/Janky frames:\s*(\d+)/)?.[1];
                const percentile50 = gpuData.match(/50th percentile:\s*(\d+)ms/)?.[1];
                const percentile90 = gpuData.match(/90th percentile:\s*(\d+)ms/)?.[1];
                const percentile95 = gpuData.match(/95th percentile:\s*(\d+)ms/)?.[1];
                const percentile99 = gpuData.match(/99th percentile:\s*(\d+)ms/)?.[1];
                const missedVsync = gpuData.match(/Number Missed Vsync:\s*(\d+)/)?.[1];
                const highInputLatency = gpuData.match(/Number High input latency:\s*(\d+)/)?.[1];
                const slowUiThread = gpuData.match(/Number Slow UI thread:\s*(\d+)/)?.[1];
                const slowBitmapUploads = gpuData.match(/Number Slow bitmap uploads:\s*(\d+)/)?.[1];
                const slowIssueDraw = gpuData.match(/Number Slow issue draw commands:\s*(\d+)/)?.[1];
                result = {
                    status: "ok",
                    totalFrames: totalFrames ? Number(totalFrames) : null,
                    jankyFrames: janky ? Number(janky) : null,
                    percentile50: percentile50 ? Number(percentile50) : null,
                    percentile90: percentile90 ? Number(percentile90) : null,
                    percentile95: percentile95 ? Number(percentile95) : null,
                    percentile99: percentile99 ? Number(percentile99) : null,
                    missedVsync: missedVsync ? Number(missedVsync) : null,
                    highInputLatency: highInputLatency ? Number(highInputLatency) : null,
                    slowUiThread: slowUiThread ? Number(slowUiThread) : null,
                    slowBitmapUploads: slowBitmapUploads ? Number(slowBitmapUploads) : null,
                    slowIssueDraw: slowIssueDraw ? Number(slowIssueDraw) : null,
                    raw: gpuData.slice(0, 4000),
                };
            }
            catch (e) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
            }
        }
        else if (route === "perf-storage-io") {
            const deviceId = url.searchParams.get("deviceId") ?? "";
            const pkg = url.searchParams.get("package") ?? "";
            try {
                let pid = null;
                try {
                    const { stdout: pidOut } = await execFileAsync("adb", ["-s", deviceId, "shell", "pidof", pkg], { timeout: 5000 });
                    pid = pidOut.trim().split(/\s+/)[0] || null;
                }
                catch { /* not running */ }
                let ioData = { readBytes: null, writeBytes: null, readSyscalls: null, writeSyscalls: null };
                if (pid) {
                    try {
                        const { stdout: ioOut } = await execFileAsync("adb", ["-s", deviceId, "shell", "cat", `/proc/${pid}/io`], { timeout: 3000 });
                        const rb = ioOut.match(/read_bytes:\s*(\d+)/)?.[1];
                        const wb = ioOut.match(/write_bytes:\s*(\d+)/)?.[1];
                        const rs = ioOut.match(/syscr:\s*(\d+)/)?.[1];
                        const ws = ioOut.match(/syscw:\s*(\d+)/)?.[1];
                        ioData = {
                            readBytes: rb ? Number(rb) : null,
                            writeBytes: wb ? Number(wb) : null,
                            readSyscalls: rs ? Number(rs) : null,
                            writeSyscalls: ws ? Number(ws) : null,
                        };
                    }
                    catch { /* permission denied */ }
                }
                let diskStats = "";
                try {
                    const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "diskstats"], { timeout: 5000 });
                    diskStats = stdout.slice(0, 2000);
                }
                catch { /* ignore */ }
                result = { status: "ok", pid, ...ioData, diskStats };
            }
            catch (e) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
            }
        }
        else if (route === "perf-scenarios-load") {
            try {
                const data = await readFile(scenariosFilePath, "utf-8");
                result = { status: "ok", scenarios: JSON.parse(data) };
            }
            catch {
                result = { status: "ok", scenarios: [] };
            }
        }
        else if (route === "perf-scenarios-save" && req.method === "POST") {
            const body = await readBody(req);
            try {
                const { scenarios } = JSON.parse(body);
                await mkdir(dirname(scenariosFilePath), { recursive: true });
                await writeFile(scenariosFilePath, JSON.stringify(scenarios, null, 2), "utf-8");
                result = { status: "ok" };
            }
            catch (err) {
                result = { status: "error", message: err?.message ?? String(err) };
            }
        }
        else if (route === "perf-alert-check") {
            const deviceId = url.searchParams.get("deviceId") ?? "";
            const pkg = url.searchParams.get("package") ?? "";
            const since = url.searchParams.get("since") ?? "";
            try {
                const args = ["-s", deviceId, "logcat", "-d", "-b", "crash"];
                if (since)
                    args.push("-t", since);
                const { stdout: crashLog } = await execFileAsync("adb", args, { timeout: 5000, maxBuffer: 2 * 1024 * 1024 }).catch(() => ({ stdout: "" }));
                const rawCrashLines = crashLog.split("\n").filter((l) => !pkg || l.includes(pkg));
                // Group crash lines into distinct crash events (delimited by "Process:" header)
                const crashEvents = [];
                let currentEvent = [];
                for (const line of rawCrashLines) {
                    if (/\bProcess:/.test(line) && currentEvent.length > 0) {
                        crashEvents.push(currentEvent.join("\n"));
                        currentEvent = [line];
                    }
                    else {
                        currentEvent.push(line);
                    }
                }
                if (currentEvent.length > 0)
                    crashEvents.push(currentEvent.join("\n"));
                const { stdout: anrLog } = await execFileAsync("adb", ["-s", deviceId, "logcat", "-d", "-b", "events", "-s", "am_anr"], { timeout: 5000, maxBuffer: 1024 * 1024 }).catch(() => ({ stdout: "" }));
                const anrLines = anrLog.split("\n").filter((l) => l.trim() && (!pkg || l.includes(pkg)));
                let dropboxAnr = "";
                if (pkg) {
                    try {
                        const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "dropbox", "--print", "data_app_anr"], { timeout: 5000, maxBuffer: 2 * 1024 * 1024 });
                        const sections = stdout.split("========");
                        dropboxAnr = sections.filter((s) => s.includes(pkg)).slice(-3).join("\n---\n").slice(0, 3000);
                    }
                    catch { /* ignore */ }
                }
                result = { status: "ok", crashes: crashEvents.slice(-10), anrs: anrLines.slice(-20), dropboxAnr: dropboxAnr || null };
            }
            catch (e) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
            }
        }
        else if (route === "perf-alert-tombstones") {
            const deviceId = url.searchParams.get("deviceId") ?? "";
            try {
                const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "ls", "-lt", "/data/tombstones/"], { timeout: 5000 }).catch(() => ({ stdout: "" }));
                const files = stdout.trim().split("\n").filter((l) => l.includes("tombstone_")).slice(0, 10);
                result = { status: "ok", tombstones: files };
            }
            catch (e) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
            }
        }
        else if (route === "perf-baselines-load") {
            try {
                const data = await readFile(baselinesFilePath, "utf-8");
                result = { status: "ok", baselines: JSON.parse(data) };
            }
            catch {
                result = { status: "ok", baselines: [] };
            }
        }
        else if (route === "perf-baselines-save" && req.method === "POST") {
            const body = await readBody(req);
            try {
                const { baselines } = JSON.parse(body);
                await mkdir(dirname(baselinesFilePath), { recursive: true });
                await writeFile(baselinesFilePath, JSON.stringify(baselines, null, 2), "utf-8");
                result = { status: "ok" };
            }
            catch (err) {
                result = { status: "error", message: err?.message ?? String(err) };
            }
        }
        else if (route === "panels-load") {
            try {
                const data = await readFile(panelsFilePath, "utf-8");
                result = { status: "ok", panels: JSON.parse(data) };
            }
            catch {
                result = { status: "ok", panels: null };
            }
        }
        else if (route === "panels-save" && req.method === "POST") {
            const body = await readBody(req);
            try {
                const { panels } = JSON.parse(body);
                await mkdir(dirname(panelsFilePath), { recursive: true });
                await writeFile(panelsFilePath, JSON.stringify(panels, null, 2), "utf-8");
                result = { status: "ok" };
            }
            catch (err) {
                result = { status: "error", message: err?.message ?? String(err) };
            }
        }
        else if (route === "macro-tasks-load") {
            try {
                const data = await readFile(macroTasksFilePath, "utf-8");
                result = { status: "ok", tasks: JSON.parse(data) };
            }
            catch {
                result = { status: "ok", tasks: null };
            }
        }
        else if (route === "macro-tasks-save" && req.method === "POST") {
            const body = await readBody(req);
            try {
                const { tasks } = JSON.parse(body);
                await mkdir(dirname(macroTasksFilePath), { recursive: true });
                await writeFile(macroTasksFilePath, JSON.stringify(tasks, null, 2), "utf-8");
                result = { status: "ok" };
            }
            catch (err) {
                result = { status: "error", message: err?.message ?? String(err) };
            }
        }
        else {
            result = { status: "error", message: `未知路由: ${route}` };
        }
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(JSON.stringify(result));
    }
    catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ status: "error", message: err instanceof Error ? err.message : String(err) }));
    }
}
function readBody(req) {
    return new Promise((resolve) => {
        let data = "";
        req.on("data", (chunk) => { data += chunk.toString(); });
        req.on("end", () => resolve(data));
    });
}
