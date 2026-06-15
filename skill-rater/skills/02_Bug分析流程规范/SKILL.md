---
name: bug-analysis
description: >-
  分析和定位 Android 系统级 Bug，遵循标准化的 Bug 分析流程和报告格式。
  Use when user mentions bug, defect, issue analysis, crash analysis, log analysis, 不具合, 崩溃, or缺陷.
   适用于 Android/CarPlay 相关问题的日志证据化分析与结论输出。
---



# Bug分析流程规范

## 分析原则

执行优先级：证据与范围 > 方法与验证 > 交互与输出。

- **交互约束**：默认禁用 Cursor Sub Agent（含 Task 拉起子代理）；确需并行排查时，先说明用途并征得用户同意。每次输出后必须调用 `interactive_feedback` 等待反馈；不可用时按全局规则降级到 `AskQuestion` 并提供"切回 Feedback"。
- **证据约束**：结论必须基于用户提供的原始日志，不做无证据推测。外部规范（如 Apple CarPlay 规范）仅用于解释与合规对照，不能替代日志证据。若关键事件缺失或日志不完整，必须明确"证据不足"并请求补充日志后再给最终结论。
- **范围约束**：区分TS代码、App代码、Android Framework职责，不分析非工程代码逻辑，例如外部库或第三方模块的内部实现。
- **方法约束**：从触发点到最终结果逐步追踪因果链，不跳跃；使用多个日志源交叉验证；对既有观点必须独立复核后再采纳。
- **代码约束**：如需新增/修改工程代码（含示例 patch、demo、修复实现），代码注释（`//`、`/* */`、Doxygen `@param`）一律英文，禁止中文注释；变量名、函数名、日志字符串同样使用英文。会话回复正文保持简体中文。

## 分析流程（按顺序执行）

执行顺序总览：先完成事实定位（第1-3步），再完成模块与触发源定位（第4-6步），最后构建并验证因果链（第7步）。

若一次上下文不足，可按三段独立执行并分批输出：A段（第1-3步）→ B段（第4-6步）→ C段（第7步与报告）。

### 第1步：理解问题背景

- 确认正常功能流程（如：正常的调用链、回调顺序）
- 确认问题时间窗口
- 确认相关代码模块和用户提供的日志文件

### 第2步：构建事件时间线

- 从原始日志中提取问题时间段内的所有关键事件
- 按时间顺序排列，标注PID/TID、组件名、事件类型
- 重点关注：状态变化、回调、错误/警告日志

### 第3步：追踪Android Framework原生日志

根据问题涉及的模块，追踪相关的Android Framework原生日志，包括但不限于：

- **AMS/WMS**：Activity生命周期（wm_create_activity → wm_finish_activity → wm_destroy_activity等）、Task管理、窗口状态
- **InputDispatcher**：触摸事件派发、焦点切换
- **PackageManager**：权限状态变化
- **PowerManager**：电源状态影响
- **其他Framework模块**：根据具体问题涉及的模块追踪

追踪要点：
- 必须确认Activity是否被**finish**和**destroy**，仅STOP不等于已退出
- 追踪Task的创建、移动、移除
- 追踪焦点变化和窗口状态

### 第4步：确认关联模块状态

根据问题涉及的业务模块，确认其状态变化和时序关系。例如：

- 模式管理模块（如ModeManager）：模式栈变化、模式进入/退出时序
- 输入事件模块：触摸事件派发目标、焦点窗口切换
- 资源管理模块：资源获取/释放、状态机迁移
- 连接管理模块：连接状态、session生命周期
- 其他业务相关模块

重点关注：不同管理体系间的状态是否一致（如AMS的Activity Stack与业务模块的状态栈）

### 第5步：追踪关键事件的触发源

对每个关键状态变化，追溯其触发源：

- 确认是用户操作（触摸、按键）触发还是系统/应用内部触发
- 追踪事件的传递路径（从输入到最终处理）
- 确认触发条件是否符合预期

### 第6步：分析代码逻辑

- 阅读相关代码文件，理解状态机、回调、生命周期处理
- 确认代码中是否存在静默失败、缺少重试、状态不同步等问题
- 只分析工程中存在的代码，不推测工程外的代码行为

### 第7步：构建因果链并验证

- 从触发点开始，逐步构建完整因果链
- 每一环都必须有LOG依据支撑
- 用反问验证结论：如果X不是根因，那么解释为什么Y行为能恢复？

## 高级分析机制

以下机制适用于跨进程、Native/Java交互、资源生命周期等复杂场景的深入分析。

### 机制1：正常/异常流程对比分析

- 在日志中找到**同一流程的正常执行实例和异常执行实例**，逐行对比
- 定位流程在哪一步发生了分歧（正常流程有、异常流程缺失的步骤即为断裂点）
- 典型用法：同一 session 类型的 create → connect → disconnect → destroy 流程，对比不同时间段的执行差异
- 重点对比：HAL 层完整操作链（如 disconnect → unRegister → sessionDelete → destroySession → thread exit），确认是否有步骤缺失

