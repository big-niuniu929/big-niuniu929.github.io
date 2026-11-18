/* ---------------------------------------------------------------
   planets-bg —— 阅读页背景里的那颗星
   ---------------------------------------------------------------
   入口页的地球由 js/orbital.js 提供（门厅 → 展厅那一套运镜）。
   正文页原来只有一张静态地球 WebP，后来换成一串跟着滚动切换的行星，
   现在按他的要求改成：

     · 每个子页面一颗专属天体（地球 / 月球 / 火星 / 木星 / 水星 /
       海王星 / 金星 / 土星），滚动到底也不会换；
     · 每颗星的轨迹单独写：从左下方浮起、从右缘斜切、几乎不动地缓慢
       逼近……方向和鼓出幅度都不一样，不再是同一条线；
     · 明显更大：缩放到 1.5–2.8 倍，最靠近时直径接近一屏高，
       只留一半在画面里，压得住版面但不压住正文（内容在左 2/3）；
     · 一直自转；地球带云层与夜面城市灯，土星带环，火星有极冠。

   取舍：
   - 灯光、材质、夜景遮罩的数值都取 ORBITAL 压缩包原值，不另调
   - 贴图 2K（site/vendor/textures/ 与 planets/，单页只加载一颗）
   - 球段 96×64、pixelRatio 上限 1.5
   - 页面隐藏时 rAF 自动停；prefers-reduced-motion 时只画静态一帧
   - WebGL 不可用 / 贴图失败 / 窄屏：直接不挂载，保留 CSS 静态背景
   - 自查抓手：window.__orbitBg

   素材署名：行星影像 © Solar System Scope，CC BY 4.0（见 vendor/CREDITS.md）
   --------------------------------------------------------------- */
import * as THREE from '../vendor/build/three.module.js';

const TEX = new URL('../vendor/textures/', import.meta.url);
const TEXP = new URL('../vendor/textures/planets/', import.meta.url);

/* 太阳方向：与压缩包同族（左前方偏上）。z 留在 0.4 上下，
   让可见半球七成是白天、右侧边缘落到夜侧。 */
const SUN_FRONT = new THREE.Vector3(-0.72, 0.24, 0.42).normalize();
/* 地球用"背面来光"：可见半球大半是夜面，城市灯才亮得起来；
   其他天体没有夜景贴图，给正面来光，把云带/极冠照出来。 */
const SUN_NIGHT = new THREE.Vector3(-0.62, 0.26, -0.52).normalize();
/* ---- 章节 → 光照情绪 ----
   滚动到哪一节，光就从哪个方向来；这是叙事的一部分，不只是背景在动：
   讲「问题 / 约束」时光退到侧后（看不清），讲「结果」时光几乎正打（最亮），
   讲「没做到的部分」时太阳绕到背后（同一颗星只剩一圈冷边）。 */
const MOODS = {
  proof:       { sun: [-0.10, 0.34, 0.94], spin: 1.00, opacity: 0.90 },
  problem:     { sun: [-0.58, 0.22, 0.76], spin: 0.85, opacity: 0.82 },
  constraints: { sun: [-0.74, 0.18, 0.62], spin: 0.80, opacity: 0.78 },
  role:        { sun: [0.20, 0.30, 0.93], spin: 1.00, opacity: 0.90 },
  approach:    { sun: [0.46, 0.26, 0.85], spin: 1.05, opacity: 0.92 },
  hardest:     { sun: [0.96, 0.30, 0.10], spin: 0.70, opacity: 0.88 },
  results:     { sun: [0.08, 0.20, 0.98], spin: 1.35, opacity: 0.96 },
  mistakes:    { sun: [-0.60, 0.26, -0.62], spin: 0.55, opacity: 0.72 }
};

const ROTATION = 0.055;      // 弧度/秒
const CLOUD_BOOST = 1.14;

