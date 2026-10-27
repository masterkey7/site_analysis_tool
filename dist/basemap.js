export const defaultBasemapStyle=()=>({water:true,roads:true,buildings:true,green:true});
export function cleanBasemapStyle(s){return Object.fromEntries(Object.keys(defaultBasemapStyle()).map(k=>[k,s?.[k]!==false]));}
export function coversBounds(base,bounds){return !!base&&bounds.sw[0]>=base.bounds.sw[0]&&bounds.sw[1]>=base.bounds.sw[1]&&bounds.ne[0]<=base.bounds.ne[0]&&bounds.ne[1]<=base.bounds.ne[1];}
const escaped=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const number=x=>x.toFixed(2);
export function renderBasemap(base,{bounds,projectPoint,width,height,dark=false,style=defaultBasemapStyle()}){
 if(!base)return '';
 const paths=(f,close=true)=>f.paths.map(r=>r.map((p,i)=>{const q=projectPoint(p);return (i?'L':'M')+number(q[0])+','+number(q[1]);}).join(' ')+(close?'Z':'')).join(' ');
 const visible=f=>f.bbox[0]<bounds.ne[0]&&f.bbox[2]>bounds.sw[0]&&f.bbox[1]<bounds.ne[1]&&f.bbox[3]>bounds.sw[1];
 const layer=name=>base.layers[name].filter(visible);
 const groups=(features,fill,stroke='none',weight=0)=>features.map(f=>`<path d="${paths(f)}" fill="${fill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="${weight}"/>`).join('');
 let out=`<g data-layer="geographic-basemap">`;
 if(style.green)for(const kind of ['farmland','orchard','grass','forest','wood','scrub','park'])out+=groups(layer('green').filter(f=>f.kind===kind),dark?(kind==='farmland'?'#263837':'#293e3c'):(kind==='farmland'?'#e4e5d5':kind==='park'?'#c6d6bf':'#d1dac9'));
 if(style.buildings){out+=groups(layer('urban'),dark?'#354047':'#dedfd9');out+=`<path d="${layer('buildings').map(f=>paths(f)).join(' ')}" fill="${dark?'#687172':'#b7bcb7'}" fill-rule="nonzero"/>`;}
 if(style.water)out+=groups(layer('water'),dark?'#162f3a':'#bad1d5');
 if(style.roads){const roads=layer('roads');
  const classes=[['residential','unclassified'],['tertiary'],['secondary','secondary_link'],['primary','primary_link'],['trunk','trunk_link'],['motorway','motorway_link'],['rail']];
  for(let i=0;i<classes.length;i++){const fs=roads.filter(f=>classes[i].includes(f.kind));if(!fs.length)continue;const d=fs.map(f=>paths(f,false)).join(' '),weight=[.4,.6,.8,1.05,1.2,1.4,.6][i];
   if(i>0&&i<6)out+=`<path d="${d}" fill="none" stroke="${dark?'#293439':'#f8f7ee'}" stroke-width="${weight+.7}" stroke-linejoin="round" stroke-linecap="round"/>`;
   out+=`<path d="${d}" fill="none" stroke="${i===6?(dark?'#84908e':'#a7aaa1'):dark?['#667376','#6f7c7d','#849090','#98a09d','#a7ada5','#b7bbac'][i]:['#faf9f4','#faf9f1','#f9f7ee','#c8cdc3','#bcc3b7','#b1bbad'][i]}" stroke-width="${weight}" stroke-linejoin="round" stroke-linecap="round" ${i===6?'stroke-dasharray="2 2"':''}/>`;
  }
 }
 // Labels are attached to actual geometry, with only the most important water names retained.
 if(style.water){const named=(base.labels||[]).map(f=>({...f,p:projectPoint(f.point)})).filter(f=>f.p[0]>30&&f.p[0]<width-40&&f.p[1]>80&&f.p[1]<height-75).sort((a,b)=>Math.hypot(a.p[0]-width*.68,a.p[1]-height*.35)-Math.hypot(b.p[0]-width*.68,b.p[1]-height*.35));const used=new Set();for(const f of named){if(used.has(f.name))continue;used.add(f.name);const p=f.p;out+=`<text x="${number(p[0])}" y="${number(p[1])}" text-anchor="middle" font-size="${f.name.includes('钱塘')?15:11}" fill="${dark?'#9bbdc7':'#547c88'}" letter-spacing="${f.name.includes('钱塘')?6:2}" paint-order="stroke" stroke="${dark?'#162f3a':'#bad1d5'}" stroke-width="3">${escaped(f.name)}</text>`;}}
 return out+'</g>';
}
export function pointInRings(p,rings){let inside=false;for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function interiorPoint(rings,bounds){
 const pts=rings.flat(),b=[Infinity,Infinity,-Infinity,-Infinity];for(const p of pts){b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);}
 const lo=[Math.max(b[0],bounds.sw[0]),Math.max(b[1],bounds.sw[1])],hi=[Math.min(b[2],bounds.ne[0]),Math.min(b[3],bounds.ne[1])];let best=null,bestD=-1;
 for(let x=1;x<24;x++)for(let y=1;y<24;y++){const p=[lo[0]+(hi[0]-lo[0])*x/24,lo[1]+(hi[1]-lo[1])*y/24];if(!pointInRings(p,rings))continue;let d=Infinity;for(const ring of rings)for(let i=1;i<ring.length;i++){const a=ring[i-1],c=ring[i],dx=c[0]-a[0],dy=c[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));d=Math.min(d,(p[0]-a[0]-dx*t)**2+(p[1]-a[1]-dy*t)**2);}if(d>bestD){bestD=d;best=p;}}
 return best;
}
