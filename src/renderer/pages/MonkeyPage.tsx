import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface MonkeyConfig {
  eventCount: number;
  throttle: number;
  pctTouch: number;
  pctMotion: number;
  pctTrackball: number;
  pctNav: number;
  pctMajornav: number;
  pctSyskeys: number;
  pctAppswitch: number;
  pctFlip: number;
  pctAnyevent: number;
  seed: string;
  verbosity: number;
  ignoreCrashes: boolean;
  ignoreTimeouts: boolean;
  ignoreSecurityExceptions: boolean;
  ignoreNativeCrashes: boolean;
  killProcessAfterError: boolean;
  monitorNativeCrashes: boolean;
  multidisplay: string;
  includePackages: string[];
  excludePackages: string[];
}

interface MonkeyLogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error" | "crash" | "anr";
  message: string;
  raw: string;
}

interface MonkeyReport {
  totalEvents: number;
  completedEvents: number;
  crashCount: number;
  anrCount: number;
  exceptionCount: number;
  duration: number;
  startTime: string;
  endTime: string;
  packages: string[];
  crashLogs: string[];
  anrLogs: string[];
}

interface MonkeyStatus {
  running: boolean;
  pid?: number;
  progress?: number;
  totalEvents?: number;
  completedEvents?: number;
  elapsedMs?: number;
}

