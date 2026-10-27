import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {initialState} from './dist/core.js';
import {cleanAnalysis} from './dist/analysis-data.js';
import {renderScene,baseLayers,layerUrl,fullUrl} from './dist/scene.js';
const sharp=createRequire(import.meta.url)(process.argv[2]||'sharp');
const state=initialState(),metadata=JSON.parse(await fs.readFile('dist/basemap-meta.json','utf8'));
state.analysis=cleanAnalysis(JSON.parse(await fs.readFile('dist/hangzhou-sample.json','utf8')));
state.name='杭州奥体中心';state.output=state.analysis.bounds;
for(const layer of baseLayers)await sharp('dist/basemap-'+layer+'.png').grayscale().png().toFile('dist/basemap-gray-'+layer+'.png');
for(const mode of ['moss','light','dark']){
 state.mode=mode;const images=Object.fromEntries(await Promise.all(baseLayers.map(async k=>[k,'data:image/png;base64,'+(await fs.readFile('dist'+layerUrl(k,mode))).toString('base64')])));
 images.full='data:image/png;base64,'+(await fs.readFile('dist'+fullUrl(mode))).toString('base64');
 const svg=renderScene(state,state.output,metadata,{images,pixelWidth:4800,pixelHeight:3600});
 const name=`samples/杭州奥体-工作台出图-${mode}`;
 await sharp(Buffer.from(svg),{unlimited:true}).png().toFile(name+'.png');
 await sharp(name+'.png').resize(1600,1200).png().toFile(name+'-预览.png');
 console.log(mode+' · 4800 × 3600 PNG verified');
}
