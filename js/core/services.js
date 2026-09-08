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
  }

  /** Telangana plates: TS <district 07-36> <2 letters> <4 digits>. */
  plateFor() {
    const L = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const district = String(7 + Math.floor(Math.random() * 30)).padStart(2, "0");
    return `TS ${district} ${L()}${L()} ${1000 + Math.floor(Math.random() * 8999)}`;
  }

  findDriver(vehicle, pickup) {
    const person = this.pool[Math.floor(Math.random() * this.pool.length)];
    const models = this.models[vehicle.code] || ["Unmarked"];
    const at = this.geo.randomPointNear(pickup);
    const awayKm = +(Math.hypot(at.x - pickup.x, at.y - pickup.y) * KM_PER_PX).toFixed(1);

    const driver = {
      ...person,
      vehicle,
      model: models[Math.floor(Math.random() * models.length)],
      plate: this.plateFor(),
      at,
      awayKm,
    };

    log(
      "SYSTEM",
      `DriverMatchingService: matched {{${driver.name}}} (${driver.rating}*, ${driver.trips} trips) ` +
      `in a ${driver.model} - ${driver.plate}, ${awayKm} km away`
    );
    return driver;
  }
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
