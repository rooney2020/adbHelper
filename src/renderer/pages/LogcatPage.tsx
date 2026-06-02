export default function LogcatPage({ logcat, crash, bugreport, trace, shared }: any) {
  const LogcatRow = logcat.LogcatRow;

  return (
    <main className="page-shell">
      <section className="panel page-panel" style={{ paddingTop: "16px", paddingLeft: "16px", paddingRight: "16px" }}>
        <div className="device-info-layout">
          <aside className="device-info-sidebar">
            {[
              { key: "logcat", label: "Logcat" },
              { key: "crash", label: "Crash/ANR" },
              { key: "bugreport", label: "Bugreport" },
              { key: "trace", label: "Trace" },
            ].map((tab) => (
              <button key={tab.key} className={`device-info-tab ${logcat.logcatPageTab === tab.key ? "active" : ""}`} onClick={() => logcat.setLogcatPageTab(tab.key)} style={{ whiteSpace: "nowrap" }}>
                <strong>{tab.label}</strong>
              </button>
            ))}
          </aside>
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {logcat.logcatPageTab === "logcat" ? (
              <section className="panel page-panel logcat-page-panel">
                <div className="logcat-filter-shell" ref={logcat.logcatFilterShellRef}>
                  <div className="logcat-toolbar">
                    <input className="logcat-search-input" value={logcat.logcatSearchTerm} onChange={(event) => logcat.setLogcatSearchTerm(event.target.value)} placeholder="搜索 package、message、tag 或整行日志" />
                    <div className="logcat-toolbar-actions">
                      <label className="param-toggle-row logcat-regex-toggle">
                        <input type="checkbox" checked={logcat.logcatRegexEnabled} onChange={(event) => logcat.setLogcatRegexEnabled(event.target.checked)} />
                        <span>启用正则表达式</span>
                      </label>
                      <button className="ghost-button compact-button" onClick={() => logcat.setLogcatAdvancedOpen((open: boolean) => !open)}>
                        {logcat.logcatAdvancedOpen ? "收起高级过滤" : "展开高级过滤"}
                      </button>
                    </div>
                  </div>

                  {logcat.logcatAdvancedOpen ? (
                    <div className="logcat-advanced-panel panel">
                      <div className="logcat-package-rule-panel">
                        <div className="theme-panel-head">
                          <p className="section-kicker">过滤规则</p>
                          <div className="logcat-package-rule-actions">
                            <button className="ghost-button compact-button" onClick={logcat.clearLogcatFilterRules}>清空全部</button>
                            <button className="ghost-button compact-button" onClick={logcat.addLogcatFilterRule}>新增规则</button>
                          </div>
                        </div>
                        <div className="logcat-package-rule-list">
                          {logcat.logcatFilterRules.map((rule: any, index: number) => (
                            <div className="logcat-package-rule-item" key={rule.id}>
                              {index === 0 ? (
                                <div className="logcat-rule-joiner-placeholder">起始规则</div>
                              ) : (
                                <select value={rule.joiner} onChange={(event) => logcat.updateLogcatRuleJoiner(rule.id, event.target.value)}>
                                  <option value="and">并且</option>
                                  <option value="or">或者</option>
                                </select>
                              )}
                              <select value={rule.field} onChange={(event) => logcat.updateLogcatRuleField(rule.id, event.target.value)}>
                                {logcat.LOGCAT_RULE_FIELD_OPTIONS.map((option: any) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                              <div className="logcat-filter-field-with-action">
                                <input value={rule.value} onChange={(event) => logcat.updateLogcatFilterRule(rule.id, { value: event.target.value })} placeholder={logcat.getLogcatRulePlaceholder(rule.field)} />
                                {rule.field === "pid" ? <button className="ghost-button compact-button" data-rule-id={rule.id} onClick={(event) => void logcat.openLogcatProcessPicker(event.currentTarget)} disabled={!shared.currentDeviceId}>选择 PID</button> : null}
                                {rule.field === "package" ? <button className="ghost-button compact-button" onClick={(event) => void logcat.openLogcatPackagePicker(rule.id, event.currentTarget)} disabled={!shared.currentDeviceId}>选择包名</button> : null}
                              </div>
                              <div className="logcat-package-rule-actions">
                                <button className="ghost-button compact-button" onClick={() => logcat.removeLogcatFilterRule(rule.id)}>删除</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="logcat-level-panel">
                        <span className="summary-label">Level 过滤</span>
                        <div className="logcat-level-chip-row">
                          <button className={`ghost-button compact-button ${logcat.hasAllLogcatLevels ? "active" : ""}`} onClick={() => logcat.applyLogcatLevelPreset("all")}>全选</button>
                          <button className="ghost-button compact-button" onClick={() => logcat.applyLogcatLevelPreset("none")}>清空</button>
                          <button className="ghost-button compact-button" onClick={() => logcat.applyLogcatLevelPreset("debug-plus")}>DEBUG+</button>
                          <button className="ghost-button compact-button" onClick={() => logcat.applyLogcatLevelPreset("info-plus")}>INFO+</button>
                          {logcat.LOGCAT_LEVEL_OPTIONS.map((level: string) => (
                            <button key={`logcat-level-${level}`} className={`chip logcat-level-chip logcat-level-chip-${level.toLowerCase()} ${logcat.logcatLevels.includes(level) ? "active" : ""}`} onClick={() => logcat.toggleLogcatLevel(level)}>
                              <strong>{level}</strong>
                              <span>{logcat.getLogcatLevelLabel(level)}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="logcat-level-panel" style={{ marginTop: "12px" }}>
                        <span className="summary-label">Buffer 选择（-b）</span>
                        <div className="logcat-level-chip-row">
                          {["main", "system", "crash", "events", "radio", "kernel", "all"].map((buf) => (
                            <button
                              key={`logcat-buf-${buf}`}
                              className={`chip logcat-level-chip ${logcat.logcatBuffers.includes(buf) ? "active" : ""}`}
                              onClick={() => {
                                if (buf === "all") {
                                  logcat.setLogcatBuffers(["all"]);
                                } else {
                                  logcat.setLogcatBuffers((prev: string[]) => {
                                    const filtered = prev.filter((item) => item !== "all");
                                    return filtered.includes(buf) ? filtered.filter((item) => item !== buf) : [...filtered, buf];
                                  });
                                }
                              }}
                            >
                              {buf}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {logcat.logcatPickerState ? (
                    <div className="logcat-selector-popover panel" style={logcat.logcatPickerStyle}>
                      <div className="theme-panel-head">
                        <p className="section-kicker">{logcat.logcatPickerState.kind === "package" ? "设备包名列表" : "设备 PID 列表"}</p>
                        <button className="ghost-button compact-button" onClick={() => logcat.setLogcatPickerState(null)}>关闭</button>
                      </div>
                      <input className="logcat-selector-search" value={logcat.logcatPickerQuery} onChange={(event) => logcat.setLogcatPickerQuery(event.target.value)} placeholder={logcat.logcatPickerState.kind === "package" ? "搜索包名" : "搜索 PID 或进程名"} />
                      <div className="logcat-selector-list">
                        {logcat.logcatPickerLoading ? <div className="result-empty-state">读取中...</div> : null}
                        {!logcat.logcatPickerLoading && logcat.logcatPickerState.kind === "package" && logcat.filteredLogcatPackageCatalog.map((item: string) => (
                          <button key={`pkg-option-${item}`} className="logcat-selector-item" onClick={() => logcat.applyLogcatRuleValue(logcat.logcatPickerState.ruleId, item)}>
                            <span className="logcat-selector-primary">{item}</span>
                          </button>
                        ))}
                        {!logcat.logcatPickerLoading && logcat.logcatPickerState.kind === "pid" && logcat.filteredLogcatProcessCatalog.map((item: any) => (
                          <button key={`pid-option-${item.pid}-${item.name}`} className={`logcat-selector-item ${logcat.activePickerRuleValues.includes(item.pid) ? "active" : ""}`} onClick={() => logcat.appendLogcatRuleValue(logcat.logcatPickerState.ruleId, item.pid)}>
                            <span className="logcat-selector-primary">{item.pid}</span>
                            <span className="logcat-selector-secondary">{item.name}</span>
                          </button>
                        ))}
                        {!logcat.logcatPickerLoading && logcat.logcatPickerState.kind === "package" && logcat.filteredLogcatPackageCatalog.length === 0 ? <div className="result-empty-state">没有匹配的包名。</div> : null}
                        {!logcat.logcatPickerLoading && logcat.logcatPickerState.kind === "pid" && logcat.filteredLogcatProcessCatalog.length === 0 ? <div className="result-empty-state">没有匹配的 PID。</div> : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                {logcat.invalidLogcatRegex ? <div className="result-empty-state">当前正则表达式无效，已自动忽略正则过滤。</div> : null}

                <div className="logcat-summary-row">
                  <div className="logcat-summary-strip">
                    <span className="badge info">当前设备：{shared.currentDeviceLabel}</span>
                    <span className={`badge ${logcat.logcatRunning ? "success" : "warning"}`}>{logcat.logcatRunning ? "状态：实时捕获中" : "状态：已停止"}</span>
                    <span className="badge info">缓冲区：{logcat.logcatStreamState?.bufferedLines ?? 0} 行</span>
                    <span className="badge info">过滤后：{logcat.filteredLogcatItems.length} 行</span>
                    <span className="badge warning">显示：{logcat.renderedLogcatItems.length} 行</span>
                    {logcat.logcatStreamState?.savedFileCount ? <span className="badge info">文件：{logcat.logcatStreamState.savedFileCount} 个</span> : null}
                    {logcat.logcatStreamState?.currentFilePath ? <span className="badge warning">当前文件：{logcat.logcatStreamState.currentFilePath.split("/").at(-1)}</span> : null}
                    {(logcat.logcatStreamState?.droppedLines ?? 0) > 0 ? <span className="badge warning">已丢弃旧日志：{logcat.logcatStreamState?.droppedLines} 行</span> : null}
                  </div>
                  <div className="logcat-capture-actions">
                    <label className="param-toggle-row logcat-regex-toggle">
                      <input type="checkbox" checked={logcat.logcatClearBeforeStartEnabled} onChange={(event) => logcat.setLogcatClearBeforeStartEnabled(event.target.checked)} disabled={!shared.hasCurrentDevice || logcat.logcatBusy !== null || logcat.logcatRunning} />
                      <span>捕获前清空设备日志</span>
                    </label>
                    <button className="primary-button" onClick={() => void logcat.handleStartLogcat()} disabled={!shared.hasCurrentDevice || logcat.logcatBusy !== null || logcat.logcatRunning}>
                      {logcat.logcatBusy === "start" ? "启动中..." : logcat.logcatRunning ? "正在捕获" : "开始捕获"}
                    </button>
                    <button className="ghost-button" onClick={() => void logcat.handleStopLogcat()} disabled={!shared.hasCurrentDevice || logcat.logcatBusy !== null || !logcat.logcatRunning}>
                      {logcat.logcatBusy === "stop" ? "停止中..." : "停止捕获"}
                    </button>
                    <button className="ghost-button" onClick={() => void logcat.handleClearLogcat()} disabled={!shared.hasCurrentDevice || logcat.logcatBusy !== null}>
                      {logcat.logcatBusy === "clear" ? "清空中..." : "清空日志"}
                    </button>
                    <button className="ghost-button" onClick={() => void logcat.handleDownloadLogcat()} disabled={!shared.hasCurrentDevice || logcat.logcatDownloading || !(logcat.logcatStreamState?.savedFileCount || logcat.logcatStreamState?.items?.length)}>
                      {logcat.logcatDownloading ? "下载中..." : "下载日志"}
                    </button>
                  </div>
                </div>

                {logcat.logcatStreamState?.status === "error" && logcat.logcatStreamState.message ? <div className="result-empty-state">{logcat.logcatStreamState.message}</div> : null}

                {logcat.deferredRenderedLogcatItems.length ? (
                  <div className={`logcat-list-shell ${logcat.logcatMaximized ? "logcat-list-maximized" : ""}`}>
                    <div className="logcat-float-actions">
                      <div className="logcat-list-toolbar-actions">
                        <button className="icon-button" title="滚动到最上方" aria-label="滚动到最上方" onClick={() => {
                          const list = logcat.logcatListRef.current;
                          if (!list) return;
                          logcat.setLogcatAutoFollow(false);
                          list.scrollTop = 0;
                        }}>
                          <span className="icon icon-chevron-up" aria-hidden="true" />
                        </button>
                        <button className="icon-button" title="滚动到最下方" aria-label="滚动到最下方" onClick={() => {
                          const list = logcat.logcatListRef.current;
                          if (!list) return;
                          logcat.setLogcatAutoFollow(true);
                          list.scrollTop = list.scrollHeight;
                        }}>
                          <span className="icon icon-chevron-down" aria-hidden="true" />
                        </button>
                        <button className={`icon-button ${logcat.logcatPaused ? "active" : ""}`} title={logcat.logcatPaused ? "继续刷新" : "暂停刷新"} aria-label={logcat.logcatPaused ? "继续刷新" : "暂停刷新"} onClick={() => logcat.setLogcatPaused((current: boolean) => !current)}>
                          <span className={`icon ${logcat.logcatPaused ? "icon-play" : "icon-pause"}`} aria-hidden="true" />
                        </button>
                        <button className={`icon-button ${logcat.logcatMaximized ? "active" : ""}`} title={logcat.logcatMaximized ? "还原日志区" : "最大化日志区"} aria-label={logcat.logcatMaximized ? "还原日志区" : "最大化日志区"} onClick={() => logcat.setLogcatMaximized((current: boolean) => !current)}>
                          <span className={`icon ${logcat.logcatMaximized ? "icon-restore-workspace" : "icon-maximize-workspace"}`} aria-hidden="true" />
                        </button>
                      </div>
                      <label className="param-toggle-row logcat-regex-toggle logcat-wrap-toggle">
                        <input type="checkbox" checked={logcat.logcatWrapEnabled} onChange={(event) => logcat.setLogcatWrapEnabled(event.target.checked)} />
                        <span>自动换行</span>
                      </label>
                    </div>
                    <div
                      className={`logcat-list ${logcat.logcatWrapEnabled ? "logcat-list-wrap" : "logcat-list-nowrap"}`}
                      ref={logcat.logcatListRef}
                      onScroll={(event) => {
                        const currentTarget = event.currentTarget;
                        const atBottom = currentTarget.scrollTop + currentTarget.clientHeight >= currentTarget.scrollHeight - 12;
                        const nextViewportHeight = currentTarget.clientHeight;
                        const nextStartIndex = logcat.shouldVirtualizeLogcat ? Math.max(Math.floor(currentTarget.scrollTop / logcat.logcatVirtualRowHeight) - logcat.LOGCAT_VIRTUAL_OVERSCAN, 0) : 0;
                        logcat.setLogcatViewportHeight((current: number) => current === nextViewportHeight ? current : nextViewportHeight);
                        logcat.setLogcatVirtualStartIndex((current: number) => current === nextStartIndex ? current : nextStartIndex);
                        if (!atBottom) {
                          logcat.setLogcatAutoFollow(false);
                        }
                      }}
                    >
                      <div className="logcat-stream-head">
                        <span>序号</span>
                        <span>时间</span>
                        <span>PID</span>
                        <span>TID</span>
                        <span>级别</span>
                        <span>Tag</span>
                        <span>日志内容</span>
                      </div>
                      <div className="logcat-stream-body">
                        {logcat.logcatVirtualWindow.offsetTop > 0 ? <div className="logcat-stream-spacer" style={{ height: logcat.logcatVirtualWindow.offsetTop }} /> : null}
                        {logcat.logcatVirtualWindow.items.map((entry: any, index: number) => (
                          <LogcatRow key={entry.id} entry={entry} lineNumber={logcat.getLogcatDisplayLineNumber(entry, logcat.logcatVirtualWindow.startIndex + index)} highlightTerm={logcat.logcatHighlightTerm} regexEnabled={logcat.logcatRegexEnabled} onClick={logcat.handleLogcatRowClick} />
                        ))}
                        {logcat.logcatVirtualWindow.offsetBottom > 0 ? <div className="logcat-stream-spacer" style={{ height: logcat.logcatVirtualWindow.offsetBottom }} /> : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="result-empty-state">{logcat.logcatStreamState ? "当前过滤条件下没有匹配日志。" : "暂无日志。"}</div>
                )}
              </section>
            ) : null}

            {logcat.logcatPageTab === "crash" ? (
              <section className="panel page-panel" style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                  <h4 style={{ margin: 0 }}>Crash / ANR</h4>
                  <span style={{ fontSize: "11px", color: "#999" }}>需要 root 权限</span>
                  <button className="primary-button" style={{ marginLeft: "auto" }} disabled={crash.crashLoading} onClick={async () => {
                    if (!shared.currentDeviceId) return;
                    crash.setCrashLoading(true);
                    crash.setCrashContent(null);
                    try {
                      const response = await fetch(`/api/adb-helper/crash-list?deviceId=${encodeURIComponent(shared.currentDeviceId)}`);
                      const data = await response.json();
                      if (data.status === "ok") crash.setCrashFiles({ tombstones: data.tombstones ?? [], anr: data.anr ?? [], dropbox: data.dropbox ?? [] });
                      else alert(`获取失败: ${data.message}`);
                    } catch (error: any) {
                      alert(`请求出错: ${error.message}`);
                    }
                    crash.setCrashLoading(false);
                  }}>{crash.crashLoading ? "加载中..." : "刷新文件列表"}</button>
                </div>

                {crash.crashContent ? (
                  <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }} onClick={() => crash.setCrashContent(null)}>
                    <div style={{ width: "85vw", maxHeight: "85vh", background: "#1e1e1e", borderRadius: "8px", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={(event) => event.stopPropagation()}>
                      <div style={{ display: "flex", alignItems: "center", padding: "10px 16px", background: "#2d2d2d", borderBottom: "1px solid #3e3e3e" }}>
                        <span style={{ flex: 1, fontSize: "12px", color: "#ccc", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{crash.crashContent.path}</span>
                        <button className="ghost-button compact-button" style={{ color: "#ccc" }} onClick={() => crash.setCrashContent(null)}>✕</button>
                      </div>
                      <pre style={{ flex: 1, margin: 0, padding: "12px 16px", color: "#d4d4d4", fontSize: "11px", overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{crash.crashContent.content}</pre>
                    </div>
                  </div>
                ) : null}

                {(crash.crashFiles.tombstones.length > 0 || crash.crashFiles.anr.length > 0 || crash.crashFiles.dropbox.length > 0) ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {crash.crashFiles.tombstones.length > 0 ? (
                      <div>
                        <h4 style={{ fontSize: "13px", marginBottom: "8px", color: "#e74c3c" }}>💀 Tombstones ({crash.crashFiles.tombstones.length})</h4>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {crash.crashFiles.tombstones.filter((file: any) => !file.name.endsWith(".pb")).map((file: any, index: number) => (
                            <div key={index} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", background: "#f8f8f8", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }} onClick={async () => {
                              crash.setCrashContentLoading(true);
                              try {
                                const response = await fetch(`/api/adb-helper/crash-read?deviceId=${encodeURIComponent(shared.currentDeviceId)}&filePath=${encodeURIComponent(file.path)}`);
                                const data = await response.json();
                                if (data.status === "ok") crash.setCrashContent({ path: file.path, content: data.content });
                                else alert(`读取失败: ${data.message}`);
                              } catch (error: any) {
                                alert(`请求出错: ${error.message}`);
                              }
                              crash.setCrashContentLoading(false);
                            }}>
                              <span style={{ flex: 1, fontFamily: "monospace" }}>{file.name}</span>
                              <span style={{ color: "#999", fontSize: "11px" }}>{file.date}</span>
                              <span style={{ color: "#999", fontSize: "11px" }}>{file.size}B</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {crash.crashFiles.anr.length > 0 ? (
                      <div>
                        <h4 style={{ fontSize: "13px", marginBottom: "8px", color: "#e67e22" }}>⚠️ ANR ({crash.crashFiles.anr.length})</h4>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {crash.crashFiles.anr.map((file: any, index: number) => (
                            <div key={index} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", background: "#f8f8f8", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }} onClick={async () => {
                              crash.setCrashContentLoading(true);
                              try {
                                const response = await fetch(`/api/adb-helper/crash-read?deviceId=${encodeURIComponent(shared.currentDeviceId)}&filePath=${encodeURIComponent(file.path)}`);
                                const data = await response.json();
                                if (data.status === "ok") crash.setCrashContent({ path: file.path, content: data.content });
                                else alert(`读取失败: ${data.message}`);
                              } catch (error: any) {
                                alert(`请求出错: ${error.message}`);
                              }
                              crash.setCrashContentLoading(false);
                            }}>
                              <span style={{ flex: 1, fontFamily: "monospace" }}>{file.name}</span>
                              <span style={{ color: "#999", fontSize: "11px" }}>{file.date}</span>
                              <span style={{ color: "#999", fontSize: "11px" }}>{file.size}B</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {crash.crashFiles.dropbox.length > 0 ? (
                      <div>
                        <h4 style={{ fontSize: "13px", marginBottom: "8px", color: "#8e44ad" }}>📦 Dropbox ({crash.crashFiles.dropbox.length})</h4>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {crash.crashFiles.dropbox.map((file: any, index: number) => (
                            <div key={index} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", background: "#f8f8f8", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }} onClick={async () => {
                              crash.setCrashContentLoading(true);
                              try {
                                const response = await fetch(`/api/adb-helper/crash-read?deviceId=${encodeURIComponent(shared.currentDeviceId)}&filePath=${encodeURIComponent(file.path)}`);
                                const data = await response.json();
                                if (data.status === "ok") crash.setCrashContent({ path: file.path, content: data.content });
                                else alert(`读取失败: ${data.message}`);
                              } catch (error: any) {
                                alert(`请求出错: ${error.message}`);
                              }
                              crash.setCrashContentLoading(false);
                            }}>
                              <span style={{ flex: 1, fontFamily: "monospace" }}>{file.name}</span>
                              <span style={{ color: "#999", fontSize: "11px" }}>{file.date}</span>
                              <span style={{ color: "#999", fontSize: "11px" }}>{file.size}B</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (!crash.crashLoading ? <div className="result-empty-state">点击"刷新文件列表"获取设备上的 Crash/ANR 文件。</div> : null)}
              </section>
            ) : null}

            {logcat.logcatPageTab === "bugreport" ? (
              <section className="panel page-panel" style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                  <h4 style={{ margin: 0 }}>Bugreport</h4>
                  <span style={{ fontSize: "11px", color: "#999" }}>抓取完整 bugreport zip</span>
                  <button className="primary-button" style={{ marginLeft: "auto" }} disabled={bugreport.bugreportRunning} onClick={async () => {
                    if (!shared.currentDeviceId) return;
                    bugreport.setBugreportRunning(true);
                    bugreport.setBugreportResult(null);
                    try {
                      const response = await fetch(`/api/adb-helper/bugreport?deviceId=${encodeURIComponent(shared.currentDeviceId)}`);
                      const data = await response.json();
                      if (data.status === "ok") bugreport.setBugreportResult(data.file ?? "完成");
                      else alert(`失败: ${data.message}`);
                    } catch (error: any) {
                      alert(`请求出错: ${error.message}`);
                    }
                    bugreport.setBugreportRunning(false);
                  }}>{bugreport.bugreportRunning ? "抓取中（可能需要几分钟）..." : "开始抓取"}</button>
                </div>
                {bugreport.bugreportResult ? (
                  <div style={{ padding: "12px", background: "#f0f9f0", borderRadius: "6px", fontSize: "12px", display: "flex", alignItems: "center", gap: "12px" }}>
                    <span>✅ 已保存至：<span style={{ fontFamily: "monospace" }}>{bugreport.bugreportResult}</span></span>
                    <button className="ghost-button" onClick={() => shared.handleOpenLocalPath(bugreport.bugreportResult.replace(/\/[^/]+$/, ""))}>📂 打开目录</button>
                  </div>
                ) : null}
                {!bugreport.bugreportRunning && !bugreport.bugreportResult ? <div className="result-empty-state">点击"开始抓取"生成设备 bugreport。输出保存到 ~/Documents/adb-helper-bugreport/</div> : null}
              </section>
            ) : null}

            {logcat.logcatPageTab === "trace" ? (
              <section className="panel page-panel" style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                  <h4 style={{ margin: 0 }}>Trace 抓取</h4>
                  <span style={{ fontSize: "11px", color: "#999" }}>atrace 系统追踪</span>
                </div>
                <div className="logcat-capture-actions" style={{ marginBottom: "12px" }}>
                  <label className="param-toggle-row" style={{ gap: "6px" }}>
                    <span>时长(秒)：</span>
                    <input type="number" min="1" max="30" value={trace.traceDuration} onChange={(event) => trace.setTraceDuration(event.target.value)} style={{ width: "50px", padding: "4px 8px", borderRadius: "4px", border: "1px solid #ddd", fontSize: "12px" }} />
                  </label>
                  <div className="chip-row" style={{ flex: 1 }}>
                    {["gfx", "view", "wm", "am", "sched", "freq", "idle", "disk", "input", "res"].map((category) => (
                      <button key={category} className={`chip ${trace.traceCategories.includes(category) ? "active" : ""}`} onClick={() => trace.setTraceCategories((prev: string[]) => prev.includes(category) ? prev.filter((item) => item !== category) : [...prev, category])}>{category}</button>
                    ))}
                  </div>
                  <button className="primary-button" disabled={trace.traceRunning || trace.traceCategories.length === 0} onClick={async () => {
                    if (!shared.currentDeviceId) return;
                    trace.setTraceRunning(true);
                    trace.setTraceResult(null);
                    try {
                      const response = await fetch(`/api/adb-helper/trace-start?deviceId=${encodeURIComponent(shared.currentDeviceId)}&duration=${trace.traceDuration}&categories=${trace.traceCategories.join(",")}`);
                      const data = await response.json();
                      if (data.status === "ok") trace.setTraceResult(data.file);
                      else alert(`失败: ${data.message}`);
                    } catch (error: any) {
                      alert(`请求出错: ${error.message}`);
                    }
                    trace.setTraceRunning(false);
                  }}>{trace.traceRunning ? `抓取中（${trace.traceDuration}秒）...` : "开始抓取"}</button>
                </div>
                {trace.traceResult ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ padding: "12px", background: "#f0f9f0", borderRadius: "6px", fontSize: "12px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                      <span>✅ 已保存至：<span style={{ fontFamily: "monospace" }}>{trace.traceResult}</span></span>
                      <button className="ghost-button" onClick={() => shared.handleOpenLocalPath(trace.traceResult.replace(/\/[^/]+$/, ""))}>📂 打开目录</button>
                      <button className="ghost-button" onClick={async () => {
                        const buf = await fetch(`/api/adb-helper/local-file?path=${encodeURIComponent(trace.traceResult)}`).then((response) => response.arrayBuffer());
                        const win = window.open("https://ui.perfetto.dev");
                        if (!win) { alert("弹窗被拦截，请允许弹窗"); return; }
                        const timer = setInterval(() => { win.postMessage("PING", "https://ui.perfetto.dev"); }, 500);
                        const handler = (event: MessageEvent) => {
                          if (event.source !== win) return;
                          if (event.data === "PONG") {
                            clearInterval(timer);
                            window.removeEventListener("message", handler);
                            win.postMessage({ perfetto: { buffer: buf, title: trace.traceResult.split("/").pop() } }, "https://ui.perfetto.dev", [buf]);
                          }
                        };
                        window.addEventListener("message", handler);
                        setTimeout(() => {
                          clearInterval(timer);
                          window.removeEventListener("message", handler);
                        }, 30000);
                      }}>🔍 在 Perfetto UI 中查看</button>
                    </div>
                  </div>
                ) : null}
                {!trace.traceRunning && !trace.traceResult ? <div className="result-empty-state">选择分类和时长后点击"开始抓取"。输出保存到 ~/Documents/adb-helper-trace/</div> : null}
              </section>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}