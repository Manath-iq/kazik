import { mkdirSync, writeFileSync } from 'node:fs';
import { createFrame,clearFrame,createFx,composite } from '../../vendor/pixelfx/src/core/index.js';
import { encodePNG } from '../../vendor/pixelfx/tools/lib/png.mjs';
import * as hit from '../../vendor/pixelfx/src/fx/impacts/hit-spark.js';
import * as collect from '../../vendor/pixelfx/src/fx/pickups/collect-burst.js';
const dir=new URL('../../apps/web/public/assets/fx/',import.meta.url);mkdirSync(dir,{recursive:true});
const manifest={};
for(const [id,mod] of [['hit',hit],['collect',collect]]) {
 const size=64,cols=8,count=24,fps=24,rows=Math.ceil(count/cols),pixels=new Uint8Array(size*cols*size*rows*4);
 const [w,h]=mod.meta.size,frame=createFrame(w,h),fx=createFx(mod,{x:w/2,y:h-8,palette:['#101820','#344154','#61736c','#96a63a','#c5f542','#dfef99','#e7edf5','#ffffff']});
 for(let i=0;i<count;i++){
  if(i)fx.update(1/fps);clearFrame(frame);fx.draw(frame);
  const rgba=composite(frame,new Uint8ClampedArray(w*h*4),null);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const sx=Math.floor(x*w/size),sy=Math.floor(y*h/size),src=(sy*w+sx)*4;
   const dst=(((Math.floor(i/cols)*size+y)*cols*size)+(i%cols)*size+x)*4;
   pixels.set(rgba.subarray(src,src+4),dst);
  }
 }
 writeFileSync(new URL(`${id}.png`,dir),encodePNG(cols*size,rows*size,pixels));
 manifest[id]={frameWidth:size,frameHeight:size,count,fps};
}
writeFileSync(new URL('manifest.json',dir),JSON.stringify(manifest,null,2));
console.log('pixelfx: exported hit + collect (24 frames each)');