### 机制2：线程生命周期追踪

- 对关键线程（TID）建立完整的生命周期视图：创建时间 → 活跃区间 → 最后活动 → 退出/阻塞时间
- 通过线程的最后一条日志判断线程是否阻塞或异常退出
- 特别关注：native 通知线程（如 iapNotificationThread）和工作线程（如 Setup_Task、cpScreen looper）是否正常退出
- 若线程在某操作中阻塞后再无日志输出，该操作即为死锁/阻塞点

### 机制3：回调链完整性验证

- 对 Native → HAL → Java 的回调链，验证每一层是否都正确接收并传递了回调
- 具体方法：从日志中追踪 native callback → notification queue → notification thread → Java IPC → Java handler 的完整链路
- 如果链中某一环缺失（如 native callback 从未被调用），问题定位到该环及其上游
- 典型模式：`notifyCB` → `notifyInfoCallback` → `mNotifyQueue.push` → `iapNotificationThread` 处理 → Java `onIapNotification`

### 机制4：资源生命周期闭环验证

- 对 open/close、create/destroy、register/unregister 等成对操作，全局搜索验证是否闭环
- 建立资源追踪表：资源标识（fd、handle、session pointer）→ 创建时间 → 使用记录 → 销毁时间
- 未闭环的资源即为泄漏点，会导致后续操作的 EBUSY、资源冲突等错误
- 典型场景：transport_open/close、iPod_Create/iPod_Destroy、iapNotificationThread start/exit

### 机制5：组件活跃度时间分析

- 对关键组件按线程分组，统计其日志活跃时间段，绘制活跃度时间线
- 当某组件在特定时间点后突然沉默（无日志输出），定位该时间点前后发生了什么
- 将多个组件的沉默时间点按时序排列，可发现级联故障的传播路径和速度
- 示例：thread A 阻塞(T0) → 组件 B 沉默(T0+15s) → 组件 C 沉默(T0+4min) → 整体通信中断

### 机制6：跨进程因果链分析

- 明确不同组件所在的进程和通信方式（Binder IPC、socket、共享内存、设备节点等）
- 区分直接依赖（同进程内线程间）和间接依赖（跨进程或通过外部设备如 iPhone 的反馈回路）
- 跨进程问题需要追踪两端的日志，关注 IPC 调用的发出和接收
- 特别注意：跨设备的反馈回路（如 head unit → iPhone → head unit），某端异常可能导致对端行为变化

### 机制7：Timer/定时器竞争条件分析

适用于涉及定时器（ScheduledExecutor、Handler.postDelayed、TimerTask 等）的时序竞争问题：

1. **定位 Timer 创建与回调**：
   - 在日志中搜索 Timer 启动日志（如 `startTimer`）和 Timer 回调日志（如回调方法名）
   - 计算 Timer 启动到回调触发的时间差，确认是否与代码中定义的超时时间一致
   - 通过 TID 确认回调是否在 Timer 线程（ScheduledExecutorService）中执行

2. **构建 Timer 窗口内事件时间线**：
   - 以 Timer 启动为 T=0，标注窗口内所有关键事件的 Timer 偏移（T+Xms）
   - 重点关注：状态变量（如焦点状态、连接状态）在 Timer 窗口内的变化时间点
   - 确认 Timer 回调时依赖的状态变量值是否已被窗口内的并发事件修改

3. **正常/异常对比的核心**：
   - 找到同一操作在不同时间的正常和异常实例
   - 对比关键外部事件（如焦点请求、资源释放）相对于 Timer 窗口的时间位置
   - 如果外部事件在正常实例中落在窗口外、异常实例中落在窗口内，即为竞争条件根因
   - 量化差异：记录外部事件耗时的波动范围（如冷启动 vs 热启动导致的时间差异）

4. **典型模式**：
   - Timer 回调条件依赖的状态变量被并发事件意外修改（TOCTOU 变体）
   - Timer 超时后的"恢复逻辑"在特定场景下与正在执行的操作目标相矛盾
   - 外部事件耗时不确定（如 App 冷启动 vs 热启动），导致竞争窗口的命中率不稳定（间歇性 bug）

### 机制8：画面资源操作合理性验证

适用于 `changeVideoFocus`、`accessoryScreenChange`、Borrow/Unborrow 等画面资源操作引发异常的场景：

1. **AMS/WMS 画面状态前置验证**：
   - 在分析 `changeVideoFocus` 等画面资源操作时，必须通过 AMS/WMS 日志确认**操作前**是否有实际的画面/窗口焦点变化
   - 搜索操作前时间窗口内的 Activity lifecycle（RESUMED/PAUSING/STARTED/Finishing）、Window focus（Changing focus、Input focus changed、findFocusedWindow）、addWindow/removeWindow 等事件
   - 如果操作前无画面变化，则操作本身可能是不合理的（App 逻辑问题）

