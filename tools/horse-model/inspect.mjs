/**
 * Prints each material's textures of a glTF/GLB (size, mean colour), to compare a model's coat
 * textures with the neutral grey the web paints coats on.
 *
 *   node inspect.mjs <model.glb>
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [input] = process.argv.slice(2);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(input);
for (const material of doc.getRoot().listMaterials()) {
  const slots = { base: material.getBaseColorTexture(), normal: material.getNormalTexture(), mr: material.getMetallicRoughnessTexture() };
  const parts = [];
  for (const [slot, texture] of Object.entries(slots)) {
    if (!texture) continue;
    const image = sharp(Buffer.from(texture.getImage()));
    const meta = await image.metadata();
    const stats = await image.stats();
    const mean = stats.channels.slice(0, 3).map((c) => Math.round(c.mean));
    parts.push(`${slot} ${meta.width}x${meta.height} ${texture.getMimeType()} mean rgb(${mean.join(',')})`);
  }
  console.log(material.getName(), '| factor', material.getBaseColorFactor().map((v) => v.toFixed(2)).join(','), '|', parts.join(' | ') || 'no textures');
}
