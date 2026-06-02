const deviceTray = document.querySelector("#deviceTray");
const toggleDeviceTray = document.querySelector("#toggleDeviceTray");
const resultTabs = document.querySelectorAll("#resultTabs .tab");
const resultViews = document.querySelectorAll(".result-view");
const deviceButtons = document.querySelectorAll(".device-card");
const currentDeviceBadge = document.querySelector("#currentDeviceBadge");
const riskModal = document.querySelector("#riskModal");
const closeRiskModal = document.querySelector("#closeRiskModal");
const capabilityModal = document.querySelector("#capabilityModal");
const closeCapabilityModal = document.querySelector("#closeCapabilityModal");
const workspaceGrid = document.querySelector(".workspace-grid");
const leftResizeHandle = document.querySelector("#leftResizeHandle");
const rightResizeHandle = document.querySelector("#rightResizeHandle");
const bottomResizeHandle = document.querySelector("#bottomResizeHandle");
const catalogNodes = document.querySelectorAll(".catalog-node");
const subcommandPanelList = document.querySelector("#subcommandPanelList");
const commandSearch = document.querySelector("#commandSearch");
const commandFilters = document.querySelectorAll("#commandFilters .chip");
const rawCommandInput = document.querySelector("#rawCommandInput");
const demoActions = document.querySelectorAll("[data-demo-action]");

const paramPresets = {
  component: { key: "component", label: "目标组件", placeholder: "com.demo/.MainActivity", required: true },
  action: { key: "action", label: "Action", placeholder: "android.intent.action.VIEW", required: false },
  flags: { key: "flags", label: "附加 Flags", placeholder: "--activity-clear-top", required: false },
  packageName: { key: "package", label: "目标包名", placeholder: "com.demo.app", required: true },
  settingsName: { key: "name", label: "设置项名称", placeholder: "development_settings_enabled", required: true },
  settingsValue: { key: "value", label: "目标值", placeholder: "1", required: true },
  density: { key: "density", label: "目标密度", placeholder: "420", required: true },
  text: { key: "text", label: "输入文本", placeholder: "hello_world", required: true },
  x: { key: "x", label: "X 坐标", placeholder: "540", required: true },
  y: { key: "y", label: "Y 坐标", placeholder: "1680", required: true }
};

function useParam(presetName, overrides = {}) {
  return {
    ...paramPresets[presetName],
    ...overrides
  };
}

