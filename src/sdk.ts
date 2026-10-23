// The feature uses the official watch SDK, with all account signing on the server.
import {api} from './api';
import {mountChat,type ChatConnection} from './chat';
export type Position={sessionId:string;channelId:string;mediaTime:number|null;mediaDate:number|null;timing:'live'|'replay';playerTime?:number|null};
export type PlayerAdapter={position:()=>Position;seek:(seconds:number)=>Promise<void>;dispose:()=>void};
export type ConnectionState={liveStatus:string;sessionId:string;playerReady:boolean;error?:string};
let sdkLoading:Promise<void>|undefined;
async function loadSdk(){
 if((window as any).PolyvLiveWatchSDK)return;
 if(!sdkLoading)sdkLoading=new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src='https://websdk.videocc.net/live-watch-sdk/2.20.0/lib/polyv-live-watch-sdk.umd.js';const timer=setTimeout(()=>{script.remove();sdkLoading=undefined;reject(new Error('观看页SDK加载超时'));},20000);script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);sdkLoading=undefined;reject(new Error('观看页SDK加载失败'));};document.head.append(script);});
 await sdkLoading;
}
export async function connectPolyv(container:HTMLElement,channelId:string,onSession:(id:string)=>Promise<void>,onState:(state:ConnectionState)=>void=()=>{},options:{chat?:boolean;chatOnly?:boolean}={}):Promise<PlayerAdapter>{
 await loadSdk();const sdk=(window as any).PolyvLiveWatchSDK;
 if(!sdk?.createWatchCore)throw new Error('观看页SDK未正确加载');
 const token=await api('/sdk/token',{}),core=sdk.createWatchCore({channelId});core.setXAuthToken(token.token);
 let disposed=false,playerReady=false,sessionId='',lastSession='';let chat:ChatConnection|undefined;
 const state=(error?:string)=>{if(!disposed)onState({liveStatus:core.channel.getLiveStatus(),sessionId:core.channel.getCurrentSessionId()||'',playerReady,error});};
 const sync=async()=>{sessionId=core.channel.getCurrentSessionId()||'';const key=sessionId+':'+core.channel.getLiveStatus();if(sessionId&&key!==lastSession){await onSession(sessionId);lastSession=key;}state();};
 try{await core.setup();await core.connect();if(options.chat)chat=mountChat(core,sdk);if(!options.chatOnly)await sync();}catch(e){sdk.destroyWatchCore();throw e;}
 const changed=()=>sync().catch((e:any)=>state(e.message));
 core.channel.eventEmitter.on(sdk.ChannelEvents.SessionIdChange,changed);
 core.channel.eventEmitter.on(sdk.ChannelEvents.LiveStatusChange,changed);
 // An unstarted channel may not emit PlayerInited until the first stream arrives.
 // Do not block the feature's state handling on that event.
 const fullscreen=(event:Event)=>{const target=event.target as Element;if(target.closest('.plv-live-player-btn-fullscreen')){event.preventDefault();event.stopImmediatePropagation();const shell=container.closest<HTMLElement>('.player-shell');if(shell)(document.fullscreenElement?document.exitFullscreen():shell.requestFullscreen()).catch(()=>{});}};
 if(!options.chatOnly){container.addEventListener('click',fullscreen,true);
 container.replaceChildren();
 core.player.setupPlayer({container,autoplay:false}).then(()=>{playerReady=true;state();}).catch((e:any)=>state(e.message||'播放器初始化失败'));}
 return {
  position(){
   sessionId=core.channel.getCurrentSessionId();if(!sessionId)throw new Error('当前频道尚无直播场次，不能记录');
   if(core.channel.getLiveStatus()!=='live')throw new Error('当前未在直播，不能新增标记');
   if(!playerReady)throw new Error('播放器尚未就绪，请稍后再标记');
   const video=container.querySelector('video') as HTMLVideoElement&{getStartDate?:()=>Date};
   if(video?.paused)throw new Error('请先播放直播画面，再标记当前讲解');
   let mediaDate:number|null=null;
   if(video?.getStartDate){const date=video.getStartDate();if(Number.isFinite(date?.getTime()))mediaDate=date.getTime()+video.currentTime*1000;}
   return {sessionId,channelId,mediaTime:null,mediaDate,timing:'live',playerTime:Number.isFinite(video?.currentTime)?video.currentTime:null};
  },
  async seek(seconds){if(core.channel.getLiveStatus()==='live')throw new Error('请在直播结束后回看');await core.player.seekVideo(seconds);await core.player.play();},
  dispose(){disposed=true;chat?.dispose();container.removeEventListener('click',fullscreen,true);core.channel.eventEmitter.off(sdk.ChannelEvents.SessionIdChange,changed);core.channel.eventEmitter.off(sdk.ChannelEvents.LiveStatusChange,changed);sdk.destroyWatchCore();}
 };
}
