import { readFile, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
let html = await readFile("dist/index.html", "utf8");
for (const match of [
  ...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g),
]) {
  const script = await readFile(resolve("dist", match[1]), "utf8");
  html = html.replace(
    match[0],
    () =>
      `<script type="module">${script.replace(/<\/script/gi, "<\\/script")}</script>`,
  );
}
for (const match of [
  ...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g),
]) {
  const css = await readFile(resolve("dist", match[1]), "utf8");
  html = html.replace(match[0], () => `<style>${css}</style>`);
}
html = html.replace(/<link\b[^>]*rel="modulepreload"[^>]*>/g, "");
if (/\b(?:src|href)="\.\/?assets\//.test(html))
  throw new Error("Standalone build still references an external asset.");
const notices = await readFile("THIRD_PARTY_NOTICES.md", "utf8");
html = html.replace(
  "<head>",
  () =>
    `<head>\n<script type="text/plain" id="third-party-licenses">${notices}</script>`,
);
await writeFile("RoadDesigner.html", html);
await writeFile("dist/index.html", html);
console.log(
  `Standalone editor: RoadDesigner.html (${((await stat("RoadDesigner.html")).size / 1024).toFixed(0)} KB)`,
);
