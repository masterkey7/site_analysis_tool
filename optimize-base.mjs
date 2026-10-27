import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {baseLayers,layerUrl,fullUrl} from './dist/scene.js';
const sharp=createRequire(import.meta.url)(process.argv[2]||'sharp');
for(const mode of ['light','moss','dark']){
 const meta=await sharp('dist'+layerUrl('green',mode)).metadata();
 await sharp({create:{width:meta.width,height:meta.height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(baseLayers.map(k=>({input:'dist'+layerUrl(k,mode)}))).png().toFile('dist'+fullUrl(mode));
 console.log(mode+' combined base ready');
}
