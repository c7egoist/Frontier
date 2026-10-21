import {execFileSync} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
const Root=path.dirname(fileURLToPath(import.meta.url)),Source=path.join(Root,'Working/FluxParticleStudio'),Output=path.join(Root,'Published/FluxParticleStudio'),Npm=process.platform==='win32'?'npm.cmd':'npm';
if(process.argv.includes('--install'))execFileSync(Npm,['ci','--ignore-scripts','--prefix',Source],{stdio:'inherit'});
execFileSync(Npm,['exec','--prefix',Source,'--','vite','build',Source,'--outDir',Output,'--emptyOutDir'],{cwd:Root,stdio:'inherit'});
