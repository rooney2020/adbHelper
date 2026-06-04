import { useCallback } from "react";
import { buildCommandString, isToggleParam, getToggleParamValue, getParamInlineText, type CommandParam } from "../lib/catalog";

// ── SVG icon paths from /home/tsdl/ssd/data/icons/ ──

const SVG_ADD_NEW =
  "M921.6 458.752h-357.888V100.864c0-27.648-22.016-49.664-49.664-49.664s-49.664 22.016-49.664 49.664v357.888H106.496c-27.648 0-49.664 22.016-49.664 49.664s22.016 49.664 49.664 49.664h357.888v358.4c0 27.648 22.016 49.664 49.664 49.664s49.664-22.016 49.664-49.664v-358.4H921.6c27.648 0 49.664-22.016 49.664-49.664s-22.016-49.664-49.664-49.664z";

const SVG_SETTINGS_PATHS = [
  "M511.946668 318.905356c-106.40845 0-193.041312 86.611529-193.041312 193.083977 0 106.451116 86.590196 193.083977 193.041312 193.083977 106.493781 0 193.126643-86.632862 193.126643-193.083977S618.440449 318.905356 511.946668 318.905356zM511.946668 662.343535c-82.878273 0-150.311535-67.433262-150.311535-150.354201 0-82.899606 67.433262-150.354201 150.311535-150.354201 82.920939 0 150.4182 67.454595 150.4182 150.354201C662.364867 594.910273 594.867607 662.343535 511.946668 662.343535z",
  "M950.444199 382.22137l-70.782525 0.234662c-0.554655-0.255995-1.557301-1.066644-2.21862-2.645278l-14.229037-33.74863c-0.085332-0.575988 0.170663-1.727964-0.66132-0.938647l51.113602-51.134935c13.973042-13.909044 21.674215-32.468657 21.674215-52.180246S927.554009 203.51576 913.730297 189.649382l-79.273015-79.358347c-26.772776-26.794108-77.395721-26.815441-104.360492 0l-50.836274 50.772276-36.201912-14.655695C642.567947 146.044957 641.906627 145.063645 641.906627 146.172955L641.906627 73.747797C641.906627 33.087311 608.733985 0 568.073498 0l-112.125664 0c-40.660486 0-73.726464 33.087311-73.726464 73.747797l0.255995 70.569196c-0.213329 0.575988-1.10931 1.6213-2.709277 2.303952L346.25412 160.636653c-0.853316 0-1.706631-0.170663-2.303952-0.341326L293.967209 110.269703c-26.687444-26.751443-77.566384-26.772776-104.296494 0l-79.145018 79.230349c-14.058374 13.887711-21.78088 32.425991-21.78088 52.265578 0 19.754255 7.722506 38.292536 21.588884 52.116248l50.06829 49.748297c0.234662 0.554655 0.341326 1.91996-0.319993 3.583925l-13.674382 33.812629c-0.319993 0.426658-1.25864 1.10931-0.213329 1.130643L73.747797 382.157372C33.065978 382.157372 0 415.266015 0 455.926502l0 112.125664c0 40.61782 33.087311 73.705131 73.790463 73.683798l70.633195-0.29866c0.597321 0.255995 1.685298 1.151976 2.261286 2.453282l14.165038 33.961959c0.063999 0.618654-0.106664 1.791963 0.682652 1.066644L110.504364 729.968792c-14.037041 13.887711-21.759547 32.468657-21.759547 52.244245s7.722506 38.313868 21.588884 52.094915l79.315681 79.401012c26.666111 26.602112 77.502385 26.666111 104.232495-0.042666l50.708277-50.793608 36.436574 14.677028c0.426658 0.405325 1.10931 1.365305 1.151976 0.277328l0 72.403825c0 40.681819 33.087311 73.76913 73.747797 73.76913l112.125664 0c40.681819 0 73.854461-33.087311 73.811796-73.76913l-0.255995-70.611862c0.213329-0.554655 1.151976-1.706631 2.538614-2.261286l33.620633-13.973042c0.831983 0.042666 1.663965 0.213329 2.21862 0.341326l50.21762 50.132289c26.666111 26.602112 77.289056 26.751443 104.211162-0.042666l79.123685-79.209016c14.037041-13.930376 21.738214-32.48999 21.738214-52.244245 0-19.732922-7.722506-38.271203-21.567551-52.073582l-50.21762-50.21762c-0.042666-0.746651 0-1.877294 0.447991-3.114602l13.717048-33.961959c0.383992-0.447991 1.301306-1.10931 0.255995-1.130643l72.531822 0c40.553822 0 73.577134-33.065978 73.577134-73.705131l0-112.125664C1024.021333 415.330014 990.998021 382.22137 950.444199 382.22137zM981.248891 568.052166c0 17.066311-13.845045 30.954022-30.847357 30.954022l-72.617154 0c-16.703652 0-34.580613 12.757068-39.380513 27.263432l-13.482386 33.065978c-7.807837 16.021-4.693236 37.844545 7.189184 49.684298l51.369596 51.369596c5.823879 5.781213 9.002479 13.503719 9.002479 21.78088s-3.242599 16.106331-9.173142 21.951543l-79.081019 79.230349c-10.922439 10.85844-33.001979 10.85844-43.881752 0.063999l-51.326931-51.284265c-10.837108-10.773109-26.708777-11.605092-31.295348-11.605092-6.378534 0-12.117081 1.279973-15.743672 3.114602l-32.916648 13.717048c-16.788984 5.781213-29.90871 23.551509-29.90871 40.383159l0 72.510489c0 17.108977-13.909044 31.01802-31.082019 31.01802l-112.125664 0c-17.13031 0-31.01802-13.909044-31.01802-31.01802l0-72.510489c0-16.703652-12.885065-34.537947-27.412762-39.423179l-32.873982-13.354388c-6.399867-3.1786-13.162392-4.778567-20.031583-4.778567-11.306431 0-22.143539 4.415908-29.546051 11.946418l-51.348264 51.284265c-10.794442 10.751776-33.065978 10.751776-43.817754 0l-79.358347-79.443678c-5.802546-5.717214-9.002479-13.418387-9.002479-21.802212s3.157268-16.021 9.151809-21.951543l51.156268-51.1776c11.81842-11.839753 15.338347-33.556634 8.49049-47.124352l-13.695715-33.129976c-5.781213-16.703652-23.466178-29.844712-40.31916-29.844712L73.747797 598.942189c-17.108977 0-31.01802-13.866378-31.01802-30.932689l0-112.125664c0-17.13031 13.930376-31.039353 31.01802-31.039353l72.553155 0c16.682319 0 34.537947-12.863732 39.380513-27.370096l13.354388-32.767317c7.893169-16.042332 4.693236-37.972542-7.295848-49.854961l-51.241599-51.262932c-5.802546-5.781213-9.002479-13.546384-9.002479-21.844878 0-8.298494 3.242599-16.084998 9.173142-21.951543l79.209016-79.294348c10.837108-10.837108 33.001979-10.85844 43.796421 0l51.412262 51.454928c8.597154 8.447824 21.802212 11.455761 31.231349 11.455761 6.399867 0 12.159747-1.237308 15.829004-3.114602l32.681986-13.674382c16.874315-5.695881 30.122039-23.423512 30.122039-40.340493L424.951147 73.747797c0-17.108977 13.887711-31.01802 30.996688-31.01802l112.125664 0c17.172976 0 31.082019 13.909044 31.082019 31.01802l0 72.510489c0 16.61832 12.757068 34.473948 27.284765 39.35918l32.916648 13.503719c16.831649 8.149164 37.28989 4.970563 49.662965-7.338514l51.198933-51.241599c10.965105-10.879773 33.044645-10.922439 43.967084-0.042666l79.251682 79.37968c5.823879 5.823879 9.045145 13.58905 9.045145 21.887544 0 8.255828-3.242599 16.042332-9.087811 21.908877L831.982667 315.086769c-11.605092 11.839753-15.06102 33.513968-8.298494 46.953688l13.717048 32.724652c5.674548 16.895648 23.380846 30.122039 40.383159 30.122039l72.617154 0c17.002312 0 30.847357 13.930376 30.847357 31.039353L981.248891 568.052166z",
];

