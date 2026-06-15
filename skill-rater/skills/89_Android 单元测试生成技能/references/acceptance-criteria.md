# 测试验收标准与覆盖率要求

## 验收标准

### 基础标准（所有层级）

| # | 标准 | 说明 |
|---|------|------|
| A1 | 所有测试通过 | `./gradlew test` 零失败 |
| A2 | 测试可独立运行 | 不依赖其他测试的执行顺序或状态 |
| A3 | 无 Flaky 测试 | 连续运行 3 次结果一致 |
| A4 | 命名规范 | `方法_场景_期望` 命名约定 |
| A5 | AAA 结构 | 清晰划分 Arrange / Act / Assert |
| A6 | 无硬编码环境依赖 | 不依赖特定文件路径、网络地址或系统时间 |
| A7 | 测试数据隔离 | 使用 @Before/@After 确保独立 |

### 质量标准

| # | 标准 | 说明 |
|---|------|------|
| Q1 | 边界值测试 | 空值、空集合、极大/极小值 |
| Q2 | 异常路径测试 | 网络异常、格式错误、权限不足 |
| Q3 | 断言精确 | 用 assertEquals，避免仅用 assertNotNull |
| Q4 | Mock 适度 | 只 mock 外部依赖，不 mock 被测类自身方法 |
| Q5 | 测试粒度 | 每个方法只验证一个行为 |
| Q6 | 无逻辑泄漏 | 测试中不含 if/for/while 业务逻辑 |

## 覆盖率要求

| 指标 | 最低要求 | 推荐目标 |
|------|---------|---------|
| 行覆盖率 (Line) | ≥ 70% | ≥ 85% |
| 分支覆盖率 (Branch) | ≥ 60% | ≥ 80% |
| 方法覆盖率 (Method) | ≥ 80% | ≥ 90% |
| 关键路径覆盖 | 100% | 100% |

关键路径: 核心业务逻辑、数据转换、错误处理分支、边界条件。

## 覆盖率不达标处理

1. 定位未覆盖的代码行和分支
2. 分析原因（遗漏场景 / 难测依赖 / 死代码）
3. 遗漏场景 → 补充测试
4. 难测代码 → 重构提高可测试性或引入 Mock
5. 死代码 → 建议删除

## 验证清单

```
- [ ] 所有测试通过（零失败）
- [ ] 行覆盖率 ≥ 70%
- [ ] 分支覆盖率 ≥ 60%
- [ ] 关键路径 100% 覆盖
- [ ] 边界值和异常场景已覆盖
- [ ] 测试间无状态依赖
- [ ] 无 Flaky 测试
- [ ] 命名和结构规范
- [ ] Mock 使用合理
- [ ] 覆盖率报告已生成
```

## 执行命令

```bash
# L1: 本地测试
./gradlew testDebugUnitTest

# L2: Instrumented 测试
./gradlew connectedDebugAndroidTest

# 特定测试类
./gradlew testDebugUnitTest --tests "com.example.XxxTest"

# 特定方法
./gradlew testDebugUnitTest --tests "com.example.XxxTest.method_scenario_expected"

# 覆盖率报告
./gradlew jacocoTestReport
# 输出: build/reports/jacoco/jacocoTestReport/html/index.html
```
