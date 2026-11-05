// Offline only: the application downloads PNGs, never the pixelfx simulator or stock actors.
import { mkdirSync,writeFileSync } from 'node:fs';
import { createFrame,clearFrame,createFx,composite } from '../../vendor/pixelfx/src/core/index.js';
import { encodePNG } from '../../vendor/pixelfx/tools/lib/png.mjs';
import * as hit from '../../vendor/pixelfx/src/fx/impacts/hit-spark.js';
import * as crit from '../../vendor/pixelfx/src/fx/impacts/crit-hit.js';
import * as wall from '../../vendor/pixelfx/src/fx/impacts/bullet-impact.js';
import * as muzzle from '../../vendor/pixelfx/src/fx/projectiles/muzzle-pistol.js';
import * as death from '../../vendor/pixelfx/src/fx/spawn/poof.js';
import * as collect from '../../vendor/pixelfx/src/fx/pickups/collect-burst.js';
import * as level from '../../vendor/pixelfx/src/fx/ui/level-up.js';

const ramps={
 warm:['#141b25','#344154','#705830','#bd8b28','#ffca3a','#ffe790','#ffffff'],
 xp:['#0e131b','#12344b','#145879','#1889ab','#30c6ff','#7edfff','#cef4ff','#ffffff'],
 coin:['#0e131b','#3a321e','#705823','#ac8128','#ffca3a','#ffe177','#fff2bb','#ffffff'],
 heal:['#0e131b','#442432','#7b3048','#b8445c','#ff6575','#ffa2ac','#ffdae0','#ffffff'],
 level:['#0e131b','#29382a','#4a672d','#799c31','#c5f542','#d9ff7c','#efffc1','#ffffff'],
};
// An empty text and actor-free meta bypass stockActor(). All three actor helpers guard null.
const actorFreeLevel={meta:{...level.meta,actor:undefined},create:level.create};
const definitions=[
 {id:'muzzle',mod:muzzle,source:'projectiles/muzzle-pistol',anchor:[0,-26],rate:2,options:{palette:ramps.warm,brass:ramps.coin,smoke:['#141b25','#1b2532','#344154','#526174','#96a6b8']}},
 {id:'hit',mod:hit,source:'impacts/hit-spark',anchor:[0,-20],rate:1.2,options:{palette:ramps.warm,aim:0}},
 {id:'crit',mod:crit,source:'impacts/crit-hit',anchor:[0,-26],rate:1.5,options:{palette:ramps.coin,aim:0}},
 {id:'wall',mod:wall,source:'impacts/bullet-impact',anchor:[0,-24],rate:2,options:{palette:ramps.warm,stone:'#526174'}},
 {id:'death',mod:death,source:'spawn/poof',anchor:[0,-17],rate:2.5,options:{palette:['#141b25','#344154','#617287','#96a6b8','#d4dce8','#ffffff'],stars:ramps.coin}},
 ...['xp','coin','heal'].map(id=>({id,mod:collect,source:'pickups/collect-burst',anchor:[0,-30],rate:id==='xp'?3:2.5,options:{palette:ramps[id]}})),
 {id:'level',mod:actorFreeLevel,source:'ui/level-up',anchor:[0,0],rate:2.2,sampleFps:20,options:{palette:ramps.level,text:'',actor:null},layers:['back','front']},
];
const dir=new URL('../../apps/web/public/assets/fx/',import.meta.url);mkdirSync(dir,{recursive:true});
const manifest={};
for(const {id,mod,source,anchor,rate,options,sampleFps=mod.meta.fps,layers=['combined']} of definitions){
 const pad=64,[sourceWidth,sourceHeight]=mod.meta.size,[ox,oy]=mod.meta.origin;
 const w=sourceWidth+pad*2,h=sourceHeight+pad*2,fps=sampleFps,count=Math.ceil(mod.meta.duration*fps)+1;
 const frame=createFrame(w,h),fx=createFx(mod,{...options,x:ox+pad,y:oy+pad});
 if(fx.options.actor)throw new Error(`${id}: stock actor must not be exported`);
 const frames=layers.map(()=>[]);let left=w,top=h,right=0,bottom=0;
 for(let i=0;i<count;i++){
  if(i)fx.update(1/fps);
  for(let l=0;l<layers.length;l++){
   clearFrame(frame);fx.draw(frame,layers[l]==='combined'?undefined:layers[l]);
   const rgba=composite(frame,new Uint8ClampedArray(w*h*4),null);frames[l].push(rgba);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(rgba[(y*w+x)*4+3]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  }
 }
 if(left<2||top<2||right>=w-2||bottom>=h-2)throw new Error(`${id}: render padding too small`);
 // Trim transparent margins only. Every source pixel remains 1:1; never squeeze a rectangle into a square.
 left-=2;top-=2;right+=2;bottom+=2;
 const frameWidth=right-left+1,frameHeight=bottom-top+1,columns=Math.min(10,Math.floor(2048/frameWidth)),rows=Math.ceil(count/columns);
 if(rows*frameHeight>2048)throw new Error(`${id}: atlas exceeds mobile texture budget`);
 const sheets=layers.map((layer,l)=>{
  const sheetWidth=columns*frameWidth,sheetHeight=rows*frameHeight,pixels=new Uint8Array(sheetWidth*sheetHeight*4);
  for(let i=0;i<count;i++)for(let y=0;y<frameHeight;y++){
   const start=((top+y)*w+left)*4,dest=((Math.floor(i/columns)*frameHeight+y)*sheetWidth+i%columns*frameWidth)*4;
   pixels.set(frames[l][i].subarray(start,start+frameWidth*4),dest);
  }
  const file=`${id}${layer==='combined'?'':`-${layer}`}.png`;writeFileSync(new URL(file,dir),encodePNG(sheetWidth,sheetHeight,pixels));return {layer,file};
 });
 manifest[id]={source,sourceWidth,sourceHeight,sourceOrigin:[ox,oy],sourceAnchor:anchor,crop:[left-pad,top-pad],sourceFps:mod.meta.fps,sampleFps:fps,sourceDuration:mod.meta.duration,playbackRate:rate,frameWidth,frameHeight,pivotX:ox+pad+anchor[0]-left,pivotY:oy+pad+anchor[1]-top,columns,rows,count,fps:fps*rate,durationMs:count/(fps*rate)*1000,sheets};
}
writeFileSync(new URL('manifest.json',dir),JSON.stringify(manifest,null,2)+'\n');
// Vite public/ is URL-only. Keep generated runtime metadata inside src rather than importing public/.
writeFileSync(new URL('../../apps/web/src/effects/manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
console.log(`pixelfx: ${definitions.length} actor-free effects, native pixels, complete timelines and layer-aware pivots.`);
