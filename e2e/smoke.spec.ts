import { test,expect } from '@playwright/test';
test('375×812: вкладки, игровой canvas, пауза, результат, кошелёк',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.getByRole('button',{name:/НАЧАТЬ ВЫЛАЗКУ/})).toBeVisible();
 const cta=(await page.getByRole('button',{name:/НАЧАТЬ ВЫЛАЗКУ/}).boundingBox())!,nav=(await page.getByRole('navigation').boundingBox())!;
 expect(cta.y+cta.height).toBeLessThanOrEqual(nav.y);
 await page.screenshot({path:'test-results/lobby-375.png'});
 for(const tab of ['Казино','Банда','Город','Вылазка']){
  await page.getByRole('navigation').getByRole('button',{name:tab,exact:true}).click();
  await expect(page.locator('.screen')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
 }
 await page.getByRole('button',{name:/НАЧАТЬ ВЫЛАЗКУ/}).click();await expect(page.locator('canvas')).toBeVisible();
 await expect(page.locator('.run-hud')).toContainText('00:02',{timeout:15000});
 await page.keyboard.down('KeyD');
 await expect(page.locator('.run-hud')).toContainText('00:05',{timeout:10000});
 await page.keyboard.up('KeyD');
  await page.getByRole('button',{name:'Пауза',exact:true}).click();await expect(page.getByRole('heading',{name:'Пауза',exact:true})).toBeVisible();
 const frozen=await page.locator('.run-hud strong').innerText();
 // Проверка условия, не фиксированный sleep: HUD не должен меняться ни на одном кадре.
 await page.evaluate(()=>new Promise<void>(resolve=>{let n=0;const step=()=>{if(++n===80)resolve();else requestAnimationFrame(step);};requestAnimationFrame(step);}));
 await expect(page.locator('.run-hud strong')).toHaveText(frozen);
 await page.screenshot({path:'test-results/pause-375.png'});
 await page.getByRole('button',{name:'ЗАВЕРШИТЬ ВЫЛАЗКУ',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Вылазка окончена'})).toBeVisible({timeout:20000});
 await expect(page.getByRole('button',{name:'ЕЩЁ РАЗ →'})).toBeVisible();
  await page.getByRole('button',{name:'На район',exact:true}).click();
 await page.getByRole('button',{name:'Открыть профиль'}).click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Операции',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Награда за вылазку');await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 await page.reload();await expect(page.getByRole('button',{name:/НАЧАТЬ ВЫЛАЗКУ/})).toBeVisible();
 expect(errors).toEqual([]);
});
test('320/430: нет горизонтального скролла на четырёх вкладках',async({page})=>{
 for(const width of [320,430]){
  await page.setViewportSize({width,height:812});await page.goto('/');await expect(page.getByRole('navigation')).toBeVisible();
  for(const tab of ['Казино','Банда','Город','Вылазка']){
   await page.getByRole('navigation').getByRole('button',{name:tab,exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
   const overflow=await page.locator('.app-shell').evaluate(el=>el.scrollWidth>el.clientWidth+2);expect(overflow).toBe(false);
  }
 }
});
