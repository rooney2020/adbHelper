const DIRECTORY_DB_NAME = "skill-viewer-directory-cache";
const DIRECTORY_STORE_NAME = "handles";
const LAST_DIRECTORY_HANDLE_KEY = "last-directory-handle";
const LAST_PRESET_STORAGE_KEY = "skill-viewer-last-preset";
const AUTO_AUTH_SKIP_PREFIX = "skill-viewer-skip-auto-auth:";
const RUNTIME_ENVIRONMENT = detectRuntimeEnvironment();
const RECOMMENDED_DIRECTORIES = [
  {
    id: "copilot",
    name: "Copilot Skills",
    path: buildRecommendedSkillsPath(".copilot"),
    description: "GitHub Copilot 当前常用的 skills 目录。",
  },
  {
    id: "cursor",
    name: "Cursor Skills",
    path: buildRecommendedSkillsPath(".cursor"),
    description: "Cursor 本地 skills 目录。",
  },
  {
    id: "openclaw",
    name: "OpenClaw Skills",
    path: buildRecommendedSkillsPath(".openclaw"),
    description: "OpenClaw 本地 skills 目录。",
  },
];

function detectRuntimeEnvironment(pathname = window?.location?.pathname, platformName = window?.navigator?.userAgentData?.platform || window?.navigator?.platform) {
  const rawPathname = typeof pathname === "string" ? decodeURIComponent(pathname) : "";
  const normalizedPathname = rawPathname.replace(/\\/g, "/");
  const windowsMatch = normalizedPathname.match(/^\/([A-Za-z]:\/Users\/[^/]+)/);
  if (windowsMatch?.[1]) {
    return { os: "windows", homePath: windowsMatch[1] };
  }

  const linuxMatch = normalizedPathname.match(/^(\/home\/[^/]+)/);
  if (linuxMatch?.[1]) {
    return { os: "linux", homePath: linuxMatch[1] };
  }

  const macMatch = normalizedPathname.match(/^(\/Users\/[^/]+)/);
  if (macMatch?.[1]) {
    return { os: "macos", homePath: macMatch[1] };
  }

  const platform = String(platformName || "").toLowerCase();
  if (platform.includes("win")) {
    return { os: "windows", homePath: "" };
  }
  if (platform.includes("mac")) {
    return { os: "macos", homePath: "" };
  }
  return { os: "linux", homePath: "" };
}

function buildRecommendedSkillsPath(appDirectoryName, runtimeEnvironment = RUNTIME_ENVIRONMENT) {
  if (runtimeEnvironment.os === "windows") {
    const windowsHome = runtimeEnvironment.homePath || "%USERPROFILE%";
    return `${windowsHome.replace(/\//g, "\\")}\\${appDirectoryName}\\skills`;
  }

  const unixHome = runtimeEnvironment.homePath || "~";
  return `${unixHome}/${appDirectoryName}/skills`;
}

const state = {
  files: new Map(),
  previewUrls: new Map(),
  fileContentCache: new Map(),
  expandedDirectories: new Set(),
  rootDirectoryLabel: "",
  rootPathHint: "",
  currentFilePath: "",
  currentFileContent: "",
  currentReferences: [],
  history: [],
  historyIndex: -1,
  filterText: "",
  htmlTab: "preview",
  sidebarCollapsed: false,
  referencesCollapsed: false,
  appMode: "viewer",
  viewerMode: "document",
};

let mindMapRuntime = null;

const elements = {
  entryPanel: document.querySelector("#entryPanel"),
  viewerShell: document.querySelector("#viewerShell"),
  emptyLanding: document.querySelector("#emptyLanding"),
  workspaceMain: document.querySelector("#workspaceMain"),
  presetDirectoryList: document.querySelector("#presetDirectoryList"),
  entryPickDirectoryBtn: document.querySelector("#entryPickDirectoryBtn"),
  entryOpenFallbackBtn: document.querySelector("#entryOpenFallbackBtn"),
  backToEntryBtn: document.querySelector("#backToEntryBtn"),
  workspace: document.querySelector(".workspace"),
  sidebar: document.querySelector(".sidebar"),
  references: document.querySelector(".references"),
  rootPathInput: document.querySelector("#rootPathInput"),
  pickDirectoryBtn: document.querySelector("#pickDirectoryBtn"),
  openFallbackBtn: document.querySelector("#openFallbackBtn"),
  folderInput: document.querySelector("#folderInput"),
  rootDirectoryBanner: document.querySelector("#rootDirectoryBanner"),
  rootDirectoryLabel: document.querySelector("#rootDirectoryLabel"),
  currentFileLabel: document.querySelector("#currentFileLabel"),
  referenceCountLabel: document.querySelector("#referenceCountLabel"),
  contentTitle: document.querySelector("#contentTitle"),
  contentSubtitle: document.querySelector("#contentSubtitle"),
  toggleSidebarBtn: document.querySelector("#toggleSidebarBtn"),
  toggleReferencesBtn: document.querySelector("#toggleReferencesBtn"),
  toggleMindMapModeBtn: document.querySelector("#toggleMindMapModeBtn"),
  fileFilterInput: document.querySelector("#fileFilterInput"),
  fileTree: document.querySelector("#fileTree"),
  documentView: document.querySelector("#documentView"),
  historyTrail: document.querySelector("#historyTrail"),
  referenceList: document.querySelector("#referenceList"),
  matchPanel: document.querySelector("#matchPanel"),
  backButton: document.querySelector("#backButton"),
  forwardButton: document.querySelector("#forwardButton"),
};

initialize();

async function initialize() {
  window.addEventListener("popstate", handleBrowserPopState);
  elements.pickDirectoryBtn.addEventListener("click", handlePickDirectory);
  elements.openFallbackBtn.addEventListener("click", () => elements.folderInput.click());
  elements.backToEntryBtn.addEventListener("click", async () => {
    await clearCurrentSelection();
  });
  elements.folderInput.addEventListener("change", handleFolderImport);
  elements.rootPathInput.addEventListener("input", (event) => {
    state.rootPathHint = event.target.value.trim();
  });
  elements.fileFilterInput.addEventListener("input", (event) => {
    state.filterText = event.target.value.trim().toLowerCase();
    renderFileTree();
  });
  tryInitializeFromServerApi();
  elements.toggleSidebarBtn.addEventListener("click", () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    updatePanelVisibility();
  });
  elements.toggleReferencesBtn.addEventListener("click", () => {
    state.referencesCollapsed = !state.referencesCollapsed;
    updatePanelVisibility();
  });
  elements.toggleMindMapModeBtn.addEventListener("click", () => {
    const nextMode = state.viewerMode === "document" ? "mindmap" : "document";
    setViewerMode(nextMode);
  });
  elements.backButton.addEventListener("click", () => moveHistory(-1));
  elements.forwardButton.addEventListener("click", () => moveHistory(1));
  elements.documentView.addEventListener("click", handleReferenceClick);
  elements.referenceList.addEventListener("click", handleReferenceClick);
  elements.matchPanel.addEventListener("click", handleReferenceClick);
  updatePanelVisibility();
  setAppMode("viewer");
  refreshViewerModeUi();
  await restorePersistedDirectory();
}

async function handlePickDirectory() {
  if (typeof window.showDirectoryPicker !== "function") {
    elements.folderInput.click();
    return;
  }

  try {
    const directoryHandle = await window.showDirectoryPicker();
    await loadFromDirectoryHandle(directoryHandle);
  } catch (error) {
    if (error && error.name === "AbortError") {
      return;
    }
    showMessage(`目录打开失败：${error.message}`);
  }
}

async function handleFolderImport(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    return;
  }
  loadFromImportedFiles(files);
  event.target.value = "";
}

async function loadFromDirectoryHandle(directoryHandle, options = {}) {
  const { persist = true, presetId = "" } = options;
  resetViewer();
  updateRootDirectoryDisplay(resolveDirectoryHandlePath(directoryHandle), directoryHandle.name);
  if (presetId) {
    localStorage.setItem(LAST_PRESET_STORAGE_KEY, presetId);
  } else {
    localStorage.removeItem(LAST_PRESET_STORAGE_KEY);
  }
  if (persist) {
    await persistDirectoryHandle(directoryHandle);
    if (presetId) {
      await persistDirectoryHandle(directoryHandle, buildPresetCacheKey(presetId));
    }
  }
  await walkDirectoryHandle(directoryHandle, "");
  afterFilesLoaded();
}

async function walkDirectoryHandle(directoryHandle, prefix) {
  for await (const [name, handle] of directoryHandle.entries()) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      await walkDirectoryHandle(handle, relativePath);
      continue;
    }
    state.files.set(normalizePath(relativePath), {
      type: "handle",
      entry: handle,
    });
  }
}

function loadFromImportedFiles(files) {
  resetViewer();
  const first = files[0];
  const topSegment = first.webkitRelativePath ? first.webkitRelativePath.split("/")[0] : "已导入目录";
  updateRootDirectoryDisplay(resolveImportedDirectoryPath(files), topSegment);
  localStorage.removeItem(LAST_PRESET_STORAGE_KEY);
  for (const file of files) {
    const relativePath = file.webkitRelativePath ? file.webkitRelativePath.split("/").slice(1).join("/") : file.name;
    state.files.set(normalizePath(relativePath), {
      type: "file",
      entry: file,
    });
  }
  afterFilesLoaded();
}

function afterFilesLoaded() {
  return afterFilesLoadedWithPreferredPath();
}

function getQueryParam(name) {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(name) || "";
  } catch (e) {
    return "";
  }
}

function flattenServerTree(nodes, out = []) {
  for (const node of nodes || []) {
    if (node.type === "directory") {
      flattenServerTree(node.children, out);
    } else {
      out.push(node.path);
    }
  }
  return out;
}

function showServerBanner(text, isError = false) {
  const banner = document.querySelector("#rootDirectoryBanner");
  if (banner) {
    banner.textContent = text;
    banner.style.color = isError ? "var(--red)" : "";
  }
}

