---
name: threat-scenario-identification
description: Generate STRIDE-based cybersecurity threat scenarios from an asset inventory JSON file. Reads asset descriptions produced by the asset-identification skill, applies category-specific STRIDE threat types, and outputs structured threat scenarios to a JSON file. Use when the user wants to perform threat analysis, generate STRIDE threat scenarios, or identify cybersecurity threats for ECU system functions.
---

# Threat Scenario Identification

Generate cybersecurity threat scenarios for ECU system assets using the STRIDE threat model.

## Inputs

1. **Asset JSON file** — produced by the asset-identification skill, containing functional, data, communication, and hardware/firmware assets.
2. **Original system function MD file** — referenced in the asset JSON's `document` field. Read this file to understand the system context and generate accurate, specific threat scenarios.

## Language Rule

**The output JSON must use the same language as the asset JSON input.** If asset names and descriptions are in Chinese, threat scenarios must be in Chinese. If in English, output in English.

**Exception:** The `stride_type` field must **always** use the English enum values from the schema (`Spoofing`, `Tampering`, `Repudiation`, `Information Disclosure`, `Denial of Service`, `Elevation of Privilege`), regardless of the output language. This ensures consistent downstream processing. Only free-text fields (`threat_description`, `asset_name`) follow the language rule.

## STRIDE Threat Mapping

Apply specific STRIDE threat types to each asset category:

| Asset Category | Threat Types to Analyze |
|---|---|
| **Functional** | Tampering, Denial of Service (DoS), Spoofing |
| **Data** | Information Disclosure, Tampering, Repudiation |
| **Communication** | Spoofing, Tampering, Denial of Service (DoS) |
| **Hardware/Firmware** | Tampering, Elevation of Privilege, Information Disclosure |

Do NOT analyze threat types outside the mapping above for each category.

## No Assumption Rule

**Threat scenarios must only reference interfaces, buses, protocols, components, and attack surfaces that are explicitly present in the asset inventory or the original system function document.** Do NOT introduce interfaces or components that were not identified during asset identification. For example:
- If the asset inventory has no CAN bus communication asset, do not describe a threat involving CAN bus message injection.
- If no wireless interface was identified, do not describe a threat involving Bluetooth or Wi-Fi exploitation.
- If the threat requires an interface or component not present in the asset inventory, skip that threat or describe it at the abstraction level of the identified assets.

**If the asset descriptions are ambiguous** and you cannot determine a realistic threat scenario without additional context, note the ambiguity in the Step 5 report and ask the user for clarification.

## Threat Scenario Requirements

Each threat scenario must:
- Describe a concrete attack vector targeting the specific asset
- **Only reference interfaces, buses, and components that exist in the asset inventory**
- **Include the affected cybersecurity aspect directly in the threat description** (e.g., "...compromising the integrity of..." or "...影响了该数据的完整性..."). Do NOT use a separate JSON property for the affected aspect. Do NOT emphasize the aspect with bold/asterisks — write it as plain text within the sentence.
- Be specific to the system function context (not generic boilerplate)
- Reference the asset it targets via asset ID

## Output JSON Schema

```json
{
  "source_assets": "<path to asset JSON file>",
  "source_document": "<path to original MD file>",
  "system_function": "<name of the system function>",
  "threat_scenarios": [
    {
      "id": "TS-001",
      "asset_id": "F-001",
      "asset_name": "Asset name from the asset file",
      "asset_category": "functional | data | communication | hardware_firmware",
      "stride_type": "Spoofing | Tampering | Repudiation | Information Disclosure | Denial of Service | Elevation of Privilege",
      "threat_description": "Concrete description of the threat scenario, including what cybersecurity aspect (integrity/availability/confidentiality/authenticity/non-repudiation) is affected."
    }
  ]
}
```

## Step-by-step Instructions

### Step 1 — Read inputs

1. Read the asset JSON file.
2. Read the original system function MD file (path from the `document` field in the asset JSON).

### Step 2 — Generate threat scenarios per asset

For each asset in the JSON, apply the STRIDE threat types mapped to its category:

**For each functional asset** (F-xxx), generate scenarios for:
- **Tampering**: How could an attacker alter the function's behavior or logic?
- **Denial of Service**: How could an attacker prevent the function from operating?
- **Spoofing**: How could an attacker impersonate or fake this function?

**For each data asset** (D-xxx), generate scenarios for:
- **Information Disclosure**: How could the data be exposed to unauthorized parties?
- **Tampering**: How could the data be maliciously modified?
- **Repudiation**: How could actions on this data be denied or unattributable?

**For each communication asset** (C-xxx), generate scenarios for:
- **Spoofing**: How could an attacker forge messages on this interface?
- **Tampering**: How could messages be altered in transit?
- **Denial of Service**: How could the interface be disrupted or flooded?

**For each hardware/firmware asset** (H-xxx), generate scenarios for:
- **Tampering**: How could the hardware/firmware be physically or logically modified?
- **Elevation of Privilege**: How could an attacker gain unauthorized access/control?
- **Information Disclosure**: How could sensitive data stored on the hardware be extracted?

### Step 3 — Assign IDs

Number threat scenarios sequentially: `TS-001`, `TS-002`, etc.

### Step 4 — Write the JSON

Write to the same directory as the asset JSON, named `<asset_basename_without_assets>_threats.json`.
For example: if assets file is `xxx_assets.json`, output is `xxx_threats.json`.

### Step 5 — Report

Tell the user:
- Total number of threat scenarios generated
- Breakdown by asset category and STRIDE type
- The output file path
- **Any unclear or ambiguous points** where asset descriptions lacked sufficient detail to generate a specific threat. List each unclear point and ask the user for clarification. Do NOT fill gaps with assumed interfaces or components.
