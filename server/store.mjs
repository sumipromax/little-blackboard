import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
export function createStore(path = 'data/app.sqlite') {
 if(path!==':memory:') mkdirSync('data',{recursive:true});
 const db=new DatabaseSync(path);
 db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS objects(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id));`);
 const get=db.prepare('SELECT value FROM objects WHERE kind=? AND id=?');
 const list=db.prepare('SELECT value FROM objects WHERE kind=?');
 const put=db.prepare('INSERT INTO objects(kind,id,value) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value');
 return {
 get:(kind,id)=>{const row=get.get(kind,id);return row?JSON.parse(row.value):null;},
 list:kind=>list.all(kind).map(r=>JSON.parse(r.value)),
 put:(kind,value)=>{put.run(kind,value.id,JSON.stringify(value));return value;},
 transaction(fn){db.exec('BEGIN IMMEDIATE');try {const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}},
 close:()=>db.close()
 };
}
export function newId(){return randomUUID();}
export function createMark(store, viewer, input, now=Date.now()) {
 return store.transaction(()=>{
 const session=store.get('session',input.sessionId);
 if(!session || session.channelId!==input.channelId) throw new Error('场次不存在');
 if(session.status!=='live') throw new Error('直播已结束，不能继续标记');
 const recent=store.list('mark').find(m=>m.viewerId===viewer.id&&m.sessionId===session.id&&m.kind===input.kind&&!m.cancelled&&now-m.created<5000);
 if(recent) return recent;
 return store.put('mark',{...input,id:newId(),viewerId:viewer.id,viewerName:viewer.name,created:now,cancelled:false,undoUntil:now+5000});
 });
}
export function undoMark(store,viewer,id,now=Date.now()) {
 return store.transaction(()=>{
 const mark=store.get('mark',id);
 if(!mark || mark.viewerId!==viewer.id) throw new Error('记录不存在');
 if(mark.cancelled) return mark;
 if(now>=mark.undoUntil) throw new Error('撤销时间已结束');
 return store.put('mark',{...mark,cancelled:true});
 });
}
export function publish(store, segmentId, viewers, content, materialIds, now=Date.now()) {
 return store.transaction(()=>{
 const segment=store.get('segment',segmentId);
 if(!segment) throw new Error('片段不存在');
 if(store.list('publication').some(p=>p.segmentId===segmentId)) throw new Error('该片段已发布，第一期不支持再次发布');
 const marks=store.list('mark').filter(m=>!m.cancelled&&m.kind==='difficulty'&&segment.markIds.includes(m.id));
 const allowed=new Set(marks.map(m=>m.viewerId));
 if(!viewers.length||viewers.some(id=>!allowed.has(id))) throw new Error('接收学员不在该片段的难点名单中');
 if(!content.trim()&&!materialIds.length) throw new Error('请填写解释或选择材料');
 if(materialIds.some(id=>!store.get('material',id))) throw new Error('材料不存在，请重新选择');
 return store.put('publication',{id:newId(),segmentId,viewerIds:[...new Set(viewers)],content,materialIds,created:now});
 });
}
