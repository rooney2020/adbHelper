import { Fragment, useCallback, useEffect, useRef, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────────

type PerfTab =
  | "fps"
  | "startup"
  | "cpu"
  | "memory"
  | "traffic"
  | "battery"
  | "storage"
  | "gpu"
  | "report"
  | "scenario"
  | "alert";

interface PerfTabItem {
  id: PerfTab;
  label: string;
  description: string;
}

const PERF_TABS: PerfTabItem[] = [
  { id: "fps", label: "帧率", description: "实时帧率监控、卡顿检测、帧耗时分析" },
  { id: "startup", label: "启动耗时", description: "冷启动/温启动/热启动测量与统计" },
  { id: "cpu", label: "CPU", description: "应用/系统 CPU 占用监控与线程分析" },
  { id: "memory", label: "内存", description: "PSS/RSS 监控、泄漏检测、GC 统计" },
  { id: "traffic", label: "流量", description: "实时流量监控、后台流量统计" },
  { id: "battery", label: "电池", description: "功耗监控、唤醒锁、Alarm 统计" },
  { id: "storage", label: "存储 IO", description: "磁盘读写、数据库、SP 监控" },
  { id: "gpu", label: "GPU", description: "GPU 占用、纹理内存、渲染管线" },
  { id: "report", label: "报告", description: "综合报告、基线对比、历史趋势" },
  { id: "scenario", label: "场景管理", description: "自定义脚本、模板库、定时任务" },
  { id: "alert", label: "异常监控", description: "性能劣化告警、卡顿捕获、ANR 检测" },
];

// ─── Shared utils ───────────────────────────────────────────────────────────────

interface FpsDataPoint {
  time: number; // elapsed ms
  fps: number;
  jankCount: number;
  bigJankCount: number;
  maxFrameTime: number;
}

interface StartupResult {
  type: string;
  totalTime: number | null;
  thisTime: number | null;
  waitTime: number | null;
  raw: string;
  timestamp: number;
}

interface CpuMemPoint {
  time: number;
  cpuPercent: number | null;
  totalPssKb: number | null;
}

// ─── Placeholder ────────────────────────────────────────────────────────────────

function PlaceholderPanel({ tab }: { tab: PerfTabItem }) {
  return (
    <div className="perf-placeholder">
      <div className="perf-placeholder-icon">🚧</div>
      <h3>{tab.label}</h3>
      <p className="perf-placeholder-desc">{tab.description}</p>
      <span className="perf-placeholder-badge">开发中</span>
    </div>
  );
}

// ─── Package Selector Component ─────────────────────────────────────────────

function PackageSelector({ deviceId, value, onChange, disabled }: { deviceId: string | null; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [apps, setApps] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const loadApps = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/adb-helper/monkey-apps?deviceId=${encodeURIComponent(deviceId)}`);
      const json = await resp.json();
      if (json.status === "ok") setApps(json.packages ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [deviceId]);

  const openPicker = useCallback(() => {
    setSearch("");
    setShowPicker(true);
    loadApps();
  }, [loadApps]);

  const filtered = apps.filter((a) => {
    if (!search.trim()) return true;
    const keywords = search.toLowerCase().split(/\s+/);
    return keywords.every((kw) => a.toLowerCase().includes(kw));
  });

  return (
    <>
      <div className="perf-pkg-selector">
        <input
          type="text"
          placeholder="输入包名或点击选择"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="perf-input"
        />
        <button className="perf-btn perf-btn-outline" onClick={openPicker} disabled={disabled || loading}>
          {loading ? "加载中..." : "选择"}
        </button>
      </div>
      {showPicker && (
        <div className="perf-picker-overlay" onClick={() => setShowPicker(false)}>
          <div className="perf-picker-modal" onClick={(e) => e.stopPropagation()}>
            <input
              className="perf-picker-search"
              type="text"
              placeholder="搜索包名（支持多关键词空格分隔）"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="perf-picker-list">
              {loading && <div className="perf-picker-loading">正在加载应用列表...</div>}
              {!loading && filtered.length === 0 && <div className="perf-picker-empty">{apps.length === 0 ? "未获取到应用列表，请确认设备已连接" : "无匹配结果"}</div>}
              {!loading && filtered.slice(0, 100).map((app) => (
                <div
                  key={app}
                  className={`perf-picker-item ${app === value ? "perf-picker-item-selected" : ""}`}
                  onClick={() => { onChange(app); setShowPicker(false); }}
                >
                  {app}
                </div>
              ))}
              {!loading && filtered.length > 100 && <div className="perf-picker-more">还有 {filtered.length - 100} 个结果，请缩小搜索范围</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── FPS Panel ──────────────────────────────────────────────────────────────────

function FpsPanel({ deviceId }: { deviceId: string | null }) {
  const [pkg, setPkg] = useState("");
  const [monitoring, setMonitoring] = useState(false);
  const [dataPoints, setDataPoints] = useState<FpsDataPoint[]>([]);
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const parseFps = useCallback((raw: string): { fps: number; jankCount: number; bigJankCount: number; maxFrameTime: number } => {
    // Parse gfxinfo framestats output
    const lines = raw.split("\n");
    let totalFrames = 0;
    let janky = 0;
    let bigJanky = 0;
    let maxTime = 0;
    let inStats = false;

    for (const line of lines) {
      if (line.includes("Total frames rendered:")) {
        const m = line.match(/(\d+)/);
        if (m) totalFrames = Number(m[1]);
      }
      if (line.includes("Janky frames:")) {
        const m = line.match(/(\d+)/);
        if (m) janky = Number(m[1]);
      }
      if (line.includes("Number Missed Vsync:")) {
        // approximation for big jank
        const m = line.match(/(\d+)/);
        if (m) bigJanky = Number(m[1]);
      }
      // framestats: parse frame durations
      if (line.startsWith("---PROFILEDATA---")) { inStats = true; continue; }
      if (line.startsWith("---PROFILEDATA---") && inStats) { inStats = false; continue; }
      if (inStats && !line.startsWith("Flags")) {
        const parts = line.split(",");
        if (parts.length >= 13) {
          const intended = Number(parts[1]);
          const frameCompleted = Number(parts[12] || parts[parts.length - 1]);
          if (intended > 0 && frameCompleted > 0) {
            const durationMs = (frameCompleted - intended) / 1_000_000;
            if (durationMs > maxTime) maxTime = durationMs;
          }
        }
      }
    }

    // Estimate FPS: totalFrames in ~1s polling
    const fps = totalFrames > 0 ? Math.min(totalFrames, 120) : 0;
    return { fps, jankCount: janky, bigJankCount: bigJanky, maxFrameTime: Math.round(maxTime * 10) / 10 };
  }, []);

  const startMonitoring = useCallback(async () => {
    if (!deviceId || !pkg) return;
    // Reset gfxinfo first
    await fetch(`/api/adb-helper/perf-reset-gfxinfo?deviceId=${encodeURIComponent(deviceId)}&package=${encodeURIComponent(pkg)}`);
    setDataPoints([]);
    startTimeRef.current = Date.now();
    setMonitoring(true);

    intervalRef.current = window.setInterval(async () => {
      try {
        const resp = await fetch(`/api/adb-helper/perf-fps?deviceId=${encodeURIComponent(deviceId)}&package=${encodeURIComponent(pkg)}&mode=gfxinfo`);
        const json = await resp.json();
        if (json.status === "ok") {
          const parsed = parseFps(json.data);
          setDataPoints((prev) => [...prev.slice(-300), {
            time: Date.now() - startTimeRef.current,
            ...parsed,
          }]);
          // Reset for next interval
          await fetch(`/api/adb-helper/perf-reset-gfxinfo?deviceId=${encodeURIComponent(deviceId)}&package=${encodeURIComponent(pkg)}`);
        }
      } catch { /* ignore */ }
    }, 1000);
  }, [deviceId, pkg, parseFps]);

  const stopMonitoring = useCallback(() => {
    setMonitoring(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  useEffect(() => { return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }, []);

  const stats = dataPoints.length > 0 ? {
    avg: Math.round(dataPoints.reduce((s, d) => s + d.fps, 0) / dataPoints.length),
    max: Math.max(...dataPoints.map((d) => d.fps)),
    min: Math.min(...dataPoints.map((d) => d.fps)),
    totalJanks: dataPoints.reduce((s, d) => s + d.jankCount, 0),
    totalBigJanks: dataPoints.reduce((s, d) => s + d.bigJankCount, 0),
  } : null;

  return (
    <div className="perf-panel-content">
      <div className="perf-controls">
        <PackageSelector deviceId={deviceId} value={pkg} onChange={setPkg} disabled={monitoring} />
        {!monitoring ? (
          <button className="perf-btn perf-btn-primary" onClick={startMonitoring} disabled={!deviceId || !pkg}>
            开始监控
          </button>
        ) : (
          <button className="perf-btn perf-btn-danger" onClick={stopMonitoring}>
            停止监控
          </button>
        )}
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="perf-stats-row">
          <div className="perf-stat-card">
            <span className="perf-stat-label">平均帧率</span>
            <span className="perf-stat-value">{stats.avg} FPS</span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-stat-label">最高</span>
            <span className="perf-stat-value">{stats.max}</span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-stat-label">最低</span>
            <span className="perf-stat-value">{stats.min}</span>
          </div>
          <div className="perf-stat-card perf-stat-warn">
            <span className="perf-stat-label">卡顿帧</span>
            <span className="perf-stat-value">{stats.totalJanks}</span>
          </div>
          <div className="perf-stat-card perf-stat-danger">
            <span className="perf-stat-label">严重卡顿</span>
            <span className="perf-stat-value">{stats.totalBigJanks}</span>
          </div>
        </div>
      )}

      {/* Simple text-based chart */}
      <div className="perf-chart-area">
        <h4>帧率曲线 (最近 {dataPoints.length} 个采样)</h4>
        <div className="perf-fps-chart">
          {dataPoints.slice(-60).map((dp, i) => (
            <div
              key={i}
              className="perf-fps-bar"
              style={{ height: `${Math.min(dp.fps / 60 * 100, 100)}%` }}
              title={`${Math.round(dp.time / 1000)}s: ${dp.fps} FPS`}
            >
              <span className={`perf-fps-bar-inner ${dp.fps < 30 ? "perf-fps-low" : dp.fps < 50 ? "perf-fps-mid" : "perf-fps-high"}`} />
            </div>
          ))}
        </div>
        <div className="perf-chart-legend">
          <span>0</span><span>30</span><span>60 FPS</span>
        </div>
      </div>

      {!monitoring && dataPoints.length === 0 && (
        <p className="perf-empty-hint">输入目标应用包名后点击"开始监控"</p>
      )}
    </div>
  );
}

// ─── Startup Panel ──────────────────────────────────────────────────────────────

function StartupPanel({ deviceId }: { deviceId: string | null }) {
  const [pkg, setPkg] = useState("");
  const [activity, setActivity] = useState("");
  const [testType, setTestType] = useState<"cold" | "warm" | "hot">("cold");
  const [count, setCount] = useState(5);
  const [results, setResults] = useState<StartupResult[]>([]);
  const [running, setRunning] = useState(false);

  const runTest = useCallback(async () => {
    if (!deviceId || !pkg) return;
    setRunning(true);
    setResults([]);
    for (let i = 0; i < count; i++) {
      try {
        const params = new URLSearchParams({ deviceId, package: pkg, type: testType });
        if (activity) params.set("activity", activity);
        const resp = await fetch(`/api/adb-helper/perf-startup?${params}`);
        const json = await resp.json();
        if (json.status === "ok") {
          setResults((prev) => [...prev, { ...json, timestamp: Date.now() }]);
        }
        // Wait between iterations
        if (i < count - 1) await new Promise((r) => setTimeout(r, 2000));
      } catch { /* ignore */ }
    }
    setRunning(false);
  }, [deviceId, pkg, activity, testType, count]);

  const validResults = results.filter((r) => r.totalTime !== null);
  const stats = validResults.length > 0 ? {
    avg: Math.round(validResults.reduce((s, r) => s + (r.totalTime ?? 0), 0) / validResults.length),
    max: Math.max(...validResults.map((r) => r.totalTime ?? 0)),
    min: Math.min(...validResults.map((r) => r.totalTime ?? 0)),
    median: (() => {
      const sorted = [...validResults].map((r) => r.totalTime ?? 0).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    })(),
  } : null;

  return (
    <div className="perf-panel-content">
      <div className="perf-controls">
        <PackageSelector deviceId={deviceId} value={pkg} onChange={setPkg} disabled={running} />
        <input type="text" placeholder="Activity (可选)" value={activity} onChange={(e) => setActivity(e.target.value)} disabled={running} className="perf-input perf-input-sm" />
        <select value={testType} onChange={(e) => setTestType(e.target.value as typeof testType)} disabled={running} className="perf-select">
          <option value="cold">冷启动</option>
          <option value="warm">温启动</option>
          <option value="hot">热启动</option>
        </select>
        <label className="perf-label-inline">
          次数
          <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={running} className="perf-input-number" />
        </label>
        <button className="perf-btn perf-btn-primary" onClick={runTest} disabled={running || !deviceId || !pkg}>
          {running ? `测试中 (${results.length}/${count})` : "开始测试"}
        </button>
      </div>

      {stats && (
        <div className="perf-stats-row">
          <div className="perf-stat-card"><span className="perf-stat-label">平均</span><span className="perf-stat-value">{stats.avg} ms</span></div>
          <div className="perf-stat-card"><span className="perf-stat-label">最快</span><span className="perf-stat-value">{stats.min} ms</span></div>
          <div className="perf-stat-card"><span className="perf-stat-label">最慢</span><span className="perf-stat-value">{stats.max} ms</span></div>
          <div className="perf-stat-card"><span className="perf-stat-label">中位数</span><span className="perf-stat-value">{stats.median} ms</span></div>
        </div>
      )}

      {validResults.length > 0 && (
        <div className="perf-table-wrap">
          <table className="perf-table">
            <thead>
              <tr><th>#</th><th>类型</th><th>TotalTime</th><th>ThisTime</th><th>WaitTime</th></tr>
            </thead>
            <tbody>
              {validResults.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{r.type === "cold" ? "冷启动" : r.type === "warm" ? "温启动" : "热启动"}</td>
                  <td className="perf-td-num">{r.totalTime} ms</td>
                  <td className="perf-td-num">{r.thisTime} ms</td>
                  <td className="perf-td-num">{r.waitTime} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!running && results.length === 0 && (
        <p className="perf-empty-hint">输入包名并选择启动类型后点击"开始测试"</p>
      )}
    </div>
  );
}

// ─── CPU/Memory Panel ───────────────────────────────────────────────────────────

function CpuMemPanel({ deviceId }: { deviceId: string | null }) {
  const [pkg, setPkg] = useState("");
  const [monitoring, setMonitoring] = useState(false);
  const [dataPoints, setDataPoints] = useState<CpuMemPoint[]>([]);
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const startMonitoring = useCallback(() => {
    if (!deviceId) return;
    setDataPoints([]);
    startTimeRef.current = Date.now();
    setMonitoring(true);

    intervalRef.current = window.setInterval(async () => {
      try {
        const params = new URLSearchParams({ deviceId });
        if (pkg) params.set("package", pkg);
        const resp = await fetch(`/api/adb-helper/perf-cpu-mem?${params}`);
        const json = await resp.json();
        if (json.status === "ok") {
          setDataPoints((prev) => [...prev.slice(-300), {
            time: Date.now() - startTimeRef.current,
            cpuPercent: json.cpuPercent,
            totalPssKb: json.totalPssKb,
          }]);
        }
      } catch { /* ignore */ }
    }, 2000);
  }, [deviceId, pkg]);

  const stopMonitoring = useCallback(() => {
    setMonitoring(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  useEffect(() => { return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }, []);

  const latest = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1] : null;
  const cpuPoints = dataPoints.filter((d) => d.cpuPercent !== null);
  const memPoints = dataPoints.filter((d) => d.totalPssKb !== null);

  return (
    <div className="perf-panel-content">
      <div className="perf-controls">
        <PackageSelector deviceId={deviceId} value={pkg} onChange={setPkg} disabled={monitoring} />
        {!monitoring ? (
          <button className="perf-btn perf-btn-primary" onClick={startMonitoring} disabled={!deviceId}>开始监控</button>
        ) : (
          <button className="perf-btn perf-btn-danger" onClick={stopMonitoring}>停止监控</button>
        )}
      </div>

      {latest && (
        <div className="perf-stats-row">
          <div className="perf-stat-card">
            <span className="perf-stat-label">当前 CPU</span>
            <span className="perf-stat-value">{latest.cpuPercent !== null ? `${latest.cpuPercent}%` : "N/A"}</span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-stat-label">当前内存 (PSS)</span>
            <span className="perf-stat-value">{latest.totalPssKb !== null ? `${Math.round(latest.totalPssKb / 1024)} MB` : "N/A"}</span>
          </div>
          {cpuPoints.length > 1 && (
            <div className="perf-stat-card">
              <span className="perf-stat-label">CPU 平均</span>
              <span className="perf-stat-value">{(cpuPoints.reduce((s, d) => s + (d.cpuPercent ?? 0), 0) / cpuPoints.length).toFixed(1)}%</span>
            </div>
          )}
          {memPoints.length > 1 && (
            <div className="perf-stat-card">
              <span className="perf-stat-label">内存峰值</span>
              <span className="perf-stat-value">{Math.round(Math.max(...memPoints.map((d) => d.totalPssKb ?? 0)) / 1024)} MB</span>
            </div>
          )}
        </div>
      )}

      {/* Simple bar chart for CPU */}
      {cpuPoints.length > 0 && (
        <div className="perf-chart-area">
          <h4>CPU 使用率 (最近 {Math.min(cpuPoints.length, 60)} 个采样)</h4>
          <div className="perf-fps-chart">
            {cpuPoints.slice(-60).map((dp, i) => (
              <div key={i} className="perf-fps-bar" style={{ height: `${Math.min(dp.cpuPercent ?? 0, 100)}%` }} title={`${Math.round(dp.time / 1000)}s: ${dp.cpuPercent}%`}>
                <span className={`perf-fps-bar-inner ${(dp.cpuPercent ?? 0) > 80 ? "perf-fps-low" : (dp.cpuPercent ?? 0) > 50 ? "perf-fps-mid" : "perf-fps-high"}`} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Simple bar chart for Memory */}
      {memPoints.length > 0 && (
        <div className="perf-chart-area">
          <h4>内存占用 (PSS)</h4>
          <div className="perf-fps-chart">
            {memPoints.slice(-60).map((dp, i) => {
              const maxMem = Math.max(...memPoints.map((d) => d.totalPssKb ?? 1));
              return (
                <div key={i} className="perf-fps-bar" style={{ height: `${((dp.totalPssKb ?? 0) / maxMem) * 100}%` }} title={`${Math.round(dp.time / 1000)}s: ${Math.round((dp.totalPssKb ?? 0) / 1024)} MB`}>
                  <span className="perf-fps-bar-inner perf-fps-mem" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!monitoring && dataPoints.length === 0 && (
        <p className="perf-empty-hint">输入包名后点击"开始监控"查看 CPU 和内存实时数据</p>
      )}
    </div>
  );
}

// ─── Traffic Panel ──────────────────────────────────────────────────────────────

interface TrafficDataPoint {
  time: number;
  rxBytes: number | null;
  txBytes: number | null;
}

function TrafficPanel({ deviceId }: { deviceId: string | null }) {
  const [pkg, setPkg] = useState("");
  const [monitoring, setMonitoring] = useState(false);
  const [dataPoints, setDataPoints] = useState<TrafficDataPoint[]>([]);
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const baselineRef = useRef<{ rx: number | null; tx: number | null }>({ rx: null, tx: null });

  const startMonitoring = useCallback(() => {
    if (!deviceId || !pkg) return;
    setDataPoints([]);
    startTimeRef.current = Date.now();
    baselineRef.current = { rx: null, tx: null };
    setMonitoring(true);

    intervalRef.current = window.setInterval(async () => {
      try {
        const resp = await fetch(`/api/adb-helper/perf-traffic?deviceId=${encodeURIComponent(deviceId)}&package=${encodeURIComponent(pkg)}`);
        const json = await resp.json();
        if (json.status === "ok") {
          const rx = json.rxBytes ?? 0;
          const tx = json.txBytes ?? 0;
          if (baselineRef.current.rx === null) {
            baselineRef.current = { rx, tx };
          }
          setDataPoints((prev) => [...prev.slice(-300), {
            time: Date.now() - startTimeRef.current,
            rxBytes: rx - (baselineRef.current.rx ?? 0),
            txBytes: tx - (baselineRef.current.tx ?? 0),
          }]);
        }
      } catch { /* ignore */ }
    }, 3000);
  }, [deviceId, pkg]);

  const stopMonitoring = useCallback(() => {
    setMonitoring(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  useEffect(() => { return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }, []);

  const formatBytes = (b: number | null) => {
    if (b === null) return "N/A";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(2)} MB`;
  };

  const latest = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1] : null;
  // Calculate speed (diff between last two points)
  const speed = dataPoints.length >= 2 ? (() => {
    const p1 = dataPoints[dataPoints.length - 2];
    const p2 = dataPoints[dataPoints.length - 1];
    const dt = (p2.time - p1.time) / 1000;
    if (dt <= 0) return { rxSpeed: 0, txSpeed: 0 };
    return {
      rxSpeed: ((p2.rxBytes ?? 0) - (p1.rxBytes ?? 0)) / dt,
      txSpeed: ((p2.txBytes ?? 0) - (p1.txBytes ?? 0)) / dt,
    };
  })() : null;

  return (
    <div className="perf-panel-content">
      <div className="perf-controls">
        <PackageSelector deviceId={deviceId} value={pkg} onChange={setPkg} disabled={monitoring} />
        {!monitoring ? (
          <button className="perf-btn perf-btn-primary" onClick={startMonitoring} disabled={!deviceId || !pkg}>开始监控</button>
        ) : (
          <button className="perf-btn perf-btn-danger" onClick={stopMonitoring}>停止监控</button>
        )}
      </div>

      {latest && (
        <div className="perf-stats-row">
          <div className="perf-stat-card">
            <span className="perf-stat-label">累计接收</span>
            <span className="perf-stat-value">{formatBytes(latest.rxBytes)}</span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-stat-label">累计发送</span>
            <span className="perf-stat-value">{formatBytes(latest.txBytes)}</span>
          </div>
          {speed && (
            <>
              <div className="perf-stat-card">
                <span className="perf-stat-label">下载速度</span>
                <span className="perf-stat-value">{formatBytes(speed.rxSpeed)}/s</span>
              </div>
              <div className="perf-stat-card">
                <span className="perf-stat-label">上传速度</span>
                <span className="perf-stat-value">{formatBytes(speed.txSpeed)}/s</span>
              </div>
            </>
          )}
        </div>
      )}

      {dataPoints.length > 1 && (
        <div className="perf-chart-area">
          <h4>流量趋势 (累计)</h4>
          <div className="perf-traffic-chart">
            {dataPoints.slice(-60).map((dp, i) => {
              const maxVal = Math.max(...dataPoints.slice(-60).map((d) => Math.max(d.rxBytes ?? 0, d.txBytes ?? 0)), 1);
              return (
                <div key={i} className="perf-traffic-bar-group" title={`${Math.round(dp.time / 1000)}s\n↓${formatBytes(dp.rxBytes)} ↑${formatBytes(dp.txBytes)}`}>
                  <div className="perf-traffic-bar perf-traffic-rx" style={{ height: `${((dp.rxBytes ?? 0) / maxVal) * 100}%` }} />
                  <div className="perf-traffic-bar perf-traffic-tx" style={{ height: `${((dp.txBytes ?? 0) / maxVal) * 100}%` }} />
                </div>
              );
            })}
          </div>
          <div className="perf-chart-legend">
            <span className="perf-legend-rx">● 接收</span>
            <span className="perf-legend-tx">● 发送</span>
          </div>
        </div>
      )}

      {!monitoring && dataPoints.length === 0 && (
        <p className="perf-empty-hint">选择应用后点击"开始监控"查看网络流量数据</p>
      )}
    </div>
  );
}