const commandCatalog = {
  "core-adb": {
    path: "命令族 · adb 核心命令",
    title: "设备连接与基础状态",
    description: "围绕 adb devices、get-state、reconnect、server 控制等基础命令建立工作台入口。",
    commands: [
      { kicker: "连接总览", title: "adb devices -l", summary: "列出设备、传输方式和基础标识。", type: "查看型", support: "支持", favorite: true, raw: "adb devices -l", prerequisite: "adb server 可用", fallback: "adb get-state", risk: "低" },
      { kicker: "连通性校验", title: "adb get-state", summary: "快速检查当前设备是否在线。", type: "查看型", support: "支持", raw: "adb get-state", prerequisite: "至少连接一台设备", fallback: "adb devices", risk: "低" },
      { kicker: "恢复连接", title: "adb reconnect", summary: "重建 USB / TCP 连接，适合测试机掉线后快速恢复。", type: "写操作", support: "支持", raw: "adb reconnect", prerequisite: "设备曾经授权", fallback: "adb kill-server && adb start-server", risk: "中" }
    ]
  },
  "shell-prop": {
    path: "命令族 · shell / 属性",
    title: "系统属性与基础 shell",
    description: "聚焦 getprop、setprop、基础 shell 环境探测和版本识别。",
    commands: [
      { kicker: "属性读取", title: "adb shell getprop", summary: "读取系统属性，用于 Android 版本和 ROM 判定。", type: "查看型", support: "支持", favorite: true, raw: "adb shell getprop ro.build.version.release", prerequisite: "需要 shell 权限", fallback: "adb shell getprop", risk: "低" },
      { kicker: "属性写入", title: "adb shell setprop", summary: "修改系统属性，仅限特定调试设备。", type: "写操作", support: "受限", raw: "adb shell setprop debug.demo.flag 1", prerequisite: "工程机或具备写权限", fallback: "无", risk: "高" }
    ]
  },
  "shell-am": {
    path: "命令族 · adb shell am",
    title: "Activity Manager 命令",
    description: "用于启动 Activity、发送广播、控制服务和查看 Activity 相关状态。",
    commands: [
      { kicker: "前台启动", title: "adb shell am start", summary: "启动目标 Activity，并展示 intent、flags 与结果码。", type: "写操作", support: "支持", raw: "adb shell am start -n com.demo/.MainActivity", prerequisite: "包名与 Activity 可解析", fallback: "adb shell monkey -p com.demo 1", risk: "中", params: [useParam("component", { defaultValue: "com.demo/.MainActivity" }), useParam("action"), useParam("flags")], compose: (values) => { const parts = ["adb shell am start"]; if (values.action) parts.push(`-a ${values.action}`); if (values.flags) parts.push(values.flags); if (values.component) parts.push(`-n ${values.component}`); return parts.join(" "); } },
      { kicker: "广播测试", title: "adb shell am broadcast", summary: "发送广播并显示 receiver 命中情况。", type: "写操作", support: "支持", raw: "adb shell am broadcast -a com.demo.TEST", prerequisite: "action 已注册", fallback: "cmd activity broadcast", risk: "中", params: [useParam("action", { label: "广播 Action", required: true, placeholder: "com.demo.TEST", defaultValue: "com.demo.TEST" }), useParam("packageName", { required: false })], compose: (values) => { const parts = ["adb shell am broadcast"]; if (values.action) parts.push(`-a ${values.action}`); if (values.package) parts.push(`-p ${values.package}`); return parts.join(" "); } }
    ]
  },
  "shell-cmd-activity": {
    path: "命令族 · adb shell cmd activity",
    title: "cmd activity 栈与任务调试",
    description: "用于替代旧版 am stack list，在新系统或 ROM 限制场景下更稳定。",
    commands: [
      { kicker: "推荐模板", title: "cmd activity activities", summary: "查看 Activity、Task 与 RootTask 的层级和前台状态。", type: "查看型", support: "受限", favorite: true, raw: "adb shell cmd activity activities", prerequisite: "需要 shell 权限，无 root", fallback: "adb shell dumpsys activity activities", risk: "低" },
      { kicker: "任务摘要", title: "cmd activity recent-tasks", summary: "快速查看最近任务列表和任务属性。", type: "查看型", support: "支持", raw: "adb shell cmd activity recent-tasks", prerequisite: "Android 11+ 更完整", fallback: "adb shell dumpsys activity recents", risk: "低" }
    ]
  },
  "shell-pm": {
    path: "命令族 · adb shell pm",
    title: "Package Manager 命令",
    description: "围绕包安装、清理、权限和组件启停构建高风险可控工作流。",
    commands: [
      { kicker: "高风险写操作", title: "pm clear 包名", summary: "清除应用数据，执行前需要二次确认并展示影响范围。", type: "写操作", support: "支持", raw: "adb shell pm clear com.demo.app", prerequisite: "目标包已安装", fallback: "无", risk: "高", danger: true, params: [useParam("packageName", { defaultValue: "com.demo.app" })], compose: (values) => `adb shell pm clear ${values.package || ""}`.trim() },
      { kicker: "权限查看", title: "pm list permissions", summary: "查看系统权限和权限组，用于测试校验。", type: "查看型", support: "支持", raw: "adb shell pm list permissions -g -d", prerequisite: "无", fallback: "无", risk: "低" }
    ]
  },
  "shell-wm": {
    path: "命令族 · adb shell wm",
    title: "Window Manager 命令",
    description: "管理分辨率、密度、旋转等显示参数，适合兼容性测试。",
    commands: [
      { kicker: "显示查看", title: "wm size", summary: "读取当前物理/逻辑分辨率。", type: "查看型", support: "支持", raw: "adb shell wm size", prerequisite: "无", fallback: "dumpsys display", risk: "低" },
      { kicker: "显示调整", title: "wm density", summary: "修改密度用于 UI 兼容性验证。", type: "写操作", support: "支持", raw: "adb shell wm density 420", prerequisite: "需要记住原始值", fallback: "wm density reset", risk: "高", params: [useParam("density", { defaultValue: "420" })], compose: (values) => `adb shell wm density ${values.density || ""}`.trim() }
    ]
  },
  "shell-dumpsys": {
    path: "命令族 · adb shell dumpsys",
    title: "系统服务诊断",
    description: "聚焦 activity、window、package、display 等服务的查看型结果增强。",
    commands: [
      { kicker: "查看型增强", title: "dumpsys activity top", summary: "适合快速查看前台栈、Task、ActivityRecord 和窗口焦点。", type: "查看型", support: "支持", favorite: true, raw: "adb shell dumpsys activity top", prerequisite: "需要 shell 权限，无 root", fallback: "cmd activity activities", risk: "低" },
      { kicker: "窗口焦点", title: "dumpsys window windows", summary: "查看焦点窗口和可见窗口层级。", type: "查看型", support: "支持", raw: "adb shell dumpsys window windows", prerequisite: "无", fallback: "cmd window dump-visible-window-views", risk: "低" }
    ]
  },
  "shell-settings": {
    path: "命令族 · adb shell settings",
    title: "系统设置命令",
    description: "查看或修改 global、secure、system 设置项，常用于自动化和环境准备。",
    commands: [
      { kicker: "设置读取", title: "settings get global", summary: "读取全局设置项，适合测试前检查。", type: "查看型", support: "支持", raw: "adb shell settings get global development_settings_enabled", prerequisite: "无", fallback: "getprop", risk: "低", params: [useParam("settingsName", { defaultValue: "development_settings_enabled" })], compose: (values) => `adb shell settings get global ${values.name || ""}`.trim() },
      { kicker: "设置修改", title: "settings put secure", summary: "修改 secure 设置项，可能受权限限制。", type: "写操作", support: "受限", raw: "adb shell settings put secure show_ime_with_hard_keyboard 1", prerequisite: "具备相应权限", fallback: "无", risk: "高", params: [useParam("settingsName", { defaultValue: "show_ime_with_hard_keyboard" }), useParam("settingsValue", { defaultValue: "1" })], compose: (values) => `adb shell settings put secure ${values.name || ""} ${values.value || ""}`.trim() }
    ]
  },
  "adb-logcat": {
    path: "命令族 · adb logcat",
    title: "日志与缓冲区分析",
    description: "按 tag、priority、buffer 和格式组织日志查看入口。",
    commands: [
      { kicker: "缓冲区过滤", title: "adb logcat -b main -v threadtime", summary: "默认日志视图，适合开发和测试联调。", type: "查看型", support: "支持", favorite: true, raw: "adb logcat -b main -v threadtime", prerequisite: "设备在线", fallback: "adb shell logcat", risk: "低" },
      { kicker: "精准过滤", title: "adb logcat ActivityManager:I *:S", summary: "通过 tag 与优先级快速定位核心日志。", type: "查看型", support: "支持", raw: "adb logcat ActivityManager:I *:S", prerequisite: "需要明确 tag", fallback: "adb logcat -s ActivityManager", risk: "低" }
    ]
  },
  "shell-input": {
    path: "命令族 · adb shell input",
    title: "输入与自动化操作",
    description: "围绕 tap、swipe、text 等输入模拟建立自动化工具入口。",
    commands: [
      { kicker: "文本输入", title: "input text", summary: "向焦点输入框输入文本，可与自动化步骤联动。", type: "写操作", support: "支持", raw: "adb shell input text hello_world", prerequisite: "目标输入框已获取焦点", fallback: "am broadcast + helper app", risk: "中", params: [useParam("text", { defaultValue: "hello_world" })], compose: (values) => `adb shell input text ${values.text || ""}`.trim() },
      { kicker: "坐标点击", title: "input tap", summary: "按屏幕坐标点击，适合简单自动化与调试。", type: "写操作", support: "支持", raw: "adb shell input tap 540 1680", prerequisite: "需已知屏幕尺寸", fallback: "uiautomator dump + 坐标推导", risk: "中", params: [useParam("x", { defaultValue: "540" }), useParam("y", { defaultValue: "1680" })], compose: (values) => `adb shell input tap ${values.x || ""} ${values.y || ""}`.trim() }
    ]
  }
};

