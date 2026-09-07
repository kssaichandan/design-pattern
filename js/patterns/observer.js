/* ============================================================
   PATTERN 3 - OBSERVER  (behavioural)
   ------------------------------------------------------------
   PROBLEM: while a driver approaches, ONE fact - "the driver moved"
   - has to reach several unrelated parts of the app: the map marker,
   the ETA display, the trip log, and push notifications. The naive
   version wires them all into the GPS code:

       onGpsFix(point) {
         mapMarker.moveTo(point);
         etaLabel.textContent = ...;
         tripLog.append(...);
         pushService.send(...);       // and one more every release
       }

   Now the GPS code depends on the map, the label, the log and the
   notification service. Delete any one of them and GPS breaks.

   SOLUTION: the driver's phone (the Subject) keeps a list of
   subscribers and just announces "here is my new position".
   Whoever cares has registered itself. The Subject never learns
   their names. In the running app the checkboxes subscribe and
   unsubscribe observers live - untick one and it goes silent while
   every other observer keeps updating.
   ============================================================ */

/* ---------- the observer interface ---------- */

class LocationObserver {
  constructor(id, label, description) {
    this.id = id;
    this.label = label;
    this.description = description;
  }
  /** Called by the subject on every position update. */
  update(fix) { throw new Error("not implemented"); }
}

/* ---------- the subject (publisher) ---------- */

class DriverLocationPublisher {
  constructor() {
    this.observers = [];
    this.timer = null;
    this.lastFix = null;
  }

  subscribe(observer) {
    if (this.observers.includes(observer)) return;
    this.observers.push(observer);
    log("OBSERVER", `subscribe({{${observer.label}}}) - now ${this.observers.length} subscriber(s)`);
  }

  unsubscribe(observer) {
    this.observers = this.observers.filter((o) => o !== observer);
    log("OBSERVER", `unsubscribe({{${observer.label}}}) - now ${this.observers.length} subscriber(s)`);
  }

  /**
   * The heart of the pattern: one loop, no knowledge of who is listening.
   */
  notify(fix) {
    this.lastFix = fix;
    this.observers.forEach((observer) => observer.update(fix));
  }

  /**
   * Simulates the driver's phone emitting a GPS fix a few times a
   * second while it travels from `route[0]` to the end of the route.
   *
   * @param {object} opts  { path, distanceKm, seconds, leg, onArrive }
   */
  startTracking(opts) {
    this.stopTracking();

    const { path, distanceKm, seconds, leg, onArrive } = opts;
    const tickMs = 90;
    const totalTicks = Math.max(1, Math.round((seconds * 1000) / tickMs));
    let tick = 0;

    log("OBSERVER", `Driver GPS stream opened for leg {{${leg}}} - broadcasting to ${this.observers.length} subscriber(s)`);

    this.timer = setInterval(() => {
      tick += 1;
      const progress = Math.min(1, tick / totalTicks);
      const remainingKm = +(distanceKm * (1 - progress)).toFixed(1);
      const remainingSec = seconds * (1 - progress);

      this.notify({
        leg,
        progress,
        point: path.pointAt(progress),
        heading: path.headingAt(progress),
        remainingKm,
        etaMin: Math.max(0, Math.ceil(remainingSec / 60)),
        speedKmph: Math.round(28 + Math.sin(tick / 6) * 9),
      });

      if (progress >= 1) {
        this.stopTracking();
        if (onArrive) onArrive();
      }
    }, tickMs);
  }

  stopTracking() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

/* ---------- concrete observers ----------
   Each one receives the small set of UI functions it needs, so the
   pattern code stays free of document.getElementById calls.        */

class MapMarkerObserver extends LocationObserver {
  constructor(moveMarker) {
    super("map", "MapMarkerObserver", "Slides the car marker along the route.");
    this.moveMarker = moveMarker;
  }
  update(fix) {
    this.moveMarker(fix.point, fix.heading, fix.progress);
  }
}

class EtaPanelObserver extends LocationObserver {
  constructor(showEta) {
    super("eta", "EtaPanelObserver", "Refreshes the ETA, distance and speed readouts.");
    this.showEta = showEta;
  }
  update(fix) {
    this.showEta(fix.etaMin, fix.remainingKm, fix.speedKmph);
  }
}

class TripLogObserver extends LocationObserver {
  constructor() {
    super("log", "TripLogObserver", "Records position fixes into the dispatch log.");
    this.count = 0;
  }
  update(fix) {
    this.count += 1;
    // A real fleet logger samples; printing every 90 ms would drown the console.
    if (this.count % 18 !== 0) return;
    log("OBSERVER", `fix #${this.count} - ${fix.remainingKm} km out, ETA ${fix.etaMin} min, ${fix.speedKmph} km/h`);
  }
}

class PushNotificationObserver extends LocationObserver {
  constructor(pushToast) {
    super("push", "PushNotificationObserver", "Fires the arrival alerts a rider actually sees.");
    this.pushToast = pushToast;
    this.sent = new Set();
  }
  update(fix) {
    const alerts = [
      { at: 0.55, key: "half",    text: "Driver is halfway to you." },
      { at: 0.88, key: "close",   text: "Driver is arriving in a minute." },
    ];
    alerts.forEach((a) => {
      if (fix.leg === "TO_PICKUP" && fix.progress >= a.at && !this.sent.has(a.key)) {
        this.sent.add(a.key);
        this.pushToast(a.text);
        log("OBSERVER", `PushNotificationObserver -> {{"${a.text}"}}`);
      }
    });
  }
  reset() { this.sent.clear(); }
}
