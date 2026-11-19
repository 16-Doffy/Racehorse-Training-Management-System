import * as THREE from 'three';

/**
 * Procedural PBR textures (albedo map + bump/height map + roughness map), lawn infield,
 * distant treeline horizon, and hoof kickback particle system for the four racehorse training
 * surfaces: turf (cỏ), dirt (đất), sand (cát), and synthetic (tổng hợp / Polytrack).
 *
 * Zero external image downloads: everything is synthesized once per surface change in memory
 * and properly disposed on cleanup.
 */

export const SURFACE_PRESETS = {
  turf: {
    label: 'mặt cỏ',
    base: '#3d7933',
    light: '#529342',
    dark: '#2b5d24',
    bumpScale: 0.048,
    roughness: 0.92,
    dustColors: ['#4d7a36', '#6b553d', '#628f44'],
    dustSize: 0.54,
    dustRate: 0.85,
    dustLift: 1.05,
    railTopColor: '#f5f3ed',
    markerTopColor: '#f5f3ed',
  },
  dirt: {
    label: 'mặt đất',
    base: '#8c5d39',
    light: '#ad7a51',
    dark: '#5c381f',
    bumpScale: 0.085,
    roughness: 0.94,
    dustColors: ['#c2946a', '#ab7b52', '#d6b08a'],
    dustSize: 0.96,
    dustRate: 1.55,
    dustLift: 1.35,
    railTopColor: '#f5f3ed',
    markerTopColor: '#c62828',
  },
  sand: {
    label: 'mặt cát',
    base: '#d5bd8b',
    light: '#ebd7ab',
    dark: '#b39562',
    bumpScale: 0.072,
    roughness: 0.88,
    dustColors: ['#ebd5ac', '#dbc08e', '#f5e6c8'],
    dustSize: 0.78,
    dustRate: 1.45,
    dustLift: 1.45,
    railTopColor: '#f5f3ed',
    markerTopColor: '#d97706',
  },
  synthetic: {
    label: 'mặt tổng hợp',
    base: '#463f3d',
    light: '#605753',
    dark: '#2d2827',
    bumpScale: 0.055,
    roughness: 0.78,
    dustColors: ['#2e2928', '#453e3c', '#1e1b1a'],
    dustSize: 0.48,
    dustRate: 1.05,
    dustLift: 1.15,
    railTopColor: '#f8fafc',
    markerTopColor: '#dc2626',
  },
  pasture: {
    label: 'đồng cỏ',
    base: '#35672b',
    light: '#447d37',
    dark: '#29521f',
    bumpScale: 0.04,
    roughness: 0.95,
    dustColors: ['#4a7834', '#6b553d'],
    dustSize: 0.2,
    dustRate: 0.35,
    dustLift: 0.8,
    railTopColor: '#7a5636',
    markerTopColor: '#7a5636',
    grass: true,
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

function makeCanvas(size = 512) {
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
  tex.anisotropy = Math.min(8, anisotropy || 4);
  return tex;
}

/**
 * Generates synchronized albedo (`map`), height (`bumpMap`), and roughness (`roughnessMap`)
 * textures for a racehorse track surface. X runs along the track direction; Y runs across lanes.
 */
export function createSurfaceMaps(kind, maxAnisotropy = 8) {
  const key = SURFACE_PRESETS[kind] ? kind : 'dirt';
  const preset = SURFACE_PRESETS[key];
  const SIZE = 512;

  const albedoC = makeCanvas(SIZE);
  const bumpC = makeCanvas(SIZE);
  const roughC = makeCanvas(SIZE);

  const g = albedoC.getContext('2d');
  const bg = bumpC.getContext('2d');
  const rg = roughC.getContext('2d');
  const rnd = makeRng(key === 'turf' ? 19 : key === 'sand' ? 37 : key === 'synthetic' ? 53 : 23);

  // Neutral base fills
  g.fillStyle = preset.base;
  g.fillRect(0, 0, SIZE, SIZE);
  bg.fillStyle = '#808080';
  bg.fillRect(0, 0, SIZE, SIZE);
  rg.fillStyle = key === 'synthetic' ? '#b8b8b8' : key === 'sand' ? '#d8d8d8' : '#e0e0e0';
  rg.fillRect(0, 0, SIZE, SIZE);

  if (key === 'turf' || key === 'pasture') {
    // Mown lawn stripes along the track (subtle alternating shade + roughness sheen)
    if (key === 'turf') {
      const band = SIZE / 4;
      for (let i = 0; i < 4; i += 1) {
        if (i % 2 === 0) {
          g.fillStyle = 'rgba(130, 185, 88, 0.22)';
          g.fillRect(0, i * band, SIZE, band);
          rg.fillStyle = 'rgba(175, 175, 175, 0.35)';
          rg.fillRect(0, i * band, SIZE, band);
        } else {
          g.fillStyle = 'rgba(28, 66, 22, 0.16)';
          g.fillRect(0, i * band, SIZE, band);
        }
      }
      // Subtle worn running line along the inner rail
      const wear = g.createLinearGradient(0, 0, 0, SIZE * 0.45);
      wear.addColorStop(0, 'rgba(92, 74, 46, 0.24)');
      wear.addColorStop(1, 'rgba(92, 74, 46, 0)');
      g.fillStyle = wear;
      g.fillRect(0, 0, SIZE, SIZE * 0.45);
    }

    // Soft natural mottled patches
    for (let i = 0; i < 36; i += 1) {
      const x = rnd() * SIZE;
      const y = rnd() * SIZE;
      const rad = 22 + rnd() * 68;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, rnd() > 0.5 ? 'rgba(134,182,78,0.12)' : 'rgba(28,58,20,0.12)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }

    // Fine grass blades in albedo + bump
    const greens = ['#2e6125', '#468236', '#619e45', '#76af53'];
    for (let i = 0; i < 16000; i += 1) {
      const x = rnd() * SIZE;
      const y = rnd() * SIZE;
      const len = 3 + rnd() * 5;
      const dx = (rnd() - 0.5) * 2.4;
      g.strokeStyle = greens[i % greens.length];
      g.globalAlpha = 0.32 + rnd() * 0.42;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + dx, y - len);
      g.stroke();

      if (i % 3 === 0) {
        const shade = Math.round(105 + rnd() * 110);
        bg.strokeStyle = `rgb(${shade},${shade},${shade})`;
        bg.globalAlpha = 0.45;
        bg.beginPath();
        bg.moveTo(x, y);
        bg.lineTo(x + dx, y - len);
        bg.stroke();
      }
    }

    // Subtle hoof divots on turf
    if (key === 'turf') {
      for (let i = 0; i < 140; i += 1) {
        const x = rnd() * SIZE;
        const y = Math.pow(rnd(), 1.4) * SIZE * 0.75;
        g.fillStyle = 'rgba(72, 54, 34, 0.32)';
        g.beginPath();
        g.ellipse(x, y, 3.2, 2.0, (rnd() - 0.5) * 0.3, 0, Math.PI * 2);
        g.fill();
        bg.fillStyle = 'rgba(40, 40, 40, 0.55)';
        bg.beginPath();
        bg.ellipse(x, y, 3.2, 2.0, 0, 0, Math.PI * 2);
        bg.fill();
      }
    }
  } else if (key === 'dirt') {
    // Darker damp compacted inner racing strip fading out toward outer rail
    const lane = g.createLinearGradient(0, 0, 0, SIZE);
    lane.addColorStop(0, 'rgba(64, 36, 18, 0.44)');
    lane.addColorStop(0.45, 'rgba(68, 38, 20, 0.16)');
    lane.addColorStop(1, 'rgba(182, 134, 92, 0.08)');
    g.fillStyle = lane;
    g.fillRect(0, 0, SIZE, SIZE);

    // Roughness: inner damp lane slightly smoother than dry loose outer loam
    const laneRough = rg.createLinearGradient(0, 0, 0, SIZE);
    laneRough.addColorStop(0, '#c2c2c2');
    laneRough.addColorStop(0.5, '#dcdcdc');
    laneRough.addColorStop(1, '#f0f0f0');
    rg.fillStyle = laneRough;
    rg.fillRect(0, 0, SIZE, SIZE);

    // Rich loam granular clods & pebbles
    for (let i = 0; i < 15000; i += 1) {
      const x = rnd() * SIZE;
      const y = rnd() * SIZE;
      const s = 0.8 + rnd() * 2.1;
      const light = rnd() > 0.5;
      g.fillStyle = light ? preset.light : preset.dark;
      g.globalAlpha = 0.18 + rnd() * 0.34;
      g.fillRect(x, y, s, s);
      if (i % 2 === 0) {
        const b = light ? 175 : 82;
        bg.fillStyle = `rgb(${b},${b},${b})`;
        bg.globalAlpha = 0.32;
        bg.fillRect(x, y, s + 0.5, s + 0.5);
      }
    }

    // Parallel harrow rake grooves along the running direction (X) — unmistakable dirt track look
    for (let y = 5; y < SIZE; y += 11) {
      const wobble = (rnd() - 0.5) * 1.4;
      // Groove trough (dark in albedo & bump)
      g.strokeStyle = '#4c2c16';
      g.globalAlpha = 0.32;
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(0, y + wobble);
      for (let x = 32; x <= SIZE; x += 32) g.lineTo(x, y + (rnd() - 0.5) * 1.6);
      g.stroke();

      bg.strokeStyle = '#383838';
      bg.globalAlpha = 0.65;
      bg.lineWidth = 2.6;
      bg.beginPath();
      bg.moveTo(0, y + wobble);
      bg.lineTo(SIZE, y + wobble);
      bg.stroke();

      // Adjacent ridge highlight
      bg.strokeStyle = '#d4d4d4';
      bg.globalAlpha = 0.45;
      bg.lineWidth = 1.6;
      bg.beginPath();
      bg.moveTo(0, y + wobble + 2.4);
      bg.lineTo(SIZE, y + wobble + 2.4);
      bg.stroke();
    }

    // Crescent hoof prints concentrated along active lanes
    for (let i = 0; i < 420; i += 1) {
      const y = Math.pow(rnd(), 1.55) * SIZE;
      const x = rnd() * SIZE;
      g.globalAlpha = 0.42;
      g.fillStyle = '#3b2110';
      g.beginPath();
      g.ellipse(x, y, 3.6, 2.4, 0, Math.PI * 0.16, Math.PI * 1.84);
      g.fill();

      bg.globalAlpha = 0.72;
      bg.fillStyle = '#242424';
      bg.beginPath();
      bg.ellipse(x, y, 3.6, 2.4, 0, Math.PI * 0.16, Math.PI * 1.84);
      bg.fill();
    }
  } else if (key === 'sand') {
    // Subtle sunlit warmth bands
    const grad = g.createLinearGradient(0, 0, 0, SIZE);
    grad.addColorStop(0, 'rgba(166, 132, 78, 0.22)');
    grad.addColorStop(0.5, 'rgba(245, 228, 188, 0.12)');
    grad.addColorStop(1, 'rgba(176, 144, 92, 0.18)');
    g.fillStyle = grad;
    g.fillRect(0, 0, SIZE, SIZE);

    // Sinusoidal wind-blown sand ripples across the track (creates crisp bump relief!)
    for (let x = 0; x < SIZE; x += 16) {
      g.strokeStyle = '#ab8e5c';
      g.globalAlpha = 0.24;
      g.lineWidth = 2.6;
      g.beginPath();
      for (let y = 0; y <= SIZE; y += 16) {
        const px = x + Math.sin((y / SIZE) * Math.PI * 4) * 5.5;
        if (y === 0) g.moveTo(px, y);
        else g.lineTo(px, y);
      }
      g.stroke();

      bg.strokeStyle = '#484848';
      bg.globalAlpha = 0.65;
      bg.lineWidth = 3.5;
      bg.beginPath();
      for (let y = 0; y <= SIZE; y += 16) {
        const px = x + Math.sin((y / SIZE) * Math.PI * 4) * 5.5;
        if (y === 0) bg.moveTo(px, y);
        else bg.lineTo(px, y);
      }
      bg.stroke();

      bg.strokeStyle = '#dadada';
      bg.globalAlpha = 0.55;
      bg.lineWidth = 2.4;
      bg.beginPath();
      for (let y = 0; y <= SIZE; y += 16) {
        const px = x + 3.2 + Math.sin((y / SIZE) * Math.PI * 4) * 5.5;
        if (y === 0) bg.moveTo(px, y);
        else bg.lineTo(px, y);
      }
      bg.stroke();
    }

    // Fine sand grains + sparkling quartz micro-roughness flecks
    for (let i = 0; i < 16000; i += 1) {
      const x = rnd() * SIZE;
      const y = rnd() * SIZE;
      const s = 0.8 + rnd() * 1.5;
      g.fillStyle = rnd() > 0.45 ? preset.light : preset.dark;
      g.globalAlpha = 0.2 + rnd() * 0.34;
      g.fillRect(x, y, s, s);

      // Tiny quartz crystal glints in roughnessMap (low roughness = bright specular dot)
      if (i % 9 === 0) {
        rg.fillStyle = '#5c5c5c';
        rg.globalAlpha = 0.7;
        rg.fillRect(x, y, 1.3, 1.3);
      }
    }

    // Soft depressed hoof craters in deep sand
    for (let i = 0; i < 260; i += 1) {
      const x = rnd() * SIZE;
      const y = rnd() * SIZE;
      g.globalAlpha = 0.26;
      g.fillStyle = '#9c7e4c';
      g.beginPath();
      g.ellipse(x, y, 4.4, 3.0, 0, 0, Math.PI * 2);
      g.fill();

      bg.globalAlpha = 0.65;
      bg.fillStyle = '#2d2d2d';
      bg.beginPath();
      bg.ellipse(x, y, 4.4, 3.0, 0, 0, Math.PI * 2);
      bg.fill();
    }
  } else if (key === 'synthetic') {
    // Waxed Polytrack: dark charcoal-cocoa rubber & polypropylene fiber weave with subtle satin lanes
    const sheen = rg.createLinearGradient(0, 0, 0, SIZE);
    sheen.addColorStop(0, '#969696');
    sheen.addColorStop(0.5, '#b8b8b8');
    sheen.addColorStop(1, '#a4a4a4');
    rg.fillStyle = sheen;
    rg.fillRect(0, 0, SIZE, SIZE);

    // Subtle groomed roller bands along track
    for (let y = 0; y < SIZE; y += 32) {
      g.fillStyle = y % 64 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)';
      g.fillRect(0, y, SIZE, 16);
    }

    // Crumb rubber granules & micro-fiber filaments
    for (let i = 0; i < 18000; i += 1) {
      const x = rnd() * SIZE;
      const y = rnd() * SIZE;
      const isFibre = i % 3 === 0;
      g.fillStyle = rnd() > 0.5 ? preset.light : preset.dark;
      g.globalAlpha = 0.24 + rnd() * 0.36;
      if (isFibre) {
        g.fillRect(x, y, 3.5 + rnd() * 5.5, 0.85);
        bg.fillStyle = rnd() > 0.5 ? '#b4b4b4' : '#585858';
        bg.globalAlpha = 0.45;
        bg.fillRect(x, y, 3.5 + rnd() * 4.5, 1.0);
      } else {
        const s = 1 + rnd() * 1.8;
        g.fillRect(x, y, s, s);
        bg.fillStyle = rnd() > 0.5 ? '#c6c6c6' : '#424242';
        bg.globalAlpha = 0.4;
        bg.fillRect(x, y, s, s);
      }
      if (i % 7 === 0) {
        // Subtle waxed rubber sheen variation
        rg.fillStyle = rnd() > 0.5 ? '#888888' : '#cccccc';
        rg.globalAlpha = 0.45;
        rg.fillRect(x, y, 2, 2);
      }
    }

    // Subtle crisp dark hoof compression marks
    for (let i = 0; i < 220; i += 1) {
      const x = rnd() * SIZE;
      const y = Math.pow(rnd(), 1.4) * SIZE;
      g.globalAlpha = 0.3;
      g.fillStyle = '#1c1817';
      g.beginPath();
      g.ellipse(x, y, 3.2, 2.2, 0, 0, Math.PI * 2);
      g.fill();
      bg.globalAlpha = 0.5;
      bg.fillStyle = '#383838';
      bg.beginPath();
      bg.ellipse(x, y, 3.2, 2.2, 0, 0, Math.PI * 2);
      bg.fill();
    }
  }

  g.globalAlpha = 1;
  bg.globalAlpha = 1;
  rg.globalAlpha = 1;

  const map = configureTexture(albedoC, { color: true, anisotropy: maxAnisotropy });
  const bumpMap = configureTexture(bumpC, { color: false, anisotropy: maxAnisotropy });
  const roughnessMap = configureTexture(roughC, { color: false, anisotropy: maxAnisotropy });

  return {
    map,
    bumpMap,
    roughnessMap,
    preset,
    setRepeat(rx, ry) {
      map.repeat.set(rx, ry);
      bumpMap.repeat.set(rx, ry);
      roughnessMap.repeat.set(rx, ry);
    },
    setOffsetX(ox) {
      map.offset.x = ox;
      bumpMap.offset.x = ox;
      roughnessMap.offset.x = ox;
    },
    dispose() {
      map.dispose();
      bumpMap.dispose();
      roughnessMap.dispose();
    },
  };
}

/** Textured mown emerald infield grass (replaces flat single-color green plane behind the rail). */
export function createInfieldTexture(maxAnisotropy = 8) {
  const SIZE = 512;
  const c = makeCanvas(SIZE);
  const g = c.getContext('2d');
  const rnd = makeRng(71);

  g.fillStyle = '#487a34';
  g.fillRect(0, 0, SIZE, SIZE);

  // Broad subtle stadium mowing stripes
  for (let i = 0; i < 8; i += 1) {
    if (i % 2 === 0) {
      g.fillStyle = 'rgba(130, 185, 86, 0.14)';
      g.fillRect(0, i * (SIZE / 8), SIZE, SIZE / 8);
    }
  }

  const blades = ['#376326', '#568c3d', '#6fa34b'];
  for (let i = 0; i < 11000; i += 1) {
    g.strokeStyle = blades[i % 3];
    g.globalAlpha = 0.3 + rnd() * 0.35;
    const x = rnd() * SIZE;
    const y = rnd() * SIZE;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 2, y - 2 - rnd() * 3);
    g.lineWidth = 1;
    g.stroke();
  }
  g.globalAlpha = 1;
  return configureTexture(c, { color: true, anisotropy: maxAnisotropy });
}

