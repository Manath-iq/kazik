import { setEffectsPreference,useEffectsSettings } from '../app/effects';
export function EffectsToggle({compact=false}:{compact?:boolean}){
 const {enabled,reduced}=useEffectsSettings();
 return <div><label className="toggle-row">Пиксельные эффекты<input type="checkbox" checked={enabled} onChange={e=>setEffectsPreference(e.target.checked)} aria-describedby={!compact||reduced?'effects-hint':undefined}/></label>{(!compact||reduced)&&<p className="small muted" id="effects-hint">{reduced?'В системе включено уменьшение движения: вспышки отключены.':'Вспышки и частицы. Можно отключить для спокойной игры.'}</p>}</div>;
}
