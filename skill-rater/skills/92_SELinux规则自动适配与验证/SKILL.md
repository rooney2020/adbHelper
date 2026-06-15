---
name: t1g-selinux-fix
description: Diagnose, patch, build, flash, and re-check SELinux AVC violations on the T1G Android ECU project. Use when Codex is asked to fix T1G SELinux denials, verify IDPS/service AVCs with ADB, run the local maruko Docker build, flash vbmeta/super images with fastboot, or iterate policy changes while excluding specific permissions such as sys_ptrace.
---

# T1G SELinux Fix

## Scope

Use this workflow for T1G SELinux violation loops: collect AVCs from the board, translate them into Android policy changes, build locally in the established Docker container, flash the updated Android images, and re-check denials after the target services are running.

Default paths and services:

```text
T1G root: /home/jiangpengfei/work/t1g
Android root: /home/jiangpengfei/work/t1g/lagvm/LINUX/android
Maruko policy: /home/jiangpengfei/work/t1g/lagvm/LINUX/android/device/ts/maruko/sepolicy
Android output: /home/jiangpengfei/work/t1g/lagvm/LINUX/android/out/target/product/gen4_gvm
IDPS domain: u:r:idps_daemon:s0
IDPS processes: idps_nodeManager, idps_hids, idps_nidps
UART: /dev/ttyUSB0 at 115200
```

## Workflow

1. Confirm the requested exclusion list before patching. If the user says to exclude `sys_ptrace`, do not add `allow ... self:capability sys_ptrace;` even if it appears in AVCs.
2. Collect current AVCs with ADB. Prefer permissive verification when the user wants to discover all needed policy at once.
3. Group denials by `scontext`, `tcontext`, `tclass`, and permission set. Separate repeated duplicates from new patterns.
4. Patch the narrowest matching `.te`, `file_contexts`, or context file in source. For IDPS, start with `device/ts/maruko/sepolicy/idps/idps_daemon.te`.
5. Run the T1G local build in Docker using the exact `scm` flow below.
6. If policy compile fails, inspect `~/work/t1g/maruko.log`, fix the first real `neverallow`/policy error, and rebuild.
7. Flash `vbmeta.img` and `super.img` from the host with fastboot.
8. After Android reboots, wait for all target services, set permissive if requested, collect AVCs again, and report remaining denials separated by excluded permissions.

## AVC Collection

Use ADB from the host. When verifying with permissive mode:

```bash
adb wait-for-device
adb shell setenforce 0
adb shell getenforce
adb logcat -c
```

For IDPS, wait until all three processes exist and run in the expected domain before checking denials:

```bash
adb shell ps -A -Z | grep -i -E 'idps_nodeManager|idps_hids|idps_nidps|PID'
```

Then collect AVCs:

```bash
adb logcat -d -b all | grep -i -E 'avc:|denied' | grep 'scontext=u:r:idps_daemon:s0'
adb logcat -d -b all | grep -i -E 'avc:|denied' | grep 'scontext=u:r:idps_daemon:s0' | grep -v sys_ptrace
```

Use `dmesg` only when logcat does not contain the kernel audit history:

```bash
adb shell dmesg | grep -i -E 'avc:|denied'
```

## Policy Patch Guidance

Translate AVCs mechanically first, then check Android policy style and `neverallow` constraints:

```text
avc: denied { read open } scontext=u:r:foo:s0 tcontext=u:object_r:bar_file:s0 tclass=file
allow foo bar_file:file { read open };
```

Prefer existing macros and local style where present. Avoid broad capabilities unless required and permitted. If the user explicitly trusts a service, broader type access can be acceptable, but still avoid known excluded permissions.

For IDPS-specific loops, common files are:

```text
device/ts/maruko/sepolicy/idps/idps_daemon.te
device/ts/maruko/sepolicy/idps/file_contexts
device/ts/maruko/sepolicy/idps/seapp_contexts
```

When category-based app data denials appear, check whether the domain already has `mlstrustedsubject`. Missing MLS trust and missing type allows are different problems.

## Local Build

Run the build exactly in the Docker container and as user `scm`:

```bash
sudo docker start ubuntu_1804
sudo docker exec -it ubuntu_1804 /bin/bash
su - scm
cd ~/work/t1g
./build_target.sh maruko -a -j 16
```

Monitor the interactive session until completion. Treat these as hard failures only when the build exits failed or prints a real failed target: `FAILED:`, `ninja failed`, `#### failed`, `BUILD_ANDROID_EXIT_CODE=NG`, `neverallow`, Soong/Blueprint parse errors, compiler fatal errors, missing targets, or link failures. Do not stop only because warning-heavy Qualcomm/TZ phases or Kotlin `e:` lines appear while the build continues.

Primary log path on host:

```text
/home/jiangpengfei/work/t1g/maruko.log
```

A successful build should report OK statuses such as:

```text
BUILD_ANDROID_EXIT_CODE=OK
BUILD_QNX_AP_EXIT_CODE=OK
BUILD_META_EXIT_CODE=OK
COLLECT_IMAGES_EXIT_CODE=OK
PACKAGE_IMAGES_EXIT_CODE=OK
```

## Fastboot Flash

Use host fastboot, not Docker. Confirm images exist first:

```bash
ls -l /home/jiangpengfei/work/t1g/lagvm/LINUX/android/out/target/product/gen4_gvm/vbmeta.img \
      /home/jiangpengfei/work/t1g/lagvm/LINUX/android/out/target/product/gen4_gvm/super.img
```

Use UART to enter fastboot:

```bash
sudo picocom -b 115200 /dev/ttyUSB0
```

Press Enter, confirm the QNX `#` prompt, then issue:

```bash
reset -f
```

After fastboot mode is available, flash from a host shell:

```bash
cd /home/jiangpengfei/work/t1g/lagvm/LINUX/android/out/target/product/gen4_gvm
sudo fastboot devices
sudo fastboot flash la_vbmeta ./vbmeta.img
sudo fastboot flash la_super ./super.img
sudo fastboot reboot
```

For SELinux policy verification, `la_vbmeta` and `la_super` are normally sufficient because policy changes are packaged in the dynamic Android partitions.

## Post-Flash Verification

After reboot:

```bash
adb wait-for-device
adb shell getenforce
```

Poll until all expected processes are running. For IDPS:

```bash
adb shell ps -A -Z | grep -i -E 'idps_nodeManager|idps_hids|idps_nidps|PID'
```

If the verification goal is to discover remaining policy needs, set permissive after boot and clear logs before collecting new AVCs:

```bash
adb shell setenforce 0
adb logcat -c
sleep 30
adb logcat -d -b all | grep -i -E 'avc:|denied' | grep 'scontext=u:r:idps_daemon:s0'
```

Report:

- Whether build and flash succeeded.
- Whether SELinux is `Enforcing` or `Permissive` during collection.
- Whether all expected processes run in the expected SELinux domain.
- Remaining AVC patterns, with excluded permissions such as `sys_ptrace` listed separately.
- The exact policy file changes made.