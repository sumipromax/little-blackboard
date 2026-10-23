import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSrt,positionForMark,normalizeSegments,validCallback,md5,polyvSign} from '../server/domain.mjs';
import {createStore,createMark,undoMark,publish} from '../server/store.mjs';
const session={id:'s',channelId:'c',status:'live'};
const viewer={id:'v',name:'小林'};
const input={sessionId:'s',channelId:'c',kind:'difficulty',mediaTime:30,timing:'replay'};
function store(){const s=createStore(':memory:');s.put('session',session);return s;}
test('SRT支持多行和毫秒，剔除标签',()=>{assert.deepEqual(parseSrt('1\r\n00:00:01,250 --> 00:00:03,000\r\n<b>分数</b>\r\n除法'),[{start:1.25,end:3,text:'分数 除法'}]);assert.throws(()=>parseSrt('空字幕'));});
test('无法校准的直播时间不冒充精确回放时间',()=>{assert.throws(()=>positionForMark({created:10000},{}),/校准/);assert.deepEqual(positionForMark({created:20000},{recordStart:10000,calibrated:true,delaySeconds:3}),{seconds:7,quality:'calibrated-estimate'});});
test('AI片段必须覆盖标记、不能重叠或越界',()=>{const cues=[{start:0,end:90,text:'课程'}], marks=[{id:'a',seconds:20}];assert.throws(()=>normalizeSegments([{start:30,end:50}],cues,marks),/覆盖/);assert.throws(()=>normalizeSegments([{start:0,end:50},{start:40,end:60}],cues,marks),/重叠/);assert.throws(()=>normalizeSegments([{start:0,end:91}],cues,marks),/范围/);});
test('五秒内同类型去重，两种类型可同时记录',()=>{const s=store();try{const a=createMark(s,viewer,input,10000);assert.equal(createMark(s,viewer,input,12000).id,a.id);assert.notEqual(createMark(s,viewer,{...input,kind:'highlight'},12000).id,a.id);assert.equal(s.list('mark').length,2);}finally{s.close();}});
test('撤销只允许本人且严格限制五秒，结束后不可新增',()=>{const s=store();try{const a=createMark(s,viewer,input,10000);assert.throws(()=>undoMark(s,{id:'other'},a.id,11000),/不存在/);assert.throws(()=>undoMark(s,viewer,a.id,15000),/时间/);assert.equal(undoMark(s,viewer,a.id,14999).cancelled,true);s.put('session',{...session,status:'ended'});assert.throws(()=>createMark(s,viewer,input,20000),/结束/);}finally{s.close();}});
test('发布只能发给对应难点学员，且一经发布不能覆盖或追加',()=>{const s=store();try{const a=createMark(s,viewer,input,10000);s.put('segment',{id:'seg',markIds:[a.id],sessionId:'s'});assert.throws(()=>publish(s,'seg',['outsider'],'解释',[]),/名单/);assert.throws(()=>publish(s,'seg',['v'],'',[]),/解释/);const p=publish(s,'seg',['v'],'确认后的解释',[]);assert.deepEqual(p.viewerIds,['v']);assert.throws(()=>publish(s,'seg',['v'],'新版解释',[]),/再次发布/);assert.equal(s.list('publication').length,1);}finally{s.close();}});
test('回调签名校验与过期校验',()=>{const now=1700000000000;assert.ok(validCallback({timestamp:now,sign:md5('secret'+now)},'secret',now));assert.equal(validCallback({timestamp:now,sign:md5('secret'+now)},'secret',now+600001),false);assert.equal(validCallback({timestamp:now,sign:'bad'},'secret',now),false);assert.equal(polyvSign({b:2,a:1},'s'),md5('sa1b2s').toUpperCase());});
test('相邻片段边界的同一次标记只落到一个片段',()=>{const result=normalizeSegments([{start:0,end:30},{start:30,end:90}],[{start:0,end:90,text:'课程'}],[{id:'edge',seconds:30},{id:'before',seconds:20}]);assert.deepEqual(result.map(s=>s.markIds),[['before'],['edge']]);});
test('AI片段只选片段内画面，纯重点不得带难点或解释',async()=>{
 const {attachSegmentEvidence}=await import('../server/domain.mjs');
 const segments=[{start:10,end:20,markIds:['a'],difficulty:'猜测',explanation:'解释'},{start:20,end:30,markIds:['b'],difficulty:'可能符号看错',explanation:'按步骤计算'}];
 const marks=[{id:'a',kind:'highlight',seconds:11},{id:'b',kind:'difficulty',seconds:22}];
 const result=attachSegmentEvidence(segments,marks,[{seconds:9,name:'outside.jpg'},{seconds:15,name:'inside.jpg'},{seconds:22,name:'difficulty.jpg'}]);
 assert.equal(result[0].frame,'inside.jpg');assert.equal(result[0].explanation,'');assert.equal(result[0].difficulty,'');assert.equal(result[1].explanation,'按步骤计算');assert.equal(result[1].frameSeconds,22);
 assert.equal(attachSegmentEvidence([segments[0]],marks,[{seconds:9,name:'outside.jpg'}])[0].frame,undefined);
});
test('明确允许估算的测试场次可继续流程，但不得冒充已校准',()=>{const p=positionForMark({created:20000},{recordStart:10000,calibrated:false,allowEstimatedTiming:true});assert.deepEqual(p,{seconds:10,quality:'uncalibrated-estimate'});const s=normalizeSegments([{start:0,end:20}],[{start:0,end:20,text:'课程'}],[{id:'m',...p}]);assert.equal(s[0].timingQuality,'uncalibrated-estimate');});
