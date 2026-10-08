/* ============================================================
   PATTERN 5 - FACADE  (structural)
   ------------------------------------------------------------
   PROBLEM: "book a ride" is one button, but underneath it is
   seven steps across five subsystems. Without a facade, the click
   handler itself has to know all of them:

       btn.onclick = () => {
         const v      = VehicleFactory.create(type);
         const route  = geoService.route(from, to, v);
         const driver = matching.findDriver(v, from);
         const quote  = calculator.calculate({ vehicle: v, km, minutes });
         const ride   = new Ride({ ...eleven fields... });
         publisher.subscribe(...); publisher.subscribe(...);
         ride.transitionTo(new RequestedState());
         notifications.send("Looking for a driver");
       };

   The button now depends on five subsystems and their correct
   ORDER. Change any subsystem and the button breaks.

   SOLUTION: one class in front of the whole booking subsystem,
   with one simple method. The UI says bookRide(request) and knows
   nothing else. Note the payoff: the facade is where the other
   five patterns are wired together, so the UI never touches them.
   ============================================================ */

class RideBookingFacade {
  constructor({ pushToast, onRideUpdate }) {
    // The complicated parts live in here, hidden from every caller.
    this.geo           = new GeoService();
    this.matching      = new DriverMatchingService(this.geo);
    this.payments      = new PaymentGateway();
    this.notifications = new NotificationService(pushToast);

    // Every pricing rule goes in wrapped by the legal guards (DECORATOR).
    this.calculator = new FareCalculator(regulated(FARE_STRATEGIES.STANDARD()));
    this.publisher  = new DriverLocationPublisher();   // the Observer subject

    // What the app knows about the rider's phone. It travels with the
    // pricing request - and FairInputGuard makes sure no rule can use it.
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    this.device = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : "Desktop";

    this.onRideUpdate = onRideUpdate;
    this.activeRide   = null;
  }

  /* ---------- simple pass-throughs so the UI has ONE contact point ---------- */

  useFareStrategy(key) {
    this.calculator.setStrategy(regulated(FARE_STRATEGIES[key]()));
  }

  attachObserver(observer)  { this.publisher.subscribe(observer); }
  detachObserver(observer)  { this.publisher.unsubscribe(observer); }

  /**
   * Price a trip without booking it - used to keep the fare receipt
   * live while the rider is still choosing. Uses the FACTORY to make
   * the vehicle and the STRATEGY to price it.
   */
  quote({ pickupId, dropId, vehicleType }) {
    const pickup  = findLocation(pickupId);
    const drop    = findLocation(dropId);
    const vehicle = VehicleFactory.create(vehicleType);          // <- FACTORY
    const trip    = this.geo.route(pickup, drop, vehicle);
    const quote   = this.calculator.calculate({                   // <- STRATEGY (+ DECORATOR guards)
      vehicle,
      km: trip.km,
      minutes: trip.minutes,
      device: this.device,                                        // stripped by FairInputGuard
    });

    return { pickup, drop, vehicle, quote, ...trip };
  }

