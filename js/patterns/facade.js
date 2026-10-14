/* ============================================================
   PATTERN 5 - FACADE  (structural)
   ------------------------------------------------------------
   PROBLEM: "book a ride" is one button, but underneath it is a
   dozen steps across seven subsystems. Without a facade, the click
   handler itself has to know all of them:

       btn.onclick = () => {
         const v      = VehicleFactory.create(type);
         const route  = geoService.route(from, to, v);
         let   rule   = FARE_STRATEGIES[key]();
         rule         = regulated(decorateFare(rule, addOns, promo));
         const quote  = new FareCalculator(rule).calculate({ ... });
         payments.use(PAYMENT_METHODS.get(methodKey));
         const driver = matching.findDriver(v, from);
         const ride   = new Ride({ ...fourteen fields... });
         publisher.subscribe(...); publisher.subscribe(...);
         ride.transitionTo(new RequestedState());
         notifications.send("Looking for a driver");
         session.recordTrip(...);
       };

   The button now depends on seven subsystems AND the correct order
   to call them in. Change any subsystem and the button breaks.

   SOLUTION: one class in front of the whole booking subsystem, with
   a handful of simple methods. The UI says bookRide(request) and
   knows nothing else. Note the payoff: the facade is where the
   other six patterns are wired together, so no screen touches them.
   ============================================================ */

class RideBookingFacade {
  constructor({ pushToast, onRideUpdate }) {
    // The complicated parts live in here, hidden from every caller.
    this.geo           = new GeoService();
    this.matching      = new DriverMatchingService(this.geo);
    this.payments      = new PaymentGateway();
    this.notifications = new NotificationService(pushToast);

    this.baseStrategyKey = "STANDARD";
    this.addOnKeys = [];
    this.promo = null;

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
    this.baseStrategyKey = key;
    this.rebuildStrategy();
  }

  useAddOns(keys) {
    this.addOnKeys = keys.slice();
    this.rebuildStrategy();
  }

  usePromo(promo) {
    this.promo = promo;
    this.rebuildStrategy();
  }

  usePaymentMethod(key) {
    this.payments.use(PAYMENT_METHODS.get(key));
  }

  /**
   * Builds the base rule with STRATEGY, wraps it with a DECORATOR for
   * each add-on and the promo code, then wraps the lot in the legal
   * guards. Two patterns meeting, and the only place that knows it.
   */
  rebuildStrategy() {
    const base = FARE_STRATEGIES[this.baseStrategyKey]();
    this.calculator.setStrategy(regulated(decorateFare(base, this.addOnKeys, this.promo)));
  }

  attachObserver(observer) { this.publisher.subscribe(observer); }
  detachObserver(observer) { this.publisher.unsubscribe(observer); }

  /** What the wallet screen renders. The UI never constructs an adapter. */
  paymentMethods() { return PAYMENT_METHODS.all(); }
  activePayment()  { return this.payments.method; }

  /**
   * Price a trip without booking it - used to keep the fare receipt
   * live while the rider is still choosing. Uses the FACTORY to make
   * the vehicle and the STRATEGY (+ DECORATORS) to price it.
   */
  quote({ pickupId, dropId, vehicleType }) {
    const pickup  = findLocation(pickupId);
    const drop    = findLocation(dropId);
    const vehicle = VehicleFactory.create(vehicleType);            // <- FACTORY
    const trip    = this.geo.route(pickup, drop, vehicle);
    const quote   = this.calculator.calculate({                     // <- STRATEGY (+ DECORATORS)
      vehicle,
      km: trip.km,
      minutes: trip.minutes,
      device: this.device,                                          // stripped by FairInputGuard
    });

    return { pickup, drop, vehicle, quote, ...trip };
  }

  /**
   * Prices the same trip on every vehicle, for the picker's rows.
   * Deliberately quiet: this runs on every change, and six logged
   * quotes per change would bury the console the demo exists to show.
   */
  quoteAllVehicles({ pickupId, dropId, vehicles }) {
    const km = roadKm(buildRoute(findLocation(pickupId), findLocation(dropId)));
    return DispatchLog.getInstance().quietly(() =>
      (vehicles || VehicleFactory.available()).map((vehicle) => {
        const minutes = vehicle.tripMinutes(km);
        return { vehicle, minutes, total: this.calculator.strategy.calculate({ vehicle, km, minutes }).total };
      }));
  }

