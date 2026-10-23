import test from 'node:test';
import assert from 'node:assert/strict';
import {listRecordings,syncCourseAssets} from '../server/course-assets.mjs';
import {createStore} from '../server/store.mjs';
process.env.POLYV_CHANNEL_ID='test-channel';
const srt='1\n00:00:00,000 --> 00:00:10,000\n一杯里有四个四分之一杯。';
const original={id:'real-session',channelId:'test-channel',mode:'polyv',status:'ended',calibrated:false};
const row={channelId:'test-channel',channelSessionId:'real-session',fileId:'file',origin:'auto',subtitleList:[{id:1,srtUrl:'https://polyv-chat.polyv.net/test.srt'}]};
function fixture(rows=[row]){const store=createStore(':memory:');store.put('session',original);const requests=[];return {store,requests,call:async(path,params)=>{requests.push({path,params});if(path.endsWith('/get')&&path.includes('/channels/'))return {userId:'real-user'};if(path.endsWith('/recordFiles'))return rows;if(path==='/live/v3/channel/record/get')return {...row,startTime:'20261022100000',mp4:'https://oss-live-1.videocc.net/test.mp4'};throw new Error('未知测试请求');},download:async()=>Buffer.from(srt)};}
test('录制查询从频道API取得userId，并按频道与场次过滤',async()=>{const f=fixture([row,{...row,channelId:'other'},{...row,channelSessionId:'other'}]);try{const list=await listRecordings('real-session',f.call);assert.equal(list.length,1);assert.deepEqual(f.requests[1].params,{userId:'real-user',sessionIds:'real-session'});}finally{f.store.close();}});
test('同步真实录制与字幕结构，不假装已经校准',async()=>{const f=fixture();try{const result=await syncCourseAssets(f.store,'real-session',{fileId:'file'},f);assert.equal(result.subtitleReady,true);assert.equal(result.calibrated,false);assert.equal(f.store.get('session','real-session').srt,srt);assert.equal(f.store.get('session','real-session').recordStart,Date.parse('2026-10-22T10:00:00+08:00'));}finally{f.store.close();}});
test('多字幕需明确选择，多段录制不能静默拼接',async()=>{const f=fixture([{...row,subtitleList:[{id:1,srtUrl:'https://a'},{id:2,srtUrl:'https://b'}]}]);try{const first=await syncCourseAssets(f.store,'real-session',{fileId:'file'},f);assert.equal(first.subtitleSelectionRequired,true);assert.equal(first.subtitleReady,false);const second=await syncCourseAssets(f.store,'real-session',{fileId:'file',subtitleId:'2',delaySeconds:5},f);assert.equal(second.subtitleReady,true);assert.equal(second.calibrated,true);assert.equal(f.store.get('session','real-session').subtitleId,'2');}finally{f.store.close();}const many=fixture([row,{...row,fileId:'file2'}]);try{await assert.rejects(syncCourseAssets(many.store,'real-session',{fileId:'file'},many),/多个录制/);}finally{many.store.close();}});
test('错误的字幕或已生成报告不能替换原有素材',async()=>{const f=fixture();try{f.download=async()=>Buffer.from('不是字幕');await assert.rejects(syncCourseAssets(f.store,'real-session',{fileId:'file'},f),/SRT/);assert.equal(f.store.get('session','real-session').mediaUrl,undefined);f.store.put('segment',{id:'seg',sessionId:'real-session'});await assert.rejects(syncCourseAssets(f.store,'real-session',{fileId:'file'},f),/已生成报告/);}finally{f.store.close();}});
test('完整素材回放可同步，循环或裁剪时间轴被拒绝',async()=>{
 const material={...row,origin:'material',duration:10};const f=fixture([material]);const base=f.call;
 let seconds=10;
 f.call=async(path,params)=>path==='/live/v3/channel/disk-video/list'?{contents:[{startTime:Date.parse('2026-10-22T10:00:00+08:00'),endTime:Date.parse('2026-10-22T10:00:00+08:00')+seconds*1000,duration:'00:00:10'}]}:base(path,params);
 try{await syncCourseAssets(f.store,'real-session',{fileId:'file'},f);seconds=20;await assert.rejects(syncCourseAssets(f.store,'real-session',{fileId:'file'},f),/完整单次播放/);}finally{f.store.close();}
});
test('字幕仅将已知OSS内网域名转换为公网域名，保留路径和签名',async()=>{
 const f=fixture([{...row,subtitleList:[{id:1,srtUrl:'https://polyv-chat.oss-cn-shenzhen-internal.aliyuncs.com/a.srt?sign=abc'}]}]);let received;
 f.download=async url=>{received=url;return Buffer.from(srt);};
 try{await syncCourseAssets(f.store,'real-session',{fileId:'file'},f);assert.equal(received,'https://polyv-chat.oss-cn-shenzhen.aliyuncs.com/a.srt?sign=abc');}finally{f.store.close();}
});
