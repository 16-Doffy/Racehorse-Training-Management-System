import { Asset } from 'expo-asset';
import { HORSE_MODEL } from './horseModel';

// On the web the bundled model is a file the browser fetches by URL.
export async function horseModelUrl() {
  return Asset.fromModule(HORSE_MODEL.source).uri;
}

export async function horseModelBase64() {
  throw new Error('Not used on the web: the viewer loads the model by URL.');
}
