import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("adbHelperApi", {
    version: "0.1.0",
    status: "ipc-ready",
    device: {
        list: () => ipcRenderer.invoke("device.list"),
        probe: (deviceId) => ipcRenderer.invoke("device.probe", { deviceId }),
        apps: (payload) => ipcRenderer.invoke("device.apps", payload),
        appDetail: (payload) => ipcRenderer.invoke("device.appDetail", payload),
        users: (payload) => ipcRenderer.invoke("device.users", payload),
        processes: (payload) => ipcRenderer.invoke("device.processes", payload),
        displayList: (payload) => ipcRenderer.invoke("device.displayList", payload)
    },
    command: {
        run: (payload) => ipcRenderer.invoke("command.run", payload)
    },
    history: {
        list: (payload) => ipcRenderer.invoke("history.list", payload),
        remove: (payload) => ipcRenderer.invoke("history.remove", payload),
        clear: (payload) => ipcRenderer.invoke("history.clear", payload)
    },
    logcat: {
        start: (payload) => ipcRenderer.invoke("logcat.start", payload),
        stop: (payload) => ipcRenderer.invoke("logcat.stop", payload),
        state: (payload) => ipcRenderer.invoke("logcat.state", payload),
        export: (payload) => ipcRenderer.invoke("logcat.export", payload),
        updateFilters: (payload) => ipcRenderer.invoke("logcat.updateFilters", payload),
        clear: (payload) => ipcRenderer.invoke("logcat.clear", payload),
        config: () => ipcRenderer.invoke("logcat.config"),
        packageList: (payload) => ipcRenderer.invoke("logcat.packageList", payload),
        processList: (payload) => ipcRenderer.invoke("logcat.processList", payload),
        updateConfig: (payload) => ipcRenderer.invoke("logcat.updateConfig", payload)
    },
    scrcpy: {
        config: (payload) => ipcRenderer.invoke("scrcpy.config", payload),
        updateConfig: (payload) => ipcRenderer.invoke("scrcpy.updateConfig", payload),
        launch: (payload) => ipcRenderer.invoke("scrcpy.launch", payload),
        syncWindow: (payload) => ipcRenderer.invoke("scrcpy.syncWindow", payload)
    },
    backup: {
        info: (deviceId) => ipcRenderer.invoke("backup.info", { deviceId }),
        config: () => ipcRenderer.invoke("backup.config"),
        updateConfig: (payload) => ipcRenderer.invoke("backup.updateConfig", payload),
        migrate: (payload) => ipcRenderer.invoke("backup.migrate", payload),
        create: (payload) => ipcRenderer.invoke("backup.create", payload),
        restore: (payload) => ipcRenderer.invoke("backup.restore", payload),
        openDirectory: (payload) => ipcRenderer.invoke("backup.openDirectory", payload),
        deleteVersion: (payload) => ipcRenderer.invoke("backup.deleteVersion", payload)
    },
    system: {
        openPath: (payload) => ipcRenderer.invoke("system.openPath", payload),
        resolvePath: (payload) => ipcRenderer.invoke("system.resolvePath", payload),
        pickDirectory: (payload) => ipcRenderer.invoke("system.pickDirectory", payload),
        pickFile: (payload) => ipcRenderer.invoke("system.pickFile", payload)
    },
    result: {
        export: (payload) => ipcRenderer.invoke("result.export", payload)
    },
    layout: {
        dumpUiTree: (payload) => ipcRenderer.invoke("layout.dumpUiTree", payload),
        screenshot: (payload) => ipcRenderer.invoke("layout.screenshot", payload),
        getWinscopePath: () => ipcRenderer.invoke("layout.getWinscopePath"),
        winscopeProxy: () => ipcRenderer.invoke("layout.winscopeProxy"),
        popoutPanel: (payload) => ipcRenderer.invoke("layout.popoutPanel", payload),
        listProcesses: (payload) => ipcRenderer.invoke("layout.listProcesses", payload),
        setPopoutState: (payload) => ipcRenderer.invoke("layout.setPopoutState", payload),
        updatePopoutSelection: (payload) => ipcRenderer.invoke("layout.updatePopoutSelection", payload),
        getPopoutState: () => ipcRenderer.invoke("layout.getPopoutState")
    },
    panels: {
        load: () => ipcRenderer.invoke("panels.load"),
        save: (payload) => ipcRenderer.invoke("panels.save", payload)
    },
    macroTasks: {
        load: () => ipcRenderer.invoke("macroTasks.load"),
        save: (payload) => ipcRenderer.invoke("macroTasks.save", payload)
    },
    screen: {
        capture: (payload) => ipcRenderer.invoke("screen.capture", payload),
        startRecord: (payload) => ipcRenderer.invoke("screen.startRecord", payload),
        stopRecord: (payload) => ipcRenderer.invoke("screen.stopRecord", payload)
    }
});
