from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import time
from typing import Any


STATE_DIR = Path(__file__).resolve().parent / "state"
HISTORY_FILE = STATE_DIR / "history.json"
BACKUP_CONFIG_FILE = STATE_DIR / "backup_config.json"
LOGCAT_CONFIG_FILE = STATE_DIR / "logcat_config.json"
SCRCPY_CONFIG_FILE = STATE_DIR / "scrcpy_display_config.json"
ADB_EXECUTABLE = os.environ.get("ADB_HELPER_ADB", "adb")
DEFAULT_BACKUP_ROOT = Path(os.environ.get("ADB_HELPER_BACKUP_ROOT", "/home/tsdl/ssd/ingo/backup")).expanduser()
DEFAULT_LOGCAT_OUTPUT_DIR = Path(os.environ.get("ADB_HELPER_LOGCAT_ROOT", "/home/tsdl/ssd/ingo/logcat")).expanduser()
DEFAULT_VERSION_PROP = "ro.build.display.id"
DEFAULT_BACKUP_PATHS = ["/system/framework", "/system/app", "/system/priv-app"]
DEFAULT_RESTORE_PATHS = ["/system/framework"]
DEFAULT_LOGCAT_MAX_FILE_SIZE_MB = 10
DEFAULT_LOGCAT_CLEAR_BEFORE_START = False
DEFAULT_LOGCAT_DISPLAY_LINE_LIMIT = 3000
DEFAULT_LOGCAT_REFRESH_INTERVAL_MS = 300
DEFAULT_LOGCAT_DEFAULT_REGEX_ENABLED = False
DEFAULT_LOGCAT_DEFAULT_LEVELS: list[str] = []
LOGCAT_LEVEL_OPTIONS = {"V", "D", "I", "W", "E", "F"}
LOGCAT_THREADTIME_PATTERN = re.compile(
    r"^(?P<date>\d{2}-\d{2})\s+(?P<time>\d{2}:\d{2}:\d{2}\.\d+)\s+(?P<pid>\d+)\s+(?P<tid>\d+)\s+(?P<level>[A-Z])\s+(?P<tag>.*?):\s(?P<message>.*)$"
)
DISPLAY_VIEWPORT_PATTERN = re.compile(
    r"DisplayViewport\{type=(?P<type>\w+),\s+valid=(?P<valid>\w+),\s+isActive=(?P<active>\w+),\s+displayId=(?P<display_id>\d+),\s+uniqueId='(?P<unique_id>[^']+)',.*?orientation=(?P<orientation>\d+),\s+logicalFrame=Rect\(0, 0 - (?P<logical_width>\d+), (?P<logical_height>\d+)\),.*?deviceWidth=(?P<device_width>\d+),\s+deviceHeight=(?P<device_height>\d+)\}"
)
DISPLAY_STATE_PATTERN = re.compile(r"Display Id=(?P<display_id>\d+)\s+Display State=(?P<state>[A-Z_]+)", re.MULTILINE)
WINDOW_ID_PATTERN = re.compile(r"^\s*(0x[0-9a-fA-F]+)\s+\"(?P<title>[^\"]+)\"")
WINDOW_POSITION_PATTERN = re.compile(r"Absolute upper-left (?P<axis>[XY]):\s+(?P<value>-?\d+)")
WINDOW_SIZE_PATTERN = re.compile(r"(?P<key>Width|Height):\s+(?P<value>\d+)")
USER_INFO_PATTERN = re.compile(r"UserInfo\{(?P<id>\d+):(?P<name>[^:]*):(?P<flags>\d+)\}(?P<suffix>.*)")
PM_PACKAGE_PATTERN = re.compile(r"^package:(?P<path>.+?)=(?P<package>\S+)\s+uid:(?P<uid>\d+)$")
PACKAGE_USER_STATE_PATTERN = re.compile(r"^User\s+(?P<id>\d+):\s+(?P<body>.*)$")
GETPROP_LINE_PATTERN = re.compile(r"^\[(?P<key>[^\]]+)\]:\s+\[(?P<value>[^\]]*)\]$")
PACKAGE_SECTION_PATTERN = re.compile(r"^Package \[(?P<package>[^\]]+)\]")
PROCESS_USER_ID_PATTERN = re.compile(r"^u(?P<user_id>\d+)_")


