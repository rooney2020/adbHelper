import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execFile, spawn, type ChildProcess } from "child_process";
import { execFileDecoded } from "./src/shared/execFileDecoded.js";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { IncomingMessage, ServerResponse } from "http";

const execFileAsync = execFileDecoded;
const __dirname = dirname(fileURLToPath(import.meta.url));
const panelsFilePath = join(__dirname, "backend/state/panels.json");
const macroTasksFilePath = join(__dirname, "backend/state/macro_tasks.json");
const scenariosFilePath = join(__dirname, "backend/state/perf_scenarios.json");
const baselinesFilePath = join(__dirname, "backend/state/perf_baselines.json");

// ─── Monkey session state ─────────────────────────────────────────────────────
interface MonkeySession {
  deviceId: string;
  child: ChildProcess | null;
  logcatChild: ChildProcess | null;
  running: boolean;
  pid: number | null;
  startTime: number;
  totalEvents: number;
  completedEvents: number;
  logBuffer: string[];
  logCursor: number;
  crashCount: number;
  anrCount: number;
  exceptionCount: number;
  crashLogs: string[];
  anrLogs: string[];
  packages: string[];
  partialLine: string;
  logcatPartialLine: string;
}

const monkeySessions = new Map<string, MonkeySession>();
const MONKEY_LOG_LIMIT = 5000;
const MONKEY_EVENT_PATTERN = /Events injected:\s*(\d+)/;
const MONKEY_CRASH_PATTERN = /CRASH|crash|Fatal|FATAL|NullPointerException|IllegalStateException|RuntimeException/;
const MONKEY_ANR_PATTERN = /ANR|anr|Application Not Responding|NOT RESPONDING/;
const MONKEY_EXCEPTION_PATTERN = /Exception|EXCEPTION/;