/* ---- 天体清单：只放贴图与材质参数 ---- */
const BODIES = {
  earth: {
    label: '地球', base: TEX, radius: 1, spin: 1.0, sun: SUN_NIGHT,
    map: 'earth_atmos.jpg', night: 'earth_lights.png', clouds: 'earth_clouds.png',
    normal: 'earth_normal.jpg', specular: 'earth_specular.jpg',
    atmosphere: 0x4F86D8, atmosphereScale: 1.02, tilt: 0.41
  },
  moon: {
    label: '月球', base: TEXP, radius: 0.98, spin: 0.55,
    map: 'moon.jpg', atmosphere: 0x6C757D, atmosphereScale: 1.008, atmosphereStrength: 0.35, tilt: 0.1
  },
  mars: {
    label: '火星', base: TEXP, radius: 0.94, spin: 1.15,
    map: 'mars.jpg', atmosphere: 0x8C4A2A, atmosphereScale: 1.014, tilt: 0.44
  },
  jupiter: {
    label: '木星', base: TEXP, radius: 1.06, spin: 1.5,
    map: 'jupiter.jpg', atmosphere: 0xC0A88A, atmosphereScale: 1.012, tilt: 0.05
  },
  saturn: {
    label: '土星', base: TEXP, radius: 1, spin: 1.35,
    map: 'saturn.jpg', ring: 'saturn-ring.png', ringInner: 1.28, ringOuter: 2.24,
    atmosphere: 0xC9B58E, atmosphereScale: 1.012, tilt: 0.47
  },
  neptune: {
    label: '海王星', base: TEXP, radius: 0.95, spin: 1.2,
    map: 'neptune.jpg', atmosphere: 0x3D6BD6, atmosphereScale: 1.016, tilt: 0.1
  },
  mercury: {
    label: '水星', base: TEXP, radius: 0.9, spin: 0.75,
    map: 'mercury.jpg', atmosphere: 0x7A7267, atmosphereScale: 1.006, atmosphereStrength: 0.28, tilt: 0.02
  },
  venus: {
    label: '金星', base: TEXP, radius: 0.97, spin: 0.6,
    map: 'venus.jpg', atmosphere: 0xD8B06A, atmosphereScale: 1.02, atmosphereStrength: 1.15, tilt: 0.06
  },

  /* ---- 太阳系之外：贴图由 tools/make_planets.py 程序化生成 ----
     人类对系外行星只有光谱和零星光点，没有真正的等距圆柱贴图；
     这批是"如果它长这样"的想象图，本体属于我们自己画的，
     不涉及第三方版权，也不需要署名（区别于上面的 NASA / SSS 贴图）。 */
  ice_world: {
    label: '冰封世界', base: TEXP, radius: 0.96, spin: 0.8,
    map: 'ice_world.jpg', atmosphere: 0x9FC6E6, atmosphereScale: 1.02, tilt: 0.24
  },
  verdant_world: {
    label: '翠海世界', base: TEXP, radius: 0.99, spin: 1.05,
    map: 'verdant_world.jpg', atmosphere: 0x4FD6C4, atmosphereScale: 1.018, tilt: 0.16
  },
  ember_world: {
    label: '熔核世界', base: TEXP, radius: 0.97, spin: 0.9,
    map: 'ember_world.jpg', night: 'ember-glow.jpg', emissive: 0xFF7A28, glowMode: 'all',
    atmosphere: 0xFF8A4A, atmosphereScale: 1.016, atmosphereStrength: 0.9, tilt: 0.12
  },
  violet_giant: {
    label: '紫霭巨星', base: TEXP, radius: 1.02, spin: 1.45,
    map: 'violet_giant.jpg', atmosphere: 0xB08CE0, atmosphereScale: 1.014, tilt: 0.08
  },
  ochre_world: {
    label: '赭岩世界', base: TEXP, radius: 0.95, spin: 0.7,
    map: 'ochre_world.jpg', atmosphere: 0xC89A62, atmosphereScale: 1.012, atmosphereStrength: 0.7, tilt: 0.3
  }
};

