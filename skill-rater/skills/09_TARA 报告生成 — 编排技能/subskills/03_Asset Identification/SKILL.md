---
name: asset-identification
description: Analyze ECU system function documents (PDF, XLSX, DOCX, etc.) in a folder and extract abstract-level assets including functional assets, data, communication interfaces, and hardware/firmware components. Hardware and physical interface information is extracted from a drawio hardware block diagram. Generates a structured JSON asset inventory. Use when the user wants to identify system assets, extract architectural elements from requirements documents, or perform asset identification on ECU function descriptions.
---

# Asset Identification

Extract and abstract system-level assets from an ECU system function described by a folder of requirement documents, with hardware architecture referenced from a drawio item definition diagram.

## Input

1. **System function folder** — a directory containing requirement documents for one system function. Files may be PDF, XLSX, XLSM, DOCX, or other formats. Sub-folders named `00_old` (or similar archive patterns) should be skipped.
2. **Hardware block diagram (drawio file)** — an XML-based `.drawio` file containing the ECU's hardware architecture (item definition). The first `<diagram>` page whose name contains "Item Definition" (excluding pages with "Template" in the name) is the reference page. This file is shared across all system functions.
3. **Output folder** — the directory where the assets JSON file will be written. This MUST be separate from the input folder (do NOT write generated files into the requirements folder). If not explicitly provided by the caller, write to the same directory as the input folder.

## Workflow

1. **Read** all documents in the system function folder.
   - **PDF files**: use the Read tool (which supports PDF-to-text conversion).
   - **XLSX / XLSM files**: use Python with `openpyxl` to read sheet contents. Focus on sheets that contain requirement text, signal lists, or interface descriptions. Skip empty or purely formatting sheets.
   - **DOCX files**: use Python with `python-docx` to extract paragraph and table text.
   - **Other formats**: skip with a note in the Step 8 report.
2. **Read** the drawio file using the Read tool. Parse the XML to extract from the item definition page:
   - All **hardware blocks** (mxCell elements with `value` attributes — components like SoC, MCU, PHY, Switch, Flash, PMIC, Connector, etc.)
   - All **connections/edges** between blocks (mxCell elements with `edge="1"` and their `source`/`target` attributes) and their **interface labels** (child edgeLabel elements — e.g., SGMII, UART, SPI, GPIO, Ethernet Data, CAN, Camera Frames, etc.)
   - All **external entities** in the operational environment (blocks outside the ECU boundary — e.g., CEM, RADAR, Diagnostic Client, OTA Backend, etc.)
3. **Analyze** the documents to identify assets in these categories:
   - **Functional Assets**: system functions, features, control logic, and operational modes — extracted from the folder documents
   - **Data Assets**: signals, status values, configuration parameters, and persistent data — extracted from the folder documents
   - **Communication Assets**: internal/external interfaces, buses, protocols, and message groups — extracted from BOTH the folder documents (for logical/application-level interfaces like SOME/IP services, diagnostic sessions) AND the drawio (for physical interfaces like Ethernet, CAN FD, UART, SPI)
   - **Hardware/Firmware Assets**: the ECU/SoC, MCU, local peripherals, storage, debug interfaces — extracted primarily from the drawio, scoped to components relevant to this system function
4. **Abstract**: merge similar or same-kind elements into a single abstract element. For example:
   - Multiple CAN signals → one abstract "车身状态信号" group
   - Multiple Ethernet PHY components → one abstract "以太网物理层" element
   - Similar sub-functions → one higher-level functional asset
5. **Write** the result as a JSON file in the designated output folder, named `<function_folder_basename>_assets.json`. Create the output folder if it does not exist.

## Language Rule

**The output JSON must use the same language as the input documents.** If the input documents are primarily in Chinese, all `name`, `description`, and `children` fields must be in Chinese. If the input is in English, output in English.

## Scope Rule

**Only identify assets that belong to the ECU system function itself.** Do not include external reference documents, linked requirement documents, or assets from other systems mentioned only as references. Focus exclusively on functions, data, interfaces, and hardware described within the documents' own scope.

## Hardware/Firmware Scope Rule

