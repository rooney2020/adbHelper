import { Fragment, useMemo, useRef, type CSSProperties, type Dispatch, type MouseEvent as ReactMouseEvent, type ReactNode, type SetStateAction } from "react";
import Icon from "../components/Icon";

type LayoutViewerTab = "winscope" | "inspector";
type PanelIndex = 0 | 1 | 2;

interface UiTreeNode {
  path: string;
  className: string;
  attributes: Record<string, string>;
  children: UiTreeNode[];
}

interface LayoutProcessItem {
  pid: string;
  name: string;
  user?: string;
}

interface LayoutPageProps {
  currentDeviceLabel: string;
  currentDeviceId: string;
  currentDeviceName: string;
  hasCurrentDevice: boolean;
  runtimeApi: any;
  layoutViewerTab: LayoutViewerTab;
  setLayoutViewerTab: Dispatch<SetStateAction<LayoutViewerTab>>;
  layoutWinscopeToken: string | null;
  layoutUiTreeXml: string;
  setLayoutUiTreeXml: Dispatch<SetStateAction<string>>;
  layoutUiTreeLoading: boolean;
  setLayoutUiTreeLoading: Dispatch<SetStateAction<boolean>>;
  layoutUiTreeError: string | null;
  setLayoutUiTreeError: Dispatch<SetStateAction<string | null>>;
  layoutSelectedNodePath: string | null;
  setLayoutSelectedNodePath: Dispatch<SetStateAction<string | null>>;
  layoutExpandedNodes: Set<string>;
  setLayoutExpandedNodes: Dispatch<SetStateAction<Set<string>>>;
  layoutScreenshotDataUrl: string;
  setLayoutScreenshotDataUrl: Dispatch<SetStateAction<string>>;
  layoutScreenshotSize: { width: number; height: number };
  setLayoutScreenshotSize: Dispatch<SetStateAction<{ width: number; height: number }>>;
  layoutPanelSizes: [number, number, number];
  setLayoutPanelSizes: Dispatch<SetStateAction<[number, number, number]>>;
  layoutCollapsedPanels: Set<PanelIndex>;
  setLayoutCollapsedPanels: Dispatch<SetStateAction<Set<PanelIndex>>>;
  layoutMaximizedPanel: PanelIndex | null;
  setLayoutMaximizedPanel: Dispatch<SetStateAction<PanelIndex | null>>;
  layoutPoppedPanel: PanelIndex | null;
  setLayoutPoppedPanel: Dispatch<SetStateAction<PanelIndex | null>>;
  layoutPackageFilter: string;
  setLayoutPackageFilter: Dispatch<SetStateAction<string>>;
  layoutProcessDialogOpen: boolean;
  setLayoutProcessDialogOpen: Dispatch<SetStateAction<boolean>>;
  layoutProcessList: LayoutProcessItem[];
  setLayoutProcessList: Dispatch<SetStateAction<LayoutProcessItem[]>>;
  layoutProcessSearch: string;
  setLayoutProcessSearch: Dispatch<SetStateAction<string>>;
  layoutSelectedProcess: LayoutProcessItem | null;
  setLayoutSelectedProcess: Dispatch<SetStateAction<LayoutProcessItem | null>>;
  layoutProcessLoading: boolean;
  setLayoutProcessLoading: Dispatch<SetStateAction<boolean>>;
  layoutHiddenNodes: Set<string>;
  setLayoutHiddenNodes: Dispatch<SetStateAction<Set<string>>>;
  layoutWireframeMode: boolean;
  setLayoutWireframeMode: Dispatch<SetStateAction<boolean>>;
  layoutPreviewZoom: number;
  setLayoutPreviewZoom: Dispatch<SetStateAction<number>>;
}

function parseUiTreeXml(xmlString: string): UiTreeNode[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) return [];

  function parseNode(el: Element, pathPrefix: string, index: number): UiTreeNode {
    const path = `${pathPrefix}/${index}`;
    const attributes: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      attributes[attr.name] = attr.value;
    }
    const className = attributes["class"] || el.tagName;
    const children: UiTreeNode[] = [];
    let childIndex = 0;
    for (const child of Array.from(el.children)) {
      children.push(parseNode(child, path, childIndex));
      childIndex++;
    }
    return { path, className, attributes, children };
  }

  const root = doc.documentElement;
  if (!root) return [];
  if (root.tagName === "hierarchy") {
    const result: UiTreeNode[] = [];
    let idx = 0;
    for (const child of Array.from(root.children)) {
      result.push(parseNode(child, "", idx));
      idx++;
    }
    return result;
  }
  return [parseNode(root, "", 0)];
}

