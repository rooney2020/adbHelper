"""
diff-impact-analysis: HTML 报告生成器
从 JSON 分析结果生成交互式 HTML 报告。

用法:
  python generate_report.py <analysis.json> [output_dir]

analysis.json 格式:
{
  "title": "代码变更全面审查报告",
  "branch": "main",
  "file_count": 7,
  "mode": "full",  // "standard" | "full"
  "features": [
    {"file": "Foo.java", "summary": "新增...", "function": "功能点"}
  ],
  "security": [
    {"title": "...", "severity": "high", "file": "path:L42", "desc": "...", "evidence": "...", "suggestion": "..."}
  ],
  "quality": [
    {"title": "...", "severity": "medium", "file": "path:L42", "category": "正确性", "desc": "...", "suggestion": "..."}
  ],
  "regression": [
    {"title": "...", "severity": "high", "scope": "影响范围", "desc": "...", "verification": "...", "suggestion": "..."}
  ],
  "similar": [
    {"title": "...", "severity": "medium", "location": "path", "pattern": "相似模式", "desc": "...", "suggestion": "..."}
  ],
  "test_impact": [
    {"test_file": "path/FooTest.java", "test_methods": ["method1"], "reason": "直接引用被改方法", "priority": "high", "manual_steps": ["步骤1: ...", "步骤2: ..."]}
  ]
}
"""
import json
import os
import sys
from pathlib import Path
from datetime import datetime

SCRIPT_DIR = Path(__file__).parent
ASSETS_DIR = SCRIPT_DIR.parent / "assets"
TEMPLATE_PATH = ASSETS_DIR / "report-template.html"

SEV_MAP = {"critical": "sev-c", "high": "sev-h", "medium": "sev-m", "low": "sev-l"}
SEV_LABEL = {"critical": "CRITICAL", "high": "HIGH", "medium": "MEDIUM", "low": "LOW"}


def escape_html(s):
    """基本 HTML 转义"""
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def escape_attr(s):
    """属性值转义"""
    return escape_html(str(s)).replace("'", "&#39;")


def make_fix_summary(fixes):
    """生成本轮修正摘要 HTML"""
    if not fixes:
        return ""
    rows = []
    for i, f in enumerate(fixes, 1):
        rows.append(
            f'        <tr><td>{i}</td>'
            f'<td><span class="code-tag">{escape_html(f.get("file", ""))}</span></td>'
            f'<td>{escape_html(f.get("description", ""))}</td>'
            f'<td>{escape_html(f.get("diff_summary", ""))}</td></tr>'
        )
    return f'''  <div class="card fix-summary-card">
    <div class="card-header"><h2>✅ 本轮修正摘要</h2><span class="pill pill-green">{len(fixes)} 项已修正</span></div>
    <table class="ftable">
      <thead><tr><th>#</th><th>文件</th><th>问题</th><th>修正内容</th></tr></thead>
      <tbody>
{"".join(rows)}
      </tbody>
    </table>
  </div>
'''


def make_features_rows(features):
    rows = []
    for i, f in enumerate(features, 1):
        rows.append(
            f'        <tr><td>{i}</td>'
            f'<td><span class="code-tag">{escape_html(f["file"])}</span></td>'
            f'<td>{escape_html(f["summary"])}</td>'
            f'<td>{escape_html(f["function"])}</td></tr>'
        )
    return "\n".join(rows)


