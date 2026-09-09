/* ==========================================================================
   preloader.js — 載入畫面控制

   設計原則：兩個條件同時滿足
     ① 封面影片一定完整載完才放行（一進來就在播，不能卡）
     ② 讀者最多等 30 秒

   慢速網路下這兩件事會衝突，所以做法是「把等待範圍縮到最小 + 硬性上限」：

   等待清單（電腦約 6.3 MB／手機約 4.8 MB）：
     · 封面影片 ← 完整載完
       電腦 cover-lu-home.mp4（4.9 MB）／手機 cover-mobile.mp4（3.4 MB）
       由 index.html 裡封面 <video> 後面的行內腳本依螢幕比例挑一支
     · 字體 Noto Serif TC
     · 前 3 張照片（WAIT_IMAGE_COUNT）—— 避免剛進去就看到空白圖框

   不等、但持續在背景下載：
     · 其餘 22 張照片（讀者要滑一段才會看到）
     · 小紅書精華剪輯 copypaste.mp4（4.5 MB）
     · Anson 的家 table.mp4 / table-mobile.mp4（19.9 / 12.9 MB）
     這幾項都在報導中後段，讀者讀前面文字的時間足夠它們載完。

   MAX_DURATION 設 30 秒，是「無論如何都要放行」的硬性上限。
   極慢的網路下若 30 秒還沒載完封面影片，仍會放行 ——
   否則就違反條件②。這時封面會先顯示劇照，影片緩衝好再接上。

   想調整等待範圍：
     · 照片全部都等 → WAIT_IMAGE_COUNT 改成 Infinity
     · 某支影片也要等 → 拿掉 index.html 上它的 data-skip-preload
     · 影片只等到「能開始播」→ WAIT_VIDEOS_FULLY 改成 false
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     設定區：想調整載入行為，改這裡就好
     ---------------------------------------------------------------------- */
  const CONFIG = {
    AUTO_ENTER:         true,   // true = 載完自動進入；false = 顯示「進入報導」按鈕由讀者點擊
    WAIT_VIDEOS_FULLY:  true,   // true = 等影片整支下載完；false = 等到「可以開始播」就好
    MIN_DURATION:       1200,   // 最短停留毫秒數（避免快網速時載入畫面一閃而過）
    MAX_DURATION:       30000,  // 硬性上限：無論如何最多等這麼久就放行（30 秒）
    WAIT_IMAGE_COUNT:   3,      // 只等前幾張照片；其餘背景載。改成 Infinity = 全部都等
    STALL_TIMEOUT:      25000,  // 某支影片緩衝停滯這麼久，就視同載完（封面影片不適用）
    FADE_DELAY:         400     // 進度跑到 100% 後、開始淡出前的緩衝毫秒數
  };

  /* 進度條的權重（單位：MB）。
     照片和影片的大小差了幾十倍，若每個資源都算 1 份，
     進度條會在照片載完後瞬間衝到 9 成，然後卡在那裡好幾分鐘。
     這裡改用實際容量當權重，跑出來的百分比才貼近真實進度。
     換影片時記得同步更新 index.html 上的 data-mb。 */
  const WEIGHT = {
    fonts:        1.5,  // Noto Serif TC
    videoDefault: 5     // <video> 沒寫 data-mb 時的預設值
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

     · 頁面上所有 <img>
     · 頁面上所有 <video>（封面、沉浸式、scroll scrub）
     · 字體

     不想納入載入計算的話，在該元素加上 data-skip-preload 即可。
     ---------------------------------------------------------------------- */
  const allImages = Array.from(document.querySelectorAll('img:not([data-skip-preload])'));
  const videos    = Array.from(document.querySelectorAll('video:not([data-skip-preload])'));

  /* 只等前 WAIT_IMAGE_COUNT 張。其餘照片不在等待清單裡，
     但瀏覽器照樣會在背景下載（<img> 本來就會自己載）。 */
  const images = CONFIG.WAIT_IMAGE_COUNT === Infinity
    ? allImages
    : allImages.slice(0, CONFIG.WAIT_IMAGE_COUNT);

  // 每張照片的權重＝25 張照片總量（4.9 MB）平均分攤
  const imgWeight = allImages.length ? 4.9 / allImages.length : 0;

  const imgState   = images.map(function () { return 0; });   // 0 未載完 / 1 已載完
  const videoState = videos.map(function (v) {
    return {
      el:       v,
      mb:       parseFloat(v.dataset.mb) || WEIGHT.videoDefault,
      ratio:    0,      // 已緩衝比例 0~1
      done:     false,
      lastMove: Date.now()
    };
  });
  let fontDone = false;

  const totalWeight =
    imgWeight * images.length +
    videoState.reduce(function (s, o) { return s + o.mb; }, 0) +
    WEIGHT.fonts;

  /* ------------------------------------------------------------------------
     進度計算與繪製
     ---------------------------------------------------------------------- */
  function loadedWeight() {
    let w = 0;
    imgState.forEach(function (d) { w += d * imgWeight; });
    videoState.forEach(function (o) { w += (o.done ? 1 : o.ratio) * o.mb; });
    if (fontDone) w += WEIGHT.fonts;
    return w;
  }

  function render() {
    const pct = Math.round(Math.min(loadedWeight() / totalWeight, 1) * 100);
    if (barFill) barFill.style.width = pct + '%';
    // 兩位數以上直接顯示（85%、100%），個位數才補一個 0（05%）
    if (pctText) pctText.textContent = String(pct).padStart(2, '0') + '%';
  }

  function checkDone() {
    render();
    const ok = imgState.every(function (d) { return d === 1; }) &&
               videoState.every(function (o) { return o.done; }) &&
               fontDone;
    if (ok) complete();
  }

  /* ------------------------------------------------------------------------
     照片
     load 與 error 都算「處理完畢」，單張圖失敗不該讓整個報導卡住
     ---------------------------------------------------------------------- */
  images.forEach(function (img, i) {
    const tick = function () { imgState[i] = 1; checkDone(); };
    if (img.complete && img.naturalWidth > 0) { imgState[i] = 1; return; }
    img.addEventListener('load',  tick, { once: true });
    img.addEventListener('error', tick, { once: true });
  });

  /* ------------------------------------------------------------------------
     影片

     怎麼判斷「載完了」：
     用 video.buffered 算出已緩衝到第幾秒，除以總長度就是完成比例。
     比例到 99.5% 以上視為載完。

     為什麼還需要 STALL_TIMEOUT：
     iOS Safari 會自己決定要緩衝多少，不一定會把整支載完，
     buffered 可能停在某個值就不再前進。若死等就會永遠卡在載入畫面。
     所以只要某支影片的緩衝停滯超過 STALL_TIMEOUT，就視同它載完了。
     ---------------------------------------------------------------------- */
  function ratioOf(v) {
    if (!v.duration || !isFinite(v.duration) || v.duration <= 0) return 0;
    let end = 0;
    for (let i = 0; i < v.buffered.length; i++) {
      if (v.buffered.end(i) > end) end = v.buffered.end(i);
    }
    return Math.min(end / v.duration, 1);
  }

  function markDone(o) {
    if (o.done) return;
    o.done = true;
    o.ratio = 1;
    warmUp(o.el);
    checkDone();
  }

  /* 封面影片載完的當下就靜音播起來 —— 此時載入畫面還蓋在上面，看不到也聽不到。
     等載入畫面淡出時，影片早已經在跑，不會出現「進去了但畫面還是靜止劇照」。

     為什麼要這樣做：
     瀏覽器的自動播放政策只允許「靜音」的影片自動播放。若等到進場才呼叫
     play()，中間任何一個環節失敗（影片還沒 ready、政策擋下）就會停在劇照上，
     而補播的 updateCover() 只在捲動時執行，讀者停著不動就沒人補。
     先播起來最單純，也最不會出錯。
     聲音由 scroll-fx.js 的 applyCoverAudio() 在讀者按下聲音鍵後接手。 */
  function warmUp(v) {
    if (!v || v.id !== 'cover-video') return;
    v.muted = true;                     // 未經使用者操作，只有靜音能自動播
    const p = v.play();
    if (p && p.catch) p.catch(function () { /* 被擋下就保留 poster，進場後再補 */ });
  }

  videoState.forEach(function (o) {
    const v = o.el;

    // 不等整支載完的模式：能開始播就算數
    if (!CONFIG.WAIT_VIDEOS_FULLY) {
      if (v.readyState >= 3) { markDone(o); return; }
      v.addEventListener('canplay', function () { markDone(o); }, { once: true });
      v.addEventListener('error',   function () { markDone(o); }, { once: true });
      return;
    }

    const update = function () {
      const r = ratioOf(v);
      if (r > o.ratio + 0.001) {
        o.ratio = r;
        o.lastMove = Date.now();
      }
      if (o.ratio >= 0.995) markDone(o);
      else render();
    };

    v.addEventListener('progress',      update);
    v.addEventListener('loadeddata',    update);
    v.addEventListener('canplaythrough', function () { update(); });
    // 載入失敗時不要卡住讀者，保留 poster 靜圖繼續往下
    v.addEventListener('error',   function () { markDone(o); });
    v.addEventListener('abort',   function () { markDone(o); });
    v.addEventListener('stalled', update);
    v.addEventListener('suspend', update);
  });

  /* progress 事件在某些瀏覽器上很稀疏，另外用計時器定期回報，
     順便偵測「緩衝停滯」。 */
  const poll = setInterval(function () {
    if (finished) { clearInterval(poll); return; }
    const now = Date.now();
    videoState.forEach(function (o) {
      if (o.done || !CONFIG.WAIT_VIDEOS_FULLY) return;
      const r = ratioOf(o.el);
      if (r > o.ratio + 0.001) { o.ratio = r; o.lastMove = now; }
      if (o.ratio >= 0.995) { markDone(o); return; }
      /* 緩衝不再前進 → 瀏覽器決定不再往下載，別再等它。
         ⚠ 封面影片除外：它必須真的整支載完才放行，
         否則進場後影片可能還在緩衝、畫面停在劇照上。
         真的卡住時仍有 MAX_DURATION 這道保險閥。 */
      if (o.el.id === 'cover-video') return;
      if (now - o.lastMove > CONFIG.STALL_TIMEOUT) markDone(o);
    });
    checkDone();
  }, 400);

  /* ------------------------------------------------------------------------
     等待字體（Noto Serif TC 檔案較大，先載完再進場才不會跳版）
     ---------------------------------------------------------------------- */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready
      .then(function () { fontDone = true; checkDone(); })
      .catch(function () { fontDone = true; checkDone(); });
  } else {
    fontDone = true;
  }

  // 先畫一次，並處理「所有東西都在快取裡」的情況
  render();
  checkDone();

  /* ------------------------------------------------------------------------
     完成 → 淡出
     ---------------------------------------------------------------------- */
  function complete() {
    if (finished) return;
    finished = true;
    clearInterval(poll);
    if (barFill) barFill.style.width = '100%';
    if (pctText) pctText.textContent = '100%';

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

    // 載入期間 body 是鎖住的，解鎖的瞬間有些瀏覽器會把捲動位置還原回去，
    // 這裡再歸零一次（網址帶錨點時不動，保留跳轉行為）
    if (!location.hash) window.scrollTo(0, 0);

    /* 進場時確保封面影片開始播放（部分瀏覽器會在背景分頁暫停自動播放）。
       ⚠ 一定要先 muted = true 再 play()。封面影片是有聲的，
       沒有使用者操作就呼叫有聲 play()，一定會被自動播放政策擋下，
       這個失敗的呼叫會干擾緊接著 scroll-fx.js 的播放。
       正確的靜音狀態由 scroll-fx.js 的 applyCoverAudio() 在
       report:ready 之後接手決定。 */
    const coverVideo = document.getElementById('cover-video');
    if (coverVideo && coverVideo.paused) {
      coverVideo.muted = true;
      const p = coverVideo.play();
      if (p && p.catch) p.catch(function () { /* 被擋下時保留 poster 靜圖 */ });
    }

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
