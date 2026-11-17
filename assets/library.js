/* 南瓜素材庫 · 主程式
   資料在 data/library.js（window.PUMPKIN_LIBRARY），圖片在 images/<庫>/<w300|w600|w900>/<檔名>。
   搭配盤與小工具來自 assets/tray.js（window.PumpkinTray、window.PP）。 */
(() => {
  'use strict';

  const D = window.PUMPKIN_LIBRARY;
  const { $, esc, store, toast, copy, zipFiles, safeName } = window.PP;
  const Tray = window.PumpkinTray;

  const VIEW_NAME = { front: '正面', diag: '斜側', side: '側面', back: '背面', above: '俯視', below: '仰視', eye: '平視' };
  const VIEW_SHORT = { front: '正', diag: '斜', side: '側', back: '背', above: '俯', below: '仰', eye: '平' };
  const GENDER = [['all', '全部'], ['F', '女裝'], ['M', '男裝'], ['U', '中性']];
  // 搭配盤裡每一庫的英文片語怎麼開頭
  const CLAUSE = {
    costume: (x) => 'wearing ' + x.k,
    prop: (x) => 'holding ' + x.k,
    furniture: (x) => 'on or next to ' + x.k,
    animal: (x) => 'with a ' + (x.sp || 'animal') + ' nearby (' + x.k + ')',
    scene: (x) => 'setting: ' + x.k,
    light: (x) => 'lighting: ' + x.k
  };
  const BATCH = 48;
  const SEARCH_HINT = {
    costume: '旗袍、婚紗、C050', prop: '吉他、相機、T001', furniture: '沙發、圈椅、F008',
    animal: '貓、龍、A001', scene: '沙灘、老街、E030', light: '窗光、霓虹、L013'
  };

  const LIBS = D.libs;
  const LIB = Object.fromEntries(LIBS.map((l) => [l.key, l]));
  const items = D.items.map((x) => {
    const L = LIB[x.l];
    const cat = L.cats.find((c) => c.k === x.c);
    return { ...x, cn: cat ? cat.n : '', hay: (x.id + ' ' + x.n + ' ' + x.en + ' ' + x.s + ' ' + (cat ? cat.n : '') + ' ' + L.name).toLowerCase() };
  });
  const byId = new Map(items.map((x) => [x.id, x]));
  const fmtNum = (n) => n.toLocaleString('en-US');
  const src = (lib, tier, f) => 'images/' + lib + '/' + tier + '/' + f;
  const isLine = (lib) => LIB[lib].kind === 'line';

  /* ── 狀態（網址可分享） ── */
  const params = new URLSearchParams(location.search);
  const hashId = (/^#([A-Z]\d{3})(?:-([a-z]+))?$/.exec(location.hash) || []);
  const linked = hashId[1] && byId.get(hashId[1]);
  const S = {
    lib: linked ? linked.l : (LIB[params.get('lib')] ? params.get('lib') : 'costume'),
    cat: params.get('cat') || '',
    sub: params.get('sub') || '',
    g: ['F', 'M', 'U'].includes(params.get('g')) ? params.get('g') : 'all',
    view: params.get('view') || '',
    q: params.get('q') || '',
    adult: store.get('pp.adult') === '1',
    revealed: new Set(),
    per: {},
    list: [],
    shown: 0
  };
  const L = () => LIB[S.lib];
  function normalize() {
    if (!L().cats.some((c) => c.k === S.cat)) S.cat = '';
    if (!S.cat) S.sub = '';
    if (!L().views.includes(S.view)) S.view = '';
    if (S.lib !== 'costume') S.g = 'all';
  }
  normalize();
  if (linked) S.revealed.add(linked.id);

  const veiled = (x) => x.x && !S.adult && !S.revealed.has(x.id);

  function syncUrl() {
    const q = new URLSearchParams();
    q.set('lib', S.lib);
    if (S.cat) q.set('cat', S.cat);
    if (S.sub) q.set('sub', S.sub);
    if (S.g !== 'all') q.set('g', S.g);
    if (S.view) q.set('view', S.view);
    if (S.q.trim()) q.set('q', S.q.trim());
    const keep = new URLSearchParams(location.search).get('theme');
    if (keep) q.set('theme', keep);
    history.replaceState(null, '', location.pathname + '?' + q.toString() + location.hash);
  }

  /* ── 篩選 ── */
  const inLib = () => items.filter((x) => x.l === S.lib);
  function matches(x) {
    if (x.l !== S.lib) return false;
    if (S.cat && x.c !== S.cat) return false;
    if (S.sub && x.s !== S.sub) return false;
    if (S.g !== 'all' && x.g !== S.g) return false;
    const q = S.q.trim().toLowerCase();
    if (q && !q.split(/\s+/).every((w) => x.hay.includes(w))) return false;
    return true;
  }
  // 卡片顯示哪個角度：自己點過的 > 上方選的角度（沒有就找最近的）> 主角度
  function viewOf(x) {
    const views = LIB[x.l].views;
    if (S.per[x.id] != null && x.f[S.per[x.id]]) return S.per[x.id];
    if (S.view) {
      const want = views.indexOf(S.view);
      if (x.f[want]) return want;
    }
    return x.m;
  }

  /* ── 控制列 ── */
  function pill(label, n, active, attrs) {
    return '<button type="button" class="ig-pill' + (active ? ' is-active' : '') + '" aria-pressed="' + active + '" ' + attrs + '>' +
      esc(label) + (n != null ? ' <span class="ig-pill__n">' + n + '</span>' : '') + '</button>';
  }
  function seg(list, cur, attr) {
    return list.map(([val, label, disabled]) =>
      '<button type="button" ' + attr + '="' + esc(val) + '" aria-pressed="' + (String(val) === String(cur)) + '"' + (disabled ? ' disabled' : '') + '>' + esc(label) + '</button>').join('');
  }

  function renderTabs() {
    $('libTabs').innerHTML = LIBS.map((l) => {
      const on = l.key === S.lib;
      return '<a class="libtab' + (on ? ' is-active' : '') + '" href="?lib=' + l.key + '" data-lib="' + l.key + '"' + (on ? ' aria-current="page"' : '') + '>' +
        '<span class="libtab__th"' + (l.kind === 'line' ? ' data-fmt="line"' : '') + '><img' + (l.kind === 'line' ? ' class="fmt-line"' : '') + ' src="' + src(l.key, 'w300', l.thumb) + '" alt="" width="300" height="400"></span>' +
        '<span class="libtab__text"><b>' + esc(l.name) + '</b><small><span class="ig-num">' + l.n + '</span> ' + esc(l.unit) + ' · ' + esc(l.role) + '</small></span></a>';
    }).join('');
  }

  function renderControls() {
    const lib = L();
    const all = inLib();
    $('libName').textContent = lib.name;
    $('libSub').textContent = lib.sub;
    $('search').placeholder = '搜尋名稱、編號，例如：' + SEARCH_HINT[S.lib];
    document.title = '南瓜素材庫 · ' + lib.name + '（' + lib.n + ' ' + lib.unit + '）';

    $('catPills').innerHTML = pill('全部', all.length, !S.cat, 'data-cat=""') +
      lib.cats.map((c) => pill(c.n, c.c, S.cat === c.k, 'data-cat="' + c.k + '"')).join('');

    // 細分類：選了大類、而且裡面有兩種以上才顯示
    const subs = [];
    if (S.cat) {
      const cnt = new Map();
      all.filter((x) => x.c === S.cat && x.s).forEach((x) => cnt.set(x.s, (cnt.get(x.s) || 0) + 1));
      cnt.forEach((n, s) => subs.push([s, n]));
    }
    $('subPills').hidden = subs.length < 2;
    $('subPills').innerHTML = subs.length < 2 ? '' :
      pill('全部', null, !S.sub, 'data-sub=""') + subs.map(([s, n]) => pill(s, n, S.sub === s, 'data-sub="' + esc(s) + '"')).join('');

    $('viewSeg').innerHTML = seg([['', '主角度']].concat(lib.views.map((v) => [v, VIEW_NAME[v]])), S.view, 'data-view');

    const gseg = $('genderSeg');
    gseg.hidden = S.lib !== 'costume';
    if (!gseg.hidden) gseg.innerHTML = seg(GENDER, S.g, 'data-g');

    const adult = $('adult');
    adult.hidden = !all.some((x) => x.x);
    adult.setAttribute('aria-checked', String(S.adult));
    $('adultState').textContent = S.adult ? '顯示' : '模糊';
    adult.title = S.adult ? '目前直接顯示，點一下改回模糊' : '性感服裝先模糊，點一下全部顯示';
  }

  /* ── 卡片 ── */
  const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9"/><path d="M6.6 6.6C3.9 8.4 2 12 2 12s4 7 10 7c1.8 0 3.4-.6 4.8-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  function cardHtml(x) {
    const views = LIB[x.l].views;
    const v = viewOf(x);
    const f = x.f[v];
    const vl = veiled(x);
    const line = isLine(x.l);
    const inTray = (Tray.get(x.l) || {}).id === x.id;
    const label = (vl ? '顯示：' : '開啟大圖：') + x.id + ' ' + x.n + '，' + VIEW_NAME[views[v]];
    return '<article class="pose' + (vl ? ' is-veiled' : '') + '" data-id="' + x.id + '">' +
      '<button type="button" class="pose__media"' + (line ? ' data-fmt="line"' : ' data-kind="' + LIB[x.l].kind + '"') + ' aria-label="' + esc(label) + '">' +
        '<img' + (line ? ' class="fmt-line"' : '') + ' src="' + src(x.l, 'w300', f) + '" srcset="' + src(x.l, 'w300', f) + ' 300w, ' + src(x.l, 'w600', f) + ' 600w" sizes="(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 290px" width="300" height="400" alt="" loading="lazy" decoding="async">' +
        '<span class="pose__angle">' + VIEW_NAME[views[v]] + '</span>' +
        (inTray ? '<span class="pose__badge pose__badge--tray">在搭配盤</span>' : '') +
        (vl ? '<span class="pose__veil">' + EYE_OFF + '<b>性感服裝</b><small>點一下顯示</small></span>' : '') +
      '</button>' +
      '<div class="pose__body">' +
        '<h3 class="pose__title">' + esc(x.n) + '</h3>' +
        '<p class="pose__meta"><span class="ig-num">' + x.id + '</span> · ' + esc(x.s && x.s !== x.cn ? x.cn + '・' + x.s : x.cn) + '</p>' +
        '<div class="pose__views" role="group" aria-label="切換角度">' + views.map((vk, i) =>
          '<button type="button" data-v="' + i + '"' + (x.f[i] ? '' : ' disabled') + ' aria-pressed="' + (i === v) + '" aria-label="' + VIEW_NAME[vk] + '" title="' + VIEW_NAME[vk] + '">' + VIEW_SHORT[vk] + '</button>').join('') +
        '</div>' +
      '</div></article>';
  }
  function appendBatch() {
    if (S.shown < S.list.length) {
      $('grid').insertAdjacentHTML('beforeend', S.list.slice(S.shown, S.shown + BATCH).map(cardHtml).join(''));
      S.shown = Math.min(S.list.length, S.shown + BATCH);
    }
    const left = S.list.length - S.shown;
    $('more').hidden = left <= 0;
    $('more').textContent = '再顯示 ' + Math.min(BATCH, left) + ' ' + L().unit + '（還有 ' + fmtNum(left) + ' ' + L().unit + '）';
  }
  function renderGrid() {
    S.list = items.filter(matches);
    S.shown = 0;
    $('grid').innerHTML = '';
    appendBatch();
    $('empty').hidden = S.list.length > 0;
    $('count').textContent = fmtNum(S.list.length) + ' / ' + fmtNum(inLib().length) + ' ' + L().unit;
  }
  function refresh() { normalize(); renderTabs(); renderControls(); renderGrid(); syncUrl(); }
  function replaceCard(card) {
    const x = byId.get(card.dataset.id);
    const tmp = document.createElement('div');
    tmp.innerHTML = cardHtml(x);
    card.replaceWith(tmp.firstElementChild);
  }

  /* ── 控制列事件 ── */
  $('libTabs').addEventListener('click', (e) => {
    const a = e.target.closest('[data-lib]'); if (!a) return;
    e.preventDefault();
    if (a.dataset.lib === S.lib) return;
    S.lib = a.dataset.lib; S.cat = ''; S.sub = ''; S.view = ''; S.g = 'all'; S.q = ''; $('search').value = '';
    refresh();
    $('items').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('catPills').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    S.cat = b.dataset.cat; S.sub = ''; refresh();
  });
  $('subPills').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sub]'); if (!b) return;
    S.sub = b.dataset.sub; refresh();
  });
  $('viewSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    S.view = b.dataset.view; S.per = {}; refresh();
  });
  $('genderSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    S.g = b.dataset.g; refresh();
  });
  $('adult').addEventListener('click', () => {
    S.adult = !S.adult; store.set('pp.adult', S.adult ? '1' : '0');
    renderControls(); renderGrid();
  });
  let qTimer = 0;
  $('search').value = S.q;
  $('search').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { S.q = e.target.value; refresh(); }, 140);
  });
  $('clearAll').addEventListener('click', () => {
    S.cat = ''; S.sub = ''; S.g = 'all'; S.view = ''; S.q = ''; $('search').value = '';
    refresh();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]') || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    e.preventDefault(); $('search').focus();
  });
  $('grid').addEventListener('click', (e) => {
    const card = e.target.closest('.pose'); if (!card) return;
    const x = byId.get(card.dataset.id);
    const vb = e.target.closest('[data-v]');
    if (vb) {
      if (vb.disabled) return;
      S.per[x.id] = +vb.dataset.v;
      replaceCard(card);
      const again = $('grid').querySelector('.pose[data-id="' + x.id + '"] [data-v="' + vb.dataset.v + '"]');
      if (again) again.focus();
      return;
    }
    if (!e.target.closest('.pose__media')) return;
    if (veiled(x)) { S.revealed.add(x.id); replaceCard(card); return; }
    openLb(x, viewOf(x));
  });
  $('more').addEventListener('click', () => {
    const first = S.shown;
    appendBatch();
    const next = $('grid').children[first];
    if (next) { const b = next.querySelector('.pose__media'); if (b) b.focus({ preventScroll: true }); }
  });
  // 搭配盤變了（這頁或別頁），更新卡片上的「在搭配盤」標記和大圖按鈕
  document.addEventListener('pp:tray', () => {
    $('grid').querySelectorAll('.pose').forEach(replaceCard);
    if (dlg.open) renderPairBtn();
  });

  /* ── 大圖 ── */
  const dlg = $('lb');
  const LB = { x: null, v: 0, list: [], back: null };

  function openLb(x, v) {
    if (!x) return;
    if (!dlg.open) LB.back = document.activeElement;
    LB.x = x; LB.v = x.f[v] ? v : x.m;
    LB.list = S.list.includes(x) ? S.list : items.filter((y) => y.l === x.l);
    renderLb();
    if (!dlg.open) { dlg.showModal(); $('lbClose').focus(); }
    setHash();
  }
  const setHash = () => history.replaceState(null, '', location.pathname + location.search + '#' + LB.x.id + '-' + LIB[LB.x.l].views[LB.v]);
  dlg.addEventListener('close', () => {
    history.replaceState(null, '', location.pathname + location.search);
    if (LB.back && LB.back.isConnected) LB.back.focus();
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $('lbClose').addEventListener('click', () => dlg.close());

  function renderPairBtn() {
    const t = Tray.get(LB.x.l);
    const here = t && t.id === LB.x.id;
    const b = $('lbPair');
    b.textContent = here ? '✓ 已在搭配盤' : '加入搭配';
    b.setAttribute('aria-pressed', String(!!here));
    b.title = here ? '再按一次從搭配盤移除' : (t ? '會取代搭配盤裡的「' + t.n + '」' : '加到搭配盤的「' + L().name + '」格');
  }

  function renderLb() {
    const x = LB.x, v = LB.v;
    const lib = LIB[x.l], views = lib.views, line = isLine(x.l);
    const f = x.f[v];
    $('lbMeta').innerHTML = '<span class="ig-num">' + x.id + '</span> · ' + esc(lib.name) + ' · ' + esc(x.cn) + (x.s && x.s !== x.cn ? '・' + esc(x.s) : '');
    $('lbName').textContent = x.n;
    $('lbEn').textContent = x.en;
    $('lbDesc').textContent = x.d;
    const single = $('lbSingle');
    if (line) single.dataset.fmt = 'line'; else delete single.dataset.fmt;
    const img = $('lbImg');
    img.className = line ? 'fmt-line' : '';
    img.src = src(x.l, 'w900', f);
    img.alt = x.id + ' ' + x.n + '，' + VIEW_NAME[views[v]];

    const ang = $('lbAngles');
    ang.style.gridTemplateColumns = 'repeat(' + Math.max(4, views.length) + ', minmax(0, 1fr))';
    ang.innerHTML = views.map((vk, i) => {
      const fi = x.f[i];
      return '<button type="button" data-lbv="' + i + '" aria-pressed="' + (i === v) + '"' + (fi ? '' : ' disabled title="這個角度沒有圖"') + '>' +
        '<span class="th"' + (line ? ' data-fmt="line"' : '') + '>' + (fi ? '<img' + (line ? ' class="fmt-line"' : '') + ' src="' + src(x.l, 'w300', fi) + '" alt="">' : '') + '</span>' +
        '<span class="lab">' + VIEW_NAME[vk] + '</span></button>';
    }).join('');

    const dl = $('lbDl');
    dl.href = src(x.l, 'w900', f);
    dl.setAttribute('download', 'pumpkin-' + x.l + '_' + x.id + '_' + views[v] + '.webp');
    $('lbZip').textContent = '打包這件（' + x.f.filter(Boolean).length + ' 張）';
    renderPairBtn();

    $('lbPrev').disabled = LB.list.length < 2;
    $('lbNext').disabled = LB.list.length < 2;
    const n = LB.list[(LB.list.indexOf(x) + 1) % LB.list.length];
    if (n && !veiled(n)) { const im = new Image(); im.src = src(n.l, 'w900', n.f[n.f[v] ? v : n.m]); }
  }

  function stepItem(d) {
    const Ls = LB.list; if (Ls.length < 2) return;
    let i = Ls.indexOf(LB.x);
    for (let n = 0; n < Ls.length; n++) {
      i = (i + d + Ls.length) % Ls.length;
      if (!veiled(Ls[i])) break;
    }
    const keep = LIB[LB.x.l].views[LB.v];
    LB.x = Ls[i];
    const want = LIB[LB.x.l].views.indexOf(keep);
    LB.v = LB.x.f[want] ? want : LB.x.m;
    renderLb(); setHash();
  }
  function stepView(d) {
    const n = LB.x.f.length;
    for (let k = 1; k <= n; k++) {
      const v = (LB.v + d * k + n * 2) % n;
      if (LB.x.f[v]) { LB.v = v; renderLb(); setHash(); return; }
    }
  }
  function togglePair() {
    const x = LB.x, views = LIB[x.l].views;
    const t = Tray.get(x.l);
    if (t && t.id === x.id) { Tray.remove(x.l); toast('已從搭配盤移除'); return; }
    Tray.add(x.l, {
      id: x.id, n: x.n, view: VIEW_NAME[views[LB.v]], kind: LIB[x.l].kind,
      img: src(x.l, 'w300', x.f[LB.v]), big: src(x.l, 'w900', x.f[LB.v]),
      clause: CLAUSE[x.l](x)
    });
  }

  $('lbPrev').addEventListener('click', () => stepItem(-1));
  $('lbNext').addEventListener('click', () => stepItem(1));
  $('lbAngles').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lbv]'); if (!b || b.disabled) return;
    LB.v = +b.dataset.lbv; renderLb(); setHash();
  });
  $('lbCopyPrompt').addEventListener('click', () => copy(LB.x.d, '英文描述已複製'));
  $('lbLink').addEventListener('click', () => copy(location.href.split('#')[0] + '#' + LB.x.id, '連結已複製'));
  $('lbPair').addEventListener('click', togglePair);
  $('lbZip').addEventListener('click', async () => {
    const x = LB.x, views = LIB[x.l].views, b = $('lbZip');
    const list = [];
    x.f.forEach((f, i) => { if (f) list.push({ url: src(x.l, 'w900', f), path: x.id + '_' + safeName(x.n) + '_' + VIEW_NAME[views[i]] + '.webp' }); });
    b.disabled = true;
    try {
      const size = await zipFiles(list, 'pumpkin-' + x.l + '_' + x.id + '_' + safeName(x.n) + '.zip', (d, n) => { b.textContent = '打包中 ' + d + '/' + n; });
      toast('打包好了（' + (size / 1e6).toFixed(1) + ' MB）');
    } catch (err) {
      toast('沒有打包成功：' + err.message);
    } finally {
      b.disabled = false; b.textContent = '打包這件（' + x.f.filter(Boolean).length + ' 張）';
    }
  });
  dlg.addEventListener('keydown', (e) => {
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); stepItem(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepItem(-1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); stepView(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); stepView(-1); }
    else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePair(); }
  });
  let touch = null;
  $('lbStage').addEventListener('touchstart', (e) => { touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  $('lbStage').addEventListener('touchend', (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) stepItem(dx < 0 ? 1 : -1);
    else if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.4) stepView(dy < 0 ? 1 : -1);
  }, { passive: true });

  /* ── 開始 ── */
  $('heroTotal').textContent = fmtNum(items.length);
  refresh();
  if (linked) {
    const want = LIB[linked.l].views.indexOf(hashId[2]);
    openLb(linked, want >= 0 ? want : linked.m);
  } else if (/^#[a-z]+$/.test(location.hash) && document.querySelector(location.hash)) {
    requestAnimationFrame(() => document.querySelector(location.hash).scrollIntoView({ behavior: 'instant' }));
  }
})();
