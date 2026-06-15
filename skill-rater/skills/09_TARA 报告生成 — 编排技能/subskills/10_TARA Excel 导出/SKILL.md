---
name: export-tara-excel
description: Export TARA analysis results into an Excel file using a template. Reads all JSON outputs from the TARA pipeline (assets, threats, damages, attack vectors, risk values, goal matching) and writes them into a structured Excel workbook. Each system function gets its own sheet, plus separate sheets for cybersecurity goals and claims. Use when the user wants to generate a TARA report Excel file.
---

# Export TARA Excel

Export all TARA analysis results into a structured Excel workbook based on a template.

## Inputs

1. **Template Excel file** (optional) — e.g., `~/shared/tara.xlsx`. If provided, this provides the sheet structure and column layout for the TARA Report. If not provided, the script creates headers from scratch.
2. **TARA output folder** — the workspace folder containing per-function subfolders with all JSON outputs (assets, threats, damages, attack vectors, risk values, goal matching) and the global `cybersecurity_claims.md`. This is the output/workspace folder, NOT the requirements folder.
3. **Cybersecurity goals file** — the global cybersecurity goals file (CSV or MD format).

## Dependencies

This skill requires the `openpyxl` Python library. Install via `pip install openpyxl` if not already available.

## Workflow

1. Read the template Excel file to understand the structure
2. For each system function, create a new sheet and populate it with TARA report data
3. Create a sheet for cybersecurity goals
4. Create a sheet for cybersecurity claims
5. Write the output Excel file

## TARA Report Sheet — Column Mapping

Each system function gets its own sheet named after the function. The column structure follows the template's "TARA Report" sheet.

**Row 1**: Title (e.g., "XX威胁分析与风险评估报告")
**Rows 2-4**: Multi-level headers (copy from template)
**Row 5+**: Data rows — one row per attack vector / risk value entry

### Column mapping for data rows (row 5+)

