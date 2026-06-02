/// <reference types="vite/client" />

declare global {
  type LogcatRuleField = "message" | "tag" | "pid" | "tid" | "package";
  type LogcatRuleJoiner = "and" | "or";

  interface LogcatCaptureFiltersPayload {
    searchTerm: string;
    regexEnabled: boolean;
    rules: Array<{ field: LogcatRuleField; joiner: LogcatRuleJoiner; value: string }>;
    levels: string[];
  }

  interface DeviceSummary {
    id: string;
    name: string;
    status: string;
    androidVersion: string;
  }

  interface Window {
    adbHelperApi?: {
      version: string;
      status: string;
      device: {
        list: () => Promise<DeviceSummary[]>;
        probe: (deviceId: string) => Promise<unknown>;
        apps: (payload: { deviceId: string }) => Promise<unknown>;
        appDetail: (payload: { deviceId: string; packageName: string }) => Promise<unknown>;
        users: (payload: { deviceId: string }) => Promise<unknown>;
        processes: (payload: { deviceId: string }) => Promise<unknown>;
        displayList: (payload: { deviceId: string }) => Promise<unknown>;
      };
      command: {
        run: (payload: { deviceId: string; deviceName?: string; commandId: string; commandTitle?: string; rawCommand?: string; args: string[]; source?: string }) => Promise<unknown>;
      };
      history: {
        list: (payload?: { limit?: number }) => Promise<unknown>;
        remove: (payload: { recordId: string; limit?: number }) => Promise<unknown>;
        clear: (payload?: { limit?: number }) => Promise<unknown>;
      };
      logcat: {
        start: (payload: { deviceId: string; clearBeforeStart?: boolean; filters?: LogcatCaptureFiltersPayload; buffers?: string[] }) => Promise<unknown>;
        stop: (payload: { deviceId: string }) => Promise<unknown>;
        state: (payload: { deviceId: string }) => Promise<unknown>;
        export: (payload: { deviceId: string }) => Promise<unknown>;
        updateFilters: (payload: { deviceId: string; filters?: LogcatCaptureFiltersPayload }) => Promise<unknown>;
        clear: (payload: { deviceId: string; filters?: LogcatCaptureFiltersPayload }) => Promise<unknown>;
        config: () => Promise<unknown>;
        packageList: (payload: { deviceId: string }) => Promise<unknown>;
        processList: (payload: { deviceId: string }) => Promise<unknown>;
        updateConfig: (payload: { outputDir: string; maxFileSizeMb: number; clearBeforeStart: boolean; displayLineLimit: number; refreshIntervalMs: number; defaultRegexEnabled: boolean; defaultLevels: string[] }) => Promise<unknown>;
      };
      scrcpy: {
        config: (payload: { deviceId: string; displayId: number }) => Promise<unknown>;
        updateConfig: (payload: { deviceId: string; displayId: number; maxSize: number; windowX: number; windowY: number; windowWidth: number; windowHeight: number }) => Promise<unknown>;
        launch: (payload: { deviceId: string; displayId: number }) => Promise<unknown>;
        syncWindow: (payload: { deviceId: string; displayId: number }) => Promise<unknown>;
      };
      backup: {
        info: (deviceId: string) => Promise<unknown>;
        config: () => Promise<unknown>;
        updateConfig: (payload: { versionProp: string; backupRoot: string; backupPaths: string[]; restorePaths: string[] }) => Promise<unknown>;
        migrate: (payload: { sourceRoot: string; targetRoot: string }) => Promise<unknown>;
        create: (payload: { deviceId: string; paths?: string[] }) => Promise<unknown>;
        restore: (payload: { deviceId: string; paths?: string[] }) => Promise<unknown>;
        openDirectory: (payload: { versionName: string }) => Promise<unknown>;
        deleteVersion: (payload: { versionName: string }) => Promise<unknown>;
      };
      system?: {
        openPath: (payload: { path: string }) => Promise<unknown>;
        resolvePath: (payload: { path: string }) => Promise<unknown>;
        pickDirectory: (payload?: { title?: string; defaultPath?: string }) => Promise<unknown>;
        pickFile: (payload?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<unknown>;
      };
      result: {
        export: (payload: { recordId: string; format: "markdown" | "json" | "text" }) => Promise<unknown>;
      };
      layout: {
        dumpUiTree: (payload: { deviceId: string; displayId?: number }) => Promise<{ status: string; xml?: string; message?: string }>;
        screenshot: (payload: { deviceId: string }) => Promise<{ status: string; dataUrl?: string; message?: string }>;
        getWinscopePath: () => Promise<{ status: string; path: string }>;
        winscopeProxy: () => Promise<{ status: string; token?: string; message?: string }>;
        popoutPanel: (payload: { panelId: number; title: string }) => Promise<{ status: string }>;
        listProcesses: (payload: { deviceId: string }) => Promise<{ status: string; processes?: { pid: string; name: string }[] }>;
        setPopoutState: (payload: { uiTreeXml: string; screenshotDataUrl: string; deviceId: string; selectedPath?: string }) => Promise<{ status: string }>;
        updatePopoutSelection: (payload: { selectedPath: string | null }) => Promise<{ status: string }>;
        getPopoutState: () => Promise<{ status: string; uiTreeXml: string; screenshotDataUrl: string; deviceId: string; selectedPath?: string }>;
      };
      panels: {
        load: () => Promise<{ status: string; panels: unknown }>;
        save: (payload: { panels: unknown }) => Promise<{ status: string }>;
      };
      macroTasks: {
        load: () => Promise<{ status: string; tasks: unknown }>;
        save: (payload: { tasks: unknown }) => Promise<{ status: string }>;
      };
      screen: {
        capture: (payload: { deviceId: string; displayId?: number; savePath?: string }) => Promise<{ status: string; dataUrl?: string; savedPath?: string; message?: string }>;
        startRecord: (payload: { deviceId: string; displayId?: number }) => Promise<{ status: string; remotePath?: string; message?: string }>;
        stopRecord: (payload: { deviceId: string }) => Promise<{ status: string; localPath?: string; message?: string }>;
      };
    };
  }
}

export {};