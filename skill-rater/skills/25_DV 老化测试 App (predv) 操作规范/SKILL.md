---
name: aging-test-app
description: "VinFast DV 老化测试 App 操作。Use when: AgingTestApp 编译、老化测试部署、老化日志分析、aging test 结果判定"
argument-hint: "老化测试需求描述"
---

# DV 老化测试 App (predv) 操作规范

## 一、App 基本信息

| 项目 | 信息 |
|------|------|
| 包名 | `ts.car.bamboov.predv` |
| 代码路径 | `/media/<USER>/13/VinFastWholeSource/SOCFullSource/vinfast_dl/lagvm/LINUX/android/vendor/ts/proprietary/AgingTestApp` |
| 主 Service | `DVTestService` |
| 默认测试时长 | 120 分钟（2 小时） |
| Debug 测试时长 | 15 分钟（通过 debug 命令切换） |
| 结果存储 | SharedPreference (`reboot_monitor.xml`) + Settings.Global (`aging_test_result`) |
| 老化标志位 prop | `persist.vendor.aging.result`（1=PASS, 2=FAIL, 0=未执行） |

## 二、关键日志模式

### 2.1 测试结果日志

```
TestTask TestResults:Test PASS       ← 老化测试通过
TestTask TestResults:Test NG, Reason: system reboot or app reboot   ← 老化测试失败
```

### 2.2 App 生命周期日志

```
DVTestService.java onCreate()                    ← Service 创建
TestTask Normal mode, duration=120min            ← 正常模式启动
TestTask Debug mode, duration=15min              ← Debug 模式启动
TestTask frist launch                            ← 首次启动（无历史结果）
mExitClickCount=1                                ← 用户点击退出
killProcess                                      ← 进程被杀
DVTestService.onDestroy                          ← Service 销毁
```

### 2.3 App 启动方式日志

```
# 方式一：通过 USB MEDIA_MOUNTED 广播自启动（正常路径）
MEDIA_MOUNTED /storage/emulated/XX              ← USB 挂载广播
UsbReceiver                                      ← 广播接收器触发启动

# 方式二：通过 LAUNCHER 手动启动
act=MAIN cat=LAUNCHER from uid 2000              ← 用户手动启动
```

### 2.4 系统限制相关日志

```
CAR.PACKAGE: ts.car.bamboov.predv not installed from permitted sources   ← 非允许来源
PACKAGE_ADDED dat=package:ts.car.bamboov.predv                          ← APK 安装完成
CAR.PACKAGE: Package ts.car.bamboov.predv added in denylist             ← 被加入拒绝列表
force-stop ts.car.bamboov.predv                                         ← 被系统强制停止
```

## 三、老化测试判定逻辑

### 3.1 测试流程

测试人员操作流程（参考飞书 wiki：U9LBwQTQqiv469kcQFBcV1ZwnZc）：
1. Factory Reset 设备
2. 安装老化 APK（通过 adb install 或 USB 自启动）
3. 启动 app → app 记录初始时间戳，开始计时
4. 等待 ≥ 2 小时（或 debug 模式 ≥ 15 分钟）
5. 检查结果：`adb shell settings get global aging_test_result`

### 3.2 核心判定变量（源码级）

App 启动时依次检查两个关键变量：

```
isSystemReboot = checkSystemReboot()
  → 基于 Settings.Global.BOOT_COUNT（boot_count 方案，已修复）
  → lastBootCount >= 0 && currentBootCount != lastBootCount
  → boot_count 只在真正系统重启时递增，不受时间跳变影响

isAppRestart = checkAppRestart()
  → lastAppLaunchTime < System.currentTimeMillis() - 5000（5秒容差）
  → 注意：如果 isSystemReboot=true，则 isAppRestart 也被设为 true
```