function updateServerModeUi() {
  const openBtn = document.querySelector("#openFallbackBtn");
  if (openBtn) openBtn.style.display = "";
  const pickBtn = document.querySelector("#pickDirectoryBtn");
  if (pickBtn) pickBtn.textContent = "重新选择其他 Skill 目录";
  const backBtn = document.querySelector("#backToEntryBtn");
  if (backBtn) {
    backBtn.textContent = "返回选择 Skill";
    backBtn.addEventListener("click", () => {
      window.location.href = "/";
    }, { once: true });
  }
}

async function loadFromServerApi(skillId) {
  resetViewer();
  showServerBanner(`正在加载 Skill ${skillId} ...`);
  let treeResp;
  try {
    const r = await fetch(`/api/skill-tree/${encodeURIComponent(skillId)}`, { credentials: "same-origin" });
    treeResp = await r.json();
  } catch (e) {
    showServerBanner("无法连接服务器，请确认已登录", true);
    return;
  }
  if (!treeResp.ok) {
    showServerBanner(`加载失败：${treeResp.error || "未知错误"}`, true);
    return;
  }
  const filePaths = flattenServerTree(treeResp.tree);
  if (!filePaths.length) {
    showServerBanner("该 Skill 目录下没有文件", true);
    return;
  }
  const fileContents = new Map();
  await Promise.all(filePaths.map(async (rel) => {
    try {
      const r = await fetch(`/api/skill-file/${encodeURIComponent(skillId)}?path=${encodeURIComponent(rel)}`, { credentials: "same-origin" });
      const j = await r.json();
      if (j.ok) {
        fileContents.set(rel, j.content);
      }
    } catch (e) {
      // 跳过读取失败的文件
    }
  }));
  for (const rel of filePaths) {
    const content = fileContents.get(rel);
    if (typeof content !== "string") continue;
    state.files.set(normalizePath(rel), {
      type: "manifest",
      content,
    });
  }
  updateRootDirectoryDisplay(null, `Skill ${treeResp.skill.id} - ${treeResp.skill.dir}`);
  showServerBanner(`当前 Skill 目录：${treeResp.skill.dir}（共 ${filePaths.length} 个文件）`);
  updateServerModeUi();
  localStorage.removeItem(LAST_PRESET_STORAGE_KEY);
  try { window.__skillViewerDebug = { fileCount: state.files.size, sample: Array.from(state.files.keys()).slice(0, 20) }; } catch (e) {}
  console.log("[skill-viewer] loaded files from server:", state.files.size, Array.from(state.files.keys()));
  afterFilesLoaded();
}

function tryInitializeFromServerApi() {
  const skillId = getQueryParam("skill");
  if (skillId && /^[0-9]+$/.test(skillId)) {
    loadFromServerApi(skillId);
  }
}

function afterFilesLoadedWithPreferredPath(preferredPath = "") {
  renderFileTree();
  setAppMode("viewer");
  if (elements.emptyLanding) elements.emptyLanding.hidden = true;
  if (elements.workspaceMain) elements.workspaceMain.hidden = false;
  refreshViewerModeUi();
  const browserStatePath = window.history.state?.skillViewerPath;
  const hashPath = getPathFromLocationHash();
  const initialFile = [preferredPath, browserStatePath, hashPath, chooseInitialFile()].find((path) => path && state.files.has(path));
  if (initialFile) {
    navigateTo(initialFile, { pushHistory: true, replaceBrowserState: true });
  } else {
    showMessage("所选目录中没有可读取的文件。", true);
  }
}

async function tryLoadPresetDirectoryHandle(presetId, initialPath = "") {
  const cacheKeys = [buildPresetCacheKey(presetId), LAST_DIRECTORY_HANDLE_KEY];

  for (const cacheKey of cacheKeys) {
    const cachedHandle = await getPersistedDirectoryHandle(cacheKey);
    if (!cachedHandle) {
      continue;
    }

    const permission = await ensureDirectoryPermission(cachedHandle, { allowPrompt: false });
    if (permission !== "granted") {
      continue;
    }

    await loadFromDirectoryHandle(cachedHandle, { persist: true, presetId });
    if (initialPath && state.files.has(initialPath)) {
      await navigateTo(initialPath, { pushHistory: true, replaceBrowserState: true });
    }
    return true;
  }

  return false;
}

function resetViewer() {
  for (const url of state.previewUrls.values()) {
    URL.revokeObjectURL(url);
  }
  state.previewUrls.clear();
  state.fileContentCache.clear();
  state.expandedDirectories.clear();
  state.files.clear();
  state.currentFilePath = "";
  state.currentFileContent = "";
  state.currentReferences = [];
  state.history = [];
  state.historyIndex = -1;
  state.htmlTab = "preview";
  state.viewerMode = "document";
  updateRootDirectoryDisplay("", "未选择");
  elements.currentFileLabel.textContent = "未打开";
  elements.referenceCountLabel.textContent = "0 条";
  elements.matchPanel.classList.add("hidden");
  elements.matchPanel.innerHTML = "";
  renderFileTree();
  renderHistoryTrail();
  renderReferenceList([]);
  showMessage("打开 skill 后，这里会显示解析后的内容。", true);
  updateHistoryButtons();
  refreshViewerModeUi();
  getMindMapRuntime().reset();
}

async function clearCurrentSelection() {
  resetViewer();
  localStorage.removeItem(LAST_PRESET_STORAGE_KEY);
  await deletePersistedDirectoryHandle(LAST_DIRECTORY_HANDLE_KEY);
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
  if (elements.emptyLanding && elements.workspaceMain) {
    elements.emptyLanding.hidden = false;
    elements.workspaceMain.hidden = true;
  }
}

function renderRecommendedDirectories() {
  elements.presetDirectoryList.innerHTML = RECOMMENDED_DIRECTORIES.map(
    (directory) => `
      <article class="preset-card" data-preset-card="${escapeHtmlAttribute(directory.id)}">
        <h3>${escapeHtml(directory.name)}</h3>
        <p>${escapeHtml(directory.description)}</p>
        <div class="preset-path">${escapeHtml(directory.path)}</div>
        <section class="preset-skill-section">
          <div class="preset-skill-caption">包含的 Skill 目录</div>
          <div class="preset-skill-list is-loading" data-preset-skill-list="${escapeHtmlAttribute(directory.id)}">正在扫描已授权目录...</div>
        </section>
        <button class="secondary-button" type="button" data-preset-id="${escapeHtmlAttribute(directory.id)}">打开目录</button>
      </article>
    `
  ).join("");
}

async function hydrateRecommendedDirectories(options = {}) {
  const { autoAuthorizeMissing = false } = options;

  for (const preset of RECOMMENDED_DIRECTORIES) {
    const container = elements.presetDirectoryList.querySelector(`[data-preset-skill-list="${escapeHtmlAttribute(preset.id)}"]`);
    if (!container) {
      continue;
    }

    try {
      const skillDirectories = await listPresetSkillDirectories(preset.id);
      if (!skillDirectories.length) {
        if (autoAuthorizeMissing) {
          const authorized = await ensurePresetDirectoryAuthorized(preset);
          if (authorized) {
            const scannedDirectories = await listPresetSkillDirectories(preset.id);
            if (scannedDirectories.length) {
              container.className = "preset-skill-list";
              container.innerHTML = scannedDirectories
                .map(
                  (skillDirectory) =>
                    `<button class="preset-skill-chip" type="button" data-open-skill="${escapeHtmlAttribute(skillDirectory)}" data-preset-id="${escapeHtmlAttribute(preset.id)}">${escapeHtml(skillDirectory)}</button>`
                )
                .join("");
              continue;
            }
          }
        }

        container.className = "preset-skill-list empty-state";
        container.textContent = "当前还没有已授权的目录句柄。点击“打开目录”后可扫描本机真实内容。";
        continue;
      }

      container.className = "preset-skill-list";
      container.innerHTML = skillDirectories
        .map(
          (skillDirectory) =>
            `<button class="preset-skill-chip" type="button" data-open-skill="${escapeHtmlAttribute(skillDirectory)}" data-preset-id="${escapeHtmlAttribute(preset.id)}">${escapeHtml(skillDirectory)}</button>`
        )
        .join("");
    } catch (error) {
      container.className = "preset-skill-list empty-state";
      container.textContent = "目录扫描失败，请重新点击“打开目录”。";
    }
  }
}

async function listPresetSkillDirectories(presetId) {
  const directoryHandle = await getPresetDirectoryHandle(presetId, { allowPrompt: false });
  if (!directoryHandle) {
    return [];
  }

  const skillDirectories = [];
  for await (const [name, handle] of directoryHandle.entries()) {
    if (handle.kind !== "directory") {
      continue;
    }

    try {
      await handle.getFileHandle("SKILL.md");
      skillDirectories.push(name);
    } catch (error) {
      // Ignore folders without a root SKILL.md file.
    }
  }

  return skillDirectories.sort((left, right) => left.localeCompare(right, "zh-CN"));
}

async function startPresetAuthorizationFlow() {
  if (!elements.entryAuthorizeScanBtn) {
    return;
  }

  elements.entryAuthorizeScanBtn.disabled = true;
  try {
    let authorizedCount = 0;

    for (const preset of RECOMMENDED_DIRECTORIES) {
      const existingDirectories = await listPresetSkillDirectories(preset.id);
      if (existingDirectories.length) {
        continue;
      }

      setEntryAuthorizationStatus(`请在弹窗中授权并选择 ${preset.path}`);
      const result = await ensurePresetDirectoryAuthorized(preset, { allowInactivePicker: true, clearSkipFlag: true });
      if (result.authorized) {
        authorizedCount += 1;
        await hydrateRecommendedDirectories();
        continue;
      }

      if (result.blockedByGesture) {
        setEntryAuthorizationStatus(`浏览器要求再次点击，才能继续授权 ${preset.name}。`);
        return;
      }

      if (result.cancelled) {
        setEntryAuthorizationStatus(`已取消 ${preset.name} 授权。你可以再次点击“开始授权并扫描”继续。`);
        return;
      }

      setEntryAuthorizationStatus(`${preset.name} 授权失败，请重新点击“开始授权并扫描”。`);
      return;
    }

    setEntryAuthorizationStatus(
      authorizedCount > 0
        ? "授权完成，已扫描并显示当前可访问的 skill 目录。"
        : "当前目录都已经授权完成，已按最新句柄重新扫描。"
    );
  } finally {
    elements.entryAuthorizeScanBtn.disabled = false;
  }
}

