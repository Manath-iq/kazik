import { describe,it,expect } from 'vitest';
import { HERO_BODY,PROP_BODIES,moveBody,unstickBody,overlapBody,obstacleWaypoint,segmentRectTime,segmentCircleTime,advancePickup } from '../apps/web/src/game/world';
import { SpatialGrid } from '../apps/web/src/game/spatial';
import { RunModel } from '../apps/web/src/game/model';

describe('Столкновения, магнит и spatial queries',()=>{
 it('у машин/заборов/баков/фонарей есть footprint; вывески/разметка не блокируют',()=>{
  for(const key of ['prop-car','prop-fence','prop-bin','prop-lamp'])expect(PROP_BODIES[key]).toBeDefined();expect(PROP_BODIES['prop-neon']).toBeUndefined();expect(PROP_BODIES['tile-road-marking']).toBeUndefined();
 });
 it('герой не проходит через автомобиль и скользит вдоль его края',()=>{
  const car={left:20,right:48,top:-64,bottom:7},hero={x:0,y:0};moveBody(hero,100,0,8,5,[car]);expect(hero.x).toBe(12);expect(overlapBody(hero,8,5,car)).toBe(false);
  moveBody(hero,50,-30,8,5,[car]);expect(hero.x).toBe(12);expect(hero.y).toBe(-30);expect(overlapBody(hero,8,5,car)).toBe(false);
 });
 it('тонкий забор не пробивается большим delta/рывком и движением по диагонали',()=>{
  const fence={left:-30,right:30,top:20,bottom:26},hero={x:0,y:0};moveBody(hero,0,300,8,5,[fence]);expect(hero.y).toBe(15);
  const diagonal={x:-60,y:0};moveBody(diagonal,60,60,8,5,[fence]);expect(overlapBody(diagonal,8,5,fence)).toBe(false);
 });
 it('обход препятствия не оставляет врага в стене или застрявшим по прямой',()=>{
  const wall={left:-10,right:10,top:-30,bottom:30},enemy={x:-100,y:0},target={x:100,y:0};let goal=obstacleWaypoint(enemy,target,8,5,[wall]);expect(goal).not.toBeNull();
  for(let tick=0;tick<600;tick++){
   if(tick%10===0||goal&&Math.hypot(goal.x-enemy.x,goal.y-enemy.y)<5)goal=obstacleWaypoint(enemy,target,8,5,[wall]);
   const destination=goal??target,dx=destination.x-enemy.x,dy=destination.y-enemy.y,distance=Math.hypot(dx,dy)||1,step=Math.min(1,distance);moveBody(enemy,dx/distance*step,dy/distance*step,8,5,[wall]);
   expect(overlapBody(enemy,8,5,wall)).toBe(false);
  }expect(enemy.x).toBeGreaterThan(90);expect(Math.abs(enemy.y)).toBeLessThan(5);
 });
 it('появившийся внутри объекта моб выталкивается наружу',()=>{
  const r={left:-20,right:20,top:-30,bottom:30},p={x:0,y:0};unstickBody(p,8,5,[r]);expect(overlapBody(p,8,5,r)).toBe(false);
 });
 it('снаряд проверяет весь пройденный сегмент: не пролетает стену/врага',()=>{
  expect(segmentRectTime(-40,0,40,0,{left:-2,right:2,top:-20,bottom:20})).toBeCloseTo(38/80);expect(segmentCircleTime(-40,0,40,0,0,0,10)).toBeCloseTo(30/80);
  expect(segmentRectTime(-40,40,40,40,{left:-2,right:2,top:-20,bottom:20})).toBe(Infinity);
 });
 it('магнит догоняет героя на максимальной скорости на 15/30/60/120 fps без остановки',()=>{
  for(const fps of [15,30,60,120]){
   const model=new RunModel();for(let i=0;i<5;i++){model.upgrade('speed');model.upgrade('magnet');}
   const hero={x:0,y:0},drop={x:-model.magnet+1,y:0},state={attracted:false,speed:0};let picked=false;
   for(let frame=0;frame<fps*2;frame++){picked=advancePickup(drop,hero,state,model.magnet,model.speed,1/fps);hero.x+=model.speed/fps;if(picked)break;}
   expect(picked,`fps ${fps}`).toBe(true);
  }
 });
 it('захваченная добыча не отцепляется за границей магнита; дальняя сама не прилетает',()=>{
  const state={attracted:false,speed:0},hero={x:0,y:0},drop={x:-29,y:0};advancePickup(drop,hero,state,30,155,1/60);hero.x=100;
  expect(state.attracted).toBe(true);const before=drop.x;advancePickup(drop,hero,state,30,217,1/60);expect(drop.x).toBeGreaterThan(before);
  const distant={x:400,y:0};expect(advancePickup(distant,hero,{attracted:false,speed:0},30,155,1/60)).toBe(false);expect(distant.x).toBe(400);
 });
 it('spatial broadphase находит те же локальные кандидаты, включая отрицательные клетки',()=>{
  const grid=new SpatialGrid<{id:number;x:number;y:number}>(48),items=Array.from({length:72},(_,id)=>({id,x:(id%9-4)*60,y:(Math.floor(id/9)-4)*60}));
  for(const item of items)grid.insert(item,item.x,item.y);
  const found:number[]=[];grid.nearby(-20,-20,90,item=>{if(Math.hypot(item.x+20,item.y+20)<=90)found.push(item.id);});
  expect(found.sort((a,b)=>a-b)).toEqual(items.filter(i=>Math.hypot(i.x+20,i.y+20)<=90).map(i=>i.id));
  grid.clear();const empty:number[]=[];grid.nearby(0,0,100,i=>{empty.push(i.id);});expect(empty).toHaveLength(0);
 });
 it('плотная клетка имеет ограничиваемый бюджет, ротация не закрепляет одних кандидатов',()=>{
  const grid=new SpatialGrid<number>();let count=0;for(let i=0;i<72;i++)grid.insert(i,0,0);grid.nearby(0,0,20,()=>++count<24);expect(count).toBe(24);
  const visited=new Set<number>();for(let frame=0;frame<72;frame++){grid.clear();for(let i=0;i<72;i++)grid.insert(i,0,0);grid.nearby(0,0,20,i=>{visited.add(i);return false;});}expect(visited.size).toBe(72);
  expect(HERO_BODY.halfHeight).toBeGreaterThan(0);
 });
});