/* ---- 页面 → 天体 + 专属轨迹 ----
   path：二次贝塞尔，坐标是"半屏"为单位的归一化值；
   scale：[起点, 终点]；x 控制在 0.68–1.08（右侧三分之一），
   星球最靠近时有半个身子越过画面右缘，形成"压过来"的体量感。 */
const PAGES = {
  /* 每页一颗星。path = 三个控制点（x 以半个视口宽为单位，y 以半个视口高为单位），
     起点在右侧出血、中段压到中右、末段继续往左下沉——不要让八页都停在同一条竖线上。 */
  'portfolio.html':        { key: 'earth',         path: [[1.10, 0.42], [0.98, 0.04], [0.78, -0.34]], scale: [1.50, 2.75] },
  'work/weiguang.html':    { side: 'left', key: 'moon',          path: [[-1.02, -0.58], [-1.00, -0.04], [-0.74, 0.46]], scale: [1.55, 2.55] },
  'work/price-patrol.html':{ key: 'mars',          path: [[1.06, 0.60], [0.88, 0.12], [0.54, -0.44]], scale: [1.70, 2.90] },
  'work/cs-quality.html':  { key: 'jupiter',       path: [[1.00, 0.10], [0.86, 0.02], [0.48, -0.16]], scale: [2.10, 3.05] },
  'work/jianhe.html':      { side: 'left', key: 'ice_world',     path: [[-1.00, 0.46], [-1.04, -0.02], [-0.70, -0.40]], scale: [1.45, 2.35] },
  'work/pdd-store.html':   { key: 'verdant_world', path: [[0.96, -0.66], [0.94, -0.12], [0.60, 0.46]], scale: [1.50, 2.55] },
  'work/gym-bd.html':      { side: 'left', key: 'ember_world',   path: [[-1.10, -0.28], [-0.98, 0.14], [-0.64, 0.36]], scale: [1.60, 2.45] },
  'method.html':           { key: 'saturn',        path: [[1.06, 0.52], [0.90, 0.02], [0.56, -0.52]], scale: [1.85, 2.90] }
};

const FALLBACK = { key: 'earth', path: [[1.08, 0.34], [0.94, 0.02], [0.72, -0.36]], scale: [1.35, 2.45] };

function pickPage() {
  let p = '';
  try { p = decodeURIComponent(location.pathname); } catch (error) { p = location.pathname; }
  p = p.replace(/^\/+/, '');
  if (!p || p === 'index.html') { return null; }
  if (PAGES[p]) { return PAGES[p]; }
  const tail = p.split('/').slice(-2).join('/');
  if (PAGES[tail]) { return PAGES[tail]; }
  const last = p.split('/').pop();
  return PAGES[last] || FALLBACK;
}

