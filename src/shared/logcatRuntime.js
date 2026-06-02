import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
const adbExecutable = process.env.ADB_HELPER_ADB ?? "adb";
const BUFFER_LIMIT = 3000;
const PROCESS_MAP_REFRESH_MS = 5000;
const LOGCAT_PATTERN = /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)\s+(\d+)\s+(\d+)\s+([A-Z])\s+(.*?):\s(.*)$/;
const sessions = new Map();
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
async function getStartTimestamp(deviceId) {
    try {
        const { stdout } = await execFileAsync(adbExecutable, ["-s", deviceId, "logcat", "-d", "-v", "threadtime", "-t", "1"]);
        const lastLine = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? "";
        const matched = lastLine.match(LOGCAT_PATTERN);
        return matched?.[1] ?? formatThreadtimeNow();
    }
    catch {
        return formatThreadtimeNow();
    }
}
async function fetchProcessMap(deviceId) {
    const commands = [
        ["-s", deviceId, "shell", "ps", "-A", "-o", "PID,NAME"],
        ["-s", deviceId, "shell", "ps", "-A"],
    ];
    for (const command of commands) {
        try {
            const { stdout } = await execFileAsync(adbExecutable, command);
            const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
            const processMap = {};
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
        }
        catch {
            continue;
        }
    }
    return {};
}
function parseLogLine(line, processMap, id) {
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
function pushLine(session, line) {
    const entry = parseLogLine(line, session.processMap, `${session.deviceId}-${++session.sequence}`);
    session.items.push(entry);
    if (session.items.length > BUFFER_LIMIT) {
        const overflow = session.items.length - BUFFER_LIMIT;
        session.items.splice(0, overflow);
        session.droppedLines += overflow;
    }
    session.capturedAt = Date.now();
}
function wireStream(session) {
    session.child.stdout.on("data", (chunk) => {
        const text = `${session.partialLine}${String(chunk)}`;
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
    session.child.stderr.on("data", (chunk) => {
        const message = String(chunk).trim();
        if (message) {
            session.message = message;
        }
    });
    session.child.on("close", () => {
        if (session.processMapTimer) {
            clearInterval(session.processMapTimer);
        }
    });
}
export async function startLogcatSession(deviceId) {
    stopLogcatSession(deviceId);
    const startTimestamp = await getStartTimestamp(deviceId);
    const processMap = await fetchProcessMap(deviceId);
    const child = spawn(adbExecutable, ["-s", deviceId, "logcat", "-v", "threadtime", "-T", startTimestamp], {
        stdio: ["ignore", "pipe", "pipe"],
    });
    const session = {
        deviceId,
        child,
        items: [],
        partialLine: "",
        processMap,
        sequence: 0,
        droppedLines: 0,
        startedAt: Date.now(),
    };
    session.processMapTimer = setInterval(async () => {
        session.processMap = await fetchProcessMap(deviceId);
    }, PROCESS_MAP_REFRESH_MS);
    wireStream(session);
    sessions.set(deviceId, session);
    return getLogcatSessionState(deviceId);
}
export function stopLogcatSession(deviceId) {
    const session = sessions.get(deviceId);
    if (!session) {
        return getLogcatSessionState(deviceId);
    }
    if (session.processMapTimer) {
        clearInterval(session.processMapTimer);
    }
    session.child.kill();
    sessions.delete(deviceId);
    return {
        ...buildEmptyState(deviceId),
        message: "日志捕获已停止。",
    };
}
function buildEmptyState(deviceId) {
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
export function getLogcatSessionState(deviceId) {
    const session = sessions.get(deviceId);
    if (!session) {
        return buildEmptyState(deviceId);
    }
    return {
        command: "logcat-stream-state",
        status: "ok",
        device: deviceId,
        running: !session.child.killed,
        items: session.items,
        bufferedLines: session.items.length,
        droppedLines: session.droppedLines,
        bufferLimit: BUFFER_LIMIT,
        startedAt: session.startedAt,
        capturedAt: session.capturedAt,
        message: session.message,
    };
}
export function stopAllLogcatSessions() {
    for (const deviceId of sessions.keys()) {
        stopLogcatSession(deviceId);
    }
}
