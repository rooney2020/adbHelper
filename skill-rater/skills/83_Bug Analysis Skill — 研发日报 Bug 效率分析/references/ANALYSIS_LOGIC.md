# 分析算法详解

本文档解释两个核心维度的算法。所有逻辑由 `web_server.py` 与 `dashboard_*.py` 通过 `shared_analyzer.py` 共享实现。

## 一、Bug 解决维度

### 1.1 飞书侧：Bug 解决工时

```
Bug解决工时 = Σ ( 工时(H) | 产出类型 ∈ FIX_TYPES )

FIX_TYPES = {"Bug解决(修正)", "Bug验证"}
```

详细产出类型映射在 `shared_config.py → TYPE_MAP`。

### 1.2 Jira 侧：解决 Bug 数

来自 `jira_resolved.json → resolved_events`，每条记录是一次「非 Resolved → Resolved」的状态变更：

```
解决Bug数 = COUNT(resolved_events)
```

注意：
- 同一 Bug 多次切换到 Resolved 会**重复计数**（这是有意为之，反映真实工作量）
- 状态名以 `config.json → jira.resolved_status` 为准
- `Closed` 状态在代码中**强制排除**

### 1.3 关联与效率

```
Bug解决效率(H/个) = Bug解决工时 ÷ 解决Bug数
```

人员关联方式：按 **邮箱** OUTER JOIN
- 飞书 `创建人邮箱` ↔ Jira `resolver_email`

## 二、Bug 分析维度（三条件识别）

实现位置：`shared_analyzer.build_analyst_bugs()`

### 2.1 算法

对**每个 (person_email, bug_key) 对**判断：

| 条件 | 描述 | 数据来源 |
|------|------|----------|
| ① | 该人在 changelog 中变更过该 Bug 的 Assignee | `assignee_events` |
| ② | 该人在该 Bug 上发表过评论 | `comment_events` |
| ③ | 该人**未**将该 Bug 切换到 Resolved | NOT IN `resolved_events` |

**三个条件同时满足** → 判定为该 Bug 的"分析人员"。

集合表达式：

```
analyzed_bugs(person) = (assignee_changed_bugs ∩ commented_bugs) − resolved_bugs
```

### 2.2 飞书侧：Bug 分析工时

```
Bug分析工时 = Σ ( 工时(H) | 产出类型 == "Bug分析(解析)" )
```

**注意**：分析工时不包含解决/验证工时，是**完全独立**的统计口径。

### 2.3 效率

```
Bug分析效率(H/个) = Bug分析工时 ÷ 分析Bug数
```

其中分析 Bug 数 = 满足三条件的 (person, bug) 对中**唯一 bug 数**（按 person 聚合时按 bug 去重）。

## 三、人员排除规则

由 `shared_config.is_excluded()` 和 `is_an_excluded()` 统一执行。

| 规则 | 字段 | 适用维度 |
|------|------|---------|
| 邮箱前缀 | `exclusions.email_prefixes` | 全局（解决 + 分析） |
| 完整邮箱 | `exclusions.analysis_excluded_emails` | 仅分析维度 |
| 名称关键字 | `exclusions.name_keywords` | 全局 |

## 四、月度趋势

**解决维度**：
1. 按 `(邮箱, 月份)` 聚合 Jira `resolved_events`
2. 按 `(邮箱, 月份)` 聚合飞书 Bug 解决工时
3. 两表 OUTER JOIN，再按月聚合

**分析维度**：
1. 按 `(邮箱, 月份)` 统计满足三条件的 (person, bug) 对
2. JOIN 飞书 Bug 分析工时
3. 按月聚合

## 五、上周效率

- 上周范围：自动计算上周一 ~ 上周日
- 解决维度：上周 Jira Resolved 事件 × 上周飞书 Bug 解决工时
- 分析维度：全周期已确认的分析人员 × 上周在其分析 Bug 上有 Jira 活动（assignee 变更或评论）

## 六、近一个月成员效率

- 范围：今天往前 30 天
- 分别展示解决维度和分析维度的个人效率
- 在仪表盘"近一个月效率"模块中展示

## 七、KPI 计算（仪表盘）

### 7.1 净消解速率

```
净消解速率 = 近30天日均解决数 − 近30天日均新增数
```

### 7.2 预计清零日期

```
预计清零日期 = 当前未解决数 ÷ 净消解速率
```

仅在净速率 > 0 时显示。

### 7.3 客户侧分类

客户侧 Bug 来源：
- **新增**：`MHU_3rd_TS` 标签**添加**事件
- **分析**：标签**删除**事件
- **实际修改**：Jira 状态切换到 Resolved（去重，与分析合并计入"累计解决"）

详细处理逻辑：[../../../ARCHITECTURE.md](../../../ARCHITECTURE.md)（工程根目录的架构文档）

## 八、数据周期对齐

Jira 事件自动裁剪至飞书工时**起始日期**（避免无工时月份显示 0 H/个 假数据）。

但**全周期 KPI 不受此限**：使用 Jira 全量数据统计，不裁剪。

## 九、关键文件位置

| 文件 | 关键函数 |
|------|---------|
| `shared_analyzer.py` | `build_analyst_bugs`, `build_analyst_pairs`, `resolve_name` |
| `shared_jira.py` | `load_jira_events`, `align_jira_to_feishu` |
| `shared_feishu.py` | `build_feishu_dataframe`, `load_feishu_and_names` |
| `shared_config.py` | `is_excluded`, `is_an_excluded`, `TYPE_MAP`, `FIX_TYPES`, `AN_TYPES` |
| `web_server.py` | 仪表盘数据计算（通过 `shared_jira.load_jira_events` 合并内部+客户侧） |
| `dashboard_overview.py` / `dashboard_customer.py` | 看板静态 HTML 生成 |
