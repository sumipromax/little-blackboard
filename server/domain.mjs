import { createHash, timingSafeEqual } from 'node:crypto';
export const md5 = value => createHash('md5').update(value).digest('hex');
export function polyvSign(params, secret) {
  return md5(secret + Object.keys(params).sort().map(k => k + params[k]).join('') + secret).toUpperCase();
}
export function validCallback(query, secret, now = Date.now()) {
  if (!secret || !/^\d{13}$/.test(String(query.timestamp)) || Math.abs(now - Number(query.timestamp)) > 600000) return false;
  const actual = String(query.sign || '').toLowerCase();
  const expected = md5(secret + query.timestamp);
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
export function parseSrt(source) {
  const blocks = source.replace(/^\uFEFF/, '').replace(/\r/g, '').trim().split(/\n\s*\n/);
  const stamp = t => { const [h,m,s] = t.replace(',', '.').split(':').map(Number); return h*3600+m*60+s; };
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const i = lines.findIndex(l => /\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(l));
    if (i < 0) continue;
    const match = lines[i].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!match) continue;
    const start = stamp(match[1]), end = stamp(match[2]);
    const text = lines.slice(i+1).join(' ').replace(/<[^>]*>/g, '').trim();
    if (end > start && text) cues.push({ start, end, text });
  }
  if (!cues.length) throw new Error('没有解析到有效的SRT字幕');
  return cues.sort((a,b) => a.start-b.start);
}
export function positionForMark(mark, session) {
  if (mark.mediaTime != null && mark.timing === 'replay') return { seconds:mark.mediaTime, quality:'exact' };
  if (mark.mediaDate) return { seconds:(mark.mediaDate-session.recordStart)/1000, quality:'media-clock' };
  if (!session.calibrated && session.allowEstimatedTiming) return { seconds:(mark.created-session.recordStart)/1000, quality:'uncalibrated-estimate' };
  if (!session.calibrated) throw new Error('直播标记时间尚未校准，无法准确关联回放');
  return { seconds:(mark.created-session.recordStart)/1000-session.delaySeconds, quality:'calibrated-estimate' };
}
export function normalizeSegments(segments, cues, marks) {
  const max = cues.at(-1).end;
  const sorted = segments.map(s => {
    if (!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start<0||s.end>max+0.1||s.end<=s.start) throw new Error('AI片段时间超出字幕范围');
    const transcript = cues.filter(c=>c.start<s.end&&c.end>s.start).map(c=>c.text).join('\n');
    if (!transcript) throw new Error('AI片段没有字幕依据');
    return {...s, transcript, markIds:marks.filter(m=>m.seconds>=s.start&&(m.seconds<s.end||s.end===max&&m.seconds===max)).map(m=>m.id)};
  }).sort((a,b)=>a.start-b.start);
  for (let i=1;i<sorted.length;i++) if(sorted[i].start < sorted[i-1].end) throw new Error('AI片段重叠，请重新分析');
  const included = new Set(sorted.flatMap(s=>s.markIds));
  if (marks.some(m=>!included.has(m.id))) throw new Error('AI未覆盖所有标记，请重新分析');
  return sorted.filter(s=>s.markIds.length).map(s=>({...s,timingQuality:marks.some(m=>s.markIds.includes(m.id)&&m.quality==='uncalibrated-estimate')?'uncalibrated-estimate':marks.some(m=>s.markIds.includes(m.id)&&m.quality==='calibrated-estimate')?'calibrated-estimate':'media-time'}));
}
export const demoCues = [
  {start:0,end:25,text:'今天我们用分数除法看看，一杯水能装满几个四分之一杯。除法可以理解为里面有多少份。'},
  {start:25,end:55,text:'一杯水除以四分之一杯，就是一杯里面有几个四分之一。答案是四个。'},
  {start:55,end:90,text:'所以除以四分之一等于乘以四。这里的四是四分之一的倒数。不是随便把分数翻过来，而是把每一份作为单位去数。'}
];
export function demoSegments(marks) {
  return normalizeSegments([{start:0,end:90,title:'为什么分数除法要乘倒数',summary:'用一杯水能装几个四分之一杯，解释分数除法的含义。',difficulty:'可能知道计算规则，但还没理解“有多少份”与乘倒数之间的关系。',explanation:'把一杯水分装到四分之一杯的小杯里，能装满4杯，所以1 ÷ 1/4 = 4。乘以4是在数一杯里有多少个四分之一。结合原课程，可以先用这个例子理解，再回看计算规则。'}],demoCues,marks);
}
export function attachSegmentEvidence(segments,marks,frames){
 return segments.map(s=>{
  const related=marks.filter(m=>s.markIds.includes(m.id)),needsExplanation=related.some(m=>m.kind==='difficulty');
  const target=Math.min(...related.map(m=>m.seconds));
  const candidates=frames.filter(f=>f.seconds>=s.start&&f.seconds<s.end);
  const chosen=candidates.reduce((a,b)=>!a||Math.abs(b.seconds-target)<Math.abs(a.seconds-target)?b:a,null);
  return {...s,difficulty:needsExplanation?s.difficulty:'',explanation:needsExplanation?s.explanation:'',frame:chosen?.name,frameSeconds:chosen?.seconds};
 });
}
