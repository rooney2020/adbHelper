import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import BackupPage from "./BackupPage";

// ── Types ────────────────────────────────────────────────────────────────

type BuildTab = "compile" | "backup";

type BuildType = "aosp" | "qnx" | "app" | "custom";

interface PushFile {
  localPath: string;
  remotePath: string;
}

interface BuildTarget {
  id: string;
  name: string;
  makeTarget: string;
  pushFiles: PushFile[];
}

interface BuildEnvironment {
  id: string;
  name: string;
  type: BuildType;
  sourceDir: string;
  // AOSP-specific
  lunchCombo?: string;
  makeTarget?: string;
  makeFlags?: string;
  makeJobs?: number;
  // QNX-specific
  qnxArch?: string;
  qnxEnvScript?: string;
  qnxTarget?: string;
  // APP-specific
  appVariant?: string;
  gradleTask?: string;
  jdkPath?: string;
  // Custom
  command?: string;
  envVars?: string;
  // Build target presets
  buildTargets?: BuildTarget[];
}

interface BuildSessionStatus {
  running: boolean;
  logs: string;
  startTime: number | null;
  envName?: string;
}

const BUILD_TYPES: Array<{ id: BuildType; label: string }> = [
  { id: "aosp", label: "AOSP (Android)" },
  { id: "qnx", label: "QNX" },
  { id: "app", label: "APP (Android 应用)" },
  { id: "custom", label: "自定义" },
];

const TYPE_DEFAULTS: Record<BuildType, Partial<BuildEnvironment>> = {
  aosp: { lunchCombo: "aosp_arm64-userdebug", makeTarget: "", makeJobs: 0 },
  qnx: { qnxArch: "x86_64", qnxEnvScript: "source qnxsdp-env.sh", qnxTarget: "all" },
  app: { appVariant: "release", gradleTask: "assembleRelease", jdkPath: "" },
  custom: { command: "", envVars: "" },
};

