import {renderScene,validateProject,activeScene} from './renderer.js';
let project;const $=id=>document.getElementById(id);
function show(value){if(value.kind==='atlas-scene')value={schemaVersion:1,assets:value.assets,scenes:[value.scene],activeSceneId:value.scene.id};project=validateProject(value);const s=activeScene(project);renderScene($('sceneView'),s,project.assets);fit();$('status').textContent=s.name+' · '+s.layers.length+' 个独立图层';}
function fit(){if(!project)return;const s=activeScene(project),host=$('viewerHost');$('sceneView').style.transform=`scale(${Math.min(host.clientWidth/s.width,host.clientHeight/s.height)})`;}
$('load').onclick=()=>$('file').click();$('file').onchange=async e=>{try{show(JSON.parse(await e.target.files[0].text()));}catch(error){$('status').textContent=error.message;}e.target.value='';};window.addEventListener('resize',fit);show(await (await fetch('seed-project.json')).json());
