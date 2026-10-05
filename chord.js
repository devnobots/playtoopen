// Major/minor chord detection from an FFT spectrum, via a 12-bin chroma (pitch-class) profile.

import { NOTE_NAMES } from './pitch.js?v=1.3';

const MIN_HZ = 75;
const MAX_HZ = 2000;
const PEAK_RANGE_DB = 40;  // ignore spectral peaks this far below the loudest one
const MIN_SCORE = 0.8;     // cosine similarity needed to call a chord
const MIN_MARGIN = 0.04;   // best chord must beat the runner-up by this much
const MIN_TONE_RATIO = 0.2; // weakest chord tone vs. strongest

const TEMPLATES = [];
for (let root = 0; root < 12; root++) {
  TEMPLATES.push({ name: NOTE_NAMES[root], tones: [root, (root + 4) % 12, (root + 7) % 12] });
  TEMPLATES.push({ name: NOTE_NAMES[root] + 'm', tones: [root, (root + 3) % 12, (root + 7) % 12] });
}

// db: dB magnitudes as from AnalyserNode.getFloatFrequencyData. Returns a Float32Array(12).
export function chroma(db, sampleRate, fftSize) {
  const binHz = sampleRate / fftSize;
  const lo = Math.max(1, Math.ceil(MIN_HZ / binHz));
  const hi = Math.min(db.length - 2, Math.floor(MAX_HZ / binHz));

  let maxDb = -Infinity;
  for (let i = lo; i <= hi; i++) if (db[i] > maxDb) maxDb = db[i];

  const c = new Float32Array(12);
  for (let i = lo; i <= hi; i++) {
    const v = db[i];
    if (v < maxDb - PEAK_RANGE_DB || v <= db[i - 1] || v < db[i + 1]) continue;
    const a = db[i - 1], b = db[i + 1];
    const denom = a - 2 * v + b;
    const shift = denom === 0 ? 0 : (0.5 * (a - b)) / denom;
    const midi = 69 + 12 * Math.log2(((i + shift) * binHz) / 440);
    c[((Math.round(midi) % 12) + 12) % 12] += 10 ** (v / 20);
  }
  return c;
}

// Returns a chord name like 'E', 'Am' or 'F#', or null when nothing chord-like stands out.
export function detectChord(db, sampleRate, fftSize) {
  const c = chroma(db, sampleRate, fftSize);
  let norm = 0;
  for (const v of c) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return null;

  let best = null, bestScore = -1, secondScore = -1;
  for (const t of TEMPLATES) {
    const score = (c[t.tones[0]] + c[t.tones[1]] + c[t.tones[2]]) / (norm * Math.sqrt(3));
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      best = t;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }
  if (bestScore < MIN_SCORE || bestScore - secondScore < MIN_MARGIN) return null;

  // A single note's overtones also hint at a major triad, but its third only comes from a faint
  // 5th harmonic. In a real chord every tone is a played string, so each is reasonably strong.
  const tones = best.tones.map(t => c[t]);
  if (Math.min(...tones) < MIN_TONE_RATIO * Math.max(...tones)) return null;
  return best.name;
}
