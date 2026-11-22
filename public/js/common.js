// Shared bits for every screen. No frameworks on purpose.

export async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return data;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Scale a fixed-size stage to fit the window, letterboxed.
export function fitStage(stage, w, h) {
  const fit = () => {
    const s = Math.min(window.innerWidth / w, window.innerHeight / h);
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    stage.style.transform = `scale(${s})`;
  };
  window.addEventListener('resize', fit);
  fit();
}

// Server-sent events: calls onChange whenever anything is logged or edited.
export function live(onChange) {
  let es;
  const open = () => {
    es = new EventSource('/api/events');
    es.addEventListener('change', (e) => onChange(JSON.parse(e.data || '{}')));
    es.onerror = () => { es.close(); setTimeout(open, 3000); };
  };
  open();
}

export function avatar(a, size, { solid = false } = {}) {
  const font = Math.round(size * 0.38);
  const photo = a.photo_url ? `background-image:url('${esc(a.photo_url)}');` : '';
  return `<div class="avatar${solid ? ' solid' : ''}" aria-hidden="true" style="width:${size}px;height:${size}px;font-size:${font}px;${photo}">${a.photo_url ? '' : esc(a.initials)}</div>`;
}

export const pct = (p, digits = 0) => (p == null ? '' : `${p >= 0 ? '+' : '−'}${Math.abs(p * 100).toFixed(digits)}%`);

export const WEEKDAY = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
export function weekday(day) {
  const [y, m, d] = day.split('-').map(Number);
  return WEEKDAY[new Date(y, m - 1, d).getDay()];
}

export const ICON = {
  check: '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>',
  up: (c = '#094a28', s = 20) => `<svg aria-hidden="true" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex-shrink:0"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"></path></svg>`,
  trend: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"></path><path d="M15 7h6v6"></path></svg>',
  list: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11"></path><path d="M9 12h11"></path><path d="M9 18h11"></path><circle cx="4.5" cy="6" r="1"></circle><circle cx="4.5" cy="12" r="1"></circle><circle cx="4.5" cy="18" r="1"></circle></svg>',
  star: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"></path></svg>',
  scale: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16"></path><path d="M5 8h14"></path><path d="M5 8l-3 6a3 3 0 0 0 6 0z"></path><path d="M19 8l-3 6a3 3 0 0 0 6 0z"></path></svg>',
  barbell: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v16"></path><path d="M18 4v16"></path><path d="M2 8v8"></path><path d="M22 8v8"></path><path d="M6 12h12"></path></svg>',
  battery: '<svg aria-hidden="true" width="30" height="16" viewBox="0 0 30 16" style="display:block;flex-shrink:0"><rect x="1" y="1" width="25" height="14" rx="4" fill="none" stroke="#ffffff" stroke-width="1.6" opacity="0.8"></rect><rect x="27" y="5" width="2.5" height="6" rx="1" fill="#ffffff" opacity="0.8"></rect><rect x="3.5" y="3.5" width="BATW" height="9" rx="2" fill="#ffffff"></rect></svg>',
};
