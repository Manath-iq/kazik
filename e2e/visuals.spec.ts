import {test,expect} from '@playwright/test';
test('скриншоты разделов с загруженной графикой',async({page})=>{
 await page.goto('/');await expect(page.getByRole('navigation')).toBeVisible();
 for(const [tab,file] of [['Казино','casino'],['Банда','gang'],['Город','city']]){
  await page.getByRole('navigation').getByRole('button',{name:tab,exact:true}).click();await expect(page.locator('.screen')).toBeVisible();
  if(tab==='Казино')await expect(page.locator('.roulette-wheel')).toBeVisible();
  await page.screenshot({path:`test-results/${file}-375.png`});
 }
});
