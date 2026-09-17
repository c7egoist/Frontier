import { installDomStub, loadCanvasBackend } from '../dom-stub.mjs';
installDomStub();
await loadCanvasBackend();
const TT = await import('../../src/lib/textures.js');
const fs = await import('node:fs');
const dir = '/home/user/Frontier/shots/tex';
fs.mkdirSync(dir, { recursive: true });
const items = [
  ['sign', () => TT.signTexture({ text: '一風堂 拉麺', sub: 'IPPUDO', bg: '#8a2b22', fg: '#f6f1e4', w: 768, h: 256 })],
  ['sign-vertical', () => TT.signTexture({ text: '大黒屋', bg: '#1d1a16', fg: '#efe3c6', vertical: true, w: 256, h: 768 })],
  ['neon', () => TT.neonTexture({ text: '24時間営業', color: '#ff2e6b', w: 768, h: 192 })],
  ['poster', () => TT.posterTexture({ title: '求人', lines: ['#スタッフ募集', '経験不問', '週3日から', '時給 1,200円〜'], accent: '#b8242a' })],
  ['menu', () => TT.menuTexture({ title: 'お品書き', items: [['天ぷら','850'],['そば','700'],['定食','980'],['生ビール','550']] })],
  ['noren', () => TT.norenTexture({ text: 'そば', bg: '#1e3a5f' })],
  ['banner', () => TT.bannerTexture({ text: '大売出', accent: '#b8242a' })],
  ['lantern', () => TT.lanternTexture({ text: '麺', bg: '#d8362f' })],
  ['vending', () => TT.vendingTexture({ brand: 'ドリンク' })],
  ['wood', () => TT.woodTexture('cedar', { planks: 5 })],
  ['plaster', () => TT.plasterTexture()],
  ['stone', () => TT.stoneTexture('stone')],
];
for (const [name, fn] of items) {
  const tex = fn();
  if (!tex || !tex.image) { console.log('  ✗ no image for', name); continue; }
  const img = tex.image;
  const out = `/home/user/Frontier/shots/tex/${name}.png`;
  fs.writeFileSync(out, img.toBuffer ? img.toBuffer('image/png') : Buffer.from(img.toDataURL().split(',')[1], 'base64'));
  const ctx = img.getContext('2d');
  const d = ctx.getImageData(0, 0, img.width, img.height).data;
  let nonEmpty = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) nonEmpty++;
  console.log(`  ${name.padEnd(14)} ${img.width}×${img.height}  coverage=${((nonEmpty / (d.length / 4)) * 100).toFixed(1)}%`);
}
