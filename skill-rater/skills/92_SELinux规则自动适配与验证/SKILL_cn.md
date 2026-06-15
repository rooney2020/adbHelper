---
name: t1g-selinux-fix
description: 在 T1G Android ECU 项目上诊断、打补丁、构建、烧录并重新检查 SELinux AVC 违规。当 Codex 被要求修复 T1G SELinux 拒绝、使用 ADB 验证 IDPS/服务 AVC、运行本地 maruko Docker 构建、使用 fastboot 烧录 vbmeta/super 镜像、或在排除特定权限（如 sys_ptrace）的情况下迭代策略更改时使用。
---

# T1G SELinux 修复

## 范围

对 T1G SELinux 违规循环使用此工作流程：从开发板收集 AVC，将其转化为 Android 策略更改，在已建立的 Docker 容器中本地构建，烧录更新的 Android 镜像，并在目标服务运行后重新检查拒绝。

默认路径和服务：

```text
T1G 根目录: /home/jiangpengfei/work/t1g
Android 根目录: /home/jiangpengfei/work/t1g/lagvm/LINUX/android
Maruko 策略: /home/jiangpengfei/work/t1g/lagvm/LINUX/android/device/ts/maruko/sepolicy
Android 输出: /home/jiangpengfei/work/t1g/lagvm/LINUX/android/out/target/product/gen4_gvm
IDPS 域: u:r:idps_daemon:s0
IDPS 进程: idps_nodeManager, idps_hids, idps_nidps
UART: /dev/ttyUSB0 波特率 115200
```

## 工作流程

1.  在打补丁前确认请求的排除列表。如果用户要求排除 `sys_ptrace`，即使它出现在 AVC 中，也不要添加 `allow ... self:capability sys_ptrace;`。
2.  使用 ADB 收集当前的 AVC。当用户希望一次性发现所有需要的策略时，首选许可模式验证。
3.  按 `scontext`、`tcontext`、`tclass` 和权限集对拒绝进行分组。将重复项与新模式分开。
4.  在源码中为最窄匹配的 `.te`、`file_contexts` 或上下文文件打补丁。对于 IDPS，从 `device/ts/maruko/sepolicy/idps/idps_daemon.te` 开始。
5.  使用下面的确切 `scm` 流程在 Docker 中运行 T1G 本地构建。
6.  如果策略编译失败，检查 `~/work/t1g/maruko.log`，修复第一个真正的 `neverallow`/策略错误，然后重新构建。
7.  从主机使用 fastboot 烧录 `vbmeta.img` 和 `super.img`。
8.  Android 重启后，等待所有目标服务，如果请求则设置为许可模式，再次收集 AVC，并报告排除排除权限后的剩余拒绝。

## AVC 收集

从主机使用 ADB。当使用许可模式验证时：

```bash
adb wait-for-device
adb shell setenforce 0
adb shell getenforce
adb logcat -c
```

对于 IDPS，在检查拒绝之前，等待所有三个进程都存在并在预期的域中运行：

```bash
adb shell ps -A -Z | grep -i -E 'idps_nodeManager|idps_hids|idps_nidps|PID'
```

然后收集 AVC：

```bash
adb logcat -d -b all | grep -i -E 'avc:|denied' | grep 'scontext=u:r:idps_daemon:s0'
adb logcat -d -b all | grep -i -E 'avc:|denied' | grep 'scontext=u:r:idps_daemon:s0' | grep -v sys_ptrace
```

仅当 logcat 不包含内核审计历史时使用 `dmesg`：

```bash
adb shell dmesg | grep -i -E 'avc:|denied'
```

## 策略补丁指导

首先机械地翻译 AVC，然后检查 Android 策略风格和 `neverallow` 约束：

```text
avc: denied { read open } scontext=u:r:foo:s0 tcontext=u:object_r:bar_file:s0 tclass=file
allow foo bar_file:file { read open };
```

