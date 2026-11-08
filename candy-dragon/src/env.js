import * as THREE from 'three';

/**
 * A hand-painted "candy studio" environment: warm rose light from one side,
 * icy mint from the other, a gold bounce underneath and a spray of tiny
 * highlights that read as sugar glitter on the glossy body.
 */
export function makeCandyEnvironment(renderer) {
  const W = 1024;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  // base vertical gradient (sky / floor)
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.0, '#1b0722');
  g.addColorStop(0.32, '#3a0f3f');
  g.addColorStop(0.52, '#5c1650');
  g.addColorStop(0.72, '#2a0a24');
  g.addColorStop(1.0, '#0e040f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const glow = (x, y, rx, ry, color, alpha) => {
    const grd = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    grd.addColorStop(0, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(1, ry / Math.max(rx, ry));
    ctx.translate(-x, -y);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(rx, ry), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // big soft sources — these become the shiny highlights on candy
  glow(230, 150, 300, 210, 'rgba(255,236,246,1)', 0.85);   // key
  glow(770, 120, 250, 180, 'rgba(190,255,240,0.9)', 0.7);  // mint rim
  glow(520, 300, 380, 130, 'rgba(255,190,120,0.75)', 0.5); // gold bounce

  // crisp strip lights (long bright rectangles = nice specular streaks)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const strip = (x, y, w, h, col, rot) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    const lg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.35, col);
    lg.addColorStop(0.65, col);
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.filter = 'blur(6px)';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  };
  strip(160, 220, 460, 16, 'rgba(255,255,255,0.95)', -0.25);
  strip(880, 200, 380, 12, 'rgba(180,255,235,0.9)', 0.35);
  strip(520, 400, 700, 10, 'rgba(255,205,140,0.75)', 0.05);
  ctx.restore();

  // sugar glitter
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const s = Math.random() * 2.4 + 0.4;
    const a = Math.random() * 0.55 + 0.08;
    ctx.fillStyle = `rgba(255,${200 + Math.random() * 55},${235 + Math.random() * 20},${a})`;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromEquirectangular(tex);
  pmrem.dispose();
  tex.dispose();
  return envRT.texture;
}

/** the backdrop dome behind the sculpture */
export function makeBackdrop() {
  const geo = new THREE.SphereGeometry(38, 48, 32);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color('#0b0410') },
      uMid: { value: new THREE.Color('#35102f') },
      uBottom: { value: new THREE.Color('#080308') },
      uGlow: { value: new THREE.Color('#7a1d4e') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vPos;
      uniform vec3 uTop, uMid, uBottom, uGlow;
      void main() {
        vec3 p = normalize(vPos);
        float h = p.y * 0.5 + 0.5;
        vec3 col = mix(uBottom, uMid, smoothstep(0.02, 0.55, h));
        col = mix(col, uTop, smoothstep(0.55, 1.0, h));
        // soft warm bloom behind the dragon
        float d = distance(p.xy, vec2(0.0, 0.12));
        col += uGlow * exp(-d * d * 9.0) * 0.55;
        // faint sugar haze near the pedestal
        col += vec3(0.35, 0.14, 0.26) * exp(-pow((h - 0.42) * 9.0, 2.0)) * 0.25;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}
