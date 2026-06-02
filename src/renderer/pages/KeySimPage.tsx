import type { Dispatch, MouseEvent, SetStateAction } from "react";

type KeySimTab = "quick" | "visual" | "multitouch" | "macro" | "record";
type KeySimQuickActionType = "key" | "tap" | "swipe" | "multitouch";
type KeySimMacroStepType = "key" | "tap" | "swipe" | "adb";

interface KeySimFingerPath {
  id: string;
  startX: string;
  startY: string;
  endX: string;
  endY: string;
  durationMs: string;
}

interface KeySimQuickAction {
  id: string;
  name: string;
  type: KeySimQuickActionType;
  value: string;
  size: "1x1" | "2x1" | "2x2";
  pressMode: "tap" | "long";
  durationMs: string;
}

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

interface KeySimRepeatProgress {
  current: number;
  total: number;
}

interface KeySimRepeatDialog {
  taskId: string;
  count: string;
  intervalMs: string;
}

interface KeySimPageProps {
  currentDeviceLabel: string;
  hasCurrentDevice: boolean;
  keySimBusy: boolean;
  keySimMacroRunning: boolean;
  keySimMacroRepeatProgress: KeySimRepeatProgress | null;
  onCancelMacroRepeat: () => void;
  keySimTabs: Array<{ id: KeySimTab; label: string; description: string }>;
  keySimTab: KeySimTab;
  setKeySimTab: Dispatch<SetStateAction<KeySimTab>>;
  keySimQuickAddMenuOpen: boolean;
  setKeySimQuickAddMenuOpen: Dispatch<SetStateAction<boolean>>;
  openCreateQuickAction: (type: KeySimQuickActionType) => void;
  keySimQuickActions: KeySimQuickAction[];
  keySimQuickDraggingId: string | null;
  setKeySimQuickDraggingId: Dispatch<SetStateAction<string | null>>;
  moveQuickCard: (dragId: string, targetId: string) => void;
  getQuickActionSummary: (action: KeySimQuickAction) => string;
  onRunQuickAction: (action: KeySimQuickAction) => Promise<void> | void;
  openEditQuickAction: (action: KeySimQuickAction) => void;
  setKeySimQuickActions: Dispatch<SetStateAction<KeySimQuickAction[]>>;
  keySimQuickDraft: KeySimQuickAction | null;
  setKeySimQuickDraft: Dispatch<SetStateAction<KeySimQuickAction | null>>;
  keySimQuickDraftMode: "create" | "edit";
  closeQuickDraft: () => void;
  knownKeycodes: readonly string[];
  handleQuickDraftTypeChange: (type: KeySimQuickActionType) => void;
  updateQuickDraftCsvPart: (partIndex: number, totalParts: number, nextValue: string) => void;
  openQuickDraftScreenshotPicker: (mode: "tap" | "swipe", target?: "quick" | "macro") => Promise<void> | void;
  saveQuickDraft: () => void;
  keySimScreenshotLoading: boolean;
  onRefreshScreenshot: () => Promise<void> | void;
  keySimMode: "tap" | "swipe";
  setKeySimMode: Dispatch<SetStateAction<"tap" | "swipe">>;
  keySimSwipeDurationMs: string;
  setKeySimSwipeDurationMs: Dispatch<SetStateAction<string>>;
  keySimScreenshotDataUrl: string;
  setKeySimScreenshotSize: Dispatch<SetStateAction<{ width: number; height: number }>>;
  handleKeySimImageClick: (event: MouseEvent<HTMLImageElement>) => void;
  keySimScreenshotSize: { width: number; height: number };
  keySimTouchSize: { width: number; height: number } | null;
  keySimTapPoint: { x: number; y: number } | null;
  keySimSwipeStart: { x: number; y: number } | null;
  keySimSwipeEnd: { x: number; y: number } | null;
  onRunKeySimTap: () => Promise<void> | void;
  onRunKeySimSwipe: () => Promise<void> | void;
  keySimFingerPaths: KeySimFingerPath[];
  setKeySimFingerPaths: Dispatch<SetStateAction<KeySimFingerPath[]>>;
  addKeySimFingerPath: () => void;
  onRunMultiTouchSwipe: () => Promise<void> | void;
  openCreateMacroTask: () => void;
  keySimMacroTasks: KeySimMacroTask[];
  onRunMacroTask: (task: KeySimMacroTask) => Promise<void> | void;
  setKeySimMacroRepeatDialog: Dispatch<SetStateAction<KeySimRepeatDialog | null>>;
  startInfiniteExecution: (task: KeySimMacroTask) => Promise<void> | void;
  openEditMacroTask: (task: KeySimMacroTask) => void;
  deleteMacroTask: (taskId: string) => void;
  keySimMacroTaskDialogOpen: boolean;
  keySimMacroTaskDraftId: string | null;
  closeMacroTaskDialog: () => void;
  keySimMacroTaskDraftName: string;
  setKeySimMacroTaskDraftName: Dispatch<SetStateAction<string>>;
  keySimMacroAddMenuOpen: boolean;
  setKeySimMacroAddMenuOpen: Dispatch<SetStateAction<boolean>>;
  openCreateMacroStep: (type: KeySimMacroStepType) => void;
  keySimMacroSteps: KeySimMacroStep[];
  openEditMacroStep: (step: KeySimMacroStep) => void;
  setKeySimMacroSteps: Dispatch<SetStateAction<KeySimMacroStep[]>>;
  saveMacroTaskDialog: () => void;
  keySimMacroDraft: KeySimMacroStep | null;
  keySimMacroDraftMode: "create" | "edit";
  closeMacroDraft: () => void;
  setKeySimMacroDraft: Dispatch<SetStateAction<KeySimMacroStep | null>>;
  createMacroStepDraft: (type: KeySimMacroStepType) => KeySimMacroStep;
  saveMacroDraft: () => void;
  keySimMacroRepeatDialog: KeySimRepeatDialog | null;
  handleRunMacroTaskRepeated: () => Promise<void> | void;
}