| Column | Header | Data source |
|---|---|---|
| A | 序号 | Sequential number (1, 2, 3, ...) |
| B | 功能项 | System function name |
| C | 资产ID | `asset_id` from risk value entry |
| D | 资产类别 | `asset_category` from threat scenario (functional/data/communication/hardware_firmware) |
| E | 资产名称 | `asset_name` from risk value entry |
| F | 机密性 (I) | "√" if STRIDE type is Information Disclosure, else "-" |
| G | 完整性 (T) | "√" if STRIDE type is Tampering, else "-" |
| H | 可用性 (D) | "√" if STRIDE type is Denial of Service, else "-" |
| I | 不可抵赖性 (R) | "√" if STRIDE type is Repudiation, else "-" |
| J | 认证 (S) | "√" if STRIDE type is Spoofing, else "-" |
| K | 授权 (E) | "√" if STRIDE type is Elevation of Privilege, else "-" |
| L | 威胁类别 | STRIDE type from threat scenario |
| M | 场景描述 | `threat_description` from threat scenario |
| N | 危害影响 | `damage_description` from damage scenario |
| O | 相关资产 | Related asset names (from asset's `related_functions` or the asset itself) |
| P | S 安全 | Safety rating from damage scenario `impact_ratings.safety` |
| Q | F 财务 | Financial rating from damage scenario `impact_ratings.financial` |
| R | O 操作 | Operational rating from damage scenario `impact_ratings.operational` |
| S | P 隐私 | Privacy rating from damage scenario `impact_ratings.privacy` |
| T | 影响等级 | `highest_impact_rating` from risk value entry |
| U | 攻击路径描述 | `attack_steps` from attack vector |
| V | T 经过的时间 | `feasibility.elapsed_time` from attack vector |
| W | K 专业知识 | `feasibility.specialist_expertise` from attack vector |
| X | P 信息公开性 | `feasibility.knowledge_of_item` from attack vector |
| Y | O 机会窗口 | `feasibility.window_of_opportunity` from attack vector |
| Z | E 设备与工具 | `feasibility.equipment` from attack vector |
| AA | 可行性综合等级 | `feasibility.feasibility_rating` from attack vector |
| AB | 风险类别 | Risk category derived from risk value (1="可忽略", 2="低", 3="中", 4="高", 5="严重") |
| AC | 风险数值 | `risk_value` from risk value entry |
| AD | 风险处理决定 | "减少" if matched to cybersecurity goal(s); "保留" if covered by a claim |
| AE | 风险处理决定编号 | Matched goal IDs (e.g., "CS_GOAL_10, CS_GOAL_21") or claim ID (e.g., "CC-001") |
| AF | 网络安全假设编号 | Claim ID if the entry is covered by a claim, else empty |

## Cybersecurity Goals Sheet

Create a sheet named "网络安全目标" with columns:

| Column | Header |
|---|---|
| A | 目标ID |
| B | 目标描述 |
| C | 引用次数 |
| D | 关联威胁示例 |

## Cybersecurity Claims Sheet

Create a sheet named "网络安全声明" with columns:

| Column | Header |
|---|---|
| A | 声明ID |
| B | 声明描述 |
| C | 覆盖威胁数 |

## Methodology Sheets

Generate four methodology reference sheets that explain the analysis frameworks used in the TARA report:

### STRIDE威胁模型
Explains the STRIDE threat modeling framework with a table of all six threat categories (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege), their corresponding security properties, descriptions, and typical attack examples relevant to automotive ECUs.

### 攻击可行性评估方法
Documents the ISO 21434-based attack feasibility evaluation method with all five dimensions:
- T 经过的时间 (Elapsed Time): 4 levels, scores 0-19
- K 专业知识 (Specialist Expertise): 4 levels, scores 0-8
- P 信息公开性 (Knowledge of Item): 4 levels, scores 0-11
- O 机会窗口 (Window of Opportunity): 4 levels, scores 0-10
- E 设备与工具 (Equipment): 4 levels, scores 0-9

Include the feasibility rating thresholds: 高(0-9), 中(10-13), 低(14-19), 很低(20-56).

### 风险值计算方法
Documents the risk value determination method including:
- The 4×4 risk matrix (Impact × Feasibility)
- Risk level descriptions (1=可忽略 through 5=严重) with required actions
- Risk treatment decisions: "减少" (risk≥3 or debug interface → match to CS goals) vs "保留" (risk<3 non-debug → cybersecurity claims)

### 影响评级方法
Documents the damage impact rating method across four dimensions (Safety, Financial, Operational, Privacy) with four severity levels (严重, 重大, 中等, 可忽略) and descriptive criteria for each combination.

## Step-by-step Instructions

### Step 1 — Read all inputs

1. Read the template Excel file to get the header structure and formatting.
2. For each system function subfolder, read all JSON files:
   - `*_assets.json`
   - `*_threats.json`
   - `*_damages.json`
   - `*_attack_vectors.json`
   - `*_risk_values.json`
   - `*_goal_matching.json`
3. Read the cybersecurity goals MD file.
4. Read the cybersecurity claims MD file.

### Step 2 — Build data lookup maps

For each system function, build lookup maps:
- `threat_id` → threat scenario object
- `attack_vector_id` → attack vector object
- `threat_id` → damage scenario object
- Risk value entries as the main iteration source
- Goal matching entries for risk treatment decisions

### Step 3 — Write per-function TARA report sheets

For each system function:
1. Create a new sheet named with the system function name (e.g., "车辆设置-车辆控制")
2. Copy the header structure from the template's "TARA Report" sheet (rows 1-4), including merged cells
3. Starting from row 5, write one row per risk value entry using the column mapping above
4. Sort rows by asset_id, then by threat_id

### Step 4 — Write cybersecurity goals sheet

Create the "网络安全目标" sheet with all goals from the MD file, plus usage statistics.

### Step 5 — Write cybersecurity claims sheet

Create the "网络安全声明" sheet with all claims from the global claims file.

### Step 6 — Save the Excel file

Save the workbook to the TARA output folder as `tara_report.xlsx`.

### Step 7 — Report

Tell the user:
- Output file path
- Number of sheets created
- Total data rows written across all function sheets
- Any issues encountered

## Implementation Notes

- Use `openpyxl` for Excel file manipulation
- Write a Python script that reads all JSON files and produces the Excel output
- The script should be runnable from the command line: `python3 export_tara.py <template> <tara_folder> <goals_md> <output_path>`
- Handle Chinese characters properly (openpyxl supports Unicode natively)
- Copy cell formatting (alignment, borders, fill) from the template where possible
