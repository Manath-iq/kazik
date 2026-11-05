import { Button,PlayerFigure } from './ui';
export function RunLoading({ready=false,error='',retry}:{ready?:boolean;error?:string;retry?:()=>void}){
 return <div className={`run-loading ${ready?'scene-ready':''}`} role={ready?undefined:'status'} aria-hidden={ready||undefined}><div className="loading-scene"><PlayerFigure/><h2>{error?'Район не загрузился':'ВЫХОДИМ НА РАЙОН'}</h2>{error?<><p className="error-text">{error}</p>{retry&&<Button onClick={retry}>ПОВТОРИТЬ ЗАГРУЗКУ</Button>}</>:<div className="loading-track"><i/></div>}</div></div>;
}
