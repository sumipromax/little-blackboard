import {api} from './api';
import type {PlayerAdapter} from './sdk';
/** Independent feature module. Integrators supply a player adapter and button mounts. */
export class BlackboardPlugin {
 private cleanups:(()=>void)[]=[];
 constructor(private adapter:PlayerAdapter,private layout:()=> 'video'|'ppt'|'fullscreen',private enabled:()=>boolean=()=>true){}
 mount(button:HTMLButtonElement,kind:'highlight'|'difficulty'){
  let active=false,timer:ReturnType<typeof setInterval>|undefined;
  const label=button.innerHTML;
  const click=async()=>{
   if(active||!this.enabled())return;active=true;button.dataset.busy='true';button.disabled=true;
   try {
    const position=this.adapter.position();
    const mark=await api('/marks',{...position,kind,layout:this.layout()});
    const deadline=performance.now()+Math.max(0,mark.undoUntil-mark.serverNow);
    const line=document.createElement('div');line.className='undo-toast';line.dataset.kind=kind;line.setAttribute('role','status');
    const text=document.createElement('span'),undo=document.createElement('button');undo.textContent='撤销';undo.className='link';line.append(text,undo);button.closest('.player-shell')!.append(line);
    const finish=()=>{clearInterval(timer);line.remove();active=false;delete button.dataset.busy;button.disabled=!this.enabled();button.innerHTML=label;};
    const tick=()=>{const seconds=Math.ceil((deadline-performance.now())/1000);if(seconds<=0){finish();return;}text.textContent=`${kind==='highlight'?'重点':'难点'}已记录 · ${seconds}秒`;};
    undo.onclick=async()=>{undo.disabled=true;try{await api('/marks/'+mark.id+'/undo',{});finish();}catch(e:any){text.textContent=e.message;}};
    tick();if(active)timer=setInterval(tick,100);this.cleanups.push(finish);
   }catch(e){active=false;button.disabled=false;throw e;}
  };
  const handler=()=>click().catch(e=>{document.dispatchEvent(new CustomEvent('blackboard:error',{detail:e.message}));});
  button.addEventListener('click',handler);this.cleanups.push(()=>button.removeEventListener('click',handler));
 }
 dispose(){this.cleanups.forEach(fn=>fn());this.cleanups=[];}
}
