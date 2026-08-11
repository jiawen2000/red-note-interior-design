/* ==========================================================================
   charts.js — 互動圖表（純 SVG，不依賴任何外部套件）
   HTML 只要寫：
     <div class="m-chart__canvas" data-src="data/chart-xxx.json"></div>
   JSON 格式請見 data/chart-wugu-stores.json 的註解說明。

   目前支援 type: "bar"（長條圖）。
   要新增其他圖表類型，在下方 RENDERERS 物件裡加一個函式即可。
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     共用：滑鼠提示框
     ---------------------------------------------------------------------- */
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  document.body.appendChild(tip);

  function showTip(text, evt) {
    tip.textContent = text;
    tip.style.left = evt.clientX + 'px';
    tip.style.top  = evt.clientY + 'px';
    tip.classList.add('is-on');
  }
  function hideTip() { tip.classList.remove('is-on'); }

  /* ------------------------------------------------------------------------
     圖表繪製器
     ---------------------------------------------------------------------- */
  const NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs) {
    const node = document.createElementNS(NS, name);
    for (const key in attrs) node.setAttribute(key, attrs[key]);
    return node;
  }

  const RENDERERS = {
    /* ---- 長條圖 ---- */
    bar: function (box, data) {
      const items = data.items || [];
      if (!items.length) return;

      // 畫布尺寸（SVG 會依 viewBox 自動縮放，不需要處理 RWD）
      const W = 720, H = 340;
      const PAD = { top: 30, right: 20, bottom: 56, left: 20 };
      const innerW = W - PAD.left - PAD.right;
      const innerH = H - PAD.top - PAD.bottom;

      const max = Math.max.apply(null, items.map(function (d) { return d.value; }));
      const slot = innerW / items.length;
      const barW = Math.min(slot * 0.52, 90);

      const svg = el('svg', {
        viewBox: '0 0 ' + W + ' ' + H,
        role: 'img',
        'aria-label': data.title || '圖表'
      });

      // 基線
      svg.appendChild(el('line', {
        class: 'chart-axis',
        x1: PAD.left, y1: PAD.top + innerH,
        x2: W - PAD.right, y2: PAD.top + innerH
      }));

      items.forEach(function (d, i) {
        const h = max > 0 ? (d.value / max) * innerH : 0;
        const x = PAD.left + slot * i + (slot - barW) / 2;
        const y = PAD.top + innerH - h;

        // 長條（highlight: true 用強調色，其餘用灰色）
        const rect = el('rect', {
          class: 'chart-bar' + (d.highlight ? '' : ' chart-bar--muted'),
          x: x, y: PAD.top + innerH, width: barW, height: 0
        });
        svg.appendChild(rect);

        // 進場動畫：由下往上長出（連續兩個 rAF 才能確保 transition 生效）
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            rect.style.transition = 'y 0.9s cubic-bezier(0.22,1,0.36,1) ' + (i * 0.09) + 's,' +
                                    ' height 0.9s cubic-bezier(0.22,1,0.36,1) ' + (i * 0.09) + 's';
            rect.setAttribute('y', y);
            rect.setAttribute('height', h);
          });
        });

        // 互動提示
        const label = d.label + '：' + d.value.toLocaleString('zh-TW') + (data.unit || '');
        rect.addEventListener('mousemove', function (e) { showTip(label, e); });
        rect.addEventListener('mouseleave', hideTip);

        // 數值
        svg.appendChild(el('text', {
          class: 'chart-value', x: x + barW / 2, y: y - 10, 'text-anchor': 'middle'
        })).textContent = d.display || d.value.toLocaleString('zh-TW');

        // X 軸標籤
        svg.appendChild(el('text', {
          class: 'chart-label', x: x + barW / 2, y: PAD.top + innerH + 24, 'text-anchor': 'middle'
        })).textContent = d.label;

        // 副標籤（第二行）
        if (d.sublabel) {
          svg.appendChild(el('text', {
            class: 'chart-label', x: x + barW / 2, y: PAD.top + innerH + 42, 'text-anchor': 'middle'
          })).textContent = d.sublabel;
        }
      });

      box.appendChild(svg);
    }
  };

  /* ------------------------------------------------------------------------
     讀取 JSON 並繪製
     使用 IntersectionObserver：捲到圖表時才載入，動畫也才播放
     ---------------------------------------------------------------------- */
  const canvases = document.querySelectorAll('.m-chart__canvas[data-src]');
  if (!canvases.length) return;

  function draw(box) {
    if (box.dataset.drawn) return;
    box.dataset.drawn = '1';

    fetch(box.dataset.src)
      .then(function (res) {
        if (!res.ok) throw new Error('讀取失敗：' + res.status);
        return res.json();
      })
      .then(function (data) {
        const render = RENDERERS[data.type];
        if (!render) throw new Error('尚未支援的圖表類型：' + data.type);
        render(box, data);
      })
      .catch(function (err) {
        // 圖表載入失敗不影響報導閱讀，只在該區塊顯示訊息
        box.innerHTML = '<p class="meta">圖表載入失敗（' + err.message + '）</p>';
      });
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          draw(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    canvases.forEach(function (box) { io.observe(box); });
  } else {
    canvases.forEach(draw);
  }
})();
