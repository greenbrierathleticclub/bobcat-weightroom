// Parses the coach's shorthand for a lift into a list of sets.
// Deliberately loose so the coach can write whatever he wants:
//   "5x3@75"            5 sets of 3 at 75% of max
//   "3@65, 3@75, 3+@85" a wave, last set AMRAP (at least 3)
//   "1xAMRAP@70"        one set, as many as possible
//   "3x8"               no load given: the kid picks the weight
//   "2x5@225lb"         a fixed weight in pounds
// Anything it can't read comes back in `errors` and the coach page shows it.

const CHUNK = /^(?:(\d+)\s*[x×]\s*)?(\d+|amrap|max)(\+)?\s*(?:@\s*(\d+(?:\.\d+)?)\s*(%|lbs?|#)?)?$/i;

export function parseScheme(text) {
  const sets = [];
  const errors = [];
  const parts = String(text || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const m = part.replace(/\s+/g, ' ').match(CHUNK);
    if (!m) { errors.push(part); continue; }
    const count = m[1] ? parseInt(m[1], 10) : 1;
    const isWordAmrap = /^(amrap|max)$/i.test(m[2]);
    const reps = isWordAmrap ? 1 : parseInt(m[2], 10);
    const amrap = isWordAmrap || !!m[3];
    let pct = null;
    let lb = null;
    if (m[4]) {
      const val = parseFloat(m[4]);
      if (m[5] && /lb|#/i.test(m[5])) lb = val;
      else pct = val / 100;
    }
    if (count < 1 || count > 20 || reps < 1 || reps > 50) { errors.push(part); continue; }
    for (let i = 0; i < count; i++) sets.push({ reps, amrap, pct, lb });
  }
  return { sets, errors };
}

// Short label for screens: "5 × 3 @ 75%", or the coach's own text if it's a wave.
export function schemeLabel(text) {
  const { sets, errors } = parseScheme(text);
  if (errors.length || !sets.length) return String(text || '').trim();
  const same = sets.every((s) => s.reps === sets[0].reps && s.amrap === sets[0].amrap && s.pct === sets[0].pct && s.lb === sets[0].lb);
  const load = (s) => (s.pct != null ? ` @ ${Math.round(s.pct * 1000) / 10}%` : s.lb != null ? ` @ ${s.lb} lb` : '');
  const reps = (s) => `${s.reps}${s.amrap ? '+' : ''}`;
  if (same) return `${sets.length} × ${reps(sets[0])}${load(sets[0])}`;
  return sets.map((s) => `${reps(s)}${load(s)}`).join(', ');
}
