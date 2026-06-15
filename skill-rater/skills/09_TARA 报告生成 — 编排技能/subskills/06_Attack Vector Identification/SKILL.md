---
name: attack-vector-identification
description: Generate attack vectors with step-by-step attack paths and feasibility ratings for cybersecurity threat scenarios. Reads threat scenario JSON produced by the threat-scenario-identification skill, generates concrete attack vectors (including ECU debug interface attacks), and evaluates feasibility per ISO 21434 criteria. Use when the user wants to identify attack paths, assess attack feasibility, or perform attack potential analysis for ECU system functions.
---

# Attack Vector Identification

Generate concrete attack vectors for each cybersecurity threat scenario and evaluate their feasibility.

## Inputs

1. **Threat scenario JSON file** — produced by the threat-scenario-identification skill.
2. **Original system function MD file** — referenced in the threat JSON's `source_document` field. Read this to ground attack vectors in the actual system context.

## Language Rule

**The output JSON must use the same language as the threat scenario input.** If threat descriptions are in Chinese, attack vectors must be in Chinese.

## No Assumption Rule

**Attack vectors must only use interfaces, buses, protocols, and components that are explicitly mentioned in the asset inventory or the original system function document.** Do NOT introduce attack surfaces that were not identified. For example:
- If no CAN bus was identified in the assets, do not create an attack vector involving CAN bus message injection.
- If no debug interface (JTAG, ADB, UART, etc.) was identified, do not create an attack vector using debug interfaces.
- If no wireless interface (Bluetooth, Wi-Fi) was identified, do not create an attack vector via wireless exploitation.
- If no OTA update mechanism was described, do not assume one exists.

**If a realistic attack vector requires an interface or component not present in the asset inventory**, note it in the Step 6 report as "potential attack surface not documented" and ask the user whether that interface exists. Do NOT generate the attack vector until confirmed.

## Attack Vector Requirements

For each threat scenario, generate **multiple** attack vectors (typically **2–4**) covering different attack surfaces or paths. For example, a data tampering threat might have both a remote network MITM vector and a local physical access vector. Each attack vector must:
- Describe a concrete, realistic attack path with **2 to 3 sequential steps**
- Write attack steps as a **single string** with the pattern: `1. description; 2. description; 3. description` (sequence number + description + semicolon)
- **Only reference interfaces, buses, and components that exist in the asset inventory or are explicitly documented in the system function**
- Be specific to the ECU system function context (not generic)
- Reference the threat it realizes via threat ID

### Attack Surface Coverage

Only use attack surfaces that correspond to identified assets. Possible categories (only if the corresponding interface/component is explicitly identified):

- **ECU debug interfaces**: Only if JTAG, SWD, ADB, SSH, Telnet, serial console, or UART are explicitly mentioned in the document or asset inventory
- **Vehicle communication buses**: Only if CAN, LIN, Ethernet, SOME/IP, or other buses are identified as communication assets
- **Wireless interfaces**: Only if Bluetooth, Wi-Fi, cellular, or other wireless interfaces are identified
- **Software interfaces**: Only if OTA mechanisms, APIs, or OS-level access points are described in the document
- **Physical access**: Only if physical hardware access points are described or identified as hardware assets

Do NOT assume any attack surface exists merely because it is common in automotive systems. Each attack surface must be traceable to a specific identified asset.

## Feasibility Evaluation

Evaluate each attack vector's feasibility using five parameters based on ISO 21434 attack feasibility rating. Use the **text enumeration values** (not numeric scores) for each parameter. **The feasibility enumeration values must use the same language as the input system function** — use the corresponding language column below.

### 1. Elapsed Time (经过时间)

How long the attack takes to execute.

| English | 中文 | Criteria |
|---|---|---|
| ≤1 Day | ≤1天 | Very short attack duration |
| ≤1 Week | ≤1周 | Short attack duration |
| ≤1 Month | ≤1个月 | Moderate attack duration |
| ≤6 Months | ≤6个月 | Long attack duration |
| >6 Months | >6个月 | Extremely long attack duration |

### 2. Specialist Expertise (专业知识)

Level of attacker expertise required.

| English | 中文 | Criteria |
|---|---|---|
| Layman | 外行 | No particular expertise required |
| Proficient | 熟练 | Familiar with product/system behavior |
| Expert | 专家 | Familiar with underlying algorithms and protocols |
| Multiple experts | 多领域专家 | Different fields of expertise required |

### 3. Knowledge of the Item or Component (目标知识)

Information about the target needed to mount the attack.

| English | 中文 | Criteria |
|---|---|---|
| Public | 公开 | Readily available (manuals, internet) |
| Restricted | 受限 | Shared within the organization on a need-to-know basis |
| Confidential | 机密 | Shared between discrete teams, NDA required |
| Strictly confidential | 严格机密 | Known to only a few individuals |

### 4. Window of Opportunity (机会窗口)

Access conditions based on the attack interface used.

| English | 中文 | Criteria |
|---|---|---|
| Unlimited | 无限制 | Attack issued from the internet (remote/cloud-based) |
| Easy | 容易 | Attack issued via near-field communication (Bluetooth, Wi-Fi) |
| Moderate | 中等 | Attack issued from internal vehicle network or vehicle-exposed physical interfaces (OBD-II, USB, ADB via USB, LIN, CAN, Ethernet) |
| Difficult | 困难 | Attack requires disassembling the vehicle to physically access ECU board-level interfaces (UART, JTAG, SWD, I2C, SPI, audio/video bus) |

