/* ============================================================
   PATTERN 4 - STATE  (behavioural)
   ------------------------------------------------------------
   PROBLEM: a ride passes through Requested -> Driver assigned ->
   Arriving -> In progress -> Completed, and can be Cancelled from
   some of those but not all. Coded with flags it becomes:

       cancelRide() {
         if (status === "REQUESTED")            refund(100);
         else if (status === "ASSIGNED")        refund(100);
         else if (status === "ARRIVING")        refund(80);
         else if (status === "IN_PROGRESS")     alert("too late");
         else if (status === "COMPLETED")       alert("already over");
         ...same ladder repeated in every other method...
       }

   The same if-else ladder gets copy-pasted into cancel(), next(),
   canRate(), showButtons()... and one missed branch is a live bug.

   SOLUTION: turn each status into its own class holding the
   behaviour legal in that status. The Ride just forwards the call
   to whichever state object it currently holds. Adding a
   "Driver waiting" state means writing one class, not hunting
   through ten if-else ladders.

   Watch it in the app: the Cancel button disables itself the moment
   the ride enters InProgressState - because the state says so, not
   because the button has rules of its own.
   ============================================================ */

/* ---------- the state interface ---------- */

class RideState {
  get key()       { throw new Error("not implemented"); }
  get label()     { throw new Error("not implemented"); }
  get step()      { return 0; }      // position on the lifecycle timeline
  get canCancel() { return false; }
  get isFinal()   { return false; }

  /** Can the DRIVER still walk away from this ride? */
  get canDriverCancel() { return false; }

  /** Is the rider in the car? Safety monitoring only matters then. */
  get riderOnboard() { return false; }

  /** What the rider would pay to cancel right now. */
  cancelFee(ride) { return 0; }

  /** Runs the moment the ride enters this state. */
  onEnter(ride) {}

  /** Legal forward transition out of this state. */
  next(ride) {}

  /** Default behaviour: refuse. States that allow it override this. */
  cancel(ride, reason) {
    log("STATE", `{{${this.key}}} refuses cancel() - not allowed once the ride reaches this stage.`);
    ride.notifyUi({ toast: "This ride can no longer be cancelled." });
  }

  /** Default behaviour: refuse. Only states with a driver on the way allow it. */
  driverCancel(ride) {
    log("STATE", `{{${this.key}}} refuses driverCancel() - a driver cannot walk away at this stage.`);
  }
}

/* ---------- shared steps, used by more than one state ----------
   Plain functions rather than copies in each class: the STATES
   decide WHEN these happen, these only say HOW.                    */

const MAX_REMATCHES = 2;

/**
 * Find a driver who has not already walked away from this ride, plan
 * their leg to the pickup from where THEY are, and hand over to
 * DriverAssignedState. No one left -> close the ride at no cost.
 */
function assignDriver(ride) {
  const driver = ride.services.matching.findDriver(ride.vehicle, ride.pickup, ride.walkedAway.map((d) => d.name));
  if (!driver) {
    ride.transitionTo(new CancelledState("No driver is free nearby right now. Nothing has been charged.", 0));
    return;
  }
  ride.driver = driver;
  Object.assign(ride.legs, driver.leg);
  ride.transitionTo(new DriverAssignedState());
}

/**
 * The rider pressed Cancel after a driver accepted. The reason matters:
 * "the driver asked me to cancel" is the trick riders complain about
 * most - the driver avoids a penalty and the RIDER pays it. Here that
 * reason costs the rider nothing and puts the penalty on the driver.
 */
function riderCancels(ride, reason, stage) {
  ride.publisher.stopTracking();
  const fee = cancellationFee(ride.quote.total);

  if (reason === "DRIVER_ASKED") {
    ride.services.matching.penalise(ride.driver, fee, "rider reports being asked to cancel");
    log("STATE", `{{${stage}}} allows cancel() - reason DRIVER_ASKED, so the rider pays Rs.0 and the driver is penalised.`);
    ride.transitionTo(new CancelledState(
      `Cancelled - you reported that ${ride.driver.name} asked you to cancel. No fee for you; the driver has been penalised.`, 0));
    return;
  }

  log("STATE", `{{${stage}}} allows cancel() - rider changed plans, fee Rs.${fee} (10% of fare, max Rs.100).`);
  ride.transitionTo(new CancelledState(`Cancelled - Rs.${fee} cancellation fee (10% of the fare, capped at Rs.100).`, fee));
}

