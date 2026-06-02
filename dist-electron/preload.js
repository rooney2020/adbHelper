import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("adbHelperApi", {
    version: "0.1.0",
    status: "ipc-ready",
    device: {
        list: () => ipcRenderer.invoke("device.list"),
        probe: (deviceId) => ipcRenderer.invoke("device.probe", { deviceId })
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
        state: (payload) => ipcRenderer.invoke("logcat.state", payload)
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
    result: {
        export: (payload) => ipcRenderer.invoke("result.export", payload)
    }
});
