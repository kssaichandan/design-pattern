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
   * Opens the driver's GPS stream for one leg of the trip.
   *
   * The subject does not decide where the car goes - VehicleMotion
   * in traffic.js drives it, accelerating, braking for bends and
   * stopping at red lights. All the Observer pattern does here is
   * take whatever the car reports and hand it to every subscriber.
   *
   * @param {object} opts { path, distanceKm, seconds, cruiseKmph, leg, onArrive }
   */
  startTracking(opts) {
    this.stopTracking();

    const { path, distanceKm, seconds, leg, onArrive } = opts;
    const tickMs = 80;

    const motion = new VehicleMotion({
      path,
      distanceKm,
      cruiseKmph: opts.cruiseKmph || 34,
      seed: path.lengthPx,
    });

    // The car drives at real speeds; only the CLOCK is compressed, so
    // a 30 km airport run still plays out on screen in a few seconds
    // without the speedometer telling lies.
    const realSec = motion.realisticSeconds();
    const timeScale = realSec / Math.max(1, seconds);
    motion.reset();

    this.motion = motion;
    log(
      "OBSERVER",
      `Driver GPS stream opened for leg {{${leg}}} - ${distanceKm.toFixed(1)} km, ` +
      `${Math.round(realSec / 60)} min of real driving at ${timeScale.toFixed(0)}x, ` +
      `${motion.signals.length} signal(s) - broadcasting to ${this.observers.length} subscriber(s)`
    );

    let lastStops = 0;

    this.timer = setInterval(() => {
      motion.step((tickMs / 1000) * timeScale);

      if (motion.stops > lastStops) {
        lastStops = motion.stops;
        log("OBSERVER", `Driver held at a signal on {{${path.roadAt(motion.progress) || "an unnamed lane"}}}`);
      }

      const progress = motion.progress;

      this.notify({
        leg,
        progress,
        point: path.pointAt(progress),
        heading: path.headingAt(progress),
        road: path.roadAt(progress),
        roadClass: path.classAt(progress),
        status: motion.status,
        remainingKm: motion.remainingKm,
        etaMin: motion.etaMin,
        speedKmph: Math.round(motion.speedKmph),
      });

      if (motion.done) {
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
    this.moveMarker(fix.point, fix.heading, fix.progress, fix.status);
  }
}

class EtaPanelObserver extends LocationObserver {
  constructor(showEta) {
    super("eta", "EtaPanelObserver", "Refreshes ETA, distance, speed and the road name.");
    this.showEta = showEta;
  }
  update(fix) {
    this.showEta(fix);
  }
}

class TripLogObserver extends LocationObserver {
  constructor() {
    super("log", "TripLogObserver", "Records position fixes into the dispatch log.");
    this.count = 0;
  }
  update(fix) {
    this.count += 1;
    // A real fleet logger samples; printing every 80 ms would drown the console.
    if (this.count % 20 !== 0) return;
    const where = fix.road ? "on " + fix.road : "on a side lane";
    log(
      "OBSERVER",
      `fix #${this.count} ${where} - ${fix.remainingKm} km out, ETA ${fix.etaMin} min, ` +
      `${fix.speedKmph} km/h (${fix.status.toLowerCase()})`
    );
  }
  reset() { this.count = 0; }
}

class PushNotificationObserver extends LocationObserver {
  constructor(pushToast) {
    super("push", "PushNotificationObserver", "Fires the arrival alerts a rider actually sees.");
    this.pushToast = pushToast;
    this.sent = new Set();
  }
  update(fix) {
    // Real apps alert on TIME LEFT, not on a fraction of the route -
    // "5 minutes away" means something to a rider, "62% there" does not.
    const alerts = [
      { key: "five",  when: (f) => f.etaMin <= 5 && f.etaMin > 2, text: "Your driver is about 5 minutes away." },
      { key: "two",   when: (f) => f.etaMin <= 2,                 text: "Driver is arriving now - please head out." },
      { key: "jam",   when: (f) => f.status === "STOPPED" && f.progress > 0.25,
        text: "Driver is held up in traffic. ETA updated." },
    ];

    if (fix.leg !== "TO_PICKUP") return;

    alerts.forEach((a) => {
      if (this.sent.has(a.key) || !a.when(fix)) return;
      this.sent.add(a.key);
      this.pushToast(a.text);
      log("OBSERVER", `PushNotificationObserver -> {{"${a.text}"}}`);
    });
  }
  reset() { this.sent.clear(); }
}

/**
 * Added later, and it needed nothing but a subscribe() call. That
 * is the payoff: the GPS code was not opened, and no other observer
 * was told about it.
 */
class FareMeterObserver extends LocationObserver {
  constructor(showMeter, quoteTotal) {
    super("meter", "FareMeterObserver", "Runs the live fare meter during the trip.");
    this.showMeter = showMeter;
    this.total = quoteTotal;
  }
  setQuote(total) { this.total = total; }
  update(fix) {
    if (fix.leg !== "TO_DROP") return this.showMeter(null);
    // Fare accrues with distance covered, the way a meter really works.
    this.showMeter(Math.round(this.total * Math.min(1, fix.progress)));
  }
  reset() { this.showMeter(null); }
}

/** Watches the same stream for things a safety team would care about. */
class SafetyMonitorObserver extends LocationObserver {
  constructor(onAlert) {
    super("safety", "SafetyMonitorObserver", "Flags overspeeding and long unexplained stops.");
    this.onAlert = onAlert;
    this.stoppedTicks = 0;
    this.flagged = new Set();
  }
  update(fix) {
    if (fix.speedKmph > 68 && !this.flagged.has("speed")) {
      this.flagged.add("speed");
      this.onAlert(`Overspeeding flagged - ${fix.speedKmph} km/h on ${fix.road || "a side lane"}`);
      log("OBSERVER", `SafetyMonitorObserver -> {{overspeed ${fix.speedKmph} km/h}} logged for review`);
    }
    this.stoppedTicks = fix.status === "STOPPED" ? this.stoppedTicks + 1 : 0;
    if (this.stoppedTicks === 90 && !this.flagged.has("halt")) {
      this.flagged.add("halt");
      this.onAlert("Long halt detected. Are you alright?");
      log("OBSERVER", "SafetyMonitorObserver -> {{long halt}} - safety check pushed to the rider");
    }
  }
  reset() { this.stoppedTicks = 0; this.flagged.clear(); }
}
