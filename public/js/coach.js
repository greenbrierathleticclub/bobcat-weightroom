// Coach page: today's workout, roster, max day, fix bad sets, settings and backups.
import { api, esc, avatar } from './common.js';
import { parseScheme, schemeLabel } from './scheme.js';

const main = document.getElementById('main');
const tabsEl = document.getElementById('tabs');
const dlg = document.getElementById('dlg');
const TABS = [['workout', "TODAY'S WORKOUT"], ['roster', 'ROSTER'], ['maxday', 'MAX DAY'], ['sets', 'FIX A SET'], ['settings', 'SETTINGS & BACKUP']];
let tab = location.hash.slice(1) || 'workout';
let flash = null;
let SETTINGS = {};

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function say(text, bad = false) { flash = { text, bad }; }
function msg() { const m = flash; flash = null; return m ? `<div class="msg${m.bad ? ' bad' : ''}">${esc(m.text)}</div>` : ''; }

async function guarded(fn) {
  try { return await fn(); } catch (e) {
    if (e.status === 401) return login();
    say(e.message, true); render();
  }
}

function login() {
  main.innerHTML = `<section class="card panel" style="max-width:420px"><h2>Coach PIN</h2>
    <form id="pinf" class="grid"><label class="f">PIN<input id="pin" type="password" inputmode="numeric" autocomplete="current-password"></label>
    <button class="btn btn-main" type="submit">UNLOCK</button></form>${msg()}</section>`;
  document.getElementById('pinf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/coach/login', { body: { pin: document.getElementById('pin').value } }); render(); }
    catch { say('Wrong PIN', true); login(); }
  };
}

async function render() {
  tabsEl.innerHTML = TABS.map(([k, t]) => `<button type="button" class="btn btn-ghost${k === tab ? ' on' : ''}" data-tab="${k}">${t}</button>`).join('');
  const s = await guarded(() => api('/api/settings'));
  if (!s) return;
  SETTINGS = s;
  const t = await api('/api/time').catch(() => null);
  if (t && Math.abs(t.now - Date.now()) > 3 * 60 * 1000) say(`The weight room computer's clock is off (it thinks it's ${new Date(t.now).toLocaleString()}). Dates on the boards will be wrong until it's fixed. See README: clock.`, true);
  document.getElementById('racklinks').innerHTML = Array.from({ length: Number(s.rack_count) || 0 }, (_, i) => `<a href="/rack/${i + 1}" target="_blank">RACK ${i + 1}</a>`).join(' <span class="gray">·</span> ');
  await guarded(() => VIEWS[tab]());
}
tabsEl.onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; location.hash = tab; render(); } };

