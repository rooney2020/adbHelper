全量修改adb命令块的参数显示

## ADB命令

* 文件选择器
* 应用选择器
* 进程选择器
* 用户下拉列表

## 按键模拟

* ~~**常用按键快捷栏**：将Home、Back、Recent Apps（概览）、电源键、音量键等做成大按钮，一键发送 `input keyevent` 命令。~~
* ~~**可视化坐标点击与滑动**：自动获取一张设备截图，用户可以**点击图片上的位置**来设置点击或滑动的起点/终点。后台将其转换为 `adb shell input tap x y` 或 `swipe` 命令，彻底告别盲猜坐标。~~
* ~~**宏命令录制与回放**：记录用户的一系列点击、滑动、输入操作，保存为脚本。这对于需要多步复现的Bug（如“进入5级菜单后崩溃”）特别有用。~~
* ~~**多指滑动**：模拟多个手指同时在屏幕上滑动，支持独立设置每个手指的起点、终点、持续时间~~
* ~~**按键编排**：将多个按键、点击、滑动等操作按照设定的顺序和时间间隔组合成一个宏指令，实现自动化操作序列的一键执行。~~
* **高级按键模拟**：TOUCH: ACTION_DOWN

## Monkey

- **可视化参数配置**：将 `--pct-touch`、`--pct-motion`、`--throttle` 等参数做成滑块或数值输入框，无需记忆命令。

- **实时日志监控与高亮**：在Monkey执行时，实时抓取logcat，并用不同颜色高亮显示 `CRASH`、`ANR`、`EXCEPTION` 等关键异常。

- **一键终止与进程清理**：提供“紧急停止”按钮，一键执行 `adb shell ps | grep monkey` 和 `adb shell kill` 操作，避免Monkey在后台持续运行[-1](https://www.e-com-net.com/article/1504960370035458048.htm)。

- **报告自动生成**：测试结束后，自动统计事件总数、崩溃次数、ANR次数，并提取出错的日志上下文。

## Logcat日志

* 停止捕获后，可以查看已捕获的日志文件（工具捕获的或用户提供的其他日志文件）
* ~~logcat参数：如-b crash、-b event~~

## ~~Layout Inspector~~

- ~~**获取并解析UI树**：执行 `adb shell uiautomator dump` 命令，将生成的XML文件解析为**树形结构**展示。~~
- ~~**控件属性查看**：点击树中的某个节点，即可查看其 `resource-id`、`text`、`bounds`、`clickable` 等所有属性。~~
- ~~**一键生成点击命令**：选中一个控件后，可以直接复制其坐标点击命令，或基于 `adb shell input tap` 的自动生成指令。~~

## Dumpsys

- **实时资源监控**：以**折线图**的形式实时展示CPU、内存、FPS（帧率）、网络流量变化。可以用 `adb shell top`、`dumpsys gfxinfo`、`dumpsys meminfo` 定期采样并绘制图表。
- **电池与温度**：展示设备当前的电池电量、充电状态、温度（`dumpsys battery`），帮助判断设备状态。
- **应用启动耗时统计**：一键执行 `adb shell am start -W <package>/<activity>`，清晰展示 `ThisTime`、`TotalTime`、`WaitTime`，方便进行冷/热启动的性能测试。

## ~~Trace抓取和解析~~

## getprop/setprop

## ~~BugReport~~

## ~~Crash、ANR等信息查看~~

## ~~截图和录屏~~



## 

