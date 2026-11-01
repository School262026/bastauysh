// Нұсқаулық беттері: тіл ауыстыру (?lang=ru немесе #ru-… сілтемесі орысша ашады)
(function () {
  var btns = document.querySelectorAll('.tabs button'), pages = document.querySelectorAll('main[data-l]');
  function set(l) {
    pages.forEach(function (m) { m.hidden = m.getAttribute('data-l') !== l; });
    btns.forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-lang') === l)); });
    document.documentElement.lang = l === 'ru' ? 'ru' : 'kk';
    try { localStorage.setItem('guide_lang', l); } catch (e) {}
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { set(b.getAttribute('data-lang')); }); });
  var q = /[?&]lang=(kz|ru)/.exec(location.search), h = /^#(kz|ru)-/.exec(location.hash), saved = null;
  try { saved = localStorage.getItem('guide_lang'); } catch (e) {}
  set(q ? q[1] : h ? h[1] : saved === 'ru' ? 'ru' : 'kz');
})();
