---
name: tara-report-generation
description: Orchestrate a full TARA (Threat Analysis and Risk Assessment) pipeline for ECU system function documents. Accepts a folder of sub-folders (each containing requirement documents in PDF, XLSX, DOCX, etc.), a drawio hardware block diagram, and a cybersecurity goals file. Runs asset identification, threat scenario identification, damage scenario identification, attack vector identification, risk value determination, and cybersecurity goal matching. Generates a progress report. Use when the user wants to run a complete TARA analysis on one or more system function documents.
---

# TARA Report Generation

Orchestrate the full TARA pipeline across multiple ECU system function document folders.

## Input

1. A **requirements folder** (input) containing sub-folders, where each sub-folder represents one system function and contains its requirement documents (PDF, XLSX, XLSM, DOCX, etc.). Sub-folders named `00_old` (or similar archive patterns) are skipped.
2. An **output folder** (workspace) where all generated work products are written. This folder MUST be separate from the requirements folder — do NOT write any generated files into the requirements folder. If not explicitly provided, use the Cursor workspace root.
3. A **hardware block diagram (drawio file)** — an XML-based `.drawio` file containing the ECU's hardware architecture (item definition). Shared across all system functions, passed to asset-identification.
4. A **cybersecurity goals file** (CSV or MD) — containing the predefined cybersecurity goals table (required for Step 3).

## Workflow Overview

```
Phase 1 — Assess all function sub-folders
  For each sub-folder in root folder:
    → Assess cybersecurity relevance: High / Medium / Low

Phase 2 — Run core TARA pipeline (per function)
  For each High or Medium function:
    a. asset-identification (folder + drawio)
    b. threat-scenario-identification
    c. damage-scenario-identification
    d. attack-vector-identification
    e. risk-value-determination

Phase 3 — Cybersecurity goal matching (across all functions)
  → cybersecurity-goal-matching (processes ALL functions together, produces global claims + per-function goal matching)

Phase 4 — Generate progress report
```

## Step 1 — List and assess function sub-folders

List all sub-folders in the root folder (skip `00_old` or similar archive patterns). For each sub-folder:
1. Examine the **sub-folder name** (e.g., `01_OTA`, `03_诊断`, `07_电源管理`) for function category hints
2. List the **file names** within the sub-folder to understand the scope
3. Optionally **read key documents briefly** (e.g., first pages of PDFs or document titles) if the folder name alone is insufficient
4. Assess its **cybersecurity relevance** based on these criteria:

| Rating | Criteria |
|---|---|
| **High** | Function directly controls vehicle body, powertrain, safety-critical systems, or involves authentication/authorization, OTA updates, diagnostics, or network communication. Examples: OTA, diagnostics, CAN communication, power management, SOME/IP services. |
| **Medium** | Function interacts with vehicle systems for configuration/monitoring but is not directly safety-critical. Examples: logging, network management, mirroring. |
| **Low** | Function is purely informational, test-only, or local configuration with no vehicle control or security-sensitive data. |

Write the assessment into the progress report immediately.

## Step 2 — Run core TARA pipeline for relevant functions

For each sub-folder rated **High** or **Medium**, execute these 5 skills in sequence. Each skill reads its definition at `~/.cursor/skills/<skill-name>/SKILL.md` and follows its instructions.

### Output folder structure

**All generated work products go in the output folder — NEVER in the requirements folder.** The output folder mirrors the requirements folder structure with per-function sub-folders.

```
<requirements_folder>/                      # INPUT ONLY — no generated files here
├── 01_OTA/
│   ├── GWMFOTA_...pdf                      # source document
│   └── ...xlsx                             # source document
├── 03_诊断/
│   └── ...pdf
└── ...

<output_folder>/                            # ALL generated files go here
├── 01_OTA/
│   ├── 01_OTA_assets.json
│   ├── 01_OTA_threats.json
│   ├── 01_OTA_damages.json
│   ├── 01_OTA_attack_vectors.json
│   ├── 01_OTA_risk_values.json
│   └── 01_OTA_goal_matching.json           # written in Step 3
├── 03_诊断/
│   ├── 03_诊断_assets.json
│   └── ...
├── cybersecurity_claims.md                  # global claims (Step 3)
├── tara_progress_report.md                  # progress report
└── tara_report.xlsx                        # Excel export (optional)
```

### Pipeline execution order (per function)

Run these 5 skills in order for each relevant system function. Each step depends on the output of the previous step:

**a. Asset Identification**
- Skill: `~/.cursor/skills/asset-identification/SKILL.md`
- Input: the system function sub-folder (from requirements folder) + the drawio hardware block diagram file
- Output: `<output_folder>/<subfolder_name>/<basename>_assets.json`

**b. Threat Scenario Identification**
- Skill: `~/.cursor/skills/threat-scenario-identification/SKILL.md`
- Input: the assets JSON from step (a) + the source documents in the requirements sub-folder for context
- Output: `<output_folder>/<subfolder_name>/<basename>_threats.json` (same directory as assets JSON)

**c. Damage Scenario Identification**
- Skill: `~/.cursor/skills/damage-scenario-identification/SKILL.md`
- Input: the threats JSON from step (b) + the source documents in the requirements sub-folder for context
- Output: `<output_folder>/<subfolder_name>/<basename>_damages.json` (same directory as threats JSON)

