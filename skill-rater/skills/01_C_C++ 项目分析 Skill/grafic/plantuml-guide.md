# PlantUML 图表规范# PlantUML 图表指南

## 文件命名规范

```
{章节号}_{类型}_{序号}_{描述}.puml
```

### 类型代码

| 代码 | 图表类型 | 章节归属 |
|------|---------|---------|
| comp | 组件图 | §1 概述 或 §2 接口设计 |
| uc | 用例图 | §1.3 用例设计 |
| arch | 部署图 | §1.2 模块位置 |
| seq | 时序图 | §5 时序设计 |
| flow | 流程图 | §4 流程设计 |
| state | 状态图 | §4 流程设计 |
| class | 类图 | §3 数据结构设计 |

### 命名示例

```
01_uc_01_usb_image_usecase.puml
01_arch_01_system_deployment.puml
01_comp_01_module_structure.puml
04_flow_01_main_process.puml
04_flow_02_error_handling.puml
04_state_01_device_lifecycle.puml
05_seq_01_init_sequence.puml
05_seq_02_data_transfer.puml
```

## 通用头部模板

所有PUML文件使用统一的头部设置：

```plantuml
@startuml {diagram_name}
!theme plain
skinparam backgroundColor #FEFEFE
skinparam defaultFontName "Microsoft YaHei"
skinparam defaultFontSize 11
```

## 各类型完整模板

### 用例图

```plantuml
@startuml uc_example
!theme plain
skinparam backgroundColor #FEFEFE
skinparam defaultFontName "Microsoft YaHei"
skinparam defaultFontSize 11
skinparam actorStyle awesome
skinparam usecaseFontSize 11
skinparam packageFontSize 12
skinparam packageFontStyle bold

left to right direction

actor "用户" as User
actor "系统" as System <<secondary>>

rectangle "模块名称" {
    usecase "功能A" as UC1
    usecase "功能B" as UC2
    usecase "功能C" as UC3
}

User --> UC1
User --> UC2
UC2 ..> UC3 : <<include>>
System --> UC3
@enduml
```

### 组件图

```plantuml
@startuml comp_example
!theme plain
skinparam backgroundColor #FEFEFE
skinparam componentStyle rectangle
skinparam defaultFontName "Microsoft YaHei"
skinparam defaultFontSize 11
skinparam packageFontSize 12
skinparam packageFontStyle bold

title 系统组件架构

package "应用层" #E8F5E9 {
    component [模块A] as MA
    component [模块B] as MB
}

package "服务层" #E3F2FD {
    component [服务X] as SX
    component [服务Y] as SY
}

package "驱动层" #ECEFF1 {
    component [驱动P] as DP
}

MA --> SX : 调用
MB --> SY : 调用
SX --> DP : 操作硬件
SY --> DP : 操作硬件
@enduml
```

### 部署图

```plantuml
@startuml arch_example
!theme plain
skinparam backgroundColor #FEFEFE
skinparam defaultFontName "Microsoft YaHei"
skinparam defaultFontSize 11

title 系统部署拓扑

node "主控设备" #E8F5E9 {
    component [应用程序] as App
    component [操作系统] as OS
}

node "外部设备" #E3F2FD {
    component [存储介质] as Storage
}

cloud "网络" #ECEFF1 {
    component [服务器] as Server
}

App --> OS : 系统调用
OS --> Storage : USB/SPI
App ..> Server : HTTP(可选)
@enduml
```

### 时序图

```plantuml
@startuml seq_example
!theme plain
skinparam backgroundColor #FEFEFE
skinparam sequenceMessageAlign center
skinparam defaultFontName "Microsoft YaHei"
skinparam defaultFontSize 11
skinparam participantPadding 20
skinparam sequenceGroupBodyBackgroundColor #F5F5F5

title 模块交互时序

participant "调用方" as Caller #E8F5E9
participant "模块A" as ModA #E3F2FD
participant "模块B" as ModB #FFF3E0
participant "硬件" as HW #ECEFF1

== 初始化阶段 ==

Caller -> ModA : init()
activate ModA
ModA -> ModB : configure()
activate ModB
ModB -> HW : reset()
HW --> ModB : OK
ModB --> ModA : configured
deactivate ModB
ModA --> Caller : ready
deactivate ModA

== 数据传输阶段 ==

Caller -> ModA : send(data)
activate ModA
ModA -> HW : write(data)
HW --> ModA : ack
ModA --> Caller : success
deactivate ModA
@enduml
```

