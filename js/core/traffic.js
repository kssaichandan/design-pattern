/* ============================================================
   Traffic + vehicle motion - plain helper code, NOT a pattern.
   ------------------------------------------------------------
   The Observer pattern in observer.js broadcasts "the driver
   moved". THIS file decides where the driver actually got to,
   and it does it the way a car does: accelerating, braking for
   bends, crawling in congestion and stopping at red lights.

   Nothing here knows the map is on screen, and nothing here
   knows anyone is subscribed. It just drives.
   ============================================================ */

/* ---------- how hard a vehicle can push ---------- */

const MOTION = {
  accelKmphPerSec: 7.5,     // gentle pull-away
  brakeKmphPerSec: 16,      // firmer than it accelerates, like a real car
  turnSlowDeg:     42,      // a bend this sharp forces a real slowdown
  signalEverySec:  0,       // set per junction below
};

/**
 * Congestion for one stretch, 0.35 (crawling) .. 1.0 (clear).
 * Fixed per stretch of road so a route behaves the same way twice,
 * and worse on small streets than on the expressway.
 */
function congestionAt(path, t) {
  const cls = path.classAt(t);
  const base = cls === "highway" ? 0.90 : cls === "arterial" ? 0.74 : 0.58;
  const wobble = cityNoise(Math.floor(t * 24), path.lengthPx | 0);
  return Math.max(0.32, Math.min(1, base + (wobble - 0.5) * 0.34));
}

/**
 * One car driving one route.
 *
 * Distances are real kilometres and speeds are real km/h - the
 * demo only speeds up the CLOCK (see `timeScale`), so the numbers
 * on the HUD stay believable while the animation stays watchable.
 */
class VehicleMotion {
  /**
   * @param {object} opts { path, distanceKm, cruiseKmph, seed }
   */
  constructor(opts) {
    this.path = opts.path;
    this.distanceKm = opts.distanceKm;
    this.cruiseKmph = opts.cruiseKmph || 34;
    this.seed = opts.seed || 1;

    this.signals = this._placeSignals();
    this.reset();
  }

  reset() {
    this.travelledKm = 0;
    this.speedKmph = 0;
    this.elapsedSec = 0;
    this.stoppedFor = 0;
    this.cleared = new Set();
    this.recentSpeed = [];
    this.stops = 0;
    this.stillSec = 0;        // how long the car has been standing still, in one go
  }

  /**
   * Stand still for `seconds` without a red light to explain it - the
   * stop a safety monitor exists to notice. Used by the safety demo.
   */
  hold(seconds) {
    this.stoppedFor = Math.max(this.stoppedFor, seconds);
    this.speedKmph = 0;
  }

  /**
   * Traffic lights sit at junctions - the corners of the route -
   * but only on ordinary roads. Nobody stops on the expressway.
   */
  _placeSignals() {
    const out = [];
    let run = 0;
    this.path.segments.forEach((s, i) => {
      run += s.len;
      if (i === this.path.segments.length - 1) return;
      const t = run / this.path.lengthPx;
      if (this.path.classAt(t) === "highway") return;
      const roll = cityNoise(i * 7.3 + this.seed, run);
      if (roll > 0.62) out.push({ t, wait: 4 + roll * 9, id: i });
    });
    return out;
  }

  get progress() {
    return this.distanceKm <= 0 ? 1 : Math.min(1, this.travelledKm / this.distanceKm);
  }

  get done() {
    return this.progress >= 1;
  }

  /** Flat out for this vehicle. The cruise figure is a city AVERAGE,
      so the real ceiling sits well above it. */
  get topKmph() {
    return this.cruiseKmph * 2.3;
  }

  /**
   * What the rest of the route can be driven at, from the road classes
   * still ahead. This is the half of the ETA that does not lurch every
   * time the car meets a red light.
   */
  expectedKmphAhead() {
    const from = this.progress;
    if (from >= 1) return this.cruiseKmph;

    const remainingKm = this.distanceKm * (1 - from);
    const steps = 16;
    let hours = 0;

    for (let i = 0; i < steps; i++) {
      const at = Math.min(1, from + ((i + 0.5) / steps) * (1 - from));
      const limit = ROAD_SPEED[this.path.classAt(at)] || 22;
      const bend = this.path.turnAt(at);
      const turnFactor = bend > MOTION.turnSlowDeg ? Math.max(0.34, 1 - bend / 150) : 1;
      const v = Math.max(6, Math.min(limit * congestionAt(this.path, at), this.topKmph) * turnFactor);
      hours += (remainingKm / steps) / v;
    }

    // TIME is what adds up over a route, not speed. Averaging the speed
    // limits arithmetically quietly promises a trip nobody can drive:
    // one crawling kilometre costs far more than one clear kilometre
    // saves. Total the hours, then divide back out.
    return hours > 0 ? remainingKm / hours : this.cruiseKmph;
  }

  /**
   * The pace the ETA is built on: what the road ahead allows, tempered
   * by how this trip has actually been going. Straight observed speed
   * sends the ETA up every time the car stops, which is why a real app
   * blends the two.
   */
  get averageKmph() {
    const expected = this.expectedKmphAhead();
    if (!this.recentSpeed.length) return expected;
    const observed = this.recentSpeed.reduce((a, b) => a + b, 0) / this.recentSpeed.length;

    // Early on there is nothing to learn from: a car that has covered 200 m
    // says nothing about the next 20 km, and letting it vote makes the
    // opening ETA absurdly pessimistic. Trust the route estimate at first
    // and hand weight over to observation as the trip proceeds.
    const trust = Math.min(0.45, this.progress * 0.9);
    return Math.max(6, expected * (1 - trust) + Math.max(observed, 5) * trust);
  }