async function ensurePresetDirectoryAuthorized(preset, options = {}) {
  const { allowInactivePicker = false, clearSkipFlag = false } = options;
  if (!preset || sessionStorage.getItem(`${AUTO_AUTH_SKIP_PREFIX}${preset.id}`) === "1") {
    if (clearSkipFlag) {
      sessionStorage.removeItem(`${AUTO_AUTH_SKIP_PREFIX}${preset.id}`);
    } else {
      return { authorized: false, cancelled: true, blockedByGesture: false };
    }
  }

  const grantedHandle = await getPresetDirectoryHandle(preset.id, { allowPrompt: false });
  if (grantedHandle) {
    return { authorized: true, cancelled: false, blockedByGesture: false };
  }

  const hasUserActivation = Boolean(window.navigator?.userActivation?.isActive);
  if (!allowInactivePicker && !hasUserActivation) {
    return { authorized: false, cancelled: false, blockedByGesture: true };
  }

  try {
    const promptedHandle = await getPresetDirectoryHandle(preset.id, { allowPrompt: true });
    if (promptedHandle) {
      return { authorized: true, cancelled: false, blockedByGesture: false };
    }
  } catch (error) {
    if (error?.name === "SecurityError") {
      return { authorized: false, cancelled: false, blockedByGesture: true };
    }
  }

  if (typeof window.showDirectoryPicker !== "function") {
    return { authorized: false, cancelled: false, blockedByGesture: false };
  }

  try {
    const directoryHandle = await window.showDirectoryPicker();
    await persistDirectoryHandle(directoryHandle);
    await persistDirectoryHandle(directoryHandle, buildPresetCacheKey(preset.id));
    return { authorized: true, cancelled: false, blockedByGesture: false };
  } catch (error) {
    if (error && error.name === "AbortError") {
      sessionStorage.setItem(`${AUTO_AUTH_SKIP_PREFIX}${preset.id}`, "1");
      return { authorized: false, cancelled: true, blockedByGesture: false };
    }
    if (error?.name === "SecurityError") {
      return { authorized: false, cancelled: false, blockedByGesture: true };
    }
    console.warn(`自动授权目录失败：${preset.path}`, error);
    return { authorized: false, cancelled: false, blockedByGesture: false };
  }
}

function setEntryAuthorizationStatus(message) {
  if (!elements.entryAuthorizationStatus) {
    return;
  }
  elements.entryAuthorizationStatus.textContent = message;
}

function setAppMode(mode) {
  state.appMode = mode;
  if (elements.entryPanel) {
    elements.entryPanel.hidden = true;
  }
  elements.viewerShell.hidden = mode !== "viewer";
  if (elements.emptyLanding && elements.workspaceMain) {
    const hasDirectory = state.files && state.files.size > 0;
    elements.emptyLanding.hidden = hasDirectory;
    elements.workspaceMain.hidden = !hasDirectory;
  }
}

async function handlePresetDirectoryClick(event) {
  const skillTrigger = event.target.closest("[data-open-skill]");
  if (skillTrigger) {
    await openPresetSkill(skillTrigger.dataset.presetId, skillTrigger.dataset.openSkill);
    return;
  }

  const trigger = event.target.closest("[data-preset-id]");
  if (!trigger) {
    return;
  }

  const presetId = trigger.dataset.presetId;
  const preset = RECOMMENDED_DIRECTORIES.find((item) => item.id === presetId);
  if (!preset) {
    return;
  }

  if (typeof window.showDirectoryPicker !== "function") {
    elements.folderInput.click();
    return;
  }

  try {
    if (await tryLoadPresetDirectoryHandle(presetId)) {
      return;
    }

    const directoryHandle = await window.showDirectoryPicker();
    await loadFromDirectoryHandle(directoryHandle, { persist: true, presetId });
    await hydrateRecommendedDirectories();
  } catch (error) {
    if (error && error.name === "AbortError") {
      return;
    }
    console.warn(`打开推荐目录失败：${preset.path}`, error);
  }
}

async function openPresetSkill(presetId, skillDirectory) {
  const preset = RECOMMENDED_DIRECTORIES.find((item) => item.id === presetId);
  if (!preset || !skillDirectory) {
    return;
  }

  const initialPath = normalizePath(`${skillDirectory}/SKILL.md`);
  if (await tryLoadPresetDirectoryHandle(presetId, initialPath)) {
    return;
  }

  if (typeof window.showDirectoryPicker !== "function") {
    elements.folderInput.click();
    return;
  }

  try {
    const directoryHandle = await window.showDirectoryPicker();
    await loadFromDirectoryHandle(directoryHandle, { persist: true, presetId });
    await hydrateRecommendedDirectories();
    if (state.files.has(initialPath)) {
      await navigateTo(initialPath, { pushHistory: true, replaceBrowserState: true });
    }
  } catch (error) {
    if (error && error.name === "AbortError") {
      return;
    }
    console.warn(`打开推荐 skill 失败：${preset.path}`, error);
  }
}

async function restorePersistedDirectory() {
  if (typeof window.indexedDB === "undefined") {
    return false;
  }

  try {
    const presetId = localStorage.getItem(LAST_PRESET_STORAGE_KEY);
    if (presetId && await tryLoadPresetDirectoryHandle(presetId)) {
      return true;
    }

    const directoryHandle = await getPersistedDirectoryHandle();
    if (!directoryHandle) {
      return false;
    }

    const permission = await ensureDirectoryPermission(directoryHandle, { allowPrompt: false });
    if (permission !== "granted") {
      return false;
    }

    await loadFromDirectoryHandle(directoryHandle, { persist: false });
    return true;
  } catch (error) {
    console.warn("恢复上次目录失败", error);
    return false;
  }
}

function updatePanelVisibility() {
  elements.sidebar.classList.toggle("collapsed", state.sidebarCollapsed);
  elements.references.classList.toggle("collapsed", state.referencesCollapsed);
  elements.workspace.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  elements.workspace.classList.toggle("references-collapsed", state.referencesCollapsed);

  elements.toggleSidebarBtn.textContent = state.sidebarCollapsed ? "🗂" : "收起";
  elements.toggleSidebarBtn.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
  elements.toggleSidebarBtn.title = state.sidebarCollapsed ? "展开文件树" : "收起文件树";

  elements.toggleReferencesBtn.textContent = state.referencesCollapsed ? "🔗" : "收起";
  elements.toggleReferencesBtn.setAttribute("aria-expanded", String(!state.referencesCollapsed));
  elements.toggleReferencesBtn.title = state.referencesCollapsed ? "展开引用导航" : "收起引用导航";
}

function chooseInitialFile() {
  const paths = Array.from(state.files.keys());
  if (!paths.length) {
    return "";
  }

  const exactRootSkill = paths.find((path) => path === "SKILL.md");
  if (exactRootSkill) {
    return exactRootSkill;
  }

  const skillFiles = paths.filter((path) => path.endsWith("/SKILL.md") || path.endsWith("SKILL.md"));
  if (skillFiles.length) {
    return skillFiles.sort((left, right) => left.length - right.length)[0];
  }

  return paths.sort()[0];
}

function renderFileTree() {
  const paths = Array.from(state.files.keys()).sort();
  if (!paths.length) {
    elements.fileTree.className = "file-tree empty-state";
    elements.fileTree.textContent = "选择目录后，这里会列出 skill 目录中的文件结构。";
    return;
  }

  const filteredPaths = paths.filter((path) => {
    if (!state.filterText) {
      return true;
    }
    return path.toLowerCase().includes(state.filterText);
  });

  if (!filteredPaths.length) {
    elements.fileTree.className = "file-tree empty-state";
    elements.fileTree.textContent = "没有匹配的文件。";
    return;
  }

  const tree = buildTree(filteredPaths);
  elements.fileTree.className = "file-tree";
  elements.fileTree.innerHTML = "";
  renderTreeNodes(tree, elements.fileTree, "");
}

function buildTree(paths) {
  const root = { directories: new Map(), files: [] };
  for (const path of paths) {
    const parts = path.split("/");
    let cursor = root;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      const isLast = index === parts.length - 1;
      if (isLast) {
        cursor.files.push(path);
      } else {
        if (!cursor.directories.has(part)) {
          cursor.directories.set(part, { directories: new Map(), files: [] });
        }
        cursor = cursor.directories.get(part);
      }
    }
  }
  return root;
}

function renderTreeNodes(node, container, currentPrefix) {
  const directories = Array.from(node.directories.keys()).sort();
  for (const directoryName of directories) {
    const details = document.createElement("details");
    details.className = "tree-folder";
    const nextPrefix = currentPrefix ? `${currentPrefix}/${directoryName}` : directoryName;
    details.open = shouldOpenDirectory(nextPrefix);
    details.dataset.path = nextPrefix;
    details.addEventListener("toggle", () => {
      if (details.open) {
        state.expandedDirectories.add(nextPrefix);
      } else {
        state.expandedDirectories.delete(nextPrefix);
      }
    });

    const summary = document.createElement("summary");
    summary.textContent = directoryName;
    details.appendChild(summary);

    const childContainer = document.createElement("div");
    childContainer.className = "tree-folder-children";
    renderTreeNodes(node.directories.get(directoryName), childContainer, nextPrefix);
    details.appendChild(childContainer);
    container.appendChild(details);
  }

  if (node.files.length) {
    const fileList = document.createElement("div");
    fileList.className = "tree-file-list";

    for (const path of node.files.sort()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `file-button${path === state.currentFilePath ? " active" : ""}`;
      button.dataset.path = path;
      button.innerHTML = `<span>${escapeHtml(lastSegment(path))}</span><span class="file-path-hint">${escapeHtml(path)}</span>`;
      button.addEventListener("click", () => navigateTo(path, { pushHistory: true }));
      fileList.appendChild(button);
    }

    container.appendChild(fileList);
  }
}

