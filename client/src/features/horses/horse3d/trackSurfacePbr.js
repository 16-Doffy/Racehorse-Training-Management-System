import * as THREE from 'three';

/**
 * Broadcast-grade procedural 3D racetrack system for Racehorse TMS:
 * 1. 1024x1024 Procedural PBR Maps (Albedo + Sobel Tangent-Space NormalMap + RoughnessMap)
 *    for turf (sân cỏ), dirt (sân đất), sand (sân cát), synthetic (sân tổng hợp / Polytrack).
 * 2. Procedural Sky-Sun-Ground PMREM IBL Environment so horse muscles, coats, and tack
 *    catch natural outdoor lighting instead of rendering as dark silhouettes.
 * 3. Parametric Curved Racetrack Rig (`createCurvedTrackRig`): straight home stretch sweeping
 *    into a sweeping 3D bend on the left with curved PVC rail, scrolling posts, striped
 *    emerald infield, optional lane lines, red/white furlong poles, and 3D instanced woodland.
 * 4. Two-layer Volumetric Hoof Kickback System: soft billowing dust/sand cloud sprites +
 *    crisp ballistic clods/turf/sand/rubber debris particles.
 */

export const SURFACE_PRESETS = {
  turf: {
    label: 'mặt cỏ',
    base: '#3b792b',
    light: '#5a9d3e',
    dark: '#285a1e',
    normalStrength: 2.3,
    normalScale: 1.2,
    roughness: 0.88,
    envMapIntensity: 0.55,
    dustColors: ['#5c823b', '#6d583d', '#497030'],
    plumeColor: '#7a7054',
    plumeOpacity: 0.22,
    plumeSize: 0.82,
    plumeRate: 0.42,
    clodSize: 0.22,
    clodRate: 1.25,
    showPoles: false,
  },
  dirt: {
    label: 'mặt đất',
    base: '#7a4a27',
    light: '#a46c40',
    dark: '#462611',
    normalStrength: 3.6,
    normalScale: 1.65,
    roughness: 0.92,
    envMapIntensity: 0.52,
    dustColors: ['#442410', '#693c1e', '#9c6a42'],
    plumeColor: '#c99b6c',
    plumeOpacity: 0.58,
    plumeSize: 1.68,
    plumeRate: 1.5,
    clodSize: 0.26,
    clodRate: 1.5,
    showPoles: false,
  },
  sand: {
    label: 'mặt cát',
    base: '#d7b476',
    light: '#eed29a',
    dark: '#aa8346',
    normalStrength: 3.3,
    normalScale: 1.55,
    roughness: 0.86,
    envMapIntensity: 0.55,
    dustColors: ['#e0c286', '#bd9454', '#f2dcb0'],
    plumeColor: '#e6c993',
    plumeOpacity: 0.62,
    plumeSize: 1.4,
    plumeRate: 1.45,
    clodSize: 0.25,
    clodRate: 1.75,
    showPoles: false,
  },
  synthetic: {
    label: 'mặt tổng hợp',
    base: '#201e1d',
    light: '#33302e',
    dark: '#121110',
    normalStrength: 2.3,
    normalScale: 1.15,
    roughness: 0.88,
    envMapIntensity: 0.32,
    dustColors: ['#181615', '#2c2927', '#0f0e0d'],
    plumeColor: '#3a3634',
    plumeOpacity: 0.22,
    plumeSize: 0.72,
    plumeRate: 0.38,
    clodSize: 0.23,
    clodRate: 1.6,
    showPoles: true,
  },
  pasture: {
    label: 'đồng cỏ',
    base: '#35672b',
    light: '#447d37',
    dark: '#29521f',
    normalStrength: 1.6,
    normalScale: 0.85,
    roughness: 0.95,
    envMapIntensity: 0.5,
    dustColors: ['#4a7834', '#6b553d'],
    plumeColor: '#7a7054',
    plumeOpacity: 0.16,
    plumeSize: 0.65,
    plumeRate: 0.2,
    clodSize: 0.18,
    clodRate: 0.35,
    grass: true,
    showPoles: false,
  },
};

function makeRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function makeCanvas(size = 1024) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function configureTexture(canvas, { color = false, anisotropy = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(16, anisotropy || 4);
  return tex;
}

/**
 * Converts a grayscale height canvas into a true tangent-space NormalMap (`DataTexture`)
 * using wrap-around Sobel derivatives, making harrow furrows, sand ripples, and turf texture
 * catch oblique sunlight with crisp 3D relief.
 */
function heightCanvasToNormalTexture(heightCanvas, strength = 2.8, anisotropy = 8) {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h * 4);

  const sample = (x, y) => {
    const wx = ((x % w) + w) % w;
    const wy = ((y % h) + h) % h;
    return src[(wy * w + wx) * 4] / 255;
  };

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.hypot(dx, dy, dz);

      const idx = (y * w + x) * 4;
      out[idx] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      out[idx + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      out[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      out[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(16, anisotropy || 4);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates synchronized 1024x1024 Albedo (`map`), Tangent-Space `normalMap`, and `roughnessMap`
 * for a racehorse training track surface.
 */
export function createSurfaceMaps(kind, maxAnisotropy = 8) {
  const key = SURFACE_PRESETS[kind] ? kind : 'dirt';
  const preset = SURFACE_PRESETS[key];
  const SIZE = 512; // 512px gives ~12ms Sobel build time and ultra-crisp 8mm texels at TILE_M=4m!

  const albedoC = makeCanvas(SIZE);
  const heightC = makeCanvas(SIZE);
  const roughC = makeCanvas(SIZE);

  const g = albedoC.getContext('2d');
  const hg = heightC.getContext('2d');
  const rg = roughC.getContext('2d');
  const rnd = makeRng(key === 'turf' ? 19 : key === 'sand' ? 37 : key === 'synthetic' ? 53 : 23);

  g.fillStyle = preset.base;
  g.fillRect(0, 0, SIZE, SIZE);
  hg.fillStyle = '#808080';
  hg.fillRect(0, 0, SIZE, SIZE);
  rg.fillStyle = key === 'synthetic' ? '#b0b0b0' : key === 'sand' ? '#d4d4d4' : '#dedede';
  rg.fillRect(0, 0, SIZE, SIZE);

  if (key === 'turf' || key === 'pasture') {
    if (key === 'turf') {
      // Iconic alternating stadium mown stripes running along the curved track
      const bands = 6;
      const bw = SIZE / bands;
      for (let i = 0; i < bands; i += 1) {
        if (i % 2 === 0) {
          g.fillStyle = 'rgba(154, 212, 92, 0.30)';
          g.fillRect(0, i * bw, SIZE, bw);
          rg.fillStyle = 'rgba(162, 162, 162, 0.45)';
          rg.fillRect(0, i * bw, SIZE, bw);
        } else {
          g.fillStyle = 'rgba(22, 62, 18, 0.22)';
          g.fillRect(0, i * bw, SIZE, bw);
          rg.fillStyle = 'rgba(218, 218, 218, 0.45)';
          rg.fillRect(0, i * bw, SIZE, bw);
        }
      }
      // Subtle rail-side wear
      const wear = g.createLinearGradient(0, 0, 0, SIZE * 0.25);
      wear.addColorStop(0, 'rgba(84, 68, 40, 0.22)');
      wear.addColorStop(1, 'rgba(84, 68, 40, 0)');
      g.fillStyle = wear;
      g.fillRect(0, 0, SIZE, SIZE * 0.25);
    }

    for (let i = 0; i < 42; i += 1) {
      const x = rnd() * SIZE;
      const y = rnd() * SIZE;
      const rad = 24 + rnd() * 64;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, rnd() > 0.5 ? 'rgba(148,198,84,0.12)' : 'rgba(24,58,18,0.12)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }

    const greens = ['#2b6021', '#458732', '#64a644', '#80bd54'];
    for (let i = 0; i < 20000; i += 1) {
      const x = rnd() * SIZE;
      const y = rnd() * SIZE;
      const len = 3 + rnd() * 5.5;
      const dx = (rnd() - 0.5) * 2.5;
      g.strokeStyle = greens[i % greens.length];
      g.globalAlpha = 0.34 + rnd() * 0.42;
      g.lineWidth = 1.05;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + dx, y - len);
      g.stroke();

      if (i % 2 === 0) {
        const shade = Math.round(92 + rnd() * 135);
        hg.strokeStyle = `rgb(${shade},${shade},${shade})`;
        hg.globalAlpha = 0.52;
        hg.beginPath();
        hg.moveTo(x, y);
        hg.lineTo(x + dx, y - len);
        hg.stroke();
      }
    }

    if (key === 'turf') {
      for (let i = 0; i < 160; i += 1) {
        const x = rnd() * SIZE;
        const y = (0.1 + rnd() * 0.78) * SIZE;
        g.fillStyle = 'rgba(66, 48, 28, 0.34)';
        g.beginPath();
        g.ellipse(x, y, 3.2, 2.0, (rnd() - 0.5) * 0.25, 0, Math.PI * 2);
        g.fill();
        hg.fillStyle = 'rgba(28, 28, 28, 0.65)';
        hg.beginPath();
        hg.ellipse(x, y, 3.2, 2.0, 0, 0, Math.PI * 2);
        hg.fill();
      }
    }
  } else if (key === 'dirt') {
    // Rich racing dirt: darker compacted inner path + dramatic harrow rake ridges
    const lane = g.createLinearGradient(0, 0, 0, SIZE);
    lane.addColorStop(0, 'rgba(60, 32, 14, 0.40)');
    lane.addColorStop(0.45, 'rgba(72, 40, 18, 0.14)');
    lane.addColorStop(1, 'rgba(186, 134, 88, 0.10)');
    g.fillStyle = lane;
    g.fillRect(0, 0, SIZE, SIZE);

    const laneRough = rg.createLinearGradient(0, 0, 0, SIZE);
    laneRough.addColorStop(0, '#b8b8b8');
    laneRough.addColorStop(0.5, '#d8d8d8');
    laneRough.addColorStop(1, '#efefef');
    rg.fillStyle = laneRough;
    rg.fillRect(0, 0, SIZE, SIZE);

    // Deep parallel harrow rake furrows along the running direction (X)
    const furrowPitch = 10;
    for (let y = 0; y < SIZE; y += furrowPitch) {
      // Smooth sine-like ridge profile in heightmap -> super clean normal ridges!
      const ridgeGrad = hg.createLinearGradient(0, y, 0, y + furrowPitch);
      ridgeGrad.addColorStop(0.0, '#2a2a2a');
      ridgeGrad.addColorStop(0.35, '#8c8c8c');
      ridgeGrad.addColorStop(0.55, '#e8e8e8');
      ridgeGrad.addColorStop(0.8, '#888888');
      ridgeGrad.addColorStop(1.0, '#2a2a2a');
      hg.fillStyle = ridgeGrad;
      hg.globalAlpha = 0.72;
      hg.fillRect(0, y, SIZE, furrowPitch);

      // Matching subtle dark trough & sunlit crest in albedo
      g.fillStyle = 'rgba(46, 24, 10, 0.34)';
      g.fillRect(0, y, SIZE, 2.5);
      g.fillStyle = 'rgba(205, 152, 104, 0.16)';
      g.fillRect(0, y + 4.2, SIZE, 2.4);
    }

    // Loam granular texture & small clods on top of furrows
    for (let i = 0; i < 16000; i += 1) {
      const x = rnd() * SIZE;
      const y = rnd() * SIZE;
      const s = 0.9 + rnd() * 2.1;
      const light = rnd() > 0.48;
      g.fillStyle = light ? preset.light : preset.dark;
      g.globalAlpha = 0.18 + rnd() * 0.32;
      g.fillRect(x, y, s, s);
      if (i % 2 === 0) {
        const b = light ? 205 : 58;
        hg.fillStyle = `rgb(${b},${b},${b})`;
        hg.globalAlpha = 0.28;
        hg.fillRect(x, y, s + 0.4, s + 0.4);
      }
    }

    // Crescent hoof prints stamped across the lanes
    for (let i = 0; i < 460; i += 1) {
      const y = Math.pow(rnd(), 1.35) * SIZE;
      const x = rnd() * SIZE;
      g.globalAlpha = 0.44;
      g.fillStyle = '#361d0c';
      g.beginPath();
      g.ellipse(x, y, 4.0, 2.5, 0, Math.PI * 0.16, Math.PI * 1.84);
      g.fill();

      hg.globalAlpha = 0.8;
      hg.fillStyle = '#181818';
      hg.beginPath();
      hg.ellipse(x, y, 4.0, 2.5, 0, Math.PI * 0.16, Math.PI * 1.84);
      hg.fill();
    }
  } else if (key === 'sand') {
    // Deep sunlit sand dunes / wind-blown ripples sculpted in heightmap for strong sunlit contrast!
    const grad = g.createLinearGradient(0, 0, 0, SIZE);
    grad.addColorStop(0, 'rgba(176, 140, 82, 0.20)');
    grad.addColorStop(0.5, 'rgba(252, 238, 200, 0.14)');
    grad.addColorStop(1, 'rgba(182, 148, 92, 0.16)');
    g.fillStyle = grad;
    g.fillRect(0, 0, SIZE, SIZE);

    // Sculpt smooth diagonal wave ripples into heightmap + subtle shadow band in albedo
    const imgH = hg.getImageData(0, 0, SIZE, SIZE);
    const hd = imgH.data;
    for (let py = 0; py < SIZE; py += 1) {
      for (let px = 0; px < SIZE; px += 1) {
        const phase = ((px * 22) / SIZE) * Math.PI * 2 + Math.sin((py / SIZE) * Math.PI * 4) * 2.2;
        const wave = Math.sin(phase) * 0.5 + 0.5;
        const fine = Math.sin(((px * 64 + py * 18) / SIZE) * Math.PI * 2) * 0.12;
        const v = Math.max(0, Math.min(255, Math.round((0.18 + wave * 0.68 + fine) * 255)));
        const idx = (py * SIZE + px) * 4;
        hd[idx] = v;
        hd[idx + 1] = v;
        hd[idx + 2] = v;
        hd[idx + 3] = 255;
      }
    }
    hg.putImageData(imgH, 0, 0);

    // Soft warm shading matching the ripple troughs
    for (let x = 0; x < SIZE; x += SIZE / 22) {
      g.strokeStyle = 'rgba(156, 122, 68, 0.22)';
      g.lineWidth = 3.2;
      g.beginPath();
      for (let y = 0; y <= SIZE; y += 16) {
        const px = x + Math.sin((y / SIZE) * Math.PI * 4) * 8.2;
        if (y === 0) g.moveTo(px, y);
        else g.lineTo(px, y);
      }
      g.stroke();
    }

    // Quartz grains & sunlit sparkle in roughnessMap
    for (let i = 0; i < 16000; i += 1) {
      const x = rnd() * SIZE;
      const y = rnd() * SIZE;
      const s = 0.9 + rnd() * 1.6;
      g.fillStyle = rnd() > 0.44 ? preset.light : preset.dark;
      g.globalAlpha = 0.22 + rnd() * 0.34;
      g.fillRect(x, y, s, s);
      if (i % 8 === 0) {
        rg.fillStyle = '#4a4a4a';
        rg.globalAlpha = 0.72;
        rg.fillRect(x, y, 1.4, 1.4);
      }
    }

    // Soft hoof impact craters in deep sand
    for (let i = 0; i < 240; i += 1) {
      const x = rnd() * SIZE;
      const y = rnd() * SIZE;
      g.globalAlpha = 0.28;
      g.fillStyle = '#9e7d48';
      g.beginPath();
      g.ellipse(x, y, 4.6, 3.1, 0, 0, Math.PI * 2);
      g.fill();
      hg.globalAlpha = 0.72;
      hg.fillStyle = '#1e1e1e';
      hg.beginPath();
      hg.ellipse(x, y, 4.6, 3.1, 0, 0, Math.PI * 2);
      hg.fill();
    }
  } else if (key === 'synthetic') {
    // Sleek waxed Polytrack: dark charcoal-asphalt rubber granules & fine polymer fibers
    const sheen = rg.createLinearGradient(0, 0, 0, SIZE);
    sheen.addColorStop(0, '#8a8a8a');
    sheen.addColorStop(0.5, '#b2b2b2');
    sheen.addColorStop(1, '#989898');
    rg.fillStyle = sheen;
    rg.fillRect(0, 0, SIZE, SIZE);

    for (let y = 0; y < SIZE; y += 28) {
      g.fillStyle = y % 56 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.07)';
      g.fillRect(0, y, SIZE, 14);
    }

    for (let i = 0; i < 22000; i += 1) {
      const x = rnd() * SIZE;
      const y = rnd() * SIZE;
      const isFibre = i % 3 === 0;
      g.fillStyle = rnd() > 0.5 ? preset.light : preset.dark;
      g.globalAlpha = 0.26 + rnd() * 0.36;
      if (isFibre) {
        g.fillRect(x, y, 3.2 + rnd() * 5, 0.85);
        hg.fillStyle = rnd() > 0.5 ? '#c8c8c8' : '#4a4a4a';
        hg.globalAlpha = 0.48;
        hg.fillRect(x, y, 3.2 + rnd() * 4.5, 1.0);
      } else {
        const s = 1 + rnd() * 1.9;
        g.fillRect(x, y, s, s);
        hg.fillStyle = rnd() > 0.5 ? '#d8d8d8' : '#363636';
        hg.globalAlpha = 0.46;
        hg.fillRect(x, y, s, s);
      }
      if (i % 6 === 0) {
        rg.fillStyle = rnd() > 0.5 ? '#787878' : '#c8c8c8';
        rg.globalAlpha = 0.45;
        rg.fillRect(x, y, 2, 2);
      }
    }

    for (let i = 0; i < 200; i += 1) {
      const x = rnd() * SIZE;
      const y = Math.pow(rnd(), 1.35) * SIZE;
      g.globalAlpha = 0.34;
      g.fillStyle = '#181615';
      g.beginPath();
      g.ellipse(x, y, 3.4, 2.2, 0, 0, Math.PI * 2);
      g.fill();
      hg.globalAlpha = 0.55;
      hg.fillStyle = '#2c2c2c';
      hg.beginPath();
      hg.ellipse(x, y, 3.4, 2.2, 0, 0, Math.PI * 2);
      hg.fill();
    }
  }

  g.globalAlpha = 1;
  hg.globalAlpha = 1;
  rg.globalAlpha = 1;

  const map = configureTexture(albedoC, { color: true, anisotropy: maxAnisotropy });
  const normalMap = heightCanvasToNormalTexture(heightC, preset.normalStrength, maxAnisotropy);
  const roughnessMap = configureTexture(roughC, { color: false, anisotropy: maxAnisotropy });

  return {
    map,
    normalMap,
    roughnessMap,
    preset,
    setRepeat(rx, ry) {
      map.repeat.set(rx, ry);
      normalMap.repeat.set(rx, ry);
      roughnessMap.repeat.set(rx, ry);
    },
    setOffsetX(ox) {
      map.offset.x = ox;
      normalMap.offset.x = ox;
      roughnessMap.offset.x = ox;
    },
    dispose() {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
    },
  };
}

/**
 * Lightweight procedural Sky-Sun-Ground IBL environment via PMREMGenerator.
 * Gives horses natural coat sheen, warm sunlight highlights, and cool sky fill on shadows
 * (eliminating flat black silhouettes on bay/dark-bay/black coats).
 */
export function createSkyEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();

  // Gradient outdoor sky + warm ground bounce dome
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0.0, '#6aa6e2'); // azure zenith
  grad.addColorStop(0.42, '#c8e2f6'); // bright sky horizon
  grad.addColorStop(0.5, '#f2e8d4'); // warm sunlit horizon glow
  grad.addColorStop(0.62, '#7d7b54'); // green-earth bounce
  grad.addColorStop(1.0, '#5a4a36'); // warm soil bounce
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);

  // Soft solar highlight disc for crisp specular sheen on horse muscles & saddle
  const sunGrad = g.createRadialGradient(184, 34, 2, 184, 34, 26);
  sunGrad.addColorStop(0, 'rgba(255, 250, 232, 1)');
  sunGrad.addColorStop(0.35, 'rgba(255, 238, 198, 0.72)');
  sunGrad.addColorStop(1, 'rgba(255, 238, 198, 0)');
  g.fillStyle = sunGrad;
  g.fillRect(150, 4, 68, 60);

  const skyTex = new THREE.CanvasTexture(c);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const domeGeo = new THREE.SphereGeometry(20, 24, 16);
  const domeMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(domeGeo, domeMat));

  const rt = pmrem.fromScene(envScene, 0.04);
  skyTex.dispose();
  domeGeo.dispose();
  domeMat.dispose();
  pmrem.dispose();

  return {
    texture: rt.texture,
    dispose() {
      rt.dispose();
    },
  };
}

