// The boards' Light/Dark switch (every mock screen is drawn once and flipped between its two token sets) and the
// collapsible menu, copied in spirit from the host-management boards.
(function () {
  var M = /^(hq|fc)-(l|d)$/;
  function base(el) { for (var i = 0; i < el.classList.length; i++) { var m = el.classList[i].match(M); if (m) return m; } return null; }
  function theme(t) {
    document.querySelectorAll('.bd-main .fs').forEach(function (f) { var m = base(f); if (m) { f.classList.remove(m[0]); f.classList.add(m[1] + '-' + t); } });
    document.querySelectorAll('.bd-th button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); });
    document.documentElement.classList.toggle('bd-dark', t === 'd');
    document.documentElement.classList.toggle('bd-light', t !== 'd');
    try { localStorage.setItem('bd-theme', t); } catch (e) {}
  }
  var t = 'l'; try { t = localStorage.getItem('bd-theme') || 'l'; } catch (e) {}
  theme(t);
  document.querySelectorAll('.bd-th button').forEach(function (b) { b.addEventListener('click', function () { theme(b.dataset.t); }); });

  var open = {}; try { open = JSON.parse(sessionStorage.getItem('bd-open') || '{}'); } catch (e) {}
  function save() { try { sessionStorage.setItem('bd-open', JSON.stringify(open)); } catch (e) {} }
  document.querySelectorAll('.bd-g').forEach(function (g) {
    var name = g.querySelector('.bd-gh span').textContent;
    if (open[name]) g.classList.add('open');
    g.querySelector('.bd-gh').addEventListener('click', function () { g.classList.toggle('open'); open[name] = g.classList.contains('open'); save(); });
  });
  // The menu marks the board open now, and opens its group.
  var here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.bd-gl a').forEach(function (a) {
    var href = a.getAttribute('href').split('#')[0];
    if (href === here && !a.getAttribute('href').includes('#')) { a.classList.add('bd-on'); var g = a.closest('.bd-g'); if (g) g.classList.add('open'); }
  });
})();