def load_history() -> list[dict[str, Any]]:
    if not HISTORY_FILE.exists():
        return []

    try:
        data = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []

    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def save_history(history: list[dict[str, Any]]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_backup_path(path: str) -> str:
    normalized = str(path).strip().replace("\\", "/")
    if not normalized:
        return ""
    if not normalized.startswith("/"):
        normalized = f"/{normalized}"
    normalized = normalized.rstrip("/")
    return normalized or "/"


def normalize_backup_paths(paths: list[Any]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for item in paths:
        path = normalize_backup_path(str(item))
        if not path or path == "/" or path in seen:
            continue
        normalized.append(path)
        seen.add(path)
    return normalized


def normalize_backup_root(path: str | None) -> str:
    raw_value = str(path or "").strip()
    candidate = Path(raw_value).expanduser() if raw_value else DEFAULT_BACKUP_ROOT
    if not candidate.is_absolute():
        candidate = (Path.cwd() / candidate).resolve()
    else:
        candidate = candidate.resolve()
    return str(candidate)


def normalize_logcat_output_dir(path: str | None) -> str:
    raw_value = str(path or "").strip()
    candidate = Path(raw_value).expanduser() if raw_value else DEFAULT_LOGCAT_OUTPUT_DIR
    if not candidate.is_absolute():
        candidate = (Path.cwd() / candidate).resolve()
    else:
        candidate = candidate.resolve()
    return str(candidate)


def parse_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if not normalized:
        return default
    return normalized in {"1", "true", "yes", "on", "y"}


def normalize_logcat_max_file_size_mb(value: Any) -> int:
    try:
        numeric = int(value)
    except (TypeError, ValueError):
        numeric = DEFAULT_LOGCAT_MAX_FILE_SIZE_MB
    return max(1, numeric)


def normalize_logcat_display_line_limit(value: Any) -> int:
    try:
        numeric = int(value)
    except (TypeError, ValueError):
        numeric = DEFAULT_LOGCAT_DISPLAY_LINE_LIMIT
    return max(200, min(3000, numeric))


def normalize_logcat_refresh_interval_ms(value: Any) -> int:
    try:
        numeric = int(value)
    except (TypeError, ValueError):
        numeric = DEFAULT_LOGCAT_REFRESH_INTERVAL_MS
    return max(100, min(5000, numeric))


def normalize_logcat_default_levels(values: Any) -> list[str]:
    if values is None:
        return DEFAULT_LOGCAT_DEFAULT_LEVELS[:]

    if isinstance(values, str):
        raw_values = values.split(",")
    elif isinstance(values, list):
        raw_values = values
    else:
        raw_values = [values]

    normalized: list[str] = []
    for item in raw_values:
        level = str(item).strip().upper()
        if level in LOGCAT_LEVEL_OPTIONS and level not in normalized:
            normalized.append(level)
    return normalized


def get_backup_root(config: dict[str, Any] | None = None) -> Path:
    current_config = config if config is not None else load_backup_config()
    return Path(str(current_config.get("backupRoot") or normalize_backup_root(None))).expanduser()


def load_backup_config() -> dict[str, Any]:
    defaults = {
        "versionProp": DEFAULT_VERSION_PROP,
        "backupPaths": DEFAULT_BACKUP_PATHS[:],
        "restorePaths": DEFAULT_RESTORE_PATHS[:],
        "backupRoot": normalize_backup_root(None),
    }
    if not BACKUP_CONFIG_FILE.exists():
        return defaults

    try:
        raw = json.loads(BACKUP_CONFIG_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return defaults

    if not isinstance(raw, dict):
        return defaults

    version_prop = str(raw.get("versionProp") or DEFAULT_VERSION_PROP).strip() or DEFAULT_VERSION_PROP
    backup_paths = normalize_backup_paths(list(raw.get("backupPaths") or DEFAULT_BACKUP_PATHS))
    restore_paths = normalize_backup_paths(list(raw.get("restorePaths") or DEFAULT_RESTORE_PATHS))
    backup_root = normalize_backup_root(str(raw.get("backupRoot") or defaults["backupRoot"]))
    return {
        "versionProp": version_prop,
        "backupPaths": backup_paths or DEFAULT_BACKUP_PATHS[:],
        "restorePaths": restore_paths or DEFAULT_RESTORE_PATHS[:],
        "backupRoot": backup_root,
    }


def load_logcat_config() -> dict[str, Any]:
    defaults = {
        "outputDir": normalize_logcat_output_dir(None),
        "maxFileSizeMb": DEFAULT_LOGCAT_MAX_FILE_SIZE_MB,
        "clearBeforeStart": DEFAULT_LOGCAT_CLEAR_BEFORE_START,
        "displayLineLimit": DEFAULT_LOGCAT_DISPLAY_LINE_LIMIT,
        "refreshIntervalMs": DEFAULT_LOGCAT_REFRESH_INTERVAL_MS,
        "defaultRegexEnabled": DEFAULT_LOGCAT_DEFAULT_REGEX_ENABLED,
        "defaultLevels": DEFAULT_LOGCAT_DEFAULT_LEVELS[:],
    }
    if not LOGCAT_CONFIG_FILE.exists():
        return defaults

    try:
        raw = json.loads(LOGCAT_CONFIG_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return defaults

    if not isinstance(raw, dict):
        return defaults

    return {
        "outputDir": normalize_logcat_output_dir(raw.get("outputDir")),
        "maxFileSizeMb": normalize_logcat_max_file_size_mb(raw.get("maxFileSizeMb")),
        "clearBeforeStart": parse_bool(raw.get("clearBeforeStart"), DEFAULT_LOGCAT_CLEAR_BEFORE_START),
        "displayLineLimit": normalize_logcat_display_line_limit(raw.get("displayLineLimit")),
        "refreshIntervalMs": normalize_logcat_refresh_interval_ms(raw.get("refreshIntervalMs")),
        "defaultRegexEnabled": parse_bool(raw.get("defaultRegexEnabled"), DEFAULT_LOGCAT_DEFAULT_REGEX_ENABLED),
        "defaultLevels": normalize_logcat_default_levels(raw.get("defaultLevels")),
    }


def save_backup_config(config: dict[str, Any]) -> dict[str, Any]:
    normalized = {
        "versionProp": str(config.get("versionProp") or DEFAULT_VERSION_PROP).strip() or DEFAULT_VERSION_PROP,
        "backupPaths": normalize_backup_paths(list(config.get("backupPaths") or [])),
        "restorePaths": normalize_backup_paths(list(config.get("restorePaths") or [])),
        "backupRoot": normalize_backup_root(str(config.get("backupRoot") or None)),
    }
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP_CONFIG_FILE.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    return normalized


def save_logcat_config(config: dict[str, Any]) -> dict[str, Any]:
    normalized = {
        "outputDir": normalize_logcat_output_dir(config.get("outputDir")),
        "maxFileSizeMb": normalize_logcat_max_file_size_mb(config.get("maxFileSizeMb")),
        "clearBeforeStart": parse_bool(config.get("clearBeforeStart"), DEFAULT_LOGCAT_CLEAR_BEFORE_START),
        "displayLineLimit": normalize_logcat_display_line_limit(config.get("displayLineLimit")),
        "refreshIntervalMs": normalize_logcat_refresh_interval_ms(config.get("refreshIntervalMs")),
        "defaultRegexEnabled": parse_bool(config.get("defaultRegexEnabled"), DEFAULT_LOGCAT_DEFAULT_REGEX_ENABLED),
        "defaultLevels": normalize_logcat_default_levels(config.get("defaultLevels")),
    }
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    LOGCAT_CONFIG_FILE.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    return normalized


def get_scrcpy_executable() -> str | None:
    return shutil.which("scrcpy")


def load_scrcpy_display_configs() -> dict[str, dict[str, dict[str, int]]]:
    if not SCRCPY_CONFIG_FILE.exists():
        return {}

    try:
        raw = json.loads(SCRCPY_CONFIG_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}

    if not isinstance(raw, dict):
        return {}

    normalized: dict[str, dict[str, dict[str, int]]] = {}
    for device_id, display_map in raw.items():
        if not isinstance(device_id, str) or not isinstance(display_map, dict):
            continue
        normalized[device_id] = {}
        for display_id, config in display_map.items():
            if not isinstance(display_id, str) or not isinstance(config, dict):
                continue
            normalized[device_id][display_id] = {
                "maxSize": max(0, int(config.get("maxSize") or 0)),
                "windowX": int(config.get("windowX") or 0),
                "windowY": int(config.get("windowY") or 0),
                "windowWidth": max(0, int(config.get("windowWidth") or 0)),
                "windowHeight": max(0, int(config.get("windowHeight") or 0)),
            }
    return normalized


def save_scrcpy_display_configs(configs: dict[str, dict[str, dict[str, int]]]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    SCRCPY_CONFIG_FILE.write_text(json.dumps(configs, ensure_ascii=False, indent=2), encoding="utf-8")


def get_default_scrcpy_display_config() -> dict[str, int]:
    return {
        "maxSize": 0,
        "windowX": 120,
        "windowY": 120,
        "windowWidth": 0,
        "windowHeight": 0,
    }


def get_scrcpy_display_config(device_id: str, display_id: int) -> dict[str, int]:
    configs = load_scrcpy_display_configs()
    stored = configs.get(device_id, {}).get(str(display_id), {})
    defaults = get_default_scrcpy_display_config()
    return {
        "maxSize": max(0, int(stored.get("maxSize") or defaults["maxSize"])),
        "windowX": int(stored.get("windowX") or defaults["windowX"]),
        "windowY": int(stored.get("windowY") or defaults["windowY"]),
        "windowWidth": max(0, int(stored.get("windowWidth") or defaults["windowWidth"])),
        "windowHeight": max(0, int(stored.get("windowHeight") or defaults["windowHeight"])),
    }


def save_scrcpy_display_config(device_id: str, display_id: int, config: dict[str, Any]) -> dict[str, int]:
    normalized = {
        "maxSize": max(0, int(config.get("maxSize") or 0)),
        "windowX": int(config.get("windowX") or 0),
        "windowY": int(config.get("windowY") or 0),
        "windowWidth": max(0, int(config.get("windowWidth") or 0)),
        "windowHeight": max(0, int(config.get("windowHeight") or 0)),
    }
    configs = load_scrcpy_display_configs()
    configs.setdefault(device_id, {})[str(display_id)] = normalized
    save_scrcpy_display_configs(configs)
    return normalized


def parse_display_state_map(output: str) -> dict[int, str]:
    states: dict[int, str] = {}
    for match in DISPLAY_STATE_PATTERN.finditer(output):
        states[int(match.group("display_id"))] = match.group("state")
    return states


def build_display_label(display_type: str, display_id: int, width: int, height: int) -> str:
    if display_type == "INTERNAL":
        return f"内置屏幕 {display_id}"
    return f"外接屏幕 {display_id}"


def list_device_displays(device_id: str) -> list[dict[str, Any]]:
    output = run_adb(["-s", device_id, "shell", "dumpsys", "display"])
    state_map = parse_display_state_map(output)
    items: list[dict[str, Any]] = []
    for match in DISPLAY_VIEWPORT_PATTERN.finditer(output):
      display_id = int(match.group("display_id"))
      logical_width = int(match.group("logical_width"))
      logical_height = int(match.group("logical_height"))
      display_type = match.group("type")
      items.append(
          {
              "displayId": display_id,
              "type": display_type,
              "label": build_display_label(display_type, display_id, logical_width, logical_height),
              "uniqueId": match.group("unique_id"),
              "active": match.group("active") == "true",
              "valid": match.group("valid") == "true",
              "orientation": int(match.group("orientation")),
              "logicalWidth": logical_width,
              "logicalHeight": logical_height,
              "deviceWidth": int(match.group("device_width")),
              "deviceHeight": int(match.group("device_height")),
              "state": state_map.get(display_id, "UNKNOWN"),
          }
      )
    items.sort(key=lambda item: int(item["displayId"]))
    return items


def build_scrcpy_command(device_id: str, display_id: int, config: dict[str, int]) -> list[str]:
    executable = get_scrcpy_executable()
    if not executable:
        raise RuntimeError("当前环境未找到 scrcpy，可先安装或把 scrcpy 加入 PATH。")

    command = [
        executable,
        "--serial",
        device_id,
        "--display-id",
        str(display_id),
        "--window-title",
        build_scrcpy_window_title(device_id, display_id),
    ]
    if config.get("maxSize", 0) > 0:
        command.extend(["--max-size", str(config["maxSize"])])
    if config.get("windowX") is not None:
        command.extend(["--window-x", str(config["windowX"])])
    if config.get("windowY") is not None:
        command.extend(["--window-y", str(config["windowY"])])
    if config.get("windowWidth", 0) > 0:
        command.extend(["--window-width", str(config["windowWidth"])])
    if config.get("windowHeight", 0) > 0:
        command.extend(["--window-height", str(config["windowHeight"])])
    return command


def build_scrcpy_window_title(device_id: str, display_id: int) -> str:
    return f"ADBHelper scrcpy {device_id} display {display_id}"


def find_scrcpy_window_id(device_id: str, display_id: int) -> str:
    title = build_scrcpy_window_title(device_id, display_id)
    completed = subprocess.run(["xwininfo", "-root", "-tree"], check=True, capture_output=True, text=True)
    for line in completed.stdout.splitlines():
        match = WINDOW_ID_PATTERN.match(line)
        if not match:
            continue
        if match.group("title") == title:
            return match.group(1)
    raise RuntimeError(f"未找到 Display {display_id} 当前投屏窗口，请先从 adbHelper 启动该 Display 的 scrcpy。")


def read_scrcpy_window_geometry(device_id: str, display_id: int) -> dict[str, int]:
    if not shutil.which("xwininfo"):
        raise RuntimeError("当前环境缺少 xwininfo，无法读取 scrcpy 窗口位置和尺寸。")

    window_id = find_scrcpy_window_id(device_id, display_id)
    completed = subprocess.run(["xwininfo", "-id", window_id], check=True, capture_output=True, text=True)
    geometry = {"windowX": 0, "windowY": 0, "windowWidth": 0, "windowHeight": 0}
    for line in completed.stdout.splitlines():
        position_match = WINDOW_POSITION_PATTERN.search(line)
        if position_match:
            axis = position_match.group("axis")
            key = "windowX" if axis == "X" else "windowY"
            geometry[key] = int(position_match.group("value"))
            continue
        size_match = WINDOW_SIZE_PATTERN.search(line)
        if size_match:
            key = "windowWidth" if size_match.group("key") == "Width" else "windowHeight"
            geometry[key] = int(size_match.group("value"))
    if geometry["windowWidth"] <= 0 or geometry["windowHeight"] <= 0:
        raise RuntimeError(f"已找到 Display {display_id} 的投屏窗口，但未能解析窗口尺寸。")
    return geometry


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def run_adb(args: list[str]) -> str:
    completed = subprocess.run(
        [ADB_EXECUTABLE, *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def run_adb_bytes(args: list[str]) -> bytes:
    completed = subprocess.run(
        [ADB_EXECUTABLE, *args],
        check=True,
        capture_output=True,
    )
    return completed.stdout


def read_prop(device_id: str, prop: str) -> str:
    return run_adb(["-s", device_id, "shell", "getprop", prop]).strip()


def sanitize_build_id(value: str) -> str:
    sanitized = "".join(char if char.isalnum() or char in "._-" else "_" for char in value.strip())
    sanitized = sanitized.strip("_")
    return sanitized or "unknown-build"


def run_targeted_adb(device_id: str, args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [ADB_EXECUTABLE, "-s", device_id, *args],
        check=check,
        capture_output=True,
        text=True,
    )


def ensure_adb_available() -> None:
    try:
        subprocess.run([ADB_EXECUTABLE, "version"], check=True, capture_output=True, text=True)
    except FileNotFoundError as error:
        raise RuntimeError("未找到 adb，请先安装 Android Platform Tools。") from error
    except subprocess.SubprocessError as error:
        raise RuntimeError(str(error)) from error


def ensure_device_ready(device_id: str) -> dict[str, Any]:
    devices = list_devices()
    current = next((item for item in devices if item["id"] == device_id), None)
    if not current:
        raise RuntimeError(f"未检测到设备 {device_id}。")
    if current.get("state") != "device":
        raise RuntimeError(f"设备 {device_id} 当前不可操作，状态为 {current.get('state', 'unknown')}。")
    return current


def get_display_build_id(device_id: str, version_prop: str) -> str:
    raw_value = read_prop(device_id, version_prop).strip()
    if not raw_value:
        raise RuntimeError(f"无法从 {version_prop} 读取版本号。")
    build_id = sanitize_build_id(raw_value)
    if not build_id:
        raise RuntimeError(f"无法从 {version_prop} 生成有效版本目录名。")
    return build_id


def build_process_name_map(device_id: str) -> dict[str, str]:
    commands = [
        ["shell", "ps", "-A", "-o", "PID,NAME"],
        ["shell", "ps", "-A"],
    ]
    for command in commands:
        completed = run_targeted_adb(device_id, command, check=False)
        output = (completed.stdout or "").strip()
        if completed.returncode != 0 or not output:
            continue

        process_map: dict[str, str] = {}
        for line in output.splitlines():
            normalized = line.strip()
            if not normalized or normalized.lower().startswith("pid") or normalized.lower().startswith("user"):
                continue
            parts = normalized.split()
            if command[-1] == "PID,NAME":
                if len(parts) < 2 or not parts[0].isdigit():
                    continue
                process_map[parts[0]] = parts[1]
                continue

            if len(parts) < 2:
                continue
            pid = next((part for part in parts if part.isdigit()), "")
            name = parts[-1]
            if pid:
                process_map[pid] = name

        if process_map:
            return process_map
    return {}


def append_unique(items: list[str], value: str) -> None:
    normalized = value.strip()
    if normalized and normalized not in items:
        items.append(normalized)


def parse_process_user_id(user: str) -> int | None:
    match = PROCESS_USER_ID_PATTERN.match(user.strip())
    if match:
        return int(match.group("user_id"))
    if user.strip() in {"root", "system"}:
        return 0
    return None


def is_system_package_path(path: str) -> bool:
    normalized = path.strip()
    return normalized.startswith(("/system/", "/product/", "/vendor/", "/odm/", "/system_ext/", "/apex/"))


def load_package_permission_index(device_id: str) -> dict[str, list[str]]:
    output = run_adb(["-s", device_id, "shell", "dumpsys", "package", "packages"])
    permission_index: dict[str, list[str]] = {}
    current_package: str | None = None
    current_list_key: str | None = None

    for line in output.splitlines():
        stripped = line.strip()
        if not stripped:
            continue

        package_match = PACKAGE_SECTION_PATTERN.match(stripped)
        if package_match:
            current_package = package_match.group("package")
            permission_index.setdefault(current_package, [])
            current_list_key = None
            continue

        if current_package is None:
            continue

        if stripped in {"requested permissions:", "install permissions:", "runtime permissions:"}:
            current_list_key = "permissions"
            continue

        if current_list_key == "permissions" and line.startswith("      "):
            permission_name = stripped.split(":", 1)[0].strip()
            if permission_name:
                append_unique(permission_index[current_package], permission_name)
            continue

        if current_list_key and not line.startswith("      "):
            current_list_key = None

    return permission_index


def extract_car_service_passenger_snapshot(device_id: str) -> dict[str, Any]:
    output = run_adb(["-s", device_id, "shell", "dumpsys", "car_service"])
    snapshot: dict[str, Any] = {
        "enablePassengerSupport": "",
        "numberOfDrivers": "",
        "driverAssignments": [],
        "occupantsConfig": [],
        "displayConfigs": [],
        "activeOccupantConfigs": [],
    }
    in_occupant_zone_section = False
    current_subsection: str | None = None

    for line in output.splitlines():
        stripped = line.strip()
        if not stripped:
            continue

        if stripped.startswith("NumberOfDrivers:"):
            snapshot["numberOfDrivers"] = stripped.split(":", 1)[1].strip()
            continue

        if stripped.startswith("EnablePassengerSupport:"):
            snapshot["enablePassengerSupport"] = stripped.split(":", 1)[1].strip()
            continue

        if re.match(r"^#\d+:\s+id=\d+", stripped):
            append_unique(snapshot["driverAssignments"], stripped)
            continue

        if stripped == "*OccupantZoneService*":
            in_occupant_zone_section = True
            current_subsection = None
            continue

        if in_occupant_zone_section and stripped.startswith("*") and stripped != "*OccupantZoneService*" and not stripped.startswith("**"):
            break

        if not in_occupant_zone_section:
            continue

        if stripped == "**mOccupantsConfig**":
            current_subsection = "occupantsConfig"
            continue

        if stripped == "**mDisplayConfigs**":
            current_subsection = "displayConfigs"
            continue

        if stripped == "**mActiveOccupantConfigs**":
            current_subsection = "activeOccupantConfigs"
            continue

        if stripped.startswith("**") and stripped.endswith("**"):
            current_subsection = None
            continue

        if current_subsection:
            append_unique(snapshot[current_subsection], stripped)

    return snapshot


def build_component_detail_entry(name: str, component_type: str) -> dict[str, Any]:
    return {
        "name": name,
        "componentType": component_type,
        "actions": [],
        "categories": [],
        "mimeTypes": [],
        "schemes": [],
        "authorities": [],
        "paths": [],
        "rawLines": [],
    }


def collect_package_component_snapshot(package_name: str, output: str) -> tuple[dict[str, list[str]], dict[str, dict[str, Any]]]:
    section_map = {
        "Activity Resolver Table:": ("activities", "Activity"),
        "Service Resolver Table:": ("services", "Service"),
        "Receiver Resolver Table:": ("receivers", "Receiver"),
        "Provider Resolver Table:": ("providers", "Provider"),
    }
    components = {"activities": [], "services": [], "receivers": [], "providers": []}
    component_details: dict[str, dict[str, Any]] = {}
    current_section: str | None = None
    current_component: str | None = None
    current_component_type: str | None = None
    component_pattern = re.compile(rf"\b{re.escape(package_name)}/([^\s]+)")

    for line in output.splitlines():
        stripped = line.strip()
        if stripped in section_map:
            current_section, current_component_type = section_map[stripped]
            current_component = None
            continue
        if stripped.endswith("Resolver Table:") and stripped not in section_map:
            current_section = None
            current_component = None
            current_component_type = None
            continue
        if stripped in {"Packages:", "Queries:", "Package Changes:"}:
            current_section = None
            current_component = None
            current_component_type = None
            continue
        if not current_section:
            continue

        component_match = component_pattern.search(line)
        if component_match:
            current_component = f"{package_name}/{component_match.group(1)}"
            append_unique(components[current_section], current_component)
            detail_entry = component_details.setdefault(current_component, build_component_detail_entry(current_component, current_component_type or current_section))
            append_unique(detail_entry["rawLines"], stripped)
            continue

        if current_component and line.startswith("          "):
            detail_entry = component_details[current_component]
            append_unique(detail_entry["rawLines"], stripped)
            for prefix, key in [
                ("Action:", "actions"),
                ("Category:", "categories"),
                ("Scheme:", "schemes"),
                ("Authority:", "authorities"),
                ("Path:", "paths"),
                ("StaticType:", "mimeTypes"),
                ("Type:", "mimeTypes"),
            ]:
                if stripped.startswith(prefix):
                    append_unique(detail_entry[key], stripped.split(":", 1)[1].strip().strip('"'))
                    break
            continue

        if current_component and not line.startswith("          "):
            current_component = None

    return components, component_details


def parse_user_info_line(line: str) -> dict[str, Any] | None:
    match = USER_INFO_PATTERN.search(line.strip())
    if not match:
        return None
    suffix = match.group("suffix") or ""
    return {
        "id": int(match.group("id")),
        "name": match.group("name") or "未命名",
        "flagsValue": int(match.group("flags")),
        "preCreated": "<pre-created>" in suffix,
        "running": "running" in suffix.lower(),
    }


def load_device_user_snapshot(device_id: str) -> dict[str, Any]:
    output = run_adb(["-s", device_id, "shell", "dumpsys", "user"])
    getprop_output = run_adb(["-s", device_id, "shell", "getprop"])
    car_service_passenger = extract_car_service_passenger_snapshot(device_id)
    users: list[dict[str, Any]] = []
    summary: dict[str, Any] = {
        "currentUserId": None,
        "deviceOwnerId": None,
        "maxUsers": None,
        "supportsSwitchableUsers": None,
        "allGuestsEphemeral": None,
        "forceEphemeralUsers": None,
        "isHeadlessSystemMode": None,
        "ownerName": "",
        "startedUsersState": "",
        "cachedUserIds": "",
        "cachedUserIdsIncludingPreCreated": "",
    }
    current_user: dict[str, Any] | None = None
    current_list_key: str | None = None
    in_device_properties = False
    device_property_list_key: str | None = None
    passenger_config: list[dict[str, str]] = []

    for line in output.splitlines():
        stripped = line.strip()
        if not stripped:
            continue

        if stripped.startswith("Current user:"):
            value = stripped.split(":", 1)[1].strip()
            summary["currentUserId"] = int(value) if value.isdigit() else value
            continue

        user_info = parse_user_info_line(stripped)
        if user_info:
            current_user = {
                **user_info,
                "serialNo": "",
                "isPrimary": False,
                "type": "",
                "flags": "",
                "state": "",
                "created": "",
                "lastLoggedIn": "",
                "startTime": "",
                "unlockTime": "",
                "hasProfileOwner": "",
                "restrictions": [],
                "globalRestrictions": [],
                "localRestrictions": [],
                "effectiveRestrictions": [],
            }
            serial_match = re.search(r"serialNo=(\d+)", stripped)
            if serial_match:
                current_user["serialNo"] = serial_match.group(1)
            primary_match = re.search(r"isPrimary=(\w+)", stripped)
            if primary_match:
                current_user["isPrimary"] = primary_match.group(1) == "true"
            users.append(current_user)
            current_list_key = None
            in_device_properties = False
            device_property_list_key = None
            continue

        if stripped == "Device properties:":
            current_user = None
            current_list_key = None
            in_device_properties = True
            device_property_list_key = None
            continue

        if current_user is not None:
            if stripped == "Restrictions:":
                current_list_key = "restrictions"
                continue
            if stripped == "Device policy global restrictions:":
                current_list_key = "globalRestrictions"
                continue
            if stripped == "Device policy local restrictions:":
                current_list_key = "localRestrictions"
                continue
            if stripped == "Effective restrictions:":
                current_list_key = "effectiveRestrictions"
                continue

            if current_list_key and line.startswith("      "):
                if stripped not in {"none", "null"}:
                    append_unique(current_user[current_list_key], stripped)
                continue
            current_list_key = None

            for prefix, key in [
                ("Type:", "type"),
                ("Flags:", "flags"),
                ("State:", "state"),
                ("Created:", "created"),
                ("Last logged in:", "lastLoggedIn"),
                ("Start time:", "startTime"),
                ("Unlock time:", "unlockTime"),
                ("Has profile owner:", "hasProfileOwner"),
            ]:
                if stripped.startswith(prefix):
                    current_user[key] = stripped.split(":", 1)[1].strip()
                    break
            continue

        if in_device_properties:
            if stripped == "Guest restrictions:":
                device_property_list_key = "guestRestrictions"
                summary[device_property_list_key] = []
                continue
            if device_property_list_key and line.startswith("    "):
                if stripped not in {"none", "null"}:
                    append_unique(summary[device_property_list_key], stripped)
                continue
            device_property_list_key = None

            if stripped.startswith("Device owner id:"):
                summary["deviceOwnerId"] = stripped.split(":", 1)[1].strip()
            elif stripped.startswith("Started users state:"):
                summary["startedUsersState"] = stripped.split(":", 1)[1].strip()
            elif stripped.startswith("Cached user IDs (including pre-created):"):
                summary["cachedUserIdsIncludingPreCreated"] = stripped.split(":", 1)[1].strip()
            elif stripped.startswith("Cached user IDs:"):
                summary["cachedUserIds"] = stripped.split(":", 1)[1].strip()
            elif stripped.startswith("Max users:"):
                max_users_match = re.search(r"Max users:\s+(\d+)", stripped)
                summary["maxUsers"] = int(max_users_match.group(1)) if max_users_match else stripped.split(":", 1)[1].strip()
            elif stripped.startswith("Supports switchable users:"):
                summary["supportsSwitchableUsers"] = stripped.split(":", 1)[1].strip()
            elif stripped.startswith("All guests ephemeral:"):
                summary["allGuestsEphemeral"] = stripped.split(":", 1)[1].strip()
            elif stripped.startswith("Force ephemeral users:"):
                summary["forceEphemeralUsers"] = stripped.split(":", 1)[1].strip()
            elif stripped.startswith("Is headless-system mode:"):
                summary["isHeadlessSystemMode"] = stripped.split(":", 1)[1].strip()
            elif stripped.startswith("Owner name:"):
                summary["ownerName"] = stripped.split(":", 1)[1].strip()

    for line in output.splitlines():
        stripped = line.strip()
        if "passenger" in stripped.lower() and ":" in stripped:
            key, value = stripped.split(":", 1)
            passenger_config.append({"source": "dumpsys user", "key": key.strip(), "value": value.strip()})
    for line in getprop_output.splitlines():
        match = GETPROP_LINE_PATTERN.match(line.strip())
        if not match:
            continue
        key = match.group("key")
        if "passenger" not in key.lower():
            continue
        passenger_config.append({"source": "getprop", "key": key, "value": match.group("value")})

    return {
        "summary": summary,
        "users": users,
        "passengerConfig": passenger_config,
        "carServicePassenger": car_service_passenger,
    }


def list_actual_user_ids(device_id: str) -> list[int]:
    snapshot = load_device_user_snapshot(device_id)
    ids = sorted({int(user["id"]) for user in snapshot.get("users", []) if not user.get("preCreated")})
    return ids or [0]


def list_device_apps(device_id: str) -> list[dict[str, Any]]:
    apps: dict[str, dict[str, Any]] = {}
    permission_index = load_package_permission_index(device_id)
    for user_id in list_actual_user_ids(device_id):
        completed = run_targeted_adb(device_id, ["shell", "pm", "list", "packages", "-f", "-U", "--user", str(user_id)], check=False)
        output = (completed.stdout or "").strip()
        if completed.returncode != 0 or not output:
            continue
        for line in output.splitlines():
            match = PM_PACKAGE_PATTERN.match(line.strip())
            if not match:
                continue
            package_name = match.group("package")
            app_entry = apps.setdefault(
                package_name,
                {
                    "packageName": package_name,
                    "apkPath": match.group("path"),
                    "uid": match.group("uid"),
                    "installedUsers": [],
                    "requestedPermissions": permission_index.get(package_name, []),
                    "isSystemApp": is_system_package_path(match.group("path")),
                },
            )
            if user_id not in app_entry["installedUsers"]:
                app_entry["installedUsers"].append(user_id)
    items = list(apps.values())
    for item in items:
        item["installedUsers"].sort()
    items.sort(key=lambda item: str(item["packageName"]))
    return items


def collect_package_components(package_name: str, output: str) -> dict[str, list[str]]:
    section_map = {
        "Activity Resolver Table:": "activities",
        "Service Resolver Table:": "services",
        "Receiver Resolver Table:": "receivers",
        "Provider Resolver Table:": "providers",
    }
    components = {"activities": [], "services": [], "receivers": [], "providers": []}
    current_section: str | None = None
    component_pattern = re.compile(rf"\b{re.escape(package_name)}/([^\s]+)")
    for line in output.splitlines():
        stripped = line.strip()
        if stripped in section_map:
            current_section = section_map[stripped]
            continue
        if stripped.endswith("Resolver Table:") and stripped not in section_map:
            current_section = None
            continue
        if stripped in {"Packages:", "Queries:", "Package Changes:"}:
            current_section = None
            continue
        if not current_section:
            continue
        match = component_pattern.search(line)
        if match:
            append_unique(components[current_section], f"{package_name}/{match.group(1)}")
    return components


def get_device_app_detail(device_id: str, package_name: str) -> dict[str, Any]:
    output = run_adb(["-s", device_id, "shell", "dumpsys", "package", package_name])
    components, component_details = collect_package_component_snapshot(package_name, output)
    detail: dict[str, Any] = {
        "packageName": package_name,
        "apkPath": "",
        "versionCode": "",
        "versionName": "",
        "uid": "",
        "dataDir": "",
        "firstInstallTime": "",
        "lastUpdateTime": "",
        "installedUsers": [],
        "requestedPermissions": [],
        "disabledComponents": [],
        "componentDetails": component_details,
        **components,
    }
    current_list_key: str | None = None
    for line in output.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("codePath="):
            detail["apkPath"] = stripped.split("=", 1)[1].strip()
        elif stripped.startswith("versionCode="):
            detail["versionCode"] = stripped.split("=", 1)[1].split()[0].strip()
        elif stripped.startswith("versionName="):
            detail["versionName"] = stripped.split("=", 1)[1].strip()
        elif stripped.startswith("userId="):
            detail["uid"] = stripped.split("=", 1)[1].strip()
        elif stripped.startswith("dataDir="):
            detail["dataDir"] = stripped.split("=", 1)[1].strip()
        elif stripped.startswith("firstInstallTime="):
            detail["firstInstallTime"] = stripped.split("=", 1)[1].strip()
        elif stripped.startswith("lastUpdateTime="):
            detail["lastUpdateTime"] = stripped.split("=", 1)[1].strip()
        elif stripped == "requested permissions:":
            current_list_key = "requestedPermissions"
            continue
        elif stripped == "disabledComponents:":
            current_list_key = "disabledComponents"
            continue

        user_match = PACKAGE_USER_STATE_PATTERN.match(stripped)
        if user_match:
            current_list_key = None
            if "installed=true" in user_match.group("body"):
                detail["installedUsers"].append(int(user_match.group("id")))
            continue

        if current_list_key == "requestedPermissions" and line.startswith("      ") and ":" not in stripped:
            append_unique(detail["requestedPermissions"], stripped)
            continue
        if current_list_key == "disabledComponents" and line.startswith("        "):
            append_unique(detail["disabledComponents"], stripped)
            continue
        if current_list_key and not line.startswith("      "):
            current_list_key = None

    detail["installedUsers"] = sorted(set(detail["installedUsers"]))
    return detail


def infer_process_package_name(name: str, args: str) -> str:
    for candidate in [args.strip(), name.strip()]:
        if not candidate or candidate.startswith("["):
            continue
        if "/" in candidate:
            candidate = candidate.split("/", 1)[0]
        if ":" in candidate:
            candidate = candidate.split(":", 1)[0]
        if "." in candidate:
            return candidate
    return ""


def list_device_processes(device_id: str) -> list[dict[str, Any]]:
    completed = run_targeted_adb(device_id, ["shell", "ps", "-A", "-o", "USER,PID,PPID,NAME,ARGS"], check=False)
    output = (completed.stdout or "").strip()
    if completed.returncode != 0 or not output:
        raise RuntimeError("无法读取当前设备的进程列表。")

    items: list[dict[str, Any]] = []
    for line in output.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("USER"):
            continue
        parts = re.split(r"\s+", stripped, maxsplit=4)
        if len(parts) < 4:
            continue
        user, pid, ppid, name = parts[:4]
        args = parts[4] if len(parts) > 4 else name
        user_id = parse_process_user_id(user)
        package_name = infer_process_package_name(name, args)
        items.append(
            {
                "user": user,
                "userId": user_id,
                "pid": pid,
                "ppid": ppid,
                "name": name,
                "args": args,
                "packageName": package_name,
                "kernelThread": name.startswith("[") and name.endswith("]"),
                "appProcess": bool(package_name),
            }
        )
    return items


def handle_device_apps(args: argparse.Namespace) -> None:
    try:
        emit(
            {
                "command": "device-apps",
                "device": args.device,
                "status": "ok",
                "items": list_device_apps(args.device),
            }
        )
    except (FileNotFoundError, subprocess.SubprocessError, RuntimeError) as error:
        emit(
            {
                "command": "device-apps",
                "device": args.device,
                "status": "error",
                "items": [],
                "message": str(error),
            }
        )


def handle_device_app_detail(args: argparse.Namespace) -> None:
    try:
        emit(
            {
                "command": "device-app-detail",
                "device": args.device,
                "status": "ok",
                "detail": get_device_app_detail(args.device, args.package_name),
            }
        )
    except (FileNotFoundError, subprocess.SubprocessError, RuntimeError) as error:
        emit(
            {
                "command": "device-app-detail",
                "device": args.device,
                "status": "error",
                "packageName": args.package_name,
                "message": str(error),
            }
        )


def handle_device_users(args: argparse.Namespace) -> None:
    try:
        snapshot = load_device_user_snapshot(args.device)
        emit(
            {
                "command": "device-users",
                "device": args.device,
                "status": "ok",
                **snapshot,
            }
        )
    except (FileNotFoundError, subprocess.SubprocessError, RuntimeError) as error:
        emit(
            {
                "command": "device-users",
                "device": args.device,
                "status": "error",
                "summary": {},
                "users": [],
                "passengerConfig": [],
                "carServicePassenger": {},
                "message": str(error),
            }
        )


def handle_device_processes(args: argparse.Namespace) -> None:
    try:
        emit(
            {
                "command": "device-processes",
                "device": args.device,
                "status": "ok",
                "items": list_device_processes(args.device),
            }
        )
    except (FileNotFoundError, subprocess.SubprocessError, RuntimeError) as error:
        emit(
            {
                "command": "device-processes",
                "device": args.device,
                "status": "error",
                "items": [],
                "message": str(error),
            }
        )


def parse_logcat_threadtime_line(line: str, process_map: dict[str, str], index: int) -> dict[str, Any]:
    match = LOGCAT_THREADTIME_PATTERN.match(line)
    if not match:
        return {
            "id": f"line-{index}",
            "raw": line,
            "timestamp": "",
            "pid": "",
            "tid": "",
            "level": "",
            "tag": "",
            "message": line,
            "packageName": "",
            "parsed": False,
        }

    pid = match.group("pid")
    return {
        "id": f"line-{index}",
        "raw": line,
        "timestamp": f"{match.group('date')} {match.group('time')}",
        "pid": pid,
        "tid": match.group("tid"),
        "level": match.group("level"),
        "tag": match.group("tag").strip(),
        "message": match.group("message"),
        "packageName": process_map.get(pid, ""),
        "parsed": True,
    }


def handle_logcat_snapshot(args: argparse.Namespace) -> None:
    try:
        ensure_adb_available()
        ensure_device_ready(args.device)
        process_map = build_process_name_map(args.device)
        completed = run_targeted_adb(args.device, ["logcat", "-d", "-v", "threadtime"], check=False)
        if completed.returncode != 0:
            message = (completed.stderr or completed.stdout).strip() or "读取 logcat 失败"
            raise RuntimeError(message)

        raw_lines = [line for line in (completed.stdout or "").splitlines() if line.strip()]
        total_lines = len(raw_lines)
        limit = max(args.limit, 0)
        selected_lines = raw_lines[-limit:] if limit and total_lines > limit else raw_lines
        items = [parse_logcat_threadtime_line(line, process_map, index) for index, line in enumerate(selected_lines, start=1)]

        emit(
            {
                "command": "logcat-snapshot",
                "status": "ok",
                "device": args.device,
                "limit": limit,
                "totalLines": total_lines,
                "returnedLines": len(items),
                "truncated": bool(limit and total_lines > limit),
                "items": items,
                "capturedAt": int(time.time() * 1000),
                "message": f"已捕获 {len(items)} 行日志。",
            }
        )
    except (FileNotFoundError, subprocess.SubprocessError, RuntimeError) as error:
        emit(
            {
                "command": "logcat-snapshot",
                "status": "error",
                "device": args.device,
                "items": [],
                "message": str(error),
            }
        )


def handle_logcat_config(_args: argparse.Namespace) -> None:
    config = load_logcat_config()
    emit(
        {
            "command": "logcat-config",
            "status": "ok",
            **config,
        }
    )


def handle_logcat_config_save(args: argparse.Namespace) -> None:
    config = save_logcat_config(
        {
            "outputDir": args.output_dir,
            "maxFileSizeMb": args.max_file_size_mb,
            "clearBeforeStart": args.clear_before_start,
            "displayLineLimit": args.display_line_limit,
            "refreshIntervalMs": args.refresh_interval_ms,
            "defaultRegexEnabled": args.default_regex_enabled,
            "defaultLevels": args.default_levels,
        }
    )
    emit(
        {
            "command": "logcat-config-save",
            "status": "ok",
            **config,
            "message": "日志捕获规则已更新。"
        }
    )


def collect_installed_packages(device_id: str) -> list[str]:
    commands = [
        ["shell", "pm", "list", "packages"],
        ["shell", "cmd", "package", "list", "packages"],
    ]
    for command in commands:
        completed = run_targeted_adb(device_id, command, check=False)
        output = (completed.stdout or "").strip()
        if completed.returncode != 0 or not output:
            continue

        packages = sorted(
            {
                line.split(":", 1)[1].strip()
                for line in output.splitlines()
                if line.strip().startswith("package:") and line.split(":", 1)[1].strip()
            },
            key=str.lower,
        )
        if packages:
            return packages
    return []


def handle_logcat_package_list(args: argparse.Namespace) -> None:
    try:
        ensure_adb_available()
        ensure_device_ready(args.device)
        items = collect_installed_packages(args.device)
        emit(
            {
                "command": "logcat-package-list",
                "status": "ok",
                "device": args.device,
                "items": items,
                "message": f"已读取 {len(items)} 个包名。",
            }
        )
    except (FileNotFoundError, subprocess.SubprocessError, RuntimeError) as error:
        emit(
            {
                "command": "logcat-package-list",
                "status": "error",
                "device": args.device,
                "items": [],
                "message": str(error),
            }
        )


def handle_logcat_process_list(args: argparse.Namespace) -> None:
    try:
        ensure_adb_available()
        ensure_device_ready(args.device)
        process_map = build_process_name_map(args.device)
        items = [
            {"pid": pid, "name": name}
            for pid, name in process_map.items()
        ]
        items.sort(key=lambda item: (item["name"].lower(), int(item["pid"]) if item["pid"].isdigit() else 0))
        emit(
            {
                "command": "logcat-process-list",
                "status": "ok",
                "device": args.device,
                "items": items,
                "message": f"已读取 {len(items)} 个进程。",
            }
        )
    except (FileNotFoundError, subprocess.SubprocessError, RuntimeError) as error:
        emit(
            {
                "command": "logcat-process-list",
                "status": "error",
                "device": args.device,
                "items": [],
                "message": str(error),
            }
        )


def collect_backup_directories(backup_root: Path) -> list[Path]:
    if not backup_root.exists():
        return []

    directories = [item for item in backup_root.iterdir() if item.is_dir()]
    directories.sort(key=lambda item: item.stat().st_mtime, reverse=True)
    return directories


def evaluate_backup_status(backup_dir: Path, required_paths: list[str]) -> tuple[str, list[str]]:
    if not backup_dir.is_dir():
        return "未备份", required_paths[:]
    if not required_paths:
        return "已备份", []

    missing_paths = [path for path in required_paths if not (backup_dir / path.lstrip("/")).exists()]
    if missing_paths:
        return "待更新", missing_paths
    return "已备份", []


def build_backup_directory_entries(required_paths: list[str], backup_root: Path) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for directory in collect_backup_directories(backup_root):
        status, missing_paths = evaluate_backup_status(directory, required_paths)
        entries.append(
            {
                "versionName": directory.name,
                "path": str(directory),
                "status": status,
                "missingPaths": missing_paths,
                "lastUpdatedAt": int(directory.stat().st_mtime * 1000),
            }
        )
    return entries


def try_root_and_remount(device_id: str) -> list[str]:
    steps: list[str] = []
    root_result = run_targeted_adb(device_id, ["root"], check=False)
    root_message = (root_result.stderr or root_result.stdout).strip()
    if root_result.returncode == 0:
        steps.append(root_message or "adb root 成功")
        time.sleep(1)
        remount_result = run_targeted_adb(device_id, ["remount"], check=False)
        remount_message = (remount_result.stderr or remount_result.stdout).strip()
        if remount_result.returncode == 0:
            steps.append(remount_message or "系统分区已挂载为可写")
        else:
            steps.append(remount_message or "警告: remount 失败，后续操作可能受限")
    else:
        steps.append(root_message or "警告: adb root 失败，后续操作可能受限")
    return steps


def build_backup_info_payload(device_id: str) -> dict[str, Any]:
    config = load_backup_config()
    backup_paths = list(config["backupPaths"])
    restore_paths = list(config["restorePaths"])
    backup_root = get_backup_root(config)
    ensure_adb_available()
    current = ensure_device_ready(device_id)
    build_id = get_display_build_id(device_id, str(config["versionProp"]))
    backup_dir = backup_root / build_id
    last_updated_at = int(backup_dir.stat().st_mtime * 1000) if backup_dir.exists() else None
    current_status, current_missing_paths = evaluate_backup_status(backup_dir, backup_paths)
    backup_entries = build_backup_directory_entries(backup_paths, backup_root)
    return {
        "command": "backup-info",
        "status": "ok",
        "device": device_id,
        "deviceSummary": current,
        "versionName": build_id,
        "versionProp": config["versionProp"],
        "androidVersion": read_prop(device_id, "ro.build.version.release"),
        "backupRoot": str(backup_root),
        "currentBackupDir": str(backup_dir),
        "availableBackupVersions": [entry["versionName"] for entry in backup_entries],
        "availableBackups": backup_entries,
        "hasCurrentBackup": backup_dir.is_dir(),
        "currentBackupStatus": current_status,
        "currentBackupMissingPaths": current_missing_paths,
        "lastUpdatedAt": last_updated_at,
        "backupPaths": backup_paths,
        "restorePaths": restore_paths,
    }


def parse_device_line(line: str) -> tuple[str, str, dict[str, str]] | None:
    parts = line.split()
    if len(parts) < 2:
        return None

    device_id = parts[0]
    state = parts[1]
    metadata: dict[str, str] = {}
    for token in parts[2:]:
        if ":" not in token:
            continue
        key, value = token.split(":", 1)
        metadata[key] = value
    return device_id, state, metadata


def describe_connection(device_id: str, state: str, metadata: dict[str, str]) -> str:
    if state != "device":
        return state
    if device_id.startswith("emulator-"):
        return "模拟器在线"
    if "usb" in metadata:
        return "USB 在线"
    return "在线"


def list_devices() -> list[dict[str, Any]]:
    output = run_adb(["devices", "-l"])
    devices: list[dict[str, Any]] = []

    for line in output.splitlines():
        if not line.strip() or line.startswith("List of devices attached"):
            continue

        parsed = parse_device_line(line)
        if not parsed:
            continue

        device_id, state, metadata = parsed
        android_version = "未知"
        if state == "device":
            try:
                android_version = read_prop(device_id, "ro.build.version.release") or "未知"
            except subprocess.SubprocessError:
                android_version = "未知"

        display_name = metadata.get("model") or metadata.get("device") or device_id
        devices.append(
            {
                "id": device_id,
                "name": display_name.replace("_", " "),
                "status": describe_connection(device_id, state, metadata),
                "androidVersion": f"Android {android_version}" if android_version != "未知" else "未知",
                "state": state,
                "product": metadata.get("product", ""),
                "model": metadata.get("model", ""),
                "device": metadata.get("device", ""),
                "transportId": metadata.get("transport_id", "")
            }
        )

    return devices


def handle_devices(_args: argparse.Namespace) -> None:
    try:
        items = list_devices()
        emit({"command": "devices", "items": items, "status": "ok"})
    except (FileNotFoundError, subprocess.SubprocessError) as error:
        emit({"command": "devices", "items": [], "status": "error", "message": str(error)})


def handle_probe(args: argparse.Namespace) -> None:
    try:
        devices = list_devices()
        current = next((item for item in devices if item["id"] == args.device), None)
        emit(
            {
                "command": "probe",
                "device": args.device,
                "status": "ok",
                "summary": current,
                "properties": {
                    "manufacturer": read_prop(args.device, "ro.product.manufacturer"),
                    "model": read_prop(args.device, "ro.product.model"),
                    "androidVersion": read_prop(args.device, "ro.build.version.release"),
                    "sdk": read_prop(args.device, "ro.build.version.sdk"),
                    "displayId": read_prop(args.device, "ro.build.display.id"),
                    "buildFingerprint": read_prop(args.device, "ro.build.fingerprint")
                }
            }
        )
    except (FileNotFoundError, subprocess.SubprocessError) as error:
        emit(
            {
                "command": "probe",
                "device": args.device,
                "status": "error",
                "message": str(error)
            }
        )


def handle_device_display_list(args: argparse.Namespace) -> None:
    try:
        emit(
            {
                "command": "device-display-list",
                "device": args.device,
                "status": "ok",
                "scrcpyAvailable": bool(get_scrcpy_executable()),
                "items": list_device_displays(args.device),
            }
        )
    except (FileNotFoundError, subprocess.SubprocessError, RuntimeError) as error:
        emit(
            {
                "command": "device-display-list",
                "device": args.device,
                "status": "error",
                "scrcpyAvailable": bool(get_scrcpy_executable()),
                "items": [],
                "message": str(error),
            }
        )


def handle_scrcpy_config(args: argparse.Namespace) -> None:
    emit(
        {
            "command": "scrcpy-config",
            "device": args.device,
            "displayId": args.display_id,
            "status": "ok",
            "scrcpyAvailable": bool(get_scrcpy_executable()),
            "config": get_scrcpy_display_config(args.device, int(args.display_id)),
        }
    )


def handle_scrcpy_config_save(args: argparse.Namespace) -> None:
    config = save_scrcpy_display_config(
        args.device,
        int(args.display_id),
        {
            "maxSize": args.max_size,
            "windowX": args.window_x,
            "windowY": args.window_y,
            "windowWidth": args.window_width,
            "windowHeight": args.window_height,
        },
    )
    emit(
        {
            "command": "scrcpy-config-save",
            "device": args.device,
            "displayId": args.display_id,
            "status": "ok",
            "scrcpyAvailable": bool(get_scrcpy_executable()),
            "config": config,
            "message": "scrcpy 配置已保存。",
        }
    )


def handle_scrcpy_launch(args: argparse.Namespace) -> None:
    try:
        config = get_scrcpy_display_config(args.device, int(args.display_id))
        command = build_scrcpy_command(args.device, int(args.display_id), config)
        subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        emit(
            {
                "command": "scrcpy-launch",
                "device": args.device,
                "displayId": args.display_id,
                "status": "ok",
                "scrcpyAvailable": True,
                "config": config,
                "executedCommand": " ".join(command),
                "message": f"已尝试为 Display {args.display_id} 启动 scrcpy。",
            }
        )
    except RuntimeError as error:
        emit(
            {
                "command": "scrcpy-launch",
                "device": args.device,
                "displayId": args.display_id,
                "status": "error",
                "scrcpyAvailable": bool(get_scrcpy_executable()),
                "message": str(error),
            }
        )


def handle_scrcpy_sync_window(args: argparse.Namespace) -> None:
    try:
        current_config = get_scrcpy_display_config(args.device, int(args.display_id))
        geometry = read_scrcpy_window_geometry(args.device, int(args.display_id))
        config = save_scrcpy_display_config(
            args.device,
            int(args.display_id),
            {
                **current_config,
                **geometry,
            },
        )
        emit(
            {
                "command": "scrcpy-sync-window",
                "device": args.device,
                "displayId": args.display_id,
                "status": "ok",
                "scrcpyAvailable": bool(get_scrcpy_executable()),
                "config": config,
                "message": "已按当前启动窗口位置和尺寸回填并保存 scrcpy 配置。",
            }
        )
    except (FileNotFoundError, subprocess.SubprocessError, RuntimeError) as error:
        emit(
            {
                "command": "scrcpy-sync-window",
                "device": args.device,
                "displayId": args.display_id,
                "status": "error",
                "scrcpyAvailable": bool(get_scrcpy_executable()),
                "message": str(error),
            }
        )
def build_adb_command(device_id: str, raw_command: str | None, args: list[str]) -> list[str]:
    tokens = shlex.split(raw_command) if raw_command else list(args)
    if tokens and tokens[0] == "adb":
        tokens = tokens[1:]

    host_level_commands = {
        "devices",
        "help",
        "version",
        "connect",
        "disconnect",
        "pair",
        "mdns",
        "start-server",
        "kill-server",
        "keygen"
    }
    has_target = any(token in {"-s", "-d", "-e", "-t"} for token in tokens[:4])
    should_target_device = bool(tokens) and tokens[0] not in host_level_commands
    if device_id and should_target_device and not has_target:
        tokens = ["-s", device_id, *tokens]

    return [ADB_EXECUTABLE, *tokens]


def resolve_run_status(command: list[str], completed: subprocess.CompletedProcess[str]) -> str:
    if completed.returncode != 0:
        return "error"

    adb_args = command[1:]
    primary = adb_args[0] if adb_args else ""
    combined_output = "\n".join(part for part in [completed.stdout, completed.stderr] if part).lower()

    if primary == "connect" and any(token in combined_output for token in ["failed to connect", "failed to resolve host", "name or service not known", "no route to host"]):
        return "error"
    if primary == "pair" and any(token in combined_output for token in ["failed", "error", "unable"]):
        return "error"

    return "ok"


def handle_run(args: argparse.Namespace) -> None:
    started_at = time.perf_counter()
    command = build_adb_command(args.device, args.raw, args.args)
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    finished_at = int(time.time() * 1000)
    duration = int((time.perf_counter() - started_at) * 1000)
    executed_command = " ".join(command)

    history = load_history()
    record = {
        "record_id": f"{args.device}:{args.command_id}:{finished_at}",
        "device": args.device,
        "device_name": args.device_name or args.device,
        "command_id": args.command_id,
        "command_title": args.command_title or args.command_id,
        "raw": args.raw,
        "args": args.args,
        "status": resolve_run_status(command, completed),
        "executedCommand": executed_command,
        "exitCode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "message": "adb 命令已执行",
        "duration": duration,
        "created_at": finished_at,
        "source": args.source
    }
    history.insert(0, record)
    save_history(history)
    emit(
        {
            "command": "run",
            **record,
        }
    )


def handle_parse(args: argparse.Namespace) -> None:
    emit(
        {
            "command": "parse",
            "command_id": args.command_id,
            "input_file": args.input_file,
            "status": "stub"
        }
    )


def handle_export(args: argparse.Namespace) -> None:
    emit(
        {
            "command": "export",
            "recordId": args.result_id,
            "format": args.format,
            "status": "stub",
            "path": f"exports/{args.result_id}.{ 'md' if args.format == 'markdown' else args.format }"
        }
    )


def handle_history(args: argparse.Namespace) -> None:
    emit(
        {
            "command": "history",
            "items": load_history()[: args.limit],
            "status": "ok"
        }
    )


def handle_history_remove(args: argparse.Namespace) -> None:
    history = load_history()
    next_history = [item for item in history if item.get("record_id") != args.record_id]
    save_history(next_history)
    emit(
        {
            "command": "history-remove",
            "items": next_history[: args.limit],
            "removedRecordId": args.record_id,
            "status": "ok"
        }
    )


def handle_history_clear(args: argparse.Namespace) -> None:
    save_history([])
    emit(
        {
            "command": "history-clear",
            "items": [],
            "status": "ok"
        }
    )


def handle_backup_info(args: argparse.Namespace) -> None:
    try:
        emit(build_backup_info_payload(args.device))
    except (FileNotFoundError, subprocess.SubprocessError, RuntimeError) as error:
        config = load_backup_config()
        backup_root = get_backup_root(config)
        emit(
            {
                "command": "backup-info",
                "status": "error",
                "device": args.device,
                "versionProp": config["versionProp"],
                "backupRoot": str(backup_root),
                "availableBackupVersions": [entry["versionName"] for entry in build_backup_directory_entries(list(config["backupPaths"]), backup_root)],
                "availableBackups": build_backup_directory_entries(list(config["backupPaths"]), backup_root),
                "backupPaths": list(config["backupPaths"]),
                "restorePaths": list(config["restorePaths"]),
                "message": str(error)
            }
        )


def handle_backup_config(_args: argparse.Namespace) -> None:
    config = load_backup_config()
    emit(
        {
            "command": "backup-config",
            "status": "ok",
            **config,
        }
    )


def handle_backup_config_save(args: argparse.Namespace) -> None:
    previous_config = load_backup_config()
    previous_backup_root = get_backup_root(previous_config)
    config = save_backup_config(
        {
            "versionProp": args.version_prop,
            "backupPaths": args.backup_paths,
            "restorePaths": args.restore_paths,
            "backupRoot": args.backup_root,
        }
    )
    current_backup_root = get_backup_root(config)
    root_changed = previous_backup_root != current_backup_root
    migration_available = root_changed and previous_backup_root.is_dir() and any(previous_backup_root.iterdir())
    emit(
        {
            "command": "backup-config-save",
            "status": "ok",
            **config,
            "previousBackupRoot": str(previous_backup_root),
            "rootChanged": root_changed,
            "migrationAvailable": migration_available,
            "message": "备份与恢复规则已更新。"
        }
    )


def handle_backup_migrate(args: argparse.Namespace) -> None:
    try:
        source_root = Path(normalize_backup_root(args.source_root))
        target_root = Path(normalize_backup_root(args.target_root))

        if source_root == target_root:
            emit(
                {
                    "command": "backup-migrate",
                    "status": "ok",
                    "sourceRoot": str(source_root),
                    "targetRoot": str(target_root),
                    "message": "旧备份目录与新目录相同，无需迁移。"
                }
            )
            return

        if not source_root.is_dir():
            raise RuntimeError(f"旧备份目录不存在: {source_root}")
        if source_root in target_root.parents or target_root in source_root.parents:
            raise RuntimeError("旧备份目录与新目录不能互相嵌套，请更换目标目录后重试。")
        if target_root.exists() and not target_root.is_dir():
            raise RuntimeError(f"新备份根目录不是文件夹: {target_root}")

        migrated_items = [item.name for item in source_root.iterdir()]
        if not migrated_items:
            emit(
                {
                    "command": "backup-migrate",
                    "status": "ok",
                    "sourceRoot": str(source_root),
                    "targetRoot": str(target_root),
                    "message": "旧备份目录为空，无需迁移。"
                }
            )
            return

        target_root.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source_root, target_root, dirs_exist_ok=True)
        shutil.rmtree(source_root)

        emit(
            {
                "command": "backup-migrate",
                "status": "ok",
                "sourceRoot": str(source_root),
                "targetRoot": str(target_root),
                "migratedItems": migrated_items,
                "message": f"已将 {len(migrated_items)} 项旧备份迁移到新目录。"
            }
        )
    except RuntimeError as error:
        emit(
            {
                "command": "backup-migrate",
                "status": "error",
                "sourceRoot": normalize_backup_root(args.source_root),
                "targetRoot": normalize_backup_root(args.target_root),
                "message": str(error)
            }
        )


def handle_backup_create(args: argparse.Namespace) -> None:
    try:
        payload = build_backup_info_payload(args.device)
        selected_paths = normalize_backup_paths(list(args.paths or payload.get("backupPaths", [])))
        if not selected_paths:
            raise RuntimeError("至少需要选择一个备份目录。")
        build_id = str(payload["versionName"])
        backup_root = Path(str(payload["backupRoot"]))
        backup_dir = backup_root / build_id
        backup_dir.mkdir(parents=True, exist_ok=True)
        steps = try_root_and_remount(args.device)
        results: list[dict[str, str]] = []
        success_count = 0

        for device_path in selected_paths:
            parent_dir = device_path.rsplit("/", 1)[0].lstrip("/")
            local_dir = backup_dir / parent_dir
            local_dir.mkdir(parents=True, exist_ok=True)
            completed = run_targeted_adb(args.device, ["pull", device_path, str(local_dir)], check=False)
            status = "ok" if completed.returncode == 0 else "warning"
            if status == "ok":
                success_count += 1
            message = (completed.stderr or completed.stdout).strip() or ("备份完成" if status == "ok" else "拉取失败")
            results.append({"path": device_path, "status": status, "message": message})

        emit(
            {
                **payload,
                "command": "backup-create",
                "status": "ok" if success_count == len(selected_paths) else "partial",
                "currentBackupDir": str(backup_dir),
                "backupPaths": selected_paths,
                "results": results,
                "steps": steps,
                "message": f"已完成 {success_count}/{len(selected_paths)} 个目录的备份。"
            }
        )
    except (FileNotFoundError, subprocess.SubprocessError, RuntimeError) as error:
        backup_root = get_backup_root()
        emit(
            {
                "command": "backup-create",
                "status": "error",
                "device": args.device,
                "currentBackupDir": str(backup_root),
                "message": str(error)
            }
        )


def handle_backup_restore(args: argparse.Namespace) -> None:
    try:
        payload = build_backup_info_payload(args.device)
        selected_paths = normalize_backup_paths(list(args.paths or payload.get("restorePaths", [])))
        if not selected_paths:
            raise RuntimeError("至少需要选择一个恢复目录。")
        build_id = str(payload["versionName"])
        backup_root = Path(str(payload["backupRoot"]))
        restore_dir = backup_root / build_id
        if not restore_dir.is_dir():
            raise RuntimeError(f"未找到当前版本对应的备份目录: {restore_dir}")

        missing_dirs = [str(restore_dir / path.lstrip("/")) for path in selected_paths if not (restore_dir / path.lstrip("/")).is_dir()]
        if missing_dirs:
            raise RuntimeError(f"备份目录不完整，缺少: {'; '.join(missing_dirs)}")

        steps = try_root_and_remount(args.device)
        results: list[dict[str, str]] = []

        for device_path in selected_paths:
            local_path = restore_dir / device_path.lstrip("/")
            completed = run_targeted_adb(args.device, ["push", f"{local_path}/.", f"{device_path}/"], check=False)
            if completed.returncode != 0:
                message = (completed.stderr or completed.stdout).strip() or f"推送 {device_path} 失败"
                raise RuntimeError(message)
            message = (completed.stderr or completed.stdout).strip() or "恢复完成"
            results.append({"path": device_path, "status": "ok", "message": message})

        run_targeted_adb(args.device, ["shell", "sync"], check=False)
        steps.append("已执行 sync")
        run_targeted_adb(args.device, ["reboot"], check=False)
        steps.append("设备已重启，等待重新连接")
        run_targeted_adb(args.device, ["wait-for-device"], check=True)
        steps.extend(try_root_and_remount(args.device))

        emit(
            {
                **payload,
                "command": "backup-restore",
                "status": "ok",
                "currentBackupDir": str(restore_dir),
                "restorePaths": selected_paths,
                "results": results,
                "steps": steps,
                "message": "恢复完成，设备已重启并重新尝试 remount。"
            }
        )
    except (FileNotFoundError, subprocess.SubprocessError, RuntimeError) as error:
        backup_root = get_backup_root()
        emit(
            {
                "command": "backup-restore",
                "status": "error",
                "device": args.device,
                "currentBackupDir": str(backup_root),
                "message": str(error)
            }
        )


def handle_backup_open(args: argparse.Namespace) -> None:
    try:
        backup_root = get_backup_root()
        target_dir = backup_root / args.version_name
        if not target_dir.is_dir():
            raise RuntimeError(f"目录不存在: {target_dir}")
        subprocess.Popen(["xdg-open", str(target_dir)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        emit(
            {
                "command": "backup-open",
                "status": "ok",
                "path": str(target_dir),
                "message": f"已尝试打开目录: {target_dir}"
            }
        )
    except (FileNotFoundError, RuntimeError) as error:
        emit(
            {
                "command": "backup-open",
                "status": "error",
                "message": str(error)
            }
        )


def handle_backup_delete(args: argparse.Namespace) -> None:
    try:
        backup_root = get_backup_root()
        target_dir = backup_root / args.version_name
        if not target_dir.is_dir():
            raise RuntimeError(f"目录不存在: {target_dir}")
        shutil.rmtree(target_dir)
        emit(
            {
                "command": "backup-delete",
                "status": "ok",
                "versionName": args.version_name,
                "path": str(target_dir),
                "message": f"已删除备份目录: {target_dir}"
            }
        )
    except RuntimeError as error:
        emit(
            {
                "command": "backup-delete",
                "status": "error",
                "versionName": args.version_name,
                "message": str(error)
            }
        )


def handle_crash_list(args: argparse.Namespace) -> None:
    """List crash/ANR files from device (tombstones, ANR traces, dropbox)."""
    try:
        ensure_adb_available()
        ensure_device_ready(args.device)

        # List tombstones from /data/tombstones/
        tombstones: list[dict[str, Any]] = []
        try:
            output = run_adb(["-s", args.device, "shell", "ls", "-la", "/data/tombstones/"])
            for line in output.splitlines():
                line = line.strip()
                if not line or line.startswith("total"):
                    continue
                # Parse ls -la output format: permissions links owner group size date time name
                parts = line.split()
                if len(parts) < 8:
                    continue
                name = " ".join(parts[7:])
                if name == "." or name == "..":
                    continue
                size = parts[4]
                date = f"{parts[5]} {parts[6]}"
                path = f"/data/tombstones/{name}"
                tombstones.append({
                    "name": name,
                    "path": path,
                    "size": size,
                    "date": date,
                })
        except subprocess.SubprocessError:
            pass  # Directory may not exist or no permission

        # List ANR traces from /data/anr/
        anr: list[dict[str, Any]] = []
        try:
            output = run_adb(["-s", args.device, "shell", "ls", "-la", "/data/anr/"])
            for line in output.splitlines():
                line = line.strip()
                if not line or line.startswith("total"):
                    continue
                parts = line.split()
                if len(parts) < 8:
                    continue
                name = " ".join(parts[7:])
                if name == "." or name == "..":
                    continue
                size = parts[4]
                date = f"{parts[5]} {parts[6]}"
                path = f"/data/anr/{name}"
                anr.append({
                    "name": name,
                    "path": path,
                    "size": size,
                    "date": date,
                })
        except subprocess.SubprocessError:
            pass  # Directory may not exist or no permission

        # List dropbox files from /data/system/dropbox/
        from collections import defaultdict
        dropbox_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        try:
            output = run_adb(["-s", args.device, "shell", "ls", "-la", "/data/system/dropbox/"])
            for line in output.splitlines():
                line = line.strip()
                if not line or line.startswith("total"):
                    continue
                parts = line.split()
                if len(parts) < 8:
                    continue
                name = " ".join(parts[7:])
                if name == "." or name == "..":
                    continue
                size = parts[4]
                date = f"{parts[5]} {parts[6]}"
                path = f"/data/system/dropbox/{name}"
                display_name = name
                if name.endswith(".pb"):
                    display_name += " (binary)"
                tag = name.split("@")[0] if "@" in name else name
                entry = {
                    "name": display_name,
                    "path": path,
                    "size": size,
                    "date": date,
                    "tag": tag,
                }
                dropbox_groups[tag].append(entry)
        except subprocess.SubprocessError:
            pass

        # Flatten groups into sorted list with group headers
        dropbox: list[dict[str, Any]] = []
        for tag in sorted(dropbox_groups.keys()):
            for entry in dropbox_groups[tag]:
                entry_copy = dict(entry)
                entry_copy["groupTag"] = tag
                dropbox.append(entry_copy)

        emit({
            "command": "crash-list",
            "status": "ok",
            "device": args.device,
            "tombstones": tombstones,
            "anr": anr,
            "dropbox": dropbox,
            "message": f"找到 {len(tombstones)} tombstones, {len(anr)} ANR, {len(dropbox)} dropbox 文件。",
        })
    except (FileNotFoundError, subprocess.SubprocessError, RuntimeError) as error:
        emit({
            "command": "crash-list",
            "status": "error",
            "device": args.device,
            "tombstones": [],
            "anr": [],
            "dropbox": [],
            "message": str(error),
        })


def handle_crash_read(args: argparse.Namespace) -> None:
    """Read content of a crash/ANR file from device."""
    try:
        ensure_adb_available()
        ensure_device_ready(args.device)
        raw = run_adb_bytes(["-s", args.device, "shell", "cat", args.file_path])
        import base64
        b64_content = base64.b64encode(raw).decode("ascii")
        is_binary = any(b > 0x7f for b in raw[:min(len(raw), 256)])
        emit({
            "command": "crash-read",
            "status": "ok",
            "device": args.device,
            "filePath": args.file_path,
            "content": b64_content,
            "isBinary": is_binary,
            "message": f"已读取文件: {args.file_path}",
        })
    except (FileNotFoundError, subprocess.SubprocessError, RuntimeError) as error:
        emit({
            "command": "crash-read",
            "status": "error",
            "device": args.device,
            "filePath": args.file_path,
            "content": "",
            "isBinary": False,
            "message": str(error),
        })


def handle_crash_export(args: argparse.Namespace) -> None:
    """Export crash/ANR files from device to local directory."""
    import os
    try:
        ensure_adb_available()
        ensure_device_ready(args.device)
        os.makedirs(args.output_dir, exist_ok=True)
        exported: list[dict[str, Any]] = []
        failed: list[dict[str, Any]] = []
        for file_path in args.file_paths:
            fname = file_path.rsplit("/", 1)[-1]
            local_path = os.path.join(args.output_dir, fname)
            try:
                raw = run_adb_bytes(["-s", args.device, "shell", "cat", file_path])
                with open(local_path, "wb") as f:
                    f.write(raw)
                exported.append({"path": file_path, "localPath": local_path, "size": len(raw)})
            except Exception as e:
                failed.append({"path": file_path, "error": str(e)})
        emit({
            "command": "crash-export",
            "status": "ok",
            "device": args.device,
            "exported": exported,
            "failed": failed,
            "outputDir": args.output_dir,
            "message": f"导出完成: {len(exported)} 成功, {len(failed)} 失败",
        })
    except (FileNotFoundError, subprocess.SubprocessError, RuntimeError, OSError) as error:
        emit({
            "command": "crash-export",
            "status": "error",
            "device": args.device,
            "exported": [],
            "failed": [],
            "outputDir": args.output_dir,
            "message": str(error),
        })


def handle_keysim_screenshot(args: argparse.Namespace) -> None:
    try:
        png_bytes = run_adb_bytes(["-s", args.device, "exec-out", "screencap", "-p"])
        if not png_bytes:
            raise RuntimeError("未获取到截图数据")
        data_url = "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")
        emit(
            {
                "command": "keysim-screenshot",
                "status": "ok",
                "device": args.device,
                "dataUrl": data_url,
                "message": "截图获取成功"
            }
        )
    except (FileNotFoundError, subprocess.SubprocessError, RuntimeError) as error:
        emit(
            {
                "command": "keysim-screenshot",
                "status": "error",
                "device": args.device,
                "message": str(error)
            }
        )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="ADB Helper backend stub CLI")
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    devices = subparsers.add_parser("devices")
    devices.set_defaults(func=handle_devices)

    probe = subparsers.add_parser("probe")
    probe.add_argument("--device", required=True)
    probe.set_defaults(func=handle_probe)

    device_apps = subparsers.add_parser("device-apps")
    device_apps.add_argument("--device", required=True)
    device_apps.set_defaults(func=handle_device_apps)

    device_app_detail = subparsers.add_parser("device-app-detail")
    device_app_detail.add_argument("--device", required=True)
    device_app_detail.add_argument("--package-name", required=True)
    device_app_detail.set_defaults(func=handle_device_app_detail)

    device_users = subparsers.add_parser("device-users")
    device_users.add_argument("--device", required=True)
    device_users.set_defaults(func=handle_device_users)

    device_processes = subparsers.add_parser("device-processes")
    device_processes.add_argument("--device", required=True)
    device_processes.set_defaults(func=handle_device_processes)

    display_list = subparsers.add_parser("device-display-list")
    display_list.add_argument("--device", required=True)
    display_list.set_defaults(func=handle_device_display_list)

    scrcpy_config = subparsers.add_parser("scrcpy-config")
    scrcpy_config.add_argument("--device", required=True)
    scrcpy_config.add_argument("--display-id", required=True, type=int)
    scrcpy_config.set_defaults(func=handle_scrcpy_config)

    scrcpy_config_save = subparsers.add_parser("scrcpy-config-save")
    scrcpy_config_save.add_argument("--device", required=True)
    scrcpy_config_save.add_argument("--display-id", required=True, type=int)
    scrcpy_config_save.add_argument("--max-size", required=True, type=int)
    scrcpy_config_save.add_argument("--window-x", required=True, type=int)
    scrcpy_config_save.add_argument("--window-y", required=True, type=int)
    scrcpy_config_save.add_argument("--window-width", required=True, type=int)
    scrcpy_config_save.add_argument("--window-height", required=True, type=int)
    scrcpy_config_save.set_defaults(func=handle_scrcpy_config_save)

    scrcpy_launch = subparsers.add_parser("scrcpy-launch")
    scrcpy_launch.add_argument("--device", required=True)
    scrcpy_launch.add_argument("--display-id", required=True, type=int)
    scrcpy_launch.set_defaults(func=handle_scrcpy_launch)

    scrcpy_sync_window = subparsers.add_parser("scrcpy-sync-window")
    scrcpy_sync_window.add_argument("--device", required=True)
    scrcpy_sync_window.add_argument("--display-id", required=True, type=int)
    scrcpy_sync_window.set_defaults(func=handle_scrcpy_sync_window)

    run = subparsers.add_parser("run")
    run.add_argument("--device", required=True)
    run.add_argument("--command-id", required=True)
    run.add_argument("--device-name")
    run.add_argument("--command-title")
    run.add_argument("--raw")
    run.add_argument("--args", nargs="*", default=[])
    run.add_argument("--source", default="tool")
    run.set_defaults(func=handle_run)

    parse = subparsers.add_parser("parse")
    parse.add_argument("--command-id", required=True)
    parse.add_argument("--input-file", required=True)
    parse.set_defaults(func=handle_parse)

    export = subparsers.add_parser("export")
    export.add_argument("--result-id", required=True)
    export.add_argument("--format", choices=["markdown", "json", "text"], required=True)
    export.set_defaults(func=handle_export)

    history = subparsers.add_parser("history")
    history.add_argument("--limit", type=int, default=20)
    history.set_defaults(func=handle_history)

    history_remove = subparsers.add_parser("history-remove")
    history_remove.add_argument("--record-id", required=True)
    history_remove.add_argument("--limit", type=int, default=20)
    history_remove.set_defaults(func=handle_history_remove)

    history_clear = subparsers.add_parser("history-clear")
    history_clear.add_argument("--limit", type=int, default=20)
    history_clear.set_defaults(func=handle_history_clear)

    logcat_snapshot = subparsers.add_parser("logcat-snapshot")
    logcat_snapshot.add_argument("--device", required=True)
    logcat_snapshot.add_argument("--limit", type=int, default=1200)
    logcat_snapshot.set_defaults(func=handle_logcat_snapshot)

    logcat_config = subparsers.add_parser("logcat-config")
    logcat_config.set_defaults(func=handle_logcat_config)

    logcat_config_save = subparsers.add_parser("logcat-config-save")
    logcat_config_save.add_argument("--output-dir", required=True)
    logcat_config_save.add_argument("--max-file-size-mb", required=True, type=int)
    logcat_config_save.add_argument("--clear-before-start", required=True)
    logcat_config_save.add_argument("--display-line-limit", required=True, type=int)
    logcat_config_save.add_argument("--refresh-interval-ms", required=True, type=int)
    logcat_config_save.add_argument("--default-regex-enabled", required=True)
    logcat_config_save.add_argument("--default-levels", nargs="*", default=[])
    logcat_config_save.set_defaults(func=handle_logcat_config_save)

    logcat_package_list = subparsers.add_parser("logcat-package-list")
    logcat_package_list.add_argument("--device", required=True)
    logcat_package_list.set_defaults(func=handle_logcat_package_list)

    logcat_process_list = subparsers.add_parser("logcat-process-list")
    logcat_process_list.add_argument("--device", required=True)
    logcat_process_list.set_defaults(func=handle_logcat_process_list)

    backup_config = subparsers.add_parser("backup-config")
    backup_config.set_defaults(func=handle_backup_config)

    backup_config_save = subparsers.add_parser("backup-config-save")
    backup_config_save.add_argument("--version-prop", required=True)
    backup_config_save.add_argument("--backup-root", required=True)
    backup_config_save.add_argument("--backup-paths", nargs="*", default=[])
    backup_config_save.add_argument("--restore-paths", nargs="*", default=[])
    backup_config_save.set_defaults(func=handle_backup_config_save)

    backup_migrate = subparsers.add_parser("backup-migrate")
    backup_migrate.add_argument("--source-root", required=True)
    backup_migrate.add_argument("--target-root", required=True)
    backup_migrate.set_defaults(func=handle_backup_migrate)

    backup_info = subparsers.add_parser("backup-info")
    backup_info.add_argument("--device", required=True)
    backup_info.set_defaults(func=handle_backup_info)

    backup_create = subparsers.add_parser("backup-create")
    backup_create.add_argument("--device", required=True)
    backup_create.add_argument("--paths", nargs="*", default=[])
    backup_create.set_defaults(func=handle_backup_create)

    backup_restore = subparsers.add_parser("backup-restore")
    backup_restore.add_argument("--device", required=True)
    backup_restore.add_argument("--paths", nargs="*", default=[])
    backup_restore.set_defaults(func=handle_backup_restore)

    backup_open = subparsers.add_parser("backup-open")
    backup_open.add_argument("--version-name", required=True)
    backup_open.set_defaults(func=handle_backup_open)

    backup_delete = subparsers.add_parser("backup-delete")
    backup_delete.add_argument("--version-name", required=True)
    backup_delete.set_defaults(func=handle_backup_delete)

    crash_list = subparsers.add_parser("crash-list")
    crash_list.add_argument("--device", required=True)
    crash_list.set_defaults(func=handle_crash_list)

    crash_read = subparsers.add_parser("crash-read")
    crash_read.add_argument("--device", required=True)
    crash_read.add_argument("--file-path", required=True, dest="file_path")
    crash_read.set_defaults(func=handle_crash_read)

    crash_export = subparsers.add_parser("crash-export")
    crash_export.add_argument("--device", required=True)
    crash_export.add_argument("--file-paths", required=True, nargs="+", dest="file_paths")
    crash_export.add_argument("--output-dir", required=True, dest="output_dir")
    crash_export.set_defaults(func=handle_crash_export)

    keysim_screenshot = subparsers.add_parser("keysim-screenshot")
    keysim_screenshot.add_argument("--device", required=True)
    keysim_screenshot.set_defaults(func=handle_keysim_screenshot)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()