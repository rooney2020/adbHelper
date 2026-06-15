# 实战经验模式库

> 此文件包含从真实项目提炼的 Android UT 覆盖率提升模式。
> 按 **被测代码类型** 分类，每种类型包含：根因分析 + 解决方案 + 代码模板。

---

## 一、通用陷阱清单

| # | 陷阱 | 现象 | 解法 |
|---|------|------|------|
| 1 | getter/setter 命名不对称 | `getPlanningPath()` 是别名，setter 只有 `setPlanningPoints()` → 编译失败 | 生成测试前用 grep 确认精确方法名，不要从 getter 推断 |
| 2 | SDK 单例依赖 Context 链 | `KanziManager.getInstance(context)` 当 context=null 抛 NPE | 必须构建完整 mock 链：`View → getContext() → getApplicationContext()` |
| 3 | 单例类需要反射重置 | 测试间状态泄漏 | `@Before` 中 `Field.set(null, null)` 重置 `sInstance` |
| 4 | `returnDefaultValues = true` 隐患 | Mock View 的 `getContext()` 返回 null 而非 mock | 对链式调用必须显式 `when().thenReturn()` |
| 5 | 大型 switch-case 状态机 | 2158行/330+分支 | 系统化：state × event = 一个测试方法 |
| 6 | 方法依赖内部状态 | 假设返回 true 但实际依赖 `isStarted()` | 阅读实现，不要猜返回值 |
| 7 | 私有死代码 | `checkState()` 是 private 且无调用者 | 识别后跳过 |
| 8 | Robolectric 与车载 SDK 不兼容 | `PackageParserException` | 改用 `returnDefaultValues = true` + `mockito-inline` |

---

## 二、Widget/View 层模式

来自实际将 widget 包覆盖率从 53%/70% 提升到 73%/91% 的经验。

### 模式 1: CALLS_REAL_METHODS + 反射注入

```java
mView = mock(AlarmPopupView.class, withSettings().defaultAnswer(CALLS_REAL_METHODS));
when(mView.getContext()).thenReturn(mMockContext);
setField(mView, "mBinding", mockBinding);
setField(mView, "mainHandler", mockHandler);
```

**适用**: 被测类继承 View/LinearLayout，无法直接 new。

### 模式 2: 层级遍历 findField

```java
private Field findField(Class<?> clazz, String fieldName) throws NoSuchFieldException {
    while (clazz != null) {
        try { return clazz.getDeclaredField(fieldName); }
        catch (NoSuchFieldException e) { clazz = clazz.getSuperclass(); }
    }
    throw new NoSuchFieldException(fieldName);
}
```

**原因**: CALLS_REAL_METHODS mock 的 `getClass()` 返回代理子类，字段在父类。

### 模式 3: MockedStatic 测试 private init()

```java
try (MockedStatic<LayoutInflater> mockedInflater = mockStatic(LayoutInflater.class);
     MockedStatic<LargePopupViewBinding> mockedBinding = mockStatic(LargePopupViewBinding.class)) {
    mockedInflater.when(() -> LayoutInflater.from(any())).thenReturn(mockInflater);
    mockedBinding.when(() -> LargePopupViewBinding.inflate(any(), any())).thenReturn(mockBindingInst);
    Method init = TargetView.class.getDeclaredMethod("init", Context.class);
    init.setAccessible(true);
    init.invoke(mView, mMockContext);
}
```

**收益**: init() 通常 +10-20% 覆盖率。

### 模式 4: ArgumentCaptor 捕获 OnClickListener

```java
ArgumentCaptor<View.OnClickListener> captor = ArgumentCaptor.forClass(View.OnClickListener.class);
verify(mockButton).setOnClickListener(captor.capture());
View mockClickView = mock(View.class);
when(mockClickView.getId()).thenReturn(R.id.target_button);
captor.getValue().onClick(mockClickView);
verify(mockPresenter).doAction();
```

### 模式 5: CountDownTimer 匿名内部类

```java
Method initTimer = AlarmPopupView.class.getDeclaredMethod("initTimer");
initTimer.setAccessible(true);
initTimer.invoke(mView);
Field timerField = AlarmPopupView.class.getDeclaredField("mCountDownTimer");
timerField.setAccessible(true);
CountDownTimer timer = (CountDownTimer) timerField.get(mView);
timer.onTick(5000L);
timer.onFinish();
```

**收益**: 匿名内部类通常 +5-15%。

### 模式 6: InstantTaskExecutorRule + LiveData Observer

```java
@Rule
public InstantTaskExecutorRule instantRule = new InstantTaskExecutorRule();

MutableLiveData<Boolean> liveData = new MutableLiveData<>();
when(mockViewModel.getIsCountDownActive()).thenReturn(liveData);
method.invoke(mView); // initObservers()
liveData.setValue(true);   // true 分支
liveData.setValue(false);  // false 分支
```

### 模式 7: ViewBinding public final 字段注入

