/**
 * Makes the vet's tack-free horse: client/public/models/horse.glb without its saddle and bridle (the
 * materials M_Saddle1 and M_Saddle2), with the same rig, animation, units and compression. The vet's
 * 3D injury map (client/src/components/veterinarian/HorseInjuryViewer.jsx) shows it.
 *
 *   cd tools/horse-model
 *   npm install
 *   node strip-tack.mjs ../../client/public/models/horse.glb ../../client/public/models/horse-bare.glb
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node strip-tack.mjs <horse.glb> <horse-bare.glb>');
  process.exit(1);
}
const TACK = new Set(['M_Saddle1', 'M_Saddle2']);

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);

for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh || !mesh.listPrimitives().every((p) => TACK.has(p.getMaterial()?.getName()))) continue;
  console.log('removing', node.getName(), mesh.getName());
  node.setMesh(null);
  mesh.dispose();
  node.dispose();
}
await doc.transform(prune());
await io.write(output, doc);
console.log('materials left:', doc.getRoot().listMaterials().map((m) => m.getName()).join(', '));
