// Turns a stream of detected tokens (notes or chords) into "played" events and checks them against a
// target sequence. Strict mode: anything wrong sends progress back to the start.

const STABLE_MS = 120;      // default time a token must hold before it counts
const RELEASE_MS = 80;      // silence this long ends the current token
const SILENCE_RMS = 0.01;   // matches MIN_RMS in pitch.js
const REATTACK_RATIO = 2.5; // volume jump (vs. its decayed level) that counts as a fresh pluck/strum

export class SequenceMatcher {
  constructor(targets) {
    this.targets = targets;
    this.index = 0;
    this.candidate = null;      // token currently being heard
    this.candidateSince = 0;
    this.silentSince = null;
    this.held = null;           // last token that counted, still ringing
    this.armed = true;          // whether `held` may count again
    this.minRmsSinceAccept = Infinity;
  }

  // token: what was heard, or null when nothing clear was heard (true silence if rms is low, otherwise
  // unclear sound, which changes nothing). Returns an event or null:
  //   { type: 'correct', index } - targets[index] was played
  //   { type: 'wrong', token, restartedAt } - progress reset; restartedAt is 1 if the token was targets[0]
  //   { type: 'success', index }
  feed(token, rms, now, stableMs = STABLE_MS) {
    if (rms < SILENCE_RMS) {
      if (this.silentSince === null) this.silentSince = now;
      if (now - this.silentSince >= RELEASE_MS) {
        this.held = null;
        this.candidate = null;
      }
      return null;
    }
    this.silentSince = null;

    if (this.held !== null) {
      this.minRmsSinceAccept = Math.min(this.minRmsSinceAccept, rms);
      if (!this.armed && rms > this.minRmsSinceAccept * REATTACK_RATIO) {
        this.armed = true;
        this.candidate = null; // require the new attack to settle
      }
    }
    if (token === null) return null;

    if (token !== this.candidate) {
      this.candidate = token;
      this.candidateSince = now;
      return null;
    }
    if (now - this.candidateSince < stableMs) return null;
    if (token === this.held && !this.armed) return null;

    this.held = token;
    this.armed = false;
    this.minRmsSinceAccept = rms;
    return this.#accept(token);
  }

  #accept(token) {
    if (token === this.targets[this.index]) {
      const index = this.index++;
      if (this.index === this.targets.length) return { type: 'success', index };
      return { type: 'correct', index };
    }
    this.index = token === this.targets[0] ? 1 : 0;
    return { type: 'wrong', token, restartedAt: this.index };
  }
}
