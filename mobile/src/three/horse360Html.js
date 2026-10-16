/**
 * The page the 3D horse runs in: Google's <model-viewer> (Apache-2.0) in a WebView on the phone
 * and an iframe on the web. It turns a glTF model 360° by touch, zooms, turns by itself, and
 * lights it like a studio. The app talks to it with messages:
 *
 *   app → page   { type: 'model-url', url } · { type: 'model-chunk', index, total, data } (base64)
 *                { type: 'auto-rotate', value } · { type: 'reset' } · { type: 'focus', index }
 *                { type: 'coat', coat }
 *   page → app   { type: 'ready' } · { type: 'progress', value } · { type: 'loaded' }
 *                { type: 'error', message } · { type: 'hotspot', index }
 *
 * Injury marks arrive already placed along the body (three/injuryHotspots.js); the page turns them
 * into points on the model once it knows the model's size. The model's textures are neutral grey:
 * the page paints the horse's coat on them (three/horseBreeds.js).
 */
export const MODEL_VIEWER_VERSION = '4.3.1';
const MODEL_VIEWER_URL = `https://cdn.jsdelivr.net/npm/@google/model-viewer@${MODEL_VIEWER_VERSION}/dist/model-viewer.min.js`;
// The bundled horse is meshopt-compressed (assets/models/README.md); the viewer fetches the decoder.
const MESHOPT_DECODER_URL = 'https://cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_decoder.js';

// The camera angle (model-viewer's theta, from +z towards +x) that looks at the horse from the
// head end, for each way a model's head can point.
const HEAD_THETA = { '+z': 0, '+x': 90, '-z': 180, '-x': -90 };

/**
 * Three-quarter view from the front, slightly above, head to the right: how a horse is shown in a
 * sale catalogue: 60° round from the head end, on the side that puts the head on the right (clear
 * of the name and badges over the top left of the stage).
 */
export function initialOrbit(headDirection = '-x') {
  return `${(HEAD_THETA[headDirection] ?? -90) - 60}deg 76deg 115%`;
}

const escapeHtml = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * `hotspots`: [{ along, height, label, sub, color }]. `interactive`: full touch control (the
 * full-screen view); otherwise vertical swipes go to the page so the screen still scrolls.
 * `coat`: { body, hair, roughness } (horseBreeds.coatFor), painted on the materials `coatMaterials`
 * names ({ body, hair }).
 */
