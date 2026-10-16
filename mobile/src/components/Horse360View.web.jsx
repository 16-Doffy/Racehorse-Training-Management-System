import { createElement, forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { HORSE_MODEL } from '../three/horseModel';
import { horse360Html } from '../three/horse360Html';
import { horseModelUrl } from '../three/loadHorseModel';

/**
 * The 3D horse in the web build: the same model-viewer page as on the phone, in an iframe. Same
 * props and ref as components/Horse360View.jsx.
 */
const Horse360View = forwardRef(function Horse360View({ hotspots = [], interactive = false, onEvent, style }, ref) {
  const frame = useRef(null);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const key = JSON.stringify(hotspots);
  const html = useMemo(
    () => horse360Html({ hotspots, headDirection: HORSE_MODEL.headDirection, animation: HORSE_MODEL.animation, interactive }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, interactive]
  );

  const send = (message) => frame.current?.contentWindow?.postMessage({ horse360cmd: message }, '*');
  useImperativeHandle(ref, () => ({ send }), []);

  useEffect(() => {
    const onMessage = async (event) => {
      if (event.source !== frame.current?.contentWindow || !event.data?.horse360) return;
      const message = event.data.horse360;
      if (message.type === 'ready') {
        try {
          const url = HORSE_MODEL.url || (HORSE_MODEL.source ? await horseModelUrl() : null);
          if (url) send({ type: 'model-url', url: new URL(url, window.location.href).href });
        } catch (err) {
          handler.current?.({ type: 'error', message: err?.message || 'model' });
        }
      }
      handler.current?.(message);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: '#01110c' }, style]}>
      {createElement('iframe', {
        ref: frame,
        srcDoc: html,
        title: 'Ngựa 3D',
        allow: 'fullscreen',
        style: { border: 0, width: '100%', height: '100%', display: 'block', background: '#01110c' },
      })}
    </View>
  );
});

export default Horse360View;
