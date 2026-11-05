import manifest from './manifest.json';

export const FX_MANIFEST=manifest;
export type FxId=keyof typeof manifest;
export type FxMeta=(typeof manifest)[FxId];
export const FX_IDS=Object.keys(manifest) as FxId[];
export const FX_CAPACITY=16; // Actual sprites, including BOTH level-up layers.
export const FX_RESERVED=3;
export const FX_STYLE:Record<FxId,{priority:number;cooldown:number;maxActive:number;scale:number;alpha:number}>={
 muzzle:{priority:1,cooldown:110,maxActive:3,scale:.6,alpha:.85},
 hit:{priority:2,cooldown:40,maxActive:5,scale:.5,alpha:.9},
 crit:{priority:3,cooldown:75,maxActive:3,scale:.5,alpha:.95},
 wall:{priority:1,cooldown:90,maxActive:3,scale:.5,alpha:.8},
 death:{priority:2,cooldown:65,maxActive:4,scale:.65,alpha:.85},
 xp:{priority:1,cooldown:150,maxActive:2,scale:.45,alpha:.7},
 coin:{priority:1,cooldown:150,maxActive:2,scale:.5,alpha:.8},
 heal:{priority:4,cooldown:200,maxActive:1,scale:.75,alpha:.9},
 level:{priority:4,cooldown:500,maxActive:1,scale:.8,alpha:.85},
};
export function fxKey(id:FxId,layer:string){return `fx-${id}-${layer}`;}
export function fxUrl(file:string){return `${import.meta.env.BASE_URL}assets/fx/${file}`;}
export function shouldPlayEffects(enabled:boolean,reducedMotion:boolean,visible:boolean){return enabled&&!reducedMotion&&visible;}
