import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ffmpegPath} from '../server/analysis.mjs';
const key=process.env.AI_API_KEY,model=process.env.AI_MODEL,base=process.env.AI_BASE_URL;
if(!key||!model||!base){console.log(JSON.stringify({ok:false,error:'请先在本地.env填写AI_BASE_URL、AI_MODEL、AI_API_KEY；不要把密钥贴到聊天里'}));process.exitCode=1;}else{
 let dir;
 try{
  if(!ffmpegPath())throw new Error('缺少ffmpeg，无法准备图片测试样本');
  dir=await mkdtemp(join(tmpdir(),'blackboard-ai-'));const file=join(dir,'red.jpg');
  await promisify(execFile)(ffmpegPath(),['-nostdin','-v','error','-f','lavfi','-i','color=c=red:s=320x180:d=1','-frames:v','1','-y',file],{timeout:10000});
  const image=await readFile(file),url=new URL(base.replace(/\/$/,'')+'/chat/completions');
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('远程AI接口请使用HTTPS');
  const r=await fetch(url,{method:'POST',signal:AbortSignal.timeout(60000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({model,enable_thinking:false,max_tokens:256,response_format:{type:'json_object'},messages:[{role:'user',content:[{type:'text',text:'观察图片的主要颜色，输出JSON对象，唯一字段color，取值为red、green、blue或other。只根据图片判断，不要输出其他内容。'},{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+image.toString('base64')}}]}]})});
  if(!r.ok){const reasons={400:'请求参数或模型能力不匹配',401:'API Key无效，或地域与接口不匹配',403:'模型访问权限不足',404:'接口地址或模型名不正确',429:'调用额度、余额或频率受限'};throw new Error('AI服务HTTP '+r.status+'：'+(reasons[r.status]||'服务异常，请稍后重试'));}
  const body=await r.json();let result;try{result=JSON.parse(body.choices?.[0]?.message?.content);}catch{throw new Error('模型没有返回可解析的JSON');}
  if(result.color!=='red')throw new Error('接口可调用，但图片颜色识别未通过');
  console.log(JSON.stringify({ok:true,model,imageInput:true,jsonOutput:true,semanticCheck:true,usage:body.usage||null,note:'仅验证自生成色块图片与JSON输出，不代表课程分析效果已通过'},null,2));
 }catch(e){console.log(JSON.stringify({ok:false,error:e.message}));process.exitCode=1;}
 finally{if(dir)await rm(dir,{recursive:true,force:true});}
}