// ---------- Today's workout ----------
let wDay = localDay();
let wItems = null;
let wMeta = null;
async function workoutView() {
  if (!wItems || wMeta?.day !== wDay) {
    wMeta = await api(`/api/coach/workout?day=${wDay}`);
    wItems = wMeta.items.map((i) => ({ id: i.id, lift: i.lift_key, scheme: i.scheme, on_board: i.on_board, note: i.note || '' }));
  }
  const lifts = wMeta.lifts;
  const itemHtml = (it, i) => {
    const p = parseScheme(it.scheme);
    const chips = p.sets.map((s, k) => `<span>${k + 1}: ${s.reps}${s.amrap ? '+' : ''}${s.pct != null ? ` @ ${Math.round(s.pct * 1000) / 10}%` : s.lb != null ? ` @ ${s.lb} lb` : ' · kid picks'}</span>`).join('')
      + p.errors.map((x) => `<span class="err">can't read "${esc(x)}"</span>`).join('');
    return `<div class="item" data-i="${i}">
      <label class="f">Lift<select data-f="lift">${lifts.map((l) => `<option value="${l.key}"${l.key === it.lift ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      <div><label class="f">Sets and reps<input data-f="scheme" value="${esc(it.scheme)}" placeholder="5x3@75" autocomplete="off"></label>
        <div class="preview">${it.scheme ? chips : '<span>type something like 5x3@75</span>'}</div>
        <label class="f" style="margin-top:10px">Note for the kids (optional)<input data-f="note" value="${esc(it.note)}" placeholder="pause at the bottom"></label></div>
      <div class="side">
        <label class="btns" style="gap:8px;font-family:var(--f-cond);font-weight:700;letter-spacing:0.08em"><input type="radio" name="board" data-f="on_board"${it.on_board ? ' checked' : ''}>ON THE BOARD</label>
        <div class="btns"><button type="button" class="btn btn-ghost sm" data-a="up" aria-label="Move up">▲</button><button type="button" class="btn btn-ghost sm" data-a="down" aria-label="Move down">▼</button><button type="button" class="btn btn-ghost sm" data-a="del">REMOVE</button></div>
      </div></div>`;
  };
  main.innerHTML = `<section class="card panel">
    <div class="btns" style="justify-content:space-between"><h2>Workout for</h2>
      <div class="btns"><input type="date" id="wday" value="${wDay}" style="width:auto">
      <select id="copyfrom" style="width:auto"><option value="">Copy from a past day…</option>${wMeta.recent.filter((r) => r.day !== wDay).map((r) => `<option value="${r.day}">${r.day} · ${esc(r.lifts)}</option>`).join('')}</select></div></div>
    <p class="help">Type sets however the coach writes them. <code>5x3@75</code> is 5 sets of 3 at 75% of max. <code>3@65, 3@75, 3+@85</code> is a wave with the last set as many as possible. <code>3x8</code> with no % means the kid picks the weight. <code>2x5@225lb</code> is a fixed weight. Weights round down to the nearest ${esc(SETTINGS.round_to || 5)} lb. The lift marked ON THE BOARD is the one Beat Your Last ranks today.</p>
    ${msg()}
    <div class="grid" id="items">${wItems.map(itemHtml).join('') || '<p class="help">Nothing loaded for this day yet.</p>'}</div>
    <div class="btns"><button type="button" class="btn btn-ghost" id="add">+ ADD A LIFT</button><button type="button" class="btn btn-ghost" id="newlift">NEW LIFT TYPE</button>
      <button type="button" class="btn btn-main" id="save" style="margin-left:auto">SAVE WORKOUT</button></div>
  </section>`;
  const sync = () => {
    main.querySelectorAll('.item').forEach((el) => {
      const it = wItems[Number(el.dataset.i)];
      it.lift = el.querySelector('[data-f=lift]').value;
      it.scheme = el.querySelector('[data-f=scheme]').value;
      it.note = el.querySelector('[data-f=note]').value;
      it.on_board = el.querySelector('[data-f=on_board]').checked;
    });
  };
  main.querySelectorAll('[data-f=scheme]').forEach((inp) => inp.addEventListener('input', () => {
    const el = inp.closest('.item');
    const p = parseScheme(inp.value);
    el.querySelector('.preview').innerHTML = p.sets.map((s, k) => `<span>${k + 1}: ${s.reps}${s.amrap ? '+' : ''}${s.pct != null ? ` @ ${Math.round(s.pct * 1000) / 10}%` : s.lb != null ? ` @ ${s.lb} lb` : ' · kid picks'}</span>`).join('') + p.errors.map((x) => `<span class="err">can't read "${esc(x)}"</span>`).join('');
  }));
  main.querySelector('#items').onclick = (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    sync();
    const i = Number(b.closest('.item').dataset.i);
    if (b.dataset.a === 'del') wItems.splice(i, 1);
    if (b.dataset.a === 'up' && i > 0) [wItems[i - 1], wItems[i]] = [wItems[i], wItems[i - 1]];
    if (b.dataset.a === 'down' && i < wItems.length - 1) [wItems[i + 1], wItems[i]] = [wItems[i], wItems[i + 1]];
    workoutView();
  };
  main.querySelector('#add').onclick = () => { sync(); wItems.push({ lift: lifts[0].key, scheme: '', on_board: wItems.length === 0, note: '' }); workoutView(); };
  main.querySelector('#wday').onchange = (e) => { wDay = e.target.value; wItems = null; render(); };
  main.querySelector('#copyfrom').onchange = async (e) => {
    if (!e.target.value) return;
    if (wItems.length && !confirm(`Replace this day's workout with ${e.target.value}'s?`)) return;
    await guarded(() => api('/api/coach/workout/copy', { body: { from: e.target.value, to: wDay } }));
    wItems = null; say(`Copied ${e.target.value}.`); render();
  };
  main.querySelector('#newlift').onclick = () => {
    dlg.innerHTML = `<form method="dialog" class="grid"><h2 style="margin:0;font-family:var(--f-cond)">NEW LIFT TYPE</h2>
      <label class="f">Name<input id="ln" placeholder="Romanian deadlift" required></label>
      <label class="f">Short name (for screens)<input id="ls" placeholder="RDL"></label>
      <label class="btns" style="gap:10px"><input type="checkbox" id="lm"> Coach tracks a max for it (so % works)</label>
      <div class="btns"><button class="btn btn-ghost" value="cancel">CANCEL</button><button class="btn btn-main" value="ok">ADD</button></div></form>`;
    dlg.showModal();
    dlg.onclose = async () => {
      if (dlg.returnValue !== 'ok') return;
      const name = dlg.querySelector('#ln').value.trim();
      if (!name) return;
      await guarded(() => api('/api/coach/lifts', { body: { name, short: dlg.querySelector('#ls').value.trim() || name, has_max: dlg.querySelector('#lm').checked } }));
      sync(); wMeta = null; const keep = wItems; await workoutView(); wItems = keep; workoutView();
    };
  };
  main.querySelector('#save').onclick = async () => {
    sync();
    const bad = wItems.find((it) => it.scheme && parseScheme(it.scheme).errors.length);
    if (bad && !confirm("Some sets couldn't be read (shown in white). Save anyway?")) return;
    const saved = await guarded(() => api('/api/coach/workout', { body: { day: wDay, items: wItems } }));
    if (saved) { wItems = null; say(`Saved. Racks and the TV update now.`); render(); }
  };
}

