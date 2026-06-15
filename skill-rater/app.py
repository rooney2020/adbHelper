import json
import os
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, g, send_from_directory
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = 'skill-rater-secret-key-2026'
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0


@app.after_request
def add_no_cache(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@app.before_request
def set_admin_flag():
    g.is_admin = session.get('is_admin', False)

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
RATINGS_FILE = os.path.join(DATA_DIR, 'ratings.json')

SKILLS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'skills')
SKILL_VIEWER_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'skill-viewer')

ADMIN_USER = 'admin'
ADMIN_PASSWORD_HASH = generate_password_hash('laoban1313113')

GRADING_DIR = '/home/tsdl/ssd/temp/temp/skills_competition/layer2_results'
SUMMARY_FILE = os.path.join(GRADING_DIR, '_layer2_summary.json')
FULL_DATA_FILE = os.path.join(GRADING_DIR, '_full_skill_data.json')

SKILLS = [
    {
        "id": "01",
        "name": "C/C++ 项目分析 Skill",
        "dir": "01_C_C++ 项目分析 Skill",
        "description": "从构建系统和对外接口反向解析 C/C++ 模块全貌，输出项目结构、全局执行流程图和接口详细调用流程分析。适用于 C/C++ 项目架构分析、接口分析场景。",
        "trigger": "分析C/C++项目、分析C/C++接口"
    },
    {
        "id": "02",
        "name": "Bug分析流程规范",
        "dir": "02_Bug分析流程规范",
        "description": "标准化 Android 系统级 Bug 分析流程，包含问题背景理解、日志证据化分析、因果链构建等 7 步流程。强调证据优先、范围约束、方法约束原则。",
        "trigger": "bug、defect、issue analysis、crash、不具合、崩溃、缺陷"
    },
    {
        "id": "09",
        "name": "TARA 报告生成",
        "dir": "09_TARA 报告生成 — 编排技能",
        "description": "编排完整的 TARA（威胁分析与风险评估）流程，包含资产识别、威胁场景、损害场景、攻击向量、风险值确定、网络安全目标匹配 6 个子技能。",
        "trigger": "TARA分析、威胁分析、风险评估"
    },
    {
        "id": "20",
        "name": "高级日志分析助手",
        "dir": "20_高级日志分析助手",
        "description": "车载与语音助手日志分析专用工具，标准化「拼时间线→猜根因→找历史 case→写报告」流程。支持 logcat、protobuf、trace、dialogue 等多种日志格式。",
        "trigger": "日志分析、logcat、timeline、root cause、NLU/ASR/TTS"
    },
    {
        "id": "21",
        "name": "LLM 对话数据生成",
        "dir": "21_Run generate-llm-conversation",
        "description": "基于 utterance 和 label 生成单轮/多轮指令微调（SFT）对话数据，通过 LLM 调用生成训练数据并支持导出为 CSV 格式。",
        "trigger": "生成训练数据、SFT数据、对话数据生成"
    },
    {
        "id": "23",
        "name": "Diff Impact Analysis",
        "dir": "23_Diff Impact Analysis",
        "description": "提交前防御性 diff 审查，以资深 QA 视角分析 git diff 发现回归风险、同类隐患、安全漏洞、代码质量问题及受影响测试。",
        "trigger": "diff分析、回归分析、二次不具合、code review、安全扫描"
    },
    {
        "id": "24",
        "name": "Unified Skill Finder",
        "dir": "24_Unified Skill Finder",
        "description": "跨 6 大平台（skillsmp.com、skills.sh、skills.homes、skillhub.club、claude-plugins.dev、ComposioHQ）统一搜索 200 万+ Agent Skills，聚合去重返回最优结果。",
        "trigger": "找skill、搜索skill、安装skill、skill市场"
    },
    {
        "id": "25",
        "name": "DV 老化测试 App 操作规范",
        "dir": "25_DV 老化测试 App (predv) 操作规范",
        "description": "VinFast DV 老化测试 App（predv）的编译、部署、日志分析和结果判定操作规范。包含老化标志位检查、结果存储路径等关键信息。",
        "trigger": "老化测试、AgingTestApp、aging test"
    },
    {
        "id": "83",
        "name": "Bug 效率分析仪表盘",
        "dir": "83_Bug Analysis Skill — 研发日报 Bug 效率分析",
        "description": "从飞书多维表格和 Jira 抓取数据，分析 Bug 解决和 Bug 分析两个维度的工时投入与效率，输出 Web 仪表盘（ECharts + Plotly）。",
        "trigger": "Bug仪表盘、Bug效率分析、Jira/飞书数据更新"
    },
    {
        "id": "89",
        "name": "Android 单元测试生成",
        "dir": "89_Android 单元测试生成技能",
        "description": "为 Android 项目自动生成单元测试代码，涵盖 JUnit、Mockito、MockK、Robolectric、Espresso。支持快速模式和完整模式两种生成策略。",
        "trigger": "单元测试、UT、JUnit、Mockito、Robolectric、Espresso"
    },
    {
        "id": "92",
        "name": "SELinux 规则自动适配",
        "dir": "92_SELinux规则自动适配与验证",
        "description": "T1G Android ECU 项目的 SELinux AVC 违规诊断、修补、编译、刷写和验证闭环流程。支持 Docker 本地构建和 fastboot 刷写。",
        "trigger": "SELinux、AVC denial、sepolicy、T1G"
    },
]


