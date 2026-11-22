// Demo only. Loaded before each screen's own code. Sends the screen's API calls and
// live updates to the in-browser engine on the demo page instead of to the box.
(function () {
  function host() {
    try {
      if (window.parent && window.parent !== window && window.parent.BOBCAT) return window.parent.BOBCAT;
      if (window.opener && window.opener.BOBCAT) return window.opener.BOBCAT;
    } catch (e) { /* not reachable */ }
    return null;
  }
  window.BOBCAT = host();
  const realFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    init = init || {};
    const url = typeof input === 'string' ? input : input.url;
    const i = url.indexOf('/api/');
    if (i < 0) return realFetch(input, init);
    const B = host();
    const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (!B) return json(503, { error: 'Open this from the demo page' });
    let body;
    try { body = init.body ? JSON.parse(init.body) : undefined; } catch (e) { return json(400, { error: 'Bad JSON' }); }
    const r = B.handle(String(init.method || 'GET').toUpperCase(), url.slice(i), body);
    if (r.raw != null) return new Response(r.raw, { status: r.status, headers: { 'Content-Type': r.type } });
    return json(r.status, JSON.parse(JSON.stringify(r.data)));
  };

  window.EventSource = function () {
    const handlers = {};
    const B = host();
    const off = B ? B.subscribe(function (d) {
      (handlers.change || []).forEach(function (f) { f({ data: JSON.stringify(d) }); });
    }) : null;
    window.addEventListener('pagehide', function () { if (off) off(); });
    this.addEventListener = function (type, fn) { (handlers[type] = handlers[type] || []).push(fn); };
    this.close = function () { if (off) off(); };
    this.onerror = null;
  };

  // Links between screens switch tabs on the demo page instead of opening new windows.
  document.addEventListener('click', function (e) {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    const m = /^(rack|tv|coach)\.html(?:\?rack=(\d+))?/.exec(href);
    const B = host();
    if (m && B && B.show) { e.preventDefault(); B.show(m[1] === 'rack' ? `rack${m[2] || 1}` : m[1]); return; }
    if (href.indexOf('/api/') >= 0) { e.preventDefault(); if (B && B.toast) B.toast('Downloads work on the real box. The demo keeps everything in this tab.'); }
  }, true);
})();
