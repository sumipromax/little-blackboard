export async function api<T=any>(path:string,body?:unknown):Promise<T>{
 const response=await fetch('/api'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'请求失败');return data;
}
export const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const clock=(n:number)=>`${Math.floor(n/60).toString().padStart(2,'0')}:${Math.floor(n%60).toString().padStart(2,'0')}`;
let noticeTimer:ReturnType<typeof setTimeout>|undefined;
export function toast(message:string){const box=document.querySelector('#notice')!;box.textContent=message;box.classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>box.classList.remove('visible'),4500);}
export function button(id:string,fn:()=>unknown){document.getElementById(id)?.addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>toast(e.message)));}