**Hardware/firmware assets come from the drawio item definition, scoped to this function.** Include only hardware components and interfaces from the drawio that are relevant to the system function described in the folder documents. For example:
- An OTA function uses: SoC, MCU, UFS storage, eMMC, Boot Flash, Ethernet (for download), CAN FD (for flashing other ECUs), and the CONN 52pin connector.
- A diagnostic function uses: SoC, MCU, Ethernet interface, CAN interface, UART debug, and the CONN 52pin connector.
- Do NOT include ALL hardware from the drawio — only the subset that this specific function touches.

## No Assumption Rule

**Only extract assets that are explicitly stated or directly evident in the input documents or the drawio.** Do NOT infer, assume, or add any interfaces, buses, protocols, components, or subsystems that are not mentioned in either source. For example:
- If the documents do not mention CAN bus and the function has no CAN-related behavior, do not add CAN communication assets even though CAN FD exists in the drawio.
- If the drawio shows a JTAG interface but the documents never reference debug, still include JTAG as a hardware asset if it exists on the ECU boundary (debug interfaces are always relevant from a cybersecurity perspective).

**Exception for debug interfaces**: UART and JTAG debug interfaces shown in the drawio SHOULD always be included as hardware/firmware assets for every system function, because they represent attack surfaces regardless of whether the function documents mention them.

**If the documents are ambiguous or missing details**, note each ambiguity in the Step 8 report and ask the user for clarification before making assumptions.

## Traceability Rule

**Every data, communication, and hardware/firmware asset must be linked to at least one functional asset.** Each non-functional asset must include a `related_functions` field listing the IDs of the functional assets it supports. If a non-functional asset cannot be linked to any identified function, it should NOT be included (except for debug interfaces, which are linked to all functions as a shared attack surface).

## Abstraction Rules

- **Functional assets**: identify exactly **1** functional asset per system function. This single asset represents the entire system function at the highest abstraction level, with all sub-functions listed as `children`.
- **Data assets**: group aggressively into **3–5** abstract data elements. Combine all signals, parameters, and persistent data into a few high-level groups.
- **Communication assets**: group aggressively into **3–5** abstract communication elements. Combine interfaces that serve similar purposes (e.g., all vehicle bus interfaces into one, all cloud/remote interfaces into one).
- **Hardware/firmware assets**: group aggressively into **3–5** abstract hardware elements. Combine processors, storage, peripherals, and debug interfaces into a few high-level groups.
- **Total target**: aim for **~12–16 total abstract assets** across all categories.
- Each abstract element must have: `id`, `name`, `type`, `category`, `description`, `children` (listing the concrete items it abstracts), and for non-functional assets, `related_functions` (list of functional asset IDs).

## Output JSON Schema

```json
{
  "document_folder": "<source folder path>",
  "hw_reference": "<drawio file path>",
  "system_function": "<name of the system function>",
  "source_files": ["file1.pdf", "file2.xlsx"],
  "assets": {
    "functional": [
      {
        "id": "F-001",
        "name": "Abstract function name",
        "type": "function",
        "category": "functional",
        "description": "What this function group does",
        "children": ["Concrete function A", "Concrete function B"]
      }
    ],
    "data": [
      {
        "id": "D-001",
        "name": "Abstract data group name",
        "type": "status_signal | config_parameter | persistent_data",
        "category": "data",
        "description": "What data this group represents",
        "children": ["Signal X", "Signal Y"],
        "related_functions": ["F-001"]
      }
    ],
    "communication": [
      {
        "id": "C-001",
        "name": "Abstract communication element",
        "type": "internal_interface | external_interface | bus | protocol",
        "category": "communication",
        "description": "What this communication path does",
        "children": ["Interface A", "Interface B"],
        "related_functions": ["F-001"]
      }
    ],
    "hardware_firmware": [
      {
        "id": "H-001",
        "name": "Abstract hardware element",
        "type": "ecu | soc | mcu | display | storage | firmware | debug_interface | connector | peripheral",
        "category": "hardware_firmware",
        "description": "What hardware this group represents",
        "children": ["Component A", "Component B"],
        "related_functions": ["F-001", "F-002"]
      }
    ]
  }
}
```

## Step-by-step Instructions

### Step 1 — Read the documents

