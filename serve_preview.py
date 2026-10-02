import http.server
import socketserver
import os

PORT = 8080
DIRECTORY = os.path.abspath("Frontier/Exhibits/DistanceFieldGI")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    print(f"Serving Distance Field GI Preview on port {PORT}...")
    httpd.serve_forever()
