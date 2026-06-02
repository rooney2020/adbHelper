import { Fragment, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";

// Types (structural duplicates - checked against Window["adbHelperApi"] via renderOutputPreview callers)
interface ParsedDeviceEntry {
  serial: string;
  state: string;
  metadata: Record<string, string>;
}

interface HistoryItem {
  record_id: string;
  device: string;
  device_name: string;
  command_id: string;
  command_title: string;
  raw?: string;
  args?: string[];
  status: string;
  executedCommand?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  message?: string;
  duration?: number;
  created_at?: number;
  source?: string;
}

interface RunResult {
  command: string;
  record_id: string;
  device: string;
  device_name: string;
  command_id: string;
  command_title: string;
  raw?: string;
  args?: string[];
  status: string;
  executedCommand?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  message?: string;
  duration?: number;
}

interface DiffTextSegment {
  text: string;
  changed: boolean;
}

interface DiffLineRow {
  leftLineNumber: number | null;
  rightLineNumber: number | null;
  leftText: string;
  rightText: string;
  leftSegments: DiffTextSegment[];
  rightSegments: DiffTextSegment[];
  kind: "same" | "changed" | "added" | "removed";
}

interface PermissionSection {
  title: string;
  groups: string[];
  permissions: string[];
}

type DiffTargetId = "current" | string;

// Shared utility functions (duplicated from App.tsx for independence)
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLogcatSearchRegex(pattern: string, enabled: boolean) {
  if (!enabled || !pattern.trim()) {
    return null;
  }
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

export function highlightText(text: string, query: string, regexEnabled = false) {
  if (!query.trim()) {
    return text;
  }
  const pattern = regexEnabled
    ? buildLogcatSearchRegex(query, true)
    : new RegExp(escapeRegExp(query), "gi");
  if (!pattern) {
    return text;
  }
  const flags = Array.from(new Set(`${pattern.flags}g`.split(""))).join("");
  const matcher = new RegExp(pattern.source, flags);
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let guard = 0;
  while ((match = matcher.exec(text)) !== null && guard < 10000) {
    guard += 1;
    const matchedText = match[0] ?? "";
    if (!matchedText) { matcher.lastIndex += 1; continue; }
    const startIndex = match.index ?? 0;
    if (startIndex > cursor) {
      parts.push(<Fragment key={`text-${cursor}`}>{text.slice(cursor, startIndex)}</Fragment>);
    }
    parts.push(<mark key={`mark-${startIndex}-${matchedText}`}>{matchedText}</mark>);
    cursor = startIndex + matchedText.length;
  }
  if (parts.length === 0) { return text; }
  if (cursor < text.length) {
    parts.push(<Fragment key={`text-tail-${cursor}`}>{text.slice(cursor)}</Fragment>);
  }
  return parts;
}

export function wrapInMarkdownCodeBlock(content: string) {
  const fence = content.includes("```") ? "````" : "```";
  return `${fence}text\n${content}\n${fence}`;
}

function getHistoryTimestamp(item: HistoryItem) {
  return item.created_at ?? null;
}

function formatHistoryTimestamp(item: HistoryItem) {
  const timestamp = getHistoryTimestamp(item);
  if (!timestamp) { return "未知时间"; }
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}

function buildHistoryLabel(item: HistoryItem) {
  return `${formatHistoryTimestamp(item)} · ${item.device_name} · ${item.command_title}`;
}

export function historyItemToRunResult(item: HistoryItem): RunResult {
  return {
    command: "history",
    record_id: item.record_id,
    device: item.device,
    device_name: item.device_name,
    command_id: item.command_id,
    command_title: item.command_title,
    raw: item.raw,
    args: item.args,
    status: item.status,
    executedCommand: item.executedCommand,
    exitCode: item.exitCode,
    stdout: item.stdout,
    stderr: item.stderr,
    message: item.message,
    duration: item.duration
  };
}

function splitOutputLines(content: string) {
  if (!content) {
    return [] as string[];
  }
  return content.replace(/\r/g, "").split("\n");
}

function pushDiffSegment(segments: DiffTextSegment[], text: string, changed: boolean) {
  if (!text) {
    return;
  }
  const normalizedChanged = text.trim().length === 0 ? false : changed;
  const lastSegment = segments[segments.length - 1];
  if (lastSegment && lastSegment.changed === normalizedChanged) {
    lastSegment.text += text;
    return;
  }
  segments.push({ text, changed: normalizedChanged });
}

export function buildDiffSegments(leftText: string, rightText: string): [DiffTextSegment[], DiffTextSegment[]] {
  if (leftText === rightText) {
    return [
      leftText ? [{ text: leftText, changed: false }] : [],
      rightText ? [{ text: rightText, changed: false }] : []
    ];
  }

  const leftTokens = leftText.match(/\s+|\S+/g) ?? [];
  const rightTokens = rightText.match(/\s+|\S+/g) ?? [];
  const lcs: number[][] = Array.from({ length: leftTokens.length + 1 }, () => Array.from({ length: rightTokens.length + 1 }, () => 0));

  for (let leftIndex = leftTokens.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = rightTokens.length - 1; rightIndex >= 0; rightIndex -= 1) {
      lcs[leftIndex][rightIndex] = leftTokens[leftIndex] === rightTokens[rightIndex]
        ? lcs[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(lcs[leftIndex + 1][rightIndex], lcs[leftIndex][rightIndex + 1]);
    }
  }

  const leftSegments: DiffTextSegment[] = [];
  const rightSegments: DiffTextSegment[] = [];
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < leftTokens.length && rightIndex < rightTokens.length) {
    if (leftTokens[leftIndex] === rightTokens[rightIndex]) {
      pushDiffSegment(leftSegments, leftTokens[leftIndex], false);
      pushDiffSegment(rightSegments, rightTokens[rightIndex], false);
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    if (lcs[leftIndex + 1][rightIndex] >= lcs[leftIndex][rightIndex + 1]) {
      pushDiffSegment(leftSegments, leftTokens[leftIndex], true);
      leftIndex += 1;
      continue;
    }

    pushDiffSegment(rightSegments, rightTokens[rightIndex], true);
    rightIndex += 1;
  }

  while (leftIndex < leftTokens.length) {
    pushDiffSegment(leftSegments, leftTokens[leftIndex], true);
    leftIndex += 1;
  }

  while (rightIndex < rightTokens.length) {
    pushDiffSegment(rightSegments, rightTokens[rightIndex], true);
    rightIndex += 1;
  }

  return [leftSegments, rightSegments];
}

export function renderDiffText(segments: DiffTextSegment[], query: string) {
  if (segments.length === 0 || segments.every((segment) => segment.text.length === 0)) {
    return <span className="diff-line-empty">&nbsp;</span>;
  }

  return segments.map((segment, index) => {
    const content = highlightText(segment.text, query);
    if (segment.changed) {
      return <span className="diff-inline-change" key={`${segment.text}-${index}`}>{content}</span>;
    }
    return <Fragment key={`${segment.text}-${index}`}>{content}</Fragment>;
  });
}

export function buildDiffRows(leftText: string, rightText: string): DiffLineRow[] {
  const leftLines = splitOutputLines(leftText);
  const rightLines = splitOutputLines(rightText);
  const lcs: number[][] = Array.from({ length: leftLines.length + 1 }, () => Array.from({ length: rightLines.length + 1 }, () => 0));

  for (let leftIndex = leftLines.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = rightLines.length - 1; rightIndex >= 0; rightIndex -= 1) {
      lcs[leftIndex][rightIndex] = leftLines[leftIndex] === rightLines[rightIndex]
        ? lcs[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(lcs[leftIndex + 1][rightIndex], lcs[leftIndex][rightIndex + 1]);
    }
  }

  const operations: Array<
    | { type: "same"; leftLineNumber: number; rightLineNumber: number; leftText: string; rightText: string }
    | { type: "removed"; leftLineNumber: number; leftText: string }
    | { type: "added"; rightLineNumber: number; rightText: string }
  > = [];

  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < leftLines.length && rightIndex < rightLines.length) {
    if (leftLines[leftIndex] === rightLines[rightIndex]) {
      operations.push({
        type: "same",
        leftLineNumber: leftIndex + 1,
        rightLineNumber: rightIndex + 1,
        leftText: leftLines[leftIndex],
        rightText: rightLines[rightIndex]
      });
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    if (lcs[leftIndex + 1][rightIndex] >= lcs[leftIndex][rightIndex + 1]) {
      operations.push({ type: "removed", leftLineNumber: leftIndex + 1, leftText: leftLines[leftIndex] });
      leftIndex += 1;
      continue;
    }

    operations.push({ type: "added", rightLineNumber: rightIndex + 1, rightText: rightLines[rightIndex] });
    rightIndex += 1;
  }

  while (leftIndex < leftLines.length) {
    operations.push({ type: "removed", leftLineNumber: leftIndex + 1, leftText: leftLines[leftIndex] });
    leftIndex += 1;
  }

  while (rightIndex < rightLines.length) {
    operations.push({ type: "added", rightLineNumber: rightIndex + 1, rightText: rightLines[rightIndex] });
    rightIndex += 1;
  }

  const rows: DiffLineRow[] = [];
  let operationIndex = 0;
  while (operationIndex < operations.length) {
    const operation = operations[operationIndex];
    if (operation.type === "same") {
      rows.push({
        leftLineNumber: operation.leftLineNumber,
        rightLineNumber: operation.rightLineNumber,
        leftText: operation.leftText,
        rightText: operation.rightText,
        leftSegments: operation.leftText ? [{ text: operation.leftText, changed: false }] : [],
        rightSegments: operation.rightText ? [{ text: operation.rightText, changed: false }] : [],
        kind: "same"
      });
      operationIndex += 1;
      continue;
    }

    const removedGroup: Array<{ leftLineNumber: number; leftText: string }> = [];
    const addedGroup: Array<{ rightLineNumber: number; rightText: string }> = [];
    while (operationIndex < operations.length && operations[operationIndex].type !== "same") {
      const nextOperation = operations[operationIndex];
      if (nextOperation.type === "removed") {
        removedGroup.push(nextOperation);
      } else if (nextOperation.type === "added") {
        addedGroup.push(nextOperation);
      }
      operationIndex += 1;
    }

    const pairCount = Math.max(removedGroup.length, addedGroup.length);
    for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
      const removed = removedGroup[pairIndex];
      const added = addedGroup[pairIndex];
      const leftLine = removed?.leftText ?? "";
      const rightLine = added?.rightText ?? "";

      if (removed && added) {
        const [leftSegments, rightSegments] = buildDiffSegments(leftLine, rightLine);
        rows.push({
          leftLineNumber: removed.leftLineNumber,
          rightLineNumber: added.rightLineNumber,
          leftText: leftLine,
          rightText: rightLine,
          leftSegments,
          rightSegments,
          kind: "changed"
        });
        continue;
      }

      if (removed) {
        rows.push({
          leftLineNumber: removed.leftLineNumber,
          rightLineNumber: null,
          leftText: leftLine,
          rightText: "",
          leftSegments: leftLine ? [{ text: leftLine, changed: true }] : [],
          rightSegments: [],
          kind: "removed"
        });
        continue;
      }

      rows.push({
        leftLineNumber: null,
        rightLineNumber: added?.rightLineNumber ?? null,
        leftText: "",
        rightText: rightLine,
        leftSegments: [],
        rightSegments: rightLine ? [{ text: rightLine, changed: true }] : [],
        kind: "added"
      });
    }
  }

  return rows;
}

export function getResultPrimaryCommand(result: RunResult | null) {
  if (!result) {
    return "未选择记录";
  }

  return result.executedCommand ?? result.raw ?? result.command_title ?? result.command_id;
}

function getResultTimeLabel(result: RunResult | null, historyItems: HistoryItem[]) {
  if (!result) {
    return "";
  }

  if (result.record_id === "current") {
    return "当前执行";
  }

  const target = historyItems.find((item) => item.record_id === result.record_id);
  return target ? formatHistoryTimestamp(target) : "";
}

export function getDiffRecordMeta(targetId: DiffTargetId, currentResult: RunResult | null, historyItems: HistoryItem[]) {
  const result = resolveDiffTarget(targetId, currentResult, historyItems);
  return {
    result,
    commandText: getResultPrimaryCommand(result),
    deviceName: result?.device_name ?? "",
    timeText: getResultTimeLabel(result, historyItems)
  };
}

export function countOutputLines(content?: string) {
  if (!content?.trim()) {
    return 0;
  }

  return content.trimEnd().split(/\r?\n/).length;
}

export function copyText(text: string) {
  void navigator.clipboard.writeText(text);
}

export function buildExportBaseName(result: RunResult) {
  const rawName = `${result.device_name || result.device}-${result.command_title || result.command_id}-${result.record_id}`;
  return rawName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "-");
}

