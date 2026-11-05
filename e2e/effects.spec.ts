import { test,expect } from '@playwright/test';

test('9 pixelfx: правильные слои, pause/resume и выключение без очереди',async({page})=>{
 const errors:string[]=[],apiCalls:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiCalls.push(r.url());});
 await page.goto('/__game-review?case=effects');const canvas=page.locator('canvas');await expect(canvas).toBeVisible();
 await expect.poll(async()=>Object.keys(JSON.parse(await canvas.getAttribute('data-fx-played')??'{}')).length).toBe(9);
 await expect(canvas).toHaveAttribute('data-fx-active',/[1-9]/);await page.getByRole('button',{name:'Пауза',exact:true}).click();
 const frozen=await canvas.getAttribute('data-fx-frames');
 await page.evaluate(()=>new Promise<void>(resolve=>{let n=0;const step=()=>{if(++n===40)resolve();else requestAnimationFrame(step);};requestAnimationFrame(step);}));
 await expect(canvas).toHaveAttribute('data-fx-frames',frozen!);await page.screenshot({path:'test-results/pixelfx-gallery-375.png'});
 await page.getByRole('checkbox',{name:'Пиксельные эффекты'}).uncheck();await page.getByRole('button',{name:'Продолжить',exact:true}).click();await expect(canvas).toHaveAttribute('data-fx-active','0');
 await page.reload();await expect(page.getByRole('checkbox',{name:'Пиксельные эффекты'})).not.toBeChecked();await expect(canvas).toHaveAttribute('data-fx-active','0');
 await page.getByRole('checkbox',{name:'Пиксельные эффекты'}).check();await expect(canvas).toHaveAttribute('data-fx-active',/[1-9]/);expect(apiCalls).toEqual([]);expect(errors).toEqual([]);
});

test('настоящие combat/pickup/upgrade paths вызывают разные эффекты; стену нельзя прострелить',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/__game-review?case=feedback');const canvas=page.locator('canvas');
 await expect.poll(async()=>{const played=JSON.parse(await canvas.getAttribute('data-fx-played')??'{}');return ['muzzle','hit','crit','death','xp','coin','heal','level'].filter(id=>played[id]>0).length;},{timeout:18000}).toBe(8);
 await page.screenshot({path:'test-results/pixelfx-combat-375.png'});
 await page.goto('/__game-review?case=wall');await expect.poll(async()=>JSON.parse(await canvas.getAttribute('data-fx-played')??'{}').wall??0).toBeGreaterThan(0);expect(errors).toEqual([]);
});

test('72 моба + плотные VFX: фиксированный лимит спрайтов, reduced motion без изменения игры',async({page})=>{
 await page.goto('/__game-review?case=fx-stress');const canvas=page.locator('canvas');await expect(canvas).toHaveAttribute('data-enemies','72');
 const sample=await page.evaluate(()=>new Promise<{maxFx:number;minObjects:number;maxObjects:number;frames:number}>(resolve=>{
  let frames=0,maxFx=0,minObjects=Infinity,maxObjects=0;const step=()=>{const d=document.querySelector('canvas')!.dataset;maxFx=Math.max(maxFx,Number(d.fxActive));minObjects=Math.min(minObjects,Number(d.drawables));maxObjects=Math.max(maxObjects,Number(d.drawables));if(++frames===360)resolve({maxFx,minObjects,maxObjects,frames});else requestAnimationFrame(step);};requestAnimationFrame(step);
 }));
 expect(sample.maxFx).toBeGreaterThan(0);expect(sample.maxFx).toBeLessThanOrEqual(16);expect(sample.maxObjects-sample.minObjects).toBeLessThanOrEqual(30);
 await page.emulateMedia({reducedMotion:'reduce'});await expect(page.getByText(/В системе включено уменьшение движения/)).toBeVisible();await expect(canvas).toHaveAttribute('data-fx-active','0');
 const before=Number(await canvas.getAttribute('data-sim-seconds'));await expect.poll(async()=>Number(await canvas.getAttribute('data-sim-seconds'))).toBeGreaterThan(before+.2);await expect(canvas).toHaveAttribute('data-enemies','72');
 await page.screenshot({path:'test-results/pixelfx-reduced-motion-375.png'});
});

test('настройка есть в профиле и паузе; успешная покупка только после ответа, ошибка без салюта',async({page})=>{
 // Только изолированная UI fixture; денежные транзакции проверяются в API/D1 tests.
 let purchased=false,attempt=0,respond:(()=>void)|undefined;
 await page.route('**/api/me',async route=>{const response=await route.fetch(),json=await response.json();json.data.balance=50000;json.data.owned=purchased?[{item_id:'kiosk',purchased_at:Date.now(),last_claim_at:Date.now()}]:[];await route.fulfill({json});});
 await page.route('**/api/businesses/buy',async route=>{attempt++;if(attempt===1){await route.fulfill({status:409,json:{error:{message:'Проверочная ошибка покупки'}}});return;}await new Promise<void>(resolve=>{respond=resolve;});purchased=true;await route.fulfill({json:{data:{purchased:true}}});});
 await page.goto('/');await page.getByRole('button',{name:'Открыть профиль'}).click();await expect(page.getByRole('checkbox',{name:'Пиксельные эффекты'})).toBeChecked();await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 await page.getByRole('navigation').getByRole('button',{name:'Город',exact:true}).click();await page.getByRole('button',{name:'Бизнес',exact:true}).click();await page.getByRole('button',{name:'КУПИТЬ ЗА $3 000 000',exact:true}).click();await page.getByRole('button',{name:'ПОДТВЕРДИТЬ',exact:true}).click();
 await expect(page.getByRole('status')).toHaveText(/Проверочная ошибка покупки/);await expect(page.locator('.pixel-burst')).toHaveCount(0);await page.getByRole('status').click();
 await page.getByRole('button',{name:'ПОДТВЕРДИТЬ',exact:true}).click();await expect.poll(()=>Boolean(respond)).toBe(true);await expect(page.locator('.pixel-burst')).toHaveCount(0);respond!();
 await expect(page.locator('.toast.with-fx')).toContainText('покупка сохранена');await expect(page.locator('[data-fx="level"]')).toBeVisible();await expect(page.locator('[data-fx="level"]')).toHaveCount(0,{timeout:4000});
 await page.getByRole('navigation').getByRole('button',{name:'Вылазка',exact:true}).click();await page.getByRole('button',{name:/НАЧАТЬ ВЫЛАЗКУ/}).click();await expect(page.locator('canvas')).toBeVisible();await page.getByRole('button',{name:'Пауза',exact:true}).click();await page.getByRole('checkbox',{name:'Пиксельные эффекты'}).uncheck();await page.getByRole('button',{name:'ПРОДОЛЖИТЬ →',exact:true}).click();await expect(page.locator('canvas')).toHaveAttribute('data-fx-active','0');
});
