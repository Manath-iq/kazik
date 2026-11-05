import { describe,it,expect,vi } from 'vitest';
import { readFile,stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { FX_IDS,FX_MANIFEST,FX_CAPACITY,FX_STYLE,shouldPlayEffects } from '../apps/web/src/effects/catalog';
import { FxTimeline } from '../apps/web/src/effects/timeline';

describe('Pixelfx: ограниченный детерминированный runtime',()=>{
 it('разрешены девять разных событий; reduced motion, off и hidden отключают вспышки',()=>{
  expect(FX_IDS).toEqual(['muzzle','hit','crit','wall','death','xp','coin','heal','level']);
  expect(shouldPlayEffects(true,false,true)).toBe(true);
  expect(shouldPlayEffects(false,false,true)).toBe(false);expect(shouldPlayEffects(true,true,true)).toBe(false);expect(shouldPlayEffects(true,false,false)).toBe(false);
 });
 it('полная длительность и frame rate берутся из экспорта; пауза не двигает clock',()=>{
  const pool=new FxTimeline<null>(),m=FX_MANIFEST.level;expect(pool.emit('level',0,null)).toBe(true);expect(pool.used).toBe(2);
  pool.update(100);expect(pool.active[0].frame).toBe(Math.floor(m.fps*.1));pool.update(100);expect(pool.active[0].frame).toBe(Math.floor(m.fps*.1));
  pool.update(m.durationMs+1);expect(pool.used).toBe(0);expect(pool.slots.every(s=>s===null)).toBe(true);
 });
 it('спам ограничен cooldown и per-event cap; clear освобождает обе половины и cooldown',()=>{
  const pool=new FxTimeline<null>();expect(pool.emit('hit',0,null)).toBe(true);expect(pool.emit('hit',1,null)).toBe(false);
  for(let t=40;t<=160;t+=40)expect(pool.emit('hit',t,null)).toBe(true);
  expect(pool.emit('hit',200,null)).toBe(false);expect(pool.active).toHaveLength(FX_STYLE.hit.maxActive);
  pool.emit('level',201,null);pool.clear();expect(pool.used).toBe(0);expect(pool.emit('hit',201,null)).toBe(true);
 });
 it('резерв сохраняет лечение и уровень в толпе, крит вытесняет лишь второстепенные эффекты',()=>{
  const pool=new FxTimeline<null>();
  for(let t=0;t<330;t+=10)for(const id of ['hit','death','muzzle','wall','xp','coin'] as const)pool.emit(id,t,null);
  expect(pool.used).toBe(13);expect(pool.emit('level',331,null)).toBe(true);expect(pool.emit('heal',331,null)).toBe(true);expect(pool.used).toBe(FX_CAPACITY);
  expect(pool.emit('crit',332,null)).toBe(true);expect(pool.active.some(p=>p.id==='level')).toBe(true);expect(pool.active.some(p=>p.id==='heal')).toBe(true);expect(pool.used).toBeLessThanOrEqual(FX_CAPACITY);
 });
 it('долгий поток событий не расходует random и не расширяет фиксированные slots',()=>{
  const random=vi.spyOn(Math,'random').mockImplementation(()=>{throw new Error('VFX must not consume combat RNG');});
  try{const pool=new FxTimeline<null>(),slots=pool.slots;for(let t=0;t<16000;t+=16){for(const id of FX_IDS)pool.emit(id,t,null);expect(pool.used).toBeLessThanOrEqual(FX_CAPACITY);expect(pool.slots).toBe(slots);expect(pool.slots).toHaveLength(FX_CAPACITY);}pool.update(18000);expect(pool.used).toBe(0);expect(random).not.toHaveBeenCalled();}finally{random.mockRestore();}
 });
});

describe('Pixelfx: готовые прозрачные спрайты и происхождение',()=>{
 it('все кадры полные, с честным pivot, двумя слоями уровня и mobile texture budget',async()=>{
  let compressed=0,decoded=0;
  for(const id of FX_IDS){
   const m=FX_MANIFEST[id];expect(m.count).toBe(Math.ceil(m.sourceDuration*m.sampleFps)+1);expect(m.fps).toBeCloseTo(m.sampleFps*m.playbackRate);expect(m.durationMs).toBeCloseTo(m.count/m.fps*1000);
   expect(m.pivotX).toBe(m.sourceOrigin[0]+m.sourceAnchor[0]-m.crop[0]);expect(m.pivotY).toBe(m.sourceOrigin[1]+m.sourceAnchor[1]-m.crop[1]);
   for(const sheet of m.sheets){
    const path=new URL(`../apps/web/public/assets/fx/${sheet.file}`,import.meta.url),{data,info}=await sharp(await readFile(path)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    compressed+=(await stat(path)).size;decoded+=data.length;
    expect(info.width).toBe(m.frameWidth*m.columns);expect(info.height).toBe(m.frameHeight*m.rows);expect(Math.max(info.width,info.height)).toBeLessThanOrEqual(2048);
    let painted=0;
    for(let f=0;f<m.count;f++)for(let y=0;y<m.frameHeight;y++)for(let x=0;x<m.frameWidth;x++){
     const a=data[((Math.floor(f/m.columns)*m.frameHeight+y)*info.width+f%m.columns*m.frameWidth+x)*4+3];
     if(a)painted++;if(x===0||y===0||x===m.frameWidth-1||y===m.frameHeight-1)expect(a,`${id}/${sheet.layer}: clipped frame ${f}`).toBe(0);
    }
    expect(painted).toBeGreaterThan(100);
   }
  }
  expect(FX_MANIFEST.level.sheets.map(s=>s.layer)).toEqual(['back','front']);
  expect(FX_MANIFEST.xp.frameWidth).not.toBe(FX_MANIFEST.xp.frameHeight);
  expect(compressed).toBeLessThan(1.5*1024*1024);expect(decoded).toBeLessThan(32*1024*1024);
 });
 it('новые MIT исходники закреплены commit и SHA-256, без gallery assets',async()=>{
  const root=new URL('../vendor/pixelfx/',import.meta.url),sources=JSON.parse(await readFile(new URL('SOURCES.json',root),'utf8')) as {commit:string;license:string;sha256:Record<string,string>};
  expect(sources.commit).toBe('a84159688af3ca37a4be05a0d422b94451b2e24e');expect(sources.license).toBe('MIT');
  for(const [path,hash] of Object.entries(sources.sha256)){expect(path).not.toContain('gallery/');expect(createHash('sha256').update(await readFile(new URL(path,root))).digest('hex')).toBe(hash);}
  const exporter=await readFile(new URL('../tools/fx/export.mjs',import.meta.url),'utf8');expect(exporter).toContain("text:'',actor:null");expect(exporter).toContain('actor:undefined');
 });
});
