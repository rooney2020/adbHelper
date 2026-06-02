interface BackupDetailItem {
  label: string;
  value: string;
}

interface BackupEntry {
  versionName: string;
  status: string;
  path: string;
  lastUpdatedAt?: number | null;
  missingPaths: string[];
}

interface BackupActionResult {
  status: string;
  currentBackupDir?: string | null;
  message?: string | null;
  steps?: string[];
}

interface BackupPageProps {
  hasCurrentDevice: boolean;
  backupBusyAction: "backup" | "restore" | null;
  selectedBackupPaths: string[];
  selectedRestorePaths: string[];
  backupDetailItems: BackupDetailItem[];
  currentBackupStatus: string;
  currentBackupMissingPaths: string[];
  hasCurrentBackup: boolean;
  backupPaths: string[];
  restorePaths: string[];
  availableBackups: BackupEntry[];
  pendingBackupDeleteVersion: string | null;
  backupActionResult: BackupActionResult | null;
  backupInfoMessage: string | null;
  formatTimestampText: (value: number | null | undefined) => string;
  onRefresh: () => void;
  onBackup: () => void;
  onRestore: () => void;
  onToggleSelectedPath: (path: string, mode: "backup" | "restore") => void;
  onOpenBackupDirectory: (versionName: string) => void;
  onConfirmDeleteBackupVersion: (versionName: string) => void;
  onRequestDeleteBackupVersion: (versionName: string | null) => void;
}