### 流程图

```plantuml
@startuml flow_example
!theme plain
skinparam backgroundColor #FEFEFE
skinparam activityFontSize 11
skinparam defaultFontName "Microsoft YaHei"

title 核心业务流程

start

partition "初始化" #E8F5E9 {
    :系统启动;
    :加载配置;
    if (配置有效?) then (是)
        :应用配置;
    else (否)
        :使用默认配置;
    endif
}

partition "主流程" #E3F2FD {
    :等待事件;
    switch (事件类型?)
    case (类型A)
        :处理A;
    case (类型B)
        :处理B;
    case (超时)
        :超时处理;
    endswitch
}

partition "清理" #ECEFF1 {
    :释放资源;
    :记录日志;
}

stop
@enduml
```

### 状态图

```plantuml
@startuml state_example
!theme plain
skinparam backgroundColor #FEFEFE
skinparam defaultFontName "Microsoft YaHei"
skinparam defaultFontSize 11
skinparam stateFontSize 11

title 设备状态机

[*] --> 空闲 : 上电

state 空闲 #E8F5E9 : 等待指令
state 运行中 #E3F2FD : 执行任务
state 错误 #FCE4EC : 异常状态
state 暂停 #FFF3E0 : 用户暂停

空闲 --> 运行中 : 启动命令
运行中 --> 空闲 : 任务完成
运行中 --> 错误 : 发生异常
运行中 --> 暂停 : 暂停命令
暂停 --> 运行中 : 恢复命令
暂停 --> 空闲 : 取消命令
错误 --> 空闲 : 复位

@enduml
```

### 类图

```plantuml
@startuml class_example
!theme plain
skinparam backgroundColor #FEFEFE
skinparam defaultFontName "Microsoft YaHei"
skinparam defaultFontSize 11
skinparam classFontSize 12

title 数据模型

class "配置信息" as Config {
    + id : uint32_t
    + name : char[64]
    + version : uint16_t
    --
    + validate() : bool
    + serialize() : byte[]
}

class "设备信息" as Device {
    + device_id : uint32_t
    + status : DeviceStatus
    + config : Config*
    --
    + init() : int
    + reset() : void
}

enum DeviceStatus {
    IDLE
    RUNNING
    ERROR
    PAUSED
}

Device --> Config : 持有
Device --> DeviceStatus : 使用
@enduml
```

## 配色方案

| 用途 | 颜色代码 | 色名 | 适用场景 |
|------|---------|------|---------|
| 初始化/启动 | #E8F5E9 | 浅绿 | 初始化分区、启动组件 |
| 主流程/核心 | #E3F2FD | 浅蓝 | 核心流程分区、主要组件 |
| 安全/权限 | #FFF3E0 | 浅橙 | 安全相关模块、认证流程 |
| 错误/异常 | #FCE4EC | 浅红 | 异常状态、错误处理分区 |
| 可选/扩展 | #F3E5F5 | 浅紫 | 可选功能、扩展模块 |
| 系统/平台 | #ECEFF1 | 浅灰 | 底层平台、系统组件 |

## 尺寸控制

| 图表类型 | 最大参与者/节点 | 超限处理 |
|---------|---------------|---------|
| 时序图 | 参与者 ≤ 6 | 按阶段拆分多张图 |
| 流程图 | 节点 ≤ 15 | 使用partition分区 |
| 组件图 | 层次 ≤ 3 | 使用package分组 |
| 用例图 | 用例 ≤ 8 | 按子系统拆分 |
| 状态图 | 状态 ≤ 10 | 使用复合状态 |
| 类图 | 类 ≤ 8 | 按领域拆分 |
