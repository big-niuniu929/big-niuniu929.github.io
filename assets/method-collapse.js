/* 方法页：逐节折叠 + 全部收起。纯渐进增强，没有 JS 也能正常读。 */
(function () {
  var sections = Array.prototype.slice.call(document.querySelectorAll('.section'));
  if (!sections.length) { return; }

  function setState(sec, collapsed) {
    sec.classList.toggle('is-collapsed', collapsed);
    var btn = sec.querySelector('.sec-collapse');
    if (btn) { btn.textContent = collapsed ? '展开' : '收起'; }
  }

  sections.forEach(function (sec) {
    var btn = sec.querySelector('.sec-collapse');
    if (!btn) { return; }
    btn.addEventListener('click', function () {
      setState(sec, !sec.classList.contains('is-collapsed'));
    });
  });

  var all = document.querySelector('[data-collapse-all]');
  if (all) {
    all.addEventListener('click', function () {
      var anyOpen = sections.some(function (s) { return !s.classList.contains('is-collapsed'); });
      sections.forEach(function (s) { setState(s, anyOpen); });
      all.textContent = anyOpen ? '全部展开' : '全部收起';
    });
  }

  /* 从跳转锚点进来时，自动展开目标节 */
  document.querySelectorAll('.method-jump a').forEach(function (a) {
    a.addEventListener('click', function () {
      var id = a.getAttribute('href').slice(1);
      var target = document.getElementById(id);
      if (target) { setState(target, false); }
    });
  });
})();
