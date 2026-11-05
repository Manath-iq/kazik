// Local contact sheet for checking exported silhouettes, colors, pivots and both level layers.
import { readFile,mkdir } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
const root=new URL('../../apps/web/public/assets/fx/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const width=1000,cell=230,rowHeight=210,overlays=[];
for(const [row,[id,m]] of Object.entries(Object.entries(manifest))){
 const top=Number(row)*rowHeight;
 overlays.push({input:Buffer.from(`<svg width="1000" height="28"><text x="14" y="20" fill="#96a6b8" font-family="monospace" font-size="14">${id} · ${m.frameWidth}×${m.frameHeight} · ${m.count}f · ${Math.round(m.durationMs)}ms</text></svg>`),left:0,top});
 for(let i=0;i<4;i++){
  const frame=Math.min(m.count-1,Math.round([0,.07,.18,.4][i]*m.fps)),left=55+i*cell;
  for(const sheet of m.sheets){const input=await sharp(new URL(sheet.file,root).pathname).extract({left:frame%m.columns*m.frameWidth,top:Math.floor(frame/m.columns)*m.frameHeight,width:m.frameWidth,height:m.frameHeight}).png().toBuffer();overlays.push({input,left,top:top+28});}
  overlays.push({input:Buffer.from('<svg width="9" height="9"><path d="M4 0v9M0 4h9" stroke="#ff6575" opacity=".6"/></svg>'),left:left+m.pivotX-4,top:top+28+m.pivotY-4});
 }
}
const local=new URL('../../.local/',import.meta.url);await mkdir(local,{recursive:true});
await sharp({create:{width,height:rowHeight*Object.keys(manifest).length+12,channels:4,background:'#080b10'}}).composite(overlays).png().toFile(new URL('fx-contact.png',local).pathname);
console.log('Preview: .local/fx-contact.png (red crosses mark event pivots).');
