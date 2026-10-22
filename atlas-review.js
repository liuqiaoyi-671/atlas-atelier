import {renderScene,validateProject} from './renderer.js';
const project=validateProject(await (await fetch('seed-project.json',{cache:'no-store'})).json());
const requestedScene=new URLSearchParams(location.search).get('scene');
const scene=project.scenes.find(s=>s.id===(requestedScene||project.reviewSceneId||'atlas-full-four-regions'))||project.scenes.find(s=>s.id===project.activeSceneId);
const host=document.getElementById('host'),root=document.getElementById('scene'),nav=document.getElementById('regions');
let region=null;
renderScene(root,scene,project.assets);
function fit(){
 const f=region?.focus||{x:scene.width/2,y:scene.height/2,width:scene.width,height:scene.height};
 const scale=Math.min(host.clientWidth/f.width,host.clientHeight/f.height);
 const sw=scene.width*scale,sh=scene.height*scale;
 const x=sw<=host.clientWidth?(host.clientWidth-sw)/2:Math.min(0,Math.max(host.clientWidth-sw,host.clientWidth/2-f.x*scale));
 const y=sh<=host.clientHeight?(host.clientHeight-sh)/2:Math.min(0,Math.max(host.clientHeight-sh,host.clientHeight/2-f.y*scale));
 root.style.transform=`translate(${x}px,${y}px) scale(${scale})`;
 document.getElementById('caption').textContent=region?`${region.name} · ${region.landform}。显示同一张地图的局部；素材位置由同一份场景数据读取。`:'海通蓝色海湾 → 中信建投冷灰岩脊 → 华夏暖赭河谷与水电 → 中金浅灰陶土城市台地。虚线路径留待你绘制。';
}
for(const r of [null,...scene.regions]){
 const button=document.createElement('button');button.type='button';button.dataset.region=r?.id||'all';
 if(r){const swatch=document.createElement('span');swatch.className='swatch';swatch.style.background=r.palette[0];button.append(swatch);}
 button.append(r?.name||'完整地图');button.setAttribute('aria-pressed',String(!r));
 button.onclick=()=>{region=r;for(const b of nav.children)b.setAttribute('aria-pressed',String(b===button));fit();};nav.append(button);
}
window.addEventListener('resize',fit);fit();
