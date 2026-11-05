import { test,expect } from '@playwright/test';
test('общий серверный раунд, компактные ставки и центрированный dialog на 320/375/430',async({page,context})=>{
 await page.goto('/');await expect(page.getByRole('navigation')).toBeVisible();
 const statePromise=page.waitForResponse(r=>r.url().includes('/casino/live/roulette/state')&&r.ok());
 await page.getByRole('navigation').getByRole('button',{name:'Казино',exact:true}).click();const state=await (await statePromise).json();
 await expect(page.locator('.connection-dot')).toHaveClass(/online/);
 await expect(page.getByRole('button',{name:/КРУТИТЬ|ЗАПУСТИТЬ/})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'ВА-БАНК',exact:true})).toBeVisible();
 const second=await context.newPage();const secondState=second.waitForResponse(r=>r.url().includes('/casino/live/roulette/state')&&r.ok());await second.goto('/#casino');const other=await (await secondState).json();expect(other.data.round.id).toBe(state.data.round.id);await second.close();
 for(const width of [320,375,430]){
  await page.setViewportSize({width,height:812});await page.getByRole('button',{name:'Правила казино',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();const box=(await dialog.boundingBox())!;expect(Math.abs(box.x-(width-box.x-box.width))).toBeLessThan(2);expect(box.x).toBeGreaterThanOrEqual(15);expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 }
});
