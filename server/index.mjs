import express from 'express';
import {createServer as createViteServer} from 'vite';
import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {z} from 'zod';
import {createStore,newId,createMark,undoMark,publish} from './store.mjs';
import {analyze,ffmpegPath} from './analysis.mjs';
import {configured,polyvApi,validCallback,mediaFetch,recordStart,liveChannel,publicSubtitleUrl} from './polyv.mjs';
import {demoCues} from './domain.mjs';
import {listRecordings,syncCourseAssets} from './course-assets.mjs';
import {manualReport} from './manual-report.mjs';
const app=express(),store=createStore(),secret=process.env.SESSION_SECRET||randomBytes(32).toString('hex');
const adminPassword=process.env.ADMIN_PASSWORD||randomBytes(12).toString('base64url');
if(!process.env.ADMIN_PASSWORD)console.log('本次本地管理员口令：'+adminPassword+'（设置ADMIN_PASSWORD可固定）');
app.disable('x-powered-by');app.use(express.json({limit:'2mb'}));app.use(express.urlencoded({extended:false,limit:'2mb'}));
app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','same-origin');
 if(req.path.startsWith('/api/')&&req.method!=='GET'&&req.headers.origin&&!['http://127.0.0.1:'+ (process.env.PORT||4317),'http://localhost:'+(process.env.PORT||4317)].includes(req.headers.origin))return res.status(403).json({error:'请求来源不受信任'});
 next();});
