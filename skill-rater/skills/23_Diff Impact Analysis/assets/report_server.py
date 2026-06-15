"""
diff-impact-analysis: 本地反馈服务器
启动后在 localhost:9517 提供:
  GET  /           → 302 重定向到报告
  GET  /report     → 返回当前报告 HTML
  POST /submit     → 接收用户选择，写入 fix-selections.json
  GET  /status     → 返回当前是否有待处理的提交

用法: python report_server.py [报告路径] [输出目录]
"""
import http.server
import json
import os
import sys
import threading
import webbrowser
from urllib.parse import urlparse

PORT = 9517
report_path = ""
output_dir = ""
submission_event = threading.Event()


class FeedbackHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # 静默日志

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_HEAD(self):
        path = urlparse(self.path).path
        if path == "/" or path == "/report":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self._cors_headers()
            self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/" or path == "/report":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self._cors_headers()
            self.end_headers()
            with open(report_path, "r", encoding="utf-8") as f:
                self.wfile.write(f.read().encode("utf-8"))
        elif path == "/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._cors_headers()
            self.end_headers()
            flag = os.path.join(output_dir, "fix-selections.json")
            status = {"submitted": os.path.exists(flag)}
            self.wfile.write(json.dumps(status).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/submit":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
                out_file = os.path.join(output_dir, "fix-selections.json")
                with open(out_file, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self._cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
                submission_event.set()
                print(f"[SUBMITTED] fix-selections.json written to {out_file}")
            except Exception as e:
                self.send_response(400)
                self._cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()


def main():
    global report_path, output_dir
    report_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.getcwd(), "build", "reports", "diff-impact-report.html"
    )
    output_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.getcwd(), "build", "reports"
    )

    if not os.path.exists(report_path):
        print(f"[ERROR] Report not found: {report_path}")
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    # 清除旧的提交文件
    old_file = os.path.join(output_dir, "fix-selections.json")
    if os.path.exists(old_file):
        os.remove(old_file)

    server = http.server.HTTPServer(("127.0.0.1", PORT), FeedbackHandler)
    print(f"[SERVER] http://127.0.0.1:{PORT}")
    print(f"[SERVER] Report: {report_path}")
    print(f"[SERVER] Output: {output_dir}")
    print("[SERVER] Waiting for user submission...")

    # 自动打开浏览器
    webbrowser.open(f"http://127.0.0.1:{PORT}/report")

    # 启动服务
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    # 等待提交
    submission_event.wait()
    print("[DONE] User submitted selections. Server shutting down.")
    server.shutdown()


if __name__ == "__main__":
    main()
