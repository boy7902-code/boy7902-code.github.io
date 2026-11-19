/* 미션 목록이 첫 화면에서 행 중간이 잘려 보이지 않도록, 보이는 높이를 "온전한 행" 단위로 맞춥니다.
   모든 행은 스크롤로 계속 닿을 수 있고, 1024px 미만(모바일)에서는 아무것도 하지 않습니다. */
(function () {
  'use strict';
  var list = document.getElementById('choreList');
  if (!list || typeof window.matchMedia !== 'function') return;
  var wide = window.matchMedia('(min-width: 1024px)');
  var busy = false;
  function reset() { list.style.flex = ''; list.style.height = ''; list.style.maxHeight = ''; }
  function fit() {
    if (busy) return;
    busy = true;
    try {
      reset();
      if (!wide.matches) return;
      var avail = list.clientHeight;
      var rows = list.querySelectorAll(':scope > .chore');
      if (!rows.length || list.scrollHeight <= avail + 1) return;
      var top = list.getBoundingClientRect().top - list.scrollTop;
      var cs = getComputedStyle(list);
      var best = 0;
      for (var i = 0; i < rows.length; i++) {
        var bottom = rows[i].getBoundingClientRect().bottom - top;
        if (bottom <= avail - 1) best = bottom; else break;
      }
      if (best > 0 && best < avail) {
        list.style.flex = '0 0 auto';
        list.style.height = Math.ceil(best + 4) + 'px';
      }
    } finally { busy = false; }
  }
  var raf = 0;
  function schedule() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; fit(); }); }
  if (typeof MutationObserver === 'function') new MutationObserver(schedule).observe(list, { childList: true, subtree: true, characterData: true });
  if (typeof ResizeObserver === 'function' && list.parentElement) new ResizeObserver(schedule).observe(list.parentElement);
  window.addEventListener('resize', schedule);
  if (wide.addEventListener) wide.addEventListener('change', schedule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  schedule();
})();