2. **弹窗存在性交叉验证**：
   - 当 borrowId/borrowReason 声称有弹窗（如 `dialogShow`、`HVAC_DIALOG`）时，必须通过 WMS 的 addWindow、Dialog/Overlay 窗口类型（TYPE_SYSTEM_ALERT、TYPE_APPLICATION_OVERLAY）等日志交叉验证弹窗是否真实存在
   - App 内部状态机标识（如 `borrowReason=HVAC_DIALOG`）不等于 AMS/WMS 层面的真实弹窗事件

3. **因果方向判定**：
   - 严格区分 AMS/WMS 事件是画面操作的「触发原因」还是「执行结果」
   - 通过时间戳判定：如果 AMS/WMS 事件发生在 `changeVideoFocus` **之后**，则是结果而非原因
   - 典型错误：将 ViewerActivity Finish（changeVideoFocus 的结果）误认为触发原因

4. **跨领域触发源识别**：
   - 确认画面资源操作的触发源是否属于画面领域
   - 如果 `changeVideoFocus` 由音频焦点变化（AudioFocusManager.onFocusChanged）触发，而非画面焦点变化，则触发逻辑存在问题
   - App 不应在仅有音频焦点变化（无画面焦点变化）的情况下调用画面资源操作接口

5. **快速 Borrow→Unborrow 异常检测**：
   - 如果 `changeVideoFocus(priority=6)` 和 `changeVideoFocus(priority=1)` 在极短时间内（<50ms）连续发出，说明 App 内部状态判断前后矛盾
   - 这种快速翻转会导致 ScreenResourceManager 状态机快速切换（InCarPlay → InBorrowUser → InCarPlay），引发 ViewerActivity 不必要的 Finish→Start 重建

### 机制9：Surface 竞态条件分析

适用于 ViewerActivity Finish→Start 重建导致的画面异常（黑屏、闪烁）：

1. **新旧 Activity Surface 时序追踪**：
   - 当 ViewerActivity 被 Finish→Start 重建时，必须追踪新旧 Activity 的 surface 生命周期时序：
     - 新 Activity: `surfaceCreated` → `CarPlayManager.setSurface(surface)` → `native_setSurface succeeded`
     - 旧 Activity: `surfaceDestroyed` → `CarPlayManager.setSurface(null)` → `native_setSurface jsurface is NULL`
   - 如果旧 Activity 的 `surfaceDestroyed` 发生在新 Activity `setSurface(surface)` **之后**，则存在竞态：旧 Activity 的 `setSurface(null)` 会覆盖新 surface

2. **CarPlayManager.setSurface() 无条件清除问题**：
   - 确认 `setSurface(null)` 是否无条件执行（不区分 surface 来源/Activity 实例）
   - 如果 `setSurface()` 没有检查传入的 null 是否对应当前活跃的 surface，则任何 Activity 的 `surfaceDestroyed` 都可能清除当前有效的 surface
   - 代码审查重点：`CarPlayManager.java` 的 `setSurface()` 方法中 `surface == null` 分支

3. **Codec 异常链完整追踪**：
   - Surface 竞态发生后，追踪 MediaCodec 的完整异常链：
     - `setSurface(null)` → `AMediaCodec_queueInputBuffer err = -10000`（持续报错）→ `AMediaCodec_stop`（返回错误）→ `AMediaCodec_delete` → 重建 → `Abnormal codecState cannot start Codec`
   - 关键判断：Codec 报错 `-10000` 的起始时间是否与 `setSurface(null)` 时间吻合，用于确认因果关系
   - 如果 Codec 重建后仍然 `cannot start`，说明 surface 竞态的影响持续存在，画面无法恢复

4. **典型模式**：
   - App 调用 `changeVideoFocus` → ViewerActivity Finish → 新 ViewerActivity Start
   - 新 Activity `surfaceCreated`(T1) → `setSurface(surface)`(T1)
   - 旧 Activity `surfaceDestroyed`(T1+Δ) → `setSurface(null)`(T1+Δ) — 覆盖新 surface
   - Codec 失去渲染面 → `err=-10000` → 黑屏
   - Δ 通常为 10~20ms，取决于 Activity destroy 的调度时序

## 报告格式

分析过程中可使用表格辅助整理，但**最终输出必须按以下格式**：

### 【分析结论】
- **一句话**概括根本原因，必须包含：触发动作 → 中间状态变化 → 最终异常结果

### 【LOG依据】
- **每条日志占一行**，格式为：`**L{行号}** {时间} {组件}: {日志内容}` — {一句话说明该日志的含义}
- 禁止使用表格，必须逐行展示
- 每行日志后用 `—` 连接一句话中文解释
- 关键异常点用 **★** 标记
- 如有正常/异常对比，在 LOG 末尾用独立段落简要说明分歧点

