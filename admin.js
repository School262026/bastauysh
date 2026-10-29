// Сайт әкімшісінің беті. Рөлдер: бас әкімші, әкімші (белгіленген бөлімдер), сынып жетекшісі, пән мұғалімі, әкімшілік мүшесі (тек қарау).
(function(){
  'use strict';
  const D = window.SITE_DEFAULTS;
  const I18N = D.I18N;
  const API = window.API_URL || '';
  const LANGS = ['kz', 'ru', 'en'];
  // Әкімші бетінің тілі: қазақша немесе орысша (admin-ru.js сөздігі), құрылғыда есте сақталады
  let UI = 'kz';
  try { UI = localStorage.getItem('adm_lang') === 'ru' ? 'ru' : 'kz'; } catch (e) {}
  const RU = window.ADMIN_RU || {};
  const T = s => UI === 'ru' && Object.prototype.hasOwnProperty.call(RU, s) ? RU[s] : s;
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
  const MONTHS = [T('қаңтар'),T('ақпан'),T('наурыз'),T('сәуір'),T('мамыр'),T('маусым'),T('шілде'),T('тамыз'),T('қыркүйек'),T('қазан'),T('қараша'),T('желтоқсан')];
  const DOW = [T('Жексенбі'),T('Дүйсенбі'),T('Сейсенбі'),T('Сәрсенбі'),T('Бейсенбі'),T('Жұма'),T('Сенбі')];
  const fmt = (s, dow) => { const d = parse(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + (dow ? ', ' + DOW[d.getDay()] : ''); };
  const fmtTs = ts => { const d = new Date(ts); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const get = key => {
    const v = (DATA[key] !== undefined && DATA[key] !== null) ? DATA[key] : null;
    if (key === 'settings') return Object.assign(D.settings(), v || {});
    return v !== null ? v : (D[key] ? D[key]() : null);
  };
  function thumbUrl(m, w){
    w = w || 400;
    if (m.t === 'yt') return 'https://i.ytimg.com/vi/' + m.id + '/hqdefault.jpg';
    if (m.t === 'drive') return 'https://drive.google.com/thumbnail?id=' + m.id + '&sz=w' + w;
    return isDrive(m.id) ? 'https://lh3.googleusercontent.com/d/' + m.id + '=w' + w : m.id;
  }

  // ---------- рөлдер мен рұқсаттар ----------
  const ROLE_NAMES = {owner: T('Бас әкімші'), admin: T('Әкімші'), teacher: T('Сынып жетекшісі'), subject: T('Пән мұғалімі / үйірме жетекшісі'), psych: T('Педагог-психолог'), viewer: T('Әкімшілік мүшесі (тек қарау)')};
  const PERM_NAMES = {posts: T('📰 Жаңалықтар'), menu: T('🍽 Ас мәзірі'), week: T('🗓 Апта жоспары'), photos: T('🖼 Суреттер'), team: T('👥 Ұжым'),
    faq: T('❓ Ата-анаға ақпарат'), texts: T('✏️ Мәтіндер'), contacts: T('☎ Байланыс'), classes: T('🏫 Сыныптарды қарау'), log: T('📜 Журнал'), feedback: T('📝 Кері байланысты көру')};
  const isOwner = () => ME.role === 'owner';
  const can = p => isOwner() || (ME.role === 'admin' && (ME.perms || []).includes(p));
  const seesClasses = () => isOwner() || ME.role === 'viewer' || ME.role === 'teacher' || can('classes');
  const allClasses = () => get('settings').classes || [];
  const classList = () => (ME.role === 'teacher' || ME.role === 'subject') ? (ME.classes || []) : allClasses();
  const canEditClass = c => isOwner() || (ME.role === 'teacher' && (ME.classes || []).includes(c));

  function toast(msg, err){
    const el = h('div', {class: err ? 'err' : ''}, T(msg));
    $('toast').append(el);
    setTimeout(() => el.remove(), err ? 7000 : 3500);
  }
  function busy(text, pct){
    $('busy').hidden = false;
    $('busyText').textContent = text || T('Сақталуда…');
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
    if (!API) throw new Error(T('Сервер мекенжайы әлі орнатылмаған (config.js файлы).'));
    let r;
    try {
      r = await fetch(API, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(Object.assign({a, login: LOGIN, pw: PW}, body || {}))});
    } catch (e) { throw new Error(T('Интернет байланысын тексеріңіз.')); }
    const txt = await r.text();
    let j;
    try { j = JSON.parse(txt); } catch (e) { throw new Error(T('Сервер жауабы түсініксіз. Google Apps Script жариялауын тексеріңіз.')); }
    if (!j.ok) throw new Error(j.err || T('Қате'));
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
      h('button', {type: 'button', title: T('Қалың'), onmousedown: e => { e.preventDefault(); cmd('bold'); }}, 'B'),
      h('button', {type: 'button', title: T('Көлбеу'), style: 'font-style:italic', onmousedown: e => { e.preventDefault(); cmd('italic'); }}, 'I'),
      h('button', {type: 'button', title: T('Тізім'), onmousedown: e => { e.preventDefault(); cmd('insertUnorderedList'); }}, T('• Тізім')),
      h('button', {type: 'button', title: T('Нөмірлі тізім'), onmousedown: e => { e.preventDefault(); cmd('insertOrderedList'); }}, '1.'),
      h('button', {type: 'button', title: T('Сілтеме'), onmousedown: e => { e.preventDefault(); const u = prompt(T('Сілтеме мекенжайы (https://… немесе tel:+7…)')); if (u) cmd('createLink', u); }}, '🔗'),
      h('button', {type: 'button', title: T('Пішімді тазалау'), onmousedown: e => { e.preventDefault(); cmd('removeFormat'); cmd('unlink'); }}, '⌫'));
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
    const tr = h('button', {type: 'button', class: 'ml-tr', title: T('Осы тілдегі мәтінді қалған тілдерге аудару'), onclick: translate}, T('🌐 Аудару'));
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
      if (!strip(text)) { toast(T('Алдымен ') + cur.toUpperCase() + T(' тілінде жазыңыз'), true); return; }
      const val = {kz: '', ru: '', en: ''}; val[cur] = text;
      tr.disabled = true; tr.textContent = T('Аударылуда…');
      try {
        const j = await api('translate', {value: val});
        LANGS.forEach(k => { if (k !== cur && j.value[k]) eds[k].set(j.value[k]); });
        mark(); dirty = true; toast(T('Аударылды. Тексеріп шығыңыз.'));
      } catch (e) { toast(e.message, true); }
      finally { tr.disabled = false; tr.textContent = T('🌐 Аудару'); }
    }
    mark();
    return {el: wrap, get: () => ({kz: eds.kz.get(), ru: eds.ru.get(), en: eds.en.get()})};
  }
  const hasText = o => LANGS.some(l => strip(o && o[l]));
  function field(label, input){ return h('div', {}, h('label', {class: 'lbl mb-1.5'}, label), input); }
  function dateInput(val){ const el = h('input', {type: 'date', class: 'inp'}); el.value = val || today(); return el; }
  function hint(text){ return h('p', {class: 'text-sm text-charcoal/65 bg-gold-50 border border-gold-100 rounded-xl px-3 py-2'}, text); }
  const AUTO_HINT = T('Бір тілде (мысалы, қазақша) жазсаңыз жеткілікті: бос қалған тілдер сақтағанда автоматты түрде аударылады.');

  // Сыныптарды таңдау: opts — таңдауға болатын сыныптар, allowAll — «Барлық сыныптар» (*)
  function classPicker(selected, opts, allowAll){
    const sel = new Set(selected || []);
    const box = h('div', {class: 'flex flex-wrap gap-1.5'});
    const all = (allowAll ? ['*'] : []).concat(opts);
    function render(){
      box.innerHTML = '';
      all.forEach(c => box.append(h('button', {type: 'button', class: 'chip' + (sel.has(c) ? ' active' : ''), style: 'padding:.35rem .7rem',
        onclick: () => { if (c === '*') { sel.clear(); sel.add('*'); } else { sel.delete('*'); sel.has(c) ? sel.delete(c) : sel.add(c); } dirty = true; render(); }},
        c === '*' ? T('Барлық сыныптар') : c)));
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
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(T('Суретті ашу мүмкін болмады: ') + file.name)); };
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
        if (x.status >= 200 && x.status < 300) { try { res(JSON.parse(x.responseText).id); } catch (e) { rej(new Error(T('Видео жүктелді, бірақ жауап түсініксіз'))); } }
        else rej(new Error(T('Видео жүктеу қатесі (') + x.status + ')'));
      };
      x.onerror = () => rej(new Error(T('Видеоны жүктеу мүмкін болмады. Оны Drive қалтаңызға салып, «Drive қалтамнан» батырмасымен таңдаңыз.')));
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
    const j = await run(T('Drive қалтасы ашылуда…'), () => api('listFiles', {cls}));
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
          isVid ? h('span', {class: 'tag'}, T('▶ Видео')) : null);
        cell._m = m;
        grid.append(cell);
      });
      const close = modal(
        h('div', {class: 'flex items-center justify-between gap-2 mb-3'}, h('h3', {class: 'font-extrabold text-emerald-950'}, T('📁 Drive қалтамдағы файлдар')),
          h('a', {href: j.folder, target: '_blank', class: 'btn btn-l btn-s'}, T('Қалтаны ашу ↗'))),
        h('p', {class: 'text-xs text-charcoal/60 mb-3'}, T('Қалта браузерде ашық тұрған Google аккаунтыңызбен ашылады. Қызметкер өз Gmail-ымен кірсе, тек өзіне берілген қалтаны көреді.')),
        j.files.length ? grid : h('p', {class: 'text-charcoal/60'}, T('Қалтада әзірге фото не видео жоқ. Алдымен файлдарды Google Drive-тағы қалтаңызға жүктеңіз.')),
        h('div', {class: 'flex justify-end gap-2 mt-4'},
          h('button', {type: 'button', class: 'btn btn-l', onclick: () => { close(); resolve([]); }}, T('Бас тарту')),
          h('button', {type: 'button', class: 'btn btn-g', onclick: async () => {
            const ids = [...chosen];
            close();
            if (ids.length) { try { await api('share', {ids}); } catch (e) {} }
            resolve([...grid.children].filter(c => ids.includes(c._m.id)).map(c => c._m));
          }}, T('Таңдау'))));
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
      h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => photoIn.click()}, opt.single ? T('📷 Сурет таңдау') : T('📷 Фото қосу')),
      opt.video ? h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => videoIn.click()}, T('🎬 Видео файл')) : null,
      hasFolder ? h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: async () => {
        const got = await pickFromDrive(opt.cls, opt.single);
        got.filter(m => opt.video || m.t === 'img').forEach(m => { if (opt.single) list = []; list.push(m); });
        if (got.length) { dirty = true; render(); }
      }}, T('📁 Drive қалтамнан')) : null,
      opt.video ? h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: addLink}, T('🔗 YouTube сілтеме')) : null,
      photoIn, videoIn);
    function render(){
      grid.innerHTML = '';
      list.forEach((m, i) => {
        const tools = opt.single ? null : h('div', {class: 'mv'},
          i > 0 ? h('button', {type: 'button', onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; dirty = true; render(); }}, '‹') : null,
          i < list.length - 1 ? h('button', {type: 'button', onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; dirty = true; render(); }}, '›') : null);
        grid.append(h('div', {class: 'thumb'},
          h('img', {src: thumbUrl(m), referrerpolicy: 'no-referrer', onerror: function(){ this.style.opacity = .15; }}),
          m.t !== 'img' ? h('span', {class: 'tag'}, m.t === 'yt' ? '▶ YouTube' : T('▶ Видео')) : null,
          h('button', {type: 'button', class: 'x', title: T('Өшіру'), onclick: () => { list.splice(i, 1); dirty = true; render(); }}, '✕'), tools));
      });
      ups.forEach(u => grid.append(h('div', {class: 'thumb flex flex-col items-center justify-center p-2 text-center'},
        h('div', {class: 'text-xs font-bold text-emerald-900'}, u.label), h('div', {class: 'bar w-full mt-2'}, h('div', {style: 'width:' + u.pct + '%'})))));
      btns.hidden = opt.single && list.length > 0;
    }
    async function addPhotos(files){
      if (opt.single) { files = files.slice(0, 1); list = []; }
      for (const f of files) {
        const u = {label: T('Жүктелуде…'), pct: 30}; ups.push(u); uploading++; render();
        try { const id = await uploadPhoto(f, opt.cls); list.push({t: 'img', id}); dirty = true; }
        catch (e) { toast(e.message, true); }
        finally { ups.splice(ups.indexOf(u), 1); uploading--; render(); }
      }
    }
    async function addVideo(f){
      if (f.size > 1024 * 1024 * 1024) { toast(T('Видео 1 ГБ-тан үлкен. Оны Drive қалтаңызға салып, «Drive қалтамнан» арқылы таңдаңыз.'), true); return; }
      const u = {label: T('Видео 0%'), pct: 0}; ups.push(u); uploading++; render();
      try {
        const id = await uploadVideo(f, opt.cls, p => { u.pct = p; u.label = T('Видео ') + p + '%'; render(); });
        list.push({t: 'drive', id}); dirty = true;
        toast(T('Видео жүктелді. Google оны өңдеуге бірнеше минут кетуі мүмкін.'));
      } catch (e) { toast(e.message, true); }
      finally { ups.splice(ups.indexOf(u), 1); uploading--; render(); }
    }
    function addLink(){
      const u = prompt(T('YouTube немесе Google Drive сілтемесін қойыңыз:'));
      if (!u) return;
      const m = parseLink(u);
      if (!m) { toast(T('Сілтеме танылмады. YouTube немесе Google Drive сілтемесі болуы керек.'), true); return; }
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
  function checkUploads(...eds){ if (eds.some(e => e && e.busy && e.busy())) { toast(T('Файлдар әлі жүктелуде, сәл күтіңіз.'), true); return false; } return true; }
  function mediaThumbs(media){
    if (!media || !media.length) return null;
    return h('div', {class: 'flex flex-wrap gap-1.5 mt-2'}, media.slice(0, 8).map(m => h('a', {href: m.t === 'yt' ? 'https://youtu.be/' + m.id : 'https://drive.google.com/file/d/' + m.id + '/view', target: '_blank'},
      h('img', {src: thumbUrl(m, 200), referrerpolicy: 'no-referrer', class: 'w-14 h-14 rounded-lg object-cover bg-emerald-50', onerror: function(){ this.style.opacity = .2; }}))));
  }

  // Тізім редакторы: жолдарды қосу, жою, жоғары/төмен жылжыту
  function listEditor(items, makeRow, newItem, addLabel){
    const rows = [];
    const box = h('div', {class: 'space-y-3'});
    const add = h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { rows.push(makeRow(newItem())); dirty = true; render(); }}, '+ ' + (addLabel || T('Қосу')));
    (items || []).forEach(it => rows.push(makeRow(it)));
    function render(){
      box.innerHTML = '';
      rows.forEach((r, i) => box.append(h('div', {class: 'flex gap-2 items-start rounded-2xl border border-emerald-900/10 bg-white p-3'},
        h('div', {class: 'flex-1 min-w-0 space-y-3'}, r.el),
        h('div', {class: 'row-tools flex flex-col gap-1'},
          h('button', {type: 'button', title: T('Жоғары'), onclick: () => { if (i > 0) { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; dirty = true; render(); } }}, '↑'),
          h('button', {type: 'button', title: T('Төмен'), onclick: () => { if (i < rows.length - 1) { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; dirty = true; render(); } }}, '↓'),
          h('button', {type: 'button', title: T('Өшіру'), style: 'color:#B42318', onclick: () => { if (confirm(T('Өшіру керек пе?'))) { rows.splice(i, 1); dirty = true; render(); } }}, '✕')))));
    }
    render();
    return {el: h('div', {}, box, h('div', {class: 'mt-3'}, add)), get: () => rows.map(r => r.get()), rows};
  }

  // ---------- беттің жалпы құрылымы ----------
  const TABS = [
    ['posts', T('📰 Жаңалықтар'), () => can('posts')],
    ['menu', T('🍽 Ас мәзірі'), () => can('menu')],
    ['week', T('🗓 Апта жоспары'), () => can('week')],
    ['cposts', T('🏫 Сынып жаңалықтары'), () => seesClasses() || ME.role === 'psych'],
    ['hw', T('📚 Үй тапсырмасы'), seesClasses],
    ['qa', T('💬 Ата-ана сұрақтары'), seesClasses],
    ['fb', T('📝 Кері байланыс'), () => isOwner() || ['teacher', 'subject', 'psych'].includes(ME.role) || (ME.perms || []).includes('feedback')],
    ['codes', T('🔑 Ата-ана кодтары'), () => isOwner() || ME.role === 'teacher'],
    ['users', T('👤 Қызметкерлер'), isOwner],
    ['log', T('📜 Журнал'), () => isOwner() || ME.role === 'viewer' || can('log')],
    ['team', T('👥 Ұжым'), () => can('team')],
    ['faq', T('❓ Ата-анаға ақпарат'), () => can('faq')],
    ['photos', T('🖼 Суреттер'), () => can('photos')],
    ['texts', T('✏️ Мәтіндер'), () => can('texts')],
    ['contacts', T('☎ Байланыс'), () => can('contacts')],
    ['settings', T('⚙ Баптаулар'), isOwner],
    ['account', T('🔒 Парольім'), () => !isOwner()]
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
    if (dirty && !force && !confirm(T('Сақталмаған өзгерістер бар. Оларды тастап кете берейін бе?'))) return;
    dirty = false; TAB = tab; renderTabs();
    const view = $('view');
    view.innerHTML = '';
    view.oninput = () => { dirty = true; };
    VIEWS[tab](view);
    window.scrollTo(0, 0);
  }
  function section(title, ...kids){ return h('section', {class: 'card space-y-4'}, title ? h('h2', {class: 'text-lg font-extrabold text-emerald-950'}, title) : null, kids); }
  function saveBar(label, onclick, extra){
    return h('div', {class: 'sticky bottom-3 z-30 flex flex-wrap gap-2 justify-end bg-cream/90 backdrop-blur rounded-2xl p-2'}, extra || null, h('button', {type: 'button', class: 'btn btn-g shadow-card', onclick}, '💾 ' + (label || T('Сақтау'))));
  }
  function savedToast(){ toast(T('Сақталды ✓ Сайтта бірнеше секундтан кейін көрінеді.')); }
  const title = text => h('h1', {class: 'text-2xl font-extrabold text-emerald-950 mb-4'}, text);
  // Сынып таңдау жолағы (сынып бөлімдерінің жоғарғы жағында)
  function classBar(onpick, badgeFn, list){
    list = list || classList();
    if (!curCls || !list.includes(curCls)) curCls = list[0] || null;
    if (!list.length) return h('p', {class: 'card text-charcoal/70'}, (ME.role === 'teacher' || ME.role === 'subject') ? T('Сізге әлі сынып бекітілмеген. Бас әкімшіге хабарласыңыз.') : T('Баптауларда сыныптар тізімі бос.'));
    return h('div', {class: 'flex flex-wrap gap-1.5 mb-4'}, list.map(c => {
      const b = badgeFn ? badgeFn(c) : 0;
      return h('button', {type: 'button', class: 'chip' + (c === curCls ? ' active' : ''), style: 'padding:.35rem .75rem', onclick: () => { if (dirty && !confirm(T('Сақталмаған өзгерістер жоғалады. Жалғастырайын ба?'))) return; curCls = c; dirty = false; onpick(); }},
        c, b ? h('span', {class: 'bg-gold text-emerald-950 rounded-full px-1.5 text-xs'}, b) : null);
    }));
  }

  const VIEWS = {};

  // ---------- 📰 Мектеп жаңалықтары ----------
  const CATS = {announce: T('Хабарландыру'), event: T('Іс-шара (фото/видео)'), greet: T('Құттықтау')};
  VIEWS.posts = function(view){
    const posts = (DATA.posts || []).slice().sort((a, b) => (!!b.pinned - !!a.pinned) || (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0)));
    view.append(h('div', {class: 'flex flex-wrap items-center justify-between gap-3 mb-4'},
      h('h1', {class: 'text-2xl font-extrabold text-emerald-950'}, T('Мектеп жаңалықтары')),
      h('button', {type: 'button', class: 'btn btn-g', onclick: () => postEditor(view, null)}, T('+ Жаңа жазба'))));
    view.append(hint(T('Бұл жаңалықтар сайтта барлығына көрінеді. Тек бір сыныпқа арналған жаңалықты «🏫 Сынып жаңалықтары» бөліміне жазыңыз.')));
    if (!posts.length) view.append(h('p', {class: 'text-charcoal/60 mt-4'}, T('Әзірге жазба жоқ.')));
    view.append(h('div', {class: 'space-y-3 mt-4'}, posts.map(p => h('div', {class: 'card flex gap-3 items-center'},
      p.media && p.media[0] ? h('img', {src: thumbUrl(p.media[0]), referrerpolicy: 'no-referrer', class: 'w-16 h-16 rounded-xl object-cover shrink-0 bg-emerald-50'}) : h('div', {class: 'w-16 h-16 rounded-xl bg-emerald-50 shrink-0 flex items-center justify-center text-2xl'}, p.cat === 'greet' ? '🎉' : p.cat === 'event' ? '📸' : '📢'),
      h('div', {class: 'flex-1 min-w-0'},
        h('div', {class: 'text-xs font-bold text-charcoal/60'}, (p.pinned ? '📌 ' : '') + CATS[p.cat] + ' · ' + fmt(p.date) + (p.by ? ' · ' + p.by : '')),
        h('div', {class: 'font-bold text-emerald-950 truncate'}, L(p.title) || T('(атаусыз)'))),
      h('div', {class: 'flex gap-2 shrink-0'},
        h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => postEditor(view, p)}, T('Өзгерту')),
        h('button', {type: 'button', class: 'btn btn-d btn-s', onclick: () => removeItem('remove', 'posts', p, () => go('posts', true))}, T('Өшіру')))))));
  };
  async function removeItem(op, col, item, after){
    if (!confirm('«' + (L(item.title) || L(item.subject) || T('Жазба')) + T('» өшірілсін бе? Оның фото/видеолары да өшіріледі.'))) return;
    await run(T('Өшірілуде…'), () => api(op, {col, id: item.id}));
    if (op === 'remove') DATA[col] = (DATA[col] || []).filter(x => x.id !== item.id);
    else CLS[col] = (CLS[col] || []).filter(x => x.id !== item.id);
    toast(T('Өшірілді'));
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
    const ttl = mlField(T('Тақырыбы *'), p.title);
    const tag = mlField(T('Белгі (міндетті емес, мысалы: «Жаңа бағдарлама»)'), p.tag);
    const body = mlField(T('Мәтіні'), p.body, {rich: true});
    const media = mediaEditor(p.media, {video: true});
    const linkUrl = h('input', {class: 'inp', type: 'text', placeholder: T('https://… немесе #leadform')}); linkUrl.value = (p.link && p.link.url) || '';
    const linkLabel = mlField(T('Батырма жазуы'), p.link && p.link.label);
    view.append(
      h('button', {type: 'button', class: 'btn btn-l btn-s mb-4', onclick: () => go('posts')}, T('← Тізімге қайту')),
      h('div', {class: 'space-y-4'},
        section(p.id ? T('Жазбаны өзгерту') : T('Жаңа жазба'),
          hint(AUTO_HINT),
          h('div', {class: 'grid sm:grid-cols-3 gap-3'}, field(T('Түрі'), cat), field(T('Күні'), date),
            h('label', {class: 'flex items-center gap-2 font-semibold text-sm sm:mt-6'}, pinned, T('📌 Ең жоғарыда тұрсын'))),
          ttl.el, tag.el, body.el),
        section(T('Фото және видео'), h('p', {class: 'text-sm text-charcoal/65'}, T('Фотолар автоматты түрде кішірейтіліп, Google Drive-қа сақталады. Үлкен видеоларды алдымен Drive қалтаңызға салып, «📁 Drive қалтамнан» арқылы таңдаған ыңғайлы.')), media.el),
        h('details', {class: 'card'}, h('summary', {class: 'font-bold text-emerald-950'}, T('➕ Батырма-сілтеме қосу (міндетті емес)')),
          h('div', {class: 'mt-4 space-y-3'}, field(T('Сілтеме'), linkUrl), linkLabel.el)),
        saveBar(T('Жариялау'), async () => {
          if (!hasText(ttl.get())) { toast(T('Тақырыбын жазыңыз'), true); return; }
          if (!checkUploads(media)) return;
          const item = Object.assign(p, {cat: cat.value, date: date.value || today(), pinned: pinned.checked, title: ttl.get(), tag: tag.get(), body: body.get(), media: media.get(),
            link: linkUrl.value.trim() ? {url: linkUrl.value.trim(), label: linkLabel.get()} : null});
          const j = await run(T('Жариялануда…'), () => api('upsert', {col: 'posts', item, trash: media.removed()}));
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
      const note = mlField(T('Ескерту (міндетті емес)'), m.note, {rows: 4});
      const img = singleImg(copied ? '' : m.img);
      const c = {d, fields, note, img};
      c.el = section(fmt(d, true) + (d === today() ? T(' · бүгін') : ''),
        h('div', {class: 'grid sm:grid-cols-2 gap-3'}, fields.map(f => f.el)), note.el,
        field(T('Мәзірдің суреті (міндетті емес)'), img.el),
        h('div', {}, h('button', {type: 'button', class: 'btn btn-d btn-s', onclick: () => { if (confirm(T('Осы күннің мәзірін тазалау керек пе?'))) replace(d, dayCard(d, null)); }}, T('Күнді тазалау'))));
      return c;
    }
    function replace(d, c){ cards[d].el.replaceWith(c.el); cards[d] = c; dirty = true; }
    const list = h('div', {class: 'space-y-4'});
    days.forEach(d => { cards[d] = dayCard(d, menu[d]); list.append(cards[d].el); });
    const nav = n => () => { if (!dirty || confirm(T('Сақталмаған өзгерістер жоғалады. Жалғастырайын ба?'))) { menuMon = addDays(menuMon, 7 * n); go('menu', true); } };
    view.append(
      title(T('Ас мәзірі')),
      h('div', {class: 'card flex items-center justify-between gap-2 mb-4'},
        h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: nav(-1)}, T('‹ Алдыңғы апта')),
        h('div', {class: 'font-extrabold text-emerald-950 text-center'}, fmt(days[0]) + ' — ' + fmt(days[days.length - 1])),
        h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: nav(1)}, T('Келесі апта ›'))),
      hint(T('Әр күннің тағамдарын жазыңыз немесе мәзірдің суретін салыңыз. ') + AUTO_HINT),
      h('div', {class: 'my-4 flex flex-wrap gap-2'},
        h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => {
          let n = 0;
          days.forEach(d => { const prev = menu[addDays(d, -7)]; if (prev) { replace(d, dayCard(d, prev, true)); n++; } });
          toast(n ? T('Өткен аптаның мәзірі көшірілді. Тексеріп, «Аптаны сақтау» басыңыз.') : T('Өткен аптада мәзір жоқ'), !n);
        }}, T('📋 Өткен аптадан көшіру')),
        !menu[addDays(menuMon, 5)] ? h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: e => { const d = addDays(menuMon, 5); cards[d] = dayCard(d, null); list.append(cards[d].el); e.target.remove(); }}, T('+ Сенбі')) : null),
      list,
      saveBar(T('Аптаны сақтау'), async () => {
        if (!checkUploads(...Object.values(cards).map(c => c.img))) return;
        const items = {}, trash = [];
        Object.values(cards).forEach(c => {
          const m = c.fields.map(f => f.get());
          const val = {m, note: c.note.get(), img: c.img.value()};
          const empty = !m.some(hasText) && !hasText(val.note) && !val.img;
          items[c.d] = empty ? null : val;
          trash.push(...c.img.removed());
        });
        const j = await run(T('Сақталуда…'), () => api('menu', {items, trash}));
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
        h('h1', {class: 'text-2xl font-extrabold text-emerald-950'}, T('Апта жоспары')),
        h('button', {type: 'button', class: 'btn btn-g', onclick: () => weekForm(formBox, null)}, T('+ Іс-шара қосу'))),
      formBox,
      h('div', {class: 'card flex items-center justify-between gap-2 my-4'},
        h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { weekMon = addDays(weekMon, -7); go('week'); }}, '‹'),
        h('div', {class: 'font-extrabold text-emerald-950 text-center'}, fmt(weekMon) + ' — ' + fmt(end)),
        h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { weekMon = addDays(weekMon, 7); go('week'); }}, '›')),
      ev.length ? h('div', {class: 'space-y-2'}, ev.map(x => h('div', {class: 'card flex gap-3 items-center'},
        h('div', {class: 'w-24 shrink-0 text-sm font-bold text-emerald-900'}, fmt(x.date), h('br'), x.time || ''),
        h('div', {class: 'flex-1 min-w-0'}, h('div', {class: 'font-bold text-emerald-950'}, L(x.title)), L(x.place) ? h('div', {class: 'text-sm text-charcoal/65'}, '📍 ' + L(x.place)) : null),
        h('div', {class: 'flex gap-2 shrink-0'},
          h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { weekForm(formBox, x); window.scrollTo(0, 0); }}, T('Өзгерту')),
          h('button', {type: 'button', class: 'btn btn-d btn-s', onclick: () => removeItem('remove', 'week', x, () => go('week', true))}, T('Өшіру')))))) :
        h('p', {class: 'text-charcoal/60'}, T('Бұл аптаға іс-шара жоқ.')));
  };
  function weekForm(box, x){
    x = x ? clone(x) : {date: weekMon && weekMon > today() ? weekMon : today(), time: '', cls: []};
    const date = dateInput(x.date);
    const time = h('input', {type: 'time', class: 'inp'}); time.value = x.time || '';
    const ttl = mlField(T('Іс-шара атауы *'), x.title);
    const place = mlField(T('Өтетін орны (міндетті емес)'), x.place);
    const cls = classPicker(x.cls, allClasses(), true);
    const text = mlField(T('Қосымша ақпарат (міндетті емес)'), x.text, {rich: true});
    box.innerHTML = '';
    box.append(section(x.id ? T('Іс-шараны өзгерту') : T('Жаңа іс-шара'), hint(AUTO_HINT),
      h('div', {class: 'grid grid-cols-2 sm:grid-cols-3 gap-3'}, field(T('Күні'), date), field(T('Уақыты'), time)),
      ttl.el, place.el, field(T('Қай сыныптарға (таңдамасаңыз — барлығына)'), cls.el), text.el,
      h('div', {class: 'flex gap-2 justify-end'},
        h('button', {type: 'button', class: 'btn btn-l', onclick: () => { box.innerHTML = ''; dirty = false; }}, T('Бас тарту')),
        h('button', {type: 'button', class: 'btn btn-g', onclick: async () => {
          if (!hasText(ttl.get())) { toast(T('Атауын жазыңыз'), true); return; }
          const item = Object.assign(x, {date: date.value || today(), time: time.value, title: ttl.get(), place: place.get(), cls: cls.get(), text: text.get()});
          const j = await run(T('Сақталуда…'), () => api('upsert', {col: 'week', item}));
          DATA.week = (DATA.week || []).filter(y => y.id !== j.item.id).concat([j.item]);
          weekMon = monday(j.item.date);
          savedToast(); go('week', true);
        }}, T('💾 Сақтау')))));
  }

  // ---------- 🏫 Сынып жаңалықтары (тек сол сыныптың ата-аналарына көрінеді) ----------
  VIEWS.cposts = function(view){
    view.append(title(T('Сынып жаңалықтары')), classBar(() => go('cposts', true)));
    if (!curCls) return;
    const psy = ME.role === 'psych';
    const edit = canEditClass(curCls) || psy;
    const mineOnly = p => !psy || p.by === ME.name;
    const posts = (CLS.cposts || []).filter(p => p.cls === curCls).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0));
    const box = h('div', {class: 'space-y-3'});
    if ((INFO.classFolders || {})[curCls]) view.append(h('div', {class: 'flex flex-wrap items-center gap-2 mb-3'},
      h('a', {href: INFO.classFolders[curCls], target: '_blank', class: 'btn btn-l btn-s'}, '📁 ' + curCls + T(' сыныбының Drive қалтасы ↗')),
      h('span', {class: 'text-xs text-charcoal/60'}, T('Қалта Gmail-ыңызбен ашылады. Сайттағы «📷 Фото қосу» арқылы салынған фото мен видео осы қалтаға өзі түседі.'))));
    view.append(hint(T('Бұл жазбалар тек ') + curCls + T(' сыныбының ата-аналарына (сынып кодымен кіргендерге) көрінеді.') +
      (psy ? T(' Педагог-психолог мұнда барлық ата-анаға арналған жалпы кеңес жазады; нақты бала туралы мәлімет жазуға болмайды (ол тек ата-ана келісімімен, даму картасындағы жеке бөлімде).') : '')),
      edit ? h('div', {class: 'my-4'}, h('button', {type: 'button', class: 'btn btn-g', onclick: () => cpostEditor(view, null)}, T('+ Жаңа жазба (') + curCls + ')')) : h('div', {class: 'my-4'}),
      box);
    if (!posts.length) box.append(h('p', {class: 'text-charcoal/60'}, T('Әзірге жазба жоқ.')));
    posts.forEach(p => box.append(h('div', {class: 'card'},
      h('div', {class: 'flex gap-3 items-start'},
        h('div', {class: 'flex-1 min-w-0'},
          h('div', {class: 'text-xs font-bold text-charcoal/60'}, fmt(p.date) + ' · ✍️ ' + (p.by || '') + (p.editedBy ? T(' (өзгертті: ') + p.editedBy + ')' : '')),
          h('div', {class: 'font-bold text-emerald-950'}, L(p.title) || T('(атаусыз)')),
          h('div', {class: 'text-sm text-charcoal/75 line-clamp-3'}, strip(L(p.body))),
          mediaThumbs(p.media)),
        edit && mineOnly(p) ? h('div', {class: 'flex flex-col gap-2 shrink-0'},
          h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => cpostEditor(view, p)}, T('Өзгерту')),
          h('button', {type: 'button', class: 'btn btn-d btn-s', onclick: () => removeItem('cremove', 'cposts', p, () => go('cposts', true))}, T('Өшіру'))) : null))));
  };
  function cpostEditor(view, p){
    dirty = false;
    p = p ? clone(p) : {cls: curCls, date: today(), media: []};
    view.innerHTML = '';
    const date = dateInput(p.date);
    const ttl = mlField(T('Тақырыбы *'), p.title);
    const body = mlField(T('Мәтіні'), p.body, {rich: true});
    const media = mediaEditor(p.media, {video: true, cls: p.cls});
    view.append(
      h('button', {type: 'button', class: 'btn btn-l btn-s mb-4', onclick: () => go('cposts')}, T('← Тізімге қайту')),
      h('div', {class: 'space-y-4'},
        section((p.id ? T('Жазбаны өзгерту') : T('Жаңа жазба')) + ' · ' + p.cls + T(' сынып'), hint(AUTO_HINT),
          h('div', {class: 'grid sm:grid-cols-3 gap-3'}, field(T('Күні'), date)), ttl.el, body.el),
        section(T('Фото және видео'), h('p', {class: 'text-sm text-charcoal/65'}, T('Файлдар ') + p.cls + T(' сыныбының Google Drive қалтасына сақталады.')), media.el),
        saveBar(T('Жариялау'), async () => {
          if (!hasText(ttl.get())) { toast(T('Тақырыбын жазыңыз'), true); return; }
          if (!checkUploads(media)) return;
          const item = Object.assign(p, {date: date.value || today(), title: ttl.get(), body: body.get(), media: media.get()});
          const j = await run(T('Жариялануда…'), () => api('cupsert', {col: 'cposts', item, trash: media.removed()}));
          CLS.cposts = (CLS.cposts || []).filter(x => x.id !== j.item.id).concat([j.item]);
          savedToast(); go('cposts', true); showNotify(j.notify);
        })));
    view.oninput = () => { dirty = true; };
  }

  // ---------- 📚 Үй тапсырмасы ----------
  const SUBJECTS = [T('Математика'),T('Сауат ашу'),T('Әліппе'),T('Қазақ тілі'),T('Орыс тілі'),T('Ағылшын тілі'),T('Әдебиеттік оқу'),T('Жаратылыстану'),T('Дүниетану'),T('Логика'),T('Цифрлық сауаттылық'),T('Көркем еңбек'),T('Музыка')];
  VIEWS.hw = function(view){
    view.append(title(T('Үй тапсырмасы')), classBar(() => go('hw', true)));
    if (!curCls) return;
    const formBox = h('div');
    if (canEditClass(curCls)) { view.append(formBox); hwForm(formBox, null); }
    const since = addDays(today(), -30);
    const items = (CLS.homework || []).filter(x => x.date >= since && ((x.cls || []).includes(curCls) || (x.cls || []).includes('*')))
      .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0));
    const listBox = h('div', {class: 'space-y-3'});
    view.append(section(curCls + T(' сыныбы · соңғы 30 күн'), listBox));
    if (!items.length) { listBox.append(h('p', {class: 'text-charcoal/60'}, T('Үй тапсырмасы жоқ.'))); return; }
    let cur = '';
    items.forEach(x => {
      if (x.date !== cur) { cur = x.date; listBox.append(h('h3', {class: 'font-extrabold text-emerald-900 pt-2'}, fmt(x.date, true))); }
      const edit = (x.cls || []).every(c => c === '*' ? isOwner() : canEditClass(c));
      listBox.append(h('div', {class: 'flex gap-3 items-start rounded-2xl border border-emerald-900/10 p-3'},
        h('div', {class: 'flex-1 min-w-0'},
          h('div', {class: 'text-xs font-bold text-gold-600'}, ((x.cls || []).includes('*') ? T('Барлық сыныптар') : (x.cls || []).join(', ')) + ' · ✍️ ' + (x.by || '')),
          h('div', {class: 'font-bold text-emerald-950'}, L(x.subject)),
          h('div', {class: 'text-sm text-charcoal/75'}, strip(L(x.text))), mediaThumbs(x.media)),
        edit ? h('div', {class: 'flex flex-col gap-2 shrink-0'},
          h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { hwForm(formBox, x); window.scrollTo(0, 0); }}, T('Өзгерту')),
          h('button', {type: 'button', class: 'btn btn-d btn-s', onclick: () => removeItem('cremove', 'homework', x, () => go('hw', true))}, T('Өшіру'))) : null));
    });
  };
  function hwForm(box, x){
    x = x ? clone(x) : {date: today(), cls: [curCls], media: []};
    const editable = isOwner() ? allClasses() : (ME.classes || []);
    const date = dateInput(x.date);
    const cls = classPicker(x.cls, editable, isOwner());
    const subject = mlField(T('Пән *'), x.subject, {list: 'subjects'});
    const text = mlField(T('Тапсырма *'), x.text, {rich: true});
    const media = mediaEditor(x.media, {video: true, cls: (x.cls || [])[0] === '*' ? curCls : ((x.cls || [])[0] || curCls)});
    box.innerHTML = '';
    box.append(h('datalist', {id: 'subjects'}, SUBJECTS.map(s => h('option', {value: s}))),
      section(x.id ? T('Үй тапсырмасын өзгерту') : T('Жаңа үй тапсырмасы'),
        h('div', {class: 'grid sm:grid-cols-3 gap-3'}, field(T('Берілген күні'), date)),
        editable.length > 1 ? field(T('Сынып(тар)'), cls.el) : null,
        subject.el, text.el, field(T('Фото (міндетті емес)'), media.el),
        h('div', {class: 'flex flex-wrap gap-2 justify-end'},
          x.id ? h('button', {type: 'button', class: 'btn btn-l', onclick: () => hwForm(box, null)}, T('Бас тарту')) : null,
          h('button', {type: 'button', class: 'btn btn-g', onclick: async () => {
            const c = cls.get();
            if (!c.length) { toast(T('Сыныпты таңдаңыз'), true); return; }
            if (!hasText(subject.get()) || !hasText(text.get())) { toast(T('Пәнін және тапсырманы жазыңыз'), true); return; }
            if (!checkUploads(media)) return;
            const item = Object.assign(x, {date: date.value || today(), cls: c, subject: subject.get(), text: text.get(), media: media.get()});
            const j = await run(T('Сақталуда…'), () => api('cupsert', {col: 'homework', item, trash: media.removed()}));
            CLS.homework = (CLS.homework || []).filter(y => y.id !== j.item.id).concat([j.item]);
            savedToast(); go('hw', true); showNotify(j.notify);
          }}, T('💾 Сақтау')))));
  }

  // ---------- 💬 Ата-ана сұрақтары ----------
  const unanswered = () => (CLS && CLS.qa || []).filter(q => !q.answer && (ME.role !== 'teacher' || (ME.classes || []).includes(q.cls)));
  VIEWS.qa = function(view){
    view.append(title(T('Ата-ана сұрақтары')), classBar(() => go('qa', true), c => unanswered().filter(q => q.cls === c).length));
    if (!curCls) return;
    const edit = canEditClass(curCls);
    const items = (CLS.qa || []).filter(q => q.cls === curCls).sort((a, b) => (!!a.answer - !!b.answer) || b.ts - a.ts);
    view.append(hint(T('«Тек осы ата-анаға» деп жауап берсеңіз, жауапты тек сұрақ қойған ата-ана көреді (сұрақ жіберген құрылғысынан). «Бүкіл сыныпқа» деп берсеңіз, сұрақ пен жауапты сыныптың барлық ата-анасы көреді.')));
    if (!items.length) { view.append(h('p', {class: 'text-charcoal/60 mt-4'}, T('Әзірге сұрақ жоқ.'))); return; }
    view.append(h('div', {class: 'space-y-3 mt-4'}, items.map(q => {
      const ta = h('textarea', {class: 'inp', rows: 3, placeholder: T('Жауабыңыз…')}); ta.value = q.answer || '';
      const vis = h('select', {class: 'inp'}, h('option', {value: 'private'}, T('🔒 Тек осы ата-анаға')), h('option', {value: 'class'}, T('👥 Бүкіл сыныпқа')));
      vis.value = q.vis || 'private';
      return h('div', {class: 'card space-y-3' + (q.answer ? '' : ' border-gold')},
        h('div', {class: 'flex items-start gap-3'},
          h('div', {class: 'flex-1 min-w-0'},
            h('div', {class: 'text-xs font-bold text-charcoal/60'}, fmtTs(q.ts) + ' · ' + q.name + (q.child ? T(' (баласы: ') + q.child + ')' : '')),
            h('div', {class: 'font-semibold text-emerald-950 whitespace-pre-line mt-1'}, q.q)),
          q.answer ? h('span', {class: 'chip', style: 'padding:.2rem .6rem;font-size:.75rem'}, q.vis === 'class' ? T('👥 Сыныпқа') : T('🔒 Жеке')) : h('span', {class: 'chip active', style: 'padding:.2rem .6rem;font-size:.75rem'}, T('Жауап күтуде'))),
        q.answer ? h('div', {class: 'text-sm text-charcoal/60'}, T('Жауап берген: ') + (q.ansBy || '') + (q.ansTs ? ' · ' + fmtTs(q.ansTs) : '')) : null,
        edit ? h('div', {class: 'space-y-2'}, ta, h('div', {class: 'flex flex-wrap gap-2 items-center justify-end'}, h('div', {class: 'w-56'}, vis),
          h('button', {type: 'button', class: 'btn btn-d btn-s', onclick: async () => {
            if (!confirm(T('Сұрақ өшірілсін бе?'))) return;
            await run(T('Өшірілуде…'), () => api('qremove', {id: q.id}));
            CLS.qa = CLS.qa.filter(x => x.id !== q.id); go('qa', true);
          }}, T('Өшіру')),
          h('button', {type: 'button', class: 'btn btn-g', onclick: async () => {
            if (!ta.value.trim()) { toast(T('Жауапты жазыңыз'), true); return; }
            const j = await run(T('Жіберілуде…'), () => api('answer', {id: q.id, text: ta.value.trim(), vis: vis.value}));
            Object.assign(q, j.item); dirty = false; toast(T('Жауап жіберілді ✓')); go('qa', true); showNotify(j.notify);
          }}, q.answer ? T('Жауапты жаңарту') : T('Жауап беру'))))
          : (q.answer ? h('div', {class: 'rounded-xl bg-emerald-50 p-3 whitespace-pre-line'}, q.answer) : null));
    })));
  };

  // ---------- 📝 Кері байланыс (мұғалімдердің әр оқушыға жазған пікірі) ----------
  const FB_KINDS = {main: T('Пән'), extra: T('Қосымша сабақ'), club: T('Үйірме')};
  const FB_SUBJECTS = [T('Математика'),T('Қазақ тілі'),T('Орыс тілі'),T('Ағылшын тілі'),T('Жаратылыстану'),T('Тарих'),T('Әдебиеттік оқу'),T('Сауат ашу'),T('Дүниетану'),T('Цифрлық сауаттылық'),T('Көркем еңбек'),T('Музыка'),T('Дене шынықтыру'),T('Сынып жетекшісі')];
  const FBC = {};                   // сынып → {students, items, manage, write, all}
  const FBF = {from: '', to: ''};   // кезең сүзгісі
  const fbSeesAll = () => isOwner() || ((ME.role === 'admin' || ME.role === 'viewer') && (ME.perms || []).includes('feedback'));
  const fbClasses = () => fbSeesAll() || ME.role === 'psych' ? allClasses() : (ME.classes || []);
  const fbMine = x => x.uid === ME.id || isOwner();
  const inPeriod = x => (!FBF.from || x.date >= FBF.from) && (!FBF.to || x.date <= FBF.to);
  const dmy = s => String(s || '').split('-').reverse().join('.');
  const periodText = () => (FBF.from || FBF.to) ? (FBF.from ? dmy(FBF.from) : '…') + ' — ' + (FBF.to ? dmy(FBF.to) : '…') : '';
  const fbItemsOf = (F, sid) => F.items.filter(x => x.sid === sid && inPeriod(x)).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0));
  const fbSubjectList = () => h('datalist', {id: 'fbsubjects'}, [...new Set((ME.subjects || []).concat(FB_SUBJECTS))].map(s => h('option', {value: s})));
  function fbPrint(F, students){
    window.FB_PRINT({lang: PRINT_LANG, period: periodText(), blocks: students.map(st => ({name: st.name, cls: F.cls, items: fbItemsOf(F, st.id)}))});
  }
  function fbMerge(F, items){
    const ids = new Set(items.map(x => x.id));
    F.items = F.items.filter(x => !ids.has(x.id)).concat(items);
  }
  // PDF тілі: қазақ немесе орыс сыныбына қарай (құрылғыда есте сақталады)
  let PRINT_LANG = 'kz';
  try { const pl = localStorage.getItem('adm_plang'); PRINT_LANG = pl ? (pl === 'ru' ? 'ru' : 'kz') : UI; } catch (e) {}
  function printLangSel(){
    const el = h('select', {class: 'inp', style: 'width:auto', title: T('PDF тілі')}, h('option', {value: 'kz'}, T('🖨 PDF: қазақша')), h('option', {value: 'ru'}, T('🖨 PDF: на русском')));
    el.value = PRINT_LANG;
    el.addEventListener('change', () => { PRINT_LANG = el.value; try { localStorage.setItem('adm_plang', PRINT_LANG); } catch (e) {} });
    return el;
  }
  const fbBack = () => h('button', {type: 'button', class: 'btn btn-l btn-s mb-4', onclick: () => go('fb')}, T('← Сынып тізіміне'));

  VIEWS.fb = async function(view){
    const list = fbClasses(), clubs = (ME.clubs || []).map(c => 'club:' + c);
    const all = list.concat(clubs);
    view.append(h('div', {class: 'flex flex-wrap items-center justify-between gap-3 mb-4'}, h('h1', {class: 'text-2xl font-extrabold text-emerald-950'}, T('Кері байланыс және даму картасы')),
      isOwner() ? h('div', {class: 'flex flex-wrap gap-2'},
        h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => allCodesExport('xlsx')}, T('📤 Барлық балалардың кодтары (Excel)')),
        h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => allCodesExport('pdf')}, T('🖨 Кодтар (PDF, қиып таратуға)')),
        h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => fbBulk(view)}, T('📥 Оқушылар тізімін жүктеу (барлық сынып)'))) : null));
    if (!all.length) { view.append(h('p', {class: 'card text-charcoal/70'}, T('Сізге әлі сынып немесе үйірме бекітілмеген. Бас әкімшіге хабарласыңыз.'))); return; }
    if (!curCls || !all.includes(curCls)) curCls = all[0];
    view.append(h('div', {class: 'flex flex-wrap gap-1.5 mb-4'}, all.map(c => h('button', {type: 'button', class: 'chip' + (c === curCls ? ' active' : ''), style: 'padding:.35rem .75rem',
      onclick: () => { if (dirty && !confirm(T('Сақталмаған өзгерістер жоғалады. Жалғастырайын ба?'))) return; curCls = c; dirty = false; go('fb', true); }}, c.startsWith('club:') ? '🎯 ' + c.slice(5) : c))));
    if (curCls.startsWith('club:')) { const cb = h('div'); view.append(cb); fbClubView(cb, curCls.slice(5)); return; }
    const cls = curCls;
    const box = h('div', {}, h('p', {class: 'text-charcoal/60'}, T('Жүктелуде…')));
    view.append(box);
    try { if (!FBC[cls]) FBC[cls] = await api('fbList', {cls}); }
    catch (e) { box.innerHTML = ''; box.append(h('p', {class: 'text-red-700'}, e.message)); return; }
    if (!box.isConnected) return;
    fbClassView(box, FBC[cls]);
  };
  function fbClassView(box, F){
    box.innerHTML = '';
    const from = h('input', {type: 'date', class: 'inp', value: FBF.from}), to = h('input', {type: 'date', class: 'inp', value: FBF.to});
    const setPeriod = () => { FBF.from = from.value; FBF.to = to.value; fbClassView(box, F); };
    from.addEventListener('change', setPeriod); to.addEventListener('change', setPeriod);
    box.append(
      hint(F.all ? T('Сіз осы сыныптағы барлық мұғалімнің жазбаларын көресіз.') :
        T('Сіз тек өзіңіз жазған жазбаларды көресіз. Әр жазбаны тек жазған мұғалім, сол баланың ата-анасы (баланың жеке коды арқылы), бас әкімші және құқық берілген әкімшілік көреді.')),
      h('div', {class: 'flex flex-wrap gap-2 my-4'},
        F.write && F.students.length ? h('button', {type: 'button', class: 'btn btn-g', onclick: () => fbClassForm(box, F)}, T('✍️ Бүкіл сыныпқа жазу')) : null,
        F.manage ? h('button', {type: 'button', class: 'btn btn-l', onclick: () => fbRoster(box, F)}, T('👧 Оқушылар тізімі')) : null,
        F.manage ? h('button', {type: 'button', class: 'btn btn-l', onclick: () => fbParents(box, F)}, T('👨‍👩‍👧 Тіркелген ата-аналар')) : null,
        F.manage && F.students.length ? h('button', {type: 'button', class: 'btn btn-l', onclick: () => fbCodes(box, F)}, T('🔑 Балалардың кодтары')) : null,
        F.manage ? h('button', {type: 'button', class: 'btn btn-l', onclick: () => fbImport(box, F)}, T('📥 Excel-ден көшіру')) : null,
        F.students.length ? h('button', {type: 'button', class: 'btn btn-g', onclick: () => fbCards(box, F)}, T('📊 Даму картасы')) : null,
        F.students.length ? h('button', {type: 'button', class: 'btn btn-l', onclick: () => fbPrint(F, F.students)}, T('🖨 Бүкіл сынып (PDF)')) : null,
        h('button', {type: 'button', class: 'btn btn-l', title: T('Жаңарту'), onclick: () => { delete FBC[F.cls]; go('fb', true); }}, '🔄'), printLangSel()),
      h('div', {class: 'card mb-4'}, h('div', {class: 'grid sm:grid-cols-3 gap-3 items-end'},
        field(T('Кезең: басы'), from), field(T('Кезең: соңы'), to),
        h('button', {type: 'button', class: 'btn btn-l', onclick: () => { FBF.from = FBF.to = ''; fbClassView(box, F); }}, T('Барлық уақыт')))));
    if (!F.students.length) {
      box.append(h('p', {class: 'card text-charcoal/70'}, F.cls + T(' сыныбының оқушылар тізімі әлі енгізілмеген. ') +
        (F.manage ? T('«👧 Оқушылар тізімі» батырмасымен қосыңыз немесе «📥 Excel-ден көшіру» арқылы жүктеңіз.') : T('Тізімді сынып жетекшісі немесе бас әкімші енгізеді.'))));
      return;
    }
    const students = F.students.slice().sort((a, b) => a.name.localeCompare(b.name, 'kk'));
    box.append(h('div', {class: 'grid sm:grid-cols-2 lg:grid-cols-3 gap-2'}, students.map(st => {
      const items = fbItemsOf(F, st.id);
      return h('button', {type: 'button', class: 'card text-left hover:border-gold', style: 'padding:.85rem 1rem', onclick: () => fbStudent(box, F, st)},
        h('div', {class: 'font-bold text-emerald-950'}, st.name),
        h('div', {class: 'text-xs text-charcoal/60 mt-0.5'}, items.length ? items.length + T(' жазба · соңғысы ') + fmt(items[0].date) : T('Жазба жоқ')),
        st.note ? h('div', {class: 'text-xs text-gold-600 font-semibold mt-0.5'}, st.note) : null);
    })));
  }
  function fbStudent(box, F, st){
    box.innerHTML = '';
    const formBox = h('div');
    const items = fbItemsOf(F, st.id);
    box.append(fbBack(),
      h('div', {class: 'flex flex-wrap items-center justify-between gap-3 mb-4'},
        h('div', {}, h('h2', {class: 'text-xl font-extrabold text-emerald-950'}, st.name), h('div', {class: 'text-sm text-charcoal/60'}, F.cls + T(' сынып') + (periodText() ? ' · ' + periodText() : '')),
          (st.clubs || []).length ? h('div', {class: 'text-xs text-charcoal/60'}, T('🎯 Үйірмелері: ') + st.clubs.join(', ')) : null,
          st.note ? h('div', {class: 'text-xs text-gold-600 font-semibold'}, st.note) : null),
        h('div', {class: 'flex flex-wrap gap-2'},
          F.write ? h('button', {type: 'button', class: 'btn btn-g', onclick: () => fbForm(formBox, box, F, st, null)}, T('+ Жаңа жазба')) : null,
          h('button', {type: 'button', class: 'btn btn-l', onclick: () => fbPrint(F, [st])}, '🖨 PDF'))),
      formBox);
    if (!items.length) { box.append(h('p', {class: 'text-charcoal/60'}, T('Әзірге жазба жоқ.'))); return; }
    box.append(h('div', {class: 'space-y-3'}, items.map(x => h('div', {class: 'card'},
      h('div', {class: 'flex gap-3 items-start'},
        h('div', {class: 'flex-1 min-w-0'},
          h('div', {class: 'text-xs font-bold text-charcoal/60'}, fmt(x.date) + ' ' + x.date.slice(0, 4) + ' · ' + (FB_KINDS[x.kind] || T('Пән')) + ' · ✍️ ' + (x.by || '') + (x.imported ? ' (Excel)' : '')),
          h('div', {class: 'font-bold text-emerald-950'}, x.subj),
          x.text ? h('div', {class: 'text-sm text-charcoal/85 whitespace-pre-line mt-1'}, x.text) : null,
          x.rec ? h('div', {class: 'text-sm mt-2 rounded-xl bg-gold-50 border border-gold-100 p-2 whitespace-pre-line'}, h('b', {}, T('Ата-анаға ұсыныс: ')), x.rec) : null),
        fbMine(x) ? h('div', {class: 'flex flex-col gap-2 shrink-0'},
          F.write ? h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { fbForm(formBox, box, F, st, x); window.scrollTo(0, 0); }}, T('Өзгерту')) : null,
          h('button', {type: 'button', class: 'btn btn-d btn-s', onclick: async () => {
            if (!confirm(T('Жазба өшірілсін бе?'))) return;
            await run(T('Өшірілуде…'), () => api('fbDel', {cls: F.cls, ids: [x.id]}));
            F.items = F.items.filter(y => y.id !== x.id); toast(T('Өшірілді')); fbStudent(box, F, st);
          }}, T('Өшіру'))) : null)))));
  }
  function fbKindSelect(val){ const el = h('select', {class: 'inp'}, Object.entries(FB_KINDS).map(([k, v]) => h('option', {value: k}, v))); el.value = val || 'main'; return el; }
  function fbSubjInput(val){ const el = h('input', {class: 'inp', type: 'text', list: 'fbsubjects', placeholder: T('мысалы: Математика')}); el.value = val || ''; return el; }
  function fbForm(formBox, box, F, st, x){
    x = x ? clone(x) : {date: today(), kind: 'main', subj: (ME.subjects || [])[0] || ''};
    const date = dateInput(x.date), kind = fbKindSelect(x.kind), subj = fbSubjInput(x.subj);
    const text = h('textarea', {class: 'inp', rows: 4, placeholder: T('Сабақ оқуы, тәртібі, ынтасы, мінез-құлқы…')}); text.value = x.text || '';
    const rec = h('textarea', {class: 'inp', rows: 3, placeholder: T('Ата-анаға не ұсынасыз (міндетті емес)')}); rec.value = x.rec || '';
    formBox.innerHTML = '';
    formBox.append(fbSubjectList(), h('div', {class: 'mb-4'}, section(x.id ? T('Жазбаны өзгерту') : T('Жаңа жазба · ') + st.name,
      h('div', {class: 'grid sm:grid-cols-3 gap-3'}, field(T('Күні'), date), field(T('Түрі'), kind), field(T('Пән / үйірме *'), subj)),
      field(T('Кері байланыс *'), text), field(T('Ата-аналарға арналған ұсыныс'), rec),
      h('div', {class: 'flex flex-wrap gap-2 justify-end'},
        h('button', {type: 'button', class: 'btn btn-l', onclick: () => { formBox.innerHTML = ''; dirty = false; }}, T('Бас тарту')),
        h('button', {type: 'button', class: 'btn btn-g', onclick: async () => {
          if (!subj.value.trim()) { toast(T('Пәнін жазыңыз'), true); return; }
          if (!text.value.trim() && !rec.value.trim()) { toast(T('Кері байланысты жазыңыз'), true); return; }
          const item = {id: x.id, sid: st.id, date: date.value || today(), kind: kind.value, subj: subj.value.trim(), text: text.value.trim(), rec: rec.value.trim()};
          const j = await run(T('Сақталуда…'), () => api('fbSave', {cls: F.cls, items: [item]}));
          fbMerge(F, j.items); dirty = false; toast(T('Сақталды ✓ Ата-ана өз бетінде көреді.')); fbStudent(box, F, st); showNotify(j.notify);
        }}, T('💾 Сақтау'))))));
    text.focus();
  }
  // Бір пән бойынша бүкіл сыныпқа бірден жазу
  function fbClassForm(box, F){
    box.innerHTML = '';
    const date = dateInput(today()), kind = fbKindSelect('main'), subj = fbSubjInput((ME.subjects || [])[0] || '');
    const students = F.students.slice().sort((a, b) => a.name.localeCompare(b.name, 'kk'));
    const rows = students.map(st => {
      const text = h('textarea', {class: 'inp', rows: 3, placeholder: T('Кері байланыс')});
      const rec = h('textarea', {class: 'inp', rows: 3, placeholder: T('Ата-анаға ұсыныс (міндетті емес)')});
      return {st, text, rec, el: h('div', {class: 'rounded-2xl border border-emerald-900/10 bg-white p-3'},
        h('div', {class: 'font-bold text-emerald-950 mb-2'}, st.name), h('div', {class: 'grid sm:grid-cols-2 gap-2'}, text, rec))};
    });
    box.append(fbBack(), fbSubjectList(), h('div', {class: 'space-y-4'},
      section(T('Бүкіл сыныпқа жазу · ') + F.cls,
        hint(T('Бір пән бойынша бірнеше оқушыға бірден жазуға болады. Бос қалған оқушыларға ештеңе жазылмайды. Әр ата-ана тек өз баласына жазылғанды көреді.')),
        h('div', {class: 'grid sm:grid-cols-3 gap-3'}, field(T('Күні'), date), field(T('Түрі'), kind), field(T('Пән / үйірме *'), subj))),
      h('div', {class: 'space-y-2'}, rows.map(r => r.el)),
      saveBar(T('Сақтау'), async () => {
        if (!subj.value.trim()) { toast(T('Пәнін жазыңыз'), true); return; }
        const items = rows.filter(r => r.text.value.trim() || r.rec.value.trim()).map(r => ({sid: r.st.id, date: date.value || today(), kind: kind.value, subj: subj.value.trim(), text: r.text.value.trim(), rec: r.rec.value.trim()}));
        if (!items.length) { toast(T('Ешбір оқушыға жазылмаған'), true); return; }
        const j = await run(T('Сақталуда…'), () => api('fbSave', {cls: F.cls, items}));
        fbMerge(F, j.items); dirty = false; toast(T('Сақталды ✓ ') + j.items.length + T(' оқушы')); go('fb', true); showNotify(j.notify);
      })));
  }
  // Оқушылар тізімі (бас әкімші және сынып жетекшісі)
  function fbRoster(box, F){
    box.innerHTML = '';
    const students = F.students.slice().sort((a, b) => a.name.localeCompare(b.name, 'kk'));
    const inputs = students.map(st => { const el = h('input', {class: 'inp', type: 'text'}); el.value = st.name; return {st, el}; });
    const add = h('textarea', {class: 'inp', rows: 5, placeholder: T('Әр жолға бір оқушының аты-жөні')});
    box.append(fbBack(), h('div', {class: 'space-y-4'},
      section(T('Оқушылар тізімі · ') + F.cls + ' (' + students.length + ')',
        students.length ? h('div', {class: 'space-y-2'}, inputs.map(({st, el}) => h('div', {class: 'flex gap-2 items-center'}, el,
          h('button', {type: 'button', class: 'btn btn-d btn-s', onclick: async () => {
            if (!confirm(st.name + T(' тізімнен өшірілсін бе? Оған жазылған барлық кері байланыс та өшіріледі.'))) return;
            await run(T('Өшірілуде…'), () => api('stuDel', {id: st.id}));
            F.students = F.students.filter(s => s.id !== st.id); F.items = F.items.filter(x => x.sid !== st.id); fbRoster(box, F);
          }}, T('Өшіру'))))) : h('p', {class: 'text-charcoal/60 text-sm'}, T('Әзірге оқушы жоқ.'))),
      section(T('Жаңа оқушыларды қосу'), add),
      saveBar(T('Тізімді сақтау'), async () => {
        const list = inputs.filter(r => r.el.value.trim() && r.el.value.trim() !== r.st.name).map(r => ({id: r.st.id, name: r.el.value.trim()}))
          .concat(add.value.split('\n').map(s => s.trim().replace(/^\d{1,3}\s*[.)]?\s+(?=\D)/, '')).filter(Boolean).map(name => ({name})));
        if (!list.length) { toast(T('Өзгеріс жоқ')); return; }
        const j = await run(T('Сақталуда…'), () => api('stuSave', {cls: F.cls, students: list}));
        F.students = j.students.map(s => ({id: s.id, name: s.name, code: s.code})); dirty = false; savedToast(); fbRoster(box, F);
      })));
  }
  // Әр баланың жеке коды: ата-ана осы кодпен тек өз баласының кері байланысын көреді
  function fbCodes(box, F){
    box.innerHTML = '';
    const students = F.students.slice().sort((a, b) => a.name.localeCompare(b.name, 'kk'));
    const msgOf = st => {
      const link = SITE_URL + '#c=' + st.code;
      return 'Құрметті ата-ана! ' + st.name + ' (' + F.cls + ' сынып) бойынша мұғалімдердің кері байланысы, даму картасы және сынып беті: ' + link + '\nБаланың жеке коды: ' + st.code + '\nКодты басқа адамдарға бермеңіз.' +
        '\n\nУважаемый родитель! Обратная связь учителей, карта развития ученика ' + st.name + ' (' + F.cls + ' класс) и страница класса: ' + link + '\nЛичный код ребёнка: ' + st.code + '\nНе передавайте код другим.';
    };
    const all = students.map(st => st.name + ' — ' + st.code + ' — ' + SITE_URL + '#c=' + st.code).join('\n');
    box.append(fbBack(),
      hint(T('Әр баланың өз коды бар. Ата-ана сайттағы «Сыныбым» бөліміне осы кодты енгізсе (немесе сілтемені ашса), сынып беті және тек өз баласына жазылған кері байланыс ашылады. Код бөтен адамға тарап кетсе, 🔄 басыңыз — ескі код жұмыс істемей қалады.')),
      h('div', {class: 'flex flex-wrap gap-2 my-4'},
        h('button', {type: 'button', class: 'btn btn-l', onclick: () => navigator.clipboard.writeText(all).then(() => toast(T('Барлық код көшірілді')))}, T('📋 Барлығын көшіру')),
        codesButtons(() => [{cls: F.cls, students}])),
      h('div', {class: 'grid sm:grid-cols-2 gap-3'}, students.map(st => h('div', {class: 'card space-y-2'},
        h('div', {class: 'flex items-center justify-between gap-2'}, h('div', {class: 'font-bold text-emerald-950'}, st.name),
          h('div', {class: 'font-mono text-lg font-extrabold tracking-widest text-gold-600'}, st.code)),
        h('div', {class: 'flex flex-wrap gap-2'},
          h('a', {class: 'btn btn-p btn-s', target: '_blank', href: 'https://wa.me/?text=' + encodeURIComponent(msgOf(st))}, T('WhatsApp-қа жіберу')),
          h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => navigator.clipboard.writeText(msgOf(st)).then(() => toast(T('Көшірілді')))}, T('Көшіру')),
          h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: async () => {
            if (!confirm(st.name + T(': жаңа код жасалса, ескі код (') + st.code + T(') жұмыс істемей қалады. Жалғастырайын ба?'))) return;
            const j = await run(T('Код жасалуда…'), () => api('stuCode', {ids: [st.id]}));
            st.code = j.codes[st.id]; fbCodes(box, F);
          }}, T('🔄 Жаңа код')))))));
  }
  // Excel файлынан көшіру: әр оқушыға жеке парақ, ішінде «Пән | Кері байланыс | Ата-аналарға арналған ұсыныстар»
  function loadXlsx(){
    if (window.XLSX) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = res; s.onerror = () => rej(new Error(T('Excel оқитын бағдарлама жүктелмеді. Интернетті тексеріңіз.')));
      document.head.append(s);
    });
  }
  function parseFbWorkbook(wb){
    const seen = new Set(), out = [], skipped = [];
    wb.SheetNames.forEach(sn => {
      const name = sn.replace(/\s+/g, ' ').trim();
      if (/\((копия|copy|көшірме|\d+)\)$/i.test(name)) { skipped.push(name + T(' — көшірме парақ')); return; }
      if (seen.has(name.toLowerCase())) { skipped.push(name + T(' — қайталанған')); return; }
      seen.add(name.toLowerCase());
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], {header: 1, defval: '', raw: false});
      let kind = 'main', headers = 0;
      const items = [];
      rows.forEach(r => {
        const a = String(r[0] || '').trim(), b = String(r[1] || '').trim(), c = String(r[2] || '').trim();
        const al = a.toLowerCase();
        if (/^(пән|пәндер|предмет|предметы)$/.test(al)) { headers++; kind = headers === 1 ? 'main' : 'extra'; return; }
        if (/^(үйірме|үйірмелер|кружок|кружки)$/.test(al)) { kind = 'club'; return; }
        if (!a || (!b && !c)) return;
        items.push({kind: /қосымша|дополнит/i.test(a) && kind === 'main' ? 'extra' : kind, subj: a, text: b, rec: c});
      });
      out.push({name, rows: items});
    });
    return {students: out, skipped};
  }
  function fbImport(box, F){
    box.innerHTML = '';
    const file = h('input', {type: 'file', accept: '.xlsx,.xls', class: 'inp'});
    const date = dateInput(today());
    const prev = h('div');
    let parsed = null;
    file.addEventListener('change', async () => {
      prev.innerHTML = ''; parsed = null;
      const f = file.files[0]; if (!f) return;
      try {
        await run(T('Excel оқылуда…'), loadXlsx);
        parsed = parseFbWorkbook(XLSX.read(await f.arrayBuffer(), {type: 'array'}));
      } catch (e) { toast(e.message || T('Файлды оқу мүмкін болмады'), true); return; }
      const known = new Set(F.students.map(s => s.name.toLowerCase()));
      const total = parsed.students.reduce((n, s) => n + s.rows.length, 0);
      prev.append(section(T('Алдын ала қарау: ') + parsed.students.length + T(' оқушы, ') + total + T(' жазба'),
        h('div', {class: 'space-y-1 text-sm'}, parsed.students.map(s => h('div', {class: 'flex justify-between gap-2 border-b border-emerald-900/5 py-1'},
          h('span', {class: 'font-semibold'}, s.name, known.has(s.name.toLowerCase()) ? '' : h('span', {class: 'ml-2 text-xs text-gold-600 font-bold'}, T('жаңа оқушы'))),
          h('span', {class: 'text-charcoal/60'}, s.rows.length + T(' жазба'))))),
        parsed.skipped.length ? h('p', {class: 'text-sm text-charcoal/65'}, T('Өткізілді: ') + parsed.skipped.join('; ')) : null,
        h('div', {class: 'flex justify-end'}, h('button', {type: 'button', class: 'btn btn-g', onclick: async () => {
          if (!confirm(F.cls + T(' сыныбына ') + parsed.students.length + T(' оқушы және ') + total + T(' жазба қосылсын ба?'))) return;
          const j = await run(T('Көшірілуде…'), () => api('fbImport', {cls: F.cls, date: date.value || today(), students: parsed.students}));
          toast(T('Көшірілді ✓ ') + j.added.students + T(' жаңа оқушы, ') + j.added.items + T(' жазба'));
          delete FBC[F.cls]; go('fb', true);
        }}, T('📥 Көшіру')))));
    });
    box.append(fbBack(), h('div', {class: 'space-y-4'},
      section(T('Excel-ден көшіру · ') + F.cls,
        hint(T('Файлда әр оқушыға жеке парақ болуы керек (парақтың аты — оқушының аты-жөні). Парақ ішінде: Пән | Кері байланыс | Ата-аналарға арналған ұсыныстар. Екінші «Пән» тақырыбынан кейінгі жолдар қосымша сабақ, «Үйірме» тақырыбынан кейінгілері үйірме болып жазылады. «(копия)» деген парақтар өткізіліп жіберіледі.')),
        h('p', {class: 'text-sm text-charcoal/65'}, T('Көшірілген жазбалардың авторы ретінде сіздің атыңыз көрсетіледі. Бір файлды екі рет көшірсеңіз, жазбалар қайталанады.')),
        h('div', {class: 'grid sm:grid-cols-2 gap-3'}, field(T('Excel файлы (.xlsx)'), file), field(T('Жазбалардың күні'), date))),
      prev));
  }

  // ---------- кесте файлдарын оқу (CSV немесе Excel) ----------
  function parseCsv(text){
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
      if (c === '"') q = true;
      else if (c === sep) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim()));
  }
  async function readTable(file){
    if (/\.csv$|\.txt$/i.test(file.name)) return parseCsv(await file.text());
    await run(T('Excel оқылуда…'), loadXlsx);
    const wb = XLSX.read(await file.arrayBuffer(), {type: 'array'});
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: '', raw: false}).filter(r => r.some(x => String(x).trim()));
  }
  // «17.10.2026» → «2026-10-17»
  const isoDate = s => { s = String(s || '').trim(); let m = s.match(/^(\d{4})-(\d\d)-(\d\d)$/); if (m) return s; m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/); return m ? m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]) : ''; };

  // ---------- 👧 Барлық сыныптың оқушылар тізімін жүктеу (бас әкімші) ----------
  function fbBulk(view){
    view.innerHTML = '';
    const file = h('input', {type: 'file', accept: '.csv,.xlsx,.xls', class: 'inp'});
    const prev = h('div');
    file.addEventListener('change', async () => {
      prev.innerHTML = '';
      const f = file.files[0]; if (!f) return;
      let rows;
      try { rows = await readTable(f); } catch (e) { toast(e.message || T('Файлды оқу мүмкін болмады'), true); return; }
      const head = rows[0].map(x => String(x).toLowerCase());
      const col = re => head.findIndex(x => re.test(x));
      const ci = {cls: col(/сынып|класс/), name: col(/аты|фио|имя/), clubs: col(/үйірме|кружк/), since: col(/келген|дата|күні/), note: col(/ескерту|примеч/)};
      if (ci.cls < 0 || ci.name < 0) { toast(T('Файлда «Сынып» және «Аты-жөні» бағандары болуы керек'), true); return; }
      const list = rows.slice(1).map(r => ({cls: String(r[ci.cls] || '').trim().toUpperCase().replace(/[«»"\s]/g, ''), name: String(r[ci.name] || '').trim(),
        clubs: ci.clubs >= 0 ? String(r[ci.clubs] || '').split('|').map(x => x.trim()).filter(Boolean) : undefined,
        since: ci.since >= 0 ? isoDate(r[ci.since]) : undefined, note: ci.note >= 0 ? String(r[ci.note] || '').trim() : undefined})).filter(x => x.cls && x.name);
      const by = {};
      list.forEach(x => { by[x.cls] = (by[x.cls] || 0) + 1; });
      const known = new Set(allClasses());
      prev.append(section(T('Алдын ала қарау: ') + list.length + T(' оқушы, ') + Object.keys(by).length + T(' сынып'),
        h('div', {class: 'flex flex-wrap gap-1.5'}, Object.keys(by).sort().map(c => h('span', {class: 'chip', style: 'padding:.3rem .7rem'}, c + ': ' + by[c], known.has(c) ? '' : T(' (жаңа сынып)')))),
        list.some(x => x.note) ? h('div', {class: 'text-sm'}, h('b', {}, T('Ескертулер: ')), list.filter(x => x.note).map(x => x.cls + ' · ' + x.name + ' — ' + x.note).join('; ')) : null,
        h('p', {class: 'text-sm text-charcoal/65'}, T('Тізімде бар оқушылар жаңартылады (сыныбы, үйірмелері), жоқтары қосылады. Басқа сыныпқа ауысқан баланың кері байланысы мен картасы жаңа сыныбына бірге көшеді. Тізімде жоқ оқушылар өшірілмейді.')),
        h('div', {class: 'flex justify-end'}, h('button', {type: 'button', class: 'btn btn-g', onclick: async () => {
          const j = await run(T('Жүктелуде…'), () => api('stuBulk', {students: list}));
          if (j.res.classes) { DATA.settings = Object.assign({}, DATA.settings || {}, {classes: j.res.classes}); }
          Object.keys(FBC).forEach(k => delete FBC[k]);
          toast(T('Дайын ✓ ') + j.res.added + T(' жаңа, ') + j.res.updated + T(' жаңартылды') + (j.res.newClasses.length ? T('; жаңа сыныптар: ') + j.res.newClasses.join(', ') : ''));
          if (j.res.moved.length) toast(T('Ауысқандар: ') + j.res.moved.join('; '));
          go('fb', true);
        }}, T('📥 Жүктеу')))));
    });
    view.append(h('button', {type: 'button', class: 'btn btn-l btn-s mb-4', onclick: () => go('fb')}, T('← Кері байланыс')), title(T('Оқушылар тізімін жүктеу')),
      h('div', {class: 'space-y-4'}, section(null,
        hint(T('CSV немесе Excel файлы. Бағандар: Сынып; Аты-жөні; Үйірмелер (« | » арқылы); Келген күні; Ескерту. Жұмыс үстеліндегі «Бастауыш сайт — жүктеу файлдары» қалтасында сабақ кестесінен дайындалған «Оқушылар тізімі (сайтқа жүктеу).csv» файлы бар.')),
        field(T('Файл'), file)), prev));
  }

  // ---------- 🎯 Үйірме жетекшісі: өз үйірмесінің балалары ----------
  async function fbClubView(box, club){
    box.innerHTML = '';
    box.append(h('p', {class: 'text-charcoal/60'}, T('Жүктелуде…')));
    let C;
    try { C = FBC['club:' + club] || (FBC['club:' + club] = await api('fbClub', {club})); }
    catch (e) { box.innerHTML = ''; box.append(h('p', {class: 'text-red-700'}, e.message)); return; }
    if (!box.isConnected) return;
    box.innerHTML = '';
    const students = C.students.slice().sort((a, b) => a.cls < b.cls ? -1 : a.cls > b.cls ? 1 : a.name.localeCompare(b.name, 'kk'));
    const groupOf = st => (st.clubs || []).find(k => k.split(' — ')[0].toLowerCase() === club.toLowerCase()) || club;
    box.append(hint('«' + club + T('» үйірмесінің барлық сыныптағы балалары. Жазбаңызды тек сіз, баланың ата-анасы және мектеп әкімшілігі көреді.')),
      h('div', {class: 'flex flex-wrap gap-2 my-4'},
        students.length ? h('button', {type: 'button', class: 'btn btn-g', onclick: () => fbClubForm(box, C, club, students, groupOf)}, T('✍️ Үйірме балаларына жазу')) : null,
        h('button', {type: 'button', class: 'btn btn-l', onclick: () => { delete FBC['club:' + club]; fbClubView(box, club); }}, '🔄')));
    if (!students.length) { box.append(h('p', {class: 'card text-charcoal/70'}, T('Бұл үйірмеге жазылған бала табылмады. Оқушылар тізімін бас әкімші жүктеуі керек.'))); return; }
    const groups = {};
    students.forEach(st => { (groups[groupOf(st)] = groups[groupOf(st)] || []).push(st); });
    Object.keys(groups).sort().forEach(g => box.append(section(g + ' (' + groups[g].length + ')', h('div', {class: 'space-y-2'}, groups[g].map(st => {
      const items = C.items.filter(x => x.sid === st.id).sort((a, b) => a.date < b.date ? 1 : -1);
      return h('div', {class: 'rounded-2xl border border-emerald-900/10 p-3'},
        h('div', {class: 'font-bold text-emerald-950'}, st.name, h('span', {class: 'ml-2 text-xs text-gold-600 font-bold'}, st.cls)),
        items.length ? h('div', {class: 'mt-1 space-y-1'}, items.map(x => h('div', {class: 'text-sm flex gap-2 items-start'},
          h('div', {class: 'flex-1'}, h('span', {class: 'text-xs font-bold text-charcoal/55'}, fmt(x.date) + ' · '), x.text, x.rec ? h('span', {class: 'text-gold-600'}, ' — ' + x.rec) : null),
          fbMine(x) ? h('button', {type: 'button', class: 'btn btn-d btn-s', onclick: async () => {
            if (!confirm(T('Жазба өшірілсін бе?'))) return;
            await run(T('Өшірілуде…'), () => api('fbDel', {cls: x.cls, ids: [x.id]}));
            C.items = C.items.filter(y => y.id !== x.id); fbClubView(box, club);
          }}, '✕') : null))) : h('div', {class: 'text-xs text-charcoal/50 mt-1'}, T('Жазба жоқ')));
    })))));
  }
  function fbClubForm(box, C, club, students, groupOf){
    box.innerHTML = '';
    const date = dateInput(today());
    const rows = students.map(st => {
      const text = h('textarea', {class: 'inp', rows: 2, placeholder: T('Кері байланыс')}), rec = h('textarea', {class: 'inp', rows: 2, placeholder: T('Ата-анаға ұсыныс (міндетті емес)')});
      return {st, text, rec, el: h('div', {class: 'rounded-2xl border border-emerald-900/10 bg-white p-3'},
        h('div', {class: 'font-bold text-emerald-950 mb-2'}, st.name, h('span', {class: 'ml-2 text-xs text-gold-600 font-bold'}, st.cls + ' · ' + groupOf(st).split(' — ')[1])), h('div', {class: 'grid sm:grid-cols-2 gap-2'}, text, rec))};
    });
    box.append(h('button', {type: 'button', class: 'btn btn-l btn-s mb-4', onclick: () => go('fb')}, T('← Үйірме тізіміне')), h('div', {class: 'space-y-4'},
      section('«' + club + T('» үйірмесі бойынша жазу'), hint(T('Бос қалған балаларға ештеңе жазылмайды. Әр ата-ана тек өз баласына жазылғанды көреді.')), h('div', {class: 'grid sm:grid-cols-3 gap-3'}, field(T('Күні'), date))),
      h('div', {class: 'space-y-2'}, rows.map(r => r.el)),
      saveBar(T('Сақтау'), async () => {
        const items = rows.filter(r => r.text.value.trim() || r.rec.value.trim()).map(r => ({sid: r.st.id, date: date.value || today(), subj: club, text: r.text.value.trim(), rec: r.rec.value.trim()}));
        if (!items.length) { toast(T('Ешбір балаға жазылмаған'), true); return; }
        const j = await run(T('Сақталуда…'), () => api('fbSaveClub', {club, items}));
        C.items = C.items.concat(j.items); dirty = false; toast(T('Сақталды ✓ ') + j.items.length + T(' бала')); go('fb', true); showNotify(j.notify);
      })));
  }

  // ---------- 📊 Даму картасы ----------
  const LV = CARD.levels[UI];
  const LV_COL = ['', '#E9A23B', '#F2D06B', '#8CC5A8', '#2E7D5B'];
  let CARD_PERIOD = CARD.currentPeriod();
  async function cardLoad(F, force){
    F.cards = F.cards || {};
    if (!F.cards[CARD_PERIOD] || force) F.cards[CARD_PERIOD] = await api('cardList', {cls: F.cls, period: CARD_PERIOD});
    return F.cards[CARD_PERIOD];
  }
  function periodSelect(onchange){
    const el = h('select', {class: 'inp'}, CARD.periods().map(p => h('option', {value: p}, CARD.periodName(p, UI))));
    el.value = CARD_PERIOD;
    el.addEventListener('change', () => { CARD_PERIOD = el.value; onchange(); });
    return el;
  }
  const cardFor = (K, sid) => ({ratings: K.ratings.filter(r => r.sid === sid), concl: K.concl.find(c => c.sid === sid) || null});
  function cardPrintData(F, K, st){
    const c = cardFor(K, st.id);
    const ps = c.concl && c.concl.psych && c.concl.psych.consent && (c.concl.psych.text || c.concl.psych.rec) ? c.concl.psych : null;
    return {lang: PRINT_LANG, name: st.name, cls: F.cls, period: CARD_PERIOD, agg: CARD.agg(c.ratings), clubs: st.clubs || [],
      concl: c.concl && (c.concl.text || c.concl.rec) ? c.concl : null, psych: ps};
  }
  async function fbCards(box, F){
    box.innerHTML = '';
    box.append(fbBack(), h('p', {class: 'text-charcoal/60'}, T('Жүктелуде…')));
    let K;
    try { K = await cardLoad(F); } catch (e) { box.lastChild.textContent = e.message; return; }
    if (!box.isConnected) return;
    box.innerHTML = '';
    const students = F.students.slice().sort((a, b) => a.name.localeCompare(b.name, 'kk'));
    box.append(fbBack(),
      h('div', {class: 'flex flex-wrap items-end justify-between gap-3 mb-3'},
        h('div', {}, h('h2', {class: 'text-xl font-extrabold text-emerald-950'}, T('📊 Даму картасы · ') + F.cls), h('div', {class: 'w-56 mt-2'}, periodSelect(() => fbCards(box, F)))),
        h('div', {class: 'flex flex-wrap gap-2'}, printLangSel(),
          K.all ? h('button', {type: 'button', class: 'btn btn-l', onclick: () => window.CARD_PRINT(students.map(st => cardPrintData(F, K, st)))}, T('🖨 Бүкіл сыныптың карталары (PDF)')) : null)),
      hint(T('Әр педагог баланы өз бақылауы бойынша 4 деңгеймен бағалайды: 4 — жоғары, 3 — жеткілікті, 2 — дамып келеді, 1 — қолдау қажет. Карта барлық педагогтың бағасын біріктіріп, күшті және дамытуды қажет ететін жақтарын, ата-анаға ұсыныстарды өзі шығарады. ') +
        (K.all ? T('Сіз барлық педагогтың бағасын көресіз.') : T('Сіз тек өз бағаңызды көресіз; жиынтық картаны сынып жетекшісі мен ата-ана көреді.')) +
        T(' Педагог-психолог бөлімі тек ата-ананың жазбаша келісімі белгіленгенде толтырылады.')));
    box.append(h('div', {class: 'grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-4'}, students.map((st, i) => {
      const c = cardFor(K, st.id), mine = c.ratings.some(r => r.uid === ME.id);
      return h('button', {type: 'button', class: 'card text-left hover:border-gold', style: 'padding:.85rem 1rem', onclick: () => fbCardStudent(box, F, students, i)},
        h('div', {class: 'font-bold text-emerald-950'}, st.name),
        h('div', {class: 'text-xs text-charcoal/60 mt-0.5'}, (mine ? T('✅ Бағаладыңыз') : T('⏳ Бағаланбаған')) + (K.all ? T(' · педагогтар: ') + c.ratings.length + (c.concl && c.concl.text ? T(' · қорытынды ✓') : '') : '')));
    })));
  }
  function levelPicker(val){
    let cur = val || 0;
    const wrap = h('div', {class: 'flex gap-1'});
    const render = () => { wrap.innerHTML = ''; [1, 2, 3, 4].forEach(n => wrap.append(h('button', {type: 'button', title: LV[n],
      class: 'w-9 h-8 rounded-lg text-sm font-extrabold border', style: n === cur ? 'background:' + LV_COL[n] + ';border-color:' + LV_COL[n] + ';color:' + (n >= 3 ? '#fff' : '#3b2a00') : 'background:#fff;border-color:rgba(15,56,44,.2);color:#0F382C',
      onclick: () => { cur = cur === n ? 0 : n; dirty = true; render(); }}, n))); };
    render();
    return {el: wrap, get: () => cur};
  }
  function fbCardStudent(box, F, students, i){
    const st = students[i], K = F.cards[CARD_PERIOD];
    const c = cardFor(K, st.id), my = c.ratings.find(r => r.uid === ME.id) || {vals: {}, subj: {}, interests: [], note: ''};
    box.innerHTML = '';
    const pickers = {};
    const paramRows = CARD.groups.map(g => h('div', {class: 'space-y-1.5'}, h('div', {class: 'lbl mt-2'}, g[UI]),
      CARD.params.filter(p => p.g === g.k).map(p => { pickers[p.k] = levelPicker(my.vals[p.k]); return h('div', {class: 'flex flex-wrap items-center justify-between gap-2 border-b border-emerald-900/5 pb-1.5'}, h('span', {class: 'text-sm font-semibold'}, p[UI]), pickers[p.k].el); })));
    const subjNames = [...new Set((ME.subjects || []).concat(Object.keys(my.subj || {})))];
    const subjPick = {};
    const subjBox = h('div', {class: 'space-y-1.5'});
    const addSubj = name => { if (!name || subjPick[name]) return; subjPick[name] = levelPicker((my.subj || {})[name]); subjBox.append(h('div', {class: 'flex flex-wrap items-center justify-between gap-2 border-b border-emerald-900/5 pb-1.5'}, h('span', {class: 'text-sm font-semibold'}, name), subjPick[name].el)); };
    subjNames.forEach(addSubj);
    const newSubj = fbSubjInput('');
    const interests = {};
    const interBox = h('div', {class: 'flex flex-wrap gap-1.5'}, CARD.interests.map(x => { interests[x.k] = h('input', {type: 'checkbox', checked: (my.interests || []).includes(x.k)}); return h('label', {class: 'chip', style: 'padding:.3rem .7rem'}, interests[x.k], x[UI]); }));
    const note = h('textarea', {class: 'inp', rows: 3, placeholder: T('Қысқаша ескерту (ата-ана жиынтық картада атыңызсыз көреді)')}); note.value = my.note || '';
    const nav = h('div', {class: 'flex flex-wrap gap-2'},
      i > 0 ? h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { if (!dirty || confirm(T('Сақталмаған өзгерістер жоғалады. Жалғастырайын ба?'))) { dirty = false; fbCardStudent(box, F, students, i - 1); } }}, '← ' + students[i - 1].name) : null,
      i < students.length - 1 ? h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { if (!dirty || confirm(T('Сақталмаған өзгерістер жоғалады. Жалғастырайын ба?'))) { dirty = false; fbCardStudent(box, F, students, i + 1); } }}, students[i + 1].name + ' →') : null);
    const saveRating = async goNext => {
      const vals = {}; Object.keys(pickers).forEach(k => { if (pickers[k].get()) vals[k] = pickers[k].get(); });
      const subj = {}; Object.keys(subjPick).forEach(k => { if (subjPick[k].get()) subj[k] = subjPick[k].get(); });
      const item = {sid: st.id, vals, subj, interests: Object.keys(interests).filter(k => interests[k].checked), note: note.value.trim()};
      const j = await run(T('Сақталуда…'), () => api('cardRate', {cls: F.cls, period: CARD_PERIOD, items: [item]}));
      K.ratings = K.ratings.filter(r => !(r.sid === st.id && r.uid === ME.id)).concat(j.items);
      dirty = false; toast(T('Сақталды ✓'));
      fbCardStudent(box, F, students, goNext && i < students.length - 1 ? i + 1 : i);
    };
    // жиынтық (бүкіл педагогтар бойынша)
    const agg = CARD.agg(c.ratings), A = CARD.analyse(agg, UI);
    const summary = K.all && c.ratings.length ? section(T('Жиынтық карта (') + c.ratings.length + T(' педагог)'),
      h('div', {class: 'grid sm:grid-cols-2 gap-3 text-sm'},
        h('div', {}, h('b', {}, T('💪 Күшті жақтары: ')), A.strong.concat(A.good).join(', ') || '—'),
        h('div', {}, h('b', {}, T('🌱 Дамыту керек: ')), A.weak.concat(A.focus).join(', ') || '—')),
      A.summary.length ? h('p', {class: 'text-sm text-charcoal/80'}, A.summary.join(' ')) : null,
      h('div', {class: 'text-xs text-charcoal/60'}, T('Бағалағандар: ') + c.ratings.map(r => r.by).join(', '))) : null;
    // сынып жетекшісінің қорытындысы және психолог бөлімі
    const cc = c.concl || {};
    let conclSec = null;
    if (K.canConcl || K.canPsych) {
      const text = h('textarea', {class: 'inp', rows: 4, placeholder: T('Баланың мінез-құлқы, қабілеті, қызығушылығы туралы жалпы қорытынды')}); text.value = cc.text || '';
      const rec = h('textarea', {class: 'inp', rows: 3, placeholder: T('Ата-анаға қосымша ұсыныс')}); rec.value = cc.rec || '';
      const ps = cc.psych || {};
      const consent = h('input', {type: 'checkbox', checked: !!ps.consent});
      const cdate = h('input', {type: 'date', class: 'inp', value: ps.consentDate || ''});
      const methods = h('input', {type: 'text', class: 'inp', placeholder: T('мысалы: бақылау, Тулуз-Пьерон, «Үй–ағаш–адам», социометрия')}); methods.value = ps.methods || '';
      const ptext = h('textarea', {class: 'inp', rows: 4, placeholder: T('Педагог-психологтың қорытындысы')}); ptext.value = ps.text || '';
      const prec = h('textarea', {class: 'inp', rows: 3, placeholder: T('Ата-анаға ұсыныс')}); prec.value = ps.rec || '';
      const psyFields = h('div', {class: 'space-y-3'}, field(T('Қолданылған әдістемелер'), methods), field(T('Қорытынды'), ptext), field(T('Ұсыныс'), prec));
      const syncConsent = () => { psyFields.hidden = !consent.checked; };
      consent.addEventListener('change', syncConsent);
      conclSec = h('div', {class: 'space-y-4'},
        K.canConcl ? section(T('Сынып жетекшісінің қорытындысы'), field(T('Қорытынды'), text), field(T('Ата-анаға ұсыныс'), rec)) : null,
        K.canPsych ? section(T('Педагог-психолог бөлімі'),
          hint(T('Психологиялық диагностика тек ата-ананың (заңды өкілдің) жазбаша келісімімен жүргізіледі (ПППС қызметі қағидалары, 12-т.). Келісім қағазы мектепте сақталады.')),
          h('div', {class: 'grid sm:grid-cols-2 gap-3 items-end'}, h('label', {class: 'flex items-center gap-2 font-semibold text-sm'}, consent, T('Ата-ананың жазбаша келісімі алынды')), field(T('Келісім күні'), cdate)),
          psyFields) : null,
        h('div', {class: 'flex justify-end'}, h('button', {type: 'button', class: 'btn btn-p', onclick: async () => {
          const data = {};
          if (K.canConcl) { data.text = text.value.trim(); data.rec = rec.value.trim(); }
          if (K.canPsych) {
            if (consent.checked && !cdate.value) { toast(T('Келісім күнін көрсетіңіз'), true); return; }
            data.psych = {consent: consent.checked, consentDate: cdate.value, methods: methods.value.trim(), text: ptext.value.trim(), rec: prec.value.trim()};
          }
          const j = await run(T('Сақталуда…'), () => api('cardConcl', {cls: F.cls, period: CARD_PERIOD, sid: st.id, data}));
          K.concl = K.concl.filter(x => x.sid !== st.id).concat([j.item]); dirty = false; toast(T('Қорытынды сақталды ✓')); showNotify(j.notify);
        }}, T('💾 Қорытындыны сақтау'))));
      syncConsent();
    }
    box.append(h('button', {type: 'button', class: 'btn btn-l btn-s mb-4', onclick: () => { if (!dirty || confirm(T('Сақталмаған өзгерістер жоғалады. Жалғастырайын ба?'))) { dirty = false; fbCards(box, F); } }}, T('← Карталар тізіміне')),
      h('div', {class: 'flex flex-wrap items-center justify-between gap-3 mb-4'},
        h('div', {}, h('h2', {class: 'text-xl font-extrabold text-emerald-950'}, st.name), h('div', {class: 'text-sm text-charcoal/60'}, F.cls + ' · ' + CARD.periodName(CARD_PERIOD, UI) + ((st.clubs || []).length ? T(' · үйірмелері: ') + st.clubs.join(', ') : ''))),
        h('div', {class: 'flex flex-wrap gap-2'}, h('button', {type: 'button', class: 'btn btn-l', onclick: () => window.CARD_PRINT(cardPrintData(F, K, st))}, T('🖨 Карта (PDF)')))),
      nav, h('div', {class: 'space-y-4 mt-4'},
        summary,
        F.write ? section(T('Менің бағам'), hint(T('Күшті және дамытуды қажет ететін жақтар осы бағалардан автоматты шығады: 4 немесе 3 (жасыл) — күшті жағы, 1 немесе 2 (сары) — дамыту керек. Әр параметрдің тұсындағы 1–4 батырмасын басыңыз; тек өзіңіз байқағанын бағалаңыз, білмейтінін бос қалдырыңыз. Қайта бассаңыз, баға алынады.')), paramRows,
          h('div', {class: 'lbl mt-3'}, T('Пәндер бойынша меңгеруі')), subjBox,
          h('div', {class: 'flex gap-2'}, newSubj, h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { addSubj(newSubj.value.trim()); newSubj.value = ''; }}, T('+ Пән'))),
          h('div', {class: 'lbl mt-3'}, T('Қызығушылықтары')), interBox, field(T('Ескерту'), note),
          h('div', {class: 'flex flex-wrap justify-end gap-2'},
            h('button', {type: 'button', class: 'btn btn-l', onclick: () => saveRating(false)}, T('💾 Сақтау')),
            i < students.length - 1 ? h('button', {type: 'button', class: 'btn btn-g', onclick: () => saveRating(true)}, T('💾 Сақтау және келесі →')) : null)) : null,
        conclSec), fbSubjectList());
  }

  // ---------- 👥 Қызметкерлерді тізіммен қосу (бас әкімші) ----------
  const ROLE_BY_WORD = [[/психолог/i, 'psych'], [/үйірме|кружк/i, 'subject'], [/сынып жетекшісі|классн/i, 'teacher'], [/пән|предмет|мұғалім|учит/i, 'subject'], [/әкімшілік|администр|қарау/i, 'viewer']];
  function usersBulk(view){
    view.innerHTML = '';
    const file = h('input', {type: 'file', accept: '.csv,.xlsx,.xls', class: 'inp'});
    const prev = h('div');
    file.addEventListener('change', async () => {
      prev.innerHTML = '';
      const f = file.files[0]; if (!f) return;
      let rows;
      try { rows = await readTable(f); } catch (e) { toast(e.message || T('Файлды оқу мүмкін болмады'), true); return; }
      const head = rows[0].map(x => String(x).toLowerCase());
      const col = re => head.findIndex(x => re.test(x));
      const ci = {name: col(/аты|фио/), login: col(/логин/), role: col(/рөл|роль/), cls: col(/сынып|класс/), subj: col(/пән|предмет/), clubs: col(/үйірме|кружк/), email: col(/gmail|email|пошта/)};
      if (ci.name < 0) { toast(T('Файлда «Аты-жөні» бағаны болуы керек'), true); return; }
      const split = v => String(v || '').split(/[,;|]/).map(x => x.trim()).filter(Boolean);
      const taken = new Set(USERS.map(u => u.login));
      const list = rows.slice(1).map(r => {
        const roleWord = String(r[ci.role] || '');
        const role = (ROLE_BY_WORD.find(([re]) => re.test(roleWord)) || [0, 'subject'])[1];
        return {name: String(r[ci.name] || '').trim(), login: String(r[ci.login] || '').trim().toLowerCase(), role,
          classes: role === 'teacher' || role === 'subject' ? split(r[ci.cls]).map(c => c.toUpperCase()) : [], subjects: split(r[ci.subj]), clubs: split(r[ci.clubs]), email: ci.email >= 0 ? String(r[ci.email] || '').trim() : ''};
      }).filter(x => x.name && x.login);
      const fresh = list.filter(x => !taken.has(x.login)), skip = list.filter(x => taken.has(x.login));
      const checks = fresh.map(() => h('input', {type: 'checkbox', checked: true}));
      prev.append(section(T('Алдын ала қарау: ') + fresh.length + T(' жаңа қызметкер') + (skip.length ? ' (' + skip.length + T(' логин бұрыннан бар — өткізіледі)') : ''),
        h('div', {class: 'space-y-1 text-sm max-h-[50vh] overflow-y-auto'}, fresh.map((x, k) => h('label', {class: 'flex gap-2 items-start border-b border-emerald-900/5 py-1'}, checks[k],
          h('span', {}, h('b', {}, x.name), ' · ', x.login, ' · ', ROLE_NAMES[x.role], x.classes.length ? ' · ' + x.classes.join(', ') : '', x.clubs.length ? ' · 🎯 ' + x.clubs.join(', ') : '')))),
        h('div', {class: 'flex justify-end'}, h('button', {type: 'button', class: 'btn btn-g', onclick: async () => {
          const chosen = fresh.filter((x, k) => checks[k].checked);
          if (!chosen.length) return;
          const creds = [];
          for (let k = 0; k < chosen.length; k++) {
            busy(T('Қосылуда: ') + (k + 1) + ' / ' + chosen.length, Math.round(k * 100 / chosen.length));
            const pw = genPw();
            try {
              const j = await api('userSave', {user: Object.assign({active: true, perms: []}, chosen[k]), newpw: pw});
              USERS = USERS.filter(u => u.id !== j.user.id).concat([j.user]); creds.push({u: j.user, pw});
            } catch (e) { toast(chosen[k].name + ': ' + e.message, true); }
          }
          done();
          bulkCreds(creds);
        }}, T('👥 Белгіленгендерді қосу')))));
    });
    view.append(h('button', {type: 'button', class: 'btn btn-l btn-s mb-4', onclick: () => go('users')}, T('← Қызметкерлер')), title(T('Қызметкерлерді тізіммен қосу')),
      h('div', {class: 'space-y-4'}, section(null,
        hint(T('CSV немесе Excel. Бағандар: Аты-жөні; Логин; Рөлі (Сынып жетекшісі / Пән мұғалімі / Үйірме жетекшісі / Педагог-психолог / Әкімшілік); Сыныптар; Пәндері; Үйірмелері; Gmail (міндетті емес). «Бастауыш сайт — жүктеу файлдары» қалтасында сабақ кестесінен дайындалған «Мұғалімдер тізімі (сайтқа жүктеу).csv» бар. Әр адамға пароль автоматты жасалады.')),
        field(T('Файл'), file)), prev));
  }
  function bulkCreds(creds, head){
    const text = c => T('Baiterek ST бастауыш мектебі сайтының мұғалім беті:\n') + SITE_URL + T('admin.html\nЛогин: ') + c.u.login + T('\nПароль: ') + c.pw + howTo(c.u);
    const all = creds.map(c => c.u.name + T(' — логин: ') + c.u.login + T(', пароль: ') + c.pw).join('\n');
    const close = modal(
      h('h3', {class: 'text-lg font-extrabold text-emerald-950'}, (head || T('✅ Қосылды: ')) + creds.length + T(' қызметкер')),
      h('p', {class: 'text-sm text-charcoal/70 mt-1'}, T('Парольдер қайта көрсетілмейді. Тізімді көшіріп алыңыз немесе әр адамға WhatsApp арқылы жіберіңіз.')),
      h('div', {class: 'mt-3 space-y-1 max-h-[55vh] overflow-y-auto'}, creds.map(c => h('div', {class: 'flex flex-wrap items-center gap-2 border-b border-emerald-900/5 py-1 text-sm'},
        h('span', {class: 'flex-1 min-w-[12rem]'}, h('b', {}, c.u.name), ' · ', c.u.login, ' · ', h('span', {class: 'font-mono'}, c.pw)),
        h('a', {class: 'btn btn-p btn-s', target: '_blank', href: 'https://wa.me/?text=' + encodeURIComponent(text(c))}, 'WhatsApp')))),
      h('div', {class: 'flex flex-wrap gap-2 justify-end mt-4'},
        credsButtons(creds),
        h('button', {type: 'button', class: 'btn btn-l', onclick: () => navigator.clipboard.writeText(all).then(() => toast(T('Көшірілді')))}, T('📋 Барлығын көшіру')),
        h('button', {type: 'button', class: 'btn btn-g', onclick: () => { if (!creds.length || confirm(T('Парольдер қайта көрсетілмейді. Excel немесе PDF түсіріп алдыңыз ба?'))) { close(); go('users', true); } }}, T('Дайын'))));
  }

  // ---------- 📤 Тізімдерді Excel / PDF етіп шығару ----------
  const fileDate = () => today().split('-').reverse().join('.');
  async function saveXlsx(filename, sheets){
    await run(T('Excel дайындалуда…'), loadXlsx);
    const wb = XLSX.utils.book_new();
    sheets.forEach(sh => {
      const ws = XLSX.utils.aoa_to_sheet(sh.rows);
      ws['!cols'] = sh.rows[0].map((_, i) => ({wch: Math.min(60, Math.max(8, ...sh.rows.map(r => String(r[i] == null ? '' : r[i]).length + 2)))}));
      XLSX.utils.book_append_sheet(wb, ws, String(sh.name).replace(/[\\/?*\[\]:]/g, '').slice(0, 31) || 'Sheet');
    });
    XLSX.writeFile(wb, filename);
  }
  const escH = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
  function printHtml(titleText, body, css){
    const w = window.open('', '_blank');
    if (!w) { toast(T('Жаңа терезе бұғатталды. Браузерде қалқымалы терезелерге (pop-up) рұқсат беріңіз.'), true); return; }
    w.document.open();
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escH(titleText) + '</title><style>' +
      '@page{size:A4;margin:12mm}body{font-family:Arial,"Segoe UI",sans-serif;color:#1A202C;margin:0;padding:16px;font-size:12px}h1{font-size:18px;color:#0F382C;margin:0 0 4px}.sub{color:#5b6b66;margin-bottom:10px}' +
      'table{width:100%;border-collapse:collapse}th,td{border:1px solid #CFE0D8;padding:5px 7px;text-align:left;vertical-align:top}th{background:#0F382C;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}tr{page-break-inside:avoid}.mono{font-family:Consolas,monospace;font-size:13px;font-weight:700}' +
      '.tb{position:sticky;top:0;text-align:center;padding:8px;background:#FBF6E7;margin:-16px -16px 14px}.tb button{font:inherit;font-weight:700;padding:8px 18px;border-radius:999px;border:0;background:#0F382C;color:#fff;cursor:pointer}@media print{.tb{display:none}body{padding:0}}' +
      (css || '') + '</style></head><body><div class="tb"><button onclick="window.print()">🖨 PDF / ' + escH(T('Басып шығару')) + '</button></div>' + body +
      '<script>window.onload=function(){setTimeout(function(){window.print();},400);};<\/script></body></html>');
    w.document.close();
  }
  // Қызметкерлердің логин-паролі
  const credRows = creds => [[T('Аты-жөні'), T('Логин'), T('Пароль'), T('Рөлі'), T('Сыныптар'), T('Пәндері / үйірмелері')]].concat(creds.map(c =>
    [c.u.name, c.u.login, c.pw || '', ROLE_NAMES[c.u.role] || c.u.role, (c.u.classes || []).join(', '), (c.u.subjects || []).concat(c.u.clubs || []).join(', ')]));
  function credsExcel(creds){ saveXlsx(T('Логиндер') + ' ' + fileDate() + '.xlsx', [{name: T('Логиндер'), rows: credRows(creds)}]); }
  function credsPdf(creds){
    const rows = credRows(creds);
    printHtml(T('Логиндер'), '<h1>Baiterek ST — ' + escH(T('қызметкерлердің кіру мәліметтері')) + '</h1><div class="sub">' + escH(SITE_URL + 'admin.html') + ' · ' + fileDate() + ' · ' + escH(T('Құпия: тек бас әкімшіге')) + '</div>' +
      '<table><tr>' + rows[0].map(x => '<th>' + escH(x) + '</th>').join('') + '</tr>' + rows.slice(1).map(r => '<tr>' + r.map((x, i) => '<td' + (i === 1 || i === 2 ? ' class="mono"' : '') + '>' + escH(x) + '</td>').join('') + '</tr>').join('') + '</table>');
  }
  const credsButtons = creds => [
    h('button', {type: 'button', class: 'btn btn-l', onclick: () => credsExcel(creds)}, T('📥 Excel')),
    h('button', {type: 'button', class: 'btn btn-l', onclick: () => credsPdf(creds)}, T('🖨 PDF'))];
  // Логиндерді шығару / жаңа пароль беру
  function usersExport(view){
    view.innerHTML = '';
    const roles = [['teacher', T('Сынып жетекшілері')], ['subject', T('Пән мұғалімдері және үйірме жетекшілері')], ['psych', T('Педагог-психологтар')], ['admin', T('Әкімшілер')], ['viewer', T('Әкімшілік мүшелері (тек қарау)')]];
    const checks = new Map();
    const list = h('div', {class: 'space-y-4'}, roles.map(([role, name]) => {
      const us = USERS.filter(u => u.role === role && u.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'kk'));
      if (!us.length) return null;
      const all = h('input', {type: 'checkbox', checked: true});
      const rows = us.map(u => { const c = h('input', {type: 'checkbox', checked: true}); checks.set(u.id, c); return h('label', {class: 'flex items-center gap-2 text-sm border-b border-emerald-900/5 py-1'}, c, h('b', {}, u.name), ' · ', u.login, (u.classes || []).length ? ' · ' + u.classes.join(', ') : ''); });
      all.addEventListener('change', () => us.forEach(u => { checks.get(u.id).checked = all.checked; }));
      return section(null, h('label', {class: 'flex items-center gap-2 font-extrabold text-emerald-950'}, all, name + ' (' + us.length + ')'), h('div', {}, rows));
    }));
    const chosen = () => USERS.filter(u => checks.get(u.id) && checks.get(u.id).checked);
    view.append(h('button', {type: 'button', class: 'btn btn-l btn-s mb-4', onclick: () => go('users')}, T('← Қызметкерлер')), title(T('Логиндер мен парольдерді шығару')),
      hint(T('Парольдер қауіпсіздік үшін шифрланып сақталады, сондықтан бұрынғы парольді ешкім көре алмайды. Белгіленген адамдарға жаңа пароль беріліп, тізім Excel немесе PDF болып шығады. Бұрынғы пароль жұмыс істемей қалады — адамдар әлі кірмеген болса, бұл қиындық тудырмайды.')),
      h('div', {class: 'flex flex-wrap gap-2 my-4'},
        h('button', {type: 'button', class: 'btn btn-g', onclick: async () => {
          const us = chosen();
          if (!us.length) { toast(T('Ешкім белгіленбеген'), true); return; }
          if (!confirm(us.length + T(' адамның паролі жаңасына ауысады, бұрынғы пароль жұмыс істемей қалады. Жалғастырайын ба?'))) return;
          const creds = [];
          for (let k = 0; k < us.length; k++) {
            busy(T('Жаңа пароль: ') + (k + 1) + ' / ' + us.length, Math.round(k * 100 / us.length));
            const pw = genPw();
            try { const j = await api('userSave', {user: us[k], newpw: pw}); USERS = USERS.filter(x => x.id !== j.user.id).concat([j.user]); creds.push({u: j.user, pw}); }
            catch (e) { toast(us[k].name + ': ' + T(e.message), true); }
          }
          done();
          bulkCreds(creds, T('🔑 Жаңа пароль берілді: '));
        }}, T('🔑 Белгіленгендерге жаңа пароль беріп, тізімді шығару')),
        h('button', {type: 'button', class: 'btn btn-l', onclick: () => credsExcel(chosen().map(u => ({u, pw: ''})))}, T('📥 Тек логиндер (Excel, парольсіз)'))),
      list);
  }
  // Балалардың жеке кодтары: Excel және ата-аналарға қиып таратуға арналған PDF
  const codeLink = st => SITE_URL + '#c=' + st.code;
  function codesExcel(groups){
    saveXlsx(T('Балалардың кодтары') + ' ' + fileDate() + '.xlsx', groups.map(g => ({name: g.cls, rows: [[T('Сынып'), T('Аты-жөні'), T('Жеке код'), T('Сілтеме')]].concat(
      g.students.slice().sort((a, b) => a.name.localeCompare(b.name, 'kk')).map(st => [g.cls, st.name, st.code, codeLink(st)]))})));
  }
  function codesPdf(groups){
    const slip = (cls, st) => '<div class="slip"><div class="sch">Baiterek ST · «Сыныбым / Мой класс»</div><div class="nm">' + escH(st.name) + '</div><div class="cl">' + escH(cls) + '</div>' +
      '<div class="cd">' + escH(st.code) + '</div><div class="lk">' + escH(codeLink(st)) + '</div>' +
      '<div class="tx">Сайттағы «Сыныбым» бөліміне кодты енгізіңіз немесе сілтемені ашыңыз. Кодты басқа адамдарға бермеңіз.<br>Введите код в разделе «Мой класс» на сайте или откройте ссылку. Не передавайте код другим.</div></div>';
    printHtml(T('Балалардың кодтары'), groups.map(g => '<h1>' + escH(g.cls) + ' · ' + escH(T('балалардың жеке кодтары')) + '</h1><div class="grid">' +
      g.students.slice().sort((a, b) => a.name.localeCompare(b.name, 'kk')).map(st => slip(g.cls, st)).join('') + '</div>').join('<div class="pb"></div>'),
      '.grid{display:grid;grid-template-columns:1fr 1fr;gap:0}.slip{border:1px dashed #9FBFB2;padding:10px 12px;page-break-inside:avoid}.sch{font-size:10px;font-weight:800;color:#B8952A;text-transform:uppercase;letter-spacing:.04em}' +
      '.nm{font-size:14px;font-weight:800;color:#0F382C;margin-top:3px}.cl{font-size:11px;color:#5b6b66}.cd{font-family:Consolas,monospace;font-size:22px;font-weight:800;letter-spacing:.18em;margin:4px 0;color:#0F382C}.lk{font-size:9.5px;color:#5b6b66;word-break:break-all}.tx{font-size:9.5px;margin-top:4px;line-height:1.35}' +
      '.pb{page-break-after:always;height:0}h1{margin-top:6px}');
  }
  const codesButtons = groups => [
    h('button', {type: 'button', class: 'btn btn-l', onclick: () => codesExcel(groups())}, T('📥 Excel')),
    h('button', {type: 'button', class: 'btn btn-l', onclick: () => codesPdf(groups())}, T('🖨 PDF (қиып таратуға)'))];
  // Бас әкімші: барлық сыныптың кодтары (әр сыныпты кезекпен жүктейді)
  async function allCodesExport(kind){
    const classes = allClasses(), groups = [];
    for (let k = 0; k < classes.length; k++) {
      busy(T('Сыныптар жүктелуде: ') + (k + 1) + ' / ' + classes.length, Math.round(k * 100 / classes.length));
      try { if (!FBC[classes[k]]) FBC[classes[k]] = await api('fbList', {cls: classes[k]}); } catch (e) { continue; }
      const st = (FBC[classes[k]].students || []).filter(s => s.code);
      if (st.length) groups.push({cls: classes[k], students: st});
    }
    done();
    if (!groups.length) { toast(T('Оқушылар тізімі әлі жүктелмеген'), true); return; }
    kind === 'pdf' ? codesPdf(groups) : codesExcel(groups);
  }

  // ---------- 🔔 Ата-аналарға хабарлама ----------
  // Сақтағаннан кейін: Telegram мен email автоматты кетті, WhatsApp — мұғалім батырмамен жібереді
  function showNotify(n){
    if (!n) return;
    const auto = (n.tg ? '✈️ Telegram: ' + n.tg : '') + (n.tg && n.email ? ' · ' : '') + (n.email ? '✉️ Email: ' + n.email : '');
    if (!(n.wa || []).length) { if (auto) toast(T('🔔 Хабарлама жіберілді — ') + auto); return; }
    const sent = new Set();
    const rows = n.wa.map((x, i) => {
      const b = h('a', {class: 'btn btn-p btn-s', target: '_blank', href: 'https://wa.me/' + x.phone + '?text=' + encodeURIComponent(x.text),
        onclick: () => { sent.add(i); b.textContent = '✓ ' + T('Жіберілді'); b.className = 'btn btn-l btn-s'; count.textContent = sent.size + ' / ' + n.wa.length; }}, '💬 WhatsApp');
      return h('div', {class: 'flex flex-wrap items-center gap-2 border-b border-emerald-900/5 py-1.5 text-sm'},
        h('span', {class: 'flex-1 min-w-[12rem]'}, h('b', {}, x.name), x.child ? ' · ' + x.child : '', h('span', {class: 'text-charcoal/55'}, ' · +' + x.phone)), b);
    });
    const count = h('span', {class: 'font-bold text-emerald-900'}, '0 / ' + n.wa.length);
    const close = modal(
      h('h3', {class: 'text-lg font-extrabold text-emerald-950'}, T('🔔 Ата-аналарға хабарлау')),
      auto ? h('p', {class: 'text-sm text-emerald-800 font-semibold mt-1'}, T('Автоматты жіберілді: ') + auto) : null,
      h('p', {class: 'text-sm text-charcoal/70 mt-1'}, T('Бұл ата-аналар хабарламаны WhatsApp арқылы алуды таңдаған. Әр батырманы басыңыз — WhatsApp дайын мәтінмен ашылады, «Жіберу» басасыз.')),
      h('div', {class: 'mt-2 text-sm'}, T('Жіберілді: '), count),
      h('div', {class: 'mt-2 max-h-[55vh] overflow-y-auto'}, rows),
      h('div', {class: 'flex justify-end mt-4'}, h('button', {type: 'button', class: 'btn btn-g', onclick: () => close()}, T('Дайын'))));
  }
  const CH_ICONS = p => [(p.ch || {}).wa ? '💬' : '', p.tg ? '✈️' : ((p.ch || {}).tg ? '✈️?' : ''), (p.ch || {}).email && p.email ? '✉️' : ''].filter(Boolean).join(' ');
  function parentsExcel(list, name){
    saveXlsx(name + ' ' + fileDate() + '.xlsx', [{name: T('Ата-аналар'), rows: [[T('Сынып'), T('Бала'), T('Ата-ана'), T('Телефон'), 'Email', 'WhatsApp', 'Telegram', T('Тіркелген күні')]].concat(
      list.map(p => [p.cls, p.child || '—', p.name, '+' + p.phone, p.email, (p.ch || {}).wa ? '✓' : '', p.tg ? '✓' : ((p.ch || {}).tg ? T('қосылмаған') : ''), p.ts ? fmtTs(p.ts) : '']))}]);
  }
  // Сынып жетекшісі: тіркелген ата-аналар
  async function fbParents(box, F){
    box.innerHTML = '';
    box.append(fbBack(), h('p', {class: 'text-charcoal/60'}, T('Жүктелуде…')));
    let j;
    try { j = await api('parents', {cls: F.cls}); } catch (e) { box.lastChild.textContent = T(e.message); return; }
    if (!box.isConnected) return;
    box.innerHTML = '';
    const list = j.parents.sort((a, b) => (a.child || '').localeCompare(b.child || '', 'kk'));
    const without = F.students.filter(st => !list.some(p => p.child === st.name));
    box.append(fbBack(), h('div', {class: 'flex flex-wrap items-center justify-between gap-3 mb-3'},
        h('h2', {class: 'text-xl font-extrabold text-emerald-950'}, T('👨‍👩‍👧 Тіркелген ата-аналар · ') + F.cls + ' (' + list.length + ')'),
        list.length ? h('button', {type: 'button', class: 'btn btn-l', onclick: () => parentsExcel(list, F.cls + T(' ата-аналары'))}, '📥 Excel') : null),
      hint(T('Ата-ана сайттағы «Сыныбым → 🔔 Хабарлама» бөлімінде баланың жеке кодымен тіркеледі. Белгілер: 💬 WhatsApp, ✈️ Telegram (✈️? — таңдаған, бірақ әлі қосылмаған), ✉️ Email.')),
      list.length ? h('div', {class: 'space-y-2 mt-4'}, list.map(p => h('div', {class: 'card flex flex-wrap items-center gap-3', style: 'padding:.75rem 1rem'},
        h('div', {class: 'flex-1 min-w-[14rem]'}, h('div', {class: 'font-bold text-emerald-950'}, (p.child || T('(сынып коды)')) + ' — ' + p.name),
          h('div', {class: 'text-xs text-charcoal/65'}, '+' + p.phone + (p.email ? ' · ' + p.email : '') + ' · ' + CH_ICONS(p))),
        h('a', {class: 'btn btn-l btn-s', target: '_blank', href: 'https://wa.me/' + p.phone}, '💬'),
        h('button', {type: 'button', class: 'btn btn-d btn-s', onclick: async () => {
          if (!confirm(p.name + T(': тіркелуі өшірілсін бе? Ол бұдан былай хабарлама алмайды.'))) return;
          await run(T('Өшірілуде…'), () => api('parentDel', {id: p.id})); fbParents(box, F);
        }}, '✕')))) : h('p', {class: 'card text-charcoal/60 mt-4'}, T('Әзірге ешкім тіркелмеген.')),
      without.length && list.length ? section(T('Әлі тіркелмеген балалардың ата-аналары (') + without.length + ')', h('p', {class: 'text-sm text-charcoal/70'}, without.map(s => s.name).join(', '))) : null);
  }
  // Бас әкімші: хабарлама баптаулары (⚙ Баптаулар ішінде)
  function notifySection(){
    const box = h('div', {class: 'space-y-3'}, h('p', {class: 'text-sm text-charcoal/60'}, T('Жүктелуде…')));
    const render = info => {
      box.innerHTML = '';
      const tok = h('input', {class: 'inp font-mono', type: 'text', placeholder: '123456789:AAH…'});
      box.append(
        h('div', {class: 'grid sm:grid-cols-4 gap-2 text-sm'}, [[T('Тіркелген'), info.total], ['💬 WhatsApp', info.wa], ['✈️ Telegram', info.tg], ['✉️ Email', info.email]].map(([k, v]) =>
          h('div', {class: 'rounded-xl bg-emerald-50 p-3'}, h('div', {class: 'text-xs text-charcoal/60'}, k), h('div', {class: 'text-xl font-extrabold text-emerald-950'}, v)))),
        h('div', {class: 'text-sm'}, h('b', {}, 'Telegram: '), info.tgName ? h('a', {href: 'https://t.me/' + info.tgName, target: '_blank', class: 'underline'}, '@' + info.tgName) : T('әлі қосылмаған')),
        hint(T('Telegram бот қосу: Telegram-да @BotFather ашып, /newbot жазыңыз, ботқа ат беріңіз (мысалы: Baiterek ата-аналар). BotFather берген токенді (123456789:AA… түрінде) төмендегі өріске қойып, «Сақтау» басыңыз. Бұл бот тек ата-аналарға хабарлама жібереді; басқа боттарыңызға әсер етпейді.')),
        h('div', {class: 'flex flex-wrap gap-2'}, h('div', {class: 'flex-1 min-w-[16rem]'}, tok),
          h('button', {type: 'button', class: 'btn btn-p', onclick: async () => {
            if (!tok.value.trim()) { toast(T('Токенді қойыңыз'), true); return; }
            render(await run(T('Тексерілуде…'), () => api('notifySet', {tgToken: tok.value.trim()}))); toast(T('Telegram бот қосылды ✓'));
          }}, T('💾 Сақтау')),
          info.tgName ? h('button', {type: 'button', class: 'btn btn-d', onclick: async () => {
            if (!confirm(T('Telegram хабарламалары тоқтатылсын ба?'))) return;
            render(await run(T('Сақталуда…'), () => api('notifySet', {tgToken: ''})));
          }}, T('Өшіру')) : null),
        h('div', {class: 'text-sm'}, h('b', {}, 'Email: '), info.mailQuota >= 0 ? T('бүгін тағы ') + info.mailQuota + T(' хат жіберуге болады (Gmail шегі)') :
          T('әлі рұқсат берілмеген — Apps Script редакторында setupNotify функциясын бір рет іске қосыңыз')),
        info.total ? h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: async () => {
          const j = await run(T('Жүктелуде…'), () => api('parents', {})); parentsExcel(j.parents, T('Барлық ата-аналар'));
        }}, T('📥 Барлық тіркелген ата-аналар (Excel)')) : null);
    };
    api('notifyInfo').then(render).catch(e => { box.innerHTML = ''; box.append(h('p', {class: 'text-sm text-red-700'}, T(e.message) + T(' (серверді жаңарту керек болуы мүмкін)'))); });
    return section(T('🔔 Ата-аналарға хабарламалар'), box);
  }

  // ---------- 🔑 Ата-ана кодтары ----------
  VIEWS.codes = function(view){
    const list = isOwner() ? allClasses() : (ME.classes || []);
    view.append(title(T('Ата-ана кодтары')),
      hint(T('Әр сыныптың өз коды бар. Кодты сыныптың ата-аналарына WhatsApp арқылы жіберіңіз: олар сайттағы «Сыныбым» бөліміне кіріп, тек өз сыныбының үй тапсырмасын, фотоларын және сұрақ-жауабын көреді. Код басқа адамдарға тарап кетсе, «Жаңа код» басыңыз — ескі код жұмыс істемей қалады.')));
    view.append(h('div', {class: 'grid sm:grid-cols-2 gap-3 mt-4'}, list.map(c => {
      const code = (CLS.codes || {})[c];
      const link = code ? SITE_URL + '#c=' + code : '';
      const msg = code ? 'Құрметті ата-аналар! ' + c + ' сыныбының сайттағы жеке беті: ' + link + '\nСынып коды: ' + code + '\n\nУважаемые родители! Страница ' + c + ' класса на сайте: ' + link + '\nКод класса: ' + code : '';
      return h('div', {class: 'card space-y-3'},
        h('div', {class: 'flex items-center justify-between'}, h('div', {class: 'text-lg font-extrabold text-emerald-950'}, c + T(' сынып')),
          code ? h('div', {class: 'font-mono text-xl font-extrabold tracking-widest text-gold-600'}, code) : h('span', {class: 'text-sm text-charcoal/60'}, T('Код жоқ'))),
        code ? h('div', {class: 'text-xs text-charcoal/60 break-all'}, link) : null,
        h('div', {class: 'flex flex-wrap gap-2'},
          code ? h('a', {class: 'btn btn-p btn-s', target: '_blank', href: 'https://wa.me/?text=' + encodeURIComponent(msg)}, T('WhatsApp-қа жіберу')) : null,
          code ? h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { navigator.clipboard.writeText(msg).then(() => toast(T('Көшірілді'))); }}, T('Көшіру')) : null,
          h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: async () => {
            if (code && !confirm(T('Жаңа код жасалса, ескі код (') + code + T(') жұмыс істемей қалады. Жалғастырайын ба?'))) return;
            const j = await run(T('Код жасалуда…'), () => api('code', {cls: c}));
            CLS.codes = CLS.codes || {}; CLS.codes[c] = j.code; go('codes', true);
          }}, code ? T('🔄 Жаңа код') : T('➕ Код жасау'))));
    })));
  };

  // ---------- 👤 Қызметкерлер (тек бас әкімші) ----------
  function genPw(){ const s = 'abcdefghjkmnpqrstuvwxyz23456789'; let p = ''; const r = crypto.getRandomValues(new Uint32Array(8)); r.forEach(n => { p += s[n % s.length]; }); return p; }
  VIEWS.users = function(view){
    view.append(h('div', {class: 'flex flex-wrap items-center justify-between gap-3 mb-4'},
      h('h1', {class: 'text-2xl font-extrabold text-emerald-950'}, T('Қызметкерлер')),
      h('div', {class: 'flex flex-wrap gap-2'}, h('button', {type: 'button', class: 'btn btn-l', onclick: () => usersExport(view)}, T('📤 Логиндер мен парольдер (Excel / PDF)')),
        h('button', {type: 'button', class: 'btn btn-l', onclick: () => usersBulk(view)}, T('📥 Тізіммен қосу')),
        h('button', {type: 'button', class: 'btn btn-g', onclick: () => userEditor(view, null)}, T('+ Қызметкер қосу')))));
    view.append(hint(T('Сынып жетекшілері өз сыныбын, әкімшілер өзіңіз белгілеген бөлімдерді ғана басқарады. Әкімшілік мүшелері барлық сыныптың жазбаларын тек қарайды. Пән мұғалімдері мен үйірме жетекшілері тек «Кері байланыс» бөлімінде өз сыныптарының (үйірмесінің) оқушыларына жазады, педагог-психолог барлық сыныптың даму картасын көреді. Email (Gmail) жазылса, адамға Google Drive-тағы «Бастауыш-Началка» ішінен тек өз қалтасына қолжетімділік беріледі.')));
    if (INFO.classFolder) view.append(h('div', {class: 'my-3'}, h('a', {href: INFO.classFolder, target: '_blank', class: 'btn btn-l btn-s'}, T('📁 «Бастауыш-Началка» қалтасын ашу ↗'))));
    const groups = [['teacher', T('Сынып жетекшілері')], ['subject', T('Пән мұғалімдері және үйірме жетекшілері')], ['psych', T('Педагог-психологтар')], ['admin', T('Әкімшілер')], ['viewer', T('Әкімшілік мүшелері (тек қарау)')]];
    groups.forEach(([role, name]) => {
      const list = USERS.filter(u => u.role === role).sort((a, b) => ((a.classes || [])[0] || a.name) < ((b.classes || [])[0] || b.name) ? -1 : 1);
      view.append(section(name + ' (' + list.length + ')', list.length ? h('div', {class: 'space-y-2'}, list.map(u => h('div', {class: 'flex gap-3 items-center rounded-2xl border border-emerald-900/10 p-3' + (u.active ? '' : ' opacity-50')},
        h('div', {class: 'flex-1 min-w-0'},
          h('div', {class: 'font-bold text-emerald-950'}, u.name + (u.active ? '' : T(' (өшірулі)'))),
          h('div', {class: 'text-xs text-charcoal/65'}, T('Логин: ') + u.login + (u.classes.length ? T(' · Сынып: ') + u.classes.join(', ') : '') + ((u.subjects || []).length ? T(' · Пәні: ') + u.subjects.join(', ') : '') + ((u.clubs || []).length ? ' · 🎯 ' + u.clubs.join(', ') : '') + (u.perms.length ? ' · ' + u.perms.map(p => PERM_NAMES[p]).join(', ') : '') + (u.email ? ' · ' + u.email : ''))),
        h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => userEditor(view, u)}, T('Өзгерту'))))) : h('p', {class: 'text-charcoal/60 text-sm'}, T('Әзірге жоқ.'))));
    });
  };
  function userEditor(view, u){
    dirty = false;
    const isNew = !u;
    u = u ? clone(u) : {role: 'teacher', classes: [], perms: [], subjects: [], clubs: [], active: true};
    view.innerHTML = '';
    const name = h('input', {class: 'inp', type: 'text'}); name.value = u.name || '';
    const login = h('input', {class: 'inp', type: 'text', autocapitalize: 'none', spellcheck: 'false'}); login.value = u.login || '';
    const email = h('input', {class: 'inp', type: 'email', placeholder: 'mysaly@gmail.com'}); email.value = u.email || '';
    const role = h('select', {class: 'inp'}, ['teacher', 'subject', 'psych', 'admin', 'viewer'].map(r => h('option', {value: r}, ROLE_NAMES[r])));
    role.value = u.role;
    const active = h('input', {type: 'checkbox', checked: u.active !== false});
    const pw = h('input', {class: 'inp font-mono', type: 'text', placeholder: isNew ? '' : T('Өзгертпесеңіз бос қалдырыңыз')});
    if (isNew) pw.value = genPw();
    const cls = classPicker(u.classes, allClasses(), false);
    const perms = {};
    const permBox = h('div', {class: 'grid sm:grid-cols-2 gap-2'}, Object.entries(PERM_NAMES).map(([k, v]) => {
      perms[k] = h('input', {type: 'checkbox', checked: (u.perms || []).includes(k)});
      return h('label', {class: 'flex items-center gap-2 text-sm font-semibold rounded-xl border border-emerald-900/10 px-3 py-2'}, perms[k], v);
    }));
    const clsNote = h('p', {class: 'text-sm text-charcoal/65'});
    const subjects = h('input', {class: 'inp', type: 'text', placeholder: T('мысалы: Математика, Математика (қосымша)')}); subjects.value = (u.subjects || []).join(', ');
    const clubsInp = h('input', {class: 'inp', type: 'text', placeholder: T('мысалы: Шахматы, Робототехника')}); clubsInp.value = (u.clubs || []).join(', ');
    const clsSec = section(T('Сыныптары'), clsNote, cls.el, field(T('Пәндері (үтір арқылы; «Кері байланыс» жазғанда өзі шығады)'), subjects),
      field(T('Үйірмелері (үйірме жетекшісі болса; үйірме атауы оқушылар тізіміндегідей)'), clubsInp));
    const permSec = section(T('Қай бөлімдерді басқарады'), permBox);
    const fbView = h('input', {type: 'checkbox', checked: (u.perms || []).includes('feedback')});
    const viewSec = section(T('Қосымша құқық'), h('label', {class: 'flex items-center gap-2 text-sm font-semibold'}, fbView, T('📝 Барлық сыныптың кері байланысын көру (оқушыларға мұғалімдер жазған пікірлер)')));
    const syncRole = () => {
      const r = role.value;
      clsSec.hidden = r !== 'teacher' && r !== 'subject'; permSec.hidden = r !== 'admin'; viewSec.hidden = r !== 'viewer';
      clsNote.textContent = r === 'subject' ? T('Пән мұғалімі тек осы сыныптардың оқушыларына кері байланыс жазып, даму картасына баға қояды және тек өз жазғанын көреді. Үйірме жетекшісі үшін сыныпты таңдамай, тек үйірмесін жазуға болады.')
        : T('Сынып жетекшісі тек осы сыныптардың жазбаларын, үй тапсырмасын, ата-ана сұрақтарын, Drive қалтасын және оқушылар тізімін басқарады, кері байланыс жаза алады.');
    };
    role.addEventListener('change', syncRole);
    name.addEventListener('input', () => { if (isNew && !login.dataset.touched) { const c = cls.get()[0]; login.value = c ? c.toLowerCase() : ''; } });
    login.addEventListener('input', () => { login.dataset.touched = '1'; });
    view.append(
      h('button', {type: 'button', class: 'btn btn-l btn-s mb-4', onclick: () => go('users')}, T('← Тізімге қайту')),
      h('div', {class: 'space-y-4'},
        section(isNew ? T('Жаңа қызметкер') : u.name,
          h('div', {class: 'grid sm:grid-cols-2 gap-3'},
            field(T('Аты-жөні *'), name), field(T('Рөлі'), role),
            field(T('Логин * (латынша, мысалы: 1a немесе aigul)'), login), field(T('Gmail (Drive қалтасына қолжетімділік үшін)'), email),
            field(isNew ? T('Пароль *') : T('Жаңа пароль'), h('div', {class: 'flex gap-2'}, pw, h('button', {type: 'button', class: 'btn btn-l btn-s', onclick: () => { pw.value = genPw(); dirty = true; }}, '🎲')))),
          h('label', {class: 'flex items-center gap-2 font-semibold text-sm'}, active, T('Белсенді (өшірсеңіз, сайтқа кіре алмайды және Drive қолжетімділігі алынады)'))),
        clsSec, permSec, viewSec,
        saveBar(T('Сақтау'), async () => {
          const rec = {id: u.id, name: name.value.trim(), login: login.value.trim().toLowerCase(), email: email.value.trim(), role: role.value, active: active.checked,
            classes: (role.value === 'teacher' || role.value === 'subject') ? cls.get() : [],
            subjects: (role.value === 'teacher' || role.value === 'subject') ? subjects.value.split(',').map(x => x.trim()).filter(Boolean) : [],
            clubs: (role.value === 'teacher' || role.value === 'subject') ? clubsInp.value.split(',').map(x => x.trim()).filter(Boolean) : [],
            perms: role.value === 'admin' ? Object.keys(perms).filter(k => perms[k].checked) : role.value === 'viewer' && fbView.checked ? ['feedback'] : []};
          if (!rec.name || !rec.login) { toast(T('Аты-жөні мен логинін жазыңыз'), true); return; }
          if (rec.role === 'teacher' && !rec.classes.length) { toast(T('Сыныбын таңдаңыз'), true); return; }
          if (rec.role === 'subject' && !rec.classes.length && !rec.clubs.length) { toast(T('Сыныбын немесе үйірмесін көрсетіңіз'), true); return; }
          const newpw = pw.value.trim();
          const j = await run(T('Сақталуда…'), () => api('userSave', {user: rec, newpw: newpw || null}));
          USERS = USERS.filter(x => x.id !== j.user.id).concat([j.user]);
          dirty = false;
          if (j.warn && j.warn.length) toast(T('Drive қолжетімділігі берілмеді: ') + j.warn.join('; '), true);
          if (newpw) showCreds(j.user, newpw); else { savedToast(); go('users', true); }
        }, !isNew ? h('button', {type: 'button', class: 'btn btn-d', onclick: async () => {
          if (!confirm(u.name + T(' толық өшірілсін бе? (Уақытша тоқтату үшін «Белсенді» белгісін алып тастаған дұрыс)'))) return;
          await run(T('Өшірілуде…'), () => api('userDel', {id: u.id}));
          USERS = USERS.filter(x => x.id !== u.id); go('users', true);
        }}, T('Өшіру')) : null)));
    syncRole();
    view.oninput = () => { dirty = true; };
  }
  // Логинмен бірге жіберілетін қысқа нұсқаулық (рөліне қарай)
  function howTo(u){
    const fb = T('\n\n📝 Кері байланыс: «📝 Кері байланыс» бөлімінде сыныпты таңдап, оқушыны басып «+ Жаңа жазба» немесе «✍️ Бүкіл сыныпқа жазу» арқылы пәніңіз бойынша жазасыз (сабақ оқуы, тәртібі, ынтасы + ата-анаға ұсыныс). Жазбаңызды тек сіз, сол баланың ата-анасы және мектеп әкімшілігі көреді.') +
      T('\n📊 Даму картасы: сол бөлімде «📊 Даму картасы» → оқушыны таңдап, өзіңіз байқаған параметрлерді 1–4 деңгеймен бағалайсыз (4 — жоғары, 1 — қолдау қажет).');
    if (u.role === 'subject' && (u.clubs || []).length && !(u.classes || []).length) return T('\n\n🎯 Кері байланыс: «📝 Кері байланыс» бөлімінде «🎯 ') + u.clubs[0] + T('» батырмасын басып, «✍️ Үйірме балаларына жазу» арқылы әр балаға жазасыз. Жазбаңызды тек сіз, баланың ата-анасы және мектеп әкімшілігі көреді.');
    if (u.role === 'subject') return fb;
    if (u.role === 'teacher') return fb + T('\n👧 Сынып жетекшісі ретінде «🔑 Балалардың кодтары» батырмасымен әр ата-анаға баланың жеке кодын WhatsApp арқылы жібересіз және картаға өз қорытындыңызды жазасыз.');
    if (u.role === 'psych') return T('\n\n🧠 Педагог-психолог: «📝 Кері байланыс» → сынып → «📊 Даму картасы» → оқушы. Психолог бөлімін тек ата-ананың жазбаша келісімі алынғаннан кейін толтырасыз (келісім күнін көрсетіп). Барлық ата-анаға арналған жалпы кеңесті «🏫 Сынып жаңалықтары» бөліміне жазасыз — онда нақты баланың атын жазуға болмайды.');
    return '';
  }
  function showCreds(u, pw){
    const msg = T('Baiterek ST бастауыш мектебі сайтының әкімші беті:\n') + SITE_URL + T('admin.html\nЛогин: ') + u.login + T('\nПароль: ') + pw + howTo(u) +
      (u.email && u.role !== 'viewer' ? T('\n\nGoogle Drive-та сізге фото/видео жүктеуге арналған қалта ашылды (') + u.email + T(' поштасына хабарлама келеді).') : '');
    const close = modal(
      h('h3', {class: 'text-lg font-extrabold text-emerald-950'}, T('✅ Сақталды: ') + u.name),
      h('p', {class: 'text-sm text-charcoal/70 mt-1'}, T('Кіру мәліметтерін қызметкерге жіберіңіз. Пароль қайта көрсетілмейді (керек болса, жаңасын орнатасыз).')),
      h('pre', {class: 'mt-3 rounded-xl bg-emerald-50 p-3 text-sm whitespace-pre-wrap'}, msg),
      h('div', {class: 'flex flex-wrap gap-2 justify-end mt-4'},
        h('button', {type: 'button', class: 'btn btn-l', onclick: () => navigator.clipboard.writeText(msg).then(() => toast(T('Көшірілді')))}, T('Көшіру')),
        h('a', {class: 'btn btn-p', target: '_blank', href: 'https://wa.me/?text=' + encodeURIComponent(msg)}, T('WhatsApp-қа жіберу')),
        h('button', {type: 'button', class: 'btn btn-g', onclick: () => { close(); go('users', true); }}, T('Дайын'))));
  }

  // ---------- 📜 Журнал ----------
  VIEWS.log = async function(view){
    view.append(title(T('Журнал: кім не жазды')));
    const box = h('div', {class: 'space-y-2'}, h('p', {class: 'text-charcoal/60'}, T('Жүктелуде…')));
    view.append(box);
    let items;
    try { items = (await api('log')).log.slice().reverse(); } catch (e) { box.innerHTML = ''; box.append(h('p', {class: 'text-red-700'}, e.message)); return; }
    const who = h('select', {class: 'inp'}, h('option', {value: ''}, T('Барлық адамдар')), [...new Set(items.map(x => x.by))].sort().map(n => h('option', {value: n}, n)));
    const cl = h('select', {class: 'inp'}, h('option', {value: ''}, T('Барлық сыныптар')), allClasses().map(c => h('option', {value: c}, c)));
    const q = h('input', {class: 'inp', type: 'search', placeholder: T('🔎 Іздеу…')});
    const render = () => {
      box.innerHTML = '';
      const list = items.filter(x => (!who.value || x.by === who.value) && (!cl.value || (x.cls || '').split(', ').includes(cl.value)) &&
        (!q.value.trim() || (x.action + ' ' + x.text + ' ' + x.by).toLowerCase().includes(q.value.trim().toLowerCase()))).slice(0, 300);
      if (!list.length) { box.append(h('p', {class: 'text-charcoal/60'}, T('Жазба жоқ.'))); return; }
      list.forEach(x => box.append(h('div', {class: 'card', style: 'padding:.8rem 1rem'},
        h('div', {class: 'text-xs font-bold text-charcoal/60'}, fmtTs(x.ts) + ' · ' + x.by + (x.cls ? ' · ' + x.cls + T(' сынып') : '')),
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
    const person = p => { const name = h('input', {class: 'inp', type: 'text', placeholder: T('Аты-жөні')}); name.value = p.name || ''; const role = mlField(T('Лауазымы'), p.role);
      return {el: h('div', {class: 'space-y-3'}, field(T('Аты-жөні'), name), role.el), get: () => ({name: name.value.trim(), role: role.get()})}; };
    const namesText = names => (names || []).map(n => typeof n === 'object' ? n.name + ' — ' + L(n.note) : n).join('\n');
    const parseNames = (txt, old) => txt.split('\n').map(s => s.trim()).filter(Boolean).map(s => {
      const o = (old || []).find(n => typeof n === 'object' && (n.name + ' — ' + L(n.note)) === s);
      return o || s;
    });
    const group = g => { const label = mlField(T('Топ атауы'), g.label); const ta = h('textarea', {class: 'inp', rows: 5}); ta.value = namesText(g.names);
      return {el: h('div', {class: 'space-y-3'}, label.el, field(T('Тізім (әр адам жаңа жолда)'), ta)), get: () => ({label: label.get(), names: parseNames(ta.value, g.names)})}; };
    const mo = m => { const label = mlField(T('Бірлестік атауы'), m.label); const head = h('input', {class: 'inp', type: 'text'}); head.value = m.head || '';
      return {el: h('div', {class: 'space-y-3'}, label.el, field(T('Жетекшісі'), head)), get: () => ({label: label.get(), head: head.value.trim()})}; };
    const ed = {
      leadership: listEditor(S.leadership, person, () => ({name: '', role: {}}), T('Адам қосу')),
      mo: listEditor(S.mo, mo, () => ({label: {}, head: ''}), T('Бірлестік қосу')),
      specialists: listEditor(S.specialists, group, () => ({label: {}, names: []}), T('Топ қосу')),
      preschool: listEditor(S.preschool, group, () => ({label: {}, names: []}), T('Топ қосу')),
      teachers: listEditor(S.teachers, group, () => ({label: {}, names: []}), T('Топ қосу')),
      support: listEditor(S.support, person, () => ({name: '', role: {}}), T('Адам қосу'))
    };
    view.append(title(T('Ұжым')), h('div', {class: 'space-y-4'},
      hint(T('Пән мұғалімдері тізімінде ескертпені сызықшамен жазуға болады: «Аты-жөні — хореограф». ') + AUTO_HINT),
      section(T('Әкімшілік құрамы'), ed.leadership.el),
      section(T('Әдістемелік бірлестіктер'), ed.mo.el),
      section(T('Қолдау қызметі мамандары'), ed.specialists.el),
      section(T('Мектепке дейінгі дайындық тобы'), ed.preschool.el),
      section(T('Пән мұғалімдері'), ed.teachers.el),
      section(T('Қосымша қызметкерлер'), ed.support.el),
      saveBar(T('Ұжымды сақтау'), async () => {
        const staff = {};
        Object.keys(ed).forEach(k => { staff[k] = ed[k].get(); });
        const j = await run(T('Сақталуда…'), () => api('set', {values: {staff}}));
        DATA.staff = j.values.staff; savedToast(); go('team', true);
      })));
  };

  // ---------- ❓ Ата-анаға ақпарат ----------
  VIEWS.faq = function(view){
    const groups = clone(get('faq'));
    const item = it => { const q = mlField(T('Сұрақ'), it.q); const a = mlField(T('Жауап'), it.a, {rich: true}); return {el: h('div', {class: 'space-y-3'}, q.el, a.el), get: () => ({q: q.get(), a: a.get()})}; };
    const group = g => { const ttl = mlField(T('Бөлім атауы'), g.title); const items = listEditor(g.items, item, () => ({q: {}, a: {}}), T('Сұрақ қосу'));
      return {el: h('details', {class: 'space-y-3'}, h('summary', {class: 'font-extrabold text-emerald-950'}, '▸ ' + (L(g.title) || T('Жаңа бөлім')) + ' (' + (g.items || []).length + T(' сұрақ)')), h('div', {class: 'space-y-3 mt-3'}, ttl.el, items.el)),
        get: () => ({title: ttl.get(), items: items.get()})}; };
    const ed = listEditor(groups, group, () => ({title: {}, items: []}), T('Бөлім қосу'));
    view.append(title(T('Ата-анаға ақпарат (сұрақ-жауап)')), h('div', {class: 'space-y-4'},
      hint(T('Бөлімді ашу үшін атауын басыңыз. Жауаптарда қалың әріп, тізім және сілтеме қолдануға болады.')),
      ed.el,
      saveBar(T('Сақтау'), async () => {
        const j = await run(T('Сақталуда…'), () => api('set', {values: {faq: ed.get()}}));
        DATA.faq = j.values.faq; savedToast(); go('faq', true);
      })));
  };

  // ---------- 🖼 Суреттер ----------
  VIEWS.photos = function(view){
    const im = Object.assign(D.images(), clone(DATA.images || {}));
    const main = {hero: singleImg(im.hero), atmosphere: singleImg(im.atmosphere), building: singleImg(im.building)};
    const card = x => { const img = singleImg(x.img); const cap = mlField(T('Жазуы'), x.cap);
      return {el: h('div', {class: 'grid sm:grid-cols-[10rem_1fr] gap-3'}, img.el, cap.el), img, get: () => ({img: img.value(), cap: cap.get()})}; };
    const day = listEditor(clone(get('day')), card, () => ({img: '', cap: {}}), T('Сурет қосу'));
    const gal = listEditor(clone(get('gallery')), card, () => ({img: '', cap: {}}), T('Сурет қосу'));
    view.append(title(T('Сайттағы суреттер')), h('div', {class: 'space-y-4'},
      section(T('Негізгі суреттер'),
        h('div', {class: 'grid sm:grid-cols-3 gap-4'}, field(T('Басты бет (дөңгелек)'), main.hero.el), field(T('«Мектеп атмосферасы» фоны'), main.atmosphere.el), field(T('Мектеп ғимараты (карта жанында)'), main.building.el))),
      section(T('«Балаңыздың мектептегі бір күні»'), day.el),
      section(T('«Мектеп өмірі» галереясы'), gal.el),
      saveBar(T('Суреттерді сақтау'), async () => {
        const all = [...Object.values(main), ...day.rows.map(r => r.img), ...gal.rows.map(r => r.img)];
        if (!checkUploads(...all)) return;
        const values = {images: {hero: main.hero.value(), atmosphere: main.atmosphere.value(), building: main.building.value()},
          day: day.get().filter(x => x.img), gallery: gal.get().filter(x => x.img)};
        const j = await run(T('Сақталуда…'), () => api('set', {values}));
        Object.assign(DATA, j.values); savedToast(); go('photos', true);
      })));
  };

  // ---------- ✏️ Мәтіндер ----------
  const TEXT_GROUPS = [
    [/^(brand|nav|hero|badge|metric)/, T('Басты бөлім және мәзір')], [/^(daily|tab_|menu_|hw_|week_|today|loading)/, T('Күнделікті ақпарат')],
    [/^(mc_|qa_)/, T('Сыныбым (ата-аналар беті)')],
    [/^(news|cat_|one_|read_|pinned)/, T('Жаңалықтар')], [/^(about|pillar|adv)/, T('Неге біз')], [/^(day_|atmo)/, T('Мектеп өмірі')],
    [/^learn/, T('Оқу процесі')], [/^faq/, T('Ата-анаға ақпарат')], [/^(team|mo_head)/, T('Ұжым')],
    [/^(promo|admissions|step|lead|sticky)/, T('Қабылдау')], [/^gallery/, T('Галерея')], [/^(location|btn_|contact)/, T('Мекенжай және байланыс')],
    [/^footer/, T('Төменгі бөлім')], [/./, T('Басқа')]
  ];
  VIEWS.texts = function(view){
    const texts = clone(DATA.texts || {});
    const keys = Object.keys(I18N.kz).filter(k => !D.textSkip.test(k));
    const groups = TEXT_GROUPS.map(([re, name]) => ({name, keys: []}));
    keys.forEach(k => { const g = TEXT_GROUPS.findIndex(([re]) => re.test(k)); groups[g].keys.push(k); });
    const fields = {};
    const search = h('input', {class: 'inp', type: 'search', placeholder: T('🔎 Мәтінді іздеу…')});
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
      if (!hits.length) results.append(h('p', {class: 'text-charcoal/60'}, T('Ештеңе табылмады')));
      hits.forEach(k => build(k, results));
    });
    view.append(title(T('Сайттағы мәтіндер')), h('div', {class: 'space-y-4'},
      hint(T('Сайттың тақырыптары мен сипаттамалары. Бөлімді ашып, керек мәтінді өзгертіңіз. Бір тілде өзгерткенде, қалғанын «🌐 Аудару» батырмасымен жаңартуға болады.')),
      search, results, box,
      saveBar(T('Мәтіндерді сақтау'), async () => {
        Object.entries(fields).forEach(([k, f]) => {
          const v = f.get(), d = defOf(k);
          if (LANGS.some(l => v[l] !== d[l])) texts[k] = v; else delete texts[k];
        });
        const j = await run(T('Сақталуда…'), () => api('set', {values: {texts}}));
        DATA.texts = j.values.texts; savedToast(); go('texts', true);
      })));
  };

  // ---------- ☎ Байланыс ----------
  VIEWS.contacts = function(view){
    const c = Object.assign(D.contacts(), clone(DATA.contacts || {}));
    const inp = (k, ph) => { const el = h('input', {class: 'inp', type: 'text', placeholder: ph || ''}); el.value = c[k] || ''; return el; };
    const f = {phone: inp('phone', '+7 708 584-94-02'), phone2: inp('phone2'), whatsapp: inp('whatsapp', '+7 700 978-65-00'), instagram: inp('instagram', 'baiterek.st'), map: inp('map'), gis: inp('gis', 'https://2gis.kz/…')};
    view.append(title(T('Байланыс')), h('div', {class: 'space-y-4'},
      section(null,
        h('div', {class: 'grid sm:grid-cols-2 gap-4'},
          field(T('Негізгі телефон'), f.phone), field(T('Қосымша телефон'), f.phone2), field(T('WhatsApp нөмірі'), f.whatsapp), field(T('Instagram (аккаунт аты)'), f.instagram),
          field(T('Картадағы мекенжай (Google Maps үшін)'), f.map), field(T('2GIS сілтемесі'), f.gis)),
        h('p', {class: 'text-sm text-charcoal/65'}, T('Сайтта көрінетін мекенжай жазуы «Мәтіндер → Мекенжай және байланыс» бөлімінде өзгертіледі.'))),
      saveBar(T('Сақтау'), async () => {
        const contacts = {};
        Object.keys(f).forEach(k => { contacts[k] = f[k].value.trim(); });
        const j = await run(T('Сақталуда…'), () => api('set', {values: {contacts}}));
        DATA.contacts = j.values.contacts; savedToast(); go('contacts', true);
      })));
  };

  // ---------- ⚙ Баптаулар (бас әкімші) ----------
  function pwSection(){
    const pw1 = h('input', {class: 'inp', type: 'password', autocomplete: 'new-password'}), pw2 = h('input', {class: 'inp', type: 'password', autocomplete: 'new-password'});
    return section(T('Парольді ауыстыру'),
      h('div', {class: 'grid sm:grid-cols-2 gap-3'}, field(T('Жаңа пароль'), pw1), field(T('Жаңа парольді қайталаңыз'), pw2)),
      h('div', {class: 'flex justify-end'}, h('button', {type: 'button', class: 'btn btn-p', onclick: async () => {
        if (pw1.value.length < 6) { toast(T('Пароль кемінде 6 таңба болуы керек'), true); return; }
        if (pw1.value !== pw2.value) { toast(T('Парольдер сәйкес емес'), true); return; }
        await run(T('Сақталуда…'), () => api('setpw', {newpw: pw1.value}));
        PW = pw1.value; remember(); pw1.value = pw2.value = ''; dirty = false;
        toast(T('Пароль ауыстырылды ✓'));
      }}, T('Парольді ауыстыру'))));
  }
  VIEWS.settings = function(view){
    const s = Object.assign(D.settings(), clone(DATA.settings || {}));
    const classes = h('textarea', {class: 'inp', rows: 3}); classes.value = (s.classes || []).join(', ');
    const meals = listEditor(s.meals, m => { const f = mlField(T('Ас мезгілі'), m); return {el: f.el, get: f.get}; }, () => ({}), T('Ас мезгілін қосу'));
    const st = INFO.storage || {};
    const gb = n => (n / 1024 / 1024 / 1024).toFixed(2) + T(' ГБ');
    const pct = st.limit ? Math.min(100, Math.round(st.used * 100 / st.limit)) : 0;
    view.append(title(T('Баптаулар')), h('div', {class: 'space-y-4'},
      section(T('Сыныптар'), field(T('Сыныптар тізімі (үтір арқылы)'), classes)),
      section(T('Ас мезгілдері (ас мәзірі бөлімі үшін)'), meals.el),
      saveBar(T('Баптауларды сақтау'), async () => {
        const settings = {classes: classes.value.split(/[,\n]/).map(x => x.trim()).filter(Boolean), meals: meals.get()};
        const j = await run(T('Сақталуда…'), () => api('set', {values: {settings}}));
        DATA.settings = j.values.settings; savedToast(); go('settings', true);
      }),
      notifySection(),
      section('Google Drive',
        st.limit ? h('div', {}, h('div', {class: 'text-sm font-semibold'}, T('Қолданылғаны: ') + gb(st.used) + ' / ' + gb(st.limit) + ' (' + pct + '%)'), h('div', {class: 'bar mt-2'}, h('div', {style: 'width:' + pct + '%'}))) : null,
        h('div', {class: 'flex flex-wrap gap-2'},
          INFO.folder ? h('a', {href: INFO.folder, target: '_blank', class: 'btn btn-l btn-s'}, T('📁 Сайттың Drive қалтасы ↗')) : null,
          INFO.classFolder ? h('a', {href: INFO.classFolder, target: '_blank', class: 'btn btn-l btn-s'}, T('📁 «Бастауыш-Началка» ↗')) : null),
        h('p', {class: 'text-sm text-charcoal/65'}, T('Сыныптардың фото мен видеолары «Бастауыш-Началка» ішіндегі сынып қалталарында, ал сайттың күнделікті резерв көшірмелері «Резерв» ішінде сақталады.')),
        (() => {
          const out = h('div', {class: 'grid grid-cols-2 sm:grid-cols-4 gap-2'});
          return h('div', {class: 'space-y-2'},
            h('button', {type: 'button', class: 'btn btn-p btn-s', onclick: async () => {
              const j = await run(T('Қалталар жасалуда…'), () => api('mkFolders'));
              out.innerHTML = '';
              Object.keys(j.folders).sort().forEach(c => out.append(h('a', {href: j.folders[c], target: '_blank', class: 'btn btn-l btn-s'}, '📁 ' + c + ' ↗')));
              toast(T('Дайын ✓ Сынып қалталары: ') + Object.keys(j.folders).length + (j.shared ? T('; Gmail-ы бар сынып жетекшілеріне ашылды: ') + j.shared : ''));
              if (j.warn && j.warn.length) toast(T('Drive қолжетімділігі берілмеді: ') + j.warn.join('; '), true);
            }}, T('📁 Әр сыныпқа Drive қалтасын жасау')),
            h('p', {class: 'text-xs text-charcoal/60'}, T('«Бастауыш-Началка» ішінде әр сыныпқа «<сынып> сынып» қалтасы жасалады (бар болса, қайта жасалмайды). Сынып жетекшісінің Gmail-ы жазылған болса, оған тек өз сыныбының қалтасы ашылады.')),
            out);
        })()),
      section(T('Кіру логині'), h('p', {class: 'text-sm'}, T('Сіздің логиніңіз: '), h('b', {}, 'admin'))),
      pwSection()));
  };
  VIEWS.account = function(view){
    view.append(title(T('Менің парольім')), h('div', {class: 'space-y-4'},
      section(null, h('p', {}, T('Аты-жөні: '), h('b', {}, ME.name)), h('p', {}, T('Логин: '), h('b', {}, ME.login)), h('p', {}, T('Рөлі: '), ROLE_NAMES[ME.role]),
        ME.classes && ME.classes.length ? h('p', {}, T('Сынып: '), h('b', {}, ME.classes.join(', '))) : null,
        ME.subjects && ME.subjects.length ? h('p', {}, T('Пәні: '), h('b', {}, ME.subjects.join(', '))) : null,
        ME.clubs && ME.clubs.length ? h('p', {}, T('Үйірмесі: '), h('b', {}, ME.clubs.join(', '))) : null,
        ME.folder ? h('a', {href: ME.folder, target: '_blank', class: 'btn btn-l btn-s'}, T('📁 Drive қалтам ↗')) : null,
        Object.keys(INFO.classFolders || {}).length ? h('div', {class: 'flex flex-wrap gap-2'}, Object.keys(INFO.classFolders).map(c =>
          h('a', {href: INFO.classFolders[c], target: '_blank', class: 'btn btn-l btn-s'}, '📁 ' + c + T(' сыныбының Drive қалтасы ↗')))) : null),
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
    INFO = {storage: j.storage, folder: j.folder, classFolder: j.classFolder, classFolders: j.classFolders || {}};
    if (DATA.posts === undefined && can('posts')) {
      const r = await api('set', {values: {posts: D.posts()}});
      DATA.posts = r.values.posts;
    }
    $('whoami').textContent = '· ' + (ME.role === 'owner' ? T(ME.name) : ME.name) + (ME.classes && ME.classes.length ? ' (' + ME.classes.join(', ') + ')' : '');
    $('login').hidden = true;
    $('app').hidden = false;
    const tabs = visibleTabs();
    go(tabs.some(t => t[0] === TAB) ? TAB : (ME.role === 'teacher' ? 'qa' : (ME.role === 'subject' || ME.role === 'psych') ? 'fb' : tabs[0][0]), true);
  }
  const loginInput = $('loginName');
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    LOGIN = loginInput.value.trim().toLowerCase();
    PW = $('pw').value;
    $('loginMsg').textContent = T('Тексерілуде…');
    try {
      const j = await api('login');
      remember();
      if (j.first) alert(T('Бас әкімшінің паролі орнатылды! Енді «admin» логині және осы парольмен кіресіз. Оны ұмытпаңыз.'));
      await start();
    } catch (err) { $('loginMsg').textContent = T(err.message); PW = null; }
  });
  $('logout').addEventListener('click', () => {
    if (dirty && !confirm(T('Сақталмаған өзгерістер бар. Шыға берейін бе?'))) return;
    try { localStorage.removeItem('adm_auth'); sessionStorage.removeItem('adm_auth'); localStorage.removeItem('adm_pw'); sessionStorage.removeItem('adm_pw'); } catch (e) {}
    location.reload();
  });
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) { $('modal').hidden = true; } });

  // admin.html-дегі тұрақты жазулар
  if (UI === 'ru') {
    document.documentElement.lang = 'ru';
    const walk = el => el.childNodes.forEach(n => {
      if (n.nodeType === 3) { const v = n.nodeValue.trim(); if (v && RU[v]) n.nodeValue = n.nodeValue.replace(v, RU[v]); }
      else if (n.nodeType === 1) { if (n.placeholder && RU[n.placeholder]) n.placeholder = RU[n.placeholder]; walk(n); }
    });
    ['login', 'app', 'busy'].forEach(id => walk($(id)));
  }
  function langSwitch(){
    return h('div', {class: 'flex rounded-full border border-emerald-900/15 overflow-hidden text-xs font-extrabold shrink-0'}, ['kz', 'ru'].map(l =>
      h('button', {type: 'button', class: 'px-2.5 py-1.5', style: l === UI ? 'background:#0F382C;color:#fff' : 'background:#fff;color:#0F382C',
        onclick: () => { if (l === UI) return; if (dirty && !confirm(T('Сақталмаған өзгерістер бар. Оларды тастап кете берейін бе?'))) return; dirty = false; try { localStorage.setItem('adm_lang', l); } catch (e) {} location.reload(); }}, l.toUpperCase())));
  }
  $('logout').before(langSwitch());
  $('loginForm').prepend(h('div', {class: 'flex justify-end -mb-6'}, langSwitch()));
  if (!API) $('loginMsg').textContent = T('Сервер мекенжайы әлі орнатылмаған (config.js).');
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
    }}, T('Басқа логинмен кіру'));
    $('loginMsg').textContent = T('Сақталған кіру: «') + LOGIN + T('» болып кіруде…');
    $('loginMsg').after(other);
    api('login').then(() => { if (!cancelled) return start(); }).catch(err => {
      if (cancelled) return;
      $('loginMsg').textContent = T(err.message); PW = null; other.remove();
      formEls.forEach(e => { e.hidden = false; });
      clearSaved();
    });
  }
})();
