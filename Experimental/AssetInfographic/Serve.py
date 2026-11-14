#!/usr/bin/env python3
"""Standalone HTTP preview server for the Experimental Asset Infographic on 0.0.0.0:8094."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os


class AssetInfographicRequestResponder(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript", ".woff2": "font/woff2"}

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/Experimental/AssetInfographic/")
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format, *args):
        if os.environ.get("ASSET_INFOGRAPHIC_QUIET") != "1":
            super().log_message(format, *args)


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    port = int(os.environ.get("PORT", "8094"))
    responder = partial(AssetInfographicRequestResponder, directory=str(root))
    server = ThreadingHTTPServer(("0.0.0.0", port), responder)
    print(f"Asset Infographic serving {root} on http://0.0.0.0:{port}/", flush=True)
    server.serve_forever()
