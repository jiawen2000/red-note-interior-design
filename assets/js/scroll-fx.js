/* ==========================================================================
   scroll-fx.js — 三個與捲動連動的影片效果 ＋ 全站聲音開關

   1. 封面 Hero      影片 sticky；第一段捲動只讓標題淡出，第二段才讓影片淡出
   2. 沉浸式影片      sticky 釘住 → 放大到滿版 → 循環播放（有聲）→ 停止 → 淡出
   3. Scroll scrub   捲動位置直接對應 video.currentTime，停止捲動就停在當前影格

   所有位置計算都集中在一個 requestAnimationFrame 迴圈，
   捲動事件只負責標記「需要更新」，避免 layout thrashing。

   ⚠ 三者都依賴 position: sticky。00-base.css 的 html/body 必須是
     overflow-x: clip，不能改回 hidden，否則 sticky 會全部失效。
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     可調參數：每個階段各佔捲動進度的哪一段（0 = 區塊開始，1 = 區塊結束）
     ---------------------------------------------------------------------- */
  const CONF = {
    cover:     { textOut: [0.00, 0.30], videoOut: [0.55, 0.92] },
    immersive: { fadeIn: [0.00, 0.12], fadeOut: [0.86, 1.00], scaleIn: [0.00, 0.20] },
    scrub:     { fadeIn: [0.00, 0.06], fadeOut: [0.94, 1.00], scaleIn: [0.00, 0.10] }
  };
  /* Safari：差距小於這個秒數就不重新 seek。
     手機（尤其 iOS）對高解析度影片的頻繁 seek 特別吃記憶體，容易讓分頁崩潰，
     所以窄畫面改用較小的影片檔，門檻也放寬，減少 seek 次數。 */
  const NARROW_VIEW = window.matchMedia('(max-aspect-ratio: 3/2)');
  const SEEK_THRESHOLD = NARROW_VIEW.matches ? 0.07 : 0.02;

  /* 沉浸式影片的循環設定 */
  const AUDIO = {
    loopGap: 1000       // 播完到下一次重播之間的間隔（毫秒），期間停在最後一格
  };

  const clamp01 = function (v) { return v < 0 ? 0 : (v > 1 ? 1 : v); };
  const ramp = function (p, a, b) { return clamp01((p - a) / (b - a)); };

  /* ------------------------------------------------------------------------
     聲音管理
     預設「要有聲音」。瀏覽器擋下有聲自動播放時，先靜音播放，
     等讀者第一次操作頁面（點擊／觸控／按鍵）再自動打開聲音。
     ---------------------------------------------------------------------- */
  const SOUND = { wanted: true, unlocked: false };
  const audible = [];            // 需要有聲音的影片
  const soundBtn = document.getElementById('cover-sound');

  // 讀者「應該聽得到聲音」的條件：想要有聲音，而且瀏覽器已經允許
  function wantAudible() { return SOUND.wanted && SOUND.unlocked; }

  // 圖示反映的是讀者的意願與瀏覽器是否已放行，
  // 不受封面淡出時的暫時靜音影響
  function syncIcon() {
    if (!soundBtn) return;
    const on = wantAudible();
    soundBtn.classList.toggle('is-muted', !on);
    soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    soundBtn.setAttribute('aria-label', on ? '關閉聲音' : '開啟聲音');
  }

  // 封面影片不在這裡處理，統一由 applyCoverAudio 決定，避免兩邊互相覆蓋
  function applySound() {
    audible.forEach(function (v) {
      if (v !== coverVideo) v.muted = !wantAudible();
    });
    applyCoverAudio();
    syncIcon();
  }

  function tryPlay(v, wantSound) {
    if (!v) return;
    v.muted = !(wantSound && SOUND.wanted && SOUND.unlocked);
    const p = v.play();
    if (p && p.catch) {
      p.catch(function () {
        // 有聲播放被擋 → 先靜音播放，聲音等讀者操作後再開
        v.muted = true;
        const q = v.play();
        if (q && q.catch) q.catch(function () {});
        syncIcon();          // 圖示要反映實際狀態，不能顯示成有聲
      });
    }
  }

  /* ⚠ 不做「第一次操作就自動開聲音」。
     手機上捲動會產生 touchstart，被當成使用者操作後聲音就自己打開了；
     桌機用滾輪捲動不會觸發，所以只有手機出問題。
     現在一律只有按下右上角的聲音鍵才會開啟聲音，行為在各裝置上一致。 */
  function dropGestureListeners() { /* 已不再註冊全域監聽，保留空函式供呼叫端使用 */ }



  // 讀者按下聲音鍵之後，讓已經在播的影片重新套用音訊
  function unlock() {
    if (SOUND.unlocked) return;
    SOUND.unlocked = true;
    applySound();
    // 已經在播的影片重新 play 一次，讓解除靜音後的音訊生效
    audible.forEach(function (v) {
      if (v !== coverVideo && !v.paused) {
        const p = v.play(); if (p && p.catch) p.catch(function () {});
      }
    });
  }

  if (soundBtn) {
    soundBtn.addEventListener('click', function () {
      // 依「現在實際上聽不聽得到」決定下一個狀態
      // 第一次點擊時 unlocked 還是 false，所以 currentlyOn = false → 開啟聲音
      const currentlyOn = wantAudible();
      SOUND.unlocked = true;               // 點擊本身就是瀏覽器認可的使用者操作
      dropGestureListeners();
      SOUND.wanted = !currentlyOn;
      applySound();
    });
  }

  /* ------------------------------------------------------------------------
     取得區塊的捲動進度：0 = 剛開始釘住，1 = 即將解除釘住
     ---------------------------------------------------------------------- */
  function progressOf(section) {
    const rect = section.getBoundingClientRect();
    const travel = section.offsetHeight - window.innerHeight;
    if (travel <= 0) return rect.top <= 0 ? 1 : 0;
    return clamp01(-rect.top / travel);
  }

  /* ------------------------------------------------------------------------
     1. 封面 Hero
     ---------------------------------------------------------------------- */
  const coverScroll = document.getElementById('cover-scroll');
  const cover = document.getElementById('cover');
  const coverVideo = document.getElementById('cover-video');
  if (coverVideo) audible.push(coverVideo);

  // 封面目前的淡出程度（1 = 完全顯示，0 = 完全淡出）
  let coverFade = 1;
  let coverStarted = false;

  function updateCover() {
    if (!coverScroll || !cover) return;
    const p = progressOf(coverScroll);
    const c = CONF.cover;
    coverFade = 1 - ramp(p, c.videoOut[0], c.videoOut[1]);
    cover.style.setProperty('--cover-text-fade',  (1 - ramp(p, c.textOut[0], c.textOut[1])).toFixed(3));
    cover.style.setProperty('--cover-video-fade', coverFade.toFixed(3));
    applyCoverAudio();
  }

  /* 畫面淡出 → 音量同步淡出 → 完全看不見時直接暫停播放
     （只把 volume 設成 0 不夠：讀者一旦按下聲音鍵或第一次點擊頁面，
       muted 被解除、volume 又可能被重設，聲音就會跑出來） */
  function applyCoverAudio() {
    if (!coverVideo) return;
    const visible = coverFade > 0.01;

    // 三重保險：看不見時「音量歸零 + 強制靜音 + 暫停播放」
    coverVideo.volume = clamp01(coverFade);
    coverVideo.muted = !(wantAudible() && visible);

    if (!visible) {
      if (!coverVideo.paused) coverVideo.pause();
    } else if (coverStarted && coverVideo.paused) {
      const q = coverVideo.play();
      if (q && q.catch) q.catch(function () {});
    }
  }

  /* ------------------------------------------------------------------------
     2. 沉浸式影片（循環播放，保留聲音）
     ---------------------------------------------------------------------- */
  const immersives = Array.from(document.querySelectorAll('.m-immersive')).map(function (sec) {
    const v = sec.querySelector('.stage__video');
    if (v) audible.push(v);
    const o = { sec: sec, stage: sec.querySelector('.stage'), video: v, playing: false, gapTimer: null };

    /* 不使用 <video loop>，改成「播完 → 停在最後一格 → 隔幾秒再從頭播」，
       讓兩次循環之間有一段留白，聲音也才有機會重新淡入 */
    if (v) {
      v.addEventListener('ended', function () {
        if (!o.playing) return;
        clearTimeout(o.gapTimer);
        o.gapTimer = setTimeout(function () {
          if (!o.playing) return;
          v.currentTime = 0;
          tryPlay(v, true);
        }, AUDIO.loopGap);
      });
    }
    return o;
  });

  function startImmersive(o) {
    clearTimeout(o.gapTimer);
    try { o.video.currentTime = 0; } catch (e) {}
    tryPlay(o.video, true);
  }

  function stopImmersive(o) {
    clearTimeout(o.gapTimer);
    o.video.pause();
  }

  function updateImmersive(o) {
    const p = progressOf(o.sec);
    const c = CONF.immersive;
    const fade = Math.min(ramp(p, c.fadeIn[0], c.fadeIn[1]), 1 - ramp(p, c.fadeOut[0], c.fadeOut[1]));
    const scale = 0.9 + 0.1 * ramp(p, c.scaleIn[0], c.scaleIn[1]);
    if (o.stage) {
      o.stage.style.setProperty('--v-fade', fade.toFixed(3));
      o.stage.style.setProperty('--v-scale', scale.toFixed(3));
    }
    /* 播放與否以「畫面上看不看得見」為準，而不是捲動進度落在哪個區間。
       這樣不論從上面滑下來或從下面滑上來，只要影片重新出現，
       都會從第 0 秒開始播；完全淡出後就停止。 */
    const visible = fade > 0.02;
    if (o.video && visible !== o.playing) {
      o.playing = visible;
      if (visible) startImmersive(o);
      else stopImmersive(o);
    }
  }

  /* ------------------------------------------------------------------------
     3. Scroll scrub 影片（捲動位置 = 播放進度）
     ---------------------------------------------------------------------- */
  const scrubs = Array.from(document.querySelectorAll('.m-scrub')).map(function (sec) {
    const video = sec.querySelector('.stage__video');
    const o = { sec: sec, stage: sec.querySelector('.stage'), video: video, ready: false, target: 0 };

    /* 窄畫面（手機直式）：直接換成事先排好直式版型的影片檔。
       影片本身就是 1080x1920，不需要任何偵測、裁切或局部放大。
       想換影片只要改 index.html 裡的 data-src-narrow / data-poster-narrow。 */
    if (video && NARROW_VIEW.matches) {
      const small  = video.dataset.srcNarrow;
      const poster = video.dataset.posterNarrow;
      if (poster) video.poster = poster;
      if (small) { video.src = small; video.load(); sec.classList.add('is-narrow-src'); }

      /* iOS Safari 在影片「從未播放過」之前不會把畫面畫出來，
         只設定 currentTime 是看不到東西的。這裡靜音播一下再暫停，
         逼它渲染第一格。 */
      const kick = function () {
        video.muted = true;
        const q = video.play();
        if (q && q.then) q.then(function () { video.pause(); }).catch(function () {});
        else { try { video.pause(); } catch (e) {} }
      };
      video.addEventListener('loadeddata', kick, { once: true });
      if (video.readyState >= 2) kick();
    }
    if (video) {
      // metadata 載入完成前 video.duration 還不是有效數值
      const onMeta = function () {
        if (!isFinite(video.duration) || video.duration <= 0) return;
        o.ready = true;
        sec.classList.add('is-ready');
        seek(o);                       // 立刻同步到目前的捲動位置
      };
      if (video.readyState >= 1) onMeta();
      video.addEventListener('loadedmetadata', onMeta);
      video.addEventListener('error', function () { sec.classList.add('is-ready'); });
    }
    return o;
  });

  function seek(o) {
    if (!o.ready || !o.video) return;
    const t = o.target * o.video.duration;
    if (Math.abs(o.video.currentTime - t) > SEEK_THRESHOLD) o.video.currentTime = t;
  }

  function updateScrub(o) {
    const p = progressOf(o.sec);
    const c = CONF.scrub;
    const fade = Math.min(ramp(p, c.fadeIn[0], c.fadeIn[1]), 1 - ramp(p, c.fadeOut[0], c.fadeOut[1]));
    const scale = 0.94 + 0.06 * ramp(p, c.scaleIn[0], c.scaleIn[1]);
    if (o.stage) {
      o.stage.style.setProperty('--v-fade', fade.toFixed(3));
      o.stage.style.setProperty('--v-scale', scale.toFixed(3));
      o.stage.style.setProperty('--v-progress', p.toFixed(4));
    }
    o.target = p;
    seek(o);
  }

  /* ------------------------------------------------------------------------
     單一 rAF 迴圈
     ---------------------------------------------------------------------- */
  let ticking = false;
  function frame() {
    ticking = false;
    updateCover();
    immersives.forEach(updateImmersive);
    scrubs.forEach(updateScrub);
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  /* ------------------------------------------------------------------------
     啟動
     ---------------------------------------------------------------------- */
  function start() {
    applySound();
    tryPlay(coverVideo, true);
    coverStarted = true;
    frame();
  }
  document.addEventListener('report:ready', start);
  if (!document.getElementById('loader')) start();
})();
