# 本地预览用：把 index.html 包进和 claude.ai 发布时一样的页面骨架，其它文件原样提供。
import http.server, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SKELETON = ('<!doctype html><html><head><meta charset=utf8>'
            '<meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<style>:root{color-scheme:light;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}'
            'body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>'
            '</head><body>')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_GET(self):
        if self.path.split("?")[0] in ("/", "/index.html"):
            page = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
            if os.path.exists(os.path.join(ROOT, "private", "character.js")):  # 自己的人物（不进 git）
                page = page.replace('<script src="js/skilldata.js"></script>', '<script src="js/skilldata.js"></script>\n<script src="private/character.js"></script>')
            body = (SKELETON + page + "</body></html>").encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        # private/ 里有同名文件（自己的人物图、风格图）就优先用它
        p = self.path.split("?")[0].lstrip("/")
        if p.startswith("img/") and os.path.exists(os.path.join(ROOT, "private", p)):
            self.path = "/private/" + p
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 4877
http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