async function navigateTo(path, options = {}) {
  const {
    pushHistory: shouldPushHistory = false,
    historyIndex = null,
    syncBrowserHistory = true,
    replaceBrowserState = false,
  } = options;
  const normalizedPath = normalizePath(path);
  const fileRecord = state.files.get(normalizedPath);
  if (!fileRecord) {
    showMatchPanel(`未找到目标文件：${normalizedPath}`, []);
    return;
  }

  const content = isImageFile(normalizedPath) ? "" : await readPathContent(normalizedPath);
  state.currentFilePath = normalizedPath;
  state.currentFileContent = content;
  elements.currentFileLabel.textContent = normalizedPath;

  if (historyIndex !== null) {
    state.historyIndex = historyIndex;
  } else if (shouldPushHistory) {
    pushHistory(normalizedPath, { syncBrowserHistory, replaceBrowserState });
  }

  const rendered = await renderDocument(content, normalizedPath);
  state.currentReferences = rendered.references;
  await renderActiveContent(rendered);
  renderHistoryTrail();
  renderFileTree();
  updateHistoryButtons();
}

async function setViewerMode(mode) {
  if (!mode || state.viewerMode === mode) {
    return;
  }
  state.viewerMode = mode;
  refreshViewerModeUi();
  if (state.currentFilePath) {
    await renderActiveContent();
  }
}

function refreshViewerModeUi() {
  const isMindMap = state.viewerMode === "mindmap";
  elements.toggleMindMapModeBtn.disabled = !state.files.size;
  elements.toggleMindMapModeBtn.textContent = isMindMap ? "返回文档模式" : "切换到思维导图模式";
  elements.contentTitle.textContent = isMindMap ? "思维导图" : "内容预览";
  elements.contentSubtitle.textContent = isMindMap
    ? "导图从当前 skill 的真实文件与 Markdown 引用自动生成。"
    : "点击正文中的引用路径即可跳转到对应文件。";
  elements.workspace.classList.toggle("mindmap-only", isMindMap);
}

async function renderActiveContent(preRendered = null) {
  if (!state.currentFilePath) {
    showMessage("打开 skill 后，这里会显示解析后的内容。", true);
    return;
  }

  const rendered = preRendered || await renderDocument(state.currentFileContent, state.currentFilePath);
  state.currentReferences = rendered.references;
  renderReferenceList(rendered.references);

  if (state.viewerMode === "mindmap") {
    await getMindMapRuntime().render(elements.documentView, {
      currentFilePath: state.currentFilePath,
      onOpenFile: async (path) => {
        if (path !== state.currentFilePath) {
          await navigateTo(path, { pushHistory: true });
        }
      },
    });
    return;
  }

  elements.documentView.className = "document-view";
  elements.documentView.innerHTML = rendered.html;
  if (typeof rendered.afterRender === "function") {
    rendered.afterRender(elements.documentView);
  }
}

function pushHistory(path, options = {}) {
  const { syncBrowserHistory = true, replaceBrowserState = false } = options;
  if (state.history[state.historyIndex] === path) {
    if (syncBrowserHistory) {
      syncBrowserHistoryState(path, state.historyIndex, replaceBrowserState);
    }
    return;
  }
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(path);
  state.historyIndex = state.history.length - 1;
  if (syncBrowserHistory) {
    syncBrowserHistoryState(path, state.historyIndex, replaceBrowserState);
  }
}

function renderHistoryTrail() {
  if (!state.history.length) {
    elements.historyTrail.className = "history-trail empty-trail";
    elements.historyTrail.textContent = "访问链会显示在这里。";
    return;
  }

  elements.historyTrail.className = "history-trail";
  elements.historyTrail.innerHTML = "";

  state.history.forEach((path, index) => {
    if (index > 0) {
      const separator = document.createElement("span");
      separator.className = "history-separator";
      separator.textContent = "→";
      elements.historyTrail.appendChild(separator);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = `history-chip${index === state.historyIndex ? " current" : ""}`;
    button.textContent = formatTrailLabel(path);
    button.title = path;
    button.addEventListener("click", () => navigateTo(path, { historyIndex: index }));
    elements.historyTrail.appendChild(button);
  });
}

function renderReferenceList(references) {
  elements.referenceCountLabel.textContent = `${references.length} 条`;
  if (!references.length) {
    elements.referenceList.className = "reference-list empty-state";
    elements.referenceList.textContent = "当前没有可展示的引用。";
    elements.matchPanel.classList.add("hidden");
    elements.matchPanel.innerHTML = "";
    return;
  }

  elements.referenceList.className = "reference-list";
  elements.referenceList.innerHTML = references
    .map((reference, index) => {
      const resolved = resolveReference(reference.raw, state.currentFilePath);
      const status = getReferenceStatus(resolved);
      const action = buildReferenceAction(resolved, index, reference.raw);
      const note = buildReferenceNote(resolved);
      return `
        <section class="reference-card">
          <div class="status-tag ${status.className}">${status.label}</div>
          <h3>${escapeHtml(reference.display)}</h3>
          <div class="reference-meta">原始引用：${escapeHtml(reference.raw)}</div>
          ${note}
          <div class="reference-actions">
            <button class="ref-button ref-locate" type="button" data-action="locate-ref" data-raw-ref="${escapeHtmlAttribute(reference.raw)}">定位</button>
            ${action}
          </div>
        </section>
      `;
    })
    .join("");
}

function buildReferenceAction(resolved, index, rawReference) {
  if (resolved.type === "file") {
    return `<button class="ref-button" type="button" data-action="open-ref" data-path="${escapeHtmlAttribute(resolved.path)}">打开</button>`;
  }

  if (resolved.type === "multi") {
    return `<button class="ref-button" type="button" data-action="show-matches" data-ref-index="${index}" data-raw-ref="${escapeHtmlAttribute(rawReference)}">查看 ${resolved.matches.length} 个匹配项</button>`;
  }

  if (resolved.type === "external") {
    return `<a class="ref-button ref-link" href="${escapeHtmlAttribute(resolved.href)}" target="_blank" rel="noreferrer">打开外部链接</a>`;
  }

  return "";
}

function handleReferenceClick(event) {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) {
    return;
  }

  const action = trigger.dataset.action;
  if (action === "open-ref") {
    navigateTo(trigger.dataset.path, { pushHistory: true });
    return;
  }

  if (action === "show-matches") {
    const rawReference = trigger.dataset.rawRef;
    const resolved = resolveReference(rawReference, state.currentFilePath);
    showMatchPanel(`引用 ${rawReference} 匹配到多个文件，请选择具体目标。`, resolved.matches || []);
    return;
  }

  if (action === "locate-ref") {
    const rawRef = trigger.dataset.rawRef;
    const resolved = resolveReference(rawRef, state.currentFilePath);
    const targetPath = resolved.path || rawRef;
    const normalizedRaw = rawRef.replace(/^\.\//, "");
    // 先找已解析的链接
    const allLinks = elements.documentView.querySelectorAll("a[data-action='open-ref'][data-path]");
    for (const link of allLinks) {
      const linkPath = link.dataset.path || "";
      if (linkPath === targetPath || linkPath === normalizedRaw || linkPath.endsWith(normalizedRaw) || normalizedRaw.endsWith(linkPath)) {
        link.scrollIntoView({ behavior: "smooth", block: "center" });
        link.classList.add("highlight-flash");
        setTimeout(() => link.classList.remove("highlight-flash"), 2000);
        return;
      }
    }
    // 再找未解析的 span（文字匹配）
    const allSpans = elements.documentView.querySelectorAll("span.ref-link, a.ref-link");
    for (const el of allSpans) {
      const text = el.textContent || "";
      if (text.includes(normalizedRaw) || text.includes(rawRef) || normalizedRaw.includes(text)) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("highlight-flash");
        setTimeout(() => el.classList.remove("highlight-flash"), 2000);
        return;
      }
    }
    return;
  }

  if (action === "switch-html-tab") {
    switchHtmlTab(trigger.dataset.tab);
  }
}

function switchHtmlTab(tabName) {
  if (!tabName) {
    return;
  }
  state.htmlTab = tabName;
  const tabs = elements.documentView.querySelectorAll(".html-tab");
  const panels = elements.documentView.querySelectorAll(".html-panel");

  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });

  panels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tabName);
  });
}

function showMatchPanel(title, matches) {
  elements.matchPanel.classList.remove("hidden");
  if (!matches.length) {
    elements.matchPanel.innerHTML = `<section class="match-card"><h3>${escapeHtml(title)}</h3><p class="reference-meta">没有可打开的目标。</p></section>`;
    return;
  }

  elements.matchPanel.innerHTML = `
    <section class="match-card">
      <h3>${escapeHtml(title)}</h3>
      <div class="tree-file-list">
        ${matches
          .map(
            (match) =>
              `<button class="file-button" type="button" data-action="open-ref" data-path="${escapeHtmlAttribute(match)}">${escapeHtml(lastSegment(match))}<span class="file-path-hint">${escapeHtml(match)}</span></button>`
          )
          .join("")}
      </div>
    </section>
  `;
}

function moveHistory(offset) {
  const nextIndex = state.historyIndex + offset;
  if (nextIndex < 0 || nextIndex >= state.history.length) {
    return;
  }
  if (window.history.state?.skillViewerPath) {
    if (offset < 0) {
      window.history.back();
    } else {
      window.history.forward();
    }
    return;
  }
  navigateTo(state.history[nextIndex], { historyIndex: nextIndex, syncBrowserHistory: false });
}

function updateHistoryButtons() {
  elements.backButton.disabled = state.historyIndex <= 0;
  elements.forwardButton.disabled = state.historyIndex === -1 || state.historyIndex >= state.history.length - 1;
}

function handleBrowserPopState(event) {
  const targetPath = event.state?.skillViewerPath;
  if (!targetPath || !state.files.size || !state.files.has(targetPath)) {
    return;
  }

  const targetIndex = Number.isInteger(event.state?.skillViewerIndex)
    ? event.state.skillViewerIndex
    : state.history.lastIndexOf(targetPath);

  navigateTo(targetPath, {
    historyIndex: targetIndex,
    syncBrowserHistory: false,
  });
}