function getUiNodeLabel(node: UiTreeNode): string {
  const resourceId = node.attributes["resource-id"] || "";
  const text = node.attributes.text || "";
  const shortClass = node.className.includes(".") ? node.className.split(".").pop()! : node.className;
  let label = shortClass;
  if (resourceId) {
    const shortId = resourceId.includes("/") ? resourceId.split("/").pop()! : resourceId;
    label += ` [${shortId}]`;
  }
  if (text) {
    const truncated = text.length > 20 ? `${text.slice(0, 20)}…` : text;
    label += ` "${truncated}"`;
  }
  return label;
}

function getBoundsCenter(boundsStr: string): { x: number; y: number } | null {
  const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return null;
  const x1 = parseInt(match[1], 10);
  const y1 = parseInt(match[2], 10);
  const x2 = parseInt(match[3], 10);
  const y2 = parseInt(match[4], 10);
  return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
}

function parseBoundsRect(boundsStr: string): { x1: number; y1: number; x2: number; y2: number } | null {
  const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return null;
  return { x1: parseInt(match[1], 10), y1: parseInt(match[2], 10), x2: parseInt(match[3], 10), y2: parseInt(match[4], 10) };
}

function findNodeAtPoint(nodes: UiTreeNode[], x: number, y: number, hiddenNodes?: Set<string>): UiTreeNode | null {
  let bestNode: UiTreeNode | null = null;
  let bestArea = Infinity;

  function search(nodeList: UiTreeNode[]) {
    for (const node of nodeList) {
      if (hiddenNodes?.has(node.path)) continue;
      const rect = parseBoundsRect(node.attributes.bounds || "");
      if (!rect) continue;
      if (x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2) {
        const area = (rect.x2 - rect.x1) * (rect.y2 - rect.y1);
        if (area < bestArea) {
          bestArea = area;
          bestNode = node;
        }
      }
      search(node.children);
    }
  }

  search(nodes);
  return bestNode;
}

function expandPathToNode(targetPath: string): Set<string> {
  const paths = new Set<string>();
  const parts = targetPath.split("/").filter(Boolean);
  let current = "";
  for (let i = 0; i < parts.length - 1; i++) {
    current += `/${parts[i]}`;
    paths.add(current);
  }
  return paths;
}