> **历史版本（已弃用）**：旧版使用 `currentSystemBootTime = System.currentTimeMillis() - SystemClock.elapsedRealtime()` 做严格 `>` 比较，因毫秒级时间波动（159ms~1221ms）导致大量误判。已通过 Gerrit Change 569208 修复。

### 3.3 判定时序

```
App 启动
  │
  ├─ 读取 SharedPreference 中的 lastAppLaunchTime 和 lastSystemBootTime
  │   ├─ 如果 == 0 → 首次启动，记录当前时间
  │   └─ 如果 != 0 → 检查 isSystemReboot 和 isAppRestart
  │
  ├─ 检查上次测试结果 testIsPass
  │   ├─ "PASS" → 输出 "Test PASS"（历史结果回放）
  │   └─ "NG" → 输出 "Test NG"（历史结果回放）
  │
  └─ 启动 checkTask（每 1 分钟执行一次）
      │
      ├─ isSystemReboot || isAppRestart == true
      │   → 输出 "Test NG"
      │   → 清零时间戳（lastAppLaunchTime=0, lastSystemBootTime=0）
      │   → 写入 TEST_IS_PASS="NG"
      │
      ├─ 运行时间 >= duration（2小时）
      │   → 输出 "Test PASS"
      │   → 清零时间戳
      │   → 写入 TEST_IS_PASS="PASS"
      │
      └─ 否则 → 继续等待下一个 1 分钟
```

### 3.4 PASS 条件

1. App 首次启动时记录系统启动时间和 app 启动时间到 SharedPreference
2. App 连续运行 ≥ 2 小时（或 debug 模式 ≥ 15 分钟）
3. 运行期间 `isSystemReboot=false` 且 `isAppRestart=false`
4. 测试完成后清零时间戳，将结果存入 SharedPreference 和 Settings.Global

### 3.5 FAIL (NG) 条件

- 系统在测试期间重启 → `isSystemReboot=true, isAppRestart=true` → NG
- App 在测试期间被杀/重启（未伴随系统重启） → `isSystemReboot=false, isAppRestart=true` → NG
- 首次运行未满 2 小时就被中断 → 时间戳不会清零，下次启动时判定为重启 → NG

### 3.6 重要细节

- **NG 输出时机**：App 启动后约 1 分钟（第一次 checkTask 执行时）检测到异常并输出 NG
- **只要老化 app 再次运行 ≥ 2 小时以上且无中断，就会输出 PASS 并覆盖之前的 NG 结果**
- **首次启动时间和 app 启动时间在 app 首次运行时写入，完成 2 小时后清零（写入 0）**
- **如果未运行满 2 小时就被中断，时间戳不会清零，下次启动时判定为重启 → NG**

### 3.7 FAIL 分析重点

> ⚠️ **分析老化标志位 FAIL 时，必须确认以下内容：**

1. **`isSystemReboot` 和 `isAppRestart` 的值**：确定失败原因是系统重启还是 app 重启
2. **`Test PASS` 和 `Test NG` 关键词**：定位最终测试结果
3. **时间线分析**：从 app onCreate 到 Test NG/PASS 的完整时序
4. **多次启动的连续性**：对比各启动序列中 `isSystemReboot`/`isAppRestart` 的变化模式

## 四、已知失败模式

### 模式 1：MEDIA_MOUNTED 广播时序竞争

**特征**：App 安装(dex2oat)与 MEDIA_MOUNTED 广播同时发生
- MEDIA_MOUNTED 先于 PACKAGE_ADDED 到达
- UsbReceiver 未注册，广播未送达
- App 无法自启动

**判断关键词**：
```
MEDIA_MOUNTED /storage/emulated/XX
dex2oat32 --compilation-reason=install       ← 时间戳晚于 MEDIA_MOUNTED
PACKAGE_ADDED dat=package:ts.car.bamboov.predv
```

### 模式 2：CAR.PACKAGE Denylist 限制

**特征**：App 被 CarService 加入拒绝列表后自动 force-stop
- 安装来源非 permitted sources
- App 被立即 force-stop

