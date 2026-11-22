// All the math in one place so the boards and the rack agree.

// Estimated 1-rep max from a set (Epley). One rep = the weight itself.
// Capped at 12 reps: past that the formula is fiction.
export function e1rm(weight, reps) {
  if (!weight || !reps) return 0;
  if (reps === 1) return weight;
  return weight * (1 + Math.min(reps, 12) / 30);
}

// Prescribed load from a % of max, rounded DOWN to the nearest plate step.
export function loadFromPct(max, pct, roundTo = 5) {
  if (!max) return null;
  return Math.floor((max * pct) / roundTo) * roundTo;
}

// Beat Your Last: % change of today's best e1RM over the last session's best.
export function beatYourLast(todayBest, lastBest) {
  if (!todayBest || !lastBest) return null;
  return (todayBest - lastBest) / lastBest;
}

// Best Overall: bodyweight-adjusted total, 10 x total / BW^(2/3), as mocked.
export function bodyweightScore(total, bodyweight) {
  if (!total || !bodyweight) return null;
  return (10 * total) / Math.pow(bodyweight, 2 / 3);
}
