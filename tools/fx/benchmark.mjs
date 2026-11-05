// Local-only synthetic load: 72 actors + saturated VFX, no API calls or rewards. Not phone FPS proof.
/* global localStorage, document, requestAnimationFrame */
import { mkdir,writeFile } from 'node:fs/promises';
import { chromium,expect } from '@playwright/test';
const browser=await chromium.launch(),samples=[];
try{
 for(const enabled of [false,true,true]){
  const context=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  await context.addInitScript(value=>localStorage.setItem('sl-effects',value?'on':'off'),enabled);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5174/__game-review?case=fx-stress');await expect(page.locator('canvas')).toHaveAttribute('data-enemies','72');
  const sample=await page.evaluate(()=>new Promise(resolve=>{
   let frame=0,last=0,peakFx=0,firstObjects=0,lateObjects=0;const deltas=[];
   function step(now){
    const d=document.querySelector('canvas').dataset;if(frame>=180&&last){deltas.push(now-last);peakFx=Math.max(peakFx,Number(d.fxActive));if(frame<380)firstObjects=Math.max(firstObjects,Number(d.drawables));if(frame>=580)lateObjects=Math.max(lateObjects,Number(d.drawables));}
    last=now;if(++frame<780){requestAnimationFrame(step);return;}
    deltas.sort((a,b)=>a-b);resolve({frames:deltas.length,median:deltas[Math.floor(deltas.length*.5)],p95:deltas[Math.floor(deltas.length*.95)],peakFx,firstObjects,lateObjects});
   }requestAnimationFrame(step);
  }));
  samples.push({enabled,...sample,errors});await context.close();
 }
}finally{await browser.close();}
const local=new URL('../../.local/',import.meta.url);await mkdir(local,{recursive:true});
await writeFile(new URL('pixelfx-performance.json',local),JSON.stringify({fixture:'local synthetic fx-stress; Mac Chromium, not a physical phone',viewport:'375x812',samples},null,2)+'\n');
console.log(JSON.stringify(samples));
