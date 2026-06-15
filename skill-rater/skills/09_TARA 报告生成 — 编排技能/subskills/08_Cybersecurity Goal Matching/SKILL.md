---
name: cybersecurity-goal-matching
description: Match high-risk threats to predefined cybersecurity goals and generate cybersecurity claims for low-risk threats. Reads a cybersecurity goals MD file, risk value JSON files, attack vector JSON files, and threat JSON files. For risk values >= 3, finds matching cybersecurity goals that can mitigate the threat. For risk values < 3, generates consolidated cybersecurity claims. Use when the user wants to map TARA results to cybersecurity goals or generate cybersecurity claims for risk acceptance.
---

# Cybersecurity Goal Matching

Match high-risk attack vectors to predefined cybersecurity goals and generate consolidated cybersecurity claims for low-risk threats.

## Inputs

1. **Cybersecurity goals MD file** — a Markdown file containing a table with cybersecurity goal IDs and descriptions. Each goal is an abstract cybersecurity requirement for an ECU.
2. **Risk value JSON files** — one per system function, produced by the risk-value-determination skill.
3. **Attack vector JSON files** — one per system function, produced by the attack-vector-identification skill. Referenced via the risk value JSON's `source_attack_vectors` field.
4. **Threat scenario JSON files** — one per system function, produced by the threat-scenario-identification skill. Referenced via the attack vector JSON's `source_threats` field.

## Language Rule

**The output JSON must use the same language as the input risk value / threat files.** If inputs are in Chinese, output in Chinese.

## No Assumption Rule

**Only match cybersecurity goals based on information explicitly present in the attack vector steps, attack surface, threat description, and asset information.** Do NOT assume attack vectors use interfaces or components that are not described in the attack steps. If the attack path is ambiguous and could map to multiple goals, include all plausible matches but note the ambiguity.

**If any matching is unclear**, list the specific unclear points in the Step 7 report and ask the user for clarification.

## Step-by-step Instructions

### Step 1 — Read the cybersecurity goals file

Parse the goals file (CSV or MD) to extract all cybersecurity goal IDs and their descriptions into a lookup structure. For CSV: use the `cs_goal_id` and `cs_goal` columns. For MD: parse the markdown table.

### Step 2 — Read risk value, attack vector, and threat files

For each system function:
1. Read the risk value JSON file.
2. Read the attack vector JSON file (path from `source_attack_vectors` in the risk value JSON).
3. Read the threat scenario JSON file (path from `source_threats` in the attack vector JSON).

Build lookup maps:
- `attack_vector_id` → attack vector object (including `attack_steps`, `attack_surface`, `feasibility`)
- `threat_id` → threat scenario object (including `threat_description`, `stride_type`, `asset_category`)

### Step 3 — Separate high-risk and low-risk entries

Partition the risk values into two groups:
- **High-risk**: `risk_value >= 3` → proceed to goal matching (Step 4)
- **Low-risk**: `risk_value < 3` → further check below, then proceed to either Step 4 or Step 5

**Debug interface rule**: Any threat whose attack vector uses a debug interface (`debug_interface` attack surface — JTAG, UART, ADB, SSH, SWD, serial console, etc.) must ALWAYS be matched to cybersecurity goals, regardless of risk value. Debug interface threats are never acceptable as claims because they must be mitigated (e.g., disable the interface, add authentication/authorization). Move all debug-interface low-risk entries to the goal matching group (Step 4).

### Step 4 — Match high-risk entries to cybersecurity goals

For each risk value entry with `risk_value >= 3`:

1. Look up the corresponding attack vector (by `attack_vector_id`)
2. Look up the corresponding threat scenario (by `threat_id`)
3. Analyze the **attack_steps**, **attack_surface**, **threat_description**, and **asset information** to determine which cybersecurity goals can mitigate this threat

**Matching criteria** — match based on what the attack exploits or targets:

| Attack characteristic | Likely matching goals |
|---|---|
| Attack uses vehicle communication buses (CAN, Ethernet, LIN) | Goals related to bus security, message authentication, whitelist control |
| Attack uses wireless interfaces (WiFi, Bluetooth) | Goals related to wireless protocol security |
| Attack uses debug interfaces (JTAG, UART, ADB, SSH) | Goals related to debug interface access control |
| Attack involves data tampering on buses | Goals related to data integrity, message authentication |
| Attack involves spoofing/impersonation | Goals related to identity authentication |
| Attack involves information disclosure | Goals related to data encryption, access control |
| Attack exploits software vulnerabilities | Goals related to application security, OS access control, secure boot |
| Attack involves physical hardware access | Goals related to PCB physical security |
| Attack involves privilege escalation | Goals related to OS access control, user permission management |
| Attack involves firmware tampering | Goals related to secure boot, code signing, integrity protection |
| Attack involves configuration data manipulation | Goals related to configuration data integrity, access control |
| Attack involves DoS on communication | Goals related to DoS detection and handling |

