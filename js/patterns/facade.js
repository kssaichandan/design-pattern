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
   four patterns are wired together, so the UI never touches them.
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

    this.onRideUpdate = onRideUpdate;
    this.activeRide   = null;
  }

  /* ---------- simple pass-throughs so the UI has ONE contact point ---------- */

  useFareStrategy(key) {
    this.calculator.setStrategy(FARE_STRATEGIES[key]());
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
    const quote   = this.calculator.calculate({                   // <- STRATEGY
      vehicle,
      km: trip.km,
      minutes: trip.minutes,
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

    // 4. Work out the two legs the driver will drive: to you, then to your drop.
    const driverStart = this.geo.randomPointNear(priced.pickup);
    const toPickup    = buildRoute(driverStart, priced.pickup);
    const toPickupKm  = roadKm(toPickup);

    // Demo timing: a real 29 km airport run takes an hour. Only the
    // CLOCK is compressed - traffic.js still drives at real speeds, so
    // the ETA and speedometer stay honest while the animation stays
    // short. Longer trips get proportionally longer on screen.
    const legs = {
      toPickup,
      toPickupKm,
      toPickupSeconds: Math.min(11, Math.max(5, 3 + toPickupKm * 0.7)),
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

  cancelRide() {
    if (this.activeRide) {
      log("FACADE", "RideBookingFacade.cancelRide() -> delegating to the ride's current state");
      this.activeRide.cancel();
    }
  }
}