  /**
   * THE FACADE METHOD. Everything the UI needs, behind one call.
   */
  bookRide({ pickupId, dropId, vehicleType }) {
    log("FACADE", "RideBookingFacade.bookRide() - taking over, 7 steps across 5 subsystems");

    if (this.activeRide) this.activeRide.dispose();

    // 1 + 2 + 3. Vehicle, route and price (Factory + Strategy inside quote()).
    const priced = this.quote({ pickupId, dropId, vehicleType });

    // 4. The drop leg is known now. The leg TO the pickup is planned the
    //    moment a driver accepts, from wherever that driver really is -
    //    so a re-matched driver drives in from their own street.
    //    Demo timing: a real 29 km airport run takes an hour. Only the
    //    CLOCK is compressed - traffic.js still drives at real speeds, so
    //    the ETA and speedometer stay honest while the animation stays
    //    short. Longer trips get proportionally longer on screen.
    const legs = {
      toDrop: priced.path,
      toDropKm: priced.km,
      toDropSeconds: Math.min(26, Math.max(9, 6 + priced.km * 0.6)),
    };

    // 5. Build the ride and give it the services its STATES will need.
    const ride = new Ride({
      id: `RIDE-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      pickup: priced.pickup,
      drop: priced.drop,
      vehicle: priced.vehicle,
      quote: priced.quote,
      km: priced.km,
      minutes: priced.minutes,
      legs,
      publisher: this.publisher,                                   // <- OBSERVER subject
      services: { matching: this.matching, payments: this.payments, geo: this.geo },
      onUpdate: this.onRideUpdate,
    });

    // 6. Tell the rider something is happening.
    this.notifications.send("Looking for a driver near you...");

    // 7. Start the STATE machine. Every stage after this drives itself.
    ride.transitionTo(new RequestedState());                       // <- STATE

    this.activeRide = ride;
    log("FACADE", `bookRide() finished - returned {{${ride.id}}}. The UI never touched a subsystem.`);
    return ride;
  }

  /** @param {string} reason  "CHANGED_PLANS" | "DRIVER_ASKED" */
  cancelRide(reason = "CHANGED_PLANS") {
    if (this.activeRide) {
      log("FACADE", `RideBookingFacade.cancelRide(${reason}) -> delegating to the ride's current state`);
      this.activeRide.cancel(reason);
    }
  }

  /* ---------- the driver's side, and the safety desk ---------- */

  /** The driver presses "cancel trip" on their phone. */
  driverCancelRide() {
    if (this.activeRide) {
      log("FACADE", "RideBookingFacade.driverCancelRide() -> delegating to the ride's current state");
      this.activeRide.driverCancel();
    }
  }

  /** Demo: the car stops for four minutes with no red light to explain it. */
  simulateUnexpectedStop() {
    const ride = this.activeRide;
    if (!ride || !ride.riderOnboard) return;
    log("FACADE", "Demo: the driver pulls over and stays there - watch SafetyMonitorObserver");
    this.publisher.holdCar(240);
  }

  /** Demo: the driver leaves the planned route. */
  simulateDetour() {
    const ride = this.activeRide;
    if (!ride || !ride.riderOnboard || !this.publisher.isTracking || ride.detourKm > 0) return;
    const path = this.geo.detourRoute(this.publisher.currentPoint(), ride.legs.toDrop, ride.drop, this.publisher.motion.progress);
    const extra = +Math.max(0, roadKm(path) - ride.legs.toDropKm * (1 - this.publisher.motion.progress)).toFixed(1);
    ride.detourKm = +(ride.detourKm + extra).toFixed(1);
    log("FACADE", `Demo: the driver turns off the planned route (+${extra} km) - watch SafetyMonitorObserver`);
    this.publisher.reroute(path);
    this.onRideUpdate(ride, { detour: path });
  }

  /**
   * The rider answers the "Are you okay?" check.
   * @param {string} answer  "OK" | "SOS"
   */
  respondToSafetyCheck(answer) {
    const ride = this.activeRide;
    if (!ride) return;
    if (answer === "OK") {
      log("SYSTEM", `Safety desk: rider on ${ride.id} confirmed they are okay. Monitoring continues.`);
      return;
    }
    const fix = this.publisher.lastFix || {};
    const where = fix.point ? `(${fix.point.x.toFixed(0)}, ${fix.point.y.toFixed(0)}) on ${fix.road || "a side lane"}` : "unknown";
    log("SYSTEM", `SOS on {{${ride.id}}}: driver ${ride.driver.name}, ${ride.driver.model} ${ride.driver.plate}, ` +
      `live location ${where} -> shared with 112 and the rider's emergency contact; control room calling the rider.`);
    this.notifications.send("<b>SOS sent.</b> Police (112) and your emergency contact have your live location and the car details.");
  }
}
