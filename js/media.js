/* ==========================================================================
   media.js — 影片模組
   HTML 只要寫：
     <figure class="m-video" data-video-type="file"    data-video-src="assets/video/xxx.mp4">
     <figure class="m-video" data-video-type="youtube" data-video-src="影片ID">
     <figure class="m-video" data-video-type="vimeo"   data-video-src="影片ID">
   data-video-src 留空時，會自動退回只顯示劇照，不會壞版。
   ========================================================================== */

(function () {
  'use strict';

  document.querySelectorAll('.m-video').forEach(function (fig) {
    const type  = (fig.dataset.videoType || 'file').toLowerCase();
    const src   = (fig.dataset.videoSrc  || '').trim();
    const frame = fig.querySelector('.m-video__frame');
    const play  = fig.querySelector('.m-video__play');
    if (!frame) return;

    /* --------------------------------------------------------------------
       尚未提供影片來源 → 顯示「影片待補」標記，並移除播放鍵
       -------------------------------------------------------------------- */
    if (!src) {
      if (play) play.remove();
      const tag = document.createElement('span');
      tag.className = 'm-video__pending';
      tag.textContent = '影片待補';
      frame.appendChild(tag);
      return;
    }

    /* --------------------------------------------------------------------
       有來源 → 點擊播放鍵時才真正載入播放器
       （避免一開始就下載影片，拖慢載入速度）
       -------------------------------------------------------------------- */
    if (!play) return;

    play.addEventListener('click', function () {
      let player;

      if (type === 'youtube') {
        player = document.createElement('iframe');
        player.src = 'https://www.youtube-nocookie.com/embed/' + src + '?autoplay=1&rel=0';
        player.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture';
        player.allowFullscreen = true;

      } else if (type === 'vimeo') {
        player = document.createElement('iframe');
        player.src = 'https://player.vimeo.com/video/' + src + '?autoplay=1';
        player.allow = 'autoplay; fullscreen; picture-in-picture';
        player.allowFullscreen = true;

      } else {
        // 本地 mp4 檔
        player = document.createElement('video');
        player.src = src;
        player.controls = true;
        player.autoplay = true;
        player.playsInline = true;      // iPhone 不強制全螢幕
        const poster = fig.querySelector('img');
        if (poster) player.poster = poster.currentSrc || poster.src;
      }

      frame.appendChild(player);
      fig.classList.add('is-playing');
    }, { once: true });
  });
})();