### 【总结】
- 表格形式总结：根本原因、直接原因、触发条件、影响范围、问题代码位置

### 示例

```
## 【分析结论】
App 下发 HID PAUSE 启动 200ms Timer 期间，AM 成功获取 AudioFocus 导致 CarPlay 失焦，Timer 到期后误发 PLAY 触发 Apple 重新请求资源拉起 CarPlay 画面。

## 【LOG依据】
**L395988** `15:20:03.769 CarPlayService: sendRemoteMediaPlayback->(2, 0)` — 下发 PAUSE 给 Apple
**L395989** `15:20:03.769 CarPlayIapSessionManager: startHidTimer` — Timer T=0 启动（200ms）
**L396133** `15:20:03.889 MediaFocusControl: requestAudioFocus from broadcastradio` — AM 在 T+120ms 申请焦点
**L396169** `15:20:03.904 AudioManager: onAudioFocusChange(-1) CarPlay` — CarPlay 在 T+135ms 失焦
**L396297** `15:20:03.970 CarPlayManager: sendPlayEvent` — ★ Timer 到期(T+201ms)异常发送 PLAY
**L396485** `15:20:04.330 ModeManagerService: CarPlay Projection(6)` — ★ CarPlay 画面异常拉起

## 【总结】
| 项目 | 内容 |
|------|------|
| 根本原因 | sendPlayIfNeed 无法区分正常失焦和异常失焦 |
| 直接原因 | AM 焦点请求落在 200ms Timer 窗口内 |
| 触发条件 | 源切换 + AM 热启动 |
| 影响范围 | CarPlay 画面循环拉起 |
| 问题代码 | CarPlayManager.java L5509-5517 |
```

## Native Crash (SIGSEGV/NATIVE_CODE_ABORT) 分析要点

### 崩溃类型识别

| Signal | 含义 | 常见根因 |
|--------|------|----------|
| SIGSEGV (signal 11) SEGV_MAPERR | 访问无效内存地址 | Use-After-Free、空指针、munmap后访问 |
| SIGSEGV (signal 11) SEGV_ACCERR | 访问权限不足 | 写只读内存、栈溢出 |
| SIGABRT (signal 6) | 主动abort | assert失败、内存分配失败 |

### 多线程竞争条件分析

1. **Race Condition 识别模式**：
   - 一个线程释放资源（free/munmap/close），另一线程仍在使用该资源
   - 典型场景：session销毁线程 vs 音频读取线程、callback执行线程 vs 资源清理线程

2. **TOCTOU (Time Of Check, Time Of Use) 反模式**：
   - 检查条件（如标志位）和使用资源之间没有锁保护
   - 例：检查 `isAlreadyStop==false` 后，另一线程立即设置为true并释放资源，导致当前线程访问已释放内存

3. **Use-After-Free (UAF) 追踪**：
   - 从 tombstone backtrace 定位 crash 函数和代码行
   - 确认被访问的指针/内存何时被分配、何时被释放
   - 检查释放操作和使用操作之间是否有同步机制

### 修复策略归纳

| 问题模式 | 推荐修复方案 |
|----------|-------------|
| 线程不安全退出 | 添加原子标志位（`std::atomic<bool>`）+ 等待线程退出（`pthread_join`） |
| 共享资源无锁保护 | 读写锁（`pthread_rwlock_t`）保护并发访问 |
| 同步停止导致死锁 | 异步消息机制（post MSG）替代同步调用 |
| 释放后仍被回调 | 释放前设置标志位，回调中检查标志位后跳过 |
| 资源释放顺序错误 | 先停止使用线程 → 等待退出 → 再释放资源 |

### 分析步骤（Native Crash 专用）

1. 从 tombstone/crash dump 提取 backtrace，定位 crash 发生的 .so 和函数
2. 在工程源码中找到对应函数，分析 crash 行的内存访问
3. 追踪被访问内存的分配和释放路径，确认生命周期
4. 识别并发线程：用 `pthread_create` 搜索线程创建，确认线程间共享资源
5. 检查锁保护范围：确认 crash 路径上的临界区是否被正确保护
6. 构建竞争时序：画出正常时序和异常时序的对比，定位竞争窗口

## CarPlay 无线连接失败分析要点

### 连接流程架构

CarPlay 无线连接涉及多层协议栈，分析时需逐层定位断裂点：

