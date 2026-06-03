#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from import_bets import build_data  # noqa: E402


class BolaoHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        if self.path == "/api/import-bets":
            self.import_bets()
            return
        self.send_error(404, "Endpoint não encontrado")

    def import_bets(self):
        try:
            data = build_data(ROOT / "apostas")
            output = ROOT / "data" / "bolao-data.js"
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(
                "window.BOLAO_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n",
                encoding="utf-8",
            )
            self.respond_json({"ok": True, "data": data})
        except Exception as exc:
            self.respond_json({"ok": False, "error": str(exc)}, status=500)

    def respond_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 8000), BolaoHandler)
    print("Dashboard do bolão em http://127.0.0.1:8000/index.html")
    print("Use Ctrl+C para parar.")
    server.serve_forever()


if __name__ == "__main__":
    main()
