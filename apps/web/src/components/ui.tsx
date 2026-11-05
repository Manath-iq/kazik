import { useEffect,useRef,useState } from 'react';
import type { ReactNode,ButtonHTMLAttributes } from 'react';
import { assetUrl,hasArt } from '../app/art';
import { hasUtilityIcon,UtilityIcon } from './UtilityIcon';
export { formatGameMoney as money,formatNumber as numberText } from '@street/shared';
export const time=(s:number)=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
export function Button({children,secondary=false,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{secondary?:boolean}){
 return <button {...props} className={`pixel-button ${secondary?'secondary':''} ${props.className??''}`}>{children}</button>;
}
export function Icon({name,size=24}:{name:string;size?:number}){
 if(hasUtilityIcon(name))return <UtilityIcon name={name} size={size}/>;
 if(hasArt(`icon-${name}`))return <img src={assetUrl(`icon-${name}`)} width={size} height={size} alt="" className="pixel-image"/>;
 // Временные UI-символы; заменяются согласованными ассетами автоматически.
 const glyphs:Record<string,string>={run:'↗',casino:'\u2660\uFE0E',gang:'▥',city:'▤',sound:'\u266A\uFE0E',cup:'\u265C\uFE0E',coin:'$',close:'×',back:'←'};
 return <span aria-hidden="true" className={`icon icon-${name}`} style={{fontSize:size}}>{glyphs[name]??'+'}</span>;
}
export function Panel({children,className=''}:{children:ReactNode;className?:string}){return <section className={`panel ${className}`}>{children}</section>;}
export function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const el=ref.current;el?.showModal();return ()=>el?.close();},[]);
  return <dialog ref={ref} className="modal" aria-label={title} onCancel={e=>{e.preventDefault();onClose();}}>
  <header className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="Закрыть" onClick={onClose}><Icon name="close" size={20}/></button></header><div className="modal-body">{children}</div>
 </dialog>;
}
export function Empty({title,children}:{title:string;children?:ReactNode}){return <div className="empty"><span className="empty-cross" aria-hidden="true">+</span><h3>{title}</h3>{children&&<p>{children}</p>}</div>;}
export function useClock(enabled=true,period=1000){const [now,setNow]=useState(Date.now());useEffect(()=>{if(!enabled)return;setNow(Date.now());const id=setInterval(()=>{if(!document.hidden)setNow(Date.now());},period);return ()=>clearInterval(id);},[enabled,period]);return now;}
export function ScreenHeading({title,children}:{title:string;children?:ReactNode}){return <header className="screen-heading"><h1>{title}</h1><div className="screen-tools">{children}</div></header>;}
export function ToolButton({label,icon,onClick}:{label:string;icon:string;onClick:()=>void}){return <button className="icon-button" aria-label={label} title={label} onClick={onClick}><Icon name={icon} size={20}/></button>;}
export function PagedList<T,>({items,render,pageSize=5,empty}:{items:T[];render:(item:T,index:number)=>ReactNode;pageSize?:number;empty?:ReactNode}){
 const [page,setPage]=useState(0),pages=Math.max(1,Math.ceil(items.length/pageSize)),current=Math.min(page,pages-1),start=current*pageSize;
 return <div className="paged-list"><div className="paged-rows">{items.length?items.slice(start,start+pageSize).map((item,i)=>render(item,start+i)):empty}</div>{pages>1&&<div className="page-controls"><button className="icon-button" aria-label="Предыдущая страница" disabled={current===0} onClick={()=>setPage(current-1)}><Icon name="back" size={20}/></button><span aria-live="polite">{current+1} / {pages}</span><button className="icon-button" aria-label="Следующая страница" disabled={current===pages-1} onClick={()=>setPage(current+1)}><Icon name="next" size={20}/></button></div>}</div>;
}
export function PlayerFigure({fallen=false}:{fallen?:boolean}){return hasArt('player')?<div className={`player-figure ${fallen?'fallen':''}`} style={{backgroundImage:`url(${assetUrl('player')})`}} aria-hidden="true"/>:null;}
