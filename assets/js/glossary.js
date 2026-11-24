/* ==========================================================================
   glossary.js — 名詞解釋（點擊才跳出）

   使用方式：
   1. 在 data/glossary.json 新增一組「名詞：解釋」
   2. 在 index.html 內文中，把該名詞包成：
        <button class="term" type="button" data-term="名詞">名詞</button>
   就這樣，不需要再寫任何程式碼。

   關閉方式：再按一次名詞、按解釋框外的地方、或按 Esc。
   ========================================================================== */

(function () {
  'use strict';

  const GLOSSARY_SRC = 'data/glossary.json?v=68';   // 改 JSON 內容時把版本號 +1，瀏覽器才會重新抓
  const terms = document.querySelectorAll('.term[data-term]');
  if (!terms.length) return;

  let dict = null;      // 名詞對照表
  let activeBtn = null; // 目前開啟的名詞按鈕

  /* ------------------------------------------------------------------------
     建立解釋框（整個頁面共用一個）
     ---------------------------------------------------------------------- */
  const pop = document.createElement('div');
  pop.id = 'glossary-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-live', 'polite');
  pop.innerHTML =
    '<button class="glossary-pop__close" type="button" aria-label="關閉" data-i18n-aria="ui.close">✕</button>' +
    '<p class="glossary-pop__label" data-i18n="ui.glossaryLabel">名詞解釋</p>' +
    '<h4 class="glossary-pop__term"></h4>' +
    '<p class="glossary-pop__text"></p>';
  document.body.appendChild(pop);

  const popTerm  = pop.querySelector('.glossary-pop__term');
  const popText  = pop.querySelector('.glossary-pop__text');
  const popClose = pop.querySelector('.glossary-pop__close');

  /* ------------------------------------------------------------------------
     載入名詞資料
     ---------------------------------------------------------------------- */
  fetch(GLOSSARY_SRC)
    .then(function (res) {
      if (!res.ok) throw new Error('讀取失敗：' + res.status);
      return res.json();
    })
    .then(function (data) {
      dict = data.terms || {};
    })
    .catch(function () {
      // 名詞檔讀不到時，把標記還原成普通文字，不影響閱讀
      document.querySelectorAll('.term[data-term]').forEach(function (btn) {
        btn.classList.add('is-plain');
      });
      dict = {};
    });

  /* ------------------------------------------------------------------------
     計算位置：出現在名詞下方，並確保不會超出瀏覽器左右邊界
     ---------------------------------------------------------------------- */
  function place(btn) {
    const rect = btn.getBoundingClientRect();
    const popW = pop.offsetWidth;
    const popH = pop.offsetHeight;
    const margin = 16;

    // 水平：以名詞為中心，並夾在畫面範圍內（避免產生左右捲動）
    let left = rect.left + rect.width / 2 - popW / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - popW - margin));

    // 垂直：預設在名詞下方；下方空間不夠就改放上方
    let top = rect.bottom + 10;
    if (top + popH > window.innerHeight - margin && rect.top - popH - 10 > margin) {
      top = rect.top - popH - 10;
    }

    // 加上捲動量，換算成文件座標（position: absolute）
    pop.style.left = (left + window.scrollX) + 'px';
    pop.style.top  = (top + window.scrollY) + 'px';
  }

  /* ------------------------------------------------------------------------
     開啟 / 關閉
     ---------------------------------------------------------------------- */
  function open(btn) {
    const key = btn.dataset.term;
    const text = dict && dict[key];
    if (!text) return;

    close();
    activeBtn = btn;
    btn.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');

    popTerm.textContent = key;
    popText.textContent = text;

    // 先顯示才量得到高度，量完再定位
    pop.classList.add('is-on');
    place(btn);
  }

  function close() {
    if (activeBtn) {
      activeBtn.classList.remove('is-open');
      activeBtn.setAttribute('aria-expanded', 'false');
      activeBtn = null;
    }
    pop.classList.remove('is-on');
  }

  /* ------------------------------------------------------------------------
     綁定事件
     ---------------------------------------------------------------------- */
  /* ⚠ 事件委派，不要把監聽器一個一個綁在按鈕上。
     切換語言時 i18n.js 會重寫整段的 innerHTML，原本的按鈕節點會被銷毀、
     換成全新的節點 —— 綁在舊節點上的監聽器就跟著消失，
     英文版點名詞會完全沒反應。
     綁在 document 上就不受節點重建影響。 */
  document.addEventListener('click', function (e) {
    const btn = e.target.closest ? e.target.closest('.term[data-term]') : null;
    if (!btn || !btn.closest('#report')) return;
    e.stopPropagation();
    if (activeBtn === btn) { close(); return; }
    open(btn);
  }, true);   // 用捕獲階段，搶在下面「按框外關閉」的監聽器之前

  /* aria-expanded 只是初始狀態，節點重建後由 markTerms() 重新補上 */
  function markTerms() {
    document.querySelectorAll('.term[data-term]').forEach(function (btn) {
      btn.setAttribute('aria-expanded', 'false');
    });
  }
  markTerms();

  /* 給 i18n.js 用：切換語言時換掉整本名詞字典。
     換完要把已開啟的解釋框關掉，否則會留著上一個語言的內容。 */
  window.setGlossaryDict = function (d) {
    dict = d || {};
    close();
    // 這時按鈕通常已經被 i18n.js 換成新節點，要重新查一次
    document.querySelectorAll('.term[data-term]').forEach(function (btn) {
      btn.classList.remove('is-plain');
    });
    markTerms();
  };

  popClose.addEventListener('click', close);
  pop.addEventListener('click', function (e) { e.stopPropagation(); });

  // 按框外的地方關閉
  document.addEventListener('click', close);

  // 按 Esc 關閉
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  // 改變視窗大小時重新定位（解釋框以文件座標定位，捲動時會自然跟著內文移動）
  window.addEventListener('resize', function () {
    if (activeBtn) place(activeBtn);
  });
})();