// ---------- Roster ----------
let rosterFilter = '';
async function rosterView() {
  const [people, s] = await Promise.all([api('/api/coach/athletes'), api('/api/settings')]);
  const racks = Number(s.rack_count) || 0;
  const q = rosterFilter.toLowerCase();
  const list = people.filter((a) => !q || `${a.first_name} ${a.last_name} ${a.position || ''}`.toLowerCase().includes(q));
  main.innerHTML = `<section class="card panel">
    <div class="btns" style="justify-content:space-between"><h2>Roster · ${people.filter((a) => a.active).length} active</h2>
      <div class="btns"><button type="button" class="btn btn-ghost" id="imp">IMPORT SPREADSHEET</button><a class="btn btn-ghost" href="/api/coach/export.csv" style="text-decoration:none">EXPORT</a><button type="button" class="btn btn-main" id="addkid">+ ADD ATHLETE</button></div></div>
    ${msg()}
    <input id="rq" placeholder="Search name or position" value="${esc(rosterFilter)}">
    <div class="tablebox"><table><thead><tr><th></th><th>Name</th><th>Class</th><th>Pos</th><th>Group</th><th>BW</th><th>Rack</th><th>Squat</th><th>Bench</th><th>Clean</th><th></th></tr></thead><tbody>
    ${list.map((a) => `<tr${a.active ? '' : ' class="void"'}><td>${avatar(a, 40)}</td><td><b>${esc(a.last_name)}</b>, ${esc(a.first_name)}</td><td>${esc(a.cls)}</td><td>${esc(a.position || '')}</td>
      <td>${a.group === 'line' ? 'OL/DL' : 'Skill'}</td><td>${a.bodyweight_lb ?? ''}</td><td>${a.default_rack ?? ''}</td><td>${a.maxes.squat ?? ''}</td><td>${a.maxes.bench ?? ''}</td><td>${a.maxes.clean ?? ''}</td>
      <td><button type="button" class="btn btn-ghost sm" data-edit="${a.id}">EDIT</button></td></tr>`).join('')}
    </tbody></table></div>
    <p class="help">Maxes change only on max day (or a spreadsheet import). Racks: kids with a rack number show up as big buttons on that rack's tablet. Everybody else uses FIND MY NAME.</p>
  </section>`;
  const rq = main.querySelector('#rq');
  rq.oninput = () => { rosterFilter = rq.value; const pos = rq.selectionStart; rosterView().then(() => { const n = main.querySelector('#rq'); n.focus(); n.setSelectionRange(pos, pos); }); };
  main.querySelector('#addkid').onclick = () => editAthlete({ active: 1 }, racks);
  main.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => editAthlete(people.find((a) => a.id === Number(b.dataset.edit)), racks); });
  main.querySelector('#imp').onclick = importDialog;
}