export default function KeySimPage({
  currentDeviceLabel,
  hasCurrentDevice,
  keySimBusy,
  keySimMacroRunning,
  keySimMacroRepeatProgress,
  onCancelMacroRepeat,
  keySimTabs,
  keySimTab,
  setKeySimTab,
  keySimQuickAddMenuOpen,
  setKeySimQuickAddMenuOpen,
  openCreateQuickAction,
  keySimQuickActions,
  keySimQuickDraggingId,
  setKeySimQuickDraggingId,
  moveQuickCard,
  getQuickActionSummary,
  onRunQuickAction,
  openEditQuickAction,
  setKeySimQuickActions,
  keySimQuickDraft,
  setKeySimQuickDraft,
  keySimQuickDraftMode,
  closeQuickDraft,
  knownKeycodes,
  handleQuickDraftTypeChange,
  updateQuickDraftCsvPart,
  openQuickDraftScreenshotPicker,
  saveQuickDraft,
  keySimScreenshotLoading,
  onRefreshScreenshot,
  keySimMode,
  setKeySimMode,
  keySimSwipeDurationMs,
  setKeySimSwipeDurationMs,
  keySimScreenshotDataUrl,
  setKeySimScreenshotSize,
  handleKeySimImageClick,
  keySimScreenshotSize,
  keySimTouchSize,
  keySimTapPoint,
  keySimSwipeStart,
  keySimSwipeEnd,
  onRunKeySimTap,
  onRunKeySimSwipe,
  keySimFingerPaths,
  setKeySimFingerPaths,
  addKeySimFingerPath,
  onRunMultiTouchSwipe,
  openCreateMacroTask,
  keySimMacroTasks,
  onRunMacroTask,
  setKeySimMacroRepeatDialog,
  startInfiniteExecution,
  openEditMacroTask,
  deleteMacroTask,
  keySimMacroTaskDialogOpen,
  keySimMacroTaskDraftId,
  closeMacroTaskDialog,
  keySimMacroTaskDraftName,
  setKeySimMacroTaskDraftName,
  keySimMacroAddMenuOpen,
  setKeySimMacroAddMenuOpen,
  openCreateMacroStep,
  keySimMacroSteps,
  openEditMacroStep,
  setKeySimMacroSteps,
  saveMacroTaskDialog,
  keySimMacroDraft,
  keySimMacroDraftMode,
  closeMacroDraft,
  setKeySimMacroDraft,
  createMacroStepDraft,
  saveMacroDraft,
  keySimMacroRepeatDialog,
  handleRunMacroTaskRepeated,
}: KeySimPageProps) {
  return (
    <main className="page-shell">
      <section className="panel page-panel info-page-panel">
        <div className="page-header">
          <div>
            <h3>按键模拟</h3>
            <p className="panel-list-subtitle">点击即可下发 input keyevent / tap / swipe，并支持宏编排。</p>
          </div>
          <div className="page-header-badges">
            <span className="badge info">当前设备：{currentDeviceLabel}</span>
            <span className="badge warning">状态：{keySimBusy || keySimMacroRunning ? (keySimMacroRepeatProgress ? `执行中 ${keySimMacroRepeatProgress.current}/${keySimMacroRepeatProgress.total === Infinity ? "∞" : keySimMacroRepeatProgress.total}` : "执行中") : "就绪"}</span>
            {keySimMacroRepeatProgress ? <button className="danger-button compact-button" onClick={onCancelMacroRepeat}>终止</button> : null}
          </div>
        </div>

        <div className="device-info-layout">
          <aside className="device-info-sidebar">
            {keySimTabs.map((tab) => (
              <button key={tab.id} className={`device-info-tab ${keySimTab === tab.id ? "active" : ""}`} onClick={() => setKeySimTab(tab.id)}>
                <strong>{tab.label}</strong>
              </button>
            ))}
          </aside>

          <div className="device-info-content">
            {keySimTab === "quick" ? (
              <>
                <div className="keysim-quick-head">
                  <p className="section-kicker">常用按键快捷栏</p>
                  <div className="keysim-quick-add-wrap">
                    <button className="primary-button" onClick={() => setKeySimQuickAddMenuOpen((prev) => !prev)}>新增动作</button>
                    {keySimQuickAddMenuOpen ? (
                      <div className="keysim-quick-add-menu">
                        <button type="button" onClick={() => openCreateQuickAction("key")}>按键</button>
                        <button type="button" onClick={() => openCreateQuickAction("tap")}>点击</button>
                        <button type="button" onClick={() => openCreateQuickAction("swipe")}>滑动</button>
                      </div>
                    ) : null}
                  </div>
                </div>
                <p className="param-hint keysim-quick-hint">卡片支持拖拽排序与尺寸调整。按键/点击支持单击与长按；点击与滑动支持直接输入坐标，点击可在弹窗里基于截图取点。</p>
                <div className="keysim-quick-cards">
                  {keySimQuickActions.map((action) => (
                    <article
                      key={action.id}
                      className={`keysim-quick-card size-${action.size} ${keySimQuickDraggingId === action.id ? "dragging" : ""}`}
                      draggable
                      onDragStart={() => setKeySimQuickDraggingId(action.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (keySimQuickDraggingId) {
                          moveQuickCard(keySimQuickDraggingId, action.id);
                        }
                        setKeySimQuickDraggingId(null);
                      }}
                      onDragEnd={() => setKeySimQuickDraggingId(null)}
                    >
                      <div className="keysim-quick-card-top">
                        <strong>{action.name}</strong>
                        <span className="badge info">{action.type === "key" ? "按键" : action.type === "tap" ? "点击" : action.type === "swipe" ? "滑动" : "多指"}</span>
                      </div>
                      <p className="keysim-quick-card-summary">{getQuickActionSummary(action)}</p>
                      <div className="keysim-quick-card-actions">
                        <button className="primary-button compact-button" disabled={!hasCurrentDevice || keySimBusy || keySimMacroRunning} onClick={() => void onRunQuickAction(action)}>执行</button>
                        <button className="ghost-button compact-button" onClick={() => openEditQuickAction(action)}>编辑</button>
                        <button className="ghost-button compact-button" onClick={() => setKeySimQuickActions((prev) => prev.filter((item) => item.id !== action.id))}>删除</button>
                      </div>
                    </article>
                  ))}
                </div>

                {keySimQuickDraft ? (
                  <div className="modal-mask" role="dialog" aria-modal="true">
                    <div className="modal-card keysim-quick-modal">
                      <div className="modal-head">
                        <h3>{keySimQuickDraftMode === "create" ? "新增动作" : "编辑动作"}</h3>
                        <button className="icon-button" onClick={closeQuickDraft}>×</button>
                      </div>
                      <div className="modal-body keysim-quick-modal-body">
                        <label className="param-field">
                          <span>动作名称</span>
                          <input value={keySimQuickDraft.name} onChange={(event) => setKeySimQuickDraft((current) => current ? { ...current, name: event.target.value } : current)} placeholder="请输入动作名称" />
                        </label>
                        <label className="param-field">
                          <span>动作类型</span>
                          <select value={keySimQuickDraft.type} onChange={(event) => handleQuickDraftTypeChange(event.target.value as KeySimQuickActionType)}>
                            <option value="key">按键</option>
                            <option value="tap">点击</option>
                            <option value="swipe">滑动</option>
                            <option value="multitouch">多指滑动</option>
                          </select>
                        </label>
                        <label className="param-field">
                          <span>卡片尺寸</span>
                          <select value={keySimQuickDraft.size} onChange={(event) => setKeySimQuickDraft((current) => current ? { ...current, size: event.target.value as "1x1" | "2x1" | "2x2" } : current)}>
                            <option value="1x1">1x1</option>
                            <option value="2x1">2x1</option>
                            <option value="2x2">2x2</option>
                          </select>
                        </label>

                        {keySimQuickDraft.type === "key" ? (
                          <>
                            <label className="param-field">
                              <span>KeyCode（可选已知值或数字）</span>
                              <input list="known-keycodes" value={keySimQuickDraft.value} onChange={(event) => setKeySimQuickDraft((current) => current ? { ...current, value: event.target.value } : current)} placeholder="KEYCODE_HOME 或 3" />
                              <datalist id="known-keycodes">
                                {knownKeycodes.map((code) => <option key={code} value={code} />)}
                              </datalist>
                            </label>
                            <label className="param-field">
                              <span>触发方式</span>
                              <select value={keySimQuickDraft.pressMode} onChange={(event) => setKeySimQuickDraft((current) => current ? { ...current, pressMode: event.target.value as "tap" | "long" } : current)}>
                                <option value="tap">单击</option>
                                <option value="long">长按</option>
                              </select>
                            </label>
                          </>
                        ) : null}

                        {keySimQuickDraft.type === "tap" ? (
                          <>
                            <div className="keysim-quick-param-grid keysim-quick-param-grid-2">
                              {(() => {
                                const parts = keySimQuickDraft.value.split(",").map((part) => part.trim());
                                while (parts.length < 2) {
                                  parts.push("");
                                }
                                return (
                                  <>
                                    <label><span>X</span><input value={parts[0]} onChange={(event) => updateQuickDraftCsvPart(0, 2, event.target.value)} placeholder="540" /></label>
                                    <label><span>Y</span><input value={parts[1]} onChange={(event) => updateQuickDraftCsvPart(1, 2, event.target.value)} placeholder="1800" /></label>
                                  </>
                                );
                              })()}
                            </div>
                            <div className="page-actions">
                              <button className="ghost-button compact-button" onClick={() => void openQuickDraftScreenshotPicker("tap")}>去实时截图取点</button>
                            </div>
                            <label className="param-field">
                              <span>触发方式</span>
                              <select value={keySimQuickDraft.pressMode} onChange={(event) => setKeySimQuickDraft((current) => current ? { ...current, pressMode: event.target.value as "tap" | "long" } : current)}>
                                <option value="tap">单击</option>
                                <option value="long">长按</option>
                              </select>
                            </label>
                            {keySimQuickDraft.pressMode === "long" ? (
                              <label className="param-field">
                                <span>按下时长(ms)</span>
                                <input value={keySimQuickDraft.durationMs} onChange={(event) => setKeySimQuickDraft((current) => current ? { ...current, durationMs: event.target.value } : current)} placeholder="500" />
                              </label>
                            ) : null}
                          </>
                        ) : null}

                        {keySimQuickDraft.type === "swipe" ? (
                          <>
                            <div className="keysim-quick-param-grid keysim-quick-param-grid-5">
                              {(() => {
                                const parts = keySimQuickDraft.value.split(",").map((part) => part.trim());
                                while (parts.length < 5) {
                                  parts.push("");
                                }
                                return (
                                  <>
                                    <label><span>起点X</span><input value={parts[0]} onChange={(event) => updateQuickDraftCsvPart(0, 5, event.target.value)} placeholder="540" /></label>
                                    <label><span>起点Y</span><input value={parts[1]} onChange={(event) => updateQuickDraftCsvPart(1, 5, event.target.value)} placeholder="1800" /></label>
                                    <label><span>终点X</span><input value={parts[2]} onChange={(event) => updateQuickDraftCsvPart(2, 5, event.target.value)} placeholder="540" /></label>
                                    <label><span>终点Y</span><input value={parts[3]} onChange={(event) => updateQuickDraftCsvPart(3, 5, event.target.value)} placeholder="600" /></label>
                                    <label><span>时长(ms)</span><input value={parts[4]} onChange={(event) => updateQuickDraftCsvPart(4, 5, event.target.value)} placeholder="300" /></label>
                                  </>
                                );
                              })()}
                            </div>
                            <div className="page-actions">
                              <button className="ghost-button compact-button" onClick={() => void openQuickDraftScreenshotPicker("swipe")}>去实时截图取起终点</button>
                            </div>
                          </>
                        ) : null}

                        {keySimQuickDraft.type === "multitouch" ? (
                          <>
                            <label className="param-field">
                              <span>轨迹串（每指一段，分号分隔）</span>
                              <textarea value={keySimQuickDraft.value} onChange={(event) => setKeySimQuickDraft((current) => current ? { ...current, value: event.target.value } : current)} placeholder="200,1200,200,400,300;880,1200,880,400,300" />
                            </label>
                            <p className="param-hint">建议格式：x1,y1,x2,y2,duration; x1,y1,x2,y2,duration</p>
                          </>
                        ) : null}
                      </div>
                      <div className="modal-foot">
                        <button className="ghost-button" onClick={closeQuickDraft}>取消</button>
                        <button className="primary-button" onClick={saveQuickDraft}>保存</button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {keySimTab === "visual" ? (
              <>
                <p className="section-kicker">可视化坐标点击与滑动</p>
                <div className="page-actions keysim-actions-row">
                  <button className="ghost-button" disabled={!hasCurrentDevice || keySimScreenshotLoading} onClick={() => void onRefreshScreenshot()}>{keySimScreenshotLoading ? "截图中..." : "刷新截图"}</button>
                  <button className={`chip ${keySimMode === "tap" ? "active" : ""}`} onClick={() => setKeySimMode("tap")}>点击模式</button>
                  <button className={`chip ${keySimMode === "swipe" ? "active" : ""}`} onClick={() => setKeySimMode("swipe")}>滑动模式</button>
                  {keySimMode === "swipe" ? <input className="param-input keysim-duration-input" value={keySimSwipeDurationMs} onChange={(event) => setKeySimSwipeDurationMs(event.target.value)} placeholder="滑动时长(ms)" /> : null}
                </div>

                {keySimScreenshotDataUrl ? (
                  <div className="keysim-screenshot-shell">
                    <img
                      className="keysim-screenshot"
                      src={keySimScreenshotDataUrl}
                      alt="设备截图"
                      onLoad={(event) => {
                        setKeySimScreenshotSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
                      }}
                      onClick={handleKeySimImageClick}
                    />
                  </div>
                ) : (
                  <div className="result-empty-state">请先点击“刷新截图”加载可交互画面。</div>
                )}

                <div className="keysim-point-summary">
                  <span className="chip">截图坐标系：{keySimScreenshotSize.width > 0 ? `${keySimScreenshotSize.width}x${keySimScreenshotSize.height}` : "未加载"}</span>
                  <span className="chip">触控坐标系：{keySimTouchSize ? `${keySimTouchSize.width}x${keySimTouchSize.height}` : "使用截图坐标系"}</span>
                  {keySimMode === "tap" ? (
                    <span className="chip">点击坐标：{keySimTapPoint ? `${keySimTapPoint.x}, ${keySimTapPoint.y}` : "未设置"}</span>
                  ) : (
                    <>
                      <span className="chip">起点：{keySimSwipeStart ? `${keySimSwipeStart.x}, ${keySimSwipeStart.y}` : "未设置"}</span>
                      <span className="chip">终点：{keySimSwipeEnd ? `${keySimSwipeEnd.x}, ${keySimSwipeEnd.y}` : "未设置"}</span>
                    </>
                  )}
                </div>

                <div className="page-actions">
                  {keySimMode === "tap" ? (
                    <button className="primary-button" disabled={!keySimTapPoint || keySimBusy} onClick={() => void onRunKeySimTap()}>执行 tap</button>
                  ) : (
                    <button className="primary-button" disabled={!keySimSwipeStart || !keySimSwipeEnd || keySimBusy} onClick={() => void onRunKeySimSwipe()}>执行 swipe</button>
                  )}
                </div>
              </>
            ) : null}

            {keySimTab === "multitouch" ? (
              <>
                <p className="section-kicker">多指滑动</p>
                <p className="param-hint keysim-finger-hint">每一行代表一根手指：起点/终点为屏幕坐标（像素），时长为该手指从起点滑到终点的时间。</p>
                <div className="keysim-finger-header" aria-hidden="true">
                  <span>手指</span>
                  <span>起点X</span>
                  <span>起点Y</span>
                  <span>终点X</span>
                  <span>终点Y</span>
                  <span>时长(ms)</span>
                  <span>操作</span>
                </div>
                <div className="keysim-finger-list">
                  {keySimFingerPaths.map((path, index) => (
                    <div key={path.id} className="keysim-finger-row">
                      <span className="badge info">手指 {index + 1}</span>
                      <input aria-label={`手指${index + 1}起点X`} title="起点X：手指按下时的横坐标" value={path.startX} onChange={(event) => setKeySimFingerPaths((prev) => prev.map((item) => item.id === path.id ? { ...item, startX: event.target.value } : item))} placeholder="起点X" />
                      <input aria-label={`手指${index + 1}起点Y`} title="起点Y：手指按下时的纵坐标" value={path.startY} onChange={(event) => setKeySimFingerPaths((prev) => prev.map((item) => item.id === path.id ? { ...item, startY: event.target.value } : item))} placeholder="起点Y" />
                      <input aria-label={`手指${index + 1}终点X`} title="终点X：手指抬起时的横坐标" value={path.endX} onChange={(event) => setKeySimFingerPaths((prev) => prev.map((item) => item.id === path.id ? { ...item, endX: event.target.value } : item))} placeholder="终点X" />
                      <input aria-label={`手指${index + 1}终点Y`} title="终点Y：手指抬起时的纵坐标" value={path.endY} onChange={(event) => setKeySimFingerPaths((prev) => prev.map((item) => item.id === path.id ? { ...item, endY: event.target.value } : item))} placeholder="终点Y" />
                      <input aria-label={`手指${index + 1}时长毫秒`} title="时长：本根手指滑动耗时（毫秒）" value={path.durationMs} onChange={(event) => setKeySimFingerPaths((prev) => prev.map((item) => item.id === path.id ? { ...item, durationMs: event.target.value } : item))} placeholder="时长ms" />
                      <button className="ghost-button compact-button" onClick={() => setKeySimFingerPaths((prev) => prev.filter((item) => item.id !== path.id))}>移除</button>
                    </div>
                  ))}
                </div>
                <div className="page-actions">
                  <button className="ghost-button" onClick={addKeySimFingerPath}>新增手指</button>
                  <button className="primary-button" disabled={!keySimFingerPaths.length || keySimBusy} onClick={() => void onRunMultiTouchSwipe()}>执行多指滑动</button>
                </div>
              </>
            ) : null}

            {keySimTab === "macro" ? (
              <>
                <div className="keysim-quick-head">
                  <p className="section-kicker">按键编排</p>
                  <button className="primary-button" onClick={openCreateMacroTask}>新增编排任务</button>
                </div>
                <div className="keysim-macro-list">
                  {keySimMacroTasks.map((task, index) => (
                    <div className="keysim-macro-summary-row" key={task.id}>
                      <span className="badge info">任务 {index + 1}</span>
                      <span className="badge">步骤 {task.steps.length}</span>
                      <strong>{task.name}</strong>
                      <div className="keysim-macro-actions">
                        <button className="primary-button compact-button" disabled={!task.steps.length || keySimMacroRunning} onClick={() => void onRunMacroTask(task)}>{keySimMacroRunning ? "执行中..." : "执行"}</button>
                        <button className="ghost-button compact-button" disabled={!task.steps.length || keySimMacroRunning} onClick={() => setKeySimMacroRepeatDialog({ taskId: task.id, count: "2", intervalMs: "300" })}>重复执行</button>
                        <button className="ghost-button compact-button" disabled={!task.steps.length || keySimMacroRunning} onClick={() => void startInfiniteExecution(task)}>无限执行</button>
                        {keySimMacroRepeatProgress ? <button className="danger-button compact-button" onClick={onCancelMacroRepeat}>终止 ({keySimMacroRepeatProgress.current}/{keySimMacroRepeatProgress.total === Infinity ? "∞" : keySimMacroRepeatProgress.total})</button> : null}
                        <button className="ghost-button compact-button" onClick={() => openEditMacroTask(task)}>编辑</button>
                        <button className="ghost-button compact-button" onClick={() => deleteMacroTask(task.id)}>删除</button>
                      </div>
                    </div>
                  ))}
                </div>

                {!keySimMacroTasks.length ? <div className="result-empty-state">暂无编排任务，请先新建。</div> : null}

                {keySimMacroTaskDialogOpen ? (
                  <div className="modal-mask" role="dialog" aria-modal="true">
                    <div className="modal-card keysim-quick-modal keysim-task-modal">
                      <div className="modal-head">
                        <h3>{keySimMacroTaskDraftId ? "编辑编排任务" : "新增编排任务"}</h3>
                        <button className="icon-button" onClick={closeMacroTaskDialog}>×</button>
                      </div>
                      <div className="modal-body keysim-quick-modal-body">
                        <label className="param-field">
                          <span>任务名称</span>
                          <input value={keySimMacroTaskDraftName} onChange={(event) => setKeySimMacroTaskDraftName(event.target.value)} placeholder="请输入编排任务名称" />
                        </label>

                        <div className="keysim-quick-head">
                          <p className="section-kicker">步骤列表</p>
                          <div className="keysim-quick-add-wrap">
                            <button className="primary-button" onClick={() => setKeySimMacroAddMenuOpen((prev) => !prev)}>新增步骤</button>
                            {keySimMacroAddMenuOpen ? (
                              <div className="keysim-quick-add-menu">
                                <button type="button" onClick={() => openCreateMacroStep("key")}>按键</button>
                                <button type="button" onClick={() => openCreateMacroStep("tap")}>点击</button>
                                <button type="button" onClick={() => openCreateMacroStep("swipe")}>滑动</button>
                                <button type="button" onClick={() => openCreateMacroStep("adb")}>ADB 命令</button>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="keysim-macro-list">
                          {keySimMacroSteps.map((step, index) => (
                            <div className="keysim-macro-summary-row" key={step.id}>
                              <span className="badge info">步骤 {index + 1}</span>
                              <span className="badge">{step.type === "key" ? "按键" : step.type === "tap" ? "点击" : step.type === "swipe" ? "滑动" : "ADB"}</span>
                              <strong>{step.name || `步骤 ${index + 1}`}</strong>
                              <div className="keysim-macro-actions">
                                <button className="ghost-button compact-button" onClick={() => openEditMacroStep(step)}>编辑</button>
                                <button className="ghost-button compact-button" onClick={() => setKeySimMacroSteps((prev) => prev.filter((item) => item.id !== step.id))}>删除</button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {!keySimMacroSteps.length ? <div className="result-empty-state">当前任务暂无步骤，请先新增。</div> : null}
                      </div>
                      <div className="modal-foot">
                        <button className="ghost-button" onClick={closeMacroTaskDialog}>取消</button>
                        <button className="primary-button" onClick={saveMacroTaskDialog}>保存任务</button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {keySimMacroDraft ? (
                  <div className="modal-mask" role="dialog" aria-modal="true">
                    <div className="modal-card keysim-quick-modal">
                      <div className="modal-head">
                        <h3>{keySimMacroDraftMode === "create" ? "新增步骤" : "编辑步骤"}</h3>
                        <button className="icon-button" onClick={closeMacroDraft}>×</button>
                      </div>
                      <div className="modal-body keysim-quick-modal-body">
                        <label className="param-field">
                          <span>步骤名称</span>
                          <input value={keySimMacroDraft.name} onChange={(event) => setKeySimMacroDraft((current) => current ? { ...current, name: event.target.value } : current)} placeholder="请输入步骤名称" />
                        </label>
                        <label className="param-field">
                          <span>步骤类型</span>
                          <select value={keySimMacroDraft.type} onChange={(event) => {
                            const type = event.target.value as KeySimMacroStepType;
                            const next = createMacroStepDraft(type);
                            setKeySimMacroDraft((current) => current ? { ...current, type, value: next.value } : current);
                          }}>
                            <option value="key">按键</option>
                            <option value="tap">点击</option>
                            <option value="swipe">滑动</option>
                            <option value="adb">ADB 命令</option>
                          </select>
                        </label>
                        <label className="param-field">
                          <span>步骤参数</span>
                          <input value={keySimMacroDraft.value} onChange={(event) => setKeySimMacroDraft((current) => current ? { ...current, value: event.target.value } : current)} placeholder={keySimMacroDraft.type === "key" ? "KEYCODE_HOME" : keySimMacroDraft.type === "tap" ? "x,y" : keySimMacroDraft.type === "swipe" ? "x1,y1,x2,y2,duration" : "adb shell ..."} />
                        </label>
                        {keySimMacroDraft.type === "tap" ? <div className="page-actions"><button className="ghost-button compact-button" onClick={() => void openQuickDraftScreenshotPicker("tap", "macro")}>去实时截图取点</button></div> : null}
                        {keySimMacroDraft.type === "swipe" ? <div className="page-actions"><button className="ghost-button compact-button" onClick={() => void openQuickDraftScreenshotPicker("swipe", "macro")}>去实时截图取起终点</button></div> : null}
                        <label className="param-field">
                          <span>执行后间隔(ms)</span>
                          <input value={keySimMacroDraft.delayMs} onChange={(event) => setKeySimMacroDraft((current) => current ? { ...current, delayMs: event.target.value } : current)} placeholder="300" />
                        </label>
                      </div>
                      <div className="modal-foot">
                        <button className="ghost-button" onClick={closeMacroDraft}>取消</button>
                        <button className="primary-button" onClick={saveMacroDraft}>保存步骤</button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {keySimMacroRepeatDialog ? (
                  <div className="modal-mask" role="dialog" aria-modal="true">
                    <div className="modal-card keysim-quick-modal">
                      <div className="modal-head">
                        <h3>重复执行编排任务</h3>
                        <button className="icon-button" onClick={() => setKeySimMacroRepeatDialog(null)}>×</button>
                      </div>
                      <div className="modal-body keysim-quick-modal-body">
                        <label className="param-field">
                          <span>重复次数</span>
                          <input value={keySimMacroRepeatDialog.count} onChange={(event) => setKeySimMacroRepeatDialog((current) => current ? { ...current, count: event.target.value } : current)} placeholder="例如 3" />
                        </label>
                        <label className="param-field">
                          <span>重复间隔(ms)</span>
                          <input value={keySimMacroRepeatDialog.intervalMs} onChange={(event) => setKeySimMacroRepeatDialog((current) => current ? { ...current, intervalMs: event.target.value } : current)} placeholder="例如 500" />
                        </label>
                      </div>
                      <div className="modal-foot">
                        <button className="ghost-button" onClick={() => setKeySimMacroRepeatDialog(null)}>取消</button>
                        <button className="primary-button" onClick={() => void handleRunMacroTaskRepeated()}>开始执行</button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {keySimTab === "record" ? (
              <div className="result-empty-state">
                <strong>宏命令录制与回放</strong>
                <p>待开发：后续将支持录制真实操作轨迹并保存为可回放脚本。</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}