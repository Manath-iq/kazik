declare const __ART_FILES__: string[];
export const artFiles=new Set(__ART_FILES__);
export const assetUrl=(name:string)=>`${import.meta.env.BASE_URL}assets/generated/${name}.png`;
export const hasArt=(name:string)=>artFiles.has(`${name}.png`);
