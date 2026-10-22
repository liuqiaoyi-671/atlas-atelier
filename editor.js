import {activeScene, renderScene, validateProject} from './renderer.js';
const $ = id => document.getElementById(id);
const uid = () => crypto.randomUUID();
const clone = value => structuredClone(value);
let project, db, seed, selectedId=null, scale=1, drag=null, undoStack=[], redoStack=[], saving=Promise.resolve(), revision=0, lastRevision=0, pendingRemote=false;
const channel = new BroadcastChannel('atlas-atelier-v1');
const clientId=uid();
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4000);}
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('atlas-atelier-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('projects');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function readDB(){return new Promise((resolve,reject)=>{const tx=db.transaction('projects','readonly');const r=tx.objectStore('projects').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function writeDB(value){return new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(value,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
function persist(){
 const snapshot=clone(project);const stamp=Math.max(Date.now(),revision+1);revision=stamp;
 $('saveStatus').textContent='正在保存…';
 saving=saving.catch(()=>{}).then(async()=>{
  await writeDB({project:snapshot,revision:stamp});lastRevision=stamp;
  channel.postMessage({clientId,revision:stamp});
  if(revision===stamp)$('saveStatus').textContent='已自动保存 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
 }).catch(error=>{$('saveStatus').textContent='保存失败，请导出项目备份';toast('本地保存失败：'+error.message);});
}
channel.onmessage=async e=>{
 if(e.data.clientId===clientId || e.data.revision<=lastRevision)return;
 if(drag){pendingRemote=true;return;}
 await saving;const stored=await readDB();
 if(stored && stored.revision>lastRevision){project=validateProject(stored.project);lastRevision=stored.revision;revision=lastRevision;selectedId=null;undoStack=[];redoStack=[];renderAll();toast('已同步另一窗口的最新布局。');}
};
function snapshot(){return {scenes:clone(project.scenes),activeSceneId:project.activeSceneId};}
function checkpoint(){undoStack.push(snapshot());if(undoStack.length>50)undoStack.shift();redoStack=[];}
function finish(){normalizeZ();renderAll();persist();}
function mutate(action){checkpoint();action();finish();}
function normalizeZ(){for(const s of project.scenes){s.layers.sort((a,b)=>a.z-b.z).forEach((l,i)=>l.z=i);}}
function scene(){return activeScene(project);}
function selected(){return scene().layers.find(l=>l.id===selectedId);}
function undo(){if(!undoStack.length)return;redoStack.push(snapshot());const s=undoStack.pop();project.scenes=s.scenes;project.activeSceneId=s.activeSceneId;selectedId=null;renderAll();persist();}
function redo(){if(!redoStack.length)return;undoStack.push(snapshot());const s=redoStack.pop();project.scenes=s.scenes;project.activeSceneId=s.activeSceneId;selectedId=null;renderAll();persist();}
function fit(){
 const view=$('viewport');const s=scene();scale=Math.min((view.clientWidth-80)/s.width,(view.clientHeight-80)/s.height,1);scale=Math.max(.1,scale);
 $('canvasHolder').style.width=s.width*scale+'px';$('canvasHolder').style.height=s.height*scale+'px';$('canvas').style.transform=`scale(${scale})`;
}
function drawCanvas(){renderScene($('canvas'),scene(),project.assets,{editable:true,selectedId,onPointer});$('emptyCanvas').hidden=scene().layers.length>0;}
function renderAll(){
 $('sceneTitle').textContent=scene().name;$('dimensions').textContent=`${scene().width} × ${scene().height}`;
 renderScenes();renderLibrary();renderLayers();drawCanvas();fit();updateSelection();
 $('undo').disabled=!undoStack.length;$('redo').disabled=!redoStack.length;
}
function updateSelection(){const l=selected();$('selectionStatus').textContent=l?`${l.name}${l.locked?' · 已锁定':''}${l.hidden?' · 已隐藏':''}`:'点击素材或图层开始编辑';for(const id of ['raise','lower','duplicate','delete'])$(id).disabled=!l || l.locked;}
function renderScenes(){
 $('scenes').replaceChildren();for(const s of project.scenes){const b=document.createElement('button');b.className='scene-tab'+(s.id===project.activeSceneId?' active':'');b.textContent=s.name;b.dataset.sceneId=s.id;b.addEventListener('click',()=>{project.activeSceneId=s.id;selectedId=null;renderAll();persist();});$('scenes').append(b);}
}
let showArchivedAssets=false;
function renderLibrary(){
 const recommended=seed?.recommendedAssetIds;
 const sourceIds=new Set(seed?.assets.map(a=>a.id)||[]);
 const visible=showArchivedAssets||!recommended?project.assets:project.assets.filter(a=>recommended.includes(a.id)||!sourceIds.has(a.id));
 $('library').replaceChildren();$('assetCount').textContent=`(${visible.length})`;
 for(const asset of visible){const b=document.createElement('button');b.className='asset-card';b.dataset.assetId=asset.id;b.title='点击添加到当前画布';
 const thumb=document.createElement('span');thumb.className='thumb';const im=document.createElement('img');im.src=asset.src;im.alt=asset.name;thumb.append(im);
 const label=document.createElement('span');label.className='asset-label';label.textContent=asset.name;b.append(thumb,label);b.addEventListener('click',()=>addAsset(asset));$('library').append(b);}
}
$('showArchived').onclick=()=>{showArchivedAssets=!showArchivedAssets;$('showArchived').textContent=showArchivedAssets?'收起旧版':'旧版与候选';renderLibrary();};
function addAsset(asset){
 mutate(()=>{const max=Math.min(scene().width*.4,420);const w=asset.defaultWidth||max;const h=w*(asset.height||1)/(asset.width||1);const layer={id:uid(),assetId:asset.id,name:asset.name,x:scene().width/2,y:scene().height/2,width:w,height:h,rotation:0,z:scene().layers.length,hidden:false,locked:false,opacity:1};scene().layers.push(layer);selectedId=layer.id;});
}
let draggedLayer=null;
function renderLayers(){
 $('layers').replaceChildren();
 for(const l of [...scene().layers].sort((a,b)=>b.z-a.z)){
  const row=document.createElement('div');row.className='layer-row'+(selectedId===l.id?' active':'')+(l.hidden?' hidden-layer':'');row.dataset.layerId=l.id;row.draggable=!l.locked;
  const grip=document.createElement('span');grip.className='grip';grip.textContent='⠿';
  const img=document.createElement('img');img.src=project.assets.find(a=>a.id===l.assetId).src;img.alt='';
  const label=document.createElement('span');label.className='layer-name';label.textContent=l.name;label.title=l.name;
  const eye=document.createElement('button');eye.textContent=l.hidden?'○':'◉';eye.setAttribute('aria-label',(l.hidden?'显示':'隐藏')+l.name);eye.addEventListener('click',e=>{e.stopPropagation();mutate(()=>l.hidden=!l.hidden);});
  const lock=document.createElement('button');lock.textContent=l.locked?'🔒':'◇';lock.setAttribute('aria-label',(l.locked?'解锁':'锁定')+l.name);lock.addEventListener('click',e=>{e.stopPropagation();mutate(()=>l.locked=!l.locked);});
  row.append(grip,img,label,eye,lock);row.addEventListener('click',()=>{selectedId=l.id;renderLayers();drawCanvas();updateSelection();});
  row.addEventListener('dragstart',e=>{if(l.locked){e.preventDefault();return;}draggedLayer=l.id;e.dataTransfer.setData('text/plain',l.id);e.dataTransfer.effectAllowed='move';});
  row.addEventListener('dragover',e=>{e.preventDefault();row.classList.add('drag-over');});row.addEventListener('dragleave',()=>row.classList.remove('drag-over'));
  row.addEventListener('drop',e=>{e.preventDefault();row.classList.remove('drag-over');const id=draggedLayer;if(!id||id===l.id)return;mutate(()=>{const display=[...scene().layers].sort((a,b)=>b.z-a.z);const from=display.findIndex(x=>x.id===id),to=display.findIndex(x=>x.id===l.id);const [item]=display.splice(from,1);display.splice(to,0,item);scene().layers=display.reverse();scene().layers.forEach((x,i)=>x.z=i);});draggedLayer=null;});
  $('layers').append(row);
 }
}
function pointerPosition(e){const box=$('canvas').getBoundingClientRect();return {x:(e.clientX-box.left)/scale,y:(e.clientY-box.top)/scale};}
function onPointer(e,layer,type){
 if(e.button!==0 || drag)return;e.preventDefault();e.stopPropagation();selectedId=layer.id;
 if(layer.locked){renderLayers();drawCanvas();updateSelection();toast('此图层已锁定，请先在图层面板解锁。');return;}
 const p=pointerPosition(e);checkpoint();drag={id:layer.id,type,start:p,original:clone(layer),initialAngle:Math.atan2(p.y-layer.y,p.x-layer.x),initialDistance:Math.hypot(p.x-layer.x,p.y-layer.y),moved:false};
 renderLayers();drawCanvas();updateSelection();
}
window.addEventListener('pointermove',e=>{
 if(!drag)return;const l=scene().layers.find(x=>x.id===drag.id);const p=pointerPosition(e),o=drag.original;
 if(drag.type==='move'){l.x=o.x+p.x-drag.start.x;l.y=o.y+p.y-drag.start.y;}
 if(drag.type==='resize'){const ratio=Math.max(.04,Math.hypot(p.x-o.x,p.y-o.y)/Math.max(1,drag.initialDistance));l.width=Math.min(32000,Math.max(12,o.width*ratio));l.height=Math.min(32000,Math.max(12,o.height*ratio));}
 if(drag.type==='rotate'){let angle=(Math.atan2(p.y-o.y,p.x-o.x)-drag.initialAngle)*180/Math.PI+o.rotation;l.rotation=e.shiftKey?Math.round(angle/15)*15:angle;}
 drag.moved=true;drawCanvas();
});
function endPointer(cancel=false){
 if(!drag)return;if(cancel){const l=scene().layers.find(x=>x.id===drag.id);Object.assign(l,drag.original);undoStack.pop();}else if(!drag.moved)undoStack.pop();drag=null;finish();
 if(pendingRemote){pendingRemote=false;toast('另一窗口也有修改；当前操作已保存为最新版本。');}
}
window.addEventListener('pointerup',()=>endPointer());window.addEventListener('pointercancel',()=>endPointer(true));window.addEventListener('blur',()=>endPointer());
$('canvas').addEventListener('pointerdown',e=>{if(e.target===$('canvas')){selectedId=null;renderLayers();drawCanvas();updateSelection();}});
function removeSelected(){const l=selected();if(!l||l.locked)return;mutate(()=>{scene().layers=scene().layers.filter(x=>x.id!==l.id);selectedId=null;});toast('已移出画布，原素材仍在素材库。');}
function changeOrder(delta){const l=selected();if(!l||l.locked)return;const items=[...scene().layers].sort((a,b)=>a.z-b.z);const index=items.indexOf(l),other=index+delta;if(other<0||other>=items.length)return;mutate(()=>{[items[index],items[other]]=[items[other],items[index]];items.forEach((x,i)=>x.z=i);});}
$('undo').onclick=undo;$('redo').onclick=redo;$('delete').onclick=removeSelected;$('raise').onclick=()=>changeOrder(1);$('lower').onclick=()=>changeOrder(-1);$('fit').onclick=fit;
$('duplicate').onclick=()=>{const l=selected();if(!l||l.locked)return;mutate(()=>{const n={...clone(l),id:uid(),x:l.x+32,y:l.y+32,z:scene().layers.length,name:l.name+' · 副本'};scene().layers.push(n);selectedId=n.id;});};
$('newScene').onclick=()=>{const name=prompt('给新场景起个名字','新场景');if(!name?.trim())return;mutate(()=>{const s={id:uid(),name:name.trim().slice(0,80),width:1600,height:1000,background:'#fff9ed',layers:[]};project.scenes.push(s);project.activeSceneId=s.id;selectedId=null;});};
$('renameScene').onclick=()=>{const name=prompt('场景名称',scene().name);if(name?.trim())mutate(()=>scene().name=name.trim().slice(0,80));};
window.addEventListener('keydown',e=>{
 if(['INPUT','TEXTAREA'].includes(e.target.tagName) || $('stylesDialog').open || $('previewDialog').open)return;
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
 if(e.key==='Escape'){if(drag)endPointer(true);selectedId=null;renderLayers();drawCanvas();updateSelection();return;}
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected();return;}
 const l=selected();if(!l||l.locked)return;
 const vectors={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(vectors[e.key]){e.preventDefault();const [x,y]=vectors[e.key],step=e.shiftKey?10:1;mutate(()=>{l.x+=x*step;l.y+=y*step;});}
});
$('uploadBtn').onclick=()=>$('upload').click();
function fileData(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
function imageSize(src){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve({width:i.naturalWidth,height:i.naturalHeight});i.onerror=()=>reject(new Error('图片无法解码'));i.src=src;});}
$('upload').onchange=async e=>{
 try{const added=[];for(const f of e.target.files){if(!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(f.type)||f.size>20*1024*1024)throw new Error('请使用20MB以内的PNG/JPEG/WebP/SVG图片。');const src=await fileData(f);const size=await imageSize(src);added.push({id:uid(),name:f.name.replace(/\.[^.]+$/,''),src,...size});}
 project.assets.push(...added);renderLibrary();persist();toast(`已加入 ${added.length} 件素材，点击即可放入画布。`);
 }catch(error){toast(error.message);}e.target.value='';
};
function download(value,filename){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function portableAssets(){return Promise.all(project.assets.map(async a=>{if(a.src.startsWith('data:'))return clone(a);const res=await fetch(a.src);if(!res.ok)throw new Error('素材读取失败：'+a.name);const blob=await res.blob();return {...a,src:await fileData(blob)};}));}
$('exportBtn').onclick=async()=>{try{await saving;const value={...clone(project),assets:await portableAssets(),exportedAt:new Date().toISOString()};download(value,'atlas-atelier-project.json');toast('已导出完整项目，包含全部素材和可编辑布局。');}catch(e){toast(e.message);}};
$('exportScene').onclick=async()=>{try{const s=clone(scene());const all=await portableAssets();const used=new Set(s.layers.map(l=>l.assetId));download({schemaVersion:1,kind:'atlas-scene',scene:s,assets:all.filter(a=>used.has(a.id))},'haitong-scene.json');toast('已导出网站场景，独立viewer可直接读取。');}catch(e){toast(e.message);}};
$('importBtn').onclick=()=>$('import').click();
$('import').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>200*1024*1024)throw new Error('项目文件超过200MB。');const candidate=validateProject(JSON.parse(await f.text()));await Promise.all(candidate.assets.map(a=>imageSize(a.src)));if(!confirm('导入会替换当前项目。是否先确认你已导出当前项目？'))return;
 project=clone(candidate);selectedId=null;undoStack=[];redoStack=[];renderAll();persist();toast('完整项目已恢复，图层可继续编辑。');
 }catch(error){toast('未导入：'+error.message);}finally{e.target.value='';}};
