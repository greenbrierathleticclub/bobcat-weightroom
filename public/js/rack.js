// Rack tablet. One page, a few screens: idle -> who's lifting -> log sets -> (PR) -> lift done.
import { api, esc, fitStage, live, avatar, pct, weekday, ICON } from './common.js';

const stage = document.getElementById('stage');
fitStage(stage, 800, 1280);

const rackId = Number(location.pathname.split('/')[2]) || 1;
const S = {
  view: 'idle',       // idle | signin | find | log | pr | done | sleep
  rack: null, day: null, items: [], crew: [], settings: {},
  pick: null,         // athlete card picked on the sign-in screen
  letter: null, roster: null,
  session: null,      // session view from the server
  reps: 0, weight: 0, weightMode: false,
  pr: null,
  battery: null,
  busy: false,
};

// ---------- data ----------
async function loadRack() {
  try {
    const r = await api(`/api/rack/${rackId}`);
    Object.assign(S, { rack: r.rack, day: r.day, items: r.items, crew: r.crew, settings: r.settings });
  } catch (e) {
    toast("Can't reach the weight room computer");
  }
  render();
}

function boardItem() { return S.items.find((i) => i.on_board) || S.items[0] || null; }

// ---------- pieces ----------
function header({ sub = '' } = {}) {
  const b = S.battery;
  const batt = b == null ? '' : `<div class="smoke pill batt">${ICON.battery.replace('BATW', Math.max(2, Math.round(21 * b)))}${Math.round(b * 100)}%</div>`;
  return `<header class="hdr">
    <div class="shield-glow"><img src="/img/shield.svg" alt="Greenbrier Bobcat Shield" style="height:54px;width:75px"></div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-left:6px">
      <div class="rackname">${esc((S.rack?.name || `Rack ${rackId}`).toUpperCase())}</div>
      ${sub ? `<div class="label sub">${esc(sub)}</div>` : ''}
    </div>
    <div style="margin-left:auto">${batt}</div>
  </header>`;
}

function liftPill(item, note = 'WEIGHTS WORKED OUT FROM YOUR MAX') {
  if (!item) return `<div class="smoke liftpill"><div class="name">NO WORKOUT LOADED</div><div class="label" style="font-size:18px">COACH LOADS TODAY'S LIFT ON THE COACH PAGE</div></div>`;
  return `<div class="smoke liftpill">
    <div class="top"><div class="name">${esc(item.lift_name)}</div><div class="vbar" aria-hidden="true"></div><div class="scheme clip">${esc(item.label)}</div></div>
    <div class="label" style="font-size:18px">${item.note ? esc(item.note) : item.has_max ? note : 'PICK YOUR OWN WEIGHT'}</div>
  </div>`;
}

function personLine(a, extra = '') {
  return `<div style="flex-shrink:0;display:flex;align-items:center;gap:16px">
    ${avatar(a, 72)}
    <div style="display:flex;flex-direction:column;gap:8px;min-width:0">
      <h1 style="margin:0;font-weight:700;font-size:40px;line-height:1;letter-spacing:-0.01em" class="clip">${esc(a.display)}</h1>
      <div class="label">${esc([a.position, a.cls_long || a.cls].filter(Boolean).join(' · '))}${extra ? ` · ${esc(extra)}` : ''}</div>
    </div>
    ${S.view === 'log' ? '<button type="button" class="btn btn-ghost undo" data-act="switch" style="margin-left:auto">SWITCH</button>' : ''}
  </div>`;
}

// ---------- screens ----------
function idleView() {
  const item = boardItem();
  const crew = S.crew.slice(0, 4);
  const more = S.crew.length - crew.length;
  return `<div class="screen-rack" data-act="start">
    ${header()}
    <div style="margin-top:40px;display:flex;flex-direction:column;align-items:center;gap:14px">
      <div class="label" style="font-size:24px;letter-spacing:0.2em">${S.day ? esc(weekday(S.day)) : ''}${item ? ` · ${esc(item.lift_short.toUpperCase())} DAY` : ''}</div>
      <div class="disp" style="font-size:300px;letter-spacing:-0.02em;text-shadow:0 26px 60px rgba(0,0,0,0.5)">${rackId}</div>
      <div class="cond" style="font-weight:800;font-size:40px;letter-spacing:0.3em">RACK</div>
    </div>
    <div style="margin-top:30px">${liftPill(item)}</div>
    ${crew.length ? `<section class="card" style="padding:24px;display:flex;flex-direction:column;gap:14px">
      <div class="label" style="font-size:22px;letter-spacing:0.14em">ON THIS RACK TODAY</div>
      <ol class="crewlist" style="display:flex;flex-direction:column;gap:10px">
        ${crew.map((a, i) => `<li class="row">
          <div class="disp gray" style="width:34px;font-size:34px;line-height:1">${i + 1}</div>
          ${avatar(a, 50)}
          <div style="font-weight:700;font-size:28px;line-height:1" class="clip">${esc(a.display)}</div>
          <div class="label" style="margin-left:auto">${esc([a.position, a.cls].filter(Boolean).join(' · '))}</div>
        </li>`).join('')}
        ${more > 0 ? `<li class="label" style="padding:4px 22px">+ ${more} MORE</li>` : ''}
      </ol></section>` : ''}
    <div class="tap-start">TAP TO START</div>
  </div>`;
}

