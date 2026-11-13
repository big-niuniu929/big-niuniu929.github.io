/* =====================================================================
   入口页 — 星空 / 地球 / 进入展厅
   ---------------------------------------------------------------------
   这是 ORBITAL 的入口页版本，只服务 site/index.html：

     1. 界面状态     —— 点击 / Enter / 空格 / 圆形按钮 → 展厅态，只触发一次
     2. 星空         —— 9000 个点 + 自定义着色器，uWarp 做进入时的短脉冲
     3. 地球         —— 默认 5 张 4K 贴图；?lite=1 或设备不支持 4096 时用 2K
                        + 夜景遮罩 + 云层 + 大气壳 + 贴地薄雾
     4. 构图         —— 首屏地球占屏宽约 58%，上/右/下出血；
                        进入后 900ms 缓动缩到左侧约 32vw 并垂直居中
     5. 降级         —— 无 WebGL 时不加载 three.js，CSS 兜底；
                        4K 读取失败自动重试 2K；减少动态时直接进入展厅态
     6. 性能         —— 首帧后才拉贴图，像素比上限 2，页面隐藏时停 RAF

   说明：为了让 file:// 打开时界面仍然可用，本文件是普通脚本，
   three.js 用动态 import 加载；模块被浏览器拦截时自动落到 CSS 兜底。
   ===================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------
     0. 小工具
     --------------------------------------------------------------- */
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (t) { return t * t * (3 - 2 * t); };
  var easeInOutCubic = function (t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  var damp = function (cur, target, lambda, dt) {
    return lerp(cur, target, 1 - Math.exp(-lambda * dt));
  };

  var stage = document.getElementById('space-stage');
  var panel = document.getElementById('space-panel');
  var panelList = document.getElementById('space-panel-list');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!stage) { return; }

  var entered = false;
  /* 0 = 首屏构图，1 = 展厅构图；进入时从 0 缓动到 1，只做一次 */
  var transition = { start: 0, value: 0 };
  var warp = 0;
  var scrollNorm = 0;

  function markFallback() {
    document.body.classList.remove('space-gl');
    document.body.classList.add('space-no-webgl');
  }

  /* ---------------------------------------------------------------
     1. 进入展厅：只触发一次
     --------------------------------------------------------------- */
  function openExhibition(instant) {
    if (entered) { return; }
    entered = true;
    stage.setAttribute('data-state', 'exhibition');

    if (panel) { panel.inert = false; }

    if (instant || reduceMotion) {
      transition.value = 1;
    } else {
      transition.value = 0;
      transition.start = performance.now();
      warp = 1;
    }
  }

  if (reduceMotion) {
    openExhibition(true);
  } else if (panel) {
    panel.inert = true;
  }

  /* 左侧文字按钮与右下角圆形按钮共用同一个进入动作 */
  var enterTargets = document.querySelectorAll('[data-enter]');
  for (var b = 0; b < enterTargets.length; b++) {
    enterTargets[b].addEventListener('click', function (event) {
      event.stopPropagation();
      openExhibition(false);
    });
  }

  stage.addEventListener('click', function (event) {
    if (entered) { return; }
    if (event.target.closest && event.target.closest('a, button')) { return; }
    openExhibition(false);
  });

  window.addEventListener('keydown', function (event) {
    if (entered) { return; }
    var key = event.key;
    if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') { return; }
    var target = event.target;
    if (target && target.closest && target.closest('a, button, input, textarea, select')) {
      return;
    }
    event.preventDefault();
    openExhibition(false);
  });

  window.addEventListener('scroll', function () {
    scrollNorm = clamp(window.scrollY / Math.max(window.innerHeight, 1), 0, 1);
  }, { passive: true });

  /* ---------------------------------------------------------------
     2. 精选面板：能读到 JSON 就以 JSON 为准，读不到就用 HTML 里的静态版
     --------------------------------------------------------------- */
  var MARK_CLASS = {
    '实测': 'space-mark--measured',
    '估算': 'space-mark--estimated',
    '推算': 'space-mark--inferred',
    '待核实': 'space-mark--pending'
  };

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderProject(project, index) {
    var no = String(index + 1).padStart(2, '0');
    var metrics = (project.metrics || []).slice(0, 3).map(function (metric) {
      var cls = MARK_CLASS[metric.mark] || 'space-mark--pending';
      var title = metric.mark + (metric.note ? ' · ' + metric.note : '');
      return '<li class="space-metric">' +
        '<span class="space-metric__value">' + esc(metric.value) +
        '<span class="space-mark ' + cls + '" title="' + esc(title) + '">' + esc(metric.mark) + '</span></span>' +
        '<span class="space-metric__label">' + esc(metric.label) + '</span>' +
        '</li>';
    }).join('');

    return '<article class="space-project">' +
      '<p class="space-project__no">' + no + '</p>' +
      '<div>' +
      '<h3 class="space-project__title"><a href="work/' + esc(project.slug) + '.html">' + esc(project.title) + '</a></h3>' +
      '<p class="space-project__line">' + esc(project.oneliner) + '</p>' +
      '<ul class="space-metrics">' + metrics + '</ul>' +
      '</div></article>';
  }

  function hydratePanel() {
    if (!panelList || !window.fetch) { return; }

    fetch('data/projects.json', { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) { throw new Error('项目数据读取失败'); }
        return response.json();
      })
      .then(function (projects) {
        if (!Array.isArray(projects)) { return; }
        var featured = projects.filter(function (project) {
          return project.featured === true;
        }).slice(0, 3);
        if (!featured.length) { return; }
        panelList.innerHTML = featured.map(renderProject).join('');
      })
      .catch(function () {
        /* 直接双击打开时 fetch 会被拦；HTML 里已经有一份静态精选 */
      });
  }

  hydratePanel();

  /* ---------------------------------------------------------------
     3. WebGL 能力判断 → 动态加载 three.js
     --------------------------------------------------------------- */
  function supportsWebGL() {
    try {
      var probe = document.createElement('canvas');
      var gl = window.WebGLRenderingContext &&
        (probe.getContext('webgl2') || probe.getContext('webgl') || probe.getContext('experimental-webgl'));
      if (!gl) { return false; }
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) { lose.loseContext(); }
      return true;
    } catch (error) {
      return false;
    }
  }

  if (!supportsWebGL()) {
    markFallback();
    return;
  }

  import(new URL('vendor/build/three.module.js', document.baseURI).href)
    .then(initScene)
    .catch(function (error) {
      if (window.console && console.warn) {
        console.warn('[gate] three.js 没有加载成功，改用静态兜底。', error);
      }
      markFallback();
    });

  /* ---------------------------------------------------------------
     4. 3D 场景
     --------------------------------------------------------------- */
  function initScene(THREE) {
    var canvas = document.getElementById('space-scene');
    var renderer;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false
      });
    } catch (error) {
      markFallback();
      return;
    }

    var pixelRatio = function () {
      return Math.min(window.devicePixelRatio || 1, 2);
    };

    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;
    renderer.setClearColor(0x05080E, 1);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(
      42,
      window.innerWidth / window.innerHeight,
      0.1,
      700
    );
    camera.position.set(0, 0, 8);

    /* 太阳从左上前方打过来：可见面左侧亮、右缘入夜，地球才有体积 */
    var SUN_DIR = new THREE.Vector3(-0.62, 0.32, 0.72).normalize();
    var sunLight = new THREE.DirectionalLight(0xFFF1DC, 4.3);
    sunLight.position.copy(SUN_DIR).multiplyScalar(20);
    scene.add(sunLight);
    /* 太阳目标跟着地球走：地球进入展厅态后移到左侧，
       如果光还照向世界原点，可见半球就会转到夜侧、整颗星发黑。 */
    var sunTarget = new THREE.Object3D();
    scene.add(sunTarget);
    sunLight.target = sunTarget;

    /* 镜头补光：位置每帧跟随相机，保证可见半球始终有一点正面光。
       否则地球进入展厅态移到左侧后，正对镜头的一面会落在夜侧、整颗星发黑。 */
    var fillLight = new THREE.DirectionalLight(0x7FA8DC, 0.5);
    fillLight.position.set(0, 0, 10);
    scene.add(fillLight);
    var fillTarget = new THREE.Object3D();
    scene.add(fillTarget);
    fillLight.target = fillTarget;

    scene.add(new THREE.AmbientLight(0x141E33, 0.72));

    var tanHalf = Math.tan(THREE.MathUtils.degToRad(42 / 2));
    var EARTH_R = 1.5;

    /* ---------------- 星空 ---------------- */
    var starUniforms = {
      uTime: { value: 0 },
      uWarp: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() }
    };

    function buildStarfield(count) {
      var pos = new Float32Array(count * 3);
      var col = new Float32Array(count * 3);
      var siz = new Float32Array(count);
      var seed = new Float32Array(count);
      var color = new THREE.Color();

      for (var i = 0; i < count; i++) {
        var r = 32 + Math.pow(Math.random(), 0.65) * 98;
        var theta = Math.random() * Math.PI * 2;
        var phi = Math.acos(2 * Math.random() - 1);
        var sinPhi = Math.sin(phi);

        pos[i * 3] = r * sinPhi * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.cos(phi) * 0.8;
        pos[i * 3 + 2] = r * sinPhi * Math.sin(theta);

        var warm = Math.random();
        if (warm > 0.82) {
          color.setRGB(1.0, 0.86, 0.7);
        } else if (warm > 0.62) {
          color.setRGB(0.78, 0.88, 1.0);
        } else {
          color.setRGB(0.94, 0.97, 1.0);
        }

        var brightness = 0.55 + Math.random() * 0.45;
        col[i * 3] = color.r * brightness;
        col[i * 3 + 1] = color.g * brightness;
        col[i * 3 + 2] = color.b * brightness;

        siz[i] = 0.62 + Math.pow(Math.random(), 4.0) * 2.4;
        seed[i] = Math.random();
      }

      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geometry.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
      geometry.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
      geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

      var material = new THREE.ShaderMaterial({
        uniforms: starUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: [
          'uniform float uTime;',
          'uniform float uWarp;',
          'uniform float uPixelRatio;',
          'attribute vec3 aColor;',
          'attribute float aSize;',
          'attribute float aSeed;',
          'varying vec3 vColor;',
          'varying float vGlow;',
          'void main() {',
          '  float twinkle = 0.55 + 0.45 * sin(uTime * (0.7 + aSeed * 1.9) + aSeed * 6.283);',
          '  float warp = uWarp * (0.25 + aSeed * 0.75);',
          '  vec3 p = position * (1.0 + warp * 0.55);',
          '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
          '  gl_Position = projectionMatrix * mv;',
          '  gl_PointSize = aSize * uPixelRatio * (1.0 + warp * 2.2) * (170.0 / max(-mv.z, 0.001));',
          '  vColor = aColor;',
          '  vGlow = twinkle;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'varying vec3 vColor;',
          'varying float vGlow;',
          'void main() {',
          '  float d = length(gl_PointCoord - vec2(0.5));',
          '  float alpha = smoothstep(0.5, 0.02, d);',
          '  alpha *= alpha;',
          '  gl_FragColor = vec4(vColor * vGlow, alpha);',
          '}'
        ].join('\n')
      });

      var points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      return points;
    }

    var stars = buildStarfield(window.innerWidth <= 820 ? 4200 : 9000);
    scene.add(stars);

    /* ---------------- 星云 ---------------- */
    function makeGlowTexture() {
      var size = 256;
      var cv = document.createElement('canvas');
      cv.width = cv.height = size;
      var ctx = cv.getContext('2d');
      var gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0.0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.28, 'rgba(255,255,255,0.42)');
      gradient.addColorStop(0.62, 'rgba(255,255,255,0.10)');
      gradient.addColorStop(1.0, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      var texture = new THREE.CanvasTexture(cv);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }

    var glowTexture = makeGlowTexture();
    var nebulaGroup = new THREE.Group();
    var NEBULAE = [
      { pos: [-70, 26, -110], scale: 190, color: 0x2B4FFF, opacity: 0.30 },
      { pos: [88, -38, -135], scale: 230, color: 0x8A3BFF, opacity: 0.24 },
      { pos: [18, 62, -165], scale: 260, color: 0x1F7FA8, opacity: 0.20 }
    ];

    for (var n = 0; n < NEBULAE.length; n++) {
      var item = NEBULAE[n];
      var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: item.color,
        transparent: true,
        opacity: item.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      sprite.position.set(item.pos[0], item.pos[1], item.pos[2]);
      sprite.scale.setScalar(item.scale);
      nebulaGroup.add(sprite);
    }
    scene.add(nebulaGroup);

    /* ---------------- 流星 ---------------- */
    var shootingStars = [];

    if (!reduceMotion) {
      for (var s = 0; s < 2; s++) {
        var lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        var lineMaterial = new THREE.LineBasicMaterial({
          color: 0xBFE9FF,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        var line = new THREE.Line(lineGeometry, lineMaterial);
        line.frustumCulled = false;
        scene.add(line);
        shootingStars.push({
          line: line,
          alive: false,
          life: 0,
          ttl: 1,
          dir: new THREE.Vector3(),
          pos: new THREE.Vector3(),
          speed: 0
        });
      }
    }

    var tmpA = new THREE.Vector3();
    var tmpB = new THREE.Vector3();

    function spawnShootingStar(star) {
      var angle = Math.random() * Math.PI * 2;
      tmpA.set(Math.cos(angle), Math.random() * 0.7 - 0.35, Math.sin(angle)).normalize();
      star.pos.copy(tmpA).multiplyScalar(38 + Math.random() * 40);
      star.pos.y += 10 + Math.random() * 14;

      tmpB.set(-tmpA.x, -tmpA.y * 0.4, -tmpA.z).normalize();
      star.dir.copy(tmpB);
      star.speed = 55 + Math.random() * 55;
      star.ttl = 0.7 + Math.random() * 0.7;
      star.life = 0;
      star.alive = true;
      star.line.material.opacity = 1;
    }

    function updateShootingStars(dt) {
      for (var i = 0; i < shootingStars.length; i++) {
        var star = shootingStars[i];
        if (!star.alive) {
          if (Math.random() < dt * 0.20) { spawnShootingStar(star); }
          continue;
        }
        star.life += dt;
        if (star.life > star.ttl) {
          star.alive = false;
          star.line.material.opacity = 0;
          continue;
        }
        star.pos.addScaledVector(star.dir, star.speed * dt);

        var tail = tmpA.copy(star.pos).addScaledVector(star.dir, -8 - star.speed * 0.09);
        var array = star.line.geometry.attributes.position.array;
        array[0] = star.pos.x; array[1] = star.pos.y; array[2] = star.pos.z;
        array[3] = tail.x; array[4] = tail.y; array[5] = tail.z;
        star.line.geometry.attributes.position.needsUpdate = true;
        star.line.material.opacity = Math.sin((star.life / star.ttl) * Math.PI) * 0.85;
      }
    }

    /* ---------------- 地球 ---------------- */
    var earthGroup = null;
    var earthMesh = null;
    var cloudMesh = null;
    var earthMat = null;
    var cloudMat = null;
    var hazeUniforms = null;
    var atmosphereUniforms = null;
    var earthFade = 0;
    var fadeDone = false;
    /* 淡入按真实时间算，不按帧累加：低帧率设备上才不会淡很久 */
    var fadeStart = 0;

    var uSunView = { value: new THREE.Vector3() };
    var sunViewVec = new THREE.Vector3();
    /* 太阳方向按「相对镜头」实时计算，保证可见半球始终受光 */
    var sunWorldVec = new THREE.Vector3();
    var UP_AXIS = new THREE.Vector3(0, 1, 0);

    /* 4K 只在设备确实支持 4096 纹理时启用；?lite=1 强制 2K。
       HD 与 2K 的目录/文件名只在下列判断里出现，避免两套混着加载。 */
    var useHD = (function () {
      try {
        if (new URLSearchParams(window.location.search).get('lite') === '1') { return false; }
      } catch (error) {
        /* 不支持 URLSearchParams 的浏览器按能力判断 */
      }
      return renderer.capabilities.maxTextureSize >= 4096;
    })();

    var texLoader = new THREE.TextureLoader();
    var maxAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);

    function loadTexture(url, srgb) {
      return texLoader.loadAsync(url).then(function (texture) {
        texture.anisotropy = maxAnisotropy;
        if (srgb) { texture.colorSpace = THREE.SRGBColorSpace; }
        return texture;
      }).catch(function () {
        return null;
      });
    }

    function loadSet(hd) {
      var dir = hd ? 'vendor/textures-hd/' : 'vendor/textures/';
      var day = hd ? 'earth_day.jpg' : 'earth_atmos.jpg';
      var night = hd ? 'earth_night.jpg' : 'earth_lights.png';
      return Promise.all([
        loadTexture(dir + day, true),
        loadTexture(dir + night, true),
        loadTexture(dir + 'earth_clouds.png', true),
        loadTexture(dir + 'earth_normal.jpg', false),
        loadTexture(dir + 'earth_specular.jpg', false)
      ]);
    }

    function failEarth() {
      markFallback();
      stop();
    }

    function loadEarthTextures() {
      loadSet(useHD).then(function (textures) {
        if (textures[0]) {
          buildEarth(textures[0], textures[1], textures[2], textures[3], textures[4]);
          return null;
        }
        /* 4K 没读全就退回 2K；2K 也不可用时才落到 CSS 地球。 */
        if (!useHD) { failEarth(); return null; }
        return loadSet(false).then(function (fallback) {
          if (fallback[0]) {
            buildEarth(fallback[0], fallback[1], fallback[2], fallback[3], fallback[4]);
          } else {
            failEarth();
          }
        });
      }).catch(failEarth);
    }

    function buildEarth(day, night, clouds, normal, spec) {
      /* 贴图还没解码完之前地球不可见；解码后 0.9s 淡入，避免首屏卡 2MB */
      earthMat = new THREE.MeshPhongMaterial({
        map: day,
        normalMap: normal || null,
        normalScale: new THREE.Vector2(1.2, 1.2),
        specularMap: spec || null,
        specular: new THREE.Color(0x0C1826),
        shininess: 180,
        emissiveMap: night || null,
        emissive: new THREE.Color(night ? 0xFFCC88 : 0x000000),
        emissiveIntensity: 3.7,
        transparent: true,
        opacity: 0
      });

      /* 夜景只在背光半球亮；晨昏线用 smoothstep 拉出一条过渡带，
         不然会变成一条刀切的线。 */
      earthMat.onBeforeCompile = function (shader) {
        shader.uniforms.uSunView = uSunView;
        shader.fragmentShader = 'uniform vec3 uSunView;\n' + shader.fragmentShader
          .replace(
            '#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\n' +
            'float sunDot = dot(normalize(vNormal), normalize(uSunView));\n' +
            'float nightMask = 1.0 - smoothstep(-0.34, 0.12, sunDot);\n' +
            'totalEmissiveRadiance *= nightMask * 5.4;'
          )
          .replace(
            '#include <dithering_fragment>',
            '#include <dithering_fragment>\n' +
            'gl_FragColor.rgb += vec3(0.020, 0.034, 0.058) * nightMask;'
          );
      };

      earthMesh = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 192, 128), earthMat);

      if (clouds) {
        cloudMat = new THREE.MeshPhongMaterial({
          map: clouds,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          depthTest: true,
          blending: THREE.NormalBlending,
          shininess: 4,
          specular: new THREE.Color(0x0A1420)
        });
        cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.005, 160, 112), cloudMat);
      }

      hazeUniforms = {
        uColor: { value: new THREE.Color(0x6FB8FF) },
        uFade: { value: 0 }
      };
      var haze = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_R * 1.015, 72, 54),
        new THREE.ShaderMaterial({
          uniforms: hazeUniforms,
          transparent: true,
          blending: THREE.AdditiveBlending,
          side: THREE.FrontSide,
          depthWrite: false,
          vertexShader: [
            'varying vec3 vN;',
            'varying vec3 vP;',
            'void main() {',
            '  vN = normalize(normalMatrix * normal);',
            '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
            '  vP = mv.xyz;',
            '  gl_Position = projectionMatrix * mv;',
            '}'
          ].join('\n'),
          fragmentShader: [
            'uniform vec3 uColor;',
            'uniform float uFade;',
            'varying vec3 vN;',
            'varying vec3 vP;',
            'void main() {',
            '  vec3 viewDir = normalize(-vP);',
            '  float fres = 1.0 - max(dot(normalize(vN), viewDir), 0.0);',
            '  float glow = pow(fres, 5.0) * 0.28 * uFade;',
            '  gl_FragColor = vec4(uColor * glow, glow);',
            '}'
          ].join('\n')
        })
      );

      atmosphereUniforms = {
        uColor: { value: new THREE.Color(0x4A9BFF) },
        uColorWarm: { value: new THREE.Color(0xFFB27A) },
        uIntensity: { value: 1.0 },
        uSunView: uSunView,
        uFade: { value: 0 }
      };
      var atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_R * 1.10, 96, 72),
        new THREE.ShaderMaterial({
          uniforms: atmosphereUniforms,
          transparent: true,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          depthWrite: false,
          vertexShader: [
            'varying vec3 vN;',
            'varying vec3 vP;',
            'void main() {',
            '  vN = normalize(normalMatrix * normal);',
            '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
            '  vP = mv.xyz;',
            '  gl_Position = projectionMatrix * mv;',
            '}'
          ].join('\n'),
          fragmentShader: [
            'uniform vec3 uColor;',
            'uniform vec3 uColorWarm;',
            'uniform float uIntensity;',
            'uniform vec3 uSunView;',
            'uniform float uFade;',
            'varying vec3 vN;',
            'varying vec3 vP;',
            'void main() {',
            '  vec3 n = normalize(vN);',
            '  vec3 viewDir = normalize(-vP);',
            '  float fres = 1.0 - abs(dot(n, viewDir));',
            '  float glow = (pow(fres, 2.2) * 0.55 + pow(fres, 6.0) * 0.50) * uIntensity;',
            '  float sunSide = max(dot(n, normalize(uSunView)), 0.0);',
            '  float warmBand = smoothstep(0.05, 0.25, sunSide) * (1.0 - smoothstep(0.35, 0.75, sunSide));',
            '  vec3 col = uColor * (0.85 + 0.50 * sunSide) + uColorWarm * warmBand * 0.25;',
            '  glow *= 0.10 + 1.30 * smoothstep(0.0, 0.35, sunSide);',
            '  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);',
            '  glow *= 0.99 + dither * 0.02;',
            '  glow *= uFade;',
            '  gl_FragColor = vec4(col * glow, glow);',
            '}'
          ].join('\n')
        })
      );

      earthGroup = new THREE.Group();
      earthGroup.add(earthMesh);
      if (cloudMesh) { earthGroup.add(cloudMesh); }
      earthGroup.add(haze, atmosphere);
      scene.add(earthGroup);

      earthFade = 0;
      fadeDone = false;
      fadeStart = performance.now();

      /* 减少动态效果（prefers-reduced-motion）时不要等 0.9s 淡入：
         淡入由动画帧驱动，直接跳到展厅态会让透明度永远停在 0，
         地球就完全看不见了。这里直接给最终态。 */
      if (reduceMotion) {
        earthFade = 1;
        fadeDone = true;
        earthMat.opacity = 1;
        earthMat.transparent = false;
        if (cloudMat) { cloudMat.opacity = 0.92; }
        if (hazeUniforms) { hazeUniforms.uFade.value = 1; }
        if (atmosphereUniforms) { atmosphereUniforms.uFade.value = 1; }
      }
    }

    /* ---------------- 构图：首屏贴右出血，进入后在左 ---------------- */
    function getRig(mode) {
      var width = Math.max(window.innerWidth, 320);
      var height = Math.max(window.innerHeight, 480);

      /* 让地球在屏幕上正好占 diameter 像素：d 由视锥高度反推 */
      function distanceFor(diameter) {
        return (3 * height) / (2 * diameter * tanHalf);
      }

      /* 圆心放在画面的 (fx, fy)（0–1），换回世界坐标 */
      function offsetFor(distance, fx, fy) {
        var unitsPerPixel = (2 * distance * tanHalf) / height;
        return {
          x: (fx - 0.5) * width * unitsPerPixel,
          y: (0.5 - fy) * height * unitsPerPixel
        };
      }

      /* 窄屏：地球压在顶部、向右出血，文字落在下方 */
      if (width <= 820) {
        var mobileDiameter = mode === 'gate'
          ? Math.min(width * 0.84, height * 0.42)
          : Math.min(width * 0.50, height * 0.30);
        var mobileDistance = distanceFor(mobileDiameter);
        var mobileOffset = offsetFor(
          mobileDistance,
          mode === 'gate' ? 0.60 : 0.50,
          mode === 'gate' ? 0.21 : 0.20
        );
        return { d: mobileDistance, x: mobileOffset.x, y: mobileOffset.y };
      }

      if (mode === 'gate') {
        /* 屏宽 58%（矮屏再放大到 62vh），圆心在右侧 78% / 下方 54%：
           顶部被导航裁掉，右缘和底部出血 */
        var gateDiameter = Math.max(width * 0.58, height * 0.62);
        var gateDistance = distanceFor(gateDiameter);
        var gateOffset = offsetFor(gateDistance, 0.78, 0.54);
        return { d: gateDistance, x: gateOffset.x, y: gateOffset.y };
      }

      /* 展厅态：地球约占 32% 宽（矮屏时按 80% 高封顶），圆心落在画面 25% 处 */
      var exhibitWidth = Math.min(width * 0.32, height * 0.80);
      var exhibitDistance = distanceFor(exhibitWidth);
      var exhibitOffset = offsetFor(exhibitDistance, 0.25, 0.5);
      return { d: exhibitDistance, x: exhibitOffset.x, y: exhibitOffset.y };
    }

    var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    window.addEventListener('pointermove', function (event) {
      pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = -((event.clientY / window.innerHeight) * 2 - 1);
    }, { passive: true });

    /* ---------------- 主循环 ---------------- */
    var clock = new THREE.Clock();
    var rafId = 0;
    var running = false;
    /* 起始经度让非洲 / 欧洲 / 亚洲落在可见面，首屏不出现一整片空海 */
    var earthSpin = 1.9;

    function tick() {
      var dt = Math.min(clock.getDelta(), 0.05);
      var time = clock.elapsedTime;

      /* 入口过渡：900ms，缓入缓出。start 为 0 表示还没点击，保持首屏构图 */
      if (transition.start && transition.value < 1) {
        transition.value = clamp((performance.now() - transition.start) / 900, 0, 1);
      }
      var eased = easeInOutCubic(transition.value);

      warp = damp(warp, 0, 2.9, dt);
      starUniforms.uWarp.value = warp * warp * 0.9;
      starUniforms.uTime.value = time;

      var parallax = reduceMotion ? 0 : 1;
      pointer.x = damp(pointer.x, pointer.tx, 3.5, dt);
      pointer.y = damp(pointer.y, pointer.ty, 3.5, dt);

      var gateRig = getRig('gate');
      var exhibitRig = getRig('exhibition');
      var distance = lerp(gateRig.d, exhibitRig.d, eased);
      var earthX = lerp(gateRig.x, exhibitRig.x, eased);
      var earthY = lerp(gateRig.y, exhibitRig.y, eased);

      /* 鼠标视差只给一点点：镜头随鼠标偏移，地球会稍微“活”起来 */
      camera.position.x = damp(camera.position.x, pointer.x * 0.10 * parallax, 3.2, dt);
      camera.position.y = damp(camera.position.y, pointer.y * 0.07 * parallax, 3.2, dt);
      camera.position.z = distance;
      camera.lookAt(0, 0, 0);
      fillLight.position.copy(camera.position);
      fillTarget.position.set(0, 0, 0);
      fillTarget.updateMatrixWorld();

      if (earthGroup) {
        earthGroup.position.x = earthX;
        earthGroup.position.y = earthY;
      }

      /* 地球自转；展厅态里继续慢慢转 */
      earthSpin += dt * (reduceMotion ? 0.014 : 0.045);
      if (earthMesh) { earthMesh.rotation.y = earthSpin; }
      if (cloudMesh) { cloudMesh.rotation.y = earthSpin * 1.08 + 0.6; }

      /* 贴图加载完 → 0.9s 淡入 */
      if (earthMat && !fadeDone) {
        earthFade = fadeStart ? Math.min(1, (performance.now() - fadeStart) / 420) : 1;
        var fade = smooth(earthFade);
        earthMat.opacity = fade;
        if (cloudMat) { cloudMat.opacity = 0.92 * fade; }
        if (hazeUniforms) { hazeUniforms.uFade.value = fade; }
        if (atmosphereUniforms) { atmosphereUniforms.uFade.value = fade; }
        if (earthFade >= 1) {
          fadeDone = true;
          earthMat.transparent = false;
          earthMat.needsUpdate = true;
        }
      }

      /* 夜景遮罩需要视空间太阳方向。
         太阳方向改为「相对镜头」实时计算：从镜头指向地球，绕 Y 轴偏一点拉出晨昏线，
         再抬一点让北极有光。这样无论地球在右侧出血、还是缩到左侧，
         可见半球始终是亮的——否则移边之后整颗星会转到夜侧发黑。 */
      camera.updateMatrixWorld();
      var eposX = earthGroup ? earthGroup.position.x : 0;
      var eposY = earthGroup ? earthGroup.position.y : 0;
      sunWorldVec.set(
        camera.position.x - eposX,
        camera.position.y - eposY,
        camera.position.z
      );
      if (sunWorldVec.lengthSq() < 1e-6) { sunWorldVec.copy(SUN_DIR); }
      sunWorldVec.normalize().applyAxisAngle(UP_AXIS, 1.22);
      sunWorldVec.y += 0.06;
      sunWorldVec.normalize();
      sunLight.position.set(
        eposX + sunWorldVec.x * 20,
        eposY + sunWorldVec.y * 20,
        sunWorldVec.z * 20
      );
      sunTarget.position.set(eposX, eposY, 0);
      sunTarget.updateMatrixWorld();
      sunViewVec.copy(sunWorldVec).transformDirection(camera.matrixWorldInverse);
      uSunView.value.copy(sunViewVec);

      /* 滚动视差：只在窄屏页面真的滚动时才有位移 */
      stars.position.y = scrollNorm * 1.3;
      stars.position.x = scrollNorm * 0.35;
      stars.rotation.y = time * 0.004 + pointer.x * 0.04 * parallax;
      stars.rotation.x = pointer.y * 0.025 * parallax;
      nebulaGroup.position.y = -pointer.y * 4 * parallax - scrollNorm * 2.2;
      nebulaGroup.position.x = -pointer.x * 6 * parallax;
      nebulaGroup.rotation.z = time * 0.004;

      if (!reduceMotion) { updateShootingStars(dt); }

      try {
        renderer.render(scene, camera);
      } catch (error) {
        markFallback();
        stop();
        return;
      }

      if (!document.body.classList.contains('space-gl')) {
        document.body.classList.add('space-gl');
      }

      rafId = requestAnimationFrame(tick);
    }

    function start() {
      if (running) { return; }
      running = true;
      clock.getDelta();
      rafId = requestAnimationFrame(tick);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(rafId);
    }

    window.addEventListener('resize', function () {
      var width = window.innerWidth;
      var height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(pixelRatio());
      renderer.setSize(width, height);
      starUniforms.uPixelRatio.value = renderer.getPixelRatio();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { stop(); } else { start(); }
    });

    canvas.addEventListener('webglcontextlost', function (event) {
      event.preventDefault();
      stop();
      markFallback();
    }, false);

    start();

    /* 先让星空和文字出一帧，再开始拉 2MB 地球贴图 */
    loadEarthTextures();
  }
})();
