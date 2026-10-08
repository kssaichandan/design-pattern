/* ============================================================
   THE SUBSYSTEMS
   ------------------------------------------------------------
   Four independent services with nothing to do with each other.
   Booking a ride needs all four, in the right order, with the
   right arguments - which is exactly the mess the Facade pattern
   in facade.js exists to hide from the UI.
   ============================================================ */

/** 1. Works out routes, road distance and travel time. */
class GeoService {
  route(from, to, vehicle) {
    const path = buildRoute(from, to);
    const km = roadKm(path);
    const minutes = vehicle.tripMinutes(km);
    log("SYSTEM", `GeoService: ${from.name} -> ${to.name} = ${km} km, about ${minutes} min by ${vehicle.label}`);
    return { path, km, minutes };
  }

  /**
   * The leg a matched driver drives to reach the rider, plus how long
   * the demo gives it on screen. Planned AFTER a driver accepts, from
   * where that driver really is - so a re-matched driver drives in
   * from their own street, not from the first driver's.
   */
  pickupLeg(driverAt, pickup) {
    const toPickup = buildRoute(driverAt, pickup);
    const toPickupKm = roadKm(toPickup);
    return {
      toPickup,
      toPickupKm,
      // Demo timing: only the CLOCK is compressed, the speeds stay real.
      toPickupSeconds: Math.min(11, Math.max(5, 3 + toPickupKm * 0.7)),
    };
  }

  /**
   * A route that leaves the planned one: from where the car is now,
   * out through a junction off to one side, then on to the drop.
   * Only used by the safety demo - a real driver needs no help to
   * take a wrong turn.
   */
  detourRoute(from, planned, to, progress = 0) {
    const t = Math.min(0.92, progress + 0.25);
    const ahead = planned.pointAt(Math.min(1, t));
    const heading = (planned.headingAt(t) * Math.PI) / 180;
    const side = {
      x: Math.max(30, Math.min(690, ahead.x - Math.sin(heading) * 70)),
      y: Math.max(30, Math.min(390, ahead.y + Math.cos(heading) * 70)),
    };
    const via = CITY.nodes[CITY.nearestNode(side)];
    const a = buildRoute(from, via);
    const b = buildRoute(via, to);

    const seg = (p) => p.segments;
    const points = a.points.concat(b.points.slice(1));
    const classes = seg(a).map((s) => s.cls).concat(seg(b).map((s) => s.cls));
    const names = seg(a).map((s) => s.name).concat(seg(b).map((s) => s.name));
    return new RoutePath(points, classes, names);
  }

  /**
   * Where the nearest free driver happens to be sitting right now.
   * Snapped onto the road network - a waiting cab is parked on a
   * street, not floating in the middle of Hussain Sagar.
   */
  randomPointNear(location, spread = 150) {
    const angle = Math.random() * Math.PI * 2;
    const dist = spread * (0.55 + Math.random() * 0.45);
    const guess = {
      x: Math.max(30, Math.min(690, location.x + Math.cos(angle) * dist)),
      y: Math.max(30, Math.min(390, location.y + Math.sin(angle) * dist)),
    };
    return CITY.nodes[CITY.nearestNode(guess)];
  }
}

/** 2. Finds a nearby driver who owns the right kind of vehicle. */
class DriverMatchingService {
  constructor(geo) {
    this.geo = geo;
    this.pool = [
      { name: "Ramesh K.",  rating: 4.9, trips: 4182 },
      { name: "Sunitha R.", rating: 4.8, trips: 2760 },
      { name: "Imran S.",   rating: 4.7, trips: 6015 },
      { name: "Vijay M.",   rating: 4.9, trips: 1188 },
      { name: "Priya N.",   rating: 5.0, trips:  903 },
      { name: "Anil T.",    rating: 4.6, trips: 7734 },
      { name: "Farhan Q.",  rating: 4.8, trips: 3391 },
    ];

    // What each class of vehicle on this fleet actually is.
    this.models = {
      BIKE:  ["Honda Activa", "TVS Jupiter", "Bajaj Pulsar"],
      AUTO:  ["Bajaj RE", "Piaggio Ape", "TVS King"],
      SEDAN: ["Maruti Dzire", "Hyundai Aura", "Honda Amaze", "Tata Tigor"],
      SUV:   ["Toyota Innova", "Maruti Ertiga", "Mahindra Marazzo"],
    };

    // Cancellations on record per driver - the accountability half of
    // "you won't pay when the driver walks away".
    this.strikes = {};
  }

  /** Telangana plates: TS <district 07-36> <2 letters> <4 digits>. */
  plateFor() {
    const L = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const district = String(7 + Math.floor(Math.random() * 30)).padStart(2, "0");
    return `TS ${district} ${L()}${L()} ${1000 + Math.floor(Math.random() * 8999)}`;
  }

  /**
   * @param {string[]} exclude  drivers who already walked away from THIS
   *                            ride - never offer the rider the same one.
   * @returns the driver, or null when nobody suitable is left.
   */
  findDriver(vehicle, pickup, exclude = []) {
    const free = this.pool.filter((p) => !exclude.includes(p.name));
    if (!free.length) {
      log("SYSTEM", "DriverMatchingService: no free driver left nearby.");
      return null;
    }

    const person = free[Math.floor(Math.random() * free.length)];
    const models = this.models[vehicle.code] || ["Unmarked"];
    const at = this.geo.randomPointNear(pickup);

    // Distance by ROAD from where this driver is parked - the same
    // leg the car will actually drive, so the card and the map agree.
    const leg = this.geo.pickupLeg(at, pickup);

    const driver = {
      ...person,
      vehicle,
      model: models[Math.floor(Math.random() * models.length)],
      plate: this.plateFor(),
      at,
      awayKm: leg.toPickupKm,
      leg,
    };

    log(
      "SYSTEM",
      `DriverMatchingService: matched {{${driver.name}}} (${driver.rating}*, ${driver.trips} trips) ` +
      `in a ${driver.model} - ${driver.plate}, ${driver.awayKm} km away by road`
    );
    return driver;
  }

  /**
   * Accountability for a driver who walks away from an accepted ride,
   * or who pushes the rider into cancelling. The penalty lands on the
   * driver; the rider pays nothing.
   */
  penalise(driver, amount, why) {
    this.strikes[driver.name] = (this.strikes[driver.name] || 0) + 1;
    log(
      "SYSTEM",
      `DriverMatchingService: penalty {{Rs.${amount}}} against ${driver.name} - ${why} ` +
      `(strike ${this.strikes[driver.name]} on record)`
    );
  }
}

/**
 * Cancellation charge under the Motor Vehicle Aggregator Guidelines,
 * 2025: 10% of the fare, capped at Rs.100. The same rule applies to a
 * rider who cancels and to a driver who cancels after accepting.
 */
function cancellationFee(fare) {
  return Math.min(100, Math.round(fare * 0.10));
}

/** 3. Takes the money when the trip ends. */
class PaymentGateway {
  charge(amount, rideId) {
    const receipt = {
      txnId: `TXN${Date.now().toString().slice(-8)}`,
      method: "UPI - default account",
      amount,
    };
    log("SYSTEM", `PaymentGateway: charged Rs.${amount} for ${rideId} - ${receipt.txnId}`);
    return receipt;
  }
}

/** 4. Sends the rider messages. */
class NotificationService {
  constructor(pushToast) {
    this.pushToast = pushToast;
  }
  send(text) {
    this.pushToast(text);
    log("SYSTEM", `NotificationService: "${text.replace(/<[^>]+>/g, "")}"`);
  }
}
