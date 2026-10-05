// Turns a stream of detected notes into "note played" events and checks them against a target sequence.
// Strict mode: a wrong note sends progress back to the start.

const STABLE_MS = 120;      // a note must hold this long before it counts
const RELEASE_MS = 80;      // silence this long ends the current note
const REATTACK_RATIO = 2.5; // volume jump (vs. its decayed level) that counts as a fresh pluck/strike

export class SequenceMatcher {
  constructor(targets) {
    this.targets = targets;
    this.index = 0;
    this.candidate = null;      // note currently being heard
    this.candidateSince = 0;
    this.silentSince = null;
    this.held = null;           // last note that counted, still ringing
    this.armed = true;          // whether `held` may count again
    this.minRmsSinceAccept = Infinity;
  }

  // note: note name or null for silence/unclear. Returns an event or null:
  //   { type: 'correct', index }  - targets[index] was played
  //   { type: 'wrong', note, restartedAt } - progress reset; restartedAt is 1 if the wrong note was targets[0]
  //   { type: 'success' }
  feed(note, rms, now) {
    if (note === null) {
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

    if (note !== this.candidate) {
      this.candidate = note;
      this.candidateSince = now;
      return null;
    }
    if (now - this.candidateSince < STABLE_MS) return null;
    if (note === this.held && !this.armed) return null;

    this.held = note;
    this.armed = false;
    this.minRmsSinceAccept = rms;
    return this.#accept(note);
  }

  #accept(note) {
    if (note === this.targets[this.index]) {
      const index = this.index++;
      if (this.index === this.targets.length) return { type: 'success', index };
      return { type: 'correct', index };
    }
    this.index = note === this.targets[0] ? 1 : 0;
    return { type: 'wrong', note, restartedAt: this.index };
  }
}
