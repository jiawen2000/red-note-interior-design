/* ==========================================================================
   term-hint.js — 第一個可點擊名詞的提示

   讀者捲到內文第一個名詞、它進入畫面上半部時，把整個畫面壓暗，
   只留該名詞不被壓暗，旁邊出現說明小卡。

   關閉：點畫面任一處、按「知道了」、按 Esc，或 8 秒後自動關閉。
   預設同一個瀏覽階段只出現一次。

   除錯用：
     · 網址加 ?hint=1      → 忽略「只出現一次」，強制顯示
     · 主控台輸入 showTermHint()  → 立刻顯示，不必等捲動
   ========================================================================== */

(function () {
  'use strict';

  const KEY = 'term-hint-shown';
  const DELAY = 250;         // 進入觸發範圍後等多久才顯示
                             // （不自動關閉；一定要按「知道了」才會消失）
  /* 亮起範圍比名詞本身大多少。
     上緣特別小是因為行內元素的 getBoundingClientRect() 會把行高的空白算進去，
     用同一個值的話上面那條線會浮在字的上方太遠。 */
  const PAD = { top: 1, bottom: 5, x: 6 };
  const GAP = 22;            // 提示框與亮燈之間的距離

  const term = document.querySelector('#report .term[data-term]');
  if (!term) { console.warn('[term-hint] 找不到任何名詞按鈕'); return; }

  const FORCE = /[?&]hint=1\b/.test(location.search);

  /* ------------------------------------------------------------------------
     建立元素
     ---------------------------------------------------------------------- */
  // 四片深色板子（上 / 下 / 左 / 右）圍住名詞，中間留空當作聚光燈
  const masks = ['t', 'b', 'l', 'r'].map(function (k) {
    const d = document.createElement('div');
    d.className = 'term-hint__mask';
    d.dataset.side = k;
    d.setAttribute('aria-hidden', 'true');
    return d;
  });
  const ring = document.createElement('div');
  ring.id = 'term-hint-ring';
  ring.setAttribute('aria-hidden', 'true');

  const card = document.createElement('div');
  card.id = 'term-hint-card';
  card.setAttribute('role', 'dialog');
  card.innerHTML =
    '<p class="term-hint__text">像 <span class="term-hint__demo">這樣</span> ' +
    '標著虛線的詞，點一下可以看解釋。</p>' +
    '<button class="term-hint__ok" type="button">知道了</button>';

  masks.forEach(function (m) { document.body.appendChild(m); });
  document.body.appendChild(ring);
  document.body.appendChild(card);

  let opened = false;
  let armTimer = null;

  /* ------------------------------------------------------------------------
     定位
     ---------------------------------------------------------------------- */
  function place() {
    const r = term.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const x1 = r.left - PAD.x,  x2 = r.right + PAD.x;
    const y1 = r.top - PAD.top, y2 = r.bottom + PAD.bottom;

    // 四片板子圍出中間的空洞（全部用視窗座標，不受捲動與 overflow 影響）
    const box = {
      t: { left: 0, top: 0, width: vw, height: Math.max(y1, 0) },
      b: { left: 0, top: Math.min(y2, vh), width: vw, height: Math.max(vh - y2, 0) },
      l: { left: 0, top: Math.max(y1, 0), width: Math.max(x1, 0), height: Math.max(y2 - y1, 0) },
      r: { left: Math.min(x2, vw), top: Math.max(y1, 0), width: Math.max(vw - x2, 0), height: Math.max(y2 - y1, 0) }
    };
    masks.forEach(function (m) {
      const b = box[m.dataset.side];
      m.style.left = b.left + 'px';
      m.style.top = b.top + 'px';
      m.style.width = b.width + 'px';
      m.style.height = b.height + 'px';
    });

    ring.style.left = x1 + 'px';
    ring.style.top = y1 + 'px';
    ring.style.width = (x2 - x1) + 'px';
    ring.style.height = (y2 - y1) + 'px';

    const cw = card.offsetWidth || 330;
    const ch = card.offsetHeight || 150;
    const m = 16;

    /* 優先放在亮燈右方並垂直置中；右邊放不下就改放左邊，
       兩側都不夠寬（例如窄螢幕）才退回放在下方。 */
    let left, top;
    if (x2 + GAP + cw <= vw - m) {
      left = x2 + GAP;
      top  = r.top + r.height / 2 - ch / 2;
    } else if (x1 - GAP - cw >= m) {
      left = x1 - GAP - cw;
      top  = r.top + r.height / 2 - ch / 2;
    } else {
      left = Math.max(m, Math.min(r.left + r.width / 2 - cw / 2, vw - cw - m));
      top  = y2 + 16;
      if (top + ch > vh - m && y1 - ch - 16 > m) top = y1 - ch - 16;
    }
    top = Math.max(m, Math.min(top, vh - ch - m));

    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }

  /* ------------------------------------------------------------------------
     開啟 / 關閉
     ---------------------------------------------------------------------- */
  function open() {
    if (opened) return;
    opened = true;
    stopWatching();
    if (!FORCE) { try { sessionStorage.setItem(KEY, '1'); } catch (e) {} }

    // 手動觸發時名詞可能不在畫面上，先捲過去再定位
    const r0 = term.getBoundingClientRect();
    if (r0.bottom < 0 || r0.top > window.innerHeight) {
      term.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
    card.classList.add('is-on');
    masks.forEach(function (m) { m.classList.add('is-on'); });
    ring.classList.add('is-on');
    place();

    /* 捲動慣性、平滑捲動或視窗變動都可能讓名詞位置改變，
       開啟後的前 1.2 秒每一幀都重新定位，之後改由 scroll 事件維持。
       少了這段，滑太快時亮燈會停在名詞已經離開的舊位置。 */
    const t0 = performance.now();
    (function settle(now) {
      place();
      if (opened && (now || t0) - t0 < 1200) requestAnimationFrame(settle);
    })(t0);

    // 提示出現期間鎖住捲動，讀者按下「知道了」之前畫面不會跑掉
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
    window.addEventListener('wheel', block, { passive: false });
    window.addEventListener('touchmove', block, { passive: false });
    console.info('[term-hint] 已顯示提示');
  }

  function close() {
    if (!opened) return;
    opened = false;
    masks.forEach(function (m) { m.classList.remove('is-on'); });
    ring.classList.remove('is-on');
    card.classList.remove('is-on');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place);
    window.removeEventListener('wheel', block);
    window.removeEventListener('touchmove', block);
    setTimeout(function () {
      masks.concat([ring, card]).forEach(function (el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    }, 700);
  }

  function block(e) { e.preventDefault(); }

  // 只有 Esc 和「知道了」能關閉；方向鍵、空白鍵等捲動按鍵一律擋掉
  const SCROLL_KEYS = [' ', 'PageDown', 'PageUp', 'End', 'Home',
                       'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    if (SCROLL_KEYS.indexOf(e.key) !== -1) e.preventDefault();
  }
  card.querySelector('.term-hint__ok')
      .addEventListener('click', function (e) { e.stopPropagation(); close(); });

  // 主控台可手動觸發，用來確認視覺效果
  window.showTermHint = open;

  /* ------------------------------------------------------------------------
     觸發：名詞捲進畫面上半部就算數
     ---------------------------------------------------------------------- */
  function inZone() {
    const r = term.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    // 名詞一進入畫面下方就算數，讓提示早一點出現
    return r.bottom > 0 && r.top < vh * 0.78;
  }

  function tick() {
    if (opened) return;
    if (inZone()) {
      if (!armTimer) armTimer = setTimeout(function () { armTimer = null; open(); }, DELAY);
    } else if (armTimer) {
      clearTimeout(armTimer);
      armTimer = null;
    }
  }

  function stopWatching() {
    clearTimeout(armTimer); armTimer = null;
    window.removeEventListener('scroll', tick);
    window.removeEventListener('resize', tick);
  }

  function start() {
    if (!FORCE) {
      try { if (sessionStorage.getItem(KEY)) { console.info('[term-hint] 這次瀏覽已顯示過，略過'); return; } }
      catch (e) {}
    }
    window.addEventListener('scroll', tick, { passive: true });
    window.addEventListener('resize', tick);
    tick();
    console.info('[term-hint] 已開始監看，捲到「' + term.textContent.trim() + '」就會出現');
  }

  // 載入畫面結束後開始監看；沒有載入畫面時直接開始
  document.addEventListener('report:ready', start);
  if (!document.getElementById('loader')) start();
})();
