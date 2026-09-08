/* ============================================================
   SINGLETON, used a second time - SessionManager
   ------------------------------------------------------------
   DispatchLog proves the pattern with a log. This proves it with
   the thing every screen in a real app needs: who is signed in.

   The account, the wallet balance, the saved places and the trip
   history are read by nine screens and written by four. If the
   login screen made its own session object and the wallet screen
   made another, you would sign in on one and still be a stranger
   on the other. Exactly one instance, or nothing works.

   Everything is kept in localStorage so a refresh does not sign
   you out - wrapped in try/catch, because a browser in private
   mode will happily throw on the first write.
   ============================================================ */

const SESSION_KEY = "rideflow.session.v1";

class SessionManager {
  constructor() {
    // The Singleton guard, exactly as in DispatchLog.
    if (SessionManager._instance) return SessionManager._instance;

    this.user = null;                  // { name, phone, email, vpa, since }
    this.wallet = { balance: 0, txns: [] };
    this.saved = [];                   // [{ id, label, locationId, icon }]
    this.history = [];                 // finished trips
    this.prefs = { theme: "auto", notifications: true, sound: false, fastDemo: false };
    this.promo = null;                 // the applied promo code, if any
    this.listeners = [];

    SessionManager._instance = this;
    this.load();
  }

  static getInstance() {
    if (!SessionManager._instance) SessionManager._instance = new SessionManager();
    return SessionManager._instance;
  }

  /* ---------------- who is signed in ---------------- */

  get isSignedIn() { return this.user !== null; }

