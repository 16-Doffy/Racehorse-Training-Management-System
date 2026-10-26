/**
 * Makes the web's moving horse, client/public/models/horse-animated.glb, from "Horse" by henrysteve973
 * (Sketchfab, CC BY 4.0: https://sketchfab.com/3d-models/horse-a6f860e43e364619bccb174a1ac7d0c9),
 * downloaded as GLB. Changes, as CC BY asks to say: only the animations the app plays are kept and
 * renamed; the coat and mane textures are turned neutral grey (the app paints each horse's own coat on
 * them, as on horse.glb); textures to WebP and meshes compressed with meshopt.
 *
 *   cd tools/horse-model
 *   npm install
 *   node prepare-animated.mjs <downloaded horse.glb> ../../client/public/models/horse-animated.glb
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node prepare-animated.mjs <horse.glb> <horse-animated.glb>');
  process.exit(1);
}

// The clips the web plays (client/src/features/horses/horse3d/horseMotion.js), by their new names.
const KEEP = {
  'Skeleton|1 Ilde': 'Idle',
  'Skeleton|2 Ilde': 'Idle_Look',
  'Skeleton|6 Eat': 'Eat',
  'Skeleton|Walk': 'Walk',
  'Skeleton|Gallop': 'Gallop',
  'Skeleton|Run_Stop': 'Run_Stop',
  'Skeleton|Sleep': 'Sleep',
};
// Grey like horse.glb's coat (mean ~155) and mane (~184), so the coat colours (horseBreeds.js) read the same.
// The coat's contrast stays near 1: more brings back what evenOut took away.
const GREY = { Horse: { mean: 155, contrast: 1.1 }, Hair: { mean: 184, contrast: 1.6 } };

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

for (const animation of root.listAnimations()) {
  const name = KEEP[animation.getName()];
  if (name) animation.setName(name);
  else animation.dispose();
}

/**
 * The source horse is a paint: brown patches on white. Each brown pixel's brightness is lifted to the
 * white's, keeping its own detail (hair, shading), so one coat colour covers the whole horse. The pink
 * of the muzzle (bluer than brown) and the dark hooves are left as they are. Returns a grey PNG.
 */
async function withoutPatches(image) {
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  const luma = new Float32Array(px);
  const brown = new Float32Array(px);
  let whiteSum = 0;
  let whiteN = 0;
  let brownSum = 0;
  let brownN = 0;
  for (let i = 0; i < px; i += 1) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    const max = Math.max(r, g, b);
    const saturation = max ? (max - Math.min(r, g, b)) / max : 0;
    luma[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Orange-brown hue (red over green over blue), weighted 0..1 by how saturated it is.
    const w = r >= g && g >= b * 0.85 && r > 30 ? Math.min(1, Math.max(0, (saturation - 0.18) / 0.17)) : 0;
    brown[i] = w;
    if (w > 0.9) {
      brownSum += luma[i];
      brownN += 1;
    } else if (w === 0 && luma[i] > 110) {
      whiteSum += luma[i];
      whiteN += 1;
    }
  }
  const lift = brownN && whiteN ? whiteSum / whiteN / (brownSum / brownN) : 1;
  const white = whiteN ? whiteSum / whiteN : 180;
  // Dark grey marks on the legs (not brown, so not lifted above): brought up to most of the white,
  // in proportion to how dark they are. Near-black (eyes, nostrils) stays.
  const out = Buffer.alloc(px);
  for (let i = 0; i < px; i += 1) {
    let l = luma[i] * (1 + brown[i] * (lift - 1));
    if (!brown[i] && l > 20 && l < 0.6 * white) {
      const dark = Math.min(1, (0.6 * white - l) / (0.3 * white));
      l += (0.8 * white - l) * dark * 0.8;
    }
    out[i] = Math.min(255, Math.round(l));
  }
  console.log(`  patches lifted x${lift.toFixed(2)} (${Math.round((brownN / px) * 100)}% of the texture was brown)`);
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
}

/**
 * What is left of the paint after withoutPatches (paler patches, greyer legs) and the baked shading:
 * each pixel set to the coat's mean times its ratio to the brightness around it, so the broad light
 * and dark areas go and the hair's detail stays — the same even coat as horse-bare.glb, whose horse
 * the stable shows. Near-black (eyes, nostrils, hooves) and the atlas's empty background stay.
 */
async function evenOut(png) {
  const { data, info } = await sharp(png).grayscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let n = 0;
  for (const v of data) if (v > 40) (sum += v), (n += 1);
  const mean = n ? sum / n : 160;
  // The empty atlas around the UV islands filled with the mean first, so the blur does not darken the islands' edges.
  const filled = Buffer.from(data.map((v) => (v < 20 ? mean : v)));
  const around = await sharp(filled, { raw: { width: info.width, height: info.height, channels: 1 } }).blur(Math.max(6, info.width / 96)).extractChannel(0).raw().toBuffer();
if (around.length !== data.length) throw new Error('evenOut: blurred texture has ' + around.length + ' values, expected ' + data.length);
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 1) {
    const v = data[i];
    if (v < 35) {
      out[i] = v;
      continue;
    }
    const ratio = Math.min(1.2, Math.max(0.8, v / Math.max(1, around[i])));
    out[i] = Math.min(255, Math.round(0.85 * mean * ratio + 0.15 * v));
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
}

for (const material of root.listMaterials()) {
  const target = GREY[material.getName()];
  const texture = material.getBaseColorTexture();
  if (!target || !texture) continue;
  const source = Buffer.from(texture.getImage());
  const grey = sharp(material.getName() === 'Horse' ? await evenOut(await withoutPatches(source)) : source).grayscale();
  const mean = (await grey.clone().stats()).channels[0].mean;
  // out = contrast * (in - mean) + target mean
  const png = await grey.linear(target.contrast, target.mean - target.contrast * mean).toColourspace('srgb').png().toBuffer();
  texture.setImage(new Uint8Array(png)).setMimeType('image/png');
  console.log(`${material.getName()}: coat texture to grey (mean ${Math.round(mean)} -> ${target.mean})`);
}

await doc.transform(
  dedup(),
  prune(),
  resample(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82 }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' })
);

const asset = root.getAsset();
asset.extras = {
  ...(asset.extras || {}),
  changes: 'WDP301: kept and renamed the clips the app plays; coat and mane textures made neutral grey; WebP textures; meshopt.',
};
await io.write(output, doc);
console.log('kept clips:', root.listAnimations().map((a) => a.getName()).join(', '));
