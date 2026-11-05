import { test,expect } from '@playwright/test';
test('×1000: кошелёк/цены/зарплата/ставки совпадают, статистика не масштабируется, 320px без overflow',async({page})=>{
 await page.setViewportSize({width:320,height:812});
 await page.route('**/api/me',async route=>{const response=await route.fetch(),json=await response.json();json.data.balance=27000;json.data.total_kills=27;json.data.owned=[];json.data.job=null;json.data.gang=null;await route.fulfill({json});});
 let submitted=0;
 await page.route('**/api/casino/roulette/spin',route=>{submitted=route.request().postDataJSON().stake;return route.fulfill({json:{data:{id:'local-ui-only',game_type:'roulette',stake:submitted,status:'finished',payout:submitted*2,number:1,started_at:Date.now(),serverNow:Date.now(),version:0}}});});
 await page.goto('/');await expect(page.getByRole('button',{name:'Кошелёк: 27 000 000 игровых долларов'})).toBeVisible();
 await page.getByRole('button',{name:'Открыть профиль'}).click();await expect(page.getByRole('dialog').locator('.stats-grid')).toContainText('27противников');await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 for(const name of ['Город','Банда','Казино']){
  await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  if(name==='Город'){await expect(page.getByText(/\+\$120\s000/)).toBeVisible();await page.getByRole('button',{name:'Бизнес',exact:true}).click();await expect(page.getByRole('button',{name:'КУПИТЬ ЗА $3 000 000',exact:true})).toBeVisible();}
  if(name==='Банда')await expect(page.getByRole('button',{name:'СОЗДАТЬ · $1 000 000',exact:true})).toBeVisible();
 }
 await expect(page.locator('#stake')).toHaveValue('50000');await page.locator('#stake').fill('100000');await page.getByRole('button',{name:'КРУТИТЬ КОЛЕСО →',exact:true}).click();await expect.poll(()=>submitted).toBe(100);
});
