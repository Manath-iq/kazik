import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { chromium,expect } from '@playwright/test';
import process from 'node:process';
import { URLSearchParams } from 'node:url';
const url='https://street-legends-test.todominate-ai.workers.dev';
const secrets=JSON.parse(await readFile(new URL('../../.local/telegram-secrets.json',import.meta.url),'utf8'));
// Технический профиль в изолированной тестовой БД, НЕ реальный пользователь.
// Штатный Telegram SDK получает launch params; auth идёт через настоящий remote HMAC/API.
const user={id:9271849961,first_name:'Проверка выкладки',username:'release_qa'};
const init=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify(user)});
const check=[...init.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
const secret=createHmac('sha256','WebAppData').update(secrets.BOT_TOKEN).digest();
init.set('hash',createHmac('sha256',secret).update(check).digest('hex'));
const launch=new URLSearchParams({tgWebAppData:init.toString(),tgWebAppVersion:'8.0',tgWebAppPlatform:'weba',tgWebAppThemeParams:'{}'});
const report={url,fixture:'synthetic release QA; separate test database',checks:{},pageErrors:[]};
let browser;
try{
 report.checks.health=(await fetch(`${url}/api/health`)).status;
 report.checks.privateWithoutAuth=(await fetch(`${url}/api/me`)).status;
 report.checks.devLogin=(await fetch(`${url}/api/auth/dev`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status;
 if(report.checks.health!==200||report.checks.privateWithoutAuth!==401||report.checks.devLogin===200)throw new Error('API gate check failed');
 browser=await chromium.launch();
 const context=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
 const page=await context.newPage();page.on('pageerror',()=>report.pageErrors.push('uncaught page error'));
 await page.goto(`${url}/#${launch}`,{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('button',{name:/НАЧАТЬ ВЫЛАЗКУ/})).toBeVisible({timeout:30000});
 report.checks.authenticatedLobby=true;
 await mkdir(new URL('../../test-results/',import.meta.url),{recursive:true});
 await page.screenshot({path:new URL('../../test-results/deployed-lobby-375.png',import.meta.url).pathname});
 for(const name of ['Казино','Банда','Город','Вылазка']){await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();await expect(page.locator('.screen')).toBeVisible();}
 report.checks.fourTabs=true;
 await page.getByRole('button',{name:/НАЧАТЬ ВЫЛАЗКУ/}).click();await expect(page.locator('canvas')).toBeVisible({timeout:30000});
 await expect(page.locator('.run-hud strong')).toHaveText('00:02',{timeout:20000});
 await page.keyboard.down('KeyD');await expect(page.locator('.run-hud strong')).toHaveText('00:05',{timeout:10000});await page.keyboard.up('KeyD');
 await page.screenshot({path:new URL('../../test-results/deployed-run-375.png',import.meta.url).pathname});
 report.checks.realGameAndInput=true;
 await page.getByRole('button',{name:'Пауза',exact:true}).click();await page.getByRole('button',{name:'ЗАВЕРШИТЬ ВЫЛАЗКУ',exact:true}).click();
 await expect(page.locator('.result-income')).toBeVisible({timeout:30000});report.checks.remoteResultSaved=true;
 await page.reload();await expect(page.getByRole('button',{name:/НАЧАТЬ ВЫЛАЗКУ/})).toBeVisible({timeout:30000});
 report.checks.reopen=true;report.checks.noHorizontalOverflow=await page.locator('html').evaluate(el=>el.scrollWidth<=375);
 if(report.pageErrors.length)throw new Error('Page errors');
 console.log(JSON.stringify(report));
}catch{report.failed=true;console.error('Remote smoke failed; see .local/deploy-qa.json. No credential values logged.');process.exitCode=1;}
finally{await browser?.close();await writeFile(new URL('../../.local/deploy-qa.json',import.meta.url),JSON.stringify(report,null,2),{mode:0o600});}