```
Layer 0: BT 配对/发现           → logcat_system.txt (BluetoothAdapter/BondStateMachine)
Layer 1: BT RFCOMM 连接         → CarPlayBtTransport, BluetoothSerialPort
Layer 2: Transport 打开          → transport_open/close (IapHalService PID, /dev/bluetooth)
Layer 3: IAP2 Session 建立       → IapHalService create/connect, iapSessionArbitrate
Layer 4: MFi 芯片认证            → mfichip_i2c, mficp_get_signature, mficp_get_device_version
Layer 5: iPodLib 控制会话协商     → iPodLib Setup_Task (native 层, 与 iPhone 交互)
Layer 6: IAP2 能力通知           → IapNotifyTypeWCPAvailable → onWirelessCarPlayUpdate
Layer 7: CarPlay 状态机          → CarPlayWiFiCapUpdate 状态机 (Java 层)
```

### 分析步骤（CarPlay 无线连接专用）

1. **确认失败层级**：从 Layer 7 向下追踪，找到第一个出错的层
2. **检查状态机消息编号**：`processMessage: N` 中的 N 对应 `CarPlayWiFiCapUpdate` 的 MSG 常量：
   - 0=MSG_RECONNECT_RFCOMM, 2=MSG_GET_CAPBILITY, 3=MSG_IAP2_AUTH_FAILED
   - 4=MSG_CARPLAY_CAPBILITY_UPDATE_TRUE, 5=MSG_CARPLAY_CAPBILITY_UPDATE_FALSE
   - **6=MSG_GET_CAPBILITY_TIMEOUT（10秒超时）**, 7=IAP2_SESSION_DESTORY, 8=MSG_IAP2_AUTH_SUCCESS
3. **区分超时和认证失败**：`processMessage: 6`（超时）和 `processMessage: 3`（IAP2认证失败）共用同一处理路径，都报告 `IAP_AUTHENTICATION_FAILED`，需用消息编号区分
4. **检查 iPodLib Setup_Task 错误**：`Setup_Task: setup task receive error` 是控制会话协商失败的 native 层标志
5. **验证 iPhone 通知到达**：搜索 `WirelessCarPlayAvailable`、`onWirelessCarPlayUpdate`、`onCarPlayCapbilityUpdate` 确认 iPhone 是否回复

### 关键代码逻辑

| 代码位置 | 逻辑 |
|----------|------|
| `CarPlayWiFiCapUpdate.java` L42 | `CARLAY_GET_CAPABILITY_TIME_OUT = 10 * 1000`（10秒超时） |
| `CarPlayWiFiCapUpdate.java` L161-162 | 超时计时器在 `IdleState` 收到 `MSG_GET_CAPBILITY` 时启动 |
| `CarPlayWiFiCapUpdate.java` L681-687 | `iap2AuthResult(resultCode)`: resultCode==0 时**不触发任何操作**（设计如此），仅 resultCode!=0 时发送 MSG_IAP2_AUTH_FAILED |
| `CarPlayWiFiCapUpdate.java` L349-351 | `MSG_IAP2_AUTH_SUCCESS`: 仅标记 HANDLED，不做任何状态转换 |
| `CarPlayWiFiCapUpdate.java` L352-358 | `MSG_GET_CAPBILITY_TIMEOUT` 和 `MSG_IAP2_AUTH_FAILED` 共用同一 case 分支 |
| `CarPlayWiFiCapUpdate.java` L716-719 | 成功路径需要 `onCarPlayCapbilityUpdate(true)` → 由 iPhone 通过 IAP2 通知触发 |

### 常见问题模式

| 模式 | 特征 | 根因方向 |
|------|------|----------|
| `resultCode=0` + 超时 | IAP2 层认证成功但 WirelessCarPlayUpdate 从未到达 | iPodLib 控制会话协商失败，iPhone 端不响应 |
| `resultCode!=0` | IAP2 层认证本身失败 | MFi 芯片异常、BT 传输错误、iPhone 拒绝认证 |
| `RFCOMM_FAILD` (reason:1) | BT RFCOMM 连接失败 | 蓝牙连接异常、设备超出范围 |
| `Setup_Task receive error` | iPodLib 的 setup 任务收到错误 | 控制会话协商失败，可能与 EAP 配置或 iPhone 状态有关 |
| `eap info not set` | EAP 信息未配置 | `Iap.cpp` 中非阻塞告警，不影响会话创建，但可能影响控制会话协商 |
| `unRegisterIapCallback: exit:: 1` | 回调注销失败 | 会话异常状态的伴随现象，非独立根因 |
| `handleNotifyPlaybackListUpdate: not available` | 唯一收到的 iPhone 通知 | 表示 IAP2 Session 部分建立但控制会话不完整 |

### 多用户切换影响排查

车载 Android 多用户系统中，用户切换会导致 CarPlay 相关进程被 kill 和重建：

1. **确认 kill 时间与 Bug 时间的关系**：
   - 搜索 `am_kill.*carplay`（logcat_events.txt）获取所有 CarPlay 进程 kill 事件
   - 搜索 `am_switch_user`（logcat_events.txt）获取用户切换事件
   - 搜索 `am_proc_start.*carplay`（logcat_events.txt）获取进程重启事件
   - **如果 kill 发生在 Bug 时间之外且重启后问题依旧，则 kill 不是根因**

