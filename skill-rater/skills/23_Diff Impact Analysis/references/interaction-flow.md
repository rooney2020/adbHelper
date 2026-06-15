# 交互闭环流程

> 从 SKILL.md 拆出的详细交互流程。主文件通过引用加载。

## 报告生成

将分析结果组织为 JSON，调用生成脚本：

```powershell
python "{baseDir}/scripts/generate_report.py" "<analysis.json>" "<output_dir>"
```

analysis.json 结构详见 `scripts/generate_report.py` 文件头注释。

也可直接生成完整 HTML（脚本不可用时），参考 `assets/report-template.html` 的样式结构。

## 交互闭环

```
git diff → 分析 → 生成报告 → 启动服务器 → 用户浏览器选择 → AI感知提交 → AI 修正 → 循环
```

1. 生成报告 HTML（过滤 `build/reports/dismissed-items.json` 中**同一 commit** 已忽略的项，不同提交的忽略记录互不影响）
2. 启动服务器（异步模式）：
   ```powershell
   python "{baseDir}/assets/report_server.py" "<报告路径>" "<输出目录>"
   ```
3. **等待用户浏览器操作**（分级策略，按优先级选择）：
   - **优先**：若 `interactive_feedback` 工具可用 → 立即调用，预设选项 `["已在浏览器中提交", "取消"]`
   - **其次**：若环境支持 async terminal exit 通知 → 静默等待终端退出通知
   - **兜底**：告知用户"浏览器操作完成后，请回到对话框说'已提交'"
4. 读取 `build/reports/fix-selections.json`：
   - dismissed → 追加到 `dismissed-items.json`（必须附带 `commit` 字段，格式：`{"id":"...", "commit":"<hash>", "description":"...", "dismissedAt":"..."}`)
   - selections → 按 suggestion 逐一修正代码
   - 注意：忽略记录仅在同一 commit 的后续循环中生效，切换到其他提交分析时不过滤
5. 修正后重新 `git diff` → 分析 → 生成新报告（analysis.json 中加入 `fix_summary` 字段）→ 重启服务器 → 浏览器通过 pollForNewReport 自动刷新

## 降级

服务器无法启动（端口占用等）→ 降级为文件模式，用户说"提交了"触发下一步。
