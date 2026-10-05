// Monophonic pitch detection (YIN) and note naming.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const MIN_FREQ = 70;     // a little below low E on guitar (82 Hz)
const MAX_FREQ = 1500;   // well above the useful range of most melodies
const YIN_THRESHOLD = 0.15;
const MIN_RMS = 0.01;    // below this the frame is treated as silence

// Returns { freq, rms, clarity } or { freq: null, rms } when no clear pitch is found.
export function detectPitch(buf, sampleRate) {
  const n = buf.length;

  let sum = 0;
  for (let i = 0; i < n; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / n);
  if (rms < MIN_RMS) return { freq: null, rms };

  const minLag = Math.floor(sampleRate / MAX_FREQ);
  const maxLag = Math.min(Math.ceil(sampleRate / MIN_FREQ), Math.floor(n / 2));
  const w = n - maxLag;

  // Cumulative mean normalized difference function.
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    let d = 0;
    for (let j = 0; j < w; j++) {
      const diff = buf[j] - buf[j + tau];
      d += diff * diff;
    }
    running += d;
    cmnd[tau] = running === 0 ? 1 : (d * tau) / running;
  }

  // First dip below the threshold, then slide down to its local minimum.
  let tau = -1;
  for (let t = Math.max(2, minLag); t < maxLag; t++) {
    if (cmnd[t] < YIN_THRESHOLD) {
      while (t + 1 < maxLag && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) return { freq: null, rms };

  // Parabolic interpolation for sub-sample accuracy.
  const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1];
  const denom = a - 2 * b + c;
  const shift = denom === 0 ? 0 : (a - c) / (2 * denom);

  return { freq: sampleRate / (tau + shift), rms, clarity: 1 - b };
}

// Maps a frequency to { name, octave, cents }; name has no octave so C2 and C5 are both 'C'.
export function freqToNote(freq) {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const rounded = Math.round(midi);
  return {
    name: NOTE_NAMES[((rounded % 12) + 12) % 12],
    octave: Math.floor(rounded / 12) - 1,
    cents: Math.round((midi - rounded) * 100),
  };
}