/**
 * Distant soft treeline & low rolling hillside band placed behind the infield (`z = -24`),
 * giving authentic equestrian club horizon depth without hurting frame rate (2 lightweight meshes).
 */
export function createTreelineBackdrop(length = 96) {
  const group = new THREE.Group();

  const w = 1024;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const rnd = makeRng(91);

  // Far misty hillside ridge
  g.fillStyle = 'rgba(72, 108, 76, 0.72)';
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 12) {
    const ridge = h * 0.52 + Math.sin((x / w) * Math.PI * 4) * 14 + Math.sin((x / w) * Math.PI * 10) * 6;
    g.lineTo(x, ridge);
  }
  g.lineTo(w, h);
  g.closePath();
  g.fill();

  // Organic layered foliage silhouette (hundreds of small dabs instead of big geometric circles)
  const tones = ['#2c5326', '#36642d', '#427535', '#254720'];
  for (let i = 0; i < 420; i += 1) {
    const x = rnd() * w;
    const base = h * 0.68 + Math.sin((x / w) * Math.PI * 6) * 10;
    const y = base - rnd() * 44;
    const rx = 6 + rnd() * 14;
    const ry = 5 + rnd() * 11;
    g.fillStyle = tones[i % tones.length];
    g.globalAlpha = 0.78 + rnd() * 0.22;
    g.beginPath();
    g.ellipse(x, y, rx, ry, (rnd() - 0.5) * 0.4, 0, Math.PI * 2);
    g.fill();
  }
  // Fill solid dark woodland base under crowns so no sky peeks underneath
  g.globalAlpha = 1;
  g.fillStyle = '#274a22';
  g.fillRect(0, h * 0.74, w, h * 0.26);

  // Subtle top foliage sunlight highlights
  for (let i = 0; i < 220; i += 1) {
    const x = rnd() * w;
    const y = h * 0.54 + rnd() * 34;
    g.fillStyle = 'rgba(138, 182, 88, 0.22)';
    g.beginPath();
    g.ellipse(x, y, 4 + rnd() * 7, 3 + rnd() * 5, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Soft ground fade at bottom edge
  const baseShade = g.createLinearGradient(0, h - 24, 0, h);
  baseShade.addColorStop(0, 'rgba(30, 56, 24, 0)');
  baseShade.addColorStop(1, 'rgba(30, 56, 24, 0.42)');
  g.fillStyle = baseShade;
  g.fillRect(0, h - 24, w, 24);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(length, 7.6), mat);
  wall.position.set(0, 3.4, -25);
  group.add(wall);

  return {
    group,
    setOffsetX(ox) {
      tex.offset.x = ox;
    },
    dispose() {
      tex.dispose();
      mat.dispose();
      wall.geometry.dispose();
    },
  };
}

