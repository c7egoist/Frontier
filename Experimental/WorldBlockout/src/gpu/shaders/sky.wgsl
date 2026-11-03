// Sky pass: fullscreen triangle, no depth write, drawn first.
@group(0) @binding(0) var<uniform> frame : Frame;

@vertex fn vs(@builtin(vertex_index) idx : u32) -> VSOut {
  return fullscreenTri(idx);
}

@fragment fn fs(in : VSOut) -> @location(0) vec4f {
  let dir = rayFromUv(in.uv);
  let col = skyColor(dir, frame.sunDir.xyz);
  let mapped = acesFilm(col * frame.sky.x);
  let gamma = pow(mapped, vec3f(1.0 / 2.2));
  // Return linear-ish result through the tonemapper once; the composite pass only gamma-corrects
  // when `frame.misc.w` requests it (0 = already display referred).
  return vec4f(gamma, 1.0);
}
