// Temporary verification harness: serves web/index.html on a random port and
// dumps the rendered DOM (plus screenshots) for key routes via headless Chrome.
// Injects a page-error trap so JS exceptions show up in the dumped DOM.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outDir = path.join(__dirname, '.verify');
fs.mkdirSync(outDir, { recursive: true });

const routes = [
  ['', 'signals'],
  ['#/profile', 'profile'],
  ['#/notifications', 'notifications'],
  ['#/household', 'household'],
  ['#/household/join', 'household-join'],
  ['#/watchlist', 'watchlist'],
  ['#/home', 'home'],
  ['#/product/9310640020223', 'product'],       // fixture product with offers
  ['#/product/9310072011722', 'product-off'],   // non-fixture → live OFF lookup
  ['#/history/9310640020223', 'history'],
  ['#/scan', 'scan'],
  ['?auto=share#/product/9310640020223', 'auto-share'], // scripted end-to-end flow
  ['?auto=prefs#/notifications', 'auto-prefs'],           // scripted preference decisions
  ['?auto=theme#/profile', 'auto-theme'],                 // scripted theme + palette switching
];

const ERR_TRAP = `<script>
(function(){
  window.__errs = [];
  function report(msg){ window.__errs.push(msg); paint(); }
  function paint(){
    var d = document.getElementById('js-errors');
    if (!d) { d = document.createElement('div'); d.id = 'js-errors'; (document.body||document.documentElement).appendChild(d); }
    d.textContent = 'JS_ERRORS:' + JSON.stringify(window.__errs);
  }
  window.addEventListener('error', function(e){ report((e.message||'error') + ' @' + (e.filename||'')+':'+ (e.lineno||0)); });
  window.addEventListener('unhandledrejection', function(e){ report('rejection: ' + String(e.reason)); });
  setInterval(paint, 300);
})();
</script>`;

// Layout audit: horizontal overflow and elements wider than the phone viewport.
// Written into #visual-audit so the harness can assert on it from the dumped DOM.
const VISUAL_AUDIT = `<script>
(function () {
  function audit() {
    var d = document.getElementById('visual-audit');
    if (!d) { d = document.createElement('div'); d.id = 'visual-audit'; (document.body || document.documentElement).appendChild(d); }
    var de = document.documentElement;
    var vw = window.innerWidth;
    var wide = [];
    function inScroller(el) {
      var p = el.parentElement;
      while (p && p !== document.body) {
        var ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
        p = p.parentElement;
      }
      return false;
    }
    document.querySelectorAll('#app *, .tabbar *').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.width > vw + 1 && !inScroller(el)) wide.push(el.tagName + '.' + String(el.className || '').slice(0, 24));
    });
    d.textContent = 'VISUAL:' + JSON.stringify({
      hscroll: de.scrollWidth > vw + 1,
      vw: vw,
      wide: wide.slice(0, 6),
      empty: !document.getElementById('app') || document.getElementById('app').textContent.trim().length < 20,
    });
  }
  setInterval(audit, 400);
})();
</script>`;

