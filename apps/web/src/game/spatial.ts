// Повторно используемые buckets: нет новых массивов кандидатов на каждый снаряд/моба.
export class SpatialGrid<T>{
 private cells=new Map<string,T[]>();private pool:T[][]=[];private phase=0;
 constructor(private size=48){}
 clear(){for(const bucket of this.cells.values()){bucket.length=0;this.pool.push(bucket);}this.cells.clear();this.phase=(this.phase+1)%1000000;}
 insert(item:T,x:number,y:number){const key=`${Math.floor(x/this.size)}:${Math.floor(y/this.size)}`;let bucket=this.cells.get(key);if(!bucket){bucket=this.pool.pop()??[];this.cells.set(key,bucket);}bucket.push(item);}
 nearby(x:number,y:number,radius:number,visit:(item:T)=>void|boolean){
  const minX=Math.floor((x-radius)/this.size),maxX=Math.floor((x+radius)/this.size),minY=Math.floor((y-radius)/this.size),maxY=Math.floor((y+radius)/this.size);
  for(let cy=minY;cy<=maxY;cy++)for(let cx=minX;cx<=maxX;cx++){const bucket=this.cells.get(`${cx}:${cy}`);if(bucket)for(let i=0;i<bucket.length;i++)if(visit(bucket[(i+this.phase)%bucket.length])===false)return;}
 }
}