  get initials() {
    if (!this.user) return "?";
    return this.user.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  signIn({ name, phone, email }) {
    const returning = this.user && this.user.phone === phone;
    const first = (name.split(/\s+/)[0] || "rider").toLowerCase();

    this.user = {
      name,
      phone,
      email: email || `${first}@example.com`,
      vpa: `${first}@okaxis`,
      since: returning && this.user.since ? this.user.since : new Date().toISOString(),
    };

    if (!returning || !this.history.length) this.seedNewAccount();

    log("SINGLETON", `SessionManager.getInstance().signIn({{${name}}}) - one session object, every screen reads it`);
    this.save();
    this.emit();
    return this.user;
  }

  signOut() {
    log("SINGLETON", "SessionManager: signOut() - the instance stays, the account on it does not");
    this.user = null;
    this.promo = null;
    this.save();
    this.emit();
  }

  updateProfile(patch) {
    if (!this.user) return;
    Object.assign(this.user, patch);
    this.save();
    this.emit();
  }

  /* ---------------- wallet ---------------- */

  topUp(amount) {
    this.wallet.balance += amount;
    this.wallet.txns.unshift({
      id: "TOP" + Date.now().toString().slice(-7),
      kind: "credit", label: "Money added", amount, at: new Date().toISOString(),
    });
    log("SYSTEM", `Wallet: added Rs.${amount}, balance now Rs.${this.wallet.balance.toFixed(0)}`);
    this.save();
    this.emit();
  }

  spend(amount, label) {
    this.wallet.balance -= amount;
    const txn = {
      id: "WTX" + Date.now().toString().slice(-7),
      kind: "debit", label: label || "Ride fare", amount, at: new Date().toISOString(),
    };
    this.wallet.txns.unshift(txn);
    this.save();
    this.emit();
    return txn;
  }

  /* ---------------- saved places ---------------- */

  addSaved(label, locationId, icon) {
    if (this.saved.some((s) => s.locationId === locationId && s.label === label)) return false;
    this.saved.unshift({ id: "SP" + Date.now().toString(36), label, locationId, icon: icon || "star" });
    this.save();
    this.emit();
    return true;
  }

  removeSaved(id) {
    this.saved = this.saved.filter((s) => s.id !== id);
    this.save();
    this.emit();
  }

  savedFor(locationId) {
    return this.saved.find((s) => s.locationId === locationId) || null;
  }

  /* ---------------- trip history ---------------- */

  recordTrip(trip) {
    this.history.unshift(trip);
    if (this.history.length > 60) this.history.pop();
    this.save();
    this.emit();
  }

  rateTrip(tripId, stars, tip, note) {
    const trip = this.history.find((t) => t.id === tripId);
    if (!trip) return null;
    trip.rating = stars;
    trip.tip = tip || 0;
    trip.note = note || "";
    if (tip) trip.fare += tip;
    this.save();
    this.emit();
    return trip;
  }

  get stats() {
    const done = this.history.filter((t) => t.status === "completed");
    const km = done.reduce((s, t) => s + t.km, 0);
    return {
      trips: done.length,
      km: +km.toFixed(1),
      spent: done.reduce((s, t) => s + t.fare, 0),
      cancelled: this.history.length - done.length,
      co2: +(km * 0.12).toFixed(1),
    };
  }

  /* ---------------- promo codes ---------------- */

  applyPromo(promo) { this.promo = promo; this.save(); this.emit(); }
  clearPromo()      { this.promo = null;  this.save(); this.emit(); }

  /* ---------------- preferences ---------------- */

  setPref(key, value) {
    this.prefs[key] = value;
    this.save();
    this.emit();
  }

  /* ---------------- change broadcast ---------------- */

  onChange(fn) { this.listeners.push(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }

  /* ---------------- persistence ---------------- */

  save() {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        user: this.user, wallet: this.wallet, saved: this.saved,
        history: this.history, prefs: this.prefs, promo: this.promo,
      }));
    } catch (err) { /* private mode, quota, storage disabled - carry on */ }
  }

  load() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      this.user    = data.user || null;
      this.wallet  = data.wallet || this.wallet;
      this.saved   = data.saved || [];
      this.history = data.history || [];
      this.prefs   = Object.assign(this.prefs, data.prefs || {});
      this.promo   = data.promo || null;
    } catch (err) { /* corrupt or unreadable - start clean */ }
  }

  wipe() {
    try { localStorage.removeItem(SESSION_KEY); } catch (err) { /* nothing to do */ }
    this.user = null;
    this.wallet = { balance: 0, txns: [] };
    this.saved = [];
    this.history = [];
    this.promo = null;
    this.emit();
  }

  /**
   * A brand new account with nothing in it makes the Activity and
   * Wallet screens look broken, so a demo account arrives with a
   * plausible week behind it.
   */
  seedNewAccount() {
    this.wallet = {
      balance: 1250,
      txns: [
        { id: "TOP4471902", kind: "credit", label: "Money added · UPI",                  amount: 1000, at: this.daysAgo(6) },
        { id: "WTX4471221", kind: "debit",  label: "Ride · Hitech City to Gachibowli",   amount:  214, at: this.daysAgo(5) },
        { id: "TOP4470010", kind: "credit", label: "Cashback · FIRST50",                 amount:   50, at: this.daysAgo(5) },
        { id: "WTX4469887", kind: "debit",  label: "Ride · Ameerpet to Charminar",       amount:  268, at: this.daysAgo(3) },
        { id: "TOP4469004", kind: "credit", label: "Money added · HDFC Visa",            amount:  500, at: this.daysAgo(2) },
      ],
    };

    this.saved = [
      { id: "sp-home", label: "Home", locationId: "kondapur", icon: "home" },
      { id: "sp-work", label: "Work", locationId: "hitech",   icon: "work" },
      { id: "sp-gym",  label: "Gym",  locationId: "madhapur", icon: "star" },
    ];

    const seeds = [
      { from: "hitech",       to: "gachibowli", veh: "SEDAN", fare: 214, km:  8.4, min: 19, rating: 5, driver: "Ramesh Kumar",  day: 5 },
      { from: "ameerpet",     to: "charminar",  veh: "AUTO",  fare: 268, km: 11.2, min: 28, rating: 4, driver: "Imran Shaikh",  day: 3 },
      { from: "kukatpally",   to: "hitech",     veh: "BIKE",  fare:  96, km:  6.9, min: 13, rating: 5, driver: "Vijay Malothu", day: 2 },
      { from: "jubilee",      to: "airport",    veh: "SUV",   fare: 986, km: 31.6, min: 62, rating: 5, driver: "Kavitha Rao",   day: 1 },
      { from: "secunderabad", to: "banjara",    veh: "SEDAN", fare: 241, km:  9.1, min: 24, rating: 4, driver: "Yousuf Khan",   day: 1 },
    ];

    this.history = seeds.map((s, i) => ({
      id: "RIDE-SEED" + i,
      at: this.daysAgo(s.day),
      pickup: (findLocation(s.from) || {}).name || s.from,
      drop: (findLocation(s.to) || {}).name || s.to,
      pickupId: s.from,
      dropId: s.to,
      vehicle: s.veh,
      driver: s.driver,
      plate: "TS 09 " + String.fromCharCode(65 + i) + "Z " + (4120 + i * 317),
      fare: s.fare,
      km: s.km,
      minutes: s.min,
      strategy: i === 3 ? "AirportFare" : "StandardFare",
      payment: i % 2 ? "RideFlow Wallet" : "UPI · rider@okaxis",
      status: "completed",
      rating: s.rating,
      tip: 0,
    }));

    this.history.push({
      id: "RIDE-SEEDX",
      at: this.daysAgo(4),
      pickup: "Madhapur", drop: "Miyapur Metro",
      pickupId: "madhapur", dropId: "miyapur",
      vehicle: "AUTO", driver: "Anil Teegala", plate: "TS 07 KQ 5512",
      fare: 20, km: 13.4, minutes: 0, strategy: "StandardFare",
      payment: "UPI · rider@okaxis", status: "cancelled", rating: 0, tip: 0,
    });

    this.history.sort((a, b) => new Date(b.at) - new Date(a.at));
  }

  daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(9 + ((n * 5) % 11), (n * 17) % 60, 0, 0);
    return d.toISOString();
  }
}

SessionManager._instance = null;

/** Shorthand every UI file uses. */
const session = () => SessionManager.getInstance();

/* ------------------------------------------------------------
   Promo codes the Offers screen hands out. A code is data, not
   code - the Decorator turns it into a fare line.
   ------------------------------------------------------------ */

const PROMO_CODES = [
  { code: "FIRST50",  kind: "FLAT", value: 50,  title: "Rs.50 off your next ride",      terms: "One use per account. Any vehicle." },
  { code: "HYD20",    kind: "PCT",  value: 20, cap: 80, title: "20% off, up to Rs.80",  terms: "Valid inside the ORR. Cap Rs.80." },
  { code: "AIRPORT99",kind: "FLAT", value: 99,  title: "Rs.99 off airport runs",        terms: "Pickup or drop must be RGIA." },
  { code: "LATENIGHT",kind: "PCT",  value: 15, cap: 60, title: "15% off after 10 PM",   terms: "Night fare rides only. Cap Rs.60." },
  { code: "POOLSAVE", kind: "FLAT", value: 30,  title: "Rs.30 off shared pool",         terms: "Shared pool bookings only." },
  { code: "WEEKEND25",kind: "PCT",  value: 25, cap: 120, title: "25% off weekends",     terms: "Sat and Sun. Cap Rs.120." },
];

const findPromo = (code) =>
  PROMO_CODES.find((p) => p.code === String(code || "").trim().toUpperCase()) || null;