  /** Minutes left: the driving, plus every light still to be sat at. */
  get etaMin() {
    const remaining = Math.max(0, this.distanceKm - this.travelledKm);
    const driveSec = (remaining / this.averageKmph) * 3600;

    const signalSec = this.signals
      .filter((sig) => !this.cleared.has(sig.id))
      .reduce((sum, sig) => sum + sig.wait, 0);

    return Math.max(0, Math.ceil((driveSec + signalSec) / 60));
  }

  get remainingKm() {
    return +Math.max(0, this.distanceKm - this.travelledKm).toFixed(1);
  }

  /** What the car is doing right now, for the HUD. */
  get status() {
    if (this.stoppedFor > 0) return "STOPPED";
    if (this.speedKmph < 12) return "CRAWLING";
    if (this.path.classAt(this.progress) === "highway") return "CRUISING";
    return "MOVING";
  }

  /**
   * The speed this stretch of road allows: its class limit, scaled
   * by congestion, capped by what the vehicle can do, and cut back
   * for a bend coming up.
   */
  targetKmph() {
    const t = this.progress;
    const limit = ROAD_SPEED[this.path.classAt(t)] || 22;
    const flow  = limit * congestionAt(this.path, t);
    const bend  = this.path.turnAt(t);
    const turnFactor = bend > MOTION.turnSlowDeg ? Math.max(0.34, 1 - bend / 150) : 1;
    return Math.max(8, Math.min(flow, this.topKmph) * turnFactor);
  }

  /**
   * Advance by `dtSec` SIMULATED seconds. Called repeatedly by the
   * Observer subject; each call is one GPS fix worth of movement.
   */
  step(dtSec) {
    if (this.done) return;
    this.elapsedSec += dtSec;

    // Sitting at a red light.
    if (this.stoppedFor > 0) {
      this.stoppedFor -= dtSec;
      this.stillSec += dtSec;
      this.speedKmph = 0;
      this.recentSpeed.push(0);
      if (this.recentSpeed.length > 40) this.recentSpeed.shift();
      return;
    }

    // Approaching a light we have not cleared yet.
    const ahead = this.signals.find(
      (sig) => !this.cleared.has(sig.id) && this.progress >= sig.t - 0.012
    );
    if (ahead) {
      this.cleared.add(ahead.id);
      this.stoppedFor = ahead.wait;
      this.stops += 1;
      this.speedKmph = 0;
      return;
    }

    // Ease toward the speed this stretch allows.
    this.stillSec = 0;
    const target = this.targetKmph();
    const rate = target > this.speedKmph ? MOTION.accelKmphPerSec : MOTION.brakeKmphPerSec;
    const delta = Math.sign(target - this.speedKmph) * rate * dtSec;
    this.speedKmph = Math.abs(target - this.speedKmph) < Math.abs(delta)
      ? target
      : this.speedKmph + delta;

    this.travelledKm = Math.min(this.distanceKm, this.travelledKm + (this.speedKmph / 3600) * dtSec);

    this.recentSpeed.push(this.speedKmph);
    if (this.recentSpeed.length > 40) this.recentSpeed.shift();
  }

  /**
   * Drive the whole leg with nobody watching, to find out how long
   * it really takes. The publisher uses this to work out how fast to
   * run the demo clock so a 30 km airport run still finishes on
   * screen in a few seconds - without faking the speedometer.
   */
  realisticSeconds() {
    const snapshot = {
      travelledKm: this.travelledKm, speedKmph: this.speedKmph, elapsedSec: this.elapsedSec,
      stoppedFor: this.stoppedFor, cleared: new Set(this.cleared),
      recentSpeed: this.recentSpeed.slice(), stops: this.stops, stillSec: this.stillSec,
    };

    this.reset();
    let guard = 0;
    while (!this.done && guard < 40000) { this.step(0.5); guard += 1; }
    const seconds = this.elapsedSec;

    Object.assign(this, snapshot);
    this.cleared = snapshot.cleared;
    this.recentSpeed = snapshot.recentSpeed;
    return Math.max(30, seconds);
  }
}

/* ------------------------------------------------------------
   Ambient city traffic - the other cars on the map.
   Decorative only: nothing subscribes to these and no fare
   depends on them. They exist so the city is not empty.
   ------------------------------------------------------------ */

class AmbientTraffic {
  constructor(network, count) {
    this.cars = [];
    const usable = network.edges.filter((e) => e.cls !== "street");

    for (let i = 0; i < count; i++) {
      const edge = usable[Math.floor(cityNoise(i * 3.7, i * 1.9) * usable.length)];
      if (!edge) continue;
      this.cars.push({
        edge,
        t: cityNoise(i, i * 2.1),
        dir: cityNoise(i * 5.1, 9) > 0.5 ? 1 : -1,
        speed: 0.05 + cityNoise(i * 1.3, 4) * 0.16,
        network,
        seedIndex: i,
      });
    }
  }

  /** Nudge every car along its road; hop to a new road at the end. */
  tick(dt) {
    this.cars.forEach((car, i) => {
      car.t += car.dir * car.speed * dt;
      if (car.t > 1 || car.t < 0) {
        const usable = car.network.edges;
        car.edge = usable[Math.floor(Math.random() * usable.length)];
        car.t = car.dir > 0 ? 0 : 1;
      }
    });
  }

  positions() {
    return this.cars.map((car) => ({
      x: car.edge.a.x + (car.edge.b.x - car.edge.a.x) * car.t,
      y: car.edge.a.y + (car.edge.b.y - car.edge.a.y) * car.t,
      heading: (Math.atan2(car.edge.b.y - car.edge.a.y, car.edge.b.x - car.edge.a.x) * 180) / Math.PI
               + (car.dir < 0 ? 180 : 0),
    }));
  }
}