2. **检查跨用户一致性**：
   - 对比不同用户下的失败模式是否相同
   - 如果所有用户下都出现相同错误，则问题与用户上下文无关

3. **注意事项**：
   - `com.ts.carplay` 和 `com.panasonic.automotive.connectivity.carplayservice` 是两个独立进程，需分别追踪
   - 检查 `Permission Denial: USER_SWITCHED` — 如果 CarPlay 缺少 `MANAGE_USERS` 权限，无法接收用户切换广播
   - 检查用户切换时 `carplayservice` 是否被完整 kill（对比不同切换，确认是否存在进程残留）
   - IapHalService（通常为低 PID 的系统进程）**不随用户切换重启**，持续运行

### 回调链完整性验证（CarPlay 无线能力专用）

正常的无线 CarPlay 能力回调链：
```
iPodLib (native) 
  → IapNotifyTypeWCPAvailable 通知
    → IapHalService.iapNotificationThread 处理
      → IapController.onDeviceNotification (Java)
        → IapAdapter.onWirelessCarPlayUpdate
          → CarPlayManager.onWirelessCarPlayUpdate
            → CarPlayIapListener.onWirelessCarPlayUpdate
              → CarPlayConnect.onCarPlayCapbilityUpdate(flag)
                → CarPlayWiFiCapUpdate.onCarPlayCapbilityUpdate(flag)
                  → MSG_CARPLAY_CAPBILITY_UPDATE_TRUE/FALSE
```

验证方法：从底层到顶层逐层搜索关键词，确认断裂点：
- `WirelessCarPlayAvailable` → native 层是否收到
- `onWirelessCarPlayUpdate` → Java IPC 是否传递
- `onCarPlayCapbilityUpdate` → 业务逻辑是否处理
- `wirelessCapabilityUpdate flag:true/false` → 最终结果

## 参考：常用日志搜索关键词

以下为常见场景的搜索关键词参考，实际分析时应根据具体问题扩展：

| 场景 | 关键词示例 |
|------|-----------|
| Activity生命周期 | `wm_create_activity`, `wm_finish_activity`, `wm_destroy_activity`, `wm_on_stop_called` |
| Task管理 | `wm_task_created`, `wm_task_to_front`, `wm_task_removed`, `wm_focused_root_task` |
| 输入事件 | `input_interaction`, `input_focus` |
| CarPlay画面 | `changeVideoFocus`, `requestVideoFocus`, `onRequestVideoFocusChanged`, `setSurface`, `carPlayShow`, `carPlayHide`, `carPlaySaveSurface`, `accessoryScreenChange`, `onCarPlayDisplayStatusChanged` |
| Screen资源 | `ScreenResourceManager`, `acquireResource`, `releaseScreenResource`, `screenResourceChanged`, `InCarPlay`, `InBorrowUser`, `HU_HIGH_SCREEN_START`, `SCREEN_CHANGED_TO_CARPLAY`, `IPHONE_RELEASE_RESOURCE` |
| Surface 竞态 | `surfaceCreated`, `surfaceDestroyed`, `native_setSurface`, `jsurface is NULL`, `setSurface.*show`, `setSurface.*hide` |
| Codec/视频管线 | `AMediaCodec_stop`, `AMediaCodec_releaseOutputBuffer`, `AMediaCodec_queueInputBuffer`, `doOutputBuffer`, `doInput`, `configureCodec`, `createMediaCodec`, `screenStop`, `codecState`, `cannot start Codec`, `BufferQueueProducer` |
| 窗口/弹窗验证 | `addWindow`, `removeWindow`, `Changing focus`, `Input focus has changed`, `findFocusedWindow`, `Set focused app`, `layoutWindowLw`, `TYPE_APPLICATION_OVERLAY`, `TYPE_SYSTEM_ALERT` |
| IAP Session 生命周期 | `onCreateIapSession`, `onConnectIapSession`, `onDisconnectIapSession`, `onDestroyIapSession`, `onIapNotification session status` |
| IAP 通知线程 | `iapNotificationThread`, `notifyIap2Destory`, `notifyInfoCallback`, `IapCallbackHandler` |
| iPodLib 状态 | `iPod_DeInit`, `iPod_Create`, `iPod_Destroy`, `Setup_Task`, `NotifyCB` |
| Transport 资源 | `transport_open`, `transport_close`, `transport_poll_ex`, `EBUSY`, `errno` |
| 连接状态机 | `IdleState`, `SessionConnectingState`, `SessionEstablishedState`, `DisconnectState`, `IapAuthingState` |
| 音频焦点 | `requestAudioFocus`, `abandonAudioFocus`, `onAudioFocusChange`, `AUDIOFOCUS_GAIN`, `AUDIOFOCUS_LOSS`, `MediaFocusControl`, `CarAudioFocus`, `isMediaFocus` |
| 音频资源管理 | `audioResourceRequest`, `audioResourceAbandon`, `accessoryAudioChange`, `changeSourceByType`, `requestAudioFocusDirectly`, `InTake`, `InCarPlayAudio`, `IdleState` |
| HID 定时器 | `startHidTimer`, `stopHidTimer`, `sendPlayIfNeed`, `sendPlayEvent`, `sendRemoteMediaPlayback`, `HID_WAIT_TIME` |
| CarPlay 无线能力查询 | `CarPlayWiFiCapUpdate`, `IapAuthForWirelessCapabilityState`, `wirelessCapabilityUpdate`, `IAP_AUTHENTICATION_FAILED`, `MSG_GET_CAPBILITY_TIMEOUT` |
| IAP2 认证结果 | `iap2AuthResult`, `resultCode`, `iapSessionArbitrate`, `registerIapCallback`, `unRegisterIapCallback` |
| iPodLib 原生层 | `Setup_Task.*receive error`, `eap info not set`, `handleNotifyPlaybackListUpdate`, `mficp_get_signature`, `mficp_get_device_version` |
| MFi 芯片 | `mfichip_i2c`, `check_mfi_chip`, `getMFiDeviceVersion`, `mficp_i2c_open`, `mficp_i2c_close`, `athen_ctrl_status` |
| iPhone 无线能力通知 | `WirelessCarPlayAvailable`, `IapNotifyTypeWCPAvailable`, `onWirelessCarPlayUpdate`, `onCarPlayCapbilityUpdate` |
| 多用户切换 | `am_switch_user`, `am_kill`, `am_proc_start`, `stop user.*due to finish user`, `USER_SWITCHED`, `Permission Denial.*MANAGE_USERS` |
| CarPlay 进程状态 | `com.ts.carplay`, `com.panasonic.automotive.connectivity.carplayservice`, `PlatformCarPlayServiceManager onServiceDied`, `CarPlayService` |
| BT RFCOMM | `CarPlayBtTransport`, `BluetoothSerialPort`, `connectToServer`, `ConnectThread connect error`, `UUID_IAP` |

