// Thin wrapper around an HTMLAudioElement. The audio element's own clock is
// the source of truth for uTime during real playback (not
// requestAnimationFrame's timer) — this is what keeps audio/video sync
// correct over a 42-minute run instead of drifting.

export class AudioEngine {
  constructor(src) {
    this.el = new Audio(src);
    this.el.preload = "auto";
  }

  async start() {
    await this.el.play();
  }

  pause() {
    this.el.pause();
  }

  get currentTime() {
    return this.el.currentTime;
  }

  get duration() {
    return this.el.duration || 0;
  }

  seek(t) {
    this.el.currentTime = t;
  }

  get ended() {
    return this.el.ended;
  }
}
