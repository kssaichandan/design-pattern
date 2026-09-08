/* ============================================================
   THE SUBSYSTEMS
   ------------------------------------------------------------
   Independent services with nothing to do with each other.
   Booking a ride needs all of them, in the right order, with the
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

/* ------------------------------------------------------------
   2. The fleet, and the service that picks someone out of it.
   ------------------------------------------------------------ */

/**
 * The driver roster. Ratings and trip counts are what a real
 * partner dashboard would hold; the app only ever reads them.
 */
const DRIVER_POOL = [
  { name: "Ramesh Kumar",    rating: 4.9, trips: 4182, since: 2019, langs: ["Telugu", "Hindi"] },
  { name: "Sunitha Reddy",   rating: 4.8, trips: 2760, since: 2021, langs: ["Telugu", "English"] },
  { name: "Imran Shaikh",    rating: 4.7, trips: 6015, since: 2017, langs: ["Urdu", "Hindi", "Telugu"] },
  { name: "Vijay Malothu",   rating: 4.9, trips: 1188, since: 2022, langs: ["Telugu", "Hindi"] },
  { name: "Priya Nagireddy", rating: 5.0, trips:  903, since: 2023, langs: ["Telugu", "English"] },
  { name: "Anil Teegala",    rating: 4.6, trips: 7734, since: 2016, langs: ["Telugu"] },
  { name: "Farhan Qureshi",  rating: 4.8, trips: 3391, since: 2020, langs: ["Urdu", "Hindi"] },
  { name: "Lakshmi Devi",    rating: 4.9, trips: 2044, since: 2021, langs: ["Telugu", "Hindi"] },
  { name: "Naveen Chowdary", rating: 4.7, trips: 5210, since: 2018, langs: ["Telugu", "English"] },
  { name: "Salma Begum",     rating: 4.8, trips: 1637, since: 2022, langs: ["Urdu", "Telugu"] },
  { name: "Rajesh Goud",     rating: 4.5, trips: 8890, since: 2015, langs: ["Telugu", "Hindi"] },
  { name: "Kavitha Rao",     rating: 4.9, trips: 3072, since: 2020, langs: ["Telugu", "English"] },
  { name: "Mohan Yadav",     rating: 4.6, trips: 6423, since: 2017, langs: ["Telugu", "Hindi"] },
  { name: "Zubair Ali",      rating: 4.8, trips: 2915, since: 2021, langs: ["Urdu", "Hindi", "English"] },
  { name: "Srinivas Rao",    rating: 4.7, trips: 9104, since: 2014, langs: ["Telugu"] },
  { name: "Deepika Sharma",  rating: 5.0, trips:  612, since: 2024, langs: ["Hindi", "English"] },
  { name: "Karthik Varma",   rating: 4.8, trips: 4507, since: 2019, langs: ["Telugu", "English"] },
  { name: "Ayesha Fatima",   rating: 4.9, trips: 1854, since: 2022, langs: ["Urdu", "Telugu"] },
  { name: "Bhaskar Reddy",   rating: 4.5, trips: 7218, since: 2016, langs: ["Telugu", "Hindi"] },
  { name: "Ganesh Mudiraj",  rating: 4.7, trips: 3966, since: 2019, langs: ["Telugu"] },
  { name: "Nikhil Bandari",  rating: 4.8, trips: 2288, since: 2021, langs: ["Telugu", "English"] },
  { name: "Rehana Sultana",  rating: 4.9, trips: 1425, since: 2023, langs: ["Urdu", "Hindi"] },
  { name: "Suresh Babu",     rating: 4.6, trips: 8341, since: 2015, langs: ["Telugu", "Tamil"] },
  { name: "Manjula Prasad",  rating: 4.8, trips: 2671, since: 2020, langs: ["Telugu", "English"] },
  { name: "Yousuf Khan",     rating: 4.7, trips: 5583, since: 2018, langs: ["Urdu", "Hindi", "Telugu"] },
  { name: "Pavan Kalyan G.", rating: 4.9, trips: 1093, since: 2023, langs: ["Telugu", "English"] },
  { name: "Shanthi Kumari",  rating: 5.0, trips:  788, since: 2024, langs: ["Telugu"] },
  { name: "Abdul Rahman",    rating: 4.6, trips: 6970, since: 2016, langs: ["Urdu", "Hindi"] },
];

