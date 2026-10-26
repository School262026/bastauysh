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
    if (data[key] !== undefined && data[key] !== null) return data[key];
    return D[key] ? D[key]() : null;
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
  function renderNews(){
    var tabs = byId('newsTabs'), list = byId('newsList'), more = byId('newsMore');
    if (!list) return;
    var all = sortedPosts();
    var counts = {};
    all.forEach(function(p){ counts[p.cat] = (counts[p.cat] || 0) + 1; });
    tabs.innerHTML = CATS.filter(function(c){ return c === 'all' || counts[c]; }).map(function(c){
      return '<button type="button" class="chip' + (c === newsCat ? ' active' : '') + '" onclick="uiNewsCat(\'' + c + '\')">' + esc(t('cat_' + c)) + '</button>';
    }).join('');
    var posts = all.filter(function(p){ return newsCat === 'all' || p.cat === newsCat; });
    if (!posts.length) { list.innerHTML = '<p class="md:col-span-2 lg:col-span-3 text-center text-charcoal/60">' + esc(t('news_empty')) + '</p>'; more.classList.add('hidden-panel'); return; }
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
  window.uiNewsMore = function(){ newsShown += 6; renderNews(); };
  window.uiReadMore = function(btn){
    var body = btn.previousElementSibling;
    var open = body.classList.toggle('clamp') === false;
    btn.textContent = open ? t('read_less') : t('read_more');
  };

  // ---------- күнделікті: ас мәзірі, үй тапсырмасы, апта жоспары ----------
  var dailyTab = 'menu';
  var menuDate = null, hwClass = null, hwDate = null, weekStart = null;
  try { hwClass = localStorage.getItem('bs_class'); } catch(e) {}
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
    var menu = get('menu') || {};
    var meals = (get('settings').meals) || [];
    if (!menuDate) menuDate = schoolDay(today());
    var mon = monday(menuDate);
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
        return '<li class="flex gap-4 py-3 border-b border-emerald-900/10 last:border-0"><span class="w-36 shrink-0 text-sm font-extrabold uppercase tracking-wide text-gold-600">' + esc(L(meals[i]) || ('#' + (i + 1))) + '</span><span class="text-base font-medium text-charcoal whitespace-pre-line">' + esc(txt) + '</span></li>';
      }).join('');
      if (rows) h += '<ul>' + rows + '</ul>';
      if (L(m.note)) h += '<p class="mt-4 text-sm text-charcoal/75"><b>' + esc(t('menu_note')) + ':</b> ' + esc(L(m.note)) + '</p>';
      if (m.img) { LISTS.menu = [{t:'img', id:m.img}]; h += '<div class="mt-5 max-w-md mx-auto">' + mediaThumb({t:'img', id:m.img}, '', 'uiOpenList(\'menu\',0)') + '</div>'; }
    }
    return h;
  }
  window.uiMenuDay = function(d){ menuDate = d; renderDaily(); };
  window.uiMenuWeek = function(n){ menuDate = addDays(monday(menuDate), 7 * n); renderDaily(); };
  window.uiMenuToday = function(){ menuDate = schoolDay(today()); renderDaily(); };

  function hwFor(cls){
    return (get('homework') || []).filter(function(h){ var c = h.cls || []; return c.indexOf('*') >= 0 || c.indexOf(cls) >= 0; });
  }
  function renderHw(){
    var classes = (get('settings').classes) || [];
    var h = '<p class="text-center text-sm font-bold text-charcoal/70 mb-3">' + esc(t('hw_pick_class')) + '</p><div class="flex flex-wrap justify-center gap-1.5 mb-6">' + classes.map(function(c){
      return '<button type="button" class="chip" style="padding:.35rem .7rem" ' + (c === hwClass ? 'data-on="1"' : '') + ' onclick="uiHwClass(\'' + esc(c) + '\')">' + esc(c) + '</button>';
    }).join('') + '</div>';
    h = h.replace(/class="chip" style="padding:.35rem .7rem" data-on="1"/g, 'class="chip active" style="padding:.35rem .7rem"');
    if (!hwClass) return h;
    var items = hwFor(hwClass);
    if (!hwDate) {
      var t0 = today();
      var past = items.filter(function(x){ return x.date <= t0; }).map(function(x){ return x.date; }).sort();
      hwDate = past.length && past[past.length - 1] >= addDays(t0, -14) ? past[past.length - 1] : t0;
    }
    var dates = {};
    items.forEach(function(x){ dates[x.date] = 1; });
    h += navBtns('uiHwDay(-1)', 'uiHwDay(1)', esc(hwClass + ' · ' + fmtDate(hwDate, true)), 'uiHwToday()');
    var list = items.filter(function(x){ return x.date === hwDate; });
    if (!list.length) h += '<p class="text-center text-charcoal/60 py-6">📚 ' + esc(t('hw_empty')) + '</p>';
    else h += '<div class="space-y-3">' + list.map(function(x){
      return '<div class="rounded-2xl border border-emerald-900/10 bg-emerald-50/40 p-4"><div class="font-extrabold text-emerald-950">' + esc(L(x.subject)) + '</div><div class="rich mt-1 text-base text-charcoal leading-relaxed">' + clean(L(x.text)) + '</div>' + mediaRow(x.media, 'hw_' + x.id) + '</div>';
    }).join('') + '</div>';
    return h;
  }
  window.uiHwClass = function(c){ hwClass = c; hwDate = null; try { localStorage.setItem('bs_class', c); } catch(e) {} renderDaily(); };
  window.uiHwDay = function(n){
    var d = hwDate;
    do { d = addDays(d, n); } while (parse(d).getDay() === 0 || parse(d).getDay() === 6);
    hwDate = d; renderDaily();
  };
  window.uiHwToday = function(){ hwDate = today(); renderDaily(); };

  function renderWeek(){
    if (!weekStart) weekStart = monday(today());
    var end = addDays(weekStart, 6);
    var ev = (get('week') || []).filter(function(x){ return x.date >= weekStart && x.date <= end; });
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
    body.innerHTML = dailyTab === 'menu' ? renderMenu() : dailyTab === 'hw' ? renderHw() : renderWeek();
  }
  window.uiDailyTab = function(tab){ dailyTab = tab; renderDaily(); };
  function hashTab(){
    var m = {'#menu':'menu', '#homework':'hw', '#week':'week'}[location.hash];
    if (m) { dailyTab = m; renderDaily(); var s = byId('daily'); if (s) s.scrollIntoView(); }
  }
  window.addEventListener('hashchange', hashTab);

  // ---------- тіл, мәзір, өтінім формасы ----------
  function renderAll(){
    applyTexts(); renderContacts(); renderImages(); renderDay(); renderGallery();
    renderFaq(); renderTeam(); renderNews(); renderDaily();
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