function syncBrowserHistoryState(path, historyIndex, replaceState = false) {
  const payload = {
    skillViewerPath: path,
    skillViewerIndex: historyIndex,
  };
  const nextUrl = `#${encodeURIComponent(path)}`;
  if (replaceState) {
    window.history.replaceState(payload, "", nextUrl);
    return;
  }
  window.history.pushState(payload, "", nextUrl);
}

function getPathFromLocationHash() {
  if (!window.location.hash || window.location.hash.length <= 1) {
    return "";
  }
  return normalizePath(decodeURIComponent(window.location.hash.slice(1)));
}

async function ensureDirectoryPermission(directoryHandle, options = {}) {
  const { allowPrompt = true } = options;
  if (!directoryHandle?.queryPermission) {
    return "granted";
  }

  let permission = await directoryHandle.queryPermission({ mode: "read" });
  if (permission === "granted") {
    return permission;
  }

  if (allowPrompt && directoryHandle.requestPermission) {
    permission = await directoryHandle.requestPermission({ mode: "read" });
  }
  return permission;
}

async function persistDirectoryHandle(directoryHandle, cacheKey = LAST_DIRECTORY_HANDLE_KEY) {
  try {
    const database = await openDirectoryDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(DIRECTORY_STORE_NAME, "readwrite");
      transaction.objectStore(DIRECTORY_STORE_NAME).put(directoryHandle, cacheKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch (error) {
    console.warn("保存目录句柄失败", error);
  }
}

async function getPresetDirectoryHandle(presetId, options = {}) {
  if (!presetId) {
    return null;
  }

  const directoryHandle = await getPersistedDirectoryHandle(buildPresetCacheKey(presetId));
  if (!directoryHandle) {
    return null;
  }

  const permission = await ensureDirectoryPermission(directoryHandle, options);
  return permission === "granted" ? directoryHandle : null;
}

async function getPersistedDirectoryHandle(cacheKey = LAST_DIRECTORY_HANDLE_KEY) {
  const database = await openDirectoryDatabase();
  const result = await new Promise((resolve, reject) => {
    const transaction = database.transaction(DIRECTORY_STORE_NAME, "readonly");
    const request = transaction.objectStore(DIRECTORY_STORE_NAME).get(cacheKey);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return result;
}

async function deletePersistedDirectoryHandle(cacheKey) {
  if (!cacheKey) {
    return;
  }

  try {
    const database = await openDirectoryDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(DIRECTORY_STORE_NAME, "readwrite");
      transaction.objectStore(DIRECTORY_STORE_NAME).delete(cacheKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch (error) {
    console.warn("清除目录句柄失败", error);
  }
}

function buildPresetCacheKey(presetId) {
  return `preset:${presetId}`;
}

function openDirectoryDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DIRECTORY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DIRECTORY_STORE_NAME)) {
        request.result.createObjectStore(DIRECTORY_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readFileRecord(fileRecord) {
  if (fileRecord.type === "handle") {
    const file = await fileRecord.entry.getFile();
    return file.text();
  }
  if (fileRecord.type === "manifest") {
    return fileRecord.content;
  }
  return fileRecord.entry.text();
}

async function readFileBlobRecord(fileRecord, path) {
  if (!fileRecord) {
    return null;
  }
  if (fileRecord.type === "handle") {
    return fileRecord.entry.getFile();
  }
  if (fileRecord.type === "manifest") {
    return new Blob([fileRecord.content], { type: guessMimeType(path) });
  }
  return fileRecord.entry;
}

async function readPathContent(path) {
  if (state.fileContentCache.has(path)) {
    return state.fileContentCache.get(path);
  }
  const fileRecord = state.files.get(path);
  if (!fileRecord) {
    return "";
  }
  const content = await readFileRecord(fileRecord);
  state.fileContentCache.set(path, content);
  return content;
}

async function renderDocument(content, currentFilePath) {
  const references = [];
  const extension = getFileExtension(currentFilePath);

  if (isImageFile(currentFilePath)) {
    return renderImageDocument(currentFilePath, references);
  }

  if (extension === "pdf") {
    return renderPdfDocument(currentFilePath, references);
  }

  if (isOfficeFile(currentFilePath)) {
    return renderOfficeDocument(currentFilePath, extension, references);
  }

  if (extension === "html") {
    return renderHtmlDocument(content, currentFilePath, references);
  }

  if (isMarkdownFile(currentFilePath)) {
    const { frontmatter, body } = splitFrontmatter(content);
    return {
      html: `${frontmatter ? renderFrontmatter(frontmatter) : ""}${renderMarkdown(body, currentFilePath, references)}`,
      references,
    };
  }

  if (extension === "json") {
    return {
      html: renderJsonDocument(content),
      references,
    };
  }

  // 大文件或二进制文件保护
  const MAX_CODE_SIZE = 500 * 1024; // 500KB
  const isBinary = /[\x00-\x08\x0E-\x1F]/.test(content.slice(0, 1024));
  if (content.length > MAX_CODE_SIZE || isBinary) {
    const sizeKB = Math.round(content.length / 1024);
    const reason = isBinary ? "二进制文件，无法以文本预览" : `文件较大（${sizeKB} KB），预览可能导致浏览器卡顿`;
    return {
      html: `<div class="file-notice"><div class="file-notice-icon">📄</div><h3>${escapeHtml(extension ? extension.toUpperCase() : "文件")}</h3><p>${escapeHtml(currentFilePath)}</p><p>${reason}</p>${isBinary ? "" : `<button class="btn-force-preview" onclick="window.__forcePreview && window.__forcePreview()">继续预览</button>`}</div>`,
      references,
      afterRender: (container) => {
        window.__forcePreview = () => {
          container.querySelector(".document-view").innerHTML = renderCodeDocument(content, extension);
          delete window.__forcePreview;
        };
      },
    };
  }

  return {
    html: renderCodeDocument(content, extension),
    references,
  };
}

async function renderHtmlDocument(content, currentFilePath, references) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(content, "text/html");
  const assetElements = Array.from(documentNode.querySelectorAll("[src], [href]"));

  for (const element of assetElements) {
    const attributeName = element.hasAttribute("src") ? "src" : "href";
    const rawReference = element.getAttribute(attributeName)?.trim();
    if (!rawReference || isSkippableResourceReference(rawReference)) {
      continue;
    }

    references.push({
      raw: rawReference,
      display: rawReference,
      source: `<${element.tagName.toLowerCase()}>`,
    });

    const resolved = resolveReference(rawReference, currentFilePath);
    if (resolved.type !== "file") {
      continue;
    }

    if (element.tagName.toLowerCase() === "link" && (element.getAttribute("rel") || "").toLowerCase() === "stylesheet") {
      const fileContent = await readFileRecord(state.files.get(resolved.path));
      const styleElement = documentNode.createElement("style");
      styleElement.textContent = fileContent;
      element.replaceWith(styleElement);
      continue;
    }

    if (element.tagName.toLowerCase() === "script") {
      const fileContent = await readFileRecord(state.files.get(resolved.path));
      element.removeAttribute("src");
      element.textContent = fileContent;
      continue;
    }

    const previewUrl = await ensurePreviewUrl(resolved.path);
    if (previewUrl) {
      element.setAttribute(attributeName, previewUrl);
    }
  }

  const srcdoc = `<!DOCTYPE html>\n${documentNode.documentElement.outerHTML}`;
  return {
    html: `
      <div class="html-view">
        <div class="html-tabs">
          <div class="html-tab-actions">
            <button class="html-tab${state.htmlTab === "preview" ? " active" : ""}" type="button" data-action="switch-html-tab" data-tab="preview">HTML 预览</button>
            <button class="html-tab${state.htmlTab === "source" ? " active" : ""}" type="button" data-action="switch-html-tab" data-tab="source">HTML 源码</button>
          </div>
          <span class="html-tab-hint">预览区已按当前目录中的本地资源重写可解析引用</span>
        </div>
        <section class="html-panel${state.htmlTab === "preview" ? " active" : ""}" data-panel="preview">
          <iframe class="html-frame" sandbox="allow-scripts allow-forms allow-modals allow-popups"></iframe>
        </section>
        <section class="html-panel${state.htmlTab === "source" ? " active" : ""}" data-panel="source">
          <pre class="html-source"><code>${escapeHtml(content)}</code></pre>
        </section>
      </div>
    `,
    references,
    afterRender(container) {
      const iframe = container.querySelector(".html-frame");
      if (iframe) {
        iframe.srcdoc = srcdoc;
      }
    },
  };
}

async function ensurePreviewUrl(path) {
  if (state.previewUrls.has(path)) {
    return state.previewUrls.get(path);
  }

  const fileRecord = state.files.get(path);
  if (!fileRecord) {
    return "";
  }

  const blob = await readFileBlobRecord(fileRecord, path);
  if (!blob) {
    return "";
  }

  const url = URL.createObjectURL(blob);
  state.previewUrls.set(path, url);
  return url;
}

async function renderImageDocument(currentFilePath, references) {
  const previewUrl = await ensurePreviewUrl(currentFilePath);
  return {
    html: `
      <figure class="image-view">
        <div class="image-toolbar">
          <span class="image-toolbar-label">图片预览</span>
          <div class="image-toolbar-actions">
            <button class="image-zoom-button" type="button" data-action="image-zoom-out">缩小</button>
            <button class="image-zoom-button" type="button" data-action="image-zoom-reset">适应</button>
            <button class="image-zoom-button" type="button" data-action="image-zoom-in">放大</button>
            <span class="image-zoom-value" data-image-zoom-value>100%</span>
          </div>
        </div>
        <div class="image-stage">
          <div class="image-canvas">
            <img class="image-preview" src="${escapeHtmlAttribute(previewUrl)}" alt="${escapeHtmlAttribute(lastSegment(currentFilePath))}" />
          </div>
        </div>
        <figcaption class="image-caption">${escapeHtml(currentFilePath)}</figcaption>
      </figure>
    `,
    references,
    afterRender(container) {
      const image = container.querySelector(".image-preview");
      const stage = container.querySelector(".image-stage");
      const zoomValue = container.querySelector("[data-image-zoom-value]");
      const zoomOutButton = container.querySelector('[data-action="image-zoom-out"]');
      const zoomResetButton = container.querySelector('[data-action="image-zoom-reset"]');
      const zoomInButton = container.querySelector('[data-action="image-zoom-in"]');
      const zoomStep = 0.25;
      const minScale = 0.25;
      const maxScale = 4;
      let baseWidth = 0;
      let scale = 1;
      let dragState = null;

      if (!image || !stage || !zoomValue || !zoomOutButton || !zoomResetButton || !zoomInButton) {
        return;
      }

      image.draggable = false;

      const captureBaseWidth = () => {
        const nextWidth = image.getBoundingClientRect().width || image.naturalWidth || 0;
        if (nextWidth) {
          baseWidth = nextWidth;
        }
      };

      const applyScale = () => {
        if (!baseWidth) {
          captureBaseWidth();
        }
        if (!baseWidth) {
          return;
        }

        image.classList.add("is-ready");
        image.style.width = `${Math.max(baseWidth * scale, 48)}px`;
        stage.classList.toggle("is-pan-ready", scale > 1);
        zoomValue.textContent = `${Math.round(scale * 100)}%`;
        zoomOutButton.disabled = scale <= minScale;
        zoomInButton.disabled = scale >= maxScale;
      };

      const updateScale = (nextScale) => {
        scale = Math.min(maxScale, Math.max(minScale, nextScale));
        applyScale();
      };

      const initializeZoom = () => {
        captureBaseWidth();
        updateScale(1);
      };

      zoomOutButton.addEventListener("click", () => {
        updateScale(scale - zoomStep);
      });
      zoomResetButton.addEventListener("click", () => {
        updateScale(1);
      });
      zoomInButton.addEventListener("click", () => {
        updateScale(scale + zoomStep);
      });

      stage.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || scale <= 1) {
          return;
        }
        dragState = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          scrollLeft: stage.scrollLeft,
          scrollTop: stage.scrollTop,
        };
        stage.classList.add("is-dragging");
        if (typeof stage.setPointerCapture === "function") {
          stage.setPointerCapture(event.pointerId);
        }
      });

      stage.addEventListener("pointermove", (event) => {
        if (!dragState) {
          return;
        }
        stage.scrollLeft = dragState.scrollLeft - (event.clientX - dragState.startX);
        stage.scrollTop = dragState.scrollTop - (event.clientY - dragState.startY);
      });

      const stopDragging = (event) => {
        if (!dragState) {
          return;
        }
        if (typeof stage.releasePointerCapture === "function" && dragState.pointerId === event.pointerId && stage.hasPointerCapture?.(event.pointerId)) {
          stage.releasePointerCapture(event.pointerId);
        }
        dragState = null;
        stage.classList.remove("is-dragging");
      };

      stage.addEventListener("pointerup", stopDragging);
      stage.addEventListener("pointercancel", stopDragging);

      if (image.complete) {
        initializeZoom();
        return;
      }

      image.addEventListener("load", initializeZoom, { once: true });
    },
  };
}

function renderMarkdown(markdown, currentFilePath, references) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```") || line.startsWith("````")) {
      const fence = line.startsWith("````") ? "````" : "```";
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith(fence)) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      const content = line.replace(/^#{1,6}\s+/, "");
      blocks.push(`<h${level}>${parseInline(content, currentFilePath, references, line)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${quoteLines.map((quoteLine) => parseInline(quoteLine, currentFilePath, references, quoteLine)).join("<br />")}</blockquote>`);
      continue;
    }

    const compactTableRows = parseCompactTableRows(line);
    if (compactTableRows) {
      blocks.push(renderTableRows(compactTableRows, currentFilePath, references));
      index += 1;
      continue;
    }

    if (looksLikeTableLine(line) && index + 1 < lines.length && looksLikeTableSeparator(lines[index + 1])) {
      const tableLines = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && looksLikeTableLine(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderTable(tableLines, currentFilePath, references));
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(`<ul>${items.map((item) => `<li>${parseInline(item, currentFilePath, references, item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(`<ol>${items.map((item) => `<li>${parseInline(item, currentFilePath, references, item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length && lines[index].trim() && !isBlockBoundary(lines[index], lines[index + 1])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    if (index < lines.length && lines[index].trim()) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    blocks.push(`<p>${parseInline(paragraphLines.join(" "), currentFilePath, references, paragraphLines.join(" "))}</p>`);
  }

  return blocks.join("\n");
}

function renderJsonDocument(content) {
  try {
    const parsed = JSON.parse(content);
    return `
      <div class="json-view">
        <div class="code-toolbar">JSON 结构视图</div>
        <div class="json-tree">${renderJsonNode(parsed, "root", 0, true)}</div>
      </div>
    `;
  } catch (error) {
    return `
      <div class="code-view">
        <div class="code-toolbar">JSON 格式化失败，已按源码显示</div>
        <pre class="code-editor"><code>${escapeHtml(content)}</code></pre>
      </div>
    `;
  }
}

function renderJsonNode(value, key, depth, expanded) {
  if (value === null || typeof value !== "object") {
    return `
      <div class="json-leaf" style="--json-depth:${depth}">
        ${key === "root" ? "" : `<span class="json-key">${escapeHtml(String(key))}</span><span class="json-colon">:</span>`}
        <span class="json-value ${getJsonValueClass(value)}">${escapeHtml(formatJsonValue(value))}</span>
      </div>
    `;
  }

  const isArray = Array.isArray(value);
  const entries = isArray ? value.map((item, index) => [index, item]) : Object.entries(value);
  const label = key === "root" ? (isArray ? "数组" : "对象") : escapeHtml(String(key));
  const summary = `${label} ${isArray ? `[${entries.length}]` : `{${entries.length}}`}`;

  return `
    <details class="json-branch" style="--json-depth:${depth}" ${expanded ? "open" : ""}>
      <summary>${summary}</summary>
      <div class="json-children">
        ${entries.map(([childKey, childValue]) => renderJsonNode(childValue, childKey, depth + 1, depth < 1)).join("")}
      </div>
    </details>
  `;
}

function renderCodeDocument(content, extension) {
  const language = extension ? extension.toUpperCase() : "TEXT";
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  return `
    <div class="code-view">
      <div class="code-toolbar">${language} 源码视图</div>
      <div class="code-editor">${lines
        .map(
          (line, index) => `
            <div class="code-line">
              <span class="code-line-number">${index + 1}</span>
              <span class="code-line-content">${highlightCodeLine(line, extension) || " "}</span>
            </div>
          `
        )
        .join("")}</div>
    </div>
  `;
}

function isImageFile(path) {
  return /\.(png|jpe?g|gif|webp|bmp|ico|avif|svg)$/i.test(path);
}

function isOfficeFile(path) {
  return /\.(docx?|xlsx?|xlsm|pptx?|odt|ods|odp)$/i.test(path);
}

function renderPdfDocument(currentFilePath, references) {
  return {
    html: `<div class="pdf-view"><div class="pdf-loading">正在加载 PDF...</div></div>`,
    references,
    afterRender: async (container) => {
      const url = await ensurePreviewUrl(currentFilePath);
      if (url) {
        container.querySelector(".pdf-view").innerHTML = `<iframe class="pdf-frame" src="${url}"></iframe>`;
      } else {
        container.querySelector(".pdf-view").innerHTML = `<div class="file-notice"><div class="file-notice-icon">📄</div><h3>PDF 文件</h3><p>无法加载此 PDF 文件。</p></div>`;
      }
    },
  };
}

function renderOfficeDocument(currentFilePath, extension, references) {
  const typeNames = { doc: "Word", docx: "Word", xls: "Excel", xlsx: "Excel", xlsm: "Excel", ppt: "PowerPoint", pptx: "PowerPoint", odt: "Writer", ods: "Calc", odp: "Impress" };
  const typeName = typeNames[extension] || "Office";

  if (extension === "doc" || extension === "docx") {
    return {
      html: `<div class="file-notice"><div class="file-notice-icon">📄</div><h3>${escapeHtml(typeName)} 文件</h3><p>${escapeHtml(currentFilePath)}</p><p>Word 文档请使用 WPS 或 Microsoft Word 打开查看。</p></div>`,
      references,
    };
  }

  if ((extension === "xlsx" || extension === "xls" || extension === "xlsm") && typeof XLSX !== "undefined") {
    return {
      html: `<div class="office-view"><div class="pdf-loading">正在解析 Excel 文件...</div></div>`,
      references,
      afterRender: async (container) => {
        try {
          const fileRecord = state.files.get(currentFilePath);
          const blob = await readFileBlobRecord(fileRecord, currentFilePath);
          const arrayBuffer = await blob.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: "array" });
          let html = "";
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            html += `<h3 class="sheet-name">${escapeHtml(sheetName)}</h3>`;
            html += XLSX.utils.sheet_to_html(sheet);
          }
          container.querySelector(".office-view").innerHTML = `<div class="office-content xlsx-content">${html}</div>`;
        } catch (err) {
          container.querySelector(".office-view").innerHTML = `<div class="file-notice"><div class="file-notice-icon">📊</div><h3>Excel 解析失败</h3><p>${escapeHtml(err.message)}</p></div>`;
        }
      },
    };
  }

  // 不支持的 Office 格式提供下载
  return {
    html: `<div class="file-notice"><div class="file-notice-icon">📋</div><h3>${escapeHtml(typeName)} 文件</h3><p>${escapeHtml(currentFilePath)}</p><p>此格式暂不支持在线预览。</p></div>`,
    references,
  };
}

function splitFrontmatter(content) {
  const normalized = content.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---\n")) {
    return { frontmatter: "", body: normalized };
  }

  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return { frontmatter: "", body: normalized };
  }

  return {
    frontmatter: normalized.slice(4, closingIndex).trim(),
    body: normalized.slice(closingIndex + 5).replace(/^\n+/, ""),
  };
}

