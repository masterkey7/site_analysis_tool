import {project,distance} from './core.js';
import {renderBasemap} from './basemap.js';
export const escapeXml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const englishNames={'杭州奥体中心':'Hangzhou Olympic Sports Centre','钱江新城':'Qianjiang New City','钱江世纪城':'Qianjiang Century City','未来科技城':'Future Sci-Tech City','武林商圈':'Wulin Commercial District','杭州东站':'Hangzhou East Station','杭州西站':'Hangzhou West Station','杭州南站':'Hangzhou South Station','杭州萧山国际机场':'Hangzhou Xiaoshan Airport','西湖风景名胜区':'West Lake Scenic Area','西湖风景区':'West Lake Scenic Area'};
const n=v=>Number(v).toFixed(2);
export function boundsProjection(bounds,width,height){const sw=project(bounds.sw),ne=project(bounds.ne);return p=>{const q=project(p);return [(q[0]-sw[0])/(ne[0]-sw[0])*width,(q[1]-ne[1])/(sw[1]-ne[1])*height];};}
const overlap=(a,b)=>a.x<b.x+b.w+5&&a.x+a.w+5>b.x&&a.y<b.y+b.h+5&&a.y+a.h+5>b.y;
export function labelLayout(items,width,height,reserved=[]){
 const used=[...reserved,...items.filter(i=>i.position).map(i=>({x:i.position[0],y:i.position[1],w:i.w||140,h:i.h||42}))],out=[];
 for(const item of items){const w=item.w||140,h=item.h||42,[x,y]=item.xy;
  const candidates=[[x+12,y-h/2],[x-w-12,y-h/2],[x-w/2,y-h-14],[x-w/2,y+14],...[45,75,110,150,200,260].flatMap(r=>Array.from({length:24},(_,i)=>[x+Math.cos(i*Math.PI/12)*r-w/2,y+Math.sin(i*Math.PI/12)*r-h/2]))].map(([cx,cy])=>({x:Math.max(16,Math.min(width-w-16,cx)),y:Math.max(85,Math.min(height-h-78,cy)),w,h}));
  candidates.sort((a,b)=>(used.filter(r=>overlap(a,r)).length*10000+Math.hypot(a.x+w/2-x,a.y+h/2-y))-(used.filter(r=>overlap(b,r)).length*10000+Math.hypot(b.x+w/2-x,b.y+h/2-y)));
  const box=item.position?{x:item.position[0],y:item.position[1],w,h}:candidates[0];used.push(box);out.push({...item,...box});
 }return out;
}
export function renderAnalysis(a,{width=1000,height=750,mode='light',standalone=false,projectPoint,boundary=a.boundary,shapes=[],showTitle=true,showNorth=true,showLegend=true,showSite=true,underlay='',interactive=false,pixelWidth=width,pixelHeight=height,basemap=null,basemapStyle,basemapAttribution=false,satelliteWater=true}={}){
 const satellite=mode==='satellite',dark=mode==='dark',ink=dark?'#ecede8':'#384740',muted=dark?'#b6c7c7':'#69776e',paper=dark?'#192a32':'#f8f7f1',red=satellite?'#f20d19':dark?'#f59172':'#b94b3b',gold=satellite?'#325e46':dark?'#efd397':'#a78042',green=satellite?'#416d49':dark?'#86b7a1':'#729985';
 const annotationInk=satellite||dark?'#ffffff':ink,annotationHalo=satellite?'#39413d':paper;
 const projectP=projectPoint||boundsProjection(a.bounds,width,height),site=projectP(a.site.point),opt=a.options;
 const onPage=p=>p[0]>=0&&p[0]<=width&&p[1]>=0&&p[1]<=height;
 const visible=a.features.filter(f=>onPage(projectP(f.point))&&f.visible!==false&&(f.kind==='region'?opt.regions:f.kind==='commerce'?opt.commerce!==false:f.kind==='public'?opt.public!==false:f.kind==='landscape'?opt.landscape:opt.transit));
 const path=points=>points.map((p,i)=>{const q=projectP(p);return`${i?'L':'M'}${n(q[0])},${n(q[1])}`;}).join(' ')+'Z';
 const line=(p,q,color,dash='',opacity=1)=>`<path d="M${n(p[0])},${n(p[1])}L${n(q[0])},${n(q[1])}" fill="none" stroke="${color}" stroke-width="1" opacity="${opacity}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
 const label=(x,y,t,size=12,color=ink,extra='')=>`<text x="${n(x)}" y="${n(y)}" font-size="${size}" fill="${color}" ${extra}>${escapeXml(t)}</text>`;
 const radius=(p,m)=>Math.abs(projectP([p[0]+m/(111195*Math.cos(p[1]*Math.PI/180)),p[1]])[0]-projectP(p)[0]);
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(a.site.name)}城市区位分析"><defs><filter id="base-gray" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/></filter><clipPath id="analysis-clip"><rect width="${width}" height="${height}"/></clipPath><marker id="distance-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="${annotationInk}"/></marker><marker id="manual-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M0 0L8 4L0 8Z" fill="context-stroke"/></marker></defs><g font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif"><g clip-path="url(#analysis-clip)">`;
 if(standalone)svg+=`<rect width="${width}" height="${height}" fill="${paper}"/>`;
 if(underlay)svg+=underlay;
 if(standalone&&basemap)svg+=renderBasemap(basemap,{bounds:a.bounds,projectPoint:projectP,width,height,dark,style:basemapStyle});
 for(const d of a.districts){if(!opt.districts)continue;const active=d.primary&&opt.districts;svg+=`<path d="${d.polygons.map(path).join(' ')}" fill="${active?red:standalone&&!basemap&&!underlay?(dark?'#23353c':'#e8ebe2'):'none'}" fill-rule="evenodd" fill-opacity="${active?(satellite?.3:.13):standalone?.6:0}" stroke="${active?red:dark?'#647676':'#bbc5b9'}" stroke-width="${active?(satellite?3:1.6):.7}" stroke-dasharray="${active?(satellite?'none':'7 4'):'2 3'}"/>`;
 }
 // Fine, high-contrast distance rings and radial arrows share one visual language.
 const ringInk=annotationInk,ringHalo=satellite||dark?'#283530':'#ffffff',distanceLabels=[];
 if(opt.rings)(a.ringDistances||[3,5,10,20]).forEach((km,index)=>{
  const r=radius(a.site.point,km*1000),circle=`cx="${n(site[0])}" cy="${n(site[1])}" r="${n(r)}" fill="none" stroke-dasharray="5 3"`;
  svg+=`<g data-analysis="distance-ring"><circle ${circle} stroke="${ringHalo}" stroke-width="2.5" opacity=".28"/><circle ${circle} stroke="${ringInk}" stroke-width="1.5"/></g>`;
  const preferred=[60,40,24,12][index%4],angles=[preferred,...Array.from({length:36},(_,i)=>(preferred+i*10)%360)];
  const pos=angles.map(deg=>{const t=deg*Math.PI/180;return [site[0]+r*Math.cos(t),site[1]+r*Math.sin(t)];}).find(([x,y])=>x>45&&x<width-45&&y>85&&y<height-(showLegend?100:40)&&!distanceLabels.some(b=>overlap({x:x-48,y:y+3,w:48,h:20},b)));
  if(pos){const [x,y]=pos,dx=x-site[0],dy=y-site[1],len=Math.hypot(dx,dy),origin=[site[0]+dx/len*9,site[1]+dy/len*9];
   svg+=`<path data-analysis="distance-arrow" d="M${n(origin[0])},${n(origin[1])}L${n(x)},${n(y)}" fill="none" stroke="${ringInk}" stroke-width="1.25" marker-end="url(#distance-arrow)"/>`;
   svg+=label(x-6,y+17,km+'km',12,ringInk,'text-anchor="end" font-weight="600"');distanceLabels.push({x:x-45,y:y+3,w:45,h:20});
  }
 });
 if(opt.links)for(const f of visible.filter(f=>['rail','airport','transit'].includes(f.kind)))svg+=line(site,projectP(f.point),gold,'6 5',.8);
 for(const f of visible){const p=projectP(f.point);
  if(f.kind==='region'&&f.radius>0){
   const circle=`cx="${n(p[0])}" cy="${n(p[1])}" r="${n(radius(f.point,f.radius))}"`;
   svg+=`<g data-analysis="region-ring"><circle ${circle} fill="${gold}" fill-opacity="${satellite?.28:.18}" stroke="${satellite?'#ffffff':ringHalo}" stroke-width="2.4" stroke-dasharray="6 4"/><circle ${circle} fill="none" stroke="${satellite?'#ffffff':gold}" stroke-width="1.3" stroke-dasharray="6 4"/></g>`;
  }else if(['region','commerce','public','landscape'].includes(f.kind)){
   const color=f.kind==='landscape'?green:f.kind==='public'?(dark?'#c7b4df':'#85729b'):gold,r=f.importance==='primary'?6:f.importance==='context'?3.5:4.5;
   svg+=f.kind==='public'?`<rect x="${n(p[0]-r)}" y="${n(p[1]-r)}" width="${2*r}" height="${2*r}" rx="1" fill="${color}" stroke="${paper}" stroke-width="1.2"/>`:`<circle cx="${n(p[0])}" cy="${n(p[1])}" r="${r}" fill="${color}" stroke="${paper}" stroke-width="1.2"/>`;
  }
  else svg+=`<circle cx="${n(p[0])}" cy="${n(p[1])}" r="4.6" fill="${satellite||dark?'#53a8ca':'#397f98'}" stroke="${satellite||dark?'#ffffff':paper}" stroke-width="1.1"/>`;
 }
 if(boundary?.length)svg+=`<path d="${path(boundary)}" fill="${red}" fill-opacity=".3" stroke="${red}" stroke-width="${satellite?3:2}"/>`;
 if(showSite&&onPage(site)&&satellite)svg+=`<circle cx="${n(site[0])}" cy="${n(site[1])}" r="7" fill="${red}" stroke="#fff000" stroke-width="2"/>`;
 if(showSite&&onPage(site)&&!satellite)svg+=`<circle cx="${n(site[0])}" cy="${n(site[1])}" r="12" fill="${paper}" stroke="${red}" stroke-width="1.5"/><circle cx="${n(site[0])}" cy="${n(site[1])}" r="5" fill="${red}"/>`;
 const makeLabel=(id,xy,title,position,importance)=>{const sub=id==='site'?'SITE':englishNames[title]||'',size=id==='site'?13:importance==='primary'?12:importance==='context'?10:11;return {id,xy,title,sub,size,color:annotationInk,w:Math.max(60,title.length*size+4,sub.length*4.7+4),h:sub?32:20,position};};
 const items=[...(showSite&&onPage(site)?[makeLabel('site',site,a.site.name,a.site.labelPoint?projectP(a.site.labelPoint):null)]:[]),...visible.filter(f=>onPage(projectP(f.point))).sort((a,b)=>(b.score||0)-(a.score||0)).map(f=>makeLabel(f.id,projectP(f.point),f.name,f.labelPoint?projectP(f.labelPoint):null,f.importance))];
 for(const l of labelLayout(items,width,height,[...distanceLabels,...(showTitle?[{x:0,y:0,w:340,h:75}]:[]),...(showLegend?[{x:0,y:height-70,w:width,h:70}]:[])])){
  const end=[Math.max(l.x,Math.min(l.x+l.w,l.xy[0])),Math.max(l.y,Math.min(l.y+l.h,l.xy[1]))],gap=Math.hypot(end[0]-l.xy[0],end[1]-l.xy[1]);
  if(gap>30)svg+=line(l.xy,end,l.color,'',.65);
  const textStyle=`paint-order="stroke" stroke="${annotationHalo}" stroke-opacity="${satellite||dark?.3:.65}" stroke-width="${satellite||dark?.8:1.2}" stroke-linejoin="round"`;
  svg+=`<g ${interactive?`data-feature="${escapeXml(l.id)}" data-label-x="${l.x}" data-label-y="${l.y}" class="editable-label"`:''}><rect x="${n(l.x)}" y="${n(l.y)}" width="${l.w}" height="${l.h}" fill="transparent"/>`+label(l.x+2,l.y+13,l.title,l.size,l.color,`font-weight="${l.id==='site'?'700':l.size===12?'600':'500'}" ${textStyle}`);
  if(l.sub)svg+=label(l.x+2,l.y+27,l.sub,l.id==='site'?11:8.5,l.color,`font-weight="${l.id==='site'?'700':'400'}" ${textStyle}`);
  svg+='</g>';
 }
 for(const s of shapes){if(interactive)svg+=`<g data-shape="${escapeXml(s.id)}" class="editable-shape">`;const pts=s.points.map(projectP),st=s.style,attrs=`stroke="${st.color}" stroke-width="${st.width}" ${st.dash==='dashed'?'stroke-dasharray="8 6"':''}`;if(interactive){if(s.type==='text')svg+=`<rect x="${n(pts[0][0]-4)}" y="${n(pts[0][1]-17)}" width="${Math.max(24,s.text.length*14+8)}" height="24" fill="transparent" pointer-events="all"/>`;else svg+=`<path d="${pts.map((p,i)=>`${i?'L':'M'}${n(p[0])},${n(p[1])}`).join(' ')}${s.type==='polygon'?'Z':''}" fill="none" stroke="transparent" stroke-width="${Math.max(12,st.width+8)}" pointer-events="stroke"/>`;}if(s.type==='text')svg+=label(pts[0][0],pts[0][1],s.text,14,st.color);else svg+=`<path d="${pts.map((p,i)=>`${i?'L':'M'}${n(p[0])},${n(p[1])}`).join(' ')}${s.type==='polygon'?'Z':''}" ${attrs} fill="${s.type==='polygon'?st.color:'none'}" fill-opacity="${st.opacity}" ${s.type==='arrow'?'marker-end="url(#manual-arrow)"':''}/>`;if(interactive)svg+='</g>';}
 svg+='</g>';
 if(showTitle)svg+=`<rect x="18" y="17" width="300" height="55" fill="${paper}" fill-opacity=".93"/>`+label(30,35,'URBAN CONTEXT',9,muted,'letter-spacing="2"')+label(30,60,a.site.name+' · 城市区位分析',22,ink,'font-weight="600"');
 if(showNorth)svg+=label(width-34,32,'N',10,ink,'text-anchor="middle"')+`<path d="M${width-34} 40l-5 18 5-4 5 4Z" fill="${ink}"/>`;
 if(showLegend){svg+=`<rect x="18" y="${height-70}" width="${width-36}" height="46" rx="3" fill="${paper}" fill-opacity=".94"/>`;
 const entries=[],primary=a.districts.find(d=>d.primary);
 if(showSite)entries.push([a.site.name.length>18?a.site.name.slice(0,17)+'…':a.site.name||'项目场地',red]);
 if(opt.districts&&primary)entries.push([primary.name+'行政边界',red,'line']);
 if(visible.some(f=>f.kind==='region'))entries.push([visible.some(f=>f.kind==='region'&&f.radius>0)?'重点片区（示意）':'商务与产业片区',gold]);
 if(visible.some(f=>f.kind==='commerce'))entries.push(['商业中心',gold]);
 if(visible.some(f=>f.kind==='landscape'))entries.push(['公园景观',green]);
 if(visible.some(f=>f.kind==='public'))entries.push(['公共设施',dark?'#c7b4df':'#85729b','square']);
 if(visible.some(f=>['rail','airport','transit'].includes(f.kind)))entries.push(['交通枢纽','#397f98']);
 let x=32,y=height-55;const right=width-175;
 for(const [title,color,symbol] of entries){const w=title.length*10+36;if(x+w>right){x=32;y+=19;}
 svg+=symbol==='line'?`<path d="M${x-5} ${y}h12" stroke="${color}" stroke-width="1.5"/>`:symbol==='square'?`<rect x="${x-4}" y="${y-4}" width="8" height="8" fill="${color}"/>`:`<circle cx="${x}" cy="${y}" r="4" fill="${color}"/>`;
 svg+=label(x+12,y+4,title,10);x+=w;}
 }
 if((standalone&&basemap)||basemapAttribution)svg+=satellite?label(width-16,height-10,'影像：© 高德地图'+(satelliteWater?' · 水体：OpenFreeMap / © OpenMapTiles / © OpenStreetMap contributors · ODbL':''),6,'#ffffff','text-anchor="end" paint-order="stroke" stroke="#39413d" stroke-width="1"'):label(30,height-10,'底图：OpenFreeMap / © OpenMapTiles / © OpenStreetMap contributors · ODbL · openstreetmap.org/copyright',7,muted);
 const metres=distance(a.bounds.sw,[a.bounds.ne[0],a.bounds.sw[1]]),bar=width*5000/metres;if(bar<width*.22)svg+=`<path d="M${width-36-bar} ${height-43}v5h${bar}v-5" fill="none" stroke="${ink}"/>`+label(width-36-bar/2,height-48,'5 km',9,muted,'text-anchor="middle"');
 return svg+'</g></svg>';
}
