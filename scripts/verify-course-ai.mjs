import {writeFile,mkdir} from 'node:fs/promises';
import {createStore} from '../server/store.mjs';
import {analyze} from '../server/analysis.mjs';
import {polyvApi} from '../server/polyv.mjs';
import {parseSrt,positionForMark} from '../server/domain.mjs';
const sourceId=process.argv[2]||'hngt67h1ms';
const app=createStore(),isolated=createStore(':memory:');
try{
 const source=app.get('session',sourceId);if(!source||source.mode!=='polyv'||!source.srt)throw new Error('真实场次素材不完整');
 const file=await polyvApi('/live/v3/channel/record/get',{channelId:source.channelId,fileId:source.fileId});
 if(file.channelSessionId!==sourceId)throw new Error('回放场次不一致');
 isolated.put('session',{...source,mediaUrl:file.mp4,status:'ended',analysis:'idle',error:null});
 const marks=app.list('mark').filter(m=>m.sessionId===sourceId&&!m.cancelled);
 for(const m of marks)isolated.put('mark',m);
 console.log(JSON.stringify({stage:'analyzing',sourceId,marks:marks.map(m=>({kind:m.kind,seconds:positionForMark(m,source).seconds})),subtitleCues:parseSrt(source.srt).length,model:process.env.AI_MODEL}));
 await analyze(isolated,sourceId);
 const session=isolated.get('session',sourceId),segments=isolated.list('segment').sort((a,b)=>a.start-b.start);
 const report={sourceSessionId:sourceId,model:process.env.AI_MODEL,createdAt:new Date().toISOString(),status:session.analysis,aiRun:session.aiRun,markCount:marks.length,segments};
 await mkdir('data/ai-verification',{recursive:true});await writeFile('data/ai-verification/'+sourceId+'.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({stage:'generated',status:session.analysis,segments:segments.map(({start,end,title,summary,difficulty,explanation,transcript,markIds,frame,timingQuality})=>({start,end,title,summary,difficulty,explanation,transcript,markCount:markIds.length,frame,timingQuality}))},null,2));
}finally{app.close();isolated.close();}