  /**
   * THE FACADE METHOD. Everything the UI needs, behind one call.
   */
  bookRide({ pickupId, dropId, vehicleType }) {
    log("FACADE", "RideBookingFacade.bookRide() - taking over, 12 steps across 7 subsystems");

    if (this.activeRide) this.activeRide.dispose();

    // 1 + 2 + 3. Vehicle, route and price (Factory + Strategy + Decorator).
    const priced = this.quote({ pickupId, dropId, vehicleType });

    // 4. The drop leg is known now. The leg TO the pickup is planned the
    //    moment a driver accepts, from wherever that driver really is -
    //    so a re-matched driver drives in from their own street.
    //    Demo timing: a real 29 km airport run takes an hour. Only the
    //    CLOCK is compressed - traffic.js still drives at real speeds, so
    //    the ETA and speedometer stay honest while the animation stays short.
    const rush = session().prefs.fastDemo ? 0.5 : 1;
    const legs = {
      toDrop: priced.path,
      toDropKm: priced.km,
      toDropSeconds: rush * Math.min(26, Math.max(9, 6 + priced.km * 0.6)),
    };

    // 5. Build the ride and give it the services its STATES will need.
    const ride = new Ride({
      id: `RIDE-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      pickup: priced.pickup,
      drop: priced.drop,
      vehicle: priced.vehicle,
      quote: priced.quote,
      strategyName: this.calculator.strategy.name,
      km: priced.km,
      minutes: priced.minutes,
      legs,
      publisher: this.publisher,                                   // <- OBSERVER subject
      services: { matching: this.matching, payments: this.payments, geo: this.geo },
      onUpdate: this.onRideUpdate,
    });

    // 6. Tell the rider something is happening.
    this.notifications.send("Looking for a driver near you…");

    // 7. Start the STATE machine. Every stage after this drives itself.
    this.activeRide = ride;
    ride.transitionTo(new RequestedState());                       // <- STATE

    log("FACADE", `bookRide() finished - returned {{${ride.id}}}. No screen touched a subsystem.`);
    return ride;
  }

  /** @param {string} reason  "CHANGED_PLANS" | "DRIVER_ASKED" */
  cancelRide(reason = "CHANGED_PLANS") {
    if (this.activeRide) {
      log("FACADE", `RideBookingFacade.cancelRide(${reason}) -> delegating to the ride's current state`);
      this.activeRide.cancel(reason);
    }
  }

  /** The rider tapping "Start ride" after reading out the trip OTP. */
  startRide() {
    if (this.activeRide && this.activeRide.state.key === "ArrivedState") {
      log("FACADE", "RideBookingFacade.startRide() -> the state verifies the OTP, not this method");
      this.activeRide.next();
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
    const progress = this.publisher.motion.progress;
    const path = this.geo.detourRoute(this.publisher.currentPoint(), ride.legs.toDrop, ride.drop, progress);
    const extra = +Math.max(0, roadKm(path) - ride.legs.toDropKm * (1 - progress)).toFixed(1);
    ride.detourKm = +(ride.detourKm + extra).toFixed(1);
    log("FACADE", `Demo: the driver turns off the planned route (+${extra} km) - watch SafetyMonitorObserver`);
    this.publisher.reroute(path);
    this.onRideUpdate(ride, { detour: path });
  }

  /**
   * The rider answers the "Are you okay?" check, or presses SOS.
   * @param {string} answer  "OK" | "SOS"
   */
  respondToSafetyCheck(answer) {
    const ride = this.activeRide;
    if (answer === "OK") {
      log("SYSTEM", `Safety desk: rider${ride ? " on " + ride.id : ""} confirmed they are okay. Monitoring continues.`);
      return;
    }
    const live = ride && !ride.state.isFinal && ride.driver;
    const fix = this.publisher.lastFix || {};
    const where = fix.point ? `(${fix.point.x.toFixed(0)}, ${fix.point.y.toFixed(0)}) on ${fix.road || "a side lane"}` : "unknown";
    log("SYSTEM", live
      ? `SOS on {{${ride.id}}}: driver ${ride.driver.name}, ${ride.driver.model} ${ride.driver.plate}, ` +
        `live location ${where} -> shared with 112 and the rider's emergency contacts; control room calling the rider.`
      : "SOS raised with no active ride -> 112 and the rider's emergency contacts alerted with the phone's location.");
    this.notifications.send("<b>SOS sent.</b> Police (112) and your emergency contacts have your live location" +
      (live ? " and the car details." : "."));
  }

  /** Money into the wallet, from the wallet screen. */
  topUpWallet(amount) {
    session().topUp(amount);
    this.notifications.send(`Rs.${amount} added to your RideFlow Wallet.`);
  }
}