function renderFrontmatter(frontmatter) {
  return `
    <pre class="frontmatter-block"><code>${escapeHtml(frontmatter)}</code></pre>
  `;
}

function updateRootDirectoryDisplay(absolutePath, fallbackLabel) {
  const normalizedPath = normalizeDisplayPath(absolutePath);
  const safeFallbackLabel = fallbackLabel || "未选择";
  const displayText = normalizedPath || safeFallbackLabel;
  const bannerText = buildRootDirectoryBannerText(normalizedPath, safeFallbackLabel);
  state.rootDirectoryLabel = displayText;
  elements.rootDirectoryLabel.textContent = displayText;
  elements.rootDirectoryBanner.textContent = bannerText;
  elements.rootDirectoryBanner.title = bannerText;
}

function resolveDirectoryHandlePath(directoryHandle) {
  if (!directoryHandle || typeof directoryHandle !== "object") {
    return "";
  }

  const possiblePath = directoryHandle.path || directoryHandle.fullPath || directoryHandle.webkitRelativePath || "";
  return typeof possiblePath === "string" ? possiblePath : "";
}

function resolveImportedDirectoryPath(files) {
  const first = files[0];
  if (!first || typeof first !== "object") {
    return "";
  }

  const nativePath = typeof first.path === "string" ? first.path : "";
  const relativePath = typeof first.webkitRelativePath === "string" ? first.webkitRelativePath : "";
  if (!nativePath || !relativePath) {
    return nativePath;
  }

  const normalizedNative = nativePath.replace(/\\/g, "/");
  const normalizedRelative = relativePath.replace(/\\/g, "/");
  const suffix = `/${normalizedRelative}`;
  if (normalizedNative.endsWith(suffix)) {
    return normalizedNative.slice(0, normalizedNative.length - suffix.length);
  }

  const segments = normalizedRelative.split("/");
  if (segments.length > 1) {
    const guessedSuffix = `/${segments[0]}`;
    const guessedIndex = normalizedNative.lastIndexOf(guessedSuffix);
    if (guessedIndex !== -1) {
      return normalizedNative.slice(0, guessedIndex + guessedSuffix.length);
    }
  }

  return nativePath;
}