let activeCategory = "core-adb";
let activeFilter = "all";
let activeCommandIndex = 0;
const commandParamValues = {};

function updateLiveStatus(message) {
  void message;
}

function getCommandState(command) {
  if (!commandParamValues[command.title]) {
    commandParamValues[command.title] = Object.fromEntries(
      (command.params || []).map((param) => [param.key, param.defaultValue || ""])
    );
  }
  return commandParamValues[command.title];
}

function buildCommandString(command) {
  if (!command.params || !command.compose) {
    return command.raw;
  }
  return command.compose(getCommandState(command));
}

function getVisibleCommands(categoryId) {
  const source = commandCatalog[categoryId].commands;
  const keyword = (commandSearch?.value || "").trim().toLowerCase();
  return source.filter((command) => {
    const haystack = [command.title, command.summary, command.raw].join(" ").toLowerCase();
    if (keyword && !haystack.includes(keyword)) {
      return false;
    }
    if (activeFilter === "all") {
      return true;
    }
    if (activeFilter === "view") {
      return command.type === "查看型";
    }
    if (activeFilter === "write") {
      return command.type === "写操作";
    }
    if (activeFilter === "risk") {
      return command.risk === "高";
    }
    if (activeFilter === "favorite") {
      return Boolean(command.favorite);
    }
    return true;
  });
}

