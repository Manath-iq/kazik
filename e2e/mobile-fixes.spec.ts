import { test,expect } from '@playwright/test';

test('машина блокирует героя, подсказки снизу нет, canvas до нижнего края',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/НАЧАТЬ ВЫЛАЗКУ/}).click();const canvas=page.locator('canvas');await expect(canvas).toBeVisible();await expect(canvas).toHaveAttribute('data-player-y');
 await expect(page.locator('.game-hint')).toHaveCount(0);
 const fill=await page.locator('.game-stage').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.querySelector('canvas')!.getBoundingClientRect();return {bottom:Math.abs(a.bottom-b.bottom),height:Math.abs(a.height-b.height)};});expect(fill.bottom).toBeLessThan(2);expect(fill.height).toBeLessThan(2);
 await page.keyboard.down('KeyS');await expect.poll(async()=>Number(await canvas.getAttribute('data-player-y'))).toBeGreaterThan(80);await page.keyboard.up('KeyS');
 await page.keyboard.down('KeyD');await expect.poll(async()=>Number(await canvas.getAttribute('data-player-x'))).toBeGreaterThan(125);
 // Ещё 45 реальных кадров продолжаем давить в корпус машины, а не просто отпускаем ввод на границе.
 await page.evaluate(()=>new Promise<void>(resolve=>{let frames=0;function step(){if(++frames===45)resolve();else requestAnimationFrame(step);}requestAnimationFrame(step);}));
 expect(Number(await canvas.getAttribute('data-player-x'))).toBeLessThanOrEqual(128.1);await page.keyboard.up('KeyD');
 await page.screenshot({path:'test-results/car-collision-375.png'});
 await page.getByRole('button',{name:'Пауза',exact:true}).click();await page.getByRole('button',{name:'ЗАВЕРШИТЬ ВЫЛАЗКУ',exact:true}).click();await expect(page.locator('.result-income')).toBeVisible();
});

test('магнит собирает XP и деньги на максимальной скорости без остановки',async({page})=>{
 // Отдельная локальная review-сцена, без API и начисления настоящему профилю.
 await page.goto('/__game-review?case=magnet');const canvas=page.locator('canvas');await expect(canvas).toBeVisible();
 await expect(canvas).toHaveAttribute('data-loot','0');await expect(page.getByText(/\$70 · XP 10/)).toBeVisible();
 expect(Number(await canvas.getAttribute('data-player-x'))).toBeGreaterThan(30);
 await page.screenshot({path:'test-results/magnet-moving-375.png'});
});

test('72 моба: ограниченный neighbor budget, нет роста display objects при коротком прогоне',async({page})=>{
 await page.goto('/__game-review?case=crowd');const canvas=page.locator('canvas');await expect(canvas).toHaveAttribute('data-enemies','72');
 const initial=Number(await canvas.getAttribute('data-drawables'));
 await page.evaluate(()=>new Promise<void>(resolve=>{let frames=0;function step(){if(++frames===180)resolve();else requestAnimationFrame(step);}requestAnimationFrame(step);}));
 expect(Number(await canvas.getAttribute('data-neighbor-checks'))).toBeLessThanOrEqual(72*12);expect(Number(await canvas.getAttribute('data-drawables'))).toBeLessThanOrEqual(initial+30);
 await page.screenshot({path:'test-results/crowd-72-375.png'});
});
