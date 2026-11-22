// Wall TV. Rotates between TODAY and SEASON; updates live as sets are logged.
import { api, esc, fitStage, live, avatar, pct, weekday, ICON } from './common.js';

const stage = document.getElementById('stage');
fitStage(stage, 1920, 1080);

// ?screen=today or ?screen=season pins one screen (handy for testing or a second TV).
const pinned = new URLSearchParams(location.search).get('screen');
let screen = pinned || 'today';
let today = null;
let season = null;
let settings = {};

async function load() {
  try {
    [today, season, settings] = await Promise.all([api('/api/board/today'), api('/api/board/season'), api('/api/settings')]);
  } catch {
    // Server hiccup: keep showing the last good data.
  }
  render(false);
}

function header(title) {
  const board = today?.board;
  return `<header>
    <div class="shield-glow" style="margin:-36px;padding:36px"><img src="/img/shield.svg" alt="Greenbrier Bobcat Shield" style="height:104px;width:145px"></div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="cond gray" style="font-size:24px;letter-spacing:0.24em">${esc((settings.school || 'GREENBRIER BOBCATS').toUpperCase())} · WEIGHT ROOM</div>
      <h1>${title}</h1>
    </div>
    <div style="margin-left:auto;display:flex;align-items:center;gap:14px">
      ${today ? `<div class="smoke pill" style="height:60px;padding:0 26px;gap:12px;font-family:var(--f-cond);font-weight:700;font-size:26px;letter-spacing:0.1em">
        <span aria-hidden="true" style="width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 0 0 5px rgba(255,255,255,0.18)"></span>${esc(weekday(today.day))}${board ? ` · ${esc(board.lift_short.toUpperCase())} DAY` : ''}</div>` : ''}
      ${pinned ? '' : `<div role="img" aria-label="Screen ${screen === 'today' ? 1 : 2} of 2" class="smoke pill" style="height:60px;padding:0 20px;gap:8px">
        <span style="width:${screen === 'today' ? 28 : 10}px;height:10px;border-radius:999px;background:${screen === 'today' ? '#fff' : 'rgba(255,255,255,0.3)'}"></span>
        <span style="width:${screen === 'season' ? 28 : 10}px;height:10px;border-radius:999px;background:${screen === 'season' ? '#fff' : 'rgba(255,255,255,0.3)'}"></span></div>`}
    </div>
  </header>`;
}

function boardHead(icon, title, sub, extra = '') {
  return `<div class="board-head"><div class="icon-tile" aria-hidden="true">${icon}</div>
    <div style="display:flex;flex-direction:column;gap:6px;min-width:0"><h2>${esc(title)}</h2><div class="sub">${esc(sub)}</div></div>${extra}</div>`;
}

function row(i, a, { mid = '', big = '', small = '', compact = false } = {}) {
  const top = i === 0;
  return `<li class="lrow${top ? ' top' : ''}${compact ? ' compact' : ''}">
    <div class="rk">${i + 1}</div>
    ${avatar(a, top ? 62 : 50, { solid: top })}
    <div style="flex-grow:1;min-width:0;display:flex;flex-direction:column;gap:${top ? 6 : 5}px">
      <div class="nm clip">${esc(a.display)}</div>
      <div class="ps">${esc([a.position, a.cls].filter(Boolean).join(' · '))}</div>
    </div>
    ${mid ? `<div class="mid">${mid}</div>` : ''}
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;min-width:120px">
      <div class="big">${big}</div>${small ? `<div class="small">${small}</div>` : ''}
    </div>
  </li>`;
}

const setStr = (s) => `${Math.round(s.weight)}×${s.reps}`;

