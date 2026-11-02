/*==========================================================================================================================================
                                                       BUILDWORKSPACE.MJS
==========================================================================================================================================*/
// 🧩 Bundles the modular Fracture + Celestial Workspace into a zero-dependency standalone HTML file.

import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RootDir = path.dirname(fileURLToPath(import.meta.url));
const CssPath = path.join(RootDir, "Source", "WorkspaceStyles.css");
const EntryJs = path.join(RootDir, "Source", "WorkspaceApplication.js");
const OutHtml = path.join(RootDir, "index.html");

const Bundle = await esbuild.build({
    entryPoints: [EntryJs],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    minify: true,
    write: false
});

const JsText = Bundle.outputFiles[0].text;
const CssText = fs.readFileSync(CssPath, "utf8");

// Escape any closing script sequence inside minified bundle so inline <script> never terminates early
const SafeJsText = JsText.replace(/<\/script/gi, "<\\/script");

const HtmlDocument = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Frontier — Fracture, Sun, Atmosphere &amp; Clouds Editor</title>
<style>
${CssText}
</style>
</head>
<body>
<div id="frontierWorkspaceRoot"></div>
<script>
${SafeJsText}
</script>
</body>
</html>
`;

fs.writeFileSync(OutHtml, HtmlDocument, "utf8");
console.log(`Built ${OutHtml} (${(Buffer.byteLength(HtmlDocument) / 1024).toFixed(1)} KiB)`);
