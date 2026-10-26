// Сайт әкімшісінің беті. Рөлдер: бас әкімші, әкімші (белгіленген бөлімдер), сынып жетекшісі, әкімшілік мүшесі (тек қарау).
(function(){
  'use strict';
  const D = window.SITE_DEFAULTS;
  const I18N = D.I18N;
  const API = window.API_URL || '';
  const LANGS = ['kz', 'ru', 'en'];
  const SITE_URL = location.href.replace(/admin\.html.*$/, '').replace(/#.*$/, '');
  let LOGIN = '', PW = null, ME = null, DATA = null, CLS = null, USERS = [], TEACHERS = {}, INFO = {}, TAB = null, dirty = false, curCls = null;

  // ---------- көмекші функциялар ----------
  function h(tag, attrs, ...kids){
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(9).forEach(c => { if (c == null || c === false) return; el.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return el;
  }
  const $ = id => document.getElementById(id);
  const clone = x => JSON.parse(JSON.stringify(x == null ? null : x));
  const strip = s => String(s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  const L = o => o == null ? '' : typeof o === 'string' ? o : (o.kz || o.ru || o.en || '');
  const isDrive = ref => ref && !/[\/.]/.test(ref);
  const pad = n => (n < 10 ? '0' : '') + n;
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const today = () => ymd(new Date());
  const monday = s => { const d = parse(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return ymd(d); };
  const MONTHS = ['қаңтар','ақпан','наурыз','сәуір','мамыр','маусым','шілде','тамыз','қыркүйек','қазан','қараша','желтоқсан'];
  const DOW = ['Жексенбі','Дүйсенбі','Сейсенбі','Сәрсенбі','Бейсенбі','Жұма','Сенбі'];
  const fmt = (s, dow) => { const d = parse(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + (dow ? ', ' + DOW[d.getDay()] : ''); };
  const fmtTs = ts => { const d = new Date(ts); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const get = key => (DATA[key] !== undefined && DATA[key] !== null) ? DATA[key] : (D[key] ? D[key]() : null);
  function thumbUrl(m, w){
    w = w || 400;
    if (m.t === 'yt') return 'https://i.ytimg.com/vi/' + m.id + '/hqdefault.jpg';
    if (m.t === 'drive') return 'https://drive.google.com/thumbnail?id=' + m.id + '&sz=w' + w;
    return isDrive(m.id) ? 'https://lh3.googleusercontent.com/d/' + m.id + '=w' + w : m.id;
  }

  // ---------- рөлдер мен рұқсаттар ----------
  const ROLE_NAMES = {owner: 'Бас әкімші', admin: 'Әкімші', teacher: 'Сынып жетекшісі', viewer: 'Әкімшілік мүшесі (тек қарау)'};
  const PERM_NAMES = {posts: '📰 Жаңалықтар', menu: '🍽 Ас мәзірі', week: '🗓 Апта жоспары', photos: '🖼 Суреттер', team: '👥 Ұжым',
    faq: '❓ Ата-анаға ақпарат', texts: '✏️ Мәтіндер', contacts: '☎ Байланыс', classes: '🏫 Сыныптарды қарау', log: '📜 Журнал'};
  const isOwner = () => ME.role === 'owner';
  const can = p => isOwner() || (ME.role === 'admin' && (ME.perms || []).includes(p));
  const seesClasses = () => isOwner() || ME.role === 'viewer' || ME.role === 'teacher' || can('classes');
  const allClasses = () => get('settings').classes || [];
  const classList = () => ME.role === 'teacher' ? (ME.classes || []) : allClasses();
  const canEditClass = c => isOwner() || (ME.role === 'teacher' && (ME.classes || []).includes(c));

  function toast(msg, err){
    const el = h('div', {class: err ? 'err' : ''}, msg);
    $('toast').append(el);
    setTimeout(() => el.remove(), err ? 7000 : 3500);
  }
  function busy(text, pct){
    $('busy').hidden = false;
    $('busyText').textContent = text || 'Сақталуда…';
    $('busyBar').style.width = (pct == null ? 100 : pct) + '%';
  }
  const done = () => { $('busy').hidden = true; };
  function modal(...kids){
    const body = $('modalBody');
    body.innerHTML = '';
    body.append(...kids);
    $('modal').hidden = false;
    return () => { $('modal').hidden = true; body.innerHTML = ''; };
  }

  async function api(a, body){
    if (!API) throw new Error('Сервер мекенжайы әлі орнатылмаған (config.js файлы).');
    let r;
    try {
      r = await fetch(API, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(Object.assign({a, login: LOGIN, pw: PW}, body || {}))});
    } catch (e) { throw new Error('Интернет байланысын тексеріңіз.'); }
    const txt = await r.text();
    let j;
    try { j = JSON.parse(txt); } catch (e) { throw new Error('Сервер жауабы түсініксіз. Google Apps Script жариялауын тексеріңіз.'); }
    if (!j.ok) throw new Error(j.err || 'Қате');
    return j;
  }
  async function run(text, fn){
    busy(text);
    try { const r = await fn(); done(); return r; }
    catch (e) { done(); toast(e.message, true); throw e; }
  }

  // ---------- өріс компоненттері ----------
  function plainInput(val, opt){
    const el = (opt.rows || 1) > 1
      ? h('textarea', {class: 'inp', rows: opt.rows, placeholder: opt.placeholder || ''})
      : h('input', {class: 'inp', type: 'text', placeholder: opt.placeholder || '', list: opt.list || null});
    el.value = val || '';
    return {el, get: () => el.value.trim(), set: v => { el.value = v || ''; }};
  }
  function richEditor(val, opt){
    const ed = h('div', {class: 'rich-ed' + (opt.small ? ' small' : ''), contenteditable: 'true'});
    ed.innerHTML = val || '';
    const cmd = (c, v) => { ed.focus(); document.execCommand(c, false, v); ed.dispatchEvent(new Event('input', {bubbles: true})); };
    const bar = h('div', {class: 'rich-bar'},
      h('button', {type: 'button', title: 'Қалың', onmousedown: e => { e.preventDefault(); cmd('bold'); }}, 'B'),
      h('button', {type: 'button', title: 'Көлбеу', style: 'font-style:italic', onmousedown: e => { e.preventDefault(); cmd('italic'); }}, 'I'),
      h('button', {type: 'button', title: 'Тізім', onmousedown: e => { e.preventDefault(); cmd('insertUnorderedList'); }}, '• Тізім'),
      h('button', {type: 'button', title: 'Нөмірлі тізім', onmousedown: e => { e.preventDefault(); cmd('insertOrderedList'); }}, '1.'),
      h('button', {type: 'button', title: 'Сілтеме', onmousedown: e => { e.preventDefault(); const u = prompt('Сілтеме мекенжайы (https://… немесе tel:+7…)'); if (u) cmd('createLink', u); }}, '🔗'),
      h('button', {type: 'button', title: 'Пішімді тазалау', onmousedown: e => { e.preventDefault(); cmd('removeFormat'); cmd('unlink'); }}, '⌫'));
    ed.addEventListener('paste', e => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
    return {el: h('div', {}, bar, ed), get: () => (strip(ed.innerHTML) || /<img/i.test(ed.innerHTML)) ? ed.innerHTML.replace(/(<br\s*\/?>|\s|&nbsp;)+$/i, '') : '', set: v => { ed.innerHTML = v || ''; }};
  }
  // Үш тілді өріс: KZ / RU / EN қойындылары және «Аудару» батырмасы
  function mlField(label, value, opt){
    opt = opt || {};
    const v = Object.assign({kz: '', ru: '', en: ''}, typeof value === 'string' ? {kz: value} : (value || {}));
    let cur = 'kz';
    const eds = {}, tabs = {};
    const head = h('div', {class: 'flex items-center gap-1 mb-1.5 flex-wrap'}, h('span', {class: 'lbl flex-1 min-w-[8rem]'}, label));
    LANGS.forEach(l => { tabs[l] = h('button', {type: 'button', class: 'ml-tab', onclick: () => show(l)}, l.toUpperCase()); head.append(tabs[l]); });
    const tr = h('button', {type: 'button', class: 'ml-tr', title: 'Осы тілдегі мәтінді қалған тілдерге аудару', onclick: translate}, '🌐 Аудару');
    head.append(tr);
    const wrap = h('div', {class: 'ml'}, head);
    LANGS.forEach(l => {
      eds[l] = opt.rich ? richEditor(v[l], opt) : plainInput(v[l], opt);
      eds[l].el.hidden = l !== cur;
      eds[l].el.addEventListener('input', mark);
      wrap.append(eds[l].el);
    });
    function show(l){ cur = l; LANGS.forEach(k => { eds[k].el.hidden = k !== l; }); mark(); }
    function mark(){ LANGS.forEach(k => { tabs[k].classList.toggle('on', k === cur); tabs[k].classList.toggle('empty', !strip(eds[k].get())); }); }
    async function translate(){
      const text = eds[cur].get();
      if (!strip(text)) { toast('Алдымен ' + cur.toUpperCase() + ' тілінде жазыңыз', true); return; }
      const val = {kz: '', ru: '', en: ''}; val[cur] = text;
      tr.disabled = true; tr.textContent = 'Аударылуда…';
      try {
        const j = await api('translate', {value: val});
        LANGS.forEach(k => { if (k !== cur && j.value[k]) eds[k].set(j.value[k]); });
        mark(); dirty = true; toast('Аударылды. Тексеріп шығыңыз.');
      } catch (e) { toast(e.message, true); }
      finally { tr.disabled = false; tr.textContent = '🌐 Аудару'; }
    }
    mark();
    return {el: wrap, get: () => ({kz: eds.kz.get(), ru: eds.ru.get(), en: eds.en.get()})};
  }
  const hasText = o => LANGS.some(l => strip(o && o[l]));
  function field(label, input){ return h('div', {}, h('label', {class: 'lbl mb-1.5'}, label), input); }
  function dateInput(val){ const el = h('input', {type: 'date', class: 'inp'}); el.value = val || today(); return el; }
  function hint(text){ return h('p', {class: 'text-sm text-charcoal/65 bg-gold-50 border border-gold-100 rounded-xl px-3 py-2'}, text); }
  const AUTO_HINT = 'Бір тілде (мысалы, қазақша) жазсаңыз жеткілікті: бос қалған тілдер сақтағанда автоматты түрде аударылады.';

  // Сыныптарды таңдау: opts — таңдауға болатын сыныптар, allowAll — «Барлық сыныптар» (*)
  function classPicker(selected, opts, allowAll){
    const sel = new Set(selected || []);
    const box = h('div', {class: 'flex flex-wrap gap-1.5'});
    const all = (allowAll ? ['*'] : []).concat(opts);
    function render(){
      box.innerHTML = '';
      all.forEach(c => box.append(h('button', {type: 'button', class: 'chip' + (sel.has(c) ? ' active' : ''), style: 'padding:.35rem .7rem',
        onclick: () => { if (c === '*') { sel.clear(); sel.add('*'); } else { sel.delete('*'); sel.has(c) ? sel.delete(c) : sel.add(c); } dirty = true; render(); }},
        c === '*' ? 'Барлық сыныптар' : c)));
    }
    render();
    return {el: box, get: () => [...sel]};
  }

  // ---------- суреттер мен видео ----------
  function resizeImage(file, max, q){
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', q).split(',')[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Суретті ашу мүмкін болмады: ' + file.name)); };
      img.src = url;
    });
  }
  async function uploadPhoto(file, cls){
    const b64 = await resizeImage(file, 1600, 0.82);
    const j = await api('upload', {name: file.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', b64, cls});
    return j.id;
  }
  async function uploadVideo(file, cls, onpct){
    const mime = file.type || 'video/mp4';
    const j = await api('videoInit', {name: file.name, mime, size: file.size, origin: location.origin, cls});
    const id = await new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open('PUT', j.url);
      x.setRequestHeader('Content-Type', mime);
      x.upload.onprogress = e => { if (e.lengthComputable) onpct(Math.round(e.loaded * 100 / e.total)); };
      x.onload = () => {
        if (x.status >= 200 && x.status < 300) { try { res(JSON.parse(x.responseText).id); } catch (e) { rej(new Error('Видео жүктелді, бірақ жауап түсініксіз')); } }
        else rej(new Error('Видео жүктеу қатесі (' + x.status + ')'));
      };
      x.onerror = () => rej(new Error('Видеоны жүктеу мүмкін болмады. Оны Drive қалтаңызға салып, «Drive қалтамнан» батырмасымен таңдаңыз.'));
      x.send(file);
    });
    await api('videoDone', {id});
    return id;
  }
  function parseLink(u){
    u = String(u || '').trim();
    let m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/);
    if (m) return {t: 'yt', id: m[1]};
    m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]{20,})/);
    if (m) return {t: 'drive', id: m[1]};
    return null;
  }
  // Қызметкердің Drive қалтасынан файл таңдау терезесі
  async function pickFromDrive(cls, single){
    const j = await run('Drive қалтасы ашылуда…', () => api('listFiles', {cls}));
    return new Promise(resolve => {
      const chosen = new Set();
      const grid = h('div', {class: 'grid grid-cols-3 sm:grid-cols-5 gap-2'});
      j.files.forEach(f => {
        const isVid = /^video\//.test(f.mime);
        const m = {t: isVid ? 'drive' : 'img', id: f.id};
        const cell = h('button', {type: 'button', class: 'thumb', title: f.name, onclick: () => {
          if (single) { chosen.clear(); grid.querySelectorAll('.thumb').forEach(t => t.style.outline = ''); }
          chosen.has(f.id) ? chosen.delete(f.id) : chosen.add(f.id);
          cell.style.outline = chosen.has(f.id) ? '3px solid #D4AF37' : '';
        }}, h('img', {src: 'https://drive.google.com/thumbnail?id=' + f.id + '&sz=w300', referrerpolicy: 'no-referrer', onerror: function(){ this.style.opacity = .15; }}),
          isVid ? h('span', {class: 'tag'}, '▶ Видео') : null);
        cell._m = m;
        grid.append(cell);
      });
      const close = modal(
        h('div', {class: 'flex items-center justify-between gap-2 mb-3'}, h('h3', {class: 'font-extrabold text-emerald-950'}, '📁 Drive қалтамдағы файлдар'),
          h('a', {href: j.folder, target: '_blank', class: 'btn btn-l btn-s'}, 'Қалтаны ашу ↗')),
        h('p', {class: 'text-xs text-charcoal/60 mb-3'}, 'Қалта браузерде ашық тұрған Google аккаунтыңызбен ашылады. Қызметкер өз Gmail-ымен кірсе, тек өзіне берілген қалтаны көреді.'),
        j.files.length ? grid : h('p', {class: 'text-charcoal/60'}, 'Қалтада әзірге фото не видео жоқ. Алдымен файлдарды Google Drive-тағы қалтаңызға жүктеңіз.'),
        h('div', {class: 'flex justify-end gap-2 mt-4'},
          h('button', {type: 'button', class: 'btn btn-l', onclick: () => { close(); resolve([]); }}, 'Бас тарту'),
          h('button', {type: 'button', class: 'btn btn-g', onclick: async () => {
            const ids = [...chosen];
            close();
            if (ids.length) { try { await api('share', {ids}); } catch (e) {} }
            resolve([...grid.children].filter(c => ids.includes(c._m.id)).map(c => c._m));
          }}, 'Таңдау')));
    });
  }
  // Фото/видео тізімі. opt.single — бір ғана сурет; opt.video — видео рұқсат; opt.cls — қай сыныптың қалтасына жүктеледі
  function mediaEditor(items, opt){
    opt = opt || {};
    let list = clone(items || []);
    const orig = new Set((items || []).filter(m => m.t !== 'yt' && isDrive(m.id)).map(m => m.id));
    let uploading = 0;
    const grid = h('div', {class: opt.single ? 'grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-xs' : 'grid grid-cols-3 sm:grid-cols-6 gap-2'});
    const ups = [];
    const photoIn = h('input', {type: 'file', accept: 'image/*', multiple: !opt.single, hidden: true, onchange: e => { addPhotos([...e.target.files]); e.target.value = ''; }});
    const videoIn = h('input', {type: 'file', accept: 'video/*', hidden: true, onchange: e => { if (e.target.files[0]) addVideo(e.target.files[0]); e.target.value = ''; }});
    const hasFolder = ME.role !== 'viewer';
    const btns = h('div', {class: 'flex flex-wrap gap-2 mt-2'},
      h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => photoIn.click()}, opt.single ? '📷 Сурет таңдау' : '📷 Фото қосу'),
      opt.video ? h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => videoIn.click()}, '🎬 Видео файл') : null,
      hasFolder ? h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: async () => {
        const got = await pickFromDrive(opt.cls, opt.single);
        got.filter(m => opt.video || m.t === 'img').forEach(m => { if (opt.single) list = []; list.push(m); });
        if (got.length) { dirty = true; render(); }
      }}, '📁 Drive қалтамнан') : null,
      opt.video ? h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: addLink}, '🔗 YouTube сілтеме') : null,
      photoIn, videoIn);
    function render(){
      grid.innerHTML = '';
      list.forEach((m, i) => {
        const tools = opt.single ? null : h('div', {class: 'mv'},
          i > 0 ? h('button', {type: 'button', onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; dirty = true; render(); }}, '‹') : null,
          i < list.length - 1 ? h('button', {type: 'button', onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; dirty = true; render(); }}, '›') : null);
        grid.append(h('div', {class: 'thumb'},
          h('img', {src: thumbUrl(m), referrerpolicy: 'no-referrer', onerror: function(){ this.style.opacity = .15; }}),
          m.t !== 'img' ? h('span', {class: 'tag'}, m.t === 'yt' ? '▶ YouTube' : '▶ Видео') : null,
          h('button', {type: 'button', class: 'x', title: 'Өшіру', onclick: () => { list.splice(i, 1); dirty = true; render(); }}, '✕'), tools));
      });
      ups.forEach(u => grid.append(h('div', {class: 'thumb flex flex-col items-center justify-center p-2 text-center'},
        h('div', {class: 'text-xs font-bold text-emerald-900'}, u.label), h('div', {class: 'bar w-full mt-2'}, h('div', {style: 'width:' + u.pct + '%'})))));
      btns.hidden = opt.single && list.length > 0;
    }
    async function addPhotos(files){
      if (opt.single) { files = files.slice(0, 1); list = []; }
      for (const f of files) {
        const u = {label: 'Жүктелуде…', pct: 30}; ups.push(u); uploading++; render();
        try { const id = await uploadPhoto(f, opt.cls); list.push({t: 'img', id}); dirty = true; }
        catch (e) { toast(e.message, true); }
        finally { ups.splice(ups.indexOf(u), 1); uploading--; render(); }
      }
    }
    async function addVideo(f){
      if (f.size > 1024 * 1024 * 1024) { toast('Видео 1 ГБ-тан үлкен. Оны Drive қалтаңызға салып, «Drive қалтамнан» арқылы таңдаңыз.', true); return; }
      const u = {label: 'Видео 0%', pct: 0}; ups.push(u); uploading++; render();
      try {
        const id = await uploadVideo(f, opt.cls, p => { u.pct = p; u.label = 'Видео ' + p + '%'; render(); });
        list.push({t: 'drive', id}); dirty = true;
        toast('Видео жүктелді. Google оны өңдеуге бірнеше минут кетуі мүмкін.');
      } catch (e) { toast(e.message, true); }
      finally { ups.splice(ups.indexOf(u), 1); uploading--; render(); }
    }
    function addLink(){
      const u = prompt('YouTube немесе Google Drive сілтемесін қойыңыз:');
      if (!u) return;
      const m = parseLink(u);
      if (!m) { toast('Сілтеме танылмады. YouTube немесе Google Drive сілтемесі болуы керек.', true); return; }
      list.push(m); dirty = true; render();
    }
    render();
    return {
      el: h('div', {}, grid, btns),
      get: () => list.slice(),
      removed: () => [...orig].filter(id => !list.some(m => m.id === id)),
      busy: () => uploading > 0
    };
  }
  const singleImg = (ref) => {
    const m = mediaEditor(ref ? [{t: 'img', id: ref}] : [], {single: true});
    return Object.assign({}, m, {value: () => (m.get()[0] || {}).id || ''});
  };
  function checkUploads(...eds){ if (eds.some(e => e && e.busy && e.busy())) { toast('Файлдар әлі жүктелуде, сәл күтіңіз.', true); return false; } return true; }
  function mediaThumbs(media){
    if (!media || !media.length) return null;
    return h('div', {class: 'flex flex-wrap gap-1.5 mt-2'}, media.slice(0, 8).map(m => h('a', {href: m.t === 'yt' ? 'https://youtu.be/' + m.id : 'https://drive.google.com/file/d/' + m.id + '/view', target: '_blank'},
      h('img', {src: thumbUrl(m, 200), referrerpolicy: 'no-referrer', class: 'w-14 h-14 rounded-lg object-cover bg-emerald-50', onerror: function(){ this.style.opacity = .2; }}))));
  }

  // Тізім редакторы: жолдарды қосу, жою, жоғары/төмен жылжыту
  function listEditor(items, makeRow, newItem, addLabel){
    const rows = [];
    const box = h('div', {class: 'space-y-3'});
    const add = h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { rows.push(makeRow(newItem())); dirty = true; render(); }}, '+ ' + (addLabel || 'Қосу'));
    (items || []).forEach(it => rows.push(makeRow(it)));
    function render(){
      box.innerHTML = '';
      rows.forEach((r, i) => box.append(h('div', {class: 'flex gap-2 items-start rounded-2xl border border-emerald-900/10 bg-white p-3'},
        h('div', {class: 'flex-1 min-w-0 space-y-3'}, r.el),
        h('div', {class: 'row-tools flex flex-col gap-1'},
          h('button', {type: 'button', title: 'Жоғары', onclick: () => { if (i > 0) { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; dirty = true; render(); } }}, '↑'),
          h('button', {type: 'button', title: 'Төмен', onclick: () => { if (i < rows.length - 1) { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; dirty = true; render(); } }}, '↓'),
          h('button', {type: 'button', title: 'Өшіру', style: 'color:#B42318', onclick: () => { if (confirm('Өшіру керек пе?')) { rows.splice(i, 1); dirty = true; render(); } }}, '✕')))));
    }
    render();
    return {el: h('div', {}, box, h('div', {class: 'mt-3'}, add)), get: () => rows.map(r => r.get()), rows};
  }

  // ---------- беттің жалпы құрылымы ----------
  const TABS = [
    ['posts', '📰 Жаңалықтар', () => can('posts')],
    ['menu', '🍽 Ас мәзірі', () => can('menu')],
    ['week', '🗓 Апта жоспары', () => can('week')],
    ['cposts', '🏫 Сынып жаңалықтары', seesClasses],
    ['hw', '📚 Үй тапсырмасы', seesClasses],
    ['qa', '💬 Ата-ана сұрақтары', seesClasses],
    ['codes', '🔑 Ата-ана кодтары', () => isOwner() || ME.role === 'teacher'],
    ['users', '👤 Қызметкерлер', isOwner],
    ['log', '📜 Журнал', () => isOwner() || ME.role === 'viewer' || can('log')],
    ['team', '👥 Ұжым', () => can('team')],
    ['faq', '❓ Ата-анаға ақпарат', () => can('faq')],
    ['photos', '🖼 Суреттер', () => can('photos')],
    ['texts', '✏️ Мәтіндер', () => can('texts')],
    ['contacts', '☎ Байланыс', () => can('contacts')],
    ['settings', '⚙ Баптаулар', isOwner],
    ['account', '🔒 Парольім', () => !isOwner()]
  ];
  const visibleTabs = () => TABS.filter(t => t[2]());
  function renderTabs(){
    $('tabs').innerHTML = '';
    visibleTabs().forEach(([k, label]) => {
      const badge = k === 'qa' ? unanswered().length : 0;
      $('tabs').append(h('button', {type: 'button', class: 'chip' + (k === TAB ? ' active' : ''), onclick: () => go(k)}, label, badge ? h('span', {class: 'ml-1 bg-gold text-emerald-950 rounded-full px-1.5 text-xs'}, badge) : null));
    });
  }
  function go(tab, force){
    if (dirty && !force && !confirm('Сақталмаған өзгерістер бар. Оларды тастап кете берейін бе?')) return;
    dirty = false; TAB = tab; renderTabs();
    const view = $('view');
    view.innerHTML = '';
    view.oninput = () => { dirty = true; };
    VIEWS[tab](view);
    window.scrollTo(0, 0);
  }
  function section(title, ...kids){ return h('section', {class: 'card space-y-4'}, title ? h('h2', {class: 'text-lg font-extrabold text-emerald-950'}, title) : null, kids); }
  function saveBar(label, onclick, extra){
    return h('div', {class: 'sticky bottom-3 z-30 flex flex-wrap gap-2 justify-end bg-cream/90 backdrop-blur rounded-2xl p-2'}, extra || null, h('button', {type: 'button', class: 'btn btn-g shadow-card', onclick}, '💾 ' + (label || 'Сақтау')));
  }
  function savedToast(){ toast('Сақталды ✓ Сайтта бірнеше секундтан кейін көрінеді.'); }
  const title = text => h('h1', {class: 'text-2xl font-extrabold text-emerald-950 mb-4'}, text);
  // Сынып таңдау жолағы (сынып бөлімдерінің жоғарғы жағында)
  function classBar(onpick, badgeFn){
    const list = classList();
    if (!curCls || !list.includes(curCls)) curCls = list[0] || null;
    if (!list.length) return h('p', {class: 'card text-charcoal/70'}, ME.role === 'teacher' ? 'Сізге әлі сынып бекітілмеген. Бас әкімшіге хабарласыңыз.' : 'Баптауларда сыныптар тізімі бос.');
    return h('div', {class: 'flex flex-wrap gap-1.5 mb-4'}, list.map(c => {
      const b = badgeFn ? badgeFn(c) : 0;
      return h('button', {type: 'button', class: 'chip' + (c === curCls ? ' active' : ''), style: 'padding:.35rem .75rem', onclick: () => { if (dirty && !confirm('Сақталмаған өзгерістер жоғалады. Жалғастырайын ба?')) return; curCls = c; dirty = false; onpick(); }},
        c, b ? h('span', {class: 'bg-gold text-emerald-950 rounded-full px-1.5 text-xs'}, b) : null);
    }));
  }

  const VIEWS = {};

  // ---------- 📰 Мектеп жаңалықтары ----------
  const CATS = {announce: 'Хабарландыру', event: 'Іс-шара (фото/видео)', greet: 'Құттықтау'};
  VIEWS.posts = function(view){
    const posts = (DATA.posts || []).slice().sort((a, b) => (!!b.pinned - !!a.pinned) || (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0)));
    view.append(h('div', {class: 'flex flex-wrap items-center justify-between gap-3 mb-4'},
      h('h1', {class: 'text-2xl font-extrabold text-emerald-950'}, 'Мектеп жаңалықтары'),
      h('button', {type: 'button', class: 'btn btn-g', onclick: () => postEditor(view, null)}, '+ Жаңа жазба')));
    view.append(hint('Бұл жаңалықтар сайтта барлығына көрінеді. Тек бір сыныпқа арналған жаңалықты «🏫 Сынып жаңалықтары» бөліміне жазыңыз.'));
    if (!posts.length) view.append(h('p', {class: 'text-charcoal/60 mt-4'}, 'Әзірге жазба жоқ.'));
    view.append(h('div', {class: 'space-y-3 mt-4'}, posts.map(p => h('div', {class: 'card flex gap-3 items-center'},
      p.media && p.media[0] ? h('img', {src: thumbUrl(p.media[0]), referrerpolicy: 'no-referrer', class: 'w-16 h-16 rounded-xl object-cover shrink-0 bg-emerald-50'}) : h('div', {class: 'w-16 h-16 rounded-xl bg-emerald-50 shrink-0 flex items-center justify-center text-2xl'}, p.cat === 'greet' ? '🎉' : p.cat === 'event' ? '📸' : '📢'),
      h('div', {class: 'flex-1 min-w-0'},
        h('div', {class: 'text-xs font-bold text-charcoal/60'}, (p.pinned ? '📌 ' : '') + CATS[p.cat] + ' · ' + fmt(p.date) + (p.by ? ' · ' + p.by : '')),
        h('div', {class: 'font-bold text-emerald-950 truncate'}, L(p.title) || '(атаусыз)')),
      h('div', {class: 'flex gap-2 shrink-0'},
        h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => postEditor(view, p)}, 'Өзгерту'),
        h('button', {type: 'button', class: 'btn btn-d btn-s', onclick: () => removeItem('remove', 'posts', p, () => go('posts', true))}, 'Өшіру'))))));
  };
  async function removeItem(op, col, item, after){
    if (!confirm('«' + (L(item.title) || L(item.subject) || 'Жазба') + '» өшірілсін бе? Оның фото/видеолары да өшіріледі.')) return;
    await run('Өшірілуде…', () => api(op, {col, id: item.id}));
    if (op === 'remove') DATA[col] = (DATA[col] || []).filter(x => x.id !== item.id);
    else CLS[col] = (CLS[col] || []).filter(x => x.id !== item.id);
    toast('Өшірілді');
    after();
  }
  function postEditor(view, p){
    dirty = false;
    p = p ? clone(p) : {cat: 'announce', date: today(), pinned: false, media: []};
    view.innerHTML = '';
    const cat = h('select', {class: 'inp'}, Object.entries(CATS).map(([k, v]) => h('option', {value: k}, v)));
    cat.value = p.cat;
    const date = dateInput(p.date);
    const pinned = h('input', {type: 'checkbox', checked: !!p.pinned});
    const ttl = mlField('Тақырыбы *', p.title);
    const tag = mlField('Белгі (міндетті емес, мысалы: «Жаңа бағдарлама»)', p.tag);
    const body = mlField('Мәтіні', p.body, {rich: true});
    const media = mediaEditor(p.media, {video: true});
    const linkUrl = h('input', {class: 'inp', type: 'text', placeholder: 'https://… немесе #leadform'}); linkUrl.value = (p.link && p.link.url) || '';
    const linkLabel = mlField('Батырма жазуы', p.link && p.link.label);
    view.append(
      h('button', {type: 'button', class: 'btn btn-l btn-s mb-4', onclick: () => go('posts')}, '← Тізімге қайту'),
      h('div', {class: 'space-y-4'},
        section(p.id ? 'Жазбаны өзгерту' : 'Жаңа жазба',
          hint(AUTO_HINT),
          h('div', {class: 'grid sm:grid-cols-3 gap-3'}, field('Түрі', cat), field('Күні', date),
            h('label', {class: 'flex items-center gap-2 font-semibold text-sm sm:mt-6'}, pinned, '📌 Ең жоғарыда тұрсын')),
          ttl.el, tag.el, body.el),
        section('Фото және видео', h('p', {class: 'text-sm text-charcoal/65'}, 'Фотолар автоматты түрде кішірейтіліп, Google Drive-қа сақталады. Үлкен видеоларды алдымен Drive қалтаңызға салып, «📁 Drive қалтамнан» арқылы таңдаған ыңғайлы.'), media.el),
        h('details', {class: 'card'}, h('summary', {class: 'font-bold text-emerald-950'}, '➕ Батырма-сілтеме қосу (міндетті емес)'),
          h('div', {class: 'mt-4 space-y-3'}, field('Сілтеме', linkUrl), linkLabel.el)),
        saveBar('Жариялау', async () => {
          if (!hasText(ttl.get())) { toast('Тақырыбын жазыңыз', true); return; }
          if (!checkUploads(media)) return;
          const item = Object.assign(p, {cat: cat.value, date: date.value || today(), pinned: pinned.checked, title: ttl.get(), tag: tag.get(), body: body.get(), media: media.get(),
            link: linkUrl.value.trim() ? {url: linkUrl.value.trim(), label: linkLabel.get()} : null});
          const j = await run('Жариялануда…', () => api('upsert', {col: 'posts', item, trash: media.removed()}));
          DATA.posts = (DATA.posts || []).filter(x => x.id !== j.item.id).concat([j.item]);
          savedToast(); go('posts', true);
        })));
    view.oninput = () => { dirty = true; };
  }

  // ---------- 🍽 Ас мәзірі ----------
  let menuMon = null;
  VIEWS.menu = function(view){
    if (!menuMon) { const t = today(); const w = parse(t).getDay(); menuMon = monday(w === 6 || w === 0 ? addDays(t, 2) : t); }
    const menu = DATA.menu || {};
    const meals = get('settings').meals || [];
    const days = [0, 1, 2, 3, 4].map(i => addDays(menuMon, i));
    if (menu[addDays(menuMon, 5)]) days.push(addDays(menuMon, 5));
    const cards = {};
    function dayCard(d, src, copied){
      const m = src || {};
      const fields = meals.map((ml, i) => mlField(L(ml), (m.m || [])[i], {rows: 2}));
      const note = mlField('Ескерту (міндетті емес)', m.note);
      const img = singleImg(copied ? '' : m.img);
      const c = {d, fields, note, img};
      c.el = section(fmt(d, true) + (d === today() ? ' · бүгін' : ''),
        h('div', {class: 'grid sm:grid-cols-2 gap-3'}, fields.map(f => f.el)), note.el,
        field('Мәзірдің суреті (міндетті емес)', img.el),
        h('div', {}, h('button', {type: 'button', class: 'btn btn-d btn-s', onclick: () => { if (confirm('Осы күннің мәзірін тазалау керек пе?')) replace(d, dayCard(d, null)); }}, 'Күнді тазалау')));
      return c;
    }
    function replace(d, c){ cards[d].el.replaceWith(c.el); cards[d] = c; dirty = true; }
    const list = h('div', {class: 'space-y-4'});
    days.forEach(d => { cards[d] = dayCard(d, menu[d]); list.append(cards[d].el); });
    const nav = n => () => { if (!dirty || confirm('Сақталмаған өзгерістер жоғалады. Жалғастырайын ба?')) { menuMon = addDays(menuMon, 7 * n); go('menu', true); } };
    view.append(
      title('Ас мәзірі'),
      h('div', {class: 'card flex items-center justify-between gap-2 mb-4'},
        h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: nav(-1)}, '‹ Алдыңғы апта'),
        h('div', {class: 'font-extrabold text-emerald-950 text-center'}, fmt(days[0]) + ' — ' + fmt(days[days.length - 1])),
        h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: nav(1)}, 'Келесі апта ›')),
      hint('Әр күннің тағамдарын жазыңыз немесе мәзірдің суретін салыңыз. ' + AUTO_HINT),
      h('div', {class: 'my-4 flex flex-wrap gap-2'},
        h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => {
          let n = 0;
          days.forEach(d => { const prev = menu[addDays(d, -7)]; if (prev) { replace(d, dayCard(d, prev, true)); n++; } });
          toast(n ? 'Өткен аптаның мәзірі көшірілді. Тексеріп, «Аптаны сақтау» басыңыз.' : 'Өткен аптада мәзір жоқ', !n);
        }}, '📋 Өткен аптадан көшіру'),
        !menu[addDays(menuMon, 5)] ? h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: e => { const d = addDays(menuMon, 5); cards[d] = dayCard(d, null); list.append(cards[d].el); e.target.remove(); }}, '+ Сенбі') : null),
      list,
      saveBar('Аптаны сақтау', async () => {
        if (!checkUploads(...Object.values(cards).map(c => c.img))) return;
        const items = {}, trash = [];
        Object.values(cards).forEach(c => {
          const m = c.fields.map(f => f.get());
          const val = {m, note: c.note.get(), img: c.img.value()};
          const empty = !m.some(hasText) && !hasText(val.note) && !val.img;
          items[c.d] = empty ? null : val;
          trash.push(...c.img.removed());
        });
        const j = await run('Сақталуда…', () => api('menu', {items, trash}));
        DATA.menu = DATA.menu || {};
        Object.entries(j.items).forEach(([d, v]) => { if (v) DATA.menu[d] = v; else delete DATA.menu[d]; });
        savedToast(); go('menu', true);
      }));
  };

  // ---------- 🗓 Апта жоспары ----------
  let weekMon = null;
  VIEWS.week = function(view){
    if (!weekMon) weekMon = monday(today());
    const end = addDays(weekMon, 6);
    const ev = (DATA.week || []).filter(x => x.date >= weekMon && x.date <= end).sort((a, b) => (a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1);
    const formBox = h('div');
    view.append(
      h('div', {class: 'flex flex-wrap items-center justify-between gap-3 mb-4'},
        h('h1', {class: 'text-2xl font-extrabold text-emerald-950'}, 'Апта жоспары'),
        h('button', {type: 'button', class: 'btn btn-g', onclick: () => weekForm(formBox, null)}, '+ Іс-шара қосу')),
      formBox,
      h('div', {class: 'card flex items-center justify-between gap-2 my-4'},
        h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { weekMon = addDays(weekMon, -7); go('week'); }}, '‹'),
        h('div', {class: 'font-extrabold text-emerald-950 text-center'}, fmt(weekMon) + ' — ' + fmt(end)),
        h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { weekMon = addDays(weekMon, 7); go('week'); }}, '›')),
      ev.length ? h('div', {class: 'space-y-2'}, ev.map(x => h('div', {class: 'card flex gap-3 items-center'},
        h('div', {class: 'w-24 shrink-0 text-sm font-bold text-emerald-900'}, fmt(x.date), h('br'), x.time || ''),
        h('div', {class: 'flex-1 min-w-0'}, h('div', {class: 'font-bold text-emerald-950'}, L(x.title)), L(x.place) ? h('div', {class: 'text-sm text-charcoal/65'}, '📍 ' + L(x.place)) : null),
        h('div', {class: 'flex gap-2 shrink-0'},
          h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { weekForm(formBox, x); window.scrollTo(0, 0); }}, 'Өзгерту'),
          h('button', {type: 'button', class: 'btn btn-d btn-s', onclick: () => removeItem('remove', 'week', x, () => go('week', true))}, 'Өшіру'))))) :
        h('p', {class: 'text-charcoal/60'}, 'Бұл аптаға іс-шара жоқ.'));
  };
  function weekForm(box, x){
    x = x ? clone(x) : {date: weekMon && weekMon > today() ? weekMon : today(), time: '', cls: []};
    const date = dateInput(x.date);
    const time = h('input', {type: 'time', class: 'inp'}); time.value = x.time || '';
    const ttl = mlField('Іс-шара атауы *', x.title);
    const place = mlField('Өтетін орны (міндетті емес)', x.place);
    const cls = classPicker(x.cls, allClasses(), true);
    const text = mlField('Қосымша ақпарат (міндетті емес)', x.text, {rich: true});
    box.innerHTML = '';
    box.append(section(x.id ? 'Іс-шараны өзгерту' : 'Жаңа іс-шара', hint(AUTO_HINT),
      h('div', {class: 'grid grid-cols-2 sm:grid-cols-3 gap-3'}, field('Күні', date), field('Уақыты', time)),
      ttl.el, place.el, field('Қай сыныптарға (таңдамасаңыз — барлығына)', cls.el), text.el,
      h('div', {class: 'flex gap-2 justify-end'},
        h('button', {type: 'button', class: 'btn btn-l', onclick: () => { box.innerHTML = ''; dirty = false; }}, 'Бас тарту'),
        h('button', {type: 'button', class: 'btn btn-g', onclick: async () => {
          if (!hasText(ttl.get())) { toast('Атауын жазыңыз', true); return; }
          const item = Object.assign(x, {date: date.value || today(), time: time.value, title: ttl.get(), place: place.get(), cls: cls.get(), text: text.get()});
          const j = await run('Сақталуда…', () => api('upsert', {col: 'week', item}));
          DATA.week = (DATA.week || []).filter(y => y.id !== j.item.id).concat([j.item]);
          weekMon = monday(j.item.date);
          savedToast(); go('week', true);
        }}, '💾 Сақтау'))));
  }

  // ---------- 🏫 Сынып жаңалықтары (тек сол сыныптың ата-аналарына көрінеді) ----------
  VIEWS.cposts = function(view){
    view.append(title('Сынып жаңалықтары'), classBar(() => go('cposts', true)));
    if (!curCls) return;
    const edit = canEditClass(curCls);
    const posts = (CLS.cposts || []).filter(p => p.cls === curCls).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0));
    const box = h('div', {class: 'space-y-3'});
    view.append(hint('Бұл жазбалар тек ' + curCls + ' сыныбының ата-аналарына (сынып кодымен кіргендерге) көрінеді.'),
      edit ? h('div', {class: 'my-4'}, h('button', {type: 'button', class: 'btn btn-g', onclick: () => cpostEditor(view, null)}, '+ Жаңа жазба (' + curCls + ')')) : h('div', {class: 'my-4'}),
      box);
    if (!posts.length) box.append(h('p', {class: 'text-charcoal/60'}, 'Әзірге жазба жоқ.'));
    posts.forEach(p => box.append(h('div', {class: 'card'},
      h('div', {class: 'flex gap-3 items-start'},
        h('div', {class: 'flex-1 min-w-0'},
          h('div', {class: 'text-xs font-bold text-charcoal/60'}, fmt(p.date) + ' · ✍️ ' + (p.by || '') + (p.editedBy ? ' (өзгертті: ' + p.editedBy + ')' : '')),
          h('div', {class: 'font-bold text-emerald-950'}, L(p.title) || '(атаусыз)'),
          h('div', {class: 'text-sm text-charcoal/75 line-clamp-3'}, strip(L(p.body))),
          mediaThumbs(p.media)),
        edit ? h('div', {class: 'flex flex-col gap-2 shrink-0'},
          h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => cpostEditor(view, p)}, 'Өзгерту'),
          h('button', {type: 'button', class: 'btn btn-d btn-s', onclick: () => removeItem('cremove', 'cposts', p, () => go('cposts', true))}, 'Өшіру')) : null))));
  };
  function cpostEditor(view, p){
    dirty = false;
    p = p ? clone(p) : {cls: curCls, date: today(), media: []};
    view.innerHTML = '';
    const date = dateInput(p.date);
    const ttl = mlField('Тақырыбы *', p.title);
    const body = mlField('Мәтіні', p.body, {rich: true});
    const media = mediaEditor(p.media, {video: true, cls: p.cls});
    view.append(
      h('button', {type: 'button', class: 'btn btn-l btn-s mb-4', onclick: () => go('cposts')}, '← Тізімге қайту'),
      h('div', {class: 'space-y-4'},
        section((p.id ? 'Жазбаны өзгерту' : 'Жаңа жазба') + ' · ' + p.cls + ' сынып', hint(AUTO_HINT),
          h('div', {class: 'grid sm:grid-cols-3 gap-3'}, field('Күні', date)), ttl.el, body.el),
        section('Фото және видео', h('p', {class: 'text-sm text-charcoal/65'}, 'Файлдар ' + p.cls + ' сыныбының Google Drive қалтасына сақталады.'), media.el),
        saveBar('Жариялау', async () => {
          if (!hasText(ttl.get())) { toast('Тақырыбын жазыңыз', true); return; }
          if (!checkUploads(media)) return;
          const item = Object.assign(p, {date: date.value || today(), title: ttl.get(), body: body.get(), media: media.get()});
          const j = await run('Жариялануда…', () => api('cupsert', {col: 'cposts', item, trash: media.removed()}));
          CLS.cposts = (CLS.cposts || []).filter(x => x.id !== j.item.id).concat([j.item]);
          savedToast(); go('cposts', true);
        })));
    view.oninput = () => { dirty = true; };
  }

  // ---------- 📚 Үй тапсырмасы ----------
  const SUBJECTS = ['Математика','Сауат ашу','Әліппе','Қазақ тілі','Орыс тілі','Ағылшын тілі','Әдебиеттік оқу','Жаратылыстану','Дүниетану','Логика','Цифрлық сауаттылық','Көркем еңбек','Музыка'];
  VIEWS.hw = function(view){
    view.append(title('Үй тапсырмасы'), classBar(() => go('hw', true)));
    if (!curCls) return;
    const formBox = h('div');
    if (canEditClass(curCls)) { view.append(formBox); hwForm(formBox, null); }
    const since = addDays(today(), -30);
    const items = (CLS.homework || []).filter(x => x.date >= since && ((x.cls || []).includes(curCls) || (x.cls || []).includes('*')))
      .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0));
    const listBox = h('div', {class: 'space-y-3'});
    view.append(section(curCls + ' сыныбы · соңғы 30 күн', listBox));
    if (!items.length) { listBox.append(h('p', {class: 'text-charcoal/60'}, 'Үй тапсырмасы жоқ.')); return; }
    let cur = '';
    items.forEach(x => {
      if (x.date !== cur) { cur = x.date; listBox.append(h('h3', {class: 'font-extrabold text-emerald-900 pt-2'}, fmt(x.date, true))); }
      const edit = (x.cls || []).every(c => c === '*' ? isOwner() : canEditClass(c));
      listBox.append(h('div', {class: 'flex gap-3 items-start rounded-2xl border border-emerald-900/10 p-3'},
        h('div', {class: 'flex-1 min-w-0'},
          h('div', {class: 'text-xs font-bold text-gold-600'}, ((x.cls || []).includes('*') ? 'Барлық сыныптар' : (x.cls || []).join(', ')) + ' · ✍️ ' + (x.by || '')),
          h('div', {class: 'font-bold text-emerald-950'}, L(x.subject)),
          h('div', {class: 'text-sm text-charcoal/75'}, strip(L(x.text))), mediaThumbs(x.media)),
        edit ? h('div', {class: 'flex flex-col gap-2 shrink-0'},
          h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { hwForm(formBox, x); window.scrollTo(0, 0); }}, 'Өзгерту'),
          h('button', {type: 'button', class: 'btn btn-d btn-s', onclick: () => removeItem('cremove', 'homework', x, () => go('hw', true))}, 'Өшіру')) : null));
    });
  };
  function hwForm(box, x){
    x = x ? clone(x) : {date: today(), cls: [curCls], media: []};
    const editable = isOwner() ? allClasses() : (ME.classes || []);
    const date = dateInput(x.date);
    const cls = classPicker(x.cls, editable, isOwner());
    const subject = mlField('Пән *', x.subject, {list: 'subjects'});
    const text = mlField('Тапсырма *', x.text, {rich: true});
    const media = mediaEditor(x.media, {video: true, cls: (x.cls || [])[0] === '*' ? curCls : ((x.cls || [])[0] || curCls)});
    box.innerHTML = '';
    box.append(h('datalist', {id: 'subjects'}, SUBJECTS.map(s => h('option', {value: s}))),
      section(x.id ? 'Үй тапсырмасын өзгерту' : 'Жаңа үй тапсырмасы',
        h('div', {class: 'grid sm:grid-cols-3 gap-3'}, field('Берілген күні', date)),
        editable.length > 1 ? field('Сынып(тар)', cls.el) : null,
        subject.el, text.el, field('Фото (міндетті емес)', media.el),
        h('div', {class: 'flex flex-wrap gap-2 justify-end'},
          x.id ? h('button', {type: 'button', class: 'btn btn-l', onclick: () => hwForm(box, null)}, 'Бас тарту') : null,
          h('button', {type: 'button', class: 'btn btn-g', onclick: async () => {
            const c = cls.get();
            if (!c.length) { toast('Сыныпты таңдаңыз', true); return; }
            if (!hasText(subject.get()) || !hasText(text.get())) { toast('Пәнін және тапсырманы жазыңыз', true); return; }
            if (!checkUploads(media)) return;
            const item = Object.assign(x, {date: date.value || today(), cls: c, subject: subject.get(), text: text.get(), media: media.get()});
            const j = await run('Сақталуда…', () => api('cupsert', {col: 'homework', item, trash: media.removed()}));
            CLS.homework = (CLS.homework || []).filter(y => y.id !== j.item.id).concat([j.item]);
            savedToast(); go('hw', true);
          }}, '💾 Сақтау'))));
  }

  // ---------- 💬 Ата-ана сұрақтары ----------
  const unanswered = () => (CLS && CLS.qa || []).filter(q => !q.answer && (ME.role !== 'teacher' || (ME.classes || []).includes(q.cls)));
  VIEWS.qa = function(view){
    view.append(title('Ата-ана сұрақтары'), classBar(() => go('qa', true), c => unanswered().filter(q => q.cls === c).length));
    if (!curCls) return;
    const edit = canEditClass(curCls);
    const items = (CLS.qa || []).filter(q => q.cls === curCls).sort((a, b) => (!!a.answer - !!b.answer) || b.ts - a.ts);
    view.append(hint('«Тек осы ата-анаға» деп жауап берсеңіз, жауапты тек сұрақ қойған ата-ана көреді (сұрақ жіберген құрылғысынан). «Бүкіл сыныпқа» деп берсеңіз, сұрақ пен жауапты сыныптың барлық ата-анасы көреді.'));
    if (!items.length) { view.append(h('p', {class: 'text-charcoal/60 mt-4'}, 'Әзірге сұрақ жоқ.')); return; }
    view.append(h('div', {class: 'space-y-3 mt-4'}, items.map(q => {
      const ta = h('textarea', {class: 'inp', rows: 3, placeholder: 'Жауабыңыз…'}); ta.value = q.answer || '';
      const vis = h('select', {class: 'inp'}, h('option', {value: 'private'}, '🔒 Тек осы ата-анаға'), h('option', {value: 'class'}, '👥 Бүкіл сыныпқа'));
      vis.value = q.vis || 'private';
      return h('div', {class: 'card space-y-3' + (q.answer ? '' : ' border-gold')},
        h('div', {class: 'flex items-start gap-3'},
          h('div', {class: 'flex-1 min-w-0'},
            h('div', {class: 'text-xs font-bold text-charcoal/60'}, fmtTs(q.ts) + ' · ' + q.name + (q.child ? ' (баласы: ' + q.child + ')' : '')),
            h('div', {class: 'font-semibold text-emerald-950 whitespace-pre-line mt-1'}, q.q)),
          q.answer ? h('span', {class: 'chip', style: 'padding:.2rem .6rem;font-size:.75rem'}, q.vis === 'class' ? '👥 Сыныпқа' : '🔒 Жеке') : h('span', {class: 'chip active', style: 'padding:.2rem .6rem;font-size:.75rem'}, 'Жауап күтуде')),
        q.answer ? h('div', {class: 'text-sm text-charcoal/60'}, 'Жауап берген: ' + (q.ansBy || '') + (q.ansTs ? ' · ' + fmtTs(q.ansTs) : '')) : null,
        edit ? h('div', {class: 'space-y-2'}, ta, h('div', {class: 'flex flex-wrap gap-2 items-center justify-end'}, h('div', {class: 'w-56'}, vis),
          h('button', {type: 'button', class: 'btn btn-d btn-s', onclick: async () => {
            if (!confirm('Сұрақ өшірілсін бе?')) return;
            await run('Өшірілуде…', () => api('qremove', {id: q.id}));
            CLS.qa = CLS.qa.filter(x => x.id !== q.id); go('qa', true);
          }}, 'Өшіру'),
          h('button', {type: 'button', class: 'btn btn-g', onclick: async () => {
            if (!ta.value.trim()) { toast('Жауапты жазыңыз', true); return; }
            const j = await run('Жіберілуде…', () => api('answer', {id: q.id, text: ta.value.trim(), vis: vis.value}));
            Object.assign(q, j.item); dirty = false; toast('Жауап жіберілді ✓'); go('qa', true);
          }}, q.answer ? 'Жауапты жаңарту' : 'Жауап беру')))
          : (q.answer ? h('div', {class: 'rounded-xl bg-emerald-50 p-3 whitespace-pre-line'}, q.answer) : null));
    })));
  };

  // ---------- 🔑 Ата-ана кодтары ----------
  VIEWS.codes = function(view){
    const list = isOwner() ? allClasses() : (ME.classes || []);
    view.append(title('Ата-ана кодтары'),
      hint('Әр сыныптың өз коды бар. Кодты сыныптың ата-аналарына WhatsApp арқылы жіберіңіз: олар сайттағы «Сыныбым» бөліміне кіріп, тек өз сыныбының үй тапсырмасын, фотоларын және сұрақ-жауабын көреді. Код басқа адамдарға тарап кетсе, «Жаңа код» басыңыз — ескі код жұмыс істемей қалады.'));
    view.append(h('div', {class: 'grid sm:grid-cols-2 gap-3 mt-4'}, list.map(c => {
      const code = (CLS.codes || {})[c];
      const link = code ? SITE_URL + '#c=' + code : '';
      const msg = code ? 'Құрметті ата-аналар! ' + c + ' сыныбының сайттағы жеке беті: ' + link + '\nСынып коды: ' + code + '\n\nУважаемые родители! Страница ' + c + ' класса на сайте: ' + link + '\nКод класса: ' + code : '';
      return h('div', {class: 'card space-y-3'},
        h('div', {class: 'flex items-center justify-between'}, h('div', {class: 'text-lg font-extrabold text-emerald-950'}, c + ' сынып'),
          code ? h('div', {class: 'font-mono text-xl font-extrabold tracking-widest text-gold-600'}, code) : h('span', {class: 'text-sm text-charcoal/60'}, 'Код жоқ')),
        code ? h('div', {class: 'text-xs text-charcoal/60 break-all'}, link) : null,
        h('div', {class: 'flex flex-wrap gap-2'},
          code ? h('a', {class: 'btn btn-p btn-s', target: '_blank', href: 'https://wa.me/?text=' + encodeURIComponent(msg)}, 'WhatsApp-қа жіберу') : null,
          code ? h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { navigator.clipboard.writeText(msg).then(() => toast('Көшірілді')); }}, 'Көшіру') : null,
          h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: async () => {
            if (code && !confirm('Жаңа код жасалса, ескі код (' + code + ') жұмыс істемей қалады. Жалғастырайын ба?')) return;
            const j = await run('Код жасалуда…', () => api('code', {cls: c}));
            CLS.codes = CLS.codes || {}; CLS.codes[c] = j.code; go('codes', true);
          }}, code ? '🔄 Жаңа код' : '➕ Код жасау')));
    })));
  };

  // ---------- 👤 Қызметкерлер (тек бас әкімші) ----------
  function genPw(){ const s = 'abcdefghjkmnpqrstuvwxyz23456789'; let p = ''; const r = crypto.getRandomValues(new Uint32Array(8)); r.forEach(n => { p += s[n % s.length]; }); return p; }
  VIEWS.users = function(view){
    view.append(h('div', {class: 'flex flex-wrap items-center justify-between gap-3 mb-4'},
      h('h1', {class: 'text-2xl font-extrabold text-emerald-950'}, 'Қызметкерлер'),
      h('button', {type: 'button', class: 'btn btn-g', onclick: () => userEditor(view, null)}, '+ Қызметкер қосу')));
    view.append(hint('Сынып жетекшілері өз сыныбын, әкімшілер өзіңіз белгілеген бөлімдерді ғана басқарады. Әкімшілік мүшелері барлық сыныптың жазбаларын тек қарайды. Email (Gmail) жазылса, адамға Google Drive-тағы «Бастауыш-Началка» ішінен тек өз қалтасына қолжетімділік беріледі.'));
    if (INFO.classFolder) view.append(h('div', {class: 'my-3'}, h('a', {href: INFO.classFolder, target: '_blank', class: 'btn btn-l btn-s'}, '📁 «Бастауыш-Началка» қалтасын ашу ↗')));
    const groups = [['teacher', 'Сынып жетекшілері'], ['admin', 'Әкімшілер'], ['viewer', 'Әкімшілік мүшелері (тек қарау)']];
    groups.forEach(([role, name]) => {
      const list = USERS.filter(u => u.role === role).sort((a, b) => ((a.classes || [])[0] || a.name) < ((b.classes || [])[0] || b.name) ? -1 : 1);
      view.append(section(name + ' (' + list.length + ')', list.length ? h('div', {class: 'space-y-2'}, list.map(u => h('div', {class: 'flex gap-3 items-center rounded-2xl border border-emerald-900/10 p-3' + (u.active ? '' : ' opacity-50')},
        h('div', {class: 'flex-1 min-w-0'},
          h('div', {class: 'font-bold text-emerald-950'}, u.name + (u.active ? '' : ' (өшірулі)')),
          h('div', {class: 'text-xs text-charcoal/65'}, 'Логин: ' + u.login + (u.classes.length ? ' · Сынып: ' + u.classes.join(', ') : '') + (u.perms.length ? ' · ' + u.perms.map(p => PERM_NAMES[p]).join(', ') : '') + (u.email ? ' · ' + u.email : ''))),
        h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => userEditor(view, u)}, 'Өзгерту')))) : h('p', {class: 'text-charcoal/60 text-sm'}, 'Әзірге жоқ.')));
    });
  };
  function userEditor(view, u){
    dirty = false;
    const isNew = !u;
    u = u ? clone(u) : {role: 'teacher', classes: [], perms: [], active: true};
    view.innerHTML = '';
    const name = h('input', {class: 'inp', type: 'text'}); name.value = u.name || '';
    const login = h('input', {class: 'inp', type: 'text', autocapitalize: 'none', spellcheck: 'false'}); login.value = u.login || '';
    const email = h('input', {class: 'inp', type: 'email', placeholder: 'mysaly@gmail.com'}); email.value = u.email || '';
    const role = h('select', {class: 'inp'}, ['teacher', 'admin', 'viewer'].map(r => h('option', {value: r}, ROLE_NAMES[r])));
    role.value = u.role;
    const active = h('input', {type: 'checkbox', checked: u.active !== false});
    const pw = h('input', {class: 'inp font-mono', type: 'text', placeholder: isNew ? '' : 'Өзгертпесеңіз бос қалдырыңыз'});
    if (isNew) pw.value = genPw();
    const cls = classPicker(u.classes, allClasses(), false);
    const perms = {};
    const permBox = h('div', {class: 'grid sm:grid-cols-2 gap-2'}, Object.entries(PERM_NAMES).map(([k, v]) => {
      perms[k] = h('input', {type: 'checkbox', checked: (u.perms || []).includes(k)});
      return h('label', {class: 'flex items-center gap-2 text-sm font-semibold rounded-xl border border-emerald-900/10 px-3 py-2'}, perms[k], v);
    }));
    const clsSec = section('Сыныптары', h('p', {class: 'text-sm text-charcoal/65'}, 'Сынып жетекшісі тек осы сыныптардың жазбаларын, үй тапсырмасын, ата-ана сұрақтарын және Drive қалтасын көреді.'), cls.el);
    const permSec = section('Қай бөлімдерді басқарады', permBox);
    const syncRole = () => { clsSec.hidden = role.value !== 'teacher'; permSec.hidden = role.value !== 'admin'; };
    role.addEventListener('change', syncRole);
    name.addEventListener('input', () => { if (isNew && !login.dataset.touched) { const c = cls.get()[0]; login.value = c ? c.toLowerCase() : ''; } });
    login.addEventListener('input', () => { login.dataset.touched = '1'; });
    view.append(
      h('button', {type: 'button', class: 'btn btn-l btn-s mb-4', onclick: () => go('users')}, '← Тізімге қайту'),
      h('div', {class: 'space-y-4'},
        section(isNew ? 'Жаңа қызметкер' : u.name,
          h('div', {class: 'grid sm:grid-cols-2 gap-3'},
            field('Аты-жөні *', name), field('Рөлі', role),
            field('Логин * (латынша, мысалы: 1a немесе aigul)', login), field('Gmail (Drive қалтасына қолжетімділік үшін)', email),
            field(isNew ? 'Пароль *' : 'Жаңа пароль', h('div', {class: 'flex gap-2'}, pw, h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { pw.value = genPw(); dirty = true; }}, '🎲')))),
          h('label', {class: 'flex items-center gap-2 font-semibold text-sm'}, active, 'Белсенді (өшірсеңіз, сайтқа кіре алмайды және Drive қолжетімділігі алынады)')),
        clsSec, permSec,
        saveBar('Сақтау', async () => {
          const rec = {id: u.id, name: name.value.trim(), login: login.value.trim().toLowerCase(), email: email.value.trim(), role: role.value, active: active.checked,
            classes: role.value === 'teacher' ? cls.get() : [], perms: role.value === 'admin' ? Object.keys(perms).filter(k => perms[k].checked) : []};
          if (!rec.name || !rec.login) { toast('Аты-жөні мен логинін жазыңыз', true); return; }
          if (rec.role === 'teacher' && !rec.classes.length) { toast('Сыныбын таңдаңыз', true); return; }
          const newpw = pw.value.trim();
          const j = await run('Сақталуда…', () => api('userSave', {user: rec, newpw: newpw || null}));
          USERS = USERS.filter(x => x.id !== j.user.id).concat([j.user]);
          dirty = false;
          if (j.warn && j.warn.length) toast('Drive қолжетімділігі берілмеді: ' + j.warn.join('; '), true);
          if (newpw) showCreds(j.user, newpw); else { savedToast(); go('users', true); }
        }, !isNew ? h('button', {type: 'button', class: 'btn btn-d', onclick: async () => {
          if (!confirm(u.name + ' толық өшірілсін бе? (Уақытша тоқтату үшін «Белсенді» белгісін алып тастаған дұрыс)')) return;
          await run('Өшірілуде…', () => api('userDel', {id: u.id}));
          USERS = USERS.filter(x => x.id !== u.id); go('users', true);
        }}, 'Өшіру') : null)));
    syncRole();
    view.oninput = () => { dirty = true; };
  }
  function showCreds(u, pw){
    const msg = 'Baiterek ST бастауыш мектебі сайтының әкімші беті:\n' + SITE_URL + 'admin.html\nЛогин: ' + u.login + '\nПароль: ' + pw +
      (u.email && u.role !== 'viewer' ? '\n\nGoogle Drive-та сізге фото/видео жүктеуге арналған қалта ашылды (' + u.email + ' поштасына хабарлама келеді).' : '');
    const close = modal(
      h('h3', {class: 'text-lg font-extrabold text-emerald-950'}, '✅ Сақталды: ' + u.name),
      h('p', {class: 'text-sm text-charcoal/70 mt-1'}, 'Кіру мәліметтерін қызметкерге жіберіңіз. Пароль қайта көрсетілмейді (керек болса, жаңасын орнатасыз).'),
      h('pre', {class: 'mt-3 rounded-xl bg-emerald-50 p-3 text-sm whitespace-pre-wrap'}, msg),
      h('div', {class: 'flex flex-wrap gap-2 justify-end mt-4'},
        h('button', {type: 'button', class: 'btn btn-l', onclick: () => navigator.clipboard.writeText(msg).then(() => toast('Көшірілді'))}, 'Көшіру'),
        h('a', {class: 'btn btn-p', target: '_blank', href: 'https://wa.me/?text=' + encodeURIComponent(msg)}, 'WhatsApp-қа жіберу'),
        h('button', {type: 'button', class: 'btn btn-g', onclick: () => { close(); go('users', true); }}, 'Дайын')));
  }

  // ---------- 📜 Журнал ----------
  VIEWS.log = async function(view){
    view.append(title('Журнал: кім не жазды'));
    const box = h('div', {class: 'space-y-2'}, h('p', {class: 'text-charcoal/60'}, 'Жүктелуде…'));
    view.append(box);
    let items;
    try { items = (await api('log')).log.slice().reverse(); } catch (e) { box.innerHTML = ''; box.append(h('p', {class: 'text-red-700'}, e.message)); return; }
    const who = h('select', {class: 'inp'}, h('option', {value: ''}, 'Барлық адамдар'), [...new Set(items.map(x => x.by))].sort().map(n => h('option', {value: n}, n)));
    const cl = h('select', {class: 'inp'}, h('option', {value: ''}, 'Барлық сыныптар'), allClasses().map(c => h('option', {value: c}, c)));
    const q = h('input', {class: 'inp', type: 'search', placeholder: '🔎 Іздеу…'});
    const render = () => {
      box.innerHTML = '';
      const list = items.filter(x => (!who.value || x.by === who.value) && (!cl.value || (x.cls || '').split(', ').includes(cl.value)) &&
        (!q.value.trim() || (x.action + ' ' + x.text + ' ' + x.by).toLowerCase().includes(q.value.trim().toLowerCase()))).slice(0, 300);
      if (!list.length) { box.append(h('p', {class: 'text-charcoal/60'}, 'Жазба жоқ.')); return; }
      list.forEach(x => box.append(h('div', {class: 'card', style: 'padding:.8rem 1rem'},
        h('div', {class: 'text-xs font-bold text-charcoal/60'}, fmtTs(x.ts) + ' · ' + x.by + (x.cls ? ' · ' + x.cls + ' сынып' : '')),
        h('div', {class: 'font-semibold text-emerald-950'}, x.action),
        x.text ? h('div', {class: 'text-sm text-charcoal/75'}, x.text) : null,
        mediaThumbs(x.media))));
    };
    [who, cl].forEach(el => el.addEventListener('change', render));
    q.addEventListener('input', render);
    box.before(h('div', {class: 'grid sm:grid-cols-3 gap-2 mb-4'}, who, cl, q));
    render();
  };

  // ---------- 👥 Ұжым ----------
  VIEWS.team = function(view){
    const S = clone(get('staff'));
    const person = p => { const name = h('input', {class: 'inp', type: 'text', placeholder: 'Аты-жөні'}); name.value = p.name || ''; const role = mlField('Лауазымы', p.role);
      return {el: h('div', {class: 'space-y-3'}, field('Аты-жөні', name), role.el), get: () => ({name: name.value.trim(), role: role.get()})}; };
    const namesText = names => (names || []).map(n => typeof n === 'object' ? n.name + ' — ' + L(n.note) : n).join('\n');
    const parseNames = (txt, old) => txt.split('\n').map(s => s.trim()).filter(Boolean).map(s => {
      const o = (old || []).find(n => typeof n === 'object' && (n.name + ' — ' + L(n.note)) === s);
      return o || s;
    });
    const group = g => { const label = mlField('Топ атауы', g.label); const ta = h('textarea', {class: 'inp', rows: 5}); ta.value = namesText(g.names);
      return {el: h('div', {class: 'space-y-3'}, label.el, field('Тізім (әр адам жаңа жолда)', ta)), get: () => ({label: label.get(), names: parseNames(ta.value, g.names)})}; };
    const mo = m => { const label = mlField('Бірлестік атауы', m.label); const head = h('input', {class: 'inp', type: 'text'}); head.value = m.head || '';
      return {el: h('div', {class: 'space-y-3'}, label.el, field('Жетекшісі', head)), get: () => ({label: label.get(), head: head.value.trim()})}; };
    const ed = {
      leadership: listEditor(S.leadership, person, () => ({name: '', role: {}}), 'Адам қосу'),
      mo: listEditor(S.mo, mo, () => ({label: {}, head: ''}), 'Бірлестік қосу'),
      specialists: listEditor(S.specialists, group, () => ({label: {}, names: []}), 'Топ қосу'),
      preschool: listEditor(S.preschool, group, () => ({label: {}, names: []}), 'Топ қосу'),
      teachers: listEditor(S.teachers, group, () => ({label: {}, names: []}), 'Топ қосу'),
      support: listEditor(S.support, person, () => ({name: '', role: {}}), 'Адам қосу')
    };
    view.append(title('Ұжым'), h('div', {class: 'space-y-4'},
      hint('Пән мұғалімдері тізімінде ескертпені сызықшамен жазуға болады: «Аты-жөні — хореограф». ' + AUTO_HINT),
      section('Әкімшілік құрамы', ed.leadership.el),
      section('Әдістемелік бірлестіктер', ed.mo.el),
      section('Қолдау қызметі мамандары', ed.specialists.el),
      section('Мектепке дейінгі дайындық тобы', ed.preschool.el),
      section('Пән мұғалімдері', ed.teachers.el),
      section('Қосымша қызметкерлер', ed.support.el),
      saveBar('Ұжымды сақтау', async () => {
        const staff = {};
        Object.keys(ed).forEach(k => { staff[k] = ed[k].get(); });
        const j = await run('Сақталуда…', () => api('set', {values: {staff}}));
        DATA.staff = j.values.staff; savedToast(); go('team', true);
      })));
  };

  // ---------- ❓ Ата-анаға ақпарат ----------
  VIEWS.faq = function(view){
    const groups = clone(get('faq'));
    const item = it => { const q = mlField('Сұрақ', it.q); const a = mlField('Жауап', it.a, {rich: true}); return {el: h('div', {class: 'space-y-3'}, q.el, a.el), get: () => ({q: q.get(), a: a.get()})}; };
    const group = g => { const ttl = mlField('Бөлім атауы', g.title); const items = listEditor(g.items, item, () => ({q: {}, a: {}}), 'Сұрақ қосу');
      return {el: h('details', {class: 'space-y-3'}, h('summary', {class: 'font-extrabold text-emerald-950'}, '▸ ' + (L(g.title) || 'Жаңа бөлім') + ' (' + (g.items || []).length + ' сұрақ)'), h('div', {class: 'space-y-3 mt-3'}, ttl.el, items.el)),
        get: () => ({title: ttl.get(), items: items.get()})}; };
    const ed = listEditor(groups, group, () => ({title: {}, items: []}), 'Бөлім қосу');
    view.append(title('Ата-анаға ақпарат (сұрақ-жауап)'), h('div', {class: 'space-y-4'},
      hint('Бөлімді ашу үшін атауын басыңыз. Жауаптарда қалың әріп, тізім және сілтеме қолдануға болады.'),
      ed.el,
      saveBar('Сақтау', async () => {
        const j = await run('Сақталуда…', () => api('set', {values: {faq: ed.get()}}));
        DATA.faq = j.values.faq; savedToast(); go('faq', true);
      })));
  };

  // ---------- 🖼 Суреттер ----------
  VIEWS.photos = function(view){
    const im = Object.assign(D.images(), clone(DATA.images || {}));
    const main = {hero: singleImg(im.hero), atmosphere: singleImg(im.atmosphere), building: singleImg(im.building)};
    const card = x => { const img = singleImg(x.img); const cap = mlField('Жазуы', x.cap);
      return {el: h('div', {class: 'grid sm:grid-cols-[10rem_1fr] gap-3'}, img.el, cap.el), img, get: () => ({img: img.value(), cap: cap.get()})}; };
    const day = listEditor(clone(get('day')), card, () => ({img: '', cap: {}}), 'Сурет қосу');
    const gal = listEditor(clone(get('gallery')), card, () => ({img: '', cap: {}}), 'Сурет қосу');
    view.append(title('Сайттағы суреттер'), h('div', {class: 'space-y-4'},
      section('Негізгі суреттер',
        h('div', {class: 'grid sm:grid-cols-3 gap-4'}, field('Басты бет (дөңгелек)', main.hero.el), field('«Мектеп атмосферасы» фоны', main.atmosphere.el), field('Мектеп ғимараты (карта жанында)', main.building.el))),
      section('«Балаңыздың мектептегі бір күні»', day.el),
      section('«Мектеп өмірі» галереясы', gal.el),
      saveBar('Суреттерді сақтау', async () => {
        const all = [...Object.values(main), ...day.rows.map(r => r.img), ...gal.rows.map(r => r.img)];
        if (!checkUploads(...all)) return;
        const values = {images: {hero: main.hero.value(), atmosphere: main.atmosphere.value(), building: main.building.value()},
          day: day.get().filter(x => x.img), gallery: gal.get().filter(x => x.img)};
        const j = await run('Сақталуда…', () => api('set', {values}));
        Object.assign(DATA, j.values); savedToast(); go('photos', true);
      })));
  };

  // ---------- ✏️ Мәтіндер ----------
  const TEXT_GROUPS = [
    [/^(brand|nav|hero|badge|metric)/, 'Басты бөлім және мәзір'], [/^(daily|tab_|menu_|hw_|week_|today|loading)/, 'Күнделікті ақпарат'],
    [/^(mc_|qa_)/, 'Сыныбым (ата-аналар беті)'],
    [/^(news|cat_|one_|read_|pinned)/, 'Жаңалықтар'], [/^(about|pillar|adv)/, 'Неге біз'], [/^(day_|atmo)/, 'Мектеп өмірі'],
    [/^learn/, 'Оқу процесі'], [/^faq/, 'Ата-анаға ақпарат'], [/^(team|mo_head)/, 'Ұжым'],
    [/^(promo|admissions|step|lead|sticky)/, 'Қабылдау'], [/^gallery/, 'Галерея'], [/^(location|btn_|contact)/, 'Мекенжай және байланыс'],
    [/^footer/, 'Төменгі бөлім'], [/./, 'Басқа']
  ];
  VIEWS.texts = function(view){
    const texts = clone(DATA.texts || {});
    const keys = Object.keys(I18N.kz).filter(k => !D.textSkip.test(k));
    const groups = TEXT_GROUPS.map(([re, name]) => ({name, keys: []}));
    keys.forEach(k => { const g = TEXT_GROUPS.findIndex(([re]) => re.test(k)); groups[g].keys.push(k); });
    const fields = {};
    const search = h('input', {class: 'inp', type: 'search', placeholder: '🔎 Мәтінді іздеу…'});
    const box = h('div', {class: 'space-y-3'});
    const defOf = k => ({kz: I18N.kz[k] || '', ru: I18N.ru[k] || '', en: I18N.en[k] || ''});
    const build = (k, into) => {
      if (!fields[k]) fields[k] = mlField(strip(I18N.kz[k]).slice(0, 70) || k, Object.assign(defOf(k), texts[k] || {}), {rich: true, small: true});
      into.append(fields[k].el);
    };
    groups.filter(g => g.keys.length).forEach(g => {
      const inner = h('div', {class: 'space-y-4 mt-4'});
      const det = h('details', {class: 'card', ontoggle: () => { if (det.open && !inner.childNodes.length) g.keys.forEach(k => build(k, inner)); }},
        h('summary', {class: 'font-extrabold text-emerald-950'}, '▸ ' + g.name + ' (' + g.keys.length + ')'), inner);
      box.append(det);
    });
    const results = h('div', {class: 'space-y-4'});
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      results.innerHTML = ''; box.hidden = !!q;
      if (!q) return;
      const hits = keys.filter(k => LANGS.some(l => strip((texts[k] && texts[k][l]) || I18N[l][k]).toLowerCase().includes(q))).slice(0, 25);
      if (!hits.length) results.append(h('p', {class: 'text-charcoal/60'}, 'Ештеңе табылмады'));
      hits.forEach(k => build(k, results));
    });
    view.append(title('Сайттағы мәтіндер'), h('div', {class: 'space-y-4'},
      hint('Сайттың тақырыптары мен сипаттамалары. Бөлімді ашып, керек мәтінді өзгертіңіз. Бір тілде өзгерткенде, қалғанын «🌐 Аудару» батырмасымен жаңартуға болады.'),
      search, results, box,
      saveBar('Мәтіндерді сақтау', async () => {
        Object.entries(fields).forEach(([k, f]) => {
          const v = f.get(), d = defOf(k);
          if (LANGS.some(l => v[l] !== d[l])) texts[k] = v; else delete texts[k];
        });
        const j = await run('Сақталуда…', () => api('set', {values: {texts}}));
        DATA.texts = j.values.texts; savedToast(); go('texts', true);
      })));
  };

  // ---------- ☎ Байланыс ----------
  VIEWS.contacts = function(view){
    const c = Object.assign(D.contacts(), clone(DATA.contacts || {}));
    const inp = (k, ph) => { const el = h('input', {class: 'inp', type: 'text', placeholder: ph || ''}); el.value = c[k] || ''; return el; };
    const f = {phone: inp('phone', '+7 708 584-94-02'), phone2: inp('phone2'), whatsapp: inp('whatsapp', '+7 700 978-65-00'), instagram: inp('instagram', 'baiterek.st'), map: inp('map'), gis: inp('gis', 'https://2gis.kz/…')};
    view.append(title('Байланыс'), h('div', {class: 'space-y-4'},
      section(null,
        h('div', {class: 'grid sm:grid-cols-2 gap-4'},
          field('Негізгі телефон', f.phone), field('Қосымша телефон', f.phone2), field('WhatsApp нөмірі', f.whatsapp), field('Instagram (аккаунт аты)', f.instagram),
          field('Картадағы мекенжай (Google Maps үшін)', f.map), field('2GIS сілтемесі', f.gis)),
        h('p', {class: 'text-sm text-charcoal/65'}, 'Сайтта көрінетін мекенжай жазуы «Мәтіндер → Мекенжай және байланыс» бөлімінде өзгертіледі.')),
      saveBar('Сақтау', async () => {
        const contacts = {};
        Object.keys(f).forEach(k => { contacts[k] = f[k].value.trim(); });
        const j = await run('Сақталуда…', () => api('set', {values: {contacts}}));
        DATA.contacts = j.values.contacts; savedToast(); go('contacts', true);
      })));
  };

  // ---------- ⚙ Баптаулар (бас әкімші) ----------
  function pwSection(){
    const pw1 = h('input', {class: 'inp', type: 'password', autocomplete: 'new-password'}), pw2 = h('input', {class: 'inp', type: 'password', autocomplete: 'new-password'});
    return section('Парольді ауыстыру',
      h('div', {class: 'grid sm:grid-cols-2 gap-3'}, field('Жаңа пароль', pw1), field('Жаңа парольді қайталаңыз', pw2)),
      h('div', {class: 'flex justify-end'}, h('button', {type: 'button', class: 'btn btn-p', onclick: async () => {
        if (pw1.value.length < 6) { toast('Пароль кемінде 6 таңба болуы керек', true); return; }
        if (pw1.value !== pw2.value) { toast('Парольдер сәйкес емес', true); return; }
        await run('Сақталуда…', () => api('setpw', {newpw: pw1.value}));
        PW = pw1.value; remember(); pw1.value = pw2.value = ''; dirty = false;
        toast('Пароль ауыстырылды ✓');
      }}, 'Парольді ауыстыру')));
  }
  VIEWS.settings = function(view){
    const s = Object.assign(D.settings(), clone(DATA.settings || {}));
    const classes = h('textarea', {class: 'inp', rows: 3}); classes.value = (s.classes || []).join(', ');
    const meals = listEditor(s.meals, m => { const f = mlField('Ас мезгілі', m); return {el: f.el, get: f.get}; }, () => ({}), 'Ас мезгілін қосу');
    const st = INFO.storage || {};
    const gb = n => (n / 1024 / 1024 / 1024).toFixed(2) + ' ГБ';
    const pct = st.limit ? Math.min(100, Math.round(st.used * 100 / st.limit)) : 0;
    view.append(title('Баптаулар'), h('div', {class: 'space-y-4'},
      section('Сыныптар', field('Сыныптар тізімі (үтір арқылы)', classes)),
      section('Ас мезгілдері (ас мәзірі бөлімі үшін)', meals.el),
      saveBar('Баптауларды сақтау', async () => {
        const settings = {classes: classes.value.split(/[,\n]/).map(x => x.trim()).filter(Boolean), meals: meals.get()};
        const j = await run('Сақталуда…', () => api('set', {values: {settings}}));
        DATA.settings = j.values.settings; savedToast(); go('settings', true);
      }),
      section('Google Drive',
        st.limit ? h('div', {}, h('div', {class: 'text-sm font-semibold'}, 'Қолданылғаны: ' + gb(st.used) + ' / ' + gb(st.limit) + ' (' + pct + '%)'), h('div', {class: 'bar mt-2'}, h('div', {style: 'width:' + pct + '%'}))) : null,
        h('div', {class: 'flex flex-wrap gap-2'},
          INFO.folder ? h('a', {href: INFO.folder, target: '_blank', class: 'btn btn-l btn-s'}, '📁 Сайттың Drive қалтасы ↗') : null,
          INFO.classFolder ? h('a', {href: INFO.classFolder, target: '_blank', class: 'btn btn-l btn-s'}, '📁 «Бастауыш-Началка» ↗') : null),
        h('p', {class: 'text-sm text-charcoal/65'}, 'Сыныптардың фото мен видеолары «Бастауыш-Началка» ішіндегі сынып қалталарында, ал сайттың күнделікті резерв көшірмелері «Резерв» ішінде сақталады.')),
      section('Кіру логині', h('p', {class: 'text-sm'}, 'Сіздің логиніңіз: ', h('b', {}, 'admin'))),
      pwSection()));
  };
  VIEWS.account = function(view){
    view.append(title('Менің парольім'), h('div', {class: 'space-y-4'},
      section(null, h('p', {}, 'Аты-жөні: ', h('b', {}, ME.name)), h('p', {}, 'Логин: ', h('b', {}, ME.login)), h('p', {}, 'Рөлі: ', ROLE_NAMES[ME.role]),
        ME.classes && ME.classes.length ? h('p', {}, 'Сынып: ', h('b', {}, ME.classes.join(', '))) : null,
        ME.folder ? h('a', {href: ME.folder, target: '_blank', class: 'btn btn-l btn-s'}, '📁 Drive қалтам ↗') : null),
      pwSection()));
  };

  // ---------- кіру / шығу ----------
  function remember(){
    try {
      const v = JSON.stringify({login: LOGIN, pw: PW});
      sessionStorage.setItem('adm_auth', v);
      if ($('remember').checked) localStorage.setItem('adm_auth', v); else localStorage.removeItem('adm_auth');
      localStorage.setItem('adm_login', LOGIN);
    } catch (e) {}
  }
  async function start(){
    const j = await api('full');
    ME = j.me; DATA = j.data || {}; CLS = j.cls || {cposts: [], homework: [], qa: [], codes: {}};
    USERS = j.users || []; TEACHERS = j.teachers || {};
    INFO = {storage: j.storage, folder: j.folder, classFolder: j.classFolder};
    if (DATA.posts === undefined && can('posts')) {
      const r = await api('set', {values: {posts: D.posts()}});
      DATA.posts = r.values.posts;
    }
    $('whoami').textContent = '· ' + ME.name + (ME.classes && ME.classes.length ? ' (' + ME.classes.join(', ') + ')' : '');
    $('login').hidden = true;
    $('app').hidden = false;
    const tabs = visibleTabs();
    go(tabs.some(t => t[0] === TAB) ? TAB : (ME.role === 'teacher' ? 'qa' : tabs[0][0]), true);
  }
  const loginInput = $('loginName');
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    LOGIN = loginInput.value.trim().toLowerCase();
    PW = $('pw').value;
    $('loginMsg').textContent = 'Тексерілуде…';
    try {
      const j = await api('login');
      remember();
      if (j.first) alert('Бас әкімшінің паролі орнатылды! Енді «admin» логині және осы парольмен кіресіз. Оны ұмытпаңыз.');
      await start();
    } catch (err) { $('loginMsg').textContent = err.message; PW = null; }
  });
  $('logout').addEventListener('click', () => {
    if (dirty && !confirm('Сақталмаған өзгерістер бар. Шыға берейін бе?')) return;
    try { localStorage.removeItem('adm_auth'); sessionStorage.removeItem('adm_auth'); localStorage.removeItem('adm_pw'); sessionStorage.removeItem('adm_pw'); } catch (e) {}
    location.reload();
  });
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) { $('modal').hidden = true; } });

  if (!API) $('loginMsg').textContent = 'Сервер мекенжайы әлі орнатылмаған (config.js).';
  let saved = null;
  try {
    loginInput.value = localStorage.getItem('adm_login') || '';
    saved = JSON.parse(sessionStorage.getItem('adm_auth') || localStorage.getItem('adm_auth') || 'null');
    // бұрынғы нұсқадан қалған бас әкімші паролі
    const old = sessionStorage.getItem('adm_pw') || localStorage.getItem('adm_pw');
    if (!saved && old) saved = {login: 'admin', pw: old};
  } catch (e) {}
  const clearSaved = () => { try { localStorage.removeItem('adm_auth'); sessionStorage.removeItem('adm_auth'); localStorage.removeItem('adm_pw'); sessionStorage.removeItem('adm_pw'); } catch (e) {} };
  if (saved && saved.pw && API) {
    // Сақталған кіру: форманы жасырып, кімнің атынан кіріп жатқанын көрсетеміз, басқа логинге ауысуға болады
    LOGIN = saved.login || 'admin'; PW = saved.pw;
    const formEls = [...$('loginForm').querySelectorAll('label, input, button[type=submit], p.mt-1')];
    formEls.forEach(e => { e.hidden = true; });
    let cancelled = false;
    const other = h('button', {type: 'button', class: 'btn btn-l w-full mt-3', onclick: () => {
      cancelled = true; clearSaved(); PW = null; LOGIN = '';
      formEls.forEach(e => { e.hidden = false; });
      loginInput.value = ''; $('pw').value = ''; other.remove(); $('loginMsg').textContent = ''; loginInput.focus();
    }}, 'Басқа логинмен кіру');
    $('loginMsg').textContent = 'Сақталған кіру: «' + LOGIN + '» болып кіруде…';
    $('loginMsg').after(other);
    api('login').then(() => { if (!cancelled) return start(); }).catch(err => {
      if (cancelled) return;
      $('loginMsg').textContent = err.message; PW = null; other.remove();
      formEls.forEach(e => { e.hidden = false; });
      clearSaved();
    });
  }
})();
