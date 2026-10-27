export function abortableStep(promise,signal,timeout=30000){
 return new Promise((resolve,reject)=>{
  const finish=(error,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
  const abort=()=>finish(signal.reason||new DOMException('已取消','AbortError'));
  const timer=setTimeout(()=>finish(new Error('图片处理超时，请降低尺寸后重试')),timeout);
  signal?.addEventListener('abort',abort,{once:true});promise.then(v=>finish(null,v),finish);if(signal?.aborted)abort();
 });
}
export async function pngFromSvg(blob,width,height,signal){
 let url,canvas,img;
 try{
  await abortableStep(document.fonts.ready,signal);signal.throwIfAborted();
  url=URL.createObjectURL(blob);img=new Image();
  await abortableStep(new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('图片转换失败，请尝试 SVG 导出'));img.src=url;}),signal);
  signal.throwIfAborted();canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法创建导出画布');ctx.drawImage(img,0,0);
  const png=await abortableStep(new Promise(resolve=>canvas.toBlob(resolve,'image/png')),signal);
  signal.throwIfAborted();if(!png)throw new Error('图片导出失败，请降低输出尺寸');return png;
 }finally{if(img){img.onload=img.onerror=null;img.src='';}if(url)URL.revokeObjectURL(url);if(canvas)canvas.width=canvas.height=1;}
}
