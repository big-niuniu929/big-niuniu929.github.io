/* 白天 / 夜间切换（只在阅读页启用：案例、方法；入口页保持深色身份）
 *
 * 规则：
 *   1. 默认深色（站点的身份）
 *   2. 用户点过就记住（localStorage）
 *   3. URL 带 ?theme=light / ?theme=dark 时以 URL 为准（方便分享和截图）
 *   4. 不自动跟随系统：入口页的星空与地球是设计的一部分，不能被系统设置推翻
 */
(function () {
  var KEY = 'dsh-theme';
  var root = document.documentElement;

  function readParam() {
    try {
      var q = new URLSearchParams(window.location.search).get('theme');
      return (q === 'light' || q === 'dark') ? q : null;
    } catch (e) { return null; }
  }

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function apply(theme) {
    if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }
    var btn = document.querySelector('.theme-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      btn.querySelector('.theme-toggle__label').textContent = theme === 'light' ? '夜间' : '白天';
    }
  }

  var initial = readParam() || stored() || 'dark';
  apply(initial);

  function mount() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    btn.setAttribute('aria-label', '切换白天 / 夜间');
    btn.innerHTML = '<span class="theme-toggle__label">白天</span>';
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* 隐私模式忽略 */ }
    });
    document.body.appendChild(btn);
    apply(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
