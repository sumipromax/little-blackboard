import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ffmpegPath,frame} from '../server/analysis.mjs';
test('使用真实ffmpeg从本地MP4提取JPEG关键帧',{skip:!ffmpegPath(),timeout:10000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'blackboard-frame-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const video=join(dir,'short.mp4'),image=join(dir,'frame.jpg');
 await promisify(execFile)(ffmpegPath(),['-nostdin','-v','error','-f','lavfi','-i','color=c=white:s=320x180:d=1','-pix_fmt','yuv420p','-y',video]);
 await frame(video,.5,image);const bytes=await readFile(image);assert.equal(bytes[0],0xff);assert.equal(bytes[1],0xd8);assert.ok(bytes.length>100);
});