### 5. Equipment (设备)

Tools and equipment needed.

| English | 中文 | Criteria |
|---|---|---|
| Standard | 标准 | Readily available (laptop, basic tools) |
| Specialized | 专业 | Not publicly available but obtainable (CAN tools, JTAG debugger) |
| Bespoke | 定制 | Custom-built or highly specialized equipment |
| Multiple bespoke | 多种定制 | Several types of custom equipment needed |

### Overall Feasibility Rating Calculation (整体可行性评级)

Each parameter has a hidden numeric weight. Sum all five to get the attack potential score, then map to a feasibility rating.

**Numeric weights:**

| Parameter | Value → Score |
|---|---|
| Elapsed Time | ≤1 Day/≤1天→0, ≤1 Week/≤1周→1, ≤1 Month/≤1个月→4, ≤6 Months/≤6个月→17, >6 Months/>6个月→19 |
| Specialist Expertise | Layman/外行→0, Proficient/熟练→3, Expert/专家→6, Multiple experts/多领域专家→8 |
| Knowledge of Item | Public/公开→0, Restricted/受限→3, Confidential/机密→7, Strictly confidential/严格机密→11 |
| Window of Opportunity | Unlimited/无限制→0, Easy/容易→1, Moderate/中等→4, Difficult/困难→10 |
| Equipment | Standard/标准→0, Specialized/专业→4, Bespoke/定制→7, Multiple bespoke/多种定制→9 |

**Rating thresholds:**

| Total Score | English | 中文 |
|---|---|---|
| 0–13 | High | 高 |
| 14–19 | Medium | 中 |
| 20–24 | Low | 低 |
| ≥25 | Very Low | 很低 |

Include the `total_score` (numeric sum) in the output JSON alongside the text rating so the calculation is transparent and verifiable.

## Output JSON Schema

```json
{
  "source_threats": "<path to threat scenario JSON file>",
  "source_document": "<path to original MD file>",
  "system_function": "<name of the system function>",
  "attack_vectors": [
    {
      "id": "AV-001",
      "threat_id": "TS-001",
      "asset_id": "F-001",
      "asset_name": "Asset name",
      "attack_surface": "debug_interface | vehicle_bus | wireless | software | physical",
      "attack_steps": "1. description of first action; 2. description of second action; 3. description of third action (optional)",
      "feasibility": {
        "elapsed_time": "Use language-matched enum (EN: ≤1 Day | ≤1 Week | ≤1 Month | ≤6 Months | >6 Months) (ZH: ≤1天 | ≤1周 | ≤1个月 | ≤6个月 | >6个月)",
        "specialist_expertise": "Use language-matched enum (EN: Layman | Proficient | Expert | Multiple experts) (ZH: 外行 | 熟练 | 专家 | 多领域专家)",
        "knowledge_of_item": "Use language-matched enum (EN: Public | Restricted | Confidential | Strictly confidential) (ZH: 公开 | 受限 | 机密 | 严格机密)",
        "window_of_opportunity": "Use language-matched enum (EN: Unlimited | Easy | Moderate | Difficult) (ZH: 无限制 | 容易 | 中等 | 困难)",
        "equipment": "Use language-matched enum (EN: Standard | Specialized | Bespoke | Multiple bespoke) (ZH: 标准 | 专业 | 定制 | 多种定制)",
        "total_score": 0,
        "feasibility_rating": "Use language-matched enum (EN: High | Medium | Low | Very Low) (ZH: 高 | 中 | 低 | 很低)"
      }
    }
  ]
}
```

## Step-by-step Instructions

### Step 1 — Read inputs

1. Read the threat scenario JSON file.
2. Read the original system function MD file (path from the `source_document` field).

### Step 2 — Generate attack vectors

For each threat scenario, generate one or more attack vectors:
- Check the asset inventory to determine which attack surfaces are actually available (explicitly identified interfaces, buses, and hardware)
- For each available attack surface relevant to the threat, create an attack vector with 2–3 concrete sequential steps
- Only use ECU debug interfaces if they are explicitly listed in the asset inventory or system function document
- Steps should be actionable and specific, referencing the actual identified interfaces (e.g., if CAN is identified: "通过OBD-II接口连接CAN总线分析工具" rather than a generic "Access vehicle network")

### Step 3 — Evaluate feasibility

For each attack vector, rate all five feasibility parameters using the text enumeration values from the rating tables above. Based on the combined assessment, assign an overall feasibility rating (High / Medium / Low / Very Low / Infeasible).

### Step 4 — Assign IDs

Number attack vectors sequentially: `AV-001`, `AV-002`, etc. Multiple attack vectors can reference the same threat ID.

### Step 5 — Write the JSON

Write to the same directory as the threat JSON, named `<threat_basename_without_threats>_attack_vectors.json`.
For example: if threats file is `xxx_threats.json`, output is `xxx_attack_vectors.json`.

### Step 6 — Report

Tell the user:
- Total number of attack vectors generated
- Distribution of feasibility ratings
- Breakdown by attack surface type
- The output file path
- **Any potential attack surfaces that are common but were NOT documented** in the asset inventory (e.g., "Debug interfaces such as JTAG/UART were not identified — if they exist, additional attack vectors should be considered"). Ask the user whether these undocumented interfaces exist so additional attack vectors can be generated if needed. Do NOT generate attack vectors for them until the user confirms.
