import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const asModule=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const apiModule=asModule(ts.transpileModule(await readFile(new URL('../src/api.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const chatSource=ts.transpileModule(await readFile(new URL('../src/chat.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from ['"]\.\/api['"]/,`from ${JSON.stringify(apiModule)}`);
const {mountChat}=await import(asModule(chatSource));

function fixture(){
 const element=()=>({innerHTML:'',textContent:'',value:'',disabled:false,scrollHeight:0,scrollTop:0,clientHeight:100,listeners:new Map(),addEventListener(e,f){this.listeners.set(e,f);},removeEventListener(e){this.listeners.delete(e);}});
 const nodes=Object.fromEntries(['chat-messages','chat-status','chat-form','chat-input','submit'].map(id=>[id,element()]));nodes['chat-form'].querySelector=()=>nodes.submit;
 const old=globalThis.document;globalThis.document={querySelector:s=>nodes[s.slice(1)]};
 const emitter=()=>({listeners:new Map(),on(e,f){this.listeners.set(e,f);},off(e){this.listeners.delete(e);},emit(e,data={}){this.listeners.get(e)?.(data);}});
 const chatEvents=['ChatMessage','ReplaceChatMessage','RemoveChatMsg','ClearMsgHistory','ChatInfoChange','ChatConnectFail','ChatReconnectSuccess'];const sdk={ChatEvents:Object.fromEntries(chatEvents.map(e=>[e,e])),ChannelEvents:{LiveStatusChange:'live',SessionIdChange:'session'}};
 const state={liveStatus:'playback',settings:{watchChatEnabled:true,chatMessageAvatarDisplay:true},info:{},target:undefined,historyArgs:null,sends:0};
 const core={playback:{getCurrentPlaybackTarget:()=>state.target},channel:{getLiveStatus:()=>state.liveStatus,eventEmitter:emitter()},chat:{eventEmitter:emitter(),getChatInfo:()=>state.info,getChatSetting:()=>state.settings,getChatHistory:async args=>{state.historyArgs=args;return [];},sendSpeakMsg:async({content})=>{state.sends++;return {content,isSendFailed:false};}}};
 const connection=mountChat(core,sdk);return {nodes,state,core,connection,close(){connection.dispose();globalThis.document=old;}};
}

test('回放和未开播不额外禁止发言；使用SDK默认历史接口，不强制场次',async()=>{
 const f=fixture();try{await Promise.resolve();assert.deepEqual(f.state.historyArgs,{start:0,end:49});for(const liveStatus of ['playback','waiting','live']){f.state.liveStatus=liveStatus;f.core.channel.eventEmitter.emit('live');assert.equal(f.nodes['chat-input'].disabled,false);await f.connection.send('测试');}assert.equal(f.state.sends,3);
 f.core.chat.eventEmitter.emit('ChatMessage',{chatMsg:{id:'one',msgSource:'speak',content:'回放期间的新消息',time:1,user:{nick:'学员'}}});assert.match(f.nodes['chat-messages'].innerHTML,/回放期间的新消息/);
 }finally{f.close();}
});
test('后台关闭、禁言、踢出和回放对象连接权限阻止发言',async()=>{
 const f=fixture();try{for(const [settings,info,target] of [[{watchChatEnabled:false},{},undefined],[{watchChatEnabled:true},{isShield:true},undefined],[{watchChatEnabled:true},{chatRoomIsClosed:true},undefined],[{watchChatEnabled:true},{isKicked:true},undefined],[{watchChatEnabled:true},{chatExited:true},undefined],[{watchChatEnabled:true},{},{chatConnectEnabled:false}]]){Object.assign(f.state,{settings,info,target});await assert.rejects(f.connection.send('不能发出'));assert.equal(f.nodes['chat-input'].disabled,true);}assert.equal(f.state.sends,0);}finally{f.close();}
});
test('只看主持人与头像展示遵循SDK设置，用户文字保持转义',()=>{
 const f=fixture();try{Object.assign(f.state.settings,{filterManagerMsgEnabled:true,chatMessageAvatarDisplay:false});const emit=(id,type,content)=>f.core.chat.eventEmitter.emit('ChatMessage',{chatMsg:{id,msgSource:'speak',content,time:1,user:{nick:'用户',userType:type}}});emit('viewer','viewer','普通消息');emit('teacher','teacher','<script>讲师内容</script>');assert.doesNotMatch(f.nodes['chat-messages'].innerHTML,/普通消息|chat-avatar|<script>/);assert.match(f.nodes['chat-messages'].innerHTML,/&lt;script&gt;讲师内容/);}finally{f.close();}
});
test('连接失败禁用输入；恢复后重新遵循后台状态，销毁清理监听',()=>{
 const f=fixture();try{f.core.chat.eventEmitter.emit('ChatConnectFail');assert.equal(f.nodes['chat-input'].disabled,true);f.core.chat.eventEmitter.emit('ChatReconnectSuccess');assert.equal(f.nodes['chat-input'].disabled,false);f.connection.dispose();assert.equal(f.core.chat.eventEmitter.listeners.size,0);assert.equal(f.core.channel.eventEmitter.listeners.size,0);}finally{f.close();}
});

test('回车发送；中文输入法确认与Shift+Enter不误发送；禁言仍生效',async()=>{
 const f=fixture();try{
  const input=f.nodes['chat-input'],key=input.listeners.get('keydown');
  input.value='中文输入';key({key:'Enter',shiftKey:false,isComposing:true,keyCode:229,preventDefault(){}});key({key:'Enter',shiftKey:true,isComposing:false,keyCode:13,preventDefault(){}});assert.equal(f.state.sends,0);
  key({key:'Enter',shiftKey:false,isComposing:false,keyCode:13,preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(f.state.sends,1);assert.equal(input.value,'');assert.equal(f.nodes['chat-status'].textContent,'');assert.equal(input.placeholder,'说说你的想法...');
  f.state.info={isShield:true};f.core.chat.eventEmitter.emit('ChatInfoChange');input.value='禁言不能发送';key({key:'Enter',shiftKey:false,isComposing:false,keyCode:13,preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(f.state.sends,1);
 }finally{f.close();}
});