function generateId(): string {
  return `env-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildCommandFromEnv(env: BuildEnvironment): string {
  switch (env.type) {
    case "aosp": {
      const parts: string[] = [];
      if (env.sourceDir) parts.push(`cd "${env.sourceDir}"`);
      parts.push("source build/envsetup.sh");
      if (env.lunchCombo) parts.push(`lunch ${env.lunchCombo}`);
      const target = env.makeTarget || "";
      const jobs = env.makeJobs ?? 0;
      const jobsFlag = jobs > 0 ? `-j${jobs}` : "-j$(nproc)";
      parts.push(`make ${jobsFlag} ${target}`.trim());
      return parts.join(" && ");
    }
    case "qnx": {
      const parts: string[] = [];
      if (env.sourceDir) parts.push(`cd "${env.sourceDir}"`);
      if (env.qnxEnvScript) parts.push(env.qnxEnvScript);
      if (env.qnxTarget) {
        const arch = env.qnxArch ? `-A ${env.qnxArch}` : "";
        parts.push(`make ${arch} ${env.qnxTarget}`.trim());
      } else {
        parts.push("make");
      }
      return parts.join(" && ");
    }
    case "app": {
      const parts: string[] = [];
      if (env.jdkPath) parts.push(`export JAVA_HOME="${env.jdkPath}"`);
      if (env.sourceDir) parts.push(`cd "${env.sourceDir}"`);
      parts.push(`./gradlew ${env.gradleTask || "assembleRelease"}${env.appVariant === "debug" ? "Debug" : "Release"}`);
      return parts.join(" && ");
    }
    case "custom":
    default:
      return env.command || "";
  }
}

function formatDuration(startTime: number): string {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return m > 0 ? `${m}m${s}s` : `${s}s`;
}

function formatTimestampMs(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", { hour12: false });
}

// ── Icon helpers ──────────────────────────────────────────────────────────

const ICONS: Record<BuildType, string> = {
  aosp: "android",
  qnx: "code",
  app: "app-window",
  custom: "terminal",
};

// ── Component ─────────────────────────────────────────────────────────────

interface BuildPageProps {
  hasCurrentDevice: boolean;
  currentDeviceId?: string;
  buildEnvReloadKey?: number;
  // Backup props
  backupBusyAction: "backup" | "restore" | null;
  selectedBackupPaths: string[];
  selectedRestorePaths: string[];
  backupDetailItems: Array<{ label: string; value: string }>;
  currentBackupStatus: string;
  currentBackupMissingPaths: string[];
  hasCurrentBackup: boolean;
  backupPaths: string[];
  restorePaths: string[];
  availableBackups: Array<{ versionName: string; status: string; path: string; lastUpdatedAt?: number | null; missingPaths: string[] }>;
  pendingBackupDeleteVersion: string | null;
  backupActionResult: any;
  backupInfoMessage: string | null;
  formatTimestampText: (value: number | null | undefined) => string;
  onRefresh: () => void;
  onBackup: () => void;
  onRestore: () => void;
  onToggleSelectedPath: (path: string, mode: "backup" | "restore") => void;
  onOpenBackupDirectory: (versionName: string) => void;
  onConfirmDeleteBackupVersion: (versionName: string) => void;
  onRequestDeleteBackupVersion: (versionName: string | null) => void;
}

export default function BuildPage(props: BuildPageProps) {
  const [activeTab, setActiveTab] = useState<BuildTab>("compile");

  return (
    <div className="build-page-container" style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <div className="device-info-layout" style={{ flex: 1, minHeight: 0 }}>
        <aside className="device-info-sidebar">
          <button
            className={`device-info-tab ${activeTab === "compile" ? "active" : ""}`}
            onClick={() => setActiveTab("compile")}
          >
            <strong>编译</strong>
          </button>
          <button
            className={`device-info-tab ${activeTab === "backup" ? "active" : ""}`}
            onClick={() => setActiveTab("backup")}
          >
            <strong>备份与恢复</strong>
          </button>
        </aside>

        <div className="device-info-content">
          {activeTab === "compile" ? <CompileTab deviceId={props.currentDeviceId} buildEnvReloadKey={props.buildEnvReloadKey} /> : null}
          {activeTab === "backup" ? (
            <div className="build-backup-wrapper" style={{ minHeight: 0 }}>
              <BackupTab {...props} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Backup Tab ────────────────────────────────────────────────────────────

function BackupTab(props: BuildPageProps) {
  return (
    <BackupPage
      hasCurrentDevice={props.hasCurrentDevice}
      backupBusyAction={props.backupBusyAction}
      selectedBackupPaths={props.selectedBackupPaths}
      selectedRestorePaths={props.selectedRestorePaths}
      backupDetailItems={props.backupDetailItems}
      currentBackupStatus={props.currentBackupStatus}
      currentBackupMissingPaths={props.currentBackupMissingPaths}
      hasCurrentBackup={props.hasCurrentBackup}
      backupPaths={props.backupPaths}
      restorePaths={props.restorePaths}
      availableBackups={props.availableBackups}
      pendingBackupDeleteVersion={props.pendingBackupDeleteVersion}
      backupActionResult={props.backupActionResult}
      backupInfoMessage={props.backupInfoMessage}
      formatTimestampText={props.formatTimestampText}
      onRefresh={props.onRefresh}
      onBackup={props.onBackup}
      onRestore={props.onRestore}
      onToggleSelectedPath={props.onToggleSelectedPath}
      onOpenBackupDirectory={props.onOpenBackupDirectory}
      onConfirmDeleteBackupVersion={props.onConfirmDeleteBackupVersion}
      onRequestDeleteBackupVersion={props.onRequestDeleteBackupVersion}
    />
  );
}

// ── Compile Tab ───────────────────────────────────────────────────────────

function CompileTab({ deviceId, buildEnvReloadKey }: { deviceId?: string; buildEnvReloadKey?: number }) {
  const api = (window as any).adbHelperApi;

  // Environments
  const [environments, setEnvironments] = useState<BuildEnvironment[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<BuildEnvironment | null>(null);

  // Running build tracking
  const [runningBuilds, setRunningBuilds] = useState<Set<string>>(new Set());
  const [buildLogs, setBuildLogs] = useState<Map<string, string>>(new Map());
  const [buildResults, setBuildResults] = useState<Map<string, { exitCode: number | null; envName: string }>>(new Map());

  // Push tracking (key = `${envId}:${targetId}`)
  const [pushRunning, setPushRunning] = useState<Map<string, boolean>>(new Map());
  const [pushLogs, setPushLogs] = useState<Map<string, string>>(new Map());
  const [pushResults, setPushResults] = useState<Map<string, { exitCode: number | null; targetName: string }>>(new Map());

  // Target dialog
  const [targetDialog, setTargetDialog] = useState<{ envId: string; target: BuildTarget | null } | null>(null);
  const logEndRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Load saved environments
  useEffect(() => {
    if (!api?.storage) return;
    api.storage.loadAll().then((result: any) => {
      if (result.status === "ok" && result.data?.buildEnvironments) {
        setEnvironments(result.data.buildEnvironments);
        // Restore build status for each
        for (const env of result.data.buildEnvironments) {
          api.build.status({ envId: env.id }).then((s: BuildSessionStatus) => {
            if (s.running) {
              setRunningBuilds((prev) => new Set(prev).add(env.id));
              setBuildLogs((prev) => new Map(prev).set(env.id, s.logs));
            }
          });
        }
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [api]);

  // Re-read from storage when import triggers reload
  useEffect(() => {
    if (buildEnvReloadKey === undefined || buildEnvReloadKey === 0) return;
    if (!api?.storage) return;
    api.storage.loadAll().then((result: any) => {
      if (result.status === "ok" && result.data?.buildEnvironments) {
        setEnvironments(result.data.buildEnvironments);
        // Clear any stale push results since envs changed
        setPushResults(new Map());
        setBuildResults(new Map());
      }
    }).catch(() => {});
  }, [buildEnvReloadKey]);

  // Save environments
  const saveEnvironments = useCallback(async (envs: BuildEnvironment[]) => {
    if (!api?.storage) return;
    await api.storage.save({ key: "buildEnvironments", value: envs });
  }, [api]);

  // Listen for build IPC events
  useEffect(() => {
    if (!api?.build) return;
    const unsubLog = api.build.onLog((data: { envId: string; text: string }) => {
      setBuildLogs((prev) => {
        const next = new Map(prev);
        const existing = next.get(data.envId) || "";
        next.set(data.envId, existing + data.text);
        return next;
      });
    });
    const unsubDone = api.build.onDone((data: { envId: string; exitCode: number | null; envName: string }) => {
      setRunningBuilds((prev) => {
        const next = new Set(prev);
        next.delete(data.envId);
        return next;
      });
      setBuildResults((prev) => new Map(prev).set(data.envId, { exitCode: data.exitCode, envName: data.envName }));
    });

    // Push IPC
    const unsubPushLog = api.push?.onLog?.((data: { envId: string; targetId: string; text: string }) => {
      const key = `${data.envId}:${data.targetId}`;
      setPushLogs((prev) => {
        const next = new Map(prev);
        next.set(key, (next.get(key) || "") + data.text);
        return next;
      });
    });
    const unsubPushDone = api.push?.onDone?.((data: { envId: string; targetId: string; exitCode: number | null; targetName: string }) => {
      const key = `${data.envId}:${data.targetId}`;
      setPushRunning((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      setPushResults((prev) => new Map(prev).set(key, { exitCode: data.exitCode, targetName: data.targetName }));
    });

    return () => {
      unsubLog();
      unsubDone();
      unsubPushLog?.();
      unsubPushDone?.();
    };
  }, [api]);

  // Target handlers
  const handleAddTarget = (envId: string) => {
    setTargetDialog({ envId, target: null });
  };
  const handleEditTarget = (envId: string, target: BuildTarget) => {
    setTargetDialog({ envId, target });
  };
  const handleSaveTarget = (envId: string, target: BuildTarget) => {
    setEnvironments((prev) => {
      const updated = prev.map((e) => {
        if (e.id !== envId) return e;
        const existing = e.buildTargets || [];
        const idx = existing.findIndex((t) => t.id === target.id);
        const buildTargets = idx >= 0
          ? existing.map((t) => (t.id === target.id ? target : t))
          : [...existing, target];
        return { ...e, buildTargets };
      });
      saveEnvironments(updated);
      return updated;
    });
    setTargetDialog(null);
  };
  const handleDeleteTarget = (envId: string, targetId: string) => {
    setEnvironments((prev) => {
      const updated = prev.map((e) => {
        if (e.id !== envId) return e;
        return { ...e, buildTargets: (e.buildTargets || []).filter((t) => t.id !== targetId) };
      });
      saveEnvironments(updated);
      return updated;
    });
  };

  const handleTargetBuild = async (env: BuildEnvironment, target: BuildTarget) => {
    if (!api?.build) return;
    // Build command using target's makeTarget instead of env.makeTarget
    const cmdEnv = { ...env, makeTarget: target.makeTarget };
    const command = buildCommandFromEnv(cmdEnv);
    const result = await api.build.start({
      envId: env.id,
      envName: `${env.name} (${target.name})`,
      workDir: env.sourceDir,
      type: env.type,
      command,
    });
    if (result.status === "ok") {
      setRunningBuilds((prev) => new Set(prev).add(env.id));
      setBuildLogs((prev) => new Map(prev).set(env.id, ""));
      setBuildResults((prev) => {
        const next = new Map(prev);
        next.delete(env.id);
        return next;
      });
    }
  };

  const handleTargetPush = async (envId: string, target: BuildTarget, deviceId: string, sourceDir: string) => {
    if (!api?.push || !deviceId || !target.pushFiles.length) return;
    const key = `${envId}:${target.id}`;
    // Resolve local paths relative to source directory
    const resolvedFiles = target.pushFiles.map((f) => ({
      localPath: f.localPath.startsWith("/") ? f.localPath : `${sourceDir}/${f.localPath}`,
      remotePath: f.remotePath,
    }));
    const result = await api.push.start({
      envId,
      targetId: target.id,
      targetName: target.name,
      deviceId,
      files: resolvedFiles,
    });
    if (result.status === "ok") {
      setPushRunning((prev) => new Map(prev).set(key, true));
      setPushLogs((prev) => new Map(prev).set(key, ""));
      setPushResults((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // ── Import / Export handlers ─────────────────────────────────────────
  const handleExportEnvs = () => {
    const data = {
      version: 1,
      type: "adb-helper-build-envs",
      exportTime: new Date().toISOString(),
      environments,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `build_environments_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportEnvs = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.type !== "adb-helper-build-envs" && data.type !== "adb-helper-all") {
          window.alert("这不是有效的编译环境导出文件");
          return;
        }
        const envs: BuildEnvironment[] = data.environments || data.buildEnvironments;
        if (!Array.isArray(envs) || !envs.length) {
          window.alert("文件中没有找到编译环境数据");
          return;
        }
        if (window.confirm(`即将导入 ${envs.length} 个编译环境，确认导入？`)) {
          setEnvironments(envs);
          saveEnvironments(envs);
        }
      } catch (err) {
        window.alert("文件解析失败：" + (err instanceof Error ? err.message : String(err)));
      }
    };
    input.click();
  };

  const handleStopPush = async (envId: string, targetId: string) => {
    if (!api?.push) return;
    await api.push.stop({ envId, targetId });
  };

  // Auto-scroll log panels
  useEffect(() => {
    for (const [envId, ref] of logEndRefs.current.entries()) {
      if (ref) ref.scrollIntoView({ behavior: "smooth" });
    }
  });

  // Open add dialog
  const handleAdd = () => {
    setEditingEnv(null);
    setDialogOpen(true);
  };

  // Open edit dialog
  const handleEdit = (env: BuildEnvironment) => {
    setEditingEnv(env);
    setDialogOpen(true);
  };

  // Save env from dialog
  const handleSaveEnv = (env: BuildEnvironment) => {
    const isNew = !environments.find((e) => e.id === env.id);
    const updated = isNew ? [...environments, env] : environments.map((e) => (e.id === env.id ? env : e));
    setEnvironments(updated);
    saveEnvironments(updated);
    setDialogOpen(false);
    setEditingEnv(null);
  };

  // Delete env
  const handleDelete = (envId: string) => {
    const updated = environments.filter((e) => e.id !== envId);
    setEnvironments(updated);
    saveEnvironments(updated);
  };

  // Start build
  const handleStartBuild = async (env: BuildEnvironment) => {
    if (!api?.build) return;
    const command = buildCommandFromEnv(env);
    const result = await api.build.start({
      envId: env.id,
      envName: env.name,
      workDir: env.sourceDir,
      type: env.type,
      command,
    });
    if (result.status === "ok") {
      setRunningBuilds((prev) => new Set(prev).add(env.id));
      setBuildLogs((prev) => new Map(prev).set(env.id, ""));
      setBuildResults((prev) => {
        const next = new Map(prev);
        next.delete(env.id);
        return next;
      });
    }
  };

  // Stop build
  const handleStopBuild = async (envId: string) => {
    if (!api?.build) return;
    await api.build.stop({ envId });
  };

  // Update a single field on an environment (inline edits)
  const handleUpdateEnv = useCallback((envId: string, field: keyof BuildEnvironment, value: string | number) => {
    setEnvironments((prev) => {
      const updated = prev.map((e) => (e.id === envId ? { ...e, [field]: value as any } : e));
      saveEnvironments(updated);
      return updated;
    });
  }, [saveEnvironments]);

  // Clear logs
  const handleClearLogs = (envId: string) => {
    setBuildLogs((prev) => {
      const next = new Map(prev);
      next.delete(envId);
      return next;
    });
    setBuildResults((prev) => {
      const next = new Map(prev);
      next.delete(envId);
      return next;
    });
  };

  const allCompileCardStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  };

  return (
    <div style={allCompileCardStyle}>
      {/* Header */}
      <div className="page-header">
        <div>
          <p className="section-kicker">编译环境</p>
          <h3>管理 AOSP / QNX / APP 编译和自定义编译</h3>
          <p className="panel-list-subtitle">按类型配置编译方式，一键启动编译任务并查看实时日志。</p>
        </div>
        <div className="page-actions">
          <button className="ghost-button" onClick={handleImportEnvs}>导入</button>
          <button className="ghost-button" onClick={handleExportEnvs}>导出</button>
          <button className="primary-button" onClick={handleAdd}>新建编译环境</button>
        </div>
      </div>

      {environments.length === 0 ? (
        <div className="result-empty-state">
          {loaded ? "还没有编译环境，点击上方「新建编译环境」开始配置" : "加载中..."}
        </div>
      ) : (
        environments.map((env) => {
          const isRunning = runningBuilds.has(env.id);
          const logs = buildLogs.get(env.id) || "";
          const result = buildResults.get(env.id);
          const envCardStyle: React.CSSProperties = {
            border: "1px solid var(--border-color, #e0e0e0)",
            borderRadius: "8px",
            padding: "16px",
            backgroundColor: "var(--card-bg, #fff)",
          };
          const envHeadStyle: React.CSSProperties = {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "8px",
          };
          const envMetaStyle: React.CSSProperties = {
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            fontSize: "12px",
            color: "var(--text-secondary, #666)",
            marginBottom: "8px",
          };
          const envActionsStyle: React.CSSProperties = {
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
          };
          const badgeStyle = (type: BuildType): React.CSSProperties => ({
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "2px 8px",
            borderRadius: "4px",
            fontSize: "11px",
            fontWeight: 600,
            backgroundColor: type === "aosp" ? "#e3f2fd" : type === "qnx" ? "#fce4ec" : type === "app" ? "#e8f5e9" : "#fff3e0",
            color: type === "aosp" ? "#1565c0" : type === "qnx" ? "#c62828" : type === "app" ? "#2e7d32" : "#e65100",
          });
          const resultBadgeStyle: React.CSSProperties = {
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "2px 8px",
            borderRadius: "4px",
            fontSize: "11px",
            fontWeight: 600,
            backgroundColor: result?.exitCode === 0 ? "#e8f5e9" : result ? "#ffebee" : "#fff8e1",
            color: result?.exitCode === 0 ? "#2e7d32" : result ? "#c62828" : "#e65100",
          };
          const typeLabel = BUILD_TYPES.find((t) => t.id === env.type)?.label || env.type;
          const commandPreview = buildCommandFromEnv(env);

          return (
            <div key={env.id} style={envCardStyle}>
              <div style={envHeadStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <strong style={{ fontSize: "15px" }}>{env.name}</strong>
                  <span style={badgeStyle(env.type)}>{typeLabel}</span>
                  {isRunning ? (
                    <span style={{ fontSize: "11px", color: "#1565c0" }}>
                      ⏳ 编译中...
                    </span>
                  ) : result ? (
                    <span style={resultBadgeStyle}>
                      {result.exitCode === 0 ? "✓ 编译成功" : "✕ 编译失败"}
                    </span>
                  ) : null}
                </div>
              </div>

              <div style={envMetaStyle}>
                <span>📂 {env.sourceDir}</span>
                {env.type === "aosp" && env.lunchCombo ? <span>🍽 {env.lunchCombo}</span> : null}
                {env.type === "aosp" ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary, #666)" }}>🎯 make</span>
                    <input
                      value={env.makeTarget || ""}
                      onChange={(e) => handleUpdateEnv(env.id, "makeTarget", e.target.value)}
                      placeholder="bootimage / 空=全量"
                      disabled={isRunning}
                      style={{
                        width: "280px",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        border: "1px solid var(--border-color, #d0d0d0)",
                        fontSize: "13px",
                        backgroundColor: isRunning ? "var(--disabled-bg, #f0f0f0)" : "var(--input-bg, #fff)",
                        color: "var(--text-primary, #333)",
                        fontFamily: "monospace",
                      }}
                    />
                    <span style={{ fontSize: "12px", color: "var(--text-secondary, #666)", marginLeft: "8px" }}>⚡ -j</span>
                    <input
                      type="number"
                      min={1}
                      max={128}
                      value={env.makeJobs ?? 0}
                      onChange={(e) => handleUpdateEnv(env.id, "makeJobs", Math.max(0, parseInt(e.target.value) || 0))}
                      placeholder="auto"
                      disabled={isRunning}
                      style={{
                        width: "68px",
                        padding: "4px 6px",
                        borderRadius: "4px",
                        border: "1px solid var(--border-color, #d0d0d0)",
                        fontSize: "13px",
                        backgroundColor: isRunning ? "var(--disabled-bg, #f0f0f0)" : "var(--input-bg, #fff)",
                        color: "var(--text-primary, #333)",
                      }}
                    />
                  </span>
                ) : null}
                {env.type === "app" && env.gradleTask ? <span>⚙ {env.gradleTask}</span> : null}
                {env.type === "qnx" && env.qnxTarget ? <span>🎯 {env.qnxTarget}</span> : null}
              </div>

              {/* Build targets list */}
              <div style={{ marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span style={{ fontWeight: 600, fontSize: "13px" }}>编译目标</span>
                  <button
                    className="ghost-button compact-button"
                    onClick={() => handleAddTarget(env.id)}
                    disabled={isRunning}
                    style={{ fontSize: "11px", padding: "2px 8px" }}
                  >
                    + 添加目标
                  </button>
                </div>
                {(env.buildTargets || []).length === 0 ? (
                  <div style={{ fontSize: "12px", color: "var(--text-secondary, #999)", padding: "4px 0" }}>
                    暂无编译目标，点击上方「+ 添加目标」添加
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {(env.buildTargets || []).map((target) => {
                      const pushKey = `${env.id}:${target.id}`;
                      const isPushing = pushRunning.get(pushKey);
                      const pushResult = pushResults.get(pushKey);
                      const pushLog = pushLogs.get(pushKey);
                      return (
                        <div key={target.id} style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "6px 8px",
                          borderRadius: "4px",
                          backgroundColor: "var(--code-bg, #f9f9f9)",
                          fontSize: "12px",
                          flexWrap: "wrap",
                        }}>
                          <span style={{ fontWeight: 600, fontSize: "13px" }}>📦 {target.name}</span>
                          <span style={{ fontSize: "11px", color: "var(--text-secondary, #666)", fontFamily: "monospace" }}>
                            make {target.makeTarget || "(全量)"}
                          </span>
                          {target.pushFiles.length > 0 ? (
                            <span style={{
                              padding: "1px 6px",
                              borderRadius: "3px",
                              fontSize: "10px",
                              fontWeight: 600,
                              backgroundColor: "#e8f5e9",
                              color: "#2e7d32",
                            }}>
                              推包 {target.pushFiles.length} 文件
                            </span>
                          ) : null}
                          {pushResult ? (
                            <span style={{
                              padding: "1px 6px",
                              borderRadius: "3px",
                              fontSize: "10px",
                              fontWeight: 600,
                              backgroundColor: pushResult.exitCode === 0 ? "#e8f5e9" : "#ffebee",
                              color: pushResult.exitCode === 0 ? "#2e7d32" : "#c62828",
                            }}>
                              {pushResult.exitCode === 0 ? "✓ 推包成功" : "✕ 推包失败"}
                            </span>
                          ) : null}
                          <div style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
                            <button
                              className="primary-button compact-button"
                              disabled={isRunning}
                              onClick={() => handleTargetBuild(env, target)}
                              style={{ fontSize: "11px", padding: "2px 8px" }}
                            >
                              编译
                            </button>
                            <button
                              className="ghost-button compact-button"
                              disabled={!deviceId || !!isPushing}
                              onClick={() => handleTargetPush(env.id, target, deviceId || "", env.sourceDir)}
                              style={{ fontSize: "11px", padding: "2px 8px" }}
                            >
                              {isPushing ? "推包中..." : "推包"}
                            </button>
                            {isPushing ? (
                              <button
                                className="ghost-button compact-button"
                                onClick={() => handleStopPush(env.id, target.id)}
                                style={{ fontSize: "11px", padding: "2px 8px", color: "#c62828" }}
                              >
                                停止
                              </button>
                            ) : null}
                            <button
                              className="ghost-button compact-button"
                              onClick={() => handleEditTarget(env.id, target)}
                              style={{ fontSize: "11px", padding: "2px 8px" }}
                            >
                              ⋮
                            </button>
                            <button
                              className="ghost-button compact-button"
                              onClick={() => handleDeleteTarget(env.id, target.id)}
                              style={{ fontSize: "11px", padding: "2px 8px", color: "#c62828" }}
                            >
                              ✕
                            </button>
                          </div>
                          {/* Push log */}
                          {(isPushing || pushLog) ? (
                            <pre style={{
                              width: "100%",
                              margin: "4px 0 0 0",
                              padding: "6px",
                              fontSize: "10px",
                              lineHeight: 1.3,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-all",
                              maxHeight: "80px",
                              overflow: "auto",
                              backgroundColor: "#1a1a2e",
                              color: "#0f0",
                              fontFamily: "monospace",
                              borderRadius: "3px",
                            }}>
                              <code>{pushLog || "等待开始..."}</code>
                            </pre>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Run #1: Command preview */}
              <details style={{ marginBottom: "8px", fontSize: "12px" }}>
                <summary style={{ cursor: "pointer", color: "var(--text-secondary, #666)", fontWeight: 500 }}>
                  编译命令预览
                </summary>
                <pre style={{
                  margin: "4px 0 0 0",
                  padding: "8px",
                  backgroundColor: "var(--code-bg, #f5f5f5)",
                  borderRadius: "4px",
                  fontSize: "12px",
                  lineHeight: 1.4,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  maxHeight: "120px",
                  overflow: "auto",
                }}>
                  <code>{commandPreview}</code>
                </pre>
              </details>

              {/* Log output */}
              {(isRunning || logs) ? (
                <div style={{
                  marginBottom: "8px",
                  border: "1px solid var(--border-color, #e0e0e0)",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "4px 8px",
                    backgroundColor: "var(--code-bg, #f5f5f5)",
                    fontSize: "11px",
                    color: "var(--text-secondary, #666)",
                    borderBottom: "1px solid var(--border-color, #e0e0e0)",
                  }}>
                    <span>编译日志</span>
                    <button
                      className="ghost-button compact-button"
                      onClick={() => handleClearLogs(env.id)}
                      style={{ fontSize: "11px", padding: "2px 6px" }}
                    >
                      清除日志
                    </button>
                  </div>
                  <pre style={{
                    margin: 0,
                    padding: "8px",
                    fontSize: "11px",
                    lineHeight: 1.4,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    maxHeight: "200px",
                    overflow: "auto",
                    backgroundColor: "#1a1a2e",
                    color: "#0f0",
                    fontFamily: "monospace",
                  }}>
                    <code>{logs}</code>
                    <div ref={(el) => { logEndRefs.current.set(env.id, el); }} />
                  </pre>
                </div>
              ) : null}

              <div style={envActionsStyle}>
                {isRunning ? (
                  <button
                    className="ghost-button"
                    onClick={() => handleStopBuild(env.id)}
                    style={{ color: "#c62828" }}
                  >
                    停止编译
                  </button>
                ) : (
                  <button className="primary-button" onClick={() => handleStartBuild(env)}>
                    开始编译
                  </button>
                )}
                <button className="ghost-button" onClick={() => handleEdit(env)} disabled={isRunning}>
                  编辑配置
                </button>
                <button className="ghost-button" onClick={() => handleDelete(env.id)} disabled={isRunning}
                  style={{ color: "#c62828" }}>
                  删除
                </button>
              </div>
            </div>
          );
        })
      )}

      {/* Add/Edit dialog */}
      {dialogOpen ? (
        <EnvDialog
          env={editingEnv}
          onSave={handleSaveEnv}
          onClose={() => { setDialogOpen(false); setEditingEnv(null); }}
        />
      ) : null}

      {targetDialog ? (
        <TargetDialog
          envId={targetDialog.envId}
          target={targetDialog.target}
          onSave={(target) => handleSaveTarget(targetDialog.envId, target)}
          onClose={() => setTargetDialog(null)}
        />
      ) : null}
    </div>
  );
}

// ── Add/Edit Dialog ────────────────────────────────────────────────────────

function EnvDialog({ env, onSave, onClose }: {
  env: BuildEnvironment | null;
  onSave: (env: BuildEnvironment) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<BuildType>(env?.type || "custom");
  const [name, setName] = useState(env?.name || "");
  const [sourceDir, setSourceDir] = useState(env?.sourceDir || "");
  // AOSP
  const [lunchCombo, setLunchCombo] = useState(env?.lunchCombo || TYPE_DEFAULTS.aosp.lunchCombo || "");
  const [makeTarget, setMakeTarget] = useState(env?.makeTarget || "");
  const [makeJobs, setMakeJobs] = useState<number>(env?.makeJobs ?? 0);
  // QNX
  const [qnxArch, setQnxArch] = useState(env?.qnxArch || TYPE_DEFAULTS.qnx.qnxArch || "");
  const [qnxEnvScript, setQnxEnvScript] = useState(env?.qnxEnvScript || TYPE_DEFAULTS.qnx.qnxEnvScript || "");
  const [qnxTarget, setQnxTarget] = useState(env?.qnxTarget || TYPE_DEFAULTS.qnx.qnxTarget || "");
  // APP
  const [appVariant, setAppVariant] = useState(env?.appVariant || TYPE_DEFAULTS.app.appVariant || "");
  const [gradleTask, setGradleTask] = useState(env?.gradleTask || TYPE_DEFAULTS.app.gradleTask || "");
  const [jdkPath, setJdkPath] = useState(env?.jdkPath || "");
  // Custom
  const [command, setCommand] = useState(env?.command || "");
  const [envVars, setEnvVars] = useState(env?.envVars || "");

  const api = (window as any).adbHelperApi;

  const handlePickDir = async () => {
    if (!api?.system) return;
    const result = await api.system.pickDirectory({ title: "选择源码目录" });
    if (result.status === "ok" && result.path) {
      setSourceDir(result.path);
    } else if (!result.canceled) {
      // Fallback for browser mode: use the path from result or prompt
      const path = result.path || prompt("输入源码目录路径：");
      if (path) setSourceDir(path);
    }
  };

  const handlePickJdkDir = async () => {
    if (!api?.system) return;
    const result = await api.system.pickDirectory({ title: "选择 JDK 目录" });
    if (result.status === "ok" && result.path) {
      setJdkPath(result.path);
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const base: BuildEnvironment = {
      id: env?.id || generateId(),
      name: name.trim(),
      type,
      sourceDir: sourceDir.trim(),
    };
    if (type === "aosp") {
      base.lunchCombo = lunchCombo.trim();
      base.makeTarget = makeTarget.trim();
      base.makeJobs = makeJobs;
    } else if (type === "qnx") {
      base.qnxArch = qnxArch.trim();
      base.qnxEnvScript = qnxEnvScript.trim();
      base.qnxTarget = qnxTarget.trim();
    } else if (type === "app") {
      base.appVariant = appVariant.trim();
      base.gradleTask = gradleTask.trim();
      base.jdkPath = jdkPath.trim();
    } else if (type === "custom") {
      base.command = command.trim();
      base.envVars = envVars.trim();
    }
    onSave(base);
  };

  const dialogOverlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  };
  const dialogStyle: React.CSSProperties = {
    backgroundColor: "var(--card-bg, #fff)",
    borderRadius: "12px",
    padding: "24px",
    maxWidth: "560px",
    width: "90%",
    maxHeight: "85vh",
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  };
  const fieldStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--text-primary, #333)",
  };
  const inputStyle: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: "6px",
    border: "1px solid var(--border-color, #d0d0d0)",
    fontSize: "13px",
    backgroundColor: "var(--input-bg, #fff)",
    color: "var(--text-primary, #333)",
  };
  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: "pointer",
  };
  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: "80px",
    fontFamily: "monospace",
    fontSize: "12px",
    resize: "vertical",
  };
  const dirRowStyle: React.CSSProperties = {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  };
  const actionRowStyle: React.CSSProperties = {
    display: "flex",
    gap: "8px",
    justifyContent: "flex-end",
    marginTop: "8px",
  };

  return (
    <div style={dialogOverlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: "16px" }}>
          {env ? "编辑编译环境" : "新建编译环境"}
        </h3>

        {/* Name */}
        <div style={fieldStyle}>
          <label style={labelStyle}>环境名称</label>
          <input
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如: PP02, QNX-BSP, INGO Launcher"
          />
        </div>

        {/* Type */}
        <div style={fieldStyle}>
          <label style={labelStyle}>编译类型</label>
          <select style={selectStyle} value={type} onChange={(e) => { setType(e.target.value as BuildType); }}>
            {BUILD_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Source dir */}
        <div style={fieldStyle}>
          <label style={labelStyle}>源码目录</label>
          <div style={dirRowStyle}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={sourceDir}
              onChange={(e) => setSourceDir(e.target.value)}
              placeholder="/home/tsdl/ssd/code/aosp12"
            />
            <button className="ghost-button" onClick={handlePickDir}>浏览...</button>
          </div>
        </div>

        {/* AOSP fields */}
        {type === "aosp" ? (
          <>
            <div style={fieldStyle}>
              <label style={labelStyle}>Lunch Combo</label>
              <input
                style={inputStyle}
                value={lunchCombo}
                onChange={(e) => setLunchCombo(e.target.value)}
                placeholder="aosp_arm64-userdebug"
              />
            </div>
            <div style={{ ...fieldStyle, flexDirection: "row", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Make 目标（可选）</label>
                <input
                  style={inputStyle}
                  value={makeTarget}
                  onChange={(e) => setMakeTarget(e.target.value)}
                  placeholder="bootimage / 空=全量"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>并行任务数（-j）</label>
                <input
                  type="number"
                  min={0}
                  max={128}
                  style={inputStyle}
                  value={makeJobs}
                  onChange={(e) => setMakeJobs(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="0=自动"
                />
              </div>
            </div>
          </>
        ) : null}

        {/* QNX fields */}
        {type === "qnx" ? (
          <>
            <div style={{ ...fieldStyle, flexDirection: "row", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>目标架构</label>
                <select style={selectStyle} value={qnxArch} onChange={(e) => setQnxArch(e.target.value)}>
                  <option value="x86_64">x86_64</option>
                  <option value="aarch64">aarch64</option>
                  <option value="armv7">armv7</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>编译目标</label>
                <input
                  style={inputStyle}
                  value={qnxTarget}
                  onChange={(e) => setQnxTarget(e.target.value)}
                  placeholder="all / 具体 target"
                />
              </div>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>QNX 环境脚本</label>
              <input
                style={inputStyle}
                value={qnxEnvScript}
                onChange={(e) => setQnxEnvScript(e.target.value)}
                placeholder="source qnxsdp-env.sh"
              />
            </div>
          </>
        ) : null}

        {/* APP fields */}
        {type === "app" ? (
          <>
            <div style={{ ...fieldStyle, flexDirection: "row", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Variant</label>
                <select style={selectStyle} value={appVariant} onChange={(e) => setAppVariant(e.target.value)}>
                  <option value="release">release</option>
                  <option value="debug">debug</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Gradle Task</label>
                <input
                  style={inputStyle}
                  value={gradleTask}
                  onChange={(e) => setGradleTask(e.target.value)}
                  placeholder="assembleRelease"
                />
              </div>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>JDK 路径（可选）</label>
              <div style={dirRowStyle}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={jdkPath}
                  onChange={(e) => setJdkPath(e.target.value)}
                  placeholder="/usr/lib/jvm/java-17-openjdk"
                />
                <button className="ghost-button" onClick={handlePickJdkDir}>浏览...</button>
              </div>
            </div>
          </>
        ) : null}

        {/* Custom fields */}
        {type === "custom" ? (
          <>
            <div style={fieldStyle}>
              <label style={labelStyle}>编译命令</label>
              <textarea
                style={textareaStyle}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="cd /path/to/project && make -j$(nproc)"
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>环境变量（可选，每行一个 KEY=VALUE）</label>
              <textarea
                style={textareaStyle}
                value={envVars}
                onChange={(e) => setEnvVars(e.target.value)}
                placeholder="JAVA_HOME=/usr/lib/jvm/java-17&#10;CCACHE_DIR=/home/user/.ccache"
              />
            </div>
          </>
        ) : null}

        {/* Command preview */}
        {type !== "custom" ? (
          <details style={{ fontSize: "12px" }}>
            <summary style={{ cursor: "pointer", color: "var(--text-secondary, #666)" }}>
              编译命令预览
            </summary>
            <pre style={{
              margin: "4px 0 0 0",
              padding: "8px",
              backgroundColor: "var(--code-bg, #f5f5f5)",
              borderRadius: "4px",
              fontSize: "11px",
              lineHeight: 1.4,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              maxHeight: "120px",
              overflow: "auto",
            }}>
              <code>{(() => {
                const preview: BuildEnvironment = {
                  id: "preview",
                  name: name.trim(),
                  type,
                  sourceDir: sourceDir.trim(),
                  ...(type === "aosp" ? { lunchCombo, makeTarget, makeJobs } : {}),
                  ...(type === "qnx" ? { qnxArch, qnxEnvScript, qnxTarget } : {}),
                  ...(type === "app" ? { appVariant, gradleTask, jdkPath } : {}),
                };
                return buildCommandFromEnv(preview);
              })()}</code>
            </pre>
          </details>
        ) : null}

        <div style={actionRowStyle}>
          <button className="ghost-button" onClick={onClose}>取消</button>
          <button className="primary-button" onClick={handleSave} disabled={!name.trim()}>
            {env ? "保存修改" : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Target Edit Dialog ─────────────────────────────────────────────────────

function TargetDialog({ envId, target, onSave, onClose }: {
  envId: string;
  target: BuildTarget | null;
  onSave: (target: BuildTarget) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(target?.name || "");
  const [makeTarget, setMakeTarget] = useState(target?.makeTarget || "");
  const [pushFiles, setPushFiles] = useState<PushFile[]>(target?.pushFiles || []);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: target?.id || `target-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      makeTarget: makeTarget.trim(),
      pushFiles,
    });
  };

  const addPushFile = () => {
    setPushFiles((prev) => [...prev, { localPath: "", remotePath: "" }]);
  };

  const updatePushFile = (idx: number, field: "localPath" | "remotePath", value: string) => {
    setPushFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, [field]: value } : f)));
  };

  const removePushFile = (idx: number) => {
    setPushFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--text-primary, #333)",
    marginBottom: "4px",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "6px",
    border: "1px solid var(--border-color, #d0d0d0)",
    fontSize: "13px",
    backgroundColor: "var(--input-bg, #fff)",
    color: "var(--text-primary, #333)",
    boxSizing: "border-box",
  };
  const fieldStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    marginBottom: "12px",
  };
  const actionRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    marginTop: "16px",
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        backgroundColor: "var(--card-bg, #fff)",
        borderRadius: "12px",
        padding: "24px",
        minWidth: "520px",
        maxWidth: "600px",
        maxHeight: "80vh",
        overflow: "auto",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px 0" }}>{target ? "编辑编译目标" : "添加编译目标"}</h3>

        {/* Name */}
        <div style={fieldStyle}>
          <label style={labelStyle}>目标名称</label>
          <input
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如: bootimage, system.img"
          />
        </div>

        {/* Make Target */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Make 目标参数</label>
          <input
            style={inputStyle}
            value={makeTarget}
            onChange={(e) => setMakeTarget(e.target.value)}
            placeholder="例如: bootimage (为空表示全量编译)"
          />
        </div>

        {/* Push files */}
        <div style={fieldStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>推包文件列表</label>
            <button className="primary-button compact-button" onClick={addPushFile} style={{ fontSize: "11px", padding: "2px 10px" }}>
              + 添加文件
            </button>
          </div>
          {pushFiles.length === 0 ? (
            <div style={{ fontSize: "12px", color: "var(--text-secondary, #999)", padding: "8px 0" }}>
              暂无推包文件，点击「+ 添加文件」配置编译产物路径与设备目标路径
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {pushFiles.map((pf, idx) => (
                <div key={idx} style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                  padding: "8px",
                  borderRadius: "6px",
                  backgroundColor: "var(--code-bg, #f5f5f5)",
                }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: "10px", color: "var(--text-secondary, #666)", marginBottom: "2px", display: "block" }}>
                      本地产物路径
                    </label>
                    <input
                      style={{
                        width: "100%",
                        padding: "4px 6px",
                        borderRadius: "4px",
                        border: "1px solid var(--border-color, #d0d0d0)",
                        fontSize: "11px",
                        fontFamily: "monospace",
                        backgroundColor: "var(--input-bg, #fff)",
                        color: "var(--text-primary, #333)",
                        boxSizing: "border-box",
                      }}
                      value={pf.localPath}
                      onChange={(e) => updatePushFile(idx, "localPath", e.target.value)}
                      placeholder="out/target/product/xxx/boot.img"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: "10px", color: "var(--text-secondary, #666)", marginBottom: "2px", display: "block" }}>
                      设备目标路径
                    </label>
                    <input
                      style={{
                        width: "100%",
                        padding: "4px 6px",
                        borderRadius: "4px",
                        border: "1px solid var(--border-color, #d0d0d0)",
                        fontSize: "11px",
                        fontFamily: "monospace",
                        backgroundColor: "var(--input-bg, #fff)",
                        color: "var(--text-primary, #333)",
                        boxSizing: "border-box",
                      }}
                      value={pf.remotePath}
                      onChange={(e) => updatePushFile(idx, "remotePath", e.target.value)}
                      placeholder="/data/local/tmp/boot.img"
                    />
                  </div>
                  <button
                    className="ghost-button compact-button"
                    onClick={() => removePushFile(idx)}
                    style={{ fontSize: "14px", padding: "2px 6px", color: "#c62828", marginTop: "14px", flexShrink: 0 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={actionRowStyle}>
          <button className="ghost-button" onClick={onClose}>取消</button>
          <button className="primary-button" onClick={handleSave} disabled={!name.trim()}>
            {target ? "保存修改" : "添加"}
          </button>
        </div>
      </div>
    </div>
  );
}