**判断关键词**：
```
CAR.PACKAGE: ts.car.bamboov.predv not installed from permitted sources
CAR.PACKAGE: Package ts.car.bamboov.predv added in denylist
force-stop ts.car.bamboov.predv
```

### 模式 3：系统在老化期间重启

**特征**：老化 app 运行中系统异常重启（STR 失败、watchdog 等）
- 下次启动时 app 检测到系统启动时间变化
- 输出 NG

**判断方法**：对比 boot 序列时间线，确认测试期间是否有意外重启

### 模式 4：App 被 LMK 或用户手动终止

**特征**：App 进程在测试期间被杀
- `mExitClickCount` / `killProcess` / `onDestroy` 日志
- 或 LMK 日志中显示 predv 进程被杀

### 模式 5：标志位读取失败

**特征**：老化测试实际通过但读取结果时失败
- User 版本下无法通过 `adb shell cat` 读取 SharedPreference（Permission denied）
- 应改用 `adb shell settings get global aging_test_result` 读取

### 模式 6：currentSystemBootTime 毫秒级波动导致 isSystemReboot 误判（已修复）

**特征**：系统未实际重启，但 `isSystemReboot=true` 且 `isAppRestart=true`
- 多个启动序列（不同 log_X_）共享 SharedPreferences
- `currentSystemBootTime = System.currentTimeMillis() - SystemClock.elapsedRealtime()` 是非原子操作
- 不同启动序列在几乎同一时间计算，结果可能相差 100ms~1200ms
- 旧代码使用严格 `>` 比较，毫秒级正向差异即判定为重启

**判断关键词**：
```
checkSystemReboot lastSystemBootTime XXXX currentSystemBootTime YYYY
  → 如果 YYYY - XXXX < 5000ms，则属于此模式（误判，非真实重启）
```

**修复方案**：使用 `Settings.Global.BOOT_COUNT` 替代时间戳比较（Gerrit Change 569208）
- `boot_count` 由内核维护，只在真正的系统重启时递增
- 完全消除时间波动导致的误判

## 五、外部 check 脚本（checklog0314.bat）

### 5.1 脚本功能

测试人员在每次冷启动后一段时间手动执行 `checklog0314.bat`（或 `checklog.bat`）：
- 通过 `adb shell settings get global test_is_pass` 读取结果
- PASS → 仅输出结果
- NG → 输出结果并自动执行 `adb bugreport` 收集日志

### 5.2 脚本执行时机的 logcat 可观测性

| 操作 | logcat 是否有记录 | 推断方法 |
|------|-----------------|---------|
| `settings get global test_is_pass` | **无** | SettingsProvider 对 get 操作不打日志 |
| `adb bugreport`（仅 NG 时） | **有** | `init: starting service 'dumpstatez'` 时间戳 |

**推断规则**：
- NG 情况：dumpstate 启动时间 - 几秒 ≈ 脚本执行时间
- PASS 情况：无法从 logcat 推断

### 5.3 分析经验

在分析老化标志位 FAIL 的日志时，搜索 `dumpstatez` 可以定位 check 脚本的执行时间点：
```
grep "starting service 'dumpstatez'" log_X_*.txt
```
对比 aging app 的 Test NG 输出时间，可以确认测试人员在设备启动后多久执行了 check 脚本。

## 六、日志分析流程

### 6.1 日志文件命名规则

日志文件命名为 `log_X_Y-timestamp.txt.gz`：
- **X = 第 X 次启动**（系统启动序号）
- Y = 该次启动内的文件序号
- 后缀为该文件的开始时间

> ⚠️ **重要纠正**：`log_8_*` 表示"第 8 次启动"。在多次启动的日志中，序号代表系统的第几次 boot，用于追踪系统重启历史。

### 6.2 分析步骤

分析老化标志位 FAIL 时，按以下步骤执行：

