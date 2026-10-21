// Verify copied originals; preserved builds survive environments excluding directories named dist.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const Root=path.dirname(fileURLToPath(import.meta.url)),Manifest=JSON.parse(fs.readFileSync(path.join(Root,'MANIFEST.json'),'utf8'));let Checked=0;
for(const F of Manifest.files){const Paths=[path.join(Root,'Upstream',F.path)];if(F.preserved_build)Paths.push(path.join(Root,F.preserved_build));let Present=0;for(const P of Paths){if(!fs.existsSync(P))continue;Present++;const Bytes=fs.readFileSync(P),Hash=crypto.createHash('sha256').update(Bytes).digest('hex');if(Hash!==F.sha256||Bytes.length!==F.bytes)throw new Error('Reference changed: '+P);Checked++;}if(!Present)throw new Error('Missing reference: '+F.path);}
console.log(`${Manifest.files.length} original files preserved; ${Checked} source/archive hashes verified. Commit ${Manifest.commit}`);