/**
 * The driver cancelled after accepting. The rider did nothing wrong, so
 * the ride does not die and the rider pays nothing: the penalty goes on
 * the driver, and the ride goes back to matching at the SAME fare.
 */
function driverWalksAway(ride, stage) {
  ride.publisher.stopTracking();
  const driver = ride.driver;
  const fee = cancellationFee(ride.quote.total);

  ride.services.matching.penalise(driver, fee, "cancelled an accepted ride");
  ride.walkedAway.push(driver);
  ride.driver = null;

  log("STATE", `{{${stage}}} allows driverCancel() - ${driver.name} walked away. Rider pays Rs.0.`);

  if (ride.walkedAway.length > MAX_REMATCHES) {
    ride.transitionTo(new CancelledState(
      `${ride.walkedAway.length} drivers cancelled on you. The ride is closed and you have not been charged.`, 0));
    return;
  }
  ride.transitionTo(new RematchingState(driver));
}

/* ---------- concrete states ---------- */

class RequestedState extends RideState {
  get key()       { return "RequestedState"; }
  get label()     { return "Searching for a driver"; }
  get step()      { return 0; }
  get canCancel() { return true; }

  onEnter(ride) {
    // Matching takes as long as it takes - a fixed 1.1s every time
    // is the tell of a fake demo.
    ride.after(900 + Math.random() * 1800, () => this.next(ride));
  }

  next(ride) {
    assignDriver(ride);
  }

  cancel(ride) {
    log("STATE", `{{RequestedState}} allows cancel() - no driver committed yet, nothing to charge.`);
    ride.transitionTo(new CancelledState("Cancelled before a driver was assigned - no fee.", 0));
  }
}

/**
 * NEW STAGE - the answer to "the driver cancelled on me". Adding it
 * took this one class and two lines in the states that lead here; no
 * if-else anywhere else in the app had to learn about it.
 */
class RematchingState extends RideState {
  constructor(previous) {
    super();
    this.previous = previous;          // the driver who walked away
  }
  get key()       { return "RematchingState"; }
  get label()     { return "Finding you another driver"; }
  get step()      { return 0; }
  get canCancel() { return true; }     // free - none of this is the rider's fault

  onEnter(ride) {
    log("STATE", `{{RematchingState}} - fare stays locked at Rs.${ride.quote.total}; ` +
      `${ride.walkedAway.map((d) => d.name).join(", ")} excluded from matching (attempt ${ride.walkedAway.length} of ${MAX_REMATCHES}).`);
    ride.notifyUi({
      toast: `<b>${this.previous.name}</b> cancelled. Finding you another driver at the same <b>Rs.${ride.quote.total}</b> - you won't be charged.`,
    });
    ride.after(900 + Math.random() * 1200, () => this.next(ride));
  }

  next(ride) {
    assignDriver(ride);
  }

  cancel(ride) {
    log("STATE", `{{RematchingState}} allows cancel() - a driver let the rider down, so no fee.`);
    ride.transitionTo(new CancelledState("Cancelled while re-matching - no fee.", 0));
  }
}

class DriverAssignedState extends RideState {
  get key()       { return "DriverAssignedState"; }
  get label()     { return "Driver assigned"; }
  get step()      { return 1; }
  get canCancel() { return true; }
  get canDriverCancel() { return true; }

  cancelFee(ride) { return cancellationFee(ride.quote.total); }

  onEnter(ride) {
    ride.notifyUi({
      toast: `<b>${ride.driver.name}</b> accepted &middot; ${ride.driver.model} &middot; ${ride.driver.plate}`,
    });
    ride.after(700 + Math.random() * 900, () => this.next(ride));
  }

  next(ride) {
    ride.transitionTo(new ArrivingState());
  }

  cancel(ride, reason) {
    riderCancels(ride, reason, "DriverAssignedState");
  }

  driverCancel(ride) {
    driverWalksAway(ride, "DriverAssignedState");
  }
}

class ArrivingState extends RideState {
  get key()       { return "ArrivingState"; }
  get label()     { return "Driver on the way to you"; }
  get step()      { return 2; }
  get canCancel() { return true; }
  get canDriverCancel() { return true; }

  cancelFee(ride) { return cancellationFee(ride.quote.total); }

  onEnter(ride) {
    // The state decides which GPS leg is streaming right now.
    ride.publisher.startTracking({
      path: ride.legs.toPickup,
      distanceKm: ride.legs.toPickupKm,
      seconds: ride.legs.toPickupSeconds,
      cruiseKmph: ride.vehicle.speedKmph,
      leg: "TO_PICKUP",
      onArrive: () => this.next(ride),
    });
  }

  next(ride) {
    ride.notifyUi({ toast: "Driver has arrived at pickup." });
    ride.transitionTo(new InProgressState());
  }

  cancel(ride, reason) {
    riderCancels(ride, reason, "ArrivingState");
  }

  driverCancel(ride) {
    driverWalksAway(ride, "ArrivingState");
  }
}

class InProgressState extends RideState {
  get key()       { return "InProgressState"; }
  get label()     { return "Ride in progress"; }
  get step()      { return 3; }
  get canCancel() { return false; }   // you cannot cancel a moving ride
  get riderOnboard() { return true; }

  onEnter(ride) {
    ride.publisher.startTracking({
      path: ride.legs.toDrop,
      distanceKm: ride.legs.toDropKm,
      seconds: ride.legs.toDropSeconds,
      cruiseKmph: ride.vehicle.speedKmph,
      leg: "TO_DROP",
      onArrive: () => this.next(ride),
    });
  }

  next(ride) {
    ride.transitionTo(new CompletedState());
  }
}

class CompletedState extends RideState {
  get key()     { return "CompletedState"; }
  get label()   { return "Trip completed"; }
  get step()    { return 4; }
  get isFinal() { return true; }

  onEnter(ride) {
    // The upfront quote IS the bill: not re-priced at drop-off, even if
    // the driver took a longer way round.
    const receipt = ride.services.payments.charge(ride.quote.total, ride.id);
    if (ride.detourKm) {
      log("STATE", `{{CompletedState}} - driver detoured ${ride.detourKm} km; rider still pays the locked fare, not a rupee more.`);
    }
    ride.notifyUi({ toast: `Trip complete. <b>Rs.${ride.quote.total}</b> charged (your upfront fare) - ${receipt.method}` });
  }
}

class CancelledState extends RideState {
  constructor(reason, fee = 0) {
    super();
    this.reason = reason;
    this.fee = fee;
  }
  get key()     { return "CancelledState"; }
  get label()   { return "Ride cancelled"; }
  get step()    { return -1; }
  get isFinal() { return true; }

  onEnter(ride) {
    ride.publisher.stopTracking();
    if (this.fee > 0) ride.services.payments.charge(this.fee, ride.id + " (cancellation)");
    ride.notifyUi({ toast: this.reason });
  }
}

/* ---------- the context ---------- */

class Ride {
  constructor(config) {
    Object.assign(this, config);   // id, pickup, drop, vehicle, quote, legs, services, publisher
    this.state = null;
    this.timers = [];
    this.history = [];
    this.walkedAway = [];          // drivers who cancelled on this ride
    this.detourKm = 0;
  }

  /**
   * The whole point of the pattern lives in these five lines: the Ride
   * never asks "what status am I in?". It swaps the object and lets
   * that object decide what happens next.
   */
  transitionTo(state) {
    const from = this.state ? this.state.key : "(new ride)";
    this.state = state;
    this.history.push(state.key);

    log("STATE", `${from} -> {{${state.key}}}  |  cancellable: ${state.canCancel ? "yes" : "no"}`);
    this.notifyUi({});
    state.onEnter(this);
  }

  /** Delegation, not decision-making. */
  cancel(reason)  { this.state.cancel(this, reason); }
  driverCancel()  { this.state.driverCancel(this); }
  next()          { this.state.next(this); }

  get canCancel()       { return this.state ? this.state.canCancel : false; }
  get canDriverCancel() { return this.state ? this.state.canDriverCancel : false; }
  get riderOnboard()    { return this.state ? this.state.riderOnboard : false; }
  get cancelFee()       { return this.state ? this.state.cancelFee(this) : 0; }

  /** Run `fn` later - but only if the ride is still in the state that asked. */
  after(ms, fn) {
    const owner = this.state;
    const t = setTimeout(() => {
      if (this.state === owner && !this.state.isFinal) fn();
    }, ms);
    this.timers.push(t);
  }

  dispose() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.publisher.stopTracking();
  }

  notifyUi(payload) {
    if (this.onUpdate) this.onUpdate(this, payload);
  }
}