1. **确认日志结构**：列出所有启动序列（log_X_*）和时间范围
2. **搜索 isSystemReboot 和 isAppRestart**：`grep "isSystemReboot\|isAppRestart"` — 这是判定 PASS/NG 的核心
3. **搜索测试结果关键词**：`grep "Test PASS\|Test NG\|TestResults"` — 定位最终结果
4. **分析每个启动序列的判定流程**：
   - `isSystemReboot=false, isAppRestart=false` → 正常运行，等待 2 小时
   - `isSystemReboot=true, isAppRestart=true` → 检测到上一次被系统重启中断 → NG
   - `isSystemReboot=false, isAppRestart=true` → App 被单独重启（LMK/用户杀死） → NG
5. **对比各启动序列的 NG 时间**：NG 通常在 app 启动后约 1 分钟出现（第一次 checkTask）
6. **定位 app 安装和启动方式**：`PACKAGE_ADDED.*predv`、`UsbReceiver`、`LAUNCHER`
7. **检查系统重启原因**：对比启动序列时间线，确认 STR 失败 / watchdog / 意外掉电等
8. **检查 MEDIA_MOUNTED 时序**：确认广播是否在 app 安装前发出
9. **check 逻辑时间线分析**：aging app 的 check 逻辑分两阶段：
   - **启动时**（onCreate → initView）：立即读取 SharedPreferences 并执行 checkSystemReboot/checkAppRestart
   - **定时 checkTask**（每 60 秒）：在 handler.postDelayed 中检查 isSystemReboot/isAppRestart，判定 NG 或 PASS
10. **check 脚本执行时机**：搜索 `starting service 'dumpstatez'` 定位 checklog0314.bat 的执行时间（仅 NG 时有效）
11. **误判识别**：如果 `checkSystemReboot` 日志中 `currentSBT - lastSBT` < 5000ms 且 isSystemReboot=true，属于时间波动误判（模式 6），非真实重启

## 七、编译与部署

### 7.1 编译环境

- Java 11（AGP 7.0.2 要求）：`export JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64`
- Gradle 7.0.2（需配置国内镜像）
- 如果 Gradle 下载失败，修改 `gradle-wrapper.properties` 使用镜像：
  `distributionUrl=https\://mirrors.cloud.tencent.com/gradle/gradle-7.0.2-all.zip`

### 7.2 编译命令

```bash
cd /media/<USER>/13/.../AgingTestApp
export JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
./gradlew assembleRelease    # Release 版本
./gradlew assembleDebug      # Debug 版本
```

### 7.3 部署与测试流程

```
1. Factory Reset 设备
2. adb install app-release.apk
3. 启动 app
4. 重启设备
5. （可选）发送 debug 命令切换为 15 分钟模式
6. 等待测试完成
7. 使用 check 脚本检查结果：
   adb shell settings get global aging_test_result
```

### 7.4 结果判定

| Settings.Global 值 | 含义 |
|--------------------|------|
| `1` | PASS（老化测试通过） |
| `2` | FAIL/NG（老化测试失败） |
| `null` / `0` | 未执行或未完成 |

## 八、注意事项

1. **SELinux 限制**：不能通过 `setprop` 设置标志位（在 user 版本会被 SELinux 阻止），应使用 `Settings.Global`
2. **User 版本限制**：不能通过 `adb shell cat` 读取 SharedPreference，应通过 `Settings.Global` 读取
3. **多次启动环境**：VinFast BambooV 老化测试涉及多次冷启动（如第 3-21 次启动），每次启动 aging app 自动运行。多个启动序列共享 SharedPreferences，不同启动序列计算的 `currentSystemBootTime` 可能存在毫秒级差异，需在分析中注意区分
4. **MEDIA_MOUNTED 时序**：确保 app 安装完成后再触发 USB 挂载，否则广播接收器无法注册
5. **Denylist 问题**：如果 app 被 CAR.PACKAGE 加入 denylist，需要在 CarService 配置中添加白名单
