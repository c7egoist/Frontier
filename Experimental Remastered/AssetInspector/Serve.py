#!/usr/bin/env python3
"""Standalone HTTP preview for the Remastered Asset Inspector."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class InspectorHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    handler = partial(InspectorHandler, directory=str(root))
    server = ThreadingHTTPServer(("0.0.0.0", 8086), handler)
    print(f"Asset Inspector serving {root} on http://0.0.0.0:8086/Experimental%20Remastered/AssetInspector/", flush=True)
    server.serve_forever()