优先使用现有的宏和本地风格（如果存在）。除非必需且允许，否则避免宽泛的能力。如果用户明确信任某个服务，更广泛的类型访问可能是可接受的，但仍然要避免已知的排除权限。

对于特定于 IDPS 的循环，常见文件有：

```text
device/ts/maruko/sepolicy/idps/idps_daemon.te
device/ts/maruko/sepolicy/idps/file_contexts
device/ts/maruko/sepolicy/idps/seapp_contexts
```

当出现基于类别的应用数据拒绝时，检查域是否已经拥有 `mlstrustedsubject`。缺少 MLS 信任和缺少类型允许是不同的问题。

## 本地构建

**精确地**在 Docker 容器中并以 `scm` 用户身份运行构建：

```bash
sudo docker start ubuntu_1804
sudo docker exec -it ubuntu_1804 /bin/bash
su - scm
cd ~/work/t1g
./build_target.sh maruko -a -j 16
```

监控交互式会话直到完成。仅当构建退出失败或打印真正的失败目标时，才将这些视为硬失败：`FAILED:`、`ninja failed`、`#### failed`、`BUILD_ANDROID_EXIT_CODE=NG`、`neverallow`、Soong/Blueprint 解析错误、编译器致命错误、缺少目标或链接失败。不要仅仅因为构建继续进行时出现大量警告的 Qualcomm/TZ 阶段或 Kotlin `e:` 行而停止。

主机上的主日志路径：

```text
/home/jiangpengfei/work/t1g/maruko.log
```

成功的构建应报告 OK 状态，例如：

```text
BUILD_ANDROID_EXIT_CODE=OK
BUILD_QNX_AP_EXIT_CODE=OK
BUILD_META_EXIT_CODE=OK
COLLECT_IMAGES_EXIT_CODE=OK
PACKAGE_IMAGES_EXIT_CODE=OK
```

## Fastboot 烧录

使用主机 fastboot，而不是 Docker。首先确认镜像存在：

```bash
ls -l /home/jiangpengfei/work/t1g/lagvm/LINUX/android/out/target/product/gen4_gvm/vbmeta.img \
      /home/jiangpengfei/work/t1g/lagvm/LINUX/android/out/target/product/gen4_gvm/super.img
```

使用 UART 进入 fastboot：

```bash
sudo picocom -b 115200 /dev/ttyUSB0
```

按下 Enter，确认 QNX `#` 提示符，然后发出命令：

```bash
reset -f
```

在 fastboot 模式可用后，从主机 shell 烧录：

```bash
cd /home/jiangpengfei/work/t1g/lagvm/LINUX/android/out/target/product/gen4_gvm
sudo fastboot devices
sudo fastboot flash la_vbmeta ./vbmeta.img
sudo fastboot flash la_super ./super.img
sudo fastboot reboot
```

对于 SELinux 策略验证，`la_vbmeta` 和 `la_super` 通常就足够了，因为策略更改被打包在动态 Android 分区中。

## 烧录后验证

重启后：

```bash
adb wait-for-device
adb shell getenforce
```

轮询直到所有预期进程都在运行。对于 IDPS：

```bash
adb shell ps -A -Z | grep -i -E 'idps_nodeManager|idps_hids|idps_nidps|PID'
```

如果验证目标是发现剩余的策略需求，则在启动后设置许可模式，并在收集新的 AVC 之前清除日志：

```bash
adb shell setenforce 0
adb logcat -c
sleep 30
adb logcat -d -b all | grep -i -E 'avc:|denied' | grep 'scontext=u:r:idps_daemon:s0'
```

报告：

-   构建和烧录是否成功。
-   在收集期间 SELinux 是 `Enforcing` 还是 `Permissive`。
-   所有预期进程是否都在预期的 SELinux 域中运行。
-   剩余的 AVC 模式，排除的权限（例如 `sys_ptrace`）单独列出。
-   所做的确切策略文件更改。

