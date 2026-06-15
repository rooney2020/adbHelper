---
name: damage-scenario-identification
description: Generate damage scenarios from cybersecurity threat scenarios. Reads threat scenario JSON produced by the threat-scenario-identification skill, analyzes potential damages for each threat across Safety, Financial, Operational, and Privacy impact categories, and assigns severity ratings. Use when the user wants to assess damage potential, perform impact analysis, or rate threat severity for ECU system functions.
---

# Damage Scenario Identification

Analyze cybersecurity threat scenarios and generate potential damage assessments with impact ratings.

## Inputs

1. **Threat scenario JSON file** — produced by the threat-scenario-identification skill.
2. **Original system function MD file** — referenced in the threat JSON's `source_document` field. Read this file to ground damage descriptions in the actual system function context.

## Language Rule

**The output JSON must use the same language as the threat scenario input.** If threat descriptions are in Chinese, damage descriptions must be in Chinese. If in English, output in English.

## Impact Categories

Assess each threat's potential damage across four categories:

| Category | What to Assess |
|---|---|
| **Safety** | Physical harm to driver, passengers, pedestrians, or other road users caused by the threat being realized |
| **Financial** | Property damage, vehicle damage, theft, repair costs, liability, or monetary loss |
| **Operational** | Degraded or lost vehicle functionality, user inconvenience, service disruption, reduced usability |
| **Privacy** | Exposure of personal data, driving behavior, user preferences, location, or identity information |

## Severity Ratings

Rate each impact category using one of four levels. **Use the language-matched value corresponding to the input system function language.**

| English | 中文 | Criteria |
|---|---|---|
| **Severe** | **严重** | Life-threatening injury or fatal; catastrophic financial loss; complete loss of vehicle function; mass personal data breach |
| **Major** | **重大** | Serious injury; significant financial loss; major function degradation affecting driving; sensitive personal data exposed |
| **Moderate** | **中等** | Minor injury possible; moderate financial loss; noticeable function degradation not affecting driving safety; limited personal data exposed |
| **Negligible** | **可忽略** | No injury; minimal or no financial impact; minor inconvenience; no meaningful personal data exposure |

## Description Format Rule

**The `damage_description` field must directly describe the damage consequences without referencing the threat ID or using preambles like "若威胁TS-xxx被成功利用" or "If threat TS-xxx is exploited."** The description should be self-contained: state what damage occurs, which dimensions are affected, and the specific impact on the system function — without repeating or cross-referencing threat identifiers.

## No Assumption Rule

**Damage descriptions must only reference system capabilities, interfaces, and components that are explicitly described in the original system function document or identified in the threat scenario.** Do NOT assume downstream effects on systems or components not mentioned in the document. For example:
- If the document does not mention ADAS or autonomous driving, do not describe damage scenarios involving loss of autonomous driving capability.
- If the document does not mention personal data collection, do not assume privacy-related damage beyond what the system actually handles.

**If the threat's potential damage depends on system context not described in the document**, note it in the Step 6 report and ask the user for clarification.

## Rating Guidelines

- Rate based on the **worst realistic outcome** if the threat is successfully exploited.
- Consider the specific system function context — a threat to a door lock has different safety implications than a threat to ambient lighting.
- If a category is genuinely not applicable to a threat, rate it as Negligible.
- Be consistent: similar threats on similar assets should receive similar ratings.

## Output JSON Schema

```json
{
  "source_threats": "<path to threat scenario JSON file>",
  "source_document": "<path to original MD file>",
  "system_function": "<name of the system function>",
  "damage_scenarios": [
    {
      "id": "DS-001",
      "threat_id": "TS-001",
      "asset_id": "F-001",
      "asset_name": "Asset name",
      "threat_description": "Copied from the threat scenario for reference",
      "damage_description": "Description of what damage could result if this threat is realized, covering relevant impact dimensions",
      "impact_ratings": {
        "safety": "Language-matched (EN: Severe|Major|Moderate|Negligible) (ZH: 严重|重大|中等|可忽略)",
        "financial": "Language-matched (EN: Severe|Major|Moderate|Negligible) (ZH: 严重|重大|中等|可忽略)",
        "operational": "Language-matched (EN: Severe|Major|Moderate|Negligible) (ZH: 严重|重大|中等|可忽略)",
        "privacy": "Language-matched (EN: Severe|Major|Moderate|Negligible) (ZH: 严重|重大|中等|可忽略)"
      }
    }
  ]
}
```

## Step-by-step Instructions

### Step 1 — Read inputs

1. Read the threat scenario JSON file.
2. Read the original system function MD file (path from the `source_document` field).

### Step 2 — Generate damage scenarios

For each threat scenario, analyze and describe the potential damage:

- What concrete harm could occur if this threat is successfully exploited?
- How does the damage manifest in the context of the specific system function?
- Cover all relevant impact dimensions (safety, financial, operational, privacy) within the damage description.

### Step 3 — Rate impact categories

For each damage scenario, assign a severity rating (Severe / Major / Moderate / Negligible) to each of the four impact categories based on the rating criteria and guidelines above.

### Step 4 — Assign IDs

Number damage scenarios sequentially: `DS-001`, `DS-002`, etc. Each maps 1:1 to a threat scenario.

### Step 5 — Write the JSON

Write to the same directory as the threat JSON, named `<threat_basename_without_threats>_damages.json`.
For example: if threats file is `xxx_threats.json`, output is `xxx_damages.json`.

### Step 6 — Report

Tell the user:
- Total number of damage scenarios generated
- Distribution of severity ratings across categories
- The output file path
- **Any unclear points** where the system function document lacked sufficient detail to assess damage (e.g., "Document does not specify whether personal data is stored locally — privacy impact may be underestimated"). Ask the user for clarification on each unclear point. Do NOT assume capabilities or data handling not described in the document.