export function horse360Html({
  hotspots = [],
  headDirection = '-x',
  autoRotate = true,
  interactive = false,
  animation = null,
  coat = null,
  coatMaterials = null,
} = {}) {
  const points = hotspots
    .map(
      (h, i) => `
    <button class="hotspot" slot="hotspot-${i}" data-index="${i}" data-position="0m 0m 0m" style="--c:${escapeHtml(h.color)}">
      <span class="ring"></span><span class="dot"></span>
      <span class="label"><b>${escapeHtml(h.label)}</b>${h.sub ? `<i>${escapeHtml(h.sub)}</i>` : ''}</span>
    </button>`
    )
    .join('');

  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<script>self.ModelViewerElement = self.ModelViewerElement || {}; self.ModelViewerElement.meshoptDecoderLocation = '${MESHOPT_DECODER_URL}';</script>
<script type="module" src="${MODEL_VIEWER_URL}"></script>
<style>
  html,body{margin:0;height:100%;overflow:hidden;background:#01110c;-webkit-tap-highlight-color:transparent;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-user-select:none;user-select:none}
  .stage{position:absolute;inset:0;background:
    radial-gradient(90% 70% at 50% 28%,rgba(16,120,86,.55) 0%,rgba(2,44,34,0) 60%),
    radial-gradient(120% 90% at 50% 100%,#03251c 0%,#01110c 70%)}
  .floor{position:absolute;left:8%;right:8%;bottom:9%;height:22%;border-radius:50%;
    background:radial-gradient(50% 50% at 50% 50%,rgba(234,179,8,.22) 0%,rgba(234,179,8,.06) 45%,transparent 72%)}
  .floor:before{content:"";position:absolute;inset:18% 14%;border-radius:50%;border:1px solid rgba(234,179,8,.25);
    animation:pulse 3.6s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:.35;transform:scale(.96)}50%{opacity:.8;transform:scale(1.02)}}
  model-viewer{position:absolute;inset:0;width:100%;height:100%;background:transparent;--poster-color:transparent;outline:none}
  .progress{position:absolute;left:50%;bottom:16px;width:42%;height:3px;margin-left:-21%;border-radius:3px;
    background:rgba(255,255,255,.12);overflow:hidden;transition:opacity .4s}
  .progress .bar{height:100%;width:0;background:linear-gradient(90deg,#eab308,#fde68a);transition:width .2s}
  .progress.done{opacity:0}
  .hotspot{position:relative;width:26px;height:26px;padding:0;border:0;background:transparent;cursor:pointer;
    display:flex;align-items:center;justify-content:center}
  .hotspot .dot{width:12px;height:12px;border-radius:50%;background:var(--c);box-shadow:0 0 0 2px #fff,0 0 14px var(--c)}
  .hotspot .ring{position:absolute;inset:0;border-radius:50%;border:2px solid var(--c);animation:ping 1.8s ease-out infinite}
  @keyframes ping{0%{transform:scale(.5);opacity:.9}100%{transform:scale(1.8);opacity:0}}
  .hotspot .label{position:absolute;left:24px;top:50%;transform:translateY(-50%);white-space:nowrap;
    padding:4px 8px;border-radius:8px;background:rgba(1,17,12,.82);border:1px solid var(--c);color:#fff;
    font-size:11px;line-height:1.3;text-align:left;pointer-events:none;opacity:0;transition:opacity .2s}
  .hotspot .label b{display:block;font-weight:700}
  .hotspot .label i{display:block;font-style:normal;color:rgba(255,255,255,.75)}
  .hotspot.open .label,.hotspot:focus .label{opacity:1}
  .hotspot[data-visible="false"]{opacity:.55}
</style>
</head>
<body>
  <div class="stage"></div>
  ${/* The glow ring sits under the hooves of the framed card; full screen frames the horse differently, its shadow is enough. */ interactive ? '' : '<div class="floor"></div>'}
  <model-viewer id="mv"
    camera-controls ${autoRotate ? 'auto-rotate' : ''} auto-rotate-delay="3000" rotation-per-second="16deg"
    ${animation ? `autoplay animation-name="${escapeHtml(animation)}"` : ''}
    touch-action="${interactive ? 'none' : 'pan-y'}" disable-pan interaction-prompt="none"
    camera-orbit="${initialOrbit(headDirection)}" min-camera-orbit="auto 40deg 60%" max-camera-orbit="auto 98deg 220%"
    field-of-view="28deg" shadow-intensity="1.1" shadow-softness="0.85"
    environment-image="neutral" exposure="1.05" tone-mapping="neutral">
    ${points}
    <div slot="progress-bar" class="progress" id="progress"><div class="bar" id="bar"></div></div>
  </model-viewer>
<script>
(function () {
  var HOTSPOTS = ${JSON.stringify(hotspots.map(({ along, height }) => ({ along, height })))};
  var HEAD = ${JSON.stringify(headDirection)};
  var INITIAL = ${JSON.stringify(initialOrbit(headDirection))};
  var COAT = ${JSON.stringify(coat ? { body: coat.body, hair: coat.hair, roughness: coat.roughness } : null)};
  var COAT_MATERIALS = ${JSON.stringify(coatMaterials)};
  var mv = document.getElementById('mv');
  var chunks = [];
  var positions = [];

  function post(msg) {
    var text = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
    else if (window.parent && window.parent !== window) window.parent.postMessage({ horse360: msg }, '*');
  }

  // Along the body from the nose (0) to the tail (1), and from the ground (0) to the top (1).
  function place() {
    var size = mv.getDimensions();
    var center = mv.getBoundingBoxCenter();
    var axis = HEAD.charAt(1);
    var sign = HEAD.charAt(0) === '-' ? -1 : 1;
    var length = axis === 'x' ? size.x : size.z;
    HOTSPOTS.forEach(function (h, i) {
      var p = { x: center.x, y: center.y - size.y / 2 + h.height * size.y, z: center.z };
      p[axis] = center[axis] + sign * (0.5 - h.along) * length;
      positions[i] = p.x + 'm ' + p.y + 'm ' + p.z + 'm';
      mv.updateHotspot({ name: 'hotspot-' + i, position: positions[i] });
    });
  }

  function paint() {
    if (!COAT || !COAT_MATERIALS || !mv.model) return;
    mv.model.materials.forEach(function (m) {
      var part = m.name === COAT_MATERIALS.body ? 'body' : m.name === COAT_MATERIALS.hair ? 'hair' : null;
      if (!part || !COAT[part]) return;
      m.pbrMetallicRoughness.setBaseColorFactor([COAT[part][0], COAT[part][1], COAT[part][2], 1]);
      if (part === 'body' && COAT.roughness) m.pbrMetallicRoughness.setRoughnessFactor(COAT.roughness);
    });
  }

  function focus(i) {
    var el = document.querySelector('[slot="hotspot-' + i + '"]');
    if (!el) return;
    document.querySelectorAll('.hotspot.open').forEach(function (o) { o.classList.remove('open'); });
    el.classList.add('open');
    mv.autoRotate = false;
    if (positions[i]) mv.cameraTarget = positions[i];
    mv.cameraOrbit = 'auto auto 70%';
  }

  function receive(raw) {
    var msg = raw;
    try { if (typeof raw === 'string') msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || !msg.type) return;
    if (msg.type === 'model-url') mv.src = msg.url;
    if (msg.type === 'model-chunk') {
      chunks[msg.index] = msg.data;
      var got = 0;
      for (var k = 0; k < msg.total; k++) if (chunks[k]) got++;
      if (got === msg.total) {
        var bin = atob(chunks.join(''));
        var bytes = new Uint8Array(bin.length);
        for (var j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
        chunks = [];
        mv.src = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
      }
    }
    if (msg.type === 'auto-rotate') mv.autoRotate = !!msg.value;
    if (msg.type === 'reset') {
      document.querySelectorAll('.hotspot.open').forEach(function (o) { o.classList.remove('open'); });
      // Turning by itself turns the horse (a turntable), not the camera: put it back as well.
      if (mv.resetTurntableRotation) mv.resetTurntableRotation(0);
      mv.cameraTarget = 'auto auto auto';
      mv.cameraOrbit = INITIAL;
      mv.fieldOfView = '28deg';
    }
    if (msg.type === 'focus') focus(msg.index);
    if (msg.type === 'coat') { COAT = msg.coat; paint(); }
  }

  // Android's WebView delivers on document, iOS and the web on window.
  document.addEventListener('message', function (e) { receive(e.data); });
  window.addEventListener('message', function (e) {
    if (e.data && e.data.horse360cmd) receive(e.data.horse360cmd);
    else if (typeof e.data === 'string') receive(e.data);
  });

  document.querySelectorAll('.hotspot').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = el.classList.contains('open');
      document.querySelectorAll('.hotspot.open').forEach(function (o) { o.classList.remove('open'); });
      if (!open) el.classList.add('open');
      post({ type: 'hotspot', index: Number(el.dataset.index) });
    });
  });

  customElements.whenDefined('model-viewer').then(function () {
    mv.addEventListener('progress', function (e) {
      var v = e.detail.totalProgress || 0;
      document.getElementById('bar').style.width = Math.round(v * 100) + '%';
      document.getElementById('progress').classList.toggle('done', v >= 1);
      post({ type: 'progress', value: v });
    });
    mv.addEventListener('load', function () { paint(); place(); post({ type: 'loaded' }); });
    mv.addEventListener('error', function (e) {
      post({ type: 'error', message: (e.detail && e.detail.type) || 'load failed' });
    });
    post({ type: 'ready' });
  }, function () { post({ type: 'error', message: 'viewer unavailable' }); });

  // The viewer script comes from a CDN: without a connection it never defines itself.
  setTimeout(function () { if (!customElements.get('model-viewer')) post({ type: 'error', message: 'offline' }); }, 15000);
})();
</script>
</body></html>`;
}
