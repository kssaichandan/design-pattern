/* ============================================================
   The simulation clock - plain helper code, NOT a design pattern.
   ------------------------------------------------------------
   Everything that moves the ride forward on its own - the State
   timers ("a driver accepts after ~2 s") and the GPS stream - asks
   this clock instead of the browser's, so the guided demo can slow
   the whole ride down for reading, or pause it outright, without
   any pattern knowing a demo is running.

   rate 1 = normal speed, 0.5 = half speed. paused = nothing moves.
   ============================================================ */

const SimClock = {
  paused: false,
  rate: 1,

  _timers: new Set(),
  _handle: null,
  _last: 0,

  /** Like setTimeout, but in simulation time. Returns a handle for cancel(). */
  after(ms, fn) {
    const timer = { left: ms, fn };
    this._timers.add(timer);
    this._run();
    return timer;
  },

  cancel(timer) {
    this._timers.delete(timer);
  },

  _run() {
    if (this._handle) return;
    this._last = performance.now();
    this._handle = setInterval(() => {
      const now = performance.now();
      const dt = now - this._last;
      this._last = now;
      if (this.paused) return;

      [...this._timers].forEach((timer) => {
        timer.left -= dt * this.rate;
        if (timer.left <= 0 && this._timers.delete(timer)) timer.fn();
      });

      if (!this._timers.size) {
        clearInterval(this._handle);
        this._handle = null;
      }
    }, 40);
  },
};
