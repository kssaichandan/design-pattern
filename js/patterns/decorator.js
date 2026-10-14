/* ============================================================
   PATTERN 6 - DECORATOR  (structural)
   ------------------------------------------------------------
   PROBLEM: a rider wants a child seat AND is carrying luggage AND
   has a promo code. Those are three extras on top of whichever
   pricing rule is already running - surge, night, pool, anything.

   Handling them with subclasses means writing a class for every
   combination: SurgeWithChildSeat, SurgeWithLuggage,
   SurgeWithChildSeatAndLuggage... Four add-ons and seven pricing
   rules is 112 classes, and it doubles with the next add-on.

   Handling them with flags is no better - every strategy grows the
   same if-block, copy-pasted seven times:

       if (opts.childSeat) total += 40;
       if (opts.luggage)   total += 30;   // in all seven rules

   SOLUTION: a decorator IS a FareStrategy and HOLDS a FareStrategy.
   It asks the thing it wraps for its rows, then adds its own. Since
   a decorator is itself a strategy, decorators stack: wrap a wrapped
   strategy as many times as you like, in any order, at runtime.

       new PetFriendly(new ChildSeat(new SurgePricingFare(1.8)))

   FareCalculator cannot tell the difference, and no pricing rule
   was told that add-ons exist.

   SECOND USE - the law. Riders report fares they cannot trust:
   3x-4x festival surges, and an alleged (and denied) price gap
   between iPhone and Android. The Motor Vehicle Aggregator
   Guidelines, 2025 cap surge at 2x and set a 50% floor. That limit
   applies to EVERY rule, including next season's, so it cannot live
   inside the rules. Two guards wrap the whole stack instead:

       new FairInputGuard(new SurgeCapGuard( ...add-ons... ))
   ============================================================ */

/* ---------- the decorator base ---------- */

class FareDecorator extends FareStrategy {
  /** @param {FareStrategy} inner the strategy (or decorator) being wrapped */
  constructor(inner) {
    super();
    if (!inner) throw new Error("A decorator must wrap something.");
    this.inner = inner;
  }

  /* Everything not about this add-on is forwarded to the wrapped
     object. That is what keeps the stack transparent. */
  get name()        { return `${this.inner.name} + ${this.addOnName}`; }
  get note()        { return this.inner.note; }
  get platformFee() { return this.inner.platformFee; }

  /** What this add-on is called, and what it costs. Subclasses set these. */
  get addOnName()   { throw new Error("not implemented"); }
  get addOnLabel()  { return this.addOnName; }

  /** @returns {number} rupees, or a negative number for a discount */
  charge(trip) { throw new Error("not implemented"); }

  /**
   * The whole pattern, in four lines: take the rows from whatever is
   * underneath, append one of my own, hand the lot back up.
   */
  lineItems(trip) {
    const rows = this.inner.lineItems(trip);
    const amount = this.charge(trip);
    rows.push({ label: this.addOnLabel, amount, kind: amount < 0 ? "cut" : "add", tag: "addon" });
    return rows;
  }

  /** Walks the stack - used by the UI to show what is wrapped around what. */
  chain() {
    const out = [];
    let node = this;
    while (node instanceof FareDecorator) {
      out.unshift(node.addOnName);
      node = node.inner;
    }
    return { base: node.name, wraps: out };
  }
}

/* ---------- concrete decorators: the ride add-ons ---------- */

class ChildSeatAddOn extends FareDecorator {
  get addOnName()  { return "ChildSeat"; }
  get addOnLabel() { return "Child seat"; }
  charge()         { return 40; }
}

class ExtraLuggageAddOn extends FareDecorator {
  get addOnName()  { return "ExtraLuggage"; }
  get addOnLabel() { return "Extra luggage"; }
  /** Boot space costs more in a car than on a bike rack. */
  charge(trip)     { return trip.vehicle.capacity > 3 ? 45 : 25; }
}

class PetFriendlyAddOn extends FareDecorator {
  get addOnName()  { return "PetFriendly"; }
  get addOnLabel() { return "Pet friendly"; }
  charge()         { return 35; }
}

class PriorityPickupAddOn extends FareDecorator {
  get addOnName()  { return "PriorityPickup"; }
  get addOnLabel() { return "Priority pickup"; }
  /** Priority on a long trip is worth more, so it is priced per km. */
  charge(trip)     { return Math.round(20 + trip.km * 2); }
}

class CarbonOffsetAddOn extends FareDecorator {
  get addOnName()  { return "CarbonOffset"; }
  get addOnLabel() { return "Carbon offset"; }
  charge(trip)     { return Math.max(5, Math.round(trip.km * 1.2)); }
}

/**
 * A promo code is an add-on with a negative charge. Same base class,
 * same stack, no special case anywhere - which is the sign the
 * abstraction was the right one.
 */
class PromoCodeDecorator extends FareDecorator {
  constructor(inner, promo) {
    super(inner);
    this.promo = promo;              // { code, kind: "PCT"|"FLAT", value, cap }
  }
  get addOnName()  { return `Promo:${this.promo.code}`; }
  get addOnLabel() { return `Promo ${this.promo.code}`; }

  charge(trip) {
    if (this.promo.kind === "FLAT") return -this.promo.value;
    const off = this.inner.lineItems(trip).reduce((sum, l) => sum + l.amount, 0) * (this.promo.value / 100);
    return -Math.min(off, this.promo.cap || Infinity);
  }
}

/* ---------- the registry the UI reads ---------- */

