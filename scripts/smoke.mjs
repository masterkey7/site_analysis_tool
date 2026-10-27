import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--app'){console.error('Usage: node smoke.mjs --app <project>');process.exit(2);}
const appDir=path.resolve(args[1]),configDir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-skill-smoke-'));
const {createApp}=await import(pathToFileURL(path.join(appDir,'serve.mjs')).href);
const app=createApp({configDir,fetcher:async()=>{throw Error('External requests are disabled in this smoke test.');}});
try{
 await new Promise((resolve,reject)=>{app.once('error',reject);app.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+app.address().port;
 const get=async p=>{const r=await fetch(origin+p);assert.equal(r.status,200,p);return r;};
 assert.match(await(await get('/')).text(),/sitePanel/);
 const boot=await(await get('/api/bootstrap')).json();assert.equal(boot.configured,false);assert.equal(boot.key,'');assert.ok(boot.csrf);
 for(const p of ['/settings.html','/workbench.css','/app.js','/html2canvas.min.js','/basemap-meta.json','/basemap-full-light.png'])await get(p);
 for(const p of ['/.local/amap.json','/serve.mjs'])assert.equal((await fetch(origin+p)).status,404);
 assert.equal((await fetch(origin+'/api/location-analysis',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Atlas-Token':boot.csrf},body:'{}'})).status,400);
 console.log('PASS: real local HTTP server, assets, unconfigured startup, boundary gate and private-file isolation.');
 console.log('No map credentials, external API calls, or real browser rendering were tested.');
}finally{
 app.closeAllConnections();if(app.listening)await new Promise(resolve=>app.close(resolve));
 if(path.dirname(configDir)!==path.resolve(os.tmpdir())||!path.basename(configDir).startsWith('atlas-skill-smoke-'))throw Error('Unexpected temporary directory.');
 await fs.rm(configDir,{recursive:true,force:true});
}

