/* ============================================================
   PATTERN 2 - STRATEGY  (behavioural)
   ------------------------------------------------------------
   PROBLEM: the same ride costs different amounts depending on the
   pricing rule in force - normal, peak-hour surge, night charge,
   a RidePass subscription, an airport run, or a shared pool ride.
   Written the obvious way, one method grows into a monster:

       calculateFare() {
         let fare = base + km * rate;
         if (isPeakHour)        fare *= 1.8;
         else if (isNight)      fare *= 1.25;
         if (user.hasPass)      fare *= 0.8;
         if (isPool)            fare *= 0.6;
         ... 200 more lines every festival season ...
       }

   Every new offer edits (and risks breaking) working pricing code.

   SOLUTION: make each pricing rule its own class behind one common
   method, calculate(). The FareCalculator holds whichever strategy
   is active and can be handed a different one at runtime - which is
   exactly what the dropdown in the UI does.

   NOTE the split between lineItems() and calculate(). Strategies
   only write the rows that are theirs; the base class does fees and
   tax the same way for all of them. That seam is also what lets the
   Decorator pattern (decorator.js) bolt add-ons onto ANY strategy
   without a single strategy knowing add-ons exist.
   ============================================================ */

/* ---------- the strategy interface ---------- */

class FareStrategy {
  get name()  { throw new Error("not implemented"); }
  get note()  { return ""; }

  /** What the platform charges on top. A strategy may waive it. */
  get platformFee() { return 9; }

  /**
   * The rows THIS rule is responsible for, before fees and tax.
   * @param {{vehicle: Vehicle, km: number, minutes: number}} trip
   * @returns {Array<{label: string, amount: number, kind?: string}>}
   */
  lineItems(trip) { throw new Error("not implemented"); }

  /** The finished quote. Strategies rarely need to override this. */
  calculate(trip) {
    return this.finalise(this.lineItems(trip), this.platformFee);
  }

  /** Shared helper: the raw distance+time cost before any offer. */
  rideCost(trip) {
    return trip.vehicle.baseFare
         + trip.vehicle.perKm  * trip.km
         + trip.vehicle.perMin * trip.minutes;
  }

  /** Shared helper: fees and 5% GST, applied the same way by every rule. */
  finalise(lines, platformFee = 9) {
    const rows = lines.slice();
    if (platformFee > 0) rows.push({ label: "Platform fee", amount: platformFee, kind: "add" });

    const subtotal = rows.reduce((sum, l) => sum + l.amount, 0);
    const gst = subtotal * 0.05;
    rows.push({ label: "GST 5%", amount: gst, kind: "add" });

    return { lines: rows, total: Math.max(0, Math.round(subtotal + gst)) };
  }
}

/* ---------- concrete strategies ---------- */

class StandardFare extends FareStrategy {
  get name() { return "StandardFare"; }
  get note() { return "off-peak, regular rider"; }

  lineItems(trip) {
    return [
      { label: "Base fare",                     amount: trip.vehicle.baseFare },
      { label: `Distance ${trip.km} km`,        amount: trip.vehicle.perKm * trip.km },
      { label: `Ride time ${trip.minutes} min`, amount: trip.vehicle.perMin * trip.minutes },
    ];
  }
}

class SurgePricingFare extends FareStrategy {
  constructor(multiplier = 1.8) {
    super();
    this.multiplier = multiplier;
  }
  get name() { return `SurgePricingFare x${this.multiplier}`; }
  get note() { return "high demand in this area"; }

  lineItems(trip) {
    const base = this.rideCost(trip);
    return [
      { label: "Ride cost",                             amount: base },
      { label: `Surge x${this.multiplier} (peak hour)`, amount: base * (this.multiplier - 1), kind: "add" },
    ];
  }
}

class NightFare extends FareStrategy {
  get name() { return "NightFare"; }
  get note() { return "between 10 PM and 5 AM"; }

