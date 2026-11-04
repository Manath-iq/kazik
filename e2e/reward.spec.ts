import {test,expect} from '@playwright/test';
import sharp from 'sharp';
test('реальный бой → подобрать деньги → положительная серверная награда',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:/НАЧАТЬ ВЫЛАЗКУ/})).toBeVisible();
 await page.getByRole('button',{name:/НАЧАТЬ ВЫЛАЗКУ/}).click();const canvas=page.locator('canvas');await expect(canvas).toBeVisible();
 let coin:{x:number;y:number}|null=null;
 // Управляем только обычным джойстиком по реально отрисованной добыче.
 // Не изменяем seed/статы/БД/результат и не вызываем внутренние методы сцены.
 await expect.poll(async()=>{
  const box=await canvas.boundingBox();if(!box)return false;
  const {data,info}=await sharp(await canvas.screenshot()).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let x=0,y=0,count=0,best=130;
  for(let py=0;py<info.height;py++)for(let px=0;px<info.width;px++){
   const i=(py*info.width+px)*4;
   const dist=Math.hypot(px-info.width/2,py-info.height/2);
   if(data[i]>240&&data[i+1]>180&&data[i+1]<220&&data[i+2]<80&&dist<130){count++;if(dist<best){best=dist;x=px;y=py;}}
  }
  if(count<3)return false;coin={x:box.x+x,y:box.y+y};return true;
 },{timeout:30000,intervals:[500,500,1000]}).toBe(true);
 const box=(await canvas.boundingBox())!,target=coin! as {x:number;y:number},cx=box.x+box.width/2,cy=box.y+box.height/2;
 const dx=target.x-cx,dy=target.y-cy,len=Math.hypot(dx,dy)||1,ox=box.x+55,oy=box.y+box.height-85;
 await page.mouse.move(ox,oy);await page.mouse.down();await page.mouse.move(ox+dx/len*65,oy+dy/len*65);
 await expect(page.locator('.run-stats .gold')).not.toHaveText('$0',{timeout:10000});await page.mouse.up();
 await page.screenshot({path:'test-results/active-run-375.png'});
 await page.getByRole('button',{name:'Пауза',exact:true}).click();await page.getByRole('button',{name:'ЗАВЕРШИТЬ ВЫЛАЗКУ',exact:true}).click();
 await expect(page.locator('.result-income strong')).not.toHaveText('+$0',{timeout:20000});
 await page.screenshot({path:'test-results/reward-375.png'});
});