function todayView() {
  const t = today || { items: [], rows: [], prs: [] };
  const board = t.board;
  const rows = t.rows.map((r, i) => row(i, r.athlete, { mid: `${setStr(r.last)} → ${setStr(r.best)}`, big: pct(r.pct) })).join('');
  return `<div class="tv fade">
    ${header('TODAY')}
    <div style="flex-grow:1;min-height:0;display:flex;gap:32px">
      <section class="card board" style="flex-grow:1;min-width:0">
        ${boardHead(ICON.trend, 'Beat your last', board ? `${board.lift_name} · biggest jump over your last ${board.lift_short.toLowerCase()} day` : 'No lift on the board yet',
          '<div class="pill" style="margin-left:auto;height:48px;padding:0 20px;background:rgba(255,255,255,0.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.14);font-family:var(--f-cond);font-weight:700;font-size:22px;letter-spacing:0.1em">RESETS EVERY DAY</div>')}
        ${rows ? `<ol style="display:flex;flex-direction:column;gap:10px">${rows}</ol>`
          : `<div class="empty">${board ? 'NOBODY\'S ON THE BOARD YET.<br>FIRST ONE TO BEAT THEIR LAST TAKES #1.' : 'COACH HASN\'T LOADED TODAY\'S WORKOUT.'}</div>`}
      </section>
      <div style="width:600px;flex-shrink:0;display:flex;flex-direction:column;gap:32px">
        <section class="card board">
          ${boardHead(ICON.list, "Today's lift", 'Weights worked out from your max')}
          <ul style="display:flex;flex-direction:column;gap:10px">
            ${t.items.length ? t.items.slice(0, 5).map((it) => `<li class="lrow" style="height:66px;padding:0 20px;gap:12px">
              <div class="nowrap" style="font-weight:600;font-size:25px;line-height:1">${esc(it.lift_name)}</div>
              ${it.on_board ? '<span class="pill" style="height:30px;padding:0 12px;background:#fff;color:var(--green);font-family:var(--f-cond);font-weight:800;font-size:16px;letter-spacing:0.1em">ON THE BOARD</span>' : ''}
              <div class="mid clip" style="margin-left:auto;font-size:23px">${esc(it.label.replace(/ × /g, '×').replace(/ @ /g, ' @ '))}</div></li>`).join('')
              : '<li class="lrow" style="height:66px;padding:0 20px"><div class="mid">Nothing loaded yet</div></li>'}
          </ul>
        </section>
        <section class="card board" style="flex-grow:1;min-height:0">
          ${boardHead(ICON.star, 'PRs today', 'New personal records')}
          ${t.prs.length ? `<ul style="display:flex;flex-direction:column;gap:10px">${t.prs.slice(0, 4).map((p) => `<li class="pill" style="height:66px;padding:0 10px 0 20px;background:rgba(255,255,255,0.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.10);gap:14px">
              <span class="nowrap" style="font-weight:700;font-size:24px;line-height:1">${esc(p.athlete.display)}</span>
              <span class="cond gray nowrap" style="font-size:21px;letter-spacing:0.08em;text-transform:uppercase">${esc(p.lift)} ${p.e1rm}</span>
              <span class="pill" style="margin-left:auto;height:46px;padding:0 16px 0 12px;background:#fff;color:var(--green);gap:4px;font-family:var(--f-disp);font-weight:900;font-size:28px;line-height:1">${ICON.up()}+${p.gain}</span></li>`).join('')}</ul>`
            : '<div class="empty" style="font-size:24px">NO PRS YET TODAY.<br>SOMEBODY GO GET ONE.</div>'}
        </section>
      </div>
    </div>
  </div>`;
}

function seasonView() {
  const s = season || { best_overall: [], strongest_line: [], strongest_skill: [], most_improved: [] };
  const empty = '<div class="empty" style="font-size:24px">NEEDS MAXES ON FILE<br>FOR ALL THREE LIFTS.</div>';
  const best = s.best_overall.map((p, i) => row(i, p.athlete, { big: Math.round(p.score), small: `${p.total} at ${Math.round(p.bw)}`, compact: true })).join('');
  const strong = (list) => list.map((p, i) => row(i, p.athlete, { big: p.total, small: p.lifts.join(' · '), compact: true })).join('');
  const imp = s.most_improved.map((p, i) => row(i, p.athlete, { big: pct(p.improve), small: `${p.base_total} → ${p.total}`, compact: true })).join('');
  return `<div class="tv fade">
    ${header('SEASON')}
    <div style="flex-grow:1;min-height:0;display:flex;gap:32px">
      <section class="card board" style="flex:1 1 0;min-width:0;gap:20px">
        ${boardHead(ICON.scale, 'Best overall', '3-lift total, scored for bodyweight')}
        ${best ? `<ol style="display:flex;flex-direction:column;gap:10px">${best}</ol>` : empty}
      </section>
      <section class="card board" style="flex:1 1 0;min-width:0;gap:20px">
        ${boardHead(ICON.barbell, 'Strongest', `${(s.lift_names || ['Squat', 'bench', 'clean']).join(' + ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}, raw total`)}
        <div style="display:flex;flex-direction:column;gap:10px"><div class="split"><div>OL / DL</div><div aria-hidden="true"></div></div>
          ${s.strongest_line.length ? `<ol style="display:flex;flex-direction:column;gap:10px">${strong(s.strongest_line)}</ol>` : ''}</div>
        <div style="display:flex;flex-direction:column;gap:10px"><div class="split"><div>SKILL</div><div aria-hidden="true"></div></div>
          ${s.strongest_skill.length ? `<ol style="display:flex;flex-direction:column;gap:10px">${strong(s.strongest_skill)}</ol>` : ''}</div>
      </section>
      <section class="card board" style="flex:1 1 0;min-width:0;gap:20px">
        ${boardHead(ICON.trend, 'Most improved', settings.season_start ? 'Total · since the season started' : 'Total · since the first max day')}
        ${imp ? `<ol style="display:flex;flex-direction:column;gap:10px">${imp}</ol>` : '<div class="empty" style="font-size:24px">SHOWS UP AFTER<br>THE SECOND MAX DAY.</div>'}
      </section>
    </div>
  </div>`;
}

function render(animate = true) {
  stage.innerHTML = screen === 'season' ? seasonView() : todayView();
  if (!animate) stage.querySelectorAll('.fade').forEach((el) => el.classList.remove('fade'));
}

function rotate() {
  if (!pinned) { screen = screen === 'today' ? 'season' : 'today'; render(true); }
  setTimeout(rotate, (Number(settings.tv_rotate_seconds) || 20) * 1000);
}

live(load);
await load();
setTimeout(rotate, (Number(settings.tv_rotate_seconds) || 20) * 1000);
// Belt and braces: reload the data every minute and the whole page every night.
setInterval(load, 60000);
setTimeout(() => location.reload(), 6 * 3600 * 1000);
