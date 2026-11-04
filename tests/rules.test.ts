import { describe,it,expect } from 'vitest';
import { rouletteColor,roulettePayout,handValue,seasonStart,businessIncome,crashMultiplier,crashPoint,stakeSchema,maxSpawned } from '@street/shared';
import { RunModel,seededRandom } from '../apps/web/src/game/model';
describe('Правила и баланс',()=>{
 it('европейская рулетка: ноль не красный и не чёрный, 18 красных',()=>{
  expect(rouletteColor(0)).toBe('zero');expect(Array.from({length:37},(_,i)=>rouletteColor(i)).filter(x=>x==='red')).toHaveLength(18);
  expect(roulettePayout(0,'red',50)).toBe(0);expect(roulettePayout(0,'zero',50)).toBe(1800);expect(roulettePayout(32,'red',50)).toBe(100);expect(roulettePayout(32,32,50)).toBe(1800);
 });
 it('тузы 1/11, картинки, перебор',()=>{
  expect(handValue([0,12])).toBe(21);expect(handValue([0,13,9])).toBe(12);expect(handValue([9,22,6])).toBe(27);expect(handValue([0,13])).toBe(12);
 });
 it('чётные целые ставки 10–1000, без отрицательных, NaN и бесконечности',()=>{
  for(const n of [-1,0,9,11,1002,NaN,Infinity])expect(stakeSchema.safeParse(n).success).toBe(false);
  expect(stakeSchema.safeParse(50).success).toBe(true);
 });
 it('начало сезона — понедельник в UTC независимо от часового пояса',()=>{
  const monday=Date.parse('2026-11-02T00:00:00Z');expect(seasonStart(Date.parse('2026-11-08T23:59:59Z'))).toBe(monday);expect(seasonStart(monday)).toBe(monday);expect(seasonStart(monday-1)).toBe(monday-7*86400000);
 });
 it('бизнес не копит больше шести часов и не создаёт дробный баланс',()=>{
  expect(businessIncome(100,24*3600000)).toBe(600);expect(businessIncome(350,1800000)).toBe(175);expect(businessIncome(100,-1)).toBe(0);
 });
 it('crash ограничен и измеряет множитель временем',()=>{
  expect(crashMultiplier(0)).toBe(1);expect(crashMultiplier(100000)).toBe(100);expect(crashPoint(0)).toBe(1);expect(crashPoint(0.99999)).toBe(100);expect(crashMultiplier(1000)).toBeCloseTo(Math.exp(.1));
 });
 it('новая вылазка сбрасывает HP, опыт и все усиления',()=>{
  const run=new RunModel();run.hit(20);run.upgrade('damage');run.upgrade('health');run.gainXp(6);run.levelUp();expect(run.damage).toBeCloseTo(14.4);expect(run.level).toBe(2);
  const fresh=new RunModel();expect(fresh.hp).toBe(100);expect(fresh.damage).toBe(12);expect(fresh.level).toBe(1);expect(fresh.stacks).toEqual({});
 });
 it('урон и смерть, предел брони и разных доступных улучшений',()=>{
  const run=new RunModel();for(let i=0;i<10;i++)run.upgrade('armor');expect(run.armor).toBeCloseTo(.48);expect(run.available().some(u=>u.id==='armor')).toBe(false);expect(new Set(run.available().map(u=>u.id)).size).toBe(run.available().length);run.hit(1000);expect(run.dead).toBe(true);
 });
 it('seed воспроизводим, серверный лимит спавна растёт',()=>{
  const a=seededRandom(42),b=seededRandom(42);expect(Array.from({length:20},a)).toEqual(Array.from({length:20},b));expect(maxSpawned(60)).toBeGreaterThan(maxSpawned(30));
 });
});