// ── Inline SVG icon component ──

function SvgIcon({ paths, size = 18, color }: { paths: string | string[]; size?: number; color?: string }) {
  const allPaths = Array.isArray(paths) ? paths : [paths];
  return (
    <svg
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      style={{
        display: "inline-block",
        verticalAlign: "-0.15em",
        flexShrink: 0,
        color: color ?? "currentColor",
      }}
    >
      {allPaths.map((d, i) => (
        <path key={i} d={d} fill="currentColor" />
      ))}
    </svg>
  );
}

// ── Component ──

export default function CommandPage({ layout, panelList, panelCommands, workspace, result }: any) {
  const activePanelCommandEntry =
    panelCommands.activePanelCommand ? panelCommands.findCommandEntry(panelCommands.activePanelCommand.commandId) : null;
  const activeCommand = activePanelCommandEntry?.command ?? null;
  const commandParams: CommandParam[] = activeCommand?.params ?? [];

  // Inline param editing
  const handleParamChange = useCallback(
    (key: string, value: string) => {
      const block = panelCommands.activePanelCommand;
      const command = activeCommand;
      if (!block || !command) return;

      const nextParams = { ...(block.params ?? {}), [key]: value };
      const nextRawCommand = buildCommandString(command, nextParams);
      panelCommands.updateActivePanelCommands((commands: any[]) =>
        commands.map((b: any) =>
          b.id === block.id ? { ...b, params: nextParams, rawCommand: nextRawCommand } : b
        )
      );
    },
    [panelCommands.activePanelCommand, activeCommand, panelCommands]
  );

  return (
    <main
      ref={layout.workspaceRef}
      className={[
        "workspace-grid",
        layout.workspaceIsModalOpen ? "workspace-grid-modal-open" : "",
        layout.rightWorkspaceMaximized ? "workspace-grid-right-maximized" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ gridTemplateColumns: layout.workspaceColumns }}
    >
      {/* ── Column 1: 命令列表区域 ── */}
      <section className="panel cmdlist-panel">
        <div className="cmdlist-head">
          <select
            className="cmdlist-panel-select"
            value={panelList.activePanelId}
            onChange={(e) => {
              panelList.setActivePanelId(e.target.value);
              panelCommands.setActivePanelCommandId("");
            }}
          >
            {panelList.panels.map((panel: any) => (
              <option key={panel.id} value={panel.id}>
                {panel.name}
              </option>
            ))}
          </select>
          <div className="cmdlist-head-actions">
            <button
              className="ghost-button compact-button cmdlist-icon-btn"
              onClick={panelList.openCreatePanelDialog}
              title="新增面板"
              aria-label="新增面板"
            >
              <SvgIcon paths={SVG_ADD_NEW} size={16} />
            </button>
            <button
              className="ghost-button compact-button cmdlist-icon-btn"
              onClick={(e) => {
                if (panelList.activePanel) {
                  // Synthesize a right-click at the button location
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  panelList.openContextMenu(
                    { preventDefault() {}, stopPropagation() {}, clientX: rect.right, clientY: rect.bottom } as unknown as React.MouseEvent,
                    "panel",
                    panelList.activePanel.id
                  );
                }
              }}
              title="管理面板"
              aria-label="管理面板"
            >
              <SvgIcon paths={SVG_SETTINGS_PATHS} size={16} />
            </button>
          </div>
        </div>
        <div className="cmdlist-subhead">
          <div>
            <p className="section-kicker">命令列表</p>
            <h3>{panelList.activePanel?.name ?? "未选择面板"}</h3>
            <p className="panel-list-subtitle">
              {panelList.activePanel?.description ?? "请选择一个命令面板，再从弹窗里补充命令块。"}
            </p>
          </div>
          <button className="primary-button add-command-button" onClick={() => panelCommands.setCatalogOpen(true)}>
            添加命令
          </button>
        </div>
        <div className="panel-command-toolbar">
          <span className="badge info">命令块 {panelCommands.panelCommands.length}</span>
          {panelCommands.activePanelCommand ? (
            <span className="badge success">当前选中：{panelCommands.activePanelCommandTitle}</span>
          ) : null}
        </div>
        <div className="subcommand-list panel-scroll">
          {panelCommands.panelCommands.length === 0 ? (
            <div className="result-empty-state">当前面板还没有命令块。点击上方"添加命令"从命令目录中挑选。</div>
          ) : (
            panelCommands.panelCommands.map((block: any) => {
              const blockEntry = panelCommands.findCommandEntry(block.commandId);
              const blockCommand = blockEntry?.command ?? null;
              const blockTitle = panelCommands.getPanelCommandTitle(block, blockCommand);
              const isActive = panelCommands.activePanelCommand?.id === block.id;

              return (
                <article
                  key={block.id}
                  className={`subcommand-item panel-command-card ${isActive ? "active" : ""}`}
                  onContextMenu={(event) => panelList.openContextMenu(event, "command", block.id)}
                >
                  <div className="panel-command-card-head">
                    <button
                      className="subcommand-toggle"
                      onClick={() => panelCommands.setActivePanelCommandId(block.id)}
                    >
                      <span className="panel-command-title-line">
                        <strong>{blockTitle}</strong>
                        <span className="panel-command-summary">{block.summary}</span>
                      </span>
                      <code className="panel-command-inline-preview" title={block.rawCommand}>
                        {block.rawCommand}
                      </code>
                    </button>
                    <div className="panel-command-actions">
                      <button
                        className="catalog-quick-run-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          void panelCommands.runPanelCommandBlock(block);
                        }}
                      >
                        ▶ 执行
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      {/* ── Resize Handle 1 ── */}
      <div
        className="resize-handle resize-handle-first"
        onPointerDown={(event) => layout.beginHorizontalDrag("first", event)}
      />

      {/* ── Column 2: 命令参数编辑区 ── */}
      <section className="panel param-editor-panel">
        <div className="param-editor-head">
          <p className="section-kicker">命令参数编辑区</p>
        </div>
        <div className="param-editor-body panel-scroll">
          {panelCommands.activePanelCommand && activeCommand ? (
            commandParams.length > 0 ? (
              <div className="param-editor-fields">
                {commandParams.map((param: CommandParam) => {
                  if (isToggleParam(param)) {
                    // ── Flag param → checkbox ──
                    const toggleValue = getToggleParamValue(param);
                    const currentValue =
                      panelCommands.activePanelCommand.params?.[param.key] ?? param.defaultValue ?? "";
                    return (
                      <div className="param-field-row param-field-row-checkbox" key={param.key}>
                        <label className="param-toggle-row">
                          <input
                            type="checkbox"
                            checked={currentValue === toggleValue}
                            onChange={(e) => handleParamChange(param.key, e.target.checked ? toggleValue : "")}
                          />
                          <span>{getParamInlineText(param)}</span>
                        </label>
                      </div>
                    );
                  }

                  // ── Value param → text input ──
                  const currentValue =
                    panelCommands.activePanelCommand.params?.[param.key] ?? param.defaultValue ?? "";
                  return (
                    <div className="param-field-row" key={param.key}>
                      <label className="param-field-label">
                        {param.label}
                        {param.required ? <span className="param-required">*</span> : null}
                      </label>
                      <input
                        className="param-field-input"
                        type="text"
                        value={currentValue}
                        placeholder={param.placeholder}
                        onChange={(e) => handleParamChange(param.key, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="param-editor-hint">
                <p>该命令没有可编辑的参数。</p>
                <p className="param-editor-hint-sub">
                  如需调整，可在右侧工作区直接修改原始命令。
                </p>
              </div>
            )
          ) : (
            <div className="result-empty-state">先在左侧列表选中一个命令块，在此编辑参数。</div>
          )}
        </div>
      </section>

      {/* ── Resize Handle 2 ── */}
      {!layout.rightWorkspaceMaximized && !workspace.rightCollapsed ? (
        <div
          className="resize-handle resize-handle-second"
          onPointerDown={(event) => layout.beginHorizontalDrag("second", event)}
        />
      ) : null}

      {/* ── Column 3: 命令执行与结果工作区 ── */}
      <section
        className={`panel workspace-right-panel ${workspace.rightCollapsed ? "workspace-right-panel-collapsed" : ""}`}
      >
        <div className="workspace-right-header">
          {!workspace.rightCollapsed ? (
            <div>
              <p className="section-kicker">命令执行与结果工作区</p>
            </div>
          ) : null}
          <div className="workspace-right-actions" />
        </div>
        {!workspace.rightCollapsed ? (
          <>
            <div className="executor-box workspace-executor-box">
              <textarea
                value={workspace.rawCommand}
                onChange={(event) => workspace.updateActivePanelCommandRaw(event.target.value)}
                placeholder={
                  panelCommands.activePanelCommand ? "可在这里微调选中命令块的原始命令" : "先在中间选择一个命令块"
                }
                spellCheck={false}
                disabled={!panelCommands.activePanelCommand}
              />
              <div className="executor-actions">
                <button
                  className="primary-button"
                  disabled={!workspace.canRunCommand}
                  onClick={() => void workspace.handleRun()}
                >
                  执行并解析
                </button>
              </div>
            </div>
            <div className="result-section panel-scroll">
              <div className="result-head">
                <div className="result-head-main">
                  <p className="section-kicker">结果工作区</p>
                  <div className="result-search-row">
                    <input
                      value={result.resultSearchTerm}
                      onChange={(event) => result.setResultSearchTerm(event.target.value)}
                      placeholder="搜索结果关键词，例如 fallback / Pixel"
                    />
                    <div className="result-search-actions">
                      <div className="export-menu-wrap" ref={result.exportMenuRef}>
                        <button
                          className="ghost-button compact-button"
                          disabled={!result.lastRunResult}
                          onClick={() => result.setExportMenuOpen((open: boolean) => !open)}
                        >
                          导出
                        </button>
                        {result.exportMenuOpen ? (
                          <div className="export-menu panel">
                            <button
                              className="context-menu-item"
                              onClick={() => result.handleExportResult("markdown")}
                            >
                              导出 Markdown
                            </button>
                            <button
                              className="context-menu-item"
                              onClick={() => result.handleExportResult("txt")}
                            >
                              导出 TXT
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <span className="badge info">匹配 {result.resultMatchCount}</span>
                    </div>
                  </div>
                </div>
                <div className="chip-row">
                  <button
                    className={`chip ${result.activeResultTab === "structured" ? "active" : ""}`}
                    onClick={() => result.setActiveResultTab("structured")}
                  >
                    结构化
                  </button>
                  <button
                    className={`chip ${result.activeResultTab === "raw" ? "active" : ""}`}
                    onClick={() => result.setActiveResultTab("raw")}
                  >
                    原文
                  </button>
                  <button
                    className={`chip ${result.activeResultTab === "diff" ? "active" : ""}`}
                    onClick={() => result.setActiveResultTab("diff")}
                  >
                    差异
                  </button>
                  <button
                    className={`chip ${result.activeResultTab === "history" ? "active" : ""}`}
                    onClick={() => result.setActiveResultTab("history")}
                  >
                    历史
                  </button>
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
                            <strong className="execution-command-title">
                              {result.highlightText(result.executedCommandText, result.resultSearchTerm)}
                            </strong>
                          </div>
                          <span
                            className={`badge ${result.lastRunResult.status === "ok" ? "success" : "danger"}`}
                          >
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
                            <strong>
                              {result.lastRunResult.duration != null
                                ? `${result.lastRunResult.duration} ms`
                                : "未知"}
                            </strong>
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
                            <button
                              className="ghost-button copy-btn"
                              onClick={() => result.copyText(result.normalizeOutputText(result.lastRunResult))}
                            >
                              复制输出
                            </button>
                          </div>
                        </div>
                        {result.lastRunResult.stderr?.trim()
                          ? result.formatOutputBlock(
                              "错误输出",
                              result.lastRunResult.stderr.trimEnd(),
                              result.resultSearchTerm
                            )
                          : null}
                      </div>
                    ) : (
                      <div className="result-empty-state">
                        等待首次执行。结构化视图会把命令输出整理成更容易阅读的摘要与预览。
                      </div>
                    )}
                  </article>
                </div>
              ) : null}
              {result.activeResultTab === "raw" ? (
                <article className="result-card result-card-full">
                  <h3>原始输出</h3>
                  {result.lastRunResult?.stdout?.trim()
                    ? result.renderRawOutputSection("stdout", result.lastRunResult.stdout, result.resultSearchTerm)
                    : null}
                  {result.lastRunResult?.stderr?.trim()
                    ? result.renderRawOutputSection("stderr", result.lastRunResult.stderr, result.resultSearchTerm)
                    : null}
                  {!result.lastRunResult?.stdout?.trim() && !result.lastRunResult?.stderr?.trim() ? (
                    <div className="result-empty-state">
                      {result.highlightText(result.rawExecutionOutput, result.resultSearchTerm)}
                    </div>
                  ) : null}
                </article>
              ) : null}
              {result.activeResultTab === "diff" ? (
                <div className="result-grid">
                  <article className="result-card result-card-primary">
                    <div className="diff-selector-row">
                      <div className="diff-select-field diff-select-card">
                        {result.renderDiffDropdown("left", "左侧记录", result.leftDiffOption, result.setLeftDiffTargetId)}
                      </div>
                      <div className="diff-select-field diff-select-card">
                        {result.renderDiffDropdown(
                          "right",
                          "右侧记录",
                          result.rightDiffOption,
                          result.setRightDiffTargetId
                        )}
                      </div>
                    </div>
                  </article>
                  <article className="result-card result-card-primary">
                    {result.leftDiffResult && result.rightDiffResult ? (
                      <div className="diff-table-wrap">
                        <div className="diff-table-head">
                          <div className="diff-table-side">
                            <span>左侧文本</span>
                            <button
                              className="icon-button diff-copy-button"
                              onClick={() => result.copyText(result.leftDiffOutput)}
                              title="复制左侧文本"
                              aria-label="复制左侧文本"
                            >
                              <span className="icon icon-copy" aria-hidden="true" />
                            </button>
                          </div>
                          <div className="diff-table-side">
                            <span>右侧文本</span>
                            <button
                              className="icon-button diff-copy-button"
                              onClick={() => result.copyText(result.rightDiffOutput)}
                              title="复制右侧文本"
                              aria-label="复制右侧文本"
                            >
                              <span className="icon icon-copy" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        <div className="diff-table-body">
                          {result.diffRows.map((row: any, index: number) => (
                            <div
                              className={`diff-line-row diff-line-row-${row.kind}`}
                              key={`${row.leftLineNumber ?? "l"}-${row.rightLineNumber ?? "r"}-${index}`}
                            >
                              <div
                                className={`${`diff-line-cell ${row.kind === "changed" || row.kind === "removed" ? `diff-line-cell-${row.kind}` : ""}`.trim()}`}
                              >
                                <span className="diff-line-number">{row.leftLineNumber ?? ""}</span>
                                <code>{result.renderDiffText(row.leftSegments, result.resultSearchTerm)}</code>
                              </div>
                              <div
                                className={`${`diff-line-cell ${row.kind === "changed" || row.kind === "added" ? `diff-line-cell-${row.kind}` : ""}`.trim()}`}
                              >
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
                      <input
                        type="checkbox"
                        checked={result.historyShowUserOnly}
                        onChange={(event) => {
                          result.setHistoryShowUserOnly(event.target.checked);
                          result.setHistoryPage(0);
                        }}
                      />
                      <span>只显示用户执行历史</span>
                    </label>
                    {result.filteredHistoryItems.length > result.HISTORY_PAGE_SIZE ? (
                      <div className="history-pagination">
                        <button
                          type="button"
                          className="ghost-button compact-button"
                          disabled={result.historyPage === 0}
                          onClick={() => result.setHistoryPage((page: number) => page - 1)}
                        >
                          上一页
                        </button>
                        <span className="badge info">
                          第 {result.historyPage + 1} /{" "}
                          {Math.ceil(result.filteredHistoryItems.length / result.HISTORY_PAGE_SIZE)} 页
                        </span>
                        <button
                          type="button"
                          className="ghost-button compact-button"
                          disabled={
                            (result.historyPage + 1) * result.HISTORY_PAGE_SIZE >=
                            result.filteredHistoryItems.length
                          }
                          onClick={() => result.setHistoryPage((page: number) => page + 1)}
                        >
                          下一页
                        </button>
                      </div>
                    ) : null}
                    {result.executionHistory.length ? (
                      <div className="history-toolbar-actions">
                        {result.historyClearConfirmOpen ? (
                          <>
                            <button
                              className="ghost-button compact-button history-clear-confirm-button"
                              onClick={() => void result.handleClearHistory()}
                            >
                              确认清空
                            </button>
                            <button
                              className="ghost-button compact-button"
                              onClick={() => result.setHistoryClearConfirmOpen(false)}
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <button
                            className="ghost-button compact-button history-clear-button"
                            onClick={() => {
                              result.setPendingHistoryDeleteId(null);
                              result.setHistoryClearConfirmOpen(true);
                            }}
                          >
                            清除全部
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                  {result.filteredHistoryItems.length ? (
                    <div className="history-card-list history-card-list-single">
                      {result.filteredHistoryItems
                        .slice(
                          result.historyPage * result.HISTORY_PAGE_SIZE,
                          (result.historyPage + 1) * result.HISTORY_PAGE_SIZE
                        )
                        .map((item: any) => (
                          <div className="history-card-item history-card-item-row" key={item.record_id}>
                            <div className="history-card-head history-card-head-row">
                              <div className="history-card-main">
                                <strong className="history-card-command">
                                  {result.highlightText(
                                    item.executedCommand ?? item.raw ?? item.command_title,
                                    result.resultSearchTerm
                                  )}
                                </strong>
                                <div className="history-card-subline">
                                  <span className="badge info history-card-device-badge">
                                    {result.highlightText(item.device_name, result.resultSearchTerm)}
                                  </span>
                                  <span className="history-card-time">
                                    {result.highlightText(result.formatHistoryTimestamp(item), result.resultSearchTerm)}
                                  </span>
                                </div>
                              </div>
                              <div className="history-card-actions">
                                <span className={`badge ${item.status === "ok" ? "success" : "danger"}`}>
                                  {item.status}
                                </span>
                                <button
                                  className="ghost-button compact-button history-detail-button"
                                  onClick={() => {
                                    result.setHistoryDetailRecordId(item.record_id);
                                    result.setHistoryDetailTab("structured");
                                  }}
                                >
                                  详情
                                </button>
                                {result.pendingHistoryDeleteId === item.record_id ? (
                                  <>
                                    <button
                                      className="ghost-button compact-button history-delete-confirm-button"
                                      onClick={() => void result.handleDeleteHistoryItem(item.record_id)}
                                    >
                                      确认删除
                                    </button>
                                    <button
                                      className="ghost-button compact-button"
                                      onClick={() => result.setPendingHistoryDeleteId(null)}
                                    >
                                      取消
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    className="ghost-button compact-button history-delete-button"
                                    onClick={() => {
                                      result.setHistoryClearConfirmOpen(false);
                                      result.setPendingHistoryDeleteId(item.record_id);
                                    }}
                                  >
                                    删除
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="history-card-meta">
                              <span>退出码 {item.exitCode ?? "未知"}</span>
                              <span>{item.duration != null ? `${item.duration} ms` : "耗时未知"}</span>
                              <span>
                                {result.highlightText(item.command_title, result.resultSearchTerm)}
                              </span>
                            </div>
                            {item.stdout?.trim() || item.stderr?.trim() ? (
                              <div className="history-card-preview">
                                {result.highlightText(
                                  result.summarizeOutputToSingleLine(result.historyItemToRunResult(item)),
                                  result.resultSearchTerm
                                )}
                              </div>
                            ) : null}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="result-empty-state">
                      {result.resultSearchTerm.trim()
                        ? "没有匹配的历史记录。"
                        : "暂无历史记录。执行命令后会自动追加到这里。"}
                    </div>
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
