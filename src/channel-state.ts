// Server channel status is independent of the recording currently selected by the viewer.
export function channelStatus(status:string){
 return ({live:{label:'直播中',tone:'live'},waiting:{label:'等待直播',tone:'waiting'},unStart:{label:'未开播',tone:'idle'},end:{label:'已结束',tone:'ended'},banpush:{label:'已禁播',tone:'blocked'},stop:{label:'已暂停',tone:'waiting'},playback:{label:'回放中',tone:'replay'}} as Record<string,{label:string;tone:string}>)[status]||{label:'状态获取中',tone:'idle'};
}
