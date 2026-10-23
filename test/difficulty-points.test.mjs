import test from 'node:test';import assert from 'node:assert/strict';import {pairDifficultyPoints} from '../server/difficulty-points.mjs';
const points=[{difficulty:'可能混淆判别式和方程的根',evidence:'Δ大于0时有两个不相等实根',explanation:'判别式用于判断根的情况，求根公式才用于计算根的值。'},{difficulty:'可能忽略求根公式中的正负号',evidence:'求根公式包含正负根号Δ',explanation:'Δ大于0时，正负两个分支得到不同的值，因此有两个不相等实根。'}];
test('每个可能难点对应唯一解释，保留统一编号和证据',()=>{const s=pairDifficultyPoints({difficultyPoints:points},true);assert.equal(s.difficultyPoints.length,2);assert.match(s.explanation,/难点 1：可能混淆/);assert.match(s.explanation,/难点 2：可能忽略/);assert.equal(s.difficultyPoints[1].explanation,points[1].explanation);});
test('难点缺失、空解释、重复难点必须阻止保存',()=>{for(const p of [[],[{...points[0],explanation:''}],[points[0],points[0]]])assert.throws(()=>pairDifficultyPoints({difficultyPoints:p},true));});
test('纯重点不会因为模型猜测而产生难点解释',()=>{const s=pairDifficultyPoints({difficultyPoints:points},false);assert.deepEqual(s.difficultyPoints,[]);assert.equal(s.explanation,'');});
