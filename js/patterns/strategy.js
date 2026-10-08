/* ============================================================
   PATTERN 2 - STRATEGY  (behavioural)
   ------------------------------------------------------------
   PROBLEM: the same ride costs different amounts depending on the
   pricing rule in force - normal, peak-hour surge, night charge,
   a RidePass subscription, or a shared pool ride. Written the
   obvious way, one method grows into a monster:

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
   ============================================================ */

/* ---------- the strategy interface ---------- */

class FareStrategy {
  get name()  { throw new Error("not implemented"); }
  get note()  { return ""; }

  /**
   * @param {{vehicle: Vehicle, km: number, minutes: number}} trip
   * @returns {{lines: Array, total: number}}
   */
  calculate(trip) { throw new Error("not implemented"); }

  /** Shared helper: the raw distance+time cost before any offer. */
  rideCost(trip) {
    return trip.vehicle.baseFare
         + trip.vehicle.perKm  * trip.km
         + trip.vehicle.perMin * trip.minutes;
  }

  /** Shared helper: fees and 5% GST, applied the same way by every strategy. */
  finalise(lines, platformFee = 9) {
    // `tag` lets a decorator (decorator.js) tell the ride price apart
    // from the fee and tax lines without knowing which rule made them.
    if (platformFee > 0) lines.push({ label: "Platform fee", amount: platformFee, kind: "add", tag: "fee" });

    const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
    const gst = subtotal * 0.05;
    lines.push({ label: "GST 5%", amount: gst, kind: "add", tag: "tax" });

    return { lines, total: Math.round(subtotal + gst) };
  }
}

/* ---------- concrete strategies ---------- */

class StandardFare extends FareStrategy {
  get name() { return "StandardFare"; }
  get note() { return "off-peak, regular rider"; }

  calculate(trip) {
    const lines = [
      { label: "Base fare",                       amount: trip.vehicle.baseFare },
      { label: `Distance ${trip.km} km`,          amount: trip.vehicle.perKm * trip.km },
      { label: `Ride time ${trip.minutes} min`,   amount: trip.vehicle.perMin * trip.minutes },
    ];
    return this.finalise(lines);
  }
}

class SurgePricingFare extends FareStrategy {
  constructor(multiplier = 1.8) {
    super();
    this.multiplier = multiplier;
  }
  get name() { return `SurgePricingFare x${this.multiplier}`; }
  get note() { return "high demand in this area"; }

  calculate(trip) {
    const base = this.rideCost(trip);
    const lines = [
      { label: "Ride cost",                          amount: base },
      { label: `Surge x${this.multiplier} (peak hour)`, amount: base * (this.multiplier - 1), kind: "add", tag: "surge" },
    ];
    return this.finalise(lines);
  }
}

class NightFare extends FareStrategy {
  get name() { return "NightFare"; }
  get note() { return "between 10 PM and 5 AM"; }

  calculate(trip) {
    const base = this.rideCost(trip);
    const lines = [
      { label: "Ride cost",             amount: base },
      { label: "Night charge +25%",     amount: base * 0.25, kind: "add" },
    ];
    return this.finalise(lines);
  }
}

class RidePassFare extends FareStrategy {
  get name() { return "RidePassFare"; }
  get note() { return "subscriber - surge locked out"; }

  calculate(trip) {
    const base = this.rideCost(trip);
    const lines = [
      { label: "Ride cost",                  amount: base },
      { label: "RidePass discount -20%",     amount: -base * 0.20, kind: "cut" },
    ];
    // Subscribers pay no platform fee - so this strategy passes 0.
    return this.finalise(lines, 0);
  }
}

class SharedPoolFare extends FareStrategy {
  get name() { return "SharedPoolFare"; }
  get note() { return "cost split with co-riders"; }

  calculate(trip) {
    const base = this.rideCost(trip);
    const lines = [
      { label: "Ride cost",                    amount: base },
      { label: "Pool split (2 riders) -40%",   amount: -base * 0.40, kind: "cut" },
    ];
    return this.finalise(lines, 5);
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
   * does not know or care which rule it is holding.
   */
  calculate(trip) {
    const quote = this.strategy.calculate(trip);
    log("STRATEGY", `${this.strategy.name}.calculate(${trip.km} km, ${trip.vehicle.label}) -> {{Rs.${quote.total}}}`);
    return quote;
  }
}

/** Named lookup so the UI dropdown never uses "new" directly. */
const FARE_STRATEGIES = {
  STANDARD: () => new StandardFare(),
  SURGE:    () => new SurgePricingFare(1.8),
  // What some platforms tried on festival nights. The rule itself is
  // left untouched - SurgeCapGuard in decorator.js holds it to 2x.
  FESTIVAL: () => new SurgePricingFare(3),
  NIGHT:    () => new NightFare(),
  PASS:     () => new RidePassFare(),
  POOL:     () => new SharedPoolFare(),
};
