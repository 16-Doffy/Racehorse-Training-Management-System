import { Asset } from 'expo-asset';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { HORSE_MODEL } from './horseModel';

// A WebView can't read a bundled file on every platform, so the phone reads the model once and
// hands it over as base64; kept for the next viewer (the full-screen one) instead of read again.
let cached = null;

export async function horseModelBase64() {
  if (cached) return cached;
  const asset = Asset.fromModule(HORSE_MODEL.source);
  await asset.downloadAsync();
  cached = await readAsStringAsync(asset.localUri || asset.uri, { encoding: 'base64' });
  return cached;
}

// The web build serves bundled assets by URL; never called on the phone.
export async function horseModelUrl() {
  return Asset.fromModule(HORSE_MODEL.source).uri;
}
