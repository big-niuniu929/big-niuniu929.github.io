/* ---------------------------------------------------------------
   space-bg —— 除入口页外，所有页面共享的「星空 + 星云 + 地球」背景层
   ---------------------------------------------------------------
   入口页用的是真 WebGL 地球（js/orbital.js）。其他页面如果每页都
   加载 three.js + 5MB 贴图太重，所以这里用三层便宜的东西做出
   连续感：
     1. canvas 画约几百颗会闪、会随滚动轻微位移的星
     2. 一张 NASA/STScI 的星云照片（公有领域，已压暗偏蓝柔化）
     3. 一张从入口页渲染里裁出来的地球（WebP）
   目标不是"再做一个 3D"，而是让从入口点进正文之后，环境没有突然消失。

   素材署名：
   - 星云：NASA / STScI / Webb（Carina Nebula，公有领域）
   - 银河带：NASA / JPL-Caltech（GLIMPSE，公有领域）
   - 地球：Solar System Scope，CC BY 4.0

   用法：<script src="assets/space-bg.js" defer></script>
        （work/ 下的页面用 ../assets/space-bg.js）
   --------------------------------------------------------------- */
(function () {
  if (window.__spaceBg) return;
  window.__spaceBg = true;

  var reduce = false;
  try {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}

  /* 从自身 script 标签推导资源前缀，避免 work/ 目录下路径写错 */
  var self = document.currentScript;
  var base = '';
  if (self && self.src) {
    base = self.src.replace(/assets\/space-bg\.js.*$/, '');
  }

  /* ---------- 样式（自带，避免和全站样式表互相干扰） ---------- */
  var style = document.createElement('style');
  style.textContent = [
    '.space-bg{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;background:transparent}',
    '.space-bg__stars{position:absolute;inset:0;display:block}',
    /* 星云：左下角一团，只做气氛 */
    '.space-bg__nebula{position:absolute;left:-24%;bottom:-14%;width:min(116vw,1600px);',
    'aspect-ratio:1.73;background-size:cover;background-position:center;opacity:.46;',
    'mix-blend-mode:screen;filter:saturate(.9);',
    '-webkit-mask-image:radial-gradient(60% 60% at 45% 55%,#000 30%,transparent 78%);',
    'mask-image:radial-gradient(60% 60% at 45% 55%,#000 30%,transparent 78%);',
    'animation:spaceNebulaDrift 120s ease-in-out infinite}',
    /* 银河带：顶部横贯，极淡 */
    '.space-bg__milky{position:absolute;left:-12%;top:-8%;width:min(124vw,1800px);',
    'aspect-ratio:1.66;background-size:cover;background-position:center;opacity:.42;',
    'mix-blend-mode:screen;',
    '-webkit-mask-image:linear-gradient(180deg,transparent 0%,#000 26%,#000 62%,transparent 100%);',
    'mask-image:linear-gradient(180deg,transparent 0%,#000 26%,#000 62%,transparent 100%)}',
    /* 地球：右侧出血 */
    '.space-bg__earth{position:absolute;right:max(-19vw,-330px);top:9vh;width:min(58vw,900px);',
    'aspect-ratio:1/1.014;background-size:contain;background-repeat:no-repeat;',
    'background-position:center;opacity:.30;filter:blur(.6px) saturate(.9) brightness(.78);',
    'animation:spaceEarthDrift 52s ease-in-out infinite;will-change:transform}',
    '@keyframes spaceEarthDrift{0%,100%{transform:translate3d(0,0,0) scale(1)}',
    '50%{transform:translate3d(-1.4%,1.6%,0) scale(1.012)}}',
    /* 太阳系（js/planets-bg.js 挂载成功后接管整层背景） */
    '.space-bg__planets{position:absolute;inset:0;width:100%;height:100%;display:block;',
    'opacity:0;transition:opacity 1.2s ease;pointer-events:none;',
    '-webkit-mask-image:linear-gradient(90deg,transparent 0%,rgba(0,0,0,.35) 26%,#000 44%),radial-gradient(126% 126% at 76% 46%,#000 58%,rgba(0,0,0,.7) 78%,transparent 97%);',
    '-webkit-mask-composite:source-in;',
    'mask-image:linear-gradient(90deg,transparent 0%,rgba(0,0,0,.35) 26%,#000 44%),radial-gradient(126% 126% at 76% 46%,#000 58%,rgba(0,0,0,.7) 78%,transparent 97%);',
    'mask-composite:intersect}',
    /* 左侧底色：把"纯黑"换成深蓝，星云与星点才有可依的底 */
    '.space-bg__wash{position:absolute;inset:0;z-index:0;pointer-events:none;background:',
    'radial-gradient(54% 48% at 15% 32%,rgba(62,102,166,.30),transparent 74%),',
    'radial-gradient(42% 40% at 6% 78%,rgba(96,74,152,.20),transparent 76%),',
    'radial-gradient(46% 42% at 34% 62%,rgba(40,72,124,.16),transparent 78%),',
    'linear-gradient(90deg,rgba(16,27,48,.58) 0%,rgba(13,23,41,.36) 46%,rgba(9,16,30,.10) 74%,transparent 100%)}',
    /* 星球溢光：让亮面有向左侧渗过去的一点蓝，别把左右切成两半 */
    '.space-bg__glow{position:absolute;inset:0;z-index:1;pointer-events:none;background:',
    'radial-gradient(48% 48% at 72% 40%,rgba(150,188,240,.16),rgba(90,132,196,.06) 52%,transparent 74%)}',
    '.space-bg__scrim{position:absolute;inset:0;z-index:2;pointer-events:none;',
    'background:linear-gradient(90deg,rgba(5,8,14,.80) 0%,rgba(5,8,14,.76) 38%,rgba(5,8,14,.60) 58%,rgba(5,8,14,.30) 76%,rgba(5,8,14,.08) 89%,rgba(5,8,14,0) 100%)}',
    '.space-bg__planets{z-index:1}',
    /* 星球在左侧的页面：遮罩镜像，否则左半屏会被涂没 */
    '.space-bg.is-left .space-bg__planets{-webkit-mask-image:linear-gradient(270deg,transparent 0%,rgba(0,0,0,.35) 26%,#000 44%),radial-gradient(126% 126% at 24% 46%,#000 58%,rgba(0,0,0,.7) 78%,transparent 97%);',
    '-webkit-mask-composite:source-in;mask-image:linear-gradient(270deg,transparent 0%,rgba(0,0,0,.35) 26%,#000 44%),radial-gradient(126% 126% at 24% 46%,#000 58%,rgba(0,0,0,.7) 78%,transparent 97%);mask-composite:intersect}',
    /* 星球在左侧：左外缘让出 14%，星球的亮边才看得见，正文区仍然压暗 */
    '.space-bg.is-left .space-bg__scrim{background:linear-gradient(90deg,rgba(5,8,14,.34) 0%,rgba(5,8,14,.68) 13%,rgba(5,8,14,.9) 32%,rgba(5,8,14,.93) 58%,rgba(5,8,14,.74) 80%,rgba(5,8,14,.22) 94%,rgba(5,8,14,0) 100%)}',
    '.space-bg.is-left .space-bg__glow{background:radial-gradient(48% 48% at 26% 40%,rgba(150,188,240,.16),rgba(90,132,196,.06) 52%,transparent 74%)}',
    '.space-bg__planets.is-ready{opacity:.92}',
    '@media (max-width:1200px){.space-bg__planets.is-ready{opacity:.78}}',
    '.space-bg.is-3d .space-bg__earth{opacity:0;transition:opacity .7s ease}',
    '@keyframes spaceNebulaDrift{0%,100%{transform:translate3d(0,0,0) scale(1)}',
    '50%{transform:translate3d(2%,-1.6%,0) scale(1.05)}}',
    '@media (prefers-reduced-motion:reduce){.space-bg__earth,.space-bg__nebula{animation:none}}',
    '@media (max-width:900px){.space-bg__earth{width:132vw;right:-52vw;top:1vh;opacity:.38}',
    '.space-bg__nebula{width:150vw;left:-34%;opacity:.42}.space-bg__milky{opacity:.26}}',
    '@media print{.space-bg{display:none!important}}'
  ].join('');
  document.head.appendChild(style);

  var root = document.createElement('div');
  root.className = 'space-bg';
  root.setAttribute('aria-hidden', 'true');

  var wash = document.createElement('div');
  wash.className = 'space-bg__wash';
  root.appendChild(wash);

  var canvas = document.createElement('canvas');
  canvas.className = 'space-bg__stars';
  root.appendChild(canvas);

  var milky = document.createElement('div');
  milky.className = 'space-bg__milky';
  milky.style.backgroundImage = 'url("' + base + 'assets/img/milkyway.webp")';
  root.appendChild(milky);

  var nebula = document.createElement('div');
  nebula.className = 'space-bg__nebula';
  nebula.style.backgroundImage = 'url("' + base + 'assets/img/nebula.webp")';
  root.appendChild(nebula);

  var glow = document.createElement('div');
  glow.className = 'space-bg__glow';
  root.appendChild(glow);

  var earth = document.createElement('div');
  earth.className = 'space-bg__earth';
  earth.style.backgroundImage = 'url("' + base + 'assets/img/earth-glow.webp")';
  root.appendChild(earth);

  var scrim = document.createElement('div');
  scrim.className = 'space-bg__scrim';
  root.appendChild(scrim);

  document.body.insertBefore(root, document.body.firstChild);

  /* ---------- 会转的太阳系（可选增强） ----------
     用 <script type="module"> 注入，而不是在经典脚本里写 import()：
     老浏览器解析不了 import() 语法，会连累整个背景层的星空。
     模块自己负责失败兜底 —— 挂不上就什么都不做，静态地球还在。 */
  if (window.innerWidth > 720 && typeof window.WebGLRenderingContext !== 'undefined') {
    var boot = document.createElement('script');
    boot.type = 'module';
    boot.textContent =
      "import { mount } from '" + base + "js/planets-bg.js';" +
      "var root = document.querySelector('.space-bg');" +
      "var fb = document.querySelector('.space-bg__earth');" +
      "if (root) { mount(root, fb, { reduce: " + (reduce ? 'true' : 'false') + " }); }";
    document.head.appendChild(boot);
  }

  /* ---------------- 星空 ---------------- */
  var ctx = canvas.getContext('2d');
  var stars = [];
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = 0;
  var h = 0;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  function build() {
    /* 密度随视口面积变化：大屏不至于空，小屏不至于糊 */
    var count = Math.round((w * h) / 3400);
    count = Math.max(220, Math.min(count, 900));
    stars.length = 0;
    for (var i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.15 + 0.34,
        a: Math.random() * 0.5 + 0.42,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.5 + 0.25,
        drift: Math.random() * 0.5 + 0.2
      });
    }
  }

  var scrollY = 0;
  function onScroll() {
    scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  var t0 = 0;
  function frame(ts) {
    if (!t0) t0 = ts;
    var t = (ts - t0) / 1000;

    ctx.clearRect(0, 0, w, h);

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var twinkle = reduce ? 1 : 0.72 + 0.28 * Math.sin(t * s.speed + s.phase);
      var y = s.y - scrollY * 0.028 * s.drift;
      y = ((y % h) + h) % h;

      ctx.globalAlpha = s.a * twinkle;
      ctx.beginPath();
      ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = '#EDF3FF';
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  onScroll();
  requestAnimationFrame(frame);
})();

