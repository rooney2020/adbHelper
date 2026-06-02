import { contextBridge, ipcRenderer } from "electron";

type LogcatRuleField = "message" | "tag" | "pid" | "tid" | "package";
type LogcatRuleJoiner = "and" | "or";

interface LogcatCaptureFilters {
  searchTerm: string;
  regexEnabled: boolean;
  rules: Array<{ field: LogcatRuleField; joiner: LogcatRuleJoiner; value: string }>;
  levels: string[];
}

contextBridge.exposeInMainWorld("adbHelperApi", {
  version: "0.1.0",
  status: "ipc-ready",
  device: {
    list: () => ipcRenderer.invoke("device.list"),
    probe: (deviceId: string) => ipcRenderer.invoke("device.probe", { deviceId }),
    apps: (payload: { deviceId: string }) => ipcRenderer.invoke("device.apps", payload),
    appDetail: (payload: { deviceId: string; packageName: string }) => ipcRenderer.invoke("device.appDetail", payload),
    users: (payload: { deviceId: string }) => ipcRenderer.invoke("device.users", payload),
    processes: (payload: { deviceId: string }) => ipcRenderer.invoke("device.processes", payload),
    displayList: (payload: { deviceId: string }) => ipcRenderer.invoke("device.displayList", payload)
  },
  command: {
    run: (payload: { deviceId: string; deviceName?: string; commandId: string; commandTitle?: string; rawCommand?: string; args: string[] }) =>
      ipcRenderer.invoke("command.run", payload)
  },
  history: {
    list: (payload?: { limit?: number }) => ipcRenderer.invoke("history.list", payload),
    remove: (payload: { recordId: string; limit?: number }) => ipcRenderer.invoke("history.remove", payload),
    clear: (payload?: { limit?: number }) => ipcRenderer.invoke("history.clear", payload)
  },
  logcat: {
    start: (payload: { deviceId: string; clearBeforeStart?: boolean; filters?: LogcatCaptureFilters; buffers?: string[] }) => ipcRenderer.invoke("logcat.start", payload),
    stop: (payload: { deviceId: string }) => ipcRenderer.invoke("logcat.stop", payload),
    state: (payload: { deviceId: string }) => ipcRenderer.invoke("logcat.state", payload),
    export: (payload: { deviceId: string }) => ipcRenderer.invoke("logcat.export", payload),
    updateFilters: (payload: { deviceId: string; filters?: LogcatCaptureFilters }) => ipcRenderer.invoke("logcat.updateFilters", payload),
    clear: (payload: { deviceId: string; filters?: LogcatCaptureFilters }) => ipcRenderer.invoke("logcat.clear", payload),
    config: () => ipcRenderer.invoke("logcat.config"),
    packageList: (payload: { deviceId: string }) => ipcRenderer.invoke("logcat.packageList", payload),
    processList: (payload: { deviceId: string }) => ipcRenderer.invoke("logcat.processList", payload),
    updateConfig: (payload: { outputDir: string; maxFileSizeMb: number; clearBeforeStart: boolean; displayLineLimit: number; refreshIntervalMs: number; defaultRegexEnabled: boolean; defaultLevels: string[] }) => ipcRenderer.invoke("logcat.updateConfig", payload)
  },
  scrcpy: {
    config: (payload: { deviceId: string; displayId: number }) => ipcRenderer.invoke("scrcpy.config", payload),
    updateConfig: (payload: { deviceId: string; displayId: number; maxSize: number; windowX: number; windowY: number; windowWidth: number; windowHeight: number }) => ipcRenderer.invoke("scrcpy.updateConfig", payload),
    launch: (payload: { deviceId: string; displayId: number }) => ipcRenderer.invoke("scrcpy.launch", payload),
    syncWindow: (payload: { deviceId: string; displayId: number }) => ipcRenderer.invoke("scrcpy.syncWindow", payload)
  },
  backup: {
    info: (deviceId: string) => ipcRenderer.invoke("backup.info", { deviceId }),
    config: () => ipcRenderer.invoke("backup.config"),
    updateConfig: (payload: { versionProp: string; backupRoot: string; backupPaths: string[]; restorePaths: string[] }) => ipcRenderer.invoke("backup.updateConfig", payload),
    migrate: (payload: { sourceRoot: string; targetRoot: string }) => ipcRenderer.invoke("backup.migrate", payload),
    create: (payload: { deviceId: string; paths?: string[] }) => ipcRenderer.invoke("backup.create", payload),
    restore: (payload: { deviceId: string; paths?: string[] }) => ipcRenderer.invoke("backup.restore", payload),
    openDirectory: (payload: { versionName: string }) => ipcRenderer.invoke("backup.openDirectory", payload),
    deleteVersion: (payload: { versionName: string }) => ipcRenderer.invoke("backup.deleteVersion", payload)
  },
  system: {
    openPath: (payload: { path: string }) => ipcRenderer.invoke("system.openPath", payload),
    resolvePath: (payload: { path: string }) => ipcRenderer.invoke("system.resolvePath", payload),
    pickDirectory: (payload?: { title?: string; defaultPath?: string }) => ipcRenderer.invoke("system.pickDirectory", payload),
    pickFile: (payload?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => ipcRenderer.invoke("system.pickFile", payload)
  },
  result: {
    export: (payload: { recordId: string; format: "markdown" | "json" | "text" }) =>
      ipcRenderer.invoke("result.export", payload)
  },
  layout: {
    dumpUiTree: (payload: { deviceId: string; displayId?: number }) => ipcRenderer.invoke("layout.dumpUiTree", payload),
    screenshot: (payload: { deviceId: string }) => ipcRenderer.invoke("layout.screenshot", payload),
    getWinscopePath: () => ipcRenderer.invoke("layout.getWinscopePath"),
    winscopeProxy: () => ipcRenderer.invoke("layout.winscopeProxy"),
    popoutPanel: (payload: { panelId: number; title: string }) => ipcRenderer.invoke("layout.popoutPanel", payload),
    listProcesses: (payload: { deviceId: string }) => ipcRenderer.invoke("layout.listProcesses", payload),
    setPopoutState: (payload: { uiTreeXml: string; screenshotDataUrl: string; deviceId: string; selectedPath?: string }) => ipcRenderer.invoke("layout.setPopoutState", payload),
    updatePopoutSelection: (payload: { selectedPath: string | null }) => ipcRenderer.invoke("layout.updatePopoutSelection", payload),
    getPopoutState: () => ipcRenderer.invoke("layout.getPopoutState")
  },
  panels: {
    load: () => ipcRenderer.invoke("panels.load"),
    save: (payload: { panels: unknown }) => ipcRenderer.invoke("panels.save", payload)
  },
  macroTasks: {
    load: () => ipcRenderer.invoke("macroTasks.load"),
    save: (payload: { tasks: unknown }) => ipcRenderer.invoke("macroTasks.save", payload)
  },
  screen: {
    capture: (payload: { deviceId: string; displayId?: number; savePath?: string }) => ipcRenderer.invoke("screen.capture", payload),
    startRecord: (payload: { deviceId: string; displayId?: number }) => ipcRenderer.invoke("screen.startRecord", payload),
    stopRecord: (payload: { deviceId: string }) => ipcRenderer.invoke("screen.stopRecord", payload)
  },
  crash: {
    list: (payload: { deviceId: string }) => ipcRenderer.invoke("crash.list", payload),
    read: (payload: { deviceId: string; filePath: string }) => ipcRenderer.invoke("crash.read", payload)
  },
  bugreport: {
    fetch: (payload: { deviceId: string }) => ipcRenderer.invoke("bugreport.fetch", payload)
  },
  trace: {
    start: (payload: { deviceId: string; duration: number; categories: string[] }) => ipcRenderer.invoke("trace.start", payload),
    readFile: (payload: { path: string }) => ipcRenderer.invoke("trace.readFile", payload)
  }
});