```java
private void setBindingField(Object binding, String fieldName, Object value) throws Exception {
    Field field = findField(binding.getClass(), fieldName);
    field.setAccessible(true);
    field.set(binding, value);
}
```

### 覆盖率提升优先级（Widget 层）

| 优先级 | 目标 | 典型收益 | 方法 |
|--------|------|----------|------|
| P0 | 匿名内部类 | +10-15% | 反射获取+直接调用 |
| P1 | private init() | +5-10% | MockedStatic + 反射调用 |
| P2 | Builder.build() | +3-5% | MockedStatic<ViewBinding> |
| P3 | switch-case 分支 | +5-10% | 每 case 一测试 |
| P4 | OnClickListener | +3-5% | ArgumentCaptor |

---

## 三、Manager/Service 层模式

来自 6 个 Manager 类共 136 个测试方法的实践。

### 覆盖率低根因

| # | 根因 | 说明 |
|---|------|------|
| 1 | 字段初始化器调用静态上下文 | `List.of(getString(R.string.xxx))` 类加载时执行，mock 必须在单例创建前就绪 |
| 2 | DataBinding `public final` 字段 | mock ViewModel 的 `mApsDisplayMode` 为 null，需反射注入 |
| 3 | WindowManager/View 深度耦合 | 纯 JVM 只能验证守卫分支 |
| 4 | Builder 链式调用 | `new Builder().setX().build()` 需 MockedConstruction |
| 5 | AIDL RemoteException | 正常路径不抛，需 doThrow 模拟 IPC 失败 |
| 6 | Stub.asInterface() 静态方法 | 需 MockedStatic 拦截 |
| 7 | 方法内部直接 new 对象 | 纯 JVM 不可执行 |
| 8 | WeakReference + GC | 需要触发垃圾回收 |

### 模式 A: 字段初始化器 → @BeforeClass 前置 MockedStatic

```java
private static MockedStatic<AdasApplication> sMockedApp;

@BeforeClass
public static void setupClass() {
    sMockedApp = mockStatic(AdasApplication.class);
    Context mockCtx = mock(Context.class);
    when(mockCtx.getString(anyInt())).thenReturn("test");
    when(mockCtx.getSystemService(anyString())).thenReturn(mock(WindowManager.class));
    sMockedApp.when(AdasApplication::getContext).thenReturn(mockCtx);
}

@AfterClass
public static void tearDownClass() { sMockedApp.close(); }
```

**关键**: `@BeforeClass` 而非 `@Before`，确保 mock 在类加载前就绪。

### 模式 B: public final DataBinding 字段 → 反射绕过

```java
ApsViewModel mockVm = mock(ApsViewModel.class);
Field displayModeField = ApsViewModel.class.getDeclaredField("mApsDisplayMode");
displayModeField.setAccessible(true);
displayModeField.set(mockVm, new ObservableInt());
```

**注意**: 对 mock 对象有效（字段未被 JVM 内联），对真实对象 Java 11+ 不可靠。

### 模式 C: Builder 链 → MockedConstruction

```java
try (MockedConstruction<CustomPopupImpl.Builder> mockedBuilder =
        mockConstruction(CustomPopupImpl.Builder.class, (mock, ctx) -> {
            when(mock.setTitle(anyString())).thenReturn(mock);
            when(mock.setContent(anyString())).thenReturn(mock);
            when(mock.build()).thenReturn(mock(CustomPopupImpl.class));
        })) {
    manager.showApsPopupToast(dialogType, data);
}
```

### 模式 D: AIDL Stub.asInterface → MockedStatic

```java
try (MockedStatic<ITelopManager.Stub> mockedStub = mockStatic(ITelopManager.Stub.class)) {
    ITelopManager mockManager = mock(ITelopManager.class);
    mockedStub.when(() -> ITelopManager.Stub.asInterface(any())).thenReturn(mockManager);
    IBinder mockBinder = mock(IBinder.class);
    serviceConnection.onServiceConnected(new ComponentName("pkg", "cls"), mockBinder);
    verify(mockBinder).linkToDeath(any(), eq(0));
}
```

### 模式 E: RemoteException catch 分支

```java
IBinder mockBinder = mock(IBinder.class);
doThrow(new RemoteException()).when(mockBinder).linkToDeath(any(), anyInt());
serviceConnection.onServiceConnected(new ComponentName("pkg", "cls"), mockBinder);
// 验证不崩溃
```

### 模式 F: 只测守卫分支、放弃 UI 内部细节

```java
// ✅ 测守卫条件
setField("mIsShowing", true);
manager.show();
// 验证 WindowManager.addView() 未被调用

// ❌ 不测 show() 完整路径（留给 Instrumentation）
```

### 覆盖率提升优先级（Manager 层）

| 优先级 | 目标 | 典型收益 | 方法 |
|--------|------|----------|------|
| P0 | null guard / early return | +15-25% | 传 null + mock 字段为 null |
| P1 | switch-case 枚举 | +10-20% | 每 case 值一个测试 |
| P2 | RemoteException catch | +5-10% | doThrow |
| P3 | DCL B3 竞态 | +2-5% | 多线程 + CountDownLatch |
| P4 | UI 完整路径 | 视情况 | Robolectric / Instrumentation |

