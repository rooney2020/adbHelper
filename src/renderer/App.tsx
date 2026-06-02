import { Fragment, Suspense, lazy, memo, startTransition, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { buildCommandString, categories, createDefaultParamValues, type CommandMeta, type CommandParam, type FilterKey } from "./lib/catalog";
import { fallbackApi, matchesFilter, normalizeLogcatRefreshIntervalMs, normalizeLogcatLevelSelection, fetchDevApi, postDevApi } from "./lib/fallbackApi";
import { renderOutputPreview, renderDiffText, buildDiffRows, buildDiffSegments, getResultPrimaryCommand, getDiffRecordMeta, countOutputLines, copyText, buildExportBaseName, downloadTextFile, downloadBlobFile, decodeBase64ToBlob, buildMarkdownExport, buildTextExport, resolveDiffTarget, highlightText, wrapInMarkdownCodeBlock, historyItemToRunResult } from "./lib/outputRenderers";

const BackupPage = lazy(() => import("./pages/BackupPage"));
const CommandPage = lazy(() => import("./pages/CommandPage"));
const DumpsysPage = lazy(() => import("./pages/DumpsysPage"));
const InfoPage = lazy(() => import("./pages/InfoPage"));
const KeySimPage = lazy(() => import("./pages/KeySimPage"));
const LayoutPage = lazy(() => import("./pages/LayoutPage"));
const LogcatPage = lazy(() => import("./pages/LogcatPage"));
const MonkeyPage = lazy(() => import("./pages/MonkeyPage"));
const PerformancePage = lazy(() => import("./pages/PerformancePage"));

const filters: Array<{ id: FilterKey; label: string }> = [
  { id: "all", label: "全部" },
  { id: "view", label: "查看型" },
  { id: "write", label: "写操作" },
  { id: "risk", label: "高风险" },
  { id: "favorite", label: "已收藏" }
];

const resultTabs = ["structured", "raw", "diff", "history"] as const;
type ResultTab = (typeof resultTabs)[number];
type MainView = "command" | "info" | "backup" | "logcat" | "keysim" | "layout" | "dumpsys" | "monkey" | "performance";
type DeviceInfoTab = "basic" | "files" | "apps" | "users" | "processes" | "screen";
type KeySimTab = "quick" | "visual" | "multitouch" | "macro" | "record";
type LayoutViewerTab = "winscope" | "inspector";
type DumpsysTab = "performance" | "battery" | "launch" | "activity" | "window" | "display" | "input" | "power" | "SurfaceFlinger" | "meminfo" | "cpuinfo" | "package" | "connectivity" | "wifi" | "bluetooth_manager" | "audio" | "usb" | "notification" | "procstats" | "alarm";
type DiffTargetId = "current" | string;
type DiffDropdownSide = "left" | "right";
type HistoryDetailTab = "structured" | "raw";
type LogcatRuleField = "message" | "tag" | "pid" | "tid" | "package";
type LogcatRuleJoiner = "and" | "or";
const HISTORY_FETCH_LIMIT = 500;
const BACKUP_ROOT_PATH = "/home/tsdl/ssd/ingo/backup";
const DEFAULT_LOGCAT_OUTPUT_DIR = "/home/tsdl/ssd/ingo/logcat";
const DEFAULT_LOGCAT_REFRESH_INTERVAL_MS = 300;
const MIN_LOGCAT_REFRESH_INTERVAL_MS = 100;
const MAX_LOGCAT_REFRESH_INTERVAL_MS = 5000;
const LOGCAT_VIRTUAL_OVERSCAN = 20;
const LOGCAT_VIRTUAL_ROW_HEIGHT = 28;
const LOGCAT_VIRTUAL_WRAP_ROW_HEIGHT = 80;
const INITIAL_VISIBLE_DEVICE_APPS = 120;
const INITIAL_VISIBLE_DEVICE_PROCESSES = 160;
const DEVICE_INFO_LOAD_MORE_STEP = 120;
const HISTORY_PAGE_SIZE = 20;
const DEFAULT_DEVICE_FILE_PATH = "/";

const MAIN_VIEWS: Array<{ id: MainView; label: string }> = [
  { id: "command", label: "命令" },
  { id: "logcat", label: "日志捕获" },
  { id: "keysim", label: "按键模拟" },
  { id: "layout", label: "布局查看器" },
  { id: "monkey", label: "Monkey" },
  { id: "performance", label: "性能测试" },
  { id: "dumpsys", label: "Dumpsys" },
  { id: "info", label: "设备信息" },
  { id: "backup", label: "备份与恢复" },
];

const KEY_SIM_TABS: Array<{ id: KeySimTab; label: string; description: string }> = [
  { id: "quick", label: "常用快捷栏", description: "Home、Back、电源和音量键等一键触发" },
  { id: "macro", label: "按键编排", description: "将多步动作按时序组合并一键执行" },
  { id: "record", label: "宏命令", description: "待开发" },
];

const KEY_SIM_DEFAULT_QUICK_ACTIONS: KeySimQuickAction[] = [
  { id: "quick-home", name: "Home", type: "key", value: "KEYCODE_HOME", size: "1x1", pressMode: "tap", durationMs: "500" },
  { id: "quick-back", name: "Back", type: "key", value: "KEYCODE_BACK", size: "1x1", pressMode: "tap", durationMs: "500" },
  { id: "quick-recent", name: "Recent Apps", type: "key", value: "KEYCODE_APP_SWITCH", size: "1x1", pressMode: "tap", durationMs: "500" },
  { id: "quick-power", name: "电源键", type: "key", value: "KEYCODE_POWER", size: "1x1", pressMode: "tap", durationMs: "500" },
  { id: "quick-volup", name: "音量+", type: "key", value: "KEYCODE_VOLUME_UP", size: "1x1", pressMode: "tap", durationMs: "500" },
  { id: "quick-voldown", name: "音量-", type: "key", value: "KEYCODE_VOLUME_DOWN", size: "1x1", pressMode: "tap", durationMs: "500" },
  { id: "quick-mute", name: "静音", type: "key", value: "KEYCODE_MUTE", size: "1x1", pressMode: "tap", durationMs: "500" },
  { id: "quick-menu", name: "菜单", type: "key", value: "KEYCODE_MENU", size: "1x1", pressMode: "tap", durationMs: "500" },
];

const KEY_SIM_QUICK_TYPE_DEFAULTS: Record<KeySimQuickActionType, string> = {
  key: "KEYCODE_HOME",
  tap: "540,1800",
  swipe: "540,1800,540,600,300",
  multitouch: "200,1200,200,400,300;880,1200,880,400,300",
};

const KEY_SIM_KNOWN_KEYCODES = [
  "KEYCODE_HOME",
  "KEYCODE_BACK",
  "KEYCODE_APP_SWITCH",
  "KEYCODE_POWER",
  "KEYCODE_VOLUME_UP",
  "KEYCODE_VOLUME_DOWN",
  "KEYCODE_MENU",
  "KEYCODE_ENTER",
  "KEYCODE_DPAD_CENTER",
  "KEYCODE_ESCAPE",
] as const;

const DEVICE_INFO_TABS: Array<{ id: DeviceInfoTab; label: string; description: string }> = [
  { id: "basic", label: "基础信息", description: "设备概览、版本和探测字段" },
  { id: "files", label: "文件系统", description: "浏览目录、上传下载、授权和删除设备文件" },
  { id: "apps", label: "应用列表", description: "包名、安装用户、安装包位置与组件详情" },
  { id: "users", label: "用户信息", description: "用户状态、用户上限和 passenger 配置" },
  { id: "processes", label: "进程信息", description: "当前设备所有进程及其归属包名" },
  { id: "screen", label: "截屏录屏", description: "对设备进行截屏或录屏操作" },
];

const LOGCAT_LEVEL_OPTIONS = ["V", "D", "I", "W", "E", "F"] as const;
const LOGCAT_LEVEL_LABELS: Record<(typeof LOGCAT_LEVEL_OPTIONS)[number], string> = {
  V: "Verbose",
  D: "Debug",
  I: "Info",
  W: "Warning",
  E: "Error",
  F: "Fatal",
};
const LOGCAT_RULE_FIELD_OPTIONS: Array<{ value: LogcatRuleField; label: string }> = [
  { value: "message", label: "message 过滤" },
  { value: "tag", label: "tag 过滤" },
  { value: "pid", label: "PID 过滤" },
  { value: "tid", label: "TID 过滤" },
  { value: "package", label: "package 过滤" }
];

const PROBE_FIELD_LABELS: Record<string, string> = {
  "summary.id": "设备序列号",
  "summary.name": "设备名称",
  "summary.status": "连接状态",
  "summary.androidVersion": "系统版本",
  "summary.state": "设备状态",
  "summary.product": "产品代号",
  "summary.model": "型号代号",
  "summary.device": "设备代号",
  "summary.transportId": "传输编号",
  "properties.manufacturer": "厂商",
  "properties.model": "设备型号",
  "properties.androidVersion": "Android 版本",
  "properties.sdk": "SDK 级别",
  "properties.displayId": "版本号",
  "properties.buildFingerprint": "构建指纹"
};

interface KeySimFingerPath {
  id: string;
  startX: string;
  startY: string;
  endX: string;
  endY: string;
  durationMs: string;
}

type KeySimQuickActionType = "key" | "tap" | "swipe" | "multitouch";

interface KeySimQuickAction {
  id: string;
  name: string;
  type: KeySimQuickActionType;
  value: string;
  size: "1x1" | "2x1" | "2x2";
  pressMode: "tap" | "long";
  durationMs: string;
}

type KeySimMacroStepType = "key" | "tap" | "swipe" | "adb";

interface KeySimMacroStep {
  id: string;
  type: KeySimMacroStepType;
  name: string;
  value: string;
  delayMs: string;
}

interface KeySimMacroTask {
  id: string;
  name: string;
  steps: KeySimMacroStep[];
}

const KEY_SIM_DEFAULT_MACRO_STEPS: KeySimMacroStep[] = [
  { id: "macro-1", type: "key", name: "回到桌面", value: "KEYCODE_HOME", delayMs: "300" },
];

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

interface RunResult {
  command: string;
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
}

interface DiffTextSegment {
  text: string;
  changed: boolean;
}

interface DiffLineRow {
  leftLineNumber: number | null;
  rightLineNumber: number | null;
  leftText: string;
  rightText: string;
  leftSegments: DiffTextSegment[];
  rightSegments: DiffTextSegment[];
  kind: "same" | "changed" | "added" | "removed";
}

interface DiffOption {
  id: DiffTargetId;
  commandText: string;
  deviceName: string;
  timeText: string;
}

interface ParsedDeviceEntry {
  serial: string;
  state: string;
  metadata: Record<string, string>;
}

interface BackupDirectoryEntry {
  versionName: string;
  path: string;
  status: string;
  missingPaths: string[];
  lastUpdatedAt?: number | null;
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

interface BackupInfo {
  command: string;
  status: string;
  message?: string;
  device?: string;
  deviceSummary?: DeviceSummary;
  versionName?: string;
  androidVersion?: string;
  backupRoot?: string;
  currentBackupDir?: string;
  versionProp?: string;
  availableBackupVersions?: string[];
  availableBackups?: BackupDirectoryEntry[];
  hasCurrentBackup?: boolean;
  currentBackupStatus?: string;
  currentBackupMissingPaths?: string[];
  lastUpdatedAt?: number | null;
  backupPaths?: string[];
  restorePaths?: string[];
}

interface BackupActionResult {
  command: string;
  status: string;
  message?: string;
  currentBackupDir?: string;
  versionName?: string;
  sourceRoot?: string;
  targetRoot?: string;
  results?: Array<{ path: string; status: string; message: string }>;
  steps?: string[];
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

interface LogcatStreamState {
  command: string;
  status: string;
  message?: string;
  device?: string;
  running?: boolean;
  bufferedLines?: number;
  droppedLines?: number;
  bufferLimit?: number;
  startedAt?: number;
  capturedAt?: number;
  outputDir?: string;
  currentFilePath?: string;
  savedFileCount?: number;
  maxFileSizeBytes?: number;
  clearBeforeStart?: boolean;
  items?: LogcatEntry[];
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

interface LogcatExportResult {
  command?: string;
  status?: string;
  message?: string;
  device?: string;
  fileName?: string;
  contentText?: string;
  contentBase64?: string;
  mimeType?: string;
  fileCount?: number;
}

interface LogcatPackageCatalog {
  command?: string;
  status?: string;
  message?: string;
  device?: string;
  items?: string[];
}

interface LogcatProcessItem {
  pid: string;
  name: string;
}

interface LogcatProcessCatalog {
  command?: string;
  status?: string;
  message?: string;
  device?: string;
  items?: LogcatProcessItem[];
}

interface DeviceDisplayItem {
  displayId: number;
  type: string;
  label: string;
  uniqueId: string;
  active: boolean;
  valid: boolean;
  orientation: number;
  logicalWidth: number;
  logicalHeight: number;
  deviceWidth: number;
  deviceHeight: number;
  state: string;
}

interface DeviceDisplayCatalog {
  command?: string;
  status?: string;
  message?: string;
  device?: string;
  scrcpyAvailable?: boolean;
  items?: DeviceDisplayItem[];
}

interface ScrcpyDisplayConfig {
  maxSize: number;
  windowX: number;
  windowY: number;
  windowWidth: number;
  windowHeight: number;
}

interface ScrcpyConfigResponse {
  command?: string;
  status?: string;
  message?: string;
  device?: string;
  displayId?: number;
  scrcpyAvailable?: boolean;
  executedCommand?: string;
  config?: ScrcpyDisplayConfig;
}

interface LogcatFilterRule {
  id: string;
  field: LogcatRuleField;
  joiner: LogcatRuleJoiner;
  value: string;
}

interface LogcatCaptureFiltersPayload {
  searchTerm: string;
  regexEnabled: boolean;
  rules: Array<{ field: LogcatRuleField; joiner: LogcatRuleJoiner; value: string }>;
  levels: string[];
}

type LogcatPickerState =
  | { kind: "package"; ruleId: string }
  | { kind: "pid"; ruleId: string }
  | null;

interface PermissionSection {
  title: string;
  groups: string[];
  permissions: string[];
}

interface GeneralSettingsRules {
  closeSettingsOnSave: boolean;
  apkExportMode: "fixed-directory" | "custom-directory";
  apkExportDirectory: string;
}

interface SavedRemoteDeviceConfig {
  id: string;
  name: string;
  host: string;
  port: string;
  pairHost: string;
  pairPort: string;
}

interface RemoteDeviceDialogState {
  id: string;
  name: string;
  host: string;
  port: string;
  pairMode: "direct" | "manual";
  pairHost: string;
  pairPort: string;
  pairingCode: string;
  saveConfig: boolean;
  busy: "connect" | "pair-connect" | "save" | "discover" | null;
  notice: string | null;
}

interface RemoteDebugServiceCandidate {
  name: string;
  host: string;
  port: string;
  kind: "connect" | "pairing";
}

interface AdbHealthCheckState {
  busy: boolean;
  summary: string;
  steps: Array<{ label: string; tone: "success" | "warning" | "error"; detail: string }>;
}

interface InlineActionResult {
  tone: "info" | "success" | "warning" | "error";
  message: string;
  path?: string;
}

interface ToastNotice {
  id: number;
  tone: "info" | "success" | "warning" | "error";
  message: string;
  actionLabel?: string;
  actionPath?: string;
}

interface ConfirmDialogState {
  title: string;
  message: string;
  tone: "warning" | "danger";
  confirmLabel: string;
}

interface DeviceAppItem {
  packageName: string;
  apkPath: string;
  uid: string;
  installedUsers: number[];
  requestedPermissions: string[];
  isSystemApp: boolean;
}

interface DeviceAppCatalog {
  command?: string;
  status?: string;
  message?: string;
  device?: string;
  items?: DeviceAppItem[];
}

interface DeviceAppComponentDetail {
  name: string;
  componentType: string;
  actions: string[];
  categories: string[];
  mimeTypes: string[];
  schemes: string[];
  authorities: string[];
  paths: string[];
  rawLines: string[];
}

interface DeviceAppDetail {
  packageName: string;
  apkPath: string;
  versionCode: string;
  versionName: string;
  uid: string;
  dataDir: string;
  firstInstallTime: string;
  lastUpdateTime: string;
  installedUsers: number[];
  requestedPermissions: string[];
  disabledComponents: string[];
  activities: string[];
  services: string[];
  receivers: string[];
  providers: string[];
  componentDetails: Record<string, DeviceAppComponentDetail>;
}

interface DeviceAppDetailResponse {
  command?: string;
  status?: string;
  message?: string;
  device?: string;
  detail?: DeviceAppDetail;
  packageName?: string;
}

interface DeviceUserSummary {
  currentUserId?: number | string | null;
  deviceOwnerId?: string | null;
  maxUsers?: number | string | null;
  supportsSwitchableUsers?: string | null;
  allGuestsEphemeral?: string | null;
  forceEphemeralUsers?: string | null;
  isHeadlessSystemMode?: string | null;
  ownerName?: string | null;
  startedUsersState?: string | null;
  cachedUserIds?: string | null;
  cachedUserIdsIncludingPreCreated?: string | null;
  guestRestrictions?: string[];
}

interface DeviceUserInfo {
  id: number;
  name: string;
  flagsValue: number;
  preCreated: boolean;
  running: boolean;
  serialNo: string;
  isPrimary: boolean;
  type: string;
  flags: string;
  state: string;
  created: string;
  lastLoggedIn: string;
  startTime: string;
  unlockTime: string;
  hasProfileOwner: string;
  restrictions: string[];
  globalRestrictions: string[];
  localRestrictions: string[];
  effectiveRestrictions: string[];
}

interface PassengerConfigItem {
  source: string;
  key: string;
  value: string;
}

interface CarServicePassengerSnapshot {
  enablePassengerSupport: string;
  numberOfDrivers: string;
  driverAssignments: string[];
  occupantsConfig: string[];
  displayConfigs: string[];
  activeOccupantConfigs: string[];
}

interface DeviceUsersResponse {
  command?: string;
  status?: string;
  message?: string;
  device?: string;
  summary?: DeviceUserSummary;
  users?: DeviceUserInfo[];
  passengerConfig?: PassengerConfigItem[];
  carServicePassenger?: CarServicePassengerSnapshot;
}

interface DeviceProcessListItem {
  user: string;
  userId: number | null;
  pid: string;
  ppid: string;
  name: string;
  args: string;
  packageName: string;
  kernelThread: boolean;
  appProcess: boolean;
}

interface DeviceProcessCatalog {
  command?: string;
  status?: string;
  message?: string;
  device?: string;
  items?: DeviceProcessListItem[];
}

interface DeviceFileEntry {
  name: string;
  path: string;
  permissions: string;
  owner: string;
  group: string;
  size: string;
  modified: string;
  type: "file" | "directory" | "symlink" | "other";
  linkTarget?: string;
}

function normalizeRemoteFilePath(path: string) {
  const trimmed = path.trim();
  if (!trimmed || trimmed === ".") {
    return DEFAULT_DEVICE_FILE_PATH;
  }
  return trimmed.replace(/\/{2,}/g, "/");
}

function joinRemoteFilePath(basePath: string, childName: string) {
  const normalizedBase = normalizeRemoteFilePath(basePath);
  const normalizedChild = childName.trim().replace(/^\/+/, "");
  if (!normalizedChild) {
    return normalizedBase;
  }
  if (normalizedBase === "/") {
    return `/${normalizedChild}`;
  }
  return `${normalizedBase.replace(/\/+$/, "")}/${normalizedChild}`;
}

function getRemoteParentPath(path: string) {
  const normalized = normalizeRemoteFilePath(path).replace(/\/+$/, "") || "/";
  if (normalized === "/") {
    return "/";
  }
  const index = normalized.lastIndexOf("/");
  if (index <= 0) {
    return "/";
  }
  return normalized.slice(0, index) || "/";
}

function getPathLeaf(path: string) {
  const normalized = path.replace(/\/+$/, "");
  return normalized.split("/").at(-1) || normalized;
}

function parseDeviceFileEntries(output: string | undefined, basePath: string): DeviceFileEntry[] {
  if (!output) {
    return [] as DeviceFileEntry[];
  }

  const seen = new Set<string>();
  const entries = output.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("total ")) {
      return [];
    }

    const tokens = trimmed.split(/\s+/);
    if (tokens.length < 8) {
      return [];
    }

    const permissions = tokens[0] ?? "";
    if (!/^[bcdlps-]/.test(permissions)) {
      return [];
    }
    if (permissions.includes("?")) {
      return [];
    }

    const owner = tokens[2] ?? "";
    const group = tokens[3] ?? "";
    const size = tokens[4] ?? "";
    const androidStyleDate = (tokens[5] ?? "").includes("-");
    const nameIndex = androidStyleDate ? 7 : 8;
    if (tokens.length <= nameIndex) {
      return [];
    }

    const modified = tokens.slice(5, nameIndex).join(" ");
    const rawName = tokens.slice(nameIndex).join(" ");
    let name = rawName;
    let linkTarget: string | undefined;
    if (permissions.startsWith("l") && rawName.includes(" -> ")) {
      [name, linkTarget] = rawName.split(" -> ", 2);
    }
    if (!name || name === "." || name === "..") {
      return [];
    }

    const type: DeviceFileEntry["type"] = permissions.startsWith("d")
      ? "directory"
      : permissions.startsWith("l")
        ? "symlink"
        : permissions.startsWith("-")
          ? "file"
          : "other";
    const path = joinRemoteFilePath(basePath, name);
    if (seen.has(path)) {
      return [];
    }
    seen.add(path);
    return [{ name, path, permissions, owner, group, size, modified, type, linkTarget }];
  });

  return entries.sort((left, right) => {
    if (left.type === right.type) {
      return left.name.localeCompare(right.name, "zh-CN");
    }
    if (left.type === "directory") {
      return -1;
    }
    if (right.type === "directory") {
      return 1;
    }
    return left.name.localeCompare(right.name, "zh-CN");
  });
}

function formatHistoryItem(item: HistoryItem) {
  return [
    item.device_name,
    item.command_title,
    item.executedCommand ?? item.raw ?? "",
    item.stdout ?? "",
    item.stderr ?? "",
    item.message ?? "",
    item.status,
    String(item.exitCode ?? "")
  ].join("\n");
}

function getHistoryTimestamp(item: HistoryItem) {
  if (typeof item.created_at === "number") {
    return item.created_at;
  }

  const suffix = item.record_id.split(":").at(-1);
  const parsed = Number(suffix);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatHistoryTimestamp(item: HistoryItem) {
  const timestamp = getHistoryTimestamp(item);
  if (!timestamp) {
    return "未知时间";
  }

  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}

function formatTimestampText(timestamp?: number | null) {
  if (!timestamp) {
    return "暂无记录";
  }

  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}

function formatInstalledUsers(users: number[] | undefined) {
  if (!users?.length) {
    return "未识别";
  }
  return users.map((userId) => `用户 ${userId}`).join("、");
}

function formatHistoryTimeShort(item: HistoryItem) {
  const timestamp = getHistoryTimestamp(item);
  if (!timestamp) {
    return "未知时间";
  }

  return new Date(timestamp).toLocaleTimeString("zh-CN", { hour12: false });
}

function buildHistoryLabel(item: HistoryItem) {
  return `${formatHistoryTimestamp(item)} · ${item.device_name} · ${item.command_title}`;
}

function buildDiffOptionLabel(commandText: string, deviceName: string, timeText: string) {
  return [commandText, deviceName, timeText].filter(Boolean).join(" · ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countMatches(text: string, query: string) {
  if (!query.trim()) {
    return 0;
  }

  return text.match(new RegExp(escapeRegExp(query), "gi"))?.length ?? 0;
}

function matchesSearch(text: string, query: string) {
  if (!query.trim()) {
    return true;
  }

  return text.toLowerCase().includes(query.trim().toLowerCase());
}

const DeviceAppListButton = memo(function DeviceAppListButton({
  item,
  selected,
  query,
  onSelect,
}: {
  item: DeviceAppItem;
  selected: boolean;
  query: string;
  onSelect: (packageName: string) => void;
}) {
  return (
    <button
      className={`device-info-list-item ${selected ? "active" : ""}`}
      onClick={() => onSelect(item.packageName)}
    >
      <strong>{highlightText(item.packageName, query)}</strong>
      <div className="history-card-meta">
        <span>UID {item.uid}</span>
        <span>{formatInstalledUsers(item.installedUsers)}</span>
        <span>{item.isSystemApp ? "系统应用" : "用户应用"}</span>
        <span>权限 {item.requestedPermissions?.length ?? 0}</span>
      </div>
    </button>
  );
});

const DeviceProcessTableRow = memo(function DeviceProcessTableRow({
  item,
  query,
  onRequestKill,
}: {
  item: DeviceProcessListItem;
  query: string;
  onRequestKill: (item: DeviceProcessListItem) => void;
}) {
  return (
    <div className="device-info-table-row process">
      <span>{highlightText(item.user, query)}</span>
      <span>{highlightText(item.pid, query)}</span>
      <span>{item.ppid}</span>
      <span>{highlightText(item.name, query)}</span>
      <span>{highlightText(item.packageName || "-", query)}</span>
      <span>{highlightText(item.args, query)}</span>
      <button type="button" className="ghost-button compact-button danger-button danger-button-ghost" onClick={() => onRequestKill(item)}>杀死进程</button>
    </div>
  );
});

function formatOutputBlock(title: string, content: string, query: string) {
  return (
    <div className="output-section" key={title}>
      <p className="output-title">{title}</p>
      <pre>{highlightText(content, query)}</pre>
    </div>
  );
}

function renderRawOutputSection(title: string, content: string, query: string) {
  return (
    <div className="output-section" key={title}>
      <p className="output-title">{title}</p>
      <div className="raw-output-block">
        <div className="raw-markdown-block">
          <ReactMarkdown>{wrapInMarkdownCodeBlock(content)}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

function normalizeOutputText(result: RunResult | null) {
  if (!result) {
    return "等待首次执行。请先运行一条 adb 命令。";
  }

  const sections: string[] = [];
  if (result.stdout?.trim()) {
    sections.push(result.stdout.trimEnd());
  }
  if (result.stderr?.trim()) {
    sections.push(result.stderr.trimEnd());
  }

  if (sections.length > 0) {
    return sections.join("\n\n");
  }

  return result.message ?? "命令已执行，但没有返回可展示的输出。";
}

function summarizeOutputToSingleLine(result: RunResult | null) {
  return normalizeOutputText(result)
    .replace(/\s+/g, " ")
    .trim();
}

function parsePathLines(value: string) {
  return Array.from(new Set(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)));
}

function buildDefaultApkPullPath(packageName: string) {
  return `./${packageName.replace(/[^a-zA-Z0-9._-]+/g, "-")}.apk`;
}

function buildApkExportPath(directory: string, packageName: string) {
  const normalizedDirectory = directory.replace(/\/+$/, "");
  return `${normalizedDirectory}/${packageName.replace(/[^a-zA-Z0-9._-]+/g, "-")}.apk`;
}

function isPrivilegedApkPath(path: string) {
  return /^\/(system|system_ext|product|vendor|odm)\//.test(path);
}

function resolveFeedbackTone(status?: string): InlineActionResult["tone"] {
  if (status === "ok") {
    return "success";
  }
  if (status === "error") {
    return "error";
  }
  if (status === "fallback") {
    return "warning";
  }
  return "info";
}

function buildRunFeedback(result: Partial<RunResult>, fallback: string) {
  if (result.status === "error") {
    return result.stderr?.trim() || result.stdout?.trim() || (result.message && result.message !== "adb 命令已执行" ? result.message : "") || fallback;
  }
  if (result.status === "fallback") {
    return result.message || "当前为浏览器预览模式，命令未真正执行。";
  }
  if (result.message && result.message !== "adb 命令已执行") {
    return result.message;
  }
  return fallback;
}

function buildLogcatSearchRegex(pattern: string, enabled: boolean) {
  if (!enabled || !pattern.trim()) {
    return null;
  }

  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

function matchesTextFilter(value: string, filter: string, regexEnabled: boolean) {
  const normalizedFilter = filter.trim();
  if (!normalizedFilter) {
    return true;
  }

  if (regexEnabled) {
    const pattern = buildLogcatSearchRegex(normalizedFilter, true);
    return pattern ? pattern.test(value) : true;
  }

  return value.toLowerCase().includes(normalizedFilter.toLowerCase());
}

function matchesNumericTextFilter(value: string, filter: string, regexEnabled: boolean) {
  const normalizedFilter = filter.trim();
  if (!normalizedFilter) {
    return true;
  }

  if (regexEnabled) {
    const pattern = buildLogcatSearchRegex(normalizedFilter, true);
    return pattern ? pattern.test(value) : true;
  }

  const expectedValues = normalizedFilter
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  if (expectedValues.length > 1) {
    return expectedValues.includes(value);
  }

  return value.toLowerCase().includes(normalizedFilter.toLowerCase());
}

function getLogcatDisplayLineNumber(entry: LogcatEntry, fallbackIndex: number) {
  const parsed = Number(entry.id.split("-").at(-1));
  return Number.isFinite(parsed) ? parsed : fallbackIndex + 1;
}

const LogcatRow = memo(function LogcatRow({ entry, lineNumber, highlightTerm, regexEnabled, onClick }: {
  entry: LogcatEntry;
  lineNumber: number;
  highlightTerm: string;
  regexEnabled: boolean;
  onClick: () => void;
}) {
  return (
    <article className={`logcat-stream-row logcat-stream-row-${entry.level.toLowerCase() || "default"}`} onClick={onClick}>
      <span className="logcat-stream-index">{lineNumber}</span>
      <span className="logcat-stream-time">{entry.timestamp || "--"}</span>
      <span className="logcat-stream-pid">{entry.pid || "--"}</span>
      <span className="logcat-stream-tid">{entry.tid || "--"}</span>
      <span className={`logcat-stream-level logcat-${entry.level.toLowerCase() || "info"}`}>{entry.level || "-"}</span>
      <span className="logcat-stream-tag">{highlightText(entry.tag || entry.packageName || "--", highlightTerm, regexEnabled)}</span>
      <span className="logcat-stream-message">{highlightText(entry.message || entry.raw, highlightTerm, regexEnabled)}</span>
    </article>
  );
});

function matchesLogcatFilterRule(entry: LogcatEntry, rule: LogcatFilterRule, regexEnabled: boolean) {
  if (rule.field === "message") {
    return matchesTextFilter(entry.message, rule.value, regexEnabled);
  }
  if (rule.field === "tag") {
    return matchesTextFilter(entry.tag, rule.value, regexEnabled);
  }
  if (rule.field === "pid") {
    return matchesNumericTextFilter(entry.pid, rule.value, regexEnabled);
  }
  if (rule.field === "tid") {
    return matchesNumericTextFilter(entry.tid, rule.value, regexEnabled);
  }
  return matchesTextFilter(entry.packageName, rule.value, regexEnabled);
}

function createLogcatFilterRule(patch?: Partial<LogcatFilterRule>): LogcatFilterRule {
  return {
    id: `logcat-rule-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    field: "message",
    joiner: "and",
    value: "",
    ...patch,
  };
}

function buildLogcatCaptureFiltersPayload(searchTerm: string, regexEnabled: boolean, rules: LogcatFilterRule[], levels: string[]): LogcatCaptureFiltersPayload {
  return {
    searchTerm,
    regexEnabled,
    rules: rules.map((rule) => ({
      field: rule.field,
      joiner: rule.joiner,
      value: rule.value,
    })),
    levels: normalizeLogcatLevelSelection(levels),
  };
}

function getLogcatRulePlaceholder(field: LogcatRuleField) {
  if (field === "pid") {
    return "例如 1915|2502 或正则";
  }
  if (field === "tid") {
    return "例如 5479|5536 或正则";
  }
  if (field === "package") {
    return "支持包名关键字或正则";
  }
  return "支持关键字或正则";
}

function toggleLogcatLevelValue(currentLevels: string[], level: string) {
  return currentLevels.includes(level) ? currentLevels.filter((item) => item !== level) : [...currentLevels, level];
}

function resolveLogcatLevelPreset(preset: "all" | "none" | "debug-plus" | "info-plus") {
  if (preset === "all") {
    return [...LOGCAT_LEVEL_OPTIONS];
  }
  if (preset === "none") {
    return [] as string[];
  }
  if (preset === "debug-plus") {
    return ["D", "I", "W", "E", "F"];
  }
  return ["I", "W", "E", "F"];
}

function getLogcatLevelTone(level: string) {
  if (level === "E" || level === "F") return "danger";
  if (level === "W") return "warning";
  if (level === "I") return "success";
  return "info";
}

function getLogcatLevelLabel(level: (typeof LOGCAT_LEVEL_OPTIONS)[number]) {
  return LOGCAT_LEVEL_LABELS[level] ?? level;
}

function appendPipeFilterValue(currentValue: string, nextValue: string) {
  const values = currentValue
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!values.includes(nextValue)) {
    values.push(nextValue);
  }

  return values.join("|");
}

function formatRunResultSearchText(result: RunResult | null) {
  if (!result) {
    return "";
  }

  return [
    result.command_title,
    result.command_id,
    result.executedCommand,
    result.raw,
    result.device_name,
    result.status,
    result.message,
    result.stdout,
    result.stderr
  ].filter(Boolean).join("\n");
}




interface PanelCommandBlock {
  id: string;
  commandId: string;
  title: string;
  summary: string;
  params: Record<string, string>;
  rawCommand: string;
}

interface CommandPanelModel {
  id: string;
  name: string;
  description: string;
  commands: PanelCommandBlock[];
}

interface ContextMenuState {
  kind: "panel" | "command";
  targetId: string;
  x: number;
  y: number;
}

interface PanelDialogState {
  mode: "create" | "edit";
  targetId?: string;
  title: string;
  name: string;
  description: string;
}

interface PanelCommandParamDialogState {
  panelId: string;
  blockId: string;
  commandId: string;
  title: string;
  params: Record<string, string>;
  rawCommand: string;
}

type ThemePreset = {
  id: string;
  label: string;
  accent: string;
  vars: Record<string, string>;
};

const allCommands = categories.flatMap((category) => category.commands);
const commandCategoryMap = new Map(categories.flatMap((category) => category.commands.map((cmd) => [cmd.id, category.label])));
const PANEL_STORAGE_KEY = "adb-helper.panels.v1";
const CUSTOM_COMMANDS_STORAGE_KEY = "adb-helper.custom-commands.v1";
const THEME_STORAGE_KEY = "adb-helper.theme.v1";
const GENERAL_SETTINGS_STORAGE_KEY = "adb-helper.general-settings.v1";
const KEYSIM_MACRO_TASKS_STORAGE_KEY = "adb-helper.keysim-macro-tasks.v1";

interface CustomCommandParam {
  key: string;
  label: string;
  required: boolean;
  placeholder: string;
  defaultValue: string;
  flag?: string; // e.g. "-z" for [-z ALGORITHM]
}

interface CustomCommandEntry {
  id: string;
  title: string;
  template: string;
  params: CustomCommandParam[];
}

/**
 * Parse custom command template:
 * <NAME> → required param
 * [--flag] → optional toggle (flag only, no value)
 * [-flag VALUE] → optional param with flag prefix
 * [VALUE] → optional param (no flag)
 */
function parseCustomCommandParams(template: string): CustomCommandParam[] {
  const params: CustomCommandParam[] = [];
  const seen = new Set<string>();

  // Match <REQUIRED>
  for (const match of template.matchAll(/<([^>]+)>/g)) {
    const name = match[1].trim();
    if (seen.has(name)) continue;
    seen.add(name);
    params.push({ key: name, label: name, required: true, placeholder: name, defaultValue: "" });
  }

  // Match [OPTIONAL] patterns
  for (const match of template.matchAll(/\[([^\]]+)\]/g)) {
    const inner = match[1].trim();
    // [-flag VALUE] pattern
    const flagValueMatch = inner.match(/^(-\w+)\s+(.+)$/);
    if (flagValueMatch) {
      const flag = flagValueMatch[1];
      const name = flagValueMatch[2].trim();
      if (seen.has(name)) continue;
      seen.add(name);
      params.push({ key: name, label: name, required: false, placeholder: `${flag} <值>`, defaultValue: "", flag });
      continue;
    }
    // [--flag] toggle pattern (starts with -)
    if (inner.startsWith("-")) {
      if (seen.has(inner)) continue;
      seen.add(inner);
      params.push({ key: inner, label: "启用此选项", required: false, placeholder: inner, defaultValue: inner });
      continue;
    }
    // [VALUE] optional param
    if (seen.has(inner)) continue;
    seen.add(inner);
    params.push({ key: inner, label: inner, required: false, placeholder: inner, defaultValue: "" });
  }

  return params;
}

function loadCustomCommands(): CustomCommandEntry[] {
  try {
    const raw = localStorage.getItem(CUSTOM_COMMANDS_STORAGE_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw) as CustomCommandEntry[];
    // Always re-parse params from template to handle format changes
    return entries.map((entry) => ({
      ...entry,
      params: parseCustomCommandParams(entry.template).map((p) => {
        // Preserve user-configured labels from saved data
        const saved = entry.params?.find((sp: any) => sp.key === p.key || sp.placeholder === p.key || sp.label === p.key);
        return saved?.key ? { ...p, label: saved.label || p.label, defaultValue: saved.defaultValue || p.defaultValue } : p;
      }),
    }));
  } catch { return []; }
}

function saveCustomCommands(commands: CustomCommandEntry[]) {
  localStorage.setItem(CUSTOM_COMMANDS_STORAGE_KEY, JSON.stringify(commands));
}
const REMOTE_DEVICE_STORAGE_KEY = "adb-helper.remote-devices.v1";
const THEME_PRESETS: ThemePreset[] = [
  {
    id: "night-sail",
    label: "夜航",
    accent: "#0f172a",
    vars: {
      "--bg-canvas": "#dcecff",
      "--bg-surface": "rgba(245, 250, 255, 0.92)",
      "--bg-surface-strong": "#ffffff",
      "--text-primary": "#11263a",
      "--text-secondary": "#5c7387",
      "--border-default": "rgba(69, 143, 214, 0.18)",
      "--action-primary": "#2f8cff",
      "--action-secondary": "#e1efff",
      "--success": "#23a787",
      "--warning": "#f1a447",
      "--danger": "#d94c4c"
    }
  },
  {
    id: "mist",
    label: "暖雾",
    accent: "#efe6dc",
    vars: {
      "--bg-canvas": "#f7efe7",
      "--bg-surface": "rgba(255, 251, 246, 0.92)",
      "--bg-surface-strong": "#fffaf4",
      "--text-primary": "#4e3d31",
      "--text-secondary": "#8a7568",
      "--border-default": "rgba(177, 145, 119, 0.18)",
      "--action-primary": "#a1744f",
      "--action-secondary": "#f1e5d8",
      "--success": "#6ea291",
      "--warning": "#d39d5e",
      "--danger": "#c86767"
    }
  },
  {
    id: "spring",
    label: "草木绿",
    accent: "#e4f0e4",
    vars: {
      "--bg-canvas": "#eef8ef",
      "--bg-surface": "rgba(250, 255, 250, 0.92)",
      "--bg-surface-strong": "#ffffff",
      "--text-primary": "#234235",
      "--text-secondary": "#6a8678",
      "--border-default": "rgba(95, 160, 126, 0.18)",
      "--action-primary": "#4d9f73",
      "--action-secondary": "#e4f4ea",
      "--success": "#4d9f73",
      "--warning": "#cb9750",
      "--danger": "#ca6868"
    }
  },
  {
    id: "sky",
    label: "天空蓝",
    accent: "#d6ecff",
    vars: {
      "--bg-canvas": "#eef6fd",
      "--bg-surface": "rgba(255, 255, 255, 0.92)",
      "--bg-surface-strong": "#ffffff",
      "--text-primary": "#153247",
      "--text-secondary": "#5b7488",
      "--border-default": "rgba(29, 134, 217, 0.14)",
      "--action-primary": "#1d86d9",
      "--action-secondary": "#e7f3fb",
      "--success": "#1f9b6d",
      "--warning": "#d9921d",
      "--danger": "#d64545"
    }
  },
  {
    id: "dream-pink",
    label: "梦幻粉",
    accent: "#f8e7f0",
    vars: {
      "--bg-canvas": "#fbf0f6",
      "--bg-surface": "rgba(255, 250, 253, 0.92)",
      "--bg-surface-strong": "#fffafd",
      "--text-primary": "#5a3350",
      "--text-secondary": "#97758d",
      "--border-default": "rgba(210, 127, 173, 0.16)",
      "--action-primary": "#cc7daf",
      "--action-secondary": "#f9e7f0",
      "--success": "#7fbfb8",
      "--warning": "#f1a06c",
      "--danger": "#d96c8f"
    }
  },
  {
    id: "china-red",
    label: "中国红",
    accent: "#8a1020",
    vars: {
      "--bg-canvas": "#f7e9ea",
      "--bg-surface": "rgba(255, 247, 247, 0.92)",
      "--bg-surface-strong": "#fffdfd",
      "--text-primary": "#5d1b25",
      "--text-secondary": "#8d646c",
      "--border-default": "rgba(171, 39, 58, 0.18)",
      "--action-primary": "#a92034",
      "--action-secondary": "#f6dce0",
      "--success": "#bf8743",
      "--warning": "#d9a93a",
      "--danger": "#b22234"
    }
  }
];

function loadStoredThemeId() {
  if (typeof window === "undefined") {
    return "sky";
  }

  const storedThemeId = window.localStorage.getItem(THEME_STORAGE_KEY);
  return THEME_PRESETS.some((theme) => theme.id === storedThemeId) ? storedThemeId ?? "sky" : "sky";
}

function loadGeneralSettingsRules(): GeneralSettingsRules {
  if (typeof window === "undefined") {
    return { closeSettingsOnSave: false, apkExportMode: "custom-directory", apkExportDirectory: "" };
  }

  try {
    const raw = window.localStorage.getItem(GENERAL_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { closeSettingsOnSave: false, apkExportMode: "custom-directory", apkExportDirectory: "" };
    }
    const parsed = JSON.parse(raw) as Partial<GeneralSettingsRules>;
    return {
      closeSettingsOnSave: Boolean(parsed.closeSettingsOnSave),
      apkExportMode: parsed.apkExportMode === "fixed-directory" ? "fixed-directory" : "custom-directory",
      apkExportDirectory: typeof parsed.apkExportDirectory === "string" ? parsed.apkExportDirectory : "",
    };
  } catch {
    return { closeSettingsOnSave: false, apkExportMode: "custom-directory", apkExportDirectory: "" };
  }
}

function loadSavedRemoteDeviceConfigs(): SavedRemoteDeviceConfig[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(REMOTE_DEVICE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const candidate = item as Partial<SavedRemoteDeviceConfig>;
      if (typeof candidate.host !== "string" || typeof candidate.port !== "string") {
        return [];
      }
      const host = candidate.host.trim();
      const port = candidate.port.trim();
      if (!host || !port) {
        return [];
      }
      return [{
        id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : `${host}:${port}`,
        name: typeof candidate.name === "string" ? candidate.name : "",
        host,
        port,
        pairHost: typeof candidate.pairHost === "string" ? candidate.pairHost : "",
        pairPort: typeof candidate.pairPort === "string" ? candidate.pairPort : "",
      }];
    });
  } catch {
    return [];
  }
}

// ─── Layout Inspector: UI Tree Parser ──────────────────────────────────────────

interface UiTreeNode {
  path: string;
  className: string;
  attributes: Record<string, string>;
  children: UiTreeNode[];
}

function parseUiTreeXml(xmlString: string): UiTreeNode[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) return [];

  function parseNode(el: Element, pathPrefix: string, index: number): UiTreeNode {
    const path = `${pathPrefix}/${index}`;
    const attributes: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      attributes[attr.name] = attr.value;
    }
    const className = attributes["class"] || el.tagName;
    const children: UiTreeNode[] = [];
    let childIndex = 0;
    for (const child of Array.from(el.children)) {
      children.push(parseNode(child, path, childIndex));
      childIndex++;
    }
    return { path, className, attributes, children };
  }

  const root = doc.documentElement;
  if (!root) return [];
  if (root.tagName === "hierarchy") {
    const result: UiTreeNode[] = [];
    let idx = 0;
    for (const child of Array.from(root.children)) {
      result.push(parseNode(child, "", idx));
      idx++;
    }
    return result;
  }
  return [parseNode(root, "", 0)];
}

function getUiNodeLabel(node: UiTreeNode): string {
  const resourceId = node.attributes["resource-id"] || "";
  const text = node.attributes["text"] || "";
  const shortClass = node.className.includes(".") ? node.className.split(".").pop()! : node.className;
  let label = shortClass;
  if (resourceId) {
    const shortId = resourceId.includes("/") ? resourceId.split("/").pop()! : resourceId;
    label += ` [${shortId}]`;
  }
  if (text) {
    const truncated = text.length > 20 ? text.slice(0, 20) + "…" : text;
    label += ` "${truncated}"`;
  }
  return label;
}

function getBoundsCenter(boundsStr: string): { x: number; y: number } | null {
  const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return null;
  const x1 = parseInt(match[1], 10);
  const y1 = parseInt(match[2], 10);
  const x2 = parseInt(match[3], 10);
  const y2 = parseInt(match[4], 10);
  return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
}

function parseBoundsRect(boundsStr: string): { x1: number; y1: number; x2: number; y2: number } | null {
  const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return null;
  return { x1: parseInt(match[1], 10), y1: parseInt(match[2], 10), x2: parseInt(match[3], 10), y2: parseInt(match[4], 10) };
}

function findNodeAtPoint(nodes: UiTreeNode[], x: number, y: number, hiddenNodes?: Set<string>): UiTreeNode | null {
  let bestNode: UiTreeNode | null = null;
  let bestArea = Infinity;
  function search(nodeList: UiTreeNode[]) {
    for (const node of nodeList) {
      if (hiddenNodes?.has(node.path)) continue;
      const rect = parseBoundsRect(node.attributes["bounds"] || "");
      if (!rect) continue;
      if (x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2) {
        const area = (rect.x2 - rect.x1) * (rect.y2 - rect.y1);
        if (area < bestArea) {
          bestArea = area;
          bestNode = node;
        }
      }
      search(node.children);
    }
  }
  search(nodes);
  return bestNode;
}

function expandPathToNode(targetPath: string): Set<string> {
  const paths = new Set<string>();
  // Expand all ancestors: /0, /0/1, /0/1/2, etc.
  const parts = targetPath.split("/").filter(Boolean);
  let current = "";
  for (let i = 0; i < parts.length - 1; i++) {
    current += "/" + parts[i];
    paths.add(current);
  }
  return paths;
}

// ────────────────────────────────────────────────────────────────────────────────

function loadStoredMacroTasks(): KeySimMacroTask[] {
  if (typeof window === "undefined") {
    return [{ id: "macro-task-1", name: "默认编排任务", steps: KEY_SIM_DEFAULT_MACRO_STEPS.map((step) => ({ ...step })) }];
  }

  try {
    const raw = window.localStorage.getItem(KEYSIM_MACRO_TASKS_STORAGE_KEY);
    if (!raw) {
      return [{ id: "macro-task-1", name: "默认编排任务", steps: KEY_SIM_DEFAULT_MACRO_STEPS.map((step) => ({ ...step })) }];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [{ id: "macro-task-1", name: "默认编排任务", steps: KEY_SIM_DEFAULT_MACRO_STEPS.map((step) => ({ ...step })) }];
    }
    const tasks = parsed.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const candidate = item as Partial<KeySimMacroTask>;
      if (typeof candidate.id !== "string" || typeof candidate.name !== "string" || !Array.isArray(candidate.steps)) {
        return [];
      }
      const steps = candidate.steps.flatMap((step) => {
        if (!step || typeof step !== "object") {
          return [];
        }
        const stepCandidate = step as Partial<KeySimMacroStep>;
        if (typeof stepCandidate.id !== "string" || typeof stepCandidate.type !== "string") {
          return [];
        }
        return [{
          id: stepCandidate.id,
          type: stepCandidate.type as KeySimMacroStepType,
          name: typeof stepCandidate.name === "string" ? stepCandidate.name : "未命名步骤",
          value: typeof stepCandidate.value === "string" ? stepCandidate.value : "",
          delayMs: typeof stepCandidate.delayMs === "string" ? stepCandidate.delayMs : "300",
        }];
      });
      return [{
        id: candidate.id,
        name: candidate.name,
        steps,
      }];
    });

    return tasks.length ? tasks : [{ id: "macro-task-1", name: "默认编排任务", steps: KEY_SIM_DEFAULT_MACRO_STEPS.map((step) => ({ ...step })) }];
  } catch {
    return [{ id: "macro-task-1", name: "默认编排任务", steps: KEY_SIM_DEFAULT_MACRO_STEPS.map((step) => ({ ...step })) }];
  }
}

function createRemoteDeviceDialogState(config?: SavedRemoteDeviceConfig): RemoteDeviceDialogState {
  return {
    id: config?.id ?? "",
    name: config?.name ?? "",
    host: config?.host ?? "",
    port: config?.port ?? "5555",
    pairMode: "direct",
    pairHost: config?.pairHost || config?.host || "",
    pairPort: config?.pairPort ?? "",
    pairingCode: "",
    saveConfig: true,
    busy: null,
    notice: null,
  };
}

function parseRemoteDebugServiceCandidates(output: string | undefined): RemoteDebugServiceCandidate[] {
  if (!output) {
    return [];
  }

  const seen = new Set<string>();
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^(.+?)(?:\s+\(\d+\))?\s+(_adb(?:-tls-(connect|pairing))?\._tcp)\s+([^:\s]+):(\d+)$/);
    if (!match) {
      return [];
    }
    const serviceType = match[2];
    const kind = serviceType.includes("pairing") ? "pairing" : "connect";
    const host = match[4].trim();
    const port = match[5].trim();
    const key = `${kind}:${host}:${port}`;
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [{ name: match[1].trim(), host, port, kind }];
  });
}

function extractPairingGuid(output: string | undefined) {
  const match = output?.match(/\[guid=([^\]]+)\]/);
  return match?.[1]?.trim() ?? "";
}

function applyTheme(themeId: string) {
  if (typeof document === "undefined") {
    return;
  }

  const theme = THEME_PRESETS.find((item) => item.id === themeId) ?? THEME_PRESETS.find((item) => item.id === "sky")!;
  for (const [key, value] of Object.entries(theme.vars)) {
    document.documentElement.style.setProperty(key, value);
  }
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function findCommandEntry(commandId: string) {
  for (const category of categories) {
    const command = category.commands.find((item) => item.id === commandId);
    if (command) {
      return { category, command };
    }
  }

  const customMeta = customCommandMetaMap.get(commandId);
  if (customMeta) return { category: { id: "__custom__", group: "自定义", label: "自定义命令", commands: [] }, command: customMeta };

  return null;
}

const customCommandMetaMap = new Map<string, CommandMeta>();

function getCommandSubject(command: CommandMeta) {
  const tokens = command.title.split(/\s+/);
  const subjectTokens: string[] = [];

  for (const token of tokens) {
    const normalizedToken = token.replace(/[(),]/g, "");
    if (
      token.includes("[")
      || token.includes("]")
      || token.includes("...")
      || /^[A-Z0-9_:-]+$/.test(normalizedToken)
      || /^(包名|组件|命令|参数|路径|端口|模式|文件|服务|用户|目标)$/.test(normalizedToken)
    ) {
      break;
    }

    subjectTokens.push(token);
  }

  return subjectTokens.join(" ") || command.title;
}

function getPanelCommandTitle(block: PanelCommandBlock, command?: CommandMeta | null) {
  return block.title || (command ? getCommandSubject(command) : block.commandId);
}

function createPanelCommandBlock(command: CommandMeta, overrides: Partial<Pick<PanelCommandBlock, "title" | "summary">> = {}): PanelCommandBlock {
  const params = createDefaultParamValues(command);
  return {
    id: makeId("panel-command"),
    commandId: command.id,
    title: overrides.title ?? getCommandSubject(command),
    summary: overrides.summary ?? command.summary,
    params,
    rawCommand: buildCommandString(command, params)
  };
}

function createPanel(name = "新面板", description = "用于承载一组常用命令") {
  return {
    id: makeId("panel"),
    name,
    description,
    commands: []
  } satisfies CommandPanelModel;
}

function resolveStarterCommands(commandIds: string[], fallbackStart: number) {
  const resolved = commandIds
    .map((commandId) => findCommandEntry(commandId)?.command)
    .filter((command): command is CommandMeta => Boolean(command));

  if (resolved.length > 0) {
    return resolved;
  }

  return allCommands.slice(fallbackStart, fallbackStart + 3);
}

function createStarterPanels(): CommandPanelModel[] {
  const blueprints = [
    {
      name: "常用排障",
      description: "设备连接、状态确认与基础探测",
      commandIds: ["devices", "get-state", "version"],
      fallbackStart: 0
    },
    {
      name: "安装部署",
      description: "安装、卸载与文件传输常用命令",
      commandIds: ["install", "uninstall", "push"],
      fallbackStart: 3
    },
    {
      name: "系统诊断",
      description: "日志、Shell 与系统服务诊断",
      commandIds: ["logcat", "shell", "dumpsys-list"],
      fallbackStart: 6
    }
  ];

  return blueprints.map((blueprint, index) => ({
    id: `panel-${index + 1}`,
    name: blueprint.name,
    description: blueprint.description,
    commands: resolveStarterCommands(blueprint.commandIds, blueprint.fallbackStart).map((command) => createPanelCommandBlock(command))
  }));
}

function normalizeStoredPanels(input: unknown) {
  if (!Array.isArray(input)) {
    return null;
  }

  const normalizedPanels = input
    .map((panel, index) => {
      if (!panel || typeof panel !== "object") {
        return null;
      }

      const candidatePanel = panel as Partial<CommandPanelModel>;
      const rawCommands = Array.isArray(candidatePanel.commands) ? candidatePanel.commands : [];
      const commands = rawCommands
        .map((block) => {
          if (!block || typeof block !== "object") {
            return null;
          }

          const candidateBlock = block as Partial<PanelCommandBlock>;
          if (typeof candidateBlock.commandId !== "string") {
            return null;
          }

          const commandEntry = findCommandEntry(candidateBlock.commandId)?.command ?? null;
          const params = commandEntry ? createDefaultParamValues(commandEntry) : {};
          const mergedParams = {
            ...params,
            ...(candidateBlock.params && typeof candidateBlock.params === "object" ? candidateBlock.params : {})
          } as Record<string, string>;
          const rawCommand = typeof candidateBlock.rawCommand === "string"
            ? candidateBlock.rawCommand
            : commandEntry
              ? buildCommandString(commandEntry, mergedParams)
              : "";

          return {
            id: typeof candidateBlock.id === "string" ? candidateBlock.id : makeId("panel-command"),
            commandId: candidateBlock.commandId,
            title: typeof candidateBlock.title === "string"
              ? candidateBlock.title
              : commandEntry
                ? getCommandSubject(commandEntry)
                : candidateBlock.commandId,
            summary: typeof candidateBlock.summary === "string"
              ? candidateBlock.summary
              : commandEntry?.summary ?? "",
            params: mergedParams,
            rawCommand
          } satisfies PanelCommandBlock;
        })
        .filter((block): block is PanelCommandBlock => Boolean(block));

      return {
        id: typeof candidatePanel.id === "string" ? candidatePanel.id : `panel-restored-${index + 1}`,
        name: typeof candidatePanel.name === "string" && candidatePanel.name.trim() ? candidatePanel.name : `命令面板 ${index + 1}`,
        description: typeof candidatePanel.description === "string" ? candidatePanel.description : "",
        commands
      } satisfies CommandPanelModel;
    })
    .filter((panel): panel is CommandPanelModel => Boolean(panel));

  return normalizedPanels.length > 0 ? normalizedPanels : null;
}

function loadInitialPanels() {
  if (typeof window === "undefined") {
    return createStarterPanels();
  }

  try {
    const storedPanels = window.localStorage.getItem(PANEL_STORAGE_KEY);
    if (!storedPanels) {
      return createStarterPanels();
    }

    return normalizeStoredPanels(JSON.parse(storedPanels)) ?? createStarterPanels();
  } catch {
    return createStarterPanels();
  }
}

const WORKSPACE_HANDLE_TOTAL = 16;
const WORKSPACE_GRID_GAP_TOTAL = 0;
const WORKSPACE_FIXED_CHROME_TOTAL = WORKSPACE_HANDLE_TOTAL + WORKSPACE_GRID_GAP_TOTAL;
const MIN_LEFT_PANEL_WIDTH = 180;
const MIN_MIDDLE_PANEL_WIDTH = 280;
const MIN_RIGHT_PANEL_WIDTH = 420;

function getDefaultPanelWidths(totalWidth: number) {
  const availableWidth = Math.max(
    totalWidth - WORKSPACE_FIXED_CHROME_TOTAL,
    MIN_LEFT_PANEL_WIDTH + MIN_MIDDLE_PANEL_WIDTH + MIN_RIGHT_PANEL_WIDTH
  );
  const unitWidth = availableWidth / 8;

  let leftWidth = Math.round(unitWidth);
  let middleWidth = Math.round(unitWidth * 3);
  let rightWidth = availableWidth - leftWidth - middleWidth;

  if (leftWidth < MIN_LEFT_PANEL_WIDTH) {
    const delta = MIN_LEFT_PANEL_WIDTH - leftWidth;
    leftWidth = MIN_LEFT_PANEL_WIDTH;
    rightWidth -= delta;
  }

  if (middleWidth < MIN_MIDDLE_PANEL_WIDTH) {
    const delta = MIN_MIDDLE_PANEL_WIDTH - middleWidth;
    middleWidth = MIN_MIDDLE_PANEL_WIDTH;
    rightWidth -= delta;
  }

  if (rightWidth < MIN_RIGHT_PANEL_WIDTH) {
    const delta = MIN_RIGHT_PANEL_WIDTH - rightWidth;
    const middleReducible = Math.max(0, middleWidth - MIN_MIDDLE_PANEL_WIDTH);
    const middleTake = Math.min(delta, middleReducible);

    middleWidth -= middleTake;
    rightWidth += middleTake;

    if (rightWidth < MIN_RIGHT_PANEL_WIDTH) {
      const remainingDelta = MIN_RIGHT_PANEL_WIDTH - rightWidth;
      const leftReducible = Math.max(0, leftWidth - MIN_LEFT_PANEL_WIDTH);
      const leftTake = Math.min(remainingDelta, leftReducible);

      leftWidth -= leftTake;
      rightWidth += leftTake;
    }
  }

  return {
    leftWidth,
    middleWidth
  };
}

function isToggleParam(param: CommandParam) {
  if (param.required) {
    return false;
  }

  const defaultValue = param.defaultValue?.trim() ?? "";
  if (defaultValue.startsWith("-") && !/\s/.test(defaultValue)) {
    return true;
  }

  return /^(--?[^\s（(]+)（.+）$/.test(param.placeholder.trim());
}

function getToggleParamValue(param: CommandParam) {
  const defaultValue = param.defaultValue?.trim() ?? "";
  if (defaultValue) {
    return defaultValue;
  }

  const match = param.placeholder.trim().match(/^(--?[^\s（(]+)/);
  return match?.[1] ?? "";
}

function getParamInlineText(param: CommandParam) {
  if (isToggleParam(param)) {
    const token = getToggleParamValue(param);
    const description = param.placeholder.trim().match(/^[^（(]+[（(](.+)[）)]$/)?.[1];
    return description ? `${token} ${param.label}（${description}）` : `${token} ${param.label}`;
  }

  if (param.key === "compressionAlgorithm") {
    return `-z ${param.label}(${param.placeholder})`;
  }

  return `${param.label} ${param.placeholder}`.trim();
}

function LayoutPopoutPanel({ panelId, runtimeApi }: { panelId: number; runtimeApi: NonNullable<Window["adbHelperApi"]> }) {
  const [deviceId, setDeviceId] = useState("");
  const [uiTreeXml, setUiTreeXml] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [screenshotSize, setScreenshotSize] = useState({ width: 1080, height: 1920 });
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [wireframeMode, setWireframeMode] = useState(false);
  const [hiddenNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load state from main process (saved by parent window before popout)
    runtimeApi.layout.getPopoutState().then((state) => {
      if (state.uiTreeXml) setUiTreeXml(state.uiTreeXml);
      if (state.screenshotDataUrl) setScreenshot(state.screenshotDataUrl);
      if (state.deviceId) setDeviceId(state.deviceId);
      if (state.selectedPath) setSelectedPath(state.selectedPath);
    });
    // Poll for selection changes from main window
    const interval = setInterval(async () => {
      try {
        const state = await runtimeApi.layout.getPopoutState();
        if (state.selectedPath !== undefined) setSelectedPath(state.selectedPath ?? null);
      } catch { /* ignore */ }
    }, 500);
    return () => clearInterval(interval);
  }, [runtimeApi]);

  const parsedTree = useMemo(() => parseUiTreeXml(uiTreeXml), [uiTreeXml]);
  const selectedNode = useMemo(() => {
    if (!selectedPath) return null;
    function find(nodes: UiTreeNode[]): UiTreeNode | null {
      for (const n of nodes) {
        if (n.path === selectedPath) return n;
        const f = find(n.children);
        if (f) return f;
      }
      return null;
    }
    return find(parsedTree);
  }, [parsedTree, selectedPath]);

  const handleDump = async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const [dump, shot] = await Promise.all([
        runtimeApi.layout.dumpUiTree({ deviceId }),
        runtimeApi.layout.screenshot({ deviceId })
      ]);
      if (dump.status === "ok") { setUiTreeXml(dump.xml ?? ""); setExpandedNodes(new Set()); }
      if (shot.status === "ok" && shot.dataUrl) setScreenshot(shot.dataUrl);
    } finally { setLoading(false); }
  };

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.currentTarget.querySelector("img, svg");
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const sw = screenshotSize.width;
    const sh = screenshotSize.height;
    const clickX = ((e.clientX - rect.left) / rect.width) * sw;
    const clickY = ((e.clientY - rect.top) / rect.height) * sh;
    const hit = findNodeAtPoint(parsedTree, clickX, clickY, hiddenNodes);
    if (hit) {
      setSelectedPath(hit.path);
      const ancestors = expandPathToNode(hit.path);
      setExpandedNodes((prev) => new Set([...prev, ...ancestors]));
      runtimeApi.layout.updatePopoutSelection({ selectedPath: hit.path });
    }
  };

  const panelNames = ["UI 树", "布局预览", "属性详情"];

  function renderTreeNode(node: UiTreeNode, depth: number): ReactNode {
    const isExpanded = expandedNodes.has(node.path);
    const isSelected = selectedPath === node.path;
    const hasChildren = node.children.length > 0;
    return (
      <Fragment key={node.path}>
        <div className={`layout-tree-node ${isSelected ? "layout-tree-node-selected" : ""}`} style={{ paddingLeft: depth * 16 + 8 }} onClick={() => { setSelectedPath(node.path); runtimeApi.layout.updatePopoutSelection({ selectedPath: node.path }); if (hasChildren) setExpandedNodes((p) => { const n = new Set(p); n.has(node.path) ? n.delete(node.path) : n.add(node.path); return n; }); }}>
          <span className="layout-tree-toggle">{hasChildren ? (isExpanded ? "▼" : "▶") : "　"}</span>
          <span className="layout-tree-label">{getUiNodeLabel(node)}</span>
        </div>
        {isExpanded && hasChildren ? node.children.map((c) => renderTreeNode(c, depth + 1)) : null}
      </Fragment>
    );
  }

  function renderWireframe() {
    const sw = screenshotSize.width;
    const sh = screenshotSize.height;
    function renderNode(node: UiTreeNode): React.ReactNode[] {
      if (hiddenNodes.has(node.path)) return [];
      const rects: React.ReactNode[] = [];
      const bounds = parseBoundsRect(node.attributes?.["bounds"]);
      if (bounds) {
        const isSel = node.path === selectedPath;
        rects.push(<rect key={node.path} x={bounds.x1} y={bounds.y1} width={bounds.x2 - bounds.x1} height={bounds.y2 - bounds.y1} fill={isSel ? "rgba(33,150,243,0.15)" : "none"} stroke={isSel ? "#2196F3" : "#666"} strokeWidth={isSel ? 2 : 0.5} />);
      }
      if (node.children) for (const c of node.children) rects.push(...renderNode(c));
      return rects;
    }
    return (
      <svg className="layout-wireframe-svg" viewBox={`0 0 ${sw} ${sh}`} style={{ width: "100%", height: "auto", maxHeight: "100%", background: "#1a1a2e" }}>
        {parsedTree.flatMap((n) => renderNode(n))}
      </svg>
    );
  }

  return (
    <div style={{ padding: 16, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <strong>{panelNames[panelId] ?? "面板"}</strong>
        <button className="primary-button compact-button" disabled={!deviceId || loading} onClick={handleDump}>{loading ? "获取中…" : "获取 UI 树"}</button>
        {panelId === 1 ? (
          <>
            <button className={`ghost-button compact-button ${!wireframeMode ? "primary-button-ghost" : ""}`} onClick={() => setWireframeMode(false)}>截图</button>
            <button className={`ghost-button compact-button ${wireframeMode ? "primary-button-ghost" : ""}`} onClick={() => setWireframeMode(true)}>线框</button>
          </>
        ) : null}
      </div>
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {panelId === 0 && parsedTree.length > 0 ? (
          <div className="layout-inspector-tree-scroll">{parsedTree.map((n) => renderTreeNode(n, 0))}</div>
        ) : null}
        {panelId === 1 && (screenshot || uiTreeXml) ? (
          <div className="layout-preview-image-wrapper" onClick={handlePreviewClick}>
            {wireframeMode ? renderWireframe() : (
              <>
                <img src={screenshot} className="layout-preview-image" alt="截图" onLoad={(e) => setScreenshotSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} />
                {selectedNode?.attributes["bounds"] ? (() => { const r = parseBoundsRect(selectedNode.attributes["bounds"]); if (!r) return null; return (<svg className="layout-preview-svg-overlay" viewBox={`0 0 ${screenshotSize.width} ${screenshotSize.height}`} preserveAspectRatio="none"><rect x={r.x1} y={r.y1} width={r.x2-r.x1} height={r.y2-r.y1} fill="rgba(33,150,243,0.2)" stroke="#2196F3" strokeWidth="3" /></svg>); })() : null}
              </>
            )}
          </div>
        ) : null}
        {panelId === 2 && selectedNode ? (
          <div className="layout-detail-attrs">
            {Object.entries(selectedNode.attributes).map(([k, v]) => (<div key={k} className="layout-detail-attr-row"><span className="layout-detail-attr-key">{k}</span><span className="layout-detail-attr-value">{v}</span></div>))}
          </div>
        ) : null}
        {!uiTreeXml && !loading ? <div className="result-empty-state"><p>点击"获取 UI 树"开始</p></div> : null}
      </div>
    </div>
  );
}

export default function App() {
  const runtimeApi = window.adbHelperApi ?? fallbackApi;
  const isBrowserPreviewMode = runtimeApi.status === "browser-fallback";

  // Popout mode: render only the specified panel
  const popoutParam = new URLSearchParams(window.location.search).get("popout");
  if (popoutParam !== null) {
    return <LayoutPopoutPanel panelId={Number(popoutParam)} runtimeApi={runtimeApi} />;
  }

  const workspaceRef = useRef<HTMLElement | null>(null);
  const logcatListRef = useRef<HTMLDivElement | null>(null);
  const logcatFilterShellRef = useRef<HTMLDivElement | null>(null);
  const deviceAnchorRef = useRef<HTMLDivElement | null>(null);
  const devicePopupRef = useRef<HTMLDivElement | null>(null);
  const deviceScrimRef = useRef<HTMLDivElement | null>(null);
  const deviceActionAnchorRef = useRef<HTMLDivElement | null>(null);
  const deviceActionPopupRef = useRef<HTMLDivElement | null>(null);
  const deviceActionScrimRef = useRef<HTMLDivElement | null>(null);
  const deviceDisplayPopupRef = useRef<HTMLDivElement | null>(null);
  const deviceInstallPopupRef = useRef<HTMLDivElement | null>(null);
  const appActionMenuAnchorRef = useRef<HTMLDivElement | null>(null);
  const deviceDisplayCloseTimerRef = useRef<number | null>(null);
  const deviceInstallCloseTimerRef = useRef<number | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const leftDiffDropdownRef = useRef<HTMLDivElement | null>(null);
  const rightDiffDropdownRef = useRef<HTMLDivElement | null>(null);
  const initialPanelsRef = useRef<CommandPanelModel[]>(loadInitialPanels());
  const hasManualWorkspaceResizeRef = useRef(false);
  const initialWorkspaceWidthsRef = useRef(getDefaultPanelWidths(typeof window === "undefined" ? 1340 : window.innerWidth - 24));
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [deviceLoading, setDeviceLoading] = useState(true);
  const [activeCategoryId, setActiveCategoryId] = useState(categories[0].id);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCommandId, setActiveCommandId] = useState(categories[0].commands[0]?.id ?? "");
  const [panels, setPanels] = useState<CommandPanelModel[]>(initialPanelsRef.current);
  const [activePanelId, setActivePanelId] = useState(initialPanelsRef.current[0]?.id ?? "");
  const [activePanelCommandId, setActivePanelCommandId] = useState("");
  const [currentDeviceId, setCurrentDeviceId] = useState("");
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [deviceActionOpen, setDeviceActionOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  // catalogTab removed - custom commands now a sidebar category
  const [customCommands, setCustomCommands] = useState<CustomCommandEntry[]>(loadCustomCommands);
  // Rebuild customCommandMetaMap whenever customCommands changes
  useMemo(() => {
    customCommandMetaMap.clear();
    for (const entry of customCommands) {
      const meta: CommandMeta = {
        id: entry.id,
        title: entry.title,
        summary: entry.template,
        type: "写操作",
        support: "支持",
        risk: "低",
        raw: entry.template,
        prerequisite: "",
        fallback: "",
        params: entry.params.map((p) => ({ key: p.key, label: p.label, required: p.required, placeholder: p.placeholder, defaultValue: p.defaultValue })),
        compose: (values) => {
          let cmd = entry.template;
          for (const p of entry.params) {
            if (p.required) {
              cmd = cmd.replace(new RegExp(`<${p.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}>`, "g"), values[p.key] || "");
            } else if (p.flag) {
              const val = values[p.key];
              cmd = cmd.replace(new RegExp(`\\[${p.flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+${p.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`, "g"), val ? `${p.flag} ${val}` : "");
            } else {
              const val = values[p.key];
              cmd = cmd.replace(new RegExp(`\\[${p.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`, "g"), val || "");
            }
          }
          return cmd.replace(/\s+/g, " ").trim();
        },
      };
      customCommandMetaMap.set(entry.id, meta);
    }
  }, [customCommands]);
  const [customCommandDraft, setCustomCommandDraft] = useState<{ title: string; template: string; paramOverrides: Record<string, { label: string; defaultValue: string }> }>({ title: "", template: "", paramOverrides: {} });
  const [customCommandEditId, setCustomCommandEditId] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [rightWorkspaceMaximized, setRightWorkspaceMaximized] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(initialWorkspaceWidthsRef.current.leftWidth);
  const [middlePanelWidth, setMiddlePanelWidth] = useState(initialWorkspaceWidthsRef.current.middleWidth);
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState | null>(null);
  const [panelDialogState, setPanelDialogState] = useState<PanelDialogState | null>(null);
  const [panelCommandParamDialog, setPanelCommandParamDialog] = useState<PanelCommandParamDialogState | null>(null);
  const [commandRenameDialog, setCommandRenameDialog] = useState<{ blockId: string; name: string } | null>(null);
  const [activeMainView, setActiveMainView] = useState<MainView>("command");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"theme" | "general" | "backup-rules" | "logcat">("theme");
  const [activeThemeId, setActiveThemeId] = useState(loadStoredThemeId);
  const [generalSettingsRules, setGeneralSettingsRules] = useState<GeneralSettingsRules>(loadGeneralSettingsRules);
  const [generalSettingsRulesDraft, setGeneralSettingsRulesDraft] = useState<GeneralSettingsRules>(loadGeneralSettingsRules);
  const [savedRemoteDevices, setSavedRemoteDevices] = useState<SavedRemoteDeviceConfig[]>(loadSavedRemoteDeviceConfigs);
  const [pendingRemoteConnectIds, setPendingRemoteConnectIds] = useState<string[]>([]);
  const [remoteDeviceDialog, setRemoteDeviceDialog] = useState<RemoteDeviceDialogState | null>(null);
  const [remoteDebugCandidates, setRemoteDebugCandidates] = useState<RemoteDebugServiceCandidate[]>([]);
  const [adbHealthCheck, setAdbHealthCheck] = useState<AdbHealthCheckState | null>(null);
  const [adbHealthCheckDialogOpen, setAdbHealthCheckDialogOpen] = useState(false);
  const [devicePopupStyle, setDevicePopupStyle] = useState<CSSProperties>({});
  const [deviceActionPopupStyle, setDeviceActionPopupStyle] = useState<CSSProperties>({});
  const [deviceActionBusy, setDeviceActionBusy] = useState<"reboot" | "root" | "remount" | null>(null);
  const [deviceDisplayCatalog, setDeviceDisplayCatalog] = useState<DeviceDisplayItem[]>([]);
  const [deviceDisplayLoading, setDeviceDisplayLoading] = useState(false);
  const [deviceDisplayMenuOpen, setDeviceDisplayMenuOpen] = useState(false);
  const [deviceDisplayPopupStyle, setDeviceDisplayPopupStyle] = useState<CSSProperties>({});
  const [deviceInstallMenuOpen, setDeviceInstallMenuOpen] = useState(false);
  const [deviceInstallPopupStyle, setDeviceInstallPopupStyle] = useState<CSSProperties>({});
  const [deviceInstallApkBusy, setDeviceInstallApkBusy] = useState<string | null>(null);
  const [scrcpyAvailable, setScrcpyAvailable] = useState(false);
  const [scrcpyConfigDialog, setScrcpyConfigDialog] = useState<({ deviceId: string; deviceName: string; display: DeviceDisplayItem; config: ScrcpyDisplayConfig; saving: boolean; syncing: boolean; notice: string | null }) | null>(null);
  const [resultSearchTerm, setResultSearchTerm] = useState("");
  const [rawCommand, setRawCommand] = useState("");
  const [lastRunResult, setLastRunResult] = useState<RunResult | null>(null);
  const [probeResult, setProbeResult] = useState<Record<string, string> | null>(null);
  const [deviceInfoTab, setDeviceInfoTab] = useState<DeviceInfoTab>("basic");
  const [keySimTab, setKeySimTab] = useState<KeySimTab>("quick");
  const [keySimNotice, setKeySimNotice] = useState<string | null>(null);
  const [keySimBusy, setKeySimBusy] = useState(false);
  const [keySimScreenshotLoading, setKeySimScreenshotLoading] = useState(false);
  const [keySimScreenshotDataUrl, setKeySimScreenshotDataUrl] = useState("");
  const [keySimScreenshotSize, setKeySimScreenshotSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [keySimTouchSize, setKeySimTouchSize] = useState<{ width: number; height: number } | null>(null);
  const [keySimMode, setKeySimMode] = useState<"tap" | "swipe">("tap");
  const [keySimTapPoint, setKeySimTapPoint] = useState<{ x: number; y: number } | null>(null);
  const [keySimSwipeStart, setKeySimSwipeStart] = useState<{ x: number; y: number } | null>(null);
  const [keySimSwipeEnd, setKeySimSwipeEnd] = useState<{ x: number; y: number } | null>(null);
  const [keySimSwipeDurationMs, setKeySimSwipeDurationMs] = useState("300");
  const [keySimQuickActions, setKeySimQuickActions] = useState<KeySimQuickAction[]>(KEY_SIM_DEFAULT_QUICK_ACTIONS);
  const [keySimQuickAddMenuOpen, setKeySimQuickAddMenuOpen] = useState(false);
  const [keySimQuickDraft, setKeySimQuickDraft] = useState<KeySimQuickAction | null>(null);
  const [keySimQuickDraftMode, setKeySimQuickDraftMode] = useState<"create" | "edit">("create");
  const [keySimQuickDraggingId, setKeySimQuickDraggingId] = useState<string | null>(null);
  const [keySimQuickPickerOpen, setKeySimQuickPickerOpen] = useState(false);
  const [keySimQuickPickerMode, setKeySimQuickPickerMode] = useState<"tap" | "swipe">("tap");
  const [keySimPickerTarget, setKeySimPickerTarget] = useState<"quick" | "macro">("quick");
  const [keySimQuickPickerTapPoint, setKeySimQuickPickerTapPoint] = useState<{ x: number; y: number } | null>(null);
  const [keySimQuickPickerSwipeStart, setKeySimQuickPickerSwipeStart] = useState<{ x: number; y: number } | null>(null);
  const [keySimQuickPickerSwipeEnd, setKeySimQuickPickerSwipeEnd] = useState<{ x: number; y: number } | null>(null);
  const [keySimFingerPaths, setKeySimFingerPaths] = useState<KeySimFingerPath[]>([
    { id: "finger-1", startX: "200", startY: "1200", endX: "200", endY: "400", durationMs: "300" },
    { id: "finger-2", startX: "880", startY: "1200", endX: "880", endY: "400", durationMs: "300" },
  ]);
  const [keySimMacroSteps, setKeySimMacroSteps] = useState<KeySimMacroStep[]>(KEY_SIM_DEFAULT_MACRO_STEPS);
  const [keySimMacroRunning, setKeySimMacroRunning] = useState(false);
  const [keySimMacroRepeatProgress, setKeySimMacroRepeatProgress] = useState<{ current: number; total: number } | null>(null);
  const keySimMacroRepeatCancelRef = useRef(false);
  const [keySimMacroTasks, setKeySimMacroTasks] = useState<KeySimMacroTask[]>(loadStoredMacroTasks);
  const [keySimMacroTaskDraftId, setKeySimMacroTaskDraftId] = useState<string | null>(null);
  const [keySimMacroTaskDraftName, setKeySimMacroTaskDraftName] = useState("");
  const [keySimMacroTaskDialogOpen, setKeySimMacroTaskDialogOpen] = useState(false);
  const [keySimMacroRepeatDialog, setKeySimMacroRepeatDialog] = useState<{ taskId: string; count: string; intervalMs: string } | null>(null);
  const [keySimMacroAddMenuOpen, setKeySimMacroAddMenuOpen] = useState(false);
  const [keySimMacroDraft, setKeySimMacroDraft] = useState<KeySimMacroStep | null>(null);
  const [keySimMacroDraftMode, setKeySimMacroDraftMode] = useState<"create" | "edit">("create");
  const [layoutViewerTab, setLayoutViewerTab] = useState<LayoutViewerTab>("inspector");
  const [layoutWinscopeToken, setLayoutWinscopeToken] = useState<string | null>(null);
  const layoutWinscopeAutoStarted = useRef(false);
  useEffect(() => {
    if (layoutViewerTab === "winscope" && layoutWinscopeToken === null && !layoutWinscopeAutoStarted.current) {
      layoutWinscopeAutoStarted.current = true;
      runtimeApi.layout.winscopeProxy().then((result) => {
        if (result.status === "ok" && result.token) {
          setLayoutWinscopeToken(result.token);
        } else {
          setLayoutWinscopeToken("");
        }
      });
    }
  }, [layoutViewerTab]);
  const [layoutUiTreeXml, setLayoutUiTreeXml] = useState("");
  const [layoutUiTreeLoading, setLayoutUiTreeLoading] = useState(false);
  const [layoutUiTreeError, setLayoutUiTreeError] = useState<string | null>(null);
  const [layoutSelectedNodePath, setLayoutSelectedNodePath] = useState<string | null>(null);
  const [layoutExpandedNodes, setLayoutExpandedNodes] = useState<Set<string>>(new Set());
  const [layoutScreenshotDataUrl, setLayoutScreenshotDataUrl] = useState("");
  const [layoutScreenshotSize, setLayoutScreenshotSize] = useState<{ width: number; height: number }>({ width: 1080, height: 1920 });
  const [layoutPanelSizes, setLayoutPanelSizes] = useState<[number, number, number]>([33, 34, 33]);
  const [layoutCollapsedPanels, setLayoutCollapsedPanels] = useState<Set<0 | 1 | 2>>(new Set());
  const [layoutMaximizedPanel, setLayoutMaximizedPanel] = useState<0 | 1 | 2 | null>(null);
  const [layoutPoppedPanel, setLayoutPoppedPanel] = useState<0 | 1 | 2 | null>(null);
  const layoutDragRef = useRef<{ index: number; startX: number; startSizes: [number, number, number] } | null>(null);
  const [layoutDisplayId, setLayoutDisplayId] = useState<number>(0);
  const [layoutPackageFilter, setLayoutPackageFilter] = useState("");
  const [layoutProcessDialogOpen, setLayoutProcessDialogOpen] = useState(false);
  const [layoutProcessList, setLayoutProcessList] = useState<{ pid: string; name: string; user?: string }[]>([]);
  const [layoutProcessSearch, setLayoutProcessSearch] = useState("");
  const [layoutSelectedProcess, setLayoutSelectedProcess] = useState<{ pid: string; name: string; user?: string } | null>(null);
  const [layoutProcessLoading, setLayoutProcessLoading] = useState(false);
  const [layoutHiddenNodes, setLayoutHiddenNodes] = useState<Set<string>>(new Set());
  const [layoutWireframeMode, setLayoutWireframeMode] = useState(true);
  const [layoutPreviewZoom, setLayoutPreviewZoom] = useState(1);
  // Sync selection to popout window
  useEffect(() => {
    if (layoutPoppedPanel !== null) {
      runtimeApi.layout.updatePopoutSelection({ selectedPath: layoutSelectedNodePath });
    }
  }, [layoutSelectedNodePath, layoutPoppedPanel]);
  // Reverse sync: popout selection -> main window
  useEffect(() => {
    if (layoutPoppedPanel === null) return;
    const interval = setInterval(async () => {
      try {
        const state = await runtimeApi.layout.getPopoutState();
        if (state && state.selectedPath !== undefined && state.selectedPath !== layoutSelectedNodePath) {
          setLayoutSelectedNodePath(state.selectedPath);
          if (state.selectedPath) {
            const ancestors = state.selectedPath.split("/").slice(0, -1).reduce((acc: string[], seg: string) => {
              acc.push(acc.length ? acc[acc.length - 1] + "/" + seg : seg);
              return acc;
            }, [] as string[]);
            setLayoutExpandedNodes((prev) => new Set([...prev, ...ancestors]));
          }
        }
      } catch (_) {}
    }, 500);
    return () => clearInterval(interval);
  }, [layoutPoppedPanel, layoutSelectedNodePath]);
  const [deviceAppSearchTerm, setDeviceAppSearchTerm] = useState("");
  const [deviceAppUserFilter, setDeviceAppUserFilter] = useState("all");
  const [deviceAppPermissionFilter, setDeviceAppPermissionFilter] = useState("");
  const [deviceAppScopeFilter, setDeviceAppScopeFilter] = useState<"all" | "system" | "user">("all");
  const [deviceAppsCatalog, setDeviceAppsCatalog] = useState<DeviceAppItem[]>([]);
  const [deviceAppsLoading, setDeviceAppsLoading] = useState(false);
  const [selectedDeviceAppPackage, setSelectedDeviceAppPackage] = useState("");
  const [deviceAppDetail, setDeviceAppDetail] = useState<DeviceAppDetail | null>(null);
  const [deviceAppDetailLoading, setDeviceAppDetailLoading] = useState(false);
  const [deviceAppActionBusy, setDeviceAppActionBusy] = useState<string | null>(null);
  const [deviceAppActionResult, setDeviceAppActionResult] = useState<InlineActionResult | null>(null);
  const [deviceComponentDialog, setDeviceComponentDialog] = useState<{ componentName: string; detail: DeviceAppComponentDetail } | null>(null);
  const [appActionMenuOpen, setAppActionMenuOpen] = useState(false);
  const [appActionSubmenu, setAppActionSubmenu] = useState<"uninstall" | "install" | "clear" | null>(null);
  const [appActionSubmenuStyle, setAppActionSubmenuStyle] = useState<CSSProperties>({});
  const [visibleDeviceAppCount, setVisibleDeviceAppCount] = useState(INITIAL_VISIBLE_DEVICE_APPS);
  const [deviceUsersSnapshot, setDeviceUsersSnapshot] = useState<DeviceUsersResponse | null>(null);
  const [deviceUsersLoading, setDeviceUsersLoading] = useState(false);
  const [deviceFileBrowserPath, setDeviceFileBrowserPath] = useState(DEFAULT_DEVICE_FILE_PATH);
  const [deviceFileEntries, setDeviceFileEntries] = useState<DeviceFileEntry[]>([]);
  const [deviceFileLoading, setDeviceFileLoading] = useState(false);
  const [deviceFileActionBusy, setDeviceFileActionBusy] = useState<string | null>(null);
  const [deviceFileNotice, setDeviceFileNotice] = useState<string | null>(null);
  const [deviceFileSelectedPath, setDeviceFileSelectedPath] = useState("");
  const [deviceFileUploadTargetPath, setDeviceFileUploadTargetPath] = useState("");
  const [deviceFileMkdirName, setDeviceFileMkdirName] = useState("");
  const [deviceFileChmodMode, setDeviceFileChmodMode] = useState("775");
  const [deviceFileChownValue, setDeviceFileChownValue] = useState("");
  const [deviceFileActionResult, setDeviceFileActionResult] = useState<InlineActionResult | null>(null);
  const [deviceProcessSearchTerm, setDeviceProcessSearchTerm] = useState("");
  const [deviceProcessUserFilter, setDeviceProcessUserFilter] = useState("all");
  const [deviceProcessScopeFilter, setDeviceProcessScopeFilter] = useState<"all" | "app" | "system" | "kernel">("app");
  const [deviceProcessCatalog, setDeviceProcessCatalog] = useState<DeviceProcessListItem[]>([]);
  const [deviceProcessesLoading, setDeviceProcessesLoading] = useState(false);
  const [visibleDeviceProcessCount, setVisibleDeviceProcessCount] = useState(INITIAL_VISIBLE_DEVICE_PROCESSES);
  const [pendingProcessKill, setPendingProcessKill] = useState<DeviceProcessListItem | null>(null);
  // Screen capture/record states
  const [screenCapturing, setScreenCapturing] = useState(false);
  const [screenCaptureResults, setScreenCaptureResults] = useState<Array<{ displayId: number; dataUrl?: string; savedPath?: string }>>([]);
  const [screenRecording, setScreenRecording] = useState(false);
  const [screenDisplayIds, setScreenDisplayIds] = useState<number[]>([0]);
  const [screenRecordResults, setScreenRecordResults] = useState<Array<{ displayId: number; localPath: string }>>([]);
  const [uiToast, setUiToast] = useState<ToastNotice | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const confirmActionRef = useRef<(() => void) | null>(null);
  const [logcatStreamState, setLogcatStreamState] = useState<LogcatStreamState | null>(null);
  const [logcatBusy, setLogcatBusy] = useState<"start" | "stop" | "clear" | null>(null);
  const [logcatPageTab, setLogcatPageTab] = useState<"logcat" | "crash" | "bugreport" | "trace">("logcat");
  const [crashFiles, setCrashFiles] = useState<{ tombstones: any[]; anr: any[]; dropbox: any[] }>({ tombstones: [], anr: [], dropbox: [] });
  const [crashLoading, setCrashLoading] = useState(false);
  const [crashContent, setCrashContent] = useState<{ path: string; content: string } | null>(null);
  const [crashContentLoading, setCrashContentLoading] = useState(false);
  const [bugreportRunning, setBugreportRunning] = useState(false);
  const [bugreportResult, setBugreportResult] = useState<string | null>(null);
  const [traceRunning, setTraceRunning] = useState(false);
  const [traceDuration, setTraceDuration] = useState("5");
  const [traceCategories, setTraceCategories] = useState<string[]>(["gfx", "view", "wm", "am", "sched"]);
  const [traceResult, setTraceResult] = useState<string | null>(null);

  const [logcatSearchTerm, setLogcatSearchTerm] = useState("");
  const [logcatRegexEnabled, setLogcatRegexEnabled] = useState(false);
  const [logcatAdvancedOpen, setLogcatAdvancedOpen] = useState(false);
  const [logcatFilterRules, setLogcatFilterRules] = useState<LogcatFilterRule[]>([createLogcatFilterRule()]);
  const [logcatLevels, setLogcatLevels] = useState<string[]>([]);
  const [logcatBuffers, setLogcatBuffers] = useState<string[]>(["main", "system", "crash"]);
  const [logcatConfig, setLogcatConfig] = useState<LogcatConfig | null>(null);
  const [logcatOutputDirDraft, setLogcatOutputDirDraft] = useState(DEFAULT_LOGCAT_OUTPUT_DIR);
  const [logcatMaxFileSizeDraft, setLogcatMaxFileSizeDraft] = useState("10");
  const [logcatClearBeforeStartDraft, setLogcatClearBeforeStartDraft] = useState(false);
  const [logcatDisplayLineLimitDraft, setLogcatDisplayLineLimitDraft] = useState("3000");
  const [logcatRefreshIntervalDraft, setLogcatRefreshIntervalDraft] = useState(String(DEFAULT_LOGCAT_REFRESH_INTERVAL_MS));
  const [logcatDefaultRegexEnabledDraft, setLogcatDefaultRegexEnabledDraft] = useState(false);
  const [logcatDefaultLevelsDraft, setLogcatDefaultLevelsDraft] = useState<string[]>([]);
  const [logcatConfigSaving, setLogcatConfigSaving] = useState(false);
  const [logcatDownloading, setLogcatDownloading] = useState(false);
  const [logcatClearBeforeStartEnabled, setLogcatClearBeforeStartEnabled] = useState(false);
  const [logcatAutoFollow, setLogcatAutoFollow] = useState(true);
  const [logcatPaused, setLogcatPaused] = useState(false);
  const [logcatMaximized, setLogcatMaximized] = useState(false);
  const [logcatWrapEnabled, setLogcatWrapEnabled] = useState(false);
  const [logcatVirtualStartIndex, setLogcatVirtualStartIndex] = useState(0);
  const [logcatViewportHeight, setLogcatViewportHeight] = useState(0);
  const [logcatPinnedView, setLogcatPinnedView] = useState<{ signature: string; items: LogcatEntry[] } | null>(null);
  const [logcatPickerState, setLogcatPickerState] = useState<LogcatPickerState>(null);
  const [logcatPickerQuery, setLogcatPickerQuery] = useState("");
  const [logcatPickerLoading, setLogcatPickerLoading] = useState<"package" | "pid" | null>(null);
  const [logcatPickerStyle, setLogcatPickerStyle] = useState<CSSProperties>({});
  const [logcatPackageCatalog, setLogcatPackageCatalog] = useState<string[]>([]);
  const [logcatProcessCatalog, setLogcatProcessCatalog] = useState<LogcatProcessItem[]>([]);
  const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null);
  const [backupConfig, setBackupConfig] = useState<BackupConfig | null>(null);
  const [backupVersionPropDraft, setBackupVersionPropDraft] = useState("ro.build.display.id");
  const [backupRootDraft, setBackupRootDraft] = useState(BACKUP_ROOT_PATH);
  const [backupPathsDraft, setBackupPathsDraft] = useState("");
  const [restorePathsDraft, setRestorePathsDraft] = useState("");
  const [selectedBackupPaths, setSelectedBackupPaths] = useState<string[]>([]);
  const [selectedRestorePaths, setSelectedRestorePaths] = useState<string[]>([]);
  const [backupConfigSaving, setBackupConfigSaving] = useState(false);
  const [backupBusyAction, setBackupBusyAction] = useState<"backup" | "restore" | null>(null);
  const [backupActionResult, setBackupActionResult] = useState<BackupActionResult | null>(null);
  const [pendingBackupDeleteVersion, setPendingBackupDeleteVersion] = useState<string | null>(null);
  const [executionHistory, setExecutionHistory] = useState<HistoryItem[]>([]);
  const [activeResultTab, setActiveResultTab] = useState<ResultTab>("structured");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [openDiffDropdown, setOpenDiffDropdown] = useState<DiffDropdownSide | null>(null);
  const [leftDiffTargetId, setLeftDiffTargetId] = useState<DiffTargetId>("current");
  const [rightDiffTargetId, setRightDiffTargetId] = useState<DiffTargetId>("current");
  const [historyDetailRecordId, setHistoryDetailRecordId] = useState<string | null>(null);
  const [historyDetailTab, setHistoryDetailTab] = useState<HistoryDetailTab>("structured");
  const [pendingHistoryDeleteId, setPendingHistoryDeleteId] = useState<string | null>(null);
  const [historyClearConfirmOpen, setHistoryClearConfirmOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyShowUserOnly, setHistoryShowUserOnly] = useState(true);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const appActionSubmenuCloseTimerRef = useRef<number | null>(null);
  const lastAppliedLogcatCaptureSignatureRef = useRef("");
  const lastLogcatSnapshotRef = useRef<{ bufferedLines: number; capturedAt: number | undefined; lastId: string }>({ bufferedLines: 0, capturedAt: undefined, lastId: "" });

  const activePanel = panels.find((panel) => panel.id === activePanelId) ?? panels[0] ?? null;
  const panelCommands = activePanel?.commands ?? [];
  const activePanelCommand = panelCommands.find((block) => block.id === activePanelCommandId) ?? null;
  const activePanelCommandEntry = activePanelCommand ? findCommandEntry(activePanelCommand.commandId) : null;
  const activeCommand = activePanelCommandEntry?.command ?? null;
  const activePanelCommandTitle = activePanelCommand ? getPanelCommandTitle(activePanelCommand, activeCommand) : "";
  const panelCommandDialogEntry = panelCommandParamDialog ? findCommandEntry(panelCommandParamDialog.commandId) : null;
  const panelCommandDialogCommand = panelCommandDialogEntry?.command ?? null;
  const panelCommandDialogRequiredParams = (panelCommandDialogCommand?.params ?? []).filter((param) => param.required);
  const panelCommandDialogOptionalParams = (panelCommandDialogCommand?.params ?? []).filter((param) => !param.required);
  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? categories[0];
  const visibleCommands = useMemo(() => {
    const pool = searchTerm.trim() ? allCommands : activeCategory.commands;
    return pool.filter((command) => {
      const haystack = `${command.title} ${command.summary} ${command.raw}`.toLowerCase();
      return haystack.includes(searchTerm.toLowerCase()) && matchesFilter(command, activeFilter);
    });
  }, [activeCategory.commands, activeFilter, searchTerm]);
  const activeCatalogCommand = visibleCommands.find((command) => command.id === activeCommandId) ?? visibleCommands[0] ?? null;
  const remoteDeviceConfigMap = useMemo(
    () => new Map(savedRemoteDevices.map((config) => [`${config.host}:${config.port}`, config])),
    [savedRemoteDevices],
  );
  const currentDevice = devices.find((device) => device.id === currentDeviceId) ?? devices[0] ?? null;
  const savedRemoteDeviceSummaries = useMemo(() => {
    const matchedDeviceIds = new Set<string>();
    return savedRemoteDevices.map((config) => {
      const target = `${config.host}:${config.port}`;
      let connectedDevice = devices.find((device) => device.id === target) ?? null;
      if (!connectedDevice) {
        const unmatchedOnlineDevices = devices.filter((device) => device.status === "在线" && !matchedDeviceIds.has(device.id));
        if (unmatchedOnlineDevices.length === 1) {
          connectedDevice = unmatchedOnlineDevices[0];
        }
      }
      if (connectedDevice) {
        matchedDeviceIds.add(connectedDevice.id);
      }
      const alias = config.name.trim();
      const deviceListLabel = connectedDevice
        ? alias && alias !== connectedDevice.name
          ? `${connectedDevice.name}（${alias}）`
          : connectedDevice.name
        : target;
      const savedLabel = alias || connectedDevice?.name || target;
      return {
        config,
        connectedDevice,
        deviceListLabel,
        savedLabel,
        target,
      };
    });
  }, [devices, savedRemoteDevices]);
  const deviceListLabelMap = useMemo(
    () => new Map(savedRemoteDeviceSummaries.filter((summary) => summary.connectedDevice).map((summary) => [summary.connectedDevice!.id, summary.deviceListLabel])),
    [savedRemoteDeviceSummaries],
  );
  const currentRemoteDeviceConfig = currentDevice
    ? savedRemoteDeviceSummaries.find((summary) => summary.connectedDevice?.id === currentDevice.id)?.config
    : undefined;
  const currentDeviceLabel = currentDevice
    ? currentRemoteDeviceConfig?.name?.trim() && currentRemoteDeviceConfig.name.trim() !== currentDevice.name
      ? `${currentDevice.name}（${currentRemoteDeviceConfig.name.trim()}）`
      : currentDevice.name
    : (deviceLoading ? "加载中" : "暂无设备连接");
  const editingRemoteDeviceSummary = remoteDeviceDialog?.id
    ? savedRemoteDeviceSummaries.find((summary) => summary.config.id === remoteDeviceDialog.id) ?? null
    : null;
  const editingRemoteDeviceTarget = remoteDeviceDialog ? `${remoteDeviceDialog.host.trim()}:${remoteDeviceDialog.port.trim()}` : "";
  const editingConnectedRemoteDevice = Boolean(editingRemoteDeviceSummary?.connectedDevice || (remoteDeviceDialog && devices.some((device) => device.id === editingRemoteDeviceTarget)));
  const activeTheme = THEME_PRESETS.find((theme) => theme.id === activeThemeId) ?? THEME_PRESETS.find((theme) => theme.id === "sky")!;
  const rawExecutionOutput = normalizeOutputText(lastRunResult);
  const executedCommandText = lastRunResult?.executedCommand ?? lastRunResult?.raw ?? "未记录";
  const canRunCommand = Boolean(activePanelCommand && activeCommand && currentDevice) && !deviceOpen && !deviceActionOpen && !catalogOpen;
  const workspaceIsModalOpen = deviceOpen || deviceActionOpen || catalogOpen;
  const workspaceColumns = rightWorkspaceMaximized
    ? "minmax(0, 1fr)"
    : rightCollapsed
      ? `${leftCollapsed ? 88 : leftPanelWidth}px ${leftCollapsed ? 0 : 8}px minmax(${middlePanelWidth}px, 1fr) 0 44px`
      : `${leftCollapsed ? 88 : leftPanelWidth}px ${leftCollapsed ? 0 : 8}px ${middlePanelWidth}px 8px minmax(420px, 1fr)`;
  const diffOptions = useMemo<DiffOption[]>(() => [
    ...(lastRunResult
      ? [{
          id: "current" as DiffTargetId,
          commandText: getResultPrimaryCommand(lastRunResult),
          deviceName: lastRunResult.device_name,
          timeText: "当前执行"
        }]
      : []),
    ...executionHistory.map((item) => ({
      id: item.record_id as DiffTargetId,
      commandText: item.executedCommand ?? item.raw ?? item.command_title,
      deviceName: item.device_name,
      timeText: formatHistoryTimeShort(item)
    }))
  ], [executionHistory, lastRunResult]);
  const leftDiffOption = diffOptions.find((option) => option.id === leftDiffTargetId) ?? null;
  const rightDiffOption = diffOptions.find((option) => option.id === rightDiffTargetId) ?? null;
  const leftDiffResult = useMemo(() => resolveDiffTarget(leftDiffTargetId, lastRunResult, executionHistory), [executionHistory, lastRunResult, leftDiffTargetId]);
  const rightDiffResult = useMemo(() => resolveDiffTarget(rightDiffTargetId, lastRunResult, executionHistory), [executionHistory, lastRunResult, rightDiffTargetId]);
  const leftDiffOutput = useMemo(() => normalizeOutputText(leftDiffResult), [leftDiffResult]);
  const rightDiffOutput = useMemo(() => normalizeOutputText(rightDiffResult), [rightDiffResult]);
  const leftDiffMeta = useMemo(() => getDiffRecordMeta(leftDiffTargetId, lastRunResult, executionHistory), [executionHistory, lastRunResult, leftDiffTargetId]);
  const rightDiffMeta = useMemo(() => getDiffRecordMeta(rightDiffTargetId, lastRunResult, executionHistory), [executionHistory, lastRunResult, rightDiffTargetId]);
  const diffRows = useMemo(() => buildDiffRows(leftDiffOutput, rightDiffOutput), [leftDiffOutput, rightDiffOutput]);
  const historyDetailItem = useMemo(() => historyDetailRecordId ? executionHistory.find((item) => item.record_id === historyDetailRecordId) ?? null : null, [executionHistory, historyDetailRecordId]);
  const historyDetailResult = useMemo(() => historyDetailItem ? historyItemToRunResult(historyDetailItem) : null, [historyDetailItem]);
  const filteredHistoryItems = useMemo(() => executionHistory.filter((item) => {
    if (historyShowUserOnly && item.source !== "user") return false;
    return matchesSearch(formatHistoryItem(item), resultSearchTerm);
  }), [executionHistory, resultSearchTerm, historyShowUserOnly]);
  const currentBuildId = probeResult?.["properties.displayId"] ?? backupInfo?.versionName ?? "未获取";
  const deferredDeviceAppSearchTerm = useDeferredValue(deviceAppSearchTerm);
  const deferredDeviceAppPermissionFilter = useDeferredValue(deviceAppPermissionFilter);
  const deferredDeviceAppsCatalog = useDeferredValue(deviceAppsCatalog);
  const deferredDeviceProcessSearchTerm = useDeferredValue(deviceProcessSearchTerm);
  const deferredDeviceProcessCatalog = useDeferredValue(deviceProcessCatalog);
  const rawLogcatItems = logcatStreamState?.items ?? [];
  const prevLogcatItemsRef = useRef(rawLogcatItems);
  const logcatItems = (() => {
    const prev = prevLogcatItemsRef.current;
    if (prev === rawLogcatItems) return prev;
    if (prev.length === rawLogcatItems.length && prev.at(-1)?.id === rawLogcatItems.at(-1)?.id && prev[0]?.id === rawLogcatItems[0]?.id) {
      return prev;
    }
    prevLogcatItemsRef.current = rawLogcatItems;
    return rawLogcatItems;
  })();
  const deferredLogcatItems = useDeferredValue(logcatItems);
  const logcatSearchRegex = useMemo(() => buildLogcatSearchRegex(logcatSearchTerm, logcatRegexEnabled), [logcatRegexEnabled, logcatSearchTerm]);
  const activeLogcatFilterRules = useMemo(() => logcatFilterRules.filter((rule) => rule.value.trim()), [logcatFilterRules]);
  const logcatCaptureFilters = useMemo(() => buildLogcatCaptureFiltersPayload(logcatSearchTerm, logcatRegexEnabled, logcatFilterRules, logcatLevels), [logcatFilterRules, logcatLevels, logcatRegexEnabled, logcatSearchTerm]);
  const logcatCaptureSignature = useMemo(() => JSON.stringify(logcatCaptureFilters), [logcatCaptureFilters]);
  const filteredLogcatItems = useMemo(() => deferredLogcatItems.filter((entry) => {
    if (activeLogcatFilterRules.length > 0) {
      const matched = activeLogcatFilterRules.reduce((result, rule, index) => {
        const currentMatch = matchesLogcatFilterRule(entry, rule, logcatRegexEnabled);
        if (index === 0) {
          return currentMatch;
        }
        return rule.joiner === "or" ? result || currentMatch : result && currentMatch;
      }, true);
      if (!matched) {
        return false;
      }
    }
    if (logcatLevels.length > 0 && !logcatLevels.includes(entry.level)) {
      return false;
    }

    if (!logcatSearchTerm.trim()) {
      return true;
    }

    const haystack = [entry.timestamp, entry.level, entry.tag, entry.pid, entry.tid, entry.packageName, entry.message, entry.raw].join("\n");
    if (logcatRegexEnabled && logcatSearchRegex) {
      return logcatSearchRegex.test(haystack);
    }
    return haystack.toLowerCase().includes(logcatSearchTerm.trim().toLowerCase());
  }), [activeLogcatFilterRules, deferredLogcatItems, logcatLevels, logcatRegexEnabled, logcatSearchRegex, logcatSearchTerm]);
  const logcatDisplayLineLimit = Math.max(Math.min(logcatConfig?.displayLineLimit ?? 3000, 3000), 200);
  const logcatPinnedSignature = useMemo(() => JSON.stringify({
    search: logcatSearchTerm,
    regex: logcatRegexEnabled,
    advancedOpen: logcatAdvancedOpen,
    rules: logcatFilterRules.map((rule) => ({ field: rule.field, joiner: rule.joiner, value: rule.value })),
    levels: logcatLevels,
    limit: logcatDisplayLineLimit
  }), [logcatAdvancedOpen, logcatDisplayLineLimit, logcatFilterRules, logcatLevels, logcatRegexEnabled, logcatSearchTerm]);
  const renderedLogcatItems = useMemo(() => logcatAutoFollow
    ? filteredLogcatItems.slice(-logcatDisplayLineLimit)
    : (logcatPinnedView?.signature === logcatPinnedSignature ? logcatPinnedView.items : filteredLogcatItems.slice(-logcatDisplayLineLimit)), [filteredLogcatItems, logcatAutoFollow, logcatDisplayLineLimit, logcatPinnedSignature, logcatPinnedView]);
  const deferredRenderedLogcatItems = useDeferredValue(renderedLogcatItems);
  const shouldVirtualizeLogcat = deferredRenderedLogcatItems.length > 50;
  const logcatVirtualRowHeight = logcatWrapEnabled ? LOGCAT_VIRTUAL_WRAP_ROW_HEIGHT : LOGCAT_VIRTUAL_ROW_HEIGHT;
  const logcatVirtualWindow = useMemo(() => {
    const total = deferredRenderedLogcatItems.length;
    if (!total || !shouldVirtualizeLogcat) {
      return {
        startIndex: 0,
        offsetTop: 0,
        offsetBottom: 0,
        items: deferredRenderedLogcatItems,
      };
    }

    const viewportRows = Math.max(Math.ceil((logcatViewportHeight || logcatVirtualRowHeight) / logcatVirtualRowHeight), 1);
    const startIndex = logcatAutoFollow
      ? Math.max(total - viewportRows - LOGCAT_VIRTUAL_OVERSCAN, 0)
      : Math.min(logcatVirtualStartIndex, Math.max(total - viewportRows, 0));
    const endIndex = Math.min(startIndex + viewportRows + LOGCAT_VIRTUAL_OVERSCAN * 2, total);
    return {
      startIndex,
      offsetTop: startIndex * logcatVirtualRowHeight,
      offsetBottom: Math.max(total - endIndex, 0) * logcatVirtualRowHeight,
      items: deferredRenderedLogcatItems.slice(startIndex, endIndex),
    };
  }, [deferredRenderedLogcatItems, logcatAutoFollow, logcatViewportHeight, logcatVirtualRowHeight, logcatVirtualStartIndex, shouldVirtualizeLogcat]);
  const renderedLogcatTailId = renderedLogcatItems.at(-1)?.id ?? "";
  const invalidLogcatRegex = useMemo(() => Boolean(
    logcatRegexEnabled
    && [logcatSearchTerm, ...activeLogcatFilterRules.map((rule) => rule.value)].some((value) => value.trim())
    && [logcatSearchTerm, ...activeLogcatFilterRules.map((rule) => rule.value)].some((value) => value.trim() && !buildLogcatSearchRegex(value, true))
  ), [activeLogcatFilterRules, logcatRegexEnabled, logcatSearchTerm]);
  const logcatRunning = Boolean(logcatStreamState?.running);
  const logcatHighlightTerm = logcatSearchTerm.trim() || logcatFilterRules.find((rule) => ["message", "tag", "package"].includes(rule.field) && rule.value.trim())?.value || "";
  const handleLogcatRowClick = () => setLogcatAutoFollow(false);
  const activePickerRule = logcatPickerState ? logcatFilterRules.find((rule) => rule.id === logcatPickerState.ruleId) ?? null : null;
  const activePickerRuleValues = activePickerRule?.value.split("|").map((value) => value.trim()).filter(Boolean) ?? [];
  const filteredLogcatPackageCatalog = useMemo(() => logcatPackageCatalog.filter((item) => item.toLowerCase().includes(logcatPickerQuery.trim().toLowerCase())), [logcatPackageCatalog, logcatPickerQuery]);
  const filteredLogcatProcessCatalog = useMemo(() => logcatProcessCatalog.filter((item) => {
    const keyword = logcatPickerQuery.trim().toLowerCase();
    if (!keyword) {
      return true;
    }
    return item.pid.includes(keyword) || item.name.toLowerCase().includes(keyword);
  }), [logcatPickerQuery, logcatProcessCatalog]);
  const hasAllLogcatLevels = LOGCAT_LEVEL_OPTIONS.every((level) => logcatLevels.includes(level));
  const hasAllLogcatDefaultLevels = LOGCAT_LEVEL_OPTIONS.every((level) => logcatDefaultLevelsDraft.includes(level));
  const logcatRefreshIntervalMs = normalizeLogcatRefreshIntervalMs(logcatConfig?.refreshIntervalMs);
  const baseInfoSummaryItems = [
    { label: "当前设备", value: currentDeviceLabel },
    { label: "设备序列号", value: currentDevice?.id ?? "未选择" },
    { label: "连接状态", value: currentDevice?.status ?? "未知" },
    { label: "Android 版本", value: probeResult?.["properties.androidVersion"] ?? currentDevice?.androidVersion ?? "未知" },
    { label: "厂商", value: probeResult?.["properties.manufacturer"] ?? "未知" },
    { label: "设备型号", value: probeResult?.["properties.model"] ?? currentDevice?.name ?? "未知" },
    { label: "SDK 级别", value: probeResult?.["properties.sdk"] ?? "未知" },
    { label: "版本号", value: currentBuildId }
  ];
  const translatedProbeItems = useMemo(() => Object.entries(probeResult ?? {})
    .filter(([key, value]) => !["command", "status", "device"].includes(key) && String(value).trim())
    .map(([key, value]) => ({
      key,
      label: PROBE_FIELD_LABELS[key] ?? key,
      value: String(value)
    })), [probeResult]);
  const infoSummaryItems = useMemo(() => [
    ...baseInfoSummaryItems,
    ...translatedProbeItems
      .filter((entry) => !baseInfoSummaryItems.some((item) => item.label === entry.label))
      .map((entry) => ({ label: entry.label, value: entry.value }))
  ], [baseInfoSummaryItems, translatedProbeItems]);
  const deviceUsers = deviceUsersSnapshot?.users ?? [];
  const availableDeviceUserIds = useMemo(() => Array.from(new Set([
    ...deferredDeviceAppsCatalog.flatMap((item) => item.installedUsers),
    ...deviceUsers.map((user) => user.id)
  ])).sort((left, right) => left - right), [deferredDeviceAppsCatalog, deviceUsers]);
  const normalizedDeviceFileBrowserPath = normalizeRemoteFilePath(deviceFileBrowserPath);
  const deviceFileBreadcrumbItems = useMemo(() => {
    const segments = normalizedDeviceFileBrowserPath.split("/").filter(Boolean);
    if (normalizedDeviceFileBrowserPath === "/") {
      return [{ label: "根目录", path: "/" }];
    }

    let currentPath = "";
    return [
      { label: "根目录", path: "/" },
      ...segments.map((segment) => {
        currentPath = currentPath ? `${currentPath}/${segment}` : `/${segment}`;
        return { label: segment, path: currentPath };
      })
    ];
  }, [normalizedDeviceFileBrowserPath]);
  const selectedDeviceFileEntry = deviceFileEntries.find((item) => item.path === deviceFileSelectedPath) ?? null;
  const installableDeviceUserIds = availableDeviceUserIds.length ? availableDeviceUserIds : [0];
  const installTargetUserIds = availableDeviceUserIds.filter((userId) => !deviceAppDetail?.installedUsers.includes(userId));
  const apkExportSummaryText = generalSettingsRules.apkExportMode === "fixed-directory"
    ? (generalSettingsRules.apkExportDirectory.trim() ? `固定目录：${generalSettingsRules.apkExportDirectory.trim()}` : "固定目录未配置")
    : "每次拉取前选择导出目录";
  const filteredDeviceApps = useMemo(() => deferredDeviceAppsCatalog.filter((item) => {
    const keyword = deferredDeviceAppSearchTerm.trim().toLowerCase();
    const permissionKeyword = deferredDeviceAppPermissionFilter.trim().toLowerCase();
    if (!keyword) {
      if (deviceAppScopeFilter === "system" && !item.isSystemApp) {
        return false;
      }
      if (deviceAppScopeFilter === "user" && item.isSystemApp) {
        return false;
      }
      if (deviceAppUserFilter !== "all" && !item.installedUsers.includes(Number(deviceAppUserFilter))) {
        return false;
      }
      if (permissionKeyword && !item.requestedPermissions?.some((permission) => permission.toLowerCase().includes(permissionKeyword))) {
        return false;
      }
      return true;
    }
    if (deviceAppScopeFilter === "system" && !item.isSystemApp) {
      return false;
    }
    if (deviceAppScopeFilter === "user" && item.isSystemApp) {
      return false;
    }
    if (deviceAppUserFilter !== "all" && !item.installedUsers.includes(Number(deviceAppUserFilter))) {
      return false;
    }
    if (permissionKeyword && !item.requestedPermissions?.some((permission) => permission.toLowerCase().includes(permissionKeyword))) {
      return false;
    }
    return item.packageName.toLowerCase().includes(keyword)
      || item.apkPath.toLowerCase().includes(keyword)
      || item.uid.includes(keyword)
      || item.installedUsers.join(",").includes(keyword)
      || item.requestedPermissions?.some((permission) => permission.toLowerCase().includes(keyword));
  }), [deferredDeviceAppPermissionFilter, deferredDeviceAppSearchTerm, deferredDeviceAppsCatalog, deviceAppScopeFilter, deviceAppUserFilter]);
  const filteredDeviceProcesses = useMemo(() => deferredDeviceProcessCatalog.filter((item) => {
    const keyword = deferredDeviceProcessSearchTerm.trim().toLowerCase();
    if (deviceProcessScopeFilter === "app" && !item.appProcess) {
      return false;
    }
    if (deviceProcessScopeFilter === "system" && (item.appProcess || item.kernelThread)) {
      return false;
    }
    if (deviceProcessScopeFilter === "kernel" && !item.kernelThread) {
      return false;
    }
    if (deviceProcessUserFilter !== "all" && item.userId !== Number(deviceProcessUserFilter)) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    return item.name.toLowerCase().includes(keyword)
      || item.packageName.toLowerCase().includes(keyword)
      || item.user.toLowerCase().includes(keyword)
      || item.pid.includes(keyword)
      || item.args.toLowerCase().includes(keyword);
  }).sort((left, right) => {
    const appPriority = Number(right.appProcess) - Number(left.appProcess);
    if (appPriority !== 0) {
      return appPriority;
    }
    const userPriority = (left.userId ?? Number.MAX_SAFE_INTEGER) - (right.userId ?? Number.MAX_SAFE_INTEGER);
    if (userPriority !== 0) {
      return userPriority;
    }
    return left.name.localeCompare(right.name);
  }), [deferredDeviceProcessCatalog, deferredDeviceProcessSearchTerm, deviceProcessScopeFilter, deviceProcessUserFilter]);
  const visibleDeviceApps = useMemo(() => filteredDeviceApps.slice(0, visibleDeviceAppCount), [filteredDeviceApps, visibleDeviceAppCount]);
  const visibleDeviceProcesses = useMemo(() => filteredDeviceProcesses.slice(0, visibleDeviceProcessCount), [filteredDeviceProcesses, visibleDeviceProcessCount]);
  const deviceUserSummaryItems = [
    { label: "当前用户", value: String(deviceUsersSnapshot?.summary?.currentUserId ?? "未知") },
    { label: "最大用户数", value: String(deviceUsersSnapshot?.summary?.maxUsers ?? "未知") },
    { label: "支持切换用户", value: deviceUsersSnapshot?.summary?.supportsSwitchableUsers ?? "未知" },
    { label: "访客临时化", value: deviceUsersSnapshot?.summary?.allGuestsEphemeral ?? "未知" },
    { label: "Headless System", value: deviceUsersSnapshot?.summary?.isHeadlessSystemMode ?? "未知" },
    { label: "已缓存用户", value: deviceUsersSnapshot?.summary?.cachedUserIdsIncludingPreCreated ?? deviceUsersSnapshot?.summary?.cachedUserIds ?? "未知" },
  ];
  const deviceAppComponentSections = [
    { label: "Activity", items: deviceAppDetail?.activities ?? [] },
    { label: "Service", items: deviceAppDetail?.services ?? [] },
    { label: "Receiver", items: deviceAppDetail?.receivers ?? [] },
    { label: "Provider", items: deviceAppDetail?.providers ?? [] },
  ];
  const deviceCarServicePassenger = deviceUsersSnapshot?.carServicePassenger;
  const devicePassengerSummaryItems = [
    { label: "EnablePassengerSupport", value: deviceCarServicePassenger?.enablePassengerSupport || "未知" },
    { label: "NumberOfDrivers", value: deviceCarServicePassenger?.numberOfDrivers || "未知" },
  ];
  const backupRootText = backupInfo?.backupRoot ?? BACKUP_ROOT_PATH;
  const backupVersionText = backupInfo?.versionName ?? currentBuildId;
  const backupDetailItems = [
    { label: "当前设备版本", value: backupVersionText },
    { label: "本地备份根目录", value: backupRootText },
    { label: "当前版本备份目录", value: backupInfo?.currentBackupDir ?? `${backupRootText}/${backupVersionText}` },
    { label: "最近备份时间", value: formatTimestampText(backupInfo?.lastUpdatedAt) }
  ];
  const currentBackupStatus = backupInfo?.currentBackupStatus ?? "未备份";
  const structuredMatchCount = countMatches(formatRunResultSearchText(lastRunResult), resultSearchTerm);
  const rawMatchCount = countMatches(rawExecutionOutput, resultSearchTerm);
  const diffMatchCount = countMatches([
    leftDiffMeta.commandText,
    leftDiffMeta.deviceName,
    leftDiffMeta.timeText,
    leftDiffOutput,
    rightDiffMeta.commandText,
    rightDiffMeta.deviceName,
    rightDiffMeta.timeText,
    rightDiffOutput
  ].join("\n"), resultSearchTerm);
  const historyMatchCount = filteredHistoryItems.length;
  const resultMatchCount = activeResultTab === "structured"
    ? structuredMatchCount
    : activeResultTab === "raw"
      ? rawMatchCount
      : activeResultTab === "diff"
        ? diffMatchCount
        : historyMatchCount;

  useEffect(() => {
    setVisibleDeviceAppCount(INITIAL_VISIBLE_DEVICE_APPS);
  }, [currentDeviceId, deferredDeviceAppSearchTerm, deferredDeviceAppPermissionFilter, deviceAppScopeFilter, deviceAppUserFilter, deviceAppsCatalog.length]);

  useEffect(() => {
    setVisibleDeviceProcessCount(INITIAL_VISIBLE_DEVICE_PROCESSES);
  }, [currentDeviceId, deferredDeviceProcessSearchTerm, deviceProcessScopeFilter, deviceProcessUserFilter, deviceProcessCatalog.length]);

  useEffect(() => {
    if (panels.length === 0) {
      setActivePanelId("");
      setActivePanelCommandId("");
      return;
    }

    const nextPanel = panels.find((panel) => panel.id === activePanelId) ?? panels[0];
    if (nextPanel && nextPanel.id !== activePanelId) {
      setActivePanelId(nextPanel.id);
    }

    if (!nextPanel) {
      return;
    }

    if (nextPanel.commands.length === 0) {
      setActivePanelCommandId("");
      return;
    }

    if (activePanelCommandId && !nextPanel.commands.some((block) => block.id === activePanelCommandId)) {
      setActivePanelCommandId("");
    }
  }, [activePanelCommandId, activePanelId, panels]);

  useEffect(() => {
    const syncDefaultPanelWidths = (workspaceWidth?: number) => {
      if (hasManualWorkspaceResizeRef.current || leftCollapsed || rightWorkspaceMaximized) {
        return;
      }

      const nextWorkspaceWidth = workspaceWidth ?? workspaceRef.current?.getBoundingClientRect().width;
      if (!nextWorkspaceWidth) {
        return;
      }

      const nextWidths = getDefaultPanelWidths(nextWorkspaceWidth);
      setLeftPanelWidth(nextWidths.leftWidth);
      setMiddlePanelWidth(nextWidths.middleWidth);
    };

    syncDefaultPanelWidths();

    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }

    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver((entries) => {
        const nextWidth = entries[0]?.contentRect.width;
        if (nextWidth) {
          syncDefaultPanelWidths(nextWidth);
        }
      });

      resizeObserver.observe(workspace);
      return () => resizeObserver.disconnect();
    }

    const handleResize = () => syncDefaultPanelWidths();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [leftCollapsed, rightWorkspaceMaximized]);

  useEffect(() => {
    let disposed = false;

    const refreshDevices = async () => {
      try {
        const items = await runtimeApi.device.list();
        if (disposed) {
          return;
        }

        applyDeviceCatalog(items);
      } catch {
        if (disposed) {
          return;
        }

        setDevices([]);
        setCurrentDeviceId("");
      } finally {
        if (!disposed) {
          setDeviceLoading(false);
        }
      }
    };

    void refreshDevices();
    const intervalId = window.setInterval(() => {
      void refreshDevices();
    }, 3000);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [runtimeApi]);

  // Track whether file-based panels have been loaded (to avoid overwriting file with stale localStorage data)
  const panelsFileReadyRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(panels));
    // Only save to file after initial file load is complete
    if (panelsFileReadyRef.current) {
      runtimeApi.panels.save({ panels });
    }
  }, [panels]);

  // Load panels from file storage on mount (overrides localStorage if file exists)
  const panelsLoadedFromFileRef = useRef(false);
  useEffect(() => {
    if (panelsLoadedFromFileRef.current) return;
    panelsLoadedFromFileRef.current = true;
    runtimeApi.panels.load().then((result) => {
      if (result?.status === "ok" && result.panels) {
        const normalized = normalizeStoredPanels(result.panels as any);
        if (normalized && normalized.length > 0) {
          setPanels(normalized);
          setActivePanelId(normalized[0]?.id ?? "");
        }
      }
    }).catch(() => {}).finally(() => {
      panelsFileReadyRef.current = true;
    });
  }, [runtimeApi]);

  useEffect(() => {
    applyTheme(activeThemeId);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, activeThemeId);
    }
  }, [activeThemeId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(GENERAL_SETTINGS_STORAGE_KEY, JSON.stringify(generalSettingsRules));
  }, [generalSettingsRules]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(REMOTE_DEVICE_STORAGE_KEY, JSON.stringify(savedRemoteDevices));
  }, [savedRemoteDevices]);

  // Track whether file-based macro tasks have been loaded
  const macroTasksFileReadyRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(KEYSIM_MACRO_TASKS_STORAGE_KEY, JSON.stringify(keySimMacroTasks));
    if (macroTasksFileReadyRef.current) {
      runtimeApi.macroTasks.save({ tasks: keySimMacroTasks });
    }
  }, [keySimMacroTasks]);

  // Load macro tasks from file storage on mount
  useEffect(() => {
    runtimeApi.macroTasks.load().then((result: any) => {
      if (result?.status === "ok" && result.tasks && Array.isArray(result.tasks) && result.tasks.length > 0) {
        setKeySimMacroTasks(result.tasks);
      } else {
        // File doesn't exist yet — persist current localStorage data to file
        runtimeApi.macroTasks.save({ tasks: keySimMacroTasks });
      }
    }).catch(() => {}).finally(() => {
      macroTasksFileReadyRef.current = true;
    });
  }, [runtimeApi]);

  useEffect(() => {
    if (!currentDeviceId) {
      return;
    }

    void runtimeApi.device.probe(currentDeviceId).then((result) => {
      const data = result as Record<string, unknown>;
      const flat: Record<string, string> = {};
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === "string") {
          flat[key] = value;
          continue;
        }

        if (typeof value === "object" && value !== null) {
          for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
            flat[`${key}.${nestedKey}`] = String(nestedValue ?? "");
          }
          continue;
        }

        flat[key] = String(value ?? "");
      }
      setProbeResult(flat);
    });
  }, [currentDeviceId, runtimeApi]);

  useEffect(() => {
    if (!currentDeviceId) {
      setBackupInfo(null);
      return;
    }

    void runtimeApi.backup.info(currentDeviceId).then((result) => {
      setBackupInfo(result as BackupInfo);
    });
  }, [currentDeviceId, runtimeApi]);

  useEffect(() => {
    setDeviceInfoTab("basic");
    setDeviceAppSearchTerm("");
    setDeviceAppUserFilter("all");
    setDeviceAppPermissionFilter("");
    setDeviceAppScopeFilter("all");
    setDeviceAppsCatalog([]);
    setSelectedDeviceAppPackage("");
    setDeviceAppDetail(null);
    setDeviceAppActionResult(null);
    setAppActionMenuOpen(false);
    setAppActionSubmenu(null);
    setDeviceComponentDialog(null);
    setDeviceUsersSnapshot(null);
    setDeviceFileBrowserPath(DEFAULT_DEVICE_FILE_PATH);
    setDeviceFileEntries([]);
    setDeviceFileLoading(false);
    setDeviceFileActionBusy(null);
    setDeviceFileNotice(null);
    setDeviceFileSelectedPath("");
    setDeviceFileUploadTargetPath("");
    setDeviceFileMkdirName("");
    setDeviceFileChmodMode("775");
    setDeviceFileChownValue("");
    setDeviceFileActionResult(null);
    setDeviceProcessSearchTerm("");
    setDeviceProcessUserFilter("all");
    setDeviceProcessScopeFilter("app");
    setDeviceProcessCatalog([]);
    setPendingProcessKill(null);
  }, [currentDeviceId]);

  useEffect(() => {
    if (activeMainView !== "info" || deviceInfoTab !== "apps" || !currentDeviceId || deviceAppsCatalog.length > 0 || deviceAppsLoading) {
      return;
    }

    let cancelled = false;
    setDeviceAppsLoading(true);
    void runtimeApi.device.apps({ deviceId: currentDeviceId }).then((result) => {
      if (cancelled) {
        return;
      }
      const payload = result as DeviceAppCatalog;
      const items = payload.items ?? [];
      startTransition(() => {
        setDeviceAppsCatalog(items);
      });
      if (selectedDeviceAppPackage && !items.some((item) => item.packageName === selectedDeviceAppPackage)) {
        setSelectedDeviceAppPackage("");
        setDeviceAppDetail(null);
      }
    }).finally(() => {
      if (!cancelled) {
        setDeviceAppsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeMainView, currentDeviceId, deviceAppsCatalog.length, deviceInfoTab, runtimeApi]);

  useEffect(() => {
    if (activeMainView !== "info" || deviceInfoTab !== "apps" || !currentDeviceId || !selectedDeviceAppPackage) {
      return;
    }

    let cancelled = false;
    setDeviceAppDetailLoading(true);
    void runtimeApi.device.appDetail({ deviceId: currentDeviceId, packageName: selectedDeviceAppPackage }).then((result) => {
      if (cancelled) {
        return;
      }
      const payload = result as DeviceAppDetailResponse;
      setDeviceAppDetail(payload.detail ?? null);
    }).finally(() => {
      if (!cancelled) {
        setDeviceAppDetailLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeMainView, currentDeviceId, deviceInfoTab, runtimeApi, selectedDeviceAppPackage]);

  useEffect(() => {
    if (!selectedDeviceAppPackage) {
      setDeviceAppActionResult(null);
      setAppActionMenuOpen(false);
      setAppActionSubmenu(null);
      return;
    }

    setDeviceAppActionResult(null);
    setAppActionMenuOpen(false);
    setAppActionSubmenu(null);
  }, [selectedDeviceAppPackage]);

  useEffect(() => {
    if (!uiToast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setUiToast((current) => current?.id === uiToast.id ? null : current);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [uiToast]);

  useEffect(() => {
    if (activeMainView !== "info" || deviceInfoTab !== "users" || !currentDeviceId || deviceUsersSnapshot || deviceUsersLoading) {
      return;
    }

    let cancelled = false;
    setDeviceUsersLoading(true);
    void runtimeApi.device.users({ deviceId: currentDeviceId }).then((result) => {
      if (!cancelled) {
        setDeviceUsersSnapshot(result as DeviceUsersResponse);
      }
    }).finally(() => {
      if (!cancelled) {
        setDeviceUsersLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeMainView, currentDeviceId, deviceInfoTab, deviceUsersSnapshot, runtimeApi]);

  useEffect(() => {
    if (activeMainView !== "info" || deviceInfoTab !== "files" || !currentDeviceId || deviceFileEntries.length > 0 || deviceFileLoading || deviceFileNotice !== null) {
      return;
    }

    void handleLoadDeviceFiles(normalizedDeviceFileBrowserPath);
  }, [activeMainView, currentDeviceId, deviceFileEntries.length, deviceFileLoading, deviceFileNotice, deviceInfoTab, normalizedDeviceFileBrowserPath]);

  useEffect(() => {
    if (activeMainView !== "info" || deviceInfoTab !== "processes" || !currentDeviceId || deviceProcessCatalog.length > 0 || deviceProcessesLoading) {
      return;
    }

    let cancelled = false;
    setDeviceProcessesLoading(true);
    void runtimeApi.device.processes({ deviceId: currentDeviceId }).then((result) => {
      if (!cancelled) {
        const payload = result as DeviceProcessCatalog;
        startTransition(() => {
          setDeviceProcessCatalog(payload.items ?? []);
        });
      }
    }).finally(() => {
      if (!cancelled) {
        setDeviceProcessesLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeMainView, currentDeviceId, deviceInfoTab, deviceProcessCatalog.length, runtimeApi]);

  useEffect(() => {
    void runtimeApi.backup.config().then((result) => {
      const config = result as BackupConfig;
      setBackupConfig(config);
      setBackupVersionPropDraft(config.versionProp ?? "ro.build.display.id");
      setBackupPathsDraft((config.backupPaths ?? []).join("\n"));
      setRestorePathsDraft((config.restorePaths ?? []).join("\n"));
      setSelectedBackupPaths(config.backupPaths ?? []);
      setSelectedRestorePaths(config.restorePaths ?? []);
    });
  }, [runtimeApi]);

  useEffect(() => {
    void runtimeApi.logcat.config().then((result) => {
      const config = result as LogcatConfig;
      setLogcatConfig(config);
      setLogcatOutputDirDraft(config.outputDir ?? DEFAULT_LOGCAT_OUTPUT_DIR);
      setLogcatMaxFileSizeDraft(String(config.maxFileSizeMb ?? 10));
      setLogcatClearBeforeStartDraft(Boolean(config.clearBeforeStart));
      setLogcatClearBeforeStartEnabled(Boolean(config.clearBeforeStart));
      setLogcatDisplayLineLimitDraft(String(config.displayLineLimit ?? 3000));
      setLogcatRefreshIntervalDraft(String(normalizeLogcatRefreshIntervalMs(config.refreshIntervalMs)));
      setLogcatDefaultRegexEnabledDraft(Boolean(config.defaultRegexEnabled));
      const defaultLevels = normalizeLogcatLevelSelection(config.defaultLevels);
      setLogcatDefaultLevelsDraft(defaultLevels);
      setLogcatRegexEnabled(Boolean(config.defaultRegexEnabled));
      setLogcatLevels(defaultLevels);
    });
  }, [runtimeApi]);

  useEffect(() => {
    if (!backupInfo) {
      return;
    }

    if (backupInfo.backupPaths?.length) {
      setSelectedBackupPaths(backupInfo.backupPaths);
    }
    if (backupInfo.restorePaths?.length) {
      setSelectedRestorePaths(backupInfo.restorePaths);
    }
  }, [backupInfo?.backupPaths, backupInfo?.restorePaths]);

  useEffect(() => {
    if (!deviceOpen) {
      return;
    }

    const updatePopupPosition = () => {
      const rect = deviceAnchorRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const width = Math.min(420, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));

      setDevicePopupStyle({
        width,
        top: rect.bottom + 10,
        left
      });
    };

    updatePopupPosition();
    window.addEventListener("resize", updatePopupPosition);
    window.addEventListener("scroll", updatePopupPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopupPosition);
      window.removeEventListener("scroll", updatePopupPosition, true);
    };
  }, [deviceOpen]);

  useEffect(() => {
    if (!deviceActionOpen) {
      return;
    }

    const updatePopupPosition = () => {
      const rect = deviceActionAnchorRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const width = Math.min(420, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));

      setDeviceActionPopupStyle({
        width,
        top: rect.bottom + 10,
        left,
      });
    };

    updatePopupPosition();
    window.addEventListener("resize", updatePopupPosition);
    window.addEventListener("scroll", updatePopupPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopupPosition);
      window.removeEventListener("scroll", updatePopupPosition, true);
    };
  }, [deviceActionOpen]);

  useEffect(() => {
    if (!deviceOpen) {
      return;
    }

    const blockUnderlyingPointer = (event: MouseEvent | PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (devicePopupRef.current?.contains(target) || deviceAnchorRef.current?.contains(target) || deviceScrimRef.current?.contains(target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    document.addEventListener("pointerdown", blockUnderlyingPointer, true);
    document.addEventListener("click", blockUnderlyingPointer, true);
    return () => {
      document.removeEventListener("pointerdown", blockUnderlyingPointer, true);
      document.removeEventListener("click", blockUnderlyingPointer, true);
    };
  }, [deviceOpen]);

  useEffect(() => {
    if (!deviceActionOpen) {
      return;
    }

    const blockUnderlyingPointer = (event: MouseEvent | PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        deviceActionPopupRef.current?.contains(target)
        || deviceActionAnchorRef.current?.contains(target)
        || deviceActionScrimRef.current?.contains(target)
        || deviceDisplayPopupRef.current?.contains(target)
        || deviceInstallPopupRef.current?.contains(target)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    document.addEventListener("pointerdown", blockUnderlyingPointer, true);
    document.addEventListener("click", blockUnderlyingPointer, true);
    return () => {
      document.removeEventListener("pointerdown", blockUnderlyingPointer, true);
      document.removeEventListener("click", blockUnderlyingPointer, true);
    };
  }, [deviceActionOpen]);

  useEffect(() => {
    if (!deviceActionOpen || !currentDeviceId) {
      return;
    }

    let disposed = false;

    const refreshDisplayCatalog = async () => {
      setDeviceDisplayLoading(true);
      try {
        const response = (await runtimeApi.device.displayList({ deviceId: currentDeviceId })) as DeviceDisplayCatalog;
        if (disposed) {
          return;
        }
        setDeviceDisplayCatalog(response.items ?? []);
        setScrcpyAvailable(Boolean(response.scrcpyAvailable));
      } finally {
        if (!disposed) {
          setDeviceDisplayLoading(false);
        }
      }
    };

    void refreshDisplayCatalog();
    return () => {
      disposed = true;
    };
  }, [currentDeviceId, deviceActionOpen, runtimeApi]);

  // Also load display catalog when screen tab is active
  useEffect(() => {
    if (activeMainView !== "info" || deviceInfoTab !== "screen" || !currentDeviceId) return;
    if (deviceDisplayCatalog.length > 0) return;
    let disposed = false;
    (async () => {
      try {
        const response = (await runtimeApi.device.displayList({ deviceId: currentDeviceId })) as DeviceDisplayCatalog;
        if (!disposed) setDeviceDisplayCatalog(response.items ?? []);
      } catch {}
    })();
    return () => { disposed = true; };
  }, [activeMainView, deviceInfoTab, currentDeviceId, runtimeApi]);

  useEffect(() => {
    setDeviceActionOpen(false);
    setDeviceDisplayMenuOpen(false);
    setDeviceInstallMenuOpen(false);
    setScrcpyConfigDialog(null);
  }, [currentDeviceId]);

  useEffect(() => () => {
    if (deviceDisplayCloseTimerRef.current !== null) {
      window.clearTimeout(deviceDisplayCloseTimerRef.current);
    }
    if (deviceInstallCloseTimerRef.current !== null) {
      window.clearTimeout(deviceInstallCloseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    void runtimeApi.history.list({ limit: HISTORY_FETCH_LIMIT }).then((result) => {
      const items = (result as { items?: HistoryItem[] }).items ?? [];
      setExecutionHistory(items);
    });
  }, [runtimeApi]);

  useEffect(() => {
    if (!executionHistory.length) {
      setLeftDiffTargetId("current");
      setRightDiffTargetId("current");
      return;
    }

    setLeftDiffTargetId((current) => {
      if (current === "current") {
        return lastRunResult ? current : (executionHistory[0]?.record_id ?? "current");
      }

      if (executionHistory.some((item) => item.record_id === current)) {
        return current;
      }

      return lastRunResult ? "current" : (executionHistory[0]?.record_id ?? "current");
    });
    setRightDiffTargetId((current) => {
      if (current !== "current" && executionHistory.some((item) => item.record_id === current)) {
        return current;
      }
      return executionHistory[0]?.record_id ?? "current";
    });
  }, [executionHistory, lastRunResult]);

  useEffect(() => {
    if (!exportMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && exportMenuRef.current?.contains(target)) {
        return;
      }
      setExportMenuOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [exportMenuOpen]);

  useEffect(() => {
    if (!openDiffDropdown) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (leftDiffDropdownRef.current?.contains(target) || rightDiffDropdownRef.current?.contains(target)) {
        return;
      }

      setOpenDiffDropdown(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [openDiffDropdown]);

  useEffect(() => {
    if (visibleCommands.length === 0) {
      setActiveCommandId("");
      return;
    }

    if (!activeCatalogCommand || !visibleCommands.some((command) => command.id === activeCatalogCommand.id)) {
      setActiveCommandId(visibleCommands[0].id);
    }
  }, [activeCatalogCommand, visibleCommands]);

  useEffect(() => {
    setRawCommand(activePanelCommand?.rawCommand ?? "");
  }, [activePanelCommand]);

  useEffect(() => {
    if (!contextMenuState) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        setContextMenuState(null);
        return;
      }

      if (contextMenuRef.current?.contains(target)) {
        return;
      }

      setContextMenuState(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenuState(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", () => setContextMenuState(null), { once: true });
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenuState]);

  useEffect(() => {
    if (!currentDeviceId || logcatPaused || activeMainView !== "logcat") {
      return;
    }

    if (!logcatRunning) {
      void refreshLogcatState(currentDeviceId);
      return;
    }

    void refreshLogcatState(currentDeviceId);
    const timer = window.setInterval(() => {
      void refreshLogcatState(currentDeviceId);
    }, logcatRefreshIntervalMs);

    return () => window.clearInterval(timer);
  }, [activeMainView, currentDeviceId, logcatPaused, logcatRunning, logcatRefreshIntervalMs]);

  useEffect(() => {
    if (!currentDeviceId || !logcatRunning) {
      lastAppliedLogcatCaptureSignatureRef.current = logcatCaptureSignature;
      return;
    }

    if (lastAppliedLogcatCaptureSignatureRef.current === logcatCaptureSignature) {
      return;
    }

    lastAppliedLogcatCaptureSignatureRef.current = logcatCaptureSignature;
    setLogcatPaused(false);
    setLogcatAutoFollow(true);
    void runtimeApi.logcat.updateFilters({
      deviceId: currentDeviceId,
      filters: logcatCaptureFilters,
    }).then((result) => {
      startTransition(() => {
        setLogcatStreamState(result as LogcatStreamState);
      });
    });
  }, [currentDeviceId, logcatCaptureFilters, logcatCaptureSignature, logcatRunning, runtimeApi]);

  useEffect(() => {
    if (logcatAutoFollow) {
      setLogcatPinnedView(null);
      return;
    }

    setLogcatPinnedView((current) => {
      if (current?.signature === logcatPinnedSignature) {
        return current;
      }

      return {
        signature: logcatPinnedSignature,
        items: filteredLogcatItems.slice(-logcatDisplayLineLimit)
      };
    });
  }, [filteredLogcatItems, logcatAutoFollow, logcatDisplayLineLimit, logcatPinnedSignature]);

  useEffect(() => {
    if (!logcatAdvancedOpen) {
      setLogcatPickerState(null);
      setLogcatPickerQuery("");
    }
  }, [logcatAdvancedOpen]);

  useEffect(() => {
    if (!logcatAdvancedOpen && !logcatPickerState) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (logcatFilterShellRef.current?.contains(target)) {
        return;
      }
      setLogcatAdvancedOpen(false);
      setLogcatPickerState(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [logcatAdvancedOpen, logcatPickerState]);

  useEffect(() => {
    if (!logcatAutoFollow || logcatPaused) {
      return;
    }

    const list = logcatListRef.current;
    if (!list) {
      return;
    }

    // 虚拟窗口锚到末尾
    const total = deferredRenderedLogcatItems.length;
    const viewportRows = Math.max(Math.ceil((list.clientHeight || logcatVirtualRowHeight) / logcatVirtualRowHeight), 1);
    const endStartIndex = Math.max(total - viewportRows - LOGCAT_VIRTUAL_OVERSCAN, 0);
    setLogcatVirtualStartIndex((current) => current === endStartIndex ? current : endStartIndex);

    list.scrollTop = list.scrollHeight;
  }, [logcatAutoFollow, logcatPaused, renderedLogcatTailId, logcatWrapEnabled, deferredRenderedLogcatItems.length, logcatVirtualRowHeight]);

  useEffect(() => {
    const list = logcatListRef.current;
    if (!list) {
      return;
    }

    const nextViewportHeight = list.clientHeight;
    const nextStartIndex = shouldVirtualizeLogcat
      ? Math.max(Math.floor(list.scrollTop / logcatVirtualRowHeight) - LOGCAT_VIRTUAL_OVERSCAN, 0)
      : 0;

    setLogcatViewportHeight((current) => current === nextViewportHeight ? current : nextViewportHeight);
    setLogcatVirtualStartIndex((current) => current === nextStartIndex ? current : nextStartIndex);
  }, [activeMainView, deferredRenderedLogcatItems.length, logcatMaximized, logcatVirtualRowHeight, shouldVirtualizeLogcat]);

  function beginHorizontalDrag(mode: "left" | "middle", event: React.PointerEvent<HTMLDivElement>) {
    const workspace = workspaceRef.current;
    if (!workspace || rightWorkspaceMaximized) {
      return;
    }

    event.preventDefault();
    hasManualWorkspaceResizeRef.current = true;
    const startX = event.clientX;
    const startLeft = leftPanelWidth;
    const startMiddle = middlePanelWidth;
    const totalWidth = workspace.getBoundingClientRect().width;

    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;

      if (mode === "left") {
        const maxLeft = totalWidth - startMiddle - MIN_RIGHT_PANEL_WIDTH - WORKSPACE_FIXED_CHROME_TOTAL;
        setLeftPanelWidth(Math.min(Math.max(startLeft + deltaX, MIN_LEFT_PANEL_WIDTH), maxLeft));
        return;
      }

      const frozenLeftWidth = leftCollapsed ? 88 : leftPanelWidth;
      const maxMiddle = totalWidth - frozenLeftWidth - MIN_RIGHT_PANEL_WIDTH - WORKSPACE_FIXED_CHROME_TOTAL;
      setMiddlePanelWidth(Math.min(Math.max(startMiddle + deltaX, MIN_MIDDLE_PANEL_WIDTH), maxMiddle));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  function openContextMenu(event: React.MouseEvent, kind: ContextMenuState["kind"], targetId: string) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenuState({
      kind,
      targetId,
      x: event.clientX,
      y: event.clientY
    });
  }

  function updateActivePanelCommands(updater: (commands: PanelCommandBlock[]) => PanelCommandBlock[]) {
    if (!activePanelId) {
      return;
    }

    setPanels((current) => current.map((panel) => {
      if (panel.id !== activePanelId) {
        return panel;
      }

      return {
        ...panel,
        commands: updater(panel.commands)
      };
    }));
  }

  function updateActivePanelCommandRaw(value: string) {
    if (!activePanelCommandId) {
      return;
    }

    setRawCommand(value);
    updateActivePanelCommands((commands) => commands.map((block) => block.id === activePanelCommandId ? { ...block, rawCommand: value } : block));
  }

  function openCreatePanelDialog() {
    setPanelDialogState({
      mode: "create",
      title: "新增命令面板",
      name: "",
      description: ""
    });
  }

  function openEditPanelDialog(panelId: string) {
    const panel = panels.find((item) => item.id === panelId);
    if (!panel) {
      return;
    }

    setPanelDialogState({
      mode: "edit",
      targetId: panelId,
      title: "修改命令面板",
      name: panel.name,
      description: panel.description
    });
  }

  function deletePanel(panelId: string) {
    if (panels.length <= 1) {
      window.alert("至少保留一个命令面板。");
      return;
    }

    const remainingPanels = panels.filter((panel) => panel.id !== panelId);
    setPanels(remainingPanels);

    if (activePanelId === panelId) {
      setActivePanelId(remainingPanels[0]?.id ?? "");
      setActivePanelCommandId("");
    }
  }

  function handleDeletePanelCommand(blockId: string) {
    updateActivePanelCommands((commands) => commands.filter((block) => block.id !== blockId));
    if (blockId === activePanelCommandId) {
      setActivePanelCommandId("");
    }
  }

  async function runPanelCommandBlock(block: PanelCommandBlock) {
    if (!currentDevice) {
      return;
    }

    const commandText = block.rawCommand?.trim() ?? "";
    if (!commandText) {
      return;
    }

    const startTime = performance.now();
    const response = await runtimeApi.command.run({
      deviceId: currentDevice.id,
      deviceName: currentDevice.name,
      commandId: block.commandId,
      commandTitle: getPanelCommandTitle(block, findCommandEntry(block.commandId)?.command ?? null),
      rawCommand: commandText,
      args: [],
    });
    const elapsed = Math.round(performance.now() - startTime);
    applyRunResponse(response, elapsed);
  }

  function openPanelCommandParamDialog(blockId: string) {
    if (!activePanelId) {
      return;
    }

    const block = panelCommands.find((item) => item.id === blockId);
    if (!block) {
      return;
    }

    setPanelCommandParamDialog({
      panelId: activePanelId,
      blockId: block.id,
      commandId: block.commandId,
      title: getPanelCommandTitle(block, findCommandEntry(block.commandId)?.command ?? null),
      params: { ...block.params },
      rawCommand: block.rawCommand,
    });
  }

  function updatePanelCommandDialogParam(key: string, value: string) {
    setPanelCommandParamDialog((current) => {
      if (!current) {
        return current;
      }

      const nextParams = {
        ...current.params,
        [key]: value,
      };
      const command = findCommandEntry(current.commandId)?.command ?? null;
      const nextRawCommand = command ? buildCommandString(command, nextParams) : current.rawCommand;
      return {
        ...current,
        params: nextParams,
        rawCommand: nextRawCommand,
      };
    });
  }

  async function savePanelCommandDialogAndMaybeRun(runAfterSave: boolean) {
    if (!panelCommandParamDialog) {
      return;
    }

    const currentBlock = panelCommands.find((item) => item.id === panelCommandParamDialog.blockId);
    const nextBlock: PanelCommandBlock = {
      id: panelCommandParamDialog.blockId,
      commandId: panelCommandParamDialog.commandId,
      title: currentBlock?.title ?? panelCommandParamDialog.title,
      summary: currentBlock?.summary ?? "",
      params: panelCommandParamDialog.params,
      rawCommand: panelCommandParamDialog.rawCommand,
    };

    setPanels((current) => current.map((panel) => {
      if (panel.id !== panelCommandParamDialog.panelId) {
        return panel;
      }

      return {
        ...panel,
        commands: panel.commands.map((block) => block.id === panelCommandParamDialog.blockId ? {
          ...block,
          params: panelCommandParamDialog.params,
          rawCommand: panelCommandParamDialog.rawCommand,
        } : block),
      };
    }));

    if (activePanelCommandId === panelCommandParamDialog.blockId) {
      setRawCommand(panelCommandParamDialog.rawCommand);
    }

    setPanelCommandParamDialog(null);

    if (runAfterSave) {
      await runPanelCommandBlock(nextBlock);
    }
  }

  function handleContextMenuAction(action: "modify" | "delete" | "rename") {
    if (!contextMenuState) {
      return;
    }

    if (contextMenuState.kind === "panel") {
      if (action === "modify") {
        openEditPanelDialog(contextMenuState.targetId);
      } else {
        deletePanel(contextMenuState.targetId);
      }
    } else if (action === "modify") {
      openPanelCommandParamDialog(contextMenuState.targetId);
    } else if (action === "rename") {
      const block = panelCommands.find((b) => b.id === contextMenuState.targetId);
      if (block) {
        setCommandRenameDialog({ blockId: block.id, name: block.title });
      }
    } else {
      handleDeletePanelCommand(contextMenuState.targetId);
    }

    setContextMenuState(null);
  }

  function submitCommandRename() {
    if (!commandRenameDialog) return;
    const newName = commandRenameDialog.name.trim();
    if (!newName) return;
    updateActivePanelCommands((cmds) =>
      cmds.map((c) => c.id === commandRenameDialog.blockId ? { ...c, title: newName } : c)
    );
    setCommandRenameDialog(null);
  }

  function submitPanelDialog() {
    if (!panelDialogState) {
      return;
    }

    const nextName = panelDialogState.name.trim();
    const nextDescription = panelDialogState.description.trim();
    if (!nextName) {
      return;
    }

    if (panelDialogState.mode === "create") {
      const nextPanel = createPanel(nextName, nextDescription || "用于承载一组常用命令");
      setPanels((current) => [...current, nextPanel]);
      setActivePanelId(nextPanel.id);
      setActivePanelCommandId("");
      setPanelDialogState(null);
      return;
    }

    setPanels((current) => current.map((item) => item.id === panelDialogState.targetId ? {
      ...item,
      name: nextName,
      description: nextDescription
    } : item));
    setPanelDialogState(null);
  }

  function handleAddCommandToPanel() {
    if (!activePanelId || !activeCatalogCommand) {
      return;
    }

    const nextBlock = createPanelCommandBlock(activeCatalogCommand);
    setPanels((current) => current.map((panel) => panel.id === activePanelId ? {
      ...panel,
      commands: [...panel.commands, nextBlock]
    } : panel));
    setActivePanelCommandId(nextBlock.id);
    setCatalogOpen(false);
    setRawCommand(nextBlock.rawCommand);
  }

  function handleSaveCustomCommand() {
    const { title, template, paramOverrides } = customCommandDraft;
    if (!title.trim() || !template.trim()) return;
    const params = parseCustomCommandParams(template).map((p) => ({
      ...p,
      label: paramOverrides[p.key]?.label || p.label,
      defaultValue: paramOverrides[p.key]?.defaultValue || p.defaultValue || "",
    }));
    const next = [...customCommands];
    const editId = customCommandEditId;
    if (editId) {
      const index = next.findIndex((c) => c.id === editId);
      if (index >= 0) next[index] = { ...next[index], title: title.trim(), template: template.trim(), params };
    } else {
      next.push({ id: `custom-${Date.now()}`, title: title.trim(), template: template.trim(), params });
    }
    setCustomCommands(next);
    saveCustomCommands(next);
    setCustomCommandDraft({ title: "", template: "", paramOverrides: {} });
    setCustomCommandEditId(null);

    // Sync panel blocks that reference this custom command
    if (editId) {
      setPanels((current) => current.map((panel) => ({
        ...panel,
        commands: panel.commands.map((block) => {
          if (block.commandId !== editId) return block;
          // Rebuild params keeping existing values where keys still exist
          const newParamKeys = new Set(params.map((p) => p.key));
          const updatedParams: Record<string, string> = {};
          for (const p of params) { updatedParams[p.key] = block.params[p.key] ?? p.defaultValue ?? ""; }
          return { ...block, title: title.trim(), summary: template.trim(), params: updatedParams, rawCommand: template.trim() };
        }),
      })));
    }
  }

  function handleDeleteCustomCommand(id: string) {
    const next = customCommands.filter((c) => c.id !== id);
    setCustomCommands(next);
    saveCustomCommands(next);
    if (customCommandEditId === id) {
      setCustomCommandEditId(null);
      setCustomCommandDraft({ title: "", template: "", paramOverrides: {} });
    }
  }

  function handleEditCustomCommand(entry: CustomCommandEntry) {
    setCustomCommandEditId(entry.id);
    const overrides: Record<string, { label: string; defaultValue: string }> = {};
    for (const p of entry.params) { overrides[p.key] = { label: p.label, defaultValue: p.defaultValue }; }
    setCustomCommandDraft({ title: entry.title, template: entry.template, paramOverrides: overrides });
  }

  function handleUseCustomCommand(entry: CustomCommandEntry) {
    const meta = customCommandMetaMap.get(entry.id);
    if (!meta) return;

    if (!activePanelId) {
      setRawCommand(entry.template);
      setCatalogOpen(false);
      return;
    }
    const nextBlock = createPanelCommandBlock(meta);
    setPanels((current) => current.map((panel) => panel.id === activePanelId ? {
      ...panel,
      commands: [...panel.commands, nextBlock]
    } : panel));
    setActivePanelCommandId(nextBlock.id);
    setCatalogOpen(false);
    setRawCommand(nextBlock.rawCommand);
  }

  async function refreshHistoryList() {
    const historyResponse = (await runtimeApi.history.list({ limit: HISTORY_FETCH_LIMIT })) as { items?: HistoryItem[] };
    setExecutionHistory(historyResponse.items ?? []);
  }

  function pushUiToast(message: string, tone: ToastNotice["tone"] = "info", action?: { label: string; path: string }) {
    setUiToast({ id: Date.now(), message, tone, actionLabel: action?.label, actionPath: action?.path });
  }

  function requestConfirmDialog(config: ConfirmDialogState, onConfirm: () => void) {
    confirmActionRef.current = onConfirm;
    setConfirmDialog(config);
  }

  function handleConfirmDialog() {
    const action = confirmActionRef.current;
    confirmActionRef.current = null;
    setConfirmDialog(null);
    action?.();
  }

  function dismissConfirmDialog() {
    confirmActionRef.current = null;
    setConfirmDialog(null);
  }

  function applyDeviceCatalog(items: DeviceSummary[], preferredDeviceId?: string) {
    setDevices(items);
    setCurrentDeviceId((current) => {
      if (items.length === 0) {
        return "";
      }
      if (preferredDeviceId && items.some((item) => item.id === preferredDeviceId)) {
        return preferredDeviceId;
      }
      if (current && items.some((item) => item.id === current)) {
        return current;
      }
      return items[0]?.id ?? "";
    });
  }

  function upsertRemoteDeviceConfig(config: SavedRemoteDeviceConfig) {
    setSavedRemoteDevices((current) => {
      const next = current.filter((item) => item.id !== config.id && `${item.host}:${item.port}` !== `${config.host}:${config.port}`);
      return [config, ...next];
    });
  }

  function removeRemoteDeviceConfig(configId: string) {
    setSavedRemoteDevices((current) => current.filter((item) => item.id !== configId));
  }

  function openRemoteDeviceDialog(config?: SavedRemoteDeviceConfig) {
    setDeviceOpen(false);
    setRemoteDebugCandidates([]);
    setRemoteDeviceDialog(createRemoteDeviceDialogState(config));
  }

  async function ensureDeviceUsersLoaded() {
    if (!currentDeviceId || deviceUsersSnapshot || deviceUsersLoading) {
      return;
    }

    setDeviceUsersLoading(true);
    try {
      const result = await runtimeApi.device.users({ deviceId: currentDeviceId });
      setDeviceUsersSnapshot(result as DeviceUsersResponse);
    } finally {
      setDeviceUsersLoading(false);
    }
  }

  function openAdbHealthCheckDialog() {
    setDeviceOpen(false);
    setAdbHealthCheckDialogOpen(true);
    void handleRunAdbHealthCheck();
  }

  async function runCurrentDeviceAdbCommand(commandId: string, commandTitle: string, rawCommand: string, options?: { silent?: boolean }) {
    if (!currentDevice) {
      throw new Error("请先选择设备。");
    }

    const startedAt = performance.now();
    const response = await runtimeApi.command.run({
      deviceId: currentDevice.id,
      deviceName: currentDevice.name,
      commandId,
      commandTitle,
      rawCommand,
      args: [],
    });
    const duration = Math.round(performance.now() - startedAt);
    if (options?.silent) {
      setLastRunResult({ ...(response as RunResult), duration });
      void refreshHistoryList();
    } else {
      applyRunResponse(response, duration);
    }
    return response as RunResult;
  }

  async function runHostAdbCommand(commandTitle: string, rawCommand: string, options?: { silent?: boolean }) {
    const startedAt = performance.now();
    const response = await runtimeApi.command.run({
      deviceId: currentDevice?.id ?? "host",
      deviceName: currentDevice?.name ?? "ADB 主机",
      commandId: "custom",
      commandTitle,
      rawCommand,
      args: [],
    });
    const duration = Math.round(performance.now() - startedAt);
    if (options?.silent) {
      setLastRunResult({ ...(response as RunResult), duration });
      void refreshHistoryList();
    } else {
      applyRunResponse(response, duration);
    }
    return response as RunResult;
  }

  async function handleLoadDeviceFiles(nextPath = deviceFileBrowserPath) {
    if (!currentDevice) {
      return;
    }

    if (isBrowserPreviewMode) {
      const message = "当前为浏览器预览模式，文件系统管理不会真正执行。请在 Electron 应用或联调环境中使用。";
      setDeviceFileNotice(message);
      return;
    }

    const targetPath = normalizeRemoteFilePath(nextPath);
    setDeviceFileLoading(true);
    setDeviceFileNotice(null);
    try {
      const response = await runCurrentDeviceAdbCommand("device-file-list", `读取目录 ${targetPath}`, `adb shell ls -la ${JSON.stringify(targetPath)}`, { silent: true });
      const entries = parseDeviceFileEntries(response.stdout, targetPath);
      setDeviceFileEntries(entries);
      setDeviceFileBrowserPath(targetPath);
      setDeviceFileUploadTargetPath(targetPath);
      setDeviceFileSelectedPath((current) => entries.some((item) => item.path === current) ? current : "");
      const errorMessage = response.status === "error"
        ? buildRunFeedback(response, `读取目录 ${targetPath} 失败。`)
        : null;
      const notice = errorMessage
        ? errorMessage
        : entries.length
          ? null
          : "当前目录为空，或设备返回的目录内容暂未被识别。";
      setDeviceFileNotice(notice);
      setDeviceFileActionResult(errorMessage
        ? { tone: "error", message: errorMessage }
        : null);
      if (errorMessage) {
        pushUiToast(errorMessage, "error");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDeviceFileNotice(message);
      setDeviceFileActionResult({ tone: "error", message });
      pushUiToast(message, "error");
    } finally {
      setDeviceFileLoading(false);
    }
  }

  function handleSelectDeviceFile(entry: DeviceFileEntry) {
    setDeviceFileSelectedPath(entry.path);
    setDeviceFileUploadTargetPath(entry.type === "directory" ? `${entry.path}/` : entry.path);
    setDeviceFileActionResult(null);
  }

  async function handleUploadDeviceFile() {
    if (!currentDevice) {
      return;
    }

    if (isBrowserPreviewMode) {
      pushUiToast("当前为浏览器预览模式，上传文件不会真正执行。请在 Electron 应用或联调环境中使用。", "warning");
      return;
    }

    if (!runtimeApi.system?.pickFile) {
      pushUiToast(runtimeApi.status === "ipc-ready" ? "当前 Electron 进程仍在使用旧版预加载脚本，请重启应用后再试。" : "当前环境无法打开本地文件选择器。", "warning");
      return;
    }

    const response = await runtimeApi.system.pickFile({ title: "选择要上传到设备的本地文件" }) as { canceled?: boolean; path?: string };
    if (response.canceled || !response.path) {
      return;
    }

    const localPath = response.path;
    const fileName = getPathLeaf(localPath);
    const draftTarget = deviceFileUploadTargetPath.trim();
    const remoteTarget = !draftTarget
      ? joinRemoteFilePath(normalizedDeviceFileBrowserPath, fileName)
      : draftTarget.endsWith("/")
        ? joinRemoteFilePath(draftTarget, fileName)
        : draftTarget;

    setDeviceFileActionBusy("push");
    try {
      const result = await runCurrentDeviceAdbCommand("device-file-push", `上传文件到 ${remoteTarget}`, `adb push ${JSON.stringify(localPath)} ${JSON.stringify(remoteTarget)}`);
      setDeviceFileActionResult({ tone: resolveFeedbackTone(result.status), message: buildRunFeedback(result, `已上传到 ${remoteTarget}`) });
      setDeviceFileSelectedPath(remoteTarget);
      setDeviceFileUploadTargetPath(remoteTarget);
      if (result.status === "ok") {
        await handleLoadDeviceFiles(normalizedDeviceFileBrowserPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDeviceFileActionResult({ tone: "error", message });
      pushUiToast(message, "error");
    } finally {
      setDeviceFileActionBusy(null);
    }
  }

  async function handlePullDeviceFile() {
    if (!selectedDeviceFileEntry) {
      return;
    }

    if (!runtimeApi.system?.pickDirectory) {
      pushUiToast("当前环境无法打开本地目录选择器。", "warning");
      return;
    }

    const response = await runtimeApi.system.pickDirectory({
      title: `选择 ${selectedDeviceFileEntry.name} 的本地保存目录`,
    }) as { canceled?: boolean; path?: string };
    if (response.canceled || !response.path) {
      return;
    }

    const localTarget = `${response.path.replace(/\/+$/, "")}/${selectedDeviceFileEntry.name}`;
    setDeviceFileActionBusy("pull");
    try {
      const result = await runCurrentDeviceAdbCommand("device-file-pull", `拉取 ${selectedDeviceFileEntry.path}`, `adb pull ${JSON.stringify(selectedDeviceFileEntry.path)} ${JSON.stringify(localTarget)}`);
      const resolvedPathResponse = await runtimeApi.system?.resolvePath?.({ path: localTarget });
      const resolvedPath = (resolvedPathResponse as { path?: string } | undefined)?.path ?? localTarget;
      setDeviceFileActionResult({
        tone: resolveFeedbackTone(result.status),
        message: buildRunFeedback(result, `已拉取到 ${resolvedPath}`),
        path: result.status === "ok" ? resolvedPath : undefined,
      });
      if (result.status === "ok") {
        pushUiToast(`已拉取到 ${resolvedPath}`, "success", { label: "打开所在目录", path: resolvedPath });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDeviceFileActionResult({ tone: "error", message });
      pushUiToast(message, "error");
    } finally {
      setDeviceFileActionBusy(null);
    }
  }

  async function handleCreateDeviceDirectory() {
    const directoryName = deviceFileMkdirName.trim();
    if (!directoryName) {
      pushUiToast("请先输入要创建的目录名称。", "warning");
      return;
    }

    const targetPath = joinRemoteFilePath(normalizedDeviceFileBrowserPath, directoryName);
    setDeviceFileActionBusy("mkdir");
    try {
      const result = await runCurrentDeviceAdbCommand("device-file-mkdir", `新建目录 ${targetPath}`, `adb shell mkdir -p ${JSON.stringify(targetPath)}`);
      setDeviceFileActionResult({ tone: resolveFeedbackTone(result.status), message: buildRunFeedback(result, `已创建目录 ${targetPath}`) });
      if (result.status === "ok") {
        setDeviceFileMkdirName("");
        await handleLoadDeviceFiles(normalizedDeviceFileBrowserPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDeviceFileActionResult({ tone: "error", message });
      pushUiToast(message, "error");
    } finally {
      setDeviceFileActionBusy(null);
    }
  }

  async function handleChmodDeviceFile() {
    if (!selectedDeviceFileEntry) {
      return;
    }

    const mode = deviceFileChmodMode.trim();
    if (!mode) {
      pushUiToast("请先输入 chmod 模式，例如 775。", "warning");
      return;
    }

    setDeviceFileActionBusy("chmod");
    try {
      const result = await runCurrentDeviceAdbCommand("device-file-chmod", `修改权限 ${selectedDeviceFileEntry.name}`, `adb shell chmod ${mode} ${JSON.stringify(selectedDeviceFileEntry.path)}`);
      setDeviceFileActionResult({ tone: resolveFeedbackTone(result.status), message: buildRunFeedback(result, `已更新 ${selectedDeviceFileEntry.path} 的权限`) });
      if (result.status === "ok") {
        await handleLoadDeviceFiles(normalizedDeviceFileBrowserPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDeviceFileActionResult({ tone: "error", message });
      pushUiToast(message, "error");
    } finally {
      setDeviceFileActionBusy(null);
    }
  }

  async function handleChownDeviceFile() {
    if (!selectedDeviceFileEntry) {
      return;
    }

    const owner = deviceFileChownValue.trim();
    if (!owner) {
      pushUiToast("请先输入 chown 目标，例如 shell:shell。", "warning");
      return;
    }

    setDeviceFileActionBusy("chown");
    try {
      const result = await runCurrentDeviceAdbCommand("device-file-chown", `修改归属 ${selectedDeviceFileEntry.name}`, `adb shell chown ${owner} ${JSON.stringify(selectedDeviceFileEntry.path)}`);
      setDeviceFileActionResult({ tone: resolveFeedbackTone(result.status), message: buildRunFeedback(result, `已更新 ${selectedDeviceFileEntry.path} 的归属`) });
      if (result.status === "ok") {
        await handleLoadDeviceFiles(normalizedDeviceFileBrowserPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDeviceFileActionResult({ tone: "error", message });
      pushUiToast(message, "error");
    } finally {
      setDeviceFileActionBusy(null);
    }
  }

  function handleRequestDeleteDeviceFile() {
    if (!selectedDeviceFileEntry) {
      return;
    }

    requestConfirmDialog(
      {
        title: `删除 ${selectedDeviceFileEntry.name}`,
        message: selectedDeviceFileEntry.type === "directory"
          ? `将递归删除目录 ${selectedDeviceFileEntry.path} 及其内部内容。请确认当前设备和路径无误。`
          : `将删除文件 ${selectedDeviceFileEntry.path}。请确认当前设备和路径无误。`,
        tone: "danger",
        confirmLabel: "确认删除",
      },
      () => {
        void handleDeleteDeviceFile();
      },
    );
  }

  async function handleDeleteDeviceFile() {
    if (!selectedDeviceFileEntry) {
      return;
    }

    const rawCommand = selectedDeviceFileEntry.type === "directory"
      ? `adb shell rm -rf ${JSON.stringify(selectedDeviceFileEntry.path)}`
      : `adb shell rm -f ${JSON.stringify(selectedDeviceFileEntry.path)}`;

    setDeviceFileActionBusy("delete");
    try {
      const result = await runCurrentDeviceAdbCommand("device-file-delete", `删除 ${selectedDeviceFileEntry.path}`, rawCommand);
      setDeviceFileActionResult({ tone: resolveFeedbackTone(result.status), message: buildRunFeedback(result, `已删除 ${selectedDeviceFileEntry.path}`) });
      if (result.status === "ok") {
        setDeviceFileSelectedPath("");
        await handleLoadDeviceFiles(normalizedDeviceFileBrowserPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDeviceFileActionResult({ tone: "error", message });
      pushUiToast(message, "error");
    } finally {
      setDeviceFileActionBusy(null);
    }
  }

  async function handleDiscoverRemoteDebugServices() {
    if (!remoteDeviceDialog) {
      return;
    }

    if (isBrowserPreviewMode) {
      const message = "当前为浏览器预览模式，扫描无线调试地址不会真正执行。请在 Electron 应用或联调环境中使用。";
      setRemoteDeviceDialog((current) => current ? { ...current, notice: message } : current);
      pushUiToast(message, "warning");
      return;
    }

    setRemoteDeviceDialog((current) => current ? { ...current, busy: "discover", notice: null } : current);
    try {
      let candidates: RemoteDebugServiceCandidate[] = [];
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await runHostAdbCommand("扫描无线调试地址", "adb mdns services", { silent: true });
        candidates = parseRemoteDebugServiceCandidates(response.stdout);
        if (candidates.length > 0) {
          break;
        }
        if (attempt < 3) {
          await new Promise((resolve) => window.setTimeout(resolve, 500));
        }
      }
      const connectCount = candidates.filter((candidate) => candidate.kind === "connect").length;
      const pairingCount = candidates.length - connectCount;
      setRemoteDebugCandidates(candidates);
      setRemoteDeviceDialog((current) => current ? {
        ...current,
        busy: null,
        notice: candidates.length
          ? `已发现 ${connectCount} 个连接地址、${pairingCount} 个配对地址，点击下方候选项可直接回填。`
          : "连续重试后仍未发现无线调试地址。常见原因是手机已离开无线调试页面、屏幕熄灭、刚切网，或者设备尚未开始广播 connect 服务。请保持手机亮屏停留在无线调试页面后重新扫描。",
      } : current);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRemoteDebugCandidates([]);
      setRemoteDeviceDialog((current) => current ? { ...current, busy: null, notice: message } : current);
      pushUiToast(message, "error");
    }
  }

  async function discoverRemoteConnectCandidate(pairingGuid: string) {
    let latestCandidates: RemoteDebugServiceCandidate[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const mdnsResult = await runHostAdbCommand("扫描无线调试地址", "adb mdns services", { silent: true });
      latestCandidates = parseRemoteDebugServiceCandidates(mdnsResult.stdout);
      setRemoteDebugCandidates(latestCandidates);
      const connectCandidate = pairingGuid
        ? latestCandidates.find((candidate) => candidate.kind === "connect" && candidate.name === pairingGuid)
        : latestCandidates.find((candidate) => candidate.kind === "connect");
      if (connectCandidate) {
        return { connectCandidate, latestCandidates };
      }
      if (attempt < 4) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
    }
    return { connectCandidate: null, latestCandidates };
  }

  async function handleRunAdbHealthCheck() {
    if (isBrowserPreviewMode) {
      const message = "当前为浏览器预览模式，ADB 健康检查不会真正执行。请在 Electron 应用或联调环境中使用。";
      setAdbHealthCheckDialogOpen(true);
      setAdbHealthCheck({ busy: false, summary: message, steps: [] });
      pushUiToast(message, "warning");
      return;
    }

    setAdbHealthCheckDialogOpen(true);
    setAdbHealthCheck({ busy: true, summary: "正在执行 ADB 健康检查...", steps: [] });
    try {
      const versionResult = await runHostAdbCommand("ADB 健康检查：version", "adb version", { silent: true });
      const startResult = await runHostAdbCommand("ADB 健康检查：start-server", "adb start-server", { silent: true });
      const devicesResult = await runHostAdbCommand("ADB 健康检查：devices", "adb devices -l", { silent: true });

      const steps: AdbHealthCheckState["steps"] = [
        {
          label: "ADB 版本",
          tone: versionResult.status === "ok" ? "success" : "error",
          detail: buildRunFeedback(versionResult, versionResult.stdout?.trim() || "未返回版本信息。"),
        },
        {
          label: "启动 server",
          tone: startResult.status === "ok" ? "success" : "error",
          detail: buildRunFeedback(startResult, startResult.stdout?.trim() || "未返回启动信息。"),
        },
        {
          label: "设备列表",
          tone: devicesResult.status === "ok" ? "success" : "error",
          detail: buildRunFeedback(devicesResult, devicesResult.stdout?.trim() || "未返回设备列表。"),
        },
      ];

      const summary = devicesResult.status === "ok"
        ? "ADB 健康检查通过：server 可用，设备列表可读取。"
        : "ADB 健康检查异常：server 启停或设备枚举存在问题，请查看下方分步结果。";

      setAdbHealthCheck({ busy: false, summary, steps });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAdbHealthCheck({ busy: false, summary: message, steps: [] });
      pushUiToast(message, "error");
    }
  }

  async function refreshConnectedDevices(preferredDeviceId?: string) {
    let latestItems: DeviceSummary[] = [];
    const attempts = preferredDeviceId ? 6 : 1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      latestItems = await runtimeApi.device.list();
      const targetVisible = preferredDeviceId ? latestItems.some((item) => item.id === preferredDeviceId) : latestItems.length > 0;
      if (targetVisible || (!preferredDeviceId && latestItems.length > 0)) {
        applyDeviceCatalog(latestItems, preferredDeviceId);
        return latestItems;
      }
      if (attempt < attempts - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
    }

    if (!preferredDeviceId && latestItems.length === 0) {
      applyDeviceCatalog(latestItems);
    }

    return latestItems;
  }

  async function handleConnectRemoteDevice(mode: "connect" | "pair-connect", preset?: SavedRemoteDeviceConfig) {
    const source = preset
      ? { ...createRemoteDeviceDialogState(preset), saveConfig: true }
      : remoteDeviceDialog;
    if (!source) {
      return;
    }

    if (isBrowserPreviewMode) {
      const message = "当前为浏览器预览模式，连接命令不会真正执行。请在 Electron 应用或联调环境中使用。";
      setRemoteDeviceDialog((current) => current ? { ...current, notice: message } : current);
      pushUiToast(message, "warning");
      return;
    }

    const host = source.host.trim();
    const port = source.port.trim();
    if (!host || !port) {
      const message = "请先填写设备 IP 地址和连接端口。";
      setRemoteDeviceDialog((current) => current ? { ...current, notice: message } : current);
      pushUiToast(message, "warning");
      return;
    }

    const pairHost = (source.pairHost || host).trim();
    const pairPort = source.pairPort.trim();
    const pairingCode = source.pairingCode.trim();
    if (mode === "pair-connect" && source.pairMode !== "manual") {
      const message = "请先切换到手动配对模式，再填写配对地址、端口和配对码。";
      setRemoteDeviceDialog((current) => current ? { ...current, notice: message } : current);
      pushUiToast(message, "warning");
      return;
    }
    if (mode === "pair-connect" && (!pairHost || !pairPort || !pairingCode)) {
      const message = "配对模式需要填写配对地址、配对端口和配对码。";
      setRemoteDeviceDialog((current) => current ? { ...current, notice: message } : current);
      pushUiToast(message, "warning");
      return;
    }

    const target = `${host}:${port}`;
    const persistedConfig: SavedRemoteDeviceConfig = {
      id: source.id || target,
      name: source.name.trim(),
      host,
      port,
      pairHost,
      pairPort,
    };

    if (!preset) {
      setRemoteDeviceDialog((current) => current ? { ...current, busy: mode, notice: null } : current);
    }

    try {
      let connectTarget = target;
      let refreshedPreferredDeviceId = target;
      let nextConfigHost = host;
      let nextConfigPort = port;

      if (mode === "connect") {
        try {
          const mdnsResult = await runHostAdbCommand("扫描无线调试地址", "adb mdns services", { silent: true });
          const latestCandidates = parseRemoteDebugServiceCandidates(mdnsResult.stdout);
          setRemoteDebugCandidates(latestCandidates);
          const connectCandidate = latestCandidates.find((candidate) => candidate.kind === "connect" && candidate.host === host);
          if (connectCandidate) {
            connectTarget = `${connectCandidate.host}:${connectCandidate.port}`;
            refreshedPreferredDeviceId = connectTarget;
            nextConfigHost = connectCandidate.host;
            nextConfigPort = connectCandidate.port;
            setPendingRemoteConnectIds((current) => current.filter((id) => id !== persistedConfig.id));
          } else if (latestCandidates.some((candidate) => candidate.kind === "pairing" && candidate.host === host)) {
            const message = pendingRemoteConnectIds.includes(persistedConfig.id)
              ? `该设备已完成配对，但仍未发现可用连接地址，请在设备端确认无线调试已进入可连接状态后重新扫描。`
              : `当前只发现 ${host} 的配对地址，未发现连接地址；保存的连接端口 ${port} 可能已过期，请重新扫描后再连接。`;
            setRemoteDeviceDialog((current) => current ? { ...current, busy: null, notice: message } : current);
            pushUiToast(message, "warning");
            return;
          }
        } catch {
          // 扫描失败时回退到用户手填的连接地址
        }
      }

      if (mode === "pair-connect") {
        const pairResult = await runHostAdbCommand(`配对 ${pairHost}:${pairPort}`, `adb pair ${pairHost}:${pairPort} ${pairingCode}`);
        if (pairResult.status !== "ok") {
          const message = buildRunFeedback(pairResult, `配对 ${pairHost}:${pairPort} 失败。`);
          setRemoteDeviceDialog((current) => current ? { ...current, busy: null, notice: message } : current);
          return;
        }

        const pairingGuid = extractPairingGuid(pairResult.stdout);
        const { connectCandidate } = await discoverRemoteConnectCandidate(pairingGuid);
        if (!connectCandidate) {
          setPendingRemoteConnectIds((current) => current.includes(persistedConfig.id) ? current : [...current, persistedConfig.id]);
          const message = pairingGuid
            ? `配对已成功，但暂未发现 ${pairingGuid} 的连接地址，请在设备端确认无线调试已进入可连接状态后重新扫描。`
            : "配对已成功，但暂未发现可用的连接地址，请重新扫描无线调试地址。";
          setRemoteDeviceDialog((current) => current ? { ...current, busy: null, notice: message } : current);
          pushUiToast(message, "warning");
          return;
        }

        connectTarget = `${connectCandidate.host}:${connectCandidate.port}`;
        refreshedPreferredDeviceId = connectTarget;
        nextConfigHost = connectCandidate.host;
        nextConfigPort = connectCandidate.port;
      }

      const connectResult = await runHostAdbCommand(`连接 ${connectTarget}`, `adb connect ${connectTarget}`);
      if (connectResult.status !== "ok") {
        const message = buildRunFeedback(connectResult, `连接 ${connectTarget} 失败。`);
        setRemoteDeviceDialog((current) => current ? { ...current, busy: null, notice: message } : current);
        return;
      }

      if (source.saveConfig) {
        upsertRemoteDeviceConfig({
          ...persistedConfig,
          host: nextConfigHost,
          port: nextConfigPort,
        });
      }
      setPendingRemoteConnectIds((current) => current.filter((id) => id !== persistedConfig.id));
      const refreshedItems = await refreshConnectedDevices(refreshedPreferredDeviceId);
      if (!refreshedItems.some((item) => item.id === refreshedPreferredDeviceId || item.id === connectTarget)) {
        const message = `ADB 已返回连接成功，但设备列表暂未出现 ${connectTarget}，已保留当前设备列表等待后续刷新。`;
        setRemoteDeviceDialog((current) => current ? { ...current, busy: null, notice: message } : current);
        pushUiToast(message, "warning");
        return;
      }
      setRemoteDeviceDialog(null);
      setDeviceOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRemoteDeviceDialog((current) => current ? { ...current, busy: null, notice: message } : current);
      pushUiToast(message, "error");
    } finally {
      if (!preset) {
        setRemoteDeviceDialog((current) => current ? { ...current, busy: null } : current);
      }
    }
  }

  async function handleDisconnectRemoteDevice(config: SavedRemoteDeviceConfig, connectedDeviceId?: string) {
    if (isBrowserPreviewMode) {
      const message = "当前为浏览器预览模式，断开命令不会真正执行。请在 Electron 应用或联调环境中使用。";
      pushUiToast(message, "warning");
      return;
    }

    const target = connectedDeviceId || `${config.host}:${config.port}`;
    try {
      await runHostAdbCommand(`断开 ${target}`, `adb disconnect ${target}`);
      await refreshConnectedDevices();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushUiToast(message, "error");
    }
  }

  function handleSaveRemoteDeviceConfig() {
    if (!remoteDeviceDialog) {
      return;
    }

    const host = remoteDeviceDialog.host.trim();
    const port = remoteDeviceDialog.port.trim();
    if (!host || !port) {
      const message = "保存配置前请先填写设备 IP 地址和连接端口。";
      setRemoteDeviceDialog((current) => current ? { ...current, notice: message } : current);
      pushUiToast(message, "warning");
      return;
    }

    const config: SavedRemoteDeviceConfig = {
      id: remoteDeviceDialog.id || `${host}:${port}`,
      name: remoteDeviceDialog.name.trim(),
      host,
      port,
      pairHost: (remoteDeviceDialog.pairHost || host).trim(),
      pairPort: remoteDeviceDialog.pairPort.trim(),
    };
    upsertRemoteDeviceConfig(config);
    setRemoteDeviceDialog((current) => current ? { ...current, id: config.id, notice: `已保存配置：${config.name || `${config.host}:${config.port}`}` } : current);
    pushUiToast(`已保存远程设备配置：${config.name || `${config.host}:${config.port}`}`, "success");
  }

  function clearDeviceInstallCloseTimer() {
    if (deviceInstallCloseTimerRef.current !== null) {
      window.clearTimeout(deviceInstallCloseTimerRef.current);
      deviceInstallCloseTimerRef.current = null;
    }
  }

  function openDeviceInstallMenu(anchor: HTMLElement) {
    if (!currentDevice) {
      return;
    }
    clearDeviceInstallCloseTimer();
    const rect = anchor.getBoundingClientRect();
    const width = 300;
    setDeviceInstallPopupStyle({
      width,
      top: rect.top,
      left: Math.max(12, rect.left - width - 8),
      maxHeight: Math.min(window.innerHeight - 24, 520),
    });
    setDeviceInstallMenuOpen(true);
    void ensureDeviceUsersLoaded();
  }

  function scheduleCloseDeviceInstallMenu() {
    clearDeviceInstallCloseTimer();
    deviceInstallCloseTimerRef.current = window.setTimeout(() => {
      setDeviceInstallMenuOpen(false);
    }, 120);
  }

  async function handleInstallDeviceApk(userId?: number) {
    if (!currentDevice) {
      return;
    }

    if (isBrowserPreviewMode) {
      const message = "当前为浏览器预览模式，APK 安装不会真正执行。请在 Electron 应用或联调环境中使用。";
      pushUiToast(message, "warning");
      return;
    }

    if (!runtimeApi.system?.pickFile) {
      pushUiToast(runtimeApi.status === "ipc-ready" ? "当前 Electron 进程仍在使用旧版预加载脚本，请重启应用后再试。" : "当前为浏览器预览模式，无法打开本地文件选择器。", "warning");
      return;
    }

    setDeviceInstallMenuOpen(false);
    setDeviceActionOpen(false);

    const response = await runtimeApi.system.pickFile({
      title: userId === undefined ? "选择要安装的 APK" : `选择要安装到用户 ${userId} 的 APK`,
      filters: [{ name: "APK 文件", extensions: ["apk"] }],
    }) as { canceled?: boolean; path?: string };

    if (response.canceled || !response.path) {
      return;
    }

    const targetPath = response.path;
    const userArg = userId === undefined ? "" : ` --user ${userId}`;
    const commandTitle = userId === undefined ? "安装 APK" : `安装 APK 到用户 ${userId}`;
    const commandId = userId === undefined ? "device-install-apk" : `device-install-apk-user-${userId}`;

    setDeviceInstallApkBusy(commandId);
    try {
      const startedAt = performance.now();
      const command = `adb install -r${userArg} ${JSON.stringify(targetPath)}`;
      const result = await runtimeApi.command.run({
        deviceId: currentDevice.id,
        deviceName: currentDevice.name,
        commandId,
        commandTitle,
        rawCommand: command,
        args: [],
      });
      applyRunResponse(result, Math.round(performance.now() - startedAt));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushUiToast(message, "error");
    } finally {
      setDeviceInstallApkBusy(null);
    }
  }

  function applyRunResponse(response: unknown, duration?: number) {
    const runResult = { ...(response as RunResult) };
    if (typeof duration === "number") {
      runResult.duration = duration;
    }
    setLastRunResult(runResult);
    pushUiToast(buildRunFeedback(runResult, `${runResult.command_title || "命令"} 已执行。`), resolveFeedbackTone(runResult.status));
    const record = response as Partial<HistoryItem>;
    if (record.record_id && record.device_name && record.command_title) {
      setExecutionHistory((current) => [record as HistoryItem, ...current.filter((item) => item.record_id !== record.record_id)].slice(0, HISTORY_FETCH_LIMIT));
      return;
    }
    void refreshHistoryList();
  }

  async function handleOpenLocalPath(path: string) {
    const response = await runtimeApi.system?.openPath?.({ path });
    const payload = response as { status?: string; message?: string; path?: string } | undefined;
    pushUiToast(payload?.message ?? `已尝试打开路径：${payload?.path ?? path}`, payload?.status === "error" ? "error" : "success");
  }

  async function handleChooseApkExportDirectory() {
    const response = await runtimeApi.system?.pickDirectory?.({
      title: "选择 APK 固定导出目录",
      defaultPath: generalSettingsRulesDraft.apkExportDirectory,
    });
    const payload = response as { canceled?: boolean; path?: string } | undefined;
    if (payload?.canceled || !payload?.path) {
      return;
    }
    const nextRules = { ...generalSettingsRulesDraft, apkExportDirectory: payload.path || "" };
    setGeneralSettingsRulesDraft(nextRules);
  }

  async function handlePullCurrentApk() {
    if (!deviceAppDetail) {
      return;
    }

    const activeRules = generalSettingsRules;

    let exportDirectory = activeRules.apkExportMode === "fixed-directory"
      ? activeRules.apkExportDirectory.trim()
      : "";

    if (activeRules.apkExportMode === "custom-directory") {
      const response = await runtimeApi.system?.pickDirectory?.({
        title: `选择 ${deviceAppDetail.packageName} 的导出目录`,
        defaultPath: activeRules.apkExportDirectory,
      });
      const payload = response as { canceled?: boolean; path?: string } | undefined;
      if (payload?.canceled) {
        return;
      }
      exportDirectory = payload?.path?.trim() ?? "";
    }

    if (!exportDirectory) {
      pushUiToast("请先在设置中心配置固定导出目录，或将导出方式切换为“每次选择目录”。", "warning");
      setSettingsOpen(true);
      setSettingsTab("general");
      return;
    }

    setAppActionMenuOpen(false);
    setAppActionSubmenu(null);
    const targetPath = buildApkExportPath(exportDirectory, deviceAppDetail.packageName);
    await handleDeviceAppCommand(
      "app-pull-apk",
      `拉取 ${deviceAppDetail.packageName} APK`,
      `adb pull ${deviceAppDetail.apkPath} ${targetPath}`,
      {
        resultPath: targetPath,
        prerequisite: isPrivilegedApkPath(deviceAppDetail.apkPath)
          ? "当前 APK 位于系统分区。拉取这类文件前通常需要先执行 root 和 remount，否则很可能因为权限不足而失败。"
          : undefined,
        confirmTone: "warning",
        confirmLabel: "确认继续拉取",
      },
    );
  }

  async function handleDeviceAppCommand(commandId: string, commandTitle: string, rawCommand: string, options?: { prerequisite?: string; resultPath?: string; confirmTone?: "warning" | "danger"; confirmLabel?: string }) {
    if (!currentDevice || !selectedDeviceAppPackage) {
      return;
    }

    if (options?.prerequisite) {
      requestConfirmDialog(
        {
          title: commandTitle,
          message: options.prerequisite,
          tone: options.confirmTone ?? "warning",
          confirmLabel: options.confirmLabel ?? "继续执行",
        },
        () => {
          void handleDeviceAppCommand(commandId, commandTitle, rawCommand, { ...options, prerequisite: undefined });
        }
      );
      return;
    }

    setDeviceAppActionBusy(commandId);
    setDeviceAppActionResult(null);
    try {
      const startTime = performance.now();
      const response = await runtimeApi.command.run({
        deviceId: currentDevice.id,
        deviceName: currentDevice.name,
        commandId,
        commandTitle,
        rawCommand,
        args: []
      });
      const elapsed = Math.round(performance.now() - startTime);
      applyRunResponse(response, elapsed);
      const result = response as RunResult;
      const baseMessage = buildRunFeedback(result, `${commandTitle} 已执行。`);
      const resolvedPathResponse = options?.resultPath ? await runtimeApi.system?.resolvePath?.({ path: options.resultPath }) : undefined;
      const resolvedResultPath = (resolvedPathResponse as { path?: string } | undefined)?.path ?? options?.resultPath;
      setDeviceAppActionResult({
        tone: resolveFeedbackTone(result.status),
        message: result.status === "ok" && resolvedResultPath ? `${commandTitle} 已执行。` : baseMessage,
        path: result.status === "ok" ? resolvedResultPath : undefined,
      });
      if (result.status === "ok" && resolvedResultPath) {
        pushUiToast(`${commandTitle} 已完成。`, "success", { label: "打开所在目录", path: resolvedResultPath });
      }

      const nextApps = (await runtimeApi.device.apps({ deviceId: currentDevice.id })) as DeviceAppCatalog;
      startTransition(() => {
        setDeviceAppsCatalog(nextApps.items ?? []);
      });

      if (commandId === "app-uninstall-full" && result.status === "ok") {
        setSelectedDeviceAppPackage("");
        setDeviceAppDetail(null);
      } else if (selectedDeviceAppPackage) {
        const detailResponse = (await runtimeApi.device.appDetail({ deviceId: currentDevice.id, packageName: selectedDeviceAppPackage })) as DeviceAppDetailResponse;
        setDeviceAppDetail(detailResponse.detail ?? null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDeviceAppActionResult({ tone: "error", message });
      pushUiToast(message, "error");
    } finally {
      setDeviceAppActionBusy(null);
    }
  }

  async function handleConfirmKillProcess() {
    if (!currentDevice || !pendingProcessKill) {
      return;
    }

    const target = pendingProcessKill;
    setPendingProcessKill(null);
    try {
      const startTime = performance.now();
      const response = await runtimeApi.command.run({
        deviceId: currentDevice.id,
        deviceName: currentDevice.name,
        commandId: "process-kill",
        commandTitle: `杀死进程 ${target.name} (${target.pid})`,
        rawCommand: `adb shell kill -9 ${target.pid}`,
        args: []
      });
      applyRunResponse(response, Math.round(performance.now() - startTime));
      const processResponse = (await runtimeApi.device.processes({ deviceId: currentDevice.id })) as DeviceProcessCatalog;
      startTransition(() => {
        setDeviceProcessCatalog(processResponse.items ?? []);
      });
    } catch (error) {
      pushUiToast(error instanceof Error ? error.message : String(error), "error");
    }
  }

  function handleOpenComponentDetail(componentName: string) {
    const detail = deviceAppDetail?.componentDetails?.[componentName];
    setDeviceComponentDialog({
      componentName,
      detail: detail ?? {
        name: componentName,
        componentType: "组件",
        actions: [],
        categories: [],
        mimeTypes: [],
        schemes: [],
        authorities: [],
        paths: [],
        rawLines: []
      }
    });
  }

  async function refreshLogcatState(deviceId = currentDeviceId) {
    if (!deviceId) {
      setLogcatStreamState(null);
      return;
    }

    const response = (await runtimeApi.logcat.state({ deviceId })) as LogcatStreamState;
    const items = response.items ?? [];
    const snapshot = lastLogcatSnapshotRef.current;
    const newSnapshot = {
      bufferedLines: response.bufferedLines ?? items.length,
      capturedAt: response.capturedAt,
      lastId: items.at(-1)?.id ?? "",
    };

    if (
      snapshot.bufferedLines === newSnapshot.bufferedLines &&
      snapshot.capturedAt === newSnapshot.capturedAt &&
      snapshot.lastId === newSnapshot.lastId
    ) {
      return;
    }

    lastLogcatSnapshotRef.current = newSnapshot;
    startTransition(() => {
      setLogcatStreamState(response);
    });
  }

  async function handleStartLogcat(deviceId = currentDeviceId) {
    if (!deviceId) {
      return;
    }

    setLogcatBusy("start");
    setLogcatPaused(false);
    setLogcatAutoFollow(true);
    try {
      lastAppliedLogcatCaptureSignatureRef.current = logcatCaptureSignature;
      const response = (await runtimeApi.logcat.start({
        deviceId,
        clearBeforeStart: logcatClearBeforeStartEnabled,
        filters: logcatCaptureFilters,
        buffers: logcatBuffers.length > 0 ? logcatBuffers : undefined,
      })) as LogcatStreamState;
      startTransition(() => {
        setLogcatStreamState(response);
      });
    } finally {
      setLogcatBusy(null);
    }
  }

  async function handleStopLogcat(deviceId = currentDeviceId) {
    if (!deviceId) {
      return;
    }

    setLogcatBusy("stop");
    try {
      const response = (await runtimeApi.logcat.stop({ deviceId })) as LogcatStreamState;
      startTransition(() => {
        setLogcatStreamState(response);
      });
    } finally {
      setLogcatBusy(null);
    }
  }

  async function handleDownloadLogcat(deviceId = currentDeviceId) {
    if (!deviceId || logcatDownloading) {
      return;
    }

    setLogcatDownloading(true);
    try {
      const response = (await runtimeApi.logcat.export({ deviceId })) as LogcatExportResult;
      if (response?.status !== "ok" || !response.fileName) {
        return;
      }
      if (response.contentText) {
        downloadTextFile(response.fileName, response.contentText, response.mimeType || "text/plain;charset=utf-8");
        return;
      }
      if (response.contentBase64) {
        downloadBlobFile(response.fileName, decodeBase64ToBlob(response.contentBase64, response.mimeType || "application/octet-stream"));
      }
    } finally {
      setLogcatDownloading(false);
    }
  }

  async function handleClearLogcat(deviceId = currentDeviceId) {
    if (!deviceId) {
      return;
    }

    setLogcatBusy("clear");
    setLogcatPaused(false);
    setLogcatAutoFollow(true);
    setLogcatVirtualStartIndex(0);
    try {
      lastAppliedLogcatCaptureSignatureRef.current = logcatCaptureSignature;
      const response = (await runtimeApi.logcat.clear({
        deviceId,
        filters: logcatCaptureFilters,
      })) as LogcatStreamState;
      startTransition(() => {
        setLogcatStreamState(response);
      });
    } finally {
      setLogcatBusy(null);
    }
  }

  async function refreshLogcatConfig() {
    const response = (await runtimeApi.logcat.config()) as LogcatConfig;
    setLogcatConfig(response);
    setLogcatOutputDirDraft(response.outputDir ?? DEFAULT_LOGCAT_OUTPUT_DIR);
    setLogcatMaxFileSizeDraft(String(response.maxFileSizeMb ?? 10));
    setLogcatClearBeforeStartDraft(Boolean(response.clearBeforeStart));
    setLogcatClearBeforeStartEnabled(Boolean(response.clearBeforeStart));
    setLogcatDisplayLineLimitDraft(String(response.displayLineLimit ?? 3000));
    setLogcatRefreshIntervalDraft(String(normalizeLogcatRefreshIntervalMs(response.refreshIntervalMs)));
    setLogcatDefaultRegexEnabledDraft(Boolean(response.defaultRegexEnabled));
    setLogcatDefaultLevelsDraft(normalizeLogcatLevelSelection(response.defaultLevels));
  }

  function clearDeviceDisplayCloseTimer() {
    if (deviceDisplayCloseTimerRef.current !== null) {
      window.clearTimeout(deviceDisplayCloseTimerRef.current);
      deviceDisplayCloseTimerRef.current = null;
    }
  }

  function openDeviceDisplayMenu(anchor: HTMLElement) {
    clearDeviceDisplayCloseTimer();
    const rect = anchor.getBoundingClientRect();
    const width = 320;
    setDeviceDisplayPopupStyle({
      width,
      top: rect.top,
      left: Math.max(12, rect.left - width - 8),
      maxHeight: Math.min(window.innerHeight - 24, 520),
    });
    setDeviceDisplayMenuOpen(true);
  }

  function scheduleCloseDeviceDisplayMenu() {
    clearDeviceDisplayCloseTimer();
    deviceDisplayCloseTimerRef.current = window.setTimeout(() => {
      setDeviceDisplayMenuOpen(false);
    }, 120);
  }

  function clearAppActionSubmenuCloseTimer() {
    if (appActionSubmenuCloseTimerRef.current !== null) {
      window.clearTimeout(appActionSubmenuCloseTimerRef.current);
      appActionSubmenuCloseTimerRef.current = null;
    }
  }

  function openAppActionSubmenu(kind: "uninstall" | "install" | "clear", anchor: HTMLElement) {
    clearAppActionSubmenuCloseTimer();
    const rect = anchor.getBoundingClientRect();
    const containerRect = appActionMenuAnchorRef.current?.getBoundingClientRect();
    const width = 260;
    const maxHeight = Math.min(window.innerHeight - 24, 420);
    const preferredViewportLeft = rect.left - width - 8;
    const fallbackViewportLeft = rect.right + 8;
    const viewportLeft = preferredViewportLeft >= 12
      ? preferredViewportLeft
      : Math.max(12, fallbackViewportLeft);
    const viewportTop = Math.max(12, rect.top - 8);
    setAppActionSubmenuStyle({
      width,
      top: containerRect ? viewportTop - containerRect.top : viewportTop,
      left: containerRect ? viewportLeft - containerRect.left : viewportLeft,
      maxHeight,
    });
    setAppActionSubmenu(kind);
  }

  function scheduleCloseAppActionSubmenu() {
    clearAppActionSubmenuCloseTimer();
    appActionSubmenuCloseTimerRef.current = window.setTimeout(() => {
      setAppActionSubmenu(null);
    }, 120);
  }

  async function runDeviceMaintenanceAction(action: "reboot" | "root" | "remount") {
    if (!currentDevice || deviceActionBusy) {
      return;
    }

    const actionMeta = {
      reboot: { commandId: "custom", commandTitle: "重启设备", rawCommand: "reboot" },
      root: { commandId: "custom", commandTitle: "root 设备", rawCommand: "root" },
      remount: { commandId: "custom", commandTitle: "remount 设备", rawCommand: "remount" },
    } as const;

    setDeviceActionBusy(action);
    try {
      const meta = actionMeta[action];
      const response = await runtimeApi.command.run({
        deviceId: currentDevice.id,
        deviceName: currentDevice.name,
        commandId: meta.commandId,
        commandTitle: meta.commandTitle,
        rawCommand: meta.rawCommand,
        args: [],
      });
      const runResult = { ...(response as RunResult), duration: 0 };
      setLastRunResult(runResult);
      setDeviceActionOpen(false);
      setDeviceDisplayMenuOpen(false);
      await refreshHistoryList();
      if (action === "reboot") {
        setDeviceOpen(false);
      }
    } finally {
      setDeviceActionBusy(null);
    }
  }

  async function handleOpenScrcpyConfig(display: DeviceDisplayItem) {
    if (!currentDeviceId) {
      return;
    }

    const response = (await runtimeApi.scrcpy.config({ deviceId: currentDeviceId, displayId: display.displayId })) as ScrcpyConfigResponse;
    const currentConfig = response.config ?? {
      maxSize: 0,
      windowX: 120,
      windowY: 120,
      windowWidth: 0,
      windowHeight: 0,
    };
    setScrcpyAvailable(Boolean(response.scrcpyAvailable));
    setDeviceActionOpen(false);
    setDeviceDisplayMenuOpen(false);
    setScrcpyConfigDialog({
      deviceId: currentDeviceId,
      deviceName: currentDevice?.name ?? currentDeviceId,
      display,
      config: currentConfig,
      saving: false,
      syncing: false,
      notice: null,
    });
  }

  function updateScrcpyConfigDraft(patch: Partial<ScrcpyDisplayConfig>) {
    setScrcpyConfigDialog((current) => current ? {
      ...current,
      config: {
        ...current.config,
        ...patch,
      },
    } : current);
  }

  async function handleSaveScrcpyConfig() {
    if (!scrcpyConfigDialog) {
      return;
    }

    setScrcpyConfigDialog((current) => current ? { ...current, saving: true } : current);
    try {
      const response = (await runtimeApi.scrcpy.updateConfig({
        deviceId: scrcpyConfigDialog.deviceId,
        displayId: scrcpyConfigDialog.display.displayId,
        ...scrcpyConfigDialog.config,
      })) as ScrcpyConfigResponse;
      setScrcpyAvailable(Boolean(response.scrcpyAvailable));
      setScrcpyConfigDialog((current) => current ? {
        ...current,
        saving: false,
        config: response.config ?? current.config,
        notice: response.message ?? (response.status === "error" ? "保存配置失败。" : "scrcpy 配置已保存。"),
      } : current);
    } catch {
      setScrcpyConfigDialog((current) => current ? { ...current, saving: false, notice: "保存配置失败，请重试。" } : current);
    }
  }

  async function handleSyncScrcpyWindowConfig() {
    if (!scrcpyConfigDialog) {
      return;
    }

    setScrcpyConfigDialog((current) => current ? { ...current, syncing: true } : current);
    try {
      const response = (await runtimeApi.scrcpy.syncWindow({
        deviceId: scrcpyConfigDialog.deviceId,
        displayId: scrcpyConfigDialog.display.displayId,
      })) as ScrcpyConfigResponse;
      setScrcpyAvailable(Boolean(response.scrcpyAvailable));
      setScrcpyConfigDialog((current) => current ? {
        ...current,
        syncing: false,
        config: response.config ?? current.config,
        notice: response.message ?? (response.status === "error" ? "未能读取当前投屏窗口信息。" : "已按当前启动窗口配置并保存。"),
      } : current);
    } catch {
      setScrcpyConfigDialog((current) => current ? { ...current, syncing: false, notice: "未能读取当前投屏窗口信息。" } : current);
    }
  }

  async function handleLaunchScrcpy(display: DeviceDisplayItem) {
    if (!currentDeviceId || !scrcpyAvailable) {
      return;
    }

    const response = (await runtimeApi.scrcpy.launch({
      deviceId: currentDeviceId,
      displayId: display.displayId,
    })) as ScrcpyConfigResponse;
    setLastRunResult({
      command: "scrcpy-launch",
      record_id: `scrcpy:${currentDeviceId}:${display.displayId}:${Date.now()}`,
      device: currentDeviceId,
      command_id: response.command ?? "scrcpy-launch",
      command_title: `投屏 Display ${display.displayId}`,
      raw: response.executedCommand ?? response.message ?? "已触发 scrcpy",
      device_name: currentDevice?.name ?? currentDeviceId,
      status: response.status ?? "ok",
      executedCommand: response.executedCommand ?? response.message ?? "已触发 scrcpy",
      message: response.message ?? "已触发 scrcpy",
      duration: 0,
    });
    setDeviceActionOpen(false);
    setDeviceDisplayMenuOpen(false);
  }

  async function refreshBackupInfo(deviceId = currentDeviceId) {
    if (!deviceId) {
      setBackupInfo(null);
      return;
    }

    const response = (await runtimeApi.backup.info(deviceId)) as BackupInfo;
    setBackupInfo(response);
  }

  async function refreshBackupConfig() {
    const response = (await runtimeApi.backup.config()) as BackupConfig;
    setBackupConfig(response);
    setBackupVersionPropDraft(response.versionProp ?? "ro.build.display.id");
    setBackupRootDraft(response.backupRoot ?? BACKUP_ROOT_PATH);
    setBackupPathsDraft((response.backupPaths ?? []).join("\n"));
    setRestorePathsDraft((response.restorePaths ?? []).join("\n"));
  }

  function toggleSelectedPath(targetPath: string, side: "backup" | "restore") {
    if (side === "backup") {
      setSelectedBackupPaths((current) => current.includes(targetPath)
        ? current.filter((item) => item !== targetPath)
        : [...current, targetPath]);
      return;
    }

    setSelectedRestorePaths((current) => current.includes(targetPath)
      ? current.filter((item) => item !== targetPath)
      : [...current, targetPath]);
  }

  function addLogcatFilterRule() {
    setLogcatFilterRules((current) => [...current, createLogcatFilterRule()]);
  }

  function updateLogcatFilterRule(ruleId: string, patch: Partial<LogcatFilterRule>) {
    setLogcatFilterRules((current) => current.map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule));
  }

  function removeLogcatFilterRule(ruleId: string) {
    setLogcatFilterRules((current) => current.length === 1
      ? current.map((rule) => rule.id === ruleId ? createLogcatFilterRule({ id: rule.id }) : rule)
      : current.filter((rule) => rule.id !== ruleId));
  }

  function clearLogcatFilterRules() {
    setLogcatFilterRules([createLogcatFilterRule()]);
    setLogcatPickerState(null);
    setLogcatPickerQuery("");
  }

  function positionLogcatPicker(anchor: HTMLElement, width: number) {
    const shellRect = logcatFilterShellRef.current?.getBoundingClientRect();
    if (!shellRect) {
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const maxLeft = Math.max(12, shellRect.width - width - 12);
    const nextLeft = Math.min(Math.max(anchorRect.left - shellRect.left - width + anchorRect.width, 12), maxLeft);
    setLogcatPickerStyle({
      top: anchorRect.bottom - shellRect.top + 8,
      left: nextLeft,
      width,
    });
  }

  async function openLogcatPackagePicker(ruleId: string, anchor: HTMLElement) {
    if (!currentDeviceId) {
      return;
    }

    setLogcatAdvancedOpen(true);
    setLogcatPickerState({ kind: "package", ruleId });
    setLogcatPickerQuery("");
    positionLogcatPicker(anchor, 420);
    if (logcatPackageCatalog.length > 0) {
      return;
    }

    setLogcatPickerLoading("package");
    try {
      const response = (await runtimeApi.logcat.packageList({ deviceId: currentDeviceId })) as LogcatPackageCatalog;
      setLogcatPackageCatalog(response.items ?? []);
    } finally {
      setLogcatPickerLoading(null);
    }
  }

  async function openLogcatProcessPicker(anchor: HTMLElement) {
    if (!currentDeviceId) {
      return;
    }

    const ruleId = anchor.dataset.ruleId;
    if (!ruleId) {
      return;
    }

    setLogcatAdvancedOpen(true);
    setLogcatPickerState({ kind: "pid", ruleId });
    setLogcatPickerQuery("");
    positionLogcatPicker(anchor, 440);
    if (logcatProcessCatalog.length > 0) {
      return;
    }

    setLogcatPickerLoading("pid");
    try {
      const response = (await runtimeApi.logcat.processList({ deviceId: currentDeviceId })) as LogcatProcessCatalog;
      setLogcatProcessCatalog(response.items ?? []);
    } finally {
      setLogcatPickerLoading(null);
    }
  }

  function applyLogcatRuleValue(ruleId: string, value: string) {
    updateLogcatFilterRule(ruleId, { value });
    setLogcatPickerState(null);
    setLogcatPickerQuery("");
  }

  function appendLogcatRuleValue(ruleId: string, nextValue: string) {
    setLogcatFilterRules((current) => current.map((rule) => rule.id === ruleId ? { ...rule, value: appendPipeFilterValue(rule.value, nextValue) } : rule));
  }

  function updateLogcatRuleField(ruleId: string, field: LogcatRuleField) {
    updateLogcatFilterRule(ruleId, { field, value: "" });
    setLogcatPickerState((current) => current?.ruleId === ruleId ? null : current);
    setLogcatPickerQuery("");
  }

  function updateLogcatRuleJoiner(ruleId: string, joiner: LogcatRuleJoiner) {
    updateLogcatFilterRule(ruleId, { joiner });
  }

  function toggleLogcatLevel(level: string) {
    setLogcatLevels((current) => toggleLogcatLevelValue(current, level));
  }

  function applyLogcatLevelPreset(preset: "all" | "none" | "debug-plus" | "info-plus") {
    setLogcatLevels(resolveLogcatLevelPreset(preset));
  }

  function toggleLogcatDefaultLevel(level: string) {
    setLogcatDefaultLevelsDraft((current) => toggleLogcatLevelValue(current, level));
  }

  function applyLogcatDefaultLevelPreset(preset: "all" | "none" | "debug-plus" | "info-plus") {
    setLogcatDefaultLevelsDraft(resolveLogcatLevelPreset(preset));
  }

  async function handleSaveLogcatConfig() {
    setLogcatConfigSaving(true);
    try {
      const response = (await runtimeApi.logcat.updateConfig({
        outputDir: logcatOutputDirDraft.trim() || DEFAULT_LOGCAT_OUTPUT_DIR,
        maxFileSizeMb: Math.max(Number(logcatMaxFileSizeDraft || "10"), 1),
        clearBeforeStart: logcatClearBeforeStartDraft,
        displayLineLimit: Math.max(Math.min(Number(logcatDisplayLineLimitDraft || "3000"), 3000), 200),
        refreshIntervalMs: normalizeLogcatRefreshIntervalMs(logcatRefreshIntervalDraft),
        defaultRegexEnabled: logcatDefaultRegexEnabledDraft,
        defaultLevels: logcatDefaultLevelsDraft,
      })) as LogcatConfig;
      setLogcatConfig(response);
      setLogcatOutputDirDraft(response.outputDir ?? DEFAULT_LOGCAT_OUTPUT_DIR);
      setLogcatMaxFileSizeDraft(String(response.maxFileSizeMb ?? 10));
      setLogcatClearBeforeStartDraft(Boolean(response.clearBeforeStart));
      setLogcatClearBeforeStartEnabled(Boolean(response.clearBeforeStart));
      setLogcatDisplayLineLimitDraft(String(response.displayLineLimit ?? 3000));
      setLogcatRefreshIntervalDraft(String(normalizeLogcatRefreshIntervalMs(response.refreshIntervalMs)));
      setLogcatDefaultRegexEnabledDraft(Boolean(response.defaultRegexEnabled));
      const defaultLevels = normalizeLogcatLevelSelection(response.defaultLevels);
      setLogcatDefaultLevelsDraft(defaultLevels);
      setLogcatRegexEnabled(Boolean(response.defaultRegexEnabled));
      setLogcatLevels(defaultLevels);
      if (generalSettingsRules.closeSettingsOnSave) {
        setSettingsOpen(false);
      }
    } finally {
      setLogcatConfigSaving(false);
    }
  }

  function handleSaveGeneralSettingsRules() {
    const nextRules = {
      ...generalSettingsRulesDraft,
      apkExportDirectory: generalSettingsRulesDraft.apkExportDirectory.trim(),
    };

    if (nextRules.apkExportMode === "fixed-directory" && !nextRules.apkExportDirectory) {
      const rollbackRules = { ...nextRules, apkExportMode: "custom-directory" as const };
      setGeneralSettingsRulesDraft(rollbackRules);
      pushUiToast("固定导出目录不能为空，已回滚为“每次选择目录”。", "warning");
      return;
    }

    setGeneralSettingsRulesDraft(nextRules);
    setGeneralSettingsRules(nextRules);
    if (nextRules.closeSettingsOnSave) {
      setSettingsOpen(false);
    }
  }

  async function handleSaveBackupRules() {
    setBackupConfigSaving(true);
    try {
      const response = (await runtimeApi.backup.updateConfig({
        versionProp: backupVersionPropDraft.trim() || "ro.build.display.id",
        backupRoot: backupRootDraft.trim() || BACKUP_ROOT_PATH,
        backupPaths: parsePathLines(backupPathsDraft),
        restorePaths: parsePathLines(restorePathsDraft)
      })) as BackupConfig;
      setBackupConfig(response);
      setBackupVersionPropDraft(response.versionProp ?? "ro.build.display.id");
      setBackupRootDraft(response.backupRoot ?? BACKUP_ROOT_PATH);
      setBackupPathsDraft((response.backupPaths ?? []).join("\n"));
      setRestorePathsDraft((response.restorePaths ?? []).join("\n"));
      setSelectedBackupPaths(response.backupPaths ?? []);
      setSelectedRestorePaths(response.restorePaths ?? []);

      let nextActionResult: BackupActionResult = {
        command: "backup-config-save",
        status: "ok",
        message: response.message ?? "备份与恢复规则已保存。"
      };

      if (response.rootChanged && response.previousBackupRoot && response.backupRoot) {
        const migrationPrompt = `本地备份根目录已从\n${response.previousBackupRoot}\n切换到\n${response.backupRoot}\n是否现在迁移旧的备份数据？`;
        const shouldMigrate = response.migrationAvailable && typeof window !== "undefined" ? window.confirm(migrationPrompt) : false;
        if (shouldMigrate) {
          nextActionResult = (await runtimeApi.backup.migrate({
            sourceRoot: response.previousBackupRoot,
            targetRoot: response.backupRoot
          })) as BackupActionResult;
        } else {
          nextActionResult = {
            command: "backup-config-save",
            status: "ok",
            message: response.migrationAvailable
              ? `备份与恢复规则已保存，根目录已切换到 ${response.backupRoot}。你可以稍后再迁移旧备份。`
              : `备份与恢复规则已保存，根目录已切换到 ${response.backupRoot}。旧目录下没有可迁移的备份数据。`
          };
        }
      }

      setBackupActionResult(nextActionResult);
      await refreshBackupInfo();
      if (generalSettingsRules.closeSettingsOnSave) {
        setSettingsOpen(false);
      }
    } finally {
      setBackupConfigSaving(false);
    }
  }

  async function handleBackupAction(action: "backup" | "restore") {
    if (!currentDevice) {
      return;
    }

    setBackupBusyAction(action);
    const response = (action === "backup"
      ? await runtimeApi.backup.create({ deviceId: currentDevice.id, paths: selectedBackupPaths })
      : await runtimeApi.backup.restore({ deviceId: currentDevice.id, paths: selectedRestorePaths })) as BackupActionResult;
    setBackupActionResult(response);
    await refreshBackupInfo(currentDevice.id);
    setBackupBusyAction(null);
  }

  async function handleOpenBackupDirectory(versionName: string) {
    const response = (await runtimeApi.backup.openDirectory({ versionName })) as BackupActionResult;
    setBackupActionResult(response);
  }

  async function handleDeleteBackupVersion(versionName: string) {
    const response = (await runtimeApi.backup.deleteVersion({ versionName })) as BackupActionResult;
    setBackupActionResult(response);
    setPendingBackupDeleteVersion(null);
    await refreshBackupInfo();
  }

  async function handleDeleteHistoryItem(recordId: string) {
    const response = (await runtimeApi.history.remove({ recordId, limit: HISTORY_FETCH_LIMIT })) as { items?: HistoryItem[] };
    setExecutionHistory(response.items ?? []);
    if (historyDetailRecordId === recordId) {
      setHistoryDetailRecordId(null);
    }
    setPendingHistoryDeleteId(null);
  }

  async function handleClearHistory() {
    const response = (await runtimeApi.history.clear({ limit: HISTORY_FETCH_LIMIT })) as { items?: HistoryItem[] };
    setExecutionHistory(response.items ?? []);
    setHistoryDetailRecordId(null);
    setPendingHistoryDeleteId(null);
    setHistoryClearConfirmOpen(false);
  }

  async function runKeySimCommand(raw: string, title: string) {
    if (!currentDevice || !raw.trim()) {
      return;
    }
    setKeySimBusy(true);
    setKeySimNotice(null);
    try {
      const startedAt = performance.now();
      const response = await runtimeApi.command.run({
        deviceId: currentDevice.id,
        deviceName: currentDevice.name,
        commandId: "keysim-inline",
        commandTitle: title,
        rawCommand: raw,
        args: [],
        source: "user"
      });
      applyRunResponse(response, Math.round(performance.now() - startedAt));
      setKeySimNotice(`已执行：${title}`);
    } catch (error) {
      setKeySimNotice(`执行失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setKeySimBusy(false);
    }
  }

  async function handleRefreshKeySimScreenshot() {
    if (!currentDeviceId) {
      setKeySimNotice("请先选择设备");
      return;
    }
    setKeySimScreenshotLoading(true);
    setKeySimNotice(null);
    const response = await fetchDevApi<{ status?: string; dataUrl?: string; message?: string }>(`/api/adb-helper/keysim-screenshot?deviceId=${encodeURIComponent(currentDeviceId)}`);
    if (!response || response.status !== "ok" || !response.dataUrl) {
      setKeySimNotice(response?.message ?? "获取截图失败");
      setKeySimScreenshotLoading(false);
      return;
    }
    setKeySimScreenshotDataUrl(response.dataUrl);
    setKeySimTapPoint(null);
    setKeySimSwipeStart(null);
    setKeySimSwipeEnd(null);

    // Try to align coordinates with input tap/swipe logical space.
    const sizeResp = await postDevApi<{ stdout?: string }>("/api/adb-helper/command-run", {
      deviceId: currentDeviceId,
      commandId: "keysim-wm-size",
      commandTitle: "读取逻辑分辨率",
      rawCommand: "adb shell wm size",
      args: [],
      source: "user",
    });
    const sizeText = typeof sizeResp?.stdout === "string" ? sizeResp.stdout : "";
    const match = sizeText.match(/(?:Override|Physical) size:\s*(\d+)x(\d+)/i);
    if (match) {
      setKeySimTouchSize({ width: Number(match[1]), height: Number(match[2]) });
    } else {
      setKeySimTouchSize(null);
    }

    setKeySimScreenshotLoading(false);
  }

  async function handleRunKeySimTap() {
    if (!keySimTapPoint) {
      setKeySimNotice("请先在截图上点击目标位置");
      return;
    }
    await runKeySimCommand(`adb shell input tap ${keySimTapPoint.x} ${keySimTapPoint.y}`, `点击坐标 (${keySimTapPoint.x}, ${keySimTapPoint.y})`);
  }

  async function handleRunKeySimSwipe() {
    if (!keySimSwipeStart || !keySimSwipeEnd) {
      setKeySimNotice("请先在截图上选择滑动起点和终点");
      return;
    }
    const duration = Math.max(Number(keySimSwipeDurationMs || "300"), 1);
    await runKeySimCommand(
      `adb shell input swipe ${keySimSwipeStart.x} ${keySimSwipeStart.y} ${keySimSwipeEnd.x} ${keySimSwipeEnd.y} ${duration}`,
      `滑动 (${keySimSwipeStart.x},${keySimSwipeStart.y}) -> (${keySimSwipeEnd.x},${keySimSwipeEnd.y})`
    );
  }

  function handleKeySimImageClick(event: { currentTarget: HTMLImageElement; clientX: number; clientY: number }) {
    if (!keySimScreenshotSize.width || !keySimScreenshotSize.height) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const ratioX = (event.clientX - rect.left) / rect.width;
    const ratioY = (event.clientY - rect.top) / rect.height;
    const targetSize = keySimTouchSize ?? keySimScreenshotSize;
    const point = {
      x: Math.max(0, Math.min(targetSize.width, Math.round(ratioX * targetSize.width))),
      y: Math.max(0, Math.min(targetSize.height, Math.round(ratioY * targetSize.height)))
    };

    if (keySimMode === "tap") {
      setKeySimTapPoint(point);
      setKeySimNotice(`已设置点击坐标：(${point.x}, ${point.y})`);
      return;
    }

    if (!keySimSwipeStart) {
      setKeySimSwipeStart(point);
      setKeySimSwipeEnd(null);
      setKeySimNotice(`已设置滑动起点：(${point.x}, ${point.y})`);
    } else {
      setKeySimSwipeEnd(point);
      setKeySimNotice(`已设置滑动终点：(${point.x}, ${point.y})`);
    }
  }

  async function openQuickDraftScreenshotPicker(mode: "tap" | "swipe", target: "quick" | "macro" = "quick") {
    setKeySimQuickPickerMode(mode);
    setKeySimPickerTarget(target);
    setKeySimQuickPickerTapPoint(null);
    setKeySimQuickPickerSwipeStart(null);
    setKeySimQuickPickerSwipeEnd(null);
    setKeySimQuickPickerOpen(true);
    if (!keySimScreenshotDataUrl) {
      await handleRefreshKeySimScreenshot();
    }
  }

  function handleQuickPickerImageClick(event: { currentTarget: HTMLImageElement; clientX: number; clientY: number }) {
    if (!keySimScreenshotSize.width || !keySimScreenshotSize.height) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const ratioX = (event.clientX - rect.left) / rect.width;
    const ratioY = (event.clientY - rect.top) / rect.height;
    const targetSize = keySimTouchSize ?? keySimScreenshotSize;
    const point = {
      x: Math.max(0, Math.min(targetSize.width, Math.round(ratioX * targetSize.width))),
      y: Math.max(0, Math.min(targetSize.height, Math.round(ratioY * targetSize.height)))
    };

    if (keySimQuickPickerMode === "tap") {
      setKeySimQuickPickerTapPoint(point);
      return;
    }
    if (!keySimQuickPickerSwipeStart) {
      setKeySimQuickPickerSwipeStart(point);
      setKeySimQuickPickerSwipeEnd(null);
    } else {
      setKeySimQuickPickerSwipeEnd(point);
    }
  }

  function applyQuickPickerPoints() {
    if (!keySimQuickDraft) {
      return;
    }

    if (keySimQuickPickerMode === "tap") {
      if (!keySimQuickPickerTapPoint) {
        setKeySimNotice("请先在截图中选择点击坐标");
        return;
      }
      setKeySimQuickDraft((current) => current ? { ...current, value: `${keySimQuickPickerTapPoint.x},${keySimQuickPickerTapPoint.y}` } : current);
      setKeySimQuickPickerOpen(false);
      return;
    }

    if (!keySimQuickPickerSwipeStart || !keySimQuickPickerSwipeEnd) {
      setKeySimNotice("请先在截图中选择滑动起点和终点");
      return;
    }
    const currentParts = keySimQuickDraft.value.split(",").map((item) => item.trim());
    const duration = currentParts[4] && !Number.isNaN(Number(currentParts[4])) ? currentParts[4] : "300";
    setKeySimQuickDraft((current) => current
      ? { ...current, value: `${keySimQuickPickerSwipeStart.x},${keySimQuickPickerSwipeStart.y},${keySimQuickPickerSwipeEnd.x},${keySimQuickPickerSwipeEnd.y},${duration}` }
      : current);
    setKeySimQuickPickerOpen(false);
  }

  function applyMacroPickerPoints() {
    if (!keySimMacroDraft) {
      return;
    }

    if (keySimQuickPickerMode === "tap") {
      if (!keySimQuickPickerTapPoint) {
        setKeySimNotice("请先在截图中选择点击坐标");
        return;
      }
      setKeySimMacroDraft((current) => current ? { ...current, value: `${keySimQuickPickerTapPoint.x},${keySimQuickPickerTapPoint.y}` } : current);
      setKeySimQuickPickerOpen(false);
      return;
    }

    if (!keySimQuickPickerSwipeStart || !keySimQuickPickerSwipeEnd) {
      setKeySimNotice("请先在截图中选择滑动起点和终点");
      return;
    }
    const currentParts = keySimMacroDraft.value.split(",").map((item) => item.trim());
    const duration = currentParts[4] && !Number.isNaN(Number(currentParts[4])) ? currentParts[4] : "300";
    setKeySimMacroDraft((current) => current
      ? { ...current, value: `${keySimQuickPickerSwipeStart.x},${keySimQuickPickerSwipeStart.y},${keySimQuickPickerSwipeEnd.x},${keySimQuickPickerSwipeEnd.y},${duration}` }
      : current);
    setKeySimQuickPickerOpen(false);
  }

  function addKeySimFingerPath() {
    const nextIndex = keySimFingerPaths.length + 1;
    setKeySimFingerPaths((prev) => [...prev, {
      id: `finger-${Date.now()}-${nextIndex}`,
      startX: "300",
      startY: "1200",
      endX: "300",
      endY: "500",
      durationMs: "300"
    }]);
  }

  function createQuickActionDraft(type: KeySimQuickActionType, name?: string): KeySimQuickAction {
    return {
      id: `quick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name ?? (type === "key" ? "按键动作" : type === "tap" ? "点击动作" : "滑动动作"),
      type,
      value: KEY_SIM_QUICK_TYPE_DEFAULTS[type],
      size: "1x1",
      pressMode: "tap",
      durationMs: "500",
    };
  }

  function openCreateQuickAction(type: KeySimQuickActionType) {
    setKeySimQuickAddMenuOpen(false);
    setKeySimQuickDraftMode("create");
    setKeySimQuickDraft(createQuickActionDraft(type));
  }

  function openEditQuickAction(action: KeySimQuickAction) {
    setKeySimQuickAddMenuOpen(false);
    setKeySimQuickDraftMode("edit");
    setKeySimQuickDraft({ ...action });
  }

  function closeQuickDraft() {
    setKeySimQuickDraft(null);
    setKeySimQuickAddMenuOpen(false);
    setKeySimQuickPickerOpen(false);
  }

  function updateQuickDraftCsvPart(partIndex: number, totalParts: number, nextValue: string) {
    setKeySimQuickDraft((current) => {
      if (!current) {
        return current;
      }
      const parts = current.value.split(",").map((part) => part.trim());
      while (parts.length < totalParts) {
        parts.push("");
      }
      parts[partIndex] = nextValue.trim();
      return {
        ...current,
        value: parts.slice(0, totalParts).join(","),
      };
    });
  }

  function handleQuickDraftTypeChange(type: KeySimQuickActionType) {
    setKeySimQuickDraft((current) => current ? { ...current, type, value: KEY_SIM_QUICK_TYPE_DEFAULTS[type] } : current);
  }

  function saveQuickDraft() {
    if (!keySimQuickDraft) {
      return;
    }
    if (keySimQuickDraftMode === "create") {
      setKeySimQuickActions((prev) => [...prev, keySimQuickDraft]);
    } else {
      setKeySimQuickActions((prev) => prev.map((item) => item.id === keySimQuickDraft.id ? keySimQuickDraft : item));
    }
    closeQuickDraft();
  }

  function moveQuickCard(dragId: string, targetId: string) {
    if (dragId === targetId) {
      return;
    }
    setKeySimQuickActions((prev) => {
      const dragIndex = prev.findIndex((item) => item.id === dragId);
      const targetIndex = prev.findIndex((item) => item.id === targetId);
      if (dragIndex < 0 || targetIndex < 0) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function resolveQuickActionCommand(action: KeySimQuickAction): { command: string; title: string; error?: string } {
    const title = action.name.trim() || "快捷动作";
    const value = action.value.trim();
    if (!value) {
      return { command: "", title, error: "参数为空，请填写后再执行" };
    }

    if (action.type === "key") {
      const keyToken = value;
      if (action.pressMode === "long") {
        return { command: `adb shell input keyevent --longpress ${keyToken}`, title: `${title}（长按）` };
      }
      return { command: `adb shell input keyevent ${keyToken}`, title };
    }

    if (action.type === "tap") {
      const parts = value.split(",").map((item) => item.trim());
      if (parts.length !== 2 || parts.some((item) => Number.isNaN(Number(item)))) {
        return { command: "", title, error: "点击参数格式应为 x,y" };
      }
      if (action.pressMode === "long") {
        const holdDuration = Math.max(Number(action.durationMs || "500"), 1);
        return { command: `adb shell input swipe ${parts[0]} ${parts[1]} ${parts[0]} ${parts[1]} ${holdDuration}`, title: `${title}（长按）` };
      }
      return { command: `adb shell input tap ${parts[0]} ${parts[1]}`, title };
    }

    if (action.type === "swipe") {
      const parts = value.split(",").map((item) => item.trim());
      if (parts.length < 4 || parts.slice(0, 4).some((item) => Number.isNaN(Number(item)))) {
        return { command: "", title, error: "滑动参数格式应为 x1,y1,x2,y2[,duration]" };
      }
      const duration = parts[4] && !Number.isNaN(Number(parts[4])) ? parts[4] : "300";
      return { command: `adb shell input swipe ${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]} ${duration}`, title };
    }

    const tracks = value
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.split(",").map((part) => part.trim()));
    const commands = tracks
      .map((parts) => {
        if (parts.length < 4 || parts.slice(0, 4).some((part) => Number.isNaN(Number(part)))) {
          return "";
        }
        const duration = parts[4] && !Number.isNaN(Number(parts[4])) ? parts[4] : "300";
        return `input swipe ${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]} ${duration}`;
      })
      .filter(Boolean);
    if (commands.length === 0) {
      return { command: "", title, error: "多指参数格式应为 x1,y1,x2,y2,duration; x1,y1,x2,y2,duration" };
    }
    return { command: `adb shell sh -c "${commands.join(" & ")} & wait"`, title: `${title}（${commands.length} 指）` };
  }

  async function handleRunQuickAction(action: KeySimQuickAction) {
    const resolved = resolveQuickActionCommand(action);
    if (!resolved.command) {
      setKeySimNotice(`${resolved.title}：${resolved.error ?? "参数无效"}`);
      return;
    }
    await runKeySimCommand(resolved.command, resolved.title);
  }

  function getQuickActionSummary(action: KeySimQuickAction): string {
    if (action.type === "key") {
      return `${action.pressMode === "long" ? "长按" : "单击"} ${action.value}`;
    }
    if (action.type === "tap") {
      return `${action.pressMode === "long" ? `长按 ${action.durationMs}ms` : "单击"} ${action.value}`;
    }
    return action.value;
  }

  async function handleRunMultiTouchSwipe() {
    const commands = keySimFingerPaths
      .map((item) => {
        const sx = Number(item.startX);
        const sy = Number(item.startY);
        const ex = Number(item.endX);
        const ey = Number(item.endY);
        const duration = Math.max(Number(item.durationMs || "300"), 1);
        if ([sx, sy, ex, ey].some((value) => Number.isNaN(value))) {
          return "";
        }
        return `input swipe ${sx} ${sy} ${ex} ${ey} ${duration}`;
      })
      .filter(Boolean);

    if (commands.length === 0) {
      setKeySimNotice("请至少配置一条有效的手势轨迹");
      return;
    }
    const shellScript = `${commands.join(" & ")} & wait`;
    await runKeySimCommand(`adb shell sh -c "${shellScript}"`, `多指滑动（${commands.length} 指）`);
  }

  function createMacroStepDraft(type: KeySimMacroStepType): KeySimMacroStep {
    return {
      id: `macro-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      name: type === "key" ? "按键步骤" : type === "tap" ? "点击步骤" : type === "swipe" ? "滑动步骤" : "ADB步骤",
      value: type === "key" ? "KEYCODE_HOME" : type === "tap" ? "540,1800" : type === "swipe" ? "540,1800,540,600,300" : "adb shell input keyevent KEYCODE_HOME",
      delayMs: "300"
    };
  }

  function openCreateMacroTask() {
    setKeySimMacroTaskDraftId(null);
    setKeySimMacroTaskDraftName(`编排任务 ${keySimMacroTasks.length + 1}`);
    setKeySimMacroSteps([]);
    setKeySimMacroTaskDialogOpen(true);
    setKeySimMacroAddMenuOpen(false);
    setKeySimMacroDraft(null);
  }

  function openEditMacroTask(task: KeySimMacroTask) {
    setKeySimMacroTaskDraftId(task.id);
    setKeySimMacroTaskDraftName(task.name);
    setKeySimMacroSteps(task.steps.map((step) => ({ ...step })));
    setKeySimMacroTaskDialogOpen(true);
    setKeySimMacroAddMenuOpen(false);
    setKeySimMacroDraft(null);
  }

  function closeMacroTaskDialog() {
    setKeySimMacroTaskDialogOpen(false);
    setKeySimMacroAddMenuOpen(false);
    setKeySimMacroDraft(null);
    setKeySimQuickPickerOpen(false);
  }

  function saveMacroTaskDialog() {
    const taskName = keySimMacroTaskDraftName.trim() || `编排任务 ${keySimMacroTasks.length + 1}`;
    const snapshot = keySimMacroSteps.map((step) => ({ ...step }));
    if (keySimMacroTaskDraftId) {
      setKeySimMacroTasks((prev) => prev.map((task) => task.id === keySimMacroTaskDraftId ? { ...task, name: taskName, steps: snapshot } : task));
    } else {
      setKeySimMacroTasks((prev) => [...prev, {
        id: `macro-task-${Date.now()}-${prev.length + 1}`,
        name: taskName,
        steps: snapshot,
      }]);
    }
    closeMacroTaskDialog();
  }

  function deleteMacroTask(taskId: string) {
    setKeySimMacroTasks((prev) => prev.filter((task) => task.id !== taskId));
  }

  function openCreateMacroStep(type: KeySimMacroStepType) {
    setKeySimMacroAddMenuOpen(false);
    setKeySimMacroDraftMode("create");
    setKeySimMacroDraft(createMacroStepDraft(type));
  }

  function openEditMacroStep(step: KeySimMacroStep) {
    setKeySimMacroAddMenuOpen(false);
    setKeySimMacroDraftMode("edit");
    setKeySimMacroDraft({ ...step });
  }

  function closeMacroDraft() {
    setKeySimMacroDraft(null);
    setKeySimMacroAddMenuOpen(false);
    setKeySimQuickPickerOpen(false);
  }

  function saveMacroDraft() {
    if (!keySimMacroDraft) {
      return;
    }
    if (keySimMacroDraftMode === "create") {
      setKeySimMacroSteps((prev) => [...prev, keySimMacroDraft]);
    } else {
      setKeySimMacroSteps((prev) => prev.map((item) => item.id === keySimMacroDraft.id ? keySimMacroDraft : item));
    }
    closeMacroDraft();
  }

  function resolveMacroStepCommand(step: KeySimMacroStep): string {
    const value = step.value.trim();
    if (!value) {
      return "";
    }
    if (step.type === "key") {
      return `adb shell input keyevent ${value}`;
    }
    if (step.type === "tap") {
      const parts = value.split(",").map((item) => item.trim());
      if (parts.length !== 2) {
        return "";
      }
      return `adb shell input tap ${parts[0]} ${parts[1]}`;
    }
    if (step.type === "swipe") {
      const parts = value.split(",").map((item) => item.trim());
      if (parts.length < 4) {
        return "";
      }
      const duration = parts[4] ? parts[4] : "300";
      return `adb shell input swipe ${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]} ${duration}`;
    }
    return value;
  }

  async function handleRunMacroSteps(steps: KeySimMacroStep[], taskName: string) {
    if (!steps.length) {
      setKeySimNotice("请先添加宏步骤");
      return;
    }
    setKeySimMacroRunning(true);
    setKeySimNotice(null);
    try {
      for (let index = 0; index < steps.length; index++) {
        const step = steps[index];
        const command = resolveMacroStepCommand(step);
        if (!command) {
          setKeySimNotice(`第 ${index + 1} 步配置无效，已跳过`);
          continue;
        }
        // Keep macro deterministic: execute step by step with explicit delay.
        // eslint-disable-next-line no-await-in-loop
        await runKeySimCommand(command, `${step.name || `宏步骤 ${index + 1}`}`);
        const delay = Math.max(Number(step.delayMs || "0"), 0);
        if (delay > 0) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      setKeySimNotice(`${taskName} 执行完成`);
    } finally {
      setKeySimMacroRunning(false);
    }
  }

  async function handleRunMacroTask(task: KeySimMacroTask) {
    await handleRunMacroSteps(task.steps, task.name);
  }

  async function handleRunMacroTaskRepeated() {
    if (!keySimMacroRepeatDialog) {
      return;
    }
    const targetTask = keySimMacroTasks.find((task) => task.id === keySimMacroRepeatDialog.taskId);
    if (!targetTask) {
      setKeySimNotice("未找到要重复执行的编排任务");
      setKeySimMacroRepeatDialog(null);
      return;
    }
    const repeatCount = Math.max(Number(keySimMacroRepeatDialog.count || "1"), 1);
    const intervalMs = Math.max(Number(keySimMacroRepeatDialog.intervalMs || "0"), 0);
    setKeySimMacroRepeatDialog(null);
    keySimMacroRepeatCancelRef.current = false;
    setKeySimMacroRepeatProgress({ current: 0, total: repeatCount });
    for (let i = 0; i < repeatCount; i += 1) {
      if (keySimMacroRepeatCancelRef.current) {
        setKeySimNotice(`已终止，完成 ${i}/${repeatCount} 次`);
        break;
      }
      setKeySimMacroRepeatProgress({ current: i + 1, total: repeatCount });
      // eslint-disable-next-line no-await-in-loop
      await handleRunMacroTask(targetTask);
      if (i < repeatCount - 1 && intervalMs > 0 && !keySimMacroRepeatCancelRef.current) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, intervalMs);
          const check = setInterval(() => {
            if (keySimMacroRepeatCancelRef.current) { clearTimeout(timer); clearInterval(check); resolve(undefined); }
          }, 50);
          setTimeout(() => clearInterval(check), intervalMs + 100);
        });
      }
    }
    setKeySimMacroRepeatProgress(null);
  }

  async function startInfiniteExecution(task: KeySimMacroTask) {
    keySimMacroRepeatCancelRef.current = false;
    setKeySimMacroRepeatProgress({ current: 0, total: Infinity });
    let count = 0;
    while (!keySimMacroRepeatCancelRef.current) {
      count += 1;
      setKeySimMacroRepeatProgress({ current: count, total: Infinity });
      // eslint-disable-next-line no-await-in-loop
      await handleRunMacroTask(task);
    }
    setKeySimNotice(`已终止，共执行 ${count} 次`);
    setKeySimMacroRepeatProgress(null);
  }

  async function handleRun() {
    if (!activePanelCommand || !activeCommand || !currentDevice || deviceOpen || deviceActionOpen || catalogOpen) {
      return;
    }

    await runPanelCommandBlock({ ...activePanelCommand, rawCommand });
  }

  function handleExportResult(format: "markdown" | "txt", targetResult: RunResult | null = lastRunResult) {
    if (!targetResult) {
      return;
    }

    const fileName = `${buildExportBaseName(targetResult)}.${format === "markdown" ? "md" : "txt"}`;
    const content = format === "markdown" ? buildMarkdownExport(targetResult) : buildTextExport(targetResult);
    const mimeType = format === "markdown" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8";
    downloadTextFile(fileName, content, mimeType);
    setExportMenuOpen(false);
  }

  function renderDiffDropdown(side: DiffDropdownSide, title: string, currentOption: DiffOption | null, onSelect: (targetId: DiffTargetId) => void) {
    const isOpen = openDiffDropdown === side;
    const dropdownRef = side === "left" ? leftDiffDropdownRef : rightDiffDropdownRef;

    return (
      <div className="diff-dropdown" ref={dropdownRef}>
        <button
          type="button"
          className={`diff-dropdown-trigger ${isOpen ? "diff-dropdown-trigger-open" : ""}`}
          onClick={() => setOpenDiffDropdown((current) => current === side ? null : side)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <div className="diff-dropdown-trigger-content">
            <span className="summary-label">{title}</span>
            <div className="diff-dropdown-trigger-body">
              <strong className="diff-dropdown-command">{highlightText(currentOption?.commandText ?? "请选择记录", resultSearchTerm)}</strong>
              <div className="diff-dropdown-meta">
                {currentOption?.deviceName ? <span className="badge info diff-dropdown-device-badge">{highlightText(currentOption.deviceName, resultSearchTerm)}</span> : null}
                {currentOption?.timeText ? <span className="diff-dropdown-time">{highlightText(currentOption.timeText, resultSearchTerm)}</span> : null}
              </div>
            </div>
          </div>
          <span className={`icon ${isOpen ? "icon-chevron-up" : "icon-chevron-down"} diff-dropdown-chevron`} aria-hidden="true" />
        </button>
        {isOpen ? (
          <div className="diff-dropdown-menu panel" role="listbox">
            {diffOptions.map((option) => {
              const selected = option.id === currentOption?.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`diff-dropdown-item ${selected ? "diff-dropdown-item-active" : ""}`}
                  onClick={() => {
                    onSelect(option.id);
                    setOpenDiffDropdown(null);
                  }}
                >
                  <strong className="diff-dropdown-command">{highlightText(option.commandText, resultSearchTerm)}</strong>
                  <div className="diff-dropdown-meta">
                    {option.deviceName ? <span className="badge info diff-dropdown-device-badge">{highlightText(option.deviceName, resultSearchTerm)}</span> : null}
                    {option.timeText ? <span className="diff-dropdown-time">{highlightText(option.timeText, resultSearchTerm)}</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-nav">
          <span className="topbar-brand">ADB HELPER</span>
          <div className="topbar-menu">
            {MAIN_VIEWS.map((view) => (
              <button
                key={view.id}
                className={`menu-tab ${activeMainView === view.id ? "menu-tab-active" : ""}`}
                onClick={() => setActiveMainView(view.id)}
              >
                {view.label}
              </button>
            ))}
          </div>
        </div>
        <div className="topbar-actions">
          <div className="device-anchor" ref={deviceAnchorRef}>
            <div className="device-anchor-head">
              <button className="device-pill-button" onClick={() => {
                setDeviceActionOpen(false);
                setDeviceOpen((open) => !open);
              }}>
                <span className="device-pill-label">当前设备：{currentDeviceLabel}</span>
                <span className={`icon ${deviceOpen ? "icon-chevron-up" : "icon-chevron-down"}`} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="device-anchor" ref={deviceActionAnchorRef}>
            <div className="device-anchor-head">
              <button
                className="device-pill-button device-pill-button-secondary"
                onClick={() => {
                  setDeviceOpen(false);
                  setDeviceActionOpen((open) => !open);
                }}
                disabled={!currentDevice}
              >
                <span className="device-pill-label">操作</span>
                <span className={`icon ${deviceActionOpen ? "icon-chevron-up" : "icon-chevron-down"}`} aria-hidden="true" />
              </button>
            </div>
          </div>
          <button
            className="icon-button settings-button"
            onClick={() => setSettingsOpen(true)}
            aria-label="打开设置中心"
            title="打开设置中心"
          >
            <span className="icon icon-settings-sliders" aria-hidden="true" />
          </button>
        </div>
      </header>

      {deviceOpen ? (
        <>
          <div className="device-scrim" ref={deviceScrimRef} onClick={() => setDeviceOpen(false)} />
          <div className="device-popup device-popup-floating panel" ref={devicePopupRef} style={devicePopupStyle} onClick={(event) => event.stopPropagation()}>
            <div className="device-popup-section">
              <div className="device-popup-section-head">
                <span className="section-kicker">设备列表</span>
                <button className="ghost-button compact-button" onClick={openAdbHealthCheckDialog}>
                  ADB 健康检查
                </button>
              </div>
              {devices.length === 0 ? (
                <div className="device-empty-state">暂无设备连接</div>
              ) : devices.map((device) => (
                <button
                  key={device.id}
                  className={`device-card ${device.id === currentDevice?.id ? "active" : ""}`}
                  onClick={() => {
                    setCurrentDeviceId(device.id);
                    setDeviceOpen(false);
                  }}
                >
                  <strong>{deviceListLabelMap.get(device.id) ?? device.name}</strong>
                  <span className="badge info">{device.status}</span>
                </button>
              ))}
            </div>
            {savedRemoteDevices.length ? (
              <div className="device-popup-section">
                <div className="device-popup-section-head">
                  <span className="section-kicker">已保存远程设备</span>
                </div>
                <div className="saved-remote-device-list">
                  {savedRemoteDeviceSummaries.map(({ config, connectedDevice, savedLabel }) => {
                    return (
                      <div key={config.id} className="saved-remote-device-card">
                        <div className="saved-remote-device-copy">
                          <strong>{savedLabel}</strong>
                          <span>{config.host}:{config.port}</span>
                        </div>
                        <div className="saved-remote-device-actions">
                          {connectedDevice ? (
                            <button className="ghost-button compact-button" onClick={() => void handleDisconnectRemoteDevice(config, connectedDevice.id)} disabled={isBrowserPreviewMode}>断开</button>
                          ) : (
                            <button className="ghost-button compact-button" onClick={() => void handleConnectRemoteDevice("connect", config)} disabled={isBrowserPreviewMode}>连接</button>
                          )}
                          <button className="ghost-button compact-button" onClick={() => openRemoteDeviceDialog(config)}>编辑</button>
                          <button className="ghost-button compact-button danger-button-ghost" onClick={() => removeRemoteDeviceConfig(config.id)}>删除</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <button className="ghost-button device-popup-add-button" onClick={() => openRemoteDeviceDialog()}>
              + 添加设备
            </button>
          </div>
        </>
      ) : null}

      {deviceActionOpen ? (
        <>
          <div className="device-scrim" ref={deviceActionScrimRef} onClick={() => setDeviceActionOpen(false)} />
          <div className="device-popup device-popup-floating panel device-action-popup" ref={deviceActionPopupRef} style={deviceActionPopupStyle} onClick={(event) => event.stopPropagation()}>
            <div className="device-action-header">
              <div>
                <p className="section-kicker">设备操作</p>
                <h3>{currentDevice?.name ?? "未选择设备"}</h3>
              </div>
              <span className="badge info">{currentDevice?.id ?? "--"}</span>
            </div>
            <div className="device-action-list">
              <button className="device-action-item" disabled={!currentDevice || deviceActionBusy !== null} onClick={() => void runDeviceMaintenanceAction("reboot")}>
                <span>重启设备</span>
                <span className="device-action-meta">{deviceActionBusy === "reboot" ? "执行中..." : "adb reboot"}</span>
              </button>
              <button className="device-action-item" disabled={!currentDevice || deviceActionBusy !== null} onClick={() => void runDeviceMaintenanceAction("root")}>
                <span>root 设备</span>
                <span className="device-action-meta">{deviceActionBusy === "root" ? "执行中..." : "adb root"}</span>
              </button>
              <button className="device-action-item" disabled={!currentDevice || deviceActionBusy !== null} onClick={() => void runDeviceMaintenanceAction("remount")}>
                <span>remount 设备</span>
                <span className="device-action-meta">{deviceActionBusy === "remount" ? "执行中..." : "adb remount"}</span>
              </button>
              <div
                className={`device-action-item device-action-item-submenu ${!currentDevice ? "device-action-item-disabled" : ""}`}
                onMouseEnter={(event) => openDeviceInstallMenu(event.currentTarget)}
                onMouseLeave={scheduleCloseDeviceInstallMenu}
              >
                <div className="device-action-item-main">
                  <span>安装 APK</span>
                  <span className="device-action-meta">{deviceInstallApkBusy ? "安装中..." : "全部安装 / 按用户安装"}</span>
                </div>
              </div>
              <div
                className={`device-action-item device-action-item-submenu ${!scrcpyAvailable ? "device-action-item-disabled" : ""}`}
                onMouseEnter={(event) => openDeviceDisplayMenu(event.currentTarget)}
                onMouseLeave={scheduleCloseDeviceDisplayMenu}
              >
                <div className="device-action-item-main">
                  <span>投屏</span>
                  <span className="device-action-meta">{deviceDisplayLoading ? "读取 Display..." : scrcpyAvailable ? `${deviceDisplayCatalog.length} 个 Display` : "未检测到 scrcpy"}</span>
                </div>
              </div>
            </div>
          </div>
          {deviceDisplayMenuOpen ? (
            <div
              className="device-display-submenu panel device-display-floating-popup"
              ref={deviceDisplayPopupRef}
              style={deviceDisplayPopupStyle}
              onMouseEnter={clearDeviceDisplayCloseTimer}
              onMouseLeave={scheduleCloseDeviceDisplayMenu}
            >
              {deviceDisplayLoading ? <div className="device-display-empty">正在读取 Display 列表...</div> : null}
              {!deviceDisplayLoading && deviceDisplayCatalog.length === 0 ? <div className="device-display-empty">当前设备没有可用 Display。</div> : null}
              {!deviceDisplayLoading && deviceDisplayCatalog.map((display) => (
                <div className="device-display-row" key={display.displayId}>
                  <button className="device-display-launch" disabled={!scrcpyAvailable} onClick={() => void handleLaunchScrcpy(display)}>
                    <span>{display.label}</span>
                    <span className="device-action-meta">{display.logicalWidth} x {display.logicalHeight}</span>
                  </button>
                  <button className="icon-button compact-button device-display-config" onClick={() => void handleOpenScrcpyConfig(display)} title={`配置 Display ${display.displayId}`}>
                    <span className="icon icon-settings-sliders" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {deviceInstallMenuOpen ? (
            <div
              className="device-display-submenu panel device-install-floating-popup"
              ref={deviceInstallPopupRef}
              style={deviceInstallPopupStyle}
              onMouseEnter={clearDeviceInstallCloseTimer}
              onMouseLeave={scheduleCloseDeviceInstallMenu}
            >
              <button className="app-action-submenu-button" type="button" disabled={!currentDevice || Boolean(deviceInstallApkBusy)} onClick={() => void handleInstallDeviceApk()}>
                全部安装
              </button>
              {deviceUsersLoading && availableDeviceUserIds.length === 0 ? <div className="device-display-empty">正在读取用户列表...</div> : null}
              {installableDeviceUserIds.map((userId) => (
                <button className="app-action-submenu-button" type="button" key={`device-install-user-${userId}`} disabled={!currentDevice || Boolean(deviceInstallApkBusy)} onClick={() => void handleInstallDeviceApk(userId)}>
                  安装到用户 {userId}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      <Suspense
        fallback={(
          <main className="page-shell">
            <section className="panel page-panel">
              <div className="result-empty-state">页面加载中...</div>
            </section>
          </main>
        )}
      >
      {activeMainView === "command" ? (
        <CommandPage
          layout={{
            workspaceRef,
            workspaceIsModalOpen,
            leftCollapsed,
            setLeftCollapsed,
            rightWorkspaceMaximized,
            workspaceColumns,
            beginHorizontalDrag,
          }}
          panelList={{
            openCreatePanelDialog,
            panels,
            activePanelId,
            setActivePanelId,
            openContextMenu,
            activePanel,
          }}
          panelCommands={{
            setActivePanelCommandId,
            setCatalogOpen,
            panelCommands,
            activePanelCommand,
            activePanelCommandTitle,
            findCommandEntry,
            getPanelCommandTitle,
            runPanelCommandBlock,
          }}
          workspace={{
            rightCollapsed,
            setRightCollapsed,
            setRightWorkspaceMaximized,
            rawCommand,
            updateActivePanelCommandRaw,
            canRunCommand,
            handleRun,
          }}
          result={{
            resultSearchTerm,
            setResultSearchTerm,
            exportMenuRef,
            lastRunResult,
            setExportMenuOpen,
            exportMenuOpen,
            handleExportResult,
            resultMatchCount,
            activeResultTab,
            setActiveResultTab,
            executedCommandText,
            renderOutputPreview,
            highlightText,
            countOutputLines,
            copyText,
            normalizeOutputText,
            formatOutputBlock,
            renderRawOutputSection,
            rawExecutionOutput,
            renderDiffDropdown,
            leftDiffOption,
            setLeftDiffTargetId,
            rightDiffOption,
            setRightDiffTargetId,
            leftDiffResult,
            rightDiffResult,
            leftDiffOutput,
            rightDiffOutput,
            diffRows,
            renderDiffText,
            historyShowUserOnly,
            setHistoryShowUserOnly,
            setHistoryPage,
            filteredHistoryItems,
            HISTORY_PAGE_SIZE,
            historyPage,
            executionHistory,
            historyClearConfirmOpen,
            setHistoryClearConfirmOpen,
            pendingHistoryDeleteId,
            setPendingHistoryDeleteId,
            handleClearHistory,
            formatHistoryTimestamp,
            setHistoryDetailRecordId,
            setHistoryDetailTab,
            handleDeleteHistoryItem,
            summarizeOutputToSingleLine,
            historyItemToRunResult,
          }}
        />
      ) : null}

      {activeMainView === "info" ? (
        <InfoPage
          deviceInfoTabs={DEVICE_INFO_TABS}
          deviceInfoTab={deviceInfoTab}
          setDeviceInfoTab={setDeviceInfoTab}
          basic={{
            infoSummaryItems,
          }}
          files={{
            deviceFileBrowserPath,
            setDeviceFileBrowserPath,
            handleLoadDeviceFiles,
            deviceFileLoading,
            deviceFileActionBusy,
            handleUploadDeviceFile,
            normalizedDeviceFileBrowserPath,
            getRemoteParentPath,
            deviceFileBreadcrumbItems,
            deviceFileNotice,
            deviceFileEntries,
            deviceFileSelectedPath,
            handleSelectDeviceFile,
            selectedDeviceFileEntry,
            handlePullDeviceFile,
            handleRequestDeleteDeviceFile,
            deviceFileUploadTargetPath,
            setDeviceFileUploadTargetPath,
            deviceFileMkdirName,
            setDeviceFileMkdirName,
            handleCreateDeviceDirectory,
            deviceFileChmodMode,
            setDeviceFileChmodMode,
            handleChmodDeviceFile,
            deviceFileChownValue,
            setDeviceFileChownValue,
            handleChownDeviceFile,
            deviceFileActionResult,
          }}
          apps={{
            deviceAppSearchTerm,
            setDeviceAppSearchTerm,
            deviceAppUserFilter,
            setDeviceAppUserFilter,
            deviceAppPermissionFilter,
            setDeviceAppPermissionFilter,
            deviceAppScopeFilter,
            setDeviceAppScopeFilter,
            filteredDeviceApps,
            deviceAppsLoading,
            visibleDeviceApps,
            selectedDeviceAppPackage,
            setSelectedDeviceAppPackage,
            deferredDeviceAppSearchTerm,
            setVisibleDeviceAppCount,
            deviceAppDetailLoading,
            deviceAppDetail,
            formatInstalledUsers,
            appActionMenuAnchorRef,
            appActionMenuOpen,
            setAppActionMenuOpen,
            appActionSubmenu,
            setAppActionSubmenu,
            appActionSubmenuStyle,
            scheduleCloseAppActionSubmenu,
            openAppActionSubmenu,
            clearAppActionSubmenuCloseTimer,
            deviceAppActionBusy,
            handlePullCurrentApk,
            apkExportSummaryText,
            installTargetUserIds,
            handleDeviceAppCommand,
            isPrivilegedApkPath,
            deviceAppActionResult,
            handleOpenComponentDetail,
            deviceAppComponentSections,
            deferredDeviceAppPermissionFilter,
            DeviceAppListButton,
            highlightText,
          }}
          users={{
            deviceUserSummaryItems,
            deviceUsersLoading,
            deviceUsers,
            deviceCarServicePassenger,
            devicePassengerSummaryItems,
          }}
          processes={{
            deviceProcessSearchTerm,
            setDeviceProcessSearchTerm,
            deviceProcessUserFilter,
            setDeviceProcessUserFilter,
            deviceProcessScopeFilter,
            setDeviceProcessScopeFilter,
            deviceProcessesLoading,
            filteredDeviceProcesses,
            visibleDeviceProcesses,
            setVisibleDeviceProcessCount,
            setPendingProcessKill,
            DeviceProcessTableRow,
          }}
          screen={{
            deviceDisplayCatalog,
            screenDisplayIds,
            setScreenDisplayIds,
            screenCapturing,
            setScreenCapturing,
            screenCaptureResults,
            setScreenCaptureResults,
            screenRecording,
            setScreenRecording,
            screenRecordResults,
            setScreenRecordResults,
          }}
          shared={{
            currentDeviceId,
            availableDeviceUserIds,
            handleOpenLocalPath,
            pushUiToast,
            runtimeApi,
            loadMoreStep: DEVICE_INFO_LOAD_MORE_STEP,
          }}
        />
      ) : null}

      {activeMainView === "keysim" ? (
        <KeySimPage
          currentDeviceLabel={currentDeviceLabel}
          hasCurrentDevice={Boolean(currentDevice)}
          keySimBusy={keySimBusy}
          keySimMacroRunning={keySimMacroRunning}
          keySimMacroRepeatProgress={keySimMacroRepeatProgress}
          onCancelMacroRepeat={() => { keySimMacroRepeatCancelRef.current = true; }}
          keySimTabs={KEY_SIM_TABS}
          keySimTab={keySimTab}
          setKeySimTab={setKeySimTab}
          keySimQuickAddMenuOpen={keySimQuickAddMenuOpen}
          setKeySimQuickAddMenuOpen={setKeySimQuickAddMenuOpen}
          openCreateQuickAction={openCreateQuickAction}
          keySimQuickActions={keySimQuickActions}
          keySimQuickDraggingId={keySimQuickDraggingId}
          setKeySimQuickDraggingId={setKeySimQuickDraggingId}
          moveQuickCard={moveQuickCard}
          getQuickActionSummary={getQuickActionSummary}
          onRunQuickAction={handleRunQuickAction}
          openEditQuickAction={openEditQuickAction}
          setKeySimQuickActions={setKeySimQuickActions}
          keySimQuickDraft={keySimQuickDraft}
          setKeySimQuickDraft={setKeySimQuickDraft}
          keySimQuickDraftMode={keySimQuickDraftMode}
          closeQuickDraft={closeQuickDraft}
          knownKeycodes={KEY_SIM_KNOWN_KEYCODES}
          handleQuickDraftTypeChange={handleQuickDraftTypeChange}
          updateQuickDraftCsvPart={updateQuickDraftCsvPart}
          openQuickDraftScreenshotPicker={openQuickDraftScreenshotPicker}
          saveQuickDraft={saveQuickDraft}
          keySimScreenshotLoading={keySimScreenshotLoading}
          onRefreshScreenshot={handleRefreshKeySimScreenshot}
          keySimMode={keySimMode}
          setKeySimMode={setKeySimMode}
          keySimSwipeDurationMs={keySimSwipeDurationMs}
          setKeySimSwipeDurationMs={setKeySimSwipeDurationMs}
          keySimScreenshotDataUrl={keySimScreenshotDataUrl}
          setKeySimScreenshotSize={setKeySimScreenshotSize}
          handleKeySimImageClick={handleKeySimImageClick}
          keySimScreenshotSize={keySimScreenshotSize}
          keySimTouchSize={keySimTouchSize}
          keySimTapPoint={keySimTapPoint}
          keySimSwipeStart={keySimSwipeStart}
          keySimSwipeEnd={keySimSwipeEnd}
          onRunKeySimTap={handleRunKeySimTap}
          onRunKeySimSwipe={handleRunKeySimSwipe}
          keySimFingerPaths={keySimFingerPaths}
          setKeySimFingerPaths={setKeySimFingerPaths}
          addKeySimFingerPath={addKeySimFingerPath}
          onRunMultiTouchSwipe={handleRunMultiTouchSwipe}
          openCreateMacroTask={openCreateMacroTask}
          keySimMacroTasks={keySimMacroTasks}
          onRunMacroTask={handleRunMacroTask}
          setKeySimMacroRepeatDialog={setKeySimMacroRepeatDialog}
          startInfiniteExecution={startInfiniteExecution}
          openEditMacroTask={openEditMacroTask}
          deleteMacroTask={deleteMacroTask}
          keySimMacroTaskDialogOpen={keySimMacroTaskDialogOpen}
          keySimMacroTaskDraftId={keySimMacroTaskDraftId}
          closeMacroTaskDialog={closeMacroTaskDialog}
          keySimMacroTaskDraftName={keySimMacroTaskDraftName}
          setKeySimMacroTaskDraftName={setKeySimMacroTaskDraftName}
          keySimMacroAddMenuOpen={keySimMacroAddMenuOpen}
          setKeySimMacroAddMenuOpen={setKeySimMacroAddMenuOpen}
          openCreateMacroStep={openCreateMacroStep}
          keySimMacroSteps={keySimMacroSteps}
          openEditMacroStep={openEditMacroStep}
          setKeySimMacroSteps={setKeySimMacroSteps}
          saveMacroTaskDialog={saveMacroTaskDialog}
          keySimMacroDraft={keySimMacroDraft}
          keySimMacroDraftMode={keySimMacroDraftMode}
          closeMacroDraft={closeMacroDraft}
          setKeySimMacroDraft={setKeySimMacroDraft}
          createMacroStepDraft={createMacroStepDraft}
          saveMacroDraft={saveMacroDraft}
          keySimMacroRepeatDialog={keySimMacroRepeatDialog}
          handleRunMacroTaskRepeated={handleRunMacroTaskRepeated}
        />
      ) : null}

      {activeMainView === "layout" ? (
        <LayoutPage
          currentDeviceLabel={currentDeviceLabel}
          currentDeviceId={currentDeviceId}
          currentDeviceName={currentDevice?.name ?? ""}
          hasCurrentDevice={Boolean(currentDevice)}
          runtimeApi={runtimeApi}
          layoutViewerTab={layoutViewerTab}
          setLayoutViewerTab={setLayoutViewerTab}
          layoutWinscopeToken={layoutWinscopeToken}
          layoutUiTreeXml={layoutUiTreeXml}
          setLayoutUiTreeXml={setLayoutUiTreeXml}
          layoutUiTreeLoading={layoutUiTreeLoading}
          setLayoutUiTreeLoading={setLayoutUiTreeLoading}
          layoutUiTreeError={layoutUiTreeError}
          setLayoutUiTreeError={setLayoutUiTreeError}
          layoutSelectedNodePath={layoutSelectedNodePath}
          setLayoutSelectedNodePath={setLayoutSelectedNodePath}
          layoutExpandedNodes={layoutExpandedNodes}
          setLayoutExpandedNodes={setLayoutExpandedNodes}
          layoutScreenshotDataUrl={layoutScreenshotDataUrl}
          setLayoutScreenshotDataUrl={setLayoutScreenshotDataUrl}
          layoutScreenshotSize={layoutScreenshotSize}
          setLayoutScreenshotSize={setLayoutScreenshotSize}
          layoutPanelSizes={layoutPanelSizes}
          setLayoutPanelSizes={setLayoutPanelSizes}
          layoutCollapsedPanels={layoutCollapsedPanels}
          setLayoutCollapsedPanels={setLayoutCollapsedPanels}
          layoutMaximizedPanel={layoutMaximizedPanel}
          setLayoutMaximizedPanel={setLayoutMaximizedPanel}
          layoutPoppedPanel={layoutPoppedPanel}
          setLayoutPoppedPanel={setLayoutPoppedPanel}
          layoutPackageFilter={layoutPackageFilter}
          setLayoutPackageFilter={setLayoutPackageFilter}
          layoutProcessDialogOpen={layoutProcessDialogOpen}
          setLayoutProcessDialogOpen={setLayoutProcessDialogOpen}
          layoutProcessList={layoutProcessList}
          setLayoutProcessList={setLayoutProcessList}
          layoutProcessSearch={layoutProcessSearch}
          setLayoutProcessSearch={setLayoutProcessSearch}
          layoutSelectedProcess={layoutSelectedProcess}
          setLayoutSelectedProcess={setLayoutSelectedProcess}
          layoutProcessLoading={layoutProcessLoading}
          setLayoutProcessLoading={setLayoutProcessLoading}
          layoutHiddenNodes={layoutHiddenNodes}
          setLayoutHiddenNodes={setLayoutHiddenNodes}
          layoutWireframeMode={layoutWireframeMode}
          setLayoutWireframeMode={setLayoutWireframeMode}
          layoutPreviewZoom={layoutPreviewZoom}
          setLayoutPreviewZoom={setLayoutPreviewZoom}
        />
      ) : null}

      {activeMainView === "dumpsys" ? (
        <DumpsysPage currentDeviceId={currentDeviceId} runtimeApi={runtimeApi} />
      ) : null}

      {activeMainView === "monkey" ? (
        <MonkeyPage currentDeviceId={currentDeviceId} />
      ) : null}

      {activeMainView === "performance" ? (
        <PerformancePage currentDeviceId={currentDeviceId} />
      ) : null}

      {activeMainView === "backup" ? (
        <BackupPage
          hasCurrentDevice={Boolean(currentDevice)}
          backupBusyAction={backupBusyAction}
          selectedBackupPaths={selectedBackupPaths}
          selectedRestorePaths={selectedRestorePaths}
          backupDetailItems={backupDetailItems}
          currentBackupStatus={currentBackupStatus}
          currentBackupMissingPaths={backupInfo?.currentBackupMissingPaths ?? []}
          hasCurrentBackup={Boolean(backupInfo?.hasCurrentBackup)}
          backupPaths={backupConfig?.backupPaths ?? backupInfo?.backupPaths ?? []}
          restorePaths={backupConfig?.restorePaths ?? backupInfo?.restorePaths ?? []}
          availableBackups={backupInfo?.availableBackups ?? []}
          pendingBackupDeleteVersion={pendingBackupDeleteVersion}
          backupActionResult={backupActionResult}
          backupInfoMessage={backupInfo?.message ?? null}
          formatTimestampText={formatTimestampText}
          onRefresh={() => void refreshBackupInfo()}
          onBackup={() => void handleBackupAction("backup")}
          onRestore={() => void handleBackupAction("restore")}
          onToggleSelectedPath={toggleSelectedPath}
          onOpenBackupDirectory={(versionName) => void handleOpenBackupDirectory(versionName)}
          onConfirmDeleteBackupVersion={(versionName) => void handleDeleteBackupVersion(versionName)}
          onRequestDeleteBackupVersion={setPendingBackupDeleteVersion}
        />
      ) : null}

      {activeMainView === "logcat" ? (
        <LogcatPage
          logcat={{
            logcatPageTab,
            setLogcatPageTab,
            logcatFilterShellRef,
            logcatSearchTerm,
            setLogcatSearchTerm,
            logcatRegexEnabled,
            setLogcatRegexEnabled,
            logcatAdvancedOpen,
            setLogcatAdvancedOpen,
            clearLogcatFilterRules,
            addLogcatFilterRule,
            logcatFilterRules,
            updateLogcatRuleJoiner,
            updateLogcatRuleField,
            LOGCAT_RULE_FIELD_OPTIONS,
            updateLogcatFilterRule,
            getLogcatRulePlaceholder,
            openLogcatProcessPicker,
            openLogcatPackagePicker,
            removeLogcatFilterRule,
            hasAllLogcatLevels,
            applyLogcatLevelPreset,
            LOGCAT_LEVEL_OPTIONS,
            logcatLevels,
            toggleLogcatLevel,
            getLogcatLevelLabel,
            logcatBuffers,
            setLogcatBuffers,
            logcatPickerState,
            logcatPickerStyle,
            setLogcatPickerState,
            logcatPickerQuery,
            setLogcatPickerQuery,
            logcatPickerLoading,
            filteredLogcatPackageCatalog,
            filteredLogcatProcessCatalog,
            activePickerRuleValues,
            applyLogcatRuleValue,
            appendLogcatRuleValue,
            invalidLogcatRegex,
            logcatRunning,
            logcatStreamState,
            filteredLogcatItems,
            renderedLogcatItems,
            logcatClearBeforeStartEnabled,
            setLogcatClearBeforeStartEnabled,
            logcatBusy,
            handleStartLogcat,
            handleStopLogcat,
            handleClearLogcat,
            handleDownloadLogcat,
            logcatDownloading,
            deferredRenderedLogcatItems,
            logcatMaximized,
            setLogcatMaximized,
            logcatListRef,
            setLogcatAutoFollow,
            logcatPaused,
            setLogcatPaused,
            logcatWrapEnabled,
            setLogcatWrapEnabled,
            shouldVirtualizeLogcat,
            logcatVirtualRowHeight,
            LOGCAT_VIRTUAL_OVERSCAN,
            setLogcatViewportHeight,
            setLogcatVirtualStartIndex,
            logcatVirtualWindow,
            getLogcatDisplayLineNumber,
            logcatHighlightTerm,
            handleLogcatRowClick,
            LogcatRow,
          }}
          crash={{
            crashLoading,
            setCrashLoading,
            crashContent,
            setCrashContent,
            crashFiles,
            setCrashFiles,
            setCrashContentLoading,
          }}
          bugreport={{
            bugreportRunning,
            setBugreportRunning,
            bugreportResult,
            setBugreportResult,
          }}
          trace={{
            traceDuration,
            setTraceDuration,
            traceCategories,
            setTraceCategories,
            traceRunning,
            setTraceRunning,
            traceResult,
            setTraceResult,
          }}
          shared={{
            currentDeviceLabel,
            currentDeviceId,
            hasCurrentDevice: Boolean(currentDevice),
            handleOpenLocalPath,
          }}
        />
      ) : null}
      </Suspense>

      {contextMenuState ? (
        <div
          className="context-menu panel"
          ref={contextMenuRef}
          style={{ top: contextMenuState.y, left: contextMenuState.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <button className="context-menu-item" onClick={() => handleContextMenuAction("modify")}>{contextMenuState.kind === "panel" ? "修改" : "编辑参数"}</button>
          {contextMenuState.kind === "command" ? <button className="context-menu-item" onClick={() => handleContextMenuAction("rename")}>重命名</button> : null}
          <button className="context-menu-item context-menu-item-danger" onClick={() => handleContextMenuAction("delete")}>删除</button>
        </div>
      ) : null}

      {commandRenameDialog ? (
        <>
          <div className="rename-dialog-scrim" onClick={() => setCommandRenameDialog(null)} />
          <div className="rename-dialog panel" onClick={(event) => event.stopPropagation()}>
            <div className="rename-dialog-header">
              <h3>重命名命令</h3>
              <button className="ghost-button compact-button" onClick={() => setCommandRenameDialog(null)}>关闭</button>
            </div>
            <label className="param-field rename-dialog-field">
              <span>命令名称</span>
              <input
                autoFocus
                value={commandRenameDialog.name}
                onChange={(e) => setCommandRenameDialog((s) => s ? { ...s, name: e.target.value } : s)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitCommandRename(); } }}
              />
            </label>
            <div className="rename-dialog-footer">
              <button className="primary-button" onClick={submitCommandRename}>确定</button>
            </div>
          </div>
        </>
      ) : null}

      {keySimQuickPickerOpen ? (
        <div className="modal-mask" role="dialog" aria-modal="true" style={{ zIndex: 9999 }}>
          <div className="modal-card keysim-picker-modal">
            <div className="modal-head">
              <h3>{keySimQuickPickerMode === "tap" ? "截图取点" : "截图取起终点"}</h3>
              <button className="icon-button" onClick={() => setKeySimQuickPickerOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="page-actions keysim-actions-row">
                <button className="ghost-button compact-button" disabled={keySimScreenshotLoading} onClick={() => void handleRefreshKeySimScreenshot()}>
                  {keySimScreenshotLoading ? "截图中..." : "刷新截图"}
                </button>
                {keySimQuickPickerMode === "tap" ? (
                  <span className="chip">已选坐标：{keySimQuickPickerTapPoint ? `${keySimQuickPickerTapPoint.x}, ${keySimQuickPickerTapPoint.y}` : "未设置"}</span>
                ) : (
                  <>
                    <span className="chip">起点：{keySimQuickPickerSwipeStart ? `${keySimQuickPickerSwipeStart.x}, ${keySimQuickPickerSwipeStart.y}` : "未设置"}</span>
                    <span className="chip">终点：{keySimQuickPickerSwipeEnd ? `${keySimQuickPickerSwipeEnd.x}, ${keySimQuickPickerSwipeEnd.y}` : "未设置"}</span>
                  </>
                )}
              </div>
              {keySimScreenshotDataUrl ? (
                <div className="keysim-screenshot-shell">
                  <img
                    className="keysim-screenshot"
                    src={keySimScreenshotDataUrl}
                    alt="取点截图"
                    onLoad={(event) => {
                      setKeySimScreenshotSize({
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      });
                    }}
                    onClick={handleQuickPickerImageClick}
                  />
                </div>
              ) : (
                <div className="result-empty-state">{keySimQuickPickerMode === "tap" ? "点击刷新截图后，在图上选择坐标。" : "点击刷新截图后，在图上先点起点，再点终点。"}</div>
              )}
            </div>
            <div className="modal-foot">
              <button className="ghost-button" onClick={() => setKeySimQuickPickerOpen(false)}>取消</button>
              <button className="primary-button" onClick={keySimPickerTarget === "macro" ? applyMacroPickerPoints : applyQuickPickerPoints}>
                {keySimQuickPickerMode === "tap" ? "应用坐标" : "应用起终点"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {panelDialogState ? (
        <>
          <div className="rename-dialog-scrim" onClick={() => setPanelDialogState(null)} />
          <div className="rename-dialog panel" onClick={(event) => event.stopPropagation()}>
            <div className="rename-dialog-header">
              <div>
                <p className="section-kicker">编辑</p>
                <h3>{panelDialogState.title}</h3>
              </div>
              <button className="ghost-button compact-button" onClick={() => setPanelDialogState(null)}>关闭</button>
            </div>
            <label className="param-field rename-dialog-field">
              <span>面板名称</span>
              <input
                autoFocus
                value={panelDialogState.name}
                onChange={(event) => setPanelDialogState((current) => current ? { ...current, name: event.target.value } : current)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitPanelDialog();
                  }
                }}
              />
            </label>
            <label className="param-field rename-dialog-field">
              <span>面板描述</span>
              <textarea
                className="panel-dialog-textarea"
                value={panelDialogState.description}
                placeholder="说明这个面板主要承载什么命令"
                onChange={(event) => setPanelDialogState((current) => current ? { ...current, description: event.target.value } : current)}
              />
            </label>
            <div className="rename-dialog-actions">
              <button className="ghost-button" onClick={() => setPanelDialogState(null)}>取消</button>
              <button className="primary-button" onClick={submitPanelDialog}>{panelDialogState.mode === "create" ? "创建面板" : "保存修改"}</button>
            </div>
          </div>
        </>
      ) : null}

      {panelCommandParamDialog ? (
        <div className="modal-mask" role="dialog" aria-modal="true">
          <div className="modal-card keysim-quick-modal">
            <div className="modal-head">
              <h3>编辑参数 · {panelCommandParamDialog.title}</h3>
              <button className="icon-button" onClick={() => setPanelCommandParamDialog(null)}>×</button>
            </div>
            <div className="modal-body keysim-quick-modal-body">
              {panelCommandDialogRequiredParams.length ? (
                <div className="param-block">
                  <p className="param-title">必填参数</p>
                  {panelCommandDialogRequiredParams.map((param) => (
                    <label className="param-field" key={param.key}>
                      <span>{param.label}</span>
                      <small className="param-hint">{param.placeholder}</small>
                      <input
                        value={panelCommandParamDialog.params[param.key] ?? ""}
                        placeholder={param.placeholder}
                        onChange={(event) => updatePanelCommandDialogParam(param.key, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              ) : null}
              {panelCommandDialogOptionalParams.length ? (
                <div className="param-block">
                  <p className="param-title">可选参数</p>
                  {panelCommandDialogOptionalParams.map((param) => {
                    if (isToggleParam(param)) {
                      const toggleValue = getToggleParamValue(param);
                      return (
                        <div className="param-field param-field-toggle" key={param.key}>
                          <label className="param-toggle-row">
                            <input
                              type="checkbox"
                              checked={(panelCommandParamDialog.params[param.key] ?? "") === toggleValue}
                              onChange={(event) => updatePanelCommandDialogParam(param.key, event.target.checked ? toggleValue : "")}
                            />
                            <span>{getParamInlineText(param)}</span>
                          </label>
                        </div>
                      );
                    }

                    return (
                      <label className="param-field" key={param.key}>
                        <span>{getParamInlineText(param)}</span>
                        <input
                          value={panelCommandParamDialog.params[param.key] ?? ""}
                          placeholder={param.placeholder}
                          onChange={(event) => updatePanelCommandDialogParam(param.key, event.target.value)}
                        />
                      </label>
                    );
                  })}
                </div>
              ) : null}
              <label className="param-field">
                <span>实际命令预览</span>
                <textarea value={panelCommandParamDialog.rawCommand} readOnly />
              </label>
            </div>
            <div className="modal-foot">
              <button className="ghost-button" onClick={() => setPanelCommandParamDialog(null)}>取消</button>
              <button className="ghost-button" onClick={() => void savePanelCommandDialogAndMaybeRun(false)}>保存</button>
              <button className="primary-button" onClick={() => void savePanelCommandDialogAndMaybeRun(true)}>保存并执行</button>
            </div>
          </div>
        </div>
      ) : null}

      {scrcpyConfigDialog ? (
        <>
          <div className="rename-dialog-scrim" onClick={() => setScrcpyConfigDialog(null)} />
          <div className="scrcpy-dialog panel" onClick={(event) => event.stopPropagation()}>
            <div className="rename-dialog-header">
              <div>
                <p className="section-kicker">投屏配置</p>
                <h3>{scrcpyConfigDialog.deviceName} / Display {scrcpyConfigDialog.display.displayId}</h3>
              </div>
              <button className="ghost-button compact-button" onClick={() => setScrcpyConfigDialog(null)}>关闭</button>
            </div>
            <div className="scrcpy-dialog-summary">
              <span className="badge info">{scrcpyConfigDialog.display.label}</span>
              <span className="badge">{scrcpyConfigDialog.display.logicalWidth} x {scrcpyConfigDialog.display.logicalHeight}</span>
              <span className="badge">方向 {scrcpyConfigDialog.display.orientation}</span>
            </div>
            {scrcpyConfigDialog.notice ? <div className="scrcpy-dialog-notice">{scrcpyConfigDialog.notice}</div> : null}
            <div className="scrcpy-config-grid">
              <label className="param-field rename-dialog-field">
                <span>最长边</span>
                <input type="number" value={String(scrcpyConfigDialog.config.maxSize)} onChange={(event) => updateScrcpyConfigDraft({ maxSize: Number(event.target.value || "0") })} placeholder="0 表示不限制" />
              </label>
              <label className="param-field rename-dialog-field">
                <span>窗口 X</span>
                <input type="number" value={String(scrcpyConfigDialog.config.windowX)} onChange={(event) => updateScrcpyConfigDraft({ windowX: Number(event.target.value || "0") })} />
              </label>
              <label className="param-field rename-dialog-field">
                <span>窗口 Y</span>
                <input type="number" value={String(scrcpyConfigDialog.config.windowY)} onChange={(event) => updateScrcpyConfigDraft({ windowY: Number(event.target.value || "0") })} />
              </label>
              <label className="param-field rename-dialog-field">
                <span>窗口宽度</span>
                <input type="number" value={String(scrcpyConfigDialog.config.windowWidth)} onChange={(event) => updateScrcpyConfigDraft({ windowWidth: Number(event.target.value || "0") })} placeholder="0 表示自动" />
              </label>
              <label className="param-field rename-dialog-field">
                <span>窗口高度</span>
                <input type="number" value={String(scrcpyConfigDialog.config.windowHeight)} onChange={(event) => updateScrcpyConfigDraft({ windowHeight: Number(event.target.value || "0") })} placeholder="0 表示自动" />
              </label>
            </div>
            <div className="rename-dialog-actions">
              <button className="ghost-button" onClick={() => setScrcpyConfigDialog(null)}>取消</button>
              <button className="ghost-button" disabled={scrcpyConfigDialog.saving || scrcpyConfigDialog.syncing} onClick={() => void handleSyncScrcpyWindowConfig()}>{scrcpyConfigDialog.syncing ? "同步中..." : "按当前启动窗口配置"}</button>
              <button className="ghost-button" disabled={!scrcpyAvailable} onClick={() => void handleLaunchScrcpy(scrcpyConfigDialog.display)}>直接投屏</button>
              <button className="primary-button" disabled={scrcpyConfigDialog.saving || scrcpyConfigDialog.syncing} onClick={() => void handleSaveScrcpyConfig()}>{scrcpyConfigDialog.saving ? "保存中..." : "保存配置"}</button>
            </div>
          </div>
        </>
      ) : null}

      {deviceComponentDialog ? (
        <>
          <div className="rename-dialog-scrim" onClick={() => setDeviceComponentDialog(null)} />
          <div className="scrcpy-dialog device-component-dialog panel" onClick={(event) => event.stopPropagation()}>
            <div className="rename-dialog-header">
              <div>
                <p className="section-kicker">组件详情</p>
                <h3>{deviceComponentDialog.componentName}</h3>
              </div>
              <button className="ghost-button compact-button" onClick={() => setDeviceComponentDialog(null)}>关闭</button>
            </div>
            <div className="page-header-badges">
              <span className="badge info">{deviceComponentDialog.detail.componentType}</span>
              <span className="badge">Action {deviceComponentDialog.detail.actions.length}</span>
              <span className="badge">Mime {deviceComponentDialog.detail.mimeTypes.length}</span>
            </div>
            <div className="device-info-section-grid">
              {[
                { label: "Action", items: deviceComponentDialog.detail.actions },
                { label: "Category", items: deviceComponentDialog.detail.categories },
                { label: "Mime Type", items: deviceComponentDialog.detail.mimeTypes },
                { label: "Scheme", items: deviceComponentDialog.detail.schemes },
                { label: "Authority", items: deviceComponentDialog.detail.authorities },
                { label: "Path", items: deviceComponentDialog.detail.paths },
              ].map((section) => (
                <div className="device-info-section-card" key={`component-dialog-${section.label}`}>
                  <div className="theme-panel-head">
                    <p className="section-kicker">{section.label}</p>
                    <span className="badge info">{section.items.length}</span>
                  </div>
                  {section.items.length ? (
                    <div className="device-info-token-list">
                      {section.items.map((item) => <span className="token-chip" key={`${section.label}-${item}`}>{item}</span>)}
                    </div>
                  ) : (
                    <div className="result-empty-state">当前未解析到 {section.label}。</div>
                  )}
                </div>
              ))}
            </div>
            <div className="page-section">
              <div className="theme-panel-head">
                <p className="section-kicker">原始解析片段</p>
                <span className="badge info">{deviceComponentDialog.detail.rawLines.length}</span>
              </div>
              {deviceComponentDialog.detail.rawLines.length ? (
                <div className="raw-output-block">
                  <div className="raw-markdown-block">
                    <ReactMarkdown>{wrapInMarkdownCodeBlock(deviceComponentDialog.detail.rawLines.join("\n"))}</ReactMarkdown>
                  </div>
                </div>
              ) : (
                <div className="result-empty-state">当前 dumpsys package 中未提取到该组件的更多明细。</div>
              )}
            </div>
          </div>
        </>
      ) : null}

      {pendingProcessKill ? (
        <>
          <div className="rename-dialog-scrim" onClick={() => setPendingProcessKill(null)} />
          <div className="rename-dialog danger-dialog panel" onClick={(event) => event.stopPropagation()}>
            <div className="rename-dialog-header">
              <div>
                <p className="section-kicker">二次确认</p>
                <h3>确认杀死进程</h3>
              </div>
              <button className="ghost-button compact-button" onClick={() => setPendingProcessKill(null)}>关闭</button>
            </div>
            <div className="result-empty-state">
              将尝试结束进程 {pendingProcessKill.name}（PID {pendingProcessKill.pid}）。系统进程或受保护进程可能需要 root 权限。
            </div>
            <div className="rename-dialog-actions">
              <button className="ghost-button" onClick={() => setPendingProcessKill(null)}>取消</button>
              <button className="primary-button danger-button" onClick={() => void handleConfirmKillProcess()}>确认杀死</button>
            </div>
          </div>
        </>
      ) : null}

      {confirmDialog ? (
        <>
          <div className="rename-dialog-scrim" onClick={dismissConfirmDialog} />
          <div className={`rename-dialog ${confirmDialog.tone === "danger" ? "danger-dialog" : "warning-dialog"} panel`} onClick={(event) => event.stopPropagation()}>
            <div className="rename-dialog-header">
              <div>
                <p className="section-kicker">执行前确认</p>
                <h3>{confirmDialog.title}</h3>
              </div>
              <button className="ghost-button compact-button" onClick={dismissConfirmDialog}>关闭</button>
            </div>
            <div className="result-empty-state">{confirmDialog.message}</div>
            <div className="rename-dialog-actions">
              <button className="ghost-button" onClick={dismissConfirmDialog}>取消</button>
              <button className={`primary-button ${confirmDialog.tone === "danger" ? "danger-button" : "warning-button"}`} onClick={handleConfirmDialog}>{confirmDialog.confirmLabel}</button>
            </div>
          </div>
        </>
      ) : null}

      {remoteDeviceDialog ? (
        <>
          <div className="rename-dialog-scrim" onClick={() => setRemoteDeviceDialog(null)} />
          <div className="scrcpy-dialog remote-device-dialog panel" onClick={(event) => event.stopPropagation()}>
            <div className="rename-dialog-header">
              <div>
                <p className="section-kicker">远程连接</p>
                <h3>{remoteDeviceDialog.id ? "编辑设备" : "添加设备"}</h3>
              </div>
              <button className="ghost-button compact-button" onClick={() => setRemoteDeviceDialog(null)}>关闭</button>
            </div>
            <div className="remote-device-dialog-body">
              <div className="scrcpy-config-grid remote-device-grid">
                <label className="param-field">
                  <span>设备名称</span>
                  <input
                    value={remoteDeviceDialog.name}
                    onChange={(event) => setRemoteDeviceDialog((current) => current ? { ...current, name: event.target.value } : current)}
                    placeholder="例如 会议室测试机"
                  />
                </label>
                <label className="param-field">
                  <span>连接地址</span>
                  <input
                    value={remoteDeviceDialog.host}
                    onChange={(event) => setRemoteDeviceDialog((current) => current ? { ...current, host: event.target.value } : current)}
                    placeholder="例如 192.168.1.18"
                    disabled={editingConnectedRemoteDevice}
                  />
                </label>
                <label className="param-field">
                  <span>连接端口</span>
                  <input
                    value={remoteDeviceDialog.port}
                    onChange={(event) => setRemoteDeviceDialog((current) => current ? { ...current, port: event.target.value } : current)}
                    placeholder="例如 5555"
                    disabled={editingConnectedRemoteDevice}
                  />
                </label>
              </div>
              <div className="remote-pair-mode-row">
                <span className="section-kicker">配对方式</span>
                <div className="remote-pair-mode-actions">
                  <button
                    className={`chip ${remoteDeviceDialog.pairMode === "direct" ? "active" : ""}`}
                    onClick={() => setRemoteDeviceDialog((current) => current ? { ...current, pairMode: "direct" } : current)}
                    disabled={editingConnectedRemoteDevice}
                  >
                    无需配对
                  </button>
                  <button
                    className={`chip ${remoteDeviceDialog.pairMode === "manual" ? "active" : ""}`}
                    onClick={() => setRemoteDeviceDialog((current) => current ? { ...current, pairMode: "manual" } : current)}
                    disabled={editingConnectedRemoteDevice}
                  >
                    手动配对
                  </button>
                </div>
              </div>
              {remoteDeviceDialog.pairMode === "manual" ? (
                <div className="scrcpy-config-grid remote-device-grid">
                  <label className="param-field">
                    <span>配对地址</span>
                    <input
                      value={remoteDeviceDialog.pairHost}
                      onChange={(event) => setRemoteDeviceDialog((current) => current ? { ...current, pairHost: event.target.value } : current)}
                      placeholder="默认沿用连接地址"
                      disabled={editingConnectedRemoteDevice}
                    />
                  </label>
                  <label className="param-field">
                    <span>配对端口</span>
                    <input
                      value={remoteDeviceDialog.pairPort}
                      onChange={(event) => setRemoteDeviceDialog((current) => current ? { ...current, pairPort: event.target.value } : current)}
                      placeholder="例如 37123"
                      disabled={editingConnectedRemoteDevice}
                    />
                  </label>
                  <label className="param-field remote-device-grid-span-2">
                    <span>配对码</span>
                    <input
                      value={remoteDeviceDialog.pairingCode}
                      onChange={(event) => setRemoteDeviceDialog((current) => current ? { ...current, pairingCode: event.target.value } : current)}
                      placeholder="输入 6 位配对码"
                      disabled={editingConnectedRemoteDevice}
                    />
                  </label>
                </div>
              ) : null}
              <label className="param-toggle-row logcat-regex-toggle">
                <input
                  type="checkbox"
                  checked={remoteDeviceDialog.saveConfig}
                  onChange={(event) => setRemoteDeviceDialog((current) => current ? { ...current, saveConfig: event.target.checked } : current)}
                />
                <span>保存为配置，下次可在设备列表中直接连接</span>
              </label>
                {isBrowserPreviewMode || editingConnectedRemoteDevice || remoteDeviceDialog.pairMode === "manual" ? (
                  <div className="inline-tip">
                    {isBrowserPreviewMode
                      ? "当前为浏览器预览模式，连接相关命令不会真正执行。"
                      : editingConnectedRemoteDevice
                        ? "设备已连接，当前仅允许修改别名。"
                        : "手动配对会先执行配对，再执行连接。"}
                  </div>
                ) : null}
              <div className="remote-device-discovery-head">
                <div>
                  <p className="section-kicker">自动发现</p>
                  <span className="badge info">ADB mDNS</span>
                </div>
                <div className="remote-device-utility-actions">
                    <button className="ghost-button compact-button" onClick={() => void handleDiscoverRemoteDebugServices()} disabled={remoteDeviceDialog.busy !== null || isBrowserPreviewMode}>
                    {remoteDeviceDialog.busy === "discover" ? "扫描中..." : "扫描可用无线调试地址"}
                  </button>
                </div>
              </div>
              {remoteDebugCandidates.length ? (
                <div className="remote-debug-candidate-list">
                  {remoteDebugCandidates.map((candidate) => (
                    <button
                      key={`${candidate.kind}:${candidate.host}:${candidate.port}`}
                      className="remote-debug-candidate"
                      onClick={() => setRemoteDeviceDialog((current) => current ? {
                        ...current,
                        host: candidate.kind === "connect" ? candidate.host : current.host,
                        port: candidate.kind === "connect" ? candidate.port : current.port,
                        pairMode: candidate.kind === "pairing" ? "manual" : current.pairMode,
                        pairHost: candidate.kind === "pairing" ? candidate.host : (current.pairHost || candidate.host),
                        pairPort: candidate.kind === "pairing" ? candidate.port : current.pairPort,
                        notice: candidate.kind === "pairing"
                          ? `已回填配对地址：${candidate.host}:${candidate.port}`
                          : `已回填连接地址：${candidate.host}:${candidate.port}`,
                      } : current)}
                    >
                      <span className={`badge ${candidate.kind === "pairing" ? "warning" : "info"}`}>{candidate.kind === "pairing" ? "配对" : "连接"}</span>
                      <strong>{candidate.host}:{candidate.port}</strong>
                      <span>{candidate.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {remoteDeviceDialog.notice ? <div className="result-empty-state">{remoteDeviceDialog.notice}</div> : null}
            </div>
            <div className="rename-dialog-actions">
              <button className="ghost-button" onClick={handleSaveRemoteDeviceConfig} disabled={remoteDeviceDialog.busy !== null}>保存配置</button>
              <button
                className="ghost-button"
                onClick={() => editingConnectedRemoteDevice
                  ? void handleDisconnectRemoteDevice(
                    {
                      id: remoteDeviceDialog.id || `${remoteDeviceDialog.host}:${remoteDeviceDialog.port}`,
                      name: remoteDeviceDialog.name.trim(),
                      host: remoteDeviceDialog.host.trim(),
                      port: remoteDeviceDialog.port.trim(),
                      pairHost: remoteDeviceDialog.pairHost.trim(),
                      pairPort: remoteDeviceDialog.pairPort.trim(),
                    },
                    editingRemoteDeviceSummary?.connectedDevice?.id,
                  )
                  : void handleConnectRemoteDevice("connect")}
                disabled={remoteDeviceDialog.busy !== null || isBrowserPreviewMode}
              >
                {editingConnectedRemoteDevice
                  ? "断开连接"
                  : remoteDeviceDialog.busy === "connect"
                    ? "连接中..."
                    : "直接连接"}
              </button>
              <button className="primary-button" onClick={() => void handleConnectRemoteDevice("pair-connect")} disabled={remoteDeviceDialog.busy !== null || isBrowserPreviewMode || remoteDeviceDialog.pairMode !== "manual" || editingConnectedRemoteDevice}>
                {remoteDeviceDialog.busy === "pair-connect" ? "配对中..." : "配对并连接"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {adbHealthCheckDialogOpen ? (
        <>
          <div className="rename-dialog-scrim" onClick={() => setAdbHealthCheckDialogOpen(false)} />
          <div className="scrcpy-dialog adb-health-dialog panel" onClick={(event) => event.stopPropagation()}>
            <div className="rename-dialog-header">
              <div>
                <p className="section-kicker">ADB 健康检查</p>
                <h3>主机环境</h3>
              </div>
              <button className="ghost-button compact-button" onClick={() => setAdbHealthCheckDialogOpen(false)}>关闭</button>
            </div>
            <div className="remote-device-dialog-body">
              <div className="result-empty-state">{adbHealthCheck?.summary ?? "点击“重新检查”开始执行。"}</div>
              {adbHealthCheck?.steps.length ? (
                <div className="remote-health-check-list">
                  {adbHealthCheck.steps.map((step) => (
                    <div key={step.label} className="remote-health-check-item">
                      <div className="theme-panel-head">
                        <p className="section-kicker">{step.label}</p>
                        <span className={`badge ${step.tone === "success" ? "success" : step.tone === "error" ? "danger" : "warning"}`}>{step.tone === "success" ? "通过" : step.tone === "error" ? "异常" : "警告"}</span>
                      </div>
                      <div className="raw-output-block">
                        <div className="raw-markdown-block">
                          <ReactMarkdown>{wrapInMarkdownCodeBlock(step.detail)}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="rename-dialog-actions">
              <button className="ghost-button" onClick={() => void handleRunAdbHealthCheck()} disabled={adbHealthCheck?.busy ?? false}>
                {adbHealthCheck?.busy ? "检查中..." : "重新检查"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {uiToast ? (
        <div className={`toast-notice toast-${uiToast.tone}`}>
          <span className="toast-message">{uiToast.message}</span>
          <div className="toast-actions">
            {uiToast.actionLabel && uiToast.actionPath ? (
              <button className="ghost-button compact-button" onClick={() => void handleOpenLocalPath(uiToast.actionPath!)}>{uiToast.actionLabel}</button>
            ) : null}
            <button className="ghost-button compact-button" onClick={() => setUiToast(null)}>关闭</button>
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <>
          <div className="settings-modal-scrim" onClick={() => setSettingsOpen(false)} />
          <div className="settings-modal panel" onClick={(event) => event.stopPropagation()}>
            <div className="settings-modal-header">
              <div>
                <p className="section-kicker">设置中心</p>
                <h3>{settingsTab === "theme" ? "主题设置" : settingsTab === "general" ? "通用规则" : settingsTab === "backup-rules" ? "备份与恢复规则" : "日志捕获设置"}</h3>
              </div>
              <button className="ghost-button compact-button" onClick={() => setSettingsOpen(false)}>关闭</button>
            </div>
            <div className="settings-tabs">
              <button className={`chip ${settingsTab === "theme" ? "active" : ""}`} onClick={() => setSettingsTab("theme")}>主题</button>
              <button className={`chip ${settingsTab === "general" ? "active" : ""}`} onClick={() => setSettingsTab("general")}>通用规则</button>
              <button className={`chip ${settingsTab === "backup-rules" ? "active" : ""}`} onClick={() => setSettingsTab("backup-rules")}>备份规则</button>
              <button className={`chip ${settingsTab === "logcat" ? "active" : ""}`} onClick={() => setSettingsTab("logcat")}>日志捕获</button>
            </div>
            {settingsTab === "theme" ? (
              <div className="theme-panel">
                <div className="theme-panel-head">
                  <p className="section-kicker">主题与界面</p>
                </div>
                <div className="theme-grid">
                  {THEME_PRESETS.map((theme) => (
                    <button
                      key={theme.id}
                      className={`theme-card ${theme.id === activeTheme.id ? "active" : ""}`}
                      onClick={() => setActiveThemeId(theme.id)}
                    >
                      <div
                        className="theme-preview"
                        style={{
                          "--theme-preview-canvas": theme.vars["--bg-canvas"],
                          "--theme-preview-surface": theme.vars["--bg-surface-strong"],
                          "--theme-preview-primary": theme.vars["--action-primary"],
                          "--theme-preview-secondary": theme.vars["--action-secondary"],
                          "--theme-preview-text": theme.vars["--text-primary"],
                          "--theme-preview-muted": theme.vars["--text-secondary"]
                        } as CSSProperties}
                      >
                        <div className="theme-preview-top">
                          <span className="theme-preview-dot" />
                          <span className="theme-preview-line" />
                          <span className="theme-preview-pill" />
                        </div>
                        <div className="theme-preview-body">
                          <div className="theme-preview-rail" />
                          <div className="theme-preview-main">
                            <span className="theme-preview-line theme-preview-line-wide" />
                            <span className="theme-preview-line theme-preview-line-mid" />
                            <div className="theme-preview-cards">
                              <span />
                              <span />
                            </div>
                          </div>
                        </div>
                        <div className="theme-preview-chips">
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                      <span className="theme-card-label">{theme.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {settingsTab === "general" ? (
              <div className="theme-panel">
                <div className="theme-panel-head">
                  <p className="section-kicker">交互规则</p>
                  <span className="badge info">保存到本地设置</span>
                </div>
                <label className="param-toggle-row logcat-regex-toggle">
                  <input
                    type="checkbox"
                    checked={generalSettingsRulesDraft.closeSettingsOnSave}
                    onChange={(event) => setGeneralSettingsRulesDraft((current) => ({ ...current, closeSettingsOnSave: event.target.checked }))}
                  />
                  <span>保存后关闭弹窗</span>
                </label>
                <label className="param-field">
                  <span>拉取 APK 导出方式</span>
                  <select
                    value={generalSettingsRulesDraft.apkExportMode}
                    onChange={(event) => {
                      setGeneralSettingsRulesDraft((current) => ({
                        ...current,
                        apkExportMode: event.target.value as GeneralSettingsRules["apkExportMode"],
                      }));
                    }}
                  >
                    <option value="fixed-directory">固定导出目录</option>
                    <option value="custom-directory">每次选择目录</option>
                  </select>
                </label>
                {generalSettingsRulesDraft.apkExportMode === "fixed-directory" ? (
                  <>
                    <label className="param-field">
                      <span>固定导出目录</span>
                      <input
                        value={generalSettingsRulesDraft.apkExportDirectory}
                        onChange={(event) => setGeneralSettingsRulesDraft((current) => ({ ...current, apkExportDirectory: event.target.value }))}
                        placeholder="例如 /home/tsdl/Downloads/apk"
                      />
                    </label>
                    <div className="page-actions">
                      <button className="ghost-button" onClick={() => void handleChooseApkExportDirectory()}>选择目录</button>
                    </div>
                  </>
                ) : (
                  <div className="inline-tip">启用后，“拉取 APK”会先弹出目录选择器。</div>
                )}
                <div className="page-actions">
                  <button className="ghost-button" onClick={() => setGeneralSettingsRulesDraft(generalSettingsRules)}>重置草稿</button>
                  <button className="primary-button" onClick={handleSaveGeneralSettingsRules}>保存规则</button>
                </div>
              </div>
            ) : null}
            {settingsTab === "backup-rules" ? (
              <div className="theme-panel">
                <div className="theme-panel-head">
                  <p className="section-kicker">规则配置</p>
                  <span className="badge info">根目录：{backupRootDraft || backupConfig?.backupRoot || backupInfo?.backupRoot || BACKUP_ROOT_PATH}</span>
                </div>
                <label className="param-field">
                  <span>版本号属性</span>
                  <input value={backupVersionPropDraft} onChange={(event) => setBackupVersionPropDraft(event.target.value)} placeholder="例如 ro.build.display.id" />
                </label>
                <label className="param-field">
                  <span>本地备份根目录</span>
                  <input value={backupRootDraft} onChange={(event) => setBackupRootDraft(event.target.value)} placeholder="例如 /home/tsdl/ssd/ingo/backup" />
                </label>
                <div className="backup-rule-grid">
                  <label className="param-field">
                    <span>默认备份目录</span>
                    <textarea className="panel-dialog-textarea backup-rule-textarea" value={backupPathsDraft} onChange={(event) => setBackupPathsDraft(event.target.value)} placeholder="每行一个路径，例如 /system/framework" />
                  </label>
                  <label className="param-field">
                    <span>默认恢复目录</span>
                    <textarea className="panel-dialog-textarea backup-rule-textarea" value={restorePathsDraft} onChange={(event) => setRestorePathsDraft(event.target.value)} placeholder="每行一个路径，例如 /system/framework" />
                  </label>
                </div>
                <div className="page-actions">
                  <button className="ghost-button" onClick={() => void refreshBackupConfig()} disabled={backupConfigSaving}>重置草稿</button>
                  <button className="primary-button" onClick={() => void handleSaveBackupRules()} disabled={backupConfigSaving}>{backupConfigSaving ? "保存中..." : "保存规则"}</button>
                </div>
              </div>
            ) : null}
            {settingsTab === "logcat" ? (
              <div className="theme-panel">
                <div className="theme-panel-head">
                  <p className="section-kicker">日志文件</p>
                  <span className="badge info">当前目录：{logcatOutputDirDraft || logcatConfig?.outputDir || DEFAULT_LOGCAT_OUTPUT_DIR}</span>
                </div>
                <label className="param-field">
                  <span>日志文件目录</span>
                  <input value={logcatOutputDirDraft} onChange={(event) => setLogcatOutputDirDraft(event.target.value)} placeholder="例如 /home/tsdl/ssd/ingo/logcat" />
                </label>
                <label className="param-field">
                  <span>单文件大小上限（MB）</span>
                  <input value={logcatMaxFileSizeDraft} onChange={(event) => setLogcatMaxFileSizeDraft(event.target.value)} placeholder="例如 10" />
                </label>
                <label className="param-field">
                  <span>日志显示区行数上限</span>
                  <input value={logcatDisplayLineLimitDraft} onChange={(event) => setLogcatDisplayLineLimitDraft(event.target.value)} placeholder="例如 3000" />
                </label>
                <label className="param-field">
                  <span>日志刷新间隔（毫秒）</span>
                  <input value={logcatRefreshIntervalDraft} onChange={(event) => setLogcatRefreshIntervalDraft(event.target.value)} placeholder="例如 300" />
                </label>
                <label className="param-toggle-row logcat-regex-toggle">
                  <input type="checkbox" checked={logcatClearBeforeStartDraft} onChange={(event) => setLogcatClearBeforeStartDraft(event.target.checked)} />
                  <span>默认勾选“捕获前清空设备日志”</span>
                </label>
                <label className="param-toggle-row logcat-regex-toggle">
                  <input type="checkbox" checked={logcatDefaultRegexEnabledDraft} onChange={(event) => setLogcatDefaultRegexEnabledDraft(event.target.checked)} />
                  <span>默认勾选“启用正则表达式”</span>
                </label>
                <div className="logcat-level-panel">
                  <span className="summary-label">默认 Level 过滤</span>
                  <div className="logcat-level-chip-row">
                    <button className={`ghost-button compact-button ${hasAllLogcatDefaultLevels ? "active" : ""}`} onClick={() => applyLogcatDefaultLevelPreset("all")}>全选</button>
                    <button className="ghost-button compact-button" onClick={() => applyLogcatDefaultLevelPreset("none")}>清空</button>
                    <button className="ghost-button compact-button" onClick={() => applyLogcatDefaultLevelPreset("debug-plus")}>DEBUG+</button>
                    <button className="ghost-button compact-button" onClick={() => applyLogcatDefaultLevelPreset("info-plus")}>INFO+</button>
                    {LOGCAT_LEVEL_OPTIONS.map((level) => (
                      <button
                        key={`logcat-default-level-${level}`}
                        className={`chip logcat-level-chip logcat-level-chip-${level.toLowerCase()} ${logcatDefaultLevelsDraft.includes(level) ? "active" : ""}`}
                        onClick={() => toggleLogcatDefaultLevel(level)}
                      >
                        <strong>{level}</strong>
                        <span>{getLogcatLevelLabel(level)}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="page-actions">
                  <button className="ghost-button" onClick={() => void refreshLogcatConfig()} disabled={logcatConfigSaving}>重置草稿</button>
                  <button className="primary-button" onClick={() => void handleSaveLogcatConfig()} disabled={logcatConfigSaving}>{logcatConfigSaving ? "保存中..." : "保存规则"}</button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {catalogOpen ? (
        <>
          <div className="catalog-modal-scrim" onClick={() => setCatalogOpen(false)} />
          <div className="catalog-modal panel" onClick={(event) => event.stopPropagation()}>
            <div className="catalog-modal-header">
              <div>
                <p className="section-kicker">添加命令</p>
              </div>
              <button className="ghost-button" onClick={() => setCatalogOpen(false)}>关闭</button>
            </div>
            <div className="catalog-modal-body">
              <aside className="catalog-sidebar panel-scroll">
                <div className="tree-group">
                  <p className="card-kicker">自定义</p>
                  <button
                    className={`catalog-node ${!searchTerm.trim() && activeCategoryId === "__custom__" ? "active" : ""}`}
                    onClick={() => { setActiveCategoryId("__custom__"); setSearchTerm(""); setActiveFilter("all"); }}
                  >
                    自定义命令
                  </button>
                </div>
                {Array.from(new Set(categories.map((category) => category.group))).map((group) => (
                  <div className="tree-group" key={group}>
                    <p className="card-kicker">{group}</p>
                    {categories
                      .filter((category) => category.group === group)
                      .map((category) => (
                        <button
                          key={category.id}
                          className={`catalog-node ${!searchTerm.trim() && category.id === activeCategoryId ? "active" : ""}`}
                          onClick={() => {
                            setActiveCategoryId(category.id);
                            setSearchTerm("");
                            setActiveFilter("all");
                          }}
                        >
                          {category.label}
                        </button>
                      ))}
                  </div>
                ))}
              </aside>
              {activeCategoryId === "__custom__" && !searchTerm.trim() ? (
              <div className="catalog-browser catalog-custom-body">
                <div className="catalog-custom-editor">
                  <h4>{customCommandEditId ? "编辑自定义命令" : "新建自定义命令"}</h4>
                  <input value={customCommandDraft.title} onChange={(e) => setCustomCommandDraft((d) => ({ ...d, title: e.target.value }))} placeholder="命令名称，如「Telnet 连接」" />
                  <textarea value={customCommandDraft.template} onChange={(e) => setCustomCommandDraft((d) => ({ ...d, template: e.target.value }))} placeholder={"命令模板语法：<必填参数> [可选开关] [-flag 可选值参数]\n例如：adb push [--sync] [-z ALGORITHM] <LOCAL> <REMOTE>"} rows={3} />
                  {parseCustomCommandParams(customCommandDraft.template).length > 0 ? (
                    <div className="catalog-custom-params">
                      <p className="card-kicker">参数配置</p>
                      <div className="catalog-custom-param-list">
                        {parseCustomCommandParams(customCommandDraft.template).map((param) => {
                          const paramType = param.required ? "required" : (param.key.startsWith("-") && !param.flag ? "toggle" : "optional-input");
                          return (
                          <div className="catalog-custom-param-row" key={param.key}>
                            <span className="badge info">{param.required ? `<${param.key}>` : `[${param.key}]`}</span>
                            <select className="param-type-select" value={paramType} onChange={(e) => {
                              const newType = e.target.value as "required" | "toggle" | "optional-input";
                              setCustomCommandDraft((d) => {
                                let newTemplate = d.template;
                                const escKey = param.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                                // Remove old syntax
                                if (param.required) {
                                  newTemplate = newTemplate.replace(new RegExp(`<${escKey}>`, "g"), newType === "toggle" ? `[--${param.key}]` : `[${param.key}]`);
                                } else if (param.flag) {
                                  const escFlag = param.flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                                  newTemplate = newTemplate.replace(new RegExp(`\\[${escFlag}\\s+${escKey}\\]`, "g"), newType === "required" ? `<${param.key}>` : newType === "toggle" ? `[--${param.key}]` : `[${param.key}]`);
                                } else if (paramType === "toggle") {
                                  newTemplate = newTemplate.replace(new RegExp(`\\[${escKey}\\]`, "g"), newType === "required" ? `<${param.key.replace(/^-+/, "")}>` : `[${param.key.replace(/^-+/, "")}]`);
                                } else {
                                  newTemplate = newTemplate.replace(new RegExp(`\\[${escKey}\\]`, "g"), newType === "required" ? `<${param.key}>` : newType === "toggle" ? `[--${param.key}]` : `[${param.key}]`);
                                }
                                return { ...d, template: newTemplate };
                              });
                            }}>
                              <option value="required">必填参数</option>
                              <option value="toggle">可选开关</option>
                              <option value="optional-input">可选输入</option>
                            </select>
                            <input
                              value={customCommandDraft.paramOverrides[param.key]?.label ?? param.label}
                              onChange={(e) => setCustomCommandDraft((d) => ({ ...d, paramOverrides: { ...d.paramOverrides, [param.key]: { ...d.paramOverrides[param.key], label: e.target.value, defaultValue: d.paramOverrides[param.key]?.defaultValue ?? "" } } }))}
                              placeholder="说明文字"
                              className="param-input"
                            />
                            <input
                              value={paramType === "toggle" ? "" : (customCommandDraft.paramOverrides[param.key]?.defaultValue ?? "")}
                              onChange={(e) => setCustomCommandDraft((d) => ({ ...d, paramOverrides: { ...d.paramOverrides, [param.key]: { ...d.paramOverrides[param.key], label: d.paramOverrides[param.key]?.label ?? param.label, defaultValue: e.target.value } } }))}
                              placeholder={paramType === "toggle" ? "—" : "默认值"}
                              className="param-input"
                              disabled={paramType === "toggle"}
                            />
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <div className="catalog-custom-actions">
                    <button className="primary-button compact-button" disabled={!customCommandDraft.title.trim() || !customCommandDraft.template.trim()} onClick={handleSaveCustomCommand}>{customCommandEditId ? "保存修改" : "保存"}</button>
                    {customCommandEditId ? <button className="ghost-button compact-button" onClick={() => { setCustomCommandEditId(null); setCustomCommandDraft({ title: "", template: "", paramOverrides: {} }); }}>取消编辑</button> : null}
                  </div>
                </div>
                <div className="catalog-custom-list panel-scroll">
                  <h4>已保存的自定义命令</h4>
                  {customCommands.length === 0 ? <div className="result-empty-state">暂无自定义命令。在上方创建后会出现在这里。</div> : null}
                  {customCommands.map((entry) => (
                    <article key={entry.id} className="catalog-command-card">
                      <div className="catalog-command-head">
                        <strong>{entry.title}</strong>
                        <span className="badge info">参数 {entry.params.length}</span>
                      </div>
                      <p className="history-card-preview">{entry.template}</p>
                      <div className="catalog-custom-item-actions">
                        <button className="ghost-button compact-button" onClick={() => handleUseCustomCommand(entry)}>使用</button>
                        <button className="ghost-button compact-button" onClick={() => handleEditCustomCommand(entry)}>编辑</button>
                        <button className="ghost-button compact-button danger-button-ghost" onClick={() => handleDeleteCustomCommand(entry.id)}>删除</button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
              ) : (
              <div className="catalog-browser">
                <div className="toolbar-row">
                  <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="搜索命令，快速定位 adb / shell 指令" />
                  <div className="chip-row">
                    {filters.map((filter) => (
                      <button
                        key={filter.id}
                        className={`chip ${activeFilter === filter.id ? "active" : ""}`}
                        onClick={() => setActiveFilter(filter.id)}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="catalog-command-list panel-scroll">
                  {visibleCommands.length === 0 ? (
                    <div className="result-empty-state">当前筛选条件下没有命令，换个关键词或分类试试。</div>
                  ) : visibleCommands.map((command) => (
                    <article
                      key={command.id}
                      className={`catalog-command-card ${activeCatalogCommand?.id === command.id ? "active" : ""}`}
                      onClick={() => setActiveCommandId(command.id)}
                    >
                      <div className="catalog-command-head">
                        <strong>{command.title}</strong>
                        {searchTerm.trim() ? <span className="badge">{commandCategoryMap.get(command.id)}</span> : null}
                        <span className={`badge ${command.risk === "高" ? "danger" : command.risk === "中" ? "warning" : "info"}`}>风险 {command.risk}</span>
                      </div>
                      <p>{command.summary}</p>
                      <div className="subcommand-meta">
                        <span className="badge info">{command.type}</span>
                        <span className={`badge ${command.support === "支持" ? "success" : "warning"}`}>{command.support}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
              )}
            </div>
            {(activeCategoryId !== "__custom__" || searchTerm.trim()) && (
            <div className="catalog-modal-footer">
              <div className="result-empty-state catalog-selection-summary">
                当前面板：{activePanel?.name ?? "未选择"}
                <br />
                已选命令：{activeCatalogCommand?.title ?? "未选择"}
              </div>
              <button className="primary-button" disabled={!activeCatalogCommand || !activePanel} onClick={handleAddCommandToPanel}>添加到面板</button>
            </div>
            )}
          </div>
        </>
      ) : null}

      {historyDetailItem && historyDetailResult ? (
        <>
          <div className="settings-modal-scrim" onClick={() => setHistoryDetailRecordId(null)} />
          <div className="history-detail-modal panel" onClick={(event) => event.stopPropagation()}>
            <div className="settings-modal-header">
              <div>
                <p className="section-kicker">历史详情</p>
                <h3>{historyDetailItem.command_title}</h3>
              </div>
              <div className="history-detail-header-actions">
                <button className="ghost-button compact-button" onClick={() => handleExportResult("markdown", historyDetailResult)}>导出 Markdown</button>
                <button className="ghost-button compact-button" onClick={() => handleExportResult("txt", historyDetailResult)}>导出 TXT</button>
                <button className="ghost-button compact-button" onClick={() => setHistoryDetailRecordId(null)}>关闭</button>
              </div>
            </div>
            <div className="history-detail-summary">
              <strong>{getResultPrimaryCommand(historyDetailResult)}</strong>
              <div className="history-detail-meta">
                <span className="badge info">{historyDetailItem.device_name}</span>
                <span>{formatHistoryTimestamp(historyDetailItem)}</span>
                <span>退出码 {historyDetailItem.exitCode ?? "未知"}</span>
                <span>{historyDetailItem.duration != null ? `${historyDetailItem.duration} ms` : "耗时未知"}</span>
              </div>
            </div>
            <div className="chip-row">
              <button className={`chip ${historyDetailTab === "structured" ? "active" : ""}`} onClick={() => setHistoryDetailTab("structured")}>结构化</button>
              <button className={`chip ${historyDetailTab === "raw" ? "active" : ""}`} onClick={() => setHistoryDetailTab("raw")}>原文</button>
            </div>
            {historyDetailTab === "structured" ? (
              <article className="result-card result-card-full history-detail-card">
                <div className="execution-summary">
                  <div className="execution-summary-top">
                    <div>
                      <p className="summary-label">执行命令</p>
                      <strong className="execution-command-title">{historyDetailResult.executedCommand ?? historyDetailResult.raw ?? historyDetailResult.command_title}</strong>
                    </div>
                    <span className={`badge ${historyDetailResult.status === "ok" ? "success" : "danger"}`}>{historyDetailResult.status === "ok" ? "执行成功" : "执行失败"}</span>
                  </div>
                  <div className="output-section output-section-primary">
                    <p className="output-title">结果输出</p>
                    {renderOutputPreview(historyDetailResult, "")}
                  </div>
                </div>
              </article>
            ) : (
              <article className="result-card result-card-full history-detail-card">
                {historyDetailResult.stdout?.trim() ? renderRawOutputSection("stdout", historyDetailResult.stdout, "") : null}
                {historyDetailResult.stderr?.trim() ? renderRawOutputSection("stderr", historyDetailResult.stderr, "") : null}
                {!historyDetailResult.stdout?.trim() && !historyDetailResult.stderr?.trim() ? <div className="result-empty-state">{normalizeOutputText(historyDetailResult)}</div> : null}
              </article>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}