const RIDE_ADDONS = {
  CHILD_SEAT: { label: "Child seat",      hint: "Rear-facing, up to 4 yrs", Klass: ChildSeatAddOn },
  LUGGAGE:    { label: "Extra luggage",   hint: "Boot space for 2+ bags",   Klass: ExtraLuggageAddOn },
  PET:        { label: "Pet friendly",    hint: "Driver accepts pets",      Klass: PetFriendlyAddOn },
  PRIORITY:   { label: "Priority pickup", hint: "Front of the queue",       Klass: PriorityPickupAddOn },
  CARBON:     { label: "Carbon offset",   hint: "Offsets this trip",        Klass: CarbonOffsetAddOn },
};

/**
 * Builds the stack: the base rule first, then one wrapper per
 * selected add-on, then the promo on the very outside so its
 * percentage applies to everything underneath.
 */
function decorateFare(baseStrategy, addOnKeys, promo) {
  let strategy = baseStrategy;

  (addOnKeys || []).forEach((key) => {
    const entry = RIDE_ADDONS[key];
    if (entry) strategy = new entry.Klass(strategy);
  });

  if (promo) strategy = new PromoCodeDecorator(strategy, promo);

  if (strategy !== baseStrategy) {
    const c = strategy.chain();
    log("DECORATOR", `Fare stack rebuilt: {{${c.base}}} wrapped by ${c.wraps.join(" -> ")}`);
  }
  return strategy;
}

/* ============================================================
   GUARDS - decorators that enforce a rule instead of adding a row
   ============================================================ */

class FareGuard extends FareStrategy {
  constructor(inner) {
    super();
    this.inner = inner;          // the strategy (or decorator) being wrapped
  }

  // To the outside world a guarded rule looks exactly like the rule.
  get name()        { return this.inner.name; }
  get note()        { return this.inner.note; }
  get platformFee() { return this.inner.platformFee; }
  get guardName()   { return "FareGuard"; }

  /** Every guard in the chain, outermost first - shown on the receipt. */
  get guards() { return [this.guardName].concat(this.inner.guards || []); }

  lineItems(trip) { return this.inner.lineItems(trip); }
  calculate(trip) { return this.inner.calculate(trip); }

  chain() {
    return this.inner.chain ? this.inner.chain() : { base: this.inner.name, wraps: [] };
  }
}

/* ---------- guard 1: only fair inputs reach the pricing rule ---------- */

class FairInputGuard extends FareGuard {
  get guardName() { return "FairInputGuard"; }

  /**
   * The booking request carries whatever the app knows about the rider
   * (here, the kind of device they booked from). A fare may depend on
   * the vehicle, the distance and the time - nothing else. Everything
   * else is stripped before the pricing rule ever sees it, so no rule,
   * present or future, CAN charge by phone model.
   */
  calculate(trip) {
    const fair = { vehicle: trip.vehicle, km: trip.km, minutes: trip.minutes };
    const dropped = Object.keys(trip).filter((k) => !(k in fair));

    if (dropped.length && !this.announced) {
      this.announced = true;
      log("DECORATOR", `FairInputGuard stripped {{${dropped.join(", ")}}} from the pricing input - ` +
        "a fare may depend only on vehicle, distance and time");
    }
    return this.inner.calculate(fair);
  }
}

/* ---------- guard 2: the legal surge ceiling and fare floor ---------- */

class SurgeCapGuard extends FareGuard {
  constructor(inner, cap = 2, floor = 0.5) {
    super(inner);
    this.cap = cap;              // MoRTH 2025: at most 2x the base fare
    this.floor = floor;          // ...and at least 50% of it
  }

  get guardName() { return "SurgeCapGuard"; }

  calculate(trip) {
    const quote = this.inner.calculate(trip);

    // "Base fare" is the standard price of this exact trip: the vehicle's
    // base + per-km + per-minute charges, before any offer. Add-ons and
    // promo codes are extras the rider chose, so they sit outside the band.
    const base = this.rideCost(trip);
    const isRide = (l) => l.tag !== "fee" && l.tag !== "tax" && l.tag !== "addon";
    const fareLines = quote.lines.filter(isRide);
    const fare = fareLines.reduce((sum, l) => sum + l.amount, 0);

    let fix = null;
    if (fare > base * this.cap + 0.5) {
      fix = { label: `Surge capped at ${this.cap}x (MoRTH 2025)`, amount: base * this.cap - fare, kind: "cut", tag: "cap" };
    } else if (fare < base * this.floor - 0.5) {
      fix = { label: `Raised to ${this.floor * 100}% floor (MoRTH 2025)`, amount: base * this.floor - fare, kind: "add", tag: "cap" };
    }
    if (!fix) return quote;      // already legal - pass it through untouched

    // Rebuild the receipt: ride lines, the correction, the extras, the
    // fees, then GST worked out again on the corrected subtotal.
    const extras = quote.lines.filter((l) => l.tag === "addon");
    const fees = quote.lines.filter((l) => l.tag === "fee");
    const lines = fareLines.concat([fix], extras, fees);
    const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
    const gst = subtotal * 0.05;
    lines.push({ label: "GST 5%", amount: gst, kind: "add", tag: "tax" });
    const total = Math.max(0, Math.round(subtotal + gst));

    log("DECORATOR", `SurgeCapGuard: ${this.inner.name} asked Rs.${quote.total}, ` +
      `the law allows {{Rs.${total}}} - corrected by Rs.${Math.abs(quote.total - total)}`);
    return { lines, total };
  }
}

/**
 * Every pricing rule the app uses goes through here, so no rule can
 * reach a rider unguarded. Outermost first: strip unfair inputs, then
 * enforce the legal band on whatever the rule charges.
 */
function regulated(strategy) {
  return new FairInputGuard(new SurgeCapGuard(strategy));
}
