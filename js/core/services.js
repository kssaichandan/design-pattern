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

  /** Where the nearest free driver happens to be sitting right now. */
  randomPointNear(location, spread = 130) {
    const angle = Math.random() * Math.PI * 2;
    const dist = spread * (0.55 + Math.random() * 0.45);
    return {
      x: Math.max(40, Math.min(680, location.x + Math.cos(angle) * dist)),
      y: Math.max(40, Math.min(380, location.y + Math.sin(angle) * dist)),
    };
  }
}

/** 2. Finds a nearby driver who owns the right kind of vehicle. */
class DriverMatchingService {
  constructor(geo) {
    this.geo = geo;
    this.pool = [
      { name: "Ramesh K.",  rating: 4.9 },
      { name: "Sunitha R.", rating: 4.8 },
      { name: "Imran S.",   rating: 4.7 },
      { name: "Vijay M.",   rating: 4.9 },
      { name: "Priya N.",   rating: 5.0 },
    ];
  }

  findDriver(vehicle, pickup) {
    const person = this.pool[Math.floor(Math.random() * this.pool.length)];
    const driver = {
      ...person,
      vehicle,
      plate: `TS ${9 + Math.floor(Math.random() * 3)}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}A ${1000 + Math.floor(Math.random() * 8999)}`,
      at: this.geo.randomPointNear(pickup),
    };
    log("SYSTEM", `DriverMatchingService: matched {{${driver.name}}} (${driver.rating}*) driving a ${vehicle.label} - ${driver.plate}`);
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
