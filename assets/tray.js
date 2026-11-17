/* 南瓜姿勢庫 · 搭配盤（姿勢頁和素材庫頁共用）
   一個姿勢＋每個素材庫各一件，存在 localStorage，換頁也還在。
   搭配盤自己記住縮圖、名稱和英文片語，所以不需要另外載入資料檔。
   對外提供 window.PP（小工具）和 window.PumpkinTray（加入、移除、開面板）。 */
(() => {
  'use strict';

  const SLOTS = [
    { k: 'pose', name: '姿勢', pick: '挑姿勢', href: './#poses' },
    { k: 'costume', name: '服裝', pick: '挑服裝', href: 'library.html?lib=costume' },
    { k: 'prop', name: '道具', pick: '挑道具', href: 'library.html?lib=prop' },
    { k: 'furniture', name: '家具', pick: '挑家具', href: 'library.html?lib=furniture' },
    { k: 'animal', name: '動物', pick: '挑動物', href: 'library.html?lib=animal' },
    { k: 'scene', name: '場景', pick: '挑場景', href: 'library.html?lib=scene' },
    { k: 'light', name: '光線', pick: '挑光線', href: 'library.html?lib=light' }
  ];
  const SLOT = Object.fromEntries(SLOTS.map((s) => [s.k, s]));
  const KEY = 'pp.tray';

  /* ── 小工具（兩頁共用） ── */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 無痕模式 */ } }
  };
  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast'); if (!t) return;
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
  // 把一串圖片打包成 ZIP 下載；onProgress(done, total) 可省略。
  async function zipFiles(list, name, onProgress) {
    if (location.protocol === 'file:') throw new Error('直接點開檔案時瀏覽器不讓打包，請用網址開啟');
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    let done = 0, i = 0;
    const worker = async () => {
      while (i < list.length) {
        const it = list[i++];
        const r = await fetch(it.url);
        if (!r.ok) throw new Error('有圖片下載失敗（' + r.status + '）');
        zip.file(it.path, await r.arrayBuffer());
        done++;
        if (onProgress) onProgress(done, list.length);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    return blob.size;
  }
  const safeName = (s) => String(s).replace(/[\\/:*?"<>|]/g, '').slice(0, 40);
  window.PP = { $, esc, store, toast, copy, zipFiles, safeName };

  /* ── 狀態 ── */
  // 每格：{ id, n（中文名）, view（中文機位）, img（縮圖）, big（大圖）, clause（英文片語）, kind（line / photo …） }
  let tray = {};
  try { tray = JSON.parse(store.get(KEY) || '{}') || {}; } catch (e) { tray = {}; }
  const save = () => store.set(KEY, JSON.stringify(tray));
  // 通知頁面（卡片標記、大圖按鈕）搭配盤變了
  const dispatch = () => document.dispatchEvent(new CustomEvent('pp:tray'));
  const filled = () => SLOTS.filter((s) => tray[s.k]);
  const prompt = () => filled().map((s) => tray[s.k].clause).filter(Boolean).join(', ');

  /* ── 介面 ── */
  const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const XICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'tray-fab';
  fab.hidden = true;
  const dlg = document.createElement('dialog');
  dlg.className = 'tray';
  dlg.setAttribute('aria-labelledby', 'trayTitle');
  dlg.innerHTML =
    '<div class="tray__head"><div><p class="tray__eyebrow">搭配盤</p><h2 class="tray__title" id="trayTitle"></h2></div>' +
    '<button class="lb__close" type="button" data-tray="close" aria-label="關閉">' + XICON + '</button></div>' +
    '<div class="tray__slots" id="traySlots"></div>' +
    '<div class="tray__prompt"><div class="tray__ph"><p class="lb__label">合成英文提示詞</p><span class="tray__hint">依姿勢 → 服裝 → 道具 → 家具 → 動物 → 場景 → 光線排列</span></div>' +
    '<textarea id="trayPrompt" readonly rows="5" lang="en" aria-label="合成英文提示詞"></textarea></div>' +
    '<div class="tray__actions">' +
      '<button class="ig-btn ig-btn--gold" type="button" data-tray="copy">複製提示詞</button>' +
      '<button class="ig-btn ig-btn--ghost" type="button" data-tray="zip" id="trayZip">打包這組圖</button>' +
      '<button class="ig-btn ig-btn--ghost tray__clear" type="button" data-tray="clear">清空</button>' +
    '</div>';

  function slotHtml(s) {
    const t = tray[s.k];
    if (!t) {
      return '<a class="tslot is-empty" href="' + s.href + '"><span class="tslot__th">' + PLUS + '</span>' +
        '<span class="tslot__text"><small>' + s.name + '</small><b>' + s.pick + '</b></span></a>';
    }
    return '<div class="tslot"><span class="tslot__th"' + (t.kind === 'line' ? ' data-fmt="line"' : '') + '>' +
        '<img' + (t.kind === 'line' ? ' class="fmt-line"' : '') + ' src="' + esc(t.img) + '" alt="" loading="lazy"></span>' +
      '<span class="tslot__text"><small>' + s.name + ' · <span class="ig-num">' + esc(t.id) + '</span>' + (t.view ? ' · ' + esc(t.view) : '') + '</small><b>' + esc(t.n) + '</b>' +
        '<a class="tslot__swap" href="' + s.href + '">換一個</a></span>' +
      '<button class="tslot__x" type="button" data-tray="remove:' + s.k + '" aria-label="從搭配盤移除' + s.name + '">' + XICON + '</button></div>';
  }

  function render() {
    const f = filled();
    document.body.classList.toggle('has-tray', f.length > 0);
    fab.hidden = f.length === 0;
    fab.innerHTML = '<span class="tray-fab__thumbs">' + f.slice(0, 3).map((s) =>
      '<span' + (tray[s.k].kind === 'line' ? ' data-fmt="line"' : '') + '><img' + (tray[s.k].kind === 'line' ? ' class="fmt-line"' : '') + ' src="' + esc(tray[s.k].img) + '" alt=""></span>').join('') + '</span>' +
      '<span class="tray-fab__text">搭配盤 <b class="ig-num">' + f.length + '</b></span>';
    fab.setAttribute('aria-label', '打開搭配盤，目前 ' + f.length + ' 件');
    if (!dlg.open) return;
    $('trayTitle').textContent = f.length ? '已挑 ' + f.length + ' 件，還能再加 ' + (SLOTS.length - f.length) + ' 件' : '還沒挑任何東西';
    $('traySlots').innerHTML = SLOTS.map(slotHtml).join('');
    $('trayPrompt').value = prompt();
  }

  function open() {
    if (!dlg.open) dlg.showModal();
    render();
  }

  dlg.addEventListener('click', async (e) => {
    if (e.target === dlg) { dlg.close(); return; }
    const b = e.target.closest('[data-tray]'); if (!b) return;
    const act = b.dataset.tray;
    if (act === 'close') dlg.close();
    else if (act === 'copy') {
      const p = prompt();
      if (!p) { toast('先挑一個姿勢或素材'); return; }
      copy(p, '整組英文提示詞已複製');
    } else if (act === 'clear') {
      tray = {}; save(); render(); dispatch(); toast('搭配盤清空了');
    } else if (act.startsWith('remove:')) {
      delete tray[act.slice(7)]; save(); render(); dispatch();
    } else if (act === 'zip') {
      const slots = filled();
      if (!slots.length) { toast('先挑一個姿勢或素材'); return; }
      const list = slots.map((s, i) => ({ url: tray[s.k].big, path: (i + 1) + '_' + s.name + '_' + tray[s.k].id + '_' + safeName(tray[s.k].n) + '.webp' }));
      const zipName = 'pumpkin-set_' + slots.map((s) => tray[s.k].id).join('-') + '.zip';
      b.disabled = true;
      try {
        const size = await zipFiles(list, zipName, (d, n) => { b.textContent = '打包中 ' + d + '/' + n; });
        toast('這組圖打包好了（' + (size / 1e6).toFixed(1) + ' MB）');
      } catch (err) {
        toast('沒有打包成功：' + err.message);
      } finally {
        b.disabled = false; b.textContent = '打包這組圖';
      }
    }
  });
  fab.addEventListener('click', open);

  // 別的頁面（或另一個分頁）改了搭配盤，這頁跟著更新。
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    try { tray = JSON.parse(e.newValue || '{}') || {}; } catch (_) { tray = {}; }
    render(); dispatch();
  });

  function add(slot, item) {
    if (!SLOT[slot]) return;
    const replaced = tray[slot] && tray[slot].id !== item.id;
    tray[slot] = item; save(); render(); dispatch();
    const left = SLOTS.length - filled().length;
    toast((replaced ? '已換成' : '已加入搭配盤：') + item.n + (left ? '（還能加 ' + left + ' 件）' : ''));
  }
  const get = (slot) => tray[slot] || null;
  function remove(slot) { delete tray[slot]; save(); render(); dispatch(); }

  window.PumpkinTray = { add, get, remove, open, SLOTS };

  function mount() {
    document.body.appendChild(fab);
    document.body.appendChild(dlg);
    render();
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
