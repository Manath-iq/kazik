import { it,expect } from 'vitest';
import { wheelOrder,wheelPocket,rocketPosition } from '../apps/web/src/features/casino-geometry';
it('колесо содержит все 37 чисел без повторов и реальные SVG-секторы',()=>{
 expect([...wheelOrder].sort((a,b)=>a-b)).toEqual(Array.from({length:37},(_,i)=>i));
 for(let i=0;i<37;i++){const path=wheelPocket(i);expect(path).toContain('A142');expect(path).not.toMatch(/NaN|Infinity/);}
});
it('ракета и её линейный след идут по одной прямой и не выходят за поле',()=>{
 let previous=18;for(const elapsed of [0,0.1,1,3,10,46]){const p=rocketPosition(elapsed,180,130);expect(p.x).toBeGreaterThanOrEqual(previous);previous=p.x;expect(p.x).toBeLessThan(167);expect(p.y).toBeGreaterThan(13);expect((p.x-p.startX)/138).toBeCloseTo((p.startY-p.y)/86,8);}
 expect(rocketPosition(.1,180,130).x).toBeGreaterThan(18);
});
