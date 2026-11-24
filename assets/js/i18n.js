/* ==========================================================================
   i18n.js — 中英文切換

   設計原則：中文版是預設，而且完全不多載任何東西。
   英文字串放在 data/i18n-en.json，只有讀者真的按下 EN 才會去抓，
   所以中文讀者的載入量與切換前完全一樣。

   怎麼運作：
     index.html 裡需要翻譯的元素都帶著 data-i18n="鍵"（內文、小標、圖說…）、
     data-i18n-alt="鍵"（圖片替代文字）或 data-i18n-aria="鍵"（無障礙標籤）。
     切換時把對應的英文字串寫回去，切回中文時還原成一開始的中文。

   要新增可翻譯的元素：
     在 HTML 加 data-i18n="某個鍵"，再到 data/i18n-en.json 補上同名的鍵。
     沒有對應英文的鍵會原樣保留中文，不會變空白。

   網址帶 ?lang=en 會直接以英文開啟（方便分享英文版連結）。
   ========================================================================== */

(function () {
  'use strict';

  const SRC = 'data/i18n-en.json?v=87';

  /* 英文版的圖表另外準備一份 JSON（圖表的標籤、圖例、註解都在資料檔裡，
     不是寫在 HTML，所以沒辦法用 data-i18n 處理）。 */
  const CHART_EN = {
    'data/chart-google-trends.json':    'data/chart-google-trends-en.json?v=87',
    'data/chart-customs-furniture.json': 'data/chart-customs-furniture-en.json?v=87'
  };

  const btn = document.getElementById('lang-toggle');
  if (!btn) return;

  let dict = null;        // 英文字串，第一次切換才抓
  let lang = 'zh';
  const zh = new Map();   // 原始中文，用來切回去

  /* ------------------------------------------------------------------------
     先把每個元素的中文原文記下來
     ---------------------------------------------------------------------- */
  const nodes = Array.from(document.querySelectorAll('[data-i18n]'));
  const alts  = Array.from(document.querySelectorAll('[data-i18n-alt]'));
  const arias = Array.from(document.querySelectorAll('[data-i18n-aria]'));

  nodes.forEach(function (el) { zh.set(el, el.innerHTML); });
  alts.forEach(function (el)  { zh.set(el, el.getAttribute('alt') || ''); });
  arias.forEach(function (el) { zh.set(el, el.getAttribute('aria-label') || ''); });

  const headZh = {
    title: document.title,
    desc:  (document.querySelector('meta[name="description"]') || {}).content || ''
  };

  /* ------------------------------------------------------------------------
     套用語言
     ---------------------------------------------------------------------- */
  function apply(to) {
    const en = (to === 'en');

    nodes.forEach(function (el) {
      const k = el.dataset.i18n;
      const v = en ? (dict.strings || {})[k] : zh.get(el);
      if (v != null) el.innerHTML = v;
    });
    alts.forEach(function (el) {
      const k = el.dataset.i18nAlt;
      const v = en ? (dict.alt || {})[k] : zh.get(el);
      if (v != null) el.setAttribute('alt', v);
    });
    arias.forEach(function (el) {
      const k = el.dataset.i18nAria;
      const v = en ? (dict.strings || {})[k] : zh.get(el);
      if (v != null) el.setAttribute('aria-label', v);
    });

    document.documentElement.lang = en ? 'en' : 'zh-Hant';
    document.title = en ? (dict.meta && dict.meta.title) || headZh.title : headZh.title;
    const md = document.querySelector('meta[name="description"]');
    if (md) md.content = en ? (dict.meta && dict.meta.desc) || headZh.desc : headZh.desc;

    // 按鈕自己要顯示「切到另一個語言」
    btn.textContent = en ? '中' : 'EN';
    btn.setAttribute('lang', en ? 'zh-Hant' : 'en');
    btn.setAttribute('aria-label', en ? '改用中文閱讀' : 'Read in English');

    // 名詞解釋換一本字典
    if (typeof window.setGlossaryDict === 'function') {
      window.setGlossaryDict(en ? dict.glossary : null);
      if (!en) reloadZhGlossary();
    }

    // 左側目錄的小標文字跟著換
    if (typeof window.rebuildToc === 'function') window.rebuildToc();

    // 圖表換資料來源後重畫
    swapCharts(en);

    // 網址同步，方便直接分享英文版連結（不新增一筆瀏覽紀錄）
    const u = new URL(location.href);
    if (en) u.searchParams.set('lang', 'en');
    else u.searchParams.delete('lang');
    history.replaceState(null, '', u);

    lang = to;
  }

  /* 切回中文時要把原本的中文名詞檔重新讀回來 */
  let zhGlossary = null;
  function reloadZhGlossary() {
    if (zhGlossary) { window.setGlossaryDict(zhGlossary); return; }
    fetch('data/glossary.json?v=68')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.terms) { zhGlossary = d.terms; window.setGlossaryDict(zhGlossary); }
      })
      .catch(function () { /* 讀不到就維持現狀，不影響閱讀 */ });
  }

  function swapCharts(en) {
    const boxes = document.querySelectorAll('.m-chart__canvas[data-src]');
    if (!boxes.length) return;
    let changed = false;
    Array.prototype.forEach.call(boxes, function (box) {
      if (!box.dataset.srcZh) box.dataset.srcZh = box.dataset.src;
      const base = box.dataset.srcZh.split('?')[0];
      const next = en ? CHART_EN[base] : box.dataset.srcZh;
      if (next && next !== box.dataset.src) { box.dataset.src = next; changed = true; }
    });
    if (changed && typeof window.redrawCharts === 'function') window.redrawCharts();
  }

  /* ------------------------------------------------------------------------
     切換
     ---------------------------------------------------------------------- */
  function toEnglish() {
    if (dict) { apply('en'); return; }
    btn.classList.add('is-busy');
    fetch(SRC)
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function (d) { dict = d; apply('en'); })
      .catch(function () {
        // 讀不到翻譯檔就維持中文，並讓按鈕短暫顯示失敗
        btn.textContent = '—';
        setTimeout(function () { btn.textContent = 'EN'; }, 1600);
      })
      .finally(function () { btn.classList.remove('is-busy'); });
  }

  btn.addEventListener('click', function () {
    if (lang === 'zh') toEnglish();
    else apply('zh');
  });

  // 網址帶 ?lang=en 就直接開英文版
  if (new URLSearchParams(location.search).get('lang') === 'en') toEnglish();
})();
