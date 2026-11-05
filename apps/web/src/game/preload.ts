import { artFiles,assetUrl } from '../app/art';
import manifest from '../effects/manifest.json';
const loadModules=()=>Promise.all([import('phaser'),import('./StreetScene')]);
let modules:ReturnType<typeof loadModules>|null=null;
export function runModules(){return modules??=loadModules().catch(error=>{modules=null;throw error;});}
let warmed=false;
export function preloadRun(){
 if(warmed)return;warmed=true;void runModules().catch(()=>{});
 const urls=[...artFiles].map(file=>assetUrl(file.replace(/\.png$/,'')));
 for(const fx of Object.values(manifest))for(const sheet of fx.sheets)urls.push(`${import.meta.env.BASE_URL}assets/fx/${sheet.file}`);
 for(const url of new Set(urls)){const image=new Image();image.src=url;}
}
