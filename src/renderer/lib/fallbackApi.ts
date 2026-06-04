import { type CommandMeta, type FilterKey } from "./catalog";

// Constants duplicated from App.tsx (used only by fallback data)
const BACKUP_ROOT_PATH = "/home/tsdl/ssd/ingo/backup";
const DEFAULT_LOGCAT_OUTPUT_DIR = "/home/tsdl/ssd/ingo/logcat";
const DEFAULT_LOGCAT_REFRESH_INTERVAL_MS = 300;
const MIN_LOGCAT_REFRESH_INTERVAL_MS = 100;
const MAX_LOGCAT_REFRESH_INTERVAL_MS = 5000;
const LOGCAT_LEVEL_OPTIONS = ["V", "D", "I", "W", "E", "F"] as const;

interface HistoryItem {
  record_id: string;
  device: string;
  device_name: string;
  command_id: string;
  command_title: string;
  raw?: string;
  args?: string[];
  status: string;
  executedCommand?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  message?: string;
  duration?: number;
  created_at?: number;
  source?: string;
}

interface BackupConfig {
  versionProp: string;
  backupPaths: string[];
  restorePaths: string[];
  backupRoot?: string;
  previousBackupRoot?: string;
  rootChanged?: boolean;
  migrationAvailable?: boolean;
  message?: string;
}

interface LogcatEntry {
  id: string;
  raw: string;
  timestamp: string;
  pid: string;
  tid: string;
  level: string;
  tag: string;
  message: string;
  packageName: string;
  parsed: boolean;
}

interface LogcatConfig {
  command?: string;
  status?: string;
  message?: string;
  outputDir: string;
  maxFileSizeMb: number;
  clearBeforeStart: boolean;
  displayLineLimit: number;
  refreshIntervalMs: number;
  defaultRegexEnabled: boolean;
  defaultLevels: string[];
}

export function normalizeLogcatRefreshIntervalMs(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_LOGCAT_REFRESH_INTERVAL_MS;
  }
  return Math.max(MIN_LOGCAT_REFRESH_INTERVAL_MS, Math.min(MAX_LOGCAT_REFRESH_INTERVAL_MS, Math.round(numeric)));
}

export function normalizeLogcatLevelSelection(values: unknown) {
  if (!Array.isArray(values)) {
    return [] as string[];
  }
  const normalized: string[] = [];
  for (const item of values) {
    const level = String(item).trim().toUpperCase();
    if (LOGCAT_LEVEL_OPTIONS.includes(level as (typeof LOGCAT_LEVEL_OPTIONS)[number]) && !normalized.includes(level)) {
      normalized.push(level);
    }
  }
  return normalized;
}

const fallbackHistory: HistoryItem[] = [];
const fallbackLogcatEntries: LogcatEntry[] = [
  {
    id: "fallback-log-1",
    raw: "05-20 09:12:18.100  3976  5479 E VehicleServerService: demo error message",
    timestamp: "05-20 09:12:18.100",
    pid: "3976",
    tid: "5479",
    level: "E",
    tag: "VehicleServerService",
    message: "demo error message",
    packageName: "com.zone.vehicleserver",
    parsed: true,
  },
  {
    id: "fallback-log-2",
    raw: "05-20 09:12:18.210  8241  8241 I Launcher: home resumed",
    timestamp: "05-20 09:12:18.210",
    pid: "8241",
    tid: "8241",
    level: "I",
    tag: "Launcher",
    message: "home resumed",
    packageName: "com.android.launcher",
    parsed: true,
  },
  {
    id: "fallback-log-3",
    raw: "05-20 09:12:18.330  9012  9019 D MediaCenter: playback state changed",
    timestamp: "05-20 09:12:18.330",
    pid: "9012",
    tid: "9019",
    level: "D",
    tag: "MediaCenter",
    message: "playback state changed",
    packageName: "com.zone.mediacenter",
    parsed: true,
  }
];
let fallbackLogcatRunning = false;
let fallbackBackupConfig: BackupConfig = {
  versionProp: "ro.build.display.id",
  backupPaths: ["/system/framework", "/system/app", "/system/priv-app"],
  restorePaths: ["/system/framework"],
  backupRoot: BACKUP_ROOT_PATH
};
let fallbackLogcatConfig: LogcatConfig = {
  outputDir: DEFAULT_LOGCAT_OUTPUT_DIR,
  maxFileSizeMb: 10,
  clearBeforeStart: false,
  displayLineLimit: 3000,
  refreshIntervalMs: DEFAULT_LOGCAT_REFRESH_INTERVAL_MS,
  defaultRegexEnabled: false,
  defaultLevels: [],
};

