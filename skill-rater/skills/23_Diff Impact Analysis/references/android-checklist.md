# Android 特化安全与质量检查清单

> 此文件由 SKILL.md 在完整模式下引用（Android 项目时自动追加）。
> 适用于 Android 车载 HMI、AIDL 服务、系统级应用等场景。

## 适用判断

当项目满足以下任一条件时，追加本清单：
- `build.gradle` 含 `com.android.application` 或 `com.android.library`
- 存在 `AndroidManifest.xml`
- 包含 AIDL 文件或 Binder 调用

---

## 一、组件暴露检查

| 检查项 | 关注点 |
|--------|--------|
| **exported 组件** | Activity/Service/Receiver/Provider 的 `exported=true` 是否有 `permission` 保护 |
| **隐式 Intent** | 发送隐式 Intent 时是否泄漏敏感 extras |
| **PendingIntent** | 是否使用 `FLAG_IMMUTABLE`/`FLAG_MUTABLE` 正确标志；目标是否明确 |
| **ContentProvider** | `grantUriPermissions` 范围是否过大；SQL 查询是否参数化 |
| **DeepLink/Scheme** | 自定义 scheme 的处理是否验证来源和参数合法性 |

---

## 二、AIDL / Binder 检查

| 检查项 | 关注点 |
|--------|--------|
| **权限校验** | AIDL 接口方法是否在实现端校验 `Binder.getCallingUid()` / `checkCallingPermission()` |
| **参数校验** | Binder 回调参数是否验证边界（enum 范围、数组长度、null） |
| **死亡通知** | 跨进程持有远程 Binder 是否注册 `DeathRecipient` |
| **线程安全** | AIDL 方法默认在 Binder 线程池执行，共享状态是否加锁 |
| **Parcel 异常** | 读取 Parcel 数据时是否处理 `BadParcelableException` |

---

## 三、车载 / 系统应用特化

| 检查项 | 关注点 |
|--------|--------|
| **CAN 信号边界** | 车辆属性值是否验证范围（如档位 0-6、速度 0-255） |
| **CarPropertyManager** | 注册/注销是否配对；回调中是否做线程切换 |
| **VehicleHal 超时** | HAL 调用是否设置超时；超时后 UI 是否有降级处理 |
| **系统权限** | `android:sharedUserId` 应用是否最小化权限声明 |
| **SELinux** | 新增文件/socket 是否需要对应 sepolicy 规则 |

---

## 四、生命周期与内存

| 检查项 | 关注点 |
|--------|--------|
| **Activity 泄漏** | 异步回调/Handler 是否持有 Activity 强引用 |
| **Service 生命周期** | `startService` 是否有对应 `stopSelf`；`bindService` 是否在正确时机 unbind |
| **单例持有 Context** | 单例是否持有 Activity Context（应用 Application Context） |
| **LiveData 观察** | observe() 的 LifecycleOwner 是否正确（Fragment 中用 viewLifecycleOwner） |
| **Handler 泄漏** | 非静态内部类 Handler 是否会阻止外部类 GC |
| **Bitmap/资源释放** | 大图/动画是否在不可见时释放 |

---

## 五、线程与并发

| 检查项 | 关注点 |
|--------|--------|
| **主线程阻塞** | 耗时操作（IO/网络/数据库）是否在后台线程 |
| **ANR 风险** | BroadcastReceiver.onReceive() 中是否有耗时逻辑（>10s） |
| **共享状态** | 多线程访问的字段是否用 synchronized/volatile/AtomicXxx |
| **线程池管理** | 是否创建了无界线程池（`newCachedThreadPool` 风险） |
| **Handler 线程** | postDelayed 的 Runnable 在 Activity 销毁后是否移除 |

---

## 六、数据与存储

| 检查项 | 关注点 |
|--------|--------|
| **SharedPreferences** | 是否使用 `MODE_PRIVATE`；是否在主线程 commit（应用 apply） |
| **数据库迁移** | Room/SQLite schema 变更是否提供 Migration |
| **文件路径** | 外部存储路径是否处理 `null`（权限被拒时 getExternalFilesDir 返回 null） |
| **序列化** | Parcelable/Serializable 版本兼容性（新增字段是否有默认值） |

---

## 七、UI 与显示（车载 HMI）

| 检查项 | 关注点 |
|--------|--------|
| **显示区域** | 多显示器/多区域场景下 View 是否绑定正确的 Display |
| **触摸安全** | 驾驶中是否正确限制交互（按车速/档位） |
| **弹窗优先级** | 多个弹窗并发时优先级和互斥逻辑是否正确 |
| **动画性能** | 帧率是否满足 60fps；是否避免 onDraw 中分配对象 |
| **暗主题/日夜切换** | 是否正确响应 uiMode 变化 |

---

## 验证原则

与通用安全清单相同：
1. 发现潜在问题后先搜索是否已在基类/框架层处理
2. 无法确认时降级为 Medium/Low 并注明原因
3. 车载特有问题必须结合具体车辆属性值范围判断
