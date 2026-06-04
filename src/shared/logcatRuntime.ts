import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, statSync, type WriteStream } from "node:fs";
import { basename, join } from "node:path";
import type { Readable } from "node:stream";
import JSZip from "jszip";
import { execFileDecoded, decodeBuffer } from "./execFileDecoded.js";

async function execFileAsync(file: string, args: string[] = [], options: Record<string, unknown> = {}): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileDecoded(file, args, options as any);
  return { stdout: String(result.stdout), stderr: String(result.stderr) };
}
const adbExecutable = process.env.ADB_HELPER_ADB ?? "adb";
const BUFFER_LIMIT = 3000;
const PROCESS_MAP_REFRESH_MS = 5000;
const LOGCAT_PATTERN = /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)\s+(\d+)\s+(\d+)\s+([A-Z])\s+(.*?):\s(.*)$/;

export interface LogcatStreamEntry {
  id: string;
  raw: string;
  timestamp: string;
  pid: string;
  tid: string;
  level: string;
  tag: string;
  message: string;
  packageName: string;
  parsed: boolean;
}

export interface LogcatSessionOptions {
  outputDir: string;
  maxFileSizeBytes: number;
  clearBeforeStart: boolean;
  filters?: LogcatCaptureFilters;
  buffers?: string[];
}

export interface LogcatCaptureFilters {
  searchTerm: string;
  regexEnabled: boolean;
  rules: Array<{
    field: "message" | "tag" | "pid" | "tid" | "package";
    joiner: "and" | "or";
    value: string;
  }>;
  levels: string[];
}

export interface LogcatStreamState {
  command: "logcat-stream-state";
  status: "ok" | "error";
  device: string;
  running: boolean;
  items: LogcatStreamEntry[];
  bufferedLines: number;
  droppedLines: number;
  bufferLimit: number;
  startedAt?: number;
  capturedAt?: number;
  outputDir?: string;
  currentFilePath?: string;
  savedFileCount?: number;
  maxFileSizeBytes?: number;
  clearBeforeStart?: boolean;
  message?: string;
}

export interface LogcatExportResult {
  command: "logcat-export";
  status: "ok" | "error";
  device: string;
  fileName?: string;
  contentText?: string;
  contentBase64?: string;
  mimeType?: string;
  fileCount?: number;
  message?: string;
}

interface LogcatSession {
  deviceId: string;
  running: boolean;
  child?: ChildProcessByStdio<null, Readable, Readable>;
  items: LogcatStreamEntry[];
  partialLine: string;
  processMap: Record<string, string>;
  processMapTimer?: NodeJS.Timeout;
  sequence: number;
  droppedLines: number;
  startedAt: number;
  capturedAt?: number;
  options: LogcatSessionOptions;
  fileBaseName: string;
  fileIndex: number;
  currentFilePath?: string;
  currentFileSize: number;
  persistedFiles: string[];
  fileStream?: WriteStream;
  message?: string;
  filters: LogcatCaptureFilters;
}

const sessions = new Map<string, LogcatSession>();

function formatThreadtimeNow() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const millis = String(now.getMilliseconds()).padStart(3, "0");
  return `${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`;
}

