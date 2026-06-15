---
name: android-ut-test
description: >-
  为 Android 项目自动生成单元测试代码。涵盖 JUnit/Mockito/MockK/Robolectric/Espresso。
  触发词: 单元测试、UT、unit test、写测试、测试用例、test case、Android 测试、
  JUnit、Mockito、Robolectric、Espresso、测试覆盖率、code coverage、androidTest、
  帮我加个测试、这个类需要测试、补充测试、重构测试。
  Do NOT use for: 纯 Web/iOS/Flutter 测试、只讨论测试理论不生成代码、只执行已有测试。
  Make sure to use this skill whenever someone mentions writing tests for Android code,
  even if they just say "加个测试" or "这个方法需要测试".
---

# Android 单元测试生成技能

## Quick Reference

| 用户意图 | 执行路径 |
|---------|----------|
| "加个测试" / "简单测一下" | → 快速模式（Step 2→3→4） |
| "完整测试" / "覆盖率" | → 完整模式（Step 1→2→3→4→5） |
| "重构测试" / "测试不过" | → 先读现有测试 → 修复/重写 |
| 指定框架（"用 MockK"） | → 跳过 Step 1，直接按指定框架 |

## Do NOT Load

不要在以下场景加载此 skill：
- 用户只是讨论测试理论/策略
- 纯前端 Web/iOS/Flutter 测试
- 只是运行已有测试（直接执行 gradlew 命令）

---

## 核心思维框架

> 先分析后生成，一次到位。不要边写边发现问题再返工。

生成测试前必须回答：
1. **被测类的所有外部依赖是什么？** → 制定 Mock/Fake 策略
2. **哪些分支在纯 JVM 下不可达？** → 标注后跳过
3. **getter/setter 精确签名是什么？** → grep 确认，不从 getter 推断

## 关键约束（NEVER 清单）

| # | ❌ NEVER | ✅ INSTEAD | Why |
|---|---------|-----------|-----|
| 1 | mock 被测类自身方法 | 只 mock 外部依赖 | mock 自身让测试永远通过 |
| 2 | 测试内含 if/for 逻辑 | 线性 AAA 结构 | 测试有分支=测试本身需要测试 |
| 3 | 反射伪造不可达路径 | 只反射重置/注入状态 | 覆盖的是测试数据而非生产代码 |
| 4 | Thread.sleep() 等待 | CountDownLatch/awaitTermination | sleep 不可靠且浪费时间 |
| 5 | 从 getter 推断 setter 名 | grep 源码确认 | 不对称命名会导致编译失败 |
| 6 | 凑覆盖率 mock 结构性不可达分支 | 标注 dead branch 后跳过 | 伪造路径无实际质量价值 |
| 7 | 用 `--tests` 跑完直接生成报告 | 重跑全量再生成 | 定向执行覆盖 exec 数据 |

---

## 核心流程

### Step 1: 项目上下文扫描

```
1. build.gradle → 确定可用测试框架版本
2. src/test/ + src/androidTest/ → 匹配现有风格
3. TestRule/自定义 Runner → 复用项目约定
4. Java/Kotlin → 匹配代码风格
```

如果项目已有测试，**必须匹配现有风格**。

### Step 2: 确定测试层级

```
被测代码有 Android 依赖？
├─ 否 → L1 (test/, JVM, 极快)
└─ 是 → Robolectric 能模拟？
     ├─ 是 → L3 (test/, Robolectric, 中等)
     └─ 否 → 纯 JVM + mockito-inline + returnDefaultValues
              ├─ 能覆盖守卫分支 → L1
              └─ 必须真实 View 树 → L2 (androidTest/)
```

**决策关键**: 车载 SDK 项目 Robolectric 通常不可用（PackageParserException）→ 默认 L1 + mockito-inline。

### Step 3: 生成测试代码

**命名**: `被测方法_场景_期望结果`

**结构**: 严格 AAA（Arrange-Act-Assert），每个方法只验证一个行为。

**覆盖目标（按被测类型选择策略）**:

