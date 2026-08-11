/* ==========================================================================
   preloader.js — 載入畫面控制
   在所有圖片、影片劇照與字體載入完成前，鎖住畫面不讓讀者進入報導。
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     設定區：想調整載入行為，改這裡就好
     ---------------------------------------------------------------------- */
  const CONFIG = {
    AUTO_ENTER:   true,  // true = 載完自動進入；false = 顯示「進入報導」按鈕由讀者點擊
    MIN_DURATION: 1200,  // 最短停留毫秒數（避免快網速時載入畫面一閃而過）
    MAX_DURATION: 30000, // 保險閥：超過這個毫秒數就強制放行，避免圖片壞掉時卡住讀者
    FADE_DELAY:   400    // 進度跑到 100% 後、開始淡出前的緩衝毫秒數
  };

  /* ------------------------------------------------------------------------
     取得畫面元素
     ---------------------------------------------------------------------- */
  const loader   = document.getElementById('loader');
  const barFill  = document.querySelector('.loader__bar-fill');
  const pctText  = document.querySelector('.loader__pct');
  const enterBtn = document.querySelector('.loader__enter');

  if (!loader) return;

  document.body.classList.add('is-loading');

  const startTime = Date.now();
  let finished = false;

  /* ------------------------------------------------------------------------
     蒐集需要等待的資源
     規則：頁面上所有 <img>（含影片劇照）。
     若某張圖不想納入載入計算，在該 <img> 加上 data-skip-preload 即可。
     ---------------------------------------------------------------------- */
  const images = Array.from(document.querySelectorAll('img:not([data-skip-preload])'));

  let loadedCount = 0;
  const totalCount = images.length + 1; // +1 是字體

  function tick() {
    loadedCount++;
    const ratio = Math.min(loadedCount / totalCount, 1);
    render(ratio);
    if (loadedCount >= totalCount) complete();
  }

  function render(ratio) {
    const pct = Math.round(ratio * 100);
    if (barFill) barFill.style.width = pct + '%';
    if (pctText) pctText.textContent = String(pct).padStart(3, '0') + '%';
  }

  /* ------------------------------------------------------------------------
     監聽每一張圖片
     ---------------------------------------------------------------------- */
  images.forEach(function (img) {
    // 已經在快取中、載完了
    if (img.complete && img.naturalWidth > 0) {
      tick();
      return;
    }
    // load 與 error 都算「處理完畢」，單張圖失敗不該讓整個報導卡住
    img.addEventListener('load',  tick, { once: true });
    img.addEventListener('error', tick, { once: true });
  });

  /* ------------------------------------------------------------------------
     等待字體（Noto Serif TC 檔案較大，先載完再進場才不會跳版）
     ---------------------------------------------------------------------- */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(tick).catch(tick);
  } else {
    tick();
  }

  /* ------------------------------------------------------------------------
     完成 → 淡出
     ---------------------------------------------------------------------- */
  function complete() {
    if (finished) return;
    finished = true;
    render(1);

    const elapsed = Date.now() - startTime;
    const wait = Math.max(CONFIG.MIN_DURATION - elapsed, 0) + CONFIG.FADE_DELAY;

    setTimeout(function () {
      if (CONFIG.AUTO_ENTER) {
        enter();
      } else if (enterBtn) {
        enterBtn.classList.add('is-ready');
        enterBtn.addEventListener('click', enter, { once: true });
      } else {
        enter();
      }
    }, wait);
  }

  function enter() {
    loader.classList.add('is-done');
    document.body.classList.remove('is-loading');
    // 通知其他模組：報導已開始（navigation.js 會據此啟動進場動畫）
    document.dispatchEvent(new CustomEvent('report:ready'));
  }

  /* ------------------------------------------------------------------------
     保險閥：網路異常時仍然放行
     ---------------------------------------------------------------------- */
  setTimeout(function () {
    if (!finished) complete();
  }, CONFIG.MAX_DURATION);
})();
