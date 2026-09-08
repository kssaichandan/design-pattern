/* ============================================================
   PATTERN 4 - STATE  (behavioural)
   ------------------------------------------------------------
   PROBLEM: a ride passes through Requested -> Driver assigned ->
   Arriving -> Waiting at pickup -> In progress -> Completed, and
   can be cancelled from some of those but not all. Coded with
   flags it becomes:

       cancelRide() {
         if (status === "REQUESTED")            refund(100);
         else if (status === "ASSIGNED")        refund(100);
         else if (status === "ARRIVING")        refund(80);
         else if (status === "WAITING")         refund(60);
         else if (status === "IN_PROGRESS")     alert("too late");
         else if (status === "COMPLETED")       alert("already over");
         ...same ladder repeated in every other method...
       }

   The same if-else ladder gets copy-pasted into cancel(), next(),
   canRate(), showButtons()... and one missed branch is a live bug.

   SOLUTION: turn each status into its own class holding the
   behaviour legal in that status. The Ride forwards the call to
   whichever state object it currently holds.

   PROOF THE PATTERN PAYS: ArrivedState below - the driver waiting
   at the kerb with a trip OTP - was added after everything else
   was working. It cost one class and two edited lines (the state
   before it now points at it). No ladder to hunt through, no
   other file touched.
   ============================================================ */

/* ---------- the state interface ---------- */

class RideState {
  get key()       { throw new Error("not implemented"); }
  get label()     { throw new Error("not implemented"); }
  get step()      { return 0; }       // position on the lifecycle timeline
  get canCancel() { return false; }
  get isFinal()   { return false; }

  /** What the big status line on the tracking screen should say. */
  get hint()      { return ""; }

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
  get hint()      { return "Matching you with drivers nearby"; }
  get step()      { return 0; }
  get canCancel() { return true; }

  onEnter(ride) {
    // Matching takes as long as it takes - a fixed 1.1s every time
    // is the tell of a fake demo.
    ride.after(900 + Math.random() * 1800, () => this.next(ride));
  }

  next(ride) {
    ride.driver = ride.services.matching.findDriver(ride.vehicle, ride.pickup);
    ride.transitionTo(new DriverAssignedState());
  }

  cancel(ride) {
    log("STATE", "{{RequestedState}} allows cancel() - no driver committed yet, nothing to charge.");
    ride.transitionTo(new CancelledState("Cancelled before a driver was assigned - no fee.", 0));
  }
}

class DriverAssignedState extends RideState {
  get key()       { return "DriverAssignedState"; }
  get label()     { return "Driver assigned"; }
  get hint()      { return "Your driver accepted the trip"; }
  get step()      { return 1; }
  get canCancel() { return true; }

  onEnter(ride) {
    ride.notifyUi({
      toast: `<b>${ride.driver.name}</b> accepted &middot; ${ride.driver.colour} ${ride.driver.model} &middot; ${ride.driver.plate}`,
    });
    ride.after(700 + Math.random() * 900, () => this.next(ride));
  }

  next(ride) { ride.transitionTo(new ArrivingState()); }

  cancel(ride) {
    log("STATE", "{{DriverAssignedState}} allows cancel() - driver released back to the pool, Rs.20 fee.");
    ride.transitionTo(new CancelledState("Cancelled after assignment - Rs.20 cancellation fee.", 20));
  }
}

class ArrivingState extends RideState {
  get key()       { return "ArrivingState"; }
  get label()     { return "Driver on the way to you"; }
  get hint()      { return "Head to your pickup point"; }
  get step()      { return 2; }
  get canCancel() { return true; }

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

  next(ride) { ride.transitionTo(new ArrivedState()); }

  cancel(ride) {
    ride.publisher.stopTracking();
    log("STATE", "{{ArrivingState}} allows cancel() - driver already en route, Rs.35 fee.");
    ride.transitionTo(new CancelledState("Cancelled while the driver was en route - Rs.35 fee.", 35));
  }
}

/**
 * The state added last. The driver is at the kerb and the trip
 * cannot start until the rider reads out a four digit code - which
 * is how a real app stops a driver picking up the wrong person.
 */
class ArrivedState extends RideState {
  get key()       { return "ArrivedState"; }
  get label()     { return "Driver waiting at pickup"; }
  get hint()      { return "Share the trip OTP with your driver"; }
  get step()      { return 3; }
  get canCancel() { return true; }

