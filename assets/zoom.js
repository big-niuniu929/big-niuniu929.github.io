/* 图片点击放大。给 .media-card img、.plate--photo img、.mdimg 用。
   键盘 Esc 关闭，点遮罩关闭，点击图片本身不关。 */
(function () {
  if (window.__zoomReady) return;
  window.__zoomReady = true;

  var box = null;

  function ensure() {
    if (box) return box;
    box = document.createElement('div');
    box.className = 'zoom-layer';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', '查看大图');
    box.innerHTML = '<button class="zoom-close" type="button" aria-label="关闭">关闭 ✕</button><img alt="">';
    document.body.appendChild(box);
    box.addEventListener('click', function (e) {
      if (e.target.tagName !== 'IMG') close();
    });
    return box;
  }

  function open(src, alt) {
    var b = ensure();
    var img = b.querySelector('img');
    img.src = src;
    img.alt = alt || '';
    b.classList.add('is-on');
    document.documentElement.classList.add('zoom-open');
  }

  function close() {
    if (!box) return;
    box.classList.remove('is-on');
    document.documentElement.classList.remove('zoom-open');
  }

  document.addEventListener('click', function (e) {
    var img = e.target.closest('.media-card img, .media-demo img, .plate--photo img');
    if (!img) return;
    e.preventDefault();
    open(img.currentSrc || img.src, img.alt);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
})();
