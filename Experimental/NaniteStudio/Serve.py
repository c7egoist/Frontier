#!/usr/bin/env python3
"""
🧩 Nanite Virtual Geometry Studio Preview Server (Project Zero UI)
Binds to 0.0.0.0 on port 8098 (or argv[1]) with correct MIME types for ESM, WOFF2, and CSS.
"""
import functools
import http.server
import os
import sys

class StudioHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.woff2': 'font/woff2',
        '.svg': 'image/svg+xml',
        '.html': 'text/html; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, format, *args):
        return

class ReusableThreadingHTTPServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8098
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(StudioHandler, directory=root)
    server = ReusableThreadingHTTPServer(('0.0.0.0', port), handler)
    print(f'NaniteStudio Project Zero WebGL/GPU listening on http://0.0.0.0:{port}/', flush=True)
    server.serve_forever()