interface MonkeyPageProps {
  currentDeviceId: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: MonkeyConfig = {
  eventCount: 10000,
  throttle: 300,
  pctTouch: 0,
  pctMotion: 0,
  pctTrackball: 0,
  pctNav: 0,
  pctMajornav: 0,
  pctSyskeys: 0,
  pctAppswitch: 0,
  pctFlip: 0,
  pctAnyevent: 0,
  seed: "",
  verbosity: 1,
  ignoreCrashes: true,
  ignoreTimeouts: true,
  ignoreSecurityExceptions: true,
  ignoreNativeCrashes: true,
  killProcessAfterError: true,
  monitorNativeCrashes: true,
  multidisplay: "",
  includePackages: [],
  excludePackages: [],
};

const LOG_BUFFER_LIMIT = 2000;
const POLL_INTERVAL_MS = 1000;
const CRASH_PATTERN = /CRASH|crash|Fatal|FATAL|NullPointerException|IllegalStateException|RuntimeException/;
const ANR_PATTERN = /ANR|anr|Application Not Responding/;
const EXCEPTION_PATTERN = /Exception|EXCEPTION|Error.*at\s/;

// ─── Helper ─────────────────────────────────────────────────────────────────────

function classifyLogLine(line: string): MonkeyLogEntry["level"] {
  if (CRASH_PATTERN.test(line)) return "crash";
  if (ANR_PATTERN.test(line)) return "anr";
  if (EXCEPTION_PATTERN.test(line)) return "error";
  if (/WARNING|warn/i.test(line)) return "warning";
  return "info";
}

function buildMonkeyCommand(config: MonkeyConfig, deviceId: string): string {
  const parts: string[] = ["adb", "-s", deviceId, "shell", "monkey"];
  for (const pkg of config.includePackages) {
    if (pkg.trim()) parts.push("-p", pkg.trim());
  }
  for (const pkg of config.excludePackages) {
    if (pkg.trim()) parts.push("--pkg-blacklist-file", pkg.trim());
  }
  if (config.throttle > 0) parts.push("--throttle", String(config.throttle));
  if (config.pctTouch > 0) parts.push("--pct-touch", String(config.pctTouch));
  if (config.pctMotion > 0) parts.push("--pct-motion", String(config.pctMotion));
  if (config.pctTrackball > 0) parts.push("--pct-trackball", String(config.pctTrackball));
  if (config.pctNav > 0) parts.push("--pct-nav", String(config.pctNav));
  if (config.pctMajornav > 0) parts.push("--pct-majornav", String(config.pctMajornav));
  if (config.pctSyskeys > 0) parts.push("--pct-syskeys", String(config.pctSyskeys));
  if (config.pctAppswitch > 0) parts.push("--pct-appswitch", String(config.pctAppswitch));
  if (config.pctFlip > 0) parts.push("--pct-flip", String(config.pctFlip));
  if (config.pctAnyevent > 0) parts.push("--pct-anyevent", String(config.pctAnyevent));
  if (config.seed) parts.push("-s", config.seed);
  if (config.verbosity > 0) parts.push("-v".repeat(config.verbosity));
  if (config.ignoreCrashes) parts.push("--ignore-crashes");
  if (config.ignoreTimeouts) parts.push("--ignore-timeouts");
  if (config.ignoreSecurityExceptions) parts.push("--ignore-security-exceptions");
  if (config.ignoreNativeCrashes) parts.push("--ignore-native-crashes");
  if (config.killProcessAfterError) parts.push("--kill-process-after-error");
  if (config.monitorNativeCrashes) parts.push("--monitor-native-crashes");
  if (config.multidisplay.trim()) parts.push("--multidisplay", config.multidisplay.trim());
  parts.push(String(config.eventCount));
  return parts.join(" ");
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function MonkeyPage({ currentDeviceId }: MonkeyPageProps) {
  const [config, setConfig] = useState<MonkeyConfig>({ ...DEFAULT_CONFIG });
  const [status, setStatus] = useState<MonkeyStatus>({ running: false });
  const [logs, setLogs] = useState<MonkeyLogEntry[]>([]);
  const [report, setReport] = useState<MonkeyReport | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [packageInput, setPackageInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");
  const [showIncludePicker, setShowIncludePicker] = useState(false);
  const [showExcludePicker, setShowExcludePicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterLevel, setFilterLevel] = useState<MonkeyLogEntry["level"] | "all">("all");
  const [deviceApps, setDeviceApps] = useState<string[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logIdCounter = useRef(0);

  // ─── Fetch device apps ──────────────────────────────────────────────
  useEffect(() => {
    if (!currentDeviceId) return;
    let cancelled = false;
    setAppsLoading(true);
    fetch(`/api/adb-helper/monkey-apps?deviceId=${encodeURIComponent(currentDeviceId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          if (data.status === "ok") {
            setDeviceApps(data.packages ?? []);
          } else if (data.packages) {
            setDeviceApps(data.packages);
          }
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAppsLoading(false); });
    return () => { cancelled = true; };
  }, [currentDeviceId]);

  // ─── Polling for status + logs ──────────────────────────────────────
  useEffect(() => {
    if (!currentDeviceId || !status.running) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const poll = () => {
      fetch(`/api/adb-helper/monkey-status?deviceId=${encodeURIComponent(currentDeviceId)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.status === "ok") {
            setStatus(data.monkeyStatus);
            if (data.newLogs && data.newLogs.length > 0) {
              setLogs((prev) => {
                const newEntries: MonkeyLogEntry[] = data.newLogs.map((line: string) => ({
                  id: `mlog-${++logIdCounter.current}`,
                  timestamp: new Date().toLocaleTimeString(),
                  level: classifyLogLine(line),
                  message: line,
                  raw: line,
                }));
                const combined = [...prev, ...newEntries];
                return combined.length > LOG_BUFFER_LIMIT ? combined.slice(-LOG_BUFFER_LIMIT) : combined;
              });
            }
            if (!data.monkeyStatus.running && data.report) {
              setReport(data.report);
              setShowReport(true);
            }
          }
        })
        .catch(() => {});
    };
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    poll();
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [currentDeviceId, status.running]);

  // ─── Auto-scroll ────────────────────────────────────────────────────
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // ─── Start monkey ──────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!currentDeviceId || starting) return;
    setStarting(true);
    setLogs([]);
    setReport(null);
    setShowReport(false);
    try {
      const resp = await fetch("/api/adb-helper/monkey-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: currentDeviceId, config }),
      });
      const data = await resp.json();
      if (data.status === "ok") {
        setStatus({ running: true, pid: data.pid, totalEvents: config.eventCount, completedEvents: 0 });
      }
    } catch {}
    setStarting(false);
  }, [currentDeviceId, config, starting]);