function curvePoint(path, p, out) {
  const t = Math.min(1, Math.max(0, p));
  const u = 1 - t;
  out.x = u * u * path[0][0] + 2 * u * t * path[1][0] + t * t * path[2][0];
  out.y = u * u * path[0][1] + 2 * u * t * path[1][1] + t * t * path[2][1];
  return out;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function mount(root, fallbackEl, options = {}) {
  if (!root) { return null; }

  const page = pickPage();
  if (!page) { return null; }
  if (page.side === 'left') { root.classList.add('is-left'); }
  const spec = BODIES[page.key];
  if (!spec) { return null; }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (error) {
    return null;
  }

  const reduce = Boolean(options.reduce);
  const canvas = renderer.domElement;
  canvas.className = 'space-bg__planets';
  root.appendChild(canvas);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);

  /* ---- 灯光：ORBITAL 压缩包原值 ---- */
  const sunDir = spec.sun || SUN_FRONT;
  /* 叙事光照：只有带 case-sec 章节的案例页才启用，其它页面保持天体默认方向 */
  const sections = Array.prototype.slice.call(document.querySelectorAll(".case-sec[id]"));
  const moodTarget = new THREE.Vector3().copy(sunDir);
  const moodNow = new THREE.Vector3().copy(sunDir);
  let activeMood = "";
  let moodSpin = 1;
  let moodSpinTarget = 1;
  let moodAlpha = options.opacity || 0.9;
  let moodAlphaTarget = moodAlpha;

  function readMood() {
    if (!sections.length) { return; }
    const line = window.innerHeight * 0.38;
    let current = sections[0];
    for (let i = 0; i < sections.length; i += 1) {
      if (sections[i].getBoundingClientRect().top <= line) { current = sections[i]; } else { break; }
    }
    const id = current.id;
    if (id === activeMood) { return; }
    const mood = MOODS[id];
    if (!mood) { return; }
    activeMood = id;
    moodTarget.set(mood.sun[0], mood.sun[1], mood.sun[2]).normalize();
    moodSpinTarget = mood.spin == null ? 1 : mood.spin;
    moodAlphaTarget = mood.opacity == null ? (options.opacity || 0.9) : mood.opacity;
  }
  const uSunView = { value: new THREE.Vector3() };
  scene.add(new THREE.AmbientLight(0x1B2A52, 1.1));
  const sun = new THREE.DirectionalLight(0xFFF1DC, 4.1);
  sun.position.copy(sunDir).multiplyScalar(20);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x4A78FF, 0.55);
  fill.position.set(6, -2, 3);
  scene.add(fill);

  const loader = new THREE.TextureLoader();
  const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);

  function loadTexture(name, srgb) {
    if (!name) { return Promise.resolve(null); }
    return loader.loadAsync(new URL(name, spec.base).href).then((texture) => {
      texture.anisotropy = maxAniso;
      if (srgb) { texture.colorSpace = THREE.SRGBColorSpace; }
      return texture;
    }).catch(() => null);
  }

  /* ---- 天体 ---- */
  const group = new THREE.Group();
  group.visible = false;
  group.rotation.z = spec.tilt || 0;
  scene.add(group);

  const material = new THREE.MeshPhongMaterial({
    color: 0x1a2334,
    specular: new THREE.Color(0x101D2B),
    shininess: 400,
    transparent: true,
    opacity: 0
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(spec.radius, 96, 64), material);
  group.add(mesh);

  /* ---- 大气边缘光（压缩包同一套 fresnel 思路） ---- */
  const atmosphere = (function makeAtmosphere(radius, color, strength) {
    const uniforms = {
      uColor: { value: new THREE.Color(color) },
      uSun: uSunView,
      uStrength: { value: strength == null ? 1 : strength }
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: [
        'varying vec3 vNormalView;',
        'varying vec3 vViewDir;',
        'void main() {',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vNormalView = normalize(normalMatrix * normal);',
        '  vViewDir = normalize(-mv.xyz);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor;',
        'uniform vec3 uSun;',
        'uniform float uStrength;',
        'varying vec3 vNormalView;',
        'varying vec3 vViewDir;',
        'void main() {',
        '  float fres = 1.0 - max(dot(normalize(vNormalView), normalize(vViewDir)), 0.0);',
        '  fres = pow(fres, 2.6);',
        '  float sunSide = smoothstep(-0.35, 0.55, dot(normalize(vNormalView), normalize(uSun)));',
        '  float glow = fres * (0.18 + 1.05 * sunSide) * uStrength;',
        '  gl_FragColor = vec4(uColor * glow, glow * 0.9);',
        '}'
      ].join('\n')
    });
    return new THREE.Mesh(
      new THREE.SphereGeometry(radius * (spec.atmosphereScale || 1.02), 64, 48),
      mat
    );
  })(spec.radius, spec.atmosphere || 0x4F86D8, spec.atmosphereStrength);
  group.add(atmosphere);

  /* 地球夜景：只在有夜间贴图时注入 */
  if (spec.night) {
    const glowAll = spec.glowMode === 'all';
    const maskLines = glowAll
      ? 'float sunDot = dot(normalize(vNormal), normalize(uSunView));\n' +
        'float glowMask = 0.30 + 0.62 * smoothstep(-0.92, 0.72, sunDot);\n'
      : 'float sunDot = dot(normalize(vNormal), normalize(uSunView));\n' +
        'float nightMask = 1.0 - smoothstep(-0.34, 0.12, sunDot);\n' +
        'float glowMask = nightMask * 2.6;\n';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uSunView = uSunView;
      shader.fragmentShader = 'uniform vec3 uSunView;\n' + shader.fragmentShader
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n' + maskLines + 'totalEmissiveRadiance *= glowMask;'
        )
        .replace(
          '#include <dithering_fragment>',
          '#include <dithering_fragment>\n' +
          (glowAll ? '' : 'gl_FragColor.rgb += vec3(0.020, 0.034, 0.058) * nightMask;')
        );
    };
  }

  /* ---- 极淡的轨道线 ---- */
  const orbitLine = (function buildOrbitLine() {
    const pts = [];
    const v = { x: 0, y: 0 };
    for (let i = 0; i <= 80; i += 1) {
      curvePoint(page.path, i / 80, v);
      pts.push(new THREE.Vector3(v.x * 3.6, v.y * 2.2, -2.2));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x9BC5F3, transparent: true, opacity: 0.06, depthWrite: false })
    );
    scene.add(line);
    return line;
  })();
  orbitLine.visible = !options.hideOrbit;

  let loaded = false;
  let clouds = null;
  let ring = null;

  Promise.all([
    loadTexture(spec.map, true),
    loadTexture(spec.night, true),
    loadTexture(spec.clouds, true),
    loadTexture(spec.normal, false),
    loadTexture(spec.specular, false),
    loadTexture(spec.ring, true)
  ]).then(([map, night, cloudMap, normal, specularMap, ringAlpha]) => {
    if (!map) { return; }
    loaded = true;

    material.map = map;
    if (normal) { material.normalMap = normal; material.normalScale = new THREE.Vector2(1.2, 1.2); }
    if (specularMap) { material.specularMap = specularMap; }
    if (night) {
      material.emissiveMap = night;
      material.emissive = new THREE.Color(spec.emissive || 0xFFCC88);
      material.emissiveIntensity = spec.glowMode === 'all' ? 0.95 : 1.0;
    }
    material.color.set(0xffffff);
    material.opacity = 1;
    material.needsUpdate = true;

    if (cloudMap) {
      clouds = new THREE.Mesh(
        new THREE.SphereGeometry(spec.radius * 1.006, 80, 54),
        new THREE.MeshPhongMaterial({
          map: cloudMap, transparent: true, opacity: 0.88, depthWrite: false,
          shininess: 4, specular: new THREE.Color(0x0A1420)
        })
      );
      group.add(clouds);
    }

    /* 土星环：把条状 alpha 贴图沿半径映射 */
    if (ringAlpha) {
      const inner = spec.ringInner || 1.3;
      const outer = spec.ringOuter || 2.2;
      const geometry = new THREE.RingGeometry(inner, outer, 160, 1);
      const pos = geometry.attributes.position;
      const uv = geometry.attributes.uv;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i);
        const t = (v.length() - inner) / (outer - inner);
        uv.setXY(i, Math.min(1, Math.max(0, t)), 0.5);
      }
      ring = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        map: ringAlpha, transparent: true, opacity: 1,
        side: THREE.DoubleSide, depthWrite: false
      }));
      ring.rotation.x = Math.PI / 2 - 0.66;
      group.add(ring);
    }

    group.rotation.y = -1.6 - Math.random() * 0.8;
    renderFrame();
    start();
  }).catch(() => {});

  /* ---- 滚动进度 → 位置 / 大小 ---- */
  let progress = 0;
  let ready = false;
  let started = false;
  let frameCount = 0;
  const tmp = { x: 0, y: 0 };

  function readProgress() {
    const doc = document.documentElement;
    const max = Math.max(1, (doc.scrollHeight || 0) - window.innerHeight);
    const y = window.pageYOffset || doc.scrollTop || 0;
    progress = Math.min(1, Math.max(0, y / max));
  }

  function renderFrame() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    if (width && height) {
      const aspect = width / height;
      if (camera.aspect !== aspect) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
    }

    const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    const halfW = halfH * camera.aspect;

    const eased = easeInOut(progress);
    curvePoint(page.path, eased, tmp);
    const px = tmp.x * halfW;
    const py = tmp.y * halfH;
    const scale = page.scale[0] + (page.scale[1] - page.scale[0]) * eased;

    if (group.visible) {
      group.position.set(px, py, page.z == null ? -0.6 : page.z);
      group.scale.setScalar(scale);
    }

    sun.position.copy(moodNow).multiplyScalar(20);
    uSunView.value.copy(moodNow).transformDirection(camera.matrixWorldInverse).normalize();
    renderer.render(scene, camera);
  }

  function resize() {
    const width = root.clientWidth || window.innerWidth;
    const height = root.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    renderFrame();
  }

  let raf = 0;
  let last = 0;
  function tick(ts) {
    raf = requestAnimationFrame(tick);
    if (!last) { last = ts; }
    const elapsed = (ts - last) / 1000;
    /* 自转用截断过的 dt（掉帧时不至于突然转一大格）；
       光照情绪用未截断的 elapsed，好坏帧都约 1 秒内过渡到位。 */
    const dt = Math.min(elapsed, 0.05);
    const kd = Math.min(elapsed, 0.4);
    last = ts;
    frameCount += 1;

    readProgress();
    readMood();
    const k = 1 - Math.exp(-kd * 2.6);
    moodNow.lerp(moodTarget, k).normalize();
    moodSpin += (moodSpinTarget - moodSpin) * k;
    if (Math.abs(moodAlphaTarget - moodAlpha) > 0.002) {
      moodAlpha += (moodAlphaTarget - moodAlpha) * k;
      canvas.style.opacity = String(moodAlpha);
    }
    if (!reduce) {
      group.rotation.y += dt * ROTATION * spec.spin * moodSpin;
      if (clouds) { clouds.rotation.y += dt * ROTATION * (CLOUD_BOOST - 1) * moodSpin; }
    }
    renderFrame();
    ready = true;
  }

  function start() {
    if (started) { return; }
    started = true;
    group.visible = true;
    resize();
    renderFrame();
    raf = requestAnimationFrame(tick);
    root.classList.add('is-3d');
    canvas.classList.add('is-ready');
    canvas.style.opacity = String(options.opacity || 0.9);
    if (fallbackEl) { fallbackEl.classList.add('is-replaced'); }
  }

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('scroll', function () { readProgress(); readMood(); }, { passive: true });

  window.__orbitBg = {
    get progress() { return progress; },
    get ndc() {
      const v = group.position.clone().project(camera);
      return [Number(v.x.toFixed(3)), Number(v.y.toFixed(3))];
    },
    get mood() { return activeMood; },
    get sun() { return moodNow.toArray(); },
    get key() { return page.key; },
    get frames() { return frameCount; },
    get ready() { return ready; },
    get rotation() { return group.rotation.y; },
    get scale() { return group.scale.x; },
    get loaded() { return loaded; },
    get planet() {
      return {
        key: page.key, label: spec.label, loaded, visible: group.visible,
        hasMap: Boolean(material.map), hasNight: Boolean(material.emissiveMap),
        hasRing: Boolean(ring), hasClouds: Boolean(clouds),
        opacity: Number(material.opacity.toFixed(2))
      };
    },
    jump(p) {
      window.scrollTo(0, p * (document.documentElement.scrollHeight - window.innerHeight));
      readProgress();
      renderFrame();
    }
  };

  return {
    stop() {
      cancelAnimationFrame(raf);
      renderer.dispose();
    }
  };
}
