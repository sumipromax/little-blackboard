import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {configured,polyvApi,mediaFetch,liveChannel} from '../server/polyv.mjs';
import {listRecordings} from '../server/course-assets.mjs';
import {parseSrt} from '../server/domain.mjs';
import {frame,ffmpegPath} from '../server/analysis.mjs';
const checks=[];
async function check(name,fn){try{checks.push({name,ok:true,...await fn()});}catch(e){checks.push({name,ok:false,error:e.message});}}
if(!configured()){console.log(JSON.stringify({error:'请先在本地.env配置测试账号'}));process.exitCode=1;}else{
 await check('观看令牌',async()=>{const r=await polyvApi('/live/v3/channel/watch/get-watch-api-token',{channelId:process.env.POLYV_CHANNEL_ID,viewerId:'blackboard-readonly-check',nickname:'小黑板接入校验'},'POST');if(!r?.token)throw new Error('没有返回令牌');return {tokenReceived:true};});
 await check('频道状态',async()=>{const c=await liveChannel();return {channelId:c.channelId,status:c.liveStatus};});
 await check('录制与字幕列表',async()=>{const rows=await listRecordings();return {recordings:rows.length,subtitles:rows.reduce((n,r)=>n+(r.subtitleList?.length||0),0)};});
 for(const type of ['playback','vod'])await check(type==='playback'?'回放列表':'点播列表',async()=>{const d=await polyvApi('/live/v2/channel/recordFile/'+process.env.POLYV_CHANNEL_ID+'/playback/list',{page:1,pageSize:10,listType:type});return {total:d.totalItems??d.contents?.length??0};});
 for(const type of ['video','document'])await check(type==='video'?'视频素材库':'文档素材库',async()=>{const d=await polyvApi('/live/v4/material/list',{pageNumber:1,pageSize:1,type});return {returned:d.contents?.length||0};});
 if(process.argv.includes('--media'))await check('真实素材下载并取帧',async()=>{
  if(!ffmpegPath())throw new Error('未安装ffmpeg');
  const d=await polyvApi('/live/v4/material/list',{pageNumber:1,pageSize:30,type:'video'});
  const item=d.contents?.filter(v=>v.status==='normal'&&v.fileSize>0&&v.fileSize<10000000&&v.duration>1&&new URL(v.url).pathname.endsWith('.mp4')).sort((a,b)=>a.fileSize-b.fileSize)[0];
  if(!item)throw new Error('没有找到10MB以内可验证的MP4素材');
  const dir=await mkdtemp(join(tmpdir(),'blackboard-media-'));
  try{const bytes=await mediaFetch(item.url,10000000),mp4=join(dir,'source.mp4'),jpg=join(dir,'frame.jpg');await writeFile(mp4,bytes);await frame(mp4,1,jpg);const image=await readFile(jpg);if(image[0]!==255||image[1]!==216)throw new Error('未生成有效JPEG');return {downloadedBytes:bytes.length,jpegBytes:image.length};}finally{await rm(dir,{recursive:true,force:true});}
 });
 if(process.argv.includes('--media'))await check('现有素材字幕样本',async()=>{
  const d=await polyvApi('/live/v4/material/list',{pageNumber:1,pageSize:30,type:'video'});let subtitle;
  for(const v of d.contents||[]){let ext=v.extData;try{if(typeof ext==='string')ext=JSON.parse(ext);}catch{continue;}subtitle=(ext?.subtitleList||[]).find(s=>s.srtUrl);if(subtitle)break;}
  if(!subtitle)return {skipped:true,reason:'没有找到现有字幕样本'};
  const bytes=await mediaFetch(subtitle.srtUrl),cues=parseSrt(bytes.toString('utf8'));return {subtitleDownloaded:true,cues:cues.length,start:cues[0].start,end:cues.at(-1).end};
 });
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),checks,notVerified:['真实直播播放与标记','测试频道字幕与标记的时间对齐','公网回调送达','真实AI分析（未配置模型）']},null,2));
 if(checks.some(c=>!c.ok))process.exitCode=1;
}
