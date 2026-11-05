import { copyFile,mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import process from 'node:process';
const repo=new URL('../../.local/widget-sandbox/',import.meta.url),dir=new URL('corpus/showcase/',repo);
await mkdir(dir,{recursive:true});await copyFile(new URL('../../widgets/welcome.html',import.meta.url),new URL('bot-bandit-welcome.html',dir));
console.log('Official QuickJS WidgetHost preview: http://127.0.0.1:5180/?file=showcase/bot-bandit-welcome.html&theme=dark');
const child=spawn(new URL('apps/web/node_modules/.bin/vite',repo).pathname,['--host','127.0.0.1','--port','5180','--strictPort'],{cwd:new URL('apps/web/',repo),stdio:'inherit'});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??0;});
