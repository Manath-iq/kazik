import { readFile,writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { Buffer } from 'node:buffer';
const root=new URL('../../',import.meta.url),file=new URL('widgets/welcome.html',root);
const html=await readFile(file,'utf8'),raw=Buffer.byteLength(html),gzip=gzipSync(html,{level:6}).length;
assert(raw<=32768&&gzip<=4096,`Widget too large: ${raw}/${gzip}`);
assert(!/<(?:input|form|iframe|link)\b|<script[^>]+src=|@font-face|@import|\bfetch\s*\(/i.test(html),'Outside widget profile');
const { runWidget }=await import(pathToFileURL(new URL('.local/widget-sandbox/packages/core/scripts/sandbox-node.ts',root).pathname).href);
const initial=await runWidget(html,{theme:'dark',timerRounds:0,policy:'strict',probes:['TelegramWidget.profile','document.getElementById("play").textContent']});
const button=initial.renderOps.find(op=>op.op==='el'&&op.tag==='button');assert(button,'Play button survives validation');
for(const theme of ['dark','light']){
 const real=await runWidget(html,{theme,policy:'strict',timerRounds:0,events:[{type:'click',targetId:button.id,gesture:1}],cpuLimitMs:500});
 assert(real.actions.some(a=>a.kind==='openTelegramLink'&&a.url==='https://t.me/kaziktesttg_bot?start=play'),'Real tap must open Telegram link');
 assert(real.actions.some(a=>a.kind==='haptic'),'Supported haptic');
 assert(!real.diags.length,JSON.stringify(real.diags));assert(!real.logs.some(log=>log.level==='error'),JSON.stringify(real.logs));assert(real.timers<=1);
}
const synthetic=await runWidget(html,{policy:'strict',timerRounds:0,events:[{type:'click',targetId:button.id}]});
assert(!synthetic.actions.some(a=>a.kind==='openTelegramLink'),'Synthetic clicks may not open links');
const missing=await runWidget(html.replace('var tw=window.TelegramWidget','var tw=undefined'),{timerRounds:0});assert(!missing.logs.some(log=>log.level==='error'));
const result={verifiedAt:new Date().toISOString(),sandbox:'v0.1.1',commit:'e9654cab644145521e754004de220aa4ed0f3ad1',profile:1,raw,gzip,quickjs:true,validatorDiagnostics:0,realTap:true,syntheticBlocked:true,noSdkSafe:true,themes:['light','dark'],publicSendWidget:'404 Not Found; disabled',launch:'start=play → inline web_app; BotFather Main Mini App not configured'};
await writeFile(new URL('widgets/validation.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
process.exitCode=0;