  onEnter(ride) {
    ride.otp = TripOtpService.issue();
    ride.notifyUi({ toast: `Driver has arrived. Trip OTP <b>${ride.otp}</b>` });

    // A driver will not sit there forever; if the rider never taps
    // "Start", the state moves the ride on by itself.
    ride.after(9000, () => { if (ride.state === this) this.next(ride); });
  }

  next(ride) {
    log("STATE", `{{ArrivedState}} verified OTP ${ride.otp} - handing over to InProgressState`);
    ride.transitionTo(new InProgressState());
  }

  cancel(ride) {
    log("STATE", "{{ArrivedState}} allows cancel() - the driver drove out here, Rs.50 fee.");
    ride.transitionTo(new CancelledState("Cancelled with the driver waiting - Rs.50 fee.", 50));
  }
}

class InProgressState extends RideState {
  get key()       { return "InProgressState"; }
  get label()     { return "Ride in progress"; }
  get hint()      { return "On the way to your drop"; }
  get step()      { return 4; }
  get canCancel() { return false; }   // you cannot cancel a moving ride

  onEnter(ride) {
    ride.startedAt = Date.now();
    ride.publisher.startTracking({
      path: ride.legs.toDrop,
      distanceKm: ride.legs.toDropKm,
      seconds: ride.legs.toDropSeconds,
      cruiseKmph: ride.vehicle.speedKmph,
      leg: "TO_DROP",
      onArrive: () => this.next(ride),
    });
  }

  next(ride) { ride.transitionTo(new CompletedState()); }
}

class CompletedState extends RideState {
  get key()     { return "CompletedState"; }
  get label()   { return "Trip completed"; }
  get hint()    { return "Thanks for riding with RideFlow"; }
  get step()    { return 5; }
  get isFinal() { return true; }

  onEnter(ride) {
    // The gateway holds whichever payment ADAPTER the rider picked.
    const receipt = ride.services.payments.charge(ride.quote.total, ride.id);
    ride.receipt = receipt;
    ride.notifyUi({
      toast: `Trip complete. <b>Rs.${ride.quote.total}</b> charged &middot; ${receipt.method}`,
      finished: true,
    });
  }
}

class CancelledState extends RideState {
  constructor(reason, fee) {
    super();
    this.reason = reason;
    this.fee = fee || 0;
  }
  get key()     { return "CancelledState"; }
  get label()   { return "Ride cancelled"; }
  get hint()    { return this.reason; }
  get step()    { return -1; }
  get isFinal() { return true; }

  onEnter(ride) {
    ride.publisher.stopTracking();
    ride.cancelFee = this.fee;

    // A fee is money, so it goes through the same payment ADAPTER the
    // completed ride would have used. Nothing here knows which one.
    if (this.fee > 0) ride.receipt = ride.services.payments.charge(this.fee, ride.id);

    ride.notifyUi({ toast: this.reason, finished: true });
  }
}

/* ---------- the context ---------- */

class Ride {
  constructor(config) {
    Object.assign(this, config);   // id, pickup, drop, vehicle, quote, legs, services, publisher
    this.state = null;
    this.timers = [];
    this.history = [];
    this.otp = null;
    this.receipt = null;
    this.cancelFee = 0;
    this.createdAt = Date.now();
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

  /** The row the Activity screen stores once the ride is over. */
  toTripRecord() {
    const cancelled = this.state.key === "CancelledState";
    return {
      id: this.id,
      at: new Date(this.createdAt).toISOString(),
      pickup: this.pickup.name,
      drop: this.drop.name,
      pickupId: this.pickup.id,
      dropId: this.drop.id,
      vehicle: this.vehicle.code,
      driver: this.driver ? this.driver.name : "-",
      plate: this.driver ? this.driver.plate : "-",
      fare: cancelled ? this.cancelFee : this.quote.total,
      km: cancelled ? 0 : this.km,
      minutes: cancelled ? 0 : this.minutes,
      strategy: this.strategyName,
      payment: this.receipt ? this.receipt.method : "-",
      status: cancelled ? "cancelled" : "completed",
      rating: 0,
      tip: 0,
    };
  }
}

/** The lifecycle the UI draws, kept next to the states it names. */
const RIDE_STEPS = [
  { label: "Ride requested",     cls: "RequestedState" },
  { label: "Driver assigned",    cls: "DriverAssignedState" },
  { label: "Driver arriving",    cls: "ArrivingState" },
  { label: "Waiting at pickup",  cls: "ArrivedState" },
  { label: "Ride in progress",   cls: "InProgressState" },
  { label: "Trip completed",     cls: "CompletedState" },
];