const fallbackDevices: DeviceSummary[] = [
  { id: "pixel-8-pro", name: "Pixel 8 Pro", status: "浏览器预览数据", androidVersion: "Android 15" },
  { id: "galaxy-s24", name: "Galaxy S24", status: "浏览器预览数据", androidVersion: "Android 14" },
  { id: "redmi-k70", name: "Redmi K70", status: "浏览器预览数据", androidVersion: "Android 14" }
];

export async function fetchDevApi<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function postDevApi<T>(path: string, payload: unknown): Promise<T | null> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function matchesFilter(command: CommandMeta, filter: FilterKey) {
  if (filter === "all") return true;
  if (filter === "view") return command.type === "查看型";
  if (filter === "write") return command.type === "写操作";
  if (filter === "risk") return command.risk === "高";
  if (filter === "favorite") return Boolean(command.favorite);
  return true;
}

export const fallbackApi: NonNullable<Window["adbHelperApi"]> = {
  version: "0.1.0",
  status: "dev-server",
  device: {
    list: async () => (await fetchDevApi<DeviceSummary[]>("/api/adb-helper/device-list")) ?? fallbackDevices,
    probe: async (deviceId: string) =>
      (await fetchDevApi<unknown>(`/api/adb-helper/device-probe?deviceId=${encodeURIComponent(deviceId)}`))
      ?? { command: "probe", device: deviceId, status: "fallback" },
    apps: async (payload: { deviceId: string }) =>
      (await fetchDevApi<unknown>(`/api/adb-helper/device-apps?deviceId=${encodeURIComponent(payload.deviceId)}`))
      ?? {
        command: "device-apps",
        status: "fallback",
        device: payload.deviceId,
        items: [
          { packageName: "com.example.maps", apkPath: "/product/app/Maps/Maps.apk", uid: "10123", installedUsers: [0, 10] },
          { packageName: "com.example.media", apkPath: "/product/app/Media/Media.apk", uid: "10124", installedUsers: [10] },
        ],
      },
    appDetail: async (payload: { deviceId: string; packageName: string }) =>
      (await fetchDevApi<unknown>(`/api/adb-helper/device-app-detail?deviceId=${encodeURIComponent(payload.deviceId)}&packageName=${encodeURIComponent(payload.packageName)}`))
      ?? {
        command: "device-app-detail",
        status: "fallback",
        device: payload.deviceId,
        detail: {
          packageName: payload.packageName,
          apkPath: "/product/app/Maps/Maps.apk",
          versionCode: "42",
          versionName: "1.0.0",
          uid: "10123",
          dataDir: `/data/user/0/${payload.packageName}`,
          firstInstallTime: "2026-05-20 10:00:00",
          lastUpdateTime: "2026-05-20 10:00:00",
          installedUsers: [0, 10],
          requestedPermissions: ["android.permission.INTERNET", "android.permission.ACCESS_FINE_LOCATION"],
          disabledComponents: [],
          activities: [`${payload.packageName}/.MainActivity`],
          services: [`${payload.packageName}/.SyncService`],
          receivers: [`${payload.packageName}/.BootReceiver`],
          providers: [],
        },
      },
    users: async (payload: { deviceId: string }) =>
      (await fetchDevApi<unknown>(`/api/adb-helper/device-users?deviceId=${encodeURIComponent(payload.deviceId)}`))
      ?? {
        command: "device-users",
        status: "fallback",
        device: payload.deviceId,
        summary: {
          currentUserId: 10,
          maxUsers: 4,
          supportsSwitchableUsers: "true",
          allGuestsEphemeral: "false",
          forceEphemeralUsers: "false",
          isHeadlessSystemMode: "false",
          ownerName: "Driver",
          cachedUserIds: "[0, 10]",
          cachedUserIdsIncludingPreCreated: "[0, 10]",
          guestRestrictions: [],
        },
        users: [
          { id: 0, name: "系统用户", flagsValue: 813, preCreated: false, running: true, serialNo: "0", isPrimary: true, type: "android.os.usertype.full.SYSTEM", flags: "SYSTEM", state: "RUNNING_UNLOCKED", created: "未知", lastLoggedIn: "刚刚", startTime: "刚刚", unlockTime: "刚刚", hasProfileOwner: "false", restrictions: [], globalRestrictions: [], localRestrictions: [], effectiveRestrictions: [] },
          { id: 10, name: "Driver", flagsValue: 412, preCreated: false, running: true, serialNo: "10", isPrimary: false, type: "android.os.usertype.full.SECONDARY", flags: "FULL", state: "RUNNING_UNLOCKED", created: "刚刚", lastLoggedIn: "刚刚", startTime: "刚刚", unlockTime: "刚刚", hasProfileOwner: "false", restrictions: [], globalRestrictions: [], localRestrictions: [], effectiveRestrictions: [] },
        ],
        passengerConfig: [],
      },
    processes: async (payload: { deviceId: string }) =>
      (await fetchDevApi<unknown>(`/api/adb-helper/device-processes?deviceId=${encodeURIComponent(payload.deviceId)}`))
      ?? {
        command: "device-processes",
        status: "fallback",
        device: payload.deviceId,
        items: [
          { user: "u10_a123", pid: "8123", ppid: "901", name: "com.example.maps", args: "com.example.maps", packageName: "com.example.maps" },
          { user: "system", pid: "1200", ppid: "1", name: "system_server", args: "system_server", packageName: "" },
        ],
      },
    displayList: async (payload: { deviceId: string }) =>
      (await fetchDevApi<unknown>(`/api/adb-helper/device-display-list?deviceId=${encodeURIComponent(payload.deviceId)}`))
      ?? {
        command: "device-display-list",
        status: "fallback",
        device: payload.deviceId,
        scrcpyAvailable: true,
        items: [
          { displayId: 0, type: "INTERNAL", label: "内置屏幕 0", uniqueId: "local:0", active: true, valid: true, orientation: 0, logicalWidth: 1920, logicalHeight: 1080, deviceWidth: 1920, deviceHeight: 1080, state: "ON" },
          { displayId: 1, type: "EXTERNAL", label: "外接屏幕 1", uniqueId: "local:1", active: true, valid: true, orientation: 0, logicalWidth: 1280, logicalHeight: 720, deviceWidth: 1280, deviceHeight: 720, state: "ON" },
        ],
      }
  },
  command: {
    run: async (payload) =>
      (await postDevApi<unknown>("/api/adb-helper/command-run", payload))
      ?? {
        ...(function () {
          const record: HistoryItem = {
            record_id: `${payload.deviceId}:${payload.commandId}:${fallbackHistory.length + 1}`,
            device: payload.deviceId,
            device_name: payload.deviceName ?? payload.deviceId,
            command_id: payload.commandId,
            command_title: payload.commandTitle ?? payload.commandId,
            raw: payload.rawCommand,
            args: payload.args,
            status: "fallback"
          };
          fallbackHistory.unshift(record);
          return {
            command: "run",
            ...record
          };
        })(),
        message: "renderer 正在通过浏览器 fallback 预览执行结果"
      }
  },
  history: {
    list: async (payload) =>
      (await fetchDevApi<unknown>(`/api/adb-helper/history?limit=${payload?.limit ?? 20}`))
      ?? {
        command: "history",
        items: fallbackHistory.slice(0, payload?.limit ?? 20),
        status: "fallback"
      },
    remove: async (payload) => {
      const devResponse = await postDevApi<unknown>("/api/adb-helper/history-remove", payload);
      if (devResponse) {
        return devResponse;
      }

      const targetIndex = fallbackHistory.findIndex((item) => item.record_id === payload.recordId);
      if (targetIndex >= 0) {
        fallbackHistory.splice(targetIndex, 1);
      }
      return {
        command: "history-remove",
        items: fallbackHistory.slice(0, payload.limit ?? 20),
        removedRecordId: payload.recordId,
        status: "fallback"
      };
    },
    clear: async (payload) => {
      const devResponse = await postDevApi<unknown>("/api/adb-helper/history-clear", payload ?? {});
      if (devResponse) {
        return devResponse;
      }

      fallbackHistory.splice(0, fallbackHistory.length);
      return {
        command: "history-clear",
        items: fallbackHistory.slice(0, payload?.limit ?? 20),
        status: "fallback"
      };
    }
  },
  system: {
    openPath: async (payload: { path: string }) => ({
      command: "system-open-path",
      status: "fallback",
      path: payload.path,
      message: `浏览器预览模式不支持直接打开本地路径：${payload.path}`,
    }),
    resolvePath: async (payload: { path: string }) => ({
      command: "system-resolve-path",
      status: "fallback",
      path: payload.path,
    }),
      pickDirectory: async (payload?: { title?: string; defaultPath?: string }) =>
        (await postDevApi<unknown>("/api/adb-helper/system-pick-directory", payload ?? {}))
        ?? {
          command: "system-pick-directory",
          status: "fallback",
          canceled: true,
          path: "",
        },
      pickFile: async (payload?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
        (await postDevApi<unknown>("/api/adb-helper/system-pick-file", payload ?? {}))
        ?? {
          command: "system-pick-file",
          status: "fallback",
          canceled: true,
          path: "",
        }
  },
  logcat: {
    start: async (payload: { deviceId: string; clearBeforeStart?: boolean; filters?: LogcatCaptureFiltersPayload; buffers?: string[] }) =>
      (await postDevApi<unknown>("/api/adb-helper/logcat-start", payload))
      ?? {
        command: "logcat-stream-state",
        status: "fallback",
        device: payload.deviceId,
        running: (fallbackLogcatRunning = true),
        bufferedLines: fallbackLogcatEntries.length,
        droppedLines: 0,
        bufferLimit: 3000,
        items: fallbackLogcatEntries,
        capturedAt: Date.now(),
        startedAt: Date.now(),
        outputDir: fallbackLogcatConfig.outputDir,
        currentFilePath: `${fallbackLogcatConfig.outputDir}/logcat_20260520091520.txt`,
        savedFileCount: 1,
        maxFileSizeBytes: fallbackLogcatConfig.maxFileSizeMb * 1024 * 1024,
        clearBeforeStart: payload.clearBeforeStart ?? fallbackLogcatConfig.clearBeforeStart,
        message: "浏览器预览态返回示例日志，未真正调用实时 logcat。"
      },
    stop: async (payload: { deviceId: string }) =>
      (await fetchDevApi<unknown>(`/api/adb-helper/logcat-stop?deviceId=${encodeURIComponent(payload.deviceId)}`))
      ?? {
        command: "logcat-stream-state",
        status: "fallback",
        device: payload.deviceId,
        running: (fallbackLogcatRunning = false),
        bufferedLines: fallbackLogcatEntries.length,
        droppedLines: 0,
        bufferLimit: 3000,
        items: fallbackLogcatEntries,
        capturedAt: Date.now(),
        outputDir: fallbackLogcatConfig.outputDir,
        currentFilePath: `${fallbackLogcatConfig.outputDir}/logcat_20260520091520.txt`,
        savedFileCount: 1,
        maxFileSizeBytes: fallbackLogcatConfig.maxFileSizeMb * 1024 * 1024,
        clearBeforeStart: fallbackLogcatConfig.clearBeforeStart,
        message: "浏览器预览态已停止示例日志捕获。"
      },
    state: async (payload: { deviceId: string }) =>
      (await fetchDevApi<unknown>(`/api/adb-helper/logcat-state?deviceId=${encodeURIComponent(payload.deviceId)}`))
      ?? {
        command: "logcat-stream-state",
        status: "fallback",
        device: payload.deviceId,
        running: fallbackLogcatRunning,
        bufferedLines: fallbackLogcatEntries.length,
        droppedLines: 0,
        bufferLimit: 3000,
        items: fallbackLogcatEntries,
        capturedAt: Date.now(),
        outputDir: fallbackLogcatConfig.outputDir,
        currentFilePath: `${fallbackLogcatConfig.outputDir}/logcat_20260520091520.txt`,
        savedFileCount: 1,
        maxFileSizeBytes: fallbackLogcatConfig.maxFileSizeMb * 1024 * 1024,
        clearBeforeStart: fallbackLogcatConfig.clearBeforeStart,
        message: fallbackLogcatRunning ? "浏览器预览态正在展示示例日志。" : "浏览器预览态当前未开始日志捕获。"
      },
    export: async (payload: { deviceId: string }) =>
      (await fetchDevApi<unknown>(`/api/adb-helper/logcat-export?deviceId=${encodeURIComponent(payload.deviceId)}`))
      ?? {
        command: "logcat-export",
        status: "fallback",
        device: payload.deviceId,
        fileName: "logcat_preview_download.txt",
        contentText: `${fallbackLogcatEntries.map((entry) => entry.raw).join("\n")}\n`,
        mimeType: "text/plain;charset=utf-8",
        fileCount: 1,
        message: "浏览器预览态返回示例日志下载内容。",
      },
    updateFilters: async (payload: { deviceId: string; filters?: LogcatCaptureFiltersPayload }) =>
      (await postDevApi<unknown>("/api/adb-helper/logcat-update-filters", payload))
      ?? {
        command: "logcat-stream-state",
        status: "fallback",
        device: payload.deviceId,
        running: fallbackLogcatRunning,
        bufferedLines: 0,
        droppedLines: 0,
        bufferLimit: 3000,
        items: [],
        capturedAt: Date.now(),
        startedAt: Date.now(),
        outputDir: fallbackLogcatConfig.outputDir,
        currentFilePath: `${fallbackLogcatConfig.outputDir}/logcat_20260520091520.txt`,
        savedFileCount: 1,
        maxFileSizeBytes: fallbackLogcatConfig.maxFileSizeMb * 1024 * 1024,
        clearBeforeStart: fallbackLogcatConfig.clearBeforeStart,
        message: "浏览器预览态已按当前筛选条件重建示例日志窗口。"
      },
    clear: async (payload: { deviceId: string; filters?: LogcatCaptureFiltersPayload }) =>
      (await postDevApi<unknown>("/api/adb-helper/logcat-clear", payload))
      ?? {
        command: "logcat-stream-state",
        status: "fallback",
        device: payload.deviceId,
        running: fallbackLogcatRunning,
        bufferedLines: 0,
        droppedLines: 0,
        bufferLimit: 3000,
        items: [],
        capturedAt: Date.now(),
        startedAt: Date.now(),
        outputDir: fallbackLogcatConfig.outputDir,
        currentFilePath: `${fallbackLogcatConfig.outputDir}/logcat_20260520091520.txt`,
        savedFileCount: 1,
        maxFileSizeBytes: fallbackLogcatConfig.maxFileSizeMb * 1024 * 1024,
        clearBeforeStart: fallbackLogcatConfig.clearBeforeStart,
        message: fallbackLogcatRunning ? "浏览器预览态已清空设备日志并继续示例捕获。" : "浏览器预览态已清空示例日志。"
      },
    config: async () =>
      (await fetchDevApi<unknown>("/api/adb-helper/logcat-config"))
      ?? fallbackLogcatConfig,
    packageList: async (payload: { deviceId: string }) =>
      (await fetchDevApi<unknown>(`/api/adb-helper/logcat-package-list?deviceId=${encodeURIComponent(payload.deviceId)}`))
      ?? {
        command: "logcat-package-list",
        status: "fallback",
        device: payload.deviceId,
        items: [...new Set(fallbackLogcatEntries.map((entry) => entry.packageName).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
      },
    processList: async (payload: { deviceId: string }) =>
      (await fetchDevApi<unknown>(`/api/adb-helper/logcat-process-list?deviceId=${encodeURIComponent(payload.deviceId)}`))
      ?? {
        command: "logcat-process-list",
        status: "fallback",
        device: payload.deviceId,
        items: fallbackLogcatEntries
          .map((entry) => ({ pid: entry.pid, name: entry.packageName || entry.tag || entry.pid }))
          .filter((item, index, items) => item.pid && items.findIndex((candidate) => candidate.pid === item.pid) === index),
      },
    updateConfig: async (payload: { outputDir: string; maxFileSizeMb: number; clearBeforeStart: boolean; displayLineLimit: number; refreshIntervalMs: number; defaultRegexEnabled: boolean; defaultLevels: string[] }) => {
      const devResponse = await postDevApi<unknown>("/api/adb-helper/logcat-config-save", payload);
      if (devResponse) {
        return devResponse;
      }

      fallbackLogcatConfig = {
        outputDir: payload.outputDir || DEFAULT_LOGCAT_OUTPUT_DIR,
        maxFileSizeMb: Math.max(payload.maxFileSizeMb || 10, 1),
        clearBeforeStart: Boolean(payload.clearBeforeStart),
        displayLineLimit: Math.max(Math.min(payload.displayLineLimit || 3000, 3000), 200),
        refreshIntervalMs: normalizeLogcatRefreshIntervalMs(payload.refreshIntervalMs),
        defaultRegexEnabled: Boolean(payload.defaultRegexEnabled),
        defaultLevels: normalizeLogcatLevelSelection(payload.defaultLevels),
        message: "浏览器预览态未真正写入日志捕获规则。"
      };
      return {
        command: "logcat-config-save",
        status: "fallback",
        ...fallbackLogcatConfig,
      };
    }
  },
  scrcpy: {
    config: async (payload: { deviceId: string; displayId: number }) =>
      (await fetchDevApi<unknown>(`/api/adb-helper/scrcpy-config?deviceId=${encodeURIComponent(payload.deviceId)}&displayId=${payload.displayId}`))
      ?? {
        command: "scrcpy-config",
        status: "fallback",
        device: payload.deviceId,
        displayId: payload.displayId,
        scrcpyAvailable: true,
        config: { maxSize: 0, windowX: 120, windowY: 120, windowWidth: 0, windowHeight: 0 },
      },
    updateConfig: async (payload: { deviceId: string; displayId: number; maxSize: number; windowX: number; windowY: number; windowWidth: number; windowHeight: number }) =>
      (await postDevApi<unknown>("/api/adb-helper/scrcpy-config-save", payload))
      ?? {
        command: "scrcpy-config-save",
        status: "fallback",
        device: payload.deviceId,
        displayId: payload.displayId,
        scrcpyAvailable: true,
        config: {
          maxSize: payload.maxSize,
          windowX: payload.windowX,
          windowY: payload.windowY,
          windowWidth: payload.windowWidth,
          windowHeight: payload.windowHeight,
        },
        message: "浏览器预览态已保存 scrcpy 配置草稿。",
      },
    launch: async (payload: { deviceId: string; displayId: number }) =>
      (await postDevApi<unknown>("/api/adb-helper/scrcpy-launch", payload))
      ?? {
        command: "scrcpy-launch",
        status: "fallback",
        device: payload.deviceId,
        displayId: payload.displayId,
        scrcpyAvailable: true,
        executedCommand: `scrcpy --serial ${payload.deviceId} --display-id ${payload.displayId}`,
        message: `浏览器预览态已模拟启动 Display ${payload.displayId} 的 scrcpy。`,
      },
    syncWindow: async (payload: { deviceId: string; displayId: number }) =>
      (await postDevApi<unknown>("/api/adb-helper/scrcpy-sync-window", payload))
      ?? {
        command: "scrcpy-sync-window",
        status: "fallback",
        device: payload.deviceId,
        displayId: payload.displayId,
        scrcpyAvailable: true,
        config: { maxSize: 0, windowX: 240, windowY: 120, windowWidth: 960, windowHeight: 540 },
        message: `浏览器预览态已按 Display ${payload.displayId} 当前窗口位置回填配置。`,
      }
  },
  backup: {
    info: async (deviceId: string) =>
      (await fetchDevApi<unknown>(`/api/adb-helper/backup-info?deviceId=${encodeURIComponent(deviceId)}`))
      ?? {
        command: "backup-info",
        status: "fallback",
        device: deviceId,
        versionName: "preview-build",
        androidVersion: "Android 预览态",
        backupRoot: fallbackBackupConfig.backupRoot,
        currentBackupDir: `${fallbackBackupConfig.backupRoot ?? BACKUP_ROOT_PATH}/preview-build`,
        availableBackupVersions: ["preview-build"],
        hasCurrentBackup: false,
        lastUpdatedAt: null,
        backupPaths: fallbackBackupConfig.backupPaths,
        restorePaths: fallbackBackupConfig.restorePaths,
        message: "浏览器预览态不会真正执行备份与恢复。"
      },
    config: async () =>
      (await fetchDevApi<unknown>("/api/adb-helper/backup-config"))
      ?? fallbackBackupConfig,
    updateConfig: async (payload: { versionProp: string; backupRoot: string; backupPaths: string[]; restorePaths: string[] }) => {
      const devResponse = await postDevApi<unknown>("/api/adb-helper/backup-config-save", payload);
      if (devResponse) {
        return devResponse;
      }

      const previousBackupRoot = fallbackBackupConfig.backupRoot ?? BACKUP_ROOT_PATH;
      const nextConfig: BackupConfig = {
        ...payload,
        backupRoot: payload.backupRoot || BACKUP_ROOT_PATH,
        previousBackupRoot,
        rootChanged: previousBackupRoot !== (payload.backupRoot || BACKUP_ROOT_PATH),
        migrationAvailable: true,
        message: "浏览器预览态未真正写入备份规则。"
      };
      fallbackBackupConfig = nextConfig;
      return {
        command: "backup-config-save",
        status: "fallback",
        ...nextConfig,
      };
    },
    migrate: async (payload: { sourceRoot: string; targetRoot: string }) =>
      (await postDevApi<unknown>("/api/adb-helper/backup-migrate", payload))
      ?? {
        command: "backup-migrate",
        status: "fallback",
        sourceRoot: payload.sourceRoot,
        targetRoot: payload.targetRoot,
        message: `浏览器预览态未真正将旧备份从 ${payload.sourceRoot} 迁移到 ${payload.targetRoot}。`
      },
    create: async (payload: { deviceId: string; paths?: string[] }) =>
      (await postDevApi<unknown>("/api/adb-helper/backup-create", payload))
      ?? {
        command: "backup-create",
        status: "fallback",
        currentBackupDir: `${fallbackBackupConfig.backupRoot ?? BACKUP_ROOT_PATH}/preview-build`,
        message: `浏览器预览态未真正为 ${payload.deviceId} 执行备份。`,
        steps: ["仅展示页面结构，未实际调用 adb。"]
      },
    restore: async (payload: { deviceId: string; paths?: string[] }) =>
      (await postDevApi<unknown>("/api/adb-helper/backup-restore", payload))
      ?? {
        command: "backup-restore",
        status: "fallback",
        currentBackupDir: `${fallbackBackupConfig.backupRoot ?? BACKUP_ROOT_PATH}/preview-build`,
        message: `浏览器预览态未真正为 ${payload.deviceId} 执行恢复。`,
        steps: ["仅展示页面结构，未实际调用 adb。"]
      },
    openDirectory: async (payload: { versionName: string }) =>
      (await postDevApi<unknown>("/api/adb-helper/backup-open", payload))
      ?? {
        command: "backup-open",
        status: "fallback",
        path: `${fallbackBackupConfig.backupRoot ?? BACKUP_ROOT_PATH}/${payload.versionName}`,
        message: `浏览器预览态未真正打开目录 ${payload.versionName}。`
      },
    deleteVersion: async (payload: { versionName: string }) =>
      (await postDevApi<unknown>("/api/adb-helper/backup-delete", payload))
      ?? {
        command: "backup-delete",
        status: "fallback",
        versionName: payload.versionName,
        message: `浏览器预览态未真正删除目录 ${payload.versionName}。`
      }
  },
  result: {
    export: async (payload) => ({
      recordId: payload.recordId,
      format: payload.format,
      status: "fallback",
      path: `exports/${payload.recordId}.${payload.format === "markdown" ? "md" : payload.format}`
    })
  },
  layout: {
    dumpUiTree: async (payload: { deviceId: string }) => {
      const r = await fetchDevApi<{ status: string; xml?: string; message?: string }>(`/api/adb-helper/layout-dump-ui-tree?deviceId=${encodeURIComponent(payload.deviceId)}`);
      return r ?? { status: "fallback", xml: "", message: "浏览器 API 不可用" };
    },
    screenshot: async (payload: { deviceId: string }) => {
      const r = await fetchDevApi<{ status: string; dataUrl?: string }>(`/api/adb-helper/layout-screenshot?deviceId=${encodeURIComponent(payload.deviceId)}`);
      return r ?? { status: "fallback", dataUrl: "", message: "浏览器 API 不可用" };
    },
    getWinscopePath: async () => ({
      status: "error" as const,
      path: "",
      message: "Winscope 不可用（浏览器预览态）"
    }),
    winscopeProxy: async () => ({
      status: "fallback" as const,
      token: "",
      message: "浏览器预览态不支持"
    }),
    popoutPanel: async (_payload: { panelId: number; title: string }) => ({
      status: "fallback" as const
    }),
    listProcesses: async (payload: { deviceId: string }) => {
      const r = await fetchDevApi<{ status: string; processes?: { pid: string; name: string }[] }>(`/api/adb-helper/layout-list-processes?deviceId=${encodeURIComponent(payload.deviceId)}`);
      return r ?? { status: "fallback", processes: [] };
    },
    setPopoutState: async (_payload: { uiTreeXml: string; screenshotDataUrl: string; deviceId: string; selectedPath?: string }) => ({
      status: "fallback" as const
    }),
    updatePopoutSelection: async (_payload: { selectedPath: string | null }) => ({
      status: "fallback" as const
    }),
    getPopoutState: async () => ({
      status: "fallback" as const,
      uiTreeXml: "",
      screenshotDataUrl: "",
      deviceId: ""
    })
  },
  panels: {
    load: async () => (await fetchDevApi<{ status: string; panels: unknown }>("/api/adb-helper/panels-load")) ?? { status: "ok", panels: null },
    save: async (payload: { panels: unknown }) => (await postDevApi<{ status: string }>("/api/adb-helper/panels-save", payload)) ?? { status: "ok" }
  },
  macroTasks: {
    load: async () => (await fetchDevApi<{ status: string; tasks: unknown }>("/api/adb-helper/macro-tasks-load")) ?? { status: "ok", tasks: null },
    save: async (payload: { tasks: unknown }) => (await postDevApi<{ status: string }>("/api/adb-helper/macro-tasks-save", payload)) ?? { status: "ok" }
  },
  screen: {
    capture: async (payload: { deviceId: string; displayId?: number; savePath?: string }) => (await fetchDevApi<{ status: string; dataUrl?: string; savedPath?: string }>(`/api/adb-helper/screen-capture?deviceId=${encodeURIComponent(payload.deviceId)}&displayId=${payload.displayId ?? 0}`)) ?? { status: "error", message: "请求失败" },
    startRecord: async (payload: { deviceId: string; displayId?: number }) => (await postDevApi<{ status: string; remotePath?: string }>("/api/adb-helper/screen-start-record", payload)) ?? { status: "error", message: "请求失败" },
    stopRecord: async (payload: { deviceId: string }) => (await postDevApi<{ status: string; localPath?: string }>("/api/adb-helper/screen-stop-record", payload)) ?? { status: "error", message: "请求失败" }
  }
};
