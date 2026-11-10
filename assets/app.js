/* 南瓜姿勢庫 · 主程式
   資料在 data/poses.js（window.PUMPKIN_POSES），圖片在 images/<格式>/<w300|w600|w900>/<檔名>。
   不需要任何建置步驟；用網址開啟可打包 ZIP，直接點開 index.html 也能瀏覽。 */
(() => {
  'use strict';

  const D = window.PUMPKIN_POSES;
  const VIEWS = ['front', 'diag', 'side', 'above', 'below'];
  const VIEW_NAMES = ['正面', '斜側', '側面', '俯視', '仰視'];
  const VIEW_SHORT = ['正', '斜', '側', '俯', '仰'];
  // 白模、深度、法線共用同一組檔名（各自一個資料夾），所以都讀 m。
  const FMTS = [
    { k: 'line', n: '線稿', long: '線稿', key: 'l' },
    { k: 'clay', n: '白模', long: '白模', key: 'm' },
    { k: 'depth', n: '深度', long: '深度圖', key: 'm' },
    { k: 'normal', n: '法線', long: '法線圖', key: 'm' },
    { k: 'photo', n: '實拍', long: '實拍風', key: 'p' }
  ];
  const FMT = Object.fromEntries(FMTS.map((f) => [f.k, f]));
  const SERIES = D.series;
  const SERIES_NAME = Object.fromEntries(SERIES.map((s) => [s.key, s.name]));
  const BATCH = 48;
  const NUDGE_AT = 2;

  const poses = D.poses.map((p, i) => ({
    ...p, i,
    hay: (p.id + ' ' + p.n + ' ' + p.en + ' ' + p.c + ' ' + SERIES_NAME[p.s]).toLowerCase()
  }));
  const byId = new Map(poses.map((p) => [p.id, p]));

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtNum = (n) => n.toLocaleString('en-US');
  const mb = (b) => { const m = b / 1e6; return (m < 10 ? m.toFixed(1) : Math.round(m)) + ' MB'; };
  const filesOf = (p, k) => p[FMT[k].key];
  const has = (p, k) => filesOf(p, k).some(Boolean);
  const src = (k, tier, f) => 'images/' + k + '/' + tier + '/' + f;
  const srcset = (k, f) => src(k, 'w300', f) + ' 300w, ' + src(k, 'w600', f) + ' 600w';
  const firstView = (arr) => Math.max(0, arr.findIndex(Boolean));
  // 離 v 最近、而且有圖的機位（先往後找）。
  const nearView = (arr, v) => {
    if (arr[v]) return v;
    for (let d = 1; d < VIEWS.length; d++) {
      if (arr[v + d]) return v + d;
      if (arr[v - d]) return v - d;
    }
    return -1;
  };
  const store = {
    get: (k) => { try { return localStorage.getItem('pp.' + k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem('pp.' + k, v); } catch (e) { /* 無痕模式 */ } }
  };

  /* ── 狀態（網址可分享） ── */
  const params = new URLSearchParams(location.search);
  const intParam = (k, lo, hi, d) => { const n = parseInt(params.get(k), 10); return Number.isInteger(n) && n >= lo && n <= hi ? n : d; };
  const S = {
    series: SERIES.some((s) => s.key === params.get('series')) ? params.get('series') : 'all',
    cat: params.get('cat') || '',
    angle: intParam('angle', 0, 4, -1),
    fmt: FMT[params.get('fmt')] ? params.get('fmt') : 'line',
    mode: params.get('view') === 'single' ? 'single' : 'pose',
    q: params.get('q') || '',
    adult: store.get('adult') === '1',
    revealed: new Set(),
    reveals: 0,
    per: {},
    items: [],
    shown: 0
  };
  const seriesObj = () => SERIES.find((s) => s.key === S.series);
  if (S.cat && !(seriesObj() && seriesObj().cats.some((c) => c[0] === S.cat))) S.cat = '';

  const veiled = (p) => p.x && !S.adult && !S.revealed.has(p.id);

  function syncUrl() {
    const q = new URLSearchParams();
    if (S.series !== 'all') q.set('series', S.series);
    if (S.cat) q.set('cat', S.cat);
    if (S.angle >= 0) q.set('angle', S.angle);
    if (S.fmt !== 'line') q.set('fmt', S.fmt);
    if (S.mode === 'single') q.set('view', 'single');
    if (S.q.trim()) q.set('q', S.q.trim());
    const keep = new URLSearchParams(location.search).get('theme');
    if (keep) q.set('theme', keep);
    const qs = q.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  /* ── 小工具 ── */
  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('is-on'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('is-on'); setTimeout(() => { t.hidden = true; }, 220); }, 2600);
  }
  async function copy(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (_) { /* 放棄 */ }
      ta.remove();
    }
    toast(okMsg);
  }

  /* ── 篩選 ── */
  function matchBase(p) {
    if (S.series !== 'all' && p.s !== S.series) return false;
    if (S.cat && p.c !== S.cat) return false;
    const q = S.q.trim().toLowerCase();
    if (q && !q.split(/\s+/).every((t) => p.hay.includes(t))) return false;
    return true;
  }
  function computeItems() {
    const out = [];
    for (const p of poses) {
      if (!matchBase(p)) continue;
      const arr = filesOf(p, S.fmt);
      if (S.mode === 'pose') {
        if (S.angle >= 0) { if (arr[S.angle]) out.push({ p, v: S.angle }); }
        else if (arr.some(Boolean)) {
          const v = S.per[p.id] != null && arr[S.per[p.id]] ? S.per[p.id] : firstView(arr);
          out.push({ p, v });
        }
      } else {
        arr.forEach((f, v) => { if (f && (S.angle < 0 || S.angle === v)) out.push({ p, v }); });
      }
    }
    return out;
  }

  /* ── 上方控制列 ── */
  function pill(label, n, active, attrs) {
    return '<button type="button" class="ig-pill' + (active ? ' is-active' : '') + '" aria-pressed="' + active + '" ' + attrs + '>' +
      esc(label) + (n != null ? ' <span class="ig-pill__n">' + n + '</span>' : '') + '</button>';
  }
  function seg(items, cur, attr) {
    return items.map(([val, label, disabled]) =>
      '<button type="button" ' + attr + '="' + val + '" aria-pressed="' + (String(val) === String(cur)) + '"' + (disabled ? ' disabled' : '') + '>' + esc(label) + '</button>').join('');
  }
  function renderControls() {
    $('seriesPills').innerHTML =
      pill('全部', poses.length, S.series === 'all', 'data-series="all"') +
      SERIES.map((s) => pill(s.name, poses.filter((p) => p.s === s.key).length, S.series === s.key, 'data-series="' + s.key + '"')).join('');

    const so = seriesObj();
    const cats = $('catPills');
    cats.hidden = !so;
    if (so) {
      const total = poses.filter((p) => p.s === so.key).length;
      cats.innerHTML = pill('全部', total, !S.cat, 'data-cat=""') +
        so.cats.map(([c, n]) => pill(c, n, S.cat === c, 'data-cat="' + esc(c) + '"')).join('');
    }

    $('angleSeg').innerHTML = seg([[-1, '全部機位']].concat(VIEW_NAMES.map((n, i) => [i, n])), S.angle, 'data-angle');
    const base = poses.filter(matchBase);
    $('fmtSeg').innerHTML = seg(FMTS.map((f) => [f.k, f.n, !base.some((p) => has(p, f.k))]), S.fmt, 'data-fmt');
    $('modeSeg').innerHTML = seg([['pose', '按姿勢'], ['single', '逐張']], S.mode, 'data-mode');

    const adult = $('adult');
    adult.setAttribute('aria-checked', String(S.adult));
    $('adultState').textContent = S.adult ? '顯示' : '模糊';
    adult.title = S.adult ? '目前直接顯示敏感姿勢，點一下改回模糊' : '敏感姿勢先模糊，點一下全部顯示';
  }

  /* ── 卡片 ── */
  const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9"/><path d="M6.6 6.6C3.9 8.4 2 12 2 12s4 7 10 7c1.8 0 3.4-.6 4.8-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  function cardHtml(it) {
    const { p, v } = it;
    const arr = filesOf(p, S.fmt);
    const f = arr[v];
    const vl = veiled(p);
    const avail = arr.map(Boolean);
    const n = avail.filter(Boolean).length;
    const idx = avail.slice(0, v + 1).filter(Boolean).length;
    const label = (vl ? '顯示敏感姿勢：' : '開啟大圖：') + p.id + ' ' + p.n + '，' + VIEW_NAMES[v] + FMT[S.fmt].long;
    const catText = S.series === 'all' ? SERIES_NAME[p.s] + '・' + p.c : p.c;
    const views = S.mode === 'pose'
      ? '<div class="pose__views" role="group" aria-label="切換機位">' + VIEWS.map((_, i) =>
        '<button type="button" data-v="' + i + '"' + (avail[i] ? '' : ' disabled') + ' aria-pressed="' + (i === v) + '" aria-label="' + VIEW_NAMES[i] + '" title="' + VIEW_NAMES[i] + '">' + VIEW_SHORT[i] + '</button>').join('') + '</div>'
      : '<p class="pose__single">' + VIEW_NAMES[v] + '</p>';
    return '<article class="pose' + (vl ? ' is-veiled' : '') + '" data-id="' + p.id + '" data-v="' + v + '">' +
      '<button type="button" class="pose__media" data-fmt="' + S.fmt + '" aria-label="' + esc(label) + '">' +
        '<img class="fmt-' + S.fmt + '" src="' + src(S.fmt, 'w300', f) + '" srcset="' + srcset(S.fmt, f) + '" sizes="(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 290px" width="300" height="400" alt="" loading="lazy" decoding="async">' +
        '<span class="pose__angle">' + VIEW_NAMES[v] + ' ' + idx + '/' + n + '</span>' +
        (S.fmt !== 'photo' && has(p, 'photo') ? '<span class="pose__badge">含實拍</span>' : '') +
        (vl ? '<span class="pose__veil">' + EYE_OFF + '<b>敏感姿勢</b><small>點一下顯示</small></span>' : '') +
      '</button>' +
      '<div class="pose__body">' +
        '<h3 class="pose__title">' + esc(p.n) + '</h3>' +
        '<p class="pose__meta"><span class="ig-num">' + p.id + '</span> · ' + esc(catText) + '</p>' +
        views +
      '</div></article>';
  }

  function renderCount() {
    const el = $('count');
    if (S.mode === 'pose') {
      const total = S.series === 'all' ? poses.length : poses.filter((p) => p.s === S.series).length;
      el.textContent = fmtNum(S.items.length) + ' / ' + fmtNum(total) + ' 套';
    } else {
      el.textContent = fmtNum(S.items.length) + ' 張';
    }
  }

  // 一次放一批，用按鈕載入下一批；不做無限捲動，下面的「怎麼用」「下載」才到得了。
  function appendBatch() {
    if (S.shown < S.items.length) {
      const html = S.items.slice(S.shown, S.shown + BATCH).map(cardHtml).join('');
      $('grid').insertAdjacentHTML('beforeend', html);
      S.shown = Math.min(S.items.length, S.shown + BATCH);
    }
    const left = S.items.length - S.shown;
    const unit = S.mode === 'pose' ? ' 套' : ' 張';
    $('more').hidden = left <= 0;
    $('more').textContent = '再顯示 ' + Math.min(BATCH, left) + unit + '（還有 ' + fmtNum(left) + unit + '）';
  }

  function renderGrid() {
    S.items = computeItems();
    S.shown = 0;
    $('grid').innerHTML = '';
    appendBatch();
    $('empty').hidden = S.items.length > 0;
    renderCount();
  }

  function refresh() { renderControls(); renderGrid(); syncUrl(); }

  function replaceCard(card, it) {
    const tmp = document.createElement('div');
    tmp.innerHTML = cardHtml(it);
    card.replaceWith(tmp.firstElementChild);
  }

  /* ── 控制列事件 ── */
  $('seriesPills').addEventListener('click', (e) => {
    const b = e.target.closest('[data-series]'); if (!b) return;
    S.series = b.dataset.series; S.cat = '';
    if (!poses.some((p) => matchBase(p) && has(p, S.fmt))) S.fmt = 'line';
    refresh();
  });
  $('catPills').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    S.cat = b.dataset.cat; refresh();
  });
  $('angleSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-angle]'); if (!b) return;
    S.angle = +b.dataset.angle; refresh();
  });
  $('fmtSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fmt]'); if (!b || b.disabled) return;
    S.fmt = b.dataset.fmt; refresh();
  });
  $('modeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    S.mode = b.dataset.mode; refresh();
  });
  $('adult').addEventListener('click', () => {
    S.adult = !S.adult; store.set('adult', S.adult ? '1' : '0');
    renderControls(); renderGrid();
  });
  let qTimer = 0;
  $('search').value = S.q;
  $('search').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { S.q = e.target.value; refresh(); }, 140);
  });
  $('clearAll').addEventListener('click', () => {
    S.series = 'all'; S.cat = ''; S.angle = -1; S.fmt = 'line'; S.mode = 'pose'; S.q = '';
    $('search').value = '';
    refresh();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    if ($('lb').open || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    e.preventDefault(); $('search').focus();
  });

  $('grid').addEventListener('click', (e) => {
    const card = e.target.closest('.pose'); if (!card) return;
    const p = byId.get(card.dataset.id);
    const vb = e.target.closest('.pose__views button');
    if (vb) {
      const v = +vb.dataset.v;
      S.per[p.id] = v;
      const it = S.items.find((x) => x.p === p); if (it) it.v = v;
      replaceCard(card, { p, v });
      const nb = $('grid').querySelector('.pose[data-id="' + p.id + '"] .pose__views [data-v="' + v + '"]');
      if (nb) nb.focus();
      return;
    }
    if (!e.target.closest('.pose__media')) return;
    const v = +card.dataset.v;
    if (veiled(p)) {
      S.revealed.add(p.id);
      replaceCard(card, { p, v });
      S.reveals++;
      if (S.reveals === NUDGE_AT && !S.adult) toast('想一次全部顯示，打開上方的「敏感姿勢」開關就好');
      return;
    }
    openLb(p, v, S.fmt);
  });

  $('more').addEventListener('click', () => {
    const first = S.shown;
    appendBatch();
    // 焦點移到新的第一張，鍵盤使用者不用從頭找。
    const card = $('grid').children[first];
    if (card) card.querySelector('.pose__media').focus({ preventScroll: true });
  });

  /* ── 首屏數字與跑馬燈 ── */
  function renderHero() {
    const lines = poses.reduce((a, p) => a + p.l.filter(Boolean).length, 0);
    $('heroPoses').textContent = fmtNum(poses.length);
    $('heroLines').textContent = fmtNum(lines);
    $('heroBrowse').textContent = '瀏覽 ' + fmtNum(poses.length) + ' 套姿勢';

    const safe = poses.filter((p) => !p.x);
    const kinds = ['line', 'clay', 'line', 'depth', 'line', 'normal'];
    const tiles = [];
    for (let i = 0; i < 28 && safe.length; i++) {
      const p = safe[(i * 7) % safe.length];
      let k = kinds[i % kinds.length];
      if (!has(p, k)) k = 'line';
      const arr = filesOf(p, k);
      const v = nearView(arr, i % VIEWS.length);
      if (v < 0) continue;
      tiles.push('<button type="button" class="mq" data-fmt="' + k + '" data-mq="' + p.id + ',' + v + ',' + k + '" tabindex="-1" aria-label="' + esc(p.id + ' ' + p.n) + '">' +
        '<img class="fmt-' + k + '" src="' + src(k, 'w300', arr[v]) + '" alt="" width="96" height="128" decoding="async"></button>');
    }
    const one = tiles.join('');
    $('marqueeTrack').innerHTML = '<div class="marquee__set">' + one + '</div><div class="marquee__set" aria-hidden="true">' + one + '</div>';
    $('marqueeTrack').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mq]'); if (!b) return;
      const [id, v, k] = b.dataset.mq.split(',');
      openLb(byId.get(id), +v, k);
    });
  }

  /* ── 怎麼用 ── */
  function renderHowto() {
    const demo = byId.get('P001') || poses[0];
    const demo3d = byId.get('P017') || demo;
    const count = (k) => poses.reduce((a, p) => a + filesOf(p, k).filter(Boolean).length, 0);
    const cards = [
      ['line', demo, '線稿', 'ControlNet Lineart／Canny 直接吃；丟給 Nano Banana、ChatGPT 當姿勢參考圖也很穩。', fmtNum(count('line')) + ' 張'],
      ['clay', demo, '白模', '有體積、有明暗的灰色人台。當 img2img 底圖或角色參考，最不挑工具。', fmtNum(count('clay')) + ' 張'],
      ['depth', demo, '深度圖', '給 ControlNet Depth，前後遠近鎖得最穩，想保留構圖時用它。', fmtNum(count('depth')) + ' 張'],
      ['normal', demo, '法線圖', '給 ControlNet Normal，身體朝向和面的轉折都抓得到，寫實風特別好用。', fmtNum(count('normal')) + ' 張'],
      ['photo', demo, '實拍風', '寫實照片風格的對照圖，看比例、手腳和重心最直覺。目前在全身・標準系列。', fmtNum(count('photo')) + ' 張'],
      ['clay', demo3d, '3D 擺姿參考', 'Blender、Unreal Engine 擺 Pose、畫分鏡、規劃 VR 動作之前，先對一下姿勢，少走冤枉路。', '五機位對照']
    ];
    $('howtoGrid').innerHTML = cards.map(([k, p, title, desc, tag], i) => {
      const arr = filesOf(p, k);
      const v = i === 5 ? nearView(arr, 1) : firstView(arr);
      return '<button type="button" class="ig-card tool" data-howto="' + k + '">' +
        '<span class="tool__img" data-fmt="' + k + '"><img class="fmt-' + k + '" src="' + src(k, 'w300', arr[v]) + '" alt="" width="76" height="101" loading="lazy" decoding="async"></span>' +
        '<span class="tool__text"><span class="tool__title">' + esc(title) + '</span>' +
        '<span class="tool__desc">' + esc(desc) + '</span>' +
        '<span class="tool__foot">' + esc(tag) + '<span class="tool__go">看全部 →</span></span></span></button>';
    }).join('');
    $('howtoGrid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-howto]'); if (!b) return;
      S.fmt = b.dataset.howto;
      if (!poses.some((p) => matchBase(p) && has(p, S.fmt))) { S.series = 'all'; S.cat = ''; S.q = ''; $('search').value = ''; }
      refresh();
      $('poses').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  }

  /* ── 大圖 ── */
  const dlg = $('lb');
  const LB = { p: null, v: 0, k: 'line', mode: 'single', list: [], back: null };

  function lbList(p) {
    const seen = new Set(); const list = [];
    for (const it of S.items) if (!seen.has(it.p.id)) { seen.add(it.p.id); list.push(it.p); }
    return list.includes(p) ? list : poses;
  }
  function fixLbView() {
    if (!has(LB.p, LB.k)) LB.k = 'line';
    const v = nearView(filesOf(LB.p, LB.k), LB.v);
    LB.v = v < 0 ? firstView(LB.p.l) : v;
    if (LB.mode === 'compare' && !canCompare()) LB.mode = 'single';
  }
  const canCompare = () => ['clay', 'depth', 'normal'].includes(LB.k) && !!LB.p.l[LB.v] && !!LB.p.m[LB.v];

  function openLb(p, v, k) {
    if (!p) return;
    if (!dlg.open) LB.back = document.activeElement;
    LB.p = p; LB.v = v; LB.k = k || 'line'; LB.list = lbList(p);
    fixLbView();
    renderLb();
    if (!dlg.open) { dlg.showModal(); $('lbClose').focus(); }
    history.replaceState(null, '', location.pathname + location.search + '#' + p.id);
  }
  function closeLb() { if (dlg.open) dlg.close(); }
  dlg.addEventListener('close', () => {
    history.replaceState(null, '', location.pathname + location.search);
    if (LB.back && LB.back.isConnected) LB.back.focus();
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeLb(); });
  $('lbClose').addEventListener('click', closeLb);

  function renderLb() {
    const p = LB.p, k = LB.k, v = LB.v;
    const arr = filesOf(p, k);
    const f = arr[v];
    $('lbMeta').innerHTML = '<span class="ig-num">' + p.id + '</span> · ' + esc(SERIES_NAME[p.s]) + ' · ' + esc(p.c);
    $('lbName').textContent = p.n;
    $('lbEn').textContent = p.en;
    $('lbDesc').textContent = p.d || p.en;
    $('lbSingle').dataset.fmt = k;

    const img = $('lbImg');
    img.className = 'fmt-' + k;
    img.src = src(k, 'w900', f);
    img.alt = p.id + ' ' + p.n + '，' + VIEW_NAMES[v] + FMT[k].long;

    // 機位
    $('lbAngles').innerHTML = VIEWS.map((_, i) => {
      const fi = arr[i];
      return '<button type="button" data-lbv="' + i + '" aria-pressed="' + (i === v) + '"' + (fi ? '' : ' disabled title="這個機位沒有' + FMT[k].long + '"') + '>' +
        '<span class="th" data-fmt="' + k + '">' + (fi ? '<img class="fmt-' + k + '" src="' + src(k, 'w300', fi) + '" alt="">' : '') + '</span>' +
        '<span class="lab">' + VIEW_NAMES[i] + '</span></button>';
    }).join('');

    // 格式
    $('lbFmts').innerHTML = FMTS.map((x, i) => {
      const ok = has(p, x.k);
      return '<button type="button" class="ig-pill' + (x.k === k ? ' is-active' : '') + '" data-lbk="' + x.k + '" aria-pressed="' + (x.k === k) + '" aria-keyshortcuts="' + (i + 1) + '"' + (ok ? '' : ' disabled title="這套姿勢沒有' + x.long + '"') + '>' +
        esc(x.n) + '</button>';
    }).join('');

    // 檢視
    $('lbModes').innerHTML = seg([['single', '單張'], ['overview', '全部一覽'], ['compare', '對照', !canCompare()]], LB.mode, 'data-lbm');

    $('lbSingle').hidden = LB.mode === 'overview';
    $('lbOverview').hidden = LB.mode !== 'overview';
    $('lbWipe').hidden = LB.mode !== 'compare';
    if (LB.mode === 'compare') {
      $('lbWipeImg').src = src('line', 'w900', p.l[v]);
      $('lbWipeTagR').textContent = FMT[k].long;
      setWipe($('lbWipeRange').value);
    }
    if (LB.mode === 'overview') renderOverview();

    const dl = $('lbDl');
    dl.href = src(k, 'w900', f);
    dl.setAttribute('download', 'pumpkin-pose_' + p.id + '_' + VIEWS[v] + '_' + k + '.webp');
    const total = FMTS.reduce((a, x) => a + filesOf(p, x.k).filter(Boolean).length, 0);
    $('lbZip').textContent = '打包這套（' + total + ' 張）';

    const i = LB.list.indexOf(p);
    $('lbPrev').disabled = LB.list.length < 2;
    $('lbNext').disabled = LB.list.length < 2;
    preload(i);
  }

  function renderOverview() {
    const p = LB.p;
    const rows = FMTS.filter((x) => has(p, x.k));
    $('lbOverview').innerHTML = '<div class="ov">' +
      '<span class="ov__corner"></span>' + VIEW_NAMES.map((n) => '<span class="ov__head">' + n + '</span>').join('') +
      rows.map((x) => '<span class="ov__row">' + x.long + '</span>' + VIEWS.map((_, i) => {
        const f = filesOf(p, x.k)[i];
        return f
          ? '<button type="button" class="ov__cell" data-fmt="' + x.k + '" data-ov="' + x.k + ',' + i + '" aria-label="' + esc(VIEW_NAMES[i] + x.long) + '"><img class="fmt-' + x.k + '" src="' + src(x.k, 'w300', f) + '" alt="" loading="lazy"></button>'
          : '<span class="ov__cell is-empty" aria-hidden="true">—</span>';
      }).join('')).join('') + '</div>';
  }

  function setWipe(val) {
    $('lbWipeImg').style.clipPath = 'inset(0 ' + (100 - val) + '% 0 0)';
    $('lbWipe').style.setProperty('--x', val + '%');
  }
  $('lbWipeRange').addEventListener('input', (e) => setWipe(e.target.value));

  function preload(i) {
    const n = LB.list[(i + 1) % LB.list.length];
    if (!n || veiled(n)) return;
    const arr = filesOf(n, has(n, LB.k) ? LB.k : 'line');
    const v = nearView(arr, LB.v);
    if (v >= 0) { const im = new Image(); im.src = src(has(n, LB.k) ? LB.k : 'line', 'w900', arr[v]); }
  }

  function stepPose(d) {
    const L = LB.list; if (L.length < 2) return;
    let i = L.indexOf(LB.p);
    for (let n = 0; n < L.length; n++) {
      i = (i + d + L.length) % L.length;
      if (!veiled(L[i])) break;
    }
    LB.p = L[i]; fixLbView(); renderLb();
    history.replaceState(null, '', location.pathname + location.search + '#' + LB.p.id);
  }
  function stepAngle(d) {
    const arr = filesOf(LB.p, LB.k);
    for (let n = 1; n <= VIEWS.length; n++) {
      const v = (LB.v + d * n + VIEWS.length * 2) % VIEWS.length;
      if (arr[v]) { LB.v = v; fixLbView(); renderLb(); return; }
    }
  }
  function setFmt(k) {
    if (!has(LB.p, k)) return;
    LB.k = k; fixLbView(); renderLb();
  }

  $('lbPrev').addEventListener('click', () => stepPose(-1));
  $('lbNext').addEventListener('click', () => stepPose(1));
  $('lbAngles').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lbv]'); if (!b || b.disabled) return;
    LB.v = +b.dataset.lbv; if (LB.mode === 'overview') LB.mode = 'single'; fixLbView(); renderLb();
  });
  $('lbFmts').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lbk]'); if (!b || b.disabled) return; setFmt(b.dataset.lbk);
  });
  $('lbModes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lbm]'); if (!b || b.disabled) return;
    LB.mode = b.dataset.lbm; renderLb();
  });
  $('lbOverview').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ov]'); if (!b) return;
    const [k, v] = b.dataset.ov.split(',');
    LB.k = k; LB.v = +v; LB.mode = 'single'; fixLbView(); renderLb();
  });
  $('lbCopyPrompt').addEventListener('click', () => copy(LB.p.d || LB.p.en, '英文提示詞已複製，貼進 AI 工具就能用'));
  $('lbLink').addEventListener('click', () => copy(location.href.split('#')[0] + '#' + LB.p.id, '連結已複製'));
  $('lbZip').addEventListener('click', () => {
    const p = LB.p; const list = [];
    FMTS.forEach((x) => filesOf(p, x.k).forEach((f, v) => { if (f) list.push({ url: src(x.k, 'w900', f), path: x.long + '/' + p.id + '_' + VIEW_NAMES[v] + '.webp' }); }));
    zipDownload(list, 'pumpkin-pose_' + p.id + '_' + safeName(p.n) + '.zip', null);
  });

  dlg.addEventListener('keydown', (e) => {
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range') return;
    if (e.key === 'ArrowRight' && e.target.type !== 'range') { e.preventDefault(); stepPose(1); }
    else if (e.key === 'ArrowLeft' && e.target.type !== 'range') { e.preventDefault(); stepPose(-1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); stepAngle(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); stepAngle(-1); }
    else if (/^[1-5]$/.test(e.key)) { setFmt(FMTS[+e.key - 1].k); }
  });
  // 手機左右滑換姿勢
  let touch = null;
  $('lbStage').addEventListener('touchstart', (e) => {
    if (e.target.type === 'range') return;
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  $('lbStage').addEventListener('touchend', (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) stepPose(dx < 0 ? 1 : -1);
    else if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.4) stepAngle(dy < 0 ? 1 : -1);
  }, { passive: true });

  /* ── 打包下載 ── */
  const safeName = (s) => String(s).replace(/[\\/:*?"<>|]/g, '').slice(0, 40);
  let zipJob = null;
  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = () => res(window.JSZip);
      s.onerror = () => rej(new Error('打包工具載入失敗，請檢查網路'));
      document.head.appendChild(s);
    });
  }
  function progressUI(on) {
    $('dlProgress').hidden = !on;
    $('dlGo').disabled = on;
    $('lbZip').disabled = on;
  }
  function setProgress(done, total, text) {
    $('dlBar').style.width = (total ? Math.round(done / total * 100) : 0) + '%';
    $('dlStatus').textContent = text;
  }
  async function zipDownload(list, name, bytesHint) {
    if (location.protocol === 'file:') {
      toast('直接點開檔案時瀏覽器不讓打包，請用網址開啟（GitHub Pages 或本機伺服器）');
      return;
    }
    if (zipJob) { toast('上一個圖包還在打包中'); return; }
    const job = zipJob = { cancelled: false, ctrl: new AbortController() };
    progressUI(true);
    if (dlg.open) toast('開始打包 ' + list.length + ' 張，進度在頁面下方的「下載圖包」區');
    setProgress(0, list.length, '準備中…');
    try {
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      let done = 0, i = 0;
      const worker = async () => {
        while (i < list.length && !job.cancelled) {
          const it = list[i++];
          const r = await fetch(it.url, { signal: job.ctrl.signal });
          if (!r.ok) throw new Error('有圖片下載失敗（' + r.status + '）');
          zip.file(it.path, await r.arrayBuffer());
          done++;
          setProgress(done, list.length, '下載圖片 ' + fmtNum(done) + ' / ' + fmtNum(list.length) + (bytesHint ? '（約 ' + mb(bytesHint) + '）' : ''));
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      if (job.cancelled) throw new Error('cancel');
      setProgress(list.length, list.length, '壓縮成 ZIP…');
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      setProgress(list.length, list.length, '完成：' + name + '（' + mb(blob.size) + '）');
      toast('圖包好了，已開始下載');
    } catch (err) {
      if (job.cancelled || err.name === 'AbortError' || err.message === 'cancel') setProgress(0, 1, '已取消');
      else { setProgress(0, 1, '沒有打包成功：' + err.message); toast('沒有打包成功：' + err.message); }
    } finally {
      zipJob = null;
      $('dlGo').disabled = false;
      $('lbZip').disabled = false;
      setTimeout(() => { if (!zipJob) $('dlProgress').hidden = true; }, 6000);
    }
  }
  $('dlCancel').addEventListener('click', () => { if (zipJob) { zipJob.cancelled = true; zipJob.ctrl.abort(); } });

  const DL = { series: new Set(['std']), fmts: new Set(['line']) };
  function renderDl() {
    $('dlSeries').innerHTML = SERIES.map((s) => pill(s.name, poses.filter((p) => p.s === s.key).length + ' 套', DL.series.has(s.key), 'data-dls="' + s.key + '"')).join('');
    $('dlFmts').innerHTML = FMTS.map((x) => pill(x.long, null, DL.fmts.has(x.k), 'data-dlf="' + x.k + '"')).join('');
    let n = 0, b = 0;
    DL.series.forEach((s) => DL.fmts.forEach((k) => { const v = D.pack[s + '.' + k]; if (v) { n += v[0]; b += v[1]; } }));
    const ok = n > 0;
    $('dlSum').innerHTML = ok
      ? '共 <b class="ig-num">' + fmtNum(n) + '</b> 張 · 約 <b class="ig-num">' + mb(b) + '</b>'
      : (DL.series.size && DL.fmts.size ? '這個組合沒有圖（實拍目前只有全身・標準）' : '至少選一個系列和一種格式');
    $('dlGo').disabled = !ok || !!zipJob;
    DL.n = n; DL.b = b;
  }
  $('dlSeries').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dls]'); if (!b) return;
    const k = b.dataset.dls; DL.series.has(k) ? DL.series.delete(k) : DL.series.add(k); renderDl();
  });
  $('dlFmts').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dlf]'); if (!b) return;
    const k = b.dataset.dlf; DL.fmts.has(k) ? DL.fmts.delete(k) : DL.fmts.add(k); renderDl();
  });
  $('dlGo').addEventListener('click', () => {
    const list = [];
    for (const p of poses) {
      if (!DL.series.has(p.s)) continue;
      for (const x of FMTS) {
        if (!DL.fmts.has(x.k)) continue;
        filesOf(p, x.k).forEach((f, v) => {
          if (f) list.push({ url: src(x.k, 'w900', f), path: SERIES_NAME[p.s] + '/' + x.long + '/' + p.id + '_' + safeName(p.n) + '_' + VIEW_NAMES[v] + '.webp' });
        });
      }
    }
    if (!list.length) return;
    const tag = [...DL.series].map((s) => s).join('-') + '_' + [...DL.fmts].join('-');
    zipDownload(list, 'pumpkin-poses_' + tag + '.zip', DL.b);
  });

  /* ── 開始 ── */
  // 分享連結（#P012）代表對方明確要看這一套，所以直接顯示、不模糊。
  const m = /^#([A-Z]\d{3})$/.exec(location.hash);
  const linked = m && byId.get(m[1]);
  if (linked) S.revealed.add(linked.id);
  renderHero();
  renderHowto();
  renderDl();
  refresh();
  if (linked) openLb(linked, intParam('angle', 0, 4, 0), S.fmt);
  else if (/^#[a-z]+$/.test(location.hash) && document.querySelector(location.hash)) {
    // 內容是程式產生的，瀏覽器一開始捲到錨點時還不夠高，補捲一次。
    requestAnimationFrame(() => document.querySelector(location.hash).scrollIntoView({ behavior: 'instant' }));
  }
})();