function signinView() {
  const p = S.pick;
  const item = p ? S.items.find((i) => i.id === p.item_id) : boardItem();
  const tiles = S.crew.map((a) => {
    const on = p && p.id === a.id;
    return `<button type="button" class="tile${on ? ' on' : ''}${a.all_done ? ' done' : ''}" data-act="pick" data-id="${a.id}">
      <div style="display:flex;align-items:center;gap:14px;min-width:0">${avatar(a, 60)}<div class="clip" style="font-weight:700;font-size:30px;line-height:1">${esc(a.display)}</div></div>
      <div style="display:flex;align-items:baseline;justify-content:space-between">
        <div class="cond" style="font-size:20px;letter-spacing:0.12em;opacity:0.7">${esc([a.position, a.cls].filter(Boolean).join(' · '))}</div>
        <div class="disp" style="font-size:52px">${a.all_done ? '<span class="cond" style="font-size:22px">DONE</span>' : a.first_weight ? `${a.first_weight}<span class="cond" style="font-size:20px;opacity:0.7"> LB</span>` : ''}</div>
      </div>
    </button>`;
  }).join('');
  return `<div class="screen-rack">
    ${header()}
    ${liftPill(item)}
    <section class="card" style="flex-grow:1;min-height:0;padding:30px;display:flex;flex-direction:column">
      <div class="sheen" aria-hidden="true"></div>
      ${p ? `<div style="position:relative;height:100%;display:flex;flex-direction:column;gap:14px">
          <div class="label" style="font-size:22px;letter-spacing:0.14em">${p.all_done ? 'ALL DONE TODAY' : `YOUR ${esc((p.item_lift || '').toUpperCase())} WEIGHT TODAY`}</div>
          <div style="font-weight:700;font-size:44px;line-height:1">${esc(p.full)}</div>
          <div style="margin-top:auto;display:flex;align-items:baseline;gap:14px">
            <div class="disp" style="font-size:200px;letter-spacing:-0.02em;text-shadow:0 18px 40px rgba(0,0,0,0.45)">${p.first_weight ?? '—'}</div>
            <div class="cond gray" style="font-weight:800;font-size:40px">LB</div>
          </div>
          <div class="cond gray" style="font-size:24px;letter-spacing:0.08em">${p.first_pct != null && p.max ? `${Math.round(p.first_pct * 100)}% OF ${p.max}, ROUNDED` : p.first_pct != null ? 'NO MAX ON FILE: PICK YOUR WEIGHT' : 'PICK YOUR WEIGHT ON THE NEXT SCREEN'}</div>
        </div>`
      : `<div style="position:relative;margin:auto 0;display:flex;flex-direction:column;gap:16px">
          <div class="disp" style="font-size:110px;line-height:0.85">WHO'S<br>LIFTING?</div>
          <div style="font-weight:600;font-size:26px;line-height:1.3" class="gray">${S.crew.length ? 'Tap your name below.' : 'Tap FIND MY NAME.'}</div>
        </div>`}
    </section>
    ${S.crew.length ? `<div class="tiles">${tiles}</div>` : ''}
    <div style="flex-shrink:0;display:flex;gap:14px">
      <button type="button" class="btn btn-ghost" data-act="find" style="flex-grow:1;height:76px;font-size:26px">${S.crew.length ? 'NOT ME · FIND MY NAME' : 'FIND MY NAME'}</button>
      <button type="button" class="btn btn-main" data-act="go" style="width:250px;height:76px;font-size:30px" ${p && p.item_id ? '' : 'disabled'}>START</button>
    </div>
  </div>`;
}

function findView() {
  const all = S.roster || [];
  const letters = [...new Set(all.map((a) => a.last_name.charAt(0).toUpperCase()))].sort();
  const L = S.letter || letters[0];
  const list = all.filter((a) => a.last_name.toUpperCase().startsWith(L));
  return `<div class="screen-rack">
    ${header()}
    <div style="display:flex;align-items:center;gap:16px">
      <div class="disp" style="font-size:84px;line-height:0.85">FIND<br>YOUR NAME</div>
      <div class="label" style="margin-left:auto;text-align:right;line-height:1.4">TAP THE FIRST LETTER<br>OF YOUR LAST NAME</div>
    </div>
    <div class="letters">${letters.map((c) => `<button type="button" class="btn btn-ghost${c === L ? ' on' : ''}" data-act="letter" data-l="${c}">${c}</button>`).join('')}</div>
    <div class="findlist">${list.map((a) => `<button type="button" class="row btn-ghost" data-act="found" data-id="${a.id}">
        ${avatar(a, 52)}<div style="min-width:0"><div class="clip" style="font-weight:700;font-size:26px;line-height:1.1">${esc(a.last_name)}, ${esc(a.first_name)}</div>
        <div class="label" style="font-size:16px;margin-top:6px">${esc([a.position, a.cls].filter(Boolean).join(' · '))}</div></div></button>`).join('')}</div>
    <button type="button" class="btn btn-ghost" data-act="back" style="height:76px;font-size:26px;flex-shrink:0">BACK</button>
  </div>`;
}

