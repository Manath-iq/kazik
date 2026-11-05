import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root=new URL('../../',import.meta.url).pathname,dir=new URL('../../.local/widget-sandbox',import.meta.url).pathname;
if(!existsSync(dir))execFileSync('git',['clone','--depth','1','--branch','v0.1.1','https://github.com/TelegramMessenger/widget-sandbox.git',dir],{cwd:root,stdio:'inherit'});
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:dir,encoding:'utf8'}).trim();
if(revision!=='e9654cab644145521e754004de220aa4ed0f3ad1')throw new Error('Unexpected sandbox revision');
execFileSync('npx',['--yes','pnpm@12.10.1','install','--frozen-lockfile'],{cwd:dir,stdio:'inherit'});
