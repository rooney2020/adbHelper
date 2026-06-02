export default function CommandPage({ layout, panelList, panelCommands, workspace, result }: any) {
  return (
    <main
      ref={layout.workspaceRef}
      className={[
        "workspace-grid",
        layout.workspaceIsModalOpen ? "workspace-grid-modal-open" : "",
        layout.leftCollapsed ? "workspace-grid-left-collapsed" : "",
        layout.rightWorkspaceMaximized ? "workspace-grid-right-maximized" : "",
      ].filter(Boolean).join(" ")}
      style={{ gridTemplateColumns: layout.workspaceColumns }}
    >
      <section className={`panel left-panel ${layout.leftCollapsed ? "left-panel-collapsed" : ""}`}>
        <div className="panel-list-head">
          <div>
            <p className="section-kicker panel-list-kicker">面板</p>
          </div>
          <div className="panel-list-actions">
            {!layout.leftCollapsed ? <button className="ghost-button compact-button panel-create-button" onClick={panelList.openCreatePanelDialog}>新增面板</button> : null}
            <button className="icon-button" onClick={() => layout.setLeftCollapsed((collapsed: boolean) => !collapsed)} aria-label={layout.leftCollapsed ? "展开命令面板" : "收起命令面板"} title={layout.leftCollapsed ? "展开命令面板" : "收起命令面板"}>
              <span className={`icon ${layout.leftCollapsed ? "icon-sidebar-expand-left" : "icon-sidebar-collapse-left"}`} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="panel-list panel-scroll">
          {panelList.panels.map((panel: any) => {
            const isActive = panel.id === panelList.activePanelId;
            return (
              <button
                key={panel.id}
                className={`panel-item ${isActive ? "active" : ""}`}
                onClick={() => {
                  panelList.setActivePanelId(panel.id);
                  panelCommands.setActivePanelCommandId("");
                }}
                onContextMenu={(event) => panelList.openContextMenu(event, "panel", panel.id)}
              >
                {layout.leftCollapsed ? (
                  <span className="panel-item-collapsed-label">{panel.name.slice(0, 2)}</span>
                ) : (
                  <div className="panel-item-head">
                    <strong>{panel.name}</strong>
                    <span className="badge info">{panel.commands.length}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {!layout.rightWorkspaceMaximized ? <div className={`resize-handle resize-handle-left ${layout.leftCollapsed ? "resize-handle-hidden" : ""}`} onPointerDown={(event) => layout.beginHorizontalDrag("left", event)} /> : null}

      <section className="panel middle-panel">
        <div className="middle-head">
          <div>
            <p className="section-kicker">命令列表</p>
            <h3>{panelList.activePanel?.name ?? "未选择面板"}</h3>
            <p className="panel-list-subtitle">{panelList.activePanel?.description ?? "请选择一个命令面板，再从弹窗里补充命令块。"}</p>
          </div>
          <button className="primary-button add-command-button" onClick={() => panelCommands.setCatalogOpen(true)}>添加命令</button>
        </div>
        <div className="panel-command-toolbar">
          <span className="badge info">命令块 {panelCommands.panelCommands.length}</span>
          {panelCommands.activePanelCommand ? <span className="badge success">当前选中：{panelCommands.activePanelCommandTitle}</span> : null}
        </div>
        <div className="subcommand-list panel-scroll">
          {panelCommands.panelCommands.length === 0 ? (
            <div className="result-empty-state">当前面板还没有命令块。点击上方“添加命令”从命令目录中挑选。</div>
          ) : panelCommands.panelCommands.map((block: any) => {
            const blockEntry = panelCommands.findCommandEntry(block.commandId);
            const blockCommand = blockEntry?.command ?? null;
            const blockTitle = panelCommands.getPanelCommandTitle(block, blockCommand);
            const isActive = panelCommands.activePanelCommand?.id === block.id;

            return (
              <article key={block.id} className={`subcommand-item panel-command-card ${isActive ? "active" : ""}`} onContextMenu={(event) => panelList.openContextMenu(event, "command", block.id)}>
                <div className="panel-command-card-head">
                  <button className="subcommand-toggle" onClick={() => panelCommands.setActivePanelCommandId(block.id)}>
                    <span className="panel-command-title-line">
                      <strong>{blockTitle}</strong>
                      <span className="panel-command-summary">{block.summary}</span>
                    </span>
                    <code className="panel-command-inline-preview" title={block.rawCommand}>{block.rawCommand}</code>
                  </button>
                  <div className="panel-command-actions">
                    <button className="catalog-quick-run-btn" onClick={(event) => {
                      event.stopPropagation();
                      void panelCommands.runPanelCommandBlock(block);
                    }}>▶ 执行</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {!layout.rightWorkspaceMaximized && !workspace.rightCollapsed ? <div className="resize-handle resize-handle-middle" onPointerDown={(event) => layout.beginHorizontalDrag("middle", event)} /> : null}

      <section className={`panel workspace-right-panel ${workspace.rightCollapsed ? "workspace-right-panel-collapsed" : ""}`}>
        <div className="workspace-right-header">
          {!workspace.rightCollapsed ? (
            <div>
              <p className="section-kicker">命令执行与结果工作区</p>
            </div>
          ) : null}
          <div className="workspace-right-actions">
            <button className="icon-button workspace-toggle-button" onClick={() => {
              workspace.setRightCollapsed((collapsed: boolean) => !collapsed);
              workspace.setRightWorkspaceMaximized(false);
            }} aria-label={workspace.rightCollapsed ? "展开工作区侧栏" : "收起工作区侧栏"} title={workspace.rightCollapsed ? "展开工作区侧栏" : "收起工作区侧栏"}>
              <span className={`icon ${workspace.rightCollapsed ? "icon-sidebar-expand-right" : "icon-sidebar-collapse-right"}`} aria-hidden="true" />
            </button>
            {!workspace.rightCollapsed ? (
              <button className="icon-button workspace-toggle-button" onClick={() => {
                workspace.setRightCollapsed(false);
                workspace.setRightWorkspaceMaximized((maximized: boolean) => !maximized);
              }} aria-label={layout.rightWorkspaceMaximized ? "还原工作区" : "最大化工作区"} title={layout.rightWorkspaceMaximized ? "还原工作区" : "最大化工作区"}>
                <span className={`icon ${layout.rightWorkspaceMaximized ? "icon-restore-workspace" : "icon-maximize-workspace"}`} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
        {!workspace.rightCollapsed ? (
          <>
            <div className="executor-box workspace-executor-box">
              <textarea value={workspace.rawCommand} onChange={(event) => workspace.updateActivePanelCommandRaw(event.target.value)} placeholder={panelCommands.activePanelCommand ? "可在这里微调选中命令块的原始命令" : "先在中间选择一个命令块"} spellCheck={false} disabled={!panelCommands.activePanelCommand} />
              <div className="executor-actions">
                <button className="primary-button" disabled={!workspace.canRunCommand} onClick={() => void workspace.handleRun()}>执行并解析</button>
              </div>
            </div>
            <div className="result-section panel-scroll">
              <div className="result-head">
                <div className="result-head-main">
                  <p className="section-kicker">结果工作区</p>
                  <div className="result-search-row">
                    <input value={result.resultSearchTerm} onChange={(event) => result.setResultSearchTerm(event.target.value)} placeholder="搜索结果关键词，例如 fallback / Pixel" />
                    <div className="result-search-actions">
                      <div className="export-menu-wrap" ref={result.exportMenuRef}>
                        <button className="ghost-button compact-button" disabled={!result.lastRunResult} onClick={() => result.setExportMenuOpen((open: boolean) => !open)}>导出</button>
                        {result.exportMenuOpen ? (
                          <div className="export-menu panel">
                            <button className="context-menu-item" onClick={() => result.handleExportResult("markdown")}>导出 Markdown</button>
                            <button className="context-menu-item" onClick={() => result.handleExportResult("txt")}>导出 TXT</button>
                          </div>
                        ) : null}
                      </div>
                      <span className="badge info">匹配 {result.resultMatchCount}</span>
                    </div>
                  </div>
                </div>
                <div className="chip-row">
                  <button className={`chip ${result.activeResultTab === "structured" ? "active" : ""}`} onClick={() => result.setActiveResultTab("structured")}>结构化</button>
                  <button className={`chip ${result.activeResultTab === "raw" ? "active" : ""}`} onClick={() => result.setActiveResultTab("raw")}>原文</button>
                  <button className={`chip ${result.activeResultTab === "diff" ? "active" : ""}`} onClick={() => result.setActiveResultTab("diff")}>差异</button>
                  <button className={`chip ${result.activeResultTab === "history" ? "active" : ""}`} onClick={() => result.setActiveResultTab("history")}>历史</button>
                </div>
              </div>
              {result.activeResultTab === "structured" ? (
                <div className="result-grid">
                  <article className="result-card result-card-primary">
                    <h3>当前执行结果</h3>
                    {result.lastRunResult ? (
                      <div className="execution-summary">
                        <div className="execution-summary-top">
                          <div>
                            <p className="summary-label">执行命令</p>
                            <strong className="execution-command-title">{result.highlightText(result.executedCommandText, result.resultSearchTerm)}</strong>
                          </div>
                          <span className={`badge ${result.lastRunResult.status === "ok" ? "success" : "danger"}`}>
                            {result.lastRunResult.status === "ok" ? "执行成功" : "执行失败"}
                          </span>
                        </div>
                        <div className="output-section output-section-primary">
                          <p className="output-title">结果输出</p>
                          {result.renderOutputPreview(result.lastRunResult, result.resultSearchTerm)}
                        </div>
                        <div className="execution-meta-strip">
                          <div className="execution-meta-pill">
                            <span className="summary-label">退出码</span>
                            <strong>{result.lastRunResult.exitCode ?? "未知"}</strong>
                          </div>
                          <div className="execution-meta-pill">
                            <span className="summary-label">耗时</span>
                            <strong>{result.lastRunResult.duration != null ? `${result.lastRunResult.duration} ms` : "未知"}</strong>
                          </div>
                          <div className="execution-meta-pill">
                            <span className="summary-label">标准输出</span>
                            <strong>{result.countOutputLines(result.lastRunResult.stdout)} 行</strong>
                          </div>
                          <div className="execution-meta-pill">
                            <span className="summary-label">错误输出</span>
                            <strong>{result.countOutputLines(result.lastRunResult.stderr)} 行</strong>
                          </div>
                          <div className="execution-meta-pill execution-meta-action">
                            <button className="ghost-button copy-btn" onClick={() => result.copyText(result.normalizeOutputText(result.lastRunResult))}>复制输出</button>
                          </div>
                        </div>
                        {result.lastRunResult.stderr?.trim() ? result.formatOutputBlock("错误输出", result.lastRunResult.stderr.trimEnd(), result.resultSearchTerm) : null}
                      </div>
                    ) : (
                      <div className="result-empty-state">等待首次执行。结构化视图会把命令输出整理成更容易阅读的摘要与预览。</div>
                    )}
                  </article>
                </div>
              ) : null}
              {result.activeResultTab === "raw" ? (
                <article className="result-card result-card-full">
                  <h3>原始输出</h3>
                  {result.lastRunResult?.stdout?.trim() ? result.renderRawOutputSection("stdout", result.lastRunResult.stdout, result.resultSearchTerm) : null}
                  {result.lastRunResult?.stderr?.trim() ? result.renderRawOutputSection("stderr", result.lastRunResult.stderr, result.resultSearchTerm) : null}
                  {!result.lastRunResult?.stdout?.trim() && !result.lastRunResult?.stderr?.trim() ? <div className="result-empty-state">{result.highlightText(result.rawExecutionOutput, result.resultSearchTerm)}</div> : null}
                </article>
              ) : null}
              {result.activeResultTab === "diff" ? (
                <div className="result-grid">
                  <article className="result-card result-card-primary">
                    <div className="diff-selector-row">
                      <div className="diff-select-field diff-select-card">{result.renderDiffDropdown("left", "左侧记录", result.leftDiffOption, result.setLeftDiffTargetId)}</div>
                      <div className="diff-select-field diff-select-card">{result.renderDiffDropdown("right", "右侧记录", result.rightDiffOption, result.setRightDiffTargetId)}</div>
                    </div>
                  </article>
                  <article className="result-card result-card-primary">
                    {result.leftDiffResult && result.rightDiffResult ? (
                      <div className="diff-table-wrap">
                        <div className="diff-table-head">
                          <div className="diff-table-side">
                            <span>左侧文本</span>
                            <button className="icon-button diff-copy-button" onClick={() => result.copyText(result.leftDiffOutput)} title="复制左侧文本" aria-label="复制左侧文本">
                              <span className="icon icon-copy" aria-hidden="true" />
                            </button>
                          </div>
                          <div className="diff-table-side">
                            <span>右侧文本</span>
                            <button className="icon-button diff-copy-button" onClick={() => result.copyText(result.rightDiffOutput)} title="复制右侧文本" aria-label="复制右侧文本">
                              <span className="icon icon-copy" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        <div className="diff-table-body">
                          {result.diffRows.map((row: any, index: number) => (
                            <div className={`diff-line-row diff-line-row-${row.kind}`} key={`${row.leftLineNumber ?? "l"}-${row.rightLineNumber ?? "r"}-${index}`}>
                              <div className={`${`diff-line-cell ${row.kind === "changed" || row.kind === "removed" ? `diff-line-cell-${row.kind}` : ""}`.trim()}`}>
                                <span className="diff-line-number">{row.leftLineNumber ?? ""}</span>
                                <code>{result.renderDiffText(row.leftSegments, result.resultSearchTerm)}</code>
                              </div>
                              <div className={`${`diff-line-cell ${row.kind === "changed" || row.kind === "added" ? `diff-line-cell-${row.kind}` : ""}`.trim()}`}>
                                <span className="diff-line-number">{row.rightLineNumber ?? ""}</span>
                                <code>{result.renderDiffText(row.rightSegments, result.resultSearchTerm)}</code>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="result-empty-state">请选择左右两条记录后查看文本差异。</div>
                    )}
                  </article>
                </div>
              ) : null}
              {result.activeResultTab === "history" ? (
                <article className="result-card result-card-full">
                  <div className="history-toolbar">
                    <h3>执行历史</h3>
                    <label className="history-filter-checkbox">
                      <input type="checkbox" checked={result.historyShowUserOnly} onChange={(event) => {
                        result.setHistoryShowUserOnly(event.target.checked);
                        result.setHistoryPage(0);
                      }} />
                      <span>只显示用户执行历史</span>
                    </label>
                    {result.filteredHistoryItems.length > result.HISTORY_PAGE_SIZE ? (
                      <div className="history-pagination">
                        <button type="button" className="ghost-button compact-button" disabled={result.historyPage === 0} onClick={() => result.setHistoryPage((page: number) => page - 1)}>上一页</button>
                        <span className="badge info">第 {result.historyPage + 1} / {Math.ceil(result.filteredHistoryItems.length / result.HISTORY_PAGE_SIZE)} 页</span>
                        <button type="button" className="ghost-button compact-button" disabled={(result.historyPage + 1) * result.HISTORY_PAGE_SIZE >= result.filteredHistoryItems.length} onClick={() => result.setHistoryPage((page: number) => page + 1)}>下一页</button>
                      </div>
                    ) : null}
                    {result.executionHistory.length ? (
                      <div className="history-toolbar-actions">
                        {result.historyClearConfirmOpen ? (
                          <>
                            <button className="ghost-button compact-button history-clear-confirm-button" onClick={() => void result.handleClearHistory()}>确认清空</button>
                            <button className="ghost-button compact-button" onClick={() => result.setHistoryClearConfirmOpen(false)}>取消</button>
                          </>
                        ) : (
                          <button className="ghost-button compact-button history-clear-button" onClick={() => {
                            result.setPendingHistoryDeleteId(null);
                            result.setHistoryClearConfirmOpen(true);
                          }}>
                            清除全部
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                  {result.filteredHistoryItems.length ? (
                    <div className="history-card-list history-card-list-single">
                      {result.filteredHistoryItems.slice(result.historyPage * result.HISTORY_PAGE_SIZE, (result.historyPage + 1) * result.HISTORY_PAGE_SIZE).map((item: any) => (
                        <div className="history-card-item history-card-item-row" key={item.record_id}>
                          <div className="history-card-head history-card-head-row">
                            <div className="history-card-main">
                              <strong className="history-card-command">{result.highlightText(item.executedCommand ?? item.raw ?? item.command_title, result.resultSearchTerm)}</strong>
                              <div className="history-card-subline">
                                <span className="badge info history-card-device-badge">{result.highlightText(item.device_name, result.resultSearchTerm)}</span>
                                <span className="history-card-time">{result.highlightText(result.formatHistoryTimestamp(item), result.resultSearchTerm)}</span>
                              </div>
                            </div>
                            <div className="history-card-actions">
                              <span className={`badge ${item.status === "ok" ? "success" : "danger"}`}>{item.status}</span>
                              <button className="ghost-button compact-button history-detail-button" onClick={() => {
                                result.setHistoryDetailRecordId(item.record_id);
                                result.setHistoryDetailTab("structured");
                              }}>
                                详情
                              </button>
                              {result.pendingHistoryDeleteId === item.record_id ? (
                                <>
                                  <button className="ghost-button compact-button history-delete-confirm-button" onClick={() => void result.handleDeleteHistoryItem(item.record_id)}>确认删除</button>
                                  <button className="ghost-button compact-button" onClick={() => result.setPendingHistoryDeleteId(null)}>取消</button>
                                </>
                              ) : (
                                <button className="ghost-button compact-button history-delete-button" onClick={() => {
                                  result.setHistoryClearConfirmOpen(false);
                                  result.setPendingHistoryDeleteId(item.record_id);
                                }}>
                                  删除
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="history-card-meta">
                            <span>退出码 {item.exitCode ?? "未知"}</span>
                            <span>{item.duration != null ? `${item.duration} ms` : "耗时未知"}</span>
                            <span>{result.highlightText(item.command_title, result.resultSearchTerm)}</span>
                          </div>
                          {item.stdout?.trim() || item.stderr?.trim() ? <div className="history-card-preview">{result.highlightText(result.summarizeOutputToSingleLine(result.historyItemToRunResult(item)), result.resultSearchTerm)}</div> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="result-empty-state">{result.resultSearchTerm.trim() ? "没有匹配的历史记录。" : "暂无历史记录。执行命令后会自动追加到这里。"}</div>
                  )}
                </article>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}