  lineItems(trip) {
    const base = this.rideCost(trip);
    return [
      { label: "Ride cost",         amount: base },
      { label: "Night charge +25%", amount: base * 0.25, kind: "add" },
    ];
  }
}

class RidePassFare extends FareStrategy {
  get name() { return "RidePassFare"; }
  get note() { return "subscriber - surge locked out"; }

  /** Subscribers pay no platform fee - the rule says so, nothing else has to. */
  get platformFee() { return 0; }

  lineItems(trip) {
    const base = this.rideCost(trip);
    return [
      { label: "Ride cost",              amount: base },
      { label: "RidePass discount -20%", amount: -base * 0.20, kind: "cut" },
    ];
  }
}

class SharedPoolFare extends FareStrategy {
  get name() { return "SharedPoolFare"; }
  get note() { return "cost split with co-riders"; }
  get platformFee() { return 5; }

  lineItems(trip) {
    const base = this.rideCost(trip);
    return [
      { label: "Ride cost",                  amount: base },
      { label: "Pool split (2 riders) -40%", amount: -base * 0.40, kind: "cut" },
    ];
  }
}

/** Added later, and it shows how cheap "later" is with this pattern. */
class AirportFare extends FareStrategy {
  get name() { return "AirportFare"; }
  get note() { return "terminal pickup - toll included"; }
  get platformFee() { return 12; }

  lineItems(trip) {
    const base = this.rideCost(trip);
    return [
      { label: "Ride cost",            amount: base },
      { label: "Airport entry toll",   amount: 105, kind: "add" },
      { label: "Terminal parking",     amount: 40,  kind: "add" },
    ];
  }
}

class CorporateFare extends FareStrategy {
  get name() { return "CorporateFare"; }
  get note() { return "billed to the company account"; }
  get platformFee() { return 0; }

  lineItems(trip) {
    const base = this.rideCost(trip);
    return [
      { label: "Ride cost",              amount: base },
      { label: "Corporate rate -10%",    amount: -base * 0.10, kind: "cut" },
      { label: "Priority allocation",    amount: 25, kind: "add" },
    ];
  }
}

/* ---------- the context that USES a strategy ---------- */

class FareCalculator {
  constructor(strategy) {
    this.strategy = strategy;
  }

  /** Swap the pricing rule while the app is running. */
  setStrategy(strategy) {
    const from = this.strategy ? this.strategy.name : "none";
    this.strategy = strategy;
    log("STRATEGY", `Pricing rule swapped: ${from} -> {{${strategy.name}}} (${strategy.note})`);
  }

  /**
   * Notice: no if / else about pricing anywhere in here. The context
   * does not know or care which rule it is holding - nor whether that
   * rule has been wrapped in three decorators on the way in.
   */
  calculate(trip) {
    const quote = this.strategy.calculate(trip);
    log("STRATEGY", `${this.strategy.name}.calculate(${trip.km} km, ${trip.vehicle.label}) -> {{Rs.${quote.total}}}`);
    return quote;
  }
}

/** Named lookup so the UI dropdown never uses "new" directly. */
const FARE_STRATEGIES = {
  STANDARD:  () => new StandardFare(),
  SURGE:     () => new SurgePricingFare(1.8),
  NIGHT:     () => new NightFare(),
  PASS:      () => new RidePassFare(),
  POOL:      () => new SharedPoolFare(),
  AIRPORT:   () => new AirportFare(),
  CORPORATE: () => new CorporateFare(),
};

/** Labels for the dropdown, kept next to the rules they name. */
const FARE_STRATEGY_LABELS = {
  STANDARD:  "Standard fare",
  SURGE:     "Surge pricing \u00d71.8 (peak hour)",
  NIGHT:     "Night fare (+25%)",
  PASS:      "RidePass subscriber (\u221220%)",
  POOL:      "Shared pool (split fare)",
  AIRPORT:   "Airport run (toll + parking)",
  CORPORATE: "Corporate account (\u221210%)",
};