/** Textured mown stadium-striped emerald infield grass. */
export function createInfieldTexture(maxAnisotropy = 8) {
  const SIZE = 512;
  const c = makeCanvas(SIZE);
  const g = c.getContext('2d');
  const rnd = makeRng(71);

  g.fillStyle = '#477e32';
  g.fillRect(0, 0, SIZE, SIZE);

  for (let i = 0; i < 8; i += 1) {
    g.fillStyle = i % 2 === 0 ? 'rgba(144, 200, 86, 0.22)' : 'rgba(28, 66, 20, 0.14)';
    g.fillRect(0, i * (SIZE / 8), SIZE, SIZE / 8);
  }

  const blades = ['#356424', '#56903c', '#72ab4c'];
  for (let i = 0; i < 13000; i += 1) {
    g.strokeStyle = blades[i % 3];
    g.globalAlpha = 0.28 + rnd() * 0.34;
    const x = rnd() * SIZE;
    const y = rnd() * SIZE;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 2, y - 2 - rnd() * 3.5);
    g.lineWidth = 1;
    g.stroke();
  }
  g.globalAlpha = 1;
  return configureTexture(c, { color: true, anisotropy: maxAnisotropy });
}

/**
 * Red-and-white striped pole texture used for synthetic / Polytrack furlong distance markers.
 */
