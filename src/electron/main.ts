import { Menu, app, BrowserWindow, dialog, ipcMain, protocol, net, shell, type OpenDialogOptions } from "electron";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileDecoded } from "../shared/execFileDecoded.js";
import { readFile, writeFile, mkdir, readdir, stat as fsStat, open as fsOpen } from "node:fs/promises";
import { clearLogcatSession, exportLogcatSession, getLogcatSessionState, startLogcatSession, stopAllLogcatSessions, stopLogcatSession, updateLogcatSessionFilters, type LogcatCaptureFilters } from "../shared/logcatRuntime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execFileAsync = execFileDecoded;

const pythonExecutable = process.env.ADB_HELPER_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
const backendCliPath = join(__dirname, "../../backend/cli.py");
const workspaceRoot = join(__dirname, "../..");

function resolveWorkingPath(targetPath: string) {
  return isAbsolute(targetPath) ? targetPath : resolve(workspaceRoot, targetPath);
}

function toStr(v: string | Buffer | undefined | null): string {
  if (v === undefined || v === null) return "";
  return typeof v === "string" ? v : v.toString("utf8");
}

async function invokeBackend(args: string[]) {
  const { stdout } = await execFileAsync(pythonExecutable, [backendCliPath, ...args], {
    cwd: join(__dirname, "../.."),
    maxBuffer: 50 * 1024 * 1024
  });
  return JSON.parse(toStr(stdout));
}

async function loadLogcatOptions(overrides?: { clearBeforeStart?: boolean; filters?: LogcatCaptureFilters; buffers?: string[] }) {
  const result = await invokeBackend(["logcat-config"]);
  return {
    outputDir: String(result.outputDir ?? ""),
    maxFileSizeBytes: Math.max(Number(result.maxFileSizeMb ?? 10), 1) * 1024 * 1024,
    clearBeforeStart: overrides?.clearBeforeStart ?? Boolean(result.clearBeforeStart),
    filters: overrides?.filters,
    buffers: overrides?.buffers,
  };
}

let _useEmbeddedBrowser = false;

