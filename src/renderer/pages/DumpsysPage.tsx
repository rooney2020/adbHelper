import { useState, useEffect, useMemo, useCallback, useRef } from "react";

// ── Common module param definitions ──

type SelectOption = { value: string; label: string };

type ParamConfig =
  | { kind: "package-picker"; label: string; key: string; prefix?: string }
  | { kind: "text"; label: string; key: string; placeholder: string; required?: boolean; prefix?: string }
  | { kind: "flag"; label: string; key: string; flagValue: string }
  | { kind: "select"; label: string; key: string; options: SelectOption[]; placeholder?: string }

interface ModuleConfig {
  params: ParamConfig[];
}

/* 各模块的 dumpsys 命令常见参数定义。
   每个参数单独列出，不合并到 extra 中混用。
*/
const commonModules: Record<string, ModuleConfig> = {
  // ── 有多个子命令的模块 ──
  package: {
    params: [
      { kind: "select", label: "子命令", key: "subcmd", options: [
        { value: "", label: "默认（包信息）" },
        { value: "packages", label: "列出所有包（packages）" },
        { value: "packages -f", label: "列出包 + 文件路径（packages -f）" },
        { value: "features", label: "功能特性（features）" },
        { value: "providers", label: "ContentProvider（providers）" },
        { value: "services", label: "系统 Service（services）" },
        { value: "shared-libraries", label: "共享库（shared-libraries）" },
      ] },
      { kind: "package-picker", label: "目标包名", key: "package" },
      { kind: "flag", label: "文件路径（-f）", key: "packages_f", flagValue: "-f" },
      { kind: "flag", label: "包含未安装（-u）", key: "packages_u", flagValue: "-u" },
      { kind: "flag", label: "仅禁用（-d）", key: "packages_d", flagValue: "-d" },
      { kind: "flag", label: "仅启用（-e）", key: "packages_e", flagValue: "-e" },
      { kind: "flag", label: "仅系统包（-s）", key: "packages_s", flagValue: "-s" },
      { kind: "flag", label: "仅三方包（-3）", key: "packages_3", flagValue: "-3" },
      { kind: "flag", label: "仅 APEX（--apex-only）", key: "packages_apex", flagValue: "--apex-only" },
      { kind: "flag", label: "Checkin 格式（--checkin）", key: "packages_checkin", flagValue: "--checkin" },
      { kind: "flag", label: "安装源（--show-location）", key: "packages_show", flagValue: "--show-location" },
      { kind: "text", label: "额外参数", key: "extra", placeholder: "兜底参数..." },
    ],
  },
  activity: {
    params: [
      { kind: "select", label: "子命令", key: "subcmd", options: [
        { value: "", label: "全部转储" },
        { value: "top", label: "当前 Activity（top）" },
        { value: "activities", label: "Activity 栈（activities）" },
        { value: "services", label: "已注册 Service（services）" },
        { value: "providers", label: "ContentProvider（providers）" },
        { value: "broadcasts", label: "已注册广播（broadcasts）" },
        { value: "o", label: "概览（o）" },
        { value: "intent", label: "Intent 解析器（intent）" },
        { value: "process", label: "进程（process）" },
        { value: "disk-usage", label: "磁盘用量（disk-usage）" },
        { value: "p", label: "包信息（p）" },
        { value: "resolver", label: "Intent 解析（resolver）" },
        { value: "intent-options", label: "Intent 选项（intent-options）" },
      ] },
      { kind: "text", label: "包名参数（p）", key: "pkgArg", placeholder: "<package>，选 p 子命令时使用" },
      { kind: "text", label: "Intent 参数（resolver/intent-options）", key: "intentArg", placeholder: "<intent>，选 resolver 或 intent-options 时使用" },
      { kind: "text", label: "额外参数", key: "extra", placeholder: "兜底参数..." },
    ],
  },
  window: {
    params: [
      { kind: "select", label: "子命令", key: "subcmd", options: [
        { value: "", label: "默认全部" },
        { value: "policy", label: "窗口策略（policy）" },
        { value: "animator", label: "窗口动画（animator）" },
        { value: "displays", label: "显示信息（displays）" },
        { value: "tokens", label: "Token 列表（tokens）" },
        { value: "windows", label: "窗口列表（windows）" },
      ] },
      { kind: "text", label: "显示 ID", key: "display", placeholder: "0（默认）" },
      { kind: "text", label: "额外参数", key: "extra", placeholder: "其他参数..." },
    ],
  },
  gfxinfo: {
    params: [
      { kind: "select", label: "子命令", key: "subcmd", options: [
        { value: "", label: "默认详情" },
        { value: "framestats", label: "帧统计（framestats）" },
        { value: "reset", label: "重置统计（reset）" },
      ] },
      { kind: "package-picker", label: "包名", key: "package" },
      { kind: "flag", label: "全部进程（-a）", key: "a", flagValue: "-a" },
      { kind: "text", label: "额外参数", key: "extra", placeholder: "兜底参数..." },
    ],
  },
  notification: {
    params: [
      { kind: "select", label: "子命令", key: "subcmd", options: [
        { value: "", label: "默认全部" },
        { value: "list", label: "通知列表（list）" },
        { value: "history", label: "历史记录（history）" },
      ] },
      { kind: "package-picker", label: "包名", key: "package" },
      { kind: "text", label: "额外参数", key: "extra", placeholder: "兜底参数..." },
    ],
  },
  SurfaceFlinger: {
    params: [
      { kind: "select", label: "子命令", key: "subcmd", options: [
        { value: "", label: "默认全部" },
        { value: "--help", label: "帮助（--help）" },
        { value: "--list", label: "图层列表（--list）" },
      ] },
      { kind: "text", label: "Latency 帧号", key: "latency", placeholder: "输入帧号分析延迟", prefix: "--latency" },
      { kind: "text", label: "Display ID", key: "display", placeholder: "输入显示 ID", prefix: "--display-id" },
      { kind: "text", label: "额外参数", key: "extra", placeholder: "其他参数..." },
    ],
  },

  // ── 包名 + flags ──
  procstats: {
    params: [
      { kind: "package-picker", label: "包名", key: "package", prefix: "--pkg" },
      { kind: "text", label: "统计小时数", key: "hours", placeholder: "3（省略则不限）", prefix: "--hours" },
      { kind: "text", label: "统计天数", key: "days", placeholder: "7（省略则不限）", prefix: "--days" },
      { kind: "flag", label: "CSV 格式（--csv）", key: "csv", flagValue: "--csv" },
      { kind: "flag", label: "完整详情（--full-details）", key: "fullDetails", flagValue: "--full-details" },
      { kind: "flag", label: "历史数据（--history）", key: "history", flagValue: "--history" },
      { kind: "flag", label: "紧凑模式（--compact）", key: "compact", flagValue: "--compact" },
      { kind: "flag", label: "Checkin 格式（--checkin）", key: "checkin", flagValue: "--checkin" },
      { kind: "text", label: "额外参数", key: "extra", placeholder: "其他参数..." },
    ],
  },
  batterystats: {
    params: [
      { kind: "package-picker", label: "包名", key: "package", prefix: "--pkg" },
      { kind: "flag", label: "已充电统计（--charged）", key: "charged", flagValue: "--charged" },
      { kind: "flag", label: "重置统计（--reset）", key: "reset", flagValue: "--reset" },
      { kind: "flag", label: "历史记录（--history）", key: "history", flagValue: "--history" },
      { kind: "flag", label: "每日统计（--daily）", key: "daily", flagValue: "--daily" },
      { kind: "flag", label: "每周统计（--weekly）", key: "weekly", flagValue: "--weekly" },
      { kind: "flag", label: "每月统计（--monthly）", key: "monthly", flagValue: "--monthly" },
      { kind: "flag", label: "完整报告（--full）", key: "full", flagValue: "--full" },
      { kind: "flag", label: "Checkin 格式（--checkin）", key: "checkin", flagValue: "--checkin" },
      { kind: "flag", label: "紧凑格式（-c）", key: "c", flagValue: "-c" },
      { kind: "flag", label: "设置输出（--settings）", key: "settings", flagValue: "--settings" },
      { kind: "text", label: "额外参数", key: "extra", placeholder: "--write ..." },
    ],
  },

  // ── 包名 + 简单额外参数 ──
  meminfo: {
    params: [
      { kind: "package-picker", label: "包名", key: "package" },
      { kind: "flag", label: "详细信息（-a）", key: "a", flagValue: "-a" },
      { kind: "flag", label: "OOM 调节（--oom）", key: "oom", flagValue: "--oom" },
      { kind: "flag", label: "系统内存统计（-s）", key: "s", flagValue: "-s" },
      { kind: "flag", label: "设备详情（-d）", key: "d", flagValue: "-d" },
      { kind: "flag", label: "本地进程（--local）", key: "local", flagValue: "--local" },
      { kind: "flag", label: "整体包（--package）", key: "pkg", flagValue: "--package" },
      { kind: "flag", label: "不可达内存（--unreachable）", key: "unreachable", flagValue: "--unreachable" },
      { kind: "flag", label: "调试信息（--debug）", key: "debug", flagValue: "--debug" },
      { kind: "text", label: "额外参数", key: "extra", placeholder: "兜底参数..." },
    ],
  },

  // ── 纯 flags ──
  netstats: {
    params: [
      { kind: "text", label: "UID", key: "uid", placeholder: "输入 UID", prefix: "--uid" },
      { kind: "flag", label: "实时统计（--poll）", key: "poll", flagValue: "--poll" },
      { kind: "flag", label: "完整报告（--full）", key: "full", flagValue: "--full" },
      { kind: "flag", label: "历史数据（--history）", key: "history", flagValue: "--history" },
      { kind: "flag", label: "CSV 格式（--csv）", key: "csv", flagValue: "--csv" },
      { kind: "text", label: "额外参数", key: "extra", placeholder: "--tag ..." },
    ],
  },
  diskstats: {
    params: [
      { kind: "flag", label: "逐小时（--hourly）", key: "hourly", flagValue: "--hourly" },
      { kind: "flag", label: "逐日（--daily）", key: "daily", flagValue: "--daily" },
      { kind: "flag", label: "逐月（--monthly）", key: "monthly", flagValue: "--monthly" },
      { kind: "flag", label: "Checkin 格式（--checkin）", key: "checkin", flagValue: "--checkin" },
      { kind: "text", label: "额外参数", key: "extra", placeholder: "其他参数..." },
    ],
  },
  usb: {
    params: [
      { kind: "flag", label: "Dump 详情（--dump）", key: "dump", flagValue: "--dump" },
      { kind: "flag", label: "帮助（--help）", key: "help", flagValue: "--help" },
      { kind: "text", label: "额外参数", key: "extra", placeholder: "其他参数..." },
    ],
  },
  display: {
    params: [
      { kind: "text", label: "显示 ID", key: "display", placeholder: "0（默认）" },
      { kind: "flag", label: "物理信息（--physical）", key: "physical", flagValue: "--physical" },
      { kind: "text", label: "额外参数", key: "extra", placeholder: "--help ..." },
    ],
  },

  // ── 只有 text 兜底（这些模块没子命令 / 参数极少） ──
  alarm: { params: [{ kind: "text", label: "额外参数", key: "extra", placeholder: "--help ..." }] },
  cpuinfo: { params: [{ kind: "text", label: "额外参数", key: "extra", placeholder: "--help ..." }] },
  input: { params: [{ kind: "text", label: "额外参数", key: "extra", placeholder: "--help ..." }] },
  location: { params: [{ kind: "text", label: "额外参数", key: "extra", placeholder: "--help ..." }] },
  power: { params: [{ kind: "text", label: "额外参数", key: "extra", placeholder: "--help ..." }] },
  wifi: { params: [{ kind: "text", label: "额外参数", key: "extra", placeholder: "--help ..." }] },
};