def load_ratings():
    if not os.path.exists(RATINGS_FILE):
        return {}
    with open(RATINGS_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_ratings(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(RATINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'username' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'username' not in session:
            return redirect(url_for('login'))
        if not session.get('is_admin', False):
            return "无权访问", 403
        return f(*args, **kwargs)
    return decorated


@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()
        if not username:
            error = '请输入用户名'
        elif username == ADMIN_USER:
            if not password:
                return render_template('login.html', error='管理员需要输入密码', show_password=True)
            if check_password_hash(ADMIN_PASSWORD_HASH, password):
                session['username'] = username
                session['is_admin'] = True
                return redirect(url_for('index'))
            else:
                error = '管理员密码错误'
        else:
            session['username'] = username
            session['is_admin'] = False
            return redirect(url_for('index'))
    return render_template('login.html', error=error, show_password=(error and 'admin' in request.form.get('username', '').lower() if request.method == 'POST' else False))


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


def load_grading_data(skill_dir):
    grading_file = os.path.join(GRADING_DIR, f'{skill_dir}_grading.json')
    if not os.path.exists(grading_file):
        return None
    with open(grading_file, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_summary_data():
    if not os.path.exists(SUMMARY_FILE):
        return {}
    with open(SUMMARY_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


_FULL_DATA_CACHE = None
def load_full_data():
    global _FULL_DATA_CACHE
    if _FULL_DATA_CACHE is not None:
        return _FULL_DATA_CACHE
    if not os.path.exists(FULL_DATA_FILE):
        return []
    with open(FULL_DATA_FILE, 'r', encoding='utf-8') as f:
        _FULL_DATA_CACHE = json.load(f)
    return _FULL_DATA_CACHE


L1_CHECK_NAMES = {
    'O1': '项目元信息',
    'O2': '目录结构',
    'O3': '文件编码',
    'F1': 'Frontmatter 存在',
    'F2': 'name 字段',
    'F3': 'description 长度',
    'F4': '触发关键词',
    'S1': '标题层级',
    'S2': '章节结构',
    'S3': '内容规模',
    'S4': '可执行内容',
    'S5': '示例代码',
    'Q1': '表述准确性',
    'Q2': '与触发关键词一致性',
    'Q3': '可读性',
}

L1_STATUS_CN = {
    'pass': '通过',
    'fail': '不通过',
    'warn': '部分',
    'partial': '部分',
}


@app.route('/api/machine-score/<skill_id>')
@login_required
def api_machine_score(skill_id):
    skill = next((s for s in SKILLS if s['id'] == skill_id), None)
    if not skill:
        return jsonify({"ok": False, "error": "Skill not found"}), 404

    full_data_list = load_full_data()
    full_data = next((d for d in full_data_list if d['skill_dir'] == skill['dir']), None)

    grading = load_grading_data(skill['dir'])
    summary_data = load_summary_data()
    summary_map = {}
    for s in summary_data.get('skills', []):
        summary_map[s['skill_dir']] = s
    summary = summary_map.get(skill['dir'], {})
    dim_scores = summary.get('dim_scores', {})

    eval_types = {
        'E1_core': '核心场景',
        'E2_variant': '变体场景',
        'E3_noise': '噪声场景',
        'E4_boundary': '边界场景',
        'E5_constraint': '约束场景',
    }

    evals_data = []
    if grading:
        for ev in grading.get('evals', []):
            evals_data.append({
                'eval_id': ev['eval_id'],
                'type': ev['type'],
                'type_name': eval_types.get(ev['type'], ev['type']),
                'with_rate': round(ev['with_skill']['pass_rate'] * 100, 1),
                'without_rate': round(ev['without_skill']['pass_rate'] * 100, 1),
                'delta': round(ev['delta'] * 100, 1),
            })

    dim_names = {
        'executability': '可执行性',
        'trigger_accuracy': '触发准确度',
        'output_compliance': '输出合规性',
        'noise_resilience': '噪声抵御力',
        'constraint_adherence': '约束遵守度',
        'incremental_value': '增量价值',
        'domain_depth': '领域深度',
        'consistency': '一致性',
        'trigger_precision': '触发精度',
        'structural_completeness': '结构完整度',
    }
    dim_data = []
    for key, info in dim_scores.items():
        dim_data.append({
            'name': dim_names.get(key, key),
            'raw': info['raw'],
            'weighted': info['weighted'],
            'weight': info['weight'],
            'pct': round(info['weighted'] / info['weight'] / 5 * 100, 1) if info['weight'] > 0 else 0,
        })

    l1_data = None
    if full_data and full_data.get('l1_checks'):
        l1_items = []
        for key, info in full_data['l1_checks'].items():
            l1_items.append({
                'code': key,
                'name': L1_CHECK_NAMES.get(key, key),
                'status': info.get('status', 'pass'),
                'status_cn': L1_STATUS_CN.get(info.get('status', 'pass'), info.get('status', 'pass')),
                'detail': info.get('detail', ''),
                'earned': info.get('earned', 0),
                'weight': info.get('weight', 0),
            })
        l1_data = {
            'score': full_data.get('l1_score', 0),
            'max': 25,
            'items': l1_items,
        }

    total_score = full_data.get('total_score') if full_data else None
    l2_total = full_data.get('l2_total') if full_data else None

    return jsonify({
        "ok": True,
        "skill": {
            "id": skill['id'],
            "name": skill['name'],
            "description": skill['description'],
        },
        "total_score": total_score,
        "l1": l1_data,
        "l2_total": l2_total,
        "grading": {
            "quality_score": round(grading['quality_score'] * 100) if grading else None,
            "avg_with_rate": round(grading['avg_with_rate'] * 100) if grading else None,
            "avg_without_rate": round(grading['avg_without_rate'] * 100) if grading else None,
            "avg_delta": round(grading['avg_delta'] * 100) if grading else None,
        } if grading else None,
        "evals": evals_data,
        "dim_data": dim_data,
        "l2_weighted": summary.get('total_weighted', 0),
        "max_possible": summary.get('max_possible', 45),
    })


@app.route('/machine-scores')
@admin_required
def machine_scores():
    grading_results = []
    summary_data = load_summary_data()
    summary_map = {}
    for s in summary_data.get('skills', []):
        summary_map[s['skill_dir']] = s

    eval_types = {
        'E1_core': '核心场景',
        'E2_variant': '变体场景',
        'E3_noise': '噪声场景',
        'E4_boundary': '边界场景',
        'E5_constraint': '约束场景',
    }

    for skill in SKILLS:
        grading = load_grading_data(skill['dir'])
        summary = summary_map.get(skill['dir'], {})
        dim_scores = summary.get('dim_scores', {})

        evals_data = []
        if grading:
            for ev in grading.get('evals', []):
                evals_data.append({
                    'eval_id': ev['eval_id'],
                    'type': ev['type'],
                    'type_name': eval_types.get(ev['type'], ev['type']),
                    'with_rate': round(ev['with_skill']['pass_rate'] * 100, 1),
                    'without_rate': round(ev['without_skill']['pass_rate'] * 100, 1),
                    'delta': round(ev['delta'] * 100, 1),
                })

        dim_data = []
        dim_names = {
            'executability': '可执行性',
            'trigger_accuracy': '触发准确度',
            'output_compliance': '输出合规性',
            'noise_resilience': '噪声抵御力',
            'constraint_adherence': '约束遵守度',
            'incremental_value': '增量价值',
            'domain_depth': '领域深度',
            'consistency': '一致性',
            'trigger_precision': '触发精度',
            'structural_completeness': '结构完整度',
        }
        for key, info in dim_scores.items():
            dim_data.append({
                'name': dim_names.get(key, key),
                'raw': info['raw'],
                'weighted': info['weighted'],
                'weight': info['weight'],
            })

        grading_results.append({
            'id': skill['id'],
            'name': skill['name'],
            'description': skill['description'],
            'grading': grading,
            'evals': evals_data,
            'dim_data': dim_data,
            'total_weighted': summary.get('total_weighted', 0),
            'max_possible': summary.get('max_possible', 45),
        })

    return render_template('machine_scores.html', results=grading_results, summary=summary_data.get('summary', {}))


@app.route('/')
@login_required
def index():
    username = session['username']
    ratings = load_ratings()
    user_ratings = ratings.get(username, {})
    return render_template('index.html', skills=SKILLS, user_ratings=user_ratings, username=username)


@app.route('/rate', methods=['POST'])
@login_required
def rate():
    username = session['username']
    skill_id = request.form.get('skill_id')
    score = request.form.get('score')

    if not skill_id or not score:
        return jsonify({"ok": False, "error": "缺少参数"}), 400

    try:
        score = int(score)
        if score < 0 or score > 100:
            return jsonify({"ok": False, "error": "评分范围 0-100"}), 400
    except ValueError:
        return jsonify({"ok": False, "error": "评分必须是数字"}), 400

    if skill_id not in [s['id'] for s in SKILLS]:
        return jsonify({"ok": False, "error": "无效的 Skill ID"}), 400

    ratings = load_ratings()
    if username not in ratings:
        ratings[username] = {}
    ratings[username][skill_id] = score
    save_ratings(ratings)

    return jsonify({"ok": True})


@app.route('/ranking')
@admin_required
def ranking():
    ratings = load_ratings()
    results = []
    for skill in SKILLS:
        per_user = []
        for username, ur in ratings.items():
            if skill['id'] in ur:
                per_user.append({"user": username, "score": ur[skill['id']]})
        scores = [p['score'] for p in per_user]
        avg = round(sum(scores) / len(scores), 2) if scores else 0
        per_user_sorted = sorted(per_user, key=lambda x: x['score'], reverse=True)
        results.append({
            "id": skill['id'],
            "name": skill['name'],
            "description": skill['description'],
            "avg_score": avg,
            "count": len(scores),
            "scores": scores,
            "per_user": per_user_sorted,
        })
    results.sort(key=lambda x: x['avg_score'], reverse=True)
    for i, r in enumerate(results):
        r['rank'] = i + 1
    return render_template('ranking.html', results=results, total_users=len(ratings))


def _resolve_skill_path(skill_id):
    skill = next((s for s in SKILLS if s['id'] == skill_id), None)
    if not skill:
        return None, None
    skill_root = os.path.join(SKILLS_DIR, skill['dir'])
    if not os.path.isdir(skill_root):
        return skill, None
    return skill, skill_root


def _list_skill_tree(root_dir, rel_prefix=''):
    nodes = []
    try:
        for entry in sorted(os.listdir(root_dir), key=lambda s: (not os.path.isdir(os.path.join(root_dir, s)), s.lower())):
            full = os.path.join(root_dir, entry)
            rel = f"{rel_prefix}/{entry}" if rel_prefix else entry
            if os.path.isdir(full):
                children = _list_skill_tree(full, rel)
                nodes.append({
                    "name": entry,
                    "path": rel,
                    "type": "directory",
                    "children": children,
                })
            else:
                try:
                    size = os.path.getsize(full)
                except OSError:
                    size = 0
                nodes.append({
                    "name": entry,
                    "path": rel,
                    "type": "file",
                    "size": size,
                })
    except PermissionError:
        pass
    return nodes


@app.route('/api/skill-tree/<skill_id>')
@login_required
def api_skill_tree(skill_id):
    skill, root = _resolve_skill_path(skill_id)
    if not skill:
        return jsonify({"ok": False, "error": "Skill not found"}), 404
    if not root:
        return jsonify({"ok": False, "error": "Skill 目录不存在: " + skill['dir']}), 404
    tree = _list_skill_tree(root)
    return jsonify({
        "ok": True,
        "skill": {"id": skill['id'], "name": skill['name'], "dir": skill['dir']},
        "tree": tree,
    })


@app.route('/api/skill-file/<skill_id>')
@login_required
def api_skill_file(skill_id):
    skill, root = _resolve_skill_path(skill_id)
    if not skill or not root:
        return jsonify({"ok": False, "error": "Skill not found"}), 404
    rel = request.args.get('path', '').lstrip('/')
    if not rel:
        return jsonify({"ok": False, "error": "缺少 path"}), 400
    full = os.path.normpath(os.path.join(root, rel))
    if not full.startswith(os.path.normpath(root)):
        return jsonify({"ok": False, "error": "非法路径"}), 400
    if not os.path.isfile(full):
        return jsonify({"ok": False, "error": "文件不存在"}), 404
    try:
        with open(full, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        with open(full, 'rb') as f:
            content = f.read().decode('utf-8', errors='replace')
    mime = 'text/plain'
    return jsonify({
        "ok": True,
        "path": rel,
        "name": os.path.basename(full),
        "size": os.path.getsize(full),
        "mime": mime,
        "content": content,
    })


@app.route('/skill-viewer/')
@app.route('/skill-viewer')
@login_required
def skill_viewer():
    return send_from_directory(SKILL_VIEWER_DIR, 'index.html')


@app.route('/skill-viewer/<path:filename>')
@login_required
def skill_viewer_assets(filename):
    return send_from_directory(SKILL_VIEWER_DIR, filename)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5080, debug=True)