Each high-risk entry may match **one or more** cybersecurity goals. Include all applicable goals.

### Step 5 — Generate global cybersecurity claims

Cybersecurity claims are **global** — they are NOT specific to a single system function. A single claim can be referenced by low-risk entries from any system function. This step produces a standalone MD file that all per-function JSON outputs reference.

**When to create vs. reuse:** If a global claims file already exists from a previous run, read it first. Only add new claims if the existing ones do not cover a low-risk entry's characteristics. Never duplicate a claim that already exists.

**Grouping strategy — group across ALL system functions:**
- Group by the **abstract attack pattern**: similar `attack_surface` + similar `stride_type` combination
- Do NOT group by specific asset or system function — claims must be reusable across functions
- Each claim should cover as many similar low-risk threats as possible across all functions
- Aim for a small total number of claims (typically 5–15 for an entire ECU)

**Claim requirements:**
- Each claim has a unique ID (`CC-001`, `CC-002`, etc.)
- Each claim has a concise, reusable description that justifies risk acceptance from these perspectives:
  - **Attack difficulty**: required expertise, elapsed time, knowledge needed
  - **Attack cost**: equipment and access conditions required by the attacker
  - **Countermeasure cost**: disproportionate cost to mitigate vs. the low residual risk
- The description must be **generic and reusable** — it should NOT reference specific assets, functions, or system names. It should describe the abstract attack pattern and why it is acceptably low risk.
- The description must use the same language as the input

**Output:** Write the global claims file as a Markdown file at the same level as the per-function output folders.

Filename: `cybersecurity_claims.md`
Location: the parent folder of the per-function output directories (i.e., the output/workspace folder of the TARA pipeline, NOT the requirements folder).

**Claims MD file format:**

```markdown
# 网络安全声明 / Cybersecurity Claims

| 声明ID | 声明描述 |
|---|---|
| CC-001 | Concise reusable claim description... |
| CC-002 | ... |
```

### Step 6 — Write outputs

**6a. Write the global claims MD file** (once, shared by all system functions):

Location: `<input_folder>/cybersecurity_claims.md`

**6b. Write one JSON file per system function** to the same directory as the risk value file.

Filename: `<risk_value_basename_without_risk_values>_goal_matching.json`
For example: if risk values file is `xxx_risk_values.json`, output is `xxx_goal_matching.json`.

The per-function JSON references claim IDs from the global claims file — it does NOT embed claim descriptions.

## Output JSON Schema (per-function)

```json
{
  "source_risk_values": "<path to risk value JSON file>",
  "source_cybersecurity_goals": "<path to cybersecurity goals MD file>",
  "source_cybersecurity_claims": "<path to global cybersecurity_claims.md>",
  "system_function": "<name of the system function>",
  "goal_matches": [
    {
      "risk_value_id": "RV-001",
      "attack_vector_id": "AV-001",
      "threat_id": "TS-001",
      "asset_id": "F-001",
      "asset_name": "Asset name",
      "risk_value": 3,
      "attack_surface": "vehicle_bus",
      "attack_steps_summary": "Brief summary of the attack path",
      "matched_goals": [
        {
          "goal_id": "CS_GOAL_10",
          "goal_description": "Goal description from the MD file",
          "matching_reason": "Why this goal mitigates this specific threat"
        }
      ]
    }
  ],
  "claim_references": [
    {
      "risk_value_id": "RV-005",
      "attack_vector_id": "AV-005",
      "threat_id": "TS-005",
      "asset_id": "F-002",
      "asset_name": "Asset name",
      "risk_value": 1,
      "claim_id": "CC-001"
    }
  ]
}
```

### Step 7 — Report

Tell the user:
- Total high-risk entries matched to goals, and how many unique goals were referenced
- Total low-risk entries, and how many global claims were generated or reused
- Distribution of matched goals (which goals appear most frequently)
- The global claims file path and per-function output file paths
- **Any unclear or ambiguous points** where the attack path could not be confidently matched to a goal, or where threat grouping for claims was uncertain. List each unclear point and ask the user for clarification.