// ─── Battery Panel ──────────────────────────────────────────────────────────────

interface BatteryInfo {
  level: number | null;
  temperature: number | null;
  voltage: number | null;
  batteryStatus: number | null;
  plugged: number | null;
  currentNow: number | null;
  wakelocks: string | null;
}

interface BatteryDataPoint {
  time: number;
  level: number | null;
  temperature: number | null;
  currentNow: number | null;
}

function BatteryPanel({ deviceId }: { deviceId: string | null }) {
  const [pkg, setPkg] = useState("");
  const [monitoring, setMonitoring] = useState(false);
  const [info, setInfo] = useState<BatteryInfo | null>(null);
  const [dataPoints, setDataPoints] = useState<BatteryDataPoint[]>([]);
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const fetchBattery = useCallback(async () => {
    if (!deviceId) return;
    try {
      const params = new URLSearchParams({ deviceId });
      if (pkg) params.set("package", pkg);
      const resp = await fetch(`/api/adb-helper/perf-battery?${params}`);
      const json = await resp.json();
      if (json.status === "ok") {
        setInfo(json);
        setDataPoints((prev) => [...prev.slice(-300), {
          time: Date.now() - startTimeRef.current,
          level: json.level,
          temperature: json.temperature,
          currentNow: json.currentNow,
        }]);
      }
    } catch { /* ignore */ }
  }, [deviceId, pkg]);

  const startMonitoring = useCallback(() => {
    setDataPoints([]);
    startTimeRef.current = Date.now();
    setMonitoring(true);
    fetchBattery();
    intervalRef.current = window.setInterval(fetchBattery, 5000);
  }, [fetchBattery]);

  const stopMonitoring = useCallback(() => {
    setMonitoring(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  useEffect(() => { return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }, []);

  const batteryStatusText = (s: number | null) => {
    switch (s) {
      case 1: return "未知";
      case 2: return "充电中";
      case 3: return "放电中";
      case 4: return "未充电";
      case 5: return "已充满";
      default: return "未知";
    }
  };

  return (
    <div className="perf-panel-content">
      <div className="perf-controls">
        <PackageSelector deviceId={deviceId} value={pkg} onChange={setPkg} disabled={monitoring} />
        {!monitoring ? (
          <button className="perf-btn perf-btn-primary" onClick={startMonitoring} disabled={!deviceId}>开始监控</button>
        ) : (
          <button className="perf-btn perf-btn-danger" onClick={stopMonitoring}>停止监控</button>
        )}
      </div>

      {info && (
        <div className="perf-stats-row">
          <div className="perf-stat-card">
            <span className="perf-stat-label">电量</span>
            <span className="perf-stat-value">{info.level !== null ? `${info.level}%` : "N/A"}</span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-stat-label">温度</span>
            <span className="perf-stat-value">{info.temperature !== null ? `${info.temperature}°C` : "N/A"}</span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-stat-label">电压</span>
            <span className="perf-stat-value">{info.voltage !== null ? `${info.voltage} mV` : "N/A"}</span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-stat-label">电流</span>
            <span className="perf-stat-value">{info.currentNow !== null ? `${info.currentNow} μA` : "N/A"}</span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-stat-label">状态</span>
            <span className="perf-stat-value">{batteryStatusText(info.batteryStatus)}</span>
          </div>
        </div>
      )}

      {/* Temperature chart */}
      {dataPoints.length > 1 && (
        <div className="perf-chart-area">
          <h4>温度变化</h4>
          <div className="perf-fps-chart">
            {dataPoints.slice(-60).map((dp, i) => {
              const temps = dataPoints.slice(-60).map((d) => d.temperature ?? 25);
              const maxT = Math.max(...temps, 50);
              const minT = Math.min(...temps, 20);
              const range = maxT - minT || 1;
              return (
                <div key={i} className="perf-fps-bar" style={{ height: `${((dp.temperature ?? 25) - minT) / range * 100}%` }} title={`${Math.round(dp.time / 1000)}s: ${dp.temperature}°C`}>
                  <span className={`perf-fps-bar-inner ${(dp.temperature ?? 0) > 40 ? "perf-fps-low" : (dp.temperature ?? 0) > 35 ? "perf-fps-mid" : "perf-fps-high"}`} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Wakelock info */}
      {info?.wakelocks && (
        <div className="perf-chart-area">
          <h4>唤醒锁信息</h4>
          <pre className="perf-raw-output">{info.wakelocks}</pre>
        </div>
      )}

      {!monitoring && dataPoints.length === 0 && (
        <p className="perf-empty-hint">点击"开始监控"查看电池状态与功耗数据</p>
      )}
    </div>
  );
}

// ─── GPU Panel ──────────────────────────────────────────────────────────────────

interface GpuInfo {
  totalFrames: number | null;
  jankyFrames: number | null;
  percentile50: number | null;
  percentile90: number | null;
  percentile95: number | null;
  percentile99: number | null;
  missedVsync: number | null;
  highInputLatency: number | null;
  slowUiThread: number | null;
  slowBitmapUploads: number | null;
  slowIssueDraw: number | null;
  raw: string;
}

function GpuPanel({ deviceId }: { deviceId: string | null }) {
  const [pkg, setPkg] = useState("");
  const [info, setInfo] = useState<GpuInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const fetchGpu = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ deviceId });
      if (pkg) params.set("package", pkg);
      const resp = await fetch(`/api/adb-helper/perf-gpu?${params}`);
      const json = await resp.json();
      if (json.status === "ok") setInfo(json);
    } catch { /* ignore */ }
    setLoading(false);
  }, [deviceId, pkg]);

  const toggleAutoRefresh = useCallback(() => {
    if (autoRefresh) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      setAutoRefresh(false);
    } else {
      setAutoRefresh(true);
      fetchGpu();
      intervalRef.current = window.setInterval(fetchGpu, 3000);
    }
  }, [autoRefresh, fetchGpu]);

  useEffect(() => { return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }, []);

  const jankyPercent = info?.totalFrames && info?.jankyFrames ? ((info.jankyFrames / info.totalFrames) * 100).toFixed(1) : null;

  return (
    <div className="perf-panel-content">
      <div className="perf-controls">
        <PackageSelector deviceId={deviceId} value={pkg} onChange={setPkg} disabled={autoRefresh} />
        <button className="perf-btn perf-btn-primary" onClick={fetchGpu} disabled={loading || !deviceId}>
          {loading ? "加载中..." : "获取数据"}
        </button>
        <button className={`perf-btn ${autoRefresh ? "perf-btn-danger" : "perf-btn-outline"}`} onClick={toggleAutoRefresh} disabled={!deviceId}>
          {autoRefresh ? "停止刷新" : "自动刷新"}
        </button>
      </div>

      {info && (
        <>
          <div className="perf-stats-row">
            <div className="perf-stat-card">
              <span className="perf-stat-label">总帧数</span>
              <span className="perf-stat-value">{info.totalFrames ?? "N/A"}</span>
            </div>
            <div className="perf-stat-card perf-stat-warn">
              <span className="perf-stat-label">卡顿帧</span>
              <span className="perf-stat-value">{info.jankyFrames ?? "N/A"}{jankyPercent ? ` (${jankyPercent}%)` : ""}</span>
            </div>
            <div className="perf-stat-card">
              <span className="perf-stat-label">丢 VSync</span>
              <span className="perf-stat-value">{info.missedVsync ?? "N/A"}</span>
            </div>
            <div className="perf-stat-card">
              <span className="perf-stat-label">UI线程慢</span>
              <span className="perf-stat-value">{info.slowUiThread ?? "N/A"}</span>
            </div>
          </div>

          {/* Percentile distribution */}
          <div className="perf-chart-area">
            <h4>帧耗时分布</h4>
            <div className="perf-percentile-grid">
              {[
                { label: "P50", value: info.percentile50 },
                { label: "P90", value: info.percentile90 },
                { label: "P95", value: info.percentile95 },
                { label: "P99", value: info.percentile99 },
              ].map((p) => (
                <div key={p.label} className="perf-percentile-item">
                  <span className="perf-percentile-label">{p.label}</span>
                  <div className="perf-percentile-bar-wrap">
                    <div className={`perf-percentile-bar ${(p.value ?? 0) > 32 ? "perf-pbar-danger" : (p.value ?? 0) > 16 ? "perf-pbar-warn" : "perf-pbar-ok"}`} style={{ width: `${Math.min(((p.value ?? 0) / 50) * 100, 100)}%` }} />
                  </div>
                  <span className="perf-percentile-val">{p.value !== null ? `${p.value} ms` : "N/A"}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="perf-chart-area">
            <h4>渲染问题分析</h4>
            <div className="perf-stats-row">
              <div className="perf-stat-card">
                <span className="perf-stat-label">高输入延迟</span>
                <span className="perf-stat-value">{info.highInputLatency ?? "N/A"}</span>
              </div>
              <div className="perf-stat-card">
                <span className="perf-stat-label">慢位图上传</span>
                <span className="perf-stat-value">{info.slowBitmapUploads ?? "N/A"}</span>
              </div>
              <div className="perf-stat-card">
                <span className="perf-stat-label">慢绘制命令</span>
                <span className="perf-stat-value">{info.slowIssueDraw ?? "N/A"}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {!info && !loading && (
        <p className="perf-empty-hint">选择应用后点击"获取数据"查看 GPU 渲染统计</p>
      )}
    </div>
  );
}

// ─── Storage IO Panel ───────────────────────────────────────────────────────────

interface StorageDataPoint {
  time: number;
  readBytes: number | null;
  writeBytes: number | null;
}

function StoragePanel({ deviceId }: { deviceId: string | null }) {
  const [pkg, setPkg] = useState("");
  const [monitoring, setMonitoring] = useState(false);
  const [dataPoints, setDataPoints] = useState<StorageDataPoint[]>([]);
  const [diskStats, setDiskStats] = useState("");
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const startMonitoring = useCallback(() => {
    if (!deviceId || !pkg) return;
    setDataPoints([]);
    setDiskStats("");
    startTimeRef.current = Date.now();
    setMonitoring(true);

    intervalRef.current = window.setInterval(async () => {
      try {
        const resp = await fetch(`/api/adb-helper/perf-storage-io?deviceId=${encodeURIComponent(deviceId)}&package=${encodeURIComponent(pkg)}`);
        const json = await resp.json();
        if (json.status === "ok") {
          setDataPoints((prev) => [...prev.slice(-300), {
            time: Date.now() - startTimeRef.current,
            readBytes: json.readBytes,
            writeBytes: json.writeBytes,
          }]);
          if (json.diskStats) setDiskStats(json.diskStats);
        }
      } catch { /* ignore */ }
    }, 3000);
  }, [deviceId, pkg]);

  const stopMonitoring = useCallback(() => {
    setMonitoring(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  useEffect(() => { return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }, []);

  const formatBytes = (b: number | null) => {
    if (b === null) return "N/A";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(2)} MB`;
  };

  const latest = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1] : null;
  // IO speed (delta between last two points)
  const ioSpeed = dataPoints.length >= 2 ? (() => {
    const p1 = dataPoints[dataPoints.length - 2];
    const p2 = dataPoints[dataPoints.length - 1];
    const dt = (p2.time - p1.time) / 1000;
    if (dt <= 0) return null;
    return {
      readSpeed: ((p2.readBytes ?? 0) - (p1.readBytes ?? 0)) / dt,
      writeSpeed: ((p2.writeBytes ?? 0) - (p1.writeBytes ?? 0)) / dt,
    };
  })() : null;

  return (
    <div className="perf-panel-content">
      <div className="perf-controls">
        <PackageSelector deviceId={deviceId} value={pkg} onChange={setPkg} disabled={monitoring} />
        {!monitoring ? (
          <button className="perf-btn perf-btn-primary" onClick={startMonitoring} disabled={!deviceId || !pkg}>开始监控</button>
        ) : (
          <button className="perf-btn perf-btn-danger" onClick={stopMonitoring}>停止监控</button>
        )}
      </div>

      {latest && (
        <div className="perf-stats-row">
          <div className="perf-stat-card">
            <span className="perf-stat-label">累计读取</span>
            <span className="perf-stat-value">{formatBytes(latest.readBytes)}</span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-stat-label">累计写入</span>
            <span className="perf-stat-value">{formatBytes(latest.writeBytes)}</span>
          </div>
          {ioSpeed && (
            <>
              <div className="perf-stat-card">
                <span className="perf-stat-label">读速度</span>
                <span className="perf-stat-value">{formatBytes(ioSpeed.readSpeed)}/s</span>
              </div>
              <div className="perf-stat-card">
                <span className="perf-stat-label">写速度</span>
                <span className="perf-stat-value">{formatBytes(ioSpeed.writeSpeed)}/s</span>
              </div>
            </>
          )}
        </div>
      )}

      {dataPoints.length > 1 && (
        <div className="perf-chart-area">
          <h4>I/O 趋势</h4>
          <div className="perf-traffic-chart">
            {dataPoints.slice(-60).map((dp, i) => {
              const maxVal = Math.max(...dataPoints.slice(-60).map((d) => Math.max(d.readBytes ?? 0, d.writeBytes ?? 0)), 1);
              return (
                <div key={i} className="perf-traffic-bar-group" title={`${Math.round(dp.time / 1000)}s\n读:${formatBytes(dp.readBytes)} 写:${formatBytes(dp.writeBytes)}`}>
                  <div className="perf-traffic-bar perf-traffic-rx" style={{ height: `${((dp.readBytes ?? 0) / maxVal) * 100}%` }} />
                  <div className="perf-traffic-bar perf-traffic-tx" style={{ height: `${((dp.writeBytes ?? 0) / maxVal) * 100}%` }} />
                </div>
              );
            })}
          </div>
          <div className="perf-chart-legend">
            <span className="perf-legend-rx">● 读取</span>
            <span className="perf-legend-tx">● 写入</span>
          </div>
        </div>
      )}

      {diskStats && (
        <div className="perf-chart-area">
          <h4>磁盘统计</h4>
          <pre className="perf-raw-output">{diskStats}</pre>
        </div>
      )}

      {!monitoring && dataPoints.length === 0 && (
        <p className="perf-empty-hint">选择应用后点击"开始监控"查看存储 I/O 数据</p>
      )}
    </div>
  );
}

// ─── Report Panel ───────────────────────────────────────────────────────────────

interface ReportMetrics {
  timestamp: number;
  package: string;
  totalFrames: number | null;
  jankyFrames: number | null;
  jankyPercent: number | null;
  percentile50: number | null;
  percentile90: number | null;
  percentile95: number | null;
  percentile99: number | null;
  missedVsync: number | null;
  batteryLevel: number | null;
  temperature: number | null;
  currentNow: number | null;
  readBytes: number | null;
  writeBytes: number | null;
  cpuPercent: number | null;
  memoryPssKb: number | null;
}

interface Baseline {
  id: string;
  name: string;
  package: string;
  metrics: ReportMetrics;
  createdAt: number;
}

function ReportPanel({ deviceId }: { deviceId: string | null }) {
  const [pkg, setPkg] = useState("");
  const [generating, setGenerating] = useState(false);
  const [metrics, setMetrics] = useState<ReportMetrics | null>(null);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [selectedBaseline, setSelectedBaseline] = useState<string>("");
  const [baselineName, setBaselineName] = useState("");
  const [showSaveBaseline, setShowSaveBaseline] = useState(false);

  // Load baselines on mount
  useEffect(() => {
    fetch("/api/adb-helper/perf-baselines-load")
      .then((r) => r.json())
      .then((d) => { if (d.status === "ok") setBaselines(d.baselines ?? []); })
      .catch(() => {});
  }, []);

  const generateReport = useCallback(async () => {
    if (!deviceId || !pkg) return;
    setGenerating(true);
    setMetrics(null);

    const m: ReportMetrics = {
      timestamp: Date.now(),
      package: pkg,
      totalFrames: null, jankyFrames: null, jankyPercent: null,
      percentile50: null, percentile90: null, percentile95: null, percentile99: null,
      missedVsync: null,
      batteryLevel: null, temperature: null, currentNow: null,
      readBytes: null, writeBytes: null,
      cpuPercent: null, memoryPssKb: null,
    };

    try {
      const resp = await fetch(`/api/adb-helper/perf-gpu?deviceId=${encodeURIComponent(deviceId)}&package=${encodeURIComponent(pkg)}`);
      const json = await resp.json();
      if (json.status === "ok") {
        m.totalFrames = json.totalFrames;
        m.jankyFrames = json.jankyFrames;
        m.jankyPercent = m.totalFrames ? Number(((m.jankyFrames ?? 0) / m.totalFrames * 100).toFixed(1)) : null;
        m.percentile50 = json.percentile50;
        m.percentile90 = json.percentile90;
        m.percentile95 = json.percentile95;
        m.percentile99 = json.percentile99;
        m.missedVsync = json.missedVsync;
      }
    } catch { /* ignore */ }

    try {
      const resp = await fetch(`/api/adb-helper/perf-battery?deviceId=${encodeURIComponent(deviceId)}&package=${encodeURIComponent(pkg)}`);
      const json = await resp.json();
      if (json.status === "ok") {
        m.batteryLevel = json.level;
        m.temperature = json.temperature;
        m.currentNow = json.currentNow;
      }
    } catch { /* ignore */ }

    try {
      const resp = await fetch(`/api/adb-helper/perf-storage-io?deviceId=${encodeURIComponent(deviceId)}&package=${encodeURIComponent(pkg)}`);
      const json = await resp.json();
      if (json.status === "ok") {
        m.readBytes = json.readBytes;
        m.writeBytes = json.writeBytes;
      }
    } catch { /* ignore */ }

    try {
      const resp = await fetch(`/api/adb-helper/perf-cpu-mem?deviceId=${encodeURIComponent(deviceId)}&package=${encodeURIComponent(pkg)}`);
      const json = await resp.json();
      if (json.status === "ok") {
        m.cpuPercent = json.cpuPercent;
        m.memoryPssKb = json.totalPssKb;
      }
    } catch { /* ignore */ }

    setMetrics(m);
    setGenerating(false);
  }, [deviceId, pkg]);

  // Export functions
  const exportJSON = useCallback(() => {
    if (!metrics) return;
    const blob = new Blob([JSON.stringify(metrics, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `perf-report-${pkg}-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [metrics, pkg]);

  const exportCSV = useCallback(() => {
    if (!metrics) return;
    const headers = Object.keys(metrics);
    const values = Object.values(metrics).map((v) => v === null ? "" : String(v));
    const csv = headers.join(",") + "\n" + values.join(",");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `perf-report-${pkg}-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [metrics, pkg]);

  // Baseline functions
  const saveAsBaseline = useCallback(async () => {
    if (!metrics || !baselineName) return;
    const baseline: Baseline = {
      id: Date.now().toString(36),
      name: baselineName,
      package: pkg,
      metrics,
      createdAt: Date.now(),
    };
    const updated = [...baselines, baseline];
    setBaselines(updated);
    setShowSaveBaseline(false);
    setBaselineName("");
    await fetch("/api/adb-helper/perf-baselines-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baselines: updated }),
    });
  }, [metrics, baselineName, pkg, baselines]);

  const deleteBaseline = useCallback(async (id: string) => {
    const updated = baselines.filter((b) => b.id !== id);
    setBaselines(updated);
    await fetch("/api/adb-helper/perf-baselines-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baselines: updated }),
    });
  }, [baselines]);

  const compareBaseline = baselines.find((b) => b.id === selectedBaseline) ?? null;

  const formatBytes = (b: number | null) => {
    if (b === null) return "N/A";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(2)} MB`;
  };

  // Comparison helper: returns delta string and color class
  const compare = (current: number | null, baseline: number | null, lowerIsBetter = true): { delta: string; cls: string } => {
    if (current === null || baseline === null) return { delta: "", cls: "" };
    const diff = current - baseline;
    const pct = baseline !== 0 ? ((diff / Math.abs(baseline)) * 100).toFixed(1) : "∞";
    const improved = lowerIsBetter ? diff < 0 : diff > 0;
    const worsened = lowerIsBetter ? diff > 0 : diff < 0;
    const sign = diff > 0 ? "+" : "";
    return {
      delta: `${sign}${diff.toFixed(1)} (${sign}${pct}%)`,
      cls: improved ? "perf-cmp-good" : worsened ? "perf-cmp-bad" : "perf-cmp-neutral",
    };
  };

  return (
    <div className="perf-panel-content">
      <div className="perf-controls">
        <PackageSelector deviceId={deviceId} value={pkg} onChange={setPkg} disabled={generating} />
        <button className="perf-btn perf-btn-primary" onClick={generateReport} disabled={generating || !deviceId || !pkg}>
          {generating ? "采集中..." : "采集数据"}
        </button>
        {metrics && (
          <>
            <button className="perf-btn perf-btn-outline" onClick={exportJSON}>导出 JSON</button>
            <button className="perf-btn perf-btn-outline" onClick={exportCSV}>导出 CSV</button>
            <button className="perf-btn perf-btn-outline" onClick={() => setShowSaveBaseline(true)}>保存为基线</button>
          </>
        )}
      </div>

      {/* Baseline selector */}
      {baselines.length > 0 && (
        <div className="perf-baseline-selector">
          <label className="perf-label-inline">
            对比基线：
            <select className="perf-select" value={selectedBaseline} onChange={(e) => setSelectedBaseline(e.target.value)}>
              <option value="">不对比</option>
              {baselines.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.package}) — {new Date(b.createdAt).toLocaleDateString()}</option>
              ))}
            </select>
          </label>
          {selectedBaseline && (
            <button className="perf-btn-icon" onClick={() => deleteBaseline(selectedBaseline)} title="删除此基线">🗑</button>
          )}
        </div>
      )}

      {/* Save baseline dialog */}
      {showSaveBaseline && (
        <div className="perf-baseline-save">
          <input className="perf-input" placeholder="基线名称（如: v1.0 初始版本）" value={baselineName} onChange={(e) => setBaselineName(e.target.value)} autoFocus />
          <button className="perf-btn perf-btn-primary" onClick={saveAsBaseline} disabled={!baselineName}>保存</button>
          <button className="perf-btn perf-btn-outline" onClick={() => setShowSaveBaseline(false)}>取消</button>
        </div>
      )}

      {/* Report table with optional comparison */}
      {metrics && (
        <div className="perf-report">
          <h3>📊 性能报告 — {pkg}</h3>
          <p className="perf-report-time">采集时间: {new Date(metrics.timestamp).toLocaleString()}</p>

          <table className="perf-table perf-report-table">
            <thead>
              <tr>
                <th>指标</th>
                <th>当前值</th>
                {compareBaseline && <th>基线 ({compareBaseline.name})</th>}
                {compareBaseline && <th>差异</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>总帧数</td>
                <td>{metrics.totalFrames ?? "N/A"}</td>
                {compareBaseline && <td>{compareBaseline.metrics.totalFrames ?? "N/A"}</td>}
                {compareBaseline && <td></td>}
              </tr>
              <tr>
                <td>卡顿帧</td>
                <td>{metrics.jankyFrames ?? "N/A"}</td>
                {compareBaseline && <td>{compareBaseline.metrics.jankyFrames ?? "N/A"}</td>}
                {compareBaseline && (() => { const c = compare(metrics.jankyFrames, compareBaseline.metrics.jankyFrames, true); return <td className={c.cls}>{c.delta}</td>; })()}
              </tr>
              <tr>
                <td>卡顿率</td>
                <td>{metrics.jankyPercent !== null ? `${metrics.jankyPercent}%` : "N/A"}</td>
                {compareBaseline && <td>{compareBaseline.metrics.jankyPercent !== null ? `${compareBaseline.metrics.jankyPercent}%` : "N/A"}</td>}
                {compareBaseline && (() => { const c = compare(metrics.jankyPercent, compareBaseline.metrics.jankyPercent, true); return <td className={c.cls}>{c.delta}</td>; })()}
              </tr>
              <tr>
                <td>P50 帧耗时</td>
                <td>{metrics.percentile50 !== null ? `${metrics.percentile50} ms` : "N/A"}</td>
                {compareBaseline && <td>{compareBaseline.metrics.percentile50 !== null ? `${compareBaseline.metrics.percentile50} ms` : "N/A"}</td>}
                {compareBaseline && (() => { const c = compare(metrics.percentile50, compareBaseline.metrics.percentile50, true); return <td className={c.cls}>{c.delta}</td>; })()}
              </tr>
              <tr>
                <td>P90 帧耗时</td>
                <td>{metrics.percentile90 !== null ? `${metrics.percentile90} ms` : "N/A"}</td>
                {compareBaseline && <td>{compareBaseline.metrics.percentile90 !== null ? `${compareBaseline.metrics.percentile90} ms` : "N/A"}</td>}
                {compareBaseline && (() => { const c = compare(metrics.percentile90, compareBaseline.metrics.percentile90, true); return <td className={c.cls}>{c.delta}</td>; })()}
              </tr>
              <tr>
                <td>P99 帧耗时</td>
                <td>{metrics.percentile99 !== null ? `${metrics.percentile99} ms` : "N/A"}</td>
                {compareBaseline && <td>{compareBaseline.metrics.percentile99 !== null ? `${compareBaseline.metrics.percentile99} ms` : "N/A"}</td>}
                {compareBaseline && (() => { const c = compare(metrics.percentile99, compareBaseline.metrics.percentile99, true); return <td className={c.cls}>{c.delta}</td>; })()}
              </tr>
              <tr>
                <td>丢失 VSync</td>
                <td>{metrics.missedVsync ?? "N/A"}</td>
                {compareBaseline && <td>{compareBaseline.metrics.missedVsync ?? "N/A"}</td>}
                {compareBaseline && (() => { const c = compare(metrics.missedVsync, compareBaseline.metrics.missedVsync, true); return <td className={c.cls}>{c.delta}</td>; })()}
              </tr>
              <tr>
                <td>CPU 使用率</td>
                <td>{metrics.cpuPercent !== null ? `${metrics.cpuPercent}%` : "N/A"}</td>
                {compareBaseline && <td>{compareBaseline.metrics.cpuPercent !== null ? `${compareBaseline.metrics.cpuPercent}%` : "N/A"}</td>}
                {compareBaseline && (() => { const c = compare(metrics.cpuPercent, compareBaseline.metrics.cpuPercent, true); return <td className={c.cls}>{c.delta}</td>; })()}
              </tr>
              <tr>
                <td>内存 (PSS)</td>
                <td>{metrics.memoryPssKb !== null ? `${Math.round(metrics.memoryPssKb / 1024)} MB` : "N/A"}</td>
                {compareBaseline && <td>{compareBaseline.metrics.memoryPssKb !== null ? `${Math.round(compareBaseline.metrics.memoryPssKb / 1024)} MB` : "N/A"}</td>}
                {compareBaseline && (() => { const c = compare(metrics.memoryPssKb, compareBaseline.metrics.memoryPssKb, true); return <td className={c.cls}>{c.delta}</td>; })()}
              </tr>
              <tr>
                <td>电量</td>
                <td>{metrics.batteryLevel !== null ? `${metrics.batteryLevel}%` : "N/A"}</td>
                {compareBaseline && <td>{compareBaseline.metrics.batteryLevel !== null ? `${compareBaseline.metrics.batteryLevel}%` : "N/A"}</td>}
                {compareBaseline && <td></td>}
              </tr>
              <tr>
                <td>温度</td>
                <td>{metrics.temperature !== null ? `${metrics.temperature}°C` : "N/A"}</td>
                {compareBaseline && <td>{compareBaseline.metrics.temperature !== null ? `${compareBaseline.metrics.temperature}°C` : "N/A"}</td>}
                {compareBaseline && (() => { const c = compare(metrics.temperature, compareBaseline.metrics.temperature, true); return <td className={c.cls}>{c.delta}</td>; })()}
              </tr>
              <tr>
                <td>存储读取</td>
                <td>{formatBytes(metrics.readBytes)}</td>
                {compareBaseline && <td>{formatBytes(compareBaseline.metrics.readBytes)}</td>}
                {compareBaseline && <td></td>}
              </tr>
              <tr>
                <td>存储写入</td>
                <td>{formatBytes(metrics.writeBytes)}</td>
                {compareBaseline && <td>{formatBytes(compareBaseline.metrics.writeBytes)}</td>}
                {compareBaseline && <td></td>}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {!metrics && !generating && (
        <p className="perf-empty-hint">选择应用后点击"采集数据"获取综合性能指标，可导出或保存为基线</p>
      )}
    </div>
  );
}

// ─── Scenario Panel ─────────────────────────────────────────────────────────────

interface ScenarioStep {
  id: string;
  type: "start-app" | "wait" | "monkey" | "collect-metrics" | "shell-cmd";
  params: Record<string, string | number>;
}

interface Scenario {
  id: string;
  name: string;
  package: string;
  steps: ScenarioStep[];
  createdAt: number;
}

function ScenarioPanel({ deviceId }: { deviceId: string | null }) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null);
  const [running, setRunning] = useState(false);
  const [runLog, setRunLog] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load scenarios
  useEffect(() => {
    if (loaded) return;
    fetch("/api/adb-helper/perf-scenarios-load")
      .then((r) => r.json())
      .then((d) => { if (d.status === "ok") setScenarios(d.scenarios ?? []); })
      .catch(() => {});
    setLoaded(true);
  }, [loaded]);

  const saveScenarios = useCallback(async (updated: Scenario[]) => {
    setScenarios(updated);
    await fetch("/api/adb-helper/perf-scenarios-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarios: updated }),
    });
  }, []);

  const createScenario = useCallback(() => {
    const newScenario: Scenario = {
      id: Date.now().toString(36),
      name: "新场景",
      package: "",
      steps: [],
      createdAt: Date.now(),
    };
    setEditingScenario(newScenario);
  }, []);

  const addStep = useCallback((type: ScenarioStep["type"]) => {
    if (!editingScenario) return;
    const step: ScenarioStep = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type,
      params: type === "wait" ? { seconds: 3 } : type === "monkey" ? { events: 1000, throttle: 300 } : type === "shell-cmd" ? { cmd: "" } : {},
    };
    setEditingScenario({ ...editingScenario, steps: [...editingScenario.steps, step] });
  }, [editingScenario]);

  const removeStep = useCallback((stepId: string) => {
    if (!editingScenario) return;
    setEditingScenario({ ...editingScenario, steps: editingScenario.steps.filter((s) => s.id !== stepId) });
  }, [editingScenario]);

  const updateStepParam = useCallback((stepId: string, key: string, value: string | number) => {
    if (!editingScenario) return;
    setEditingScenario({
      ...editingScenario,
      steps: editingScenario.steps.map((s) => s.id === stepId ? { ...s, params: { ...s.params, [key]: value } } : s),
    });
  }, [editingScenario]);

  const saveCurrentScenario = useCallback(() => {
    if (!editingScenario) return;
    const existing = scenarios.findIndex((s) => s.id === editingScenario.id);
    const updated = existing >= 0
      ? scenarios.map((s) => s.id === editingScenario.id ? editingScenario : s)
      : [...scenarios, editingScenario];
    saveScenarios(updated);
    setEditingScenario(null);
  }, [editingScenario, scenarios, saveScenarios]);

  const deleteScenario = useCallback((id: string) => {
    saveScenarios(scenarios.filter((s) => s.id !== id));
  }, [scenarios, saveScenarios]);

  const runScenario = useCallback(async (scenario: Scenario) => {
    if (!deviceId) return;
    setRunning(true);
    setRunLog([`▶ 开始执行场景: ${scenario.name}`]);
    const pkg = scenario.package;

    for (const step of scenario.steps) {
      if (!running && runLog.length > 1) break; // Allow first step to run
      const stepLabel = step.type === "start-app" ? "启动应用" : step.type === "wait" ? "等待" : step.type === "monkey" ? "Monkey" : step.type === "collect-metrics" ? "采集指标" : "Shell 命令";
      setRunLog((prev) => [...prev, `  ⏳ ${stepLabel}...`]);

      try {
        if (step.type === "start-app") {
          await fetch(`/api/adb-helper/perf-startup?deviceId=${encodeURIComponent(deviceId)}&package=${encodeURIComponent(pkg)}&type=cold`);
          setRunLog((prev) => [...prev, `  ✓ 应用已启动`]);
        } else if (step.type === "wait") {
          const sec = Number(step.params.seconds) || 3;
          await new Promise((r) => setTimeout(r, sec * 1000));
          setRunLog((prev) => [...prev, `  ✓ 等待 ${sec}s 完成`]);
        } else if (step.type === "monkey") {
          const events = Number(step.params.events) || 1000;
          const throttle = Number(step.params.throttle) || 300;
          setRunLog((prev) => [...prev, `  ⏳ Monkey 测试 ${events} 事件...`]);
          await fetch(`/api/adb-helper/monkey-start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId, packages: [pkg], eventCount: events, throttle }),
          });
          // Wait for monkey to likely finish
          await new Promise((r) => setTimeout(r, Math.min(events * throttle / 1000 * 1.2, 60000)));
          setRunLog((prev) => [...prev, `  ✓ Monkey 完成`]);
        } else if (step.type === "collect-metrics") {
          const gpuResp = await fetch(`/api/adb-helper/perf-gpu?deviceId=${encodeURIComponent(deviceId)}&package=${encodeURIComponent(pkg)}`);
          const gpuJson = await gpuResp.json();
          const janky = gpuJson.jankyFrames ?? "N/A";
          const total = gpuJson.totalFrames ?? "N/A";
          setRunLog((prev) => [...prev, `  ✓ 帧数: ${total}, 卡顿: ${janky}`]);
        } else if (step.type === "shell-cmd") {
          const cmd = String(step.params.cmd || "echo done");
          // Execute via adb shell - sanitize command
          const { stdout } = await fetch(`/api/adb-helper/perf-shell?deviceId=${encodeURIComponent(deviceId)}&cmd=${encodeURIComponent(cmd)}`).then(r => r.json()).catch(() => ({ stdout: "" }));
          setRunLog((prev) => [...prev, `  ✓ 命令完成: ${(stdout || "").slice(0, 100)}`]);
        }
      } catch (err) {
        setRunLog((prev) => [...prev, `  ✗ 步骤失败: ${err}`]);
      }
    }

    setRunLog((prev) => [...prev, `✔ 场景执行完毕`]);
    setRunning(false);
  }, [deviceId, running, runLog.length]);

  const stepTypeLabel = (type: ScenarioStep["type"]) => {
    switch (type) {
      case "start-app": return "🚀 启动应用";
      case "wait": return "⏱ 等待";
      case "monkey": return "🐵 Monkey 测试";
      case "collect-metrics": return "📊 采集指标";
      case "shell-cmd": return "💻 Shell 命令";
    }
  };

  return (
    <div className="perf-panel-content">
      {/* Scenario editor */}
      {editingScenario ? (
        <div className="perf-scenario-editor">
          <div className="perf-controls">
            <input
              className="perf-input"
              placeholder="场景名称"
              value={editingScenario.name}
              onChange={(e) => setEditingScenario({ ...editingScenario, name: e.target.value })}
            />
            <PackageSelector deviceId={deviceId} value={editingScenario.package} onChange={(v) => setEditingScenario({ ...editingScenario, package: v })} />
          </div>

          <div className="perf-scenario-steps">
            <h4>步骤列表</h4>
            {editingScenario.steps.length === 0 && <p className="perf-empty-hint" style={{ marginTop: 8 }}>暂无步骤，请添加</p>}
            {editingScenario.steps.map((step, idx) => (
              <div key={step.id} className="perf-scenario-step">
                <span className="perf-step-num">{idx + 1}</span>
                <span className="perf-step-type">{stepTypeLabel(step.type)}</span>
                <div className="perf-step-params">
                  {step.type === "wait" && (
                    <input type="number" className="perf-input-number" value={step.params.seconds ?? 3} onChange={(e) => updateStepParam(step.id, "seconds", Number(e.target.value))} min={1} max={300} />
                  )}
                  {step.type === "wait" && <span className="perf-step-unit">秒</span>}
                  {step.type === "monkey" && (
                    <>
                      <input type="number" className="perf-input-number" value={step.params.events ?? 1000} onChange={(e) => updateStepParam(step.id, "events", Number(e.target.value))} min={1} />
                      <span className="perf-step-unit">事件</span>
                      <input type="number" className="perf-input-number" value={step.params.throttle ?? 300} onChange={(e) => updateStepParam(step.id, "throttle", Number(e.target.value))} min={0} />
                      <span className="perf-step-unit">ms间隔</span>
                    </>
                  )}
                  {step.type === "shell-cmd" && (
                    <input type="text" className="perf-input" placeholder="adb shell 命令" value={step.params.cmd ?? ""} onChange={(e) => updateStepParam(step.id, "cmd", e.target.value)} style={{ flex: 1 }} />
                  )}
                </div>
                <button className="perf-btn-icon" onClick={() => removeStep(step.id)} title="删除">✕</button>
              </div>
            ))}
          </div>

          <div className="perf-scenario-actions">
            <span className="perf-scenario-add-label">添加步骤：</span>
            <button className="perf-btn perf-btn-sm" onClick={() => addStep("start-app")}>启动应用</button>
            <button className="perf-btn perf-btn-sm" onClick={() => addStep("wait")}>等待</button>
            <button className="perf-btn perf-btn-sm" onClick={() => addStep("monkey")}>Monkey</button>
            <button className="perf-btn perf-btn-sm" onClick={() => addStep("collect-metrics")}>采集指标</button>
            <button className="perf-btn perf-btn-sm" onClick={() => addStep("shell-cmd")}>Shell 命令</button>
          </div>

          <div className="perf-controls" style={{ marginTop: 12 }}>
            <button className="perf-btn perf-btn-primary" onClick={saveCurrentScenario} disabled={!editingScenario.name || !editingScenario.package}>保存场景</button>
            <button className="perf-btn perf-btn-outline" onClick={() => setEditingScenario(null)}>取消</button>
          </div>
        </div>
      ) : (
        <>
          <div className="perf-controls">
            <button className="perf-btn perf-btn-primary" onClick={createScenario}>新建场景</button>
          </div>

          {/* Scenario list */}
          {scenarios.length === 0 && !running && (
            <p className="perf-empty-hint">暂无保存的场景，点击"新建场景"创建测试流程</p>
          )}

          <div className="perf-scenario-list">
            {scenarios.map((s) => (
              <div key={s.id} className="perf-scenario-card">
                <div className="perf-scenario-card-header">
                  <h4>{s.name}</h4>
                  <span className="perf-scenario-pkg">{s.package}</span>
                </div>
                <div className="perf-scenario-card-steps">
                  {s.steps.map((step, i) => (
                    <span key={step.id} className="perf-scenario-step-badge">{i + 1}. {stepTypeLabel(step.type)}</span>
                  ))}
                </div>
                <div className="perf-scenario-card-actions">
                  <button className="perf-btn perf-btn-sm perf-btn-primary" onClick={() => runScenario(s)} disabled={running || !deviceId}>执行</button>
                  <button className="perf-btn perf-btn-sm perf-btn-outline" onClick={() => setEditingScenario({ ...s })}>编辑</button>
                  <button className="perf-btn perf-btn-sm perf-btn-danger" onClick={() => deleteScenario(s.id)}>删除</button>
                </div>
              </div>
            ))}
          </div>

          {/* Run log */}
          {runLog.length > 0 && (
            <div className="perf-chart-area" style={{ marginTop: 16 }}>
              <h4>执行日志</h4>
              <pre className="perf-raw-output">{runLog.join("\n")}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Alert Panel ────────────────────────────────────────────────────────────────

interface AlertThresholds {
  cpuMax: number;
  memMaxMb: number;
  fpsMin: number;
  tempMax: number;
}

interface AlertEntry {
  id: string;
  time: number;
  type: "crash" | "anr" | "cpu" | "memory" | "fps" | "temperature";
  message: string;
  severity: "critical" | "warning" | "info";
}

function AlertPanel({ deviceId }: { deviceId: string | null }) {
  const [pkg, setPkg] = useState("");
  const [monitoring, setMonitoring] = useState(false);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [thresholds, setThresholds] = useState<AlertThresholds>({ cpuMax: 80, memMaxMb: 512, fpsMin: 30, tempMax: 42 });
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const checkAlerts = useCallback(async () => {
    if (!deviceId) return;
    const newAlerts: AlertEntry[] = [];
    const ts = Date.now();

    // Check crash/ANR
    try {
      const params = new URLSearchParams({ deviceId });
      if (pkg) params.set("package", pkg);
      const resp = await fetch(`/api/adb-helper/perf-alert-check?${params}`);
      const json = await resp.json();
      if (json.status === "ok") {
        if (json.crashes?.length > 0) {
          newAlerts.push({
            id: `crash-${ts}`,
            time: ts,
            type: "crash",
            message: `检测到 ${json.crashes.length} 条崩溃日志`,
            severity: "critical",
          });
        }
        if (json.anrs?.length > 0) {
          newAlerts.push({
            id: `anr-${ts}`,
            time: ts,
            type: "anr",
            message: `检测到 ${json.anrs.length} 条 ANR 记录`,
            severity: "critical",
          });
        }
      }
    } catch { /* ignore */ }

    // Check CPU/Memory
    if (pkg) {
      try {
        const resp = await fetch(`/api/adb-helper/perf-cpu-mem?deviceId=${encodeURIComponent(deviceId)}&package=${encodeURIComponent(pkg)}`);
        const json = await resp.json();
        if (json.status === "ok") {
          if (json.cpuPercent !== null && json.cpuPercent > thresholds.cpuMax) {
            newAlerts.push({
              id: `cpu-${ts}`,
              time: ts,
              type: "cpu",
              message: `CPU 使用率 ${json.cpuPercent}% 超过阈值 ${thresholds.cpuMax}%`,
              severity: "warning",
            });
          }
          if (json.totalPssKb !== null && json.totalPssKb / 1024 > thresholds.memMaxMb) {
            newAlerts.push({
              id: `mem-${ts}`,
              time: ts,
              type: "memory",
              message: `内存 ${Math.round(json.totalPssKb / 1024)} MB 超过阈值 ${thresholds.memMaxMb} MB`,
              severity: "warning",
            });
          }
        }
      } catch { /* ignore */ }
    }

    // Check battery temperature
    try {
      const resp = await fetch(`/api/adb-helper/perf-battery?deviceId=${encodeURIComponent(deviceId)}`);
      const json = await resp.json();
      if (json.status === "ok" && json.temperature !== null && json.temperature > thresholds.tempMax) {
        newAlerts.push({
          id: `temp-${ts}`,
          time: ts,
          type: "temperature",
          message: `设备温度 ${json.temperature}°C 超过阈值 ${thresholds.tempMax}°C`,
          severity: "warning",
        });
      }
    } catch { /* ignore */ }

    if (newAlerts.length > 0) {
      setAlerts((prev) => [...newAlerts, ...prev].slice(0, 200));
    }
  }, [deviceId, pkg, thresholds]);

  const startMonitoring = useCallback(() => {
    startTimeRef.current = Date.now();
    setMonitoring(true);
    checkAlerts();
    intervalRef.current = window.setInterval(checkAlerts, 10000); // Every 10s
  }, [checkAlerts]);

  const stopMonitoring = useCallback(() => {
    setMonitoring(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  useEffect(() => { return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }, []);

  const severityIcon = (s: AlertEntry["severity"]) => s === "critical" ? "🔴" : s === "warning" ? "🟡" : "🔵";
  const typeLabel = (t: AlertEntry["type"]) => {
    switch (t) {
      case "crash": return "崩溃";
      case "anr": return "ANR";
      case "cpu": return "CPU";
      case "memory": return "内存";
      case "fps": return "帧率";
      case "temperature": return "温度";
    }
  };

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;

  return (
    <div className="perf-panel-content">
      <div className="perf-controls">
        <PackageSelector deviceId={deviceId} value={pkg} onChange={setPkg} disabled={monitoring} />
        {!monitoring ? (
          <button className="perf-btn perf-btn-primary" onClick={startMonitoring} disabled={!deviceId}>开始监控</button>
        ) : (
          <button className="perf-btn perf-btn-danger" onClick={stopMonitoring}>停止监控</button>
        )}
        <button className="perf-btn perf-btn-outline" onClick={() => setAlerts([])} disabled={alerts.length === 0}>清空告警</button>
      </div>

      {/* Threshold config */}
      <div className="perf-alert-thresholds">
        <h4>告警阈值</h4>
        <div className="perf-threshold-grid">
          <label className="perf-threshold-item">
            <span>CPU 上限</span>
            <input type="number" className="perf-input-number" value={thresholds.cpuMax} onChange={(e) => setThresholds({ ...thresholds, cpuMax: Number(e.target.value) })} disabled={monitoring} />
            <span>%</span>
          </label>
          <label className="perf-threshold-item">
            <span>内存上限</span>
            <input type="number" className="perf-input-number" value={thresholds.memMaxMb} onChange={(e) => setThresholds({ ...thresholds, memMaxMb: Number(e.target.value) })} disabled={monitoring} />
            <span>MB</span>
          </label>
          <label className="perf-threshold-item">
            <span>帧率下限</span>
            <input type="number" className="perf-input-number" value={thresholds.fpsMin} onChange={(e) => setThresholds({ ...thresholds, fpsMin: Number(e.target.value) })} disabled={monitoring} />
            <span>FPS</span>
          </label>
          <label className="perf-threshold-item">
            <span>温度上限</span>
            <input type="number" className="perf-input-number" value={thresholds.tempMax} onChange={(e) => setThresholds({ ...thresholds, tempMax: Number(e.target.value) })} disabled={monitoring} />
            <span>°C</span>
          </label>
        </div>
      </div>

      {/* Summary */}
      {alerts.length > 0 && (
        <div className="perf-stats-row">
          <div className="perf-stat-card perf-stat-danger">
            <span className="perf-stat-label">严重告警</span>
            <span className="perf-stat-value">{criticalCount}</span>
          </div>
          <div className="perf-stat-card perf-stat-warn">
            <span className="perf-stat-label">警告</span>
            <span className="perf-stat-value">{warningCount}</span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-stat-label">总计</span>
            <span className="perf-stat-value">{alerts.length}</span>
          </div>
        </div>
      )}

      {/* Alert list */}
      {alerts.length > 0 ? (
        <div className="perf-alert-list">
          {alerts.slice(0, 50).map((alert) => (
            <div key={alert.id} className={`perf-alert-item perf-alert-${alert.severity}`}>
              <span className="perf-alert-icon">{severityIcon(alert.severity)}</span>
              <span className="perf-alert-type">{typeLabel(alert.type)}</span>
              <span className="perf-alert-msg">{alert.message}</span>
              <span className="perf-alert-time">{new Date(alert.time).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="perf-empty-hint">{monitoring ? "监控中，暂无异常..." : "点击「开始监控」启动异常检测"}</p>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function PerformancePage({ currentDeviceId }: { currentDeviceId: string | null }) {
  const [activeTab, setActiveTab] = useState<PerfTab>("fps");

  const activeTabItem = PERF_TABS.find((t) => t.id === activeTab)!;

  function renderPanel() {
    switch (activeTab) {
      case "fps":
        return <FpsPanel deviceId={currentDeviceId} />;
      case "startup":
        return <StartupPanel deviceId={currentDeviceId} />;
      case "cpu":
      case "memory":
        return <CpuMemPanel deviceId={currentDeviceId} />;
      case "traffic":
        return <TrafficPanel deviceId={currentDeviceId} />;
      case "battery":
        return <BatteryPanel deviceId={currentDeviceId} />;
      case "gpu":
        return <GpuPanel deviceId={currentDeviceId} />;
      case "storage":
        return <StoragePanel deviceId={currentDeviceId} />;
      case "report":
        return <ReportPanel deviceId={currentDeviceId} />;
      case "scenario":
        return <ScenarioPanel deviceId={currentDeviceId} />;
      case "alert":
        return <AlertPanel deviceId={currentDeviceId} />;
      default:
        return <PlaceholderPanel tab={activeTabItem} />;
    }
  }

  return (
    <div className="page-shell perf-page">
      {/* Tab bar */}
      <nav className="perf-tab-bar">
        {PERF_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`perf-tab-btn ${activeTab === tab.id ? "perf-tab-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            title={tab.description}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="perf-content">
        {renderPanel()}
      </div>
    </div>
  );
}

