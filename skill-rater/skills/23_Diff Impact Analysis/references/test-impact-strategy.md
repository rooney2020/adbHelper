# 测试影响分析策略

> 从 SKILL.md 拆出的详细测试搜索方法。仅在项目测试结构复杂时按需加载。

## 搜索方法（按优先级）

### 1. 命名约定
被改类 `Foo` → 搜索：
- `FooTest`
- `FooSpec`
- `FooInstrumentedTest`
- `FooUnitTest`

### 2. 符号引用
对改动的 public 方法用 `vscode_listCodeUsages`，过滤 `test/` 和 `androidTest/` 目录下的引用。

### 3. Import 搜索
```
grep_search: "import.*被改类的全限定名"
includePattern: "**/test/**" 或 "**/androidTest/**"
```

### 4. 间接影响
如果被改类被其他类聚合/继承：
1. 找到所有使用方（vscode_listCodeUsages）
2. 对每个使用方递归执行步骤 1-3
3. 标记为 `priority: low`（间接引用）

## 输出格式

每个受影响测试列出：
- `test_file`: 测试类路径（无自动化测试时填 "⚠ 无已有测试覆盖"）
- `test_methods`: 受影响的具体测试方法（可选，粒度够时列出）
- `reason`: 为什么受影响（引用了被改方法 / 测试被改类 / 间接依赖）
- `priority`: high（直接测试被改方法） / medium（测试被改类其他方法） / low（间接引用）
- `manual_steps`: 人工测试手顺（列出验证该功能的具体操作步骤，供 QA 或开发者手动执行）

## 注意事项

- 仅列已存在的测试文件，不生成新测试
- 如果项目中无对应测试，在报告中注明 "⚠ 无已有测试覆盖"
- 标注 manual_steps 供 QA 手动验证
