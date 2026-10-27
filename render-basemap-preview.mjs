import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {renderBasemap} from './dist/basemap.js';
import {boundsProjection} from './dist/analysis-svg.js';
import {project} from './dist/core.js';
const sharp=createRequire(import.meta.url)(process.argv[2]||'sharp');
const base=JSON.parse(await fs.readFile('dist/hangzhou-basemap.json','utf8')),sw=project(base.bounds.sw),ne=project(base.bounds.ne),width=1000,height=1000*(sw[1]-ne[1])/(ne[0]-sw[0]);
for(const dark of [false,true])for(const layer of ['green','buildings','water','roads']){
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="6400" height="${Math.round(height*6.4)}" viewBox="0 0 ${width} ${height}"><g font-family="Microsoft YaHei, sans-serif">${renderBasemap(base,{bounds:base.bounds,projectPoint:boundsProjection(base.bounds,width,height),width,height,dark,style:Object.fromEntries(['water','roads','buildings','green'].map(k=>[k,k===layer]))})}</g></svg>`;
 await sharp(Buffer.from(svg)).png().toFile(`dist/basemap-${dark?'dark-':''}${layer}.png`);if(!dark)await sharp(`dist/basemap-${layer}.png`).grayscale().png().toFile(`dist/basemap-gray-${layer}.png`);console.log(layer+' preview ready');
}
const {layers,labels,...metadata}=base;await fs.writeFile('dist/basemap-meta.json',JSON.stringify(metadata));
