import {polyvApi,mediaFetch,recordStart,publicSubtitleUrl} from './polyv.mjs';
import {parseSrt} from './domain.mjs';
// These calls only read the configured customer's channel; they do not change SaaS settings.
export async function listRecordings(sessionId,call=polyvApi){
 const channelId=process.env.POLYV_CHANNEL_ID;
 const info=await call('/live/v2/channels/'+channelId+'/get');
 if(!info.userId)throw new Error('频道信息缺少用户ID，无法查询录制');
 const rows=await call('/live/v2/channels/'+channelId+'/recordFiles',{userId:info.userId,...(sessionId?{sessionIds:sessionId}:{})});
 if(!Array.isArray(rows))throw new Error('录制列表响应格式不正确');
 return rows.filter(r=>String(r.channelId)===channelId&&(!sessionId||r.channelSessionId===sessionId));
}
export async function syncCourseAssets(store,sessionId,input,{call=polyvApi,download=mediaFetch}={}){
 const session=store.get('session',sessionId);
 if(!session||session.mode!=='polyv'||session.channelId!==process.env.POLYV_CHANNEL_ID)throw new Error('请选择配置频道的真实场次');
 if((session.recordIds||[]).length>1)throw new Error('该场次包含多个录制文件，不能自动替换时间轴');
 if(session.status==='live'){const states=await call('/live/v4/channel/live-status/list',{channelIds:session.channelId});if(states.some(s=>String(s.channelId)===session.channelId&&s.liveStatus==='live'))throw new Error('直播进行中，暂不同步课后素材');}
 if(store.list('segment').some(s=>s.sessionId===sessionId))throw new Error('已生成报告，不能替换课程素材');
 const rows=await listRecordings(sessionId,call),row=rows.find(r=>String(r.fileId)===input.fileId);
 if(!row)throw new Error('没有找到属于该场次的录制文件');
 if(rows.length!==1)throw new Error('该场次存在多个录制文件，本期不自动拼接时间轴');
 if(row.origin&& !['auto','manual','material'].includes(row.origin))throw new Error('本期只使用原始录制，裁剪或合并视频需另行核对时间轴');
 const file=await call('/live/v3/channel/record/get',{channelId:session.channelId,fileId:row.fileId});
 if(String(file.channelId)!==session.channelId||file.channelSessionId!==sessionId)throw new Error('录制元数据与场次不匹配');
 if(!file.mp4)throw new Error('录制MP4尚未就绪，请稍后同步');
 if(row.origin==='material'){
  const tasks=await call('/live/v3/channel/disk-video/list',{channelId:session.channelId});
  const matches=(tasks.contents||[]).filter(t=>Number(t.startTime)===recordStart(file.startTime));
  const task=matches[0],parts=String(task?.duration||'').split(':').map(Number);
  const duration=parts.length===3?parts[0]*3600+parts[1]*60+parts[2]:NaN;
  const elapsed=(Number(task?.endTime)-Number(task?.startTime))/1000;
  if(matches.length!==1||!Number.isFinite(duration)||!Number.isFinite(Number(row.duration))||!Number.isFinite(elapsed)||Math.abs(duration-Number(row.duration))>1||Math.abs(elapsed-duration)>1)throw new Error('素材回放不是已核实的完整单次播放，请核对播出时间轴');
 }
 const subtitles=(row.subtitleList||[]).filter(s=>s.srtUrl);
 // A selected subtitle is explicit. Multiple subtitles are never silently guessed.
 const subtitle=input.subtitleId?subtitles.find(s=>String(s.id)===input.subtitleId):subtitles.length===1?subtitles[0]:null;
 if(input.subtitleId&&!subtitle)throw new Error('所选字幕不属于该录制');
 const srt=subtitle?(await download(publicSubtitleUrl(subtitle.srtUrl))).toString('utf8'):session.fileId===String(row.fileId)?session.srt||'':'';
 if(srt)parseSrt(srt);
 const calibrated=input.delaySeconds!==undefined?true:!!session.calibrated;
 const next={...session,fileId:String(row.fileId),recordIds:[String(row.fileId)],recordStart:recordStart(file.startTime),mediaUrl:file.mp4,title:session.title||row.fileName,status:'ended',calibrated,delaySeconds:input.delaySeconds??session.delaySeconds??0,analysis:'idle',error:null,srt,subtitleId:subtitle?String(subtitle.id):srt?session.subtitleId||null:null};
 store.put('session',next);
 return {id:sessionId,recordingReady:true,subtitleReady:!!srt,subtitleSelectionRequired:subtitles.length>1&&!subtitle,calibrated};
}