function editAthlete(a, racks) {
  dlg.innerHTML = `<form method="dialog" class="grid" id="af">
    <h2 style="margin:0;font-family:var(--f-cond)">${a.id ? 'EDIT ATHLETE' : 'ADD ATHLETE'}</h2>
    <div class="grid g2">
      <label class="f">First<input name="first_name" value="${esc(a.first_name || '')}" required></label>
      <label class="f">Last<input name="last_name" value="${esc(a.last_name || '')}" required></label>
      <label class="f">Grad year<input name="grad_year" inputmode="numeric" value="${a.grad_year ?? ''}" placeholder="2028"></label>
      <label class="f">Position<input name="position" value="${esc(a.position || '')}" placeholder="OL"></label>
      <label class="f">Group<select name="group_tag"><option value="">From position</option><option value="line"${a.group_tag === 'line' ? ' selected' : ''}>OL / DL</option><option value="skill"${a.group_tag === 'skill' ? ' selected' : ''}>Skill</option></select></label>
      <label class="f">Bodyweight (lb)<input name="bodyweight_lb" inputmode="decimal" value="${a.bodyweight_lb ?? ''}"></label>
      <label class="f">Rack<select name="default_rack"><option value="">None</option>${Array.from({ length: racks }, (_, i) => `<option value="${i + 1}"${a.default_rack === i + 1 ? ' selected' : ''}>Rack ${i + 1}</option>`).join('')}</select></label>
      <label class="f">Status<select name="active"><option value="1"${a.active ? ' selected' : ''}>Active</option><option value="0"${a.active ? '' : ' selected'}>Inactive (hidden)</option></select></label>
    </div>
    ${a.id ? `<div class="btns">${avatar(a, 72)}<label class="f" style="flex-grow:1">Photo (optional)<input type="file" accept="image/*" id="ph"></label></div>` : ''}
    <div class="btns"><button class="btn btn-ghost" value="cancel" formnovalidate>CANCEL</button><button class="btn btn-main" value="ok">SAVE</button></div></form>`;
  dlg.showModal();
  dlg.onclose = async () => {
    if (dlg.returnValue !== 'ok') return;
    const f = new FormData(dlg.querySelector('#af'));
    const body = Object.fromEntries(f.entries());
    body.id = a.id;
    const saved = await guarded(() => api('/api/coach/athletes', { body }));
    const file = dlg.querySelector('#ph')?.files?.[0];
    if (saved && file) await guarded(async () => api(`/api/coach/athletes/${saved.id}/photo`, { body: { data_url: await shrink(file) } }));
    if (saved) { say(`Saved ${saved.full}.`); render(); }
  };
}