export default function BackupPage({
  hasCurrentDevice,
  backupBusyAction,
  selectedBackupPaths,
  selectedRestorePaths,
  backupDetailItems,
  currentBackupStatus,
  currentBackupMissingPaths,
  hasCurrentBackup,
  backupPaths,
  restorePaths,
  availableBackups,
  pendingBackupDeleteVersion,
  backupActionResult,
  backupInfoMessage,
  formatTimestampText,
  onRefresh,
  onBackup,
  onRestore,
  onToggleSelectedPath,
  onOpenBackupDirectory,
  onConfirmDeleteBackupVersion,
  onRequestDeleteBackupVersion,
}: BackupPageProps) {
  return (
    <main className="page-shell">
      <section className="panel page-panel">
        <div className="page-header">
          <div>
            <p className="section-kicker">备份与恢复</p>
            <h3>按设备版本管理本地备份目录</h3>
            <p className="panel-list-subtitle">参考现有脚本逻辑，优先识别设备版本号，再映射到本地同名目录执行备份或恢复。</p>
          </div>
          <div className="page-actions">
            <button className="ghost-button" onClick={onRefresh} disabled={!hasCurrentDevice || backupBusyAction !== null}>刷新信息</button>
            <button className="primary-button" onClick={onBackup} disabled={!hasCurrentDevice || backupBusyAction !== null || selectedBackupPaths.length === 0}>
              {backupBusyAction === "backup" ? "备份中..." : "备份"}
            </button>
            <button className="ghost-button" onClick={onRestore} disabled={!hasCurrentDevice || !hasCurrentBackup || backupBusyAction !== null || selectedRestorePaths.length === 0}>
              {backupBusyAction === "restore" ? "恢复中..." : "恢复"}
            </button>
          </div>
        </div>

        <div className="summary-grid">
          {backupDetailItems.map((item) => (
            <div className="summary-metric" key={item.label}>
              <span className="summary-label">{item.label}</span>
              {item.label === "当前版本备份目录" ? (
                <div className="summary-value-with-badge">
                  <strong>{item.value}</strong>
                  <span className={`badge ${currentBackupStatus === "已备份" ? "success" : currentBackupStatus === "待更新" ? "warning" : "danger"}`}>{currentBackupStatus}</span>
                </div>
              ) : (
                <strong>{item.value}</strong>
              )}
            </div>
          ))}
        </div>

        {currentBackupMissingPaths.length ? (
          <div className="result-empty-state">当前版本还有未完成的备份项：{currentBackupMissingPaths.join("、")}</div>
        ) : null}

        <div className="page-section">
          <div className="theme-panel-head">
            <div>
              <p className="section-kicker">备份内容选择</p>
              <p className="panel-list-subtitle">备份和恢复都支持只勾选部分路径，也可以全部执行。</p>
            </div>
            <span className={`badge ${hasCurrentBackup ? "success" : "warning"}`}>
              {hasCurrentBackup ? `当前状态：${currentBackupStatus}` : "当前版本暂无备份"}
            </span>
          </div>
          <div className="backup-selection-grid">
            <div className="backup-selection-card">
              <p className="section-kicker">备份</p>
              {backupPaths.map((path) => (
                <label className="param-toggle-row backup-path-toggle" key={`backup-toggle-${path}`}>
                  <input type="checkbox" checked={selectedBackupPaths.includes(path)} onChange={() => onToggleSelectedPath(path, "backup")} />
                  <span>{path}</span>
                </label>
              ))}
            </div>
            <div className="backup-selection-card">
              <p className="section-kicker">恢复</p>
              {restorePaths.map((path) => (
                <label className="param-toggle-row backup-path-toggle" key={`restore-toggle-${path}`}>
                  <input type="checkbox" checked={selectedRestorePaths.includes(path)} onChange={() => onToggleSelectedPath(path, "restore")} />
                  <span>{path}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="page-section">
          <div className="theme-panel-head">
            <div>
              <p className="section-kicker">本地已有备份</p>
              <p className="panel-list-subtitle">列表中可以直接打开目录或删除备份；删除后当前版本状态会自动刷新。</p>
            </div>
          </div>
          {availableBackups.length ? (
            <div className="backup-directory-list">
              {availableBackups.map((entry) => (
                <div className="summary-metric backup-directory-card" key={entry.versionName}>
                  <div className="backup-directory-head">
                    <strong>{entry.versionName}</strong>
                    <span className={`badge ${entry.status === "已备份" ? "success" : entry.status === "待更新" ? "warning" : "danger"}`}>{entry.status}</span>
                  </div>
                  <span className="backup-directory-path">{entry.path}</span>
                  <span className="history-card-time">{formatTimestampText(entry.lastUpdatedAt)}</span>
                  {entry.missingPaths.length ? <span className="backup-directory-missing">缺失：{entry.missingPaths.join("、")}</span> : null}
                  <div className="backup-directory-actions">
                    <button className="ghost-button compact-button" onClick={() => onOpenBackupDirectory(entry.versionName)}>打开目录</button>
                    {pendingBackupDeleteVersion === entry.versionName ? (
                      <>
                        <button className="ghost-button compact-button history-delete-confirm-button" onClick={() => onConfirmDeleteBackupVersion(entry.versionName)}>确认删除</button>
                        <button className="ghost-button compact-button" onClick={() => onRequestDeleteBackupVersion(null)}>取消</button>
                      </>
                    ) : (
                      <button className="ghost-button compact-button history-delete-button" onClick={() => onRequestDeleteBackupVersion(entry.versionName)}>删除</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="result-empty-state">备份根目录下还没有找到任何版本目录。</div>
          )}
        </div>

        {backupActionResult ? (
          <div className="result-empty-state backup-status-card">
            <div className="page-header-badges">
              <span className={`badge ${backupActionResult.status === "ok" ? "success" : backupActionResult.status === "error" ? "danger" : "warning"}`}>{backupActionResult.status}</span>
              {backupActionResult.currentBackupDir ? <span className="chip">{backupActionResult.currentBackupDir}</span> : null}
            </div>
            <strong>{backupActionResult.message ?? "操作已完成。"}</strong>
            {backupActionResult.steps?.length ? (
              <div className="backup-step-list">
                {backupActionResult.steps.map((step, index) => <span key={`${step}-${index}`}>{step}</span>)}
              </div>
            ) : null}
          </div>
        ) : backupInfoMessage ? (
          <div className="result-empty-state">{backupInfoMessage}</div>
        ) : null}
      </section>
    </main>
  );
}