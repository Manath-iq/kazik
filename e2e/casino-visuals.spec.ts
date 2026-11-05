import { test,expect } from '@playwright/test';
test('рулетка: все 37 чисел видимы и на коротком мобильном экране',async({page})=>{
 await page.goto('/#casino');const numbers=page.locator('.roulette-pocket-number');await expect(numbers).toHaveCount(37);
 for(const viewport of [{width:375,height:812},{width:320,height:640}]){
  await page.setViewportSize(viewport);for(const number of await numbers.all())await expect(number).toBeVisible();
  const bounds=(await page.locator('.roulette-dial').boundingBox())!;expect(bounds.width).toBeGreaterThan(130);expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width);
 }
 await page.setViewportSize({width:375,height:812});await page.screenshot({path:'test-results/casino-wheel-fixed.png'});
});
test('Crash: линия остаётся видимой при отключённых эффектах',async({page})=>{
 // Visual-only fixture, no fake money operations or production endpoints.
 await page.addInitScript(()=>localStorage.setItem('sl-effects','off'));
 await page.route('**/api/casino/live/crash/state',route=>route.fulfill({json:{data:{round:{id:'00000000-0000-4000-8000-000000000001',game:'crash',sequence:1,phase:'playing',startedAt:Date.now()-5000,bettingEndsAt:Date.now()-5000,phaseEndsAt:null},serverNow:Date.now(),bet:null,previousBet:null,balance:280,recent:[]}}}));
 await page.routeWebSocket('**/api/casino/live/crash/socket*',()=>{});
 await page.goto('/#casino');await page.getByRole('button',{name:'Ракета',exact:true}).click();const canvas=page.locator('.live-space canvas');await expect(canvas).toBeVisible();
 await expect.poll(()=>canvas.evaluate(el=>{const c=el as HTMLCanvasElement,bytes=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let gold=0;for(let i=0;i<bytes.length;i+=4)if(bytes[i]>220&&bytes[i+1]>150&&bytes[i+2]<100)gold++;return gold;})).toBeGreaterThan(35);
 await expect(page.locator('.crash-value')).not.toHaveText('×1.00');
});
