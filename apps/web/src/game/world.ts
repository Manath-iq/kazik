export type Point={x:number;y:number};
export type Rect={left:number;right:number;top:number;bottom:number};
// Footprints по непрозрачному корпусу/основанию PNG, не по прозрачной рамке или тени.
export const PROP_BODIES:Record<string,Rect>={
 'prop-car':{left:-14,right:14,top:-64,bottom:7},
 'prop-fence':{left:-30,right:30,top:-5,bottom:1},
 'prop-bin':{left:-8,right:8,top:-11,bottom:1},
 'prop-lamp':{left:-4,right:4,top:-5,bottom:1},
};
export const HERO_BODY={halfWidth:8,halfHeight:5,offsetY:-4};

export function overlapBody(p:Point,halfWidth:number,halfHeight:number,r:Rect){return p.x+halfWidth>r.left&&p.x-halfWidth<r.right&&p.y+halfHeight>r.top&&p.y-halfHeight<r.bottom;}
export function unstickBody(p:Point,halfWidth:number,halfHeight:number,obstacles:readonly Rect[]){
 for(let pass=0;pass<4;pass++){
  let corrected=false;
  for(const r of obstacles){
   if(!overlapBody(p,halfWidth,halfHeight,r))continue;
   const left=r.left-halfWidth-p.x,right=r.right+halfWidth-p.x,top=r.top-halfHeight-p.y,bottom=r.bottom+halfHeight-p.y;
   const x=Math.abs(left)<Math.abs(right)?left:right,y=Math.abs(top)<Math.abs(bottom)?top:bottom;
   if(Math.abs(x)<Math.abs(y))p.x+=x;else p.y+=y;corrected=true;
  }if(!corrected)break;
 }
}
export function moveBody(p:Point,dx:number,dy:number,halfWidth:number,halfHeight:number,obstacles:readonly Rect[]){
 // Небольшие подшаги + sweep по каждой оси: нельзя пройти тонкий забор на рывке/низком FPS.
 const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/Math.max(4,Math.min(halfWidth,halfHeight))));
 for(let step=0;step<steps;step++){
  const oldX=p.x,oldY=p.y;let nextX=p.x+dx/steps;
  for(const r of obstacles){if(p.y+halfHeight<=r.top||p.y-halfHeight>=r.bottom)continue;
   if(dx>0&&oldX+halfWidth<=r.left&&nextX+halfWidth>r.left)nextX=Math.min(nextX,r.left-halfWidth);
   else if(dx<0&&oldX-halfWidth>=r.right&&nextX-halfWidth<r.right)nextX=Math.max(nextX,r.right+halfWidth);
  }p.x=nextX;let nextY=p.y+dy/steps;
  for(const r of obstacles){if(p.x+halfWidth<=r.left||p.x-halfWidth>=r.right)continue;
   if(dy>0&&oldY+halfHeight<=r.top&&nextY+halfHeight>r.top)nextY=Math.min(nextY,r.top-halfHeight);
   else if(dy<0&&oldY-halfHeight>=r.bottom&&nextY-halfHeight<r.bottom)nextY=Math.max(nextY,r.bottom+halfHeight);
  }p.y=nextY;
 }
}
export function segmentRectTime(ax:number,ay:number,bx:number,by:number,r:Rect){
 const dx=bx-ax,dy=by-ay;let enter=0,exit=1;
 if(dx===0){if(ax<r.left||ax>r.right)return Infinity;}else{const t1=(r.left-ax)/dx,t2=(r.right-ax)/dx;enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));}
 if(dy===0){if(ay<r.top||ay>r.bottom)return Infinity;}else{const t1=(r.top-ay)/dy,t2=(r.bottom-ay)/dy;enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));}
 return enter<=exit&&exit>0&&enter<=1?enter:Infinity;
}
export function segmentCircleTime(ax:number,ay:number,bx:number,by:number,cx:number,cy:number,radius:number){
 const dx=bx-ax,dy=by-ay,ox=ax-cx,oy=ay-cy,a=dx*dx+dy*dy,c=ox*ox+oy*oy-radius*radius;
 if(c<=0)return 0;if(!a)return Infinity;const b=ox*dx+oy*dy,disc=b*b-a*c;
 if(disc<0)return Infinity;const t=(-b-Math.sqrt(disc))/a;return t>=0&&t<=1?t:Infinity;
}
export function obstacleWaypoint(start:Point,target:Point,halfWidth:number,halfHeight:number,obstacles:readonly Rect[]):Point|null{
 let hit:Rect|null=null,best=Infinity;
 for(const r of obstacles){const expanded={left:r.left-halfWidth,right:r.right+halfWidth,top:r.top-halfHeight,bottom:r.bottom+halfHeight},time=segmentRectTime(start.x,start.y,target.x,target.y,expanded);if(time<best){best=time;hit=expanded;}}
 if(!hit)return null;
 let waypoint:Point|null=null,cost=Infinity;
 for(const x of [hit.left-3,hit.right+3])for(const y of [hit.top-3,hit.bottom+3]){
  const distance=Math.hypot(x-start.x,y-start.y);if(distance<2||segmentRectTime(start.x,start.y,x,y,hit)!==Infinity)continue;
  const score=distance+Math.hypot(target.x-x,target.y-y)+(segmentRectTime(x,y,target.x,target.y,hit)!==Infinity?Math.min(hit.right-hit.left,hit.bottom-hit.top):0);
  if(score<cost){cost=score;waypoint={x,y};}
 }return waypoint;
}

export type Attraction={attracted:boolean;speed:number};
export function advancePickup(p:Point,target:Point,state:Attraction,magnet:number,playerSpeed:number,dt:number){
 const dx=target.x-p.x,dy=target.y-p.y,sq=dx*dx+dy*dy;
 if(!state.attracted&&sq>magnet*magnet)return false;
 state.attracted=true;const distance=Math.sqrt(sq);
 state.speed=Math.min(720,Math.max(state.speed,360,playerSpeed*1.8)+1200*dt);
 const step=state.speed*dt;
 if(distance<=10+step){p.x=target.x;p.y=target.y;return true;}
 p.x+=dx/distance*step;p.y+=dy/distance*step;return false;
}