**d. Attack Vector Identification**
- Skill: `~/.cursor/skills/attack-vector-identification/SKILL.md`
- Input: the threats JSON from step (b) + the source documents in the requirements sub-folder for context
- Output: `<output_folder>/<subfolder_name>/<basename>_attack_vectors.json` (same directory as threats JSON)

**e. Risk Value Determination**
- Skill: `~/.cursor/skills/risk-value-determination/SKILL.md`
- Input: the attack vectors JSON from step (d) + the damages JSON from step (c)
- Output: `<output_folder>/<subfolder_name>/<basename>_risk_values.json` (same directory as attack vectors JSON)

### Execution guidance

- Process one system function at a time, completing all 5 steps before moving to the next
- After each skill completes, update the progress report
- If a skill fails, note the failure in the progress report and continue with the next system function
- The `<basename>` for output files is the sub-folder name (e.g., `01_OTA`, `03_诊断`)

## Step 3 — Cybersecurity goal matching

After ALL relevant functions have completed Step 2 (all 5 core skills), run the cybersecurity goal matching skill **once** to process all functions together.

- Skill: `~/.cursor/skills/cybersecurity-goal-matching/SKILL.md`
- Input: ALL risk values JSONs + ALL attack vectors JSONs + ALL threats JSONs + the cybersecurity goals MD file
- Output:
  - Per-function: `<output_folder>/<subfolder_name>/<basename>_goal_matching.json`
  - Global: `<output_folder>/cybersecurity_claims.md`

This skill must process all functions together because cybersecurity claims are global (shared across functions).

## Step 4 — Generate progress report

Create and maintain `tara_progress_report.md` in the output folder. The report should contain:

```markdown
# TARA Analysis Progress Report

Generated: <timestamp>
Root folder: <folder path>
Hardware reference: <drawio file path>

## Cybersecurity Relevance Assessment

| # | System Function | Sub-folder | Source Files | Relevance | Reason |
|---|---|---|---|---|---|
| 1 | Function name | 01_OTA | 7 files (5 PDF, 2 XLSX) | High/Medium/Low | Brief reason |

## Pipeline Execution Status

### <Function Name 1> (relevance: High)

Source folder: `<subfolder path>`
Source files: file1.pdf, file2.xlsx, ...

| Step | Skill | Status | Output File |
|---|---|---|---|
| 1 | Asset Identification | ✅ Complete | 01_OTA_assets.json |
| 2 | Threat Scenario Identification | ✅ Complete | 01_OTA_threats.json |
| 3 | Damage Scenario Identification | ✅ Complete | 01_OTA_damages.json |
| 4 | Attack Vector Identification | ✅ Complete | 01_OTA_attack_vectors.json |
| 5 | Risk Value Determination | ✅ Complete | 01_OTA_risk_values.json |
| 6 | Cybersecurity Goal Matching | ✅ Complete | 01_OTA_goal_matching.json |

Summary: X assets, Y threats, Z damage scenarios, W attack vectors, V risk values, G goal matches, C claim references

#### Clarification Needed (if any)
- [List any unclear points identified by sub-skills]

### <Function Name 2> (relevance: Medium)
...

## Cybersecurity Goal Matching Summary

| Metric | Value |
|---|---|
| Total goal matches (risk >= 3) | X |
| Total claim references (risk < 3) | Y |
| Global claims generated | Z |
| Claims file | cybersecurity_claims.md |

## Summary

| Function | Sub-folder | Relevance | Assets | Threats | Damages | Attack Vectors | Risk Values | Goal Matches | Claim Refs |
|---|---|---|---|---|---|---|---|---|---|
| Name 1 | 01_OTA | High | X | Y | Z | W | V | G | C |

## Skipped Functions (Low Relevance)
- Function name (sub-folder) — reason
```

## Clarification Handling

Each sub-skill may identify unclear or ambiguous points in the system function documents. When a skill reports unclear points:

1. **Collect all unclear points** from the skill's report
2. **Add them to the progress report** under a "Clarification Needed" section for that function
3. **Ask the user** for clarification before proceeding to the next skill if the unclear points could significantly affect downstream analysis
4. If running in batch mode and the user is not available for immediate feedback, note the unclear points in the report and proceed with conservative assumptions (i.e., do NOT add unmentioned interfaces or components)

## No Assumption Rule (Global)

This rule applies across all sub-skills in the pipeline:

**No skill in the pipeline should introduce interfaces, buses, protocols, or components that are not explicitly mentioned in the system function documents or the drawio hardware block diagram.** Each sub-skill enforces this individually, but the orchestration layer should also verify: if a downstream skill references an interface not present in the asset inventory, flag it as an error.

## Important Notes

- Process system functions from highest relevance to lowest (High first, then Medium)
- The progress report should be updated after each skill completes, so progress is visible even if the pipeline is interrupted
- All JSON outputs must follow the schemas defined in each skill's SKILL.md
- Language rule applies: output language matches the input document language
- Cybersecurity goal matching (Step 3) must run AFTER all functions complete Step 2, because claims are global
- The drawio file is passed only to asset-identification (Step 2a); downstream skills use the assets JSON which already incorporates hardware information
