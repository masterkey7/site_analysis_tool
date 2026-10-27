import {viewForBounds,sameBounds} from './core.js';

let rendererPromise;
function loadRenderer(){
 if(window.html2canvas)return Promise.resolve(window.html2canvas);
 if(!rendererPromise)rendererPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='/html2canvas.min.js';
  const timer=setTimeout(()=>{script.remove();reject(new Error('截图组件加载超时，请重试'));},15000);
  script.onload=()=>{clearTimeout(timer);window.html2canvas?resolve(window.html2canvas):reject(new Error('截图组件不可用'));};
  script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('截图组件加载失败，请重试'));};document.head.append(script);
 }).catch(e=>{rendererPromise=null;throw e;});
 return rendererPromise;
}
export function satelliteView(bounds,width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<600||height<600||width>8000||height>8000||width*height>40000000)throw new Error('卫星图片尺寸超出支持范围');
 return viewForBounds(bounds,{x:0,y:0,w:width,h:height},width,height);
}
export function assertSatellitePixels(samples){
 const colors=new Set();let visible=0,min=255,max=0;
 for(let i=0;i<samples.length;i+=4){if(samples[i+3]<240)continue;visible++;const value=(samples[i]+samples[i+1]+samples[i+2])/3;min=Math.min(min,value);max=Math.max(max,value);colors.add(`${samples[i]>>4},${samples[i+1]>>4},${samples[i+2]>>4}`);}
 if(visible<samples.length/4*.8||colors.size<4||max-min<12)throw new Error('卫星底图为空白或尚未完整加载，请稍后重试');
}
function checkCanvas(canvas){
 const probe=document.createElement('canvas');probe.width=8;probe.height=8;const ctx=probe.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(canvas,canvas.width*.1,canvas.height*.1,canvas.width*.8,canvas.height*.8,0,0,8,8);
 assertSatellitePixels(ctx.getImageData(0,0,8,8).data);probe.width=probe.height=1;
}
function waitComplete(map,signal){return new Promise((resolve,reject)=>{
 const end=(error)=>{clearTimeout(timer);map.off('complete',done);signal.removeEventListener('abort',cancel);error?reject(error):resolve();};
 const done=()=>end(),cancel=()=>end(new DOMException('已取消导出','AbortError'));
 const timer=setTimeout(()=>end(new Error('卫星底图加载超时，请检查网络或降低图片尺寸')),60000);
 map.on('complete',done);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
});}
function boundedRender(promise,signal){return new Promise((resolve,reject)=>{
 const finish=(error,value)=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);error?reject(error):resolve(value);};
 const cancel=()=>finish(new DOMException('已取消导出','AbortError'));
 const timer=setTimeout(()=>finish(new Error('卫星图片合成超时，请降低输出尺寸后重试')),30000);
 signal.addEventListener('abort',cancel,{once:true});promise.then(v=>finish(null,v),e=>finish(e));if(signal.aborted)cancel();
});}
// Use AMap's documented preserveDrawingBuffer + html2canvas approach. The SDK
// renders the chosen extent into a NEW target-size map; no private tile URLs,
// screenshot upscaling, existing project mutation, or attribution removal.
export async function captureSatellite({AM,bounds,width,height,baseLabels=false,signal=new AbortController().signal,onProgress=()=>{}}){
 const render=await loadRenderer();signal.throwIfAborted();const view=satelliteView(bounds,width,height);
 const host=document.createElement('div');Object.assign(host.style,{position:'fixed',left:'-100000px',top:'0',width:width+'px',height:height+'px',pointerEvents:'none'});host.setAttribute('aria-hidden','true');document.body.append(host);
 let map,raw,filtered;
 try{
  onProgress(`正在加载 ${width} × ${height} 卫星底图…`);
  map=new AM.Map(host,{...view,zooms:[3,20],viewMode:'2D',pitch:0,rotation:0,rotateEnable:false,pitchEnable:false,resizeEnable:false,animateEnable:false,jogEnable:false,dragEnable:false,zoomEnable:false,WebGLParams:{preserveDrawingBuffer:true},layers:[new AM.TileLayer.Satellite(),...(baseLabels?[new AM.TileLayer.RoadNet()]:[])]});
  await waitComplete(map,signal);signal.throwIfAborted();
  // AMap complete marks tile readiness; allow the final WebGL paint to finish.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));signal.throwIfAborted();
  const b=map.getBounds(),sw=b.getSouthWest(),ne=b.getNorthEast();
  if(!sameBounds({sw:[sw.getLng(),sw.getLat()],ne:[ne.getLng(),ne.getLat()]},bounds))throw new Error('卫星取景未能精确匹配出图框，请降低输出尺寸或扩大范围');
  onProgress('正在合成灰度卫星影像与分析标注…');
  raw=await boundedRender(render(host,{allowTaint:false,useCORS:true,scale:1,width,height,backgroundColor:null,logging:false,imageTimeout:20000,windowWidth:width,windowHeight:height,removeContainer:true}),signal);signal.throwIfAborted();
  if(raw.width!==width||raw.height!==height)throw new Error('卫星影像输出尺寸不正确');checkCanvas(raw);
  filtered=document.createElement('canvas');filtered.width=width;filtered.height=height;const ctx=filtered.getContext('2d');if(!ctx)throw new Error('无法创建卫星出图画布');
  ctx.filter='grayscale(1) contrast(.72) brightness(1.35)';ctx.drawImage(raw,0,0);ctx.filter='none';
  return filtered.toDataURL('image/png');
 }catch(e){if(e.name==='SecurityError')throw new Error('当前卫星图层不允许浏览器读取图片，未导出空白底图');throw e;}
 finally{map?.destroy();host.remove();if(raw)raw.width=raw.height=1;if(filtered)filtered.width=filtered.height=1;}
}
