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

  /** Runs the moment the ride enters this state. */
  onEnter(ride) {}

  /** Legal forward transition out of this state. */
  next(ride) {}

  /** Default behaviour: refuse. States that allow it override this. */
  cancel(ride) {
    log("STATE", `{{${this.key}}} refuses cancel() - not allowed once the ride reaches this stage.`);
    ride.notifyUi({ toast: "This ride can no longer be cancelled." });
  }
}

/* ---------- concrete states ---------- */

class RequestedState extends RideState {
  get key()       { return "RequestedState"; }
  get label()     { return "Searching for a driver"; }
  get step()      { return 0; }
  get canCancel() { return true; }

  onEnter(ride) {
    ride.after(1100, () => this.next(ride));
  }

  next(ride) {
    const driver = ride.services.matching.findDriver(ride.vehicle, ride.pickup);
    ride.driver = driver;
    ride.transitionTo(new DriverAssignedState());
  }

  cancel(ride) {
    log("STATE", `{{RequestedState}} allows cancel() - no driver committed yet, nothing to charge.`);
    ride.transitionTo(new CancelledState("Cancelled before a driver was assigned - no fee."));
  }
}

class DriverAssignedState extends RideState {
  get key()       { return "DriverAssignedState"; }
  get label()     { return "Driver assigned"; }
  get step()      { return 1; }
  get canCancel() { return true; }

  onEnter(ride) {
    ride.notifyUi({ toast: `<b>${ride.driver.name}</b> accepted - ${ride.driver.plate}` });
    ride.after(1200, () => this.next(ride));
  }

  next(ride) {
    ride.transitionTo(new ArrivingState());
  }

  cancel(ride) {
    log("STATE", `{{DriverAssignedState}} allows cancel() - driver released back to the pool, Rs.20 fee.`);
    ride.transitionTo(new CancelledState("Cancelled after assignment - Rs.20 cancellation fee."));
  }
}

class ArrivingState extends RideState {
  get key()       { return "ArrivingState"; }
  get label()     { return "Driver on the way to you"; }
  get step()      { return 2; }
  get canCancel() { return true; }

  onEnter(ride) {
    // The state decides which GPS leg is streaming right now.
    ride.publisher.startTracking({
      path: ride.legs.toPickup,
      distanceKm: ride.legs.toPickupKm,
      seconds: ride.legs.toPickupSeconds,
      leg: "TO_PICKUP",
      onArrive: () => this.next(ride),
    });
  }

  next(ride) {
    ride.notifyUi({ toast: "Driver has arrived at pickup." });
    ride.transitionTo(new InProgressState());
  }

  cancel(ride) {
    ride.publisher.stopTracking();
    log("STATE", `{{ArrivingState}} allows cancel() - driver already en route, Rs.35 fee.`);
    ride.transitionTo(new CancelledState("Cancelled while the driver was en route - Rs.35 fee."));
  }
}

class InProgressState extends RideState {
  get key()       { return "InProgressState"; }
  get label()     { return "Ride in progress"; }
  get step()      { return 3; }
  get canCancel() { return false; }   // you cannot cancel a moving ride

  onEnter(ride) {
    ride.publisher.startTracking({
      path: ride.legs.toDrop,
      distanceKm: ride.legs.toDropKm,
      seconds: ride.legs.toDropSeconds,
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
    const receipt = ride.services.payments.charge(ride.quote.total, ride.id);
    ride.notifyUi({ toast: `Trip complete. <b>Rs.${ride.quote.total}</b> charged - ${receipt.method}` });
  }
}

class CancelledState extends RideState {
  constructor(reason) {
    super();
    this.reason = reason;
  }
  get key()     { return "CancelledState"; }
  get label()   { return "Ride cancelled"; }
  get step()    { return -1; }
  get isFinal() { return true; }

  onEnter(ride) {
    ride.publisher.stopTracking();
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
  cancel() { this.state.cancel(this); }
  next()   { this.state.next(this); }

  get canCancel() { return this.state ? this.state.canCancel : false; }

  after(ms, fn) {
    const t = setTimeout(() => {
      if (!this.state.isFinal) fn();
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