export function downloadTextFile(fileName: string, content: string, mimeType: string) {
  downloadBlobFile(fileName, new Blob([content], { type: mimeType }));
}

export function downloadBlobFile(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function decodeBase64ToBlob(contentBase64: string, mimeType: string) {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

export function buildMarkdownExport(result: RunResult) {
  return [
    `# ${result.command_title || result.command_id}`,
    "",
    `- 设备: ${result.device_name || result.device}`,
    `- 状态: ${result.status}`,
    `- 退出码: ${result.exitCode ?? "未知"}`,
    `- 耗时: ${result.duration != null ? `${result.duration} ms` : "未知"}`,
    "",
    "## 执行命令",
    "",
    "```bash",
    result.executedCommand ?? result.raw ?? "未记录",
    "```",
    "",
    "## 标准输出",
    "",
    "```text",
    result.stdout?.trimEnd() || "<empty>",
    "```",
    "",
    "## 错误输出",
    "",
    "```text",
    result.stderr?.trimEnd() || "<empty>",
    "```"
  ].join("\n");
}

export function buildTextExport(result: RunResult) {
  return [
    `命令主题: ${result.command_title || result.command_id}`,
    `设备: ${result.device_name || result.device}`,
    `状态: ${result.status}`,
    `退出码: ${result.exitCode ?? "未知"}`,
    `耗时: ${result.duration != null ? `${result.duration} ms` : "未知"}`,
    `执行命令: ${result.executedCommand ?? result.raw ?? "未记录"}`,
    "",
    "[标准输出]",
    result.stdout?.trimEnd() || "<empty>",
    "",
    "[错误输出]",
    result.stderr?.trimEnd() || "<empty>"
  ].join("\n");
}

export function resolveDiffTarget(targetId: DiffTargetId, currentResult: RunResult | null, historyItems: HistoryItem[]) {
  if (targetId === "current") {
    return currentResult;
  }

  const target = historyItems.find((item) => item.record_id === targetId);
  return target ? historyItemToRunResult(target) : null;
}

function resolveDiffLabel(targetId: DiffTargetId, currentResult: RunResult | null, historyItems: HistoryItem[]) {
  if (targetId === "current") {
    return currentResult ? `当前执行 · ${currentResult.command_title || currentResult.command_id}` : "当前执行";
  }

  const target = historyItems.find((item) => item.record_id === targetId);
  return target ? buildHistoryLabel(target) : "未找到记录";
}

function parseDeviceOutput(output?: string): ParsedDeviceEntry[] {
  if (!output?.trim()) {
    return [];
  }

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("List of devices attached"))
    .map((line) => {
      const parts = line.split(/\s+/);
      const serial = parts[0] ?? "";
      const state = parts[1] ?? "unknown";
      const metadata: Record<string, string> = {};

      for (const token of parts.slice(2)) {
        if (!token.includes(":")) {
          continue;
        }

        const [key, ...rest] = token.split(":");
        metadata[key] = rest.join(":");
      }

      return { serial, state, metadata };
    })
    .filter((item) => item.serial);
}

function parseKeyValueLines(output?: string) {
  if (!output?.trim()) {
    return [] as Array<{ key: string; value: string }>;
  }

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes(":"))
    .map((line) => {
      const [key, ...rest] = line.split(":");
      return {
        key: key.trim(),
        value: rest.join(":").trim()
      };
    })
    .filter((item) => item.key && item.value);
}