// Scripted end-to-end flow used by the `?auto=share` route: create a household,
// watch a fixture product with "Share with household" on, then assert both the
// watchlist badge and the household's "Shared by you" list.
const SCENARIO = `<script>
(async function () {
  if (/auto=theme/.test(location.search)) {
    try {
      var log = [];
      var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
      async function until(fn, tries) {
        tries = tries || 60;
        for (var i = 0; i < tries; i++) { if (fn()) return true; await sleep(100); }
        return false;
      }
      if (!await until(function () { return document.querySelector('[data-theme-set="light"]'); })) throw new Error('profile never rendered');
      log.push('initial-theme=' + document.documentElement.dataset.theme);
      document.querySelector('[data-theme-set="light"]').click();
      if (!await until(function () { return document.documentElement.dataset.theme === 'light'; })) throw new Error('light theme not applied');
      log.push('light-theme=true');

      var before = document.documentElement.dataset.palette;
      var chips = document.querySelectorAll('.palette-chip');
      log.push('palette-chips=' + chips.length);
      var other = null;
      chips.forEach(function (c) { if (!other && c.dataset.paletteId !== before) other = c; });
      if (other) other.click();
      if (!await until(function () { return document.documentElement.dataset.palette !== before; })) throw new Error('palette not applied');
      log.push('palette-switched=' + document.documentElement.dataset.palette);

      // Dark mode again, and the choice must survive a reload.
      document.querySelector('[data-theme-set="dark"]').click();
      await until(function () { return document.documentElement.dataset.theme === 'dark'; });
      log.push('dark-restored=true');

      var d = document.createElement('div');
      d.id = 'scenario-log';
      d.textContent = 'SCENARIO:' + JSON.stringify(log);
      document.body.appendChild(d);
    } catch (e) {
      var d2 = document.createElement('div');
      d2.id = 'scenario-log';
      d2.textContent = 'SCENARIO:' + JSON.stringify(['ERROR: ' + (e && e.message)]);
      document.body.appendChild(d2);
    }
    return;
  }
  if (!/auto=share/.test(location.search)) return;
  var log = [];
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  async function until(fn, tries) {
    tries = tries || 60;
    for (var i = 0; i < tries; i++) { if (fn()) return true; await sleep(100); }
    return false;
  }
  try {
    location.hash = '#/household';
    if (!await until(function () { return document.getElementById('hh-create'); })) throw new Error('household screen never rendered');
    document.getElementById('hh-name').value = 'The Verify household';
    document.getElementById('hh-create').click();
    if (!await until(function () { return document.getElementById('hh-invite'); })) throw new Error('household not created');
    log.push('household-created');

    location.hash = '#/product/9310640020223';
    if (!await until(function () { return document.getElementById('share-household'); })) throw new Error('share switch missing');
    var cb = document.getElementById('share-household');
    log.push('share-enabled=' + !cb.disabled);
    cb.checked = true;
    document.getElementById('save-rule').click();
    if (!await until(function () { var s = document.getElementById('rule-status'); return s && /Saved/.test(s.textContent); })) throw new Error('rule not saved');
    log.push('watch-saved');

    location.hash = '#/watchlist';
    if (!await until(function () { var a = document.getElementById('app'); return a && /visible to your household/.test(a.textContent); })) throw new Error('watchlist shared badge missing');
    log.push('watchlist-badge=ok');

    location.hash = '#/household';
    if (!await until(function () { var a = document.getElementById('app'); return a && /Shared by you/.test(a.textContent); })) throw new Error('household shared section missing');
    var appText = document.getElementById('app').textContent;
    log.push('shared-by-you-list=' + !/Nothing shared yet/.test(appText));
    log.push('shared-item=' + /Tomato Pasta Sauce/.test(appText));

    // Member management: invite, simulated acceptance, ownership transfer.
    var inviteBtn = document.getElementById('hh-invite');
    if (inviteBtn) inviteBtn.click();
    if (!await until(function () { return document.getElementById('hh-simulate'); })) throw new Error('simulate-join button missing');
    document.getElementById('hh-simulate').click();
    if (!await until(function () { return document.querySelectorAll('#app .member-list li').length >= 2; })) throw new Error('second member was not added');
    log.push('member-added=true');

    var transferBtn = document.querySelector('[data-transfer]');
    log.push('transfer-btn=' + Boolean(transferBtn));
    if (transferBtn) transferBtn.click();
    function youRow() {
      var found = null;
      document.querySelectorAll('#app .member-list li').forEach(function (li) {
        if (li.textContent.indexOf('(you)') >= 0) found = li;
      });
      return found;
    }
    if (!await until(function () { var row = youRow(); return row && row.querySelector('.role-tag').textContent === 'member'; })) throw new Error('ownership was not transferred');
    log.push('ownership-transferred=true');
    log.push('single-owner=' + (document.querySelectorAll('#app .role-tag.owner').length === 1));
  } catch (e) {
    log.push('ERROR: ' + (e && e.message));
  }
  var d = document.createElement('div');
  d.id = 'scenario-log';
  d.textContent = 'SCENARIO:' + JSON.stringify(log);
  document.body.appendChild(d);
})();
</script>`;

