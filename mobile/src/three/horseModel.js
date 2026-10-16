/**
 * The 3D horse shown on the horse screen (components/HorseStage.jsx).
 *
 * One model for every horse, painted in its coat (three/horseBreeds.js: the breed the Manager picked,
 * or the coat colour on its record), with the injuries the vet marked on it. To use a model:
 *   1. put the binary glTF at mobile/assets/models/horse.glb (keep it small: compress textures to
 *      1–2K, e.g. `npx @gltf-transform/cli optimize in.glb horse.glb --texture-compress webp`);
 *   2. set `source: require('../../assets/models/horse.glb')` below;
 *   3. set `headDirection` to the axis the head points along in the model, and `credit` to what its
 *      licence asks for.
 * Or serve it from a URL (EXPO_PUBLIC_HORSE_MODEL_URL) — it must allow cross-origin requests.
 *
 * With neither, the horse screen shows the stage without a model and says so.
 */
export const HORSE_MODEL = {
  // "HORSE – Realistic 3D Model (DEMO FREE)" by WildMesh 3D (Sketchfab), optimised for the phone
  // (see assets/models/README.md): metal/rough materials, its idle animation, WebP textures.
  source: require('../../assets/models/horse.glb'),
  // A URL, used instead of `source` when set.
  url: process.env.EXPO_PUBLIC_HORSE_MODEL_URL || null,
  // Which way the head points in the model's own coordinates: '+x', '-x', '+z' or '-z'.
  headDirection: process.env.EXPO_PUBLIC_HORSE_MODEL_HEAD || '+z',
  // The model's own animation to play (the horse breathing and shifting its weight), or null.
  animation: 'Horse|Horse_Idle',
  // The materials the coat is painted on: their textures are neutral grey.
  coatMaterials: { body: 'M_Body', hair: 'M_Hair' },
  // Shown under the viewer, as the model's licence (CC BY-NC 4.0) requires.
  credit: 'Mô hình 3D: “HORSE – Realistic 3D Model” · WildMesh 3D · CC BY-NC 4.0',
};

export const hasHorseModel = () => !!(HORSE_MODEL.url || HORSE_MODEL.source);