function collectOutputLines(output?: string) {
  return (output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
}

function parsePrefixedLines(output: string | undefined, prefixes: string[]) {
  return collectOutputLines(output)
    .map((line) => {
      const matchedPrefix = prefixes.find((prefix) => line.startsWith(prefix));
      return matchedPrefix ? line.slice(matchedPrefix.length).trim() : line.trim();
    })
    .filter((line) => line.length > 0);
}

function parseBracketValueList(output: string | undefined, key: string) {
  const line = collectOutputLines(output)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${key}:[`) || entry.startsWith(`${key}=[`));
  if (!line) {
    return [] as string[];
  }

  const match = line.match(/[:=]\[(.*)\]$/);
  if (!match) {
    return [] as string[];
  }

  return match[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseEqualsLines(output?: string) {
  return collectOutputLines(output)
    .map((line) => line.trim())
    .filter((line) => line.includes("="))
    .map((line) => {
      const [key, ...rest] = line.split("=");
      return {
        key: key.trim(),
        value: rest.join("=").trim()
      };
    })
    .filter((item) => item.key && item.value);
}

function pickKeyValueMetrics(output: string | undefined, mapping: Record<string, string>) {
  const values = new Map([
    ...parseKeyValueLines(output),
    ...parseEqualsLines(output)
  ].map((item) => [item.key, item.value]));

  return Object.entries(mapping)
    .map(([key, label]) => {
      const value = values.get(key);
      return value ? { key: label, value } : null;
    })
    .filter((item): item is { key: string; value: string } => Boolean(item));
}

function dumpsysCommandMatches(result: RunResult, fragment: string) {
  const haystack = [result.command_id, result.command_title, result.executedCommand, result.raw]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  return haystack.includes(fragment.toLowerCase());
}

function parseLocationProviderSummaries(output: string | undefined) {
  const lines = collectOutputLines(output);
  const summaries: Array<{ name: string; service?: string; allowed?: string; enabled?: string; identity?: string }> = [];
  let current: { name: string; service?: string; allowed?: string; enabled?: string; identity?: string } | null = null;
  let activeUser = "";

  for (const line of lines) {
    const providerMatch = line.match(/^([\w.]+) provider:$/);
    if (providerMatch) {
      current = { name: providerMatch[1] };
      summaries.push(current);
      activeUser = "";
      continue;
    }

    if (!current) {
      continue;
    }

    const userMatch = line.match(/^user\s+(\d+):$/);
    if (userMatch) {
      activeUser = userMatch[1];
      continue;
    }

    if (!current.service && line.startsWith("service:")) {
      current.service = line.replace(/^service:/, "").trim();
      continue;
    }

    if (!current.identity && line.startsWith("identity=")) {
      current.identity = line.replace(/^identity=/, "").trim();
      continue;
    }

    if (!current.allowed && line.startsWith("allowed=")) {
      current.allowed = line.replace(/^allowed=/, "").trim();
      continue;
    }

    if (activeUser === "10" && !current.enabled && line.startsWith("enabled=")) {
      current.enabled = line.replace(/^enabled=/, "").trim();
    }
  }

  return summaries;
}

function parseNotificationRecords(output: string | undefined) {
  return collectOutputLines(output)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("NotificationRecord("))
    .map((line) => {
      const pkg = line.match(/pkg=([^\s]+)/)?.[1] ?? "unknown";
      const importance = line.match(/importance=(\d+)/)?.[1] ?? "?";
      const channel = line.match(/Notification\(channel=([^\s]+)/)?.[1] ?? "unknown";
      return { pkg, importance, channel };
    });
}

function parsePermissionSections(output?: string): PermissionSection[] {
  const lines = collectOutputLines(output);
  const sections: PermissionSection[] = [];
  let currentSection: PermissionSection | null = null;

  for (const line of lines) {
    if (line.endsWith(":")) {
      currentSection = {
        title: line.replace(/:$/, ""),
        groups: [],
        permissions: []
      };
      sections.push(currentSection);
      continue;
    }

    if (!currentSection) {
      currentSection = {
        title: "权限输出",
        groups: [],
        permissions: []
      };
      sections.push(currentSection);
    }

    if (line.startsWith("group:")) {
      currentSection.groups.push(line.replace(/^group:/, "").trim());
      continue;
    }

    if (line.startsWith("permission:")) {
      currentSection.permissions.push(line.replace(/^permission:/, "").trim());
      continue;
    }

    currentSection.permissions.push(line.trim());
  }

  return sections;
}

function renderLineBlocks(lines: string[], query: string) {
  return (
    <div className="output-line-list">
      {lines.map((line, index) => (
        <div className="output-line" key={`${line}-${index}`}>
          {highlightText(line, query)}
        </div>
      ))}
    </div>
  );
}

function renderMetricGrid(items: Array<{ key: string; value: string }>, query: string) {
  return (
    <div className="device-output-meta">
      {items.map((item) => (
        <div className="device-output-field" key={`${item.key}-${item.value}`}>
          <span className="summary-label">{item.key}</span>
          <strong>{highlightText(item.value, query)}</strong>
        </div>
      ))}
    </div>
  );
}

function renderTokenList(title: string, items: string[], query: string) {
  return (
    <div className="token-output">
      <div className="token-output-head">
        <span className="summary-label">{title}</span>
        <span className="badge info">{items.length} 项</span>
      </div>
      <div className="token-list">
        {items.map((item) => <span className="token-chip" key={item}>{highlightText(item, query)}</span>)}
      </div>
    </div>
  );
}

function renderStructuredStack(children: React.ReactNode) {
  return <div className="structured-stack">{children}</div>;
}

function renderCarServiceOutput(result: RunResult, query: string) {
  const output = result.stdout || result.stderr;
  const enabledFeatures = parseBracketValueList(output, "mEnabledFeatures");
  const defaultFeatures = parseBracketValueList(output, "mDefaultEnabledFeaturesFromConfig");
  const experimentalFeatures = parseBracketValueList(output, "mAvailableExperimentalFeatures");
  const metrics = pickKeyValueMetrics(output, {
    User0Unlocked: "主用户已解锁",
    "Initial user": "初始用户",
    MaxRunningUsers: "最大并行用户数",
    NumberOfDrivers: "司机数量",
    "Start Background Users On Garage Mode": "车库模式后台启动",
    mCurrentState: "电源当前状态",
    mCurrentPowerPolicyId: "当前电源策略"
  });

  return renderStructuredStack(
    <>
      {metrics.length > 0 ? renderMetricGrid(metrics, query) : null}
      {enabledFeatures.length > 0 ? renderTokenList("已启用车机功能", enabledFeatures, query) : null}
      {defaultFeatures.length > 0 ? renderTokenList("默认启用功能", defaultFeatures, query) : null}
      {experimentalFeatures.length > 0 ? renderTokenList("实验功能", experimentalFeatures, query) : null}
      {metrics.length === 0 && enabledFeatures.length === 0 && defaultFeatures.length === 0 && experimentalFeatures.length === 0
        ? renderLineBlocks(collectOutputLines(output), query)
        : null}
    </>
  );
}

function renderPowerOutput(result: RunResult, query: string) {
  const output = result.stdout || result.stderr;
  const metrics = pickKeyValueMetrics(output, {
    mWakefulness: "唤醒状态",
    mIsPowered: "外接电源",
    mPlugType: "供电类型",
    mBatteryLevel: "电量",
    mStayOn: "保持常亮",
    mBootCompleted: "系统完成启动",
    mSystemReady: "系统就绪",
    mBatteryLevelLow: "低电量",
    mLightDeviceIdleMode: "轻度 Idle",
    mDeviceIdleMode: "深度 Idle",
    mScreenOffTimeoutSetting: "灭屏超时(ms)",
    mSleepTimeoutSetting: "休眠超时(ms)",
    mUserId: "当前用户"
  });
  const whitelist = parseBracketValueList(output, "mDeviceIdleWhitelist");

  return renderStructuredStack(
    <>
      {metrics.length > 0 ? renderMetricGrid(metrics, query) : null}
      {whitelist.length > 0 ? renderTokenList("Device Idle 白名单", whitelist, query) : null}
      {metrics.length === 0 && whitelist.length === 0 ? renderLineBlocks(collectOutputLines(output), query) : null}
    </>
  );
}

function renderLocationOutput(result: RunResult, query: string) {
  const output = result.stdout || result.stderr;
  const lines = collectOutputLines(output);
  const runningUsers = lines.find((line) => line.startsWith("running users:"))?.replace(/^running users:/, "").trim();
  const currentUsers = lines.find((line) => line.startsWith("current users:"))?.replace(/^current users:/, "").trim();
  const locationSettings = lines
    .filter((line) => /^\[u\d+\]\s+(true|false)$/i.test(line))
    .map((line) => {
      const match = line.match(/^\[(u\d+)\]\s+(true|false)$/i);
      return match ? { key: `${match[1]} 定位开关`, value: match[2] } : null;
    })
    .filter((item): item is { key: string; value: string } => Boolean(item));
  const providers = parseLocationProviderSummaries(output)
    .map((provider) => `${provider.name} · service=${provider.service ?? "unknown"} · user10=${provider.enabled ?? "?"} · allowed=${provider.allowed ?? "?"}`);
  const metrics = [
    ...(runningUsers ? [{ key: "运行中用户", value: runningUsers }] : []),
    ...(currentUsers ? [{ key: "当前用户", value: currentUsers }] : []),
    ...locationSettings
  ];

  return renderStructuredStack(
    <>
      {metrics.length > 0 ? renderMetricGrid(metrics, query) : null}
      {providers.length > 0 ? renderLineBlocks(providers, query) : null}
      {metrics.length === 0 && providers.length === 0 ? renderLineBlocks(lines, query) : null}
    </>
  );
}

function renderNotificationOutput(result: RunResult, query: string) {
  const records = parseNotificationRecords(result.stdout || result.stderr);
  const packages = [...new Set(records.map((record) => record.pkg))];
  const metrics = [
    { key: "当前通知数", value: String(records.length) },
    { key: "涉及应用数", value: String(packages.length) }
  ];
  const summaries = records.slice(0, 8).map((record) => `${record.pkg} · importance=${record.importance} · channel=${record.channel}`);

  return renderStructuredStack(
    <>
      {records.length > 0 ? renderMetricGrid(metrics, query) : null}
      {packages.length > 0 ? renderTokenList("通知来源应用", packages, query) : null}
      {summaries.length > 0 ? renderLineBlocks(summaries, query) : null}
      {records.length === 0 ? renderLineBlocks(collectOutputLines(result.stdout || result.stderr), query) : null}
    </>
  );
}

function renderDevicesOutput(result: RunResult, query: string) {
  const deviceEntries = parseDeviceOutput(result.stdout);

  if (deviceEntries.length > 0) {
    return (
      <div className="device-output-list">
        {deviceEntries.map((entry) => (
          <article className="device-output-card" key={`${entry.serial}-${entry.state}`}>
            <div className="device-output-head">
              <div>
                <p className="output-title">设备序列号</p>
                <strong>{highlightText(entry.serial, query)}</strong>
              </div>
              <span className={`badge ${entry.state === "device" ? "success" : "warning"}`}>{highlightText(entry.state, query)}</span>
            </div>
            <div className="device-output-meta">
              {Object.entries(entry.metadata).map(([key, value]) => (
                <div className="device-output-field" key={key}>
                  <span className="summary-label">{key}</span>
                  <strong>{highlightText(value.replaceAll("_", " "), query)}</strong>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    );
  }

  return renderLineBlocks(collectOutputLines(result.stdout), query);
}

function renderStateOutput(result: RunResult, query: string) {
  const state = result.stdout?.trim() || result.stderr?.trim() || "未知";
  return (
    <div className="state-output-card">
      <span className={`badge ${result.status === "ok" ? "success" : "danger"}`}>{highlightText(state, query)}</span>
      <div className="result-empty-state">{highlightText(result.message ?? "状态命令执行完成。", query)}</div>
    </div>
  );
}

function renderVersionOutput(result: RunResult, query: string) {
  const output = result.stdout ?? "";
  const lines = collectOutputLines(output);

  // Parse adb version output into structured fields
  const fields: Array<{ key: string; value: string }> = [];
  for (const line of lines) {
    const versionMatch = line.match(/^Android Debug Bridge version (.+)$/);
    if (versionMatch) { fields.push({ key: "ADB 版本", value: versionMatch[1] }); continue; }
    const revMatch = line.match(/^Version (.+)$/);
    if (revMatch) { fields.push({ key: "修订版本", value: revMatch[1] }); continue; }
    const pathMatch = line.match(/^Installed as (.+)$/);
    if (pathMatch) { fields.push({ key: "安装路径", value: pathMatch[1] }); continue; }
    const osMatch = line.match(/^Running on (.+)$/);
    if (osMatch) { fields.push({ key: "运行环境", value: osMatch[1] }); continue; }
    // Fallback: try key:value
    if (line.includes(":")) {
      const [key, ...rest] = line.split(":");
      fields.push({ key: key.trim(), value: rest.join(":").trim() });
    }
  }

  if (fields.length > 0) {
    return renderMetricGrid(fields, query);
  }
  return renderLineBlocks(lines, query);
}

function renderHelpOutput(result: RunResult, query: string) {
  const lines = collectOutputLines(result.stdout);
  const sections: Array<{ title: string; items: string[] }> = [];
  let currentSection: { title: string; items: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith(" ") && line.endsWith(":")) {
      currentSection = { title: line.replace(/:$/, ""), items: [] };
      sections.push(currentSection);
      continue;
    }

    if (!currentSection) {
      currentSection = { title: "说明", items: [] };
      sections.push(currentSection);
    }

    const leadingSpaces = line.length - line.trimStart().length;
    // Lines with 1-3 leading spaces are command entries; 4+ are sub-descriptions of the previous command
    if (leadingSpaces >= 4 && currentSection.items.length > 0) {
      currentSection.items[currentSection.items.length - 1] += "\n" + line.trim();
    } else {
      currentSection.items.push(line.trim());
    }
  }

  if (sections.length === 0) {
    return renderLineBlocks(lines, query);
  }

  return (
    <div className="help-section-list">
      {sections.map((section) => (
        <article className="help-section-card" key={section.title}>
          <p className="output-title">{highlightText(section.title, query)}</p>
          <ul>
            {section.items.map((item, index) => (
              <li key={`${index}`} style={{ whiteSpace: "pre-wrap" }}>{highlightText(item, query)}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

function renderConnectionOutput(result: RunResult, query: string) {
  const output = result.stdout || result.stderr;
  const lines = collectOutputLines(output);
  if (lines.length === 0) {
    return <div className="result-empty-state">{highlightText(result.message ?? "连接命令执行完成。", query)}</div>;
  }
  if (result.command_id === "forward-list" || result.command_id === "reverse-list") {
    const forwards = lines.map((line) => {
      const parts = line.trim().split(/\s+/);
      return parts.length >= 3
        ? { key: `${parts[0]} → ${parts[1]}`, value: parts[2] }
        : { key: "转发", value: line };
    });
    return renderStructuredStack(
      <>
        <div className="result-empty-state">共 {forwards.length} 条{result.command_id.includes("reverse") ? "反向" : ""}转发规则</div>
        {renderMetricGrid(forwards, query)}
      </>
    );
  }
  const statusLine = lines[0] ?? "";
  if (/^connected to/i.test(statusLine) || /^already connected/i.test(statusLine)) {
    return renderStructuredStack(
      <>
        <span className="badge success">{highlightText(statusLine, query)}</span>
        {lines.length > 1 ? renderLineBlocks(lines.slice(1), query) : null}
      </>
    );
  }
  if (/^disconnected/i.test(statusLine) || /^error/i.test(statusLine) || /^failed to connect/i.test(statusLine) || /^unable/i.test(statusLine)) {
    return renderStructuredStack(
      <>
        <span className="badge danger">{highlightText(statusLine, query)}</span>
        {lines.length > 1 ? renderLineBlocks(lines.slice(1), query) : null}
      </>
    );
  }
  return renderLineBlocks(lines, query);
}

function renderActivityManagerOutput(result: RunResult, query: string) {
  const output = result.stdout || result.stderr || "";
  const lines = collectOutputLines(output);
  if (lines.length === 0) {
    return <div className="result-empty-state">{highlightText(result.message ?? "Activity Manager 命令已执行。", query)}</div>;
  }
  const metrics: Array<{ key: string; value: string }> = [];
  const statusMatch = output.match(/Status:\s*(\w+)/i);
  if (statusMatch) metrics.push({ key: "状态", value: statusMatch[1] });
  const activityMatch = output.match(/Activity:\s*([^\n]+)/i);
  if (activityMatch) metrics.push({ key: "Activity", value: activityMatch[1].trim() });
  const thisTimeMatch = output.match(/ThisTime:\s*(\d+)/i);
  if (thisTimeMatch) metrics.push({ key: "本次耗时", value: `${thisTimeMatch[1]} ms` });
  const totalTimeMatch = output.match(/TotalTime:\s*(\d+)/i);
  if (totalTimeMatch) metrics.push({ key: "总耗时", value: `${totalTimeMatch[1]} ms` });
  const waitTimeMatch = output.match(/WaitTime:\s*(\d+)/i);
  if (waitTimeMatch) metrics.push({ key: "等待耗时", value: `${waitTimeMatch[1]} ms` });
  const completeMatch = output.match(/Complete/i);
  if (completeMatch && metrics.length > 0) metrics.push({ key: "完成", value: "是" });
  if (metrics.length >= 2) {
    const extraLines = lines.filter((l) => !/(Status|Activity|ThisTime|TotalTime|WaitTime|Complete):/i.test(l)).filter((l) => l.trim());
    return renderStructuredStack(
      <>
        {renderMetricGrid(metrics, query)}
        {extraLines.length > 0 ? renderLineBlocks(extraLines, query) : null}
      </>
    );
  }
  const kvItems = parseKeyValueLines(output);
  if (kvItems.length >= 2) return renderMetricGrid(kvItems, query);
  return renderLineBlocks(lines, query);
}

function renderPackageManagerOutput(result: RunResult, query: string) {
  const output = result.stdout || result.stderr;
  const lines = collectOutputLines(output);

  if (result.command_id === "pm-path") {
    const paths = parsePrefixedLines(output, ["package:"]);
    if (paths.length > 0) {
      return renderMetricGrid(paths.map((path, index) => ({ key: `APK 路径 ${index + 1}`, value: path })), query);
    }
  }

  if (result.command_id === "pm-list-packages") {
    const packages = parsePrefixedLines(output, ["package:"]);
    if (packages.length > 0) {
      return renderTokenList("包名列表", packages, query);
    }
  }

  if (result.command_id === "pm-list-features") {
    const features = parsePrefixedLines(output, ["feature:"]);
    if (features.length > 0) {
      return renderTokenList("系统 Feature", features, query);
    }
  }

  if (result.command_id === "pm-list-libraries") {
    const libraries = parsePrefixedLines(output, ["library:"]);
    if (libraries.length > 0) {
      return renderTokenList("系统库", libraries, query);
    }
  }

  if (result.command_id === "pm-list-permission-groups") {
    const groups = parsePrefixedLines(output, ["permission group:", "permission-group:", "group:"]);
    if (groups.length > 0) {
      return renderTokenList("权限组", groups, query);
    }
  }

  if (result.command_id === "pm-resolve-activity" || result.command_id.startsWith("pm-query-")) {
    const keyValues = parseKeyValueLines(output);
    if (keyValues.length >= 2) {
      return renderMetricGrid(keyValues, query);
    }
  }

  return lines.length > 0 ? renderLineBlocks(lines, query) : <div className="result-empty-state">{highlightText(result.message ?? "包管理命令已执行。", query)}</div>;
}

function renderPermissionOutput(result: RunResult, query: string) {
  const sections = parsePermissionSections(result.stdout || result.stderr);
  if (sections.length === 0) {
    return <div className="result-empty-state">{highlightText(result.message ?? "权限查询已执行，但没有拿到可展示结果。", query)}</div>;
  }

  return (
    <div className="permission-section-list">
      {sections.map((section) => (
        <article className="permission-section-card" key={section.title}>
          <p className="output-title">{highlightText(section.title, query)}</p>
          {section.groups.length ? (
            <div className="permission-block">
              <span className="summary-label">权限组</span>
              <div className="permission-chip-list">
                {section.groups.map((group) => <span className="permission-chip" key={group}>{highlightText(group, query)}</span>)}
              </div>
            </div>
          ) : null}
          {section.permissions.length ? (
            <div className="permission-block">
              <span className="summary-label">权限项</span>
              <div className="permission-list">
                {section.permissions.map((permission) => <div className="permission-row" key={permission}>{highlightText(permission, query)}</div>)}
              </div>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function renderWindowManagerOutput(result: RunResult, query: string) {
  const items = parseKeyValueLines(result.stdout)
    .map((item) => ({ key: item.key, value: item.value }));
  return items.length > 0 ? renderMetricGrid(items, query) : renderLineBlocks(collectOutputLines(result.stdout || result.stderr), query);
}

function renderTransferOutput(result: RunResult, query: string) {
  const output = result.stdout || result.stderr || "";
  const lines = collectOutputLines(output);
  if (lines.length === 0) {
    return <div className="result-empty-state">{highlightText(result.message ?? "传输命令已执行。", query)}</div>;
  }
  const metrics: Array<{ key: string; value: string }> = [];
  const fileLines: string[] = [];
  for (const line of lines) {
    const speedMatch = line.match(/(\d+)\s+files?\s+(pushed|pulled|skipped)/i);
    if (speedMatch) {
      metrics.push({ key: speedMatch[2] === "pushed" ? "已推送" : speedMatch[2] === "pulled" ? "已拉取" : "已跳过", value: `${speedMatch[1]} 文件` });
      continue;
    }
    const rateMatch = line.match(/([\d.]+)\s*(MB\/s|KB\/s|B\/s)/i);
    if (rateMatch) {
      metrics.push({ key: "传输速率", value: `${rateMatch[1]} ${rateMatch[2]}` });
      continue;
    }
    const bytesMatch = line.match(/(\d[\d,]*)\s+bytes\s+in\s+([\d.]+)s/i);
    if (bytesMatch) {
      metrics.push({ key: "传输大小", value: `${bytesMatch[1]} bytes` });
      metrics.push({ key: "耗时", value: `${bytesMatch[2]}s` });
      continue;
    }
    fileLines.push(line);
  }
  if (metrics.length > 0) {
    return renderStructuredStack(
      <>
        {renderMetricGrid(metrics, query)}
        {fileLines.length > 0 ? renderLineBlocks(fileLines, query) : null}
      </>
    );
  }
  return renderLineBlocks(lines, query);
}

function detectTableOutput(lines: string[]) {
  if (lines.length < 2) return null;
  const headerCandidates = lines[0].trim().split(/\s{2,}/);
  if (headerCandidates.length < 3) return null;
  const bodyLines = lines.slice(1).filter((l) => l.trim());
  if (bodyLines.length === 0) return null;
  const matchCount = bodyLines.filter((l) => l.trim().split(/\s{2,}/).length >= headerCandidates.length - 1).length;
  if (matchCount / bodyLines.length < 0.5) return null;
  const headers = headerCandidates;
  const rows = bodyLines.map((l) => {
    const cells = l.trim().split(/\s{2,}/);
    while (cells.length < headers.length) cells.push("");
    return cells.slice(0, headers.length);
  });
  return { headers, rows };
}

function renderTableOutput(table: { headers: string[]; rows: string[][] }, query: string) {
  return (
    <div className="output-table-wrap">
      <table className="output-table">
        <thead><tr>{table.headers.map((h) => <th key={h}>{highlightText(h, query)}</th>)}</tr></thead>
        <tbody>{table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{highlightText(cell, query)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function renderShellOutput(result: RunResult, query: string) {
  const output = result.stdout || result.stderr;
  const lines = collectOutputLines(output);
  if (lines.length === 0) {
    return <div className="result-empty-state">{highlightText(result.message ?? "Shell 命令已执行。", query)}</div>;
  }
  const cmdHint = (result.executedCommand ?? result.raw ?? result.command_id).toLowerCase();
  if (cmdHint.includes("getprop") || cmdHint.includes("settings list") || cmdHint.includes("settings get")) {
    const kvItems = parseEqualsLines(output);
    if (kvItems.length >= 3) {
      return renderStructuredStack(
        <>
          {renderMetricGrid(kvItems.slice(0, 20), query)}
          {kvItems.length > 20 ? <div className="result-empty-state">仅显示前 20 项，共 {kvItems.length} 项</div> : null}
        </>
      );
    }
  }
  if (/\b(ps|top)\b/.test(cmdHint) || /\b(df|ls\s+-l)\b/.test(cmdHint)) {
    const table = detectTableOutput(lines);
    if (table) return renderTableOutput(table, query);
  }
  if (cmdHint.includes("cat ") || cmdHint.includes("cat\t")) {
    return (
      <div className="raw-output-block">
        <div className="raw-markdown-block">
          <ReactMarkdown>{wrapInMarkdownCodeBlock(lines.join("\n"))}</ReactMarkdown>
        </div>
      </div>
    );
  }
  const kvLines = parseKeyValueLines(output);
  if (kvLines.length >= 3 && kvLines.length >= lines.length * 0.6) {
    return renderMetricGrid(kvLines.slice(0, 24), query);
  }
  return renderLineBlocks(lines, query);
}

function classifyLogcatLevel(line: string): string {
  if (/^\d{2}-\d{2}\s/.test(line) || /^\[\s*\d/.test(line)) {
    if (/\sE[\/\s]/.test(line)) return "error";
    if (/\sW[\/\s]/.test(line)) return "warn";
    if (/\sI[\/\s]/.test(line)) return "info";
    if (/\sD[\/\s]/.test(line)) return "debug";
    if (/\sV[\/\s]/.test(line)) return "verbose";
  }
  return "";
}

function renderDebuggingOutput(result: RunResult, query: string) {
  const output = result.stdout || result.stderr;
  const lines = collectOutputLines(output);
  if (lines.length === 0) {
    return <div className="result-empty-state">{highlightText(result.message ?? "调试命令已执行。", query)}</div>;
  }
  const cmdHint = (result.executedCommand ?? result.raw ?? result.command_id).toLowerCase();
  if (cmdHint.includes("logcat")) {
    return (
      <div className="output-line-list">
        {lines.slice(0, 200).map((line, index) => {
          const level = classifyLogcatLevel(line);
          return (
            <div className={`output-line ${level ? `logcat-${level}` : ""}`} key={`${line}-${index}`}>
              {highlightText(line, query)}
            </div>
          );
        })}
        {lines.length > 200 ? <div className="result-empty-state">仅显示前 200 行，共 {lines.length} 行</div> : null}
      </div>
    );
  }
  if (result.command_id === "jdwp") {
    const pids = lines.filter((l) => /^\d+$/.test(l.trim()));
    if (pids.length > 0) {
      return renderStructuredStack(
        <>
          <div className="result-empty-state">可调试进程：{pids.length} 个</div>
          {renderTokenList("PID 列表", pids, query)}
        </>
      );
    }
  }
  return renderLineBlocks(lines, query);
}

function renderSecurityOutput(result: RunResult, query: string) {
  const output = result.stdout || result.stderr;
  const lines = collectOutputLines(output);
  if (lines.length === 0) {
    return <div className="result-empty-state">{highlightText(result.message ?? "安全命令已执行。", query)}</div>;
  }
  const successLine = lines.find((l) => /successfully|verity (enabled|disabled)/i.test(l));
  if (successLine) {
    return renderStructuredStack(
      <>
        <span className="badge success">{highlightText(successLine, query)}</span>
        {lines.length > 1 ? renderLineBlocks(lines.filter((l) => l !== successLine), query) : null}
      </>
    );
  }
  return renderLineBlocks(lines, query);
}

function renderDumpSysOutput(result: RunResult, query: string) {
  const output = result.stdout || result.stderr;
  const lines = collectOutputLines(output);

  if (dumpsysCommandMatches(result, "dumpsys car_service")) {
    return renderCarServiceOutput(result, query);
  }

  if (result.command_id === "dumpsys-power" || dumpsysCommandMatches(result, "dumpsys power")) {
    return renderPowerOutput(result, query);
  }

  if (result.command_id === "dumpsys-location" || dumpsysCommandMatches(result, "dumpsys location")) {
    return renderLocationOutput(result, query);
  }

  if (result.command_id === "dumpsys-notification" || dumpsysCommandMatches(result, "dumpsys notification")) {
    return renderNotificationOutput(result, query);
  }

  if (result.command_id === "dumpsys-battery") {
    const items = parseKeyValueLines(output);
    if (items.length > 0) {
      return renderMetricGrid(items, query);
    }
  }

  if (result.command_id === "dumpsys-package" || result.command_id === "dumpsys-display") {
    const items = parseKeyValueLines(output).slice(0, 12);
    if (items.length >= 3) {
      return renderMetricGrid(items, query);
    }
  }

  if (result.command_id === "dumpsys-meminfo") {
    const metrics: Array<{ key: string; value: string }> = [];
    for (const line of lines) {
      const totalMatch = line.match(/^\s*TOTAL\s+([\d,]+)/);
      if (totalMatch) { metrics.push({ key: "TOTAL PSS", value: `${totalMatch[1]} KB` }); continue; }
      const heapMatch = line.match(/^\s*(Native Heap|Dalvik Heap|Graphics|Stack|Code|System)\s+([\d,]+)/);
      if (heapMatch) { metrics.push({ key: heapMatch[1], value: `${heapMatch[2]} KB` }); continue; }
    }
    const viewLine = lines.find((l) => /Views:/i.test(l));
    if (viewLine) {
      const viewCount = viewLine.match(/Views:\s*(\d+)/)?.[1];
      const actCount = viewLine.match(/Activities:\s*(\d+)/)?.[1];
      if (viewCount) metrics.push({ key: "Views", value: viewCount });
      if (actCount) metrics.push({ key: "Activities", value: actCount });
    }
    if (metrics.length > 0) {
      return renderStructuredStack(
        <>
          {renderMetricGrid(metrics, query)}
          <div className="result-empty-state">共 {lines.length} 行详细输出，切换到原文 tab 查看完整内容</div>
        </>
      );
    }
  }

  if (result.command_id === "dumpsys-gfxinfo") {
    const metrics: Array<{ key: string; value: string }> = [];
    for (const line of lines) {
      const framesMatch = line.match(/Total frames rendered:\s*([\d,]+)/i);
      if (framesMatch) { metrics.push({ key: "总渲染帧数", value: framesMatch[1] }); continue; }
      const jankyMatch = line.match(/Janky frames:\s*([\d,]+)\s*\(([\d.]+)%\)/i);
      if (jankyMatch) { metrics.push({ key: "卡顿帧", value: `${jankyMatch[1]} (${jankyMatch[2]}%)` }); continue; }
      const percentileMatch = line.match(/(50th|90th|95th|99th) percentile:\s*(\d+)ms/i);
      if (percentileMatch) { metrics.push({ key: `${percentileMatch[1]} 分位`, value: `${percentileMatch[2]} ms` }); continue; }
      const missedMatch = line.match(/Number Missed Vsync:\s*(\d+)/i);
      if (missedMatch) { metrics.push({ key: "丢失 Vsync", value: missedMatch[1] }); continue; }
      const highInputMatch = line.match(/Number High input latency:\s*(\d+)/i);
      if (highInputMatch) { metrics.push({ key: "高输入延迟", value: highInputMatch[1] }); continue; }
      const slowUiMatch = line.match(/Number Slow UI thread:\s*(\d+)/i);
      if (slowUiMatch) { metrics.push({ key: "慢 UI 线程", value: slowUiMatch[1] }); continue; }
    }
    if (metrics.length > 0) {
      return renderStructuredStack(
        <>
          {renderMetricGrid(metrics, query)}
          <div className="result-empty-state">共 {lines.length} 行详细输出，切换到原文 tab 查看完整内容</div>
        </>
      );
    }
  }

  return lines.length > 0 ? renderLineBlocks(lines, query) : <div className="result-empty-state">{highlightText(result.message ?? "dumpsys 命令已执行。", query)}</div>;
}

function renderInputOutput(result: RunResult, query: string) {
  return <div className="result-empty-state">{highlightText(result.message ?? "输入命令已发送到设备。", query)}</div>;
}

function renderDeviceControlOutput(result: RunResult, query: string) {
  const lines = collectOutputLines(result.stdout || result.stderr);
  if (lines.length === 0) {
    return <div className="result-empty-state">{highlightText(result.message ?? "设备控制命令已执行。", query)}</div>;
  }
  return lines.length <= 2 ? renderMetricGrid(lines.map((line, index) => ({ key: `结果 ${index + 1}`, value: line })), query) : renderLineBlocks(lines, query);
}

function renderServerOutput(result: RunResult, query: string) {
  const output = result.stdout || result.stderr;
  const lines = collectOutputLines(output);
  if (lines.length === 0) {
    return <div className="result-empty-state">{highlightText(result.message ?? "adb 服务命令已执行。", query)}</div>;
  }
  const statusLine = lines[0] ?? "";
  if (/daemon (started|already running|killed)/i.test(statusLine)) {
    return renderStructuredStack(
      <>
        <span className={`badge ${/killed/i.test(statusLine) ? "warning" : "success"}`}>{highlightText(statusLine, query)}</span>
        {lines.length > 1 ? renderLineBlocks(lines.slice(1), query) : null}
      </>
    );
  }
  return renderLineBlocks(lines, query);
}

export function renderOutputPreview(result: RunResult, query: string) {
  if (result.command_id === "devices") {
    return renderDevicesOutput(result, query);
  }
  if (result.command_id === "get-state") {
    return renderStateOutput(result, query);
  }
  if (result.command_id === "version") {
    return renderVersionOutput(result, query);
  }
  if (result.command_id === "help") {
    return renderHelpOutput(result, query);
  }
  if (["connect", "disconnect", "pair", "forward", "forward-list", "forward-remove", "forward-remove-all", "reverse", "reverse-list", "reverse-remove", "reverse-remove-all", "mdns-check", "mdns-services"].includes(result.command_id)) {
    return renderConnectionOutput(result, query);
  }
  if (result.command_id.startsWith("am-")) {
    return renderActivityManagerOutput(result, query);
  }
  if (result.command_id.startsWith("pm-")) {
    if (result.command_id === "pm-list-permissions") {
      return renderPermissionOutput(result, query);
    }
    return renderPackageManagerOutput(result, query);
  }
  if (result.command_id.startsWith("wm-")) {
    return renderWindowManagerOutput(result, query);
  }
  if (result.command_id.startsWith("dumpsys-")) {
    return renderDumpSysOutput(result, query);
  }
  if (["install", "install-multiple", "install-multi-package", "uninstall", "sideload"].includes(result.command_id)) {
    return renderPackageManagerOutput(result, query);
  }
  if (["push", "pull", "sync"].includes(result.command_id)) {
    return renderTransferOutput(result, query);
  }
  if (
    result.command_id === "shell"
    || result.command_id === "emu"
    || result.command_id.startsWith("shell-")
    || result.command_id.startsWith("ime-")
    || result.command_id.startsWith("content-")
    || result.command_id.startsWith("svc-")
  ) {
    return renderShellOutput(result, query);
  }
  if (["bugreport", "jdwp", "logcat"].includes(result.command_id)) {
    return renderDebuggingOutput(result, query);
  }
  if (["disable-verity", "enable-verity", "keygen"].includes(result.command_id)) {
    return renderSecurityOutput(result, query);
  }
  if (["input-text", "input-tap", "input-keyevent", "input-swipe", "input-press", "input-roll"].includes(result.command_id)) {
    return renderInputOutput(result, query);
  }
  if (["wait-for", "get-serialno", "get-devpath", "remount", "reboot", "root", "unroot", "tcpip", "usb"].includes(result.command_id)) {
    return renderDeviceControlOutput(result, query);
  }
  if (["start-server", "kill-server", "reconnect", "reconnect-device", "reconnect-offline", "attach", "detach"].includes(result.command_id)) {
    return renderServerOutput(result, query);
  }

  const lines = collectOutputLines(result.stdout || result.stderr);

  if (lines.length > 0) {
    return renderLineBlocks(lines, query);
  }

  if (result.stderr?.trim()) {
    return <div className="result-empty-state">{highlightText(result.stderr.trimEnd(), query)}</div>;
  }

  return <div className="result-empty-state">{highlightText(result.message ?? "命令已执行，但没有返回可展示的文本输出。", query)}</div>;
}