// Scripted preference flow for the `?auto=prefs` route: toggle the master switch,
// enable quiet hours covering "now", and check the dry-run decisions.
const PREF_SCENARIO = `<script>
(async function () {
  if (!/auto=prefs/.test(location.search)) return;
  var log = [];
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  async function until(fn, tries) {
    tries = tries || 60;
    for (var i = 0; i < tries; i++) { if (fn()) return true; await sleep(100); }
    return false;
  }
  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }
  function appText() { var a = document.getElementById('app'); return a ? a.textContent : ''; }
  function decision(i) { var d = document.querySelectorAll('#app .decision')[i]; return d ? d.textContent.replace(/\\s+/g, ' ').trim() : 'missing'; }
  try {
    if (!await until(function () { return document.querySelector('[data-pref="global_enabled"]'); })) throw new Error('notifications screen never rendered');
    log.push('initial-routine=' + /Deliver/.test(decision(0)));
    log.push('initial-high=' + /Deliver/.test(decision(1)));

    var g = document.querySelector('[data-pref="global_enabled"]');
    g.checked = false; fire(g, 'change');
    if (!await until(function () { return /Push notifications are off globally/.test(appText()); })) throw new Error('global-off decision missing');
    log.push('global-off=ok');
    log.push('others-disabled=' + document.querySelector('[data-pref="digest_mode"]').disabled);
    log.push('routine-held=' + /Hold/.test(decision(0)));

    g = document.querySelector('[data-pref="global_enabled"]');
    g.checked = true; fire(g, 'change');
    if (!await until(function () { return !/Push notifications are off globally/.test(appText()); })) throw new Error('global-on not applied');

    var q = document.querySelector('[data-pref="quiet_hours_enabled"]');
    q.checked = true; fire(q, 'change');
    if (!await until(function () { var t = document.getElementById('qh-start'); return t && !t.disabled; })) throw new Error('quiet-hour inputs stayed disabled');
    log.push('quiet-inputs-enabled=ok');

    var now = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var start = pad((now.getHours() + 23) % 24) + ':' + pad(now.getMinutes());
    var end = pad((now.getHours() + 1) % 24) + ':' + pad(now.getMinutes());
    var s = document.getElementById('qh-start'); s.value = start; fire(s, 'change');
    if (!await until(function () { return document.getElementById('qh-start').value === start; })) throw new Error('start time not saved');
    var e2 = document.getElementById('qh-end'); e2.value = end; fire(e2, 'change');
    if (!await until(function () { return document.getElementById('qh-end').value === end; })) throw new Error('end time not saved');
    log.push('quiet-window=' + start + '-' + end);
    log.push('d0=' + decision(0));
    log.push('d1=' + decision(1));
    log.push('routine-in-quiet=' + (/Hold/.test(decision(0)) && /quiet hours/.test(decision(0))));
    log.push('high-value-override=' + (/Deliver/.test(decision(1)) && /overriding quiet hours/.test(decision(1))));

    var c = document.getElementById('cooldown-input');
    c.value = '200'; fire(c, 'change');
    if (!await until(function () { return document.getElementById('cooldown-input').value === '168'; })) throw new Error('cooldown not clamped');
    log.push('cooldown-clamped=ok');

    log.push('cat-chips=' + document.querySelectorAll('[data-mute-cat]').length);
    log.push('ret-chips=' + document.querySelectorAll('[data-mute-retailer]').length);
    document.querySelector('[data-mute-cat="grocery"]').click();
    if (!await until(function () { var ch = document.querySelector('[data-mute-cat="grocery"]'); return ch && ch.getAttribute('aria-pressed') === 'true'; })) throw new Error('category chip did not mute');
    log.push('cat-muted=true');
    if (!await until(function () { return document.getElementById('app').textContent.indexOf('category is muted') >= 0; })) throw new Error('muted-channel dry-run decision missing');
    log.push('channel-decision=true');
    document.querySelector('[data-mute-cat="grocery"]').click();
    if (!await until(function () { var ch = document.querySelector('[data-mute-cat="grocery"]'); return ch && ch.getAttribute('aria-pressed') === 'false'; })) throw new Error('category chip did not unmute');
    log.push('cat-unmuted=true');

    var retailerChip = document.querySelector('[data-mute-retailer="coles"]');
    log.push('retailer-chip=' + Boolean(retailerChip));
    if (retailerChip) {
      retailerChip.click();
      if (!await until(function () { return document.getElementById('app').textContent.indexOf('retailer is muted') >= 0; })) throw new Error('muted-retailer dry-run decision missing');
      log.push('retailer-decision=true');
      document.querySelector('[data-mute-retailer="coles"]').click();
    }
  } catch (err) {
    log.push('ERROR: ' + (err && err.message));
  }
  var d = document.createElement('div');
  d.id = 'scenario-log';
  d.textContent = 'SCENARIO:' + JSON.stringify(log);
  document.body.appendChild(d);
})();
</script>`;

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
  .replace('</head>', VISUAL_AUDIT + PREF_SCENARIO + SCENARIO + ERR_TRAP + '</head>');

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(html);
});

