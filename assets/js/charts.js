/* ==========================================================================
   charts.js — 互動圖表（純 SVG，不依賴任何外部套件）

   HTML 只要寫：
     <div class="m-chart__canvas" data-src="data/chart-xxx.json"></div>

   目前支援三種 type：
     "bar"        長條圖
     "line"       折線圖（含線性趨勢線、自動偵測搜尋高點、滑過即顯示事件）
     "stackedBar" 堆疊長條圖（圖例可點擊開關類別）

   要新增圖表類型，在下方 RENDERERS 物件裡加一個函式即可。
   ========================================================================== */

(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  /* ------------------------------------------------------------------------
     小工具
     ---------------------------------------------------------------------- */
  function el(name, attrs, text) {
    const node = document.createElementNS(NS, name);
    for (const k in attrs) if (attrs[k] !== null) node.setAttribute(k, attrs[k]);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svgRoot(w, h, label) {
    return el('svg', {
      viewBox: '0 0 ' + w + ' ' + h,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': label || '圖表'
    });
  }

  /* 滑鼠提示框（整頁共用一個） */
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  document.body.appendChild(tip);

  function showTip(html, x, y, wide) {
    tip.innerHTML = html;
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
    tip.classList.toggle('chart-tip--wide', !!wide);
    tip.classList.add('is-on');
  }
  function hideTip() { tip.classList.remove('is-on'); }

  const fmt = function (n) { return Number(n).toLocaleString('zh-TW'); };

  /* 圖例、提示與說明面板放在畫布外層，才不會跟著小螢幕的橫向捲動一起移動 */
  function shell(box) { return box.parentNode || box; }

  /* 圖表下方的說明與資料來源
     以 bullet 呈現、靠左對齊，左緣對齊圖表的 Y 軸（axisRatio = PAD.left / viewBox 寬） */
  function footer(box, data, axisRatio) {
    const foot = document.createElement('div');
    foot.className = 'chart-foot';
    foot.style.setProperty('--axis', (axisRatio * 100).toFixed(2) + '%');

    const ul = document.createElement('ul');
    ul.className = 'chart-foot__list';

    (data.hints || []).forEach(function (h) {
      const li = document.createElement('li');
      li.textContent = h;
      ul.appendChild(li);
    });
    if (data.note) {
      const li = document.createElement('li');
      li.className = 'chart-foot__note';
      li.textContent = data.note;
      ul.appendChild(li);
    }
    if (data.source) {
      const li = document.createElement('li');
      li.className = 'chart-foot__source';
      li.textContent = data.source;
      ul.appendChild(li);
    }
    foot.appendChild(ul);
    return foot;
  }

  /* ------------------------------------------------------------------------
     圖表繪製器
     ---------------------------------------------------------------------- */
  const RENDERERS = {

    /* ====================================================================
       1. 長條圖
       ==================================================================== */
    bar: function (box, data) {
      const items = data.items || [];
      if (!items.length) return;

      const W = 720, H = 340;
      const PAD = { top: 30, right: 20, bottom: 56, left: 20 };
      const innerW = W - PAD.left - PAD.right;
      const innerH = H - PAD.top - PAD.bottom;
      const max = Math.max.apply(null, items.map(function (d) { return d.value; }));
      const slot = innerW / items.length;
      const barW = Math.min(slot * 0.52, 90);

      const svg = svgRoot(W, H, data.title);
      svg.appendChild(el('line', {
        class: 'chart-axis',
        x1: PAD.left, y1: PAD.top + innerH, x2: W - PAD.right, y2: PAD.top + innerH
      }));

      items.forEach(function (d, i) {
        const h = max > 0 ? (d.value / max) * innerH : 0;
        const x = PAD.left + slot * i + (slot - barW) / 2;
        const y = PAD.top + innerH - h;

        const rect = el('rect', {
          class: 'chart-bar' + (d.highlight ? '' : ' chart-bar--muted'),
          x: x, y: PAD.top + innerH, width: barW, height: 0
        });
        svg.appendChild(rect);

        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            rect.style.transition = 'y 0.9s cubic-bezier(0.22,1,0.36,1) ' + (i * 0.09) + 's,' +
                                    ' height 0.9s cubic-bezier(0.22,1,0.36,1) ' + (i * 0.09) + 's';
            rect.setAttribute('y', y);
            rect.setAttribute('height', h);
          });
        });

        rect.addEventListener('mousemove', function (e) {
          showTip(d.label + '：' + fmt(d.value) + (data.unit || ''), e.clientX, e.clientY);
        });
        rect.addEventListener('mouseleave', hideTip);

        svg.appendChild(el('text', { class: 'chart-value', x: x + barW / 2, y: y - 10, 'text-anchor': 'middle' },
          d.display || fmt(d.value)));
        svg.appendChild(el('text', { class: 'chart-label', x: x + barW / 2, y: PAD.top + innerH + 24, 'text-anchor': 'middle' },
          d.label));
        if (d.sublabel) {
          svg.appendChild(el('text', { class: 'chart-label', x: x + barW / 2, y: PAD.top + innerH + 42, 'text-anchor': 'middle' },
            d.sublabel));
        }
      });

      box.appendChild(svg);
    },

    /* ====================================================================
       2. 折線圖（含事件標註）
       ==================================================================== */
    line: function (box, data) {
      const pts = data.series || [];
      if (!pts.length) return;

      const W = 920, H = 360;
      const PAD = { top: 30, right: 18, bottom: 42, left: 38 };
      const innerW = W - PAD.left - PAD.right;
      const innerH = H - PAD.top - PAD.bottom;
      const maxV = Math.max(100, Math.max.apply(null, pts.map(function (p) { return p.v; })));

      const X = function (i) { return PAD.left + (i / (pts.length - 1)) * innerW; };
      const Y = function (v) { return PAD.top + innerH - (Math.max(v, 0) / maxV) * innerH; };

      const svg = svgRoot(W, H, data.title);
      box.appendChild(svg);   // 先掛進頁面，getTotalLength() 才量得到長度

      /* --- 漸層（線下方的填色） --- */
      const defs = el('defs');
      const grad = el('linearGradient', { id: 'trendFill', x1: '0', y1: '0', x2: '0', y2: '1' });
      grad.appendChild(el('stop', { offset: '0%',   'stop-color': '#ac231a', 'stop-opacity': '0.26' }));
      grad.appendChild(el('stop', { offset: '100%', 'stop-color': '#ac231a', 'stop-opacity': '0' }));
      defs.appendChild(grad);
      svg.appendChild(defs);

      /* --- 水平格線與 Y 軸刻度 --- */
      [0, 25, 50, 75, 100].forEach(function (v) {
        const y = Y(v);
        svg.appendChild(el('line', { class: 'chart-grid', x1: PAD.left, y1: y, x2: W - PAD.right, y2: y }));
        svg.appendChild(el('text', { class: 'chart-label', x: PAD.left - 9, y: y + 4, 'text-anchor': 'end' }, String(v)));
      });

      // Y 軸單位：靠左對齊，字串較長時才不會超出畫布左緣被裁掉
      if (data.axisUnit) {
        svg.appendChild(el('text', { class: 'chart-label', x: 2, y: PAD.top - 12, 'text-anchor': 'start' },
          data.axisUnit));
      }

      /* --- X 軸年份標籤（每兩年一個） --- */
      pts.forEach(function (p, i) {
        const parts = p.t.split('-');
        if (parts[1] !== '01') return;
        const year = parseInt(parts[0], 10);
        if (year % 2 !== 0) return;
        svg.appendChild(el('text', {
          class: 'chart-label', x: X(i), y: PAD.top + innerH + 22, 'text-anchor': 'middle'
        }, String(year)));
      });

      /* --- 面積與折線 --- */
      let d = '';
      pts.forEach(function (p, i) { d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.v).toFixed(1); });
      svg.appendChild(el('path', {
        d: d + 'L' + X(pts.length - 1).toFixed(1) + ' ' + Y(0) + 'L' + X(0).toFixed(1) + ' ' + Y(0) + 'Z',
        fill: 'url(#trendFill)', stroke: 'none'
      }));

      const path = el('path', { class: 'chart-line', d: d });
      svg.appendChild(path);

      let len = 0;
      try { len = path.getTotalLength(); } catch (e) { len = 0; }
      if (len) {
        path.style.strokeDasharray = len;
        path.style.strokeDashoffset = len;
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            path.style.transition = 'stroke-dashoffset 2.2s cubic-bezier(0.22,1,0.36,1)';
            path.style.strokeDashoffset = '0';
          });
        });
      }

      /* --- 線性趨勢線（統計上的整體走向） --- */
      if (data.trend) {
        const t0 = data.trend.intercept;
        const t1 = data.trend.intercept + data.trend.slope * (pts.length - 1);
        svg.appendChild(el('line', {
          class: 'chart-trend',
          x1: X(0), y1: Y(t0), x2: X(pts.length - 1), y2: Y(t1)
        }));
      }

      /* --- 先準備好圖表外層的容器，標註檔是非同步載入的，必須先存在 --- */
      const outer = shell(box);
      let after = box;
      function put(node) { outer.insertBefore(node, after.nextSibling); after = node; }

      /* --- 關鍵事件標記（資料來自 data.annotationsSrc 指向的標註檔） --- */
      const marks = [];

      function addMarks(all) {
        // 標註檔加 "hidden": true 的點完全不畫（資料仍保留在檔案裡）
        const list = all.filter(function (a) { return !a.hidden; });
        list.forEach(function (a, k) {
          let i = -1;
          pts.forEach(function (p, j) { if (p.t.indexOf(a.t) === 0) i = j; });
          if (i < 0) return;
          const x = X(i), y = Y(pts[i].v);
          marks.push({ i: i, a: a });

          svg.appendChild(el('line', { class: 'chart-note-line', x1: x, y1: y, x2: x, y2: PAD.top + innerH }));

          const g = el('g', { class: 'chart-note', tabindex: '0', role: 'button',
                              'aria-label': '關鍵事件：' + a.t + '　' + (a.shortLabel || '') });
          g.appendChild(el('circle', { class: 'chart-note-hit',   cx: x, cy: y, r: 22 }));
          g.appendChild(el('circle', { class: 'chart-note-pulse', cx: x, cy: y, r: 10 }));
          g.appendChild(el('circle', { class: 'chart-note-ring',  cx: x, cy: y, r: 10 }));
          g.appendChild(el('circle', { class: 'chart-note-dot',   cx: x, cy: y, r: 5.5 }));
          svg.appendChild(g);

          function show(e) {
            svg.querySelectorAll('.chart-note').forEach(function (o) { o.classList.remove('is-active'); });
            g.classList.add('is-active');
            if (e && e.clientX !== undefined) showTip(tipHTML(a, pts[i].v), e.clientX, e.clientY, true);
          }
          g.addEventListener('mousemove', show);
          g.addEventListener('mouseenter', show);
          g.addEventListener('mouseleave', hideTip);
          // 手機沒有 hover，點一下同樣顯示提示框
          g.addEventListener('click', function (e) { e.stopPropagation(); show(e); });
          g.addEventListener('focus', function () { show(); });
        });
      }

      function ym(t) { return t.slice(0, 4) + ' 年 ' + parseInt(t.slice(5, 7), 10) + ' 月'; }
      function tipHTML(a, v) {
        return '<b>' + ym(a.t) + '</b>　' + (a.direction || '') + ' 熱度 ' + v +
               '<br><span class="chart-tip__tag">' + (a.shortLabel || '關鍵事件') + '</span>' +
               (a.tooltip || '');
      }

      if (data.annotationsSrc) {
        fetch(data.annotationsSrc)
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (ann) { if (ann && ann.anomalies) addMarks(ann.anomalies); })
          .catch(function () { /* 標註檔讀不到就只畫折線，不影響閱讀 */ });
      } else if (data.peaks) {
        addMarks(data.peaks);
      }

      /* --- 滑鼠移動：十字線 + 提示框（碰到高點也一併顯示事件） --- */
      const hoverLine = el('line', { class: 'chart-hover-line', x1: 0, y1: PAD.top, x2: 0, y2: PAD.top + innerH, opacity: '0' });
      const hoverDot  = el('circle', { class: 'chart-hover-dot', cx: 0, cy: 0, r: 4.5, opacity: '0' });
      svg.appendChild(hoverLine);
      svg.appendChild(hoverDot);

      const overlay = el('rect', {
        x: PAD.left, y: PAD.top, width: innerW, height: innerH,
        fill: 'transparent', style: 'cursor:crosshair'
      });
      svg.appendChild(overlay);

      function peakAt(i) {
        for (let m = 0; m < marks.length; m++) if (marks[m].i === i) return marks[m];
        return null;
      }

      overlay.addEventListener('mousemove', function (e) {
        const r = svg.getBoundingClientRect();
        const ratio = (e.clientX - r.left) / r.width * W;
        let i = Math.round((ratio - PAD.left) / innerW * (pts.length - 1));
        i = Math.max(0, Math.min(pts.length - 1, i));
        const p = pts[i];
        hoverLine.setAttribute('x1', X(i)); hoverLine.setAttribute('x2', X(i));
        hoverLine.setAttribute('opacity', '1');
        hoverDot.setAttribute('cx', X(i)); hoverDot.setAttribute('cy', Y(p.v));
        hoverDot.setAttribute('opacity', '1');

        const ym = p.t.slice(0, 4) + ' 年 ' + parseInt(p.t.slice(5, 7), 10) + ' 月';
        let html = '<b>' + ym + '</b>　' + (data.yLabel || '數值') + ' ' + p.v;
        const hit = peakAt(i);
        if (hit) html = tipHTML(hit.a, p.v);
        showTip(html, e.clientX, e.clientY, !!hit);
      });
      overlay.addEventListener('mouseleave', function () {
        hoverLine.setAttribute('opacity', '0');
        hoverDot.setAttribute('opacity', '0');
        hideTip();
      });

      /* --- 圖例、事件面板、趨勢說明、資料來源 --- */
      if (data.trend) {
        const lg = document.createElement('div');
        lg.className = 'chart-legend chart-legend--static';
        lg.innerHTML =
          '<span class="chart-legend__item"><span class="chart-legend__line"></span>每月搜尋熱度</span>' +
          '<span class="chart-legend__item"><span class="chart-legend__line chart-legend__line--dash"></span>' +
          (data.trend.label || '線性趨勢') + '</span>';
        outer.insertBefore(lg, box);
      }

      if (data.explain) {
        const ex = document.createElement('div');
        ex.className = 'chart-explain';
        data.explain.split('\n').forEach(function (para) {
          const q = document.createElement('p');
          q.textContent = para;
          ex.appendChild(q);
        });
        put(ex);
      }

      put(footer(box, data, PAD.left / W));
    },

    /* ====================================================================
       3. 堆疊長條圖（圖例可點擊開關類別）
       ==================================================================== */
    stackedBar: function (box, data) {
      const cats  = data.categories || [];
      const items = data.items || [];
      if (!cats.length || !items.length) return;

      const off = {};   // 被關掉的類別
      const W = 920, H = 400;
      const PAD = { top: 34, right: 18, bottom: 58, left: 46 };
      const innerW = W - PAD.left - PAD.right;
      const innerH = H - PAD.top - PAD.bottom;
      const slot = innerW / items.length;
      const barW = Math.min(slot * 0.6, 56);

      const svg = svgRoot(W, H, data.title);
      box.appendChild(svg);

      function totalOf(item) {
        return cats.reduce(function (s, c) { return off[c.key] ? s : s + (item.values[c.key] || 0); }, 0);
      }

      function draw(animate) {
        while (svg.firstChild) svg.removeChild(svg.firstChild);

        const max = Math.max.apply(null, items.map(totalOf)) || 1;
        const step = max > 200 ? 100 : (max > 80 ? 50 : 20);
        const Y = function (v) { return PAD.top + innerH - (v / max) * innerH; };

        // 水平格線
        for (let v = 0; v <= max; v += step) {
          svg.appendChild(el('line', { class: 'chart-grid', x1: PAD.left, y1: Y(v), x2: W - PAD.right, y2: Y(v) }));
          svg.appendChild(el('text', { class: 'chart-label', x: PAD.left - 9, y: Y(v) + 4, 'text-anchor': 'end' }, String(v)));
        }
        // Y 軸單位：靠左對齊，字串較長時才不會超出畫布左緣被裁掉
        svg.appendChild(el('text', { class: 'chart-label', x: 2, y: PAD.top - 12, 'text-anchor': 'start' },
          data.axisUnit || data.unit || ''));

        items.forEach(function (item, i) {
          const x = PAD.left + slot * i + (slot - barW) / 2;
          let acc = 0;

          cats.forEach(function (c) {
            if (off[c.key]) return;
            const v = item.values[c.key] || 0;
            if (v <= 0) return;
            const h  = (v / max) * innerH;
            const y0 = Y(acc);
            acc += v;
            const y = Y(acc);

            const rect = el('rect', {
              class: 'chart-seg' + (item.partial ? ' chart-seg--partial' : ''),
              x: x, width: barW, y: animate ? y0 : y, height: animate ? 0 : h,
              fill: c.color
            });
            svg.appendChild(rect);

            if (animate) {
              requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                  rect.style.transition = 'y 0.8s cubic-bezier(0.22,1,0.36,1) ' + (i * 0.05) + 's,' +
                                          ' height 0.8s cubic-bezier(0.22,1,0.36,1) ' + (i * 0.05) + 's';
                  rect.setAttribute('y', y);
                  rect.setAttribute('height', h);
                });
              });
            }

            rect.addEventListener('mousemove', function (e) {
              // tooltipMode: "valueOnly" → 只顯示金額，不重複類別與年份
              const txt = data.tooltipMode === 'valueOnly'
                ? '<b>' + v.toFixed(1) + ' ' + (data.unit || '') + '</b>'
                : '<b>' + item.label + (item.sublabel ? ' ' + item.sublabel : '') + '</b><br>' +
                  c.name + '　' + v.toFixed(1) + ' ' + (data.unit || '');
              showTip(txt, e.clientX, e.clientY);
            });
            rect.addEventListener('mouseleave', hideTip);
          });

          // 每年總計
          const tot = totalOf(item);
          svg.appendChild(el('text', {
            class: 'chart-value', x: x + barW / 2, y: Y(tot) - 9, 'text-anchor': 'middle'
          }, tot.toFixed(0)));

          // X 軸標籤
          svg.appendChild(el('text', {
            class: 'chart-label' + (item.partial ? ' chart-label--dim' : ''),
            x: x + barW / 2, y: PAD.top + innerH + 22, 'text-anchor': 'middle'
          }, item.label));
          if (item.sublabel) {
            svg.appendChild(el('text', {
              class: 'chart-label chart-label--dim',
              x: x + barW / 2, y: PAD.top + innerH + 38, 'text-anchor': 'middle'
            }, item.sublabel));
          }
        });

        svg.appendChild(el('line', {
          class: 'chart-axis', x1: PAD.left, y1: PAD.top + innerH, x2: W - PAD.right, y2: PAD.top + innerH
        }));
      }

      /* --- 可點擊的圖例 ---
         點一個類別 → 只顯示該類別，其餘自動隱藏
         再點同一個  → 還原成全部顯示 */
      const legend = document.createElement('div');
      legend.className = 'chart-legend';
      const buttons = [];

      function syncLegend() {
        buttons.forEach(function (o) {
          o.btn.classList.toggle('is-off', !!off[o.key]);
          o.btn.setAttribute('aria-pressed', off[o.key] ? 'false' : 'true');
        });
      }

      cats.forEach(function (c) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chart-legend__item';
        b.setAttribute('aria-pressed', 'true');
        b.innerHTML = '<span class="chart-legend__dot" style="background:' + c.color + '"></span>' + c.name;
        b.addEventListener('click', function () {
          const shown = cats.filter(function (x) { return !off[x.key]; });
          const onlyThis = shown.length === 1 && shown[0].key === c.key;
          cats.forEach(function (x) {
            off[x.key] = onlyThis ? false : (x.key !== c.key);
          });
          syncLegend();
          draw(false);
        });
        buttons.push({ key: c.key, btn: b });
        legend.appendChild(b);
      });
      const outer = shell(box);
      outer.insertBefore(legend, box);

      outer.insertBefore(footer(box, data, PAD.left / W), box.nextSibling);

      draw(true);
    }
  };

  /* ------------------------------------------------------------------------
     讀取 JSON 並繪製（捲到圖表時才載入）
     ---------------------------------------------------------------------- */
  const canvases = document.querySelectorAll('.m-chart__canvas[data-src]');
  if (!canvases.length) return;

  function drawChart(box) {
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
          drawChart(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    canvases.forEach(function (b) { io.observe(b); });
  } else {
    canvases.forEach(drawChart);
  }

  // 點畫面其他地方時關閉事件說明面板的高亮
  document.addEventListener('click', function () {
    document.querySelectorAll('.chart-note.is-active').forEach(function (n) { n.classList.remove('is-active'); });
  });
})();
