import { Fragment, useRef, useState } from "react";

type DumpsysTab = "performance" | "battery" | "launch" | "activity" | "window" | "display" | "input" | "power" | "SurfaceFlinger" | "meminfo" | "cpuinfo" | "package" | "connectivity" | "wifi" | "bluetooth_manager" | "audio" | "usb" | "notification" | "procstats" | "alarm";

interface RuntimeApi {
  command: {
    run: (payload: { deviceId: string; deviceName?: string; commandId: string; commandTitle?: string; rawCommand?: string; args: string[]; source?: string }) => Promise<unknown>;
  };
}

interface DumpsysPageProps {
  currentDeviceId: string | null;
  runtimeApi: RuntimeApi;
}

export default function DumpsysPage({ currentDeviceId, runtimeApi }: DumpsysPageProps) {
  const [dumpsysTab, setDumpsysTab] = useState<DumpsysTab>("performance");
  const [dumpsysRunning, setDumpsysRunning] = useState(false);
  const [dumpsysOutput, setDumpsysOutput] = useState<string | null>(null);
  const [dumpsysPerfSampling, setDumpsysPerfSampling] = useState(false);
  const [dumpsysPerfData, setDumpsysPerfData] = useState<Array<{ ts: number; cpu: number; mem: number; fps: number }>>([]);
  const [dumpsysBattery, setDumpsysBattery] = useState<Record<string, string> | null>(null);
  const [dumpsysLaunchPackage, setDumpsysLaunchPackage] = useState("");
  const [dumpsysLaunchActivity, setDumpsysLaunchActivity] = useState("");
  const [dumpsysLaunchResult, setDumpsysLaunchResult] = useState<{ thisTime?: string; totalTime?: string; waitTime?: string } | null>(null);
  const [dumpsysLaunchRunning, setDumpsysLaunchRunning] = useState(false);
  const [dumpsysSubTab, setDumpsysSubTab] = useState<"visual" | "raw">("visual");
  const [dumpsysSearch, setDumpsysSearch] = useState("");
  const [dumpsysSearchIdx, setDumpsysSearchIdx] = useState(0);
  const dumpsysPerfIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  return (
    <main className="page-shell">
      <section className="panel page-panel info-page-panel">
        <div className="device-info-layout" style={{ flex: 1, minHeight: 0 }}>
          <nav className="device-info-sidebar">
            <button className={`device-info-tab ${dumpsysTab === "performance" ? "active" : ""}`} onClick={() => { setDumpsysTab("performance"); setDumpsysSubTab("visual"); }}><strong>性能监控</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "battery" ? "active" : ""}`} onClick={() => { setDumpsysTab("battery"); setDumpsysSubTab("visual"); }}><strong>电池状态</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "launch" ? "active" : ""}`} onClick={() => { setDumpsysTab("launch"); setDumpsysSubTab("visual"); }}><strong>启动性能</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "activity" ? "active" : ""}`} onClick={() => { setDumpsysTab("activity"); setDumpsysOutput(null); }}><strong>Activity</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "window" ? "active" : ""}`} onClick={() => { setDumpsysTab("window"); setDumpsysOutput(null); }}><strong>Window</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "display" ? "active" : ""}`} onClick={() => { setDumpsysTab("display"); setDumpsysOutput(null); }}><strong>Display</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "input" ? "active" : ""}`} onClick={() => { setDumpsysTab("input"); setDumpsysOutput(null); }}><strong>Input</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "power" ? "active" : ""}`} onClick={() => { setDumpsysTab("power"); setDumpsysOutput(null); }}><strong>Power</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "meminfo" ? "active" : ""}`} onClick={() => { setDumpsysTab("meminfo"); setDumpsysOutput(null); }}><strong>Meminfo</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "cpuinfo" ? "active" : ""}`} onClick={() => { setDumpsysTab("cpuinfo"); setDumpsysOutput(null); }}><strong>CPU Info</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "package" ? "active" : ""}`} onClick={() => { setDumpsysTab("package"); setDumpsysOutput(null); }}><strong>Package</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "SurfaceFlinger" ? "active" : ""}`} onClick={() => { setDumpsysTab("SurfaceFlinger"); setDumpsysOutput(null); }}><strong>SurfaceFlinger</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "connectivity" ? "active" : ""}`} onClick={() => { setDumpsysTab("connectivity"); setDumpsysOutput(null); }}><strong>网络</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "wifi" ? "active" : ""}`} onClick={() => { setDumpsysTab("wifi"); setDumpsysOutput(null); }}><strong>WiFi</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "bluetooth_manager" ? "active" : ""}`} onClick={() => { setDumpsysTab("bluetooth_manager"); setDumpsysOutput(null); }}><strong>蓝牙</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "audio" ? "active" : ""}`} onClick={() => { setDumpsysTab("audio"); setDumpsysOutput(null); }}><strong>音频</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "usb" ? "active" : ""}`} onClick={() => { setDumpsysTab("usb"); setDumpsysOutput(null); }}><strong>USB</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "notification" ? "active" : ""}`} onClick={() => { setDumpsysTab("notification"); setDumpsysOutput(null); }}><strong>通知</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "alarm" ? "active" : ""}`} onClick={() => { setDumpsysTab("alarm"); setDumpsysOutput(null); }}><strong>Alarm</strong></button>
            <button className={`device-info-tab ${dumpsysTab === "procstats" ? "active" : ""}`} onClick={() => { setDumpsysTab("procstats"); setDumpsysOutput(null); }}><strong>进程统计</strong></button>
          </nav>
          <div className="device-info-content" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>

            {dumpsysTab === "performance" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="chip-row">
                  <button className={`chip ${dumpsysSubTab === "visual" ? "active" : ""}`} onClick={() => setDumpsysSubTab("visual")}>可视化</button>
                  <button className={`chip ${dumpsysSubTab === "raw" ? "active" : ""}`} onClick={() => setDumpsysSubTab("raw")}>原始数据</button>
                </div>
                {dumpsysSubTab === "visual" ? (
                <><div className="logcat-capture-actions">
                  <button
                    className={dumpsysPerfSampling ? "danger-button" : "primary-button"}
                    disabled={!currentDeviceId}
                    onClick={() => {
                      if (dumpsysPerfSampling) {
                        if (dumpsysPerfIntervalRef.current) { clearInterval(dumpsysPerfIntervalRef.current); dumpsysPerfIntervalRef.current = null; }
                        setDumpsysPerfSampling(false);
                      } else {
                        setDumpsysPerfData([]);
                        setDumpsysPerfSampling(true);
                        const sample = async () => {
                          if (!currentDeviceId) return;
                          try {
                            const [cpuRes, memRes, fpsRes] = await Promise.all([
                              runtimeApi.command.run({ deviceId: currentDeviceId, deviceName: "", commandId: "dumpsys-perf", commandTitle: "cpu", rawCommand: `adb -s ${currentDeviceId} shell top -b -n1 -m1`, args: [] }),
                              runtimeApi.command.run({ deviceId: currentDeviceId, deviceName: "", commandId: "dumpsys-perf", commandTitle: "mem", rawCommand: `adb -s ${currentDeviceId} shell dumpsys meminfo --status`, args: [] }),
                              runtimeApi.command.run({ deviceId: currentDeviceId, deviceName: "", commandId: "dumpsys-perf", commandTitle: "fps", rawCommand: `adb -s ${currentDeviceId} shell dumpsys gfxinfo`, args: [] }),
                            ]);
                            const cpuMatch = ((cpuRes as { stdout?: string }).stdout ?? "").match(/(\d+(?:\.\d+)?)%cpu/i);
                            const memMatch = ((memRes as { stdout?: string }).stdout ?? "").match(/Used RAM:\s*([\d,]+)/i);
                            const fpsMatch = ((fpsRes as { stdout?: string }).stdout ?? "").match(/Total frames rendered:\s*(\d+)/);
                            const cpu = cpuMatch ? parseFloat(cpuMatch[1]) : 0;
                            const mem = memMatch ? parseInt(memMatch[1].replace(/,/g, "")) / 1024 : 0;
                            const fps = fpsMatch ? parseInt(fpsMatch[1]) % 120 : 0;
                            setDumpsysPerfData((prev) => [...prev.slice(-59), { ts: Date.now(), cpu, mem, fps }]);
                          } catch { /* ignore */ }
                        };
                        void sample();
                        dumpsysPerfIntervalRef.current = setInterval(() => void sample(), 3000);
                      }
                    }}
                  >
                    {dumpsysPerfSampling ? "停止采样" : "开始采样"}
                  </button>
                  <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>每 3 秒采样一次 CPU / 内存 / FPS</span>
                </div>
                {dumpsysPerfData.length > 1 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {(["cpu", "mem", "fps"] as const).map((metric) => {
                      const data = dumpsysPerfData.map((d) => d[metric]);
                      const max = Math.max(...data, 1);
                      const h = 120; const w = 560; const padL = 50; const padR = 10; const padT = 5; const padB = 20;
                      const chartW = w - padL - padR; const chartH = h - padT - padB;
                      const points = data.map((v, i) => `${padL + (i / Math.max(data.length - 1, 1)) * chartW},${padT + chartH - (v / max) * chartH}`).join(" ");
                      const labels = { cpu: "CPU %", mem: "内存 (MB)", fps: "FPS" };
                      const colors = { cpu: "#f97316", mem: "#3b82f6", fps: "#10b981" };
                      const yTicks = [0, max * 0.25, max * 0.5, max * 0.75, max];
                      return (
                        <div key={metric} style={{ background: "var(--bg-surface-strong)", borderRadius: 8, padding: 12 }}>
                          <strong style={{ fontSize: 13, color: colors[metric] }}>{labels[metric]}</strong>
                          <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-secondary)" }}>当前: {data[data.length - 1]?.toFixed(1)} / 最大: {max.toFixed(1)}</span>
                          <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 140, marginTop: 4 }}>
                            {yTicks.map((tick, i) => {
                              const y = padT + chartH - (tick / max) * chartH;
                              return (
                                <Fragment key={i}>
                                  <line x1={padL} y1={y} x2={padL + chartW} y2={y} stroke="#e0e0e0" strokeWidth="0.5" />
                                  <text x={padL - 4} y={y + 3} fontSize="9" textAnchor="end" fill="#999">{tick.toFixed(metric === "cpu" ? 0 : 0)}</text>
                                </Fragment>
                              );
                            })}
                            <polyline fill="none" stroke={colors[metric]} strokeWidth="2" points={points} />
                            {data.map((v, i) => {
                              const cx = padL + (i / Math.max(data.length - 1, 1)) * chartW;
                              const cy = padT + chartH - (v / max) * chartH;
                              return <circle key={i} cx={cx} cy={cy} r="2.5" fill={colors[metric]} />;
                            })}
                          </svg>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="result-empty-state">点击"开始采样"实时监控设备 CPU、内存、FPS。</div>
                )}
                </>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                    <div className="logcat-capture-actions">
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>模块: top / meminfo / gfxinfo</span>
                      <button className="ghost-button compact-button" disabled={dumpsysRunning || !currentDeviceId} onClick={async () => {
                        if (!currentDeviceId) return;
                        setDumpsysRunning(true);
                        try {
                          const res = await runtimeApi.command.run({ deviceId: currentDeviceId, deviceName: "", commandId: "dumpsys-raw", commandTitle: "top+meminfo+gfxinfo", rawCommand: `adb -s ${currentDeviceId} shell "top -b -n1 -m5 && echo '---MEMINFO---' && dumpsys meminfo --status && echo '---GFXINFO---' && dumpsys gfxinfo"`, args: [] });
                          setDumpsysOutput((res as { stdout?: string }).stdout ?? "无输出");
                        } catch { setDumpsysOutput("执行失败"); } finally { setDumpsysRunning(false); }
                      }}>{dumpsysRunning ? "抓取中…" : "抓取原始数据"}</button>
                    </div>
                    {dumpsysOutput ? <pre style={{ flex: 1, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 12, background: "var(--bg-surface-strong)", padding: 12, borderRadius: 8, maxHeight: "calc(100vh - 320px)" }}>{dumpsysOutput}</pre> : <div className="result-empty-state">点击抓取查看原始 top/meminfo/gfxinfo 输出。</div>}
                  </div>
                )}
              </div>
            ) : null}

            {dumpsysTab === "battery" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="chip-row">
                  <button className={`chip ${dumpsysSubTab === "visual" ? "active" : ""}`} onClick={() => setDumpsysSubTab("visual")}>可视化</button>
                  <button className={`chip ${dumpsysSubTab === "raw" ? "active" : ""}`} onClick={() => setDumpsysSubTab("raw")}>原始数据</button>
                </div>
                {dumpsysSubTab === "visual" ? (<>
                <div className="logcat-capture-actions">
                  <button
                    className="ghost-button compact-button"
                    disabled={!currentDeviceId || dumpsysRunning}
                    onClick={async () => {
                      if (!currentDeviceId) return;
                      setDumpsysRunning(true);
                      try {
                        const res = await runtimeApi.command.run({ deviceId: currentDeviceId, deviceName: "", commandId: "dumpsys-battery", commandTitle: "battery", rawCommand: `adb -s ${currentDeviceId} shell dumpsys battery`, args: [] });
                        const stdout = (res as { stdout?: string }).stdout ?? "";
                        const pairs: Record<string, string> = {};
                        for (const line of stdout.split("\n")) {
                          const m = line.match(/^\s*(.+?):\s*(.+)/);
                          if (m) pairs[m[1].trim()] = m[2].trim();
                        }
                        setDumpsysBattery(pairs);
                        setDumpsysOutput(stdout);
                      } catch { setDumpsysBattery(null); } finally { setDumpsysRunning(false); }
                    }}
                  >
                    {dumpsysRunning ? "获取中…" : "刷新"}
                  </button>
                </div>
                {dumpsysBattery ? (() => {
                  const fieldMap: Record<string, string> = { "AC powered": "交流充电", "USB powered": "USB 充电", "Wireless powered": "无线充电", "Max charging current": "最大充电电流", "Max charging voltage": "最大充电电压", "Charge counter": "充电计数", status: "状态", health: "健康", present: "存在", level: "电量", scale: "刻度", voltage: "电压 (mV)", temperature: "温度 (°C/10)", technology: "电池技术" };
                  const entries = Object.entries(dumpsysBattery);
                  return (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
                      {entries.map(([k, v], i) => (
                        <div key={k} style={{ display: "flex", borderBottom: i < entries.length - 2 ? "1px solid var(--border-default)" : undefined, borderRight: i % 2 === 0 ? "1px solid var(--border-default)" : undefined }}>
                          <div style={{ width: 140, padding: "8px 12px", fontSize: 12, color: "var(--text-secondary)", background: "var(--bg-surface-strong)" }}>{fieldMap[k] ?? k}</div>
                          <div style={{ flex: 1, padding: "8px 12px", fontSize: 13, fontWeight: 500 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  );
                })() : (
                  <div className="result-empty-state">点击"刷新"获取电池状态。</div>
                )}
                </>) : (
                  <div>
                    {dumpsysOutput ? <pre style={{ overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 12, background: "var(--bg-surface-strong)", padding: 12, borderRadius: 8, maxHeight: "calc(100vh - 280px)" }}>{dumpsysOutput}</pre> : <div className="result-empty-state">请先在可视化 tab 点击"刷新"获取数据，再切换到此处查看原始输出。</div>}
                  </div>
                )}
              </div>
            ) : null}

            {dumpsysTab === "launch" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="chip-row">
                  <button className={`chip ${dumpsysSubTab === "visual" ? "active" : ""}`} onClick={() => setDumpsysSubTab("visual")}>可视化</button>
                  <button className={`chip ${dumpsysSubTab === "raw" ? "active" : ""}`} onClick={() => setDumpsysSubTab("raw")}>原始数据</button>
                </div>
                {dumpsysSubTab === "visual" ? (<>
                <div className="logcat-capture-actions">
                  <input value={dumpsysLaunchPackage} onChange={(e) => setDumpsysLaunchPackage(e.target.value)} placeholder="包名 (如 com.example.app)" style={{ width: 240 }} />
                  <input value={dumpsysLaunchActivity} onChange={(e) => setDumpsysLaunchActivity(e.target.value)} placeholder="Activity (如 .MainActivity)" style={{ width: 200 }} />
                  <button
                    className="primary-button"
                    disabled={!currentDeviceId || !dumpsysLaunchPackage.trim() || !dumpsysLaunchActivity.trim() || dumpsysLaunchRunning}
                    onClick={async () => {
                      if (!currentDeviceId) return;
                      setDumpsysLaunchRunning(true);
                      setDumpsysLaunchResult(null);
                      try {
                        const component = `${dumpsysLaunchPackage.trim()}/${dumpsysLaunchActivity.trim()}`;
                        const res = await runtimeApi.command.run({ deviceId: currentDeviceId, deviceName: "", commandId: "am-start", commandTitle: `启动 ${component}`, rawCommand: `adb -s ${currentDeviceId} shell am start -W ${component}`, args: [] });
                        const stdout = (res as { stdout?: string }).stdout ?? "";
                        const thisTime = stdout.match(/ThisTime:\s*(\d+)/)?.[1];
                        const totalTime = stdout.match(/TotalTime:\s*(\d+)/)?.[1];
                        const waitTime = stdout.match(/WaitTime:\s*(\d+)/)?.[1];
                        setDumpsysLaunchResult({ thisTime, totalTime, waitTime });
                      } catch { setDumpsysLaunchResult(null); } finally { setDumpsysLaunchRunning(false); }
                    }}
                  >
                    {dumpsysLaunchRunning ? "启动中…" : "测试启动"}
                  </button>
                </div>
                {dumpsysLaunchResult ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    <div style={{ background: "var(--bg-surface-strong)", borderRadius: 8, padding: 16, textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>ThisTime</div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: "#3b82f6" }}>{dumpsysLaunchResult.thisTime ?? "-"} ms</div>
                    </div>
                    <div style={{ background: "var(--bg-surface-strong)", borderRadius: 8, padding: 16, textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>TotalTime</div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: "#f97316" }}>{dumpsysLaunchResult.totalTime ?? "-"} ms</div>
                    </div>
                    <div style={{ background: "var(--bg-surface-strong)", borderRadius: 8, padding: 16, textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>WaitTime</div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: "#10b981" }}>{dumpsysLaunchResult.waitTime ?? "-"} ms</div>
                    </div>
                  </div>
                ) : (
                  <div className="result-empty-state">输入包名和 Activity，点击"测试启动"执行 am start -W 并展示耗时。</div>
                )}
                </>) : (
                  <div>
                    {dumpsysOutput ? <pre style={{ overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 12, background: "var(--bg-surface-strong)", padding: 12, borderRadius: 8, maxHeight: "calc(100vh - 280px)" }}>{dumpsysOutput}</pre> : <div className="result-empty-state">请先执行一次"测试启动"，再切换到此处查看原始输出。</div>}
                  </div>
                )}
              </div>
            ) : null}

            {!["performance", "battery", "launch"].includes(dumpsysTab) ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
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
                                // 大文件：找到第 next 个匹配行所在的 details，只展开该 details
                                const targetLine = matches[next];
                                const searchLower = targetLine.trim().toLowerCase();
                                const allDetails = container.querySelectorAll(":scope > details");
                                for (const det of allDetails) {
                                  if (det.textContent?.toLowerCase().includes(searchLower)) {
                                    (det as HTMLDetailsElement).open = true;
                                    setTimeout(() => {
                                      // 在展开的 details 内找到匹配文本并滚动
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
                                // 大文件：找到第 next 个匹配行所在的 details，只展开该 details
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
                    onClick={async () => {
                      if (!currentDeviceId) return;
                      setDumpsysRunning(true);
                      setDumpsysOutput(null);
                      try {
                        const res = await runtimeApi.command.run({ deviceId: currentDeviceId, deviceName: "", commandId: "dumpsys-raw", commandTitle: `dumpsys ${dumpsysTab}`, rawCommand: `adb -s ${currentDeviceId} shell dumpsys ${dumpsysTab}`, args: [] });
                        setDumpsysOutput((res as { stdout?: string }).stdout ?? (res as { message?: string }).message ?? "无输出");
                      } catch (err: unknown) { setDumpsysOutput(err instanceof Error ? err.message : "执行失败"); } finally { setDumpsysRunning(false); }
                    }}
                  >
                    {dumpsysRunning ? "抓取中…" : `抓取 ${dumpsysTab}`}
                  </button>
                </div>
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
                  <div className="result-empty-state">点击"抓取"获取 dumpsys {dumpsysTab} 输出。</div>
                )}
              </div>
            ) : null}

          </div>
        </div>
      </section>
    </main>
  );
}
