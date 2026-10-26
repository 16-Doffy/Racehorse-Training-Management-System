// How bright each horse model's coat and hair textures are (mean linear luminance, 0–1), so the
// screens can paint the same coat equally bright on both models (horseStage.js, stallScene.js).
// node coat-luma.mjs ../../client/public/models/horse-animated.glb ../../client/public/models/horse-bare.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file);
  const out = [];
  for (const material of doc.getRoot().listMaterials()) {
    const texture = material.getBaseColorTexture();
    const factor = material.getBaseColorFactor();
    let luma = null;
    if (texture) {
      const { data, info } = await sharp(Buffer.from(texture.getImage())).removeAlpha().resize(128, 128, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
      let sum = 0;
      for (let i = 0; i < data.length; i += info.channels) {
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]].map((v) => toLinear(v / 255));
        sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
      luma = sum / (data.length / info.channels);
    }
    out.push({ material: material.getName(), textured: Boolean(texture), luma: luma == null ? null : +luma.toFixed(3), factor: factor.map((v) => +v.toFixed(3)) });
  }
  console.log(file, JSON.stringify(out));
}