// Phone photos are huge: shrink to a 320px square JPEG before upload.
function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const size = 320;
      c.width = c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function importDialog() {
  dlg.innerHTML = `<div class="grid"><h2 style="margin:0;font-family:var(--f-cond)">IMPORT ROSTER</h2>
    <p class="help">Save the spreadsheet as CSV. Columns it understands: <code>First</code> <code>Last</code> (or one <code>Name</code>), <code>Grad</code> or <code>Class</code>, <code>Position</code>, <code>Bodyweight</code>, <code>Rack</code>, <code>Squat</code> <code>Bench</code> <code>Clean</code>. Kids already on the roster get updated, not duplicated. Maxes that changed are saved as of today.</p>
    <input type="file" accept=".csv,text/csv,.txt" id="csvf">
    <div id="prev"></div>
    <div class="btns"><button type="button" class="btn btn-ghost" id="cx">CANCEL</button><button type="button" class="btn btn-main" id="go" disabled>IMPORT</button></div></div>`;
  dlg.showModal();
  let text = '';
  dlg.querySelector('#cx').onclick = () => dlg.close();
  dlg.querySelector('#csvf').onchange = async (e) => {
    text = await e.target.files[0].text();
    const r = await guarded(() => api('/api/coach/import', { body: { csv: text, dry_run: true } }));
    if (!r) return;
    dlg.querySelector('#prev').innerHTML = `<p class="help"><b>${r.added}</b> new, <b>${r.updated}</b> updated, <b>${r.maxes}</b> maxes. ${r.skipped.map(esc).join(' ')}</p>
      <div class="tablebox" style="max-height:40vh"><table><thead><tr><th>Name</th><th>Cls</th><th>Pos</th><th>BW</th><th>Maxes</th><th></th></tr></thead><tbody>
      ${r.preview.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.cls)}</td><td>${esc(p.position || '')}</td><td>${esc(p.bw || '')}</td><td>${esc(p.maxes)}</td><td>${p.action}</td></tr>`).join('')}</tbody></table></div>`;
    dlg.querySelector('#go').disabled = !(r.added + r.updated);
  };
  dlg.querySelector('#go').onclick = async () => {
    const r = await guarded(() => api('/api/coach/import', { body: { csv: text } }));
    dlg.close();
    if (r) { say(`Imported: ${r.added} new, ${r.updated} updated, ${r.maxes} maxes.`); render(); }
  };
}

// ---------- Max day ----------
let mLift = 'squat';
let mDay = localDay();
async function maxdayView() {
  const [people, meta] = await Promise.all([api('/api/coach/athletes'), api('/api/coach/workout')]);
  const lifts = meta.lifts.filter((l) => l.has_max);
  const active = people.filter((a) => a.active);
  main.innerHTML = `<section class="card panel">
    <h2>Max day</h2>
    <p class="help">This is the only place maxes change. Type the tested max for each kid who tested. Leave the rest blank. Every rack's weights and the Season board update as soon as you save.</p>
    ${msg()}
    <div class="btns"><label class="f">Lift<select id="ml">${lifts.map((l) => `<option value="${l.key}"${l.key === mLift ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      <label class="f">Tested on<input type="date" id="md" value="${mDay}"></label></div>
    <div class="tablebox"><table><thead><tr><th>Name</th><th>Pos</th><th>Current</th><th>New max (lb)</th></tr></thead><tbody>
    ${active.map((a) => `<tr><td><b>${esc(a.last_name)}</b>, ${esc(a.first_name)}</td><td>${esc(a.position || '')}</td><td>${a.maxes[mLift] ?? '—'}</td>
      <td style="width:180px"><input data-id="${a.id}" inputmode="decimal" aria-label="New max for ${esc(a.first_name)} ${esc(a.last_name)}"></td></tr>`).join('')}
    </tbody></table></div>
    <div class="btns"><button type="button" class="btn btn-main" id="msave" style="margin-left:auto">SAVE MAXES</button></div>
  </section>`;
  main.querySelector('#ml').onchange = (e) => { mLift = e.target.value; maxdayView(); };
  main.querySelector('#md').onchange = (e) => { mDay = e.target.value; };
  main.querySelector('#msave').onclick = async () => {
    const entries = [...main.querySelectorAll('input[data-id]')].filter((i) => Number(i.value) > 0).map((i) => ({ athlete_id: Number(i.dataset.id), lift: mLift, weight: Number(i.value) }));
    if (!entries.length) { say('Nothing typed in yet.', true); return maxdayView(); }
    const r = await guarded(() => api('/api/coach/maxes', { body: { entries, tested_on: mDay } }));
    if (r) { say(`Saved ${r.saved} ${mLift} maxes.`); maxdayView(); }
  };
}

// ---------- Fix a set ----------
let sDay = localDay();
async function setsView() {
  const sets = await api(`/api/coach/sets?day=${sDay}`);
  main.innerHTML = `<section class="card panel">
    <div class="btns" style="justify-content:space-between"><h2>Every set logged</h2><input type="date" id="sd" value="${sDay}" style="width:auto"></div>
    <p class="help">Kid logged under a buddy's name, or typed 50 reps? Strike it. Struck sets drop off the boards and PR lists right away. Strike it again to bring it back.</p>
    ${msg()}
    <div class="tablebox"><table><thead><tr><th>Time</th><th>Name</th><th>Lift</th><th>Set</th><th>Weight × reps</th><th>Est. max</th><th>Rack</th><th></th></tr></thead><tbody>
    ${sets.map((x) => `<tr${x.voided ? ' class="void"' : ''}><td>${esc(x.created_at.slice(11, 16))}</td><td><b>${esc(x.last_name)}</b>, ${esc(x.first_name)}</td><td>${esc(x.lift)}</td><td>${x.seq}</td>
      <td>${x.weight} × ${x.reps}${x.is_pr ? ' · <b>PR</b>' : ''}</td><td>${Math.round(x.e1rm)}</td><td>${esc(x.rack || '')}</td>
      <td style="text-decoration:none"><button type="button" class="btn btn-ghost sm" data-v="${x.id}" data-on="${x.voided ? 0 : 1}">${x.voided ? 'BRING BACK' : 'STRIKE'}</button></td></tr>`).join('') || '<tr><td colspan="8">Nothing logged on this day.</td></tr>'}
    </tbody></table></div></section>`;
  main.querySelector('#sd').onchange = (e) => { sDay = e.target.value; setsView(); };
  main.querySelectorAll('[data-v]').forEach((b) => { b.onclick = async () => { await guarded(() => api(`/api/coach/sets/${b.dataset.v}/void`, { body: { voided: b.dataset.on === '1' } })); setsView(); }; });
}

// ---------- Settings & backup ----------
async function settingsView() {
  const [s, b] = await Promise.all([api('/api/settings'), api('/api/coach/backups')]);
  const field = (k, label, type = 'text', extra = '') => `<label class="f">${label}<input name="${k}" type="${type}" value="${esc(s[k] ?? '')}" ${extra}></label>`;
  main.innerHTML = `<section class="card panel"><h2>Settings</h2>${msg()}
    <form id="sf" class="grid g2">
      ${field('school', 'Name on the TV')}
      ${field('rack_count', 'Number of racks with tablets', 'number', 'min="1" max="20"')}
      ${field('round_to', 'Round weights down to (lb)', 'number', 'min="1" max="10" step="0.5"')}
      ${field('tv_rotate_seconds', 'TV flips Today/Season every (sec)', 'number', 'min="5"')}
      ${field('rack_idle_seconds', 'Rack goes back to start after (sec untouched)', 'number', 'min="20"')}
      ${field('rack_sleep_seconds', 'Rack goes dark after (sec on start screen)', 'number', 'min="30"')}
      ${field('season_start', 'Season started (Most Improved counts from here)', 'date')}
      ${field('backup_hour', 'Nightly backup hour (0-23)', 'number', 'min="0" max="23"')}
      <div class="btns" style="grid-column:1/-1"><button class="btn btn-main" type="submit" style="margin-left:auto">SAVE SETTINGS</button></div>
    </form></section>
    <section class="card panel" style="margin-top:18px"><h2>Backups</h2>
    <p class="help">Every night the whole database is copied to <code>${esc(b.dir)}</code>. On the Pi that's the USB stick. The last 30 are kept. Download one any time to keep a copy off-site.</p>
    <p class="help">Last backup: ${b.last ? (b.last.ok ? `worked, ${esc(new Date(b.last.at).toLocaleString())}` : `<b>FAILED</b> ${esc(new Date(b.last.at).toLocaleString())}: ${esc(b.last.error)}. Is the USB stick plugged in?`) : 'none since the app started'}</p>
    <div class="btns"><button type="button" class="btn btn-main" id="bnow">BACK UP NOW</button></div>
    <ul class="grid">${b.files.slice(0, 10).map((f) => `<li class="btns"><a href="/api/coach/backups/${encodeURIComponent(f.file)}" style="color:#fff">${esc(f.file)}</a><span class="gray">${(f.size / 1024).toFixed(0)} KB</span></li>`).join('')}</ul></section>`;
  main.querySelector('#sf').onsubmit = async (e) => {
    e.preventDefault();
    const r = await guarded(() => api('/api/coach/settings', { body: Object.fromEntries(new FormData(e.target).entries()) }));
    if (r) { say('Saved.'); render(); }
  };
  main.querySelector('#bnow').onclick = async () => {
    const r = await guarded(() => api('/api/coach/backups', { method: 'POST', body: {} }));
    if (r) { say(r.ok ? 'Backed up.' : `Backup failed: ${r.error}`, !r.ok); settingsView(); }
  };
}

const VIEWS = { workout: workoutView, roster: rosterView, maxday: maxdayView, sets: setsView, settings: settingsView };
render();
window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (VIEWS[t] && t !== tab) { tab = t; render(); } });