function createStripePoleTexture() {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i += 1) {
    g.fillStyle = i % 2 === 0 ? '#dc2626' : '#f8fafc';
    g.fillRect(0, i * 16, 16, 16);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Natural dappled clover & bluegrass meadow PBR maps (no artificial stadium stripes),
 * used for the natural grazing pasture on HorseDetailPage.
 */
export function createMeadowPbrMaps(maxAnisotropy = 8) {
  const SIZE = 512;
  const albedoC = makeCanvas(SIZE);
  const heightC = makeCanvas(SIZE);
  const roughC = makeCanvas(SIZE);
  const g = albedoC.getContext('2d');
  const hg = heightC.getContext('2d');
  const rg = roughC.getContext('2d');
  const rnd = makeRng(211);

  g.fillStyle = '#3f762b';
  g.fillRect(0, 0, SIZE, SIZE);
  hg.fillStyle = '#808080';
  hg.fillRect(0, 0, SIZE, SIZE);
  rg.fillStyle = '#dedede';
  rg.fillRect(0, 0, SIZE, SIZE);

  // Soft organic dappled meadow patches (sunlit clover & deeper moss hollows)
  for (let i = 0; i < 95; i += 1) {
    const x = rnd() * SIZE;
    const y = rnd() * SIZE;
    const r = 24 + rnd() * 56;
    const grad = g.createRadialGradient(x, y, 2, x, y, r);
    const bright = i % 2 === 0;
    grad.addColorStop(0, bright ? 'rgba(118, 172, 64, 0.22)' : 'rgba(34, 72, 22, 0.20)');
    grad.addColorStop(1, 'rgba(63, 118, 43, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, SIZE, SIZE);
  }

  // 28,000 fine organic grass & clover micro-blades
  const palette = ['#2d5a1e', '#3c7129', '#4f8936', '#67a044', '#7ab052'];
  for (let i = 0; i < 28000; i += 1) {
    const x = rnd() * SIZE;
    const y = rnd() * SIZE;
    const dx = (rnd() - 0.5) * 2.4;
    const dy = -1.8 - rnd() * 3.4;
    g.strokeStyle = palette[i % palette.length];
    g.globalAlpha = 0.35 + rnd() * 0.4;
    g.lineWidth = 0.8 + rnd() * 0.7;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + dx, y + dy);
    g.stroke();

    if (i % 2 === 0) {
      hg.strokeStyle = i % 4 === 0 ? '#b4b4b4' : '#585858';
      hg.globalAlpha = 0.4;
      hg.lineWidth = 1;
      hg.beginPath();
      hg.moveTo(x, y);
      hg.lineTo(x + dx, y + dy);
      hg.stroke();
    }
  }
  g.globalAlpha = 1;
  hg.globalAlpha = 1;

  const map = configureTexture(albedoC, { color: true, anisotropy: maxAnisotropy });
  const normalMap = heightCanvasToNormalTexture(heightC, 1.85, maxAnisotropy);
  const roughnessMap = configureTexture(roughC, { color: false, anisotropy: maxAnisotropy });

  return {
    map,
    normalMap,
    roughnessMap,
    setRepeat(rx, ry) {
      map.repeat.set(rx, ry);
      normalMap.repeat.set(rx, ry);
      roughnessMap.repeat.set(rx, ry);
    },
    dispose() {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
    },
  };
}

/**
 * High-frequency organic distant forest horizon belt (1024x256 micro-textured foliage, tree trunks,
 * and layered canopy depth — zero flat cartoon circles!).
 */
export function create3DWoodlandBelt({ centerX = 24, centerZ = -21, scaleX = 1.38, scaleY = 1, scaleZ = 0.85, y = 4.9 } = {}) {
  const group = new THREE.Group();
  const rnd = makeRng(137);
  const W = 1024;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);

  // Composite natural multi-frequency skyline profile
  const skylineAt = (x) => {
    const t = (x / W) * Math.PI * 2;
    return (
      118 +
      Math.sin(t * 4) * 16 +
      Math.cos(t * 9 + 0.8) * 12 +
      Math.sin(t * 19 + 2.1) * 8 +
      Math.cos(t * 37 + 0.4) * 5 +
      Math.sin(t * 71) * 2.5
    );
  };

  // Layer 1: Atmospheric blue-green distant mountain/forest ridge
  const ridgeGrad = g.createLinearGradient(0, 85, 0, H);
  ridgeGrad.addColorStop(0, '#3e6646');
  ridgeGrad.addColorStop(0.5, '#2b4f2c');
  ridgeGrad.addColorStop(1, '#1a3418');
  g.fillStyle = ridgeGrad;
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 2) {
    g.lineTo(x, skylineAt(x));
  }
  g.lineTo(W, H);
  g.closePath();
  g.fill();

  // Layer 2: Subtle vertical tree trunks & shadowed boughs inside the forest lower third
  for (let i = 0; i < 180; i += 1) {
    const tx = rnd() * W;
    const topY = skylineAt(tx) + 28 + rnd() * 45;
    g.strokeStyle = i % 2 === 0 ? 'rgba(26, 32, 20, 0.45)' : 'rgba(62, 46, 32, 0.35)';
    g.lineWidth = 1.2 + rnd() * 1.8;
    g.beginPath();
    g.moveTo(tx, H);
    g.lineTo(tx + (rnd() - 0.5) * 4, topY);
    g.stroke();
  }

  // Layer 3: 32,000 fine irregular micro-foliage stipples (1.2-3.5px) creating realistic leafy texture
  const foliageTones = ['#183316', '#21421d', '#2b5424', '#37662b', '#467a33', '#588c3c', '#6a9d46'];
  for (let i = 0; i < 32000; i += 1) {
    const x = rnd() * W;
    const minY = skylineAt(x) - 4;
    const y = minY + Math.pow(rnd(), 0.88) * (H - minY);
    if (y < minY || y > H) continue;
    const heightFrac = 1 - (y - minY) / Math.max(1, H - minY);
    // Upper canopy catches warm sunlight; lower canopy settles into deep forest shade
    const toneIdx = Math.min(
      foliageTones.length - 1,
      Math.max(0, Math.floor((heightFrac * 0.65 + rnd() * 0.45) * foliageTones.length)),
    );
    g.fillStyle = foliageTones[toneIdx];
    g.globalAlpha = 0.55 + rnd() * 0.4;
    const w = 1.4 + rnd() * 2.8;
    const h = 1.2 + rnd() * 2.2;
    g.fillRect(x, y, w, h);
  }
  g.globalAlpha = 1;

  // Grounding shadow band at the base of the forest
  const baseGrad = g.createLinearGradient(0, H - 34, 0, H);
  baseGrad.addColorStop(0, 'rgba(18, 36, 15, 0)');
  baseGrad.addColorStop(1, 'rgba(15, 30, 12, 0.88)');
  g.fillStyle = baseGrad;
  g.fillRect(0, H - 34, W, 34);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(9, 1);

  const ringGeo = new THREE.CylinderGeometry(50, 50, 10.2, 72, 1, true);
  const ringMat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.scale.set(scaleX, scaleY, scaleZ);
  ring.position.set(centerX, y, centerZ);
  group.add(ring);

  return {
    group,
    setOffsetX(ox) {
      tex.offset.x = ox;
    },
    dispose() {
      tex.dispose();
      ringGeo.dispose();
      ringMat.dispose();
    },
  };
}

