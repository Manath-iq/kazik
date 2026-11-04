let context:AudioContext|undefined;
export function sound(kind:'shot'|'pickup'|'hit'|'level'){
 if(localStorage.getItem('sl-sound')!=='on')return;
 try{
  context??=new AudioContext();if(context.state==='suspended')void context.resume();
  const o=context.createOscillator(),g=context.createGain(),t=context.currentTime;
  o.type=kind==='shot'?'square':'triangle';o.frequency.setValueAtTime({shot:130,pickup:660,hit:70,level:440}[kind],t);
  o.frequency.exponentialRampToValueAtTime(kind==='level'?880:kind==='pickup'?990:35,t+0.08);
  g.gain.setValueAtTime(0.025,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.1);
  o.connect(g);g.connect(context.destination);o.start(t);o.stop(t+0.12);
 }catch{/* Аудио не должно блокировать игровой цикл. */}
}
