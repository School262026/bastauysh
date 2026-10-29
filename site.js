// Сайттың көпшілікке арналған беті: деректерді Google Apps Script-тен алып, бөлімдерді салады.
// Деректер жүктелмесе де сайт defaults.js ішіндегі бастапқы мазмұнмен жұмыс істей береді.
(function(){
  var D = window.SITE_DEFAULTS;
  var I18N = D.I18N;
  var API = window.API_URL || '';
  var data = {};
  var lang = 'kz';
  try { lang = localStorage.getItem('bs_lang') || 'kz'; } catch(e) {}
  if (!I18N[lang]) lang = 'kz';

  var MONTHS = {
    kz:['қаңтар','ақпан','наурыз','сәуір','мамыр','маусым','шілде','тамыз','қыркүйек','қазан','қараша','желтоқсан'],
    ru:['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'],
    en:['January','February','March','April','May','June','July','August','September','October','November','December']
  };
  var DOW = {
    kz:['Жексенбі','Дүйсенбі','Сейсенбі','Сәрсенбі','Бейсенбі','Жұма','Сенбі'],
    ru:['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'],
    en:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  };
  var DOW_S = {
    kz:['Жс','Дс','Сс','Ср','Бс','Жм','Сб'],
    ru:['Вс','Пн','Вт','Ср','Чт','Пт','Сб'],
    en:['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  };

  // ---------- көмекші функциялар ----------
  function t(key){
    var o = data.texts && data.texts[key];
    if (o && o[lang]) return o[lang];
    var d = I18N[lang] || I18N.kz;
    return d[key] !== undefined ? d[key] : (I18N.kz[key] || '');
  }
  function L(o){
    if (o == null) return '';
    if (typeof o === 'string') return o;
    return o[lang] || o.kz || o.ru || o.en || '';
  }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
  }
  var OK_TAGS = /^(B|STRONG|I|EM|U|BR|P|DIV|SPAN|UL|OL|LI|A|SMALL|TABLE|THEAD|TBODY|TR|TH|TD|IMG|H3|H4|BLOCKQUOTE)$/;
  // Әкімші енгізген мәтінді қауіпсіз HTML-ге айналдырады (скрипттер мен оқиға атрибуттарын алып тастайды)
  function clean(html){
    if (!html) return '';
    var doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    (function walk(node){
      Array.prototype.slice.call(node.childNodes).forEach(function(ch){
        if (ch.nodeType === 1) {
          if (!OK_TAGS.test(ch.tagName)) {
            if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED)$/.test(ch.tagName)) { ch.remove(); return; }
            walk(ch);
            while (ch.firstChild) ch.parentNode.insertBefore(ch.firstChild, ch);
            ch.remove();
            return;
          }
          Array.prototype.slice.call(ch.attributes).forEach(function(a){
            var n = a.name.toLowerCase();
            if (!/^(href|src|alt|class|target|rel|colspan|rowspan|style)$/.test(n) || /^\s*javascript:/i.test(a.value)) ch.removeAttribute(a.name);
          });
          if (ch.tagName === 'A' && /^https?:/i.test(ch.getAttribute('href') || '')) { ch.setAttribute('target','_blank'); ch.setAttribute('rel','noopener'); }
          walk(ch);
        }
      });
    })(doc.body.firstChild);
    return doc.body.firstChild.innerHTML;
  }
  function isDrive(ref){ return ref && !/[\/.]/.test(ref); }
  function imgUrl(ref, w){
    if (!ref) return '';
    return isDrive(ref) ? 'https://lh3.googleusercontent.com/d/' + ref + '=w' + (w || 1600) : ref;
  }
  // lh3 сілтемесі ашылмаса, Drive-тың thumbnail сілтемесіне ауысады
  window.uiImgFallback = function(img){
    var id = img.getAttribute('data-drive');
    if (!id || img.getAttribute('data-fb')) return;
    img.setAttribute('data-fb', '1');
    img.src = 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + (img.getAttribute('data-w') || 1600);
  };
  function imgTag(ref, w, cls, alt){
    var drive = isDrive(ref);
    return '<img src="' + esc(imgUrl(ref, w)) + '"' + (drive ? ' data-drive="' + esc(ref) + '" data-w="' + (w || 1600) + '" onerror="uiImgFallback(this)"' : '') +
      ' alt="' + esc(alt || '') + '" class="' + (cls || '') + '" loading="lazy" referrerpolicy="no-referrer">';
  }
  function thumbRef(m){
    if (m.t === 'yt') return 'https://i.ytimg.com/vi/' + m.id + '/hqdefault.jpg';
    if (m.t === 'drive') return 'https://drive.google.com/thumbnail?id=' + m.id + '&sz=w800';
    return m.id;
  }
  function mediaThumb(m, cls, onclick){
    var inner = m.t === 'img' ? imgTag(m.id, 900, '', '') : '<img src="' + esc(thumbRef(m)) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.opacity=0">';
    var play = m.t === 'img' ? '' : '<div class="play-badge"><span><svg viewBox="0 0 24 24" class="w-6 h-6" fill="#fff"><path d="M8 5v14l11-7z"/></svg></span></div>';
    return '<div class="media-thumb ' + (cls || '') + '" onclick="' + onclick + '">' + inner + play + '</div>';
  }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function ymd(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s){ var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function addDays(s, n){ var d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function today(){ return ymd(new Date()); }
  function monday(s){ var d = parse(s); var w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return ymd(d); }
  function fmtDate(s, withDow){
    var d = parse(s);
    var txt = lang === 'en' ? MONTHS.en[d.getMonth()] + ' ' + d.getDate() : d.getDate() + ' ' + MONTHS[lang][d.getMonth()];
    return withDow ? txt + ', ' + DOW[lang][d.getDay()] : txt;
  }
  function get(key){
    if (key === 'settings') return Object.assign(D.settings(), data.settings || {});
    if (data[key] !== undefined && data[key] !== null) return data[key];
    return D[key] ? D[key]() : null;
  }
  // WhatsApp-тан бір жолға көшірілген мәзір: әр эмодзиден жаңа жол басталады
  var EMOJI_START = /\s+(?=[\u2600-\u27BF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDEFF]|\uD83E[\uDD00-\uDEFF])/g;
  function menuLines(s){
    s = String(s || '');
    if (/\n/.test(s) || (s.match(EMOJI_START) || []).length < 3) return s;
    return s.replace(EMOJI_START, '\n');
  }
  function byId(id){ return document.getElementById(id); }

  // ---------- мәтіндер, байланыс, суреттер ----------
  function applyTexts(){
    document.querySelectorAll('[data-i18n]').forEach(function(el){
      el.innerHTML = clean(t(el.getAttribute('data-i18n')));
    });
    document.documentElement.lang = lang === 'kz' ? 'kk' : lang;
  }
  function digits(s){ return String(s || '').replace(/\D/g, ''); }
  function renderContacts(){
    var c = get('contacts');
    var wa = digits(c.whatsapp);
    document.querySelectorAll('.js-wa').forEach(function(a){ if (wa) a.href = 'https://wa.me/' + wa; });
    document.querySelectorAll('.js-wa-text').forEach(function(el){ el.textContent = c.whatsapp || ''; });
    document.querySelectorAll('.js-tel').forEach(function(a){ a.href = 'tel:+' + digits(c.phone); });
    document.querySelectorAll('.js-tel-text').forEach(function(el){ el.textContent = c.phone || ''; });
    document.querySelectorAll('.js-tel2-text').forEach(function(el){ el.textContent = c.phone2 || ''; el.style.display = c.phone2 ? '' : 'none'; });
    var ig = String(c.instagram || '').replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
    document.querySelectorAll('.js-ig').forEach(function(a){ a.href = 'https://www.instagram.com/' + ig + '/'; });
    document.querySelectorAll('.js-ig-text').forEach(function(el){ el.textContent = '@' + ig; });
    var q = encodeURIComponent(c.map || '');
    var f = document.querySelector('.js-map-frame');
    var src = 'https://www.google.com/maps?q=' + q + '&output=embed';
    if (f && f.getAttribute('src') !== src) f.setAttribute('src', src);
    document.querySelectorAll('.js-map-link').forEach(function(a){ a.href = 'https://www.google.com/maps/search/?api=1&query=' + q; });
    document.querySelectorAll('.js-gis').forEach(function(a){ if (c.gis) a.href = c.gis; a.style.display = c.gis ? '' : 'none'; });
  }
  function renderImages(){
    var im = get('images');
    document.querySelectorAll('[data-img]').forEach(function(el){
      var ref = im[el.getAttribute('data-img')];
      if (!ref) return;
      var url = imgUrl(ref, 1600);
      if (el.getAttribute('src') === url) return;
      if (isDrive(ref)) { el.setAttribute('data-drive', ref); el.removeAttribute('data-fb'); el.onerror = function(){ window.uiImgFallback(el); }; }
      el.setAttribute('referrerpolicy', 'no-referrer');
      el.src = url;
    });
  }

  // ---------- лайтбокс ----------
  var LB = {list:[], i:0};
  window.uiLbOpen = function(list, i){
    LB.list = list; LB.i = i || 0;
    byId('lightbox').classList.add('open');
    document.body.style.overflow = 'hidden';
    lbShow();
  };
  function lbShow(){
    var m = LB.list[LB.i]; if (!m) return;
    var body = byId('lbBody');
    if (m.t === 'yt') body.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(m.id) + '?autoplay=1&rel=0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>';
    else if (m.t === 'drive') body.innerHTML = '<iframe src="https://drive.google.com/file/d/' + esc(m.id) + '/preview" allow="autoplay; fullscreen" allowfullscreen></iframe>';
    else body.innerHTML = imgTag(m.id, 2000, '', '');
    byId('lbCap').textContent = m.cap || '';
    var many = LB.list.length > 1;
    byId('lbPrev').style.display = many ? '' : 'none';
    byId('lbNext').style.display = many ? '' : 'none';
  }
  window.uiLbStep = function(d){ LB.i = (LB.i + d + LB.list.length) % LB.list.length; lbShow(); };
  window.uiLbClose = function(){ byId('lightbox').classList.remove('open'); byId('lbBody').innerHTML = ''; document.body.style.overflow = ''; };
  document.addEventListener('keydown', function(e){
    if (!byId('lightbox').classList.contains('open')) return;
    if (e.key === 'Escape') window.uiLbClose();
    if (e.key === 'ArrowLeft') window.uiLbStep(-1);
    if (e.key === 'ArrowRight') window.uiLbStep(1);
  });
  var LISTS = {};
  window.uiOpenList = function(name, i){ window.uiLbOpen(LISTS[name] || [], i); };

  // ---------- мектеп өмірі, галерея ----------
  function renderDay(){
    var box = byId('dayCarousel'); if (!box) return;
    var items = get('day') || [];
    LISTS.day = items.map(function(x){ return {t:'img', id:x.img, cap:L(x.cap)}; });
    box.innerHTML = items.map(function(x, i){
      return '<div class="day-slide shrink-0 w-36 sm:w-44"><div class="day-photo aspect-[3/4] rounded-2xl ' + (i % 2 ? 'bg-gold-50' : 'bg-emerald-50') + ' border border-emerald-900/10 overflow-hidden cursor-pointer" onclick="uiOpenList(\'day\',' + i + ')">' +
        imgTag(x.img, 700, 'w-full h-full object-cover', L(x.cap)) + '</div><div class="mt-2 text-xs font-bold text-emerald-950 text-center">' + esc(L(x.cap)) + '</div></div>';
    }).join('');
  }
  function renderGallery(){
    var box = byId('galleryGrid'); if (!box) return;
    var items = get('gallery') || [];
    LISTS.gallery = items.map(function(x){ return {t:'img', id:x.img, cap:L(x.cap)}; });
    box.innerHTML = items.map(function(x, i){
      return '<figure class="rounded-2xl overflow-hidden bg-white border border-emerald-900/10 shadow-sm cursor-pointer" onclick="uiOpenList(\'gallery\',' + i + ')"><div class="aspect-[4/3]">' +
        imgTag(x.img, 1000, 'w-full h-full object-cover', L(x.cap)) + '</div><figcaption class="px-4 py-3 text-base font-bold text-emerald-950 text-center">' + esc(L(x.cap)) + '</figcaption></figure>';
    }).join('');
  }

  // ---------- сұрақ-жауап ----------
  var faqTab = 0;
  function renderFaq(){
    var groups = get('faq') || [];
    if (faqTab >= groups.length) faqTab = 0;
    var tabs = byId('faqTabs'), panels = byId('faqPanels');
    if (!tabs || !panels) return;
    tabs.innerHTML = groups.map(function(g, i){
      return '<button type="button" class="tab-btn' + (i === faqTab ? ' active' : '') + ' px-5 py-2.5 rounded-full text-sm font-bold transition" onclick="uiSetFaqTab(' + i + ')">' + esc(L(g.title)) + '</button>';
    }).join('');
    panels.innerHTML = groups.map(function(g, i){
      return '<div class="faq-panel mt-8 space-y-3' + (i === faqTab ? '' : ' hidden-panel') + '">' + (g.items || []).map(function(it, j){
        return '<div class="accordion-item' + (j === 0 ? ' accordion-item-open' : '') + ' bg-white rounded-2xl overflow-hidden"><button type="button" onclick="uiToggleAccordion(this)" class="accordion-trig w-full flex items-center justify-between gap-4 px-5 py-4 text-left font-bold text-emerald-950"><span>' + esc(L(it.q)) +
          '</span><svg viewBox="0 0 24 24" class="chevron w-5 h-5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button><div class="accordion-panel rich px-5 pb-5 text-base text-charcoal font-medium leading-relaxed">' + clean(L(it.a)) + '</div></div>';
      }).join('') + '</div>';
    }).join('');
  }
  window.uiSetFaqTab = function(i){ faqTab = i; renderFaq(); };
  window.uiToggleAccordion = function(btn){ var item = btn.closest('.accordion-item'); if (item) item.classList.toggle('accordion-item-open'); };

  // ---------- ұжым ----------
  function initials(full){ var p = String(full).trim().split(/\s+/); return esc(((p[0] || '')[0] || '') + ((p[1] || '')[0] || '')); }
  var colorCycle = ['border-emerald-900','border-gold','border-emerald-700','border-gold-600'];
  function personCards(list, gold){
    return (list || []).map(function(p){
      return '<div class="bg-white rounded-2xl border border-emerald-900/10 shadow-sm p-5 text-center"><div class="w-11 h-11 rounded-full ' + (gold ? 'bg-gold text-emerald-950' : 'bg-emerald-900 text-white') + ' flex items-center justify-center font-extrabold text-sm mx-auto mb-3">' + initials(p.name) +
        '</div><div class="font-bold text-sm text-emerald-950">' + esc(p.name) + '</div><div class="text-sm text-charcoal/75 mt-1">' + esc(L(p.role)) + '</div></div>';
    }).join('');
  }
  function groupCards(list){
    return (list || []).map(function(s, i){
      return '<div class="bg-white rounded-xl border-l-4 ' + colorCycle[i % 4] + ' border border-emerald-900/10 p-4 shadow-sm"><h4 class="font-bold text-sm text-emerald-950">' + esc(L(s.label)) + '</h4><ul class="mt-2 space-y-1 text-sm text-charcoal/80 font-medium">' +
        (s.names || []).map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>';
    }).join('');
  }
  function renderTeam(){
    var S = get('staff');
    var set = function(id, html){ var el = byId(id); if (el) el.innerHTML = html; };
    set('teamLeadership', personCards(S.leadership));
    set('teamMO', (S.mo || []).map(function(m, i){
      return '<div class="bg-white rounded-xl border-l-4 ' + colorCycle[i % 4] + ' border border-emerald-900/10 p-4 shadow-sm"><h4 class="font-bold text-sm text-emerald-950">' + esc(L(m.label)) + '</h4><div class="text-sm text-charcoal/80 mt-1">' + esc(t('mo_head_prefix')) + ': ' + esc(m.head) + '</div></div>';
    }).join(''));
    set('teamSpecialists', groupCards(S.specialists));
    set('teamPreschool', groupCards(S.preschool));
    set('teamTeachers', (S.teachers || []).map(function(g){
      var names = (g.names || []).map(function(n){ return typeof n === 'object' ? n.name + ' — ' + L(n.note) : n; });
      return '<details class="bg-white rounded-xl border border-emerald-900/10 overflow-hidden"><summary class="cursor-pointer list-none flex items-center justify-between gap-3 px-5 py-3.5 font-bold text-sm text-emerald-950">' + esc(L(g.label)) + ' (' + names.length + ')<svg viewBox="0 0 24 24" class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></summary><div class="px-5 pb-4"><ul class="columns-2 gap-6 text-base text-charcoal/85 font-medium space-y-1">' +
        names.map(function(n){ return '<li class="break-inside-avoid">' + esc(n) + '</li>'; }).join('') + '</ul></div></details>';
    }).join(''));
    set('teamSupport', personCards(S.support, true));
  }

  // ---------- жаңалықтар ----------
  var CATS = ['all','announce','event','greet'];
  var newsCat = 'all', newsShown = 6;
  var CAT_STYLE = {announce:'bg-emerald-50 text-emerald-900', event:'bg-gold-50 text-gold-600', greet:'bg-rose-50 text-rose-700'};
  function sortedPosts(){
    var posts = (get('posts') || []).slice();
    posts.sort(function(a, b){
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.ts || 0) - (a.ts || 0);
    });
    return posts;
  }
  // ---------- архив: өткен айлардың жаңалығы, ас мәзірі, апта жоспары ай-айымен жүктеледі ----------
  var MONTHS_N = {
    kz: ['Қаңтар','Ақпан','Наурыз','Сәуір','Мамыр','Маусым','Шілде','Тамыз','Қыркүйек','Қазан','Қараша','Желтоқсан'],
    ru: ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],
    en: ['January','February','March','April','May','June','July','August','September','October','November','December']
  };
  function curMonth(){ return today().slice(0, 7); }
  function fmtMonth(m){ var p = m.split('-'); return MONTHS_N[lang][+p[1] - 1] + ' ' + p[0]; }
  function shiftMonth(m, n){ var p = m.split('-'), d = new Date(+p[0], +p[1] - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  var ARCH = {}, archWait = {};
  function archLoad(m, done){
    if (ARCH[m] || !API) { if (done) done(); return; }
    if (archWait[m]) { if (done) archWait[m].push(done); return; }
    archWait[m] = done ? [done] : [];
    // сервер жауап бермесе (немесе ескі нұсқа болса) — қолдағы мәліметтен сол айды аламыз
    var local = function(){ return {posts: (get('posts') || []).filter(function(p){ return String(p.date || '').slice(0, 7) === m; }), menu: {}, week: []}; };
    fetch(API + '?a=arch&m=' + m).then(function(r){ return r.json(); }).then(function(j){
      ARCH[m] = j && j.ok && j.posts ? {posts: j.posts, menu: j.menu || {}, week: j.week || []} : local();
    }).catch(function(){ ARCH[m] = local(); }).then(function(){
      var cbs = archWait[m]; delete archWait[m]; cbs.forEach(function(f){ f(); });
    });
  }
  // Ағымдағы мәлімет + жүктелген архив айлары
  function menuAll(){ var m = {}, k, base = get('menu') || {}; for (k in ARCH) for (var day in ARCH[k].menu) m[day] = ARCH[k].menu[day]; for (k in base) m[k] = base[k]; return m; }
  function weekAll(){ var seen = {}, out = []; (get('week') || []).concat([].concat.apply([], Object.keys(ARCH).map(function(k){ return ARCH[k].week || []; }))).forEach(function(x){ var id = x.id || x.date + x.title; if (!seen[id]) { seen[id] = 1; out.push(x); } }); return out; }
  // Ескі айға жылжығанда сол айды архивтен сұрау
  function needArch(day){
    var m = String(day).slice(0, 7), idx = data.archive || {};
    if (m >= curMonth() || ARCH[m]) return false;
    if (!((idx.menu || {})[m] || (idx.week || {})[m] || (idx.posts || {})[m])) return false;
    archLoad(m, function(){ renderDaily(); });
    return true;
  }
  var newsMonth = null, newsDay = '';
  function newsMonths(){
    var set = {}, idx = (data.archive || {}).posts || {};
    set[curMonth()] = 1;
    for (var k in idx) set[k] = 1;
    (get('posts') || []).forEach(function(p){ if (p.date) set[String(p.date).slice(0, 7)] = 1; });
    return Object.keys(set).sort().reverse();
  }
  function renderNews(){
    var tabs = byId('newsTabs'), list = byId('newsList'), more = byId('newsMore');
    if (!list) return;
    if (!newsMonth) newsMonth = curMonth();
    var isCur = newsMonth === curMonth(), months = newsMonths();
    // ағымдағы айда «маңызды» жазбалар да көрінеді; архив айы сұралады
    var src;
    if (isCur || newsMonth > curMonth()) src = sortedPosts().filter(function(p){ return p.pinned || String(p.date || '').slice(0, 7) === newsMonth; });
    else if (ARCH[newsMonth]) src = ARCH[newsMonth].posts.slice().sort(function(a, b){ return a.date !== b.date ? (a.date < b.date ? 1 : -1) : (b.ts || 0) - (a.ts || 0); });
    else { list.innerHTML = '<p class="md:col-span-2 lg:col-span-3 text-center text-charcoal/60">' + esc(t('arch_load')) + '</p>'; archLoad(newsMonth, renderNews); }
    var bar = '<div class="w-full flex flex-wrap items-center justify-center gap-2 mb-2">' +
      '<button type="button" class="chip" onclick="uiNewsMonth(-1)"' + (months.indexOf(newsMonth) >= months.length - 1 ? ' disabled style="opacity:.4"' : '') + '>‹</button>' +
      '<select onchange="uiNewsPick(this.value)" class="rounded-full border border-emerald-900/15 bg-white px-4 py-2 font-bold text-emerald-950">' + months.map(function(m){
        return '<option value="' + m + '"' + (m === newsMonth ? ' selected' : '') + '>' + esc(fmtMonth(m) + (m === curMonth() ? ' · ' + t('arch_cur') : '')) + '</option>';
      }).join('') + '</select>' +
      '<button type="button" class="chip" onclick="uiNewsMonth(1)"' + (newsMonth >= curMonth() ? ' disabled style="opacity:.4"' : '') + '>›</button>' +
      '<label class="flex items-center gap-1 text-sm font-semibold text-charcoal/70">' + esc(t('arch_day')) + ': <input type="date" value="' + esc(newsDay) + '" min="' + newsMonth + '-01" max="' + newsMonth + '-31" onchange="uiNewsDay(this.value)" class="rounded-full border border-emerald-900/15 bg-white px-3 py-1.5"></label>' +
      (newsDay ? '<button type="button" class="chip" onclick="uiNewsDay(\'\')">' + esc(t('arch_all')) + ' ✕</button>' : '') + '</div>';
    if (!src) { tabs.innerHTML = bar; more.classList.add('hidden-panel'); return; }
    var all = newsDay ? src.filter(function(p){ return p.date === newsDay; }) : src;
    var counts = {};
    all.forEach(function(p){ counts[p.cat] = (counts[p.cat] || 0) + 1; });
    tabs.innerHTML = bar + CATS.filter(function(c){ return c === 'all' || counts[c]; }).map(function(c){
      return '<button type="button" class="chip' + (c === newsCat ? ' active' : '') + '" onclick="uiNewsCat(\'' + c + '\')">' + esc(t('cat_' + c)) + '</button>';
    }).join('');
    var posts = all.filter(function(p){ return newsCat === 'all' || p.cat === newsCat; });
    if (!posts.length) {
      var older = months.filter(function(m){ return m < newsMonth; })[0];
      list.innerHTML = '<div class="md:col-span-2 lg:col-span-3 text-center text-charcoal/60">' + esc(isCur && !newsDay ? t('arch_empty') : t('news_empty')) +
        (older && !newsDay ? '<div class="mt-4"><button type="button" class="chip" onclick="uiNewsPick(\'' + older + '\')">' + esc(t('arch_title') + ': ' + fmtMonth(older)) + ' →</button></div>' : '') + '</div>';
      more.classList.add('hidden-panel'); return;
    }
    list.innerHTML = posts.slice(0, newsShown).map(function(p){
      var media = p.media || [];
      var key = 'post_' + p.id;
      LISTS[key] = media.map(function(m){ return {t:m.t, id:m.id, cap:L(p.title)}; });
      var cover = media.length ? mediaThumb(media[0], 'aspect-[16/10] rounded-none', 'uiOpenList(\'' + key + '\',0)') : '';
      var strip = media.length > 1 ? '<div class="grid grid-cols-4 gap-2 mt-4">' + media.slice(1, 5).map(function(m, i){
        var extra = (i === 3 && media.length > 5) ? '<div class="play-badge" style="background:rgba(10,42,32,.55);color:#fff;font-weight:800;font-size:1.1rem">+' + (media.length - 5) + '</div>' : '';
        return mediaThumb(m, 'aspect-square', 'uiOpenList(\'' + key + '\',' + (i + 1) + ')').replace(/<\/div>$/, extra + '</div>');
      }).join('') + '</div>' : '';
      var body = clean(L(p.body));
      var long = body.replace(/<[^>]*>/g, '').length > 260;
      var link = p.link && p.link.url ? '<a href="' + esc(p.link.url) + '"' + (/^https?:/.test(p.link.url) ? ' target="_blank" rel="noopener"' : '') + ' class="mt-5 inline-flex items-center gap-2 bg-emerald-900 hover:bg-emerald-800 text-white font-bold px-5 py-2.5 rounded-full text-sm transition">' + esc(L(p.link.label) || t('read_more')) + '</a>' : '';
      return '<article class="bg-white rounded-2xl border border-emerald-900/10 shadow-sm overflow-hidden">' + cover +
        '<div class="p-6"><div class="flex flex-wrap items-center gap-2 text-xs font-bold">' +
        (p.pinned ? '<span class="bg-gold text-emerald-950 rounded-full px-2.5 py-1">📌 ' + esc(t('pinned')) + '</span>' : '') +
        '<span class="rounded-full px-2.5 py-1 uppercase tracking-wide ' + (CAT_STYLE[p.cat] || CAT_STYLE.announce) + '">' + esc(L(p.tag) || t('one_' + p.cat)) + '</span>' +
        '<span class="text-charcoal/55">' + esc(fmtDate(p.date)) + '</span></div>' +
        '<h3 class="mt-3 text-lg font-extrabold text-emerald-950 leading-snug">' + esc(L(p.title)) + '</h3>' +
        (body ? '<div class="rich mt-2 text-base text-charcoal/85 leading-relaxed' + (long ? ' clamp' : '') + '">' + body + '</div>' : '') +
        (long ? '<button type="button" class="block mt-2 text-sm font-bold text-emerald-900 underline" onclick="uiReadMore(this)">' + esc(t('read_more')) + '</button>' : '') +
        strip + link + '</div></article>';
    }).join('');
    more.classList.toggle('hidden-panel', posts.length <= newsShown);
  }
  window.uiNewsCat = function(c){ newsCat = c; newsShown = 6; renderNews(); };
  window.uiNewsPick = function(m){ newsMonth = m; newsDay = ''; newsShown = 6; renderNews(); };
  window.uiNewsMonth = function(n){ var ms = newsMonths(), i = ms.indexOf(newsMonth) - n; if (i >= 0 && i < ms.length) window.uiNewsPick(ms[i]); };
  window.uiNewsDay = function(d){ newsDay = d || ''; if (d && d.slice(0, 7) !== newsMonth) newsMonth = d.slice(0, 7); newsShown = 6; renderNews(); };
  window.uiNewsMore = function(){ newsShown += 6; renderNews(); };
  window.uiReadMore = function(btn){
    var body = btn.previousElementSibling;
    var open = body.classList.toggle('clamp') === false;
    btn.textContent = open ? t('read_less') : t('read_more');
  };

  // ---------- күнделікті: ас мәзірі, үй тапсырмасы, апта жоспары ----------
  var dailyTab = 'menu';
  var menuDate = null, weekStart = null;
  function schoolDay(s){ var w = parse(s).getDay(); return w === 6 ? addDays(s, 2) : w === 0 ? addDays(s, 1) : s; }
  function navBtns(prevFn, nextFn, label, todayFn){
    return '<div class="flex items-center justify-between gap-3 mb-5"><button type="button" class="chip" onclick="' + prevFn + '" aria-label="prev">‹</button>' +
      '<div class="text-center"><div class="font-extrabold text-emerald-950">' + label + '</div>' + (todayFn ? '<button type="button" class="text-xs font-bold text-gold-600 underline" onclick="' + todayFn + '">' + esc(t('today')) + '</button>' : '') + '</div>' +
      '<button type="button" class="chip" onclick="' + nextFn + '" aria-label="next">›</button></div>';
  }
  function mediaRow(media, key){
    if (!media || !media.length) return '';
    LISTS[key] = media.map(function(m){ return {t:m.t, id:m.id}; });
    return '<div class="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">' + media.map(function(m, i){ return mediaThumb(m, 'aspect-square', 'uiOpenList(\'' + key + '\',' + i + ')'); }).join('') + '</div>';
  }
  function renderMenu(){
    var menu = menuAll();
    var meals = (get('settings').meals) || [];
    if (!menuDate) menuDate = schoolDay(today());
    var mon = monday(menuDate);
    if (needArch(mon) || needArch(addDays(mon, 4))) return '<p class="text-center text-charcoal/60 py-6">' + esc(t('arch_load')) + '</p>';
    var days = [0,1,2,3,4].map(function(i){ return addDays(mon, i); });
    if (menu[addDays(mon, 5)]) days.push(addDays(mon, 5));
    var h = navBtns('uiMenuWeek(-1)', 'uiMenuWeek(1)', esc(fmtDate(days[0]) + ' — ' + fmtDate(days[days.length - 1])), 'uiMenuToday()');
    h += '<div class="flex flex-wrap justify-center gap-2 mb-6">' + days.map(function(d){
      var pd = parse(d);
      return '<button type="button" class="chip' + (d === menuDate ? ' active' : '') + '" onclick="uiMenuDay(\'' + d + '\')">' + DOW_S[lang][pd.getDay()] + ' ' + pd.getDate() + (menu[d] ? ' <span class="dot"></span>' : '') + '</button>';
    }).join('') + '</div>';
    var m = menu[menuDate];
    h += '<h3 class="text-center text-lg font-extrabold text-emerald-950 mb-4">' + esc(fmtDate(menuDate, true)) + (menuDate === today() ? ' · <span class="text-gold-600">' + esc(t('today')) + '</span>' : '') + '</h3>';
    if (!m) { h += '<p class="text-center text-charcoal/60 py-6">🍽 ' + esc(t('menu_empty')) + '</p>'; }
    else {
      var rows = (m.m || []).map(function(x, i){
        var txt = L(x); if (!txt) return '';
        return '<li class="flex flex-col sm:flex-row gap-1 sm:gap-4 py-3 border-b border-emerald-900/10 last:border-0"><span class="sm:w-36 shrink-0 text-sm font-extrabold uppercase tracking-wide text-gold-600">' + esc(L(meals[i]) || ('#' + (i + 1))) + '</span><span class="text-base font-medium text-charcoal whitespace-pre-line">' + esc(menuLines(txt)) + '</span></li>';
      }).join('');
      if (rows) h += '<ul>' + rows + '</ul>';
      if (L(m.note)) h += '<div class="mt-4 rounded-2xl bg-emerald-50/50 p-4"><div class="text-xs font-extrabold uppercase tracking-wide text-gold-600 mb-1">' + esc(t('menu_note')) + '</div><div class="text-base text-charcoal leading-relaxed whitespace-pre-line">' + esc(menuLines(L(m.note))) + '</div></div>';
      if (m.img) { LISTS.menu = [{t:'img', id:m.img}]; h += '<div class="mt-5 max-w-md mx-auto">' + mediaThumb({t:'img', id:m.img}, '', 'uiOpenList(\'menu\',0)') + '</div>'; }
    }
    return h;
  }
  window.uiMenuDay = function(d){ menuDate = d; renderDaily(); };
  window.uiMenuWeek = function(n){ menuDate = addDays(monday(menuDate), 7 * n); renderDaily(); };
  window.uiMenuToday = function(){ menuDate = schoolDay(today()); renderDaily(); };


  function renderWeek(){
    if (!weekStart) weekStart = monday(today());
    var end = addDays(weekStart, 6);
    if (needArch(weekStart) || needArch(end)) return '<p class="text-center text-charcoal/60 py-6">' + esc(t('arch_load')) + '</p>';
    var ev = weekAll().filter(function(x){ return x.date >= weekStart && x.date <= end; });
    ev.sort(function(a, b){ return (a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1; });
    var h = navBtns('uiWeek(-1)', 'uiWeek(1)', esc(fmtDate(weekStart) + ' — ' + fmtDate(end)), 'uiWeekToday()');
    if (!ev.length) return h + '<p class="text-center text-charcoal/60 py-6">🗓 ' + esc(t('week_empty')) + '</p>';
    var cur = '';
    h += '<div class="space-y-3">';
    ev.forEach(function(x){
      if (x.date !== cur) { cur = x.date; h += '<h4 class="pt-3 text-sm font-extrabold uppercase tracking-wide ' + (x.date === today() ? 'text-gold-600' : 'text-emerald-900') + '">' + esc(fmtDate(x.date, true)) + '</h4>'; }
      var cls = (x.cls || []).length ? '<span class="text-xs font-bold bg-emerald-50 text-emerald-900 rounded-full px-2 py-0.5">' + esc(x.cls.indexOf('*') >= 0 ? t('hw_all') : x.cls.join(', ')) + '</span>' : '';
      h += '<div class="flex gap-4 rounded-2xl border border-emerald-900/10 p-4"><div class="w-14 shrink-0 text-center font-extrabold text-emerald-900">' + esc(x.time || '') + '</div><div class="min-w-0"><div class="font-bold text-emerald-950">' + esc(L(x.title)) + ' ' + cls + '</div>' +
        (L(x.place) ? '<div class="text-sm text-charcoal/70 mt-0.5">📍 ' + esc(L(x.place)) + '</div>' : '') +
        (L(x.text) ? '<div class="rich text-sm text-charcoal/85 mt-1">' + clean(L(x.text)) + '</div>' : '') + '</div></div>';
    });
    return h + '</div>';
  }
  window.uiWeek = function(n){ weekStart = addDays(weekStart, 7 * n); renderDaily(); };
  window.uiWeekToday = function(){ weekStart = monday(today()); renderDaily(); };

  function renderDaily(){
    var body = byId('dailyBody'); if (!body) return;
    document.querySelectorAll('.daily-tab').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-tab') === dailyTab); });
    body.innerHTML = dailyTab === 'menu' ? renderMenu() : renderWeek();
  }
  window.uiDailyTab = function(tab){ dailyTab = tab; renderDaily(); };

  // ---------- «Сыныбым»: сынып кодымен ашылатын жабық бөлім ----------
  var MC = {codes: [], cur: 0, tab: 'hw', data: {}, err: '', hwDate: null, sent: false, adding: false, pending: false};
  // Ескі мекенжайдан (github.io) көшкенде сақталған кодтар мен құрылғы белгісі #mv= арқылы келеді
  (function(){
    var m = location.hash.match(/[#&]mv=([^&]*)/); if (!m) return;
    try {
      var o = JSON.parse(decodeURIComponent(m[1])) || {}, have = JSON.parse(localStorage.getItem('bs_codes') || '[]') || [];
      (o.codes || []).forEach(function(c){ if (c && c.code && !have.some(function(x){ return x.code === c.code; })) have.push(c); });
      localStorage.setItem('bs_codes', JSON.stringify(have));
      if (o.tok && !localStorage.getItem('bs_tok')) localStorage.setItem('bs_tok', o.tok);
      if (o.parent && !localStorage.getItem('bs_parent')) localStorage.setItem('bs_parent', o.parent);
    } catch(e) {}
    var rest = location.hash.replace(/[#&]mv=[^&]*/, '').replace(/^&/, '#');
    try { history.replaceState(null, '', location.pathname + location.search + (rest.length > 1 ? rest : '')); } catch(e) {}
  })();
  try { MC.codes = JSON.parse(localStorage.getItem('bs_codes') || '[]') || []; } catch(e) { MC.codes = []; }
  function mcSave(){ try { localStorage.setItem('bs_codes', JSON.stringify(MC.codes)); } catch(e) {} }
  // Құрылғының жасырын белгісі: жеке жауаптарды тек сұрақ жіберген құрылғы көреді
  function mcToken(){
    var tok = null;
    try { tok = localStorage.getItem('bs_tok'); } catch(e) {}
    if (!tok) {
      var a = new Uint8Array(16); (window.crypto || window.msCrypto).getRandomValues(a);
      tok = Array.prototype.map.call(a, function(b){ return ('0' + b.toString(16)).slice(-2); }).join('');
      try { localStorage.setItem('bs_tok', tok); } catch(e) {}
    }
    return tok;
  }
  function post(body){
    return fetch(API, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(body)}).then(function(r){ return r.json(); });
  }
  function mcIndex(code){ for (var i = 0; i < MC.codes.length; i++) if (MC.codes[i].code === code) return i; return -1; }
  function mcLoad(code, isNew){
    if (!API) return;
    if (!MC.data[code]) { try { var c = JSON.parse(localStorage.getItem('bs_cls_' + code) || 'null'); if (c) MC.data[code] = c; } catch(e) {} }
    if (isNew) { MC.pending = true; renderMyClass(); }
    post({a:'cls', code: code, tokens:[mcToken()]}).then(function(j){
      MC.pending = false;
      if (!j.ok) {
        if (String(j.err).indexOf('CODE') >= 0) {
          MC.err = t('mc_bad');
          var i = mcIndex(code);
          if (i >= 0) { MC.codes.splice(i, 1); mcSave(); }
          delete MC.data[code];
          try { localStorage.removeItem('bs_cls_' + code); } catch(e) {}
          if (MC.cur >= MC.codes.length) MC.cur = 0;
        } else MC.err = j.err || '';
        renderMyClass(); return;
      }
      MC.data[code] = j;
      MC.fresh = MC.fresh || {}; MC.fresh[code] = true;   // серверден жаңа ғана келді — тіркелу терезесін көрсетуге болады
      try { localStorage.setItem('bs_cls_' + code, JSON.stringify(j)); } catch(e) {}
      if (isNew) {
        if (mcIndex(code) < 0) MC.codes.push({code: code, cls: j.cls});
        MC.cur = mcIndex(code); MC.adding = false; MC.hwDate = null;
        if (j.child) MC.tab = 'fb';
      }
      var ci = mcIndex(code);
      if (ci >= 0) { MC.codes[ci].cls = j.cls; MC.codes[ci].child = j.child ? j.child.name : ''; }
      mcSave();
      MC.err = '';
      renderMyClass();
    }).catch(function(){ MC.pending = false; renderMyClass(); });
  }
  function mcHw(d){
    var items = d.homework || [];
    if (!MC.hwDate) {
      var t0 = today();
      var past = items.filter(function(x){ return x.date <= t0; }).map(function(x){ return x.date; }).sort();
      MC.hwDate = past.length && past[past.length - 1] >= addDays(t0, -14) ? past[past.length - 1] : t0;
    }
    var h = navBtns('uiMcHwDay(-1)', 'uiMcHwDay(1)', esc(fmtDate(MC.hwDate, true)), 'uiMcHwToday()');
    var list = items.filter(function(x){ return x.date === MC.hwDate; });
    if (!list.length) return h + '<p class="text-center text-charcoal/60 py-6">📚 ' + esc(t('hw_empty')) + '</p>';
    return h + '<div class="space-y-3">' + list.map(function(x){
      return '<div class="rounded-2xl border border-emerald-900/10 bg-emerald-50/40 p-4"><div class="font-extrabold text-emerald-950">' + esc(L(x.subject)) + '</div><div class="rich mt-1 text-base text-charcoal leading-relaxed">' + clean(L(x.text)) + '</div>' + mediaRow(x.media, 'hw_' + x.id) + '</div>';
    }).join('') + '</div>';
  }
  function mcNews(d){
    var all = (d.posts || []).slice().sort(function(a, b){ return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0); });
    var ms = {}; ms[curMonth()] = 1; all.forEach(function(p){ if (p.date) ms[p.date.slice(0, 7)] = 1; });
    ms = Object.keys(ms).sort().reverse();
    if (!MC.newsMonth || ms.indexOf(MC.newsMonth) < 0) MC.newsMonth = curMonth();
    var bar = ms.length > 1 ? '<div class="flex flex-wrap items-center gap-2 mb-4"><span class="text-sm font-semibold text-charcoal/70">' + esc(t('arch_month')) + ':</span><select onchange="uiMcNewsMonth(this.value)" class="rounded-full border border-emerald-900/15 bg-white px-4 py-2 font-bold text-emerald-950">' +
      ms.map(function(m){ return '<option value="' + m + '"' + (m === MC.newsMonth ? ' selected' : '') + '>' + esc(fmtMonth(m) + (m === curMonth() ? ' · ' + t('arch_cur') : '')) + '</option>'; }).join('') + '</select></div>' : '';
    var posts = all.filter(function(p){ return String(p.date || '').slice(0, 7) === MC.newsMonth; });
    if (!posts.length) {
      var older = ms.filter(function(m){ return m < MC.newsMonth; })[0];
      return bar + '<p class="text-center text-charcoal/60 py-6">📸 ' + esc(all.length ? t('arch_empty') : t('mc_news_empty')) + '</p>' +
        (older ? '<p class="text-center"><button type="button" class="chip" onclick="uiMcNewsMonth(\'' + older + '\')">' + esc(t('arch_title') + ': ' + fmtMonth(older)) + ' →</button></p>' : '');
    }
    return bar + '<div class="space-y-5">' + posts.map(function(p){
      return '<article class="rounded-2xl border border-emerald-900/10 p-4 sm:p-5"><div class="text-xs font-bold text-charcoal/55">' + esc(fmtDate(p.date)) + '</div><h3 class="mt-1 text-lg font-extrabold text-emerald-950">' + esc(L(p.title)) + '</h3>' +
        (L(p.body) ? '<div class="rich mt-2 text-base text-charcoal/85 leading-relaxed">' + clean(L(p.body)) + '</div>' : '') + mediaRow(p.media, 'cp_' + p.id) + '</article>';
    }).join('') + '</div>';
  }
  function mcQa(d){
    var me = {};
    try { me = JSON.parse(localStorage.getItem('bs_parent') || '{}') || {}; } catch(e) {}
    var inp = 'w-full rounded-xl border border-emerald-900/15 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gold';
    var h = '<form onsubmit="return uiMcAsk(this)" class="rounded-2xl bg-gold-50 border border-gold-100 p-4 sm:p-5 space-y-3"><div class="font-extrabold text-emerald-950">✍️ ' + esc(t('qa_ask_title')) + '</div>' +
      '<div class="grid sm:grid-cols-2 gap-3"><input name="name" required maxlength="80" placeholder="' + esc(t('qa_name')) + '" value="' + esc(me.name || '') + '" class="' + inp + '"><input name="child" maxlength="80" placeholder="' + esc(t('qa_child')) + '" value="' + esc((d.child && d.child.name) || me.child || '') + '" class="' + inp + '"></div>' +
      '<textarea name="q" required maxlength="2000" rows="3" placeholder="' + esc(t('qa_text')) + '" class="' + inp + '"></textarea>' +
      '<div class="flex flex-wrap items-center justify-between gap-2"><span class="text-xs text-charcoal/60">' + esc(t('qa_note')) + '</span><button class="bg-emerald-900 hover:bg-emerald-800 text-white font-bold px-6 py-2.5 rounded-full">' + esc(t('qa_send')) + '</button></div>' +
      (MC.sent ? '<p class="text-sm font-bold text-emerald-800">✓ ' + esc(t('qa_sent')) + '</p>' : '') + '</form>';
    var list = (d.qa || []).slice().sort(function(a, b){ return b.ts - a.ts; });
    if (!list.length) return h + '<p class="text-center text-charcoal/60 py-6">💬 ' + esc(t('qa_empty')) + '</p>';
    return h + '<div class="space-y-3 mt-5">' + list.map(function(q){
      var badge = q.answer ? (q.vis === 'class' ? '👥 ' + t('qa_public') : '🔒 ' + t('qa_private')) : '⏳ ' + t('qa_wait');
      return '<div class="rounded-2xl border border-emerald-900/10 p-4"><div class="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-charcoal/55"><span>' + esc(q.name) + (q.child ? ' · ' + esc(q.child) : '') + ' · ' + esc(fmtDate(ymd(new Date(q.ts)))) + '</span><span class="rounded-full bg-emerald-50 text-emerald-900 px-2 py-0.5">' + esc(badge) + '</span></div>' +
        '<div class="mt-2 font-semibold text-emerald-950 whitespace-pre-line">' + esc(q.q) + '</div>' +
        (q.answer ? '<div class="mt-3 rounded-xl bg-emerald-50 p-3"><div class="text-xs font-extrabold uppercase tracking-wide text-gold-600">' + esc(t('qa_answer')) + (q.ansBy ? ' · ' + esc(q.ansBy) : '') + '</div><div class="mt-1 text-base text-charcoal whitespace-pre-line">' + esc(q.answer) + '</div></div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  // Мұғалімдердің кері байланысы (тек баланың жеке кодымен)
  var FB_KIND = {main: 'fb_main', extra: 'fb_extra', club: 'fb_club'};
  function mcFb(d){
    var items = (d.feedback || []).slice().sort(function(a, b){ return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0); });
    var h = '<div class="flex flex-wrap items-center justify-between gap-3 mb-4"><p class="text-sm text-charcoal/65">🔒 ' + esc(t('fb_note')) + '</p>' +
      (items.length ? '<button type="button" onclick="uiMcFbPrint()" class="bg-emerald-900 hover:bg-emerald-800 text-white font-bold px-5 py-2.5 rounded-full text-sm">🖨 ' + esc(t('fb_print')) + '</button>' : '') + '</div>';
    if (!items.length) return h + '<p class="text-center text-charcoal/60 py-6">📝 ' + esc(t('fb_empty')) + '</p>';
    var cur = '';
    return h + '<div class="space-y-3">' + items.map(function(x){
      var head = '';
      if (x.date !== cur) { cur = x.date; head = '<h3 class="pt-2 font-extrabold text-emerald-900">' + esc(fmtDate(x.date, true)) + '</h3>'; }
      return head + '<div class="rounded-2xl border border-emerald-900/10 p-4"><div class="flex flex-wrap items-center justify-between gap-2"><div class="font-extrabold text-emerald-950">' + esc(x.subj) + '</div>' +
        '<span class="text-xs font-bold rounded-full bg-emerald-50 text-emerald-900 px-2 py-0.5">' + esc(t(FB_KIND[x.kind] || 'fb_main')) + '</span></div>' +
        '<div class="text-xs font-bold text-charcoal/55 mt-0.5">' + esc(t('fb_teacher')) + ': ' + esc(x.by || '') + '</div>' +
        (x.text ? '<div class="mt-2 text-base text-charcoal leading-relaxed whitespace-pre-line">' + esc(x.text) + '</div>' : '') +
        (x.rec ? '<div class="mt-3 rounded-xl bg-gold-50 border border-gold-100 p-3"><div class="text-xs font-extrabold uppercase tracking-wide text-gold-600">' + esc(t('fb_rec')) + '</div><div class="mt-1 text-sm text-charcoal whitespace-pre-line">' + esc(x.rec) + '</div></div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  // Даму картасы: педагогтардың бағасы жиынтықталып көрсетіледі (мұғалімдердің аты көрсетілмейді)
  var CARD_COL = ['', '#E9A23B', '#F2D06B', '#8CC5A8', '#2E7D5B'];
  function mcCard(d){
    var C = window.CARD, T = C.T[lang] || C.T.kz, LV = C.levels[lang] || C.levels.kz, cards = d.cards || [];
    if (!cards.length) return '<p class="text-center text-charcoal/60 py-6">📊 ' + esc(T.cardEmpty) + '</p>';
    if (MC.cardIdx == null || MC.cardIdx >= cards.length) MC.cardIdx = 0;
    var c = cards[MC.cardIdx], A = C.analyse(c.agg || {}, lang), P = (c.agg || {}).params || {};
    var lv = function(a){ return a >= 3.5 ? 4 : a >= 2.75 ? 3 : a >= 2 ? 2 : 1; };
    var chip = function(a){ var l = lv(a); return '<span class="inline-block rounded-full px-2 py-0.5 text-xs font-bold" style="background:' + CARD_COL[l] + ';color:' + (l >= 3 ? '#fff' : '#3b2a00') + '">' + esc(LV[l]) + '</span>'; };
    var list = function(arr){ return arr.length ? '<ul class="list-disc pl-5 space-y-1">' + arr.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p class="text-charcoal/55">' + esc(T.none) + '</p>'; };
    var h = '<div class="flex flex-wrap items-center justify-between gap-3 mb-4"><div class="flex flex-wrap gap-2">' + cards.map(function(x, i){
      return '<button type="button" class="chip' + (i === MC.cardIdx ? ' active' : '') + '" onclick="uiMcCard(' + i + ')">' + esc(C.periodName(x.period, lang)) + '</button>';
    }).join('') + '</div><button type="button" onclick="uiMcCardPrint()" class="bg-emerald-900 hover:bg-emerald-800 text-white font-bold px-5 py-2.5 rounded-full text-sm">🖨 ' + esc(T.print) + '</button></div>';
    var rows = '';
    C.groups.forEach(function(g){
      var ps = C.params.filter(function(x){ return x.g === g.k && P[x.k]; });
      if (!ps.length) return;
      rows += '<div class="mt-3 text-xs font-extrabold uppercase tracking-wide text-gold-600">' + esc(g[lang]) + '</div>' + ps.map(function(x){
        return '<div class="flex items-center justify-between gap-3 border-b border-emerald-900/5 py-1.5"><span class="text-sm">' + esc(x[lang]) + '</span>' + chip(P[x.k].avg) + '</div>';
      }).join('');
    });
    var S = (c.agg || {}).subj || {}, srows = Object.keys(S).sort().map(function(k){ return '<div class="flex items-center justify-between gap-3 border-b border-emerald-900/5 py-1.5"><span class="text-sm">' + esc(k) + '</span>' + chip(S[k].avg) + '</div>'; }).join('');
    var recs = A.recs.slice();
    if (A.focus.length) recs.push(T.focusSubj + ': ' + A.focus.join(', ') + '.');
    if (c.concl && c.concl.rec) recs.push(c.concl.rec);
    h += '<p class="text-sm text-charcoal/65 mb-4">🔒 ' + esc(T.sub) + '. ' + esc(t('fb_note')) + '</p>' +
      (!rows && !srows ? '<p class="rounded-2xl bg-gold-50 border border-gold-100 p-4 mb-4">' + esc(T.noRatings) + '</p>' : '') +
      '<div class="grid md:grid-cols-2 gap-5"' + (!rows && !srows ? ' hidden' : '') + '><div class="rounded-2xl border border-emerald-900/10 p-4">' + rows +
      (srows ? '<div class="mt-4 text-xs font-extrabold uppercase tracking-wide text-gold-600">' + esc(T.subjects) + '</div>' + srows : '') + '</div>' +
      '<div class="space-y-4"><div class="rounded-2xl bg-emerald-50/60 p-4"><div class="font-extrabold text-emerald-950 mb-1">💪 ' + esc(T.strong) + '</div>' + list(A.strong.concat(A.good)) + '</div>' +
      '<div class="rounded-2xl bg-gold-50 border border-gold-100 p-4"><div class="font-extrabold text-emerald-950 mb-1">🌱 ' + esc(T.weak) + '</div>' + list(A.weak.concat(A.focus)) + '</div>' +
      (A.interests.length || (d.child.clubs || []).length ? '<div class="rounded-2xl border border-emerald-900/10 p-4 text-sm"><b>' + esc(T.interests) + ':</b> ' + esc(A.interests.join(', ') || '—') + '<br><b>' + esc(T.clubs) + ':</b> ' + esc((d.child.clubs || []).join(', ') || '—') + '</div>' : '') + '</div></div>' +
      (A.summary.length ? '<div class="mt-5"><div class="font-extrabold text-emerald-950 mb-1">' + esc(T.analysis) + '</div><p class="text-base leading-relaxed">' + esc(A.summary.join(' ')) + '</p></div>' : '') +
      (c.concl && c.concl.text ? '<div class="mt-5"><div class="font-extrabold text-emerald-950 mb-1">' + esc(T.teacher) + '</div><p class="whitespace-pre-line">' + esc(c.concl.text) + '</p></div>' : '') +
      '<div class="mt-5"><div class="font-extrabold text-emerald-950 mb-1">' + esc(T.recs) + '</div>' + list(recs) + '</div>' +
      (c.psych ? '<div class="mt-5 rounded-2xl border border-emerald-900/10 p-4"><div class="font-extrabold text-emerald-950 mb-1">' + esc(T.psych) + '</div><p class="whitespace-pre-line">' + esc(c.psych.text) + '</p>' + (c.psych.rec ? '<p class="mt-2 whitespace-pre-line"><b>' + esc(T.recs) + ':</b> ' + esc(c.psych.rec) + '</p>' : '') + '</div>' : '') +
      '<p class="mt-5 text-xs text-charcoal/50">' + esc(T.legal) + '</p>';
    return h;
  }
  window.uiMcCard = function(i){ MC.cardIdx = i; renderMyClass(); };
  window.uiMcCardPrint = function(){
    var cur = MC.codes[MC.cur], d = cur && MC.data[cur.code];
    if (!d || !d.child || !(d.cards || []).length) return;
    var c = d.cards[MC.cardIdx || 0];
    window.CARD_PRINT({lang: lang, name: d.child.name, cls: d.cls, period: c.period, agg: c.agg, concl: c.concl, psych: c.psych, clubs: d.child.clubs || []});
  };
  window.uiMcFbPrint = function(){
    var cur = MC.codes[MC.cur], d = cur && MC.data[cur.code];
    if (!d || !d.child) return;
    window.FB_PRINT({lang: lang, blocks: [{name: d.child.name, cls: d.cls, items: d.feedback || []}]});
  };
  // Ата-ананың хабарламаға тіркелуі (осы құрылғыдан)
  function mcReg(d, inPop){
    var r = d.reg, inp = 'w-full rounded-xl border border-emerald-900/15 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gold';
    var h = inPop ? '' : '<div class="rounded-2xl bg-gold-50 border border-gold-100 p-4 sm:p-5"><div class="font-extrabold text-emerald-950">🔔 ' + esc(t('reg_title')) + '</div><p class="text-sm text-charcoal/70 mt-1">' + esc(t('reg_desc')) + '</p></div>';
    if (r && !MC.regEdit) {
      var chs = [r.ch.wa ? '💬 WhatsApp' : '', r.ch.tg ? '✈️ Telegram' : '', r.ch.email ? '✉️ Email' : ''].filter(Boolean).join(' · ');
      h += '<div class="mt-4 rounded-2xl border border-emerald-900/10 p-4 sm:p-5 space-y-2"><div class="font-extrabold text-emerald-900">✓ ' + esc(t('reg_done')) + '</div>' +
        '<div class="text-sm">' + esc(r.name) + ' · +' + esc(r.phone) + (r.email ? ' · ' + esc(r.email) : '') + '</div>' +
        '<div class="text-sm text-charcoal/70">' + esc(t('reg_channels')) + ': ' + esc(chs || '—') + '</div>';
      if (r.ch.tg && r.tgLink) h += r.tg ? '<div class="text-sm font-bold text-emerald-800">✈️ ' + esc(t('reg_tg_ok')) + ' ✓</div>' :
        '<div class="rounded-xl bg-emerald-50 p-3 text-sm space-y-2"><div class="font-bold">✈️ ' + esc(t('reg_tg_wait')) + '</div><div>' + esc(t('reg_tg_hint')) + '</div>' +
        '<div class="flex flex-wrap gap-2"><a href="' + esc(r.tgLink) + '" target="_blank" rel="noopener" onclick="MC_TG_OPENED()" class="bg-emerald-900 hover:bg-emerald-800 text-white font-bold px-5 py-2 rounded-full">' + esc(t('reg_tg_go')) + '</a>' +
        '<button type="button" onclick="uiRegTg()" class="chip">' + esc(t('reg_tg_check')) + '</button></div></div>';
      h += '<div class="flex flex-wrap gap-2 pt-1"><button type="button" class="chip" onclick="uiRegEdit(1)">' + esc(t('reg_edit')) + '</button><button type="button" class="text-xs font-bold text-charcoal/50 underline" onclick="uiRegOff()">' + esc(t('reg_off')) + '</button></div>' +
        (MC.regMsg ? '<p class="text-sm font-bold text-emerald-800">' + esc(MC.regMsg) + '</p>' : '') + '</div>';
      return h;
    }
    var v = r || {ch: {wa: true}}, ch = v.ch || {};
    var box = function(name, on, label, dis){ return '<label class="flex items-center gap-2 text-sm' + (dis ? ' opacity-40' : '') + '"><input type="checkbox" name="' + name + '"' + (on && !dis ? ' checked' : '') + (dis ? ' disabled' : '') + '> ' + esc(label) + '</label>'; };
    h += '<form onsubmit="return uiRegSave(this)" class="mt-4 rounded-2xl border border-emerald-900/10 p-4 sm:p-5 space-y-3">' +
      '<div class="grid sm:grid-cols-2 gap-3"><input name="name" required maxlength="100" placeholder="' + esc(t('reg_name')) + '" value="' + esc(v.name || '') + '" class="' + inp + '">' +
      '<input name="phone" required type="tel" maxlength="20" placeholder="' + esc(t('reg_phone')) + ': +7 7__ ___ __ __" value="' + esc(v.phone ? '+' + v.phone : '') + '" class="' + inp + '"></div>' +
      '<input name="email" type="email" maxlength="120" placeholder="' + esc(t('reg_email')) + '" value="' + esc(v.email || '') + '" class="' + inp + '">' +
      '<div class="text-sm font-extrabold text-emerald-950">' + esc(t('reg_ch')) + '</div><div class="flex flex-wrap gap-x-5 gap-y-2">' +
      box('wa', ch.wa, '💬 ' + t('reg_wa')) + box('tg', ch.tg, '✈️ ' + t('reg_tg'), !d.tgName) + box('em', ch.email, '✉️ ' + t('reg_mail')) + '</div>' +
      '<label class="flex items-start gap-2 text-xs text-charcoal/75"><input type="checkbox" name="consent" required class="mt-0.5"' + (r ? ' checked' : '') + '> <span>' + esc(t('reg_consent')) + '</span></label>' +
      '<div class="flex flex-wrap items-center gap-2"><button class="bg-emerald-900 hover:bg-emerald-800 text-white font-bold px-6 py-2.5 rounded-full">' + esc(r ? t('reg_update') : t('reg_save')) + '</button>' +
      (r ? '<button type="button" class="chip" onclick="uiRegEdit(0)">✕</button>' : '') + '</div>' +
      (MC.regErr ? '<p class="text-sm font-semibold text-rose-700">' + esc(MC.regErr) + '</p>' : '') + '</form>';
    return h;
  }
  function regCode(){ var cur = MC.codes[MC.cur]; return cur ? cur.code : null; }
  window.uiRegEdit = function(on){ MC.regEdit = !!on; MC.regErr = ''; MC.regMsg = ''; renderMyClass(); };
  window.uiRegSave = function(f){
    var code = regCode(); if (!code) return false;
    var btn = f.querySelector('button'); btn.disabled = true; btn.textContent = t('loading');
    post({a: 'reg', code: code, token: mcToken(), name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(),
      ch: {wa: f.wa.checked, tg: f.tg.checked, email: f.em.checked}, consent: f.consent.checked}).then(function(j){
      if (!j.ok) { MC.regErr = String(j.err).indexOf('CODE') >= 0 ? t('mc_bad') : j.err; renderMyClass(); return; }
      MC.data[code].reg = j.reg; MC.regEdit = false; MC.regErr = ''; MC.regMsg = t('reg_saved');
      try { localStorage.setItem('bs_cls_' + code, JSON.stringify(MC.data[code])); } catch(e) {}
      renderMyClass();
      if (j.reg.ch.tg && !j.reg.tg && j.reg.tgLink) { MC_TG_OPENED(); window.open(j.reg.tgLink, '_blank'); }
    }).catch(function(){ MC.regErr = t('loading'); renderMyClass(); });
    return false;
  };
  window.uiRegTg = function(){
    var code = regCode(); if (!code) return;
    post({a: 'tgCheck', code: code, token: mcToken()}).then(function(j){
      if (j.ok && j.reg) { MC.data[code].reg = j.reg; MC.regMsg = j.reg.tg ? t('reg_tg_ok') + ' ✓' : t('reg_tg_wait'); renderMyClass(); }
    });
  };
  // Telegram-нан бетке оралғанда өзі тексереді
  var tgWaiting = false;
  window.MC_TG_OPENED = function(){ tgWaiting = true; };
  document.addEventListener('visibilitychange', function(){ if (!document.hidden && tgWaiting) { tgWaiting = false; setTimeout(window.uiRegTg, 800); } });
  window.uiRegOff = function(){
    var code = regCode(); if (!code || !confirm(t('reg_off_q'))) return;
    post({a: 'unreg', code: code, token: mcToken()}).then(function(j){ if (j.ok) { MC.data[code].reg = null; MC.regMsg = ''; renderMyClass(); } });
  };
  function renderMyClass(){
    var box = byId('mcBody'); if (!box) return;
    var form = '<form onsubmit="return uiMcEnter(this)" class="flex flex-wrap gap-2 justify-center">' +
      '<input name="code" required autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="' + esc(t('mc_code_ph')) + '" class="w-44 rounded-xl border border-emerald-900/20 px-4 py-3 text-center font-mono text-lg tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-gold">' +
      '<button class="bg-emerald-900 hover:bg-emerald-800 text-white font-bold px-6 py-3 rounded-xl"' + (MC.pending ? ' disabled' : '') + '>' + esc(MC.pending ? t('loading') : t('mc_enter')) + '</button></form>';
    var err = MC.err ? '<p class="mt-3 text-center text-sm font-semibold text-rose-700">' + esc(MC.err) + '</p>' : '';
    if (!MC.codes.length) {
      box.innerHTML = '<div class="bg-white rounded-3xl border border-emerald-900/10 shadow-card p-6 sm:p-8 text-center"><div class="text-4xl">🔐</div><p class="mt-3 text-charcoal/80 max-w-lg mx-auto">' + esc(t('mc_desc')) + '</p><div class="mt-6">' + form + '</div>' + err + '</div>';
      return;
    }
    if (MC.cur >= MC.codes.length || MC.cur < 0) MC.cur = 0;
    var cur = MC.codes[MC.cur], d = MC.data[cur.code];
    if ((MC.tab === 'fb' || MC.tab === 'card') && d && !d.child) MC.tab = 'hw';
    var h = '<div class="flex flex-wrap items-center justify-center gap-2 mb-5">' + MC.codes.map(function(c, i){
      return '<button type="button" class="chip' + (i === MC.cur ? ' active' : '') + '" onclick="uiMcPick(' + i + ')">' + (c.child ? '👧 ' + esc(c.cls) + ' · ' + esc(c.child) : '🏫 ' + esc(c.cls)) + '</button>';
    }).join('') + '<button type="button" class="chip" onclick="uiMcAdd()">' + esc(t('mc_add')) + '</button></div>';
    if (MC.adding) h += '<div class="bg-white rounded-2xl border border-emerald-900/10 p-4 mb-5">' + form + err + '</div>';
    else h += err;
    h += '<div class="bg-white rounded-3xl border border-emerald-900/10 shadow-card p-5 sm:p-8">' +
      '<div class="flex flex-wrap items-start justify-between gap-3 mb-5"><div><div class="text-2xl font-extrabold text-emerald-950">' + esc(cur.cls) + (cur.child ? ' · ' + esc(cur.child) : '') + '</div>' +
      (d && d.teachers && d.teachers.length ? '<div class="text-sm text-charcoal/70">' + esc(t('mc_teacher')) + ': <b>' + esc(d.teachers.join(', ')) + '</b></div>' : '') + '</div>' +
      '<button type="button" class="text-xs font-bold text-charcoal/50 underline" onclick="uiMcRemove()">' + esc(t('mc_remove')) + '</button></div>' +
      '<div class="flex flex-wrap gap-2 mb-6">' + (d && d.child ? [['fb', '📝 ', 'fb_tab'], ['card', '📊 ', 'card_tab']] : []).concat([['hw', '📚 ', 'mc_tab_hw'], ['news', '📸 ', 'mc_tab_news'], ['qa', '💬 ', 'mc_tab_qa'], ['reg', '🔔 ', 'reg_tab']]).map(function(x){
        return '<button type="button" class="chip' + (MC.tab === x[0] ? ' active' : '') + '" onclick="uiMcTab(\'' + x[0] + '\')">' + x[1] + esc(t(x[2])) + '</button>';
      }).join('') + '</div>';
    var pop = regPopNeeded(cur, d);
    h += !d ? '<p class="text-center text-charcoal/60 py-6">' + esc(t('loading')) + '</p>' : MC.tab === 'fb' ? mcFb(d) : MC.tab === 'card' ? mcCard(d) : MC.tab === 'reg' && !pop ? mcReg(d) : MC.tab === 'reg' ? '' : MC.tab === 'hw' ? mcHw(d) : MC.tab === 'news' ? mcNews(d) : mcQa(d);
    box.innerHTML = h + '</div>';
    regPop(pop ? d : null);
  }
  // Баланың жеке сілтемесін алғаш ашқанда тіркелу терезесі шығады («Кейін» басса, 3 күннен кейін қайта сұрайды)
  var REG_LATER_MS = 3 * 864e5;
  function regPopNeeded(cur, d){
    if (!cur || !d || !d.child || d.reg || !MC.fresh || !MC.fresh[cur.code]) return false;
    var later = 0; try { later = +localStorage.getItem('bs_reg_later_' + cur.code) || 0; } catch(e) {}
    return Date.now() - later > REG_LATER_MS;
  }
  function regPop(d){
    var ov = byId('regPop');
    if (!d) { if (ov) { ov.remove(); document.body.style.overflow = ''; } return; }
    if (!ov) { ov = document.createElement('div'); ov.id = 'regPop'; ov.className = 'fixed inset-0 z-[70] bg-black/50 flex items-start sm:items-center justify-center p-3 overflow-y-auto'; document.body.appendChild(ov); document.body.style.overflow = 'hidden'; }
    ov.innerHTML = '<div class="bg-white rounded-3xl shadow-card w-full max-w-lg p-4 sm:p-6 my-4" role="dialog" aria-modal="true">' +
      '<div class="text-xl font-extrabold text-emerald-950">👋 ' + esc(t('reg_pop_title')) + '</div>' +
      '<p class="mt-2 text-sm text-charcoal/75">' + esc(t('reg_pop_desc').replace('{child}', d.child.name).replace('{cls}', d.cls)) + '</p>' +
      mcReg(d, true) +
      '<div class="mt-3 text-center"><button type="button" onclick="uiRegLater()" class="text-sm font-bold text-charcoal/55 underline">' + esc(t('reg_later')) + '</button></div></div>';
  }
  window.uiRegLater = function(){
    var cur = MC.codes[MC.cur]; if (!cur) return;
    try { localStorage.setItem('bs_reg_later_' + cur.code, String(Date.now())); } catch(e) {}
    if (MC.fresh) MC.fresh[cur.code] = false;
    renderMyClass();
  };
  window.uiMcEnter = function(f){
    var code = String(f.code.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code) { MC.err = ''; mcLoad(code, true); }
    return false;
  };
  window.uiMcPick = function(i){ MC.cur = i; MC.hwDate = null; MC.sent = false; MC.err = ''; if (MC.codes[i].child) MC.tab = 'fb'; renderMyClass(); mcLoad(MC.codes[i].code); };
  window.uiMcAdd = function(){ MC.adding = !MC.adding; MC.err = ''; renderMyClass(); };
  window.uiMcRemove = function(){
    var cur = MC.codes[MC.cur]; if (!cur) return;
    if (!confirm(t('mc_remove') + ' (' + cur.cls + ')?')) return;
    MC.codes.splice(MC.cur, 1); mcSave(); MC.cur = 0; MC.hwDate = null;
    try { localStorage.removeItem('bs_cls_' + cur.code); } catch(e) {}
    renderMyClass();
  };
  window.uiMcNewsMonth = function(m){ MC.newsMonth = m; renderMyClass(); };
  window.uiMcTab = function(tab){ MC.tab = tab; MC.sent = false; renderMyClass(); };
  window.uiMcHwDay = function(n){
    var d = MC.hwDate;
    do { d = addDays(d, n); } while (parse(d).getDay() === 0 || parse(d).getDay() === 6);
    MC.hwDate = d; renderMyClass();
  };
  window.uiMcHwToday = function(){ MC.hwDate = today(); renderMyClass(); };
  window.uiMcAsk = function(f){
    var cur = MC.codes[MC.cur]; if (!cur) return false;
    var name = f.name.value.trim(), child = f.child.value.trim(), text = f.q.value.trim();
    if (!name || !text) return false;
    try { localStorage.setItem('bs_parent', JSON.stringify({name: name, child: child})); } catch(e) {}
    var btn = f.querySelector('button'); btn.disabled = true; btn.textContent = t('loading');
    post({a:'ask', code: cur.code, name: name, child: child, text: text, token: mcToken()}).then(function(j){
      if (!j.ok) { MC.err = String(j.err).indexOf('CODE') >= 0 ? t('mc_bad') : j.err; renderMyClass(); return; }
      MC.sent = true; mcLoad(cur.code);
    }).catch(function(){ btn.disabled = false; btn.textContent = t('qa_send'); });
    return false;
  };
  function hashTab(){
    var hsh = location.hash;
    var code = (hsh.match(/^#c=([A-Za-z0-9]+)/) || [])[1];
    if (code) {
      history.replaceState(null, '', location.pathname + location.search + '#myclass');
      mcLoad(code.toUpperCase(), true);
      var s0 = byId('myclass'); if (s0) s0.scrollIntoView();
      return;
    }
    if (hsh === '#homework') { MC.tab = 'hw'; renderMyClass(); var s1 = byId('myclass'); if (s1) s1.scrollIntoView(); return; }
    var m = {'#menu':'menu', '#week':'week'}[hsh];
    if (m) { dailyTab = m; renderDaily(); var s = byId('daily'); if (s) s.scrollIntoView(); }
  }
  window.addEventListener('hashchange', hashTab);

  // ---------- тіл, мәзір, өтінім формасы ----------
  function renderAll(){
    applyTexts(); renderContacts(); renderImages(); renderDay(); renderGallery();
    renderFaq(); renderTeam(); renderNews(); renderDaily(); renderMyClass();
  }
  window.uiSetLang = function(l){
    lang = I18N[l] ? l : 'kz';
    try { localStorage.setItem('bs_lang', lang); } catch(e) {}
    document.querySelectorAll('.lang-btn').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-lang') === lang); });
    document.querySelectorAll('.lang-btn-m').forEach(function(b){
      var on = b.getAttribute('data-lang') === lang;
      b.style.background = on ? '#0F382C' : '#EAF1EE';
      b.style.color = on ? '#fff' : '#0F382C';
    });
    renderAll();
  };
  window.uiToggleMobileMenu = function(){
    var menu = byId('mobileMenu'), btn = byId('mobileToggleBtn');
    var open = menu.classList.toggle('hidden-panel') === false;
    btn.querySelector('.mobile-menu-icon-open').style.display = open ? 'none' : 'block';
    btn.querySelector('.mobile-menu-icon-close').style.display = open ? 'block' : 'none';
  };
  window.uiCloseMobileMenu = function(){
    byId('mobileMenu').classList.add('hidden-panel');
    var btn = byId('mobileToggleBtn');
    btn.querySelector('.mobile-menu-icon-open').style.display = 'block';
    btn.querySelector('.mobile-menu-icon-close').style.display = 'none';
  };
  var leadForm = byId('leadFormEl');
  if (leadForm) leadForm.addEventListener('submit', function(e){
    e.preventDefault();
    var n = byId('leadName').value.trim(), p = byId('leadPhone').value.trim(), m = byId('leadMsg').value.trim();
    if (!n || !p) { byId('leadName').reportValidity(); byId('leadPhone').reportValidity(); return; }
    var greet = lang === 'kz' ? 'Сәлеметсіз бе! Менің атым - ' : lang === 'ru' ? 'Здравствуйте! Меня зовут ' : 'Hello! My name is ';
    var text = greet + n + '. ' + (lang === 'en' ? 'Phone' : 'Телефон') + ': ' + p + (m ? ('. ' + m) : '');
    window.open('https://wa.me/' + (digits(get('contacts').whatsapp) || '77009786500') + '?text=' + encodeURIComponent(text), '_blank');
  });

  // ---------- деректерді жүктеу ----------
  var cached = null;
  try { cached = localStorage.getItem('bs_data'); if (cached) data = JSON.parse(cached) || {}; } catch(e) { data = {}; }
  window.uiSetLang(lang);
  hashTab();
  if (MC.codes.length && !/^#c=/.test(location.hash)) mcLoad(MC.codes[MC.cur].code);
  if (API) {
    fetch(API + '?a=data', {cache:'no-store'}).then(function(r){ return r.text(); }).then(function(txt){
      var j = JSON.parse(txt);
      if (!j.ok || !j.data) return;
      var s = JSON.stringify(j.data);
      if (s === cached) return;
      data = j.data;
      try { localStorage.setItem('bs_data', s); } catch(e) {}
      renderAll();
    }).catch(function(){});
  }
})();