## Apple 文档联想分析

在分析 CarPlay 相关 Bug 时，必须结合苹果官方文档进行联想分析，判断实现是否符合规范要求、是否存在规范理解偏差导致的问题。

### 规范文件索引

| 规则文件 | 覆盖领域 | 典型 Bug 场景 |
|----------|---------|-------------|
| `carplay-apple-spec.mdc` | 总览、资源仲裁、连接生命周期、Bug 检查清单 | AppState 仲裁错误、资源 Take/Borrow 混淆、重连状态恢复异常 |
| `carplay-spec-connection.mdc` | USB/Wi-Fi 连接、会话建立/终止、协议、iAP2 消息 | 会话超时、USB Role Switch 失败、CarPlayStartSession 参数错误、RFCOMM 连接异常 |
| `carplay-spec-audio.mdc` | 音频流类型、混合、音量、Ducking、空间音频 | 音频流丢失、Ducking 不响应、格式切换超时、音量控制异常 |
| `carplay-spec-display-input.mdc` | 显示、分辨率、HID、触摸、UI 模式 | 视频流异常、分辨率/缩放因子错误、HID 事件丢失、View Area 配置问题 |
| `carplay-spec-features.mdc` | Siri、导航、电话、位置、EV、车辆状态 | Siri 按钮阈值、导航仲裁、电话先来先得违规、位置数据格式错误 |

### Communication Plugin 集成参考

源码工程中包含 Apple CarPlay Communication Plug-in 集成指南，位于：
- `malk_carplaystack/CommunicationPlugin/AppleCarPlay_CommunicationPlugIn_IntegrationGuide.txt`

该文档包含以下关键参考内容：
- **会话生命周期**：AirPlayReceiverServer/Session 委托回调链（sessionCreated → initialize → started → finalize）
- **音视频同步**：NTP 时钟同步 + 音频时间戳 {sampleTime, hostTime}
- **会话断开检测**：NCM 网络接口状态监控（IFF_RUNNING）、无数据超时（有流 9/10 秒、无流 30 秒）
- **无线 CarPlay iAP2 隧道**：会话 started 后才能发送命令，通过 AirPlayReceiverSessionSendiAPMessage 传输
- **AudioConverter**：无线 CarPlay 需要配件端解码（raw AAC-LC、Opus/AAC-ELD）
- **ScreenStream**：View Area 变化时流本身不中断，内容区域通过 ScreenStreamSetViewArea() 通知
- **MFi 认证 IC**：I2C 通信需重试机制，芯片 250ms 内进入休眠，不使用 clock stretching
- **CarPlayControlClient**（已弃用但仍在使用）：创建顺序必须为 ServerCreate → ClientCreateWithServer → ServerStart → ClientStart