  // ─── Stop monkey ───────────────────────────────────────────────────
  const handleStop = useCallback(async () => {
    if (!currentDeviceId || stopping) return;
    setStopping(true);
    try {
      const resp = await fetch("/api/adb-helper/monkey-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: currentDeviceId }),
      });
      const data = await resp.json();
      if (data.status === "ok") {
        setStatus({ running: false });
        if (data.report) {
          setReport(data.report);
          setShowReport(true);
        }
      }
    } catch {}
    setStopping(false);
  }, [currentDeviceId, stopping]);

  // ─── Package management ─────────────────────────────────────────────
  const addIncludePackage = () => {
    const pkg = packageInput.trim();
    if (pkg && !config.includePackages.includes(pkg)) {
      setConfig((c) => ({ ...c, includePackages: [...c.includePackages, pkg] }));
      setPackageInput("");
    }
  };
  const removeIncludePackage = (pkg: string) => {
    setConfig((c) => ({ ...c, includePackages: c.includePackages.filter((p) => p !== pkg) }));
  };
  const addExcludePackage = () => {
    const pkg = excludeInput.trim();
    if (pkg && !config.excludePackages.includes(pkg)) {
      setConfig((c) => ({ ...c, excludePackages: [...c.excludePackages, pkg] }));
      setExcludeInput("");
    }
  };
  const removeExcludePackage = (pkg: string) => {
    setConfig((c) => ({ ...c, excludePackages: c.excludePackages.filter((p) => p !== pkg) }));
  };

  // ─── Picker filtered list ───────────────────────────────────────────
  const pickerFilteredApps = useMemo(() => {
    const search = pickerSearch.trim().toLowerCase();
    if (!search) return deviceApps;
    // Support space-separated keywords (AND logic)
    const keywords = search.split(/\s+/).filter(Boolean);
    return deviceApps.filter((app) => {
      const lower = app.toLowerCase();
      return keywords.every((kw) => lower.includes(kw));
    });
  }, [deviceApps, pickerSearch]);

  // ─── Filtered logs ──────────────────────────────────────────────────
  const filteredLogs = filterLevel === "all" ? logs : logs.filter((l) => l.level === filterLevel);

  // ─── Log level color ────────────────────────────────────────────────
  const levelColor = (level: MonkeyLogEntry["level"]): string => {
    switch (level) {
      case "crash": return "var(--color-danger, #ef4444)";
      case "anr": return "var(--color-warning-strong, #f97316)";
      case "error": return "var(--color-error, #dc2626)";
      case "warning": return "var(--color-warning, #eab308)";
      default: return "var(--color-text-secondary, #94a3b8)";
    }
  };

  // ─── Stats summary ──────────────────────────────────────────────────
  const crashCount = logs.filter((l) => l.level === "crash").length;
  const anrCount = logs.filter((l) => l.level === "anr").length;
  const errorCount = logs.filter((l) => l.level === "error").length;

  // ─── Render ─────────────────────────────────────────────────────────
  if (!currentDeviceId) {
    return (
      <main className="page-shell">
        <section className="panel page-panel" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)" }}>
          <p>请先选择设备</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="panel page-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden" }}>
        {/* ─── Toolbar ─────────────────────────────── */}
        <div className="monkey-toolbar">
          <div className="monkey-toolbar-left">
            <button
              className="monkey-btn monkey-btn-primary"
              disabled={status.running || starting || !currentDeviceId}
              onClick={handleStart}
            >
              {starting ? "启动中..." : "▶ 开始测试"}
            </button>
            <button
              className="monkey-btn monkey-btn-danger"
              disabled={!status.running || stopping}
              onClick={handleStop}
            >
              {stopping ? "停止中..." : "⬛ 紧急停止"}
            </button>
            {status.running && (
              <span className="monkey-status-badge monkey-status-running">运行中</span>
            )}
            {!status.running && report && (
              <button className="monkey-btn monkey-btn-outline" onClick={() => setShowReport(true)}>
                查看报告
              </button>
            )}
          </div>
          <div className="monkey-toolbar-right">
            <span className="monkey-stat">
              崩溃: <strong style={{ color: "var(--color-danger, #ef4444)" }}>{crashCount}</strong>
            </span>
            <span className="monkey-stat">
              ANR: <strong style={{ color: "var(--color-warning-strong, #f97316)" }}>{anrCount}</strong>
            </span>
            <span className="monkey-stat">
              异常: <strong style={{ color: "var(--color-error, #dc2626)" }}>{errorCount}</strong>
            </span>
            {status.running && status.completedEvents != null && status.totalEvents != null && (
              <span className="monkey-stat">
                进度: {status.completedEvents}/{status.totalEvents}
              </span>
            )}
          </div>
        </div>

        {/* ─── Main content split ─────────────────── */}
        <div className="monkey-main-split">
          {/* ─── Left: Config panel ──────────────── */}
          <aside className="monkey-config-panel">
            <h3 className="monkey-section-title">参数配置</h3>

            {/* Event count & throttle */}
            <div className="monkey-field">
              <label>事件总数</label>
              <span className="monkey-field-hint">Monkey 将执行的随机事件总数</span>
              <input
                type="number"
                min={1}
                max={1000000}
                value={config.eventCount}
                onChange={(e) => setConfig((c) => ({ ...c, eventCount: Math.max(1, Number(e.target.value) || 1) }))}
                disabled={status.running}
              />
            </div>
            <div className="monkey-field">
              <label>事件间隔 (ms)</label>
              <span className="monkey-field-hint">每个事件之间的等待时间，越大越慢</span>
              <div className="monkey-slider-row">
                <input
                  type="range"
                  min={0}
                  max={2000}
                  step={50}
                  value={config.throttle}
                  onChange={(e) => setConfig((c) => ({ ...c, throttle: Number(e.target.value) }))}
                  disabled={status.running}
                  style={{ background: `linear-gradient(to right, #3b82f6 ${(config.throttle / 2000) * 100}%, #cbd5e1 ${(config.throttle / 2000) * 100}%)` }}
                />
                <span className="monkey-slider-value">{config.throttle}</span>
              </div>
            </div>

            {/* Percentage sliders */}
            <h4 className="monkey-section-subtitle">事件比例分配</h4>
            <span className="monkey-field-hint">各类事件占比，总和建议不超过 100%</span>
            {([
              { key: "pctTouch", label: "触摸 (Touch)", hint: "点击/长按等触摸事件" },
              { key: "pctMotion", label: "动作 (Motion)", hint: "滑动/拖拽等手势事件" },
              { key: "pctTrackball", label: "轨迹球", hint: "模拟轨迹球移动" },
              { key: "pctNav", label: "导航", hint: "方向键导航事件" },
              { key: "pctMajornav", label: "主导航", hint: "Home/Back/Menu 等主要导航" },
              { key: "pctSyskeys", label: "系统按键", hint: "音量、电源等系统键" },
              { key: "pctAppswitch", label: "应用切换", hint: "Activity 切换事件" },
              { key: "pctFlip", label: "翻转", hint: "键盘翻转事件" },
              { key: "pctAnyevent", label: "其他事件", hint: "未分类的其他事件" },
            ] as const).map((item) => (
              <div className="monkey-field monkey-field-compact" key={item.key}>
                <label title={item.hint}>{item.label}</label>
                <div className="monkey-slider-row">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={config[item.key]}
                    onChange={(e) => setConfig((c) => ({ ...c, [item.key]: Number(e.target.value) }))}
                    disabled={status.running}
                    style={{ background: `linear-gradient(to right, #3b82f6 ${config[item.key]}%, #cbd5e1 ${config[item.key]}%)` }}
                  />
                  <span className="monkey-slider-value">{config[item.key]}%</span>
                </div>
              </div>
            ))}

            {/* Advanced options */}
            <h4 className="monkey-section-subtitle">高级选项</h4>
            <div className="monkey-field">
              <label>随机种子</label>
              <span className="monkey-field-hint">固定种子可复现同一事件序列</span>
              <input
                type="text"
                placeholder="留空随机"
                value={config.seed}
                onChange={(e) => setConfig((c) => ({ ...c, seed: e.target.value }))}
                disabled={status.running}
              />
            </div>
            <div className="monkey-field">
              <label>详细级别</label>
              <span className="monkey-field-hint">输出详细程度，级别越高日志越多</span>
              <select
                value={config.verbosity}
                onChange={(e) => setConfig((c) => ({ ...c, verbosity: Number(e.target.value) }))}
                disabled={status.running}
              >
                <option value={0}>级别 0</option>
                <option value={1}>级别 1 (-v)</option>
                <option value={2}>级别 2 (-vv)</option>
                <option value={3}>级别 3 (-vvv)</option>
              </select>
            </div>
            <div className="monkey-checkboxes">
              <label><input type="checkbox" checked={config.ignoreCrashes} onChange={(e) => setConfig((c) => ({ ...c, ignoreCrashes: e.target.checked }))} disabled={status.running} /> 忽略崩溃继续 <span className="monkey-field-hint-inline">遇到 Crash 不停止</span></label>
              <label><input type="checkbox" checked={config.ignoreTimeouts} onChange={(e) => setConfig((c) => ({ ...c, ignoreTimeouts: e.target.checked }))} disabled={status.running} /> 忽略超时继续 <span className="monkey-field-hint-inline">遇到 ANR 不停止</span></label>
              <label><input type="checkbox" checked={config.ignoreSecurityExceptions} onChange={(e) => setConfig((c) => ({ ...c, ignoreSecurityExceptions: e.target.checked }))} disabled={status.running} /> 忽略安全异常 <span className="monkey-field-hint-inline">跳过权限错误</span></label>
              <label><input type="checkbox" checked={config.ignoreNativeCrashes} onChange={(e) => setConfig((c) => ({ ...c, ignoreNativeCrashes: e.target.checked }))} disabled={status.running} /> 忽略 Native 崩溃 <span className="monkey-field-hint-inline">遇到 Native Crash 不停止</span></label>
              <label><input type="checkbox" checked={config.killProcessAfterError} onChange={(e) => setConfig((c) => ({ ...c, killProcessAfterError: e.target.checked }))} disabled={status.running} /> 错误后终止进程 <span className="monkey-field-hint-inline">出错时 kill 目标进程</span></label>
              <label><input type="checkbox" checked={config.monitorNativeCrashes} onChange={(e) => setConfig((c) => ({ ...c, monitorNativeCrashes: e.target.checked }))} disabled={status.running} /> 监控 Native 崩溃</label>
            </div>

            <div className="monkey-field">
              <label>多屏 Display ID</label>
              <span className="monkey-field-hint">指定在哪个 display 上执行，留空为默认屏</span>
              <input
                type="text"
                placeholder="例如 4"
                value={config.multidisplay}
                onChange={(e) => setConfig((c) => ({ ...c, multidisplay: e.target.value }))}
                disabled={status.running}
              />
            </div>

            {/* Package include/exclude */}
            <h4 className="monkey-section-subtitle">测试应用范围</h4>
            <div className="monkey-field">
              <label>包含应用</label>
              <div className="monkey-package-input-row">
                <input
                  type="text"
                  placeholder="输入包名并回车"
                  value={packageInput}
                  onChange={(e) => setPackageInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addIncludePackage(); } }}
                  disabled={status.running}
                />
                <button className="monkey-btn monkey-btn-sm" onClick={addIncludePackage} disabled={status.running}>添加</button>
                <button
                  className="monkey-btn monkey-btn-sm"
                  onClick={() => { setPickerSearch(""); setShowIncludePicker(true); }}
                  disabled={status.running || appsLoading}
                >
                  {appsLoading ? "加载中..." : "选择"}
                </button>
              </div>
              {config.includePackages.length > 0 && (
                <div className="monkey-package-tags">
                  {config.includePackages.map((pkg) => (
                    <span key={pkg} className="monkey-tag monkey-tag-include">
                      {pkg}
                      {!status.running && <button className="monkey-tag-remove" onClick={() => removeIncludePackage(pkg)}>×</button>}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="monkey-field">
              <label>排除应用</label>
              <div className="monkey-package-input-row">
                <input
                  type="text"
                  placeholder="输入包名并回车"
                  value={excludeInput}
                  onChange={(e) => setExcludeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExcludePackage(); } }}
                  disabled={status.running}
                />
                <button className="monkey-btn monkey-btn-sm" onClick={addExcludePackage} disabled={status.running}>添加</button>
                <button
                  className="monkey-btn monkey-btn-sm"
                  onClick={() => { setPickerSearch(""); setShowExcludePicker(true); }}
                  disabled={status.running || appsLoading}
                >
                  {appsLoading ? "加载中..." : "选择"}
                </button>
              </div>
              {config.excludePackages.length > 0 && (
                <div className="monkey-package-tags">
                  {config.excludePackages.map((pkg) => (
                    <span key={pkg} className="monkey-tag monkey-tag-exclude">
                      {pkg}
                      {!status.running && <button className="monkey-tag-remove" onClick={() => removeExcludePackage(pkg)}>×</button>}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Command preview */}
            <h4 className="monkey-section-subtitle">命令预览</h4>
            <pre className="monkey-command-preview">
              {buildMonkeyCommand(config, currentDeviceId)}
            </pre>
          </aside>

          {/* ─── Right: Log panel ────────────────── */}
          <div className="monkey-log-panel">
            <div className="monkey-log-header">
              <h3 className="monkey-section-title">实时日志</h3>
              <div className="monkey-log-controls">
                <select
                  value={filterLevel}
                  onChange={(e) => setFilterLevel(e.target.value as typeof filterLevel)}
                  className="monkey-log-filter-select"
                >
                  <option value="all">全部级别</option>
                  <option value="crash">仅 CRASH</option>
                  <option value="anr">仅 ANR</option>
                  <option value="error">仅异常</option>
                  <option value="warning">仅警告</option>
                  <option value="info">仅信息</option>
                </select>
                <label className="monkey-autoscroll-label">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                  />
                  自动跟随
                </label>
                <button
                  className="monkey-btn monkey-btn-sm"
                  onClick={() => setLogs([])}
                  disabled={status.running}
                >
                  清空日志
                </button>
              </div>
            </div>
            <div
              className="monkey-log-container"
              ref={logContainerRef}
              onScroll={() => {
                if (!logContainerRef.current) return;
                const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
                if (scrollHeight - scrollTop - clientHeight > 50) {
                  setAutoScroll(false);
                } else {
                  setAutoScroll(true);
                }
              }}
            >
              {filteredLogs.length === 0 ? (
                <div className="monkey-log-empty">
                  {status.running ? "等待日志输出..." : "尚无日志。点击「开始测试」启动 Monkey。"}
                </div>
              ) : (
                filteredLogs.map((entry) => (
                  <div
                    key={entry.id}
                    className={`monkey-log-line monkey-log-level-${entry.level}`}
                    style={{ borderLeftColor: levelColor(entry.level) }}
                  >
                    <span className="monkey-log-time">{entry.timestamp}</span>
                    <span className={`monkey-log-badge monkey-log-badge-${entry.level}`}>
                      {entry.level.toUpperCase()}
                    </span>
                    <span className="monkey-log-msg">{entry.message}</span>
                  </div>
                ))
              )}
            </div>

            {/* ─── Progress bar ─────────────────────── */}
            {status.running && status.totalEvents && status.completedEvents != null && (
              <div className="monkey-progress-bar-container">
                <div
                  className="monkey-progress-bar"
                  style={{ width: `${Math.min(100, (status.completedEvents / status.totalEvents) * 100)}%` }}
                />
                <span className="monkey-progress-text">
                  {Math.round((status.completedEvents / status.totalEvents) * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ─── Package Picker Modal ──────────────── */}
        {(showIncludePicker || showExcludePicker) && (
          <div className="monkey-report-overlay" onClick={() => { setShowIncludePicker(false); setShowExcludePicker(false); }}>
            <div className="monkey-picker-modal" onClick={(e) => e.stopPropagation()}>
              <div className="monkey-picker-header">
                <h3>{showIncludePicker ? "选择包含应用" : "选择排除应用"}</h3>
                <button className="monkey-btn monkey-btn-sm" onClick={() => { setShowIncludePicker(false); setShowExcludePicker(false); }}>关闭</button>
              </div>
              <div className="monkey-picker-search">
                <input
                  type="text"
                  placeholder="搜索包名..."
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  autoFocus
                />
                <span className="monkey-picker-count">{pickerFilteredApps.length} / {deviceApps.length} 个应用</span>
              </div>
              <div className="monkey-picker-list">
                {pickerFilteredApps.length === 0 ? (
                  <div className="monkey-picker-empty">
                    {deviceApps.length === 0 ? "未获取到设备应用列表" : "无匹配结果"}
                  </div>
                ) : (
                  pickerFilteredApps.map((app) => {
                    const alreadyAdded = showIncludePicker
                      ? config.includePackages.includes(app)
                      : config.excludePackages.includes(app);
                    return (
                      <div
                        key={app}
                        className={`monkey-picker-item ${alreadyAdded ? "monkey-picker-item-selected" : ""}`}
                        onClick={() => {
                          if (alreadyAdded) return;
                          if (showIncludePicker) {
                            setConfig((c) => ({ ...c, includePackages: [...c.includePackages, app] }));
                          } else {
                            setConfig((c) => ({ ...c, excludePackages: [...c.excludePackages, app] }));
                          }
                        }}
                      >
                        <span className="monkey-picker-item-name">{app}</span>
                        {alreadyAdded && <span className="monkey-picker-item-check">✓ 已添加</span>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── Report Modal ──────────────────────── */}
        {showReport && report && (
          <div className="monkey-report-overlay" onClick={() => setShowReport(false)}>
            <div className="monkey-report-modal" onClick={(e) => e.stopPropagation()}>
              <div className="monkey-report-header">
                <h3>Monkey 测试报告</h3>
                <button className="monkey-btn monkey-btn-sm" onClick={() => setShowReport(false)}>关闭</button>
              </div>
              <div className="monkey-report-body">
                <div className="monkey-report-stats">
                  <div className="monkey-report-stat-card">
                    <span className="monkey-report-stat-label">事件总数</span>
                    <span className="monkey-report-stat-value">{report.totalEvents}</span>
                  </div>
                  <div className="monkey-report-stat-card">
                    <span className="monkey-report-stat-label">完成事件</span>
                    <span className="monkey-report-stat-value">{report.completedEvents}</span>
                  </div>
                  <div className="monkey-report-stat-card monkey-report-stat-danger">
                    <span className="monkey-report-stat-label">崩溃次数</span>
                    <span className="monkey-report-stat-value">{report.crashCount}</span>
                  </div>
                  <div className="monkey-report-stat-card monkey-report-stat-warning">
                    <span className="monkey-report-stat-label">ANR 次数</span>
                    <span className="monkey-report-stat-value">{report.anrCount}</span>
                  </div>
                  <div className="monkey-report-stat-card">
                    <span className="monkey-report-stat-label">异常次数</span>
                    <span className="monkey-report-stat-value">{report.exceptionCount}</span>
                  </div>
                  <div className="monkey-report-stat-card">
                    <span className="monkey-report-stat-label">持续时间</span>
                    <span className="monkey-report-stat-value">{Math.round(report.duration / 1000)}s</span>
                  </div>
                </div>
                <div className="monkey-report-details">
                  <div>
                    <strong>测试包：</strong>
                    {report.packages.length > 0 ? report.packages.join(", ") : "全部"}
                  </div>
                  <div>
                    <strong>开始时间：</strong>{report.startTime}
                  </div>
                  <div>
                    <strong>结束时间：</strong>{report.endTime}
                  </div>
                </div>
                {report.crashLogs.length > 0 && (
                  <div className="monkey-report-section">
                    <h4>崩溃日志</h4>
                    <pre className="monkey-report-log">{report.crashLogs.join("\n")}</pre>
                  </div>
                )}
                {report.anrLogs.length > 0 && (
                  <div className="monkey-report-section">
                    <h4>ANR 日志</h4>
                    <pre className="monkey-report-log">{report.anrLogs.join("\n")}</pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