def make_risk_item(item_type, index, item):
    sev = item.get("severity", "low").lower()
    sev_class = SEV_MAP.get(sev, "sev-l")
    sev_label = SEV_LABEL.get(sev, "LOW")
    item_id = f"{item_type}-{index}"

    title = escape_html(item.get("title", ""))
    desc = escape_html(item.get("desc", ""))
    file_path = escape_attr(item.get("file", item.get("location", "")))
    suggestion = escape_attr(item.get("suggestion", ""))
    data_desc = escape_attr(item.get("desc", ""))

    # 构建详情区域
    details = []
    if item.get("scope"):
        details.append(f'<p><strong>影响范围：</strong>{escape_html(item["scope"])}</p>')
    if item.get("file"):
        details.append(f'<p><strong>文件：</strong>{escape_html(item["file"])}</p>')
    if item.get("location"):
        details.append(f'<p><strong>位置：</strong>{escape_html(item["location"])}</p>')
    if item.get("category"):
        details.append(f'<p><strong>类别：</strong>{escape_html(item["category"])}</p>')
    if item.get("evidence"):
        details.append(f'<p><strong>证据：</strong>{escape_html(item["evidence"])}</p>')
    if item.get("pattern"):
        details.append(f'<p><strong>模式：</strong>{escape_html(item["pattern"])}</p>')
    details.append(f'<p><strong>说明：</strong>{desc}</p>')
    if item.get("verification"):
        details.append(f'<p><strong>验证：</strong>{escape_html(item["verification"])}</p>')

    detail_html = "\n          ".join(details)

    return f'''      <div class="risk-row">
        <div class="checkbox-wrap"><input type="checkbox" class="fix-cb" data-id="{item_id}" data-type="{item_type}" data-desc="{data_desc}" data-file="{file_path}" data-suggestion="{suggestion}"></div>
        <div class="risk-body">
          <div class="risk-title-row"><span class="risk-name">{title}</span><span class="sev {sev_class}">{sev_label}</span></div>
          <div class="risk-desc">
          {detail_html}
          </div>
        </div>
        <div class="dismiss-wrap"><button class="btn-dismiss" data-id="{item_id}" title="忽略此项">忽略</button></div>
      </div>'''


def make_section(section_type, emoji, label, items):
    if not items:
        return ""
    pill_color = {
        "security": "pill-purple",
        "quality": "pill-orange",
        "regression": "pill-red",
        "similar": "pill-orange",
    }.get(section_type, "pill-blue")

    item_html = "\n".join(
        make_risk_item(section_type, i, item) for i, item in enumerate(items, 1)
    )

    return f'''  <div class="card">
    <div class="card-header"><h2>{emoji} {label}</h2><span class="pill {pill_color}">{len(items)} 项</span></div>
    <div class="risk-list" id="{section_type}-list">
{item_html}
    </div>
  </div>
'''


def make_test_impact_section(test_impacts):
    """生成受影响测试用例 HTML section"""
    if not test_impacts:
        return ""
    rows = []
    prio_badge = {
        "high": '<span class="sev sev-h">HIGH</span>',
        "medium": '<span class="sev sev-m">MEDIUM</span>',
        "low": '<span class="sev sev-l">LOW</span>',
    }
    for i, t in enumerate(test_impacts, 1):
        test_file = escape_html(t.get("test_file", ""))
        methods = t.get("test_methods", [])
        methods_html = ", ".join(f'<code>{escape_html(m)}</code>' for m in methods) if methods else "<em>整个测试类</em>"
        reason = escape_html(t.get("reason", ""))
        priority = t.get("priority", "medium").lower()
        badge = prio_badge.get(priority, prio_badge["medium"])
        # 测试手顺
        manual_steps = t.get("manual_steps", [])
        if manual_steps:
            steps_html = '<ol class="manual-steps">' + "".join(f'<li>{escape_html(s)}</li>' for s in manual_steps) + '</ol>'
        else:
            steps_html = '<em class="no-steps">—</em>'
        rows.append(
            f'        <tr><td>{i}</td>'
            f'<td><span class="code-tag">{test_file}</span></td>'
            f'<td>{methods_html}</td>'
            f'<td>{reason}</td>'
            f'<td>{badge}</td>'
            f'<td>{steps_html}</td></tr>'
        )
    return f'''  <div class="card">
    <div class="card-header"><h2>🧪 受影响测试用例</h2><span class="pill pill-blue">{len(test_impacts)} 项</span></div>
    <table class="ftable">
      <thead><tr><th>#</th><th>测试文件</th><th>受影响方法</th><th>原因</th><th>优先级</th><th>测试手顺</th></tr></thead>
      <tbody>
{"".join(rows)}
      </tbody>
    </table>
  </div>
'''


