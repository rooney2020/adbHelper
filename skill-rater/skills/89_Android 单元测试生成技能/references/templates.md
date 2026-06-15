# Android UT 代码模板参考

## JUnit 本地测试模板

### Java (JUnit 4)

```java
@RunWith(MockitoJUnitRunner.class)
public class XxxTest {
    @Mock private YyyRepository repository;
    @InjectMocks private XxxViewModel viewModel;

    @Before
    public void setUp() {
        // 初始化测试环境
    }

    @Test
    public void methodName_scenario_expectedBehavior() {
        // Arrange
        when(repository.getData()).thenReturn(expectedData);

        // Act
        Result result = viewModel.doSomething();

        // Assert
        assertEquals(expected, result);
        verify(repository).getData();
    }
}
```

### Kotlin (JUnit 4 + MockK)

```kotlin
class XxxViewModelTest {
    private val repository: YyyRepository = mockk()
    private val viewModel = XxxViewModel(repository)

    @Before
    fun setUp() {
        // 初始化
    }

    @Test
    fun methodName_scenario_expectedBehavior() {
        // Arrange
        every { repository.getData() } returns expectedData

        // Act
        val result = viewModel.doSomething()

        // Assert
        assertEquals(expected, result)
        verify { repository.getData() }
    }
}
```

## Robolectric 测试模板

```kotlin
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class MainActivityTest {

    @Test
    fun onCreate_displaysWelcomeMessage() {
        val activity = Robolectric.buildActivity(MainActivity::class.java)
            .create().resume().get()

        val textView = activity.findViewById<TextView>(R.id.welcomeText)
        assertEquals("Welcome", textView.text.toString())
    }
}
```

## Coroutine 测试模板

```kotlin
class DataRepositoryTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun fetchData_returnsExpectedResult() = runTest {
        val repository = DataRepository(FakeApiService())

        val result = repository.fetchData()

        assertTrue(result.isSuccess)
        assertEquals(3, result.getOrNull()?.size)
    }
}

class MainDispatcherRule(
    private val dispatcher: TestDispatcher = UnconfinedTestDispatcher()
) : TestWatcher() {
    override fun starting(description: Description) {
        Dispatchers.setMain(dispatcher)
    }
    override fun finished(description: Description) {
        Dispatchers.resetMain()
    }
}
```

## Espresso UI 测试模板

```kotlin
@RunWith(AndroidJUnit4::class)
class LoginActivityTest {
    @get:Rule
    val activityRule = ActivityScenarioRule(LoginActivity::class.java)

    @Test
    fun loginButton_withEmptyFields_showsError() {
        onView(withId(R.id.btnLogin)).perform(click())
        onView(withId(R.id.errorText)).check(matches(isDisplayed()))
    }
}
```

## Gradle 依赖配置

### L1 - JUnit 本地测试

```groovy
dependencies {
    testImplementation 'junit:junit:4.13.2'
    testImplementation 'org.mockito:mockito-core:5.11.0'
    testImplementation 'org.mockito:mockito-inline:5.2.0'
    // Kotlin
    testImplementation 'io.mockk:mockk:1.13.10'
}
```

### L2 - Instrumented 测试

```groovy
dependencies {
    androidTestImplementation 'androidx.test.ext:junit:1.1.5'
    androidTestImplementation 'androidx.test:runner:1.5.2'
    androidTestImplementation 'androidx.test:rules:1.5.0'
    androidTestImplementation 'androidx.test.espresso:espresso-core:3.5.1'
}
```

### L3 - 全栈测试

```groovy
dependencies {
    testImplementation 'org.robolectric:robolectric:4.12.1'
    testImplementation 'org.mockito:mockito-core:5.11.0'
    testImplementation 'io.mockk:mockk:1.13.10'
    testImplementation 'org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.0'
    testImplementation 'androidx.arch.core:core-testing:2.2.0'
}
```

### JaCoCo 覆盖率配置

```groovy
apply plugin: 'jacoco'

android {
    buildTypes {
        debug {
            testCoverageEnabled true
        }
    }
}

tasks.register('jacocoTestReport', JacocoReport) {
    dependsOn 'testDebugUnitTest'
    reports {
        xml.required = true
        html.required = true
    }
    def fileFilter = ['**/R.class', '**/R$*.class', '**/BuildConfig.*',
                      '**/Manifest*.*', '**/*Test*.*', '**/AutoValue_*.*']
    def mainSrc = "${project.projectDir}/src/main/java"
    sourceDirectories.setFrom(files(mainSrc))
    classDirectories.setFrom(
        fileTree(dir: "${buildDir}/intermediates/javac/debug", excludes: fileFilter)
        + fileTree(dir: "${buildDir}/tmp/kotlin-classes/debug", excludes: fileFilter))
    executionData.setFrom(
        fileTree(dir: buildDir, includes: ['jacoco/testDebugUnitTest.exec']))
}
```
