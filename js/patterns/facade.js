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
         rule         = decorateFare(rule, addOns, promo);
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

    this.calculator = new FareCalculator(FARE_STRATEGIES.STANDARD());
    this.publisher  = new DriverLocationPublisher();   // the Observer subject

    this.baseStrategyKey = "STANDARD";
    this.addOnKeys = [];
    this.promo = null;

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
   * Builds the base rule with STRATEGY, then wraps it with DECORATOR
   * for each add-on and the promo code. Two patterns meeting, and the
   * only place in the app that knows they meet.
   */
  rebuildStrategy() {
    const base = FARE_STRATEGIES[this.baseStrategyKey]();
    this.calculator.setStrategy(decorateFare(base, this.addOnKeys, this.promo));
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
    const quote   = this.calculator.calculate({                     // <- STRATEGY
      vehicle,
      km: trip.km,
      minutes: trip.minutes,
    });

    return { pickup, drop, vehicle, quote, ...trip };
  }

  /**
   * Prices the same trip on every vehicle, for the picker's tiles.
   * Deliberately quiet: this runs on every keystroke, and six logged
   * quotes per change would bury the console the demo exists to show.
   */
  quoteAllVehicles({ pickupId, dropId, vehicles }) {
    const km = roadKm(buildRoute(findLocation(pickupId), findLocation(dropId)));
    return (vehicles || VehicleFactory.available()).map((vehicle) => {
      const minutes = vehicle.tripMinutes(km);
      return { vehicle, minutes, total: this.calculator.strategy.calculate({ vehicle, km, minutes }).total };
    });
  }

  /**
   * THE FACADE METHOD. Everything the UI needs, behind one call.
   */
  bookRide({ pickupId, dropId, vehicleType }) {
    log("FACADE", "RideBookingFacade.bookRide() - taking over, 12 steps across 7 subsystems");

    if (this.activeRide) this.activeRide.dispose();

    // 1 + 2 + 3. Vehicle, route and price (Factory + Strategy + Decorator).
    const priced = this.quote({ pickupId, dropId, vehicleType });

    // 4. Work out the two legs the driver will drive: to you, then to your drop.
    const driverStart = this.geo.randomPointNear(priced.pickup);
    const toPickup    = buildRoute(driverStart, priced.pickup);
    const toPickupKm  = roadKm(toPickup);

    // Demo timing: a real 29 km airport run takes an hour. Only the
    // CLOCK is compressed - traffic.js still drives at real speeds, so
    // the ETA and speedometer stay honest while the animation stays
    // short. Longer trips get proportionally longer on screen.
    const rush = session().prefs.fastDemo ? 0.5 : 1;
    const legs = {
      toPickup,
      toPickupKm,
      toPickupSeconds: rush * Math.min(11, Math.max(5, 3 + toPickupKm * 0.7)),
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
    ride.transitionTo(new RequestedState());                       // <- STATE

    this.activeRide = ride;
    log("FACADE", `bookRide() finished - returned {{${ride.id}}}. No screen touched a subsystem.`);
    return ride;
  }

  cancelRide() {
    if (this.activeRide) {
      log("FACADE", "RideBookingFacade.cancelRide() -> delegating to the ride's current state");
      this.activeRide.cancel();
    }
  }

  /** The rider tapping "Start ride" after reading out the trip OTP. */
  startRide() {
    if (this.activeRide && this.activeRide.state.key === "ArrivedState") {
      log("FACADE", "RideBookingFacade.startRide() -> the state verifies the OTP, not this method");
      this.activeRide.next();
    }
  }

  /** Money into the wallet, from the wallet screen. */
  topUpWallet(amount) {
    session().topUp(amount);
    this.notifications.send(`Rs.${amount} added to your RideFlow Wallet.`);
  }
}
