import { useEffect,useRef,useState } from 'react';
import type { ReactNode,ButtonHTMLAttributes } from 'react';
import { assetUrl,hasArt } from '../app/art';
export const money=(n:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n);
export const time=(s:number)=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
export function Button({children,secondary=false,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{secondary?:boolean}){
 return <button {...props} className={`pixel-button ${secondary?'secondary':''} ${props.className??''}`}>{children}</button>;
}
export function Icon({name,size=24}:{name:string;size?:number}){
 if(hasArt(`icon-${name}`))return <img src={assetUrl(`icon-${name}`)} width={size} height={size} alt="" className="pixel-image"/>;
 // Временные UI-символы; заменяются согласованными ассетами автоматически.
 const glyphs:Record<string,string>={run:'↗',casino:'\u2660\uFE0E',gang:'▥',city:'▤',sound:'\u266A\uFE0E',cup:'\u265C\uFE0E',coin:'$',close:'×',back:'←'};
 return <span aria-hidden="true" className={`icon icon-${name}`} style={{fontSize:size}}>{glyphs[name]??'+'}</span>;
}
export function Panel({children,className=''}:{children:ReactNode;className?:string}){return <section className={`panel ${className}`}>{children}</section>;}
export function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const el=ref.current;el?.showModal();return ()=>el?.close();},[]);
 return <dialog ref={ref} className="modal" onCancel={e=>{e.preventDefault();onClose();}}>
  <header className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="Закрыть" onClick={onClose}>×</button></header>{children}
 </dialog>;
}
export function Empty({title,children}:{title:string;children?:ReactNode}){return <div className="empty"><span className="empty-cross" aria-hidden="true">+</span><h3>{title}</h3>{children&&<p>{children}</p>}</div>;}
export function useClock(enabled=true,period=1000){const [now,setNow]=useState(Date.now());useEffect(()=>{if(!enabled)return;setNow(Date.now());const id=setInterval(()=>{if(!document.hidden)setNow(Date.now());},period);return ()=>clearInterval(id);},[enabled,period]);return now;}
export function ScreenHeading({kicker,title,children}:{kicker:string;title:string;children?:ReactNode}){return <header className="screen-heading"><span className="eyebrow">{kicker}</span><h1>{title}</h1>{children}</header>;}
