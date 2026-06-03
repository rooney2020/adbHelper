import { Fragment, useState, useEffect, useRef } from "react";
import Icon from "../components/Icon";

function VideoPlayer({ item }: { item: any }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setError(null);
    const api = (window as any).adbHelperApi?.localFile;
    if (!api) { setError("IPC 接口不可用"); return; }
    api.read({ path: item.localPath }).then((result: any) => {
      if (!mountedRef.current) return;
      if (result.status !== "ok") { setError(result.message ?? "读取失败"); return; }
      try {
        const binaryString = atob(result.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const blob = new Blob([bytes], { type: result.mimeType ?? "video/mp4" });
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        return () => { if (url) URL.revokeObjectURL(url); };
      } catch { setError("视频数据解码失败"); }
    }).catch((err: any) => { if (mountedRef.current) setError(err?.message ?? "请求失败"); });
    return () => { mountedRef.current = false; };
  }, [item.localPath]);

  return (
    <div style={{ maxWidth: "320px", border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden" }}>
      <div style={{ padding: "4px 8px", fontSize: "11px", background: "#e3fcec", borderBottom: "1px solid #c8e6c9" }}>📹 Display {item.displayId}</div>
      {blobUrl ? (
        <video src={blobUrl} controls style={{ width: "100%", display: "block", cursor: "pointer" }} onClick={(event) => { (event.target as HTMLVideoElement).requestFullscreen?.(); }} />
      ) : error ? (
        <div style={{ padding: "12px", fontSize: "12px", color: "#999", textAlign: "center" }}>{error}</div>
      ) : (
        <div style={{ padding: "12px", fontSize: "12px", color: "#999", textAlign: "center" }}>加载视频中...</div>
      )}
      <div style={{ padding: "4px 8px", fontSize: "11px", color: "#666", wordBreak: "break-all" }}>{item.localPath}</div>
    </div>
  );
}

export default function InfoPage({ deviceInfoTabs, deviceInfoTab, setDeviceInfoTab, basic, files, apps, users, processes, screen, shared }: any) {
  const DeviceAppListButton = apps.DeviceAppListButton;
  const DeviceProcessTableRow = processes.DeviceProcessTableRow;
  const highlightText = apps.highlightText;

  return (
    <main className="page-shell">
      <section className="panel page-panel info-page-panel">
        <div className="device-info-layout">
          <aside className="device-info-sidebar">
            {deviceInfoTabs.map((tab: any) => (
              <button key={tab.id} className={`device-info-tab ${deviceInfoTab === tab.id ? "active" : ""}`} onClick={() => setDeviceInfoTab(tab.id)}>
                <strong>{tab.label}</strong>
              </button>
            ))}
          </aside>

          <div className={`device-info-content ${deviceInfoTab === "files" ? "device-info-content-files" : ""}`}>
            {deviceInfoTab === "basic" ? (
              <>
                <p className="section-kicker">基础信息</p>
                <div className="device-output-meta info-metric-grid">
                  {basic.infoSummaryItems.map((item: any) => (
                    <div className="summary-metric" key={item.label}>
                      <span className="summary-label">{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {deviceInfoTab === "files" ? (
              <>
                <div className="device-file-explorer-shell">
                  <div className="device-file-explorer-main">
                    <div className="device-file-toolbar">
                      <input
                        value={files.deviceFileBrowserPath}
                        onChange={(event) => files.setDeviceFileBrowserPath(event.target.value)}
                        placeholder="输入设备目录，例如 /sdcard 或 /data/local/tmp"
                      />
                      <div className="device-file-toolbar-actions">
                        <button type="button" className="ghost-button" onClick={() => void files.handleLoadDeviceFiles(files.deviceFileBrowserPath)} disabled={!shared.currentDeviceId || files.deviceFileLoading || Boolean(files.deviceFileActionBusy)}>
                          进入
                        </button>
                        <button type="button" className="ghost-button" onClick={() => void files.handleLoadDeviceFiles(files.deviceFileBrowserPath)} disabled={!shared.currentDeviceId || files.deviceFileLoading || Boolean(files.deviceFileActionBusy)}>
                          {files.deviceFileLoading ? "读取中..." : "刷新"}
                        </button>
                        <button type="button" className="ghost-button" onClick={() => void files.handleLoadDeviceFiles(files.getRemoteParentPath(files.normalizedDeviceFileBrowserPath))} disabled={!shared.currentDeviceId || files.deviceFileLoading || Boolean(files.deviceFileActionBusy)}>
                          上一级
                        </button>
                        <button type="button" className="ghost-button" onClick={() => void files.handleUploadDeviceFile()} disabled={!shared.currentDeviceId || Boolean(files.deviceFileActionBusy)}>
                          {files.deviceFileActionBusy === "push" ? "上传中..." : "上传"}
                        </button>
                      </div>
                    </div>

                    <div className="device-file-breadcrumbs">
                      {files.deviceFileBreadcrumbItems.map((item: any, index: number) => (
                        <Fragment key={item.path}>
                          <button type="button" className={`chip ${item.path === files.normalizedDeviceFileBrowserPath ? "active" : ""}`} onClick={() => void files.handleLoadDeviceFiles(item.path)}>
                            {item.label}
                          </button>
                          {index < files.deviceFileBreadcrumbItems.length - 1 ? <span className="device-file-breadcrumb-separator">/</span> : null}
                        </Fragment>
                      ))}
                      <span className="badge warning device-file-count-badge">{files.deviceFileLoading ? "读取中" : `${files.deviceFileEntries.length} 项`}</span>
                    </div>

                    {files.deviceFileNotice ? <div className="result-empty-state">{files.deviceFileNotice}</div> : null}
                    {files.deviceFileLoading ? <div className="result-empty-state">正在读取设备目录...</div> : null}
                    {!files.deviceFileLoading && files.deviceFileEntries.length === 0 ? <div className="result-empty-state">当前目录没有可展示的文件条目。</div> : null}
                    {files.deviceFileEntries.length ? (
                      <div className="device-file-table-wrap">
                        <div className="device-info-table-row header file">
                          <span>类型</span>
                          <span>名称</span>
                          <span>权限</span>
                          <span>属主</span>
                          <span>属组</span>
                          <span>大小</span>
                          <span>修改时间</span>
                          <span>操作</span>
                        </div>
                        <div className="device-file-table-body">
                          {files.deviceFileEntries.map((entry: any) => (
                            <div className={`device-info-table-row file ${files.deviceFileSelectedPath === entry.path ? "active" : ""}`} key={entry.path} onClick={() => files.handleSelectDeviceFile(entry)}>
                              <span>{entry.type === "directory" ? "目录" : entry.type === "symlink" ? "链接" : entry.type === "file" ? "文件" : "其他"}</span>
                              <button
                                type="button"
                                className="device-file-name-button"
                                onClick={() => files.handleSelectDeviceFile(entry)}
                                onDoubleClick={() => {
                                  if (entry.type === "directory") {
                                    void files.handleLoadDeviceFiles(entry.path);
                                  }
                                }}
                              >
                                <strong>{entry.name}</strong>
                                <span>{entry.linkTarget ? `${entry.path} -> ${entry.linkTarget}` : entry.path}</span>
                              </button>
                              <span>{entry.permissions}</span>
                              <span>{entry.owner || "-"}</span>
                              <span>{entry.group || "-"}</span>
                              <span>{entry.size || "-"}</span>
                              <span>{entry.modified || "-"}</span>
                              <div className="page-actions device-file-row-actions">
                                {entry.type === "directory" ? <button type="button" className="ghost-button compact-button" onClick={() => void files.handleLoadDeviceFiles(entry.path)}>进入</button> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <aside className="device-info-section-card device-file-inspector">
                    <div className="theme-panel-head">
                      <div>
                        <p className="section-kicker">检查器</p>
                        <h3>{files.selectedDeviceFileEntry?.name ?? "未选中项目"}</h3>
                      </div>
                      <div className="page-actions">
                        {files.selectedDeviceFileEntry ? (
                          <>
                            <button type="button" className="ghost-button compact-button" onClick={() => void files.handlePullDeviceFile()} disabled={Boolean(files.deviceFileActionBusy)}>
                              {files.deviceFileActionBusy === "pull" ? "拉取中..." : "拉取"}
                            </button>
                            <button type="button" className="ghost-button compact-button history-delete-button" onClick={files.handleRequestDeleteDeviceFile} disabled={Boolean(files.deviceFileActionBusy)}>
                              删除
                            </button>
                          </>
                        ) : null}
                        {files.deviceFileActionBusy ? <span className="badge warning">执行中</span> : null}
                      </div>
                    </div>
                    <div className="history-card-meta">
                      <span>{files.selectedDeviceFileEntry ? files.selectedDeviceFileEntry.path : "从左侧列表选择文件或目录"}</span>
                      {files.selectedDeviceFileEntry ? <span>{`类型：${files.selectedDeviceFileEntry.type === "directory" ? "目录" : files.selectedDeviceFileEntry.type === "symlink" ? "链接" : files.selectedDeviceFileEntry.type === "file" ? "文件" : "其他"}`}</span> : null}
                    </div>
                    {files.selectedDeviceFileEntry ? (
                      <div className="info-metric-grid">
                        {[
                          { label: "权限", value: files.selectedDeviceFileEntry.permissions || "-" },
                          { label: "属主", value: files.selectedDeviceFileEntry.owner || "-" },
                          { label: "属组", value: files.selectedDeviceFileEntry.group || "-" },
                          { label: "大小", value: files.selectedDeviceFileEntry.size || "-" },
                          { label: "修改时间", value: files.selectedDeviceFileEntry.modified || "-" },
                          { label: "目标", value: files.selectedDeviceFileEntry.linkTarget || files.selectedDeviceFileEntry.path },
                        ].map((item) => (
                          <div className="summary-metric" key={`${files.selectedDeviceFileEntry.path}-${item.label}`}>
                            <span className="summary-label">{item.label}</span>
                            <strong>{item.value}</strong>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="device-file-action-grid">
                      <label className="param-field">
                        <span>上传目标路径</span>
                        <input value={files.deviceFileUploadTargetPath} onChange={(event) => files.setDeviceFileUploadTargetPath(event.target.value)} placeholder="留空则上传到当前目录，也可填写完整目标文件路径" />
                      </label>
                      <div className="device-file-inline-action">
                        <label className="param-field">
                          <span>新建目录名称</span>
                          <input value={files.deviceFileMkdirName} onChange={(event) => files.setDeviceFileMkdirName(event.target.value)} placeholder="例如 logs 或 test-data" />
                        </label>
                        <button type="button" className="ghost-button" onClick={() => void files.handleCreateDeviceDirectory()} disabled={!shared.currentDeviceId || Boolean(files.deviceFileActionBusy)}>
                          {files.deviceFileActionBusy === "mkdir" ? "创建中..." : "新建目录"}
                        </button>
                      </div>
                      <div className="device-file-inline-action">
                        <label className="param-field">
                          <span>chmod 模式</span>
                          <input value={files.deviceFileChmodMode} onChange={(event) => files.setDeviceFileChmodMode(event.target.value)} placeholder="例如 775" />
                        </label>
                        <button type="button" className="ghost-button" onClick={() => void files.handleChmodDeviceFile()} disabled={!files.selectedDeviceFileEntry || Boolean(files.deviceFileActionBusy)}>
                          {files.deviceFileActionBusy === "chmod" ? "修改中..." : "修改权限"}
                        </button>
                      </div>
                      <div className="device-file-inline-action">
                        <label className="param-field">
                          <span>chown 用户[:组]</span>
                          <input value={files.deviceFileChownValue} onChange={(event) => files.setDeviceFileChownValue(event.target.value)} placeholder="例如 shell:shell 或 media_rw:media_rw" />
                        </label>
                        <button type="button" className="ghost-button" onClick={() => void files.handleChownDeviceFile()} disabled={!files.selectedDeviceFileEntry || Boolean(files.deviceFileActionBusy)}>
                          {files.deviceFileActionBusy === "chown" ? "修改中..." : "修改归属"}
                        </button>
                      </div>
                    </div>

                    {files.deviceFileActionResult ? (
                      <div className="result-empty-state">
                        <div>{files.deviceFileActionResult.message}</div>
                        {files.deviceFileActionResult.path ? (
                          <div className="page-actions">
                            <span className="badge info">本地路径：{files.deviceFileActionResult.path}</span>
                            <button type="button" className="ghost-button compact-button" onClick={() => void shared.handleOpenLocalPath(files.deviceFileActionResult.path)}>打开所在目录</button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </aside>
                </div>
              </>
            ) : null}

            {deviceInfoTab === "apps" ? (
              <>
                <div className="device-app-filter-grid">
                  <input value={apps.deviceAppSearchTerm} onChange={(event) => apps.setDeviceAppSearchTerm(event.target.value)} placeholder="搜索包名、安装路径、UID 或权限" />
                  <select value={apps.deviceAppUserFilter} onChange={(event) => apps.setDeviceAppUserFilter(event.target.value)}>
                    <option value="all">全部用户</option>
                    {shared.availableDeviceUserIds.map((userId: number) => <option key={`app-user-${userId}`} value={String(userId)}>用户 {userId}</option>)}
                  </select>
                  <input value={apps.deviceAppPermissionFilter} onChange={(event) => apps.setDeviceAppPermissionFilter(event.target.value)} placeholder="按权限筛选，例如 android.permission.INTERNET" />
                  <select value={apps.deviceAppScopeFilter} onChange={(event) => apps.setDeviceAppScopeFilter(event.target.value)}>
                    <option value="all">全部应用</option>
                    <option value="system">系统应用</option>
                    <option value="user">用户应用</option>
                  </select>
                  <span className="badge info">{apps.deviceAppsLoading ? "加载中" : `应用 ${apps.filteredDeviceApps.length}`}</span>
                </div>
                <div className="device-info-split">
                  <div className="device-info-list panel-scroll">
                    {apps.deviceAppsLoading ? <div className="result-empty-state">正在读取应用列表...</div> : null}
                    {!apps.deviceAppsLoading && apps.filteredDeviceApps.length === 0 ? <div className="result-empty-state">没有匹配的应用。</div> : null}
                    {apps.visibleDeviceApps.map((item: any) => (
                      <DeviceAppListButton key={item.packageName} item={item} selected={apps.selectedDeviceAppPackage === item.packageName} query={apps.deferredDeviceAppSearchTerm} onSelect={apps.setSelectedDeviceAppPackage} />
                    ))}
                    {apps.filteredDeviceApps.length > apps.visibleDeviceApps.length ? (
                      <div className="page-actions">
                        <span className="badge info">已显示 {apps.visibleDeviceApps.length} / {apps.filteredDeviceApps.length}</span>
                        <button type="button" className="ghost-button compact-button" onClick={() => apps.setVisibleDeviceAppCount((current: number) => current + shared.loadMoreStep)}>
                          继续加载更多应用
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="device-info-detail panel-scroll">
                    {apps.deviceAppDetailLoading ? <div className="result-empty-state">正在读取应用详情...</div> : null}
                    {!apps.deviceAppDetailLoading && !apps.deviceAppDetail ? <div className="inline-tip">选择应用后显示详情和相关操作。</div> : null}
                    {apps.deviceAppDetail ? (
                      <>
                        <div className="theme-panel-head">
                          <div>
                            <p className="section-kicker">应用详情</p>
                            <h3>{apps.deviceAppDetail.packageName}</h3>
                          </div>
                          <div className="app-detail-head-actions">
                            <span className="badge info">{apps.formatInstalledUsers(apps.deviceAppDetail.installedUsers)}</span>
                            <div className="app-action-menu-anchor" ref={apps.appActionMenuAnchorRef}>
                              <button type="button" className="primary-button compact-button" onClick={() => apps.setAppActionMenuOpen((current: boolean) => !current)}>
                                操作
                              </button>
                              {apps.appActionMenuOpen ? (
                                <div className="app-action-dropdown panel" onMouseLeave={apps.scheduleCloseAppActionSubmenu}>
                                  <div className="device-action-list">
                                    <div className="device-action-item device-action-item-submenu" onMouseEnter={(event) => apps.openAppActionSubmenu("uninstall", event.currentTarget)}>
                                      <div className="device-action-item-main">
                                        <span>卸载</span>
                                        <span className="device-action-meta">完全卸载 / 按已安装用户卸载</span>
                                      </div>
                                    </div>
                                    <div className="device-action-item device-action-item-submenu" onMouseEnter={(event) => apps.openAppActionSubmenu("install", event.currentTarget)}>
                                      <div className="device-action-item-main">
                                        <span>安装到其他用户</span>
                                        <span className="device-action-meta">列出当前未安装的用户</span>
                                      </div>
                                    </div>
                                    <div className="device-action-item device-action-item-submenu" onMouseEnter={(event) => apps.openAppActionSubmenu("clear", event.currentTarget)}>
                                      <div className="device-action-item-main">
                                        <span>清除数据</span>
                                        <span className="device-action-meta">按已安装用户清除应用数据</span>
                                      </div>
                                    </div>
                                    <button type="button" className="device-action-item" disabled={Boolean(apps.deviceAppActionBusy)} onClick={() => void apps.handlePullCurrentApk()}>
                                      <div className="device-action-item-main">
                                        <span>拉取 APK</span>
                                        <span className="device-action-meta">{apps.apkExportSummaryText}</span>
                                      </div>
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                              {apps.appActionMenuOpen && apps.appActionSubmenu ? (
                                <div className="app-action-submenu app-action-submenu-floating panel" style={apps.appActionSubmenuStyle} onMouseEnter={apps.clearAppActionSubmenuCloseTimer} onMouseLeave={apps.scheduleCloseAppActionSubmenu}>
                                  {apps.appActionSubmenu === "uninstall" ? (
                                    <>
                                      <button
                                        type="button"
                                        className="app-action-submenu-button danger-button-ghost"
                                        disabled={Boolean(apps.deviceAppActionBusy)}
                                        onClick={() => {
                                          apps.setAppActionMenuOpen(false);
                                          apps.setAppActionSubmenu(null);
                                          void apps.handleDeviceAppCommand(
                                            "app-uninstall-full",
                                            `完整卸载 ${apps.deviceAppDetail.packageName}`,
                                            `adb uninstall ${apps.deviceAppDetail.packageName}`,
                                            apps.isPrivilegedApkPath(apps.deviceAppDetail.apkPath)
                                              ? {
                                                prerequisite: "当前应用位于系统分区。完整卸载通常需要 root，失败时建议改用按用户卸载或先处理系统权限。",
                                                confirmTone: "danger",
                                                confirmLabel: "确认继续卸载",
                                              }
                                              : undefined,
                                          );
                                        }}
                                      >
                                        完全卸载
                                      </button>
                                      {apps.deviceAppDetail.installedUsers.map((userId: number) => (
                                        <button
                                          type="button"
                                          className="app-action-submenu-button"
                                          key={`uninstall-user-${userId}`}
                                          disabled={Boolean(apps.deviceAppActionBusy)}
                                          onClick={() => {
                                            apps.setAppActionMenuOpen(false);
                                            apps.setAppActionSubmenu(null);
                                            void apps.handleDeviceAppCommand("app-uninstall-user", `从用户 ${userId} 卸载 ${apps.deviceAppDetail.packageName}`, `adb shell pm uninstall --user ${userId} ${apps.deviceAppDetail.packageName}`);
                                          }}
                                        >
                                          从用户 {userId} 卸载
                                        </button>
                                      ))}
                                    </>
                                  ) : null}
                                  {apps.appActionSubmenu === "install" ? (
                                    apps.installTargetUserIds.length ? apps.installTargetUserIds.map((userId: number) => (
                                      <button
                                        type="button"
                                        className="app-action-submenu-button"
                                        key={`install-user-${userId}`}
                                        disabled={Boolean(apps.deviceAppActionBusy)}
                                        onClick={() => {
                                          apps.setAppActionMenuOpen(false);
                                          apps.setAppActionSubmenu(null);
                                          void apps.handleDeviceAppCommand("app-install-existing", `安装到用户 ${userId}`, `adb shell pm install-existing --user ${userId} ${apps.deviceAppDetail.packageName}`);
                                        }}
                                      >
                                        安装到用户 {userId}
                                      </button>
                                    )) : <div className="device-empty-state">没有可安装的其他用户</div>
                                  ) : null}
                                  {apps.appActionSubmenu === "clear" ? (
                                    apps.deviceAppDetail.installedUsers.map((userId: number) => (
                                      <button
                                        type="button"
                                        className="app-action-submenu-button"
                                        key={`clear-user-${userId}`}
                                        disabled={Boolean(apps.deviceAppActionBusy)}
                                        onClick={() => {
                                          apps.setAppActionMenuOpen(false);
                                          apps.setAppActionSubmenu(null);
                                          void apps.handleDeviceAppCommand("app-clear-user", `清除用户 ${userId} 的应用数据`, `adb shell pm clear --user ${userId} ${apps.deviceAppDetail.packageName}`);
                                        }}
                                      >
                                        清除用户 {userId} 数据
                                      </button>
                                    ))
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className="info-metric-grid">
                          {[
                            { label: "APK 路径", value: apps.deviceAppDetail.apkPath || "未知" },
                            { label: "版本号", value: apps.deviceAppDetail.versionName || "未知" },
                            { label: "版本编码", value: apps.deviceAppDetail.versionCode || "未知" },
                            { label: "UID", value: apps.deviceAppDetail.uid || "未知" },
                            { label: "数据目录", value: apps.deviceAppDetail.dataDir || "未知" },
                            { label: "首次安装", value: apps.deviceAppDetail.firstInstallTime || "未知" },
                            { label: "最近更新", value: apps.deviceAppDetail.lastUpdateTime || "未知" },
                          ].map((item) => (
                            <div className="summary-metric" key={`${apps.deviceAppDetail.packageName}-${item.label}`}>
                              <span className="summary-label">{item.label}</span>
                              <strong>{item.value}</strong>
                            </div>
                          ))}
                        </div>
                        <div className="device-app-action-grid">
                          <div className="device-app-action-card">
                            <div className="history-card-meta">
                              <span>已安装用户：{apps.formatInstalledUsers(apps.deviceAppDetail.installedUsers)}</span>
                              <span>可安装到：{apps.installTargetUserIds.length ? apps.installTargetUserIds.map((userId: number) => `用户 ${userId}`).join("、") : "无"}</span>
                              <span>APK 导出：{apps.apkExportSummaryText}</span>
                            </div>
                            {apps.deviceAppActionResult ? (
                              <div className="result-empty-state">
                                <div>{apps.deviceAppActionResult.message}</div>
                                {apps.deviceAppActionResult.path ? (
                                  <div className="page-actions">
                                    <span className="badge info">本地路径：{apps.deviceAppActionResult.path}</span>
                                    <button type="button" className="ghost-button compact-button" onClick={() => void shared.handleOpenLocalPath(apps.deviceAppActionResult.path)}>打开所在目录</button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="device-info-section-grid">
                          {apps.deviceAppComponentSections.map((section: any) => (
                            <div className="device-info-section-card" key={`${apps.deviceAppDetail.packageName}-${section.label}`}>
                              <div className="theme-panel-head">
                                <p className="section-kicker">{section.label}</p>
                                <span className="badge info">{section.items.length}</span>
                              </div>
                              {section.items.length ? (
                                <div className="device-info-token-list">
                                  {section.items.map((item: string) => (
                                    <button type="button" className="token-chip token-chip-button" key={item} onClick={() => apps.handleOpenComponentDetail(item)}>
                                      {item}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="result-empty-state">未识别到 {section.label} 条目。</div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="device-info-section-grid">
                          <div className="device-info-section-card">
                            <div className="theme-panel-head">
                              <p className="section-kicker">请求权限</p>
                              <span className="badge info">{apps.deviceAppDetail.requestedPermissions.length}</span>
                            </div>
                            {apps.deviceAppDetail.requestedPermissions.length ? (
                              <div className="device-info-token-list">
                                {apps.deviceAppDetail.requestedPermissions.map((item: string) => <span className="token-chip" key={item}>{highlightText(item, apps.deferredDeviceAppPermissionFilter)}</span>)}
                              </div>
                            ) : (
                              <div className="result-empty-state">未识别到权限列表。</div>
                            )}
                          </div>
                          <div className="device-info-section-card">
                            <div className="theme-panel-head">
                              <p className="section-kicker">禁用组件</p>
                              <span className="badge info">{apps.deviceAppDetail.disabledComponents.length}</span>
                            </div>
                            {apps.deviceAppDetail.disabledComponents.length ? (
                              <div className="device-info-token-list">
                                {apps.deviceAppDetail.disabledComponents.map((item: string) => <span className="token-chip" key={item}>{item}</span>)}
                              </div>
                            ) : (
                              <div className="result-empty-state">当前未检测到禁用组件。</div>
                            )}
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}

            {deviceInfoTab === "users" ? (
              <>
                <div className="device-output-meta info-metric-grid">
                  {users.deviceUserSummaryItems.map((item: any) => (
                    <div className="summary-metric" key={item.label}>
                      <span className="summary-label">{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
                <div className="page-section">
                  <div className="theme-panel-head">
                    <div>
                      <p className="section-kicker">用户列表</p>
                      <p className="panel-list-subtitle">展示设备中的用户状态、限制项和生命周期字段。</p>
                    </div>
                    <span className="badge info">{users.deviceUsersLoading ? "加载中" : `用户 ${users.deviceUsers.length}`}</span>
                  </div>
                  {users.deviceUsersLoading ? <div className="result-empty-state">正在读取用户信息...</div> : null}
                  {!users.deviceUsersLoading && !users.deviceUsers.length ? <div className="result-empty-state">当前设备未返回用户信息。</div> : null}
                  <div className="device-info-user-grid">
                    {users.deviceUsers.map((user: any) => (
                      <div className="device-info-user-card" key={`user-${user.id}`}>
                        <div className="theme-panel-head">
                          <div>
                            <p className="section-kicker">用户 {user.id}</p>
                            <h3>{user.name || "未命名用户"}</h3>
                          </div>
                          <span className={`badge ${user.state.includes("RUNNING") ? "success" : "warning"}`}>{user.state || "未知状态"}</span>
                        </div>
                        <div className="history-card-meta">
                          <span>{user.type || "未知类型"}</span>
                          <span>{user.isPrimary ? "主用户" : "普通用户"}</span>
                          {user.preCreated ? <span>预创建</span> : null}
                        </div>
                        <div className="info-metric-grid">
                          {[
                            { label: "Serial", value: user.serialNo || "未知" },
                            { label: "Flags", value: user.flags || String(user.flagsValue) },
                            { label: "创建时间", value: user.created || "未知" },
                            { label: "最近登录", value: user.lastLoggedIn || "未知" },
                            { label: "启动时间", value: user.startTime || "未知" },
                            { label: "解锁时间", value: user.unlockTime || "未知" },
                          ].map((item) => (
                            <div className="summary-metric" key={`user-${user.id}-${item.label}`}>
                              <span className="summary-label">{item.label}</span>
                              <strong>{item.value}</strong>
                            </div>
                          ))}
                        </div>
                        <div className="device-info-section-grid compact">
                          {[
                            { label: "限制项", items: user.restrictions },
                            { label: "生效限制", items: user.effectiveRestrictions },
                          ].map((section) => (
                            <div className="device-info-section-card" key={`user-${user.id}-${section.label}`}>
                              <div className="theme-panel-head">
                                <p className="section-kicker">{section.label}</p>
                                <span className="badge info">{section.items.length}</span>
                              </div>
                              {section.items.length ? (
                                <div className="device-info-token-list">
                                  {section.items.map((item: string) => <span className="token-chip" key={`${user.id}-${section.label}-${item}`}>{item}</span>)}
                                </div>
                              ) : (
                                <div className="result-empty-state">无</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="page-section">
                  <div className="theme-panel-head">
                    <div>
                      <p className="section-kicker">Passenger 配置</p>
                      <p className="panel-list-subtitle">直接展示 dumpsys car_service 中与乘员区相关的关键字段。</p>
                    </div>
                    <span className="badge info">{users.deviceCarServicePassenger?.activeOccupantConfigs.length ?? 0}</span>
                  </div>
                  {users.deviceCarServicePassenger ? (
                    <div className="device-info-section-grid">
                      {users.devicePassengerSummaryItems.map((item: any) => (
                        <div className="summary-metric" key={item.label}>
                          <span className="summary-label">{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                      {[
                        { label: "Driver 分配", items: users.deviceCarServicePassenger.driverAssignments },
                        { label: "mOccupantsConfig", items: users.deviceCarServicePassenger.occupantsConfig },
                        { label: "mDisplayConfigs", items: users.deviceCarServicePassenger.displayConfigs },
                        { label: "mActiveOccupantConfigs", items: users.deviceCarServicePassenger.activeOccupantConfigs },
                      ].map((section) => (
                        <div className="device-info-section-card" key={`car-service-${section.label}`}>
                          <div className="theme-panel-head">
                            <p className="section-kicker field-kicker">{section.label}</p>
                            <span className="badge info">{section.items.length}</span>
                          </div>
                          {section.items.length ? (
                            <div className="device-info-token-list">
                              {section.items.map((item: string) => <span className="token-chip" key={`${section.label}-${item}`}>{item}</span>)}
                            </div>
                          ) : (
                            <div className="result-empty-state">当前 car_service 未返回 {section.label}。</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="result-empty-state">当前设备未返回 car_service passenger 相关字段。</div>
                  )}
                </div>
              </>
            ) : null}

            {deviceInfoTab === "processes" ? (
              <>
                <div className="device-process-filter-grid">
                  <input value={processes.deviceProcessSearchTerm} onChange={(event) => processes.setDeviceProcessSearchTerm(event.target.value)} placeholder="搜索进程名、包名、用户或 PID" />
                  <select value={processes.deviceProcessUserFilter} onChange={(event) => processes.setDeviceProcessUserFilter(event.target.value)}>
                    <option value="all">全部用户</option>
                    {shared.availableDeviceUserIds.map((userId: number) => <option key={`process-user-${userId}`} value={String(userId)}>用户 {userId}</option>)}
                  </select>
                  <select value={processes.deviceProcessScopeFilter} onChange={(event) => processes.setDeviceProcessScopeFilter(event.target.value)}>
                    <option value="app">仅应用进程</option>
                    <option value="all">全部进程</option>
                    <option value="system">系统服务</option>
                    <option value="kernel">内核线程</option>
                  </select>
                  <span className="badge info">{processes.deviceProcessesLoading ? "加载中" : `进程 ${processes.filteredDeviceProcesses.length}`}</span>
                </div>
                {processes.deviceProcessesLoading ? <div className="result-empty-state">正在读取进程列表...</div> : null}
                {!processes.deviceProcessesLoading && !processes.filteredDeviceProcesses.length ? <div className="result-empty-state">没有匹配的进程。</div> : null}
                {processes.filteredDeviceProcesses.length ? (
                  <div className="device-info-table">
                    <div className="device-info-table-row header process">
                      <span>用户</span>
                      <span>PID</span>
                      <span>PPID</span>
                      <span>进程名</span>
                      <span>应用包名</span>
                      <span>命令行</span>
                      <span>操作</span>
                    </div>
                    {processes.visibleDeviceProcesses.map((item: any) => (
                      <DeviceProcessTableRow key={`${item.pid}-${item.name}`} item={item} query={processes.deviceProcessSearchTerm} onRequestKill={processes.setPendingProcessKill} />
                    ))}
                  </div>
                ) : null}
                {processes.filteredDeviceProcesses.length > processes.visibleDeviceProcesses.length ? (
                  <div className="page-actions">
                    <span className="badge info">已显示 {processes.visibleDeviceProcesses.length} / {processes.filteredDeviceProcesses.length}</span>
                    <button type="button" className="ghost-button compact-button" onClick={() => processes.setVisibleDeviceProcessCount((current: number) => current + shared.loadMoreStep)}>
                      继续加载更多进程
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            {deviceInfoTab === "screen" ? (
              <div className="screen-capture-panel">
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "8px", color: "#555" }}>Display 选择：</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {(screen.deviceDisplayCatalog.length === 0 ? [{ displayId: 0, label: "" }] : screen.deviceDisplayCatalog).map((display: any) => {
                      const selected = screen.screenDisplayIds.includes(display.displayId);
                      return (
                        <div
                          key={display.displayId}
                          onClick={() => {
                            if (selected) screen.setScreenDisplayIds((ids: number[]) => ids.filter((id) => id !== display.displayId));
                            else screen.setScreenDisplayIds((ids: number[]) => [...ids, display.displayId]);
                          }}
                          style={{
                            padding: "6px 14px",
                            borderRadius: "16px",
                            fontSize: "13px",
                            cursor: "pointer",
                            userSelect: "none",
                            border: selected ? "1.5px solid #1976d2" : "1.5px solid #ddd",
                            background: selected ? "#e3f2fd" : "#fafafa",
                            color: selected ? "#1565c0" : "#555",
                            fontWeight: selected ? 500 : 400,
                            transition: "all 0.15s ease",
                          }}
                        >
                          {selected ? "✓ " : ""}Display {display.displayId}{display.label ? ` (${display.label})` : ""}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", marginBottom: "16px", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={screen.screenCapturing || !shared.currentDeviceId || screen.screenDisplayIds.length === 0}
                    onClick={async () => {
                      if (!shared.currentDeviceId || screen.screenDisplayIds.length === 0) return;
                      screen.setScreenCapturing(true);
                      try {
                        const results = await Promise.all(screen.screenDisplayIds.map((displayId: number) => shared.runtimeApi.screen.capture({ deviceId: shared.currentDeviceId, displayId })));
                        const okResults = results.map((result: any, index: number) => ({ displayId: screen.screenDisplayIds[index], dataUrl: result.dataUrl, savedPath: result.savedPath })).filter((result: any) => result.dataUrl || result.savedPath);
                        screen.setScreenCaptureResults(okResults);
                        const savedPaths = results.filter((result: any) => result.status === "ok" && result.savedPath).map((result: any) => result.savedPath);
                        if (savedPaths.length > 0) {
                          shared.pushUiToast(`已截取 ${savedPaths.length} 个 Display`, "success", { label: "打开目录", path: savedPaths[0] });
                        } else {
                          const errMsg = results.find((result: any) => result.status === "error")?.message ?? "截屏失败";
                          shared.pushUiToast(errMsg, "error");
                        }
                      } catch (err: any) {
                        shared.pushUiToast(err?.message ?? "截屏失败", "error");
                      } finally {
                        screen.setScreenCapturing(false);
                      }
                    }}
                  >
                    {screen.screenCapturing ? "截屏中..." : "📷 截屏"}
                  </button>

                  <span style={{ color: "#666", fontSize: "13px" }}>|</span>

                  {!screen.screenRecording ? (
                    <button
                      type="button"
                      className="primary-button"
                      disabled={!shared.currentDeviceId || screen.screenDisplayIds.length === 0}
                      onClick={async () => {
                        if (!shared.currentDeviceId || screen.screenDisplayIds.length === 0) return;
                        screen.setScreenRecording(true);
                        screen.setScreenRecordResults([]);
                        try {
                          const results = await Promise.all(screen.screenDisplayIds.map((displayId: number) => shared.runtimeApi.screen.startRecord({ deviceId: shared.currentDeviceId, displayId })));
                          const anyFail = results.find((result: any) => result.status !== "ok");
                          if (anyFail) {
                            shared.pushUiToast(anyFail.message ?? "部分 Display 启动录屏失败", "warning");
                          } else {
                            shared.pushUiToast(`${screen.screenDisplayIds.length} 个 Display 录屏已开始`, "success");
                          }
                        } catch (err: any) {
                          shared.pushUiToast(err?.message ?? "录屏失败", "error");
                          screen.setScreenRecording(false);
                        }
                      }}
                    >
                      🎬 开始录屏
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary-button"
                      style={{ background: "#f44336" }}
                      onClick={async () => {
                        if (!shared.currentDeviceId) return;
                        screen.setScreenRecordResults([]);
                        try {
                          const result = await shared.runtimeApi.screen.stopRecord({ deviceId: shared.currentDeviceId });
                          if (result.status === "ok") {
                            const files = result.files;
                            if (files && files.length > 0) {
                              screen.setScreenRecordResults(files);
                              shared.pushUiToast(`录屏已保存（${files.length} 个）`, "success", { label: "打开目录", path: files[0].localPath });
                            } else if (result.localPath) {
                              const paths = result.localPath.split(", ").map((path: string, index: number) => ({ displayId: index, localPath: path }));
                              screen.setScreenRecordResults(paths);
                              shared.pushUiToast("录屏已保存", "success", { label: "打开目录", path: paths[0].localPath });
                            }
                          } else {
                            shared.pushUiToast(result.message ?? "停止录屏失败", "error");
                          }
                        } catch (err: any) {
                          shared.pushUiToast(err?.message ?? "停止录屏失败", "error");
                        }
                        screen.setScreenRecording(false);
                      }}
                    >
                      ⏹ 停止录屏
                    </button>
                  )}
                  {screen.screenRecording ? <span className="badge warning">录屏中...</span> : null}
                </div>

                {screen.screenRecordResults.length > 0 ? (
                  <div style={{ marginBottom: "12px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                      {screen.screenRecordResults.map((item: any, index: number) => (
                        <VideoPlayer key={index} item={item} />
                      ))}
                    </div>
                    <button type="button" className="ghost-button compact-button" style={{ marginTop: "8px" }} onClick={() => void shared.handleOpenLocalPath(screen.screenRecordResults[0].localPath)}><Icon name="folder" size={12} /> 打开目录</button>
                  </div>
                ) : null}

                {screen.screenCaptureResults.length > 0 ? (
                  <div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                      {screen.screenCaptureResults.map((item: any, index: number) => (
                        <div key={index} style={{ maxWidth: "320px", border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden" }}>
                          <div style={{ padding: "4px 8px", fontSize: "11px", background: "#f5f5f5", borderBottom: "1px solid #eee" }}>Display {item.displayId}</div>
                          {item.dataUrl ? <img src={item.dataUrl} alt={`Display ${item.displayId}`} style={{ width: "100%", display: "block", cursor: "pointer" }} onClick={(event) => { (event.target as HTMLImageElement).requestFullscreen?.(); }} /> : <div style={{ padding: "12px", fontSize: "12px", color: "#999" }}>无预览</div>}
                        </div>
                      ))}
                    </div>
                    {screen.screenCaptureResults.some((item: any) => item.savedPath) ? <button type="button" className="ghost-button compact-button" style={{ marginTop: "8px" }} onClick={() => void shared.handleOpenLocalPath(screen.screenCaptureResults.find((item: any) => item.savedPath).savedPath)}><Icon name="folder" size={12} /> 打开目录</button> : null}
                  </div>
                ) : (
                  <div className="result-empty-state">点击"截屏"按钮获取设备当前画面。</div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}