// ── Interface ──

interface RuntimeApi {
  command: {
    run: (payload: {
      deviceId: string; deviceName?: string; commandId: string;
      commandTitle?: string; rawCommand?: string; args: string[];
      source?: string;
    }) => Promise<unknown>;
  };
  logcat: {
    packageList: (payload: { deviceId: string }) => Promise<unknown>;
  };
}

interface DumpsysPageProps {
  currentDeviceId: string | null;
  runtimeApi: RuntimeApi;
}

// ── Helpers ──

function buildDumpsysCommand(
  moduleName: string,
  params: Record<string, string>,
  config?: ModuleConfig,
): string {
  const parts = [`dumpsys ${moduleName}`];
  if (config) {
    for (const p of config.params) {
      const val = params[p.key]?.trim();
      if (!val) continue;
      if (p.kind === "flag") {
        parts.push(p.flagValue);
      } else if (p.kind === "text" && p.key === "extra") {
        // appended at the end
      } else if (p.kind === "select") {
        // empty value = no subcommand; user types extra for custom
        if (val) parts.push(val);
      } else if ("prefix" in p && p.prefix) {
        parts.push(p.prefix, val);
      } else {
        parts.push(val);
      }
    }
    const extra = params.extra?.trim();
    if (extra) parts.push(extra);
  } else {
    const extra = params.extra?.trim();
    if (extra) parts.push(extra);
  }
  return parts.filter(Boolean).join(" ");
}