function normalizeDisplayPath(path) {
  if (typeof path !== "string") {
    return "";
  }
  return path.replace(/\\/g, "/").trim();
}

function buildRootDirectoryBannerText(absolutePath, fallbackLabel) {
  if (absolutePath) {
    return `当前 skill 目录：${absolutePath}`;
  }
  if (fallbackLabel && fallbackLabel !== "未选择") {
    return `当前 skill 目录：${fallbackLabel}（浏览器未提供绝对路径）`;
  }
  return "当前未选择 skill 目录";
}

function isMarkdownFile(path) {
  const extension = getFileExtension(path);
  return extension === "md" || extension === "mdc";
}

function getFileExtension(path) {
  const normalizedPath = String(path || "").toLowerCase();
  const segments = normalizedPath.split(".");
  return segments.length > 1 ? segments.pop() : "";
}

function formatJsonValue(value) {
  if (typeof value === "string") {
    return `"${value}"`;
  }
  if (typeof value === "undefined") {
    return "undefined";
  }
  return String(value);
}

function getJsonValueClass(value) {
  if (value === null) {
    return "json-null";
  }
  if (typeof value === "string") {
    return "json-string";
  }
  if (typeof value === "number") {
    return "json-number";
  }
  if (typeof value === "boolean") {
    return "json-boolean";
  }
  return "json-plain";
}

