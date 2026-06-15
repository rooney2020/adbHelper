---
name: risk-value-determination
description: Determine risk values by combining attack feasibility ratings with damage impact ratings. Reads attack vector JSON and damage scenario JSON, cross-references them via threat ID, and computes a numeric risk value using a predefined risk matrix. Use when the user wants to calculate risk levels, perform risk assessment, or determine cybersecurity risk values for ECU system functions.
---

# Risk Value Determination

Determine numeric risk values for each attack vector by combining its feasibility rating with the highest impact rating from the corresponding damage scenario.

## Inputs

1. **Attack vector JSON file** — produced by the attack-vector-identification skill.
2. **Damage scenario JSON file** — produced by the damage-scenario-identification skill.

Both files share `threat_id` as the linking key.

## Language Rule

**The output JSON must use the same language as the input files.** If inputs are in Chinese, output in Chinese.

## Risk Calculation Method

### Step A — Calculate weighted impact rating

For each attack vector, find the corresponding damage scenario (matched by `threat_id`). From that damage scenario's `impact_ratings`, compute a **weighted impact rating** using the following method:

**Numeric values for each impact level:**

| Level | EN | ZH | Value |
|---|---|---|---|
| Severe | Severe | 严重 | 2.0 |
| Major | Major | 重大 | 1.5 |
| Moderate | Moderate | 中等 | 1.0 |
| Negligible | Negligible | 可忽略 | 0.0 |

**Weights for each impact category:**

| Category | Weight |
|---|---|
| Safety (安全) | 35% |
| Financial (财务) | 15% |
| Operational (操作) | 30% |
| Privacy (隐私) | 20% |

**Weighted sum formula:**

```
weighted_sum = safety_value × 0.35 + financial_value × 0.15 + operational_value × 0.30 + privacy_value × 0.20
```

**Bottom alignment (floor mapping) to impact level:**

| Weighted Sum Range | Impact Level |
|---|---|
| ≥ 2.0 | Severe (严重) |
| ≥ 1.5 and < 2.0 | Major (重大) |
| ≥ 1.0 and < 1.5 | Moderate (中等) |
| < 1.0 | Negligible (可忽略) |

Record both the weighted sum (for traceability) and the resulting impact level.

### Step B — Look up risk value from the risk matrix

Use the highest impact rating and the attack vector's feasibility rating to determine the risk value:

| Impact ↓ / Feasibility → | Very Low (很低) | Low (低) | Medium (中) | High (高) |
|---|---|---|---|---|
| **Severe (严重)** | 2 | 3 | 4 | 5 |
| **Major (重大)** | 1 | 2 | 3 | 4 |
| **Moderate (中等)** | 1 | 2 | 2 | 1 |
| **Negligible (可忽略)** | 1 | 1 | 1 | 1 |

## Output JSON Schema

```json
{
  "source_attack_vectors": "<path to attack vector JSON file>",
  "source_damages": "<path to damage scenario JSON file>",
  "system_function": "<name of the system function>",
  "risk_values": [
    {
      "id": "RV-001",
      "attack_vector_id": "AV-001",
      "threat_id": "TS-001",
      "asset_id": "F-001",
      "asset_name": "Asset name",
      "attack_feasibility_rating": "Language-matched feasibility rating from attack vector",
      "highest_impact_rating": "Language-matched weighted impact rating (Severe|Major|Moderate|Negligible or 严重|重大|中等|可忽略)",
      "weighted_impact_sum": 0.0,
      "risk_value": 0
    }
  ]
}
```

## Step-by-step Instructions

### Step 1 — Read inputs

1. Read the attack vector JSON file.
2. Read the damage scenario JSON file.

### Step 2 — Cross-reference by threat ID

For each attack vector, find the corresponding damage scenario using `threat_id`. Multiple attack vectors may map to the same damage scenario (same threat, different attack paths).

### Step 3 — Calculate weighted impact rating

For each damage scenario's `impact_ratings`:
1. Convert each category's rating to its numeric value (Severe=2.0, Major=1.5, Moderate=1.0, Negligible=0.0)
2. Compute weighted sum: safety×0.35 + financial×0.15 + operational×0.30 + privacy×0.20
3. Apply bottom alignment to determine the impact level:
   - ≥2.0 → Severe, ≥1.5 → Major, ≥1.0 → Moderate, <1.0 → Negligible
4. Record the weighted sum and the resulting impact level

### Step 4 — Calculate risk value

Using the risk matrix, look up the risk value from the intersection of:
- Row: highest impact rating
- Column: attack feasibility rating

### Step 5 — Assign IDs

Number risk values sequentially: `RV-001`, `RV-002`, etc. One per attack vector.

### Step 6 — Write the JSON

Write to the same directory as the input files, named `<common_basename>_risk_values.json`.
For example: if attack vectors file is `xxx_attack_vectors.json`, output is `xxx_risk_values.json`.

### Step 7 — Report

Tell the user:
- Total number of risk values
- Distribution of risk values (count per value 1–5)
- The output file path
- Any assumptions made
