// Shared by editor preview and the future website scene viewer.
export function activeScene(project) {
  return project.scenes.find(s => s.id === project.activeSceneId) || project.scenes[0];
}
export function renderScene(root, scene, assets, options = {}) {
  root.replaceChildren();
  root.style.width = `${scene.width}px`;
  root.style.height = `${scene.height}px`;
  root.style.background = scene.background || '#fff9ed';
  const library = new Map(assets.map(a => [a.id, a]));
  [...scene.layers].sort((a,b) => a.z-b.z).forEach(layer => {
    if (layer.hidden) return;
    const asset = library.get(layer.assetId);
    if (!asset) return;
    const el = document.createElement('div');
    el.className = 'scene-item';
    el.dataset.layerId = layer.id;
    el.style.cssText = `left:${layer.x}px;top:${layer.y}px;width:${layer.width}px;height:${layer.height}px;transform:translate(-50%,-50%) rotate(${layer.rotation}deg);z-index:${layer.z};opacity:${layer.opacity ?? 1};`;
    const img = document.createElement('img');
    img.src = asset.src; img.alt = layer.name || asset.name; img.draggable = false;
    el.append(img);
    if(options.editable) {
      el.classList.toggle('locked', !!layer.locked);
      el.classList.toggle('selected', layer.id === options.selectedId);
      el.addEventListener('pointerdown', e => options.onPointer?.(e, layer, 'move'));
      if(layer.id === options.selectedId && !layer.locked) {
        for (const type of ['resize','rotate']) {
          const handle = document.createElement('button');
          handle.className = `handle ${type}`;
          handle.type = 'button'; handle.dataset.handle = type;
          handle.setAttribute('aria-label', type === 'resize' ? '拖动缩放选中图层' : '拖动旋转选中图层');
          handle.addEventListener('pointerdown', e => {e.stopPropagation(); options.onPointer?.(e,layer,type);});
          el.append(handle);
        }
      }
    }
    root.append(el);
  });
}
export function validateProject(value) {
  if(!value || value.schemaVersion !== 1 || !Array.isArray(value.assets) || !Array.isArray(value.scenes) || !value.scenes.length) throw new Error('请选择本编辑器导出的完整项目 JSON（schemaVersion: 1）。');
  const assetIds = new Set(), sceneIds = new Set(), layerIds = new Set();
  for(const a of value.assets) {
    if(!a.id || assetIds.has(a.id) || typeof a.src !== 'string' || typeof a.name !== 'string') throw new Error('素材库格式或ID有误。');
    const validData = /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(a.src);
    const validLocal = /^(assets|art-direction)\/[a-zA-Z0-9_.\/-]+$/.test(a.src) && !a.src.includes('..');
    if(!validData && !validLocal) throw new Error('素材必须为内嵌图片或本项目目录中的素材引用。');
    assetIds.add(a.id);
  }
  for(const s of value.scenes) {
    if(!s.id || sceneIds.has(s.id) || typeof s.name !== 'string' || !Array.isArray(s.layers) || !Number.isFinite(s.width) || !Number.isFinite(s.height) || s.width<100 || s.height<100 || s.width>8000 || s.height>8000) throw new Error('场景尺寸或结构有误。');
    sceneIds.add(s.id);
    if(s.background && !/^#[0-9a-f]{6}$/i.test(s.background)) throw new Error('背景色格式有误。');
    for(const l of s.layers) {
      if(!l.id || layerIds.has(l.id) || !assetIds.has(l.assetId) || typeof l.name !== 'string') throw new Error('图层ID重复或引用的素材缺失。');
      if(!['x','y','width','height','rotation','z'].every(k => Number.isFinite(l[k])) || l.width<1 || l.height<1 || l.width>32000 || l.height>32000 || Math.abs(l.x)>32000 || Math.abs(l.y)>32000 || (l.opacity != null && (!Number.isFinite(l.opacity) || l.opacity<0 || l.opacity>1))) throw new Error('图层变换参数有误。');
      layerIds.add(l.id);
    }
  }
  if(!sceneIds.has(value.activeSceneId)) value.activeSceneId=value.scenes[0].id;
  return value;
}
