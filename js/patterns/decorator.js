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
    rows.push({ label: this.addOnLabel, amount, kind: amount < 0 ? "cut" : "add" });
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
