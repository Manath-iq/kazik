export const wheelOrder=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
export function wheelPoint(angle:number,radius:number){const a=angle*Math.PI/180;return {x:160+Math.cos(a)*radius,y:160+Math.sin(a)*radius};}
export function wheelPocket(index:number){
 const step=360/37,start=index*step-90-step/2,end=start+step;
 const a=wheelPoint(start,142),b=wheelPoint(end,142),c=wheelPoint(end,106),d=wheelPoint(start,106);
 return `M${a.x} ${a.y}A142 142 0 0 1 ${b.x} ${b.y}L${c.x} ${c.y}A106 106 0 0 0 ${d.x} ${d.y}Z`;
}
export function rocketPosition(elapsed:number,w:number,h:number){
 const seconds=Math.max(0,elapsed),distance=seconds*.22+seconds*seconds*.025,t=distance/(1+distance);
 return {x:18+(w-42)*t,y:h-18-(h-44)*t,startX:18,startY:h-18};
}