function makePuffTexture() {
  const c = makeCanvas(64);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.88)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Lightweight zero-allocation hoof kickback particle pool (`THREE.Points`):
 * emits dust plumes (dirt), sand spray (sand), turf clods (turf), or rubber flecks (synthetic)
 * proportional to running speed, plus burst plumes when a horse stumbles.
 */
export function createHoofParticles(maxCount = 96) {
  const positions = new Float32Array(maxCount * 3);
  const colors = new Float32Array(maxCount * 3);
  const meta = Array.from({ length: maxCount }, () => ({
    age: 99,
    life: 1,
    vx: 0,
    vy: 0,
    vz: 0,
    baseR: 0.7,
    baseG: 0.55,
    baseB: 0.4,
  }));

  for (let i = 0; i < maxCount; i += 1) {
    positions[i * 3 + 1] = -999; // parked out of sight until spawned
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const map = makePuffTexture();
  const material = new THREE.PointsMaterial({
    size: 0.85,
    map,
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  let cursor = 0;
  let surfacePreset = SURFACE_PRESETS.dirt;
  const tmpColor = new THREE.Color();

  const spawn = (x, y, z, { vx = -2, vy = 0.9, vz = 0, life = 0.75, colorHex = null } = {}) => {
    const idx = cursor;
    cursor = (cursor + 1) % maxCount;
    const p = meta[idx];
    const palette = surfacePreset.dustColors || SURFACE_PRESETS.dirt.dustColors;
    tmpColor.set(colorHex || palette[idx % palette.length]);
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
    points,
    setSurface(kind) {
      surfacePreset = SURFACE_PRESETS[kind] || SURFACE_PRESETS.dirt;
      material.size = surfacePreset.dustSize;
    },
    emitForHorse(x, z, kmh, dt) {
      if (kmh < 6) return;
      const intensity = Math.min(1.5, (kmh - 5) / 38) * (surfacePreset.dustRate || 1);
      const count = Math.floor(intensity * dt * 26 + (Math.random() < intensity * dt * 26 % 1 ? 1 : 0));
      const mps = kmh / 3.6;
      for (let i = 0; i < count; i += 1) {
        const rear = Math.random() > 0.35;
        const px = x + (rear ? -0.62 : 0.42) + (Math.random() - 0.5) * 0.34;
        const pz = z + (Math.random() - 0.5) * 0.32;
        spawn(px, 0.06 + Math.random() * 0.08, pz, {
          vx: -mps * (0.45 + Math.random() * 0.35),
          vy: (0.45 + Math.random() * 0.95) * (surfacePreset.dustLift || 1) * Math.min(1.3, kmh / 35),
          vz: (Math.random() - 0.5) * 0.55,
          life: 0.45 + Math.random() * 0.45,
        });
      }
    },
    burst(x, z, count = 14) {
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * 2.2;
        spawn(x + (Math.random() - 0.5) * 0.25, 0.08 + Math.random() * 0.1, z + (Math.random() - 0.5) * 0.25, {
          vx: Math.cos(angle) * speed - 1.4,
          vy: 0.9 + Math.random() * 1.4,
          vz: Math.sin(angle) * speed * 0.65,
          life: 0.65 + Math.random() * 0.55,
        });
      }
    },
    update(dt, trackScrollMps = 0) {
      let dirty = false;
      for (let i = 0; i < maxCount; i += 1) {
        const p = meta[i];
        if (p.age >= p.life) continue;
        dirty = true;
        p.age += dt;
        if (p.age >= p.life) {
          positions[i * 3 + 1] = -999;
          continue;
        }
        const t = p.age / p.life;
        // Drag + gentle upward float then gravity settle
        p.vx *= Math.max(0, 1 - dt * 2.2);
        p.vy -= 1.65 * dt;
        positions[i * 3] += (p.vx - trackScrollMps * 0.35) * dt;
        positions[i * 3 + 1] = Math.max(0.03, positions[i * 3 + 1] + p.vy * dt);
        positions[i * 3 + 2] += p.vz * dt;
        // Fade brightness gently as puff dissipates
        const fade = Math.max(0, 1 - t * t);
        colors[i * 3] = p.baseR * fade;
        colors[i * 3 + 1] = p.baseG * fade;
        colors[i * 3 + 2] = p.baseB * fade;
      }
      if (dirty) {
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      map.dispose();
    },
  };
}