export default function LayoutPage({
  currentDeviceLabel,
  currentDeviceId,
  currentDeviceName,
  hasCurrentDevice,
  runtimeApi,
  layoutViewerTab,
  setLayoutViewerTab,
  layoutWinscopeToken,
  layoutUiTreeXml,
  setLayoutUiTreeXml,
  layoutUiTreeLoading,
  setLayoutUiTreeLoading,
  layoutUiTreeError,
  setLayoutUiTreeError,
  layoutSelectedNodePath,
  setLayoutSelectedNodePath,
  layoutExpandedNodes,
  setLayoutExpandedNodes,
  layoutScreenshotDataUrl,
  setLayoutScreenshotDataUrl,
  layoutScreenshotSize,
  setLayoutScreenshotSize,
  layoutPanelSizes,
  setLayoutPanelSizes,
  layoutCollapsedPanels,
  setLayoutCollapsedPanels,
  layoutMaximizedPanel,
  setLayoutMaximizedPanel,
  layoutPoppedPanel,
  setLayoutPoppedPanel,
  layoutPackageFilter,
  setLayoutPackageFilter,
  layoutProcessDialogOpen,
  setLayoutProcessDialogOpen,
  layoutProcessList,
  setLayoutProcessList,
  layoutProcessSearch,
  setLayoutProcessSearch,
  layoutSelectedProcess,
  setLayoutSelectedProcess,
  layoutProcessLoading,
  setLayoutProcessLoading,
  layoutHiddenNodes,
  setLayoutHiddenNodes,
  layoutWireframeMode,
  setLayoutWireframeMode,
  layoutPreviewZoom,
  setLayoutPreviewZoom,
}: LayoutPageProps) {
  const layoutDragRef = useRef<{ index: number; startX: number; startSizes: [number, number, number] } | null>(null);

  const parsedTreeRaw = useMemo(() => parseUiTreeXml(layoutUiTreeXml), [layoutUiTreeXml]);
  const parsedTree = useMemo(() => {
    if (!layoutPackageFilter) {
      return parsedTreeRaw;
    }
    function filterByPackage(nodes: UiTreeNode[]): UiTreeNode[] {
      return nodes.reduce<UiTreeNode[]>((acc, node) => {
        if (node.attributes.package?.includes(layoutPackageFilter)) {
          acc.push(node);
        } else {
          const filteredChildren = filterByPackage(node.children);
          if (filteredChildren.length > 0) {
            acc.push({ ...node, children: filteredChildren });
          }
        }
        return acc;
      }, []);
    }
    return filterByPackage(parsedTreeRaw);
  }, [parsedTreeRaw, layoutPackageFilter]);

  const selectedNode = useMemo(() => {
    if (!layoutSelectedNodePath) return null;
    function findByPath(nodes: UiTreeNode[]): UiTreeNode | null {
      for (const node of nodes) {
        if (node.path === layoutSelectedNodePath) return node;
        const found = findByPath(node.children);
        if (found) return found;
      }
      return null;
    }
    return findByPath(parsedTree);
  }, [layoutSelectedNodePath, parsedTree]);

  const panelNames: readonly [string, string, string] = ["UI 树", "布局预览", "属性详情"];
  const allPanels: PanelIndex[] = [0, 1, 2];
  const visiblePanels: PanelIndex[] = allPanels.filter((index) => !layoutCollapsedPanels.has(index) && layoutPoppedPanel !== index);
  const isMaxMode = layoutMaximizedPanel !== null && visiblePanels.includes(layoutMaximizedPanel);

  function renderTreeNode(node: UiTreeNode, depth: number): ReactNode {
    const isExpanded = layoutExpandedNodes.has(node.path);
    const isSelected = layoutSelectedNodePath === node.path;
    const hasChildren = node.children.length > 0;
    return (
      <Fragment key={node.path}>
        <div
          className={`layout-tree-node ${isSelected ? "layout-tree-node-selected" : ""}`}
          style={{ paddingLeft: depth * 16 + 8 } as CSSProperties}
          onClick={() => {
            setLayoutSelectedNodePath(node.path);
            if (hasChildren) {
              setLayoutExpandedNodes((prev) => {
                const next = new Set(prev);
                if (next.has(node.path)) next.delete(node.path);
                else next.add(node.path);
                return next;
              });
            }
          }}
        >
          <span className="layout-tree-toggle">{hasChildren ? (isExpanded ? <Icon name="collapse-list" size={10} /> : <Icon name="expand-list" size={10} />) : "　"}</span>
          <span className="layout-tree-label">{getUiNodeLabel(node)}</span>
        </div>
        {isExpanded && hasChildren ? node.children.map((child) => renderTreeNode(child, depth + 1)) : null}
      </Fragment>
    );
  }

  function handleDividerDown(event: ReactMouseEvent<HTMLDivElement>, dividerIndex: number) {
    event.preventDefault();
    layoutDragRef.current = { index: dividerIndex, startX: event.clientX, startSizes: [...layoutPanelSizes] };
    const onMove = (moveEvent: MouseEvent) => {
      if (!layoutDragRef.current) return;
      const { index, startX, startSizes } = layoutDragRef.current;
      const container = (event.target as HTMLElement).parentElement;
      if (!container) return;
      const containerWidth = container.clientWidth - 12;
      const dx = moveEvent.clientX - startX;
      const dxPercent = (dx / containerWidth) * 100;
      const leftIdx = index === 0 ? 0 : 1;
      const rightIdx = index === 0 ? 1 : 2;
      const newSizes: [number, number, number] = [...startSizes];
      newSizes[leftIdx] = Math.max(10, startSizes[leftIdx] + dxPercent);
      newSizes[rightIdx] = Math.max(10, startSizes[rightIdx] - dxPercent);
      setLayoutPanelSizes(newSizes);
    };
    const onUp = () => {
      layoutDragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function toggleCollapse(panelIdx: PanelIndex) {
    setLayoutCollapsedPanels((prev) => {
      const next = new Set(prev);
      if (next.has(panelIdx)) next.delete(panelIdx);
      else next.add(panelIdx);
      return next;
    });
    if (layoutMaximizedPanel === panelIdx) setLayoutMaximizedPanel(null);
  }

  function toggleMaximize(panelIdx: PanelIndex) {
    setLayoutMaximizedPanel((prev) => (prev === panelIdx ? null : panelIdx));
  }

  function renderPanelToolbar(panelIdx: PanelIndex) {
    const isMaximized = layoutMaximizedPanel === panelIdx;
    return (
      <div className="layout-panel-toolbar">
        <span className="layout-panel-title">{panelNames[panelIdx]}</span>
        <div className="layout-panel-toolbar-actions">
          <button className="layout-panel-btn" onClick={() => toggleCollapse(panelIdx)} title="收起">◀</button>
          <button className="layout-panel-btn" onClick={() => toggleMaximize(panelIdx)} title={isMaximized ? "还原" : "最大化"}>
            {isMaximized ? "⊡" : "⊞"}
          </button>
          <button
            className="layout-panel-btn"
            onClick={async () => {
              setLayoutPoppedPanel(panelIdx);
              try {
                await runtimeApi.layout.setPopoutState({ uiTreeXml: layoutUiTreeXml, screenshotDataUrl: layoutScreenshotDataUrl, deviceId: currentDeviceId });
                await runtimeApi.layout.popoutPanel({ panelId: panelIdx, title: panelNames[panelIdx] });
              } catch {
                // ignore
              }
            }}
            title="弹出独立窗口"
          >
            ⧉
          </button>
        </div>
      </div>
    );
  }

  function getPanelFlex(idx: PanelIndex): string {
    if (isMaxMode) return idx === layoutMaximizedPanel ? "1 1 100%" : "0 0 0px";
    if (!visiblePanels.includes(idx)) return "0 0 0px";
    let totalVisible = 0;
    for (const index of visiblePanels) {
      totalVisible += layoutPanelSizes[index];
    }
    return `${layoutPanelSizes[idx] / totalVisible} 1 0px`;
  }

  async function handleLoadProcesses() {
    setLayoutProcessDialogOpen(true);
    setLayoutProcessLoading(true);
    try {
      const result = await runtimeApi.layout.listProcesses({ deviceId: currentDeviceId });
      if (result.status === "ok" && result.processes) {
        setLayoutProcessList(result.processes);
      }
    } catch {
      // ignore
    } finally {
      setLayoutProcessLoading(false);
    }
  }

  async function handleLoadUiTree() {
    if (!currentDeviceId || !layoutSelectedProcess) return;
    setLayoutUiTreeLoading(true);
    setLayoutUiTreeError(null);
    setLayoutSelectedNodePath(null);
    setLayoutHiddenNodes(new Set());
    try {
      const [dumpResult, screenshotResult] = await Promise.all([
        runtimeApi.layout.dumpUiTree({ deviceId: currentDeviceId }),
        runtimeApi.layout.screenshot({ deviceId: currentDeviceId }),
      ]);
      if (dumpResult.status === "ok") {
        setLayoutUiTreeXml(dumpResult.xml ?? "");
        setLayoutExpandedNodes(new Set());
      } else {
        setLayoutUiTreeError(dumpResult.message ?? "UI dump 失败");
      }
      if (screenshotResult.status === "ok" && screenshotResult.dataUrl) {
        setLayoutScreenshotDataUrl(screenshotResult.dataUrl);
      }
    } catch (err: unknown) {
      setLayoutUiTreeError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLayoutUiTreeLoading(false);
    }
  }

  function handleExpandAll() {
    const expandAll = new Set<string>();
    function collectPaths(nodes: UiTreeNode[]) {
      for (const node of nodes) {
        expandAll.add(node.path);
        collectPaths(node.children);
      }
    }
    collectPaths(parseUiTreeXml(layoutUiTreeXml));
    setLayoutExpandedNodes(expandAll);
  }

  return (
    <>
      <main className="page-shell">
        <section className="panel page-panel info-page-panel">
          <div className="page-header">
            <div>
              <h3>布局查看器</h3>
              <p className="panel-list-subtitle">系统级窗口布局（Winscope）和 UI 树查看器（Layout Inspector）。</p>
            </div>
            <div className="page-header-badges">
              <span className="badge info">当前设备：{currentDeviceLabel}</span>
            </div>
          </div>

          <div className="device-info-layout" style={{ flex: 1, minHeight: 0 }}>
            <nav className="device-info-sidebar">
              <button className={`device-info-tab ${layoutViewerTab === "winscope" ? "active" : ""}`} onClick={() => setLayoutViewerTab("winscope")}>Winscope</button>
              <button className={`device-info-tab ${layoutViewerTab === "inspector" ? "active" : ""}`} onClick={() => setLayoutViewerTab("inspector")}>Layout Inspector</button>
            </nav>
            <div className="device-info-content" style={{ flex: 1, minHeight: 0 }}>
              <div className="layout-viewer-winscope-container" style={{ display: layoutViewerTab === "winscope" ? "flex" : "none" }}>
                {layoutWinscopeToken === null ? (
                  <div className="result-empty-state">
                    <p>正在启动 Winscope Proxy...</p>
                  </div>
                ) : (
                  <iframe
                    src={`${window.location.protocol === "file:" ? "winscope://" : "/"}winscope/index.html${layoutWinscopeToken ? `?token=${layoutWinscopeToken}` : ""}`}
                    className="layout-viewer-winscope-iframe"
                    title="Winscope"
                    onLoad={(event) => {
                      const iframe = event.currentTarget;
                      const deviceId = currentDeviceId;
                      const deviceName = currentDeviceName;
                      if (!deviceId) return;
                      const matchTexts = [deviceId, deviceName].filter(Boolean);
                      let attempts = 0;
                      const trySelect = () => {
                        attempts++;
                        if (attempts > 30) return;
                        try {
                          const doc = iframe.contentDocument;
                          if (!doc) {
                            setTimeout(trySelect, 500);
                            return;
                          }
                          const changeDeviceLink = Array.from(doc.querySelectorAll("a, button, span")).find((el) => el.textContent?.includes("CHANGE DEVICE")) as HTMLElement | undefined;
                          if (changeDeviceLink) {
                            const currentText = changeDeviceLink.closest(".device-choice, [class*=device]")?.textContent ?? doc.body.textContent ?? "";
                            if (matchTexts.some((text) => currentText.includes(text))) return;
                            changeDeviceLink.click();
                            setTimeout(trySelect, 500);
                            return;
                          }
                          const deviceChoice = doc.querySelector(".device-choice");
                          if (deviceChoice) {
                            const labels = deviceChoice.querySelectorAll("label, .device-choice *");
                            for (const label of labels) {
                              if (matchTexts.some((text) => label.textContent?.includes(text))) {
                                const input = label.querySelector("input") ?? label.previousElementSibling;
                                if (input && input.tagName === "INPUT") {
                                  (input as HTMLInputElement).click();
                                } else {
                                  (label as HTMLElement).click();
                                }
                                return;
                              }
                            }
                          }
                          const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
                          let node: Node | null;
                          while ((node = walker.nextNode())) {
                            if (matchTexts.some((text) => node?.textContent?.includes(text))) {
                              const parent = node.parentElement;
                              if (parent) {
                                parent.click();
                                return;
                              }
                            }
                          }
                        } catch {
                          // not ready yet
                        }
                        setTimeout(trySelect, 500);
                      };
                      setTimeout(trySelect, 2000);
                    }}
                  />
                )}
              </div>

              {layoutViewerTab === "inspector" ? (
                <div className="layout-inspector-container">
                  <div className="layout-inspector-toolbar">
                    <button className="ghost-button compact-button" onClick={() => void handleLoadProcesses()}>
                      {layoutSelectedProcess ? `进程: ${layoutSelectedProcess.name}` : "选择进程"}
                    </button>
                    <button className="primary-button compact-button" disabled={!hasCurrentDevice || layoutUiTreeLoading || !layoutSelectedProcess} onClick={() => void handleLoadUiTree()}>
                      {layoutUiTreeLoading ? "正在获取…" : "获取 UI 树"}
                    </button>
                    {layoutUiTreeXml ? <button className="ghost-button compact-button" onClick={handleExpandAll}>全部展开</button> : null}
                    {layoutUiTreeXml ? <button className="ghost-button compact-button" onClick={() => setLayoutExpandedNodes(new Set())}>全部折叠</button> : null}
                  </div>

                  {layoutUiTreeError ? (
                    <div className="result-empty-state">
                      <strong>获取 UI 树失败</strong>
                      <p>{layoutUiTreeError}</p>
                    </div>
                  ) : null}

                  {layoutUiTreeXml && !layoutUiTreeError ? (
                    <>
                      <div className="layout-inspector-split">
                        {visiblePanels.includes(0) ? (
                          <div className="layout-inspector-tree" style={{ flex: getPanelFlex(0), display: isMaxMode && layoutMaximizedPanel !== 0 ? "none" : undefined }}>
                            {renderPanelToolbar(0)}
                            <div className="layout-inspector-tree-scroll">
                              {parsedTree.map((node) => renderTreeNode(node, 0))}
                            </div>
                          </div>
                        ) : null}

                        {visiblePanels.includes(0) && visiblePanels.includes(1) && !isMaxMode ? <div className="layout-split-divider" onMouseDown={(event) => handleDividerDown(event, 0)} /> : null}

                        {visiblePanels.includes(1) ? (
                          <div className="layout-inspector-preview" style={{ flex: getPanelFlex(1), display: isMaxMode && layoutMaximizedPanel !== 1 ? "none" : undefined }}>
                            {renderPanelToolbar(1)}
                            <div className="layout-preview-mode-toggle">
                              <button className={`ghost-button compact-button ${layoutWireframeMode ? "primary-button-ghost" : ""}`} onClick={() => setLayoutWireframeMode(true)}>线框</button>
                              <button className={`ghost-button compact-button ${!layoutWireframeMode ? "primary-button-ghost" : ""}`} onClick={() => setLayoutWireframeMode(false)}>截图</button>
                              {layoutPreviewZoom !== 1 ? <button className="ghost-button compact-button" onClick={() => setLayoutPreviewZoom(1)}>重置</button> : null}
                              {layoutPreviewZoom !== 1 ? <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 4 }}>{Math.round(layoutPreviewZoom * 100)}%</span> : null}
                            </div>

                            {layoutWireframeMode ? (
                              <div
                                className="layout-preview-image-wrapper"
                                style={{ overflow: "auto", position: "relative" }}
                                onWheel={(event) => {
                                  if (event.ctrlKey) {
                                    event.preventDefault();
                                    const delta = event.deltaY > 0 ? 0.9 : 1.1;
                                    setLayoutPreviewZoom((zoom) => Math.max(0.5, Math.min(10, zoom * delta)));
                                  }
                                }}
                                onClick={(event) => {
                                  const svgEl = event.currentTarget.querySelector("svg");
                                  if (!svgEl) return;
                                  const rect = svgEl.getBoundingClientRect();
                                  const sw = layoutScreenshotSize.width || 1080;
                                  const sh = layoutScreenshotSize.height || 1920;
                                  const clickX = ((event.clientX - rect.left) / rect.width) * sw;
                                  const clickY = ((event.clientY - rect.top) / rect.height) * sh;
                                  const hit = findNodeAtPoint(parsedTree, clickX, clickY, layoutHiddenNodes);
                                  if (hit) {
                                    setLayoutSelectedNodePath(hit.path);
                                    const ancestors = expandPathToNode(hit.path);
                                    setLayoutExpandedNodes((prev) => new Set([...prev, ...ancestors]));
                                  }
                                }}
                              >
                                <div style={{ transform: `scale(${layoutPreviewZoom})`, transformOrigin: "center center", display: "flex", alignItems: "center", justifyContent: "center", minWidth: "100%", minHeight: "100%" }}>
                                  {(() => {
                                    const sw = layoutScreenshotSize.width || 1080;
                                    const sh = layoutScreenshotSize.height || 1920;
                                    function renderWireframeNode(node: UiTreeNode): ReactNode[] {
                                      if (layoutHiddenNodes.has(node.path)) return [];
                                      const rects: ReactNode[] = [];
                                      const bounds = parseBoundsRect(node.attributes.bounds);
                                      if (bounds) {
                                        const isSelected = node.path === layoutSelectedNodePath;
                                        rects.push(
                                          <rect
                                            key={node.path}
                                            x={bounds.x1}
                                            y={bounds.y1}
                                            width={bounds.x2 - bounds.x1}
                                            height={bounds.y2 - bounds.y1}
                                            fill={isSelected ? "rgba(33, 150, 243, 0.15)" : "none"}
                                            stroke={isSelected ? "#2196F3" : "#666"}
                                            strokeWidth={isSelected ? 2 : 0.5}
                                          />
                                        );
                                      }
                                      for (const child of node.children) {
                                        rects.push(...renderWireframeNode(child));
                                      }
                                      return rects;
                                    }
                                    return (
                                      <svg className="layout-wireframe-svg" viewBox={`0 0 ${sw} ${sh}`} style={{ width: "100%", height: "auto", maxHeight: "100%", background: "#1a1a2e" }}>
                                        {parsedTree.flatMap((node) => renderWireframeNode(node))}
                                      </svg>
                                    );
                                  })()}
                                </div>
                              </div>
                            ) : layoutScreenshotDataUrl ? (
                              <div
                                className="layout-preview-image-wrapper"
                                style={{ overflow: "auto", position: "relative" }}
                                onWheel={(event) => {
                                  if (event.ctrlKey) {
                                    event.preventDefault();
                                    const delta = event.deltaY > 0 ? 0.9 : 1.1;
                                    setLayoutPreviewZoom((zoom) => Math.max(0.5, Math.min(10, zoom * delta)));
                                  }
                                }}
                                onClick={(event) => {
                                  const imgEl = event.currentTarget.querySelector("img");
                                  if (!imgEl) return;
                                  const rect = imgEl.getBoundingClientRect();
                                  const clickX = ((event.clientX - rect.left) / rect.width) * layoutScreenshotSize.width;
                                  const clickY = ((event.clientY - rect.top) / rect.height) * layoutScreenshotSize.height;
                                  const hit = findNodeAtPoint(parsedTree, clickX, clickY, layoutHiddenNodes);
                                  if (hit) {
                                    setLayoutSelectedNodePath(hit.path);
                                    const ancestors = expandPathToNode(hit.path);
                                    setLayoutExpandedNodes((prev) => new Set([...prev, ...ancestors]));
                                  }
                                }}
                              >
                                <div style={{ transform: `scale(${layoutPreviewZoom})`, transformOrigin: "center center", display: "flex", alignItems: "center", justifyContent: "center", minWidth: "100%", minHeight: "100%" }}>
                                  <div style={{ position: "relative", display: "inline-block", maxWidth: "100%", maxHeight: "100%" }}>
                                    <img
                                      src={layoutScreenshotDataUrl}
                                      alt="设备截图"
                                      className="layout-preview-image"
                                      onLoad={(event) => {
                                        const img = event.currentTarget;
                                        setLayoutScreenshotSize({ width: img.naturalWidth, height: img.naturalHeight });
                                      }}
                                    />
                                    {selectedNode?.attributes.bounds ? (() => {
                                      const rect = parseBoundsRect(selectedNode.attributes.bounds);
                                      if (!rect) return null;
                                      const { x1, y1, x2, y2 } = rect;
                                      const sw = layoutScreenshotSize.width;
                                      const sh = layoutScreenshotSize.height;
                                      return (
                                        <svg className="layout-preview-svg-overlay" viewBox={`0 0 ${sw} ${sh}`}>
                                          <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill="rgba(33, 150, 243, 0.2)" stroke="#2196F3" strokeWidth="3" />
                                        </svg>
                                      );
                                    })() : null}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="result-empty-state">
                                <p>截图将在获取 UI 树时自动加载</p>
                              </div>
                            )}
                          </div>
                        ) : null}

                        {visiblePanels.includes(1) && visiblePanels.includes(2) && !isMaxMode ? <div className="layout-split-divider" onMouseDown={(event) => handleDividerDown(event, 1)} /> : null}
                        {!visiblePanels.includes(1) && visiblePanels.includes(0) && visiblePanels.includes(2) && !isMaxMode ? <div className="layout-split-divider" onMouseDown={(event) => handleDividerDown(event, 0)} /> : null}

                        {visiblePanels.includes(2) ? (
                          <div className="layout-inspector-detail" style={{ flex: getPanelFlex(2), display: isMaxMode && layoutMaximizedPanel !== 2 ? "none" : undefined }}>
                            {renderPanelToolbar(2)}
                            {selectedNode ? (
                              <>
                                <div className="layout-detail-header">
                                  <strong>{selectedNode.className}</strong>
                                  <div className="layout-detail-header-actions">
                                    {selectedNode.attributes.bounds ? (() => {
                                      const center = getBoundsCenter(selectedNode.attributes.bounds);
                                      return center ? (
                                        <button
                                          className="ghost-button compact-button"
                                          onClick={() => {
                                            const cmd = `adb -s ${currentDeviceId} shell input tap ${center.x} ${center.y}`;
                                            void navigator.clipboard.writeText(cmd);
                                          }}
                                          title="复制点击命令到剪贴板"
                                        >
                                          复制点击命令
                                        </button>
                                      ) : null;
                                    })() : null}
                                    <button
                                      className={`ghost-button compact-button ${layoutHiddenNodes.has(selectedNode.path) ? "danger-button-ghost" : ""}`}
                                      onClick={() => {
                                        setLayoutHiddenNodes((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(selectedNode.path)) next.delete(selectedNode.path);
                                          else next.add(selectedNode.path);
                                          return next;
                                        });
                                      }}
                                      title={layoutHiddenNodes.has(selectedNode.path) ? "恢复显示" : "隐藏此控件（本地过滤）"}
                                    >
                                      {layoutHiddenNodes.has(selectedNode.path) ? "恢复显示" : "隐藏控件"}
                                    </button>
                                  </div>
                                </div>
                                <div className="layout-detail-attrs">
                                  {Object.entries(selectedNode.attributes).map(([key, value]) => (
                                    <div key={key} className="layout-detail-attr-row">
                                      <span className="layout-detail-attr-key">{key}</span>
                                      <span className="layout-detail-attr-value">{value}</span>
                                    </div>
                                  ))}
                                </div>
                                {selectedNode.attributes.bounds ? (() => {
                                  const center = getBoundsCenter(selectedNode.attributes.bounds);
                                  return center ? (
                                    <div className="layout-detail-tap-section">
                                      <p className="section-kicker">一键生成点击命令</p>
                                      <code className="layout-detail-tap-code">adb -s {currentDeviceId} shell input tap {center.x} {center.y}</code>
                                      <button
                                        className="primary-button compact-button"
                                        style={{ marginTop: 8 }}
                                        disabled={!hasCurrentDevice}
                                        onClick={async () => {
                                          if (!currentDeviceId) return;
                                          try {
                                            await runtimeApi.command.run({
                                              deviceId: currentDeviceId,
                                              deviceName: currentDeviceName,
                                              commandId: "shell-input-tap",
                                              commandTitle: `input tap ${center.x} ${center.y}`,
                                              rawCommand: `shell input tap ${center.x} ${center.y}`,
                                              args: [],
                                              source: "layout-inspector",
                                            });
                                          } catch {
                                            // ignore
                                          }
                                        }}
                                      >
                                        立即执行点击
                                      </button>
                                    </div>
                                  ) : null;
                                })() : null}
                              </>
                            ) : (
                              <div className="result-empty-state">
                                <p>点击左侧树中的节点查看属性详情</p>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>

                      {layoutCollapsedPanels.size > 0 || layoutPoppedPanel !== null ? (
                        <div className="layout-collapsed-bar">
                          {allPanels.filter((index) => layoutCollapsedPanels.has(index) || layoutPoppedPanel === index).map((index) => (
                            <button key={index} className="ghost-button compact-button" onClick={() => {
                              if (layoutPoppedPanel === index) {
                                setLayoutPoppedPanel(null);
                              } else {
                                toggleCollapse(index);
                              }
                            }}>
                              <Icon name="start" size={12} /> {panelNames[index]}{layoutPoppedPanel === index ? "（已弹出，点击回收）" : ""}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {!layoutUiTreeXml && !layoutUiTreeError && !layoutUiTreeLoading ? (
                    <div className="result-empty-state">
                      <strong>Layout Inspector</strong>
                      <p>点击"获取 UI 树"开始分析当前设备界面布局。</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {layoutProcessDialogOpen ? (
          <div className="modal-mask" onClick={() => setLayoutProcessDialogOpen(false)}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()} style={{ width: "min(560px, calc(100vw - 32px))" }}>
              <div className="modal-head">
                <h3>选择 APP 进程</h3>
                <button className="ghost-button" onClick={() => setLayoutProcessDialogOpen(false)}>✕</button>
              </div>
              <div className="modal-body" style={{ padding: "8px 16px" }}>
                <input
                  type="text"
                  placeholder="搜索进程名..."
                  value={layoutProcessSearch}
                  onChange={(event) => setLayoutProcessSearch(event.target.value)}
                  className="layout-toolbar-input"
                  style={{ width: "100%", marginBottom: 8 }}
                  autoFocus
                />
              </div>
              <div style={{ overflowY: "auto", maxHeight: "50vh", padding: "0 16px 16px" }}>
                {layoutProcessLoading ? (
                  <p>加载中...</p>
                ) : (
                  layoutProcessList
                    .filter((process) => !layoutProcessSearch || process.name.toLowerCase().includes(layoutProcessSearch.toLowerCase()))
                    .map((process) => (
                      <div
                        key={process.pid}
                        className={`layout-process-item ${layoutSelectedProcess?.pid === process.pid ? "selected" : ""}`}
                        onClick={() => {
                          setLayoutSelectedProcess(process);
                          setLayoutPackageFilter(process.name);
                          setLayoutProcessDialogOpen(false);
                        }}
                      >
                        <span className="layout-process-name">{process.name}</span>
                        <span className="layout-process-pid">{process.user || ""} PID: {process.pid}</span>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}