function signed(data){const body=Buffer.from(JSON.stringify(data)).toString('base64url');return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');}
function decode(token){try{const [body,sig]=token.split('.');const correct=createHmac('sha256',secret).update(body).digest('base64url');if(sig.length!==correct.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(correct)))return null;const value=JSON.parse(Buffer.from(body,'base64url'));return value.exp>Date.now()?value:null;}catch{return null;}}
function auth(req,res,next){const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim().split('=')));req.viewer=decode(cookies.bbviewer||'');req.admin=decode(cookies.bbadmin||'')?.role==='admin';next();}
app.use(auth);
const admin=(req,res,next)=>req.admin?next():res.status(401).json({error:'请先登录管理端'});
const viewer=(req,res,next)=>req.viewer?next():res.status(401).json({error:'请先进入课堂'});
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
function seed(){if(!store.get('session','demo-fractions'))store.put('session',{id:'demo-fractions',channelId:'demo',title:'分数除法：为什么要乘倒数',mode:'demo',status:'live',analysis:'idle',recordStart:Date.now(),calibrated:true,delaySeconds:0,srt:'',cues:demoCues});}
seed();
app.get('/api/config',(req,res)=>res.json({configured:configured(),channelId:process.env.POLYV_CHANNEL_ID||'',aiConfigured:!!(process.env.AI_API_KEY&&process.env.AI_MODEL),ffmpeg:!!ffmpegPath(),admin:req.admin,viewer:req.viewer?{id:req.viewer.id,name:req.viewer.name}:null}));
const loginAttempts=new Map();
app.post('/api/admin/login',(req,res)=>{const key=req.ip;const attempt=loginAttempts.get(key)||{n:0,until:Date.now()+60000};if(attempt.until<Date.now()){attempt.n=0;attempt.until=Date.now()+60000;}attempt.n++;loginAttempts.set(key,attempt);if(attempt.n>10)return res.status(429).json({error:'尝试过于频繁，请稍后再试'});const password=String(req.body.password||'');if(password.length!==adminPassword.length||!timingSafeEqual(Buffer.from(password),Buffer.from(adminPassword)))return res.status(401).json({error:'管理口令不正确'});res.cookie('bbadmin',signed({role:'admin',exp:Date.now()+8*3600000}),{httpOnly:true,sameSite:'strict',maxAge:8*3600000});res.json({ok:true});});
app.post('/api/viewer',wrap(async(req,res)=>{const {name}=z.object({name:z.string().trim().min(1).max(30)}).parse(req.body);const id=req.viewer?.id||newId();const data={id,name,exp:Date.now()+30*86400000};res.cookie('bbviewer',signed(data),{httpOnly:true,sameSite:'strict',maxAge:30*86400000});res.json({id,name});}));
app.post('/api/demo/start',viewer,(req,res)=>{const active=store.list('session').find(s=>s.mode==='demo'&&s.status==='live');res.json(active||store.put('session',{id:'demo-'+newId(),channelId:'demo',title:'分数除法：为什么要乘倒数',mode:'demo',status:'live',analysis:'idle',recordStart:Date.now(),calibrated:true,delaySeconds:0,cues:demoCues}));});
app.get('/api/sessions',viewer,(req,res)=>res.json(store.list('session').sort((a,b)=>(b.recordStart||0)-(a.recordStart||0)).map(({srt,cues,error,...s})=>s)));
app.post('/api/admin/demo',admin,(req,res)=>res.json(store.put('session',{id:'demo-'+newId(),channelId:'demo',title:'分数除法：为什么要乘倒数',mode:'demo',status:'live',analysis:'idle',recordStart:Date.now(),calibrated:true,delaySeconds:0,cues:demoCues})));
app.get('/api/admin/sessions',admin,(req,res)=>res.json(store.list('session').sort((a,b)=>(b.recordStart||0)-(a.recordStart||0))));
app.get('/api/admin/channel',admin,wrap(async(req,res)=>{const channelId=z.string().regex(/^\d+$/).parse(req.query.channelId);if(!store.list('session').some(s=>s.channelId===channelId))return res.sendStatus(404);if(channelId===process.env.POLYV_CHANNEL_ID)return res.json(await liveChannel());const rows=await polyvApi('/live/v4/channel/live-status/list',{channelIds:channelId});const row=rows.find(r=>String(r.channelId)===channelId);res.json({channelId,liveStatus:row?.liveStatus||''});}));
app.get('/api/channel',viewer,wrap(async(req,res)=>res.json(await liveChannel())));
app.post('/api/sdk/token',viewer,wrap(async(req,res)=>{const channelId=process.env.POLYV_CHANNEL_ID;if(!channelId)throw new Error('请先在本地.env配置测试频道');const token=await polyvApi('/live/v3/channel/watch/get-watch-api-token',{channelId,viewerId:req.viewer.id,nickname:req.viewer.name},'POST');res.json(token);}));
app.post('/api/session/register',viewer,wrap(async(req,res)=>{const b=z.object({id:z.string().min(1).max(64)}).parse(req.body);const channel=await liveChannel(true);let s=store.get('session',b.id);s=store.put('session',{...(s||{id:b.id,channelId:channel.channelId,mode:'polyv',analysis:'idle',calibrated:false,allowEstimatedTiming:process.env.ALLOW_ESTIMATED_TIMING==='true',delaySeconds:0}),title:s?.title||channel.title,status:channel.liveStatus==='live'?'live':'ended'});res.json(s);}));
const markInput=z.object({sessionId:z.string().max(64),channelId:z.string().max(64),kind:z.enum(['highlight','difficulty']),mediaTime:z.number().min(0).max(172800).nullable(),mediaDate:z.number().nullable(),timing:z.enum(['live','replay']),layout:z.enum(['video','ppt','fullscreen']),playerTime:z.number().nullable().optional()});
app.post('/api/marks',viewer,wrap(async(req,res)=>{const input=markInput.parse(req.body);if(input.channelId!=='demo'){const channel=await liveChannel();if(input.channelId!==channel.channelId||channel.liveStatus!=='live')throw new Error('当前频道未在直播，不能新增标记');}res.json({...createMark(store,req.viewer,input),serverNow:Date.now()});}));
app.post('/api/marks/:id/undo',viewer,wrap(async(req,res)=>res.json(undoMark(store,req.viewer,req.params.id))));
function viewerRecords(viewerId,sessionId){
 const marks=store.list('mark').filter(m=>m.viewerId===viewerId&&!m.cancelled&&(!sessionId||m.sessionId===sessionId)).sort((a,b)=>b.created-a.created);
 const segments=store.list('segment');
 const result=[];const seen=new Set();
 for(const mark of marks){const session=store.get('session',mark.sessionId);if(!session||session.status==='live'||session.analysis!=='ready')continue;const segment=segments.find(s=>s.sessionId===mark.sessionId&&s.markIds.includes(mark.id));if(!segment)continue;const key=segment.id+mark.kind;if(seen.has(key))continue;seen.add(key);
 const pub=mark.kind==='difficulty'&&store.list('publication').find(p=>p.segmentId===segment.id&&p.viewerIds.includes(viewerId));
 result.push({id:key,kind:mark.kind,created:mark.created,sessionId:session.id,segment:{id:segment.id,start:segment.start,end:segment.end,title:segment.title,summary:segment.summary,frame:segment.frame,timingQuality:segment.timingQuality},publication:pub?{id:pub.id,content:pub.content,created:pub.created,materials:pub.materialIds.map(id=>store.get('material',id)).filter(Boolean)}:null});}
 return result;
}
app.get('/api/records',viewer,(req,res)=>res.json(viewerRecords(req.viewer.id,req.query.sessionId)));
app.get('/api/records/:id/replay',viewer,(req,res)=>{const r=viewerRecords(req.viewer.id).find(r=>r.id===req.params.id);if(!r)return res.status(404).json({error:'记录不存在'});const s=store.get('session',r.sessionId);res.json({title:s.title,url:s.mediaUrl||'',start:r.segment.start,timingQuality:r.segment.timingQuality});});
app.get('/api/materials/:id/preview',viewer,(req,res)=>{const m=viewerRecords(req.viewer.id).flatMap(r=>r.publication?.materials||[]).find(m=>m.id===req.params.id);if(!m)return res.status(404).json({error:'资料不存在或未发布给你'});res.json(m);});
app.get('/api/materials/:id/content',viewer,wrap(async(req,res)=>{const m=viewerRecords(req.viewer.id).flatMap(r=>r.publication?.materials||[]).find(m=>m.id===req.params.id);if(!m||m.type!=='document')return res.sendStatus(404);const ext=new URL(m.url).pathname.split('.').pop().toLowerCase();const mime=ext==='pdf'?'application/pdf':null;if(!mime)return res.status(400).json({error:'此文档格式暂不支持在线预览'});const content=await mediaFetch(m.url,50000000);res.set('Content-Type',mime);res.set('Content-Disposition','inline');res.set('Cache-Control','private, no-store');res.send(content);}));
function reportPublication(segmentId){const p=store.list('publication').find(p=>p.segmentId===segmentId);return p?{...p,materials:p.materialIds.map(id=>store.get('material',id)).filter(Boolean)}:null;}
app.get('/api/admin/report',admin,(req,res)=>{
 const marks=store.list('mark').filter(m=>!m.cancelled&&m.sessionId===req.query.sessionId);
 res.json(store.list('segment').filter(s=>s.sessionId===req.query.sessionId).sort((a,b)=>a.start-b.start).map(s=>{const related=marks.filter(m=>m.kind==='difficulty'&&s.markIds.includes(m.id));return {...s,learners:[...new Map(related.map(m=>[m.viewerId,{id:m.viewerId,name:m.viewerName,times:related.filter(n=>n.viewerId===m.viewerId).map(n=>n.created)}])).values()],publication:reportPublication(s.id)};}).filter(s=>s.learners.length));
});
app.post('/api/admin/sessions/:id/end',admin,wrap(async(req,res)=>{const s=store.get('session',req.params.id);if(s?.mode!=='demo')throw new Error('真实课堂由录制／字幕回调或导入确认课后状态');store.put('session',{...s,status:'ended'});res.json({ok:true});}));
app.post('/api/admin/sessions/:id/manual-report',admin,wrap(async(req,res)=>res.json(await manualReport(store,req.params.id))));
app.post('/api/admin/sessions/:id/analyze',admin,wrap(async(req,res)=>{res.json({started:true});analyze(store,req.params.id).catch(()=>{});}));
app.post('/api/admin/sessions/:id/import',admin,wrap(async(req,res)=>{
 const b=z.object({mediaUrl:z.string().url(),srt:z.string().min(10).max(500000),recordStart:z.number().positive(),delaySeconds:z.number().min(0).max(120),title:z.string().min(1).max(100)}).parse(req.body);
 const old=store.get('session',req.params.id);if(!old||old.mode==='demo')throw new Error('请选择真实频道场次');
 if(store.list('segment').some(s=>s.sessionId===old.id))throw new Error('已生成报告，不能替换课程素材');
 await import('./polyv.mjs').then(m=>m.checkMediaUrl(b.mediaUrl));
 store.put('session',{...old,...b,calibrated:true,status:'ended',analysis:'idle'});res.json({ok:true});analyze(store,old.id).catch(()=>{});
}));
app.get('/api/admin/recordings',admin,wrap(async(req,res)=>{
 const sessionId=req.query.sessionId?z.string().max(64).parse(req.query.sessionId):undefined;
 const rows=await listRecordings(sessionId);
 res.json(rows.map(r=>({fileId:String(r.fileId),sessionId:r.channelSessionId,title:r.fileName,startTime:r.startTime,duration:r.duration,fileSize:r.fileSize,origin:r.origin,subtitles:(r.subtitleList||[]).map(s=>({id:String(s.id),language:s.language,name:s.name}))})));
}));
app.post('/api/admin/sessions/:id/sync',admin,wrap(async(req,res)=>{
 const input=z.object({fileId:z.string().min(1).max(100),subtitleId:z.string().max(100).optional(),delaySeconds:z.number().min(0).max(120).optional()}).parse(req.body);
 res.json(await syncCourseAssets(store,req.params.id,input));
}));
app.get('/api/admin/materials',admin,wrap(async(req,res)=>{
 const session=store.get('session',String(req.query.sessionId));
 if(session?.mode==='demo')return res.json([{id:'demo-doc',title:'分数除法：一杯水的例子',type:'document',url:'/demo-material.html'}]);
 const type=z.enum(['video','document']).parse(req.query.type||'video');
 const list=await polyvApi('/live/v4/material/list',{pageNumber:1,pageSize:30,type,title:String(req.query.q||'').slice(0,100)});
 const items=(list.contents||[]).filter(m=>m.status==='normal'&&(type!=='document'||new URL(m.url).pathname.toLowerCase().endsWith('.pdf'))).map(m=>({id:String(m.id),title:m.title,type:m.type,url:m.url}));items.forEach(m=>store.put('material',m));res.json(items);
}));
app.post('/api/admin/publish',admin,wrap(async(req,res)=>{const b=z.object({segmentId:z.string(),content:z.string().max(12000),materialIds:z.array(z.string()).max(20)}).parse(req.body);const segment=store.get('segment',b.segmentId);if(!segment)throw new Error('片段不存在');const viewers=[...new Set(store.list('mark').filter(m=>!m.cancelled&&m.kind==='difficulty'&&m.sessionId===segment.sessionId&&segment.markIds.includes(m.id)).map(m=>m.viewerId))];res.json(publish(store,b.segmentId,viewers,b.content,b.materialIds));}));
store.put('material',{id:'demo-doc',title:'分数除法：一杯水的例子',type:'document',url:'/demo-material.html'});
app.get('/api/frame/:name',(req,res,next)=>req.admin||req.viewer?next():res.sendStatus(401),(req,res)=>{if(!/^[a-f0-9-]+\.jpg$/.test(req.params.name))return res.sendStatus(404);const seg=store.list('segment').find(s=>s.frame===req.params.name);const allowed=seg&&(req.admin||store.list('mark').some(m=>!m.cancelled&&m.viewerId===req.viewer.id&&seg.markIds.includes(m.id)));if(!allowed)return res.sendStatus(403);res.sendFile(process.cwd()+'/data/frames/'+req.params.name);});
async function receiveRecord(input){
 if(String(input.channelId)!==process.env.POLYV_CHANNEL_ID)throw new Error('回调频道不匹配');
 if(!validCallback(input,process.env.POLYV_APP_SECRET))throw new Error('回调签名或时间不正确');
 const file=await polyvApi('/live/v3/channel/record/get',{channelId:input.channelId,fileId:input.fileId});
 const id=String(file.channelSessionId||input.sessionId||'');if(!id)throw new Error('录制缺少场次ID');
 const old=store.get('session',id)||{id,channelId:String(input.channelId),mode:'polyv',analysis:'idle',calibrated:false,delaySeconds:0};
 const recordIds=[...new Set([...(old.recordIds||[]),String(input.fileId)])];
 const s=store.put('session',{...old,title:file.fileName||old.title||'直播回放',fileId:String(input.fileId),recordIds,recordStart:recordStart(file.startTime),mediaUrl:file.mp4||file.m3u8,status:'ended'});
 return s;
}
app.get('/api/callback/record',wrap(async(req,res)=>{const s=await receiveRecord(req.query);res.json({code:200});if(s.srt&&s.calibrated&&process.env.AI_API_KEY)analyze(store,s.id).catch(()=>{});}));
app.post('/api/callback/subtitle',wrap(async(req,res)=>{
 if(!validCallback(req.query,process.env.POLYV_APP_SECRET))throw new Error('字幕回调签名或时间不正确');
 const b=z.object({fileId:z.string(),channelId:z.union([z.string(),z.number()]),srtUrl:z.string().url(),isOriginal:z.string().optional()}).parse(req.body);
 if(b.isOriginal==='N')return res.json({code:200});
 const s=await receiveRecord({...req.query,channelId:b.channelId,fileId:b.fileId});
 const srt=(await mediaFetch(publicSubtitleUrl(b.srtUrl))).toString('utf8');
 store.put('session',{...store.get('session',s.id),srt});res.json({code:200});if(s.calibrated&&process.env.AI_API_KEY)analyze(store,s.id).catch(()=>{});
}));
app.use('/api',(req,res)=>res.status(404).json({error:'接口不存在'}));
const vite=await createViteServer({server:{middlewareMode:true,fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/data/**','**/server/**']}},appType:'spa'});app.use(vite.middlewares);
app.use((error,req,res,next)=>{if(res.headersSent)return next(error);res.status(400).json({error:error instanceof z.ZodError?'输入格式不正确':error.message||'操作失败'});});
let syncing=false;
async function syncEndedSessions(){
 if(!configured()||syncing)return;syncing=true;
 try{const pending=store.list('session').filter(s=>s.mode==='polyv'&&s.channelId===process.env.POLYV_CHANNEL_ID&&(!s.srt||s.status==='live')&&!store.list('segment').some(g=>g.sessionId===s.id));
 if(!pending.length)return;
 const channel=await liveChannel(true);if(channel.liveStatus==='live')return;
 const rows=await listRecordings();
 for(const s of pending){const files=rows.filter(r=>r.channelSessionId===s.id);if(files.length!==1)continue;const r=files[0],subtitles=(r.subtitleList||[]).filter(x=>x.srtUrl&&(x.isOriginal==='Y'||x.isOriginal===true));
 try{await syncCourseAssets(store,s.id,{fileId:String(r.fileId),...(subtitles.length===1?{subtitleId:String(subtitles[0].id)}:{})});}catch(e){store.put('session',{...store.get('session',s.id),syncError:e.message});}}
 }catch(e){console.warn('课后素材同步未完成：'+e.message);}finally{syncing=false;}
}
setInterval(syncEndedSessions,30000).unref();
const port=Number(process.env.PORT||4317),host=process.env.HOST||'127.0.0.1';
app.listen(port,host,()=>console.log(`小黑板：http://${host}:${port}/watch\n运营后台：http://${host}:${port}/admin`));
