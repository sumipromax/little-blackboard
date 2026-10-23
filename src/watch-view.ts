import {esc} from './api';
import {channelStatus} from './channel-state';
export function watchView(current:any,config:any,picker:string,liveStatus:string,icon:(s:string)=>string){
 const state=channelStatus(liveStatus);
 return `<div class="watch-layout"><section class="lesson"><div class="lesson-title"><div class="course-heading"><h1 id="course-title">${esc(current.title)}</h1><details class="classroom-settings"><summary>切换课堂</summary><div class="context-line">${picker}<button id="connect-real" ${config.configured?'':'disabled'}>进入直播课堂</button></div></details></div><span class="status" data-status="${state.tone}" role="status" aria-label="频道直播状态">${state.label}</span></div>
 <div class="player-shell" id="player-shell"><div id="player"><div class="empty">正在连接课堂…</div></div>
 <div class="mark-bar"><div class="mark-actions"><span class="mark-control" data-tooltip="${liveStatus==='live'?'':'直播中才可用'}"><button id="highlight" disabled>${icon('star')}划重点</button></span><span class="mark-control" data-tooltip="${liveStatus==='live'?'':'直播中才可用'}"><button id="difficulty" disabled>${icon('question')}记难点</button></span></div><button id="open-records" aria-haspopup="dialog">${icon('book')}小黑板</button></div></div></section>
 <aside class="classroom-chat"><div class="chat-heading"><h2>讨论区</h2></div><div id="chat-messages" class="chat-messages" role="log" aria-label="讨论区" aria-live="polite"><div class="chat-empty">正在连接讨论区…</div></div><form id="chat-form"><label class="sr-only" for="chat-input">课堂发言</label><textarea id="chat-input" rows="3" maxlength="500" placeholder="说说你的想法..." disabled></textarea><div class="chat-composer-footer"><span id="chat-status" class="hint" role="status"></span><button class="primary" type="submit" disabled>发送</button></div></form></aside></div>`;
}
