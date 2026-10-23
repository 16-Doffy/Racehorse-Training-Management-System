/**
 * The 3D horse on the web: Google's <model-viewer> (Apache-2.0), loaded from a CDN the first time a
 * horse is shown, and the model it shows. The Groom's phone app shows the same model the same way
 * (mobile/src/three/horse360Html.js).
 */
const MODEL_VIEWER_URL = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.3.1/dist/model-viewer.min.js';
// The model is meshopt-compressed; the viewer fetches the decoder.
const MESHOPT_DECODER_URL = 'https://cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_decoder.js';

export const HORSE_MODEL = {
  // "HORSE – Realistic 3D Model (DEMO FREE)" by WildMesh 3D (Sketchfab), optimised as in
  // mobile/assets/models/README.md; served from client/public/models.
  src: `${import.meta.env.BASE_URL}models/horse.glb`,
  // Three-quarter view from the front, head to the right (the model's head points along +z).
  cameraOrbit: '-60deg 76deg 115%',
  animation: 'Horse|Horse_Idle',
  // The materials the coat is painted on: their textures are neutral grey.
  coatMaterials: { body: 'M_Body', hair: 'M_Hair' },
  // Shown under the viewer, as the model's licence (CC BY-NC 4.0) requires.
  credit: 'Mô hình 3D: “HORSE – Realistic 3D Model” · WildMesh 3D · CC BY-NC 4.0',
};

let loading = null;

/** Resolves once <model-viewer> is defined; rejects when the CDN can't be reached. */
export function loadModelViewer() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.customElements.get('model-viewer')) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      window.ModelViewerElement = { ...(window.ModelViewerElement || {}), meshoptDecoderLocation: MESHOPT_DECODER_URL };
      const script = document.createElement('script');
      script.type = 'module';
      script.src = MODEL_VIEWER_URL;
      script.onload = () => window.customElements.whenDefined('model-viewer').then(resolve);
      script.onerror = () => {
        loading = null;
        script.remove();
        reject(new Error('Không tải được trình xem 3D.'));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

/** Paints a loaded <model-viewer>'s horse in a coat (horseBreeds.coatFor); `materials` names that model's coat and mane. */
export function paintCoat(viewer, coat, materials = HORSE_MODEL.coatMaterials) {
  const { body, hair } = materials;
  viewer?.model?.materials.forEach((material) => {
    const part = material.name === body ? 'body' : material.name === hair ? 'hair' : null;
    if (!part || !coat?.[part]) return;
    material.pbrMetallicRoughness.setBaseColorFactor([...coat[part], 1]);
    if (part === 'body' && coat.roughness) material.pbrMetallicRoughness.setRoughnessFactor(coat.roughness);
  });
}
