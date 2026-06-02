import { Menu, app, BrowserWindow, dialog, ipcMain, protocol, net, shell } from "electron";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { execFileDecoded } from "../shared/execFileDecoded.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { clearLogcatSession, exportLogcatSession, getLogcatSessionState, startLogcatSession, stopAllLogcatSessions, stopLogcatSession, updateLogcatSessionFilters } from "../shared/logcatRuntime.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execFileAsync = execFileDecoded;
const pythonExecutable = process.env.ADB_HELPER_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
const backendCliPath = join(__dirname, "../../backend/cli.py");
const workspaceRoot = join(__dirname, "../..");
function resolveWorkingPath(targetPath) {
    return isAbsolute(targetPath) ? targetPath : resolve(workspaceRoot, targetPath);
}
function toStr(v) {
    if (v === undefined || v === null)
        return "";
    return typeof v === "string" ? v : v.toString("utf8");
}
async function invokeBackend(args) {
    const { stdout } = await execFileAsync(pythonExecutable, [backendCliPath, ...args], {
        cwd: join(__dirname, "../.."),
        maxBuffer: 50 * 1024 * 1024
    });
    return JSON.parse(toStr(stdout));
}
async function loadLogcatOptions(overrides) {
    const result = await invokeBackend(["logcat-config"]);
    return {
        outputDir: String(result.outputDir ?? ""),
        maxFileSizeBytes: Math.max(Number(result.maxFileSizeMb ?? 10), 1) * 1024 * 1024,
        clearBeforeStart: overrides?.clearBeforeStart ?? Boolean(result.clearBeforeStart),
        filters: overrides?.filters,
        buffers: overrides?.buffers,
    };
}
function registerIpcHandlers() {
    ipcMain.handle("device.list", async () => {
        const result = await invokeBackend(["devices"]);
        return result.items ?? [];
    });
    ipcMain.handle("device.probe", async (_event, payload) => {
        return invokeBackend(["probe", "--device", payload.deviceId]);
    });
    ipcMain.handle("device.apps", async (_event, payload) => {
        return invokeBackend(["device-apps", "--device", payload.deviceId]);
    });
    ipcMain.handle("device.appDetail", async (_event, payload) => {
        return invokeBackend(["device-app-detail", "--device", payload.deviceId, "--package-name", payload.packageName]);
    });
    ipcMain.handle("device.users", async (_event, payload) => {
        return invokeBackend(["device-users", "--device", payload.deviceId]);
    });
    ipcMain.handle("device.processes", async (_event, payload) => {
        return invokeBackend(["device-processes", "--device", payload.deviceId]);
    });
    ipcMain.handle("device.displayList", async (_event, payload) => {
        return invokeBackend(["device-display-list", "--device", payload.deviceId]);
    });
    ipcMain.handle("scrcpy.config", async (_event, payload) => {
        return invokeBackend(["scrcpy-config", "--device", payload.deviceId, "--display-id", String(payload.displayId)]);
    });
    ipcMain.handle("scrcpy.updateConfig", async (_event, payload) => {
        return invokeBackend([
            "scrcpy-config-save",
            "--device",
            payload.deviceId,
            "--display-id",
            String(payload.displayId),
            "--max-size",
            String(payload.maxSize),
            "--window-x",
            String(payload.windowX),
            "--window-y",
            String(payload.windowY),
            "--window-width",
            String(payload.windowWidth),
            "--window-height",
            String(payload.windowHeight),
        ]);
    });
    ipcMain.handle("scrcpy.launch", async (_event, payload) => {
        return invokeBackend(["scrcpy-launch", "--device", payload.deviceId, "--display-id", String(payload.displayId)]);
    });
    ipcMain.handle("scrcpy.syncWindow", async (_event, payload) => {
        return invokeBackend(["scrcpy-sync-window", "--device", payload.deviceId, "--display-id", String(payload.displayId)]);
    });
    ipcMain.handle("command.run", async (_event, payload) => {
        const args = [
            "run",
            "--device",
            payload.deviceId,
            "--command-id",
            payload.commandId
        ];
        if (payload.deviceName) {
            args.push("--device-name", payload.deviceName);
        }
        if (payload.commandTitle) {
            args.push("--command-title", payload.commandTitle);
        }
        if (payload.rawCommand) {
            args.push("--raw", payload.rawCommand);
        }
        if (payload.args.length) {
            args.push("--args", ...payload.args);
        }
        if (payload.source) {
            args.push("--source", payload.source);
        }
        return invokeBackend(args);
    });
    ipcMain.handle("history.list", async (_event, payload) => {
        const args = ["history"];
        if (payload?.limit) {
            args.push("--limit", String(payload.limit));
        }
        return invokeBackend(args);
    });
    ipcMain.handle("history.remove", async (_event, payload) => {
        const args = ["history-remove", "--record-id", payload.recordId];
        if (payload.limit) {
            args.push("--limit", String(payload.limit));
        }
        return invokeBackend(args);
    });
    ipcMain.handle("history.clear", async (_event, payload) => {
        const args = ["history-clear"];
        if (payload?.limit) {
            args.push("--limit", String(payload.limit));
        }
        return invokeBackend(args);
    });
    ipcMain.handle("logcat.start", async (_event, payload) => {
        return startLogcatSession(payload.deviceId, await loadLogcatOptions({ clearBeforeStart: payload.clearBeforeStart, filters: payload.filters, buffers: payload.buffers }));
    });
    ipcMain.handle("logcat.stop", async (_event, payload) => {
        return stopLogcatSession(payload.deviceId);
    });
    ipcMain.handle("logcat.state", async (_event, payload) => {
        return getLogcatSessionState(payload.deviceId);
    });
    ipcMain.handle("logcat.export", async (_event, payload) => {
        return exportLogcatSession(payload.deviceId);
    });
    ipcMain.handle("logcat.updateFilters", async (_event, payload) => {
        return updateLogcatSessionFilters(payload.deviceId, payload.filters ?? {});
    });
    ipcMain.handle("logcat.clear", async (_event, payload) => {
        return clearLogcatSession(payload.deviceId, payload.filters);
    });
    ipcMain.handle("logcat.config", async () => {
        return invokeBackend(["logcat-config"]);
    });
    ipcMain.handle("logcat.packageList", async (_event, payload) => {
        return invokeBackend(["logcat-package-list", "--device", payload.deviceId]);
    });
    ipcMain.handle("logcat.processList", async (_event, payload) => {
        return invokeBackend(["logcat-process-list", "--device", payload.deviceId]);
    });
    ipcMain.handle("logcat.updateConfig", async (_event, payload) => {
        return invokeBackend([
            "logcat-config-save",
            "--output-dir",
            payload.outputDir,
            "--max-file-size-mb",
            String(payload.maxFileSizeMb),
            "--clear-before-start",
            String(payload.clearBeforeStart),
            "--display-line-limit",
            String(payload.displayLineLimit),
            "--refresh-interval-ms",
            String(payload.refreshIntervalMs),
            "--default-regex-enabled",
            String(payload.defaultRegexEnabled),
            "--default-levels",
            ...payload.defaultLevels,
        ]);
    });
    ipcMain.handle("backup.info", async (_event, payload) => {
        return invokeBackend(["backup-info", "--device", payload.deviceId]);
    });
    ipcMain.handle("backup.config", async () => {
        return invokeBackend(["backup-config"]);
    });
    ipcMain.handle("backup.updateConfig", async (_event, payload) => {
        return invokeBackend([
            "backup-config-save",
            "--version-prop",
            payload.versionProp,
            "--backup-root",
            payload.backupRoot,
            "--backup-paths",
            ...payload.backupPaths,
            "--restore-paths",
            ...payload.restorePaths,
        ]);
    });
    ipcMain.handle("backup.migrate", async (_event, payload) => {
        return invokeBackend(["backup-migrate", "--source-root", payload.sourceRoot, "--target-root", payload.targetRoot]);
    });
    ipcMain.handle("backup.create", async (_event, payload) => {
        const args = ["backup-create", "--device", payload.deviceId];
        if (payload.paths?.length) {
            args.push("--paths", ...payload.paths);
        }
        return invokeBackend(args);
    });
    ipcMain.handle("backup.restore", async (_event, payload) => {
        const args = ["backup-restore", "--device", payload.deviceId];
        if (payload.paths?.length) {
            args.push("--paths", ...payload.paths);
        }
        return invokeBackend(args);
    });
    ipcMain.handle("backup.openDirectory", async (_event, payload) => {
        return invokeBackend(["backup-open", "--version-name", payload.versionName]);
    });
    ipcMain.handle("system.openPath", async (_event, payload) => {
        const targetPath = resolveWorkingPath(payload.path);
        const targetDirectory = dirname(targetPath);
        try {
            await execFileAsync("xdg-open", [targetDirectory]);
        }
        catch {
            const errorMessage = await shell.openPath(targetDirectory);
            if (errorMessage) {
                return {
                    command: "system-open-path",
                    status: "error",
                    path: targetDirectory,
                    message: errorMessage,
                };
            }
        }
        return {
            command: "system-open-path",
            status: "ok",
            path: targetDirectory,
            message: `已尝试打开目录：${targetDirectory}`,
        };
    });
    ipcMain.handle("system.resolvePath", async (_event, payload) => {
        const targetPath = resolveWorkingPath(payload.path);
        return {
            command: "system-resolve-path",
            status: "ok",
            path: targetPath,
        };
    });
    ipcMain.handle("system.pickDirectory", async (_event, payload) => {
        const browserWindow = BrowserWindow.getFocusedWindow();
        const dialogOptions = {
            title: payload?.title ?? "选择目录",
            defaultPath: payload?.defaultPath ? resolveWorkingPath(payload.defaultPath) : undefined,
            properties: ["openDirectory", "createDirectory"],
        };
        const result = browserWindow
            ? await dialog.showOpenDialog(browserWindow, dialogOptions)
            : await dialog.showOpenDialog(dialogOptions);
        return {
            command: "system-pick-directory",
            status: "ok",
            canceled: result.canceled,
            path: result.filePaths[0] ?? "",
        };
    });
    ipcMain.handle("system.pickFile", async (_event, payload) => {
        const browserWindow = BrowserWindow.getFocusedWindow();
        const dialogOptions = {
            title: payload?.title ?? "选择文件",
            defaultPath: payload?.defaultPath ? resolveWorkingPath(payload.defaultPath) : undefined,
            properties: ["openFile"],
            filters: payload?.filters,
        };
        const result = browserWindow
            ? await dialog.showOpenDialog(browserWindow, dialogOptions)
            : await dialog.showOpenDialog(dialogOptions);
        return {
            command: "system-pick-file",
            status: "ok",
            canceled: result.canceled,
            path: result.filePaths[0] ?? "",
        };
    });
    ipcMain.handle("backup.deleteVersion", async (_event, payload) => {
        return invokeBackend(["backup-delete", "--version-name", payload.versionName]);
    });
    ipcMain.handle("result.export", async (_event, payload) => {
        return invokeBackend(["export", "--result-id", payload.recordId, "--format", payload.format]);
    });
    ipcMain.handle("layout.dumpUiTree", async (_event, payload) => {
        try {
            const dumpArgs = ["-s", payload.deviceId, "shell", "uiautomator", "dump"];
            if (payload.displayId !== undefined && payload.displayId !== 0) {
                dumpArgs.push("--display", String(payload.displayId));
            }
            dumpArgs.push("/sdcard/window_dump.xml");
            const dumpResult = await execFileAsync("adb", dumpArgs, { timeout: 15000 });
            if (toStr(dumpResult.stderr).includes("ERROR")) {
                return { status: "error", message: toStr(dumpResult.stderr) };
            }
            const pullResult = await execFileAsync("adb", ["-s", payload.deviceId, "shell", "cat", "/sdcard/window_dump.xml"], { timeout: 15000, maxBuffer: 10 * 1024 * 1024 });
            const xml = toStr(pullResult.stdout).trim();
            if (!xml)
                return { status: "error", message: "UI dump returned empty XML" };
            return { status: "ok", xml };
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            return { status: "error", message: errorMessage };
        }
    });
    ipcMain.handle("layout.listProcesses", async (_event, payload) => {
        try {
            const result = await execFileAsync("adb", ["-s", payload.deviceId, "shell", "ps", "-A", "-o", "USER,PID,NAME"], { timeout: 10000, maxBuffer: 5 * 1024 * 1024 });
            const lines = toStr(result.stdout).trim().split("\n").slice(1); // skip header
            const processes = lines.map((line) => {
                const parts = line.trim().split(/\s+/);
                return { user: parts[0], pid: parts[1], name: parts.slice(2).join(" ") };
            }).filter((p) => p.name && p.user && /^u\d+_/.test(p.user));
            return { status: "ok", processes };
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            return { status: "error", message: errorMessage };
        }
    });
    ipcMain.handle("layout.screenshot", async (_event, payload) => {
        try {
            const result = await execFileAsync("adb", ["-s", payload.deviceId, "exec-out", "screencap", "-p"], { timeout: 15000, maxBuffer: 20 * 1024 * 1024, encoding: "buffer" });
            const base64 = Buffer.from(result.stdout).toString("base64");
            return { status: "ok", dataUrl: `data:image/png;base64,${base64}` };
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            return { status: "error", message: errorMessage };
        }
    });
    ipcMain.handle("layout.getWinscopePath", async () => {
        return { status: "ok", path: "/home/tsdl/Documents/software/winscope/dist/index.html" };
    });
    ipcMain.handle("layout.winscopeProxy", async () => {
        const WINSCOPE_PROXY = "/home/tsdl/Documents/software/winscope/dist/winscope_proxy.py";
        const TOKEN_FILE = join(process.env.HOME ?? "/home/tsdl", ".config/winscope/.token");
        try {
            // Check if proxy is already running
            const { stdout: lsofOut } = await execFileAsync("lsof", ["-ti", ":5544"], { timeout: 3000 }).catch(() => ({ stdout: "" }));
            if (!toStr(lsofOut).trim()) {
                // Start proxy in background
                const child = spawn("python3", [WINSCOPE_PROXY], { detached: true, stdio: "ignore" });
                child.unref();
                // Wait briefly for proxy to start and create token
                await new Promise((r) => setTimeout(r, 1500));
            }
            const token = (await readFile(TOKEN_FILE, "utf-8")).trim();
            return { status: "ok", token };
        }
        catch (err) {
            return { status: "error", message: err instanceof Error ? err.message : String(err), token: "" };
        }
    });
    // Store popout state for child windows
    let popoutState = null;
    ipcMain.handle("layout.setPopoutState", async (_event, payload) => {
        popoutState = payload;
        return { status: "ok" };
    });
    ipcMain.handle("layout.updatePopoutSelection", async (_event, payload) => {
        if (popoutState)
            popoutState.selectedPath = payload.selectedPath ?? undefined;
        return { status: "ok" };
    });
    ipcMain.handle("layout.getPopoutState", async () => {
        return { status: "ok", ...(popoutState ?? { uiTreeXml: "", screenshotDataUrl: "", deviceId: "" }) };
    });
    ipcMain.handle("layout.popoutPanel", async (_event, payload) => {
        const devServerUrl = process.env.VITE_DEV_SERVER_URL;
        const child = new BrowserWindow({
            width: 800,
            height: 700,
            title: `ADB Helper - ${payload.title}`,
            autoHideMenuBar: true,
            webPreferences: {
                preload: join(__dirname, "preload.js"),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: false
            }
        });
        child.removeMenu();
        if (devServerUrl) {
            void child.loadURL(`${devServerUrl}?popout=${payload.panelId}`);
        }
        else {
            void child.loadFile(join(__dirname, "../../dist/index.html"), { query: { popout: String(payload.panelId) } });
        }
        return { status: "ok" };
    });
    const panelsFilePath = join(__dirname, "../../backend/state/panels.json");
    ipcMain.handle("panels.load", async () => {
        try {
            const data = await readFile(panelsFilePath, "utf-8");
            return { status: "ok", panels: JSON.parse(data) };
        }
        catch {
            return { status: "ok", panels: null };
        }
    });
    ipcMain.handle("panels.save", async (_event, payload) => {
        try {
            await mkdir(dirname(panelsFilePath), { recursive: true });
            await writeFile(panelsFilePath, JSON.stringify(payload.panels, null, 2), "utf-8");
            return { status: "ok" };
        }
        catch (err) {
            return { status: "error", message: err instanceof Error ? err.message : String(err) };
        }
    });
    const macroTasksFilePath = join(__dirname, "../../backend/state/macro_tasks.json");
    ipcMain.handle("macroTasks.load", async () => {
        try {
            const data = await readFile(macroTasksFilePath, "utf-8");
            return { status: "ok", tasks: JSON.parse(data) };
        }
        catch {
            return { status: "ok", tasks: null };
        }
    });
    ipcMain.handle("macroTasks.save", async (_event, payload) => {
        try {
            await mkdir(dirname(macroTasksFilePath), { recursive: true });
            await writeFile(macroTasksFilePath, JSON.stringify(payload.tasks, null, 2), "utf-8");
            return { status: "ok" };
        }
        catch (err) {
            return { status: "error", message: err instanceof Error ? err.message : String(err) };
        }
    });
    // Screen capture - save screenshot to local file and return preview
    ipcMain.handle("screen.capture", async (_event, payload) => {
        try {
            const args = ["-s", payload.deviceId, "exec-out", "screencap", "-p"];
            if (payload.displayId != null && payload.displayId !== 0) {
                args.splice(4, 0, "-d", String(payload.displayId));
            }
            const result = await execFileAsync("adb", args, { timeout: 15000, maxBuffer: 20 * 1024 * 1024, encoding: "buffer" });
            const buf = Buffer.from(result.stdout);
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            const savePath = payload.savePath || join(process.env.HOME ?? "/home/tsdl", "Pictures", `screenshot_d${payload.displayId ?? 0}_${timestamp}.png`);
            await mkdir(dirname(savePath), { recursive: true });
            await writeFile(savePath, buf);
            const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
            return { status: "ok", dataUrl, savedPath: savePath };
        }
        catch (err) {
            return { status: "error", message: err instanceof Error ? err.message : String(err) };
        }
    });
    // Screen record - start recording (no duration limit, user controls stop)
    const activeRecordings = new Map();
    ipcMain.handle("screen.startRecord", async (_event, payload) => {
        try {
            const remotePath = `/sdcard/screenrecord_d${payload.displayId ?? 0}_${Date.now()}.mp4`;
            const args = ["-s", payload.deviceId, "shell", "screenrecord", "--time-limit", "180", "--bugreport"];
            // screenrecord 需要 physical display ID，通过 dumpsys SurfaceFlinger 获取映射
            let physicalDisplayId = null;
            try {
                const { stdout: sfOutput } = await execFileAsync("adb", ["-s", payload.deviceId, "shell", "dumpsys", "SurfaceFlinger", "--display-id"], { timeout: 5000 });
                const lines = toStr(sfOutput).split("\n");
                for (const line of lines) {
                    const m = line.match(/Display\s+(\d+)\s+\(HWC display\s+(\d+)\)/);
                    if (m && Number(m[2]) === (payload.displayId ?? 0)) {
                        physicalDisplayId = m[1];
                        break;
                    }
                }
            }
            catch { }
            if (physicalDisplayId)
                args.push("--display-id", physicalDisplayId);
            args.push(remotePath);
            execFileAsync("adb", args, { timeout: 185000 }).catch(() => { });
            const existing = activeRecordings.get(payload.deviceId) ?? [];
            existing.push({ remotePath, displayId: payload.displayId ?? 0 });
            activeRecordings.set(payload.deviceId, existing);
            return { status: "ok", remotePath };
        }
        catch (err) {
            return { status: "error", message: err instanceof Error ? err.message : String(err) };
        }
    });
    // Screen record - stop and pull all active recordings for device
    ipcMain.handle("screen.stopRecord", async (_event, payload) => {
        try {
            await execFileAsync("adb", ["-s", payload.deviceId, "shell", "pkill", "-SIGINT", "screenrecord"], { timeout: 5000 }).catch(() => { });
            await new Promise((r) => setTimeout(r, 1500));
            const recordings = activeRecordings.get(payload.deviceId);
            if (!recordings || recordings.length === 0)
                return { status: "error", message: "没有正在进行的录屏" };
            const files = [];
            for (const recording of recordings) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
                const localPath = join(process.env.HOME ?? "/home/tsdl", "Videos", `screenrecord_d${recording.displayId}_${timestamp}_${Math.random().toString(36).slice(2, 6)}.mp4`);
                await mkdir(dirname(localPath), { recursive: true });
                await execFileAsync("adb", ["-s", payload.deviceId, "pull", recording.remotePath, localPath], { timeout: 30000 }).catch(() => { });
                await execFileAsync("adb", ["-s", payload.deviceId, "shell", "rm", recording.remotePath], { timeout: 5000 }).catch(() => { });
                files.push({ displayId: recording.displayId, localPath });
            }
            activeRecordings.delete(payload.deviceId);
            return { status: "ok", files, localPath: files.map((f) => f.localPath).join(", ") };
        }
        catch (err) {
            return { status: "error", message: err instanceof Error ? err.message : String(err) };
        }
    });
    // Crash/ANR - list files from device
    ipcMain.handle("crash.list", async (_event, payload) => {
        try {
            const result = await invokeBackend(["crash-list", "--device", payload.deviceId]);
            return result;
        }
        catch (err) {
            return { status: "error", tombstones: [], anr: [], dropbox: [], message: err instanceof Error ? err.message : String(err) };
        }
    });
    // Crash/ANR - read file content from device
    ipcMain.handle("crash.read", async (_event, payload) => {
        try {
            const result = await invokeBackend(["crash-read", "--device", payload.deviceId, "--file-path", payload.filePath]);
            return result;
        }
        catch (err) {
            return { status: "error", content: "", message: err instanceof Error ? err.message : String(err) };
        }
    });
    // Bugreport - capture bugreport from device
    ipcMain.handle("bugreport.fetch", async (_event, payload) => {
        try {
            const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
            const outputDir = join(homeDir, "Documents", "adb-helper-bugreport");
            await mkdir(outputDir, { recursive: true });
            const timestamp = Date.now();
            const fileName = `bugreport-${payload.deviceId}-${timestamp}.zip`;
            const remotePath = `/data/local/tmp/${fileName}`;
            // Run bugreport on device
            const runResult = await invokeBackend([
                "run",
                "--device", payload.deviceId,
                "--raw", `bugreport ${remotePath}`
            ]);
            if (runResult.status !== "ok") {
                return { status: "error", message: `生成 bugreport 失败: ${runResult.message ?? "未知错误"}` };
            }
            // Pull bugreport from device
            const pullResult = await invokeBackend([
                "run",
                "--device", payload.deviceId,
                "--raw", `pull ${remotePath} ${join(outputDir, fileName)}`
            ]);
            if (pullResult.status !== "ok") {
                return { status: "error", message: `拉取 bugreport 失败: ${pullResult.message ?? "未知错误"}` };
            }
            // Clean up remote file
            await invokeBackend([
                "run",
                "--device", payload.deviceId,
                "--raw", `shell rm -f ${remotePath}`
            ]);
            return { status: "ok", file: join(outputDir, fileName) };
        }
        catch (err) {
            return { status: "error", message: err instanceof Error ? err.message : String(err) };
        }
    });
    // Trace - start atrace capture on device
    ipcMain.handle("trace.start", async (_event, payload) => {
        try {
            const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
            const outputDir = join(homeDir, "Documents", "adb-helper-trace");
            await mkdir(outputDir, { recursive: true });
            const timestamp = Date.now();
            const duration = Math.min(Math.max(Number(payload.duration) || 5, 1), 30);
            const categories = (payload.categories ?? []).join(",") || "gfx,view,wm,am,sched";
            const fileName = `trace-${payload.deviceId}-${timestamp}.perfetto-trace`;
            const remotePath = `/data/local/tmp/${fileName}`;
            // Run atrace on device
            const runResult = await invokeBackend([
                "run",
                "--device", payload.deviceId,
                "--raw", `shell atrace --async_stop -t ${duration} -b 40960 ${categories} -o ${remotePath}`
            ]);
            if (runResult.status !== "ok") {
                return { status: "error", message: `执行 atrace 失败: ${runResult.message ?? "未知错误"}` };
            }
            // Pull trace from device
            const pullResult = await invokeBackend([
                "run",
                "--device", payload.deviceId,
                "--raw", `pull ${remotePath} ${join(outputDir, fileName)}`
            ]);
            if (pullResult.status !== "ok") {
                return { status: "error", message: `拉取 trace 文件失败: ${pullResult.message ?? "未知错误"}` };
            }
            // Clean up remote file
            await invokeBackend([
                "run",
                "--device", payload.deviceId,
                "--raw", `shell rm -f ${remotePath}`
            ]);
            return { status: "ok", file: join(outputDir, fileName) };
        }
        catch (err) {
            return { status: "error", message: err instanceof Error ? err.message : String(err) };
        }
    });
    // Trace - read local file content as buffer for perfetto
    ipcMain.handle("trace.readFile", async (_event, payload) => {
        try {
            const filePath = resolveWorkingPath(payload.path);
            const buffer = await readFile(filePath);
            return { status: "ok", data: buffer.toString("base64") };
        }
        catch (err) {
            return { status: "error", message: err instanceof Error ? err.message : String(err) };
        }
    });
}
function createWindow() {
    const window = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1180,
        minHeight: 760,
        title: "ADB Helper",
        autoHideMenuBar: true,
        webPreferences: {
            preload: join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });
    window.removeMenu();
    window.setMenuBarVisibility(false);
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    if (devServerUrl) {
        void window.loadURL(devServerUrl);
        window.webContents.openDevTools({ mode: "detach" });
        return;
    }
    void window.loadFile(join(__dirname, "../../dist/index.html"));
}
// Must be called before app.whenReady
protocol.registerSchemesAsPrivileged([
    { scheme: "winscope", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);
app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    // Register custom protocol to serve winscope files
    const WINSCOPE_ROOT = "/home/tsdl/Documents/software/winscope/dist";
    const WINSCOPE_SOURCE_ROOT = "/home/tsdl/Documents/software/winscope";
    protocol.handle("winscope", (request) => {
        const urlPath = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, "");
        let filePath = join(WINSCOPE_ROOT, urlPath || "index.html");
        let resolved = resolve(filePath);
        // If not found in dist, try source root (for static/ directory)
        if (!resolved.startsWith(WINSCOPE_ROOT)) {
            filePath = join(WINSCOPE_SOURCE_ROOT, urlPath);
            resolved = resolve(filePath);
            if (!resolved.startsWith(WINSCOPE_SOURCE_ROOT)) {
                return new Response("Forbidden", { status: 403 });
            }
        }
        return net.fetch(pathToFileURL(resolved).href);
    });
    registerIpcHandlers();
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
app.on("window-all-closed", () => {
    stopAllLogcatSessions();
    if (process.platform !== "darwin") {
        app.quit();
    }
});