function registerIpcHandlers() {
  ipcMain.handle("settings.setUseEmbeddedBrowser", async (_event, value: boolean) => {
    _useEmbeddedBrowser = value;
  });

  ipcMain.handle("device.list", async () => {
    const result = await invokeBackend(["devices"]);
    return result.items ?? [];
  });

  ipcMain.handle("device.probe", async (_event, payload: { deviceId: string }) => {
    return invokeBackend(["probe", "--device", payload.deviceId]);
  });

  ipcMain.handle("device.apps", async (_event, payload: { deviceId: string }) => {
    return invokeBackend(["device-apps", "--device", payload.deviceId]);
  });

  ipcMain.handle("device.appDetail", async (_event, payload: { deviceId: string; packageName: string }) => {
    return invokeBackend(["device-app-detail", "--device", payload.deviceId, "--package-name", payload.packageName]);
  });

  ipcMain.handle("device.users", async (_event, payload: { deviceId: string }) => {
    return invokeBackend(["device-users", "--device", payload.deviceId]);
  });

  ipcMain.handle("device.processes", async (_event, payload: { deviceId: string }) => {
    return invokeBackend(["device-processes", "--device", payload.deviceId]);
  });

  ipcMain.handle("device.displayList", async (_event, payload: { deviceId: string }) => {
    return invokeBackend(["device-display-list", "--device", payload.deviceId]);
  });

  ipcMain.handle("scrcpy.config", async (_event, payload: { deviceId: string; displayId: number }) => {
    return invokeBackend(["scrcpy-config", "--device", payload.deviceId, "--display-id", String(payload.displayId)]);
  });

  ipcMain.handle("scrcpy.updateConfig", async (_event, payload: { deviceId: string; displayId: number; maxSize: number; windowX: number; windowY: number; windowWidth: number; windowHeight: number }) => {
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

  ipcMain.handle("scrcpy.launch", async (_event, payload: { deviceId: string; displayId: number }) => {
    return invokeBackend(["scrcpy-launch", "--device", payload.deviceId, "--display-id", String(payload.displayId)]);
  });

  ipcMain.handle("scrcpy.syncWindow", async (_event, payload: { deviceId: string; displayId: number }) => {
    return invokeBackend(["scrcpy-sync-window", "--device", payload.deviceId, "--display-id", String(payload.displayId)]);
  });

  ipcMain.handle(
    "command.run",
    async (
      _event,
      payload: {
        deviceId: string;
        deviceName?: string;
        commandId: string;
        commandTitle?: string;
        rawCommand?: string;
        args: string[];
        source?: string;
      }
    ) => {
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
    }
  );

  ipcMain.handle("history.list", async (_event, payload: { limit?: number } | undefined) => {
    const args = ["history"];
    if (payload?.limit) {
      args.push("--limit", String(payload.limit));
    }
    return invokeBackend(args);
  });

  ipcMain.handle("history.remove", async (_event, payload: { recordId: string; limit?: number }) => {
    const args = ["history-remove", "--record-id", payload.recordId];
    if (payload.limit) {
      args.push("--limit", String(payload.limit));
    }
    return invokeBackend(args);
  });

  ipcMain.handle("history.clear", async (_event, payload: { limit?: number } | undefined) => {
    const args = ["history-clear"];
    if (payload?.limit) {
      args.push("--limit", String(payload.limit));
    }
    return invokeBackend(args);
  });

  ipcMain.handle("logcat.start", async (_event, payload: { deviceId: string; clearBeforeStart?: boolean; filters?: LogcatCaptureFilters; buffers?: string[] }) => {
    return startLogcatSession(payload.deviceId, await loadLogcatOptions({ clearBeforeStart: payload.clearBeforeStart, filters: payload.filters, buffers: payload.buffers }));
  });

  ipcMain.handle("logcat.stop", async (_event, payload: { deviceId: string }) => {
    return stopLogcatSession(payload.deviceId);
  });

  ipcMain.handle("logcat.state", async (_event, payload: { deviceId: string }) => {
    return getLogcatSessionState(payload.deviceId);
  });

  ipcMain.handle("logcat.export", async (_event, payload: { deviceId: string }) => {
    return exportLogcatSession(payload.deviceId);
  });

  ipcMain.handle("logcat.updateFilters", async (_event, payload: { deviceId: string; filters?: LogcatCaptureFilters }) => {
    return updateLogcatSessionFilters(payload.deviceId, payload.filters ?? {});
  });

  ipcMain.handle("logcat.clear", async (_event, payload: { deviceId: string; filters?: LogcatCaptureFilters }) => {
    return clearLogcatSession(payload.deviceId, payload.filters);
  });

  ipcMain.handle("logcat.config", async () => {
    return invokeBackend(["logcat-config"]);
  });

  ipcMain.handle("logcat.packageList", async (_event, payload: { deviceId: string }) => {
    return invokeBackend(["logcat-package-list", "--device", payload.deviceId]);
  });

  ipcMain.handle("logcat.processList", async (_event, payload: { deviceId: string }) => {
    return invokeBackend(["logcat-process-list", "--device", payload.deviceId]);
  });

  ipcMain.handle("logcat.updateConfig", async (_event, payload: { outputDir: string; maxFileSizeMb: number; clearBeforeStart: boolean; displayLineLimit: number; refreshIntervalMs: number; defaultRegexEnabled: boolean; defaultLevels: string[] }) => {
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

  ipcMain.handle("backup.info", async (_event, payload: { deviceId: string }) => {
    return invokeBackend(["backup-info", "--device", payload.deviceId]);
  });

  ipcMain.handle("backup.config", async () => {
    return invokeBackend(["backup-config"]);
  });

  ipcMain.handle("backup.updateConfig", async (_event, payload: { versionProp: string; backupRoot: string; backupPaths: string[]; restorePaths: string[] }) => {
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

  ipcMain.handle("backup.migrate", async (_event, payload: { sourceRoot: string; targetRoot: string }) => {
    return invokeBackend(["backup-migrate", "--source-root", payload.sourceRoot, "--target-root", payload.targetRoot]);
  });

  ipcMain.handle("backup.create", async (_event, payload: { deviceId: string; paths?: string[] }) => {
    const args = ["backup-create", "--device", payload.deviceId];
    if (payload.paths?.length) {
      args.push("--paths", ...payload.paths);
    }
    return invokeBackend(args);
  });

  ipcMain.handle("backup.restore", async (_event, payload: { deviceId: string; paths?: string[] }) => {
    const args = ["backup-restore", "--device", payload.deviceId];
    if (payload.paths?.length) {
      args.push("--paths", ...payload.paths);
    }
    return invokeBackend(args);
  });

  ipcMain.handle("backup.openDirectory", async (_event, payload: { versionName: string }) => {
    return invokeBackend(["backup-open", "--version-name", payload.versionName]);
  });

  ipcMain.handle("system.openPath", async (_event, payload: { path: string }) => {
    const targetPath = resolveWorkingPath(payload.path);
    let targetDirectory: string;
    let targetFile: string | null = null;

    try {
      const stat = await fsStat(targetPath);
      if (stat.isFile()) {
        targetDirectory = dirname(targetPath);
        targetFile = targetPath;
      } else {
        targetDirectory = targetPath;
      }
    } catch {
      targetDirectory = dirname(targetPath);
    }

    try {
      if (targetFile) {
        let selected = false;
        const managers = [
          { cmd: "nautilus", args: ["--select", targetFile] },
          { cmd: "dolphin", args: ["--select", targetFile] },
          { cmd: "thunar", args: [targetFile] },
          { cmd: "pcmanfm-qt", args: ["--select-file", targetFile] },
          { cmd: "nemo", args: ["--select", targetFile] },
        ];
        for (const mgr of managers) {
          try {
            await execFileAsync("which", [mgr.cmd], { timeout: 2000 });
            await execFileAsync(mgr.cmd, mgr.args, { timeout: 5000 });
            selected = true;
            break;
          } catch { continue; }
        }
        if (!selected) {
          await execFileAsync("xdg-open", [targetDirectory]);
        }
      } else {
        await execFileAsync("xdg-open", [targetDirectory]);
      }
    } catch {
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

  ipcMain.handle("system.resolvePath", async (_event, payload: { path: string }) => {
    const targetPath = resolveWorkingPath(payload.path);
    return {
      command: "system-resolve-path",
      status: "ok",
      path: targetPath,
    };
  });

  ipcMain.handle("system.pickDirectory", async (_event, payload?: { title?: string; defaultPath?: string }) => {
    const browserWindow = BrowserWindow.getFocusedWindow();
    const dialogOptions: OpenDialogOptions = {
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

  ipcMain.handle("system.pickFile", async (_event, payload?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
    const browserWindow = BrowserWindow.getFocusedWindow();
    const dialogOptions: OpenDialogOptions = {
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

  ipcMain.handle("backup.deleteVersion", async (_event, payload: { versionName: string }) => {
    return invokeBackend(["backup-delete", "--version-name", payload.versionName]);
  });

  ipcMain.handle("result.export", async (_event, payload: { recordId: string; format: string }) => {
    return invokeBackend(["export", "--result-id", payload.recordId, "--format", payload.format]);
  });

  ipcMain.handle("layout.dumpUiTree", async (_event, payload: { deviceId: string; displayId?: number }) => {
    try {
      const dumpArgs = ["-s", payload.deviceId, "shell", "uiautomator", "dump"];
      if (payload.displayId !== undefined && payload.displayId !== 0) {
        dumpArgs.push("--display", String(payload.displayId));
      }
      dumpArgs.push("/sdcard/window_dump.xml");
      const dumpResult = await execFileAsync("adb", dumpArgs, { timeout: 15000 });
      if (toStr((dumpResult as any).stderr).includes("ERROR")) {
        return { status: "error", message: toStr((dumpResult as any).stderr) };
      }
      const pullResult = await execFileAsync("adb", ["-s", payload.deviceId, "shell", "cat", "/sdcard/window_dump.xml"], { timeout: 15000, maxBuffer: 10 * 1024 * 1024 });
      const xml = toStr((pullResult as any).stdout).trim();
      if (!xml) return { status: "error", message: "UI dump returned empty XML" };
      return { status: "ok", xml };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { status: "error", message: errorMessage };
    }
  });

  ipcMain.handle("layout.listProcesses", async (_event, payload: { deviceId: string }) => {
    try {
      const result = await execFileAsync("adb", ["-s", payload.deviceId, "shell", "ps", "-A", "-o", "USER,PID,NAME"], { timeout: 10000, maxBuffer: 5 * 1024 * 1024 });
      const lines = toStr((result as any).stdout).trim().split("\n").slice(1); // skip header
      const processes = lines.map((line: string) => {
        const parts = line.trim().split(/\s+/);
        return { user: parts[0], pid: parts[1], name: parts.slice(2).join(" ") };
      }).filter((p: { name?: string; user?: string }) => p.name && p.user && /^u\d+_/.test(p.user));
      return { status: "ok", processes };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { status: "error", message: errorMessage };
    }
  });

  ipcMain.handle("layout.screenshot", async (_event, payload: { deviceId: string }) => {
    try {
      const result = await execFileAsync("adb", ["-s", payload.deviceId, "exec-out", "screencap", "-p"], { timeout: 15000, maxBuffer: 20 * 1024 * 1024, encoding: "buffer" as unknown as string });
      const base64 = Buffer.from(result.stdout as unknown as Buffer).toString("base64");
      return { status: "ok", dataUrl: `data:image/png;base64,${base64}` };
    } catch (err: unknown) {
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
    } catch (err: unknown) {
      return { status: "error", message: err instanceof Error ? err.message : String(err), token: "" };
    }
  });

  // Store popout state for child windows
  let popoutState: { uiTreeXml: string; screenshotDataUrl: string; deviceId: string; selectedPath?: string } | null = null;

  ipcMain.handle("layout.setPopoutState", async (_event, payload: { uiTreeXml: string; screenshotDataUrl: string; deviceId: string; selectedPath?: string }) => {
    popoutState = payload;
    return { status: "ok" };
  });

  ipcMain.handle("layout.updatePopoutSelection", async (_event, payload: { selectedPath: string | null }) => {
    if (popoutState) popoutState.selectedPath = payload.selectedPath ?? undefined;
    return { status: "ok" };
  });

  ipcMain.handle("layout.getPopoutState", async () => {
    return { status: "ok", ...(popoutState ?? { uiTreeXml: "", screenshotDataUrl: "", deviceId: "" }) };
  });

  ipcMain.handle("layout.popoutPanel", async (_event, payload: { panelId: number; title: string }) => {
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
    } else {
      void child.loadFile(join(__dirname, "../../dist/index.html"), { query: { popout: String(payload.panelId) } });
    }
    return { status: "ok" };
  });

  const panelsFilePath = join(__dirname, "../../backend/state/panels.json");

  ipcMain.handle("panels.load", async () => {
    try {
      const data = await readFile(panelsFilePath, "utf-8");
      return { status: "ok", panels: JSON.parse(data) };
    } catch {
      return { status: "ok", panels: null };
    }
  });

  ipcMain.handle("panels.save", async (_event, payload: { panels: unknown }) => {
    try {
      await mkdir(dirname(panelsFilePath), { recursive: true });
      await writeFile(panelsFilePath, JSON.stringify(payload.panels, null, 2), "utf-8");
      return { status: "ok" };
    } catch (err: unknown) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  });

  const macroTasksFilePath = join(__dirname, "../../backend/state/macro_tasks.json");

  ipcMain.handle("macroTasks.load", async () => {
    try {
      const data = await readFile(macroTasksFilePath, "utf-8");
      return { status: "ok", tasks: JSON.parse(data) };
    } catch {
      return { status: "ok", tasks: null };
    }
  });

  ipcMain.handle("macroTasks.save", async (_event, payload: { tasks: unknown }) => {
    try {
      await mkdir(dirname(macroTasksFilePath), { recursive: true });
      await writeFile(macroTasksFilePath, JSON.stringify(payload.tasks, null, 2), "utf-8");
      return { status: "ok" };
    } catch (err: unknown) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  });

  // Screen capture - save screenshot to local file and return preview
  ipcMain.handle("screen.capture", async (_event, payload: { deviceId: string; displayId?: number; savePath?: string }) => {
    try {
      const args = ["-s", payload.deviceId, "exec-out", "screencap", "-p"];
      if (payload.displayId != null && payload.displayId !== 0) {
        args.splice(4, 0, "-d", String(payload.displayId));
      }
      const result = await execFileAsync("adb", args, { timeout: 15000, maxBuffer: 20 * 1024 * 1024, encoding: "buffer" as unknown as string });
      const buf = Buffer.from(result.stdout as unknown as Buffer);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const savePath = payload.savePath || join(process.env.HOME ?? "/home/tsdl", "Pictures", `screenshot_d${payload.displayId ?? 0}_${timestamp}.png`);
      await mkdir(dirname(savePath), { recursive: true });
      await writeFile(savePath, buf);
      const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
      return { status: "ok", dataUrl, savedPath: savePath };
    } catch (err: unknown) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  });

  // Screen record - start recording (no duration limit, user controls stop)
  const activeRecordings = new Map<string, { remotePath: string; displayId: number }[]>();
  ipcMain.handle("screen.startRecord", async (_event, payload: { deviceId: string; displayId?: number }) => {
    try {
      const remotePath = `/sdcard/screenrecord_d${payload.displayId ?? 0}_${Date.now()}.mp4`;
      const args = ["-s", payload.deviceId, "shell", "screenrecord", "--time-limit", "180", "--bugreport"];
      // screenrecord 需要 physical display ID，通过 dumpsys SurfaceFlinger 获取映射
      let physicalDisplayId: string | null = null;
      try {
        const { stdout: sfOutput } = await execFileAsync("adb", ["-s", payload.deviceId, "shell", "dumpsys", "SurfaceFlinger", "--display-id"], { timeout: 5000 });
        const lines = toStr(sfOutput).split("\n");
        for (const line of lines) {
          const m = line.match(/Display\s+(\d+)\s+\(HWC display\s+(\d+)\)/);
          if (m && Number(m[2]) === (payload.displayId ?? 0)) { physicalDisplayId = m[1]; break; }
        }
      } catch {}
      if (physicalDisplayId) args.push("--display-id", physicalDisplayId);
      args.push(remotePath);
      execFileAsync("adb", args, { timeout: 185000 }).catch(() => {});
      const existing = activeRecordings.get(payload.deviceId) ?? [];
      existing.push({ remotePath, displayId: payload.displayId ?? 0 });
      activeRecordings.set(payload.deviceId, existing);
      return { status: "ok", remotePath };
    } catch (err: unknown) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  });

  // Screen record - stop and pull all active recordings for device
  ipcMain.handle("screen.stopRecord", async (_event, payload: { deviceId: string }) => {
    try {
      await execFileAsync("adb", ["-s", payload.deviceId, "shell", "pkill", "-SIGINT", "screenrecord"], { timeout: 5000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      const recordings = activeRecordings.get(payload.deviceId);
      if (!recordings || recordings.length === 0) return { status: "error", message: "没有正在进行的录屏" };
      const files: Array<{ displayId: number; localPath: string }> = [];
      for (const recording of recordings) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const localPath = join(process.env.HOME ?? "/home/tsdl", "Videos", `screenrecord_d${recording.displayId}_${timestamp}_${Math.random().toString(36).slice(2, 6)}.mp4`);
        await mkdir(dirname(localPath), { recursive: true });
        await execFileAsync("adb", ["-s", payload.deviceId, "pull", recording.remotePath, localPath], { timeout: 30000 }).catch(() => {});
        await execFileAsync("adb", ["-s", payload.deviceId, "shell", "rm", recording.remotePath], { timeout: 5000 }).catch(() => {});
        files.push({ displayId: recording.displayId, localPath });
      }
      activeRecordings.delete(payload.deviceId);
      return { status: "ok", files, localPath: files.map((f) => f.localPath).join(", ") };
    } catch (err: unknown) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  });

  // Crash/ANR - list files from device
  ipcMain.handle("crash.list", async (_event, payload: { deviceId: string }) => {
    try {
      const result = await invokeBackend(["crash-list", "--device", payload.deviceId]);
      return result;
    } catch (err: unknown) {
      return { status: "error", tombstones: [], anr: [], dropbox: [], message: err instanceof Error ? err.message : String(err) };
    }
  });

  // Crash/ANR - read file content from device
  ipcMain.handle("crash.read", async (_event, payload: { deviceId: string; filePath: string }) => {
    try {
      const result = await invokeBackend(["crash-read", "--device", payload.deviceId, "--file-path", payload.filePath]);
      if (result.isBinary) {
        try { result.content = Buffer.from(result.content, "base64").toString("utf-8"); } catch { result.content = `[二进制文件，无法文本显示] (${(Buffer.from(result.content, "base64").length / 1024).toFixed(1)} KB)`; }
      } else {
        try { result.content = Buffer.from(result.content, "base64").toString("utf-8"); } catch { /* keep as-is */ }
      }
      return result;
    } catch (err: unknown) {
      return { status: "error", content: "", isBinary: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // Crash/ANR - export files to local directory
  ipcMain.handle("crash.export", async (_event, payload: { deviceId: string; filePaths: string[]; outputDir?: string }) => {
    try {
      const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
      const outputDir = payload.outputDir ?? join(homeDir, "Documents", "adb-helper-crash-export");
      await mkdir(outputDir, { recursive: true });
      const result = await invokeBackend(["crash-export", "--device", payload.deviceId, "--output-dir", outputDir, ...payload.filePaths]);
      return result;
    } catch (err: unknown) {
      return { status: "error", exported: [], failed: [], message: err instanceof Error ? err.message : String(err) };
    }
  });

  // Bugreport - capture bugreport from device
  ipcMain.handle("bugreport.fetch", async (_event, payload: { deviceId: string }) => {
    try {
      const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
      const outputDir = join(homeDir, "Documents", "adb-helper-bugreport");
      await mkdir(outputDir, { recursive: true });
      const timestamp = Date.now();
      const fileName = `bugreport-${payload.deviceId}-${timestamp}.zip`;
      const localPath = join(outputDir, fileName);

      // adb bugreport saves directly to the host filesystem
      const bugResult = await execFileAsync("adb", ["-s", payload.deviceId, "bugreport", localPath], { timeout: 300000, maxBuffer: 50 * 1024 * 1024 });

      return { status: "ok", file: localPath };
    } catch (err: unknown) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  });

  // Bugreport - list all bugreport files in output directory
  ipcMain.handle("bugreport.listFiles", async () => {
    try {
      const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
      const outputDir = join(homeDir, "Documents", "adb-helper-bugreport");
      await mkdir(outputDir, { recursive: true });
      const entries = await readdir(outputDir);
      const files: { name: string; path: string; size: number; mtime: number }[] = [];
      for (const entry of entries) {
        if (!entry.endsWith(".zip")) continue;
        const fullPath = join(outputDir, entry);
        try {
          const stat = await fsStat(fullPath);
          files.push({ name: entry, path: fullPath, size: stat.size, mtime: stat.mtimeMs });
        } catch { /* skip unreadable */ }
      }
      files.sort((a, b) => b.mtime - a.mtime);
      return { status: "ok", files };
    } catch (err: unknown) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  });

  // Trace - start atrace capture on device
  ipcMain.handle("trace.start", async (_event, payload: { deviceId: string; duration: number; categories: string[] }) => {
    try {
      const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
      const outputDir = join(homeDir, "Documents", "adb-helper-trace");
      await mkdir(outputDir, { recursive: true });
      const timestamp = Date.now();
      const duration = Math.min(Math.max(Number(payload.duration) || 5, 1), 30);
      const fileName = `trace-${payload.deviceId}-${timestamp}.perfetto-trace`;
      const remotePath = `/data/local/tmp/${fileName}`;
      const categories = payload.categories ?? [];

      await execFileAsync(
        "adb",
        ["-s", payload.deviceId, "shell", "atrace", "--async_start", "-b", "40960", ...categories],
        { timeout: 10000 }
      );

      await new Promise((r) => setTimeout(r, duration * 1000));

      await execFileAsync(
        "adb",
        ["-s", payload.deviceId, "shell", "atrace", "--async_stop", "-o", remotePath],
        { timeout: 30000 }
      );

      await execFileAsync("adb", ["-s", payload.deviceId, "pull", remotePath, join(outputDir, fileName)], { timeout: 30000, maxBuffer: 50 * 1024 * 1024 });

      await execFileAsync("adb", ["-s", payload.deviceId, "shell", "rm", "-f", remotePath], { timeout: 5000 }).catch(() => {});

      return { status: "ok", file: join(outputDir, fileName) };
    } catch (err: unknown) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  });

  // Trace - read local file content as buffer for perfetto
  ipcMain.handle("trace.readFile", async (_event, payload: { path: string }) => {
    try {
      const filePath = resolveWorkingPath(payload.path);
      const buffer = await readFile(filePath);
      return { status: "ok", data: buffer.toString("base64") };
    } catch (err: unknown) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  });

  // Trace - list all trace files in output directory
  ipcMain.handle("trace.listFiles", async () => {
    try {
      const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
      const outputDir = join(homeDir, "Documents", "adb-helper-trace");
      await mkdir(outputDir, { recursive: true });
      const entries = await readdir(outputDir);
      const files: { name: string; path: string; size: number; mtime: number }[] = [];
      for (const entry of entries) {
        if (!entry.endsWith(".perfetto-trace")) continue;
        const fullPath = join(outputDir, entry);
        try {
          const stat = await fsStat(fullPath);
          files.push({ name: entry, path: fullPath, size: stat.size, mtime: stat.mtimeMs });
        } catch { /* skip unreadable */ }
      }
      files.sort((a, b) => b.mtime - a.mtime);
      return { status: "ok", files };
    } catch (err: unknown) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  });

  // ─── Monkey IPC handlers ──────────────────────────────────────────────
  const MONKEY_LOG_LIMIT = 10000;
  const MONKEY_EVENT_PATTERN = /## Network stats: elapsed time=(\d+)ms/;
  const MONKEY_CRASH_PATTERN = /\*\*\* CRASH|CRASH/;
  const MONKEY_ANR_PATTERN = /ANR in /;
  const MONKEY_EXCEPTION_PATTERN = /Exception|Error.*at\s+\w+/;

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

  ipcMain.handle("monkey.start", async (_event, payload: { deviceId: string; config: any }) => {
    try {
      const { deviceId, config } = payload;
      const existing = monkeySessions.get(deviceId);
      if (existing?.running) {
        existing.child?.kill("SIGKILL");
        existing.logcatChild?.kill("SIGKILL");
        await execFileAsync("adb", ["-s", deviceId, "shell", "pkill", "-f", "monkey"], { timeout: 5000 }).catch(() => {});
      }

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

      const monkeyChild = spawn("adb", ["-s", deviceId, "shell", "monkey", ...monkeyArgs]);
      session.child = monkeyChild;
      session.pid = monkeyChild.pid ?? null;

      const appendLog = (line: string) => {
        if (!line.trim()) return;
        session.logBuffer.push(line);
        if (session.logBuffer.length > MONKEY_LOG_LIMIT) session.logBuffer.shift();
        const evMatch = line.match(MONKEY_EVENT_PATTERN);
        if (evMatch) session.completedEvents = parseInt(evMatch[1], 10);
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
      return { status: "ok", pid: monkeyChild.pid };
    } catch (err: unknown) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("monkey.stop", async (_event, payload: { deviceId: string }) => {
    try {
      const { deviceId } = payload;
      const session = monkeySessions.get(deviceId);
      await execFileAsync("adb", ["-s", deviceId, "shell", "pkill", "-f", "monkey"], { timeout: 5000 }).catch(() => {});
      try {
        const { stdout: psOut } = await execFileAsync("adb", ["-s", deviceId, "shell", "ps", "-A"], { timeout: 5000 });
        const monkeyLines = toStr(psOut).split("\n").filter((l) => l.includes("monkey"));
        for (const line of monkeyLines) {
          const pid = line.trim().split(/\s+/)[1];
          if (pid) await execFileAsync("adb", ["-s", deviceId, "shell", "kill", "-9", pid], { timeout: 3000 }).catch(() => {});
        }
      } catch {}
      if (session) {
        session.child?.kill("SIGKILL");
        session.logcatChild?.kill("SIGKILL");
        session.running = false;
        session.child = null;
        session.logcatChild = null;
      }
      return { status: "ok" };
    } catch (err: unknown) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("monkey.status", async (_event, payload: { deviceId: string }) => {
    const session = monkeySessions.get(payload.deviceId);
    if (!session) {
      return { status: "ok", monkeyStatus: { running: false }, newLogs: [], report: null };
    }
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
        crashLogs: session.crashLogs,
        anrLogs: session.anrLogs,
      };
    }
    return { status: "ok", monkeyStatus, newLogs, report };
  });

  ipcMain.handle("trace.openInPerfetto", async (_event, payload: { path: string }) => {
    let perfettoWin: BrowserWindow | null = null;
    try {
      const filePath = resolveWorkingPath(payload.path);
      const buffer = await readFile(filePath);
      const title = payload.path.split("/").pop() ?? "trace";
      const base64Data = buffer.toString("base64");
      const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);

      if (!_useEmbeddedBrowser) {
        shell.openExternal("https://ui.perfetto.dev");
        return { status: "ok", mode: "external" };
      }

      const preloadContent = `
const B64 = ${JSON.stringify(base64Data)};
const TITLE = ${JSON.stringify(title)};
const SIZE_MB = ${JSON.stringify(sizeMB)};

(function(){
  if (window.__adbHelperLoaded) return;
  window.__adbHelperLoaded = true;

  var sent = false, sending = false;

  function makeBuf() {
    var bin = atob(B64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function createBtn() {
    if (document.getElementById('__adb_trace_btn')) return;
    var btn = document.createElement('div');
    btn.id = '__adb_trace_btn';
    btn.textContent = '📂 加载 Trace 文件';
    Object.assign(btn.style, {
      position: 'fixed', top: '10px', right: '10px', zIndex: '2147483647',
      padding: '8px 16px', background: '#1976d2', color: '#fff',
      borderRadius: '6px', fontSize: '13px', fontWeight: 'bold',
      cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif',
      userSelect: 'none', transition: 'background .15s'
    });
    btn.addEventListener('mouseenter', function(){ if (!sent) btn.style.background = '#1565c0'; });
    btn.addEventListener('mouseleave', function(){ if (!sent) btn.style.background = '#1976d2'; });
    btn.addEventListener('click', sendTrace);
    (document.documentElement || document.body).appendChild(btn);
  }

  function updateBtn(state) {
    var btn = document.getElementById('__adb_trace_btn');
    if (!btn) return;
    if (state === 'sent') {
      btn.textContent = '✅ 已加载 (' + SIZE_MB + ' MB)';
      btn.style.background = '#4caf50';
      btn.style.cursor = 'default';
    } else if (state === 'sending') {
      btn.textContent = '⏳ 发送中...';
      btn.style.background = '#ff9800';
      btn.style.cursor = 'wait';
    }
  }

  function sendTrace() {
    if (sent || sending) return;
    sending = true;
    updateBtn('sending');
    var buf = makeBuf();
    try {
      postMessage({ perfetto: { buffer: buf, title: TITLE } }, '*', [buf]);
      sent = true; sending = false;
      updateBtn('sent');
    } catch(e) { console.error('[ADB] postMessage failed:', e); sending = false; updateBtn(''); }
  }

  try { createBtn(); } catch(e) {}
})();
`;

      const tmpDir = join(tmpdir(), 'adb-helper-perfetto');
      await mkdir(tmpDir, { recursive: true });
      const preloadPath = join(tmpDir, `preload-${Date.now()}.js`);
      await writeFile(preloadPath, preloadContent, 'utf-8');

      perfettoWin = new BrowserWindow({
        width: 1440,
        height: 900,
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: false,
          nodeIntegration: false,
          sandbox: false,
          webSecurity: false,
          preload: preloadPath,
        },
      });
      perfettoWin.removeMenu();

      await perfettoWin.loadURL("https://ui.perfetto.dev");
      return { status: "ok", mode: "embedded" };
    } catch (err: unknown) {
      if (perfettoWin && !perfettoWin.isDestroyed()) {
        return { status: "ok" };
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ERR_FAILED") || msg.includes("-2") || msg.includes("aborted")) {
        return { status: "ok" };
      }
      return { status: "error", message: msg };
    }
  });

  // ─── Local file IPC handler ───────────────────────────────────────────
  ipcMain.handle("localFile.read", async (_event, payload: { path: string }) => {
    try {
      const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
      const allowedPrefixes = [join(home, "Pictures"), join(home, "Videos"), join(home, "Documents")];
      const resolved = resolve(payload.path);
      if (!allowedPrefixes.some((p) => resolved.startsWith(p + "/") || resolved.startsWith(p + "\\"))) {
        return { status: "error", message: "路径不在允许的目录范围内" };
      }
      const buffer = await readFile(resolved);
      const ext = extname(resolved).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".mp4": "video/mp4", ".webm": "video/webm",
        ".atrace": "application/octet-stream", ".zip": "application/zip",
      };
      const mimeType = mimeMap[ext] ?? "application/octet-stream";
      return { status: "ok", data: buffer.toString("base64"), mimeType };
    } catch (err: unknown) {
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

  window.webContents.setWindowOpenHandler(({ url }) => {
    if ((url.startsWith("https://ui.perfetto.dev") || url.startsWith("https://perfetto.dev")) && _useEmbeddedBrowser) {
      return { action: "allow", overrideBrowserWindowOptions: { autoHideMenuBar: true } };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

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
  { scheme: "winscope", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: "local-file", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  // Register custom protocol to serve winscope files
  const WINSCOPE_ROOT = "/home/tsdl/Documents/software/winscope/dist";
  const WINSCOPE_SOURCE_ROOT = "/home/tsdl/Documents/software/winscope";
  const WINSCOPE_FONTS_ROOT = join(__dirname, "../../public/winscope/fonts");

  const fontBase64Cache: Record<string, string> = {};
  async function loadFontBase64(name: string): Promise<string> {
    if (fontBase64Cache[name]) return fontBase64Cache[name];
    const fontPath = join(WINSCOPE_FONTS_ROOT, name);
    try {
      const buf = await readFile(fontPath);
      fontBase64Cache[name] = buf.toString("base64");
      console.log(`[Winscope] Font loaded: ${name}, size: ${buf.length}`);
      return fontBase64Cache[name];
    } catch (e) {
      console.error(`[Winscope] Failed to load font ${name}:`, e);
      return "";
    }
  }

  const [
    materialIconsB64,
    robotoLightB64,
    robotoRegularB64,
    robotoMediumB64,
    robotoBoldB64,
    openSansSemiBoldB64,
  ] = await Promise.all([
    loadFontBase64("MaterialIcons-Regular.woff2"),
    loadFontBase64("Roboto-Light.woff2"),
    loadFontBase64("Roboto-Regular.woff2"),
    loadFontBase64("Roboto-Medium.woff2"),
    loadFontBase64("Roboto-Bold.woff2"),
    loadFontBase64("OpenSans-SemiBold.woff2"),
  ]);

  const MIME_MAP: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ico": "image/x-icon",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
  };

  const LOCAL_MATERIAL_ICONS_CSS = `
@font-face {
  font-family: 'Material Icons';
  font-style: normal;
  font-weight: 400;
  src: url(data:font/woff2;base64,${materialIconsB64}) format('woff2');
}
.material-icons,
.md-icon,
.md-icon-font,
i.material-icons,
.md-icon.md-theme-default,
.md-icon.md-theme-default.material-icons,
[class*="material-icons"],
[class*="material-icons"],
i.md-icon,
.md-toolbar .md-icon,
.md-button .md-icon,
.tree-view .md-icon,
.md-icon[aria-hidden="true"],
.tree-node__toggle,
.tree-node .md-icon,
.md-list .md-icon,
.md-field .md-icon,
.md-select .md-icon,
.md-checkbox .md-icon,
.md-radio .md-icon,
.md-switch .md-icon,
.md-table .md-icon,
.md-pagination .md-icon,
.md-tooltip .md-icon,
.md-avatar .md-icon,
.md-chip .md-icon,
.md-snackbar .md-icon,
.md-dialog .md-icon,
.md-divider .md-icon,
.md-progress .md-icon,
.md-spinner .md-icon,
.md-tabs .md-icon,
.md-stepper .md-icon,
span.md-icon,
div.md-icon,
svg + span.material-icons {
  font-family: 'Material Icons' !important;
  font-weight: normal !important;
  font-style: normal !important;
  font-size: 24px !important;
  display: inline-block !important;
  line-height: 1 !important;
  text-transform: none !important;
  letter-spacing: normal !important;
  word-wrap: normal !important;
  white-space: nowrap !important;
  direction: ltr !important;
  -webkit-font-smoothing: antialiased !important;
  text-rendering: optimizeLegibility !important;
  -moz-osx-font-smoothing: grayscale !important;
  font-feature-settings: 'liga' !important;
}
`;

  const LOCAL_ROBOTO_CSS = `
@font-face { font-family: 'Roboto'; font-style: normal; font-weight: 300; src: url(data:font/woff2;base64,${robotoLightB64}) format('woff2'); }
@font-face { font-family: 'Roboto'; font-style: normal; font-weight: 400; src: url(data:font/woff2;base64,${robotoRegularB64}) format('woff2'); }
@font-face { font-family: 'Roboto'; font-style: normal; font-weight: 500; src: url(data:font/woff2;base64,${robotoMediumB64}) format('woff2'); }
@font-face { font-family: 'Roboto'; font-style: normal; font-weight: 700; src: url(data:font/woff2;base64,${robotoBoldB64}) format('woff2'); }
@font-face { font-family: 'Roboto'; font-style: italic; font-weight: 400; src: url(data:font/woff2;base64,${robotoRegularB64}) format('woff2'); }
`;

  const LOCAL_OPEN_SANS_CSS = `
@font-face { font-family: 'Open Sans'; font-style: normal; font-weight: 600; src: url(data:font/woff2;base64,${openSansSemiBoldB64}) format('woff2'); font-display: swap; }
`;

  protocol.handle("winscope", async (request) => {
    try {
      const requestUrl = new URL(request.url);
      const urlPath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
      const strippedPath = urlPath.replace(/^winscope\//, "") || "index.html";

      if (strippedPath === "fonts/roboto.css") {
        return new Response(LOCAL_ROBOTO_CSS, {
          headers: { "Content-Type": "text/css; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=86400" },
        });
      }
      if (strippedPath === "fonts/material-icons.css") {
        return new Response(LOCAL_MATERIAL_ICONS_CSS, {
          headers: { "Content-Type": "text/css; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=86400" },
        });
      }
      if (strippedPath === "fonts/opensans.css") {
        return new Response(LOCAL_OPEN_SANS_CSS, {
          headers: { "Content-Type": "text/css; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=86400" },
        });
      }

      if (strippedPath.startsWith("fonts/")) {
        const fontName = strippedPath.replace("fonts/", "");
        const fontPath = resolve(join(WINSCOPE_FONTS_ROOT, fontName));
        if (!fontPath.startsWith(resolve(WINSCOPE_FONTS_ROOT))) {
          return new Response("Forbidden", { status: 403 });
        }
        const body = await readFile(fontPath);
        const ext = extname(fontPath).toLowerCase();
        return new Response(body, {
          headers: { "Content-Type": MIME_MAP[ext] ?? "application/octet-stream", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=86400" },
        });
      }

      let filePath = join(WINSCOPE_ROOT, strippedPath);
      let resolved = resolve(filePath);
      if (!resolved.startsWith(WINSCOPE_ROOT)) {
        filePath = join(WINSCOPE_SOURCE_ROOT, strippedPath);
        resolved = resolve(filePath);
        if (!resolved.startsWith(WINSCOPE_SOURCE_ROOT)) {
          return new Response("Forbidden", { status: 403 });
        }
      }

      let body = await readFile(resolved);
      const ext = extname(resolved).toLowerCase();
      const contentType = MIME_MAP[ext] ?? "application/octet-stream";

      if (strippedPath === "index.html") {
        let html = body.toString("utf-8");
        html = html.replace(
          /<link[^>]*href="https?:\/\/fonts\.googleapis\.cn\/css\?family=Roboto[^"]*"[^>]*>/g,
          ""
        );
        html = html.replace(
          /<link[^>]*href="https?:\/\/fonts\.googleapis\.cn\/icon\?family=Material\+Icons"[^>]*>/g,
          ""
        );
        html = html.replace(
          /<link[^>]*href="https?:\/\/fonts\.googleapis\.com\/css\?family=Roboto[^"]*"[^>]*>/g,
          ""
        );
        html = html.replace(
          /<link[^>]*href="https?:\/\/fonts\.googleapis\.com\/icon\?family=Material\+Icons"[^>]*>/g,
          ""
        );
        html = html.replace(
          /<link[^>]*href="https?:\/\/fonts\.googleapis\.[a-z]+\/css2\?family=[^"]*"[^>]*>/g,
          ""
        );
        const inlineFontStyles = `<style>${LOCAL_ROBOTO_CSS}${LOCAL_MATERIAL_ICONS_CSS}${LOCAL_OPEN_SANS_CSS}</style>`;
        html = html.replace("<head>", "<head>" + inlineFontStyles);
        const fixIconScript = `<script>
(function() {
  function fixMaterialIcons() {
    document.querySelectorAll('.material-icons, .md-icon, [class*="material-icons"], i.md-icon, md-icon').forEach(function(el) {
      el.style.fontFamily = "'Material Icons', sans-serif";
      el.style.fontWeight = 'normal';
      el.style.fontStyle = 'normal';
      el.style.fontSize = '18px';
      el.style.display = 'inline-block';
      el.style.lineHeight = '1';
      el.style.textTransform = 'none';
      el.style.letterSpacing = 'normal';
      el.style.wordWrap = 'normal';
      el.style.whiteSpace = 'nowrap';
      el.style.direction = 'ltr';
      el.style.webkitFontSmoothing = 'antialiased';
      el.style.textRendering = 'optimizeLegibility';
      el.style.mozOsxFontSmoothing = 'grayscale';
      el.style.fontFeatureSettings = "'liga'";
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixMaterialIcons);
  } else {
    fixMaterialIcons();
  }
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) {
          fixMaterialIcons();
        }
      });
    });
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
</script>`;
        html = html.replace("</body>", fixIconScript + "\n</body>");
        body = Buffer.from(html, "utf-8");
      }

      if (ext === ".js") {
        let js = body.toString("utf-8");
        js = js.replace(
          /@import\s+url\(https?:\/\/fonts\.googleapis\.com\/css2\?family=Open\+Sans[^)]*\)\s*;?/g,
          LOCAL_OPEN_SANS_CSS
        );
        js = js.replace(/@import\s+url\([^)]*fonts\.googleapis\.com[^)]*\)\s*;?/g, "");
        js = js.replace(/@import\s+url\([^)]*fonts\.googleapis\.cn[^)]*\)\s*;?/g, "");
        js = js.replace(/@import\s+url\([^)]*fonts\.gstatic\.com[^)]*\)\s*;?/g, "");
        body = Buffer.from(js, "utf-8");
      }

      return new Response(body, {
        headers: {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        },
      });
    } catch (err) {
      return new Response(`Not Found: ${err instanceof Error ? err.message : String(err)}`, { status: 404 });
    }
  });

  protocol.handle("local-file", async (request) => {
    try {
      const urlPath = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, "");
      const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
      const allowedPrefixes = [join(home, "Pictures"), join(home, "Videos"), join(home, "Documents")];
      const resolved = resolve(urlPath);
      if (!allowedPrefixes.some((p) => resolved.startsWith(p + "/") || resolved.startsWith(p + "\\"))) {
        return new Response("Forbidden", { status: 403 });
      }
      const fileStat = await fsStat(resolved);
      const fileSize = fileStat.size;
      const ext = extname(resolved).toLowerCase();
      const LOCAL_MIME_MAP: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".zip": "application/zip",
        ".atrace": "application/octet-stream",
        ".txt": "text/plain; charset=utf-8",
      };
      const contentType = LOCAL_MIME_MAP[ext] ?? "application/octet-stream";
      const rangeHeader = request.headers.get("range");
      if (rangeHeader) {
        const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
          const chunkSize = end - start + 1;
          const fh = await fsOpen(resolved, "r");
          const buf = Buffer.alloc(chunkSize);
          await fh.read(buf, 0, chunkSize, start);
          await fh.close();
          return new Response(buf, {
            status: 206,
            headers: {
              "Content-Type": contentType,
              "Content-Range": `bytes ${start}-${end}/${fileSize}`,
              "Content-Length": String(chunkSize),
              "Accept-Ranges": "bytes",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=3600",
            },
          });
        }
      }
      const body = await readFile(resolved);
      return new Response(body, {
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(fileSize),
          "Accept-Ranges": "bytes",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (err) {
      return new Response(`Not Found: ${err instanceof Error ? err.message : String(err)}`, { status: 404 });
    }
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