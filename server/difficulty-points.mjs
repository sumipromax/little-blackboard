import {z} from 'zod';
export const difficultyPointSchema=z.object({
 difficulty:z.string().trim().min(5).max(500),
 evidence:z.string().trim().min(1).max(800),
 explanation:z.string().trim().min(10).max(2000)
});
export function pairDifficultyPoints(segment,needsExplanation){
 if(!needsExplanation)return {...segment,difficultyPoints:[],difficulty:'',explanation:''};
 if(!Array.isArray(segment.difficultyPoints)||!segment.difficultyPoints.length)throw new Error('AI未生成可能难点及对应解释，请重新生成');
 const points=z.array(difficultyPointSchema).min(1).max(4).parse(segment.difficultyPoints);
 const names=points.map(p=>p.difficulty.replace(/\s/g,''));
 if(new Set(names).size!==points.length)throw new Error('AI返回了重复的可能难点，请重新生成');
 if(points.some(p=>!p.difficulty.startsWith('可能')))throw new Error('AI难点必须表述为可能的理解障碍');
 return {...segment,difficultyPoints:points,
 difficulty:points.map((p,i)=>`${i+1}. ${p.difficulty}`).join('\n'),
 explanation:points.map((p,i)=>`难点 ${i+1}：${p.difficulty}\n解释：${p.explanation}`).join('\n\n')};
}