export default defineConfig({
  base: "./",
  plugins: [
    react({
      babel: {
        compact: false,
      },
    }),
    {
      name: "adb-helper-api",
      configureServer(server) {
        server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (!req.url?.startsWith("/api/adb-helper/")) {
            next();
            return;
          }

          const url = new URL(req.url, "http://localhost");
          const route = url.pathname.replace("/api/adb-helper/", "");

          try {
            let result: unknown;

            if (route === "device-list") {
              const { stdout } = await execFileAsync("adb", ["devices", "-l"], { timeout: 5000 });
              const lines = stdout.trim().split("\n").slice(1);
              result = lines
                .filter((l) => l.includes("device"))
                .map((l) => {
                  const parts = l.split(/\s+/);
                  const id = parts[0];
                  const model = l.match(/model:(\S+)/)?.[1] ?? id;
                  return { id, name: model, status: "device", model, transport: "usb" };
                });
            } else if (route === "device-probe") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const { stdout: modelOut } = await execFileAsync("adb", ["-s", deviceId, "shell", "getprop", "ro.product.model"], { timeout: 5000 });
              const { stdout: displayIdOut } = await execFileAsync("adb", ["-s", deviceId, "shell", "getprop", "ro.build.display.id"], { timeout: 5000 });
              result = { command: "probe", device: deviceId, status: "ok", model: modelOut.trim(), "properties.displayId": displayIdOut.trim() };
            } else if (route === "layout-dump-ui-tree") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              await execFileAsync("adb", ["-s", deviceId, "shell", "uiautomator", "dump", "/sdcard/window_dump.xml"], { timeout: 15000 });
              const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "cat", "/sdcard/window_dump.xml"], { timeout: 15000, maxBuffer: 10 * 1024 * 1024 });
              result = { status: "ok", xml: stdout };
            } else if (route === "layout-screenshot") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const { stdout } = await execFileAsync("adb", ["-s", deviceId, "exec-out", "screencap", "-p"], { timeout: 15000, maxBuffer: 20 * 1024 * 1024, encoding: "buffer" as unknown as string });
              const base64 = Buffer.from(stdout as unknown as Buffer).toString("base64");
              result = { status: "ok", dataUrl: `data:image/png;base64,${base64}` };
            } else if (route === "layout-list-processes") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "ps", "-A", "-o", "USER,PID,NAME"], { timeout: 10000, maxBuffer: 5 * 1024 * 1024 });
              const lines = stdout.trim().split("\n").slice(1);
              const processes = lines.map((line) => {
                const parts = line.trim().split(/\s+/);
                return { user: parts[0], pid: parts[1], name: parts.slice(2).join(" ") };
              }).filter((p) => p.name && p.user && /^u\d+_/.test(p.user));
              result = { status: "ok", processes };
            } else if (route === "panels-load") {
              try {
                const data = await readFile(panelsFilePath, "utf-8");
                result = { status: "ok", panels: JSON.parse(data) };
              } catch {
                result = { status: "ok", panels: null };
              }
            } else if (route === "panels-save") {
              // POST body
              const body = await new Promise<string>((resolve) => {
                let d = "";
                req.on("data", (chunk: Buffer) => { d += chunk.toString(); });
                req.on("end", () => resolve(d));
              });
              try {
                const { panels } = JSON.parse(body);
                await mkdir(dirname(panelsFilePath), { recursive: true });
                await writeFile(panelsFilePath, JSON.stringify(panels, null, 2), "utf-8");
                result = { status: "ok" };
              } catch (err: any) {
                result = { status: "error", message: err?.message ?? String(err) };
              }
            } else if (route === "macro-tasks-load") {
              try {
                const data = await readFile(macroTasksFilePath, "utf-8");
                result = { status: "ok", tasks: JSON.parse(data) };
              } catch {
                result = { status: "ok", tasks: null };
              }
            } else if (route === "macro-tasks-save") {
              const body = await new Promise<string>((resolve) => {
                let d = "";
                req.on("data", (chunk: Buffer) => { d += chunk.toString(); });
                req.on("end", () => resolve(d));
              });
              try {
                const { tasks } = JSON.parse(body);
                await mkdir(dirname(macroTasksFilePath), { recursive: true });
                await writeFile(macroTasksFilePath, JSON.stringify(tasks, null, 2), "utf-8");
                result = { status: "ok" };
              } catch (err: any) {
                result = { status: "error", message: err?.message ?? String(err) };
              }
            } else if (route === "screen-capture") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const displayId = Number(url.searchParams.get("displayId") ?? "0");
              try {
                const args = ["-s", deviceId, "exec-out", "screencap", "-p"];
                if (displayId !== 0) args.splice(4, 0, "-d", String(displayId));
                const { stdout } = await execFileAsync("adb", args, { timeout: 15000, maxBuffer: 20 * 1024 * 1024, encoding: "buffer" as unknown as string });
                const buf = Buffer.from(stdout as unknown as Buffer);
                const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
                const savePath = join(process.env.HOME ?? "/home/tsdl", "Pictures", `screenshot_d${displayId}_${timestamp}.png`);
                await mkdir(dirname(savePath), { recursive: true });
                await writeFile(savePath, buf);
                result = { status: "ok", dataUrl: `data:image/png;base64,${buf.toString("base64")}`, savedPath: savePath };
              } catch (err: any) {
                result = { status: "error", message: err?.message ?? String(err) };
              }
            } else if (route === "screen-start-record") {
              const body = await new Promise<string>((resolve) => {
                let d = "";
                req.on("data", (chunk: Buffer) => { d += chunk.toString(); });
                req.on("end", () => resolve(d));
              });
              try {
                const { deviceId, displayId = 0 } = JSON.parse(body);
                const remotePath = `/sdcard/screenrecord_d${displayId}_${Date.now()}.mp4`;
                const args = ["-s", deviceId, "shell", "screenrecord", "--time-limit", "180", "--bugreport"];
                // screenrecord 需要 physical display ID，通过 dumpsys SurfaceFlinger 获取映射
                let physicalDisplayId: string | null = null;
                try {
                  const { stdout: sfOutput } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "SurfaceFlinger", "--display-id"], { timeout: 5000 });
                  // 格式: "Display 129 (HWC display 0): ..." — HWC display N 对应逻辑 display N
                  const lines = sfOutput.split("\n");
                  for (const line of lines) {
                    const m = line.match(/Display\s+(\d+)\s+\(HWC display\s+(\d+)\)/);
                    if (m && Number(m[2]) === displayId) { physicalDisplayId = m[1]; break; }
                  }
                } catch {}
                if (physicalDisplayId) args.push("--display-id", physicalDisplayId);
                args.push(remotePath);
                execFileAsync("adb", args, { timeout: 185000 }).catch(() => {});
                (globalThis as any).__activeRecordings = (globalThis as any).__activeRecordings ?? new Map();
                const existing: Array<{ remotePath: string; displayId: number }> = (globalThis as any).__activeRecordings.get(deviceId) ?? [];
                existing.push({ remotePath, displayId });
                (globalThis as any).__activeRecordings.set(deviceId, existing);
                result = { status: "ok", remotePath };
              } catch (err: any) {
                result = { status: "error", message: err?.message ?? String(err) };
              }
            } else if (route === "screen-stop-record") {
              const body = await new Promise<string>((resolve) => {
                let d = "";
                req.on("data", (chunk: Buffer) => { d += chunk.toString(); });
                req.on("end", () => resolve(d));
              });
              try {
                const { deviceId } = JSON.parse(body);
                await execFileAsync("adb", ["-s", deviceId, "shell", "pkill", "-SIGINT", "screenrecord"], { timeout: 5000 }).catch(() => {});
                await new Promise((r) => setTimeout(r, 1500));
                const allRecordings: Map<string, Array<{ remotePath: string; displayId: number }>> = (globalThis as any).__activeRecordings ?? new Map();
                const recordings = allRecordings.get(deviceId);
                if (!recordings || recordings.length === 0) { result = { status: "error", message: "没有正在进行的录屏" }; } else {
                  const files: Array<{ displayId: number; localPath: string }> = [];
                  for (const recording of recordings) {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
                    const localPath = join(process.env.HOME ?? "/home/tsdl", "Videos", `screenrecord_d${recording.displayId}_${timestamp}_${Math.random().toString(36).slice(2, 6)}.mp4`);
                    await mkdir(dirname(localPath), { recursive: true });
                    await execFileAsync("adb", ["-s", deviceId, "pull", recording.remotePath, localPath], { timeout: 30000 }).catch(() => {});
                    await execFileAsync("adb", ["-s", deviceId, "shell", "rm", recording.remotePath], { timeout: 5000 }).catch(() => {});
                    files.push({ displayId: recording.displayId, localPath });
                  }
                  allRecordings.delete(deviceId);
                  result = { status: "ok", files, localPath: files.map((f) => f.localPath).join(", ") };
                }
              } catch (err: any) {
                result = { status: "error", message: err?.message ?? String(err) };
              }
            } else if (route === "crash-list") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              try {
                const [tombstones, anr, dropbox] = await Promise.all([
                  execFileAsync("adb", ["-s", deviceId, "shell", "ls -lt /data/tombstones/ 2>/dev/null"], { timeout: 5000 }).then((r) => r.stdout).catch(() => ""),
                  execFileAsync("adb", ["-s", deviceId, "shell", "ls -lt /data/anr/ 2>/dev/null"], { timeout: 5000 }).then((r) => r.stdout).catch(() => ""),
                  execFileAsync("adb", ["-s", deviceId, "shell", "ls -lt /data/system/dropbox/ 2>/dev/null | head -50"], { timeout: 5000 }).then((r) => r.stdout).catch(() => ""),
                ]);
                const parseLS = (raw: string, dir: string) => raw.trim().split("\n").filter((l) => l && !l.startsWith("total")).map((l) => {
                  const parts = l.trim().split(/\s+/);
                  return { name: parts[parts.length - 1], size: parts[4] ?? "", date: `${parts[5] ?? ""} ${parts[6] ?? ""} ${parts[7] ?? ""}`, path: `${dir}${parts[parts.length - 1]}` };
                }).filter((f) => f.name);
                result = {
                  status: "ok",
                  tombstones: parseLS(tombstones, "/data/tombstones/"),
                  anr: parseLS(anr, "/data/anr/"),
                  dropbox: parseLS(dropbox, "/data/system/dropbox/").filter((f) => /TOMBSTONE|CRASH|ANR|SYSTEM_APP/.test(f.name)),
                };
              } catch (err: any) { result = { status: "error", message: err?.message ?? String(err) }; }
            } else if (route === "crash-read") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const filePath = url.searchParams.get("filePath") ?? "";
              // Only allow reading from known safe paths
              if (!/^\/data\/(tombstones|anr|system\/dropbox)\//.test(filePath)) {
                result = { status: "error", message: "不允许读取该路径" };
              } else {
                try {
                  const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", `cat "${filePath}" 2>/dev/null | head -500`], { timeout: 10000, maxBuffer: 5 * 1024 * 1024 });
                  result = { status: "ok", content: stdout };
                } catch (err: any) { result = { status: "error", message: err?.message ?? String(err) }; }
              }
            } else if (route === "bugreport") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const os = await import("os");
              const path = await import("path");
              const outDir = path.default.join(os.default.homedir(), "Documents", "adb-helper-bugreport");
              const fs = await import("fs");
              if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
              try {
                const { stdout } = await execFileAsync("adb", ["-s", deviceId, "bugreport", outDir], { timeout: 300000, maxBuffer: 50 * 1024 * 1024 });
                const files = fs.readdirSync(outDir).filter((f: string) => f.endsWith(".zip")).sort().reverse();
                result = { status: "ok", message: stdout, file: files[0] ? path.default.join(outDir, files[0]) : outDir };
              } catch (err: any) { result = { status: "error", message: err?.message ?? String(err) }; }
            } else if (route === "trace-start") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const duration = url.searchParams.get("duration") ?? "5";
              const categories = url.searchParams.get("categories") ?? "gfx,view,wm";
              const os = await import("os");
              const path = await import("path");
              const outDir = path.default.join(os.default.homedir(), "Documents", "adb-helper-trace");
              const fs = await import("fs");
              if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
              const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
              const localPath = path.default.join(outDir, `trace_${timestamp}.atrace`);
              const remotePath = `/data/local/tmp/atrace_${timestamp}.bin`;
              try {
                const catList = categories.split(",").join(" ");
                await execFileAsync("adb", ["-s", deviceId, "shell", `atrace -z -t ${duration} ${catList} > ${remotePath}`], { timeout: (parseInt(duration) + 10) * 1000 });
                await execFileAsync("adb", ["-s", deviceId, "pull", remotePath, localPath], { timeout: 30000 });
                await execFileAsync("adb", ["-s", deviceId, "shell", `rm -f ${remotePath}`], { timeout: 5000 }).catch(() => {});
                result = { status: "ok", file: localPath };
              } catch (err: any) { result = { status: "error", message: err?.message ?? String(err) }; }
            } else if (route === "local-file") {
              // Serve local file (restricted to ~/Pictures and ~/Videos)
              const filePath = url.searchParams.get("path") ?? "";
              const home = process.env.HOME ?? "/home/tsdl";
              const allowedPrefixes = [join(home, "Pictures"), join(home, "Videos"), join(home, "Documents")];
              const { resolve } = await import("path");
              const resolved = resolve(filePath);
              if (!allowedPrefixes.some((p) => resolved.startsWith(p + "/"))) {
                res.statusCode = 403;
                res.end("Forbidden");
                return;
              }
              try {
                const data = await readFile(resolved);
                const ext = resolved.split(".").pop()?.toLowerCase();
                const mimeMap: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", mp4: "video/mp4", webm: "video/webm", atrace: "application/octet-stream", zip: "application/zip" };
                res.setHeader("Content-Type", mimeMap[ext ?? ""] ?? "application/octet-stream");
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.end(data);
              } catch {
                res.statusCode = 404;
                res.end("Not found");
              }
              return;
            } else if (route === "device-apps") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const { stdout } = await execFileAsync("python3", [join(__dirname, "backend/cli.py"), "device-apps", "--device", deviceId], { timeout: 60000 });
              res.setHeader("Content-Type", "application/json");
              res.end(stdout);
              return;
            } else if (route === "device-app-detail") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const packageName = url.searchParams.get("packageName") ?? "";
              const { stdout } = await execFileAsync("python3", [join(__dirname, "backend/cli.py"), "device-app-detail", "--device", deviceId, "--package", packageName], { timeout: 30000 });
              res.setHeader("Content-Type", "application/json");
              res.end(stdout);
              return;
            } else if (route === "device-processes") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const { stdout } = await execFileAsync("python3", [join(__dirname, "backend/cli.py"), "device-processes", "--device", deviceId], { timeout: 30000 });
              res.setHeader("Content-Type", "application/json");
              res.end(stdout);
              return;
            } else if (route === "device-users") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const { stdout } = await execFileAsync("python3", [join(__dirname, "backend/cli.py"), "device-users", "--device", deviceId], { timeout: 15000 });
              res.setHeader("Content-Type", "application/json");
              res.end(stdout);
              return;
            } else if (route === "device-display-list") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const { stdout } = await execFileAsync("python3", [join(__dirname, "backend/cli.py"), "device-display-list", "--device", deviceId], { timeout: 15000 });
              res.setHeader("Content-Type", "application/json");
              res.end(stdout);
              return;
            } else if (route === "backup-info") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const { stdout } = await execFileAsync("python3", [join(__dirname, "backend/cli.py"), "backup-info", "--device", deviceId], { timeout: 15000 });
              res.setHeader("Content-Type", "application/json");
              res.end(stdout);
              return;
            } else if (route === "keysim-screenshot") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const { stdout } = await execFileAsync("adb", ["-s", deviceId, "exec-out", "screencap", "-p"], { timeout: 15000, maxBuffer: 20 * 1024 * 1024, encoding: "buffer" as unknown as string });
              const base64 = Buffer.from(stdout as unknown as Buffer).toString("base64");
              result = { status: "ok", dataUrl: `data:image/png;base64,${base64}` };
            } else if (route === "monkey-apps") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              try {
                // Get all users
                const { stdout: usersOut } = await execFileAsync("adb", ["-s", deviceId, "shell", "pm", "list", "users"], { timeout: 5000 }).catch(() => ({ stdout: "" }));
                const userIds: string[] = ["0"];
                const userMatches = usersOut.matchAll(/UserInfo\{(\d+):/g);
                for (const m of userMatches) {
                  if (!userIds.includes(m[1])) userIds.push(m[1]);
                }
                // Merge packages from all users
                const allPackages = new Set<string>();
                for (const uid of userIds) {
                  try {
                    const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "pm", "list", "packages", "--user", uid], { timeout: 10000 });
                    for (const line of stdout.trim().split("\n")) {
                      const pkg = line.replace("package:", "").trim();
                      if (pkg) allPackages.add(pkg);
                    }
                  } catch {}
                }
                const packages = Array.from(allPackages).sort();
                result = { status: "ok", packages };
              } catch (err: any) { result = { status: "error", message: err?.message ?? String(err), packages: [] }; }
            } else if (route === "monkey-start" && req.method === "POST") {
              const body = await new Promise<string>((resolve) => {
                let d = "";
                req.on("data", (chunk: Buffer) => { d += chunk.toString(); });
                req.on("end", () => resolve(d));
              });
              try {
                const { deviceId, config } = JSON.parse(body);
                // Kill any existing session
                const existing = monkeySessions.get(deviceId);
                if (existing?.running) {
                  existing.child?.kill("SIGKILL");
                  existing.logcatChild?.kill("SIGKILL");
                  await execFileAsync("adb", ["-s", deviceId, "shell", "pkill", "-f", "monkey"], { timeout: 5000 }).catch(() => {});
                }
                // Build monkey command args
                const monkeyArgs: string[] = [];
                if (config.includePackages) {
                  for (const pkg of config.includePackages) {
                    if (pkg.trim()) monkeyArgs.push("-p", pkg.trim());
                  }
                }
                if (config.throttle > 0) monkeyArgs.push("--throttle", String(config.throttle));
                if (config.pctTouch > 0) monkeyArgs.push("--pct-touch", String(config.pctTouch));
                if (config.pctMotion > 0) monkeyArgs.push("--pct-motion", String(config.pctMotion));
                if (config.pctTrackball > 0) monkeyArgs.push("--pct-trackball", String(config.pctTrackball));
                if (config.pctNav > 0) monkeyArgs.push("--pct-nav", String(config.pctNav));
                if (config.pctMajornav > 0) monkeyArgs.push("--pct-majornav", String(config.pctMajornav));
                if (config.pctSyskeys > 0) monkeyArgs.push("--pct-syskeys", String(config.pctSyskeys));
                if (config.pctAppswitch > 0) monkeyArgs.push("--pct-appswitch", String(config.pctAppswitch));
                if (config.pctFlip > 0) monkeyArgs.push("--pct-flip", String(config.pctFlip));
                if (config.pctAnyevent > 0) monkeyArgs.push("--pct-anyevent", String(config.pctAnyevent));
                if (config.seed) monkeyArgs.push("-s", config.seed);
                if (config.verbosity > 0) {
                  for (let i = 0; i < config.verbosity; i++) monkeyArgs.push("-v");
                }
                if (config.ignoreCrashes) monkeyArgs.push("--ignore-crashes");
                if (config.ignoreTimeouts) monkeyArgs.push("--ignore-timeouts");
                if (config.ignoreSecurityExceptions) monkeyArgs.push("--ignore-security-exceptions");
                if (config.ignoreNativeCrashes) monkeyArgs.push("--ignore-native-crashes");
                if (config.killProcessAfterError) monkeyArgs.push("--kill-process-after-error");
                if (config.monitorNativeCrashes) monkeyArgs.push("--monitor-native-crashes");
                monkeyArgs.push(String(config.eventCount || 10000));

                const session: MonkeySession = {
                  deviceId,
                  child: null,
                  logcatChild: null,
                  running: true,
                  pid: null,
                  startTime: Date.now(),
                  totalEvents: config.eventCount || 10000,
                  completedEvents: 0,
                  logBuffer: [],
                  logCursor: 0,
                  crashCount: 0,
                  anrCount: 0,
                  exceptionCount: 0,
                  crashLogs: [],
                  anrLogs: [],
                  packages: config.includePackages ?? [],
                  partialLine: "",
                  logcatPartialLine: "",
                };

                // Start monkey process
                const monkeyChild = spawn("adb", ["-s", deviceId, "shell", "monkey", ...monkeyArgs]);
                session.child = monkeyChild;

                const appendLog = (line: string) => {
                  if (!line.trim()) return;
                  session.logBuffer.push(line);
                  if (session.logBuffer.length > MONKEY_LOG_LIMIT) session.logBuffer.shift();
                  // Track events
                  const evMatch = line.match(MONKEY_EVENT_PATTERN);
                  if (evMatch) session.completedEvents = parseInt(evMatch[1], 10);
                  // Track crashes/ANRs
                  if (MONKEY_CRASH_PATTERN.test(line)) {
                    session.crashCount++;
                    session.crashLogs.push(line);
                  }
                  if (MONKEY_ANR_PATTERN.test(line)) {
                    session.anrCount++;
                    session.anrLogs.push(line);
                  }
                  if (MONKEY_EXCEPTION_PATTERN.test(line)) {
                    session.exceptionCount++;
                  }
                };

                monkeyChild.stdout?.on("data", (chunk: Buffer) => {
                  const text = session.partialLine + chunk.toString();
                  const lines = text.split("\n");
                  session.partialLine = lines.pop() ?? "";
                  for (const line of lines) appendLog(line);
                });
                monkeyChild.stderr?.on("data", (chunk: Buffer) => {
                  const text = chunk.toString();
                  const lines = text.split("\n");
                  for (const line of lines) appendLog(line);
                });
                monkeyChild.on("close", () => {
                  if (session.partialLine) appendLog(session.partialLine);
                  session.running = false;
                  session.child = null;
                });

                // Start logcat monitoring for CRASH/ANR
                const logcatChild = spawn("adb", ["-s", deviceId, "logcat", "-v", "threadtime", "*:E"]);
                session.logcatChild = logcatChild;
                logcatChild.stdout?.on("data", (chunk: Buffer) => {
                  const text = session.logcatPartialLine + chunk.toString();
                  const lines = text.split("\n");
                  session.logcatPartialLine = lines.pop() ?? "";
                  for (const line of lines) {
                    if (MONKEY_CRASH_PATTERN.test(line) || MONKEY_ANR_PATTERN.test(line) || MONKEY_EXCEPTION_PATTERN.test(line)) {
                      appendLog("[logcat] " + line);
                    }
                  }
                });
                logcatChild.on("close", () => { session.logcatChild = null; });

                monkeySessions.set(deviceId, session);
                result = { status: "ok", pid: monkeyChild.pid };
              } catch (err: any) { result = { status: "error", message: err?.message ?? String(err) }; }
            } else if (route === "monkey-stop" && req.method === "POST") {
              const body = await new Promise<string>((resolve) => {
                let d = "";
                req.on("data", (chunk: Buffer) => { d += chunk.toString(); });
                req.on("end", () => resolve(d));
              });
              try {
                const { deviceId } = JSON.parse(body);
                const session = monkeySessions.get(deviceId);
                // Kill monkey on device
                await execFileAsync("adb", ["-s", deviceId, "shell", "pkill", "-f", "monkey"], { timeout: 5000 }).catch(() => {});
                // Also try kill via ps
                try {
                  const { stdout: psOut } = await execFileAsync("adb", ["-s", deviceId, "shell", "ps", "-A"], { timeout: 5000 });
                  const monkeyLines = psOut.split("\n").filter((l) => l.includes("monkey"));
                  for (const line of monkeyLines) {
                    const pid = line.trim().split(/\s+/)[1];
                    if (pid) await execFileAsync("adb", ["-s", deviceId, "shell", "kill", "-9", pid], { timeout: 3000 }).catch(() => {});
                  }
                } catch {}
                if (session) {
                  session.child?.kill("SIGKILL");
                  session.logcatChild?.kill("SIGKILL");
                  session.running = false;
                  const report = {
                    totalEvents: session.totalEvents,
                    completedEvents: session.completedEvents,
                    crashCount: session.crashCount,
                    anrCount: session.anrCount,
                    exceptionCount: session.exceptionCount,
                    duration: Date.now() - session.startTime,
                    startTime: new Date(session.startTime).toLocaleString(),
                    endTime: new Date().toLocaleString(),
                    packages: session.packages,
                    crashLogs: session.crashLogs.slice(-50),
                    anrLogs: session.anrLogs.slice(-50),
                  };
                  result = { status: "ok", report };
                } else {
                  result = { status: "ok", report: null };
                }
              } catch (err: any) { result = { status: "error", message: err?.message ?? String(err) }; }
            } else if (route === "monkey-status") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const session = monkeySessions.get(deviceId);
              if (!session) {
                result = { status: "ok", monkeyStatus: { running: false }, newLogs: [], report: null };
              } else {
                const cursor = session.logCursor;
                const newLogs = session.logBuffer.slice(cursor);
                session.logCursor = session.logBuffer.length;
                const monkeyStatus = {
                  running: session.running,
                  pid: session.pid,
                  totalEvents: session.totalEvents,
                  completedEvents: session.completedEvents,
                  elapsedMs: Date.now() - session.startTime,
                };
                let report = null;
                if (!session.running) {
                  report = {
                    totalEvents: session.totalEvents,
                    completedEvents: session.completedEvents,
                    crashCount: session.crashCount,
                    anrCount: session.anrCount,
                    exceptionCount: session.exceptionCount,
                    duration: Date.now() - session.startTime,
                    startTime: new Date(session.startTime).toLocaleString(),
                    endTime: new Date().toLocaleString(),
                    packages: session.packages,
                    crashLogs: session.crashLogs.slice(-50),
                    anrLogs: session.anrLogs.slice(-50),
                  };
                }
                result = { status: "ok", monkeyStatus, newLogs, report };
              }
            } else if (route === "command-run" && req.method === "POST") {
              const body = await new Promise<string>((resolve) => {
                let data = "";
                req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
                req.on("end", () => resolve(data));
              });
              const payload = JSON.parse(body) as { deviceId?: string; commandId?: string; commandTitle?: string; rawCommand?: string; deviceName?: string; args?: string[] };
              const args = ["run", "--device", payload.deviceId ?? "host", "--command-id", payload.commandId ?? "custom", "--raw", payload.rawCommand ?? ""];
              if (payload.deviceName) args.push("--device-name", payload.deviceName);
              if (payload.commandTitle) args.push("--command-title", payload.commandTitle);
              if (payload.args && payload.args.length > 0) args.push("--args", ...payload.args);
              const { stdout } = await execFileAsync("python3", [join(__dirname, "backend/cli.py"), ...args], { timeout: 60000, maxBuffer: 50 * 1024 * 1024 });
              res.setHeader("Content-Type", "application/json");
              res.end(stdout);
              return;
            } else if (route === "perf-fps") {
              // Get frame stats from SurfaceFlinger or gfxinfo
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const pkg = url.searchParams.get("package") ?? "";
              const mode = url.searchParams.get("mode") ?? "gfxinfo"; // gfxinfo or surfaceflinger
              try {
                if (mode === "gfxinfo" && pkg) {
                  const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "gfxinfo", pkg, "framestats"], { timeout: 5000 });
                  result = { status: "ok", data: stdout, mode: "gfxinfo" };
                } else {
                  // Fallback: SurfaceFlinger latency
                  const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "SurfaceFlinger", "--latency"], { timeout: 5000 });
                  result = { status: "ok", data: stdout, mode: "surfaceflinger" };
                }
              } catch (e: unknown) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
              }
            } else if (route === "perf-startup") {
              // Measure app startup time
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const pkg = url.searchParams.get("package") ?? "";
              const activity = url.searchParams.get("activity") ?? "";
              const type = url.searchParams.get("type") ?? "cold"; // cold, warm, hot
              try {
                if (type === "cold") {
                  // Force stop first
                  await execFileAsync("adb", ["-s", deviceId, "shell", "am", "force-stop", pkg], { timeout: 5000 });
                  await new Promise(r => setTimeout(r, 1000));
                }
                const component = activity ? `${pkg}/${activity}` : pkg;
                const args = ["-s", deviceId, "shell", "am", "start", "-W"];
                if (type === "cold") args.push("-S");
                args.push(component);
                const { stdout } = await execFileAsync("adb", args, { timeout: 30000 });
                // Parse TotalTime, ThisTime, WaitTime
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
              } catch (e: unknown) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
              }
            } else if (route === "perf-cpu-mem") {
              // Get CPU and memory stats
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const pkg = url.searchParams.get("package") ?? "";
              try {
                const [cpuResult, memResult] = await Promise.all([
                  execFileAsync("adb", ["-s", deviceId, "shell", "top", "-n", "1", "-b", "-o", "%CPU,%MEM,PID,NAME"], { timeout: 5000 }).catch(() => ({ stdout: "" })),
                  pkg
                    ? execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "meminfo", pkg], { timeout: 5000 }).catch(() => ({ stdout: "" }))
                    : Promise.resolve({ stdout: "" }),
                ]);
                // Parse total PSS from meminfo
                const pssMatch = memResult.stdout.match(/TOTAL\s+(\d+)/);
                const totalPss = pssMatch ? Number(pssMatch[1]) : null;
                // Parse cpu for the target package
                let cpuPercent: number | null = null;
                if (pkg) {
                  const lines = cpuResult.stdout.split("\n");
                  for (const line of lines) {
                    if (line.includes(pkg)) {
                      const cpuMatch = line.match(/^\s*([\d.]+)/);
                      if (cpuMatch) { cpuPercent = Number(cpuMatch[1]); break; }
                    }
                  }
                }
                result = { status: "ok", cpuPercent, totalPssKb: totalPss, cpuRaw: cpuResult.stdout.slice(0, 2000), memRaw: memResult.stdout.slice(0, 3000) };
              } catch (e: unknown) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
              }
            } else if (route === "perf-reset-gfxinfo") {
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const pkg = url.searchParams.get("package") ?? "";
              try {
                await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "gfxinfo", pkg, "reset"], { timeout: 5000 });
                result = { status: "ok" };
              } catch (e: unknown) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
              }
            } else if (route === "perf-traffic") {
              // Get network traffic stats for a package
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const pkg = url.searchParams.get("package") ?? "";
              try {
                // Get UID from package - try multiple methods
                let uid: string | null = null;
                // Method 1: dumpsys package
                try {
                  const { stdout: uidOut } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "package", pkg], { timeout: 5000 });
                  const uidMatch = uidOut.match(/userId=(\d+)/);
                  if (uidMatch) uid = uidMatch[1];
                } catch { /* ignore */ }
                // Method 2: pm list packages -U
                if (!uid) {
                  try {
                    const { stdout: pmOut } = await execFileAsync("adb", ["-s", deviceId, "shell", "pm", "list", "packages", "-U", pkg], { timeout: 5000 });
                    const uidMatch = pmOut.match(new RegExp(`package:${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+uid:(\\d+)`));
                    if (uidMatch) uid = uidMatch[1];
                  } catch { /* ignore */ }
                }

                let rxBytes: number | null = null;
                let txBytes: number | null = null;

                if (uid) {
                  // Try /proc/uid_stat first (older approach)
                  try {
                    const { stdout: rx } = await execFileAsync("adb", ["-s", deviceId, "shell", "cat", `/proc/uid_stat/${uid}/tcp_rcv`], { timeout: 3000 });
                    const { stdout: tx } = await execFileAsync("adb", ["-s", deviceId, "shell", "cat", `/proc/uid_stat/${uid}/tcp_snd`], { timeout: 3000 });
                    rxBytes = Number(rx.trim()) || null;
                    txBytes = Number(tx.trim()) || null;
                  } catch {
                    // Fallback: xt_qtaguid stats
                    try {
                      const { stdout: qtaguid } = await execFileAsync("adb", ["-s", deviceId, "shell", "cat", "/proc/net/xt_qtaguid/stats"], { timeout: 5000, maxBuffer: 5 * 1024 * 1024 });
                      let totalRx = 0, totalTx = 0;
                      for (const line of qtaguid.split("\n")) {
                        const cols = line.trim().split(/\s+/);
                        if (cols[3] === uid && cols[2] === "0") { // tag 0 = total
                          totalRx += Number(cols[5]) || 0;
                          totalTx += Number(cols[7]) || 0;
                        }
                      }
                      if (totalRx > 0 || totalTx > 0) { rxBytes = totalRx; txBytes = totalTx; }
                    } catch { /* ignore */ }
                  }
                }
                result = { status: "ok", uid, rxBytes, txBytes };
              } catch (e: unknown) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
              }
            } else if (route === "perf-battery") {
              // Get battery info
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

                // Get wakelock stats if package specified
                let wakelocks: string | null = null;
                if (pkg) {
                  try {
                    const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "batterystats", pkg], { timeout: 8000 });
                    // Extract wake lock section (first 3000 chars)
                    const wlIdx = stdout.indexOf("Wake lock");
                    wakelocks = wlIdx >= 0 ? stdout.slice(wlIdx, wlIdx + 3000) : stdout.slice(0, 3000);
                  } catch { /* ignore */ }
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
              } catch (e: unknown) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
              }
            } else if (route === "perf-gpu") {
              // Get GPU rendering info
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const pkg = url.searchParams.get("package") ?? "";
              try {
                let gpuData = "";
                if (pkg) {
                  const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "gfxinfo", pkg], { timeout: 5000 });
                  gpuData = stdout;
                } else {
                  const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "gpu"], { timeout: 5000 });
                  gpuData = stdout;
                }
                // Parse render stats
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
              } catch (e: unknown) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
              }
            } else if (route === "perf-storage-io") {
              // Get storage I/O stats for a process
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const pkg = url.searchParams.get("package") ?? "";
              try {
                // Find PID
                let pid: string | null = null;
                try {
                  const { stdout: pidOut } = await execFileAsync("adb", ["-s", deviceId, "shell", "pidof", pkg], { timeout: 5000 });
                  pid = pidOut.trim().split(/\s+/)[0] || null;
                } catch { /* process not running */ }

                let ioData: { readBytes: number | null; writeBytes: number | null; readSyscalls: number | null; writeSyscalls: number | null } = { readBytes: null, writeBytes: null, readSyscalls: null, writeSyscalls: null };

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
                  } catch { /* permission denied on some devices */ }
                }

                // Also get disk stats
                let diskStats = "";
                try {
                  const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "diskstats"], { timeout: 5000 });
                  diskStats = stdout.slice(0, 2000);
                } catch { /* ignore */ }

                result = { status: "ok", pid, ...ioData, diskStats };
              } catch (e: unknown) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
              }
            } else if (route === "perf-scenarios-load") {
              // Load saved scenarios
              try {
                const data = await readFile(scenariosFilePath, "utf-8");
                result = { status: "ok", scenarios: JSON.parse(data) };
              } catch {
                result = { status: "ok", scenarios: [] };
              }
            } else if (route === "perf-scenarios-save") {
              // Save scenarios
              const body = await new Promise<string>((resolve) => {
                let d = "";
                req.on("data", (chunk: Buffer) => { d += chunk.toString(); });
                req.on("end", () => resolve(d));
              });
              try {
                const { scenarios } = JSON.parse(body);
                await mkdir(dirname(scenariosFilePath), { recursive: true });
                await writeFile(scenariosFilePath, JSON.stringify(scenarios, null, 2), "utf-8");
                result = { status: "ok" };
              } catch (err: any) {
                result = { status: "error", message: err?.message ?? String(err) };
              }
            } else if (route === "perf-alert-check") {
              // Check for ANR/crash in logcat
              const deviceId = url.searchParams.get("deviceId") ?? "";
              const pkg = url.searchParams.get("package") ?? "";
              const since = url.searchParams.get("since") ?? ""; // timestamp like "01-01 00:00:00.000"
              try {
                // Check for crashes and ANRs
                const args = ["-s", deviceId, "logcat", "-d", "-b", "crash"];
                if (since) args.push("-t", since);
                const { stdout: crashLog } = await execFileAsync("adb", args, { timeout: 5000, maxBuffer: 2 * 1024 * 1024 }).catch(() => ({ stdout: "" }));

                // Filter for target package if specified
                const crashLines = crashLog.split("\n").filter((l) => !pkg || l.includes(pkg));

                // Check for ANR specifically
                const { stdout: anrLog } = await execFileAsync("adb", ["-s", deviceId, "logcat", "-d", "-b", "events", "-s", "am_anr"], { timeout: 5000, maxBuffer: 1024 * 1024 }).catch(() => ({ stdout: "" }));
                const anrLines = anrLog.split("\n").filter((l) => l.trim() && (!pkg || l.includes(pkg)));

                // Get dropbox ANRs if available
                let dropboxAnr = "";
                if (pkg) {
                  try {
                    const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "dumpsys", "dropbox", "--print", "data_app_anr"], { timeout: 5000, maxBuffer: 2 * 1024 * 1024 });
                    const sections = stdout.split("========");
                    dropboxAnr = sections.filter((s) => s.includes(pkg)).slice(-3).join("\n---\n").slice(0, 3000);
                  } catch { /* ignore */ }
                }

                result = {
                  status: "ok",
                  crashes: crashLines.slice(-50),
                  anrs: anrLines.slice(-20),
                  dropboxAnr: dropboxAnr || null,
                };
              } catch (e: unknown) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
              }
            } else if (route === "perf-alert-tombstones") {
              // Check for native crashes (tombstones)
              const deviceId = url.searchParams.get("deviceId") ?? "";
              try {
                const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "ls", "-lt", "/data/tombstones/"], { timeout: 5000 }).catch(() => ({ stdout: "" }));
                const files = stdout.trim().split("\n").filter((l) => l.includes("tombstone_")).slice(0, 10);
                result = { status: "ok", tombstones: files };
              } catch (e: unknown) {
                result = { status: "error", message: e instanceof Error ? e.message : String(e) };
              }
            } else if (route === "perf-baselines-load") {
              // Load saved baselines
              try {
                const data = await readFile(baselinesFilePath, "utf-8");
                result = { status: "ok", baselines: JSON.parse(data) };
              } catch {
                result = { status: "ok", baselines: [] };
              }
            } else if (route === "perf-baselines-save") {
              // Save baselines
              const body = await new Promise<string>((resolve) => {
                let d = "";
                req.on("data", (chunk: Buffer) => { d += chunk.toString(); });
                req.on("end", () => resolve(d));
              });
              try {
                const { baselines } = JSON.parse(body);
                await mkdir(dirname(baselinesFilePath), { recursive: true });
                await writeFile(baselinesFilePath, JSON.stringify(baselines, null, 2), "utf-8");
                result = { status: "ok" };
              } catch (err: any) {
                result = { status: "error", message: err?.message ?? String(err) };
              }
            } else {
              next();
              return;
            }

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result));
          } catch (err: unknown) {
            res.setHeader("Content-Type", "application/json");
            res.statusCode = 500;
            res.end(JSON.stringify({ status: "error", message: err instanceof Error ? err.message : String(err) }));
          }
        });
      },
    },
  ],
});