Read all files in the system function folder:
- For each PDF: use the Read tool to extract text content
- For each XLSX/XLSM: use Python with openpyxl to read relevant sheets; print key content (signal names, interface descriptions, requirement text)
- For each DOCX: use Python with python-docx to extract paragraphs and tables
- Skip sub-folders named `00_old` or similar archive patterns
- Note any files that could not be read in the Step 8 report

Understand the system function described across all documents, including all sub-functions, settings, logic, interfaces, and protocols mentioned.

### Step 2 — Read the drawio hardware block diagram

Read the drawio file (XML format) using the Read tool. From the item definition page:
- Identify all hardware component blocks (nodes with `value` attributes inside `<root>`)
- Identify all connections (edges with `source` and `target` attributes) and their interface labels
- Identify the ECU boundary, operational environment, and external entities
- Build a mental model of the hardware architecture: what components exist, how they connect, and what data flows between them

### Step 3 — Extract raw elements

From the **documents** (Step 1):
- Every feature/function mentioned
- Every signal, status, or parameter
- Every logical interface, protocol, or service explicitly mentioned (e.g., SOME/IP, DoIP, UDS)

From the **drawio** (Step 2):
- Every hardware component within the ECU boundary
- Every physical interface and bus (Ethernet, CAN FD, UART, SPI, GPIO, etc.)
- Every external entity in the operational environment
- Every debug interface (UART, JTAG)

### Step 4 — Scope and correlate

For each hardware element from the drawio, determine whether it is relevant to THIS system function:
- Does the function use this interface? (e.g., OTA uses Ethernet for downloading, CAN for flashing)
- Does the function run on this processor? (e.g., runs on SoC Linux domain, or MCU, or both)
- Is this a debug interface? (always include for cybersecurity)

Discard hardware elements that have no relationship to the current function.

### Step 5 — Abstract and group

For each category, group related concrete elements:
- Use domain knowledge to decide grouping boundaries
- Name each abstract element clearly
- Write a one-sentence description
- List all children (concrete items) under each abstract element
- For non-functional assets, list related functional asset IDs

### Step 6 — Assign IDs

Use the prefix convention: `F-` for functional, `D-` for data, `C-` for communication, `H-` for hardware/firmware. Number sequentially within each category.

### Step 7 — Write the JSON

Write the JSON file using the schema above. Path: the designated output folder, named `<function_folder_basename>_assets.json`.

### Step 8 — Report

Tell the user:
- How many source files were read and their types
- How many abstract assets were identified per category
- The output file path
- **Any unclear or ambiguous points** in the documents where information was missing (e.g., communication protocol not specified, which processor a function runs on). List each unclear point explicitly and ask the user whether additional context is available. Do NOT fill in the gaps with assumptions.
- **Any files that could not be read** (unsupported format, corrupted, etc.)

## Example

For a system function folder `01_OTA/` containing OTA-related PDFs and XLSX files (total ~13 assets):

**Functional** (1): "OTA升级" (children: 检查更新, 软件下载, 备份刷写, 流式刷写, 安装确认, 预约设置, 软件安装, 异常处理)

**Data** (3): "升级包与校验数据" (children: ECU升级包, Manifest, 签名文件, SHA256哈希值, KMS密钥), "升级任务与状态数据" (children: 任务信息, 升级模式, 升级进度, 安装结果, 配置参数), "车辆状态与ECU信息" (children: 电源模式, 车速, 档位, VIN, 软硬件版本DID)

**Communication** (4): "OTA云端与远程接口" (children: OTA_Server, CDN, TSP, TBOX远程控制, KMS), "车载网络诊断与刷写接口" (children: DoIP/UDS, NFS文件共享, CAN FD刷写通道), "本地用户接口" (children: HMI交互, USB离线升级), "OTA内部模块通信" (children: OTA_Client-HUT, HUT-UA, DA-UA)

**Hardware** (5): "处理器" (children: SoC Orin-Y, MCU TC397), "存储设备" (children: UFS 3.1, eMMC, Boot Flash, SEC Flash), "网络接口硬件" (children: Ethernet PHY/Switch, CAN FD收发器, USB Type-C), "ECU连接器" (children: CONN 52pin), "调试接口" (children: SoC UART/JTAG, MCU UART/JTAG)
