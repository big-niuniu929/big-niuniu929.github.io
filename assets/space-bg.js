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
    '.space-bg__nebula{position:absolute;left:-18%;bottom:-26%;width:min(108vw,1500px);',
    'aspect-ratio:1.73;background-size:cover;background-position:center;opacity:.34;',
    'mix-blend-mode:screen;filter:saturate(.9);',
    '-webkit-mask-image:radial-gradient(60% 60% at 45% 55%,#000 30%,transparent 78%);',
    'mask-image:radial-gradient(60% 60% at 45% 55%,#000 30%,transparent 78%);',
    'animation:spaceNebulaDrift 120s ease-in-out infinite}',
    /* 银河带：顶部横贯，极淡 */
    '.space-bg__milky{position:absolute;left:-12%;top:-8%;width:min(124vw,1800px);',
    'aspect-ratio:1.66;background-size:cover;background-position:center;opacity:.34;',
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

  var earth = document.createElement('div');
  earth.className = 'space-bg__earth';
  earth.style.backgroundImage = 'url("' + base + 'assets/img/earth-glow.webp")';
  root.appendChild(earth);

  document.body.insertBefore(root, document.body.firstChild);

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
    var count = Math.round((w * h) / 5200);
    count = Math.max(140, Math.min(count, 620));
    stars.length = 0;
    for (var i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.05 + 0.25,
        a: Math.random() * 0.55 + 0.25,
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

