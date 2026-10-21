// Host management design boards: Light/Dark switch, one screen per light/dark pair, collapsible menu.
(function () {
  var nav = document.querySelector('.bd-nav'), sc = nav.closest('.main') || document.documentElement;
  function fill() { if (window.innerWidth > 800) { nav.style.height = sc.clientHeight + 'px'; nav.style.maxHeight = sc.clientHeight + 'px'; } else { nav.style.height = ''; nav.style.maxHeight = ''; } }
  fill(); window.addEventListener('resize', fill);
  var M = /^(hm|hq|cl)-(l|d)$/;
  function base(el) { for (var i = 0; i < el.classList.length; i++) { var m = el.classList[i].match(M); if (m) return m; } return null; }
  function norm(el) { return el.textContent.replace(/·\s*(Light|Dark)/g, '').replace(/\s+/g, ' ').trim(); }
  var seen = new Set();
  document.querySelectorAll('.bd-main .fs').forEach(function (f) {
    var p = f.parentElement; if (seen.has(p)) return; seen.add(p);
    var k = [].filter.call(p.children, function (c) { return c.classList.contains('fs'); });
    var wrap = null;
    if (k.length < 2 && !f.classList.contains('bd-dup')) {
      // a pair whose frames each sit in their own wrapper with a Light/Dark caption
      var g = p.parentElement, kids = g ? [].filter.call(g.children, function (c) { return c.tagName === 'DIV'; }) : [];
      if (kids.length === 2 && kids.every(function (c) { return c.querySelectorAll('.fs').length === 1; })) {
        seen.add(g); k = kids.map(function (c) { return c.querySelector('.fs'); }); wrap = kids; p = g;
      }
    }
    if (k.length !== 2) return;
    var a = base(k[0]), b = base(k[1]);
    if (a && b && a[1] === b[1] && a[2] !== b[2] && norm(k[0]) === norm(k[1])) { var d = a[2] === 'd' ? 0 : 1; (wrap ? wrap[d] : k[d]).classList.add('bd-dup'); p.classList.add('bd-one'); if (wrap) wrap[1 - d].classList.add('bd-solo'); }
  });
  document.querySelectorAll('.bd-main .fs .chrome span').forEach(function (s) { s.textContent = s.textContent.replace(/\s*·\s*(Light|Dark)\s*$/, ''); });
  function theme(t) {
    document.querySelectorAll('.bd-main .fs:not(.bd-dup)').forEach(function (f) { var m = base(f); if (m) { f.classList.remove(m[0]); f.classList.add(m[1] + '-' + t); } });
    document.querySelectorAll('.bd-th button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); });
    document.documentElement.classList.toggle('bd-dark', t === 'd'); document.documentElement.classList.toggle('bd-light', t !== 'd');
    try { localStorage.setItem('bd-theme', t); } catch (e) {}
  }
  var t = 'l'; try { t = localStorage.getItem('bd-theme') || 'l'; } catch (e) {}
  theme(t);
  document.querySelectorAll('.bd-th button').forEach(function (b) { b.addEventListener('click', function () { theme(b.dataset.t); }); });
  var open = {}; try { open = JSON.parse(sessionStorage.getItem('bd-open') || '{}'); } catch (e) {}
  var groups = document.querySelectorAll('.bd-g');
  function save() { try { sessionStorage.setItem('bd-open', JSON.stringify(open)); } catch (e) {} }
  groups.forEach(function (g) {
    var name = g.querySelector('.bd-gh span').textContent;
    if (open[name]) g.classList.add('open');
    g.querySelector('.bd-gh').addEventListener('click', function () { g.classList.toggle('open'); open[name] = g.classList.contains('open'); save(); });
  });
  function reveal() { var a = document.querySelector('.bd-nav a.bd-on'); if (a) { var g = a.closest('.bd-g'); if (g && !g.classList.contains('open')) { g.classList.add('open'); open[g.querySelector('.bd-gh span').textContent] = true; save(); } } }
  reveal(); document.addEventListener('click', function (e) { if (e.target.closest('a[href^="#"]')) setTimeout(reveal, 0); });
})();
