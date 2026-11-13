/* ==========================================================================
   作品集 v0.2 — 交互层
   原生 JS，无依赖。职责：
     1. 分类筛选（含 ?filter= 深链）——入口页点分类进来要真的筛出来
     2. 滚动淡入
     3. 导航 / 目录高亮
     4. 折叠块：+ / −、状态文案（展开 N 条口径记录）
     5. 详情页阅读进度条
     6. 回到顶部（超过一屏才出现）
   ========================================================================== */
(function () {
  'use strict';

  window.PORTFOLIO_READY = true;
  var docEl = document.documentElement;
  var reduceMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  /* ------------------------------------------------------------------------
     1. 分类筛选
     按钮：data-filter；卡片：.allgrid .card[data-cat]
     链接：portfolio.html?filter=实习交付#work
     ------------------------------------------------------------------------ */
  var filterButtons = Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
  var cards = Array.prototype.slice.call(document.querySelectorAll('.allgrid .card'));
  var countEl = document.getElementById('filter-count');
  var hintEl = document.getElementById('filter-hint');
  var currentFilter = '全部';

  function findFilter(value) {
    for (var i = 0; i < filterButtons.length; i += 1) {
      if (filterButtons[i].getAttribute('data-filter') === value) {
        return filterButtons[i];
      }
    }
    return null;
  }

  function syncUrl(type) {
    if (!window.history || !window.history.replaceState) { return; }
    try {
      var url = new URL(window.location.href);
      if (type === '全部') {
        url.searchParams.delete('filter');
      } else {
        url.searchParams.set('filter', type);
      }
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (error) {
      /* file:// 下 replaceState 可能被拒绝，忽略即可 */
    }
  }

  function applyFilter(type, options) {
    var silent = Boolean(options && options.silent);
    var shown = 0;
    currentFilter = type;

    cards.forEach(function (card) {
      var match = type === '全部' || card.getAttribute('data-cat') === type;
      card.hidden = !match;
      if (match) {
        shown += 1;
        card.classList.add('is-in');
        card.removeAttribute('aria-hidden');
      } else {
        card.setAttribute('aria-hidden', 'true');
      }
    });

    filterButtons.forEach(function (btn) {
      var active = btn.getAttribute('data-filter') === type;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    if (countEl) {
      countEl.textContent = type + ' · ' + shown + ' / ' + cards.length + ' 个项目';
    }

    if (hintEl) {
      hintEl.textContent = type === '全部'
        ? '点分类切换；「全部」恢复全部 ' + cards.length + ' 个项目。'
        : '已筛选：' + type + '。点「全部」恢复全部 ' + cards.length + ' 个项目。';
    }

    if (document.body) {
      document.body.classList.toggle('is-filtered', type !== '全部');
    }

    if (!silent) { syncUrl(type); }
  }

  if (filterButtons.length) {
    var initial = '全部';
    try {
      var params = new URLSearchParams(window.location.search);
      var requested = params.get('filter');
      if (requested && findFilter(requested)) { initial = requested; }
    } catch (error) {
      /* 老浏览器没有 URLSearchParams 时退化为「全部」 */
    }

    applyFilter(initial, { silent: true });

    filterButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var type = btn.getAttribute('data-filter');
        if (type === currentFilter) { return; }
        applyFilter(type);
        var target = document.getElementById('work');
        if (target && target.getBoundingClientRect().top < -8) {
          var nav = document.querySelector('.nav');
          var offset = (nav ? nav.getBoundingClientRect().height : 0) + 16;
          window.scrollTo({
            top: target.getBoundingClientRect().top + window.pageYOffset - offset,
            left: 0,
            behavior: reduceMotion.matches ? 'auto' : 'smooth'
          });
        }
      });
    });
  }

  /* ------------------------------------------------------------------------
     2. 滚动淡入
     ------------------------------------------------------------------------ */
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

  if (!('IntersectionObserver' in window) || reduceMotion.matches) {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    reveals.forEach(function (el) { revealObserver.observe(el); });
  }

  /* ------------------------------------------------------------------------
     3. 导航高亮（当前区块）
     链接用 data-spy="work all" 声明自己代表哪些区块 id
     ------------------------------------------------------------------------ */
  var spyLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__link[data-spy]'));

  if (spyLinks.length && 'IntersectionObserver' in window) {
    var idToLink = {};
    var spyTargets = [];

    spyLinks.forEach(function (link) {
      link.getAttribute('data-spy').split(/\s+/).forEach(function (id) {
        if (!id) { return; }
        idToLink[id] = link;
        var section = document.getElementById(id);
        if (section) { spyTargets.push(section); }
      });
    });

    var setActive = function (id) {
      spyLinks.forEach(function (link) {
        if (idToLink[id] === link) {
          if (link.getAttribute('aria-current') !== 'page') {
            link.setAttribute('aria-current', 'location');
          }
        } else if (link.getAttribute('aria-current') === 'location') {
          link.removeAttribute('aria-current');
        }
      });
    };

    var spyObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          setActive(entry.target.id);
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

    spyTargets.forEach(function (section) { spyObserver.observe(section); });
  }

  /* ------------------------------------------------------------------------
     3.5 详情页目录高亮
     目录链接 href="#id" 与 .case-sec 的 id 一一对应；
     桌面左栏与移动端 details 共用同一份状态。
     ------------------------------------------------------------------------ */
  var tocLinks = Array.prototype.slice.call(
    document.querySelectorAll('.case-toc a[href^="#"]')
  );

  if (tocLinks.length && 'IntersectionObserver' in window) {
    var tocById = {};
    var tocTargets = [];

    tocLinks.forEach(function (link) {
      var id = link.getAttribute('href').slice(1);
      if (!id) { return; }
      if (!tocById[id]) {
        tocById[id] = [];
        var section = document.getElementById(id);
        if (section) { tocTargets.push(section); }
      }
      tocById[id].push(link);
    });

    var setTocActive = function (id) {
      tocLinks.forEach(function (link) {
        var match = tocById[id] && tocById[id].indexOf(link) !== -1;
        if (match) {
          link.setAttribute('aria-current', 'true');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    };

    var tocObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { setTocActive(entry.target.id); }
      });
    }, { rootMargin: '-16% 0px -68% 0px', threshold: 0 });

    tocTargets.forEach(function (section) { tocObserver.observe(section); });

    if (tocTargets.length) { setTocActive(tocTargets[0].id); }
  }

  /* ------------------------------------------------------------------------
     4. 折叠块
     - 标题左侧的 + / − 由 CSS 画，这里只负责状态文案
     - 文案写清楚默认状态：展开 20 条口径记录 / 展开 8 节目录
     - 同一个 details 已有原生键盘支持
     ------------------------------------------------------------------------ */
  var detailBlocks = Array.prototype.slice.call(document.querySelectorAll('details'));

  detailBlocks.forEach(function (details) {
    var hint = details.querySelector('[data-hint]');
    if (!hint) { return; }

    var rows = details.querySelectorAll('tbody tr').length;
    var tocItems = details.querySelectorAll('ol a').length;
    var count = rows || tocItems;
    var unit = rows ? '条口径记录' : '节目录';

    var sync = function () {
      if (!count) {
        hint.textContent = details.open ? '收起' : '展开';
        return;
      }
      hint.textContent = (details.open ? '收起 ' : '展开 ') + count + ' ' + unit;
    };

    sync();
    details.addEventListener('toggle', sync);
  });

  /* 目录里的锚点点击后，收起移动端目录 */
  var mobileToc = document.querySelector('.case-toc--mobile');
  if (mobileToc) {
    Array.prototype.slice.call(mobileToc.querySelectorAll('a[href^="#"]')).forEach(function (link) {
      link.addEventListener('click', function () {
        mobileToc.open = false;
      });
    });
  }

  Array.prototype.slice.call(document.querySelectorAll('a[href^="#"]')).forEach(function (link) {
    link.addEventListener('click', function () {
      var id = link.getAttribute('href').slice(1);
      if (!id) { return; }

      var target = document.getElementById(id);
      if (!target) { return; }

      var details = target.tagName === 'DETAILS' ? target : target.closest('details');
      if (details) { details.open = true; }
    });
  });

  /* 从别的页面带 hash 跳进来时，也要把 details 展开 */
  if (window.location.hash.length > 1) {
    var hashTarget = document.getElementById(window.location.hash.slice(1));
    if (hashTarget) {
      var hashDetails = hashTarget.tagName === 'DETAILS'
        ? hashTarget
        : hashTarget.closest('details');
      if (hashDetails) { hashDetails.open = true; }
    }
  }

  /* 深链定位：粘顶导航会盖住标题，这里按 scroll-margin 的口径对齐 */
  function alignHashTarget() {
    if (window.location.hash.length < 2) { return; }
    var target = document.getElementById(window.location.hash.slice(1));
    if (!target) { return; }
    var nav = document.querySelector('.nav');
    var offset = (nav ? nav.getBoundingClientRect().height : 0) + 20;
    var top = target.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top: top, left: 0, behavior: 'auto' });
  }

  if (window.location.hash.length > 1) {
    window.requestAnimationFrame(alignHashTarget);
    window.addEventListener('load', alignHashTarget);
  }

  /* ------------------------------------------------------------------------
     5. 详情页阅读进度 + 回到顶部
     只加在两处通用的壳上，不改页面正文结构。
     ------------------------------------------------------------------------ */
  var caseMain = document.querySelector('.case-main');
  var progressFill = null;

  if (caseMain) {
    var bar = document.createElement('div');
    bar.className = 'read-progress';
    bar.setAttribute('aria-hidden', 'true');
    progressFill = document.createElement('span');
    progressFill.className = 'read-progress__fill';
    bar.appendChild(progressFill);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  var toTop = null;
  if (!document.querySelector('.space-stage')) {
    toTop = document.createElement('a');
    toTop.className = 'to-top';
    toTop.href = '#main';
    toTop.setAttribute('aria-label', '回到顶部');
    toTop.innerHTML = '<span aria-hidden="true">↑</span>';
    document.body.appendChild(toTop);
  }

  var ticking = false;

  function onScrollFrame() {
    ticking = false;
    var y = window.pageYOffset || docEl.scrollTop || 0;

    if (progressFill) {
      var max = docEl.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      progressFill.style.width = (ratio * 100).toFixed(2) + '%';
    }

    if (toTop) {
      toTop.classList.toggle('is-on', y > window.innerHeight);
    }
  }

  function onScroll() {
    if (ticking) { return; }
    ticking = true;
    window.requestAnimationFrame(onScrollFrame);
  }

  if (progressFill || toTop) {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScrollFrame();
  }
})();