/** What each class of vehicle on this fleet actually is. */
const FLEET_MODELS = {
  BIKE:  ["Honda Activa 6G", "TVS Jupiter", "Bajaj Pulsar 150", "Hero Splendor+", "Suzuki Access 125"],
  ERICK: ["Mahindra Treo", "Piaggio Ape E-City", "YC Electric Yatri", "Kinetic Safar"],
  AUTO:  ["Bajaj RE Compact", "Piaggio Ape City", "TVS King Duramax", "Atul Gem"],
  SEDAN: ["Maruti Dzire", "Hyundai Aura", "Honda Amaze", "Tata Tigor", "Maruti Ciaz"],
  SUV:   ["Toyota Innova Crysta", "Maruti Ertiga", "Mahindra Marazzo", "Kia Carens", "Renault Triber"],
  PRIME: ["Toyota Camry Hybrid", "Skoda Slavia", "Honda City ZX", "Hyundai Verna", "VW Virtus"],
};

/** Colours a fleet actually comes in - printed on the driver card. */
const FLEET_COLOURS = ["White", "Silver", "Grey", "Black", "Blue", "Beige", "Red"];

/** 2. Finds a nearby driver who owns the right kind of vehicle. */
class DriverMatchingService {
  constructor(geo) {
    this.geo = geo;
    this.pool = DRIVER_POOL;
    this.models = FLEET_MODELS;
    this.recent = [];        // last few matched, so the same face is not reused
  }

  /** Telangana plates: TS <district 07-36> <2 letters> <4 digits>. */
  plateFor() {
    const L = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const district = String(7 + Math.floor(Math.random() * 30)).padStart(2, "0");
    return `TS ${district} ${L()}${L()} ${1000 + Math.floor(Math.random() * 8999)}`;
  }

  /** Picks someone who has not driven the last three rides. */
  pickPerson() {
    const fresh = this.pool.filter((p) => !this.recent.includes(p.name));
    const person = fresh[Math.floor(Math.random() * fresh.length)];
    this.recent.push(person.name);
    if (this.recent.length > 3) this.recent.shift();
    return person;
  }

  findDriver(vehicle, pickup) {
    const person = this.pickPerson();
    const models = this.models[vehicle.code] || ["Unmarked"];
    const at = this.geo.randomPointNear(pickup);
    const awayKm = +(Math.hypot(at.x - pickup.x, at.y - pickup.y) * KM_PER_PX).toFixed(1);

    const driver = {
      ...person,
      vehicle,
      model: models[Math.floor(Math.random() * models.length)],
      colour: FLEET_COLOURS[Math.floor(Math.random() * FLEET_COLOURS.length)],
      plate: this.plateFor(),
      phone: "+91 9" + String(100000000 + Math.floor(Math.random() * 899999999)),
      at,
      awayKm,
    };

    log(
      "SYSTEM",
      `DriverMatchingService: matched {{${driver.name}}} (${driver.rating}*, ${driver.trips} trips) ` +
      `in a ${driver.colour} ${driver.model} - ${driver.plate}, ${awayKm} km away`
    );
    return driver;
  }
}

/**
 * 3. Takes the money when the trip ends.
 *
 * It no longer knows HOW to charge anything. It holds a
 * PaymentMethod (see patterns/adapter.js) and asks that to do it,
 * so adding a provider never touches this class.
 */
class PaymentGateway {
  constructor(method) {
    this.method = method || PAYMENT_METHODS.default();
  }

  use(method) {
    const from = this.method ? this.method.label : "none";
    this.method = method;
    log("ADAPTER", `PaymentGateway now holds {{${method.label}}} (was ${from}) - identical pay() call either way`);
  }

  charge(amount, rideId) {
    const receipt = this.method.pay(amount, rideId);
    log("SYSTEM", `PaymentGateway: Rs.${amount} for ${rideId} via ${receipt.method} - ${receipt.txnId}`);
    return receipt;
  }
}

/** 4. Sends the rider messages. */
class NotificationService {
  constructor(pushToast) {
    this.pushToast = pushToast;
    this.muted = false;
  }
  send(text, kind) {
    if (!this.muted) this.pushToast(text, kind);
    log("SYSTEM", `NotificationService: "${text.replace(/<[^>]+>/g, "")}"`);
  }
}

/** 5. A one-time code the driver has to read off the rider's phone. */
class TripOtpService {
  static issue() {
    const code = String(1000 + Math.floor(Math.random() * 8999));
    log("SYSTEM", `TripOtpService: trip OTP {{${code}}} issued - the driver cannot start without it`);
    return code;
  }
}
