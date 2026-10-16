import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { HORSE_MODEL } from '../three/horseModel';
import { horse360Html } from '../three/horse360Html';
import { horseModelBase64 } from '../three/loadHorseModel';

// A bundled model goes to the page in pieces small enough for the WebView bridge.
const CHUNK = 256 * 1024;

/**
 * The 3D horse on the phone: the model-viewer page (three/horse360Html.js) in a WebView.
 * `onEvent` gets the page's messages (ready, progress, loaded, error, hotspot); the ref's
 * `send(message)` turns rotation on and off, resets the view or flies to an injury.
 */
const Horse360View = forwardRef(function Horse360View({ hotspots = [], interactive = false, onEvent, style }, ref) {
  const web = useRef(null);
  const key = JSON.stringify(hotspots);
  const html = useMemo(
    () => horse360Html({ hotspots, headDirection: HORSE_MODEL.headDirection, animation: HORSE_MODEL.animation, interactive }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, interactive]
  );

  const send = (message) => web.current?.postMessage(JSON.stringify(message));
  useImperativeHandle(ref, () => ({ send }), []);

  const loadModel = async () => {
    try {
      if (HORSE_MODEL.url) {
        send({ type: 'model-url', url: HORSE_MODEL.url });
        return;
      }
      const data = await horseModelBase64();
      const total = Math.ceil(data.length / CHUNK);
      for (let index = 0; index < total; index += 1) {
        send({ type: 'model-chunk', index, total, data: data.slice(index * CHUNK, (index + 1) * CHUNK) });
      }
    } catch (err) {
      onEvent?.({ type: 'error', message: err?.message || 'model' });
    }
  };

  const onMessage = (event) => {
    let message;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.type === 'ready') loadModel();
    onEvent?.(message);
  };

  return (
    <WebView
      ref={web}
      originWhitelist={['*']}
      source={{ html }}
      onMessage={onMessage}
      onError={() => onEvent?.({ type: 'error', message: 'webview' })}
      style={[styles.web, style]}
      containerStyle={styles.web}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      nestedScrollEnabled
      setSupportMultipleWindows={false}
      javaScriptEnabled
      domStorageEnabled
      androidLayerType="hardware"
    />
  );
});

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: '#01110c' },
});

export default Horse360View;
