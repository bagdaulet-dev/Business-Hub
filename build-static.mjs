// Deliberately copy only browser assets. Server code and local files are never static output.
import {copyFile, lstat, mkdir, readdir, realpath, rm} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=await realpath(fileURLToPath(new URL('./',import.meta.url)));
const output=join(root,'public');
const assets=[
  'index.html','app.mjs','style.css','assets/collectwatch-products.webp',
  'src/engine/demo-watch.mjs','data/demo/watch-scenarios.json','watch-ui.mjs','recommendation-ui.mjs',
];

// Validate sources before replacing any generated output; disallow symlinked input paths.
for(const relative of assets){
  const source=join(root,relative);
  if(!(await lstat(source)).isFile()||await realpath(source)!==source)throw new Error('INVALID_STATIC_ASSET');
}
try{
  const current=await lstat(output);
  if(!current.isDirectory()||current.isSymbolicLink())throw new Error('INVALID_OUTPUT_DIRECTORY');
}catch(error){if(error.code!=='ENOENT')throw error;}
await rm(output,{recursive:true,force:true});
for(const relative of assets){
  const target=join(output,relative);
  await mkdir(dirname(target),{recursive:true});
  await copyFile(join(root,relative),target);
}

async function inventory(directory,prefix=''){
  const files=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const relative=prefix+entry.name;
    if(entry.isDirectory())files.push(...await inventory(join(directory,entry.name),relative+'/'));
    else if(entry.isFile())files.push(relative);
    else throw new Error('INVALID_STATIC_OUTPUT');
  }
  return files.sort();
}
if(JSON.stringify(await inventory(output))!==JSON.stringify([...assets].sort()))throw new Error('STATIC_ALLOWLIST_MISMATCH');
console.log(`Built and verified ${assets.length} allowlisted static assets in public/.`);