// ── Component ──

const SIDEBAR_MIN = 130;
const SIDEBAR_DEFAULT = 180;
const SIDEBAR_MAX = 360;

export default function DumpsysPage({ currentDeviceId, runtimeApi }: DumpsysPageProps) {
  const [dumpsysTab, setDumpsysTab] = useState("activity");
  const [dumpsysRunning, setDumpsysRunning] = useState(false);
  const [dumpsysOutput, setDumpsysOutput] = useState<string | null>(null);
  const [dumpsysSearch, setDumpsysSearch] = useState("");
  const [dumpsysSearchIdx, setDumpsysSearchIdx] = useState(0);

  // Sidebar
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const sidebarDrag = useRef<{ startX: number; startW: number } | null>(null);

  // All available modules (from dumpsys -l)
  const [allModules, setAllModules] = useState<string[]>([]);
  const [modulesLoading, setModulesLoading] = useState(false);

  // Param editor state
  const [editorParams, setEditorParams] = useState<Record<string, string>>({});
  const [paramEditorCollapsed, setParamEditorCollapsed] = useState(false);

  // Package picker state
  const [packageList, setPackageList] = useState<string[]>([]);
  const [packagePickerOpen, setPackagePickerOpen] = useState(false);
  const [packagePickerQuery, setPackagePickerQuery] = useState("");

  // ── Filtered modules (sidebar search) ──
  const filteredModules = useMemo(() => {
    if (!sidebarSearch.trim()) return allModules;
    const q = sidebarSearch.trim().toLowerCase();
    return allModules.filter(m => m.toLowerCase().includes(q));
  }, [allModules, sidebarSearch]);

  // ── Fetch module list ──
  useEffect(() => {
    if (!currentDeviceId) return;
    setModulesLoading(true);
    setAllModules([]);
    runtimeApi.command.run({
      deviceId: currentDeviceId,
      commandId: "dumpsys-list",
      commandTitle: "dumpsys -l",
      rawCommand: `adb -s ${currentDeviceId} shell dumpsys -l`,
      args: [],
    }).then((res) => {
      const stdout = (res as { stdout?: string }).stdout ?? "";
      const lines = stdout.split("\n")
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith("Current") && !l.startsWith("dumpsys"));
      const known = new Set([...lines, "activity", "window", "display", "input", "power", "meminfo",
        "cpuinfo", "package", "SurfaceFlinger", "connectivity", "wifi", "bluetooth_manager",
        "audio", "usb", "notification", "procstats", "alarm", "batterystats", "netstats",
        "diskstats", "gfxinfo", "location", "sensorservice", "media", "telephony.registry"]);
      setAllModules(Array.from(known).sort((a, b) => a.localeCompare(b)));
    }).catch(() => {
      setAllModules([
        "activity", "alarm", "audio", "batterystats", "bluetooth_manager",
        "connectivity", "cpuinfo", "diskstats", "display", "gfxinfo",
        "input", "location", "media", "meminfo", "netstats",
        "notification", "package", "power", "procstats", "sensorservice",
        "SurfaceFlinger", "telephony.registry", "usb", "wifi", "window",
      ]);
    }).finally(() => setModulesLoading(false));
  }, [currentDeviceId, runtimeApi]);

  // ── Fetch package list (merge logcat API + shell pm list packages for completeness) ──
  const openPackagePicker = useCallback(async () => {
    if (!currentDeviceId) return;
    setPackagePickerOpen(true);
    setPackagePickerQuery("");
    if (packageList.length > 0) return;

    const allPkgs = new Set<string>();

    // Source 1: logcat API (packages seen in log output)
    try {
      const res = (await runtimeApi.logcat.packageList({ deviceId: currentDeviceId })) as { items?: string[] };
      for (const p of (res.items ?? [])) if (p) allPkgs.add(p);
    } catch { /* ignore */ }

    // Source 2: shell pm list packages (all installed packages, multi-user deduped)
    for (const userFlag of ["--user all", ""]) {
      try {
        const cmd = `adb -s ${currentDeviceId} shell pm list packages${userFlag ? ` ${userFlag}` : ""}`;
        const res2 = await runtimeApi.command.run({
          deviceId: currentDeviceId,
          commandId: "dumpsys-list",
          commandTitle: "package list" + (userFlag ? ` (${userFlag})` : ""),
          rawCommand: cmd,
          args: [],
        });
        const stdout = (res2 as { stdout?: string }).stdout ?? "";
        for (const line of stdout.split("\n")) {
          const pkg = line.replace(/^package:/, "").trim();
          if (pkg) allPkgs.add(pkg);
        }
      } catch { /* ignore */ }
    }

    setPackageList(Array.from(allPkgs).sort((a, b) => a.localeCompare(b)));
  }, [currentDeviceId, packageList.length, runtimeApi]);

  // ── Module config ──
  const moduleConfig = useMemo(() => commonModules[dumpsysTab], [dumpsysTab]);

  // ── Reset editor params when module changes ──
  useEffect(() => {
    setEditorParams({});
    setPackagePickerOpen(false);
    setParamEditorCollapsed(false);
  }, [dumpsysTab]);

  // ── Filtered package list ──
  const filteredPackages = useMemo(() => {
    if (!packagePickerQuery.trim()) return packageList;
    const q = packagePickerQuery.trim().toLowerCase();
    return packageList.filter(p => p.toLowerCase().includes(q));
  }, [packageList, packagePickerQuery]);

  // ── Run dumpsys ──
  const handleRun = useCallback(async () => {
    if (!currentDeviceId) return;
    const cmd = buildDumpsysCommand(dumpsysTab, editorParams, moduleConfig);
    setDumpsysRunning(true);
    setDumpsysOutput(null);
    setParamEditorCollapsed(true);
    try {
      const res = await runtimeApi.command.run({
        deviceId: currentDeviceId,
        commandId: "dumpsys-raw",
        commandTitle: cmd,
        rawCommand: `adb -s ${currentDeviceId} shell ${cmd}`,
        args: [],
      });
      setDumpsysOutput((res as { stdout?: string }).stdout ?? (res as { message?: string }).message ?? "无输出");
    } catch (err: unknown) {
      setDumpsysOutput(err instanceof Error ? err.message : "执行失败");
    } finally {
      setDumpsysRunning(false);
    }
  }, [currentDeviceId, dumpsysTab, editorParams, moduleConfig, runtimeApi]);

  // ── Sidebar resize drag handlers ──
  const handleSidebarDragStart = useCallback((e: React.PointerEvent) => {
    sidebarDrag.current = { startX: e.clientX, startW: sidebarWidth };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [sidebarWidth]);

  const handleSidebarDragMove = useCallback((e: React.PointerEvent) => {
    if (!sidebarDrag.current) return;
    const newW = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, sidebarDrag.current.startW + e.clientX - sidebarDrag.current.startX));
    setSidebarWidth(newW);
  }, []);

  const handleSidebarDragEnd = useCallback(() => {
    sidebarDrag.current = null;
  }, []);

  // ── Render param editor ──
  function renderParamEditor() {
    if (!moduleConfig) {
      return (
        <div className="param-editor-fields">
          <div className="param-field-row">
            <label className="param-field-label">附加参数</label>
            <input
              className="param-field-input"
              type="text"
              value={editorParams.extra ?? ""}
              placeholder="输入任意参数拼接到 dumpsys 命令后"
              onChange={(e) => setEditorParams(prev => ({ ...prev, extra: e.target.value }))}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="param-editor-fields">
        {moduleConfig.params.map((p) => {
          if (p.kind === "package-picker") {
            const val = editorParams[p.key] ?? "";
            const prefix = "prefix" in p && p.prefix ? `${p.prefix} ` : "";
            return (
              <div className="param-field-row" key={p.key}>
                <label className="param-field-label">{p.label}</label>
                <div className="param-field-with-picker">
                  <input
                    className="param-field-input"
                    type="text"
                    value={val}
                    placeholder={prefix ? `${prefix}<包名>` : "输入包名或点击右侧按钮选择"}
                    onChange={(e) => setEditorParams(prev => ({ ...prev, [p.key]: e.target.value }))}
                  />
                  <button
                    className="ghost-button compact-button dumpsys-picker-btn"
                    onClick={openPackagePicker}
                    title="从设备选择包名"
                  >
                    <svg className="dumpsys-picker-icon" viewBox="0 0 1024 1024" width="14" height="14">
                      <path d="M811.6 264.1H378.2c-19.8 0-36-16.2-36-36s16.2-36 36-36h433.5c19.8 0 36 16.2 36 36-0.1 19.8-16.3 36-36.1 36z" fill="currentColor" />
                      <path d="M811.6 522.1H378.2c-19.8 0-36-16.2-36-36s16.2-36 36-36h433.5c19.8 0 36 16.2 36 36-0.1 19.8-16.3 36-36.1 36z" fill="currentColor" />
                      <path d="M811.6 780.1H378.2c-19.8 0-36-16.2-36-36s16.2-36 36-36h433.5c19.8 0 36 16.2 36 36-0.1 19.8-16.3 36-36.1 36z" fill="currentColor" />
                      <path d="M210.2 229m-37.9 0a37.9 37.9 0 1 0 75.8 0 37.9 37.9 0 1 0-75.8 0Z" fill="currentColor" />
                      <path d="M210.2 487m-37.9 0a37.9 37.9 0 1 0 75.8 0 37.9 37.9 0 1 0-75.8 0Z" fill="currentColor" />
                      <path d="M210.2 745m-37.9 0a37.9 37.9 0 1 0 75.8 0 37.9 37.9 0 1 0-75.8 0Z" fill="currentColor" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          }

          if (p.kind === "flag") {
            const checked = (editorParams[p.key] ?? "") === p.flagValue;
            return (
              <div className="param-field-row param-field-row-checkbox" key={p.key}>
                <label className="param-toggle-row">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setEditorParams(prev => ({ ...prev, [p.key]: e.target.checked ? p.flagValue : "" }))}
                  />
                  <span>{p.label}</span>
                </label>
              </div>
            );
          }

          if (p.kind === "select") {
            const val = editorParams[p.key] ?? "";
            return (
              <div className="param-field-row" key={p.key}>
                <label className="param-field-label">{p.label}</label>
                <select
                  className="param-field-select"
                  value={val}
                  onChange={(e) => setEditorParams(prev => ({ ...prev, [p.key]: e.target.value }))}
                >
                  {p.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            );
          }

          if (p.kind === "text") {
            const val = editorParams[p.key] ?? "";
            const isExtra = p.key === "extra";
            const prefix = "prefix" in p && p.prefix ? `${p.prefix} ` : "";
            return (
              <div className="param-field-row" key={p.key}>
                <label className="param-field-label">{p.label}</label>
                <input
                  className="param-field-input"
                  type="text"
                  value={val}
                  placeholder={isExtra ? p.placeholder : `${prefix}${p.placeholder}`}
                  onChange={(e) => setEditorParams(prev => ({ ...prev, [p.key]: e.target.value }))}
                />
              </div>
            );
          }

          return null;
        })}
      </div>
    );
  }

  // ── Render ──
  return (
    <main className="page-shell">
      <section className="panel page-panel info-page-panel">
        <div className="device-info-layout" style={{ flex: 1, minHeight: 0, display: "flex", gap: 0, gridTemplateColumns: undefined }}>

          {/* ── Sidebar: module list ── */}
          <nav className="dumpsys-sidebar" style={{ width: sidebarWidth, minWidth: SIDEBAR_MIN, maxWidth: SIDEBAR_MAX }}>
            {/* search box */}
            <div className="dumpsys-sidebar-search">
              <input
                className="param-field-input"
                type="text"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder={`搜索 ${allModules.length} 个模块...`}
                style={{ fontSize: 12, padding: "5px 8px" }}
              />
            </div>
            <div className="dumpsys-sidebar-list">
              {modulesLoading && <div className="result-empty-state">加载模块列表...</div>}
              {!modulesLoading && filteredModules.length === 0 && (
                <div className="result-empty-state">无匹配模块。</div>
              )}
              {!modulesLoading && filteredModules.map((mod) => (
                <button
                  key={mod}
                  className={`dumpsys-sidebar-item ${dumpsysTab === mod ? "active" : ""}`}
                  onClick={() => { setDumpsysTab(mod); setDumpsysOutput(null); }}
                >
                  <span className="dumpsys-sidebar-item-name">{mod}</span>
                  {commonModules[mod] ? <span className="dumpsys-sidebar-item-param" title="支持参数编辑">⚙</span> : null}
                </button>
              ))}
            </div>
          </nav>

          {/* resize handle */}
          <div
            className="resize-handle dumpsys-resize-handle"
            onPointerDown={handleSidebarDragStart}
            onPointerMove={handleSidebarDragMove}
            onPointerUp={handleSidebarDragEnd}
          />

          {/* ── Content ── */}
          <div className="device-info-content" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>

              {/* ── Param Editor (collapsible) ── */}
              <div className="dumpsys-param-section">
                <div className="dumpsys-param-head" onClick={() => setParamEditorCollapsed(c => !c)} style={{ cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", transition: "transform .15s", display: "inline-block", transform: paramEditorCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>
                    <p className="section-kicker" style={{ margin: 0 }}>参数编辑</p>
                    <span className="dumpsys-module-tag">{dumpsysTab}</span>
                  </div>
                  <span className="dumpsys-param-toggle" title={paramEditorCollapsed ? "展开" : "折叠"}>
                    {paramEditorCollapsed ? "展开" : "折叠"}
                  </span>
                </div>
                {!paramEditorCollapsed && (
                  <div style={{ paddingTop: 4 }}>
                    {renderParamEditor()}
                  </div>
                )}
              </div>

              {/* ── Controls ── */}
              <div className="logcat-capture-actions" style={{ flexWrap: "wrap", justifyContent: "flex-start" }}>
                {dumpsysOutput !== null && (
                  <>
                    <button className="ghost-button compact-button" onClick={() => {
                      document.querySelectorAll("[data-dumpsys-output] details").forEach(d => (d as HTMLDetailsElement).open = true);
                    }}>全部展开</button>
                    <button className="ghost-button compact-button" onClick={() => {
                      document.querySelectorAll("[data-dumpsys-output] details").forEach(d => (d as HTMLDetailsElement).open = false);
                    }}>全部折叠</button>
                    <span style={{ width: 1, height: 16, background: "var(--border-default)", margin: "0 4px" }} />
                    <input
                      value={dumpsysSearch}
                      onChange={(e) => { setDumpsysSearch(e.target.value); setDumpsysSearchIdx(0); }}
                      placeholder="搜索..."
                      style={{ width: 200 }}
                    />
                    {dumpsysSearch && (() => {
                      const matches = dumpsysOutput!.split("\n").filter(l => l.toLowerCase().includes(dumpsysSearch.toLowerCase()));
                      const count = matches.length;
                      return (
                        <>
                          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{count > 0 ? `${dumpsysSearchIdx + 1}/${count}` : "0/0"}</span>
                          <button className="ghost-button compact-button" disabled={count === 0} onClick={() => {
                            const next = (dumpsysSearchIdx - 1 + count) % count;
                            setDumpsysSearchIdx(next);
                            const container = document.querySelector("[data-dumpsys-output]");
                            if (!container) return;
                            const marks = container.querySelectorAll("mark[data-dumpsys-match]");
                            if (marks.length > 0 && marks[next]) {
                              let el: HTMLElement | null = marks[next] as HTMLElement;
                              while (el && el !== container) { if (el.tagName === "DETAILS") (el as HTMLDetailsElement).open = true; el = el.parentElement; }
                              marks[next].scrollIntoView({ behavior: "smooth", block: "center" });
                            } else {
                              const targetLine = matches[next];
                              const searchLower = targetLine.trim().toLowerCase();
                              const allDetails = container.querySelectorAll(":scope > details");
                              for (const det of allDetails) {
                                if (det.textContent?.toLowerCase().includes(searchLower)) {
                                  (det as HTMLDetailsElement).open = true;
                                  setTimeout(() => {
                                    const tw = document.createTreeWalker(det, NodeFilter.SHOW_TEXT);
                                    while (tw.nextNode()) {
                                      if (tw.currentNode.textContent?.toLowerCase().includes(dumpsysSearch.toLowerCase())) {
                                        (tw.currentNode.parentElement as HTMLElement)?.scrollIntoView({ behavior: "smooth", block: "center" });
                                        return;
                                      }
                                    }
                                    det.scrollIntoView({ behavior: "smooth", block: "center" });
                                  }, 30);
                                  break;
                                }
                              }
                            }
                          }}>▲</button>
                          <button className="ghost-button compact-button" disabled={count === 0} onClick={() => {
                            const next = (dumpsysSearchIdx + 1) % count;
                            setDumpsysSearchIdx(next);
                            const container = document.querySelector("[data-dumpsys-output]");
                            if (!container) return;
                            const marks = container.querySelectorAll("mark[data-dumpsys-match]");
                            if (marks.length > 0 && marks[next]) {
                              let el: HTMLElement | null = marks[next] as HTMLElement;
                              while (el && el !== container) { if (el.tagName === "DETAILS") (el as HTMLDetailsElement).open = true; el = el.parentElement; }
                              marks[next].scrollIntoView({ behavior: "smooth", block: "center" });
                            } else {
                              const targetLine = matches[next];
                              const searchLower = targetLine.trim().toLowerCase();
                              const allDetails = container.querySelectorAll(":scope > details");
                              for (const det of allDetails) {
                                if (det.textContent?.toLowerCase().includes(searchLower)) {
                                  (det as HTMLDetailsElement).open = true;
                                  setTimeout(() => {
                                    const tw = document.createTreeWalker(det, NodeFilter.SHOW_TEXT);
                                    while (tw.nextNode()) {
                                      if (tw.currentNode.textContent?.toLowerCase().includes(dumpsysSearch.toLowerCase())) {
                                        (tw.currentNode.parentElement as HTMLElement)?.scrollIntoView({ behavior: "smooth", block: "center" });
                                        return;
                                      }
                                    }
                                    det.scrollIntoView({ behavior: "smooth", block: "center" });
                                  }, 30);
                                  break;
                                }
                              }
                            }
                          }}>▼</button>
                        </>
                      );
                    })()}
                  </>
                )}
                <button
                  className="primary-button"
                  style={{ marginLeft: "auto" }}
                  disabled={dumpsysRunning || !currentDeviceId}
                  onClick={handleRun}
                >
                  {dumpsysRunning ? "抓取中…" : "执行"}
                </button>
              </div>

              {/* ── Output ── */}
              {dumpsysOutput !== null ? (
                <div data-dumpsys-output="" style={{ flex: 1, overflow: "auto", fontSize: 12, background: "var(--bg-surface-strong)", padding: 12, borderRadius: 8, maxHeight: "calc(100vh - 240px)" }}>
                  {(() => {
                    const isLargeOutput = dumpsysOutput.length > 500000;
                    let matchCounter = 0;
                    const highlightText = (text: string) => {
                      if (!dumpsysSearch || isLargeOutput) return text;
                      const parts = text.split(new RegExp(`(${dumpsysSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
                      if (parts.length <= 1) return text;
                      return parts.map((part, pi) => {
                        if (part.toLowerCase() === dumpsysSearch.toLowerCase()) {
                          const idx = matchCounter++;
                          return <mark key={pi} data-dumpsys-match="" style={{ background: idx === dumpsysSearchIdx ? "#ff9632" : "#ffeb3b", padding: 0 }}>{part}</mark>;
                        }
                        return part;
                      });
                    };

                    const lines = dumpsysOutput.split("\n");
                    function getIndent(line: string): number {
                      const m = line.match(/^(\s*)/);
                      return m ? m[1].length : 0;
                    }

                    type FlatSection = { title: string; content: string; children: { title: string; content: string }[] };
                    const result: FlatSection[] = [];
                    let i = 0;
                    while (i < lines.length) {
                      const line = lines[i];
                      if (!line.trim()) { i++; continue; }
                      const indent = getIndent(line);
                      const childLines: string[] = [];
                      let j = i + 1;
                      while (j < lines.length && (getIndent(lines[j]) > indent || !lines[j].trim())) {
                        childLines.push(lines[j]);
                        j++;
                      }
                      if (childLines.length > 0) {
                        if (isLargeOutput) {
                          result.push({ title: line.trim(), content: childLines.join("\n"), children: [] });
                        } else {
                          const subSections: { title: string; content: string }[] = [];
                          if (childLines.length > 2) {
                            const baseChildIndent = childLines.find(l => l.trim())
                              ? getIndent(childLines.find(l => l.trim())!)
                              : indent + 2;
                            let ci = 0;
                            while (ci < childLines.length) {
                              const cl = childLines[ci];
                              if (!cl.trim()) { ci++; continue; }
                              const cIndent = getIndent(cl);
                              if (cIndent <= baseChildIndent) {
                                const subContent: string[] = [];
                                let cj = ci + 1;
                                while (cj < childLines.length && (getIndent(childLines[cj]) > cIndent || !childLines[cj].trim())) {
                                  subContent.push(childLines[cj]);
                                  cj++;
                                }
                                subSections.push({ title: cl.trim(), content: subContent.join("\n") });
                                ci = cj;
                              } else {
                                if (subSections.length > 0) subSections[subSections.length - 1].content += "\n" + cl;
                                ci++;
                              }
                            }
                          }
                          result.push({ title: line.trim(), content: childLines.join("\n"), children: subSections.length > 0 ? subSections : [] });
                        }
                      } else {
                        result.push({ title: line.trim(), content: "", children: [] });
                      }
                      i = j;
                    }

                    if (result.length === 1 && result[0].children.length > 0) {
                      const promoted = result[0].children.map(c => ({ title: c.title, content: c.content, children: [] as { title: string; content: string }[] }));
                      result.splice(0, 1, ...promoted);
                    } else if (result.length === 1 && result[0].content) {
                      const contentLines = result[0].content.split("\n");
                      const subResult: FlatSection[] = [];
                      let si = 0;
                      while (si < contentLines.length) {
                        const sl = contentLines[si];
                        if (!sl.trim()) { si++; continue; }
                        const sIndent = getIndent(sl);
                        const sChildren: string[] = [];
                        let sj = si + 1;
                        while (sj < contentLines.length && (getIndent(contentLines[sj]) > sIndent || !contentLines[sj].trim())) {
                          sChildren.push(contentLines[sj]);
                          sj++;
                        }
                        subResult.push({ title: sl.trim(), content: sChildren.join("\n"), children: [] });
                        si = sj;
                      }
                      if (subResult.length > 1) result.splice(0, 1, ...subResult);
                    }

                    if (result.length === 0) {
                      return <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}>{highlightText(dumpsysOutput)}</pre>;
                    }
                    return result.map((sec, idx) => (
                      sec.children.length > 0 ? (
                        <details key={idx} style={{ marginBottom: 4 }}>
                          <summary style={{ cursor: "pointer", fontWeight: 700, padding: "6px 0", borderBottom: "1px solid var(--border-default)" }}>{sec.title}</summary>
                          <div style={{ marginLeft: 12 }}>
                            {sec.children.map((child, ci) => (
                              child.content.trim() ? (
                                <details key={ci} style={{ marginBottom: 2 }}>
                                  <summary style={{ cursor: "pointer", fontWeight: 500, padding: "2px 0", fontSize: 11, color: "var(--text-secondary)" }}>{child.title}</summary>
                                  <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "2px 0 4px 12px", fontSize: 11 }}>{highlightText(child.content)}</pre>
                                </details>
                              ) : (
                                <div key={ci} style={{ fontSize: 11, padding: "1px 0", fontWeight: 500, color: "var(--text-secondary)" }}>{child.title}</div>
                              )
                            ))}
                          </div>
                        </details>
                      ) : (
                        sec.content.split("\n").filter(l => l.trim()).length > 0 ? (
                          <details key={idx} style={{ marginBottom: 4 }}>
                            <summary style={{ cursor: "pointer", fontWeight: 700, padding: "6px 0", borderBottom: "1px solid var(--border-default)" }}>{sec.title}</summary>
                            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "4px 0 4px 12px", fontSize: 11 }}>{highlightText(sec.content)}</pre>
                          </details>
                        ) : (
                          <div key={idx} style={{ fontWeight: 700, padding: "6px 0" }}>{sec.title}</div>
                        )
                      )
                    ));
                  })()}
                </div>
              ) : (
                <div className="result-empty-state">设置参数后点击"执行"获取输出。</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Package picker modal ── */}
      {packagePickerOpen && (
        <div className="modal-mask" role="dialog" aria-modal="true" onClick={() => setPackagePickerOpen(false)}>
          <div className="modal-card dumpsys-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>选择包名</h3>
              <button className="icon-button" onClick={() => setPackagePickerOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-default)" }}>
                <input
                  className="param-field-input"
                  type="text"
                  value={packagePickerQuery}
                  onChange={(e) => setPackagePickerQuery(e.target.value)}
                  placeholder="搜索包名..."
                  autoFocus
                  style={{ fontSize: 13 }}
                />
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto", padding: 6 }}>
                {filteredPackages.length === 0 && (
                  <div className="result-empty-state" style={{ padding: 20 }}>没有匹配的包名。</div>
                )}
                {filteredPackages.slice(0, 500).map((pkg) => {
                  const editorKey = moduleConfig?.params.find(p => p.kind === "package-picker")?.key;
                  const isSelected = editorKey ? (editorParams[editorKey] === pkg) : false;
                  return (
                    <button
                      key={pkg}
                      className={`logcat-selector-item ${isSelected ? "active" : ""}`}
                      style={{ width: "100%", textAlign: "left", padding: "6px 10px", fontSize: 13, background: "transparent", border: "none", cursor: "pointer", borderRadius: 4, color: "var(--text-primary)" }}
                      onClick={() => {
                        const editorKey = moduleConfig?.params.find(p => p.kind === "package-picker")?.key;
                        if (editorKey) setEditorParams(prev => ({ ...prev, [editorKey]: pkg }));
                        setPackagePickerOpen(false);
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {pkg}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
