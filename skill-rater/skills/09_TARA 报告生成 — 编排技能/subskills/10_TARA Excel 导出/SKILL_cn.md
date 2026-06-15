---
name: export-tara-excel
description: 使用模板将 TARA 分析结果导出到 Excel 文件。读取 TARA 管道的所有 JSON 输出（资产、威胁、损害、攻击向量、风险值、目标匹配），并将其写入结构化的 Excel 工作簿。每个系统功能都有其自己的工作表，外加网络安全目标和声明的独立工作表。当用户希望生成 TARA 报告 Excel 文件时，使用此技能。
---

# 导出 TARA Excel

将所有 TARA 分析结果导出到基于模板的结构化 Excel 工作簿中。

## 输入

1.  **模板 Excel 文件**（可选）— 例如 `~/shared/tara.xlsx`。如果提供，该文件提供 TARA 报告的工作表结构和列布局。如果未提供，脚本从头创建表头。
2.  **TARA 输出文件夹** — 工作区文件夹，包含按功能划分的子文件夹，其中包含所有 JSON 输出（资产、威胁、损害、攻击向量、风险值、目标匹配）以及全局的 `cybersecurity_claims.md`。这是输出/工作区文件夹，而不是需求文件夹。
3.  **网络安全目标文件** — 全局网络安全目标文件（CSV 或 MD 格式）。

## 依赖项

此技能需要 `openpyxl` Python 库。如果尚未安装，请通过 `pip install openpyxl` 安装。

## 工作流程

1.  读取模板 Excel 文件以理解结构
2.  对于每个系统功能，创建一个新的工作表并用 TARA 报告数据填充
3.  为网络安全目标创建一个工作表
4.  为网络安全声明创建一个工作表
5.  写入输出 Excel 文件

## TARA 报告工作表 — 列映射

每个系统功能都有一个以该功能命名的工作表。列结构遵循模板中的“TARA Report”工作表。

**第 1 行**：标题（例如“XX威胁分析与风险评估报告”）
**第 2-4 行**：多级表头（从模板复制）
**第 5 行+**：数据行 — 每个攻击向量/风险值条目一行

### 数据行（第 5 行+）的列映射

| 列   | 表头             | 数据源                                                       |
| ---- | ---------------- | ------------------------------------------------------------ |
| A    | 序号             | 顺序号（1, 2, 3, ...）                                       |
| B    | 功能项           | 系统功能名称                                                 |
| C    | 资产ID           | 风险值条目中的 `asset_id`                                    |
| D    | 资产类别         | 威胁场景中的 `asset_category`（functional/data/communication/hardware_firmware） |
| E    | 资产名称         | 风险值条目中的 `asset_name`                                  |
| F    | 机密性 (I)       | 如果 STRIDE 类型是 Information Disclosure 则为“√”，否则为“-” |
| G    | 完整性 (T)       | 如果 STRIDE 类型是 Tampering 则为“√”，否则为“-”              |
| H    | 可用性 (D)       | 如果 STRIDE 类型是 Denial of Service 则为“√”，否则为“-”      |
| I    | 不可抵赖性 (R)   | 如果 STRIDE 类型是 Repudiation 则为“√”，否则为“-”            |
| J    | 认证 (S)         | 如果 STRIDE 类型是 Spoofing 则为“√”，否则为“-”               |
| K    | 授权 (E)         | 如果 STRIDE 类型是 Elevation of Privilege 则为“√”，否则为“-” |
| L    | 威胁类别         | 威胁场景中的 STRIDE 类型                                     |
| M    | 场景描述         | 威胁场景中的 `threat_description`                            |
| N    | 危害影响         | 损害场景中的 `damage_description`                            |
| O    | 相关资产         | 相关资产名称（来自资产的 `related_functions` 或资产本身）    |
| P    | S 安全           | 损害场景 `impact_ratings.safety` 中的安全评级                |
| Q    | F 财务           | 损害场景 `impact_ratings.financial` 中的财务评级             |
| R    | O 操作           | 损害场景 `impact_ratings.operational` 中的操作评级           |
| S    | P 隐私           | 损害场景 `impact_ratings.privacy` 中的隐私评级               |
| T    | 影响等级         | 风险值条目中的 `highest_impact_rating`                       |
| U    | 攻击路径描述     | 攻击向量中的 `attack_steps`                                  |
| V    | T 经过的时间     | 攻击向量中的 `feasibility.elapsed_time`                      |
| W    | K 专业知识       | 攻击向量中的 `feasibility.specialist_expertise`              |
| X    | P 信息公开性     | 攻击向量中的 `feasibility.knowledge_of_item`                 |
| Y    | O 机会窗口       | 攻击向量中的 `feasibility.window_of_opportunity`             |
| Z    | E 设备与工具     | 攻击向量中的 `feasibility.equipment`                         |
| AA   | 可行性综合等级   | 攻击向量中的 `feasibility.feasibility_rating`                |
| AB   | 风险类别         | 从风险值派生的风险类别（1=“可忽略”，2=“低”，3=“中”，4=“高”，5=“严重”） |
| AC   | 风险数值         | 风险值条目中的 `risk_value`                                  |
| AD   | 风险处理决定     | 如果匹配到网络安全目标则为“减少”；如果由声明覆盖则为“保留”   |
| AE   | 风险处理决定编号 | 匹配的目标 ID（例如“CS_GOAL_10, CS_GOAL_21”）或声明 ID（例如“CC-001”） |
| AF   | 网络安全假设编号 | 如果条目由声明覆盖则为声明 ID，否则为空                      |

