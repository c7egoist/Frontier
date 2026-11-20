#!/usr/bin/env python3
"""Preview server for the World Inspector on 0.0.0.0 (default port 8103).

Serves the repository root with no-store caching (edits show on reload); / redirects into the editor.  Usage: python3 Experimental/WorldInspector/Serve.py [port]
"""
import functools
import http.server
import pathlib
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript", ".facet": "application/octet-stream"}

    def redirect_root(self):
        if self.path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/Experimental/WorldInspector/")
            self.end_headers()
            return True
        return False

    def do_GET(self):
        if not self.redirect_root():
            super().do_GET()

    def do_HEAD(self):
        if not self.redirect_root():
            super().do_HEAD()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8103
    root = pathlib.Path(__file__).resolve().parents[2]
    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), functools.partial(Handler, directory=str(root)))
    print(f"World Inspector on http://0.0.0.0:{port}/", flush=True)
    server.serve_forever()