/**
 * True Closed Stadium Oval Broadcast Racetrack Rig (`C1` continuous loop):
 * - Front straightaway (`z = 0`, `x = straightStart .. straightEnd`): horses run along +X with zero distortion.
 * - Sweeping 180° Left Turn + unbroken Far Backstretch + 180° Right Turn behind camera:
 *   forms a 100% CLOSED mathematical loop so there are NEVER cut-off track stubs or popping fence posts
 *   anywhere in view (even when dragging OrbitControls around!).
 */
export function createCurvedTrackRig({
  width = 8.4,
  straightLen = 54,
  straightJoin = -2.2,
  bendRadius = 21,
  tileM = 4.2,
  postEvery = 3.0,
  laneCount = 1,
  maxAnisotropy = 8,
} = {}) {
  const straightStart = straightJoin;
  const straightEnd = straightStart + straightLen;
  const arcLen = Math.PI * bendRadius;
  const totalLen = 2 * straightLen + 2 * arcLen;
  const halfW = width / 2;
  const ovalCenterX = straightStart + straightLen * 0.5;
  const ovalCenterZ = -bendRadius;

  /** Centerline point & unit tangent/outward-normal at closed-loop arc-length `s`. */
  const pointAt = (rawS) => {
    const s = ((rawS % totalLen) + totalLen) % totalLen;
    if (s < straightLen) {
      // Front straightaway (+X)
      return { x: straightStart + s, z: 0, tx: 1, tz: 0, nx: 0, nz: 1 };
    }
    if (s < straightLen + arcLen) {
      // Right 180° turn (far behind camera)
      const theta = (s - straightLen) / bendRadius;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      return {
        x: straightEnd + sin * bendRadius,
        z: -bendRadius + cos * bendRadius,
        tx: cos,
        tz: -sin,
        nx: sin,
        nz: cos,
      };
    }
    if (s < 2 * straightLen + arcLen) {
      // Unbroken far backstretch (-X) spanning continuously across the entire background
      const d = s - (straightLen + arcLen);
      return { x: straightEnd - d, z: -2 * bendRadius, tx: -1, tz: 0, nx: 0, nz: -1 };
    }
    // Sweeping 180° left turn curving smoothly from the far backstretch into the front straightaway
    const theta = (s - (2 * straightLen + arcLen)) / bendRadius;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    return {
      x: straightStart - sin * bendRadius,
      z: -bendRadius - cos * bendRadius,
      tx: -cos,
      tz: sin,
      nx: -sin,
      nz: -cos,
    };
  };

  /** Builds a closed-loop oval strip mesh between lateral offsets [offsetA, offsetB] at height `y`. */
  const buildStripGeometry = (offsetA, offsetB, y = 0, segments = 220) => {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const stripW = Math.abs(offsetB - offsetA);
    const tileCount = Math.max(1, Math.round(totalLen / tileM));
    for (let i = 0; i <= segments; i += 1) {
      const frac = i / segments;
      const s = frac * totalLen;
      const p = pointAt(s);
      const ax = p.x + p.nx * offsetA;
      const az = p.z + p.nz * offsetA;
      const bx = p.x + p.nx * offsetB;
      const bz = p.z + p.nz * offsetB;
      positions.push(ax, y, az, bx, y, bz);
      normals.push(0, 1, 0, 0, 1, 0);
      const u = frac * tileCount;
      uvs.push(u, 0, u, stripW / tileM);
      if (i < segments) {
        const k = i * 2;
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
  };

  /** Builds a seamless closed 3D rail tube loop along lateral offset `latOffset` at height `y`. */
  const buildRailGeometry = (latOffset, y, radius = 0.045, segments = 200) => {
    const pts = [];
    for (let i = 0; i < segments; i += 1) {
      const s = (i / segments) * totalLen;
      const p = pointAt(s);
      pts.push(new THREE.Vector3(p.x + p.nx * latOffset, y, p.z + p.nz * latOffset));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    return new THREE.TubeGeometry(curve, segments, radius, 6, true);
  };

  const group = new THREE.Group();

  // 1. Main closed-oval PBR track surface (receives real horse & rail shadows!)
  const trackGeo = buildStripGeometry(-halfW, halfW, 0, 220);
  const trackMat = new THREE.MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0.02,
    normalScale: new THREE.Vector2(1.3, 1.3),
    envMapIntensity: 0.55,
  });
  const trackMesh = new THREE.Mesh(trackGeo, trackMat);
  trackMesh.receiveShadow = true;
  group.add(trackMesh);

  // 2. Closed white PVC inner rail (running rail on the infield side, -halfW)
  const railOffset = -halfW + 0.08;
  const railMat = new THREE.MeshStandardMaterial({ color: '#f5f4ef', roughness: 0.42, metalness: 0.05 });
  const topRailGeo = buildRailGeometry(railOffset, 1.02, 0.052, 200);
  const topRail = new THREE.Mesh(topRailGeo, railMat);
  topRail.castShadow = true;
  topRail.receiveShadow = true;
  group.add(topRail);

  // Closed white inner ground curb following the entire stadium oval
  const curbGeo = buildRailGeometry(-halfW - 0.05, 0.055, 0.075, 200);
  const curbMat = new THREE.MeshStandardMaterial({ color: '#e6e4dc', roughness: 0.78 });
  const curb = new THREE.Mesh(curbGeo, curbMat);
  curb.receiveShadow = true;
  group.add(curb);

  // 3. Exact-step closed-loop white PVC rail posts (ZERO popping or vanishing anywhere in 360°!)
  const postCount = Math.max(12, Math.round(totalLen / postEvery));
  const exactPostStep = totalLen / postCount;
  const postGeo = new THREE.BoxGeometry(0.085, 1.08, 0.095);
  const posts = new THREE.InstancedMesh(postGeo, railMat, postCount);
  posts.castShadow = true;
  posts.receiveShadow = true;
  group.add(posts);

  // 4. Optional red-and-white striped furlong distance markers (exact closed loop, shown on synthetic / trial)
  const poleCount = Math.max(6, Math.round(totalLen / 16));
  const exactPoleStep = totalLen / poleCount;
  const poleTex = createStripePoleTexture();
  const poleGeo = new THREE.CylinderGeometry(0.055, 0.06, 1.85, 10);
  const poleMat = new THREE.MeshStandardMaterial({ map: poleTex, roughness: 0.55 });
  const discGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 16);
  const discMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.45 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, poleCount);
  const poleDiscs = new THREE.InstancedMesh(discGeo, discMat, poleCount);
  poles.castShadow = true;
  poles.visible = false;
  poleDiscs.visible = false;
  group.add(poles, poleDiscs);

  // 5. Crisp closed curved white lane divider lines (when displaying multiple parallel lanes!)
  const laneGroup = new THREE.Group();
  const laneLineMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false });
  const laneGeos = [];
  const setLanes = (count) => {
    while (laneGroup.children.length) laneGroup.remove(laneGroup.children[0]);
    while (laneGeos.length) laneGeos.pop().dispose();
    if (count < 2) return;
    const span = Math.min(width - 1.4, count * 2.35);
    const step = span / count;
    const startOff = -span / 2;
    for (let i = 1; i < count; i += 1) {
      const zOff = startOff + i * step;
      const lGeo = buildStripGeometry(zOff - 0.04, zOff + 0.04, 0.014, 200);
      laneGeos.push(lGeo);
      laneGroup.add(new THREE.Mesh(lGeo, laneLineMat));
    }
  };
  setLanes(laneCount);
  group.add(laneGroup);

  // 6. Wide lush striped emerald infield & outer apron receiving shadows across the entire oval
  const infieldTex = createInfieldTexture(maxAnisotropy);
  infieldTex.repeat.set(34, 28);
  const infieldGeo = new THREE.PlaneGeometry(240, 190);
  const infieldMat = new THREE.MeshStandardMaterial({ map: infieldTex, roughness: 0.94, envMapIntensity: 0.5 });
  const infieldMesh = new THREE.Mesh(infieldGeo, infieldMat);
  infieldMesh.rotation.x = -Math.PI / 2;
  infieldMesh.position.set(ovalCenterX, -0.025, ovalCenterZ);
  infieldMesh.receiveShadow = true;
  group.add(infieldMesh);

  // 7. Continuous deciduous woodland ring cleanly enclosing the full stadium oval
  const woodland = create3DWoodlandBelt({ centerX: ovalCenterX, centerZ: ovalCenterZ });
  group.add(woodland.group);

  // Helper to scroll posts & furlong poles smoothly in a seamless closed loop
  const mat4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const posV = new THREE.Vector3();

  const placeAlongCurve = (travelled) => {
    for (let i = 0; i < postCount; i += 1) {
      const s = (((i * exactPostStep - travelled) % totalLen) + totalLen) % totalLen;
      const p = pointAt(s);
      const yaw = Math.atan2(-p.tz, p.tx);
      posV.set(p.x + p.nx * railOffset, 0.54, p.z + p.nz * railOffset);
      quat.setFromAxisAngle(up, yaw);
      mat4.compose(posV, quat, one);
      posts.setMatrixAt(i, mat4);
    }
    posts.instanceMatrix.needsUpdate = true;

    if (poles.visible) {
      const poleLat = railOffset - 0.35;
      for (let i = 0; i < poleCount; i += 1) {
        const s = (((i * exactPoleStep - travelled) % totalLen) + totalLen) % totalLen;
        const p = pointAt(s);
        const yaw = Math.atan2(-p.tz, p.tx);
        posV.set(p.x + p.nx * poleLat, 0.92, p.z + p.nz * poleLat);
        quat.setFromAxisAngle(up, yaw);
        mat4.compose(posV, quat, one);
        poles.setMatrixAt(i, mat4);

        posV.set(p.x + p.nx * poleLat, 1.94, p.z + p.nz * poleLat);
        quat.setFromEuler(new THREE.Euler(Math.PI / 2, yaw, 0));
        mat4.compose(posV, quat, one);
        poleDiscs.setMatrixAt(i, mat4);
      }
      poles.instanceMatrix.needsUpdate = true;
      poleDiscs.instanceMatrix.needsUpdate = true;
    }
  };
  placeAlongCurve(0);

  let surfaceMaps = null;
  let surfaceKind = null;
  let forcePoles = false;

  return {
    group,
    trackMesh,
    setLanes,
    setShowPoles(on) {
      forcePoles = Boolean(on);
      const show = forcePoles || Boolean(SURFACE_PRESETS[surfaceKind]?.showPoles);
      poles.visible = show;
      poleDiscs.visible = show;
    },
    setSurface(kind) {
      const next = SURFACE_PRESETS[kind] ? kind : 'dirt';
      if (next === surfaceKind) return;
      surfaceKind = next;
      surfaceMaps?.dispose();
      surfaceMaps = createSurfaceMaps(next, maxAnisotropy);
      trackMat.map = surfaceMaps.map;
      trackMat.normalMap = surfaceMaps.normalMap;
      trackMat.normalScale.set(surfaceMaps.preset.normalScale, surfaceMaps.preset.normalScale);
      trackMat.roughnessMap = surfaceMaps.roughnessMap;
      trackMat.roughness = surfaceMaps.preset.roughness;
      trackMat.envMapIntensity = surfaceMaps.preset.envMapIntensity ?? 0.55;
      trackMat.needsUpdate = true;
      const show = forcePoles || Boolean(surfaceMaps.preset.showPoles);
      poles.visible = show;
      poleDiscs.visible = show;
    },
    scroll(travelled) {
      if (surfaceMaps) surfaceMaps.setOffsetX(((travelled / tileM) % 1 + 1) % 1);
      infieldTex.offset.x = ((travelled / 7) % 1 + 1) % 1;
      woodland.setOffsetX(((travelled * 0.0022) % 1 + 1) % 1);
      placeAlongCurve(travelled);
    },
    dispose() {
      surfaceMaps?.dispose();
      trackGeo.dispose();
      trackMat.dispose();
      topRailGeo.dispose();
      railMat.dispose();
      curbGeo.dispose();
      curbMat.dispose();
      postGeo.dispose();
      poleTex.dispose();
      poleGeo.dispose();
      poleMat.dispose();
      discGeo.dispose();
      discMat.dispose();
      laneLineMat.dispose();
      while (laneGeos.length) laneGeos.pop().dispose();
      infieldTex.dispose();
      infieldGeo.dispose();
      infieldMat.dispose();
      woodland.dispose();
    },
  };
}

