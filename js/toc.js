/* ==========================================================================
   toc.js — 左側小標目錄

   目錄依內文的 <h3 class="h3" id="..."> 自動生成，
   小標改名或增刪都不用另外維護這份清單。

   顯示規則：
     · 讀者還停在封面時不顯示
     · 進入三段滿版影片（封面 Hero、小紅書剪輯、互動資訊）時自動隱藏，
       避免蓋住沉浸式畫面
     · 頁尾頂端分隔線進入畫面時自動淡出，避免與頁尾重疊
     · 其餘時間顯示，並標出目前所在的小標
   ========================================================================== */

(function () {
  'use strict';

  const heads = Array.from(document.querySelectorAll('#report .h3[id]'));
  if (heads.length < 2) return;

  /* ------------------------------------------------------------------------
     建立目錄
     ---------------------------------------------------------------------- */
  const nav = document.createElement('nav');
  nav.id = 'toc';
  nav.setAttribute('aria-label', '小標目錄');

  const title = document.createElement('p');
  title.className = 'toc__title';
  title.textContent = 'CONTENTS';
  nav.appendChild(title);

  const ul = document.createElement('ul');
  ul.className = 'toc__list';

  const links = heads.map(function (h, i) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'toc__link';
    a.href = '#' + h.id;
    // 小標裡可能包著名詞按鈕，用 textContent 取純文字；目錄一律用半形空格
    a.innerHTML = '<span class="toc__num">' + String(i + 1).padStart(2, '0') + '</span>' +
                  '<span class="toc__text"></span>';
    a.querySelector('.toc__text').textContent = h.textContent.trim().replace(/\u3000/g, ' ');
    li.appendChild(a);
    ul.appendChild(li);
    return a;
  });

  nav.appendChild(ul);
  document.body.appendChild(nav);

  /* ------------------------------------------------------------------------
     捲動時更新狀態
     ---------------------------------------------------------------------- */
  const cover = document.getElementById('cover-scroll');
  const footer = document.getElementById('footer');
  // 三段滿版影片：目錄經過時要讓路
  const fullBleed = Array.from(document.querySelectorAll('.m-immersive, .m-scrub'));

  function coversMiddle(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const mid = (window.innerHeight || 1) * 0.5;
    return r.top <= mid && r.bottom >= mid;
  }

  function footerLineIsVisible() {
    if (!footer) return false;
    // 頁尾的 border-top 就是長灰色細線；它進入視窗時開始淡出目錄
    return footer.getBoundingClientRect().top <= (window.innerHeight || 0);
  }

  let current = -1;
  function update() {
    // 封面、滿版影片或頁尾分隔線進入畫面時不顯示
    let hide = coversMiddle(cover) || footerLineIsVisible();
    if (!hide) {
      for (let i = 0; i < fullBleed.length; i++) {
        if (coversMiddle(fullBleed[i])) { hide = true; break; }
      }
    }
    nav.classList.toggle('is-on', !hide);

    // 目前所在的小標：基準線以上、最後一個經過的
    const line = window.innerHeight * 0.32;
    let idx = -1;
    for (let i = 0; i < heads.length; i++) {
      if (heads[i].getBoundingClientRect().top <= line) idx = i;
    }
    if (idx === current) return;
    current = idx;
    links.forEach(function (a, i) {
      a.classList.toggle('is-active', i === idx);
      if (i === idx) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    // 目錄本身太長時，讓目前項目保持在可見範圍內
    if (idx >= 0 && nav.scrollHeight > nav.clientHeight) {
      const a = links[idx];
      const top = a.offsetTop - nav.clientHeight / 2 + a.offsetHeight / 2;
      nav.scrollTo({ top: top, behavior: 'smooth' });
    }
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { update(); ticking = false; });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  document.addEventListener('report:ready', update);
  update();
})();