function syncRawPanel(command) {
  rawCommandInput.value = buildCommandString(command);
  updateLiveStatus(`已切换到 ${command.title}。当前展示的是 ${commandCatalog[activeCategory].title} 分类下的命令细节。`);
}

function renderSelectedCommandDetail(command) {
  void command;
}

function renderSubcommands(visibleCommands) {
  if (!subcommandPanelList) {
    return;
  }

  subcommandPanelList.innerHTML = "";

  if (!visibleCommands.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "subcommand-item";
    emptyState.innerHTML = "<strong>无匹配命令</strong><span>请调整搜索词或筛选器。</span>";
    subcommandPanelList.appendChild(emptyState);
    return;
  }

  visibleCommands.forEach((command, index) => {
    const item = document.createElement("article");
    item.className = `subcommand-item ${index === activeCommandIndex ? "active" : ""}`;
    const commandState = getCommandState(command);
    const requiredParams = (command.params || []).filter((param) => param.required);
    const optionalParams = (command.params || []).filter((param) => !param.required);
    item.innerHTML = `
      <button class="subcommand-toggle" type="button">
        <strong>${command.title}</strong>
        <span>${command.summary}</span>
      </button>
      ${index === activeCommandIndex ? `
        <div class="subcommand-detail">
          <div class="subcommand-meta">
            <span class="badge info">${command.type}</span>
            <span class="badge ${command.support === "支持" ? "success" : command.support === "受限" ? "warning" : "info"}">${command.support}</span>
            <span class="badge ${command.risk === "高" ? "danger" : command.risk === "中" ? "warning" : "info"}">风险 ${command.risk}</span>
          </div>
          <p>前置条件：${command.prerequisite}</p>
          <p>降级方案：${command.fallback}</p>
          ${requiredParams.length ? `
            <div class="param-block">
              <p class="param-title">必填参数</p>
              ${requiredParams.map((param) => `
                <label class="param-field">
                  <span>${param.label}</span>
                  <input class="param-input" data-param-key="${param.key}" value="${commandState[param.key] || ""}" placeholder="${param.placeholder || ""}" />
                </label>
              `).join("")}
            </div>
          ` : ""}
          ${optionalParams.length ? `
            <div class="param-block">
              <p class="param-title">可选参数</p>
              ${optionalParams.map((param) => `
                <label class="param-field">
                  <span>${param.label}</span>
                  <input class="param-input" data-param-key="${param.key}" value="${commandState[param.key] || ""}" placeholder="${param.placeholder || ""}" />
                </label>
              `).join("")}
            </div>
          ` : ""}
        </div>
      ` : ""}
    `;
    item.querySelector(".subcommand-toggle")?.addEventListener("click", () => {
      activeCommandIndex = index;
      renderCommands();
    });

    item.querySelectorAll(".param-input").forEach((input) => {
      input.addEventListener("input", (event) => {
        commandState[event.target.dataset.paramKey] = event.target.value;
        if (index === activeCommandIndex) {
          syncRawPanel(command);
        }
      });
    });
    subcommandPanelList.appendChild(item);
  });
}

function renderCommands() {
  const visibleCommands = getVisibleCommands(activeCategory);
  renderSubcommands(visibleCommands);

  if (!visibleCommands.length) {
    updateLiveStatus("当前筛选条件下没有匹配命令，请调整搜索词或筛选器。");
    return;
  }

  if (activeCommandIndex >= visibleCommands.length) {
    activeCommandIndex = 0;
  }

  syncRawPanel(visibleCommands[activeCommandIndex]);
}

