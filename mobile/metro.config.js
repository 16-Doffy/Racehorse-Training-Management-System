// Expo's default Metro config, plus .glb so the 3D horse model can be bundled as an asset
// (src/three/horseModel.js).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('glb');

module.exports = config;
