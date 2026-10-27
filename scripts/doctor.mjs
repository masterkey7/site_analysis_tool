import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--app'){console.error('Usage: node doctor.mjs --app <project>');process.exit(2);}
const app=path.resolve(args[1]),major=Number(process.versions.node.split('.')[0]);
if(![22,24].includes(major))throw Error('Use Node.js 22 or 24 for this package.');
for(const name of ['serve.mjs','package-lock.json','dist/index.html','dist/workbench.css','data/openfreemap-tiles.json'])await fs.access(path.join(app,name));
const require=createRequire(path.join(app,'package.json'));
for(const name of ['@mapbox/vector-tile','pbf','@mapbox/point-geometry','sharp']){
 const entry=require.resolve(name),relative=path.relative(path.join(app,'node_modules'),entry);
 if(relative.startsWith('..')||path.isAbsolute(relative))throw Error(name+' resolved outside this project. Run npm ci.');
 console.log('Dependency OK: '+name);
}
const sharp=require('sharp');const png=await sharp({create:{width:8,height:8,channels:4,background:'#334d40'}}).png().toBuffer();
if(png.readUInt32BE(16)!==8)throw Error('Sharp raster check failed.');
const probe=path.join(app,'.doctor-'+process.pid);await fs.writeFile(probe,'write check',{flag:'wx'});await fs.unlink(probe);
let configured=false;try{await fs.access(path.join(app,'.local','amap.json'));configured=true;}catch{}
console.log('Node '+process.version+'; local image renderer and writable directory OK.');
console.log('Credential file '+(configured?'exists (contents not read; validity not tested).':'absent; configure through /settings.html.'));