def generate_report(data, output_path):
    """从分析数据生成完整 HTML 报告"""
    title = data.get("title", "代码变更影响分析报告")
    branch = data.get("branch", "unknown")
    commit = data.get("commit", "unknown")
    file_count = data.get("file_count", 0)
    mode = data.get("mode", "standard")
    mode_label = "完整模式" if mode == "full" else "标准模式"

    features = data.get("features", [])
    fix_summary = data.get("fix_summary", [])
    security = data.get("security", []) if mode == "full" else []
    quality = data.get("quality", []) if mode == "full" else []
    regression = data.get("regression", [])
    similar = data.get("similar", [])
    test_impact = data.get("test_impact", [])

    # 功能表
    features_html = make_features_rows(features)

    # 修正摘要
    fix_summary_html = make_fix_summary(fix_summary)

    # 各 section
    security_html = make_section("security", "🛡️", "安全漏洞分析", security)
    quality_html = make_section("quality", "🔧", "代码质量问题", quality)
    regression_html = make_section("regression", "⚠️", "二次不具合（回归风险）", regression)
    similar_html = make_section("similar", "🔍", "類似不具合（同类隐患）", similar)
    test_impact_html = make_test_impact_section(test_impact)

    # 读取外部 CSS/JS 资源（注入为内联，保持报告自包含）
    css_text = (ASSETS_DIR / "report-styles.css").read_text(encoding="utf-8")
    js_text = (ASSETS_DIR / "report-scripts.js").read_text(encoding="utf-8")

    html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{escape_html(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+SC:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
{css_text}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>{escape_html(title)}</h1>
    <div class="header-meta">
      <span>{escape_html(branch)}</span>
      <span>{file_count} 文件变更</span>
      <span>{mode_label}</span>
    </div>
  </div>

{fix_summary_html}  <div class="card">
    <div class="card-header"><h2>📋 修改内容与实现功能</h2><span class="pill pill-blue">{len(features)} 项</span></div>
    <table class="ftable">
      <thead><tr><th>#</th><th>文件</th><th>概要</th><th>功能</th></tr></thead>
      <tbody>
{features_html}
      </tbody>
    </table>
  </div>

{security_html}{quality_html}{regression_html}{similar_html}{test_impact_html}</div>

<div class="action-footer">
  <span class="stat">已选 <strong id="count">0</strong> 项</span>
  <button class="btn btn-outline" onclick="selectAll()">全选</button>
  <button class="btn btn-outline" onclick="clearAll()">清除</button>
  <button class="btn btn-filled" onclick="submitFixes()">提交修正 →</button>
</div>
<div class="toast" id="toast"></div>

<script>
const SERVER = 'http://127.0.0.1:9517';
const COMMIT = '{escape_attr(commit)}';
{js_text}
</script>
</body>
</html>'''

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding="utf-8")
    print(f"[GENERATED] {output_path}")
    return str(output_path)


def main():
    if len(sys.argv) < 2:
        print("用法: python generate_report.py <analysis.json> [output_dir]")
        print("  analysis.json: 分析结果 JSON 文件路径")
        print("  output_dir: 输出目录（默认为 JSON 同目录）")
        sys.exit(1)

    json_path = Path(sys.argv[1])
    if not json_path.exists():
        print(f"[ERROR] 文件不存在: {json_path}")
        sys.exit(1)

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    output_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else json_path.parent
    output_path = output_dir / "diff-impact-report.html"

    generate_report(data, output_path)


if __name__ == "__main__":
    main()