function runChrome(args, timeoutMs) {
  return new Promise((resolve) => {
    const child = cp.spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { try { child.kill(); } catch (e) {} resolve({ code: 'TIMEOUT', out, err }); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: 'SPAWN_ERR', out, err: String(e) }); });
  });
}

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const only = process.argv[2];
  let failed = 0;
  for (const [hash, name] of routes) {
    if (only && name !== only) continue;
    const url = `http://127.0.0.1:${port}/index.html${hash}`;
    const base = ['--headless=new', '--user-data-dir=' + path.join(os.tmpdir(), 'ss-verify-' + name),
      '--hide-scrollbars', '--window-size=430,932',
      `--virtual-time-budget=${name.startsWith('auto-') || name === 'product' || name === 'history' ? 9000 : 4000}`];

    const domArgs = [...base, '--dump-dom', url];
    const dom = await runChrome(domArgs, 40000);
    if (dom.out.length > 1000) {
      fs.writeFileSync(path.join(outDir, name + '.html'), dom.out);
      const errs = (dom.out.match(/JS_ERRORS:(\[[^\]]*\])/) || [])[1] || '[]';
      const scen = (dom.out.match(/SCENARIO:(\[[^\]]*\])/) || [])[1] || '';
      const badLeak = /undefined|\[object Object\]|>NaN</.test(dom.out.replace(/isNaN/g, '')) ? ' LEAK?' : '';
      const visual = (dom.out.match(/VISUAL:(\{[^}]*\})/) || [])[1] || '';
      console.log(`DOM  ok  ${name.padEnd(13)} bytes=${String(dom.out.length).padEnd(7)} errs=${errs}${scen ? ' scen=' + scen : ''}${badLeak}`);
      console.log(`     layout=${visual || 'MISSING'}`);
      if (errs !== '[]') failed++;
      let v = null;
      try { v = JSON.parse(visual); } catch (e) { v = null; }
      if (!v) {
        failed++;
        console.log(`  layout FAIL ${name}: no visual audit captured`);
      } else if (v.hscroll || (v.wide && v.wide.length) || v.empty) {
        failed++;
        console.log(`  layout FAIL ${name}: ${visual}`);
      }
      if (name.startsWith('auto-') && (!scen || /ERROR|false/.test(scen))) {
        failed++;
        console.log(`  scenario FAIL ${name}: ${scen || 'no scenario output'}`);
      }
    } else {
      failed++;
      console.log(`DOM  FAIL ${name} code=${dom.code} out=${dom.out.length} ${dom.err.split(/\r?\n/)[0] || ''}`);
    }

    const shotArgs = [...base, `--screenshot=${path.join(outDir, name + '.png')}`, url];
    const shot = await runChrome(shotArgs, 40000);
    const ok = shot.code === 0 && fs.existsSync(path.join(outDir, name + '.png'));
    if (!ok) failed++;
    console.log(`${ok ? 'SHOT ok ' : 'SHOT FAIL'} ${name} code=${shot.code}`);
  }
  server.close();
  console.log(failed ? `FAILED=${failed}` : 'ALL OK');
  process.exit(failed ? 1 : 0);
});