| 被测类型 | 必须覆盖 | 可放弃 |
|----------|---------|--------|
| 纯逻辑/工具类 | 所有分支 100% | 无 |
| 单例 Manager | null guard + switch-case + 异常 catch | UI 初始化内部细节 |
| View/Widget | init() + 回调 + Observer + Timer | 真实 inflate/measure/draw |
| AIDL Service | connect/disconnect + RemoteException | 真实 Binder IPC |
| Room/DB | Repository 逻辑 + 单例 | `*_Impl` 生成代码 |
| 状态机 | state × event 全组合 + default | 无 |

### Step 4: 执行与修复

```bash
./gradlew testDebugUnitTest --tests "完整包名.*"
```

失败 → 分析 → 修复 → 重跑，直到全绿。

### Step 5: 覆盖率检查

目标: 行覆盖率 ≥ 70%、分支覆盖率 (C1) ≥ 60%、关键路径 100%

```bash
./gradlew jacocoTestReport
# 报告: build/reports/jacoco/html/index.html
```

不达标时：**MANDATORY** — 加载 [`battle-tested-patterns.md`](references/battle-tested-patterns.md) 查找对应类型的覆盖模式。

---

## Mock 策略决策树

```
被测类依赖什么？
├─ 静态单例 (AdasApplication.getContext()) → MockedStatic + @BeforeClass
├─ 构造函数创建对象 (new Builder()) → MockedConstruction
├─ AIDL 接口 (Stub.asInterface) → MockedStatic + mock IBinder
├─ View/Context 链 → mock 整条链 when().thenReturn()
├─ final 字段 → 反射 Field.set()（对 mock 对象有效）
├─ 匿名内部类 → 反射获取实例 + 直接调用方法
└─ 异步 Executor → 真实 executor + shutdown + awaitTermination
```

---

## 快速模式 vs 完整模式

**快速模式**（"加个测试"/"简单测一下"）:
- 只生成 L1 测试
- 覆盖正常路径 + 1-2 个边界
- 不生成覆盖率报告

**完整模式**（"完整测试"/"覆盖率"/"C1"）:
- 完整层级分析 + Mock 策略制定
- 覆盖所有路径（正常/边界/异常/守卫/switch）
- 生成 JaCoCo 覆盖率报告
- 按验收标准逐项检查
- **MANDATORY** — 加载 [`battle-tested-patterns.md`](references/battle-tested-patterns.md)

---

## 参考文档（按需加载）

| 文件 | 用途 | 何时加载 |
|------|------|---------|
| [`references/templates.md`](references/templates.md) | 各框架代码模板 + Gradle 配置 | 需要生成特定框架测试时 |
| [`references/acceptance-criteria.md`](references/acceptance-criteria.md) | 验收标准 + 覆盖率要求 | 完整模式下验收检查时 |
| [`references/battle-tested-patterns.md`](references/battle-tested-patterns.md) | 实战模式库（Widget/Manager/DB/Common） | **MANDATORY**: 覆盖率不达标时 / 遇到 Mock 困难时 / 完整模式 |

> **Do NOT** 一次加载所有 references。快速模式通常无需加载任何参考文件。
> **MANDATORY** 标记的加载条件满足时必须加载，不要跳过。

---

## 自动 Mock 生成策略

扫描被测类时自动识别：
- 构造函数参数 / `@Inject` 字段 → 为每个接口/抽象类生成 mock
- 静态单例调用 → 记录需要 MockedStatic 的类
- `new Xxx()` 内部创建 → 判断是否需要 MockedConstruction
- final 字段 → 记录需要反射注入的位置

**原则**: 具体类优先 Fake，无 Fake 用 mock。`relaxed = true` 仅用于不需验证交互的辅助依赖。

---

## 覆盖率低时的诊断清单

遇到覆盖率不达标，按以下顺序排查：

1. **是否有结构性不可达分支？** → 标注后从目标中排除
2. **是否遗漏了 switch-case 的某些 case 值？** → 补充
3. **是否遗漏了 null guard 分支？** → 传 null 触发
4. **是否有未覆盖的 catch 块？** → doThrow 模拟
5. **是否有匿名内部类未被测试？** → 反射获取 + 直接调用
6. **是否有 `&&`/`||` 短路组合未补全？** → JaCoCo 按短路路径计分
7. **exec 数据是否被定向执行覆盖？** → 重跑全量