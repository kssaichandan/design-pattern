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

    // The route the rider was promised for this leg. Normally the same
    // as `path`; after a detour it is the original, so a subscriber can
    // measure how far the car has strayed from it.
    const planned = opts.planned || path;
    this.leg = { opts, planned };

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
        stillSec: Math.round(motion.stillSec),
        offRouteKm: +(planned.distanceFrom(path.pointAt(progress)) * KM_PER_PX).toFixed(2),
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

  get isTracking() { return this.timer !== null; }

  /** Where the car is right now on the leg being streamed. */
  currentPoint() {
    return this.motion.path.pointAt(this.motion.progress);
  }

  /**
   * The driver turned off the planned route. The car now drives `path`;
   * the leg keeps its original plan, its arrival callback and its name,
   * so every subscriber sees the same stream continue - just off-route.
   */
  reroute(path) {
    if (!this.isTracking) return;
    const { opts, planned } = this.leg;
    const left = 1 - this.motion.progress;
    const km = roadKm(path);
    this.startTracking({
      ...opts,
      path,
      distanceKm: km,
      seconds: Math.max(6, opts.seconds * left * (km / Math.max(0.1, opts.distanceKm * left))),
      planned,
    });
  }

  /** The car stops with no red light to explain it (safety demo). */
  holdCar(seconds) {
    if (this.isTracking) this.motion.hold(seconds);
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
 * REAL-WORLD PROBLEM: the NCW's 2026 guidelines for app cabs (and a
 * Delhi High Court petition) ask platforms for automatic alerts when a
 * car leaves its route or stops for a long, unexplained time, with an
 * SOS that actually reaches someone.
 *
 * The Observer pattern makes this a fifth subscriber and nothing else:
 * the publisher, the map, the ETA panel and the other observers did
 * not change by a single line to make room for it.
 */
class SafetyMonitorObserver extends LocationObserver {
  /**
   * @param {function} raiseSafetyCheck  shows the "Are you okay?" card
   */
  constructor(raiseSafetyCheck) {
    super("safety", "SafetyMonitorObserver", "Flags long unexplained stops and route deviations once the rider is aboard.");
    this.raiseSafetyCheck = raiseSafetyCheck;
    this.raised = new Set();

    // A red light here lasts under 15 s. Three minutes stood still is
    // not a signal. 0.8 km off the promised route is not GPS jitter.
    this.stopLimitSec = 180;
    this.offRouteLimitKm = 0.8;
  }

  update(fix) {
    if (fix.leg !== "TO_DROP") return;     // watching starts when the rider is in the car

    const checks = [
      {
        key: "stop",
        when: (f) => f.stillSec >= this.stopLimitSec,
        text: (f) => `Your car has been stopped for ${Math.round(f.stillSec / 60)} min on ${f.road || "a side lane"}.`,
      },
      {
        key: "detour",
        when: (f) => f.offRouteKm >= this.offRouteLimitKm,
        text: (f) => `Your car is ${f.offRouteKm.toFixed(1)} km off the planned route.`,
      },
    ];

    checks.forEach((c) => {
      if (this.raised.has(c.key) || !c.when(fix)) return;
      this.raised.add(c.key);
      const text = c.text(fix);
      log("OBSERVER", `SafetyMonitorObserver -> {{${c.key.toUpperCase()} ALERT}} ${text}`);
      this.raiseSafetyCheck({ kind: c.key, text, fix });
    });
  }

  reset() { this.raised.clear(); }
}
