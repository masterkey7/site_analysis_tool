import {renderAnalysis,boundsProjection,escapeXml} from './analysis-svg.js';
import {coversBounds,cleanBasemapStyle} from './basemap.js';
import {centerOf} from './core.js';

export const baseLayers=['green','buildings','water','roads'];
export const layerUrl=(layer,mode)=>`/basemap-${mode==='dark'||mode==='satellite'?'dark-':mode==='light'?'gray-':''}${layer}.png`;
export const fullUrl=mode=>`/basemap-full-${mode==='satellite'?'dark':mode}.png`;

export const imageUrl=(metadata,mode,layer)=>metadata?.assetUrls?.[mode]?.[layer]||(layer==='full'?fullUrl(mode):layerUrl(layer,mode));
export function backgroundLayers(state,bounds,metadata,width,height,images={}){
 const project=boundsProjection(bounds,width,height),b=metadata.bounds;
 const tl=project([b.sw[0],b.ne[1]]),br=project([b.ne[0],b.sw[1]]),style=cleanBasemapStyle(state.basemapStyle);
 const layers=baseLayers.every(k=>style[k])?['full']:baseLayers.filter(k=>style[k]);
 return `<g data-layer="frame-basemap"><rect x="${tl[0]}" y="${tl[1]}" width="${br[0]-tl[0]}" height="${br[1]-tl[1]}" fill="${state.mode==='dark'?'#192a32':'#f8f7f1'}"/>`+layers.map(k=>`<image data-basemap="${k}" href="${escapeXml(images[k]||imageUrl(metadata,state.mode,k))}" x="${tl[0]}" y="${tl[1]}" width="${br[0]-tl[0]}" height="${br[1]-tl[1]}" preserveAspectRatio="none"/>`).join('')+'</g>';
}
export function renderBackdrop(state,bounds,metadata,width,height,images={}){
 if(state.mode==='satellite'){
  if(state.basemapStyle?.water===false)return '';
  const project=boundsProjection(bounds,width,height),b=metadata.bounds,tl=project([b.sw[0],b.ne[1]]),br=project([b.ne[0],b.sw[1]]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image data-layer="satellite-water" href="${escapeXml(images.water||imageUrl(metadata,'moss','water'))}" x="${tl[0]}" y="${tl[1]}" width="${br[0]-tl[0]}" height="${br[1]-tl[1]}" preserveAspectRatio="none" opacity=".95"/></svg>`;
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${backgroundLayers(state,bounds,metadata,width,height)}</svg>`;
}
function analysisForScene(state,bounds){
 if(state.analysis)return {...state.analysis,bounds,site:{...state.analysis.site,name:state.analysis.site.sample?state.analysis.site.name:state.name}};
 return {bounds,boundary:state.boundary,site:{name:state.name,point:state.boundary.length?centerOf(state.boundary):centerOf([bounds.sw,bounds.ne]),sample:false},features:[],districts:[],generatedAt:'',options:{districts:false,regions:false,transit:false,landscape:false,rings:false,links:false}};
}
export function renderSatelliteOverlay(state,bounds,{interactive=false}={}){
 return renderAnalysis(analysisForScene(state,bounds),{width:1000,height:1000*state.height/state.width,mode:state.mode,standalone:false,boundary:state.boundary,shapes:state.shapes,showTitle:false,showNorth:state.showNorth,showLegend:!!state.analysis&&state.showLegend,showSite:!!state.analysis||state.boundary.length>0,basemapAttribution:true,satelliteWater:state.basemapStyle.water,interactive});
}

// The viewport and download share this exact composition. Only image URLs and
// outer pixel dimensions change for the self-contained exported file.
export function renderScene(state,bounds,metadata,{images={},pixelWidth=1000,pixelHeight=1000*state.height/state.width,interactive=false}={}){
 const satellite=state.mode==='satellite';
 if(satellite&&!/^data:image\/(png|jpeg);base64,/.test(images.satellite||''))throw new Error('卫星影像尚未准备完成，不能导出空白底图');
 if((!satellite||state.basemapStyle.water)&&!coversBounds(metadata,bounds))throw new Error('出图框超出已加载底图，请等待当前范围加载完成');
 const width=1000,height=1000*state.height/state.width,a=analysisForScene(state,bounds);
 const base=satellite?`<image data-layer="satellite-imagery" href="${escapeXml(images.satellite)}" width="${width}" height="${height}" preserveAspectRatio="none"/>`+renderBackdrop(state,bounds,metadata,width,height,images):backgroundLayers(state,bounds,metadata,width,height,images);
 return renderAnalysis(a,{width,height,pixelWidth,pixelHeight,mode:state.mode,standalone:true,boundary:state.boundary,shapes:state.shapes,showTitle:false,showNorth:state.showNorth,showLegend:!!state.analysis&&state.showLegend,showSite:!!state.analysis||state.boundary.length>0,basemapAttribution:true,satelliteWater:state.basemapStyle.water,underlay:base,interactive});
}
