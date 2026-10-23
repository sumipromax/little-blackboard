import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {polyvSign,validCallback} from './domain.mjs';
export {validCallback};
export const configured = () => Boolean(process.env.POLYV_APP_ID&&process.env.POLYV_APP_SECRET&&process.env.POLYV_CHANNEL_ID);
export async function polyvApi(path,params={},method='GET') {
 if(!configured()) throw new Error('尚未配置保利威测试账号');
 const data={...Object.fromEntries(Object.entries(params).filter(([,v])=>v!==undefined&&v!==null&&v!=='')),appId:process.env.POLYV_APP_ID,timestamp:Date.now()};
 data.sign=polyvSign(data,process.env.POLYV_APP_SECRET);
 const query=new URLSearchParams(Object.entries(data).map(([k,v])=>[k,String(v)]));
 const url='https://api.polyv.net'+path;
 const response=await fetch(method==='GET'?url+'?'+query:url,{method,signal:AbortSignal.timeout(20000),...(method==='POST'?{body:query}:{} )});
 const json=await response.json();
 if(!response.ok||Number(json.code)!==200) throw new Error(json.message||json.error?.desc||'保利威接口调用失败');
 return json.data;
}
export function publicSubtitleUrl(value){
 const url=new URL(value);
 if(url.protocol==='https:'&&url.hostname==='polyv-chat.oss-cn-shenzhen-internal.aliyuncs.com')url.hostname='polyv-chat.oss-cn-shenzhen.aliyuncs.com';
 return url.href;
}
function privateIp(ip){return ip==='::1'||ip.includes(':')||/^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);}
export async function checkMediaUrl(value) {
 const url=new URL(value);
 const extras=(process.env.MEDIA_ALLOWED_HOSTS||'').split(',').map(v=>v.trim()).filter(Boolean);
 const hosts=['videocc.net','polyv.net','polyv.cn','plvideo.cn','polyv-chat.oss-cn-shenzhen.aliyuncs.com',...extras];
 if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts.some(h=>url.hostname===h||url.hostname.endsWith('.'+h))) throw new Error('媒体地址必须使用受信任的HTTPS素材域名');
 if(isIP(url.hostname)) throw new Error('不允许IP媒体地址');
 const addresses=await lookup(url.hostname,{all:true});
 if(!addresses.length||addresses.some(a=>privateIp(a.address))) throw new Error('不允许访问内部媒体地址');
 return url;
}
export async function mediaFetch(value,maxBytes=2000000) {
 let url=await checkMediaUrl(value);
 for(let n=0;n<4;n++) {
  const res=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(45000)});
  if([301,302,303,307,308].includes(res.status)){url=await checkMediaUrl(new URL(res.headers.get('location'),url).href);continue;}
  if(!res.ok)throw new Error('无法读取课程素材');
  if(Number(res.headers.get('content-length')||0)>maxBytes)throw new Error('素材超过处理大小限制');
  const chunks=[];let total=0;
  for await(const chunk of res.body){total+=chunk.length;if(total>maxBytes)throw new Error('素材超过处理大小限制');chunks.push(chunk);}
  return Buffer.concat(chunks);
 }
 throw new Error('媒体重定向次数过多');
}
export function recordStart(value) {
 if(!/^\d{14}$/.test(value||''))throw new Error('录制开始时间格式不正确');
 return Date.parse(`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T${value.slice(8,10)}:${value.slice(10,12)}:${value.slice(12,14)}+08:00`);
}

let channelCache;
export async function liveChannel(force=false){
 if(!force&&channelCache&&Date.now()-channelCache.checkedAt<5000)return channelCache;
 const id=process.env.POLYV_CHANNEL_ID;
 const [info,status]=await Promise.all([polyvApi('/live/v2/channels/'+id+'/get'),polyvApi('/live/v4/channel/live-status/list',{channelIds:id})]);
 const item=status.find(s=>String(s.channelId)===id);if(!item)throw new Error('未能获取测试频道状态');
 channelCache={channelId:id,title:info.name,scene:info.scene,liveStatus:item.liveStatus,checkedAt:Date.now()};return channelCache;
}