function highlightCodeLine(line, extension) {
  const highlighter = buildCodeHighlighter(extension);
  if (!highlighter) {
    return escapeHtml(line);
  }

  let html = "";
  let cursor = 0;
  let match;

  while ((match = highlighter.pattern.exec(line))) {
    html += escapeHtml(line.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    html += `<span class="${resolveCodeTokenClass(match, highlighter)}">${escapeHtml(match[0])}</span>`;
  }

  html += escapeHtml(line.slice(cursor));
  return html;
}

function buildCodeHighlighter(extension) {
  const language = String(extension || "").toLowerCase();
  if (language === "js" || language === "mjs" || language === "cjs") {
    return {
      pattern: /(\/\/.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|import|from|export|default|class|new|try|catch|finally|throw|async|await|null|true|false)\b|\b\d+(?:\.\d+)?\b)/gm,
    };
  }

  if (language === "py") {
    return {
      pattern: /(#.*$|""".*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|lambda|yield|True|False|None|pass|break|continue|async|await|in|is|not|and|or)\b|\b\d+(?:\.\d+)?\b)/gm,
    };
  }

  if (language === "sh" || language === "bash") {
    return {
      pattern: /(#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:if|then|fi|for|do|done|case|esac|function|echo|export|local|readonly|while|in|elif|else|return|break|continue)\b|\b\d+(?:\.\d+)?\b)/gm,
    };
  }

  if (language === "yaml" || language === "yml" || language === "toml") {
    return {
      pattern: /(#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|^[\w][\w.-]*(?=\s*:)|\b(?:true|false|null|yes|no|on|off)\b|\b\d+(?:\.\d+)?\b)/gm,
    };
  }

  return null;
}

function resolveCodeTokenClass(match, highlighter) {
  const token = match[0];
  if (token.startsWith("//") || token.startsWith("#")) {
    return "code-token-comment";
  }
  if (token.startsWith("\"") || token.startsWith("'") || token.startsWith("`") || token.startsWith('"""') || token.startsWith("'''")) {
    return "code-token-string";
  }
  if (/^\d/.test(token)) {
    return "code-token-number";
  }
  return "code-token-keyword";
}

function parseInline(text, currentFilePath, references, sourceLine) {
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let cursor = 0;
  let html = "";
  let match;

  while ((match = pattern.exec(text))) {
    html += escapeHtml(text.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    if (match[1] !== undefined) {
      const content = match[1].trim();
      if (looksLikeReference(content)) {
        references.push({ raw: content, display: content, source: sourceLine });
        html += buildInlineReference(content, content, currentFilePath);
      } else {
        html += `<code>${escapeHtml(content)}</code>`;
      }
      continue;
    }

    if (match[3] !== undefined) {
      const label = match[2].trim();
      const target = match[3].trim();
      if (looksLikeReference(target) || /^https?:\/\//i.test(target)) {
        references.push({ raw: target, display: label, source: sourceLine });
        html += buildInlineReference(label, target, currentFilePath);
      } else {
        html += `<span>${escapeHtml(label)}</span>`;
      }
      continue;
    }

    if (match[4] !== undefined) {
      html += `<strong>${escapeHtml(match[4])}</strong>`;
      continue;
    }

    if (match[5] !== undefined) {
      html += `<em>${escapeHtml(match[5])}</em>`;
    }
  }

  html += escapeHtml(text.slice(cursor));
  return html;
}

function buildInlineReference(label, rawReference, currentFilePath) {
  const resolved = resolveReference(rawReference, currentFilePath);
  if (resolved.type === "file") {
    const levelClass = resolved.via === "basename-fallback" ? " warn" : "";
    return `<a class="ref-link${levelClass}" href="#" data-action="open-ref" data-path="${escapeHtmlAttribute(resolved.path)}" title="${escapeHtmlAttribute(buildInlineHint(resolved))}">${escapeHtml(label)}</a>`;
  }
  if (resolved.type === "multi") {
    return `<a class="ref-link" href="#" data-action="show-matches" data-raw-ref="${escapeHtmlAttribute(rawReference)}">${escapeHtml(label)}</a>`;
  }
  if (resolved.type === "external") {
    return `<a class="ref-link" href="${escapeHtmlAttribute(resolved.href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
  }
  return `<span class="ref-link danger" title="当前没有找到对应实际文件">${escapeHtml(label)}</span>`;
}

function resolveReference(rawReference, currentFilePath) {
  const reference = rawReference.trim().replace(/^['"]|['"]$/g, "");

  if (/^https?:\/\//i.test(reference)) {
    return { type: "external", href: reference };
  }

  const sanitized = reference.split("#")[0].trim();
  if (!sanitized) {
    return { type: "unresolved" };
  }

  const candidates = new Map();
  const directCandidate = normalizeCandidate(sanitized, currentFilePath);
  if (directCandidate) {
    collectMatches(directCandidate, candidates, "direct");
  }

  if (!candidates.size && state.rootPathHint && sanitized.startsWith(state.rootPathHint)) {
    const stripped = sanitized.slice(state.rootPathHint.length).replace(/^\//, "");
    collectMatches(normalizePath(stripped), candidates, "root-hint");
  }

  if (!candidates.size && sanitized.startsWith("/")) {
    for (const path of state.files.keys()) {
      if (sanitized.endsWith(`/${path}`) || sanitized.endsWith(path)) {
        addCandidate(candidates, path, "absolute-suffix");
      }
    }
  }

  if (!candidates.size) {
    collectHeuristicMatches(sanitized, candidates);
  }

  const matches = Array.from(candidates.values());
  if (matches.length === 1) {
    return { type: "file", path: matches[0].path, via: matches[0].via };
  }
  if (matches.length > 1) {
    return { type: "multi", matches: matches.map((item) => item.path) };
  }
  return { type: "unresolved" };
}

function isSkippableResourceReference(reference) {
  return /^(#|data:|javascript:|mailto:|tel:)/i.test(reference);
}

function guessMimeType(path) {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".png")) {
    return "image/png";
  }
  if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lowerPath.endsWith(".gif")) {
    return "image/gif";
  }
  if (lowerPath.endsWith(".webp")) {
    return "image/webp";
  }
  if (lowerPath.endsWith(".bmp")) {
    return "image/bmp";
  }
  if (lowerPath.endsWith(".ico")) {
    return "image/x-icon";
  }
  if (lowerPath.endsWith(".avif")) {
    return "image/avif";
  }
  if (lowerPath.endsWith(".css")) {
    return "text/css";
  }
  if (lowerPath.endsWith(".js")) {
    return "text/javascript";
  }
  if (lowerPath.endsWith(".html")) {
    return "text/html";
  }
  if (lowerPath.endsWith(".json")) {
    return "application/json";
  }
  if (lowerPath.endsWith(".svg")) {
    return "image/svg+xml";
  }
  return "text/plain";
}

function normalizeCandidate(reference, currentFilePath) {
  if (!reference) {
    return "";
  }

  const skillRootDirectory = getSkillRootDirectory(currentFilePath);

  if (reference.includes("{ROOT_SKILL_DIR}")) {
    const suffix = reference.replaceAll("{ROOT_SKILL_DIR}", skillRootDirectory || ".");
    return normalizePath(suffix);
  }

  if (reference.includes("{SKILL_DIR}")) {
    const currentDirectory = currentFilePath.includes("/") ? currentFilePath.split("/").slice(0, -1).join("/") : "";
    const suffix = reference.replaceAll("{SKILL_DIR}", currentDirectory || ".");
    return normalizePath(suffix);
  }

  if (reference.startsWith("/")) {
    return normalizePath(reference);
  }

  const currentDirectory = currentFilePath.includes("/") ? currentFilePath.split("/").slice(0, -1).join("/") : "";
  return normalizePath(currentDirectory ? `${currentDirectory}/${reference}` : reference);
}

function collectHeuristicMatches(reference, collector) {
  const normalizedReference = normalizePath(reference);
  const basename = lastSegment(normalizedReference);
  collectSuffixMatches(basename, collector, "basename-fallback");

  if (!normalizedReference.includes("/")) {
    const templateVariant = buildTemplateVariant(normalizedReference);
    if (templateVariant) {
      collectSuffixMatches(templateVariant, collector, "basename-fallback");
    }
  }
}

function collectSuffixMatches(suffix, collector, via) {
  if (!suffix) {
    return;
  }
  for (const path of state.files.keys()) {
    if (path === suffix || path.endsWith(`/${suffix}`)) {
      addCandidate(collector, path, via);
    }
  }
}

function buildTemplateVariant(reference) {
  const basename = lastSegment(reference);
  const match = basename.match(/^(.*)\.([^.]+)$/);
  if (!match) {
    return "";
  }

  const stem = match[1];
  const extension = match[2];
  if (stem.endsWith("-template")) {
    return basename;
  }

  if (reference.startsWith("docs/")) {
    return `${stem}-template.${extension}`;
  }

  return `${stem}-template.${extension}`;
}

function collectMatches(candidate, collector, via) {
  if (candidate.includes("*")) {
    const matcher = globToRegExp(candidate);
    for (const path of state.files.keys()) {
      if (matcher.test(path)) {
        addCandidate(collector, path, via);
      }
    }
    return;
  }

  if (state.files.has(candidate)) {
    addCandidate(collector, candidate, via);
  }
}

function addCandidate(collector, path, via) {
  if (!collector.has(path)) {
    collector.set(path, { path, via });
  }
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function getReferenceStatus(resolved) {
  if (resolved.type === "file") {
    if (resolved.via === "basename-fallback") {
      return { label: "位置不符", className: "warn" };
    }
    return { label: "已解析", className: "success" };
  }
  if (resolved.type === "multi") {
    return { label: "多目标", className: "warn" };
  }
  if (resolved.type === "external") {
    return { label: "外部链接", className: "success" };
  }
  return { label: "未解析", className: "danger" };
}

function buildReferenceNote(resolved) {
  if (resolved.type === "file" && resolved.via === "basename-fallback") {
    return `<div class="reference-note warn">当前引用没有直接指向真实文件，查看器已回退定位到 ${escapeHtml(resolved.path)}。建议把正文中的引用直接改成真实路径。</div>`;
  }

  if (resolved.type === "unresolved") {
    return '';
  }

  return "";
}

function buildInlineHint(resolved) {
  if (resolved.type === "file" && resolved.via === "basename-fallback") {
    return `当前引用位置与实际文件位置不一致，已回退到 ${resolved.path}`;
  }
  return resolved.path || "";
}

function looksLikeReference(content) {
  return /\{SKILL_DIR\}|\/(?:[^\s`]+)|\.(?:md|html|json|py|js|css|txt)$/i.test(content) || /[A-Za-z0-9_-]+\/[A-Za-z0-9_./*-]+/.test(content);
}

function looksLikeTableLine(line) {
  return /^\|.*\|$/.test(line.trim());
}

function looksLikeTableSeparator(line) {
  return /^\|?\s*[:-]+(?:\s*\|\s*[:-]+)*\s*\|?$/.test(line.trim());
}

function parseCompactTableRows(line) {
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

  for (let headerLength = 2; headerLength <= Math.floor(cells.length / 2); headerLength += 1) {
    const header = cells.slice(0, headerLength);
    const separator = cells.slice(headerLength, headerLength * 2);
    if (header.some((cell) => !cell) || separator.length !== headerLength || separator.some((cell) => !/^:?-{3,}:?$/.test(cell))) {
      continue;
    }

    const body = [];
    let cursor = headerLength * 2;
    while (cursor < cells.length) {
      while (cursor < cells.length && !cells[cursor]) {
        cursor += 1;
      }
      if (cursor >= cells.length) {
        break;
      }

      const row = cells.slice(cursor, cursor + headerLength);
      if (row.length !== headerLength || row.some((cell) => !cell)) {
        body.length = 0;
        break;
      }

      body.push(row);
      cursor += headerLength;
    }

    if (body.length) {
      return [header, separator, ...body];
    }
  }

  return null;
}

function renderTable(lines, currentFilePath, references) {
  const rows = lines.map((line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()));
  return renderTableRows(rows, currentFilePath, references);
}

function renderTableRows(rows, currentFilePath, references) {
  const header = rows[0];
  const body = rows.slice(2);
  return `
    <table>
      <thead>
        <tr>${header.map((cell) => `<th>${parseInline(cell, currentFilePath, references, cell)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${body.map((row) => `<tr>${row.map((cell) => `<td>${parseInline(cell, currentFilePath, references, cell)}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function isBlockBoundary(currentLine, nextLine) {
  if (!nextLine || !nextLine.trim()) {
    return true;
  }
  return (
    nextLine.startsWith("```") ||
    nextLine.startsWith("````") ||
    /^#{1,6}\s/.test(nextLine) ||
    /^>\s?/.test(nextLine) ||
    /^[-*]\s+/.test(nextLine) ||
    /^\d+\.\s+/.test(nextLine) ||
    (looksLikeTableLine(currentLine) && looksLikeTableSeparator(nextLine))
  );
}

function normalizePath(path) {
  return path
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/")
    .split("/")
    .reduce((segments, segment) => {
      if (!segment || segment === ".") {
        return segments;
      }
      if (segment === "..") {
        segments.pop();
        return segments;
      }
      segments.push(segment);
      return segments;
    }, [])
    .join("/");
}

function lastSegment(path) {
  return path.split("/").pop() || path;
}

function formatTrailLabel(path) {
  const parts = path.split("/");
  if (parts.length <= 2) {
    return path;
  }
  return parts.slice(-2).join("/");
}

function shouldOpenDirectory(path) {
  if (state.filterText) {
    return true;
  }
  if (state.expandedDirectories.has(path)) {
    return true;
  }
  return state.currentFilePath.startsWith(`${path}/`);
}

function getMindMapRuntime() {
  if (!mindMapRuntime) {
    mindMapRuntime = window.SkillMindMap.createRuntime({
      listPaths: () => Array.from(state.files.keys()),
      readFile: readPathContent,
      isMarkdownFile,
      splitFrontmatter,
      resolveReference,
      getMindMapRootPath,
      extractReferences(markdown, currentFilePath) {
        const references = [];
        renderMarkdown(markdown, currentFilePath, references);
        const deduped = [];
        const seen = new Set();
        for (const reference of references) {
          const key = `${reference.raw}::${reference.display}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          deduped.push(reference);
        }
        return deduped;
      },
      async renderNodeDetail(node) {
        if (!node?.filePath) {
          return '<div class="empty-state">当前节点没有可展示的文件。</div>';
        }
        const content = await readPathContent(node.filePath);
        if (isMarkdownFile(node.filePath)) {
          if (node.detailType === "heading") {
            return renderMarkdown(node.sectionContent || "", node.filePath, []);
          }
          const { frontmatter, body } = splitFrontmatter(content);
          return `${frontmatter ? renderFrontmatter(frontmatter) : ""}${renderMarkdown(body, node.filePath, [])}`;
        }
        const extension = getFileExtension(node.filePath);
        if (extension === "json") {
          return renderJsonDocument(content);
        }
        return renderCodeDocument(content, extension);
      },
      escapeHtml,
      escapeHtmlAttribute,
    });
  }
  return mindMapRuntime;
}

function getMindMapRootPath(currentFilePath) {
  const normalizedCurrent = normalizePath(currentFilePath || "");
  if (!state.files.size) {
    return "";
  }
  if (normalizedCurrent.endsWith("/SKILL.md") || normalizedCurrent === "SKILL.md") {
    return normalizedCurrent;
  }

  if (normalizedCurrent) {
    const parts = normalizedCurrent.split("/");
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const prefix = parts.slice(0, index).join("/");
      const candidate = normalizePath(prefix ? `${prefix}/SKILL.md` : "SKILL.md");
      if (state.files.has(candidate)) {
        return candidate;
      }
    }
  }

  if (state.files.has("SKILL.md")) {
    return "SKILL.md";
  }

  const skillCandidates = Array.from(state.files.keys()).filter((path) => path.endsWith("/SKILL.md") || path === "SKILL.md");
  if (skillCandidates.length) {
    return skillCandidates.sort((left, right) => left.length - right.length)[0];
  }

  return normalizedCurrent || chooseInitialFile();
}

function getSkillRootDirectory(currentFilePath) {
  const rootPath = getMindMapRootPath(currentFilePath);
  if (!rootPath.endsWith("SKILL.md")) {
    return currentFilePath.includes("/") ? currentFilePath.split("/").slice(0, -1).join("/") : "";
  }
  return rootPath.replace(/(^|\/)SKILL\.md$/, "").replace(/\/$/, "");
}

function showMessage(message, isEmpty = false) {
  elements.documentView.className = `document-view${isEmpty ? " empty-state" : ""}`;
  elements.documentView.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value);
}