$('seedBtn').onclick=async()=>{
 try{const res=await fetch('seed-project.json',{cache:'no-store'});seed=validateProject(await res.json());if(!seed.assets.length){toast('正式独立素材等待画风确认，暂不以几何占位代替。');return;}
 if(scene().layers.length&&!confirm('这将替换当前场景布局，其他场景和素材库保留。'))return;
 for(const a of seed.assets){if(!project.assets.some(x=>x.id===a.id))project.assets.push(clone(a));}
 mutate(()=>{const currentId=scene().id;Object.assign(scene(),clone(seed.scenes[0]),{id:currentId});scene().layers.forEach(l=>l.id=uid());selectedId=null;});toast('已载入示例场景的背景、树木与独立地标。');
 }catch(error){toast(error.message);}
};
function showPreview(){renderScene($('previewCanvas'),scene(),project.assets);$('previewDialog').showModal();const host=$('previewViewport');const s=scene();const ratio=Math.min((host.clientWidth-48)/s.width,(host.clientHeight-48)/s.height);$('previewCanvas').style.transform=`scale(${ratio})`;}
$('previewBtn').onclick=showPreview;$('closePreview').onclick=()=>$('previewDialog').close();$('styles').onclick=()=>$('stylesDialog').showModal();$('closeStyles').onclick=()=>$('stylesDialog').close();
window.addEventListener('resize',()=>{fit();if($('previewDialog').open){const host=$('previewViewport');$('previewCanvas').style.transform=`scale(${Math.min((host.clientWidth-48)/scene().width,(host.clientHeight-48)/scene().height)})`;}});
function mergeSeedLibrary(source){
 let added=0,scenesAdded=0;
 for(const asset of source.assets){if(!project.assets.some(a=>a.id===asset.id)){project.assets.push(clone(asset));added++;}}
 // Add a separately named composition draft; never replace an existing layout.
 for(const draft of source.scenes.slice(1)){if(!project.scenes.some(s=>s.id===draft.id)){
   const copy=clone(draft);copy.layers.forEach(l=>l.id=uid());project.scenes.push(copy);scenesAdded++;
 }}
 return {added,scenesAdded};
}
$('syncAssets').onclick=async()=>{try{
 const fresh=validateProject(await(await fetch('seed-project.json',{cache:'no-store'})).json());seed=fresh;
 const result=mergeSeedLibrary(fresh);renderAll();persist();
 toast(result.added||result.scenesAdded?`已加入 ${result.added} 件新素材${result.scenesAdded?'及新地图场景':''}，当前布局保持不变。`:'素材库已是最新，当前布局保持不变。');
 }catch(e){toast('素材同步失败：'+e.message);}};
async function boot(){try{db=await openDB();const stored=await readDB();seed=validateProject(await (await fetch('seed-project.json',{cache:'no-store'})).json());const untouchedBlank=stored && stored.project.assets.length===0 && stored.project.scenes.length===1 && stored.project.scenes[0].layers.length===0;project=stored&&!untouchedBlank?validateProject(stored.project):clone(seed);lastRevision=stored?.revision||0;revision=lastRevision;const update=mergeSeedLibrary(seed);renderAll();if(!stored||untouchedBlank||update.added||update.scenesAdded)persist();else $('saveStatus').textContent='已恢复上次布局 · 自动保存开启';if(stored&&(update.added||update.scenesAdded))toast('新素材已加入素材库，原布局保持不变。');}catch(error){$('saveStatus').textContent='无法打开项目';toast(error.message);}}
await boot();
