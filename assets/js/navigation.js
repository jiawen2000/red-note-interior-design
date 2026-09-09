/* ==========================================================================
   navigation.js — 閱讀進度條、回到頂端、捲動進場動畫
   ========================================================================== */

(function () {
  'use strict';

  const barFill = document.querySelector('#progress-bar .bar__fill');
  const toTop   = document.querySelector('.to-top');

  /* ------------------------------------------------------------------------
     1. 閱讀進度條（頂部橫向）
     ---------------------------------------------------------------------- */
  function updateProgress() {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
    const pct = Math.min(Math.max(ratio, 0), 1) * 100;

    if (barFill) barFill.style.width = pct + '%';
    if (toTop) toTop.classList.toggle('is-on', window.scrollY > window.innerHeight);
  }

  /* ------------------------------------------------------------------------
     2. 捲動監聽（用 requestAnimationFrame 節流，避免效能問題）
     ---------------------------------------------------------------------- */
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      updateProgress();
      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  /* ------------------------------------------------------------------------
     3. 平滑捲動（頁面內的錨點連結）
     ---------------------------------------------------------------------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      const id = link.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  /* ------------------------------------------------------------------------
     4. 捲動進場動畫
        任何元素加上 class="reveal" 就會在進入畫面時淡入
     ---------------------------------------------------------------------- */
  function initReveal() {
    const items = document.querySelectorAll('.reveal');
    if (!items.length) return;

    // 舊瀏覽器不支援 IntersectionObserver 時，直接全部顯示
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------------
     5. 啟動：等載入畫面結束後才開始（preloader.js 會發出 report:ready）
     ---------------------------------------------------------------------- */
  document.addEventListener('report:ready', function () {
    initReveal();
    onScroll();
  });

  // 若沒有載入畫面（例如單獨測試某個區塊），仍然要能運作
  window.addEventListener('load', function () {
    if (!document.getElementById('loader')) {
      initReveal();
      onScroll();
    }
  });
})();