function setupResizeHandle(handle, mode) {
  handle?.addEventListener("pointerdown", (event) => {
    if (!workspaceGrid) {
      return;
    }

    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = document.querySelector(".command-panel")?.getBoundingClientRect().width || 0;
    const startMiddle = document.querySelector(".subcommand-panel")?.getBoundingClientRect().width || 0;
    const startBottom = document.querySelector(".executor-panel")?.getBoundingClientRect().height || 0;
    const totalWidth = workspaceGrid.getBoundingClientRect().width;
    const totalHeight = workspaceGrid.getBoundingClientRect().height;
    const minLeft = 180;
    const minMiddle = 180;
    const minRight = 320;
    const minBottom = 210;
    const maxBottom = totalHeight - 220;

    const onMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      if (mode === "left") {
        const maxLeft = totalWidth - startMiddle - minRight - 24;
        const nextLeft = Math.min(Math.max(startLeft + delta, minLeft), maxLeft);
        workspaceGrid.style.setProperty("--left-width", `${nextLeft}px`);
      }

      if (mode === "right") {
        const currentLeft = document.querySelector(".command-panel")?.getBoundingClientRect().width || startLeft;
        const maxMiddle = totalWidth - currentLeft - minRight - 24;
        const nextMiddle = Math.min(Math.max(startMiddle + delta, minMiddle), maxMiddle);
        workspaceGrid.style.setProperty("--middle-width", `${nextMiddle}px`);
      }

      if (mode === "bottom") {
        const nextBottom = Math.min(Math.max(startBottom + deltaY, minBottom), maxBottom);
        workspaceGrid.style.setProperty("--bottom-height", `${nextBottom}px`);
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
}

resultTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    resultTabs.forEach((item) => item.classList.toggle("active", item === tab));
    resultViews.forEach((view) => view.classList.toggle("active", view.dataset.view === target));
    updateLiveStatus(`结果工作区已切换到${tab.textContent}视图。`);
  });
});

deviceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    deviceButtons.forEach((item) => item.classList.toggle("active", item === button));
    if (currentDeviceBadge) {
      currentDeviceBadge.textContent = `当前设备：${button.dataset.device.split(" · ")[0]}`;
    }
    if (deviceTray && toggleDeviceTray) {
      deviceTray.classList.add("collapsed");
      toggleDeviceTray.textContent = "选择设备";
    }
    updateLiveStatus(`已切换设备到 ${button.dataset.device}，命令适配与结果视图将按该设备重新评估。`);
  });
});

closeRiskModal?.addEventListener("click", () => {
  riskModal?.classList.add("hidden");
  updateLiveStatus("已关闭高风险确认弹窗，操作未执行。");
});

riskModal?.addEventListener("click", (event) => {
  if (event.target === riskModal) {
    riskModal.classList.add("hidden");
    updateLiveStatus("已通过遮罩关闭高风险确认弹窗。");
  }
});

closeCapabilityModal?.addEventListener("click", () => {
  capabilityModal?.classList.add("hidden");
  updateLiveStatus("已关闭适配洞察弹窗。");
});

capabilityModal?.addEventListener("click", (event) => {
  if (event.target === capabilityModal) {
    capabilityModal.classList.add("hidden");
    updateLiveStatus("已通过遮罩关闭适配洞察弹窗。");
  }
});

catalogNodes.forEach((node) => {
  node.addEventListener("click", () => {
    catalogNodes.forEach((item) => item.classList.toggle("active", item === node));
    activeCategory = node.dataset.category;
    activeCommandIndex = 0;
    renderCommands();
  });
});

commandFilters.forEach((chip) => {
  chip.addEventListener("click", () => {
    commandFilters.forEach((item) => item.classList.toggle("active", item === chip));
    activeFilter = chip.dataset.filter;
    activeCommandIndex = 0;
    renderCommands();
  });
});

commandSearch?.addEventListener("input", () => {
  activeCommandIndex = 0;
  renderCommands();
});

demoActions.forEach((button) => {
  button.addEventListener("click", () => {
    updateLiveStatus(button.dataset.demoAction);
  });
});

toggleDeviceTray?.addEventListener("click", () => {
  const collapsed = deviceTray?.classList.toggle("collapsed");
  toggleDeviceTray.textContent = collapsed ? "选择设备" : "收起设备";
  updateLiveStatus(collapsed ? "设备选择弹层已收起，标题栏仅保留当前设备摘要。" : "设备选择弹层已展开，可切换目标设备。" );
});

renderCommands();
setupResizeHandle(leftResizeHandle, "left");
setupResizeHandle(rightResizeHandle, "right");
setupResizeHandle(bottomResizeHandle, "bottom");