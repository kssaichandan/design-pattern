/* ============================================================
   PATTERN 6 - DECORATOR  (structural)
   ------------------------------------------------------------
   REAL-WORLD PROBLEM: ride-app riders in India keep reporting fares
   they cannot trust - surge of 3x-4x on festival nights, charges that
   were not on the upfront quote, and (alleged, and denied by the
   companies) different prices for the same trip on an iPhone and an
   Android phone. The Motor Vehicle Aggregator Guidelines, 2025 answer
   with hard limits: surge at most 2x the base fare, and never below
   50% of it off-peak.

   DESIGN PROBLEM: those limits apply to EVERY pricing rule - the five
   we have and every one added next festival season. Putting the check
   inside each strategy means every new rule must remember the law, and
   one that forgets is a fine waiting to happen. Putting it in the
   FareCalculator turns the context back into an if-else ladder.

   SOLUTION: wrap the strategy. A decorator implements the same
   FareStrategy interface, holds another FareStrategy inside, and adds
   one duty around the call. The calculator cannot tell it is talking
   to a wrapper, and the wrapped rule does not know it is wrapped:

       new FairInputGuard( new SurgeCapGuard( new SurgePricingFare(3) ) )

   Guards stack in any order and any number, and no pricing rule
   changed to make room for them.
   ============================================================ */

/* ---------- the base decorator: same interface, forwards everything ---------- */

class FareStrategyDecorator extends FareStrategy {
  constructor(inner) {
    super();
    this.inner = inner;          // the strategy (or decorator) being wrapped
  }

  // To the outside world a decorated rule looks exactly like the rule.
  get name() { return this.inner.name; }
  get note() { return this.inner.note; }

  get guardName() { return "FareStrategyDecorator"; }

  /** Every guard in the chain, outermost first - shown on the receipt. */
  get guards() { return [this.guardName].concat(this.inner.guards || []); }

  calculate(trip) { return this.inner.calculate(trip); }
}

/* ---------- guard 1: only fair inputs reach the pricing rule ---------- */

class FairInputGuard extends FareStrategyDecorator {
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

class SurgeCapGuard extends FareStrategyDecorator {
  constructor(inner, cap = 2, floor = 0.5) {
    super(inner);
    this.cap = cap;              // MoRTH 2025: at most 2x the base fare
    this.floor = floor;          // ...and at least 50% of it
  }

  get guardName() { return "SurgeCapGuard"; }

  calculate(trip) {
    const quote = this.inner.calculate(trip);

    // "Base fare" here is the standard price of this exact trip: the
    // vehicle's base + per-km + per-minute charges, before any offer.
    const base = this.rideCost(trip);
    const fareLines = quote.lines.filter((l) => l.tag !== "fee" && l.tag !== "tax");
    const fare = fareLines.reduce((sum, l) => sum + l.amount, 0);

    let fix = null;
    if (fare > base * this.cap + 0.5) {
      fix = { label: `Surge capped at ${this.cap}x (MoRTH 2025)`, amount: base * this.cap - fare, kind: "cut", tag: "cap" };
    } else if (fare < base * this.floor - 0.5) {
      fix = { label: `Raised to ${this.floor * 100}% floor (MoRTH 2025)`, amount: base * this.floor - fare, kind: "add", tag: "cap" };
    }
    if (!fix) return quote;      // already legal - pass it through untouched

    // Rebuild the receipt: fare lines, the correction, the fees, then
    // GST worked out again on the corrected subtotal.
    const fees = quote.lines.filter((l) => l.tag === "fee");
    const lines = fareLines.concat([fix], fees);
    const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
    const gst = subtotal * 0.05;
    lines.push({ label: "GST 5%", amount: gst, kind: "add", tag: "tax" });
    const total = Math.round(subtotal + gst);

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
