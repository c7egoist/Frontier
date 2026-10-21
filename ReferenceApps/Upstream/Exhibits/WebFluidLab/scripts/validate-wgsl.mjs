// Lightweight structural sanity check for every WGSL module in the project.
// Not a full WebGPU shader compiler, but it parses the token stream with
// wgsl_reflect and reports any syntax errors before they reach the browser.
import { WgslReflect } from "wgsl_reflect/wgsl_reflect.module.js";
import fs from "fs";
import path from "path";

const groups = [
  {
    common: "src/sim/gpu/shaders/common.wgsl",
    files: ["insert.wgsl", "density.wgsl", "forces.wgsl", "integrate.wgsl"],
  },
  {
    common: "src/render/webgpu/shaders/renderCommon.wgsl",
    files: ["scene.wgsl", "particles.wgsl"],
  },
];

let failed = false;
for (const group of groups) {
  const dir = path.dirname(group.common);
  const common = fs.readFileSync(group.common, "utf8");
  for (const file of group.files) {
    const src = common + "\n" + fs.readFileSync(path.join(dir, file), "utf8");
    try {
      new WgslReflect(src);
      console.log(`OK   ${path.join(dir, file)}`);
    } catch (e) {
      failed = true;
      console.error(`FAIL ${path.join(dir, file)}: ${e.message}`);
    }
  }
}

const standalone = ["src/render/webgpu/shaders/blit.wgsl"];
for (const file of standalone) {
  try {
    new WgslReflect(fs.readFileSync(file, "utf8"));
    console.log(`OK   ${file}`);
  } catch (e) {
    failed = true;
    console.error(`FAIL ${file}: ${e.message}`);
  }
}

process.exit(failed ? 1 : 0);