## 网络安全目标工作表

创建一个名为“网络安全目标”的工作表，包含以下列：

| 列   | 表头         |
| ---- | ------------ |
| A    | 目标ID       |
| B    | 目标描述     |
| C    | 引用次数     |
| D    | 关联威胁示例 |

## 网络安全声明工作表

创建一个名为“网络安全声明”的工作表，包含以下列：

| 列   | 表头       |
| ---- | ---------- |
| A    | 声明ID     |
| B    | 声明描述   |
| C    | 覆盖威胁数 |

## 方法论工作表

生成四个方法论参考工作表，解释 TARA 报告中使用的分析框架：

### STRIDE威胁模型

解释 STRIDE 威胁建模框架，包含一个表格，列出所有六个威胁类别（Spoofing、Tampering、Repudiation、Information Disclosure、Denial of Service、Elevation of Privilege）、其对应的安全属性、描述以及与汽车 ECU 相关的典型攻击示例。

### 攻击可行性评估方法

记录基于 ISO 21434 的攻击可行性评估方法，包含所有五个维度：
- T 经过的时间：4 个等级，分数 0-19
- K 专业知识：4 个等级，分数 0-8
- P 信息公开性：4 个等级，分数 0-11
- O 机会窗口：4 个等级，分数 0-10
- E 设备与工具：4 个等级，分数 0-9

包含可行性评级阈值：高(0-13)、中(14-19)、低(20-24)、很低(≥25)。

### 风险值计算方法

记录风险值确定方法，包括：
- 4×4 风险矩阵（影响 × 可行性）
- 风险等级描述（1=可忽略 到 5=严重）及所需措施
- 风险处理决定：“减少”（风险≥3 或调试接口 → 匹配到 CS 目标）与“保留”（风险<3 且非调试 → 网络安全声明）

### 影响评级方法

记录跨四个维度（安全、财务、操作、隐私）的损害影响评级方法，包含四个严重等级（严重、重大、中等、可忽略）以及每个组合的描述性标准。

## 分步说明

### 步骤 1 — 读取所有输入

1.  读取模板 Excel 文件以获取表头结构和格式。
2.  对于每个系统功能子文件夹，读取所有 JSON 文件：
    - `*_assets.json`
    - `*_threats.json`
    - `*_damages.json`
    - `*_attack_vectors.json`
    - `*_risk_values.json`
    - `*_goal_matching.json`
3.  读取网络安全目标 MD 文件。
4.  读取网络安全声明 MD 文件。

### 步骤 2 — 构建数据查找映射

对于每个系统功能，构建查找映射：
- `threat_id` → 威胁场景对象
- `attack_vector_id` → 攻击向量对象
- `threat_id` → 损害场景对象
- 风险值条目作为主要迭代源
- 目标匹配条目用于风险处理决定

### 步骤 3 — 写入按功能的 TARA 报告工作表

对于每个系统功能：
1.  创建一个以系统功能名称命名的新工作表（例如“车辆设置-车辆控制”）
2.  从模板的“TARA Report”工作表复制表头结构（第 1-4 行），包括合并单元格
3.  从第 5 行开始，使用上述列映射为每个风险值条目写入一行
4.  按 asset_id 排序，然后按 threat_id 排序

### 步骤 4 — 写入网络安全目标工作表

创建“网络安全目标”工作表，包含 MD 文件中的所有目标以及使用统计信息。

### 步骤 5 — 写入网络安全声明工作表

创建“网络安全声明”工作表，包含全局声明文件中的所有声明。

### 步骤 6 — 保存 Excel 文件

将工作簿保存到 TARA 输出文件夹，文件名为 `tara_report.xlsx`。

### 步骤 7 — 报告

告知用户：
- 输出文件路径
- 创建的工作表数量
- 所有功能工作表中写入的总数据行数
- 遇到的任何问题

## 实现说明

- 使用 `openpyxl` 进行 Excel 文件操作
- 编写一个 Python 脚本，读取所有 JSON 文件并生成 Excel 输出
- 脚本应可从命令行运行：`python3 export_tara.py <template> <tara_folder> <goals_md> <output_path>`
- 正确处理中文字符（openpyxl 原生支持 Unicode）
- 尽可能从模板复制单元格格式（对齐、边框、填充）