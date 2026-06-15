---
name: risk-value-determination
description: 通过结合攻击可行性评级与损害影响评级来确定风险值。读取攻击向量 JSON 和损害场景 JSON，通过威胁 ID 交叉引用它们，并使用预定义的风险矩阵计算数值风险值。当用户希望计算风险等级、执行风险评估或确定 ECU 系统功能的网络安全风险值时，使用此技能。
---

# 风险值确定

通过将每个攻击向量的可行性评级与对应损害场景中的最高影响评级相结合，确定数值风险值。

## 输入

1.  **攻击向量 JSON 文件** — 由 attack-vector-identification 技能生成。
2.  **损害场景 JSON 文件** — 由 damage-scenario-identification 技能生成。

两个文件都使用 `threat_id` 作为关联键。

## 语言规则

**输出的 JSON 必须使用与输入文件相同的语言。** 如果输入是中文，则输出中文。

## 风险计算方法

### 步骤 A — 计算加权影响评级

对于每个攻击向量，找到对应的损害场景（通过 `threat_id` 匹配）。从该损害场景的 `impact_ratings` 中，使用以下方法计算**加权影响评级**：

**每个影响等级的数值：**

| Level      | EN         | ZH     | Value |
| ---------- | ---------- | ------ | ----- |
| Severe     | Severe     | 严重   | 2.0   |
| Major      | Major      | 重大   | 1.5   |
| Moderate   | Moderate   | 中等   | 1.0   |
| Negligible | Negligible | 可忽略 | 0.0   |

**每个影响类别的权重：**

| Category           | Weight |
| ------------------ | ------ |
| Safety (安全)      | 35%    |
| Financial (财务)   | 15%    |
| Operational (操作) | 30%    |
| Privacy (隐私)     | 20%    |

**加权和公式：**

weighted_sum = safety_value × 0.35 + financial_value × 0.15 + operational_value × 0.30 + privacy_value × 0.20

**向下对齐（取底映射）到影响等级：**

| Weighted Sum Range | Impact Level        |
| ------------------ | ------------------- |
| ≥ 2.0              | Severe (严重)       |
| ≥ 1.5 and < 2.0    | Major (重大)        |
| ≥ 1.0 and < 1.5    | Moderate (中等)     |
| < 1.0              | Negligible (可忽略) |

记录加权和（用于可追溯性）以及由此产生的影响等级。

### 步骤 B — 从风险矩阵查找风险值

使用最高影响评级和攻击向量的可行性评级来确定风险值：

| Impact ↓ / Feasibility → | Very Low (很低) | Low (低) | Medium (中) | High (高) |
| ------------------------ | --------------- | -------- | ----------- | --------- |
| **Severe (严重)**        | 2               | 3        | 4           | 5         |
| **Major (重大)**         | 1               | 2        | 3           | 4         |
| **Moderate (中等)**      | 1               | 2        | 2           | 1         |
| **Negligible (可忽略)**  | 1               | 1        | 1           | 1         |

## 输出 JSON 架构

```json
{
  "source_attack_vectors": "<攻击向量 JSON 文件的路径>",
  "source_damages": "<损害场景 JSON 文件的路径>",
  "system_function": "<系统功能的名称>",
  "risk_values": [
    {
      "id": "RV-001",
      "attack_vector_id": "AV-001",
      "threat_id": "TS-001",
      "asset_id": "F-001",
      "asset_name": "资产名称",
      "attack_feasibility_rating": "来自攻击向量的语言匹配的可行性评级",
      "highest_impact_rating": "语言匹配的加权影响评级 (Severe|Major|Moderate|Negligible 或 严重|重大|中等|可忽略)",
      "weighted_impact_sum": 0.0,
      "risk_value": 0
    }
  ]
}
```

## 分步说明

### 步骤 1 — 读取输入

1.  读取攻击向量 JSON 文件。
2.  读取损害场景 JSON 文件。

### 步骤 2 — 通过威胁 ID 交叉引用

对于每个攻击向量，使用 `threat_id` 找到对应的损害场景。多个攻击向量可能映射到同一个损害场景（相同的威胁，不同的攻击路径）。

### 步骤 3 — 计算加权影响评级

对于每个损害场景的 `impact_ratings`：
1. 将每个类别的评级转换为其数值（严重=2.0，重大=1.5，中等=1.0，可忽略=0.0）
2. 计算加权和：安全×0.35 + 财务×0.15 + 操作×0.30 + 隐私×0.20
3. 应用向下对齐确定影响等级：
   - ≥2.0 → 严重，≥1.5 → 重大，≥1.0 → 中等，<1.0 → 可忽略
4. 记录加权和以及由此产生的影响等级

### 步骤 4 — 计算风险值

使用风险矩阵，从以下交集查找风险值：
- 行：最高影响评级
- 列：攻击可行性评级

### 步骤 5 — 分配 ID

按顺序编号风险值：`RV-001`、`RV-002` 等。每个攻击向量对应一个风险值。

### 步骤 6 — 写入 JSON

写入与输入文件相同的目录，文件名为 `<公共基础文件名>_risk_values.json`。
例如：如果攻击向量文件是 `xxx_attack_vectors.json`，则输出文件是 `xxx_risk_values.json`。

### 步骤 7 — 报告

告知用户：
- 风险值总数
- 风险值的分布情况（每个值 1-5 的数量）
- 输出文件路径
- 所做的任何假设

