/* ============================================================
   BONUS PATTERN - SINGLETON
   ------------------------------------------------------------
   The dispatch log must be ONE shared object. Every pattern in
   the app writes to it, and the UI reads from it. If each module
   made its own log with "new DispatchLog()", the console panel
   would only ever show a fraction of what happened.

   Singleton guarantees: however many times you ask for it, you
   get back the exact same instance.
   ============================================================ */

class DispatchLog {
  constructor() {
    // The Singleton guard: hand back the existing instance instead
    // of building a second one.
    if (DispatchLog._instance) return DispatchLog._instance;

    this.entries = [];
    this.listeners = [];
    DispatchLog._instance = this;
  }

  /** The one official way to reach the log. */
  static getInstance() {
    if (!DispatchLog._instance) DispatchLog._instance = new DispatchLog();
    return DispatchLog._instance;
  }

  /**
   * @param {string} tag  FACTORY | STRATEGY | OBSERVER | STATE | FACADE | SINGLETON | SYSTEM
   * @param {string} message  wrap important words in {{ }} to highlight them
   */
  write(tag, message) {
    const entry = { tag, message, time: new Date() };
    this.entries.push(entry);
    if (this.entries.length > 400) this.entries.shift();
    this.listeners.forEach((fn) => fn(entry));
    return entry;
  }

  onWrite(fn) {
    this.listeners.push(fn);
  }

  clear() {
    this.entries = [];
    this.listeners.forEach((fn) => fn(null));
  }
}

DispatchLog._instance = null;

/** Shorthand used by every other file in the project. */
const log = (tag, message) => DispatchLog.getInstance().write(tag, message);
