import {cleanAnalysis} from './analysis-data.js';
import {cleanBasemapStyle} from './basemap.js';
export const COORDINATE_SYSTEM='GCJ02';
export const initialState=()=>({version:2,coordinateSystem:COORDINATE_SYSTEM,name:'未命名场地',siteConfirmed:false,boundary:[],view:{center:[120.229,30.233],zoom:13},output:null,ratio:'4:3',width:4800,height:3600,mode:'light',baseLabels:true,showTitle:false,showNorth:true,showLegend:true,shapes:[],analysis:null,basemapStyle:cleanBasemapStyle()});
export const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=-180&&p[0]<=180&&p[1]>=-85&&p[1]<=85;
export function centerOf(points){return [(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2,(Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2];}
export function distance(a,b){const r=Math.PI/180,dl=(b[0]-a[0])*r,dp=(b[1]-a[1])*r,h=Math.sin(dp/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dl/2)**2;return 12742017.6*Math.asin(Math.min(1,Math.sqrt(h)));}
export function area(points){if(points.length<3)return 0;const c=centerOf(points),k=111195;const q=points.map(p=>[(p[0]-c[0])*k*Math.cos(c[1]*Math.PI/180),(p[1]-c[1])*k]);let s=0;for(let i=0;i<q.length;i++){const a=q[i],b=q[(i+1)%q.length];s+=a[0]*b[1]-b[0]*a[1];}return Math.abs(s/2);}
export function frameRect(width,height,ratio){const usableW=Math.max(40,width-66),usableH=Math.max(40,height-136);let w=usableW,h=w/ratio;if(h>usableH){h=usableH;w=h*ratio;}return{x:(width-w)/2,y:(height-h)/2+10,w,h};}
export function project(p){const lat=p[1]*Math.PI/180;return[(p[0]+180)/360,(1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2];}
export function unproject(p){return[p[0]*360-180,Math.atan(Math.sinh(Math.PI*(1-2*p[1])))*180/Math.PI];}
export function viewForBounds(bounds,frame,width,height){const sw=project(bounds.sw),ne=project(bounds.ne),zoom=Math.max(3,Math.min(20,Math.log2(Math.min(frame.w/(ne[0]-sw[0]),frame.h/(sw[1]-ne[1]))/256))),scale=256*2**zoom;return{zoom,center:unproject([(sw[0]+ne[0])/2-(frame.x+frame.w/2-width/2)/scale,(sw[1]+ne[1])/2-(frame.y+frame.h/2-height/2)/scale])};}
export function sameBounds(a,b){if(!a||!b)return false;const tolerance=Math.max(b.ne[0]-b.sw[0],b.ne[1]-b.sw[1])*0.002;return a.sw.every((v,i)=>Math.abs(v-b.sw[i])<tolerance)&&a.ne.every((v,i)=>Math.abs(v-b.ne[i])<tolerance);}
export function cleanPath(points){return points.filter((p,i)=>!i||distance(p,points[i-1])>.1);}
export function validateProject(raw){
 if(raw?.app!=='site-atlas'||raw?.version!==2||raw?.state?.coordinateSystem!==COORDINATE_SYSTEM)throw new Error('请导入本版高德项目文件。旧版 WGS84 项目不能直接混用。');
 const s=raw.state;if(typeof s.name!=='string'||s.name.length>120||!Array.isArray(s.boundary)||s.boundary.length>1000||!s.boundary.every(point)||(s.boundary.length>0&&s.boundary.length<3))throw new Error('场地边界无效');
 if(!point(s.view?.center)||!Number.isFinite(s.view.zoom)||s.view.zoom<3||s.view.zoom>20||!['light','moss','dark','satellite'].includes(s.mode)||!['4:3','16:9','1:1','custom'].includes(s.ratio))throw new Error('取景配置无效');
 if(![s.width,s.height].every(n=>Number.isInteger(n)&&n>=600&&n<=8000)||s.width*s.height>40000000)throw new Error('图片尺寸需为 600–8000 像素，且总像素不超过 4000 万');
 if(s.ratio!=='custom'){const [a,b]=s.ratio.split(':').map(Number);if(Math.abs(s.width/s.height-a/b)>.002)throw new Error('图片尺寸与比例不一致');}
 if(s.output&&(!point(s.output.sw)||!point(s.output.ne)||s.output.sw[0]>=s.output.ne[0]||s.output.sw[1]>=s.output.ne[1]))throw new Error('已保存的出图范围无效');
 if(!Array.isArray(s.shapes)||s.shapes.length>500)throw new Error('标绘过多或无效');
 for(const item of s.shapes){if(typeof item.id!=='string'||item.id.length>80||!['line','polyline','arrow','polygon','text'].includes(item.type)||!Array.isArray(item.points)||item.points.length>1000||!item.points.every(point)||item.points.length<(item.type==='text'?1:item.type==='polygon'?3:2))throw new Error('标绘坐标无效');const st=item.style;if(!st||!/^#[\da-f]{6}$/i.test(st.color)||![2,4,7].includes(st.width)||!['solid','dashed'].includes(st.dash)||!Number.isFinite(st.opacity)||st.opacity<0||st.opacity>.6)throw new Error('标绘样式无效');if(item.type==='text'&&(typeof item.text!=='string'||item.text.length>80))throw new Error('文字标注无效');}
 // Copy known fields only: credentials and arbitrary imported properties never enter state.
 return {basemapStyle:cleanBasemapStyle(s.basemapStyle),analysis:cleanAnalysis(s.analysis),version:2,coordinateSystem:COORDINATE_SYSTEM,name:s.name,siteConfirmed:s.siteConfirmed===true&&s.boundary.length>=3&&area(s.boundary)>1,boundary:s.boundary.map(p=>[...p]),view:{center:[...s.view.center],zoom:s.view.zoom},output:s.output?{sw:[...s.output.sw],ne:[...s.output.ne]}:null,ratio:s.ratio,width:s.width,height:s.height,mode:s.mode,baseLabels:s.baseLabels!==false,showTitle:false,showNorth:s.showNorth!==false,showLegend:s.showLegend!==false,shapes:s.shapes.map(x=>({id:x.id,type:x.type,points:x.points.map(p=>[...p]),...(x.type==='text'?{text:x.text}:{}),style:{color:x.style.color,width:x.style.width,dash:x.style.dash,opacity:x.style.opacity}}))};
}
