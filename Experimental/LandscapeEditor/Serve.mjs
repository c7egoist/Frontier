// 📦 Static server for the landscape editor — serves this folder over HTTP on 0.0.0.0 so ES modules and workers load.

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const Root = path.dirname(fileURLToPath(import.meta.url));
const Port = Number(process.env.PORT ?? 8080);
const Host = process.env.HOST ?? "0.0.0.0";

const MimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".ttf": "font/ttf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
};

/// in    RequestUrl   [-]  raw request target
/// out   FilePath     [-]  absolute path inside Root, or null when the request escapes it
function ResolveRequest(RequestUrl) {
    const Pathname = decodeURIComponent(new URL(RequestUrl, "http://local").pathname);
    const Relative = Pathname === "/" ? "index.html" : Pathname.replace(/^\/+/, "");
    const FilePath = path.resolve(Root, Relative);
    if (!FilePath.startsWith(Root + path.sep) && FilePath !== Root) {
        return null;
    }
    return FilePath;
}

const Server = http.createServer(async (Request, Response) => {
    try {
        if (Request.method !== "GET" && Request.method !== "HEAD") {
            Response.writeHead(405, { Allow: "GET, HEAD" });
            Response.end();
            return;
        }
        const FilePath = ResolveRequest(Request.url ?? "/");
        if (!FilePath) {
            Response.writeHead(403);
            Response.end("Forbidden");
            return;
        }
        const Info = await stat(FilePath);
        if (!Info.isFile()) {
            Response.writeHead(404);
            Response.end("Not found");
            return;
        }
        const Body = await readFile(FilePath);
        Response.writeHead(200, {
            "Content-Type": MimeTypes[path.extname(FilePath).toLowerCase()] ?? "application/octet-stream",
            "Content-Length": Body.length,
            "Cache-Control": "no-cache",
        });
        Response.end(Request.method === "HEAD" ? undefined : Body);
    } catch (Failure) {
        Response.writeHead(404);
        Response.end("Not found");
    }
});

Server.listen(Port, Host, () => {
    console.log(`Landscape Editor serving ${Root} at http://${Host}:${Port}`);
});