---

## 四、Room/数据库层模式

### 覆盖率低根因

| 根因 | 影响 | 不可测原因 |
|------|------|-----------|
| Room `*_Impl` 生成类 | 大量 missed branches | 需真实 SQLite |
| DCL B3 并发分支 | 1 branch | 需锁竞争时序 |
| final 字段注入 | 异步 verify 失败 | JVM 可能缓存 final 值 |
| MockedStatic 线程作用域 | 多线程不可见 | 仅对创建线程生效 |

### 模式: DCL B3 并发测试

```java
@Test
public void getInstance_B3_innerNullFalse() throws Exception {
    resetSingleton();
    Object expected = mock(TargetClass.class);
    CountDownLatch lockAcquired = new CountDownLatch(1);
    Thread threadA = new Thread(() -> {
        synchronized (TargetClass.class) {
            lockAcquired.countDown();
            try {
                Thread.sleep(200);
                Field f = TargetClass.class.getDeclaredField("sInstance");
                f.setAccessible(true);
                f.set(null, expected);
            } catch (Exception e) { throw new RuntimeException(e); }
        }
    });
    threadA.start();
    assertTrue(lockAcquired.await(2, TimeUnit.SECONDS));
    assertSame(expected, TargetClass.getInstance(mockContext));
    threadA.join(2000);
}
```

### 模式: final 字段 + 异步 Executor

```java
// ✅ 方案 A：获取真实 Executor → shutdown → awaitTermination
Field exeField = Repo.class.getDeclaredField("mExecutor");
exeField.setAccessible(true);
ExecutorService realExe = (ExecutorService) exeField.get(repo);
repo.insert(entity);
realExe.shutdown();
assertTrue(realExe.awaitTermination(2, TimeUnit.SECONDS));
verify(dao).insert(entity);

// ✅ 方案 B：CALLS_REAL_METHODS mock 跳过构造函数
Repo repo = mock(Repo.class, withSettings().defaultAnswer(CALLS_REAL_METHODS));
injectField(repo, "mExecutor", syncExecutor);
```

### Room 生成代码排除

```groovy
def fileFilter = ['**/*_Impl*.*', '**/*_Impl$*.*']
```

---

## 五、Common/工具层模式

### 短路条件 `&&`/`||` 必须补全组合

```java
// `if (a && b)` 需要至少三种输入（JaCoCo 按短路路径计分）：
target.method(true, nonNull);   // true + true
target.method(false, null);     // false + short-circuit
target.method(true, null);      // true + false  ← 常漏
```

### 结构性不可达分支 → 明确标注，不要伪造

```java
// getHandler() 正常必返回非 null → false 分支不可达
// 处理：覆盖 true 分支即可，在报告中标注 dead branch
```

### 常量 holder 类 → 显式实例化

```java
@Test
public void nestedConstantHolders_canBeInstantiated() {
    new AdasConstants.CONFIG();
    new AdasConstants.FUNCTION_MODE();
}
```

### LifecycleOwner 测试 → 必须 Robolectric

只要触发 `LifecycleRegistry` 状态迁移，就用 Robolectric 而非 plain JVM。

---

## 六、JaCoCo 配置经验

```groovy
// ✅ 正确配置位置
android {
    testOptions {
        unitTests.returnDefaultValues = true
        unitTests.all {
            jacoco {
                includeNoLocationClasses = true
                excludes = ['jdk.internal.*']
            }
        }
    }
}

// exec 文件路径
executionData.setFrom(fileTree(dir: buildDir, includes: ['jacoco/testDebugUnitTest.exec']))

// classes 路径
def classesDir = "${buildDir}/intermediates/javac/debug/compileDebugJavaWithJavac/classes"
```

### 聚合报告

```groovy
// ✅ 显式列出模块
dependsOn ':app:testDebugUnitTest', ':domain:testDebugUnitTest'

// ❌ 不要遍历 subprojects（触发时序问题）
```

### 报告前必须跑全量

```bash
# ⚠️ --tests 定向执行会覆盖 exec 数据
# 生成最终报告前必须重跑全量测试
./gradlew :app:cleanTestDebugUnitTest :app:testDebugUnitTest :app:jacocoTestReport
```

---

## 七、反射使用边界原则

> **CRITICAL**: 反射只能「重置/注入依赖状态」，不能「伪造被测代码路径」。

| ✅ 正确 | ❌ 错误 |
|---------|---------|
| 重置单例 `sInstance = null` | 修改被测方法中间变量 |
| 注入 mock 依赖 | 跳过 init() 直接设置状态 |
| 获取匿名内部类并调用回调 | 伪造从未产生的数据组合 |
| 调用 private 方法触发真实路径 | 绕过校验逻辑 |

**判断标准**: 反射后，被测代码的真实逻辑路径是否被完整执行？
