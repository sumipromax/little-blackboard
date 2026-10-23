import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {parseSrt,positionForMark,normalizeSegments} from './domain.mjs';
import {mediaFetch} from './polyv.mjs';
import {frame} from './analysis.mjs';
import {newId} from './store.mjs';
export async function manualReport(store,id,{download=mediaFetch,extract=frame}={}){
 const session=store.get('session',id);
 if(!session||session.mode!=='polyv'||session.status==='live')throw new Error('请选择已结束的真实场次');
 if(store.list('segment').some(s=>s.sessionId===id))throw new Error('该场次已有报告');
 if(!session.srt||!session.mediaUrl)throw new Error('回放与字幕尚未就绪');
 const marks=store.list('mark').filter(m=>m.sessionId===id&&!m.cancelled);
 if(!marks.length)throw new Error('本场尚无标记');
 if(marks.some(m=>m.undoUntil>Date.now()))throw new Error('请等待标记撤销倒计时结束');
 const positioned=marks.map(m=>({...m,...positionForMark(m,session)})),cues=parseSrt(session.srt),max=cues.at(-1).end;
 if(positioned.some(m=>m.seconds<0||m.seconds>max))throw new Error('标记超出字幕范围，请核对时间定位');
 // Fixed windows only collect evidence; they do not claim to identify knowledge points.
 const groups=new Map();for(const m of positioned){const bucket=Math.floor(m.seconds/30);if(!groups.has(bucket))groups.set(bucket,[]);groups.get(bucket).push(m);}
 const segments=normalizeSegments([...groups].map(([bucket])=>{const start=bucket*30,end=Math.min(start+30,max),text=cues.filter(c=>c.start<end&&c.end>start).map(c=>c.text).join('');return {start,end,title:'学员标记片段 '+Math.floor(start/60)+':'+String(start%60).padStart(2,'0'),summary:text.slice(0,300),difficulty:'',explanation:''};}),cues,positioned);
 await mkdir('data/frames',{recursive:true});const temp='data/'+newId()+'.mp4';const files=[];
 try{await writeFile(temp,await download(session.mediaUrl,300000000));for(const s of segments){s.frame=newId()+'.jpg';files.push('data/frames/'+s.frame);await extract(temp,s.start,'data/frames/'+s.frame);}
 store.transaction(()=>{if(store.list('segment').some(s=>s.sessionId===id))throw new Error('该场次已有报告');for(const s of segments)store.put('segment',{...s,id:newId(),sessionId:id,source:'manual',created:Date.now()});store.put('session',{...store.get('session',id),analysis:'ready',error:null});});
 }catch(e){await Promise.all(files.map(f=>unlink(f).catch(()=>{})));throw e;}finally{await unlink(temp).catch(()=>{});}
 return {segments:segments.length,source:'manual'};
}