function formatLogFileTimestamp(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
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

function matchesTextFilter(value: string, filter: string, regexEnabled: boolean) {
  const normalizedFilter = filter.trim();
  if (!normalizedFilter) {
    return true;
  }

  if (regexEnabled) {
    const pattern = buildLogcatSearchRegex(normalizedFilter, true);
    return pattern ? pattern.test(value) : true;
  }

  return value.toLowerCase().includes(normalizedFilter.toLowerCase());
}

function matchesNumericTextFilter(value: string, filter: string, regexEnabled: boolean) {
  const normalizedFilter = filter.trim();
  if (!normalizedFilter) {
    return true;
  }

  if (regexEnabled) {
    const pattern = buildLogcatSearchRegex(normalizedFilter, true);
    return pattern ? pattern.test(value) : true;
  }

  const expectedValues = normalizedFilter
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  if (expectedValues.length > 1) {
    return expectedValues.includes(value);
  }

  return value.toLowerCase().includes(normalizedFilter.toLowerCase());
}

function matchesLogcatFilterRule(entry: LogcatStreamEntry, rule: LogcatCaptureFilters["rules"][number], regexEnabled: boolean) {
  if (rule.field === "message") {
    return matchesTextFilter(entry.message, rule.value, regexEnabled);
  }
  if (rule.field === "tag") {
    return matchesTextFilter(entry.tag, rule.value, regexEnabled);
  }
  if (rule.field === "pid") {
    return matchesNumericTextFilter(entry.pid, rule.value, regexEnabled);
  }
  if (rule.field === "tid") {
    return matchesNumericTextFilter(entry.tid, rule.value, regexEnabled);
  }
  return matchesTextFilter(entry.packageName, rule.value, regexEnabled);
}

function normalizeLogcatCaptureFilters(filters?: Partial<LogcatCaptureFilters>): LogcatCaptureFilters {
  const normalizedRules: LogcatCaptureFilters["rules"] = Array.isArray(filters?.rules)
    ? filters.rules.map((rule) => ({
        field: rule?.field === "tag" || rule?.field === "pid" || rule?.field === "tid" || rule?.field === "package" ? rule.field : "message",
        joiner: rule?.joiner === "or" ? "or" : "and",
        value: String(rule?.value ?? ""),
      }))
    : [];
  const normalizedLevels = Array.isArray(filters?.levels)
    ? Array.from(new Set(filters.levels.map((item) => String(item || "").toUpperCase()).filter((item) => ["V", "D", "I", "W", "E", "F"].includes(item))))
    : [];
  return {
    searchTerm: String(filters?.searchTerm ?? ""),
    regexEnabled: Boolean(filters?.regexEnabled),
    rules: normalizedRules,
    levels: normalizedLevels,
  };
}

function matchesLogcatCaptureFilters(entry: LogcatStreamEntry, filters: LogcatCaptureFilters) {
  const activeRules = filters.rules.filter((rule) => rule.value.trim());
  if (activeRules.length > 0) {
    const matched = activeRules.reduce((result, rule, index) => {
      const currentMatch = matchesLogcatFilterRule(entry, rule, filters.regexEnabled);
      if (index === 0) {
        return currentMatch;
      }
      return rule.joiner === "or" ? result || currentMatch : result && currentMatch;
    }, true);
    if (!matched) {
      return false;
    }
  }

  if (filters.levels.length > 0 && !filters.levels.includes(entry.level)) {
    return false;
  }

  const searchTerm = filters.searchTerm.trim();
  if (!searchTerm) {
    return true;
  }

  const haystack = [entry.timestamp, entry.level, entry.tag, entry.pid, entry.tid, entry.packageName, entry.message, entry.raw].join("\n");
  const pattern = buildLogcatSearchRegex(searchTerm, filters.regexEnabled);
  if (filters.regexEnabled && pattern) {
    return pattern.test(haystack);
  }
  return haystack.toLowerCase().includes(searchTerm.toLowerCase());
}

function buildLogFilePath(session: LogcatSession) {
  const suffix = session.fileIndex <= 1 ? "" : `_${session.fileIndex}`;
  return join(session.options.outputDir, `${session.fileBaseName}${suffix}.txt`);
}

function closeLogFile(session: LogcatSession) {
  if (!session.fileStream) {
    return;
  }

  session.fileStream.end();
  session.fileStream = undefined;
}

function openLogFile(session: LogcatSession) {
  mkdirSync(session.options.outputDir, { recursive: true });
  session.fileIndex += 1;
  session.currentFilePath = buildLogFilePath(session);
  session.currentFileSize = 0;
  session.fileStream = createWriteStream(session.currentFilePath, { flags: "a" });
  try {
    session.currentFileSize = statSync(session.currentFilePath).size;
  } catch {
    session.currentFileSize = 0;
  }
  if (session.currentFilePath && !session.persistedFiles.includes(session.currentFilePath)) {
    session.persistedFiles.push(session.currentFilePath);
  }
}

function ensureLogFile(session: LogcatSession, nextBytes = 0) {
  if (!session.fileStream) {
    openLogFile(session);
    return;
  }

  if (session.currentFileSize + nextBytes <= session.options.maxFileSizeBytes) {
    return;
  }

  closeLogFile(session);
  openLogFile(session);
}

async function flushLogFile(session: LogcatSession) {
  if (!session.fileStream) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    session.fileStream?.write("", (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function writeLogLine(session: LogcatSession, line: string) {
  const text = `${line}\n`;
  const nextBytes = Buffer.byteLength(text);

  try {
    ensureLogFile(session, nextBytes);
    session.fileStream?.write(text);
    session.currentFileSize += nextBytes;
  } catch (error) {
    session.message = error instanceof Error ? error.message : "写入日志文件失败。";
  }
}

function resetSessionCaptureWindow(session: LogcatSession) {
  session.items = [];
  session.partialLine = "";
  session.droppedLines = 0;
  session.sequence = 0;
  session.capturedAt = undefined;
  session.message = undefined;
  closeLogFile(session);
  session.fileBaseName = `logcat_${formatLogFileTimestamp()}`;
  session.fileIndex = 0;
  session.currentFilePath = undefined;
  session.currentFileSize = 0;
  session.persistedFiles = [];
}

function buildStateFromSession(session: LogcatSession): LogcatStreamState {
  return {
    command: "logcat-stream-state",
    status: "ok",
    device: session.deviceId,
    running: session.running,
    items: session.items,
    bufferedLines: session.items.length,
    droppedLines: session.droppedLines,
    bufferLimit: BUFFER_LIMIT,
    startedAt: session.startedAt,
    capturedAt: session.capturedAt,
    outputDir: session.options.outputDir,
    currentFilePath: session.currentFilePath,
    savedFileCount: session.persistedFiles.length,
    maxFileSizeBytes: session.options.maxFileSizeBytes,
    clearBeforeStart: session.options.clearBeforeStart,
    message: session.message,
  };
}

function disposeSession(session: LogcatSession) {
  if (session.processMapTimer) {
    clearInterval(session.processMapTimer);
    session.processMapTimer = undefined;
  }
  if (session.child && !session.child.killed) {
    session.child.kill();
  }
  session.running = false;
  session.child = undefined;
  closeLogFile(session);
}

async function fetchProcessMap(deviceId: string) {
  const commands = [
    ["-s", deviceId, "shell", "ps", "-A", "-o", "PID,NAME"],
    ["-s", deviceId, "shell", "ps", "-A"],
  ];

  for (const command of commands) {
    try {
      const { stdout } = await execFileAsync(adbExecutable, command);
      const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const processMap: Record<string, string> = {};
      for (const line of lines) {
        if (/^(PID|USER)\b/i.test(line)) {
          continue;
        }
        const parts = line.split(/\s+/);
        if (command.at(-1) === "PID,NAME") {
          if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
            processMap[parts[0]] = parts[1];
          }
          continue;
        }

        const pid = parts.find((part) => /^\d+$/.test(part)) ?? "";
        const name = parts.at(-1) ?? "";
        if (pid && name) {
          processMap[pid] = name;
        }
      }
      if (Object.keys(processMap).length > 0) {
        return processMap;
      }
    } catch {
      continue;
    }
  }

  return {};
}

function parseLogLine(line: string, processMap: Record<string, string>, id: string): LogcatStreamEntry {
  const matched = line.match(LOGCAT_PATTERN);
  if (!matched) {
    return {
      id,
      raw: line,
      timestamp: "",
      pid: "",
      tid: "",
      level: "",
      tag: "",
      message: line,
      packageName: "",
      parsed: false,
    };
  }

  const [, timestamp, pid, tid, level, tag, message] = matched;
  return {
    id,
    raw: line,
    timestamp,
    pid,
    tid,
    level,
    tag,
    message,
    packageName: processMap[pid] ?? "",
    parsed: true,
  };
}

function pushLine(session: LogcatSession, line: string) {
  const entry = parseLogLine(line, session.processMap, `${session.deviceId}-${++session.sequence}`);
  if (!matchesLogcatCaptureFilters(entry, session.filters)) {
    return;
  }
  session.items.push(entry);
  if (session.items.length > BUFFER_LIMIT) {
    const overflow = session.items.length - BUFFER_LIMIT;
    session.items.splice(0, overflow);
    session.droppedLines += overflow;
  }
  session.capturedAt = Date.now();
  writeLogLine(session, line);
}

function wireStream(session: LogcatSession) {
  session.child?.stdout.on("data", (chunk: Buffer | string) => {
    const chunkStr = chunk instanceof Buffer ? decodeBuffer(chunk) : String(chunk);
    const text = `${session.partialLine}${chunkStr}`;
    const lines = text.split(/\r?\n/);
    session.partialLine = lines.pop() ?? "";
    for (const line of lines) {
      const normalized = line.trimEnd();
      if (!normalized) {
        continue;
      }
      pushLine(session, normalized);
    }
  });

  session.child?.stderr.on("data", (chunk: Buffer | string) => {
    const chunkStr = chunk instanceof Buffer ? decodeBuffer(chunk) : String(chunk);
    const message = chunkStr.trim();
    if (message) {
      session.message = message;
    }
  });

  session.child?.on("close", () => {
    if (session.partialLine.trim()) {
      pushLine(session, session.partialLine.trimEnd());
      session.partialLine = "";
    }
    if (session.processMapTimer) {
      clearInterval(session.processMapTimer);
      session.processMapTimer = undefined;
    }
    session.running = false;
    session.child = undefined;
    closeLogFile(session);
  });
}

export async function startLogcatSession(deviceId: string, options: LogcatSessionOptions) {
  const previous = sessions.get(deviceId);
  if (previous) {
    disposeSession(previous);
    sessions.delete(deviceId);
  }

  try {
    if (options.clearBeforeStart) {
      await execFileAsync(adbExecutable, ["-s", deviceId, "logcat", "-c"]);
    }

    const startTimestamp = formatThreadtimeNow();
    const logcatArgs = ["-s", deviceId, "logcat", "-v", "threadtime"];
    if (options.buffers && options.buffers.length > 0) {
      for (const buf of options.buffers) logcatArgs.push("-b", buf);
    }
    logcatArgs.push("-T", startTimestamp);
    const child = spawn(adbExecutable, logcatArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const session: LogcatSession = {
      deviceId,
      running: true,
      child,
      items: [],
      partialLine: "",
      processMap: {},
      sequence: 0,
      droppedLines: 0,
      startedAt: Date.now(),
      options,
      fileBaseName: `logcat_${formatLogFileTimestamp()}`,
      fileIndex: 0,
      currentFileSize: 0,
      persistedFiles: [],
      filters: normalizeLogcatCaptureFilters(options.filters),
      message: undefined,
    };

    ensureLogFile(session);
    void fetchProcessMap(deviceId).then((processMap) => {
      const activeSession = sessions.get(deviceId);
      if (activeSession) {
        activeSession.processMap = processMap;
      }
    }).catch(() => undefined);
    session.processMapTimer = setInterval(async () => {
      session.processMap = await fetchProcessMap(deviceId);
    }, PROCESS_MAP_REFRESH_MS);

    wireStream(session);
    sessions.set(deviceId, session);
    return getLogcatSessionState(deviceId);
  } catch (error) {
    return {
      ...buildEmptyState(deviceId),
      status: "error",
      outputDir: options.outputDir,
      maxFileSizeBytes: options.maxFileSizeBytes,
      clearBeforeStart: options.clearBeforeStart,
      message: error instanceof Error ? error.message : "启动日志捕获失败。",
    };
  }
}

export function stopLogcatSession(deviceId: string) {
  const session = sessions.get(deviceId);
  if (!session) {
    return getLogcatSessionState(deviceId);
  }

  disposeSession(session);
  session.message = "日志捕获已停止。";
  return buildStateFromSession(session);
}

export function updateLogcatSessionFilters(deviceId: string, filters: Partial<LogcatCaptureFilters>) {
  const session = sessions.get(deviceId);
  if (!session) {
    return buildEmptyState(deviceId);
  }

  session.filters = normalizeLogcatCaptureFilters(filters);
  resetSessionCaptureWindow(session);
  session.message = "已按最新筛选条件重建当前捕获窗口。";
  return buildStateFromSession(session);
}

export async function clearLogcatSession(deviceId: string, filters?: Partial<LogcatCaptureFilters>) {
  const session = sessions.get(deviceId);

  if (!session) {
    void execFileAsync(adbExecutable, ["-s", deviceId, "logcat", "-c"]).catch(() => undefined);
    return {
      ...buildEmptyState(deviceId),
      message: "设备日志清空请求已发出。",
    };
  }

  if (filters) {
    session.filters = normalizeLogcatCaptureFilters(filters);
  }
  resetSessionCaptureWindow(session);
  session.message = session.running ? "设备日志清空请求已发出，正在按当前筛选条件继续捕获。" : "设备日志清空请求已发出。";
  void execFileAsync(adbExecutable, ["-s", deviceId, "logcat", "-c"]).catch((error) => {
    session.message = error instanceof Error ? error.message : "设备日志清空失败。";
  });
  return buildStateFromSession(session);
}

function buildEmptyState(deviceId: string): LogcatStreamState {
  return {
    command: "logcat-stream-state",
    status: "ok",
    device: deviceId,
    running: false,
    items: [],
    bufferedLines: 0,
    droppedLines: 0,
    bufferLimit: BUFFER_LIMIT,
  };
}

export function getLogcatSessionState(deviceId: string): LogcatStreamState {
  const session = sessions.get(deviceId);
  if (!session) {
    return buildEmptyState(deviceId);
  }

  return buildStateFromSession(session);
}

export async function exportLogcatSession(deviceId: string): Promise<LogcatExportResult> {
  const session = sessions.get(deviceId);
  if (!session || session.persistedFiles.length === 0) {
    return {
      command: "logcat-export",
      status: "error",
      device: deviceId,
      message: "当前会话还没有可下载的日志文件。",
    };
  }

  try {
    await flushLogFile(session);
    const files = [...session.persistedFiles];
    const currentName = session.currentFilePath ? basename(session.currentFilePath) : `${session.fileBaseName}.txt`;
    const fileStem = currentName.replace(/(?:_\d+)?\.txt$/i, "") || session.fileBaseName;
    const entries = files.map((filePath) => ({
      fileName: basename(filePath),
      content: readFileSync(filePath, "utf-8"),
    }));
    if (entries.length === 1) {
      const [entry] = entries;
      return {
        command: "logcat-export",
        status: "ok",
        device: deviceId,
        fileName: entry.fileName || `${fileStem}_download.txt`,
        contentText: entry.content,
        mimeType: "text/plain;charset=utf-8",
        fileCount: 1,
        message: "已生成日志下载文件。",
      };
    }

    const archive = new JSZip();
    entries.forEach((entry) => {
      archive.file(entry.fileName, entry.content);
    });
    const contentBase64 = await archive.generateAsync({ type: "base64" });
    return {
      command: "logcat-export",
      status: "ok",
      device: deviceId,
      fileName: `${fileStem}_logs.zip`,
      contentBase64,
      mimeType: "application/zip",
      fileCount: files.length,
      message: `已准备 ${files.length} 个日志分片，将以 zip 下载。`,
    };
  } catch (error) {
    return {
      command: "logcat-export",
      status: "error",
      device: deviceId,
      message: error instanceof Error ? error.message : "生成日志下载文件失败。",
    };
  }
}

export function stopAllLogcatSessions() {
  for (const deviceId of sessions.keys()) {
    stopLogcatSession(deviceId);
  }
}