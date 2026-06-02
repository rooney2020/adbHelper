import { Menu, app, BrowserWindow, ipcMain } from "electron";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { getLogcatSessionState, startLogcatSession, stopAllLogcatSessions, stopLogcatSession } from "../shared/logcatRuntime.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execFileAsync = promisify(execFile);
const pythonExecutable = process.env.ADB_HELPER_PYTHON ?? "python3";
const backendCliPath = join(__dirname, "../backend/cli.py");
async function invokeBackend(args) {
    const { stdout } = await execFileAsync(pythonExecutable, [backendCliPath, ...args], {
        cwd: join(__dirname, "..")
    });
    return JSON.parse(stdout);
}
function registerIpcHandlers() {
    ipcMain.handle("device.list", async () => {
        const result = await invokeBackend(["devices"]);
        return result.items ?? [];
    });
    ipcMain.handle("device.probe", async (_event, payload) => {
        return invokeBackend(["probe", "--device", payload.deviceId]);
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
        return startLogcatSession(payload.deviceId);
    });
    ipcMain.handle("logcat.stop", async (_event, payload) => {
        return stopLogcatSession(payload.deviceId);
    });
    ipcMain.handle("logcat.state", async (_event, payload) => {
        return getLogcatSessionState(payload.deviceId);
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
    ipcMain.handle("backup.deleteVersion", async (_event, payload) => {
        return invokeBackend(["backup-delete", "--version-name", payload.versionName]);
    });
    ipcMain.handle("result.export", async (_event, payload) => {
        return invokeBackend(["export", "--result-id", payload.recordId, "--format", payload.format]);
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
    void window.loadFile(join(__dirname, "../dist/index.html"));
}
app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
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