function currentSetIndex() { return S.session.sets.length; }

function logView() {
  const s = S.session;
  const a = s.athlete;
  const i = currentSetIndex();
  const total = s.plan.length;
  const planned = s.plan[i];
  const extra = i >= total;
  const ladder = [];
  const rows = Math.max(total, s.sets.length + 1);
  for (let k = 0; k < rows; k++) {
    const done = s.sets[k];
    const plan = s.plan[k];
    if (done) {
      ladder.push(`<li class="row"><div class="dot" style="background:var(--green);box-shadow:inset 0 1px 0 rgba(255,255,255,0.22)">${ICON.check}</div>
        <div class="label">SET ${k + 1}${done.is_pr ? ' · PR' : ''}</div>
        <div class="setw">${fmtW(done.weight)} <span class="gray">× ${done.reps}</span></div></li>`);
    } else if (k === i) {
      ladder.push(`<li class="row row-lift"><div class="dot" style="border:3px solid var(--green)"></div>
        <div class="cond" style="font-weight:800;font-size:20px;letter-spacing:0.12em;color:#000">SET ${k + 1} · NOW${plan?.amrap ? ' · MAX REPS' : ''}${extra ? ' · EXTRA' : ''}</div>
        <div class="setw">${fmtW(S.weight)} <span style="color:#000">× ${plan ? `${plan.reps}${plan.amrap ? '+' : ''}` : S.reps}</span></div></li>`);
    } else if (plan) {
      ladder.push(`<li class="row row-dash"><div class="dot" style="border:2px solid rgba(160,160,160,0.6)"></div>
        <div class="label">SET ${k + 1}</div>
        <div class="setw gray" style="font-weight:800">${plan.weight ? fmtW(plan.weight) : '—'} <span>× ${plan.reps}${plan.amrap ? '+' : ''}</span></div></li>`);
    }
  }
  const last = s.last;
  const best = s.best;
  const p = s.beat_pct;
  return `<div class="screen-rack">
    ${header()}
    ${personLine(a, s.max ? `${s.lift.short.toUpperCase()} MAX ${s.max}` : '')}
    <div class="smoke pill" style="flex-shrink:0;padding:0 26px;height:64px;gap:18px">
      <div class="cond" style="font-weight:800;font-size:30px;letter-spacing:0.04em;text-transform:uppercase">${esc(s.lift.name)}</div>
      <div class="vbar" aria-hidden="true"></div>
      <div class="cond clip" style="font-size:26px;letter-spacing:0.06em">${esc(s.item?.label || '')}</div>
      <div class="label nowrap" style="margin-left:auto;font-size:22px;letter-spacing:0.1em">SET ${i + 1}${extra ? '' : ` OF ${total}`}</div>
    </div>
    <section class="card" style="flex-shrink:0;padding:26px 28px;display:flex;gap:20px">
      <div class="sheen" aria-hidden="true"></div>
      <div style="position:relative;display:flex;flex-direction:column;gap:12px">
        <div class="label" style="font-size:22px;letter-spacing:0.14em">BEAT YOUR LAST</div>
        <div style="font-weight:600;font-size:22px;line-height:1.35" class="gray">
          ${last ? `Last ${esc(s.lift.short.toLowerCase())} day: <span style="color:#fff">${fmtW(last.weight)} × ${last.reps}</span>` : 'First time logged. This one sets the bar.'}<br>
          Today's best: <span style="color:#fff">${best ? `${fmtW(best.weight)} × ${best.reps}` : 'nothing yet'}</span></div>
        ${s.rank ? `<div class="pill chip-white" style="margin-top:6px;align-self:flex-start;height:52px;padding:0 22px 0 18px;gap:10px;font-family:var(--f-cond);font-weight:800;font-size:24px;letter-spacing:0.06em">
          <span class="disp" style="font-size:30px">#${s.rank}</span>ON THE BOARD TODAY</div>` : ''}
      </div>
      <div class="disp" style="position:relative;margin-left:auto;align-self:flex-end;font-size:${p != null && Math.abs(p) >= 0.995 ? 110 : 150}px;letter-spacing:-0.02em;text-shadow:0 18px 40px rgba(0,0,0,0.45)">${p != null ? pct(p) : ''}</div>
    </section>
    <section class="card" style="flex-grow:1;min-height:0;padding:20px;overflow-y:auto">
      <ol class="ladder" style="display:flex;flex-direction:column;gap:8px">${ladder.join('')}</ol>
    </section>
    <section class="card" style="flex-shrink:0;padding:22px 26px;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;flex-direction:column;gap:10px">
          <div class="label">${S.weightMode ? 'SET THE WEIGHT' : `SET ${i + 1} · HOW MANY REPS?`}${planned?.amrap && !S.weightMode ? ' <span class="amrap">AS MANY AS YOU CAN</span>' : ''}</div>
          <div style="display:flex;align-items:baseline;gap:8px">
            <div class="disp" style="font-size:72px">${S.weightMode ? S.reps : fmtW(S.weight)}</div>
            <div class="cond gray" style="font-weight:800;font-size:26px">${S.weightMode ? 'REPS' : 'LB'}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:18px">
          <button type="button" class="btn btn-ghost stepper" data-act="dec" aria-label="${S.weightMode ? 'Five pounds less' : 'One fewer rep'}">−</button>
          <div aria-live="polite" class="disp" style="font-size:${S.weightMode ? 96 : 120}px;min-width:70px;text-align:center">${S.weightMode ? fmtW(S.weight) : S.reps}</div>
          <button type="button" class="btn btn-ghost stepper" data-act="inc" aria-label="${S.weightMode ? 'Five pounds more' : 'One more rep'}">+</button>
        </div>
      </div>
      <div style="display:flex;gap:14px">
        ${S.weightMode
          ? `<button type="button" class="btn btn-main" data-act="weightdone" style="flex-grow:1;height:84px;font-size:34px">WEIGHT IS ${fmtW(S.weight)}</button>`
          : `<button type="button" class="btn btn-ghost" data-act="weight" style="width:230px;height:84px;font-size:24px">CHANGE WEIGHT</button>
             <button type="button" class="btn btn-main" data-act="log" style="flex-grow:1;height:84px;font-size:34px" ${S.busy ? 'disabled' : ''}>LOG SET</button>`}
      </div>
      ${s.sets.length && !S.weightMode ? `<div style="display:flex;justify-content:space-between">
        <button type="button" class="btn btn-ghost undo" data-act="undo">UNDO LAST SET</button>
        <button type="button" class="btn btn-ghost undo" data-act="finish">FINISH ${esc(s.lift.short.toUpperCase())}</button></div>` : ''}
    </section>
  </div>`;
}

function doneView() {
  const s = S.session;
  const a = s.athlete;
  const p = s.beat_pct;
  const next = s.next;
  return `<div class="screen-rack">
    ${header()}
    ${personLine(a)}
    <section class="card" style="flex-shrink:0;padding:30px;display:flex;flex-direction:column;gap:16px">
      <div class="sheen" aria-hidden="true"></div>
      <div class="label" style="position:relative;font-size:22px;letter-spacing:0.14em">${esc(s.lift.short.toUpperCase())} DONE</div>
      <div class="disp" style="position:relative;font-size:120px;line-height:0.82">${p == null ? 'NICE<br>WORK' : p > 0 ? 'NICE<br>WORK' : 'GOOD<br>WORK'}</div>
      <div style="position:relative;display:flex;align-items:center;gap:16px;margin-top:8px">
        ${s.rank ? `<div class="pill chip-white" style="height:56px;padding:0 22px 0 18px;gap:10px;font-family:var(--f-cond);font-weight:800;font-size:26px;letter-spacing:0.06em">
          <span class="disp" style="font-size:32px">#${s.rank}</span>BEAT YOUR LAST TODAY</div>`
          : `<div class="label" style="font-size:22px">${s.last ? '' : 'FIRST ONE ON FILE. BEAT IT NEXT TIME.'}</div>`}
        <div class="disp" style="margin-left:auto;font-size:84px">${p != null ? pct(p) : ''}</div>
      </div>
    </section>
    <section class="card" style="flex-grow:1;min-height:0;padding:20px;overflow-y:auto">
      <ol style="display:flex;flex-direction:column;gap:8px">${s.sets.map((x, k) => `<li class="row" style="height:58px;padding:0 20px;border-radius:18px;gap:14px">
        <div class="label">SET ${k + 1}${x.is_pr ? ' · PR' : ''}</div>
        <div class="disp" style="margin-left:auto;font-size:36px;line-height:0.85">${fmtW(x.weight)} <span class="cond gray" style="font-size:20px">× ${x.reps}</span></div></li>`).join('')}</ol>
    </section>
    <section class="card" style="flex-shrink:0;padding:24px 26px;display:flex;flex-direction:column;gap:16px">
      <div class="label" style="font-size:22px;letter-spacing:0.14em">${next ? 'NEXT UP' : 'THAT\'S THE WORKOUT'}</div>
      ${next ? `<div style="font-weight:600;font-size:28px;line-height:1.3" class="gray"><span style="color:#fff">${esc(next.lift_name)}</span> · ${esc(next.label)}${next.first_weight ? ` · <span style="color:#fff">${fmtW(next.first_weight)} lb</span>` : ''}</div>` : ''}
      <div style="display:flex;gap:14px">
        <button type="button" class="btn ${next ? 'btn-ghost' : 'btn-main'}" data-act="leave" style="${next ? 'width:230px;font-size:24px' : 'flex-grow:1;font-size:34px'};height:84px">I'M DONE</button>
        ${next ? `<button type="button" class="btn btn-main" data-act="next" style="flex-grow:1;height:84px;font-size:34px">START ${esc(next.lift_short.toUpperCase())}</button>` : ''}
      </div>
    </section>
  </div>`;
}

// ---------- PR takeover (silent; flashes stay under 3 per second) ----------
function prView() {
  const s = S.session;
  const a = s.athlete;
  const pr = S.pr;
  const marquee = 'NEW PR · '.repeat(14);
  const ring = (w, b, op) => `<div class="ring" style="width:${w}px;height:${w}px;margin-left:-${w / 2}px;margin-top:-${w / 2}px;border:1.5px solid rgba(255,255,255,${op})" data-k="burstO"></div>`;
  const pulse = (bw, k) => `<div class="ring" style="width:700px;height:700px;margin-left:-350px;margin-top:-350px;border:${bw}px solid rgba(255,255,255,0.9)" data-k="${k}"></div>`;
  return `<div class="pr" data-act="prdone">
    <div class="abs" style="inset:-30px" data-k="shake">
      <div class="abs" style="inset:0;background:radial-gradient(820px 620px at 50% 46%, rgba(9,74,40,1) 0%, rgba(9,74,40,0.7) 45%, rgba(9,74,40,0) 85%)" data-k="flood"></div>
      <div class="abs" style="left:50%;top:560px;width:1800px;height:1800px;margin-left:-900px;margin-top:-870px;border-radius:50%;background:repeating-conic-gradient(from 0deg, rgba(255,255,255,0.2) 0deg 7deg, rgba(255,255,255,0) 7deg 22deg);-webkit-mask-image:radial-gradient(circle,#000 8%,rgba(0,0,0,0) 60%);mask-image:radial-gradient(circle,#000 8%,rgba(0,0,0,0) 60%)" data-k="rays"></div>
      <div class="abs" style="left:50%;top:560px;width:1800px;height:1800px;margin-left:-900px;margin-top:-870px;border-radius:50%;background:repeating-conic-gradient(from 11deg, rgba(255,255,255,0.1) 0deg 3deg, rgba(255,255,255,0) 3deg 15deg);-webkit-mask-image:radial-gradient(circle,#000 6%,rgba(0,0,0,0) 48%);mask-image:radial-gradient(circle,#000 6%,rgba(0,0,0,0) 48%)" data-k="rays2"></div>
      <div class="band" style="top:150px;height:150px" data-k="band"><div style="font-size:140px;line-height:150px;color:rgba(255,255,255,0.10)" data-k="m1">${marquee}</div></div>
      <div class="band" style="top:990px;height:120px;background:rgba(255,255,255,0.92)" data-k="band"><div style="font-size:110px;line-height:120px;color:var(--green)" data-k="m2">${marquee}</div></div>
      <div class="abs" style="inset:30px">
        ${ring(560, 1.5, 0.2)}${ring(820, 1.5, 0.12)}${ring(1100, 1.5, 0.07)}
        ${pulse(6, 'r0')}${pulse(4, 'r1')}${pulse(3, 'r2')}
        <div class="ring" style="width:720px;height:720px;margin-left:-360px;margin-top:-360px;background:radial-gradient(circle, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0) 62%)" data-k="glow"></div>
        <div class="abs" style="left:36px;right:36px;top:32px;display:flex;align-items:center;justify-content:space-between">
          <div class="shield-glow" style="margin:-22px;padding:22px"><img src="/img/shield.svg" alt="Greenbrier Bobcat Shield" style="height:64px;width:89px"></div>
          <div class="smoke pill label" style="height:44px;padding:0 20px;letter-spacing:0.14em">${esc((S.rack?.name || '').toUpperCase())}</div>
        </div>
        <div class="abs" style="left:0;right:0;top:170px;display:flex;flex-direction:column;align-items:center">
          <div class="pill" style="height:68px;padding:0 34px 0 26px;background:#fff;color:var(--green);box-shadow:0 0 0 10px rgba(255,255,255,0.16),0 0 60px rgba(255,255,255,0.35),0 18px 40px rgba(0,0,0,0.45);gap:12px;font-family:var(--f-cond);font-weight:800;font-size:40px;letter-spacing:0.12em" data-k="pill">${ICON.up('#094a28', 32)}NEW PR</div>
          <div style="margin-top:22px;display:flex;align-items:baseline;gap:18px" data-k="num">
            <div class="disp" style="width:470px;text-align:right;font-size:320px;letter-spacing:-0.02em;text-shadow:0 0 80px rgba(255,255,255,0.35),0 26px 60px rgba(0,0,0,0.55)" data-k="count">0</div>
            <div class="cond gray" style="font-weight:800;font-size:60px">LB</div>
          </div>
          <div class="cond" style="margin-top:18px;font-weight:800;font-size:42px;letter-spacing:0.3em;text-transform:uppercase" data-k="liftname">${esc(s.lift.name)}</div>
          ${pr.single ? '' : `<div class="label" style="margin-top:14px;font-size:24px;letter-spacing:0.14em;color:#fff" data-k="liftname">ESTIMATED MAX FROM ${fmtW(pr.weight)} × ${pr.reps}</div>`}
        </div>
        <div class="abs" style="left:36px;right:36px;bottom:32px;display:flex;flex-direction:column;gap:16px">
          <div style="height:132px;padding:0 22px;border-radius:34px;background:#fff;color:var(--green);box-shadow:0 24px 50px -8px rgba(0,0,0,0.6),0 0 0 8px rgba(255,255,255,0.12);display:flex;align-items:center;gap:20px" data-k="card">
            ${avatar(a, 92, { solid: true })}
            <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
              <div class="clip" style="font-weight:700;font-size:46px;line-height:1;letter-spacing:-0.01em;color:#000">${esc(a.display)}</div>
              <div class="cond" style="font-size:22px;letter-spacing:0.12em;color:var(--green)">${esc([a.position, a.cls_long].filter(Boolean).join(' · '))}</div>
            </div>
            <div class="pill" style="margin-left:auto;height:64px;padding:0 24px;background:var(--green);color:#fff;gap:10px;font-family:var(--f-cond);font-weight:800;font-size:28px;letter-spacing:0.04em;flex-shrink:0" data-k="chip">
              <span class="disp" style="font-size:40px">+${pr.gain} LB</span><span style="color:#cfe0d6">FROM ${Math.round(pr.prev)}</span></div>
          </div>
          <button type="button" class="btn btn-main" data-act="prdone" style="height:84px;font-size:28px" data-k="chip">KEEP LIFTING</button>
        </div>
      </div>
    </div>
    <div class="abs" style="inset:0;background:#fff;pointer-events:none;opacity:0" data-k="flash"></div>
  </div>`;
}

let prRaf = null;
let prShownAt = 0;
function playPr() {
  const root = stage.querySelector('.pr');
  if (!root) return;
  const els = {};
  root.querySelectorAll('[data-k]').forEach((el) => { (els[el.dataset.k] ||= []).push(el); });
  const set = (k, prop, v) => (els[k] || []).forEach((el) => { el.style[prop] = v; });
  const target = Math.round(S.pr.e1rm);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t0 = performance.now();
  prShownAt = t0;
  const END = 6.9; // hold the final frame after this
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const out = (t) => 1 - Math.pow(1 - t, 3);
  const outExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const back = (t) => { const c = 2.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const LAND = 1.15;
  const frame = (now) => {
    const e = reduce ? 4 : Math.min((now - t0) / 1000, END);
    const seg = (a, b) => clamp((e - a) / (b - a));
    const b = outExpo(seg(0, 0.4));
    const n = out(seg(0.15, LAND));
    const p = seg(0.05, 0.4);
    const c = seg(1.35, 1.75);
    const k = seg(1.7, 2.05);
    const since = e - LAND;
    const hit = since >= 0 && since < 0.5 ? Math.exp(-since * 7) : 0;
    // Three white flashes 0.42 s apart = 2.4 per second, under the 3-per-second seizure limit.
    const beat = (ts, amp) => { const d = e - ts; return d >= 0 && d < 0.3 ? amp * Math.exp(-d * 12) : 0; };
    const flash = beat(LAND, 0.75) + beat(LAND + 0.42, 0.45) + beat(LAND + 0.84, 0.3);
    const pulse = e > LAND + 1 && e < END ? 0.5 + 0.5 * Math.sin((e - LAND) * Math.PI * 2 / 0.9) : 0;
    const shake = since >= 0 && since < 0.45 ? Math.exp(-since * 9) : 0;
    const numScale = e < LAND ? 1.45 - 0.45 * n : 1 + 0.16 * hit + 0.025 * pulse;
    const ring = (d) => { const t = clamp((e - LAND - d) / 1.1); return [`scale(${(0.25 + 1.75 * out(t)).toFixed(3)})`, t > 0 && t < 1 ? (1 - t) * 0.85 : 0]; };
    (els.count || []).forEach((el) => { el.textContent = String(Math.round(target * n)); });
    set('shake', 'transform', `translate(${(Math.sin(e * 97) * 18 * shake).toFixed(1)}px, ${(Math.cos(e * 83) * 14 * shake).toFixed(1)}px)`);
    set('flood', 'opacity', (0.55 + 0.45 * b).toFixed(3));
    set('rays', 'transform', `scale(${(0.3 + 0.7 * b + 0.12 * hit).toFixed(3)}) rotate(${(e * 14).toFixed(2)}deg)`);
    set('rays2', 'transform', `scale(${(0.4 + 0.6 * b + 0.2 * hit).toFixed(3)}) rotate(${(-e * 22).toFixed(2)}deg)`);
    set('rays', 'opacity', b.toFixed(3)); set('rays2', 'opacity', b.toFixed(3)); set('burstO', 'opacity', b.toFixed(3));
    set('glow', 'transform', `scale(${(0.4 + 0.6 * b + 0.35 * hit).toFixed(3)})`);
    set('glow', 'opacity', Math.min(1, b * 0.7 + 0.6 * hit + 0.3 * pulse).toFixed(3));
    for (const [key, d] of [['r0', 0], ['r1', 0.14], ['r2', 0.3]]) { const [T, O] = ring(d); set(key, 'transform', T); set(key, 'opacity', O.toFixed(3)); }
    set('pill', 'transform', `scale(${(p > 0 ? 2.2 - 1.2 * back(p) : 2.2).toFixed(3)})`);
    set('pill', 'opacity', Math.min(1, p * 2).toFixed(3));
    set('liftname', 'opacity', Math.min(1, p * 2).toFixed(3));
    set('num', 'transform', `scale(${numScale.toFixed(3)})`);
    set('flash', 'opacity', Math.min(0.8, flash).toFixed(3));
    set('band', 'opacity', seg(LAND, LAND + 0.35).toFixed(3));
    set('m1', 'transform', `translateX(${(-((e * 260) % 1200)).toFixed(1)}px)`);
    set('m2', 'transform', `translateX(${(-1200 + ((e * 340) % 1200)).toFixed(1)}px)`);
    set('card', 'transform', `translateY(${((1 - out(c)) * 140).toFixed(1)}px) scale(${(c > 0 ? 1.4 - 0.4 * back(c) : 1.4).toFixed(3)})`);
    set('card', 'opacity', Math.min(1, c * 3).toFixed(3));
    set('chip', 'transform', `scale(${(k > 0 ? 1.6 - 0.6 * back(k) : 1.6).toFixed(3)})`);
    set('chip', 'opacity', Math.min(1, k * 3).toFixed(3));
    if (!reduce && e < END && S.view === 'pr') prRaf = requestAnimationFrame(frame);
  };
  cancelAnimationFrame(prRaf);
  prRaf = requestAnimationFrame(frame);
}

function sleepView() {
  return `<div class="sleep" data-act="wake"><div>TAP TO WAKE</div></div>`;
}

// ---------- render + events ----------
function render() {
  const views = { idle: idleView, signin: signinView, find: findView, log: logView, done: doneView, pr: prView, sleep: sleepView };
  stage.innerHTML = (views[S.view] || idleView)() + (toastMsg ? `<div class="toast">${esc(toastMsg)}</div>` : '');
  if (S.view === 'pr') playPr();
}

let toastMsg = '';
let toastTimer;
function toast(msg) {
  toastMsg = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastMsg = ''; render(); }, 3500);
  render();
}

function fmtW(w) { return w == null ? '—' : Number.isInteger(w) ? String(w) : w.toFixed(1); }

function setDefaultsForCurrentSet() {
  const s = S.session;
  const i = currentSetIndex();
  const plan = s.plan[i] || s.plan[s.plan.length - 1];
  const lastDone = s.sets[s.sets.length - 1];
  S.reps = plan ? plan.reps : lastDone ? lastDone.reps : 5;
  S.weight = plan && plan.weight ? plan.weight : lastDone ? lastDone.weight : 45;
  S.weightMode = !(plan && plan.weight) && !lastDone; // no load known: ask for weight first
}

async function startSession(athleteId, itemId) {
  S.busy = true;
  try {
    S.session = await api('/api/sessions', { body: { athlete_id: athleteId, rack_id: rackId, item_id: itemId } });
    setDefaultsForCurrentSet();
    S.view = S.session.sets.length >= S.session.plan.length && S.session.plan.length ? 'done' : 'log';
  } catch (e) { toast(e.message); }
  S.busy = false;
  render();
}

async function act(name, el) {
  switch (name) {
    case 'start':
      S.pick = null; S.view = 'signin'; await loadRack(); break;
    case 'pick': {
      const id = Number(el.dataset.id);
      S.pick = S.pick && S.pick.id === id ? null : S.crew.find((a) => a.id === id) || null;
      render(); break;
    }
    case 'find':
      S.view = 'find'; S.letter = null;
      try { S.roster = await api('/api/athletes'); } catch (e) { toast(e.message); }
      render(); break;
    case 'letter': S.letter = el.dataset.l; render(); break;
    case 'found':
      try { S.pick = await api(`/api/athletes/${el.dataset.id}/card`); } catch (e) { toast(e.message); }
      S.view = 'signin'; render(); break;
    case 'back': S.view = 'signin'; render(); break;
    case 'go': if (S.pick?.item_id) await startSession(S.pick.id, S.pick.item_id); break;
    case 'switch': endQuietly(); S.pick = null; S.view = 'signin'; await loadRack(); break;
    case 'dec':
      if (S.weightMode) S.weight = Math.max(0, S.weight - Number(S.settings.round_to || 5));
      else S.reps = Math.max(1, S.reps - 1);
      render(); break;
    case 'inc':
      if (S.weightMode) S.weight += Number(S.settings.round_to || 5);
      else S.reps = Math.min(50, S.reps + 1);
      render(); break;
    case 'weight': S.weightMode = true; render(); break;
    case 'weightdone': S.weightMode = false; render(); break;
    case 'log': {
      if (S.busy) return;
      S.busy = true; render();
      try {
        const r = await api(`/api/sessions/${S.session.id}/sets`, { body: { weight: S.weight, reps: S.reps } });
        const loggedWeight = S.weight;
        S.session = r.session;
        if (r.is_pr) {
          S.pr = { ...r.pr, weight: loggedWeight, reps: S.session.sets[S.session.sets.length - 1].reps };
          S.view = 'pr';
        } else {
          S.view = S.session.sets.length >= S.session.plan.length ? 'done' : 'log';
        }
        setDefaultsForCurrentSet();
        if (S.view === 'done') api(`/api/sessions/${S.session.id}/end`, { method: 'POST', body: {} }).catch(() => {});
      } catch (e) { toast(e.message); }
      S.busy = false; render(); break;
    }
    case 'undo':
      try { S.session = await api(`/api/sessions/${S.session.id}/undo`, { method: 'POST', body: {} }); setDefaultsForCurrentSet(); } catch (e) { toast(e.message); }
      render(); break;
    case 'finish': S.view = 'done'; endQuietly(); render(); break;
    case 'prdone':
      if (performance.now() - prShownAt < 1800) return; // don't let a stray tap kill the moment
      cancelAnimationFrame(prRaf);
      S.view = S.session.sets.length >= S.session.plan.length ? 'done' : 'log';
      render(); break;
    case 'next': if (S.session?.next) await startSession(S.session.athlete.id, S.session.next.id); break;
    case 'leave': endQuietly(); goIdle(); break;
    case 'wake': S.view = 'idle'; await loadRack(); break;
  }
}

function endQuietly() {
  if (S.session) api(`/api/sessions/${S.session.id}/end`, { method: 'POST', body: {} }).catch(() => {});
}
function goIdle() {
  S.view = 'idle'; S.session = null; S.pick = null; S.pr = null;
  loadRack();
}

stage.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  ev.stopPropagation();
  act(el.dataset.act, el);
});

// ---------- idle + sleep timers (battery) ----------
let lastTouch = Date.now();
['pointerdown', 'keydown'].forEach((t) => window.addEventListener(t, () => { lastTouch = Date.now(); }, { passive: true }));
setInterval(() => {
  const idleFor = (Date.now() - lastTouch) / 1000;
  const idleAfter = Number(S.settings.rack_idle_seconds || 90);
  const sleepAfter = Number(S.settings.rack_sleep_seconds || 300);
  if (!['idle', 'sleep'].includes(S.view) && idleFor > (S.view === 'pr' ? idleAfter + 30 : idleAfter)) { endQuietly(); goIdle(); }
  else if (S.view === 'idle' && idleFor > sleepAfter) { S.view = 'sleep'; render(); }
}, 5000);

// Battery level in the header, where the browser allows it (Chrome on Android does).
if (navigator.getBattery) {
  navigator.getBattery().then((b) => {
    const upd = () => { S.battery = b.level; if (['idle', 'signin'].includes(S.view)) render(); };
    b.addEventListener('levelchange', upd);
    upd();
  }).catch(() => {});
}

// Refresh the idle and sign-in screens when the coach changes the workout or roster.
live(() => { if (['idle', 'signin'].includes(S.view)) loadRack(); else if (S.view === 'log' || S.view === 'done') refreshSession(); });
async function refreshSession() {
  if (!S.session) return;
  try { S.session = await api(`/api/sessions/${S.session.id}`); render(); } catch {}
}

loadRack();

// ---------- keep the screen on mid-workout, let Android turn it off when idle ----------
// Needs the tablet's Chrome to treat this address as secure (see README, tablet setup).
let wakeLock = null;
async function syncWakeLock() {
  const want = !['idle', 'sleep'].includes(S.view) && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', syncWakeLock);
setInterval(syncWakeLock, 3000);