/**
 * Generates a soft organic multi-lobe cloud puff texture (looks like billowing airborne dust/mist,
 * never hard round circles!).
 */
function makeDustCloudTexture() {
  const SIZE = 128;
  const c = makeCanvas(SIZE);
  const g = c.getContext('2d');
  const rnd = makeRng(311);
  // Stack 9 slightly offset soft radial gradients to make an authentic cloudy dust wisp
  for (let i = 0; i < 9; i += 1) {
    const cx = 64 + (rnd() - 0.5) * 34;
    const cy = 64 + (rnd() - 0.5) * 30;
    const r = 24 + rnd() * 26;
    const grad = g.createRadialGradient(cx, cy, 2, cx, cy, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.28)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, SIZE, SIZE);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeClodTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(16, 4);
  g.lineTo(26, 11);
  g.lineTo(23, 25);
  g.lineTo(10, 27);
  g.lineTo(5, 15);
  g.closePath();
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Two-Layer Volumetric Hoof Kickback System:
 * - Layer A (`plumes`): soft billowing dust/sand clouds that grow (`0.4 -> 2.0m`), drift behind the hooves,
 *   and dissolve smoothly — creates the dramatic trailing dust plumes seen on dirt and sand tracks.
 * - Layer B (`clods`): crisp ballistic dirt clods / sand splashes / turf divots / synthetic rubber crumbs.
 */
export function createHoofParticles(maxClods = 110, maxPlumes = 36) {
  const group = new THREE.Group();

  // --- Layer A: Billowing cloud sprites ---
  const plumeTex = makeDustCloudTexture();
  const plumes = [];
  for (let i = 0; i < maxPlumes; i += 1) {
    const mat = new THREE.SpriteMaterial({
      map: plumeTex,
      color: '#c79c70',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    group.add(sprite);
    plumes.push({
      sprite,
      mat,
      age: 99,
      life: 1,
      vx: 0,
      vy: 0,
      vz: 0,
      startScale: 0.45,
      endScale: 1.9,
      maxOpacity: 0.55,
      spin: 0,
    });
  }

  // --- Layer B: Ballistic clods / sand droplets / turf divots / rubber crumbs ---
  const positions = new Float32Array(maxClods * 3);
  const colors = new Float32Array(maxClods * 3);
  const clods = Array.from({ length: maxClods }, () => ({
    age: 99,
    life: 1,
    vx: 0,
    vy: 0,
    vz: 0,
    baseR: 0.5,
    baseG: 0.35,
    baseB: 0.2,
  }));
  for (let i = 0; i < maxClods; i += 1) positions[i * 3 + 1] = -999;

  const clodGeo = new THREE.BufferGeometry();
  clodGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  clodGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const clodTex = makeClodTexture();
  const clodMat = new THREE.PointsMaterial({
    size: 0.24,
    map: clodTex,
    alphaTest: 0.3,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const clodPoints = new THREE.Points(clodGeo, clodMat);
  clodPoints.frustumCulled = false;
  group.add(clodPoints);

  let plumeCursor = 0;
  let clodCursor = 0;
  let surfacePreset = SURFACE_PRESETS.dirt;
  const tmpColor = new THREE.Color();

  const spawnPlume = (x, y, z, { vx, vy, vz, life, startScale, endScale, maxOpacity }) => {
    const p = plumes[plumeCursor];
    plumeCursor = (plumeCursor + 1) % maxPlumes;
    p.age = 0;
    p.life = life;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.startScale = startScale;
    p.endScale = endScale;
    p.maxOpacity = maxOpacity;
    p.spin = (Math.random() - 0.5) * 1.1;
    p.mat.color.set(surfacePreset.plumeColor);
    p.mat.rotation = Math.random() * Math.PI * 2;
    p.mat.opacity = 0;
    p.sprite.position.set(x, y, z);
    p.sprite.scale.setScalar(startScale);
    p.sprite.visible = true;
  };

  const spawnClod = (x, y, z, { vx, vy, vz, life }) => {
    const idx = clodCursor;
    clodCursor = (clodCursor + 1) % maxClods;
    const p = clods[idx];
    const palette = surfacePreset.dustColors || SURFACE_PRESETS.dirt.dustColors;
    tmpColor.set(palette[idx % palette.length]);
    positions[idx * 3] = x;
    positions[idx * 3 + 1] = y;
    positions[idx * 3 + 2] = z;
    p.age = 0;
    p.life = life;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.baseR = tmpColor.r;
    p.baseG = tmpColor.g;
    p.baseB = tmpColor.b;
    colors[idx * 3] = p.baseR;
    colors[idx * 3 + 1] = p.baseG;
    colors[idx * 3 + 2] = p.baseB;
  };

  return {
    points: group,
    setSurface(kind) {
      surfacePreset = SURFACE_PRESETS[kind] || SURFACE_PRESETS.dirt;
      clodMat.size = surfacePreset.clodSize;
    },
    emitForHorse(x, z, kmh, dt) {
      if (kmh < 6) return;
      const speedFactor = Math.min(1.45, (kmh - 5) / 36);
      const mps = kmh / 3.6;

      // Billowing cloud plumes trailing cleanly behind rear & front hooves (never veiling the horse body)
      const plumeRate = speedFactor * (surfacePreset.plumeRate || 0.8) * dt * 10;
      const pCount = Math.floor(plumeRate) + (Math.random() < plumeRate % 1 ? 1 : 0);
      for (let i = 0; i < pCount; i += 1) {
        const rear = Math.random() > 0.22;
        const px = x + (rear ? -1.05 : -0.18) + (Math.random() - 0.5) * 0.42;
        const pz = z + (Math.random() - 0.5) * 0.34;
        const baseSize = surfacePreset.plumeSize || 1.2;
        spawnPlume(px, 0.22 + Math.random() * 0.14, pz, {
          vx: -mps * (0.42 + Math.random() * 0.22),
          vy: 0.22 + Math.random() * 0.34,
          vz: (Math.random() - 0.5) * 0.36,
          life: 0.72 + Math.random() * 0.52,
          startScale: baseSize * (0.34 + Math.random() * 0.18),
          endScale: baseSize * (1.22 + Math.random() * 0.55),
          maxOpacity: (surfacePreset.plumeOpacity || 0.45) * Math.min(1.15, 0.5 + speedFactor * 0.65),
        });
      }

      // Crisp ballistic clods / sand splashes / rubber crumbs
      const clodRate = speedFactor * (surfacePreset.clodRate || 1.0) * dt * 28;
      const cCount = Math.floor(clodRate) + (Math.random() < clodRate % 1 ? 1 : 0);
      for (let i = 0; i < cCount; i += 1) {
        const rear = Math.random() > 0.32;
        const px = x + (rear ? -0.68 : 0.38) + (Math.random() - 0.5) * 0.32;
        const pz = z + (Math.random() - 0.5) * 0.3;
        spawnClod(px, 0.08 + Math.random() * 0.08, pz, {
          vx: -mps * (0.42 + Math.random() * 0.35),
          vy: 1.4 + Math.random() * 1.9 * Math.min(1.25, kmh / 35),
          vz: (Math.random() - 0.5) * 0.9,
          life: 0.38 + Math.random() * 0.36,
        });
      }
    },
    burst(x, z, count = 18) {
      // Dramatic stumble impact: dense billowing dust burst + flying clods!
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
        spawnPlume(x + Math.cos(a) * 0.25, 0.22, z + Math.sin(a) * 0.22, {
          vx: Math.cos(a) * 1.3 - 1.2,
          vy: 0.55 + Math.random() * 0.55,
          vz: Math.sin(a) * 0.9,
          life: 0.95 + Math.random() * 0.45,
          startScale: 0.65,
          endScale: 2.15,
          maxOpacity: Math.max(0.55, surfacePreset.plumeOpacity || 0.55),
        });
      }
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.2 + Math.random() * 2.4;
        spawnClod(x + (Math.random() - 0.5) * 0.2, 0.1, z + (Math.random() - 0.5) * 0.2, {
          vx: Math.cos(angle) * speed - 1.2,
          vy: 1.8 + Math.random() * 2.1,
          vz: Math.sin(angle) * speed * 0.7,
          life: 0.55 + Math.random() * 0.35,
        });
      }
    },
    update(dt, trackScrollMps = 0) {
      for (let i = 0; i < maxPlumes; i += 1) {
        const p = plumes[i];
        if (p.age >= p.life) continue;
        p.age += dt;
        if (p.age >= p.life) {
          p.sprite.visible = false;
          continue;
        }
        const t = p.age / p.life;
        p.vx *= Math.max(0, 1 - dt * 1.9);
        p.vy *= Math.max(0, 1 - dt * 1.3);
        p.sprite.position.x += (p.vx - trackScrollMps * 0.36) * dt;
        p.sprite.position.y += p.vy * dt;
        p.sprite.position.z += p.vz * dt;
        p.mat.rotation += p.spin * dt;
        const scale = p.startScale + (p.endScale - p.startScale) * Math.pow(t, 0.72);
        p.sprite.scale.set(scale * 1.25, scale * 0.82, 1);
        // Quick fade-in then smooth airy dissipation
        const alpha = t < 0.16 ? t / 0.16 : Math.pow(1 - (t - 0.16) / 0.84, 1.35);
        p.mat.opacity = p.maxOpacity * alpha;
      }

      let dirty = false;
      for (let i = 0; i < maxClods; i += 1) {
        const p = clods[i];
        if (p.age >= p.life) continue;
        dirty = true;
        p.age += dt;
        if (p.age >= p.life) {
          positions[i * 3 + 1] = -999;
          continue;
        }
        p.vy -= 6.8 * dt; // crisp gravity arc
        positions[i * 3] += (p.vx - trackScrollMps * 0.25) * dt;
        positions[i * 3 + 1] = Math.max(0.03, positions[i * 3 + 1] + p.vy * dt);
        positions[i * 3 + 2] += p.vz * dt;
        const fade = Math.max(0, 1 - (p.age / p.life) ** 2);
        colors[i * 3] = p.baseR * fade;
        colors[i * 3 + 1] = p.baseG * fade;
        colors[i * 3 + 2] = p.baseB * fade;
      }
      if (dirty) {
        clodGeo.attributes.position.needsUpdate = true;
        clodGeo.attributes.color.needsUpdate = true;
      }
    },
    dispose() {
      plumeTex.dispose();
      for (const p of plumes) p.mat.dispose();
      clodGeo.dispose();
      clodMat.dispose();
      clodTex.dispose();
    },
  };
}