### 联想分析步骤

在完成常规分析流程（第1-7步）后，增加以下联想分析：

#### 步骤 A：识别问题涉及的苹果规范领域

根据 Bug 现象和涉及的模块，确定需要参照的苹果规范子文件：

| Bug 现象 | 应参照的规范 |
|---------|-----------|
| 连接失败 / 断开 / 重连异常 | `carplay-spec-connection.mdc` — 时间要求（会话 ≤3s、连接请求 ≤2s）、终止条件、重连流程 |
| 音频无声 / 音量异常 / Ducking 问题 | `carplay-spec-audio.mdc` — 流类型、混合规则、Ducking 75ms 响应、音量优先级 |
| 画面不显示 / 分辨率错误 / 触摸失效 | `carplay-spec-display-input.mdc` — 分辨率/缩放因子、View Area、触摸坐标映射 |
| Siri 不响应 / 语音仲裁 / 电话冲突 | `carplay-spec-features.mdc` — Siri 按钮 ≤600ms、AppState 仲裁规则 |
| 音频资源竞争 / Take/Borrow 冲突 | `carplay-apple-spec.mdc` — Resource Ownership、BorrowId、AppState 仲裁 |
| Native 层 crash / session 生命周期 | `carplay-spec-connection.mdc` + Communication Plugin 集成指南 |

#### 步骤 B：对照规范验证实现行为

1. **提取规范要求**：从对应规范文件中找出与 Bug 直接相关的 must/should/must not 条目
2. **对比实际行为**：将日志中观察到的行为与规范要求逐条对比
3. **标注偏差**：记录所有不符合规范的行为，区分：
   - **违反 must/shall**：强制要求未满足 → 确认为 Bug
   - **违反 should**：建议未遵循 → 可能是 Bug 根因的间接因素
   - **超出规范**：规范未覆盖的实现细节 → 需结合代码逻辑判断

#### 步骤 C：联想规范中的隐含约束

某些 Bug 的根因不是直接违反规范，而是忽略了规范的隐含约束：

| 隐含约束 | 来源 | 常见违反场景 |
|---------|------|-----------|
| 会话启动前不得发送命令 | Integration Guide: `AirPlayReceiverSessionStarted_f` | 过早发送 iAP 消息导致未定义行为 |
| 无线 CarPlay 需维持蓝牙直到收到 disableBluetooth | Integration Guide: iAP2 over wireless | 过早断开蓝牙导致 iAP 中断 |
| AudioStream 启动后不会重新配置 | Integration Guide: AudioStream | 假设运行中可变更格式导致异常 |
| 格式切换不可预测 | Spatial Audio Guide | 假设固定格式导致解码错误 |
| duckAudio/unduckAudio 必须成对且仅响应显式命令 | Audio Spec | setup/teardown 触发 duck 状态残留 |
| NCM 接口无 IFF_RUNNING 即拆会话 | Integration Guide: 断开检测 | Wi-Fi 闪断导致会话意外终止 |
| MFi 芯片 250ms 休眠需重试 | Integration Guide: MFiServerPlatform | I2C 通信无重试导致认证失败 |
| 资源仲裁 Take vs Borrow 语义 | Apple Spec | Borrow 后未归还导致资源泄漏 |
| Main Audio + Main Buffered Audio 必须同时 duck | Audio Spec Ducking 规则 | 仅 duck 其中一个流导致音量不一致 |
| USB 断开后 500ms 内结束会话 | Connection Spec 3.2.4 | 会话清理超时导致资源残留 |
| 首次连接立即显示 CarPlay，不切换音频源 | Design Guidelines | 首次连接自动播放音频违反规范 |
| 重连时根据用户是否操作原生决定是否显示 CarPlay | Design Guidelines | 重连一律显示 CarPlay 或一律不显示 |
| 语音识别期间所有 accessory 音频必须静音 | Apple Spec 3.3.3 | Siri 期间仍播放原生音频 |
| 通话先来先得，导航后来者赢 | Apple Spec 3.3.3 | 仲裁规则实现反转 |
| 无数据超时：有流 9/10 秒、无流 30 秒 | Integration Guide: 断开检测 | 超时值配置错误导致过早/过晚断开 |
| CarPlayControlClient 创建顺序 | Integration Guide: CarPlayControlClient | 初始化顺序错误导致连接失败 |

### 报告格式扩展

在最终报告的【总结】表格后，如果分析过程中发现了苹果规范相关性，追加以下段落：

```
### 【Apple 规范参照】
- **相关规范条目**：{规范文件} §{章节号} — {规范要求原文概要}
- **实际行为**：{日志中观察到的行为}
- **符合性判定**：符合 / 不符合 / 规范未明确覆盖
- **联想结论**：{基于规范的分析结论，如"实现未遵循 must 要求"或"规范允许但实现选择了不利路径"}
```
