// Reproducible download of a narrow MIT source selection, never executable install hooks.
/* global AbortSignal */
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const commit='a84159688af3ca37a4be05a0d422b94451b2e24e';
const files=['src/fx/impacts/crit-hit.js','src/fx/impacts/bullet-impact.js','src/fx/projectiles/muzzle-pistol.js','src/fx/projectiles/_lib.js','src/fx/spawn/poof.js','src/fx/ui/level-up.js','src/fx/ui/_lib.js'];
const root=new URL('../../vendor/pixelfx/',import.meta.url),hashes={};
let expected={};try{expected=JSON.parse(await readFile(new URL('SOURCES.json',root),'utf8')).sha256;}catch(e){if(e.code!=='ENOENT')throw e;}
for(const path of files){
 const target=new URL(path,root);let text;
 try{text=await readFile(target,'utf8');}catch(e){
  if(e.code!=='ENOENT')throw e;
  const response=await fetch(`https://raw.githubusercontent.com/patch-gg/pixelfx/${commit}/${path}`,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`pixelfx source ${path}: ${response.status}`);
  text=await response.text();if(!text.startsWith('//')||!text.includes('import '))throw new Error(`Unexpected source: ${path}`);
  await mkdir(new URL('.',target),{recursive:true});await writeFile(target,text);
 }
 hashes[path]=createHash('sha256').update(text).digest('hex');
 if(expected[path]&&expected[path]!==hashes[path])throw new Error(`Pinned source hash mismatch (not overwritten): ${path}`);
}
await writeFile(new URL('SOURCES.json',root),JSON.stringify({repository:'https://github.com/patch-gg/pixelfx',commit,license:'MIT',sha256:hashes},null,2)+'\n');
console.log(`pixelfx: ${files.length} selected upstream files available at pinned commit.`);
