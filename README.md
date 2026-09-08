# RideFlow — a ride-booking app built on five design patterns

A working ride-hailing web app (pick a route, pick a vehicle, watch the driver
arrive) where **five GoF design patterns do the actual work**. A dispatch console
runs alongside the app and prints a tagged line every time a pattern executes, so
the patterns are not just described — they are visible while the app runs.

| Pattern | Category | Job in this app |
|---|---|---|
| **Factory** | Creational | Creates Bike / Auto / Sedan / SUV objects |
| **Strategy** | Behavioural | Swaps the fare-calculation rule at runtime |
| **Observer** | Behavioural | Broadcasts driver location to four subscribers |
| **State** | Behavioural | Runs the ride lifecycle and its legal actions |
| **Facade** | Structural | Hides the 7-step booking process behind one call |
| *Singleton* | *Creational (bonus)* | *One shared dispatch log for the whole app* |

---

## How to run it

Double-click **`index.html`**. That is the whole setup — no install, no server,
no build step, no internet connection needed (fonts fall back gracefully offline).

A flattened single-file copy for emailing or a USB stick lives at
**`dist/rideflow.html`**. Rebuild it after any edit with:

```
node build-single-file.js
```

---

## Project structure

```
index.html                  the page, plus the code samples shown in the reference
css/styles.css              all styling
js/
  core/
    dispatchLog.js          SINGLETON  - the shared log every pattern writes to
    geo.js                  the city: roads, terrain, road graph, routing (helper, not a pattern)
    traffic.js              how a car drives it: speed, congestion, signals (helper, not a pattern)
    services.js             the four subsystems the Facade hides
  patterns/
    factory.js              FACTORY    - Vehicle + Bike/Auto/SedanCab/SuvCab + VehicleFactory
    strategy.js             STRATEGY   - FareStrategy + 5 pricing rules + FareCalculator
    observer.js             OBSERVER   - DriverLocationPublisher + 4 observers
    state.js                STATE      - RideState + 6 states + Ride context
    facade.js               FACADE     - RideBookingFacade
  app.js                    the user interface ONLY - no business logic at all
build-single-file.js        flattens everything into dist/ for sharing
```

**The most important thing to point out:** `app.js` draws things and handles
clicks. It never prices a ride, never constructs a vehicle, never decides what a
ride is allowed to do next, and never talks to a subsystem. That separation is
what the five patterns bought.

---

## 1. Factory — vehicle creation

**The problem.** The app supports four vehicle categories and will add more.
Written the obvious way, every screen that needs a vehicle grows this:

```js
if (type === "BIKE")       vehicle = new Bike();
else if (type === "AUTO")  vehicle = new Auto();
else if (type === "SEDAN") vehicle = new SedanCab();
```

Launch an e-rickshaw next month and you must find and edit every one of those.

**The solution.** One class owns creation. Callers say *what* they want, never
*how* it is built.

```
            Vehicle  (abstract)
       label / baseFare / perKm / perMin / speedKmph
                  ▲
     ┌────────────┼────────────┬────────────┐
   Bike          Auto      SedanCab      SuvCab

            VehicleFactory
     registry = { BIKE: Bike, AUTO: Auto, ... }
     create(type) ──▶ new VehicleClass()
```

**Where it runs:** `js/patterns/factory.js`. The vehicle picker is drawn from
`VehicleFactory.available()`; booking calls `VehicleFactory.create("SEDAN")`.

**Adding a new vehicle costs:** one class + one line in the registry. Nothing
else in the app changes — not even the picker, which reads the registry.

---

## 2. Strategy — fare calculation

**The problem.** The same trip is priced differently for peak hours, night
rides, subscribers and pool rides. One `calculateFare()` method would collect a
new `if` branch every festival season and never lose one.

**The solution.** Each pricing rule becomes its own class behind one method,
`calculate()`. The `FareCalculator` holds whichever rule is active and can be
handed a different one while the program is running.

```
                    FareStrategy  (interface)
                       calculate(trip)
                             ▲
   ┌──────────────┬──────────┼───────────┬──────────────┐
StandardFare  SurgePricing  NightFare  RidePassFare  SharedPoolFare
              (x1.8)        (+25%)      (-20%)        (split)

   FareCalculator  ──has a──▶  FareStrategy
     setStrategy(s)      ← the dropdown calls this
     calculate(trip)     ← no if-else about pricing anywhere inside
```

**Where it runs:** `js/patterns/strategy.js`. The **Pricing rule** dropdown calls
`facade.useFareStrategy(key)`, which calls `calculator.setStrategy(...)`.

**Why not just if-else?** Because each rule is now separately readable,
separately testable, and can be added without touching working pricing code.
That is the Open/Closed Principle: open to extension, closed to modification.

---

## 3. Observer — driver location updates

**The problem.** One fact — *the driver moved* — has to reach the map marker,
the ETA readout, the trip log and the push-notification service. If the GPS code
calls all four directly, it depends on all four and breaks when any one changes.

**The solution.** The driver's phone (the **Subject**) keeps a list of
subscribers and announces "here is my new position". It never learns their names.

```
   DriverLocationPublisher  (Subject)
     observers[]
     subscribe(o) / unsubscribe(o)
     notify(fix) ──▶ observers.forEach(o => o.update(fix))
                             │
        ┌────────────────────┼──────────────────┬──────────────────┐
   MapMarker            EtaPanel           TripLog        PushNotification
   Observer             Observer           Observer          Observer
   moves the car        updates ETA        writes log        sends alerts
```

**Where it runs:** `js/patterns/observer.js`. The publisher emits a fix every
80 ms while the driver is moving. Note what the Subject does *not* do: it does
not decide where the car got to. `js/core/traffic.js` drives, and the publisher
only relays what it reports — so the pattern stays about broadcasting, not about
motion.

**The demo that proves it:** book a ride, then untick **EtaPanelObserver** while
the car is moving. The ETA freezes; the car keeps driving; the log keeps writing.
One subscriber left, and nothing else even noticed. That is decoupling you can
see.

---

## 4. State — ride lifecycle

**The problem.** A ride moves through five stages and can be cancelled from some
but not others. With a status string, the same `if (status === ...)` ladder gets
copy-pasted into `cancel()`, `next()`, `canRate()`, `showButtons()` — and one
missed branch is a live bug.

**The solution.** Each stage becomes a class holding the behaviour legal in that
stage. The `Ride` delegates instead of deciding.

```
   Ride  (context)
     state ──▶ RideState
     transitionTo(s) { this.state = s; s.onEnter(this); }
     cancel()  { this.state.cancel(this); }     ← delegation, not decision
     next()    { this.state.next(this); }

   RequestedState ──▶ DriverAssignedState ──▶ ArrivingState ──▶ InProgressState ──▶ CompletedState
     cancel: OK          cancel: Rs.20          cancel: Rs.35      cancel: REFUSED     (final)
        │                    │                      │
        └────────────────────┴──────────────────────┴──▶ CancelledState  (final)
```

**Where it runs:** `js/patterns/state.js`. The label on the right of each row in
the lifecycle panel is the actual class the ride is holding at that moment.

**The demo that proves it:** cancel during *Driver arriving* — allowed, with a
fee. Wait until *Ride in progress* and the Cancel button **disables itself**,
because `InProgressState.canCancel` is `false`. The button has no rules of its
own; it just asks the current state.

Notice also that `RideState.cancel()` refuses by default, and only the states
that permit cancelling override it. Adding a new stage cannot silently forget
the rule.

---

## 5. Facade — the booking process

**The problem.** "Book a ride" is one button, but underneath it is seven steps
across five subsystems, **in a specific order**. Without a facade the click
handler has to know all of them, and changing any subsystem breaks the button.

**The solution.** One simple door in front of the complicated building.

```
                     [ Book ride button ]
                              │
                    facade.bookRide(request)
                              │
   ┌──────────┬───────────────┼───────────────┬──────────────┐
 GeoService  VehicleFactory  FareCalculator  DriverMatching  PaymentGateway
 routes,     (FACTORY)       (STRATEGY)      Service         + Notifications
 distance                                    │
                                    DriverLocationPublisher (OBSERVER)
                                             │
                                        Ride + RideState (STATE)
```

**Where it runs:** `js/patterns/facade.js`. This is also where the other four
patterns are wired together — which is exactly why the UI never touches them.

**The demo that proves it:** filter the console to **FACADE** and book a ride.
Two lines. Clear the filter and you see everything those two lines set in motion.

---

## Bonus — Singleton (the dispatch log)

`DispatchLog` must be one shared object: five pattern files write to it and the
UI reads from it. If each module built its own, the console would show a fraction
of what happened.

```js
constructor() {
  if (DispatchLog._instance) return DispatchLog._instance;  // the guard
  this.entries = [];
  DispatchLog._instance = this;
}
```

Every line in the console is proof that it works.

---

## The city underneath it

None of this is a design pattern — it is the world the patterns operate on —
but it is what makes the app behave like a ride app rather than a diagram.

**The map is a road network, not a backdrop.** `geo.js` defines named roads
(Outer Ring Road, PVNR Expressway, NH-44, Tank Bund Road …) plus Hussain Sagar,
the Musi and three parks. Those polylines are then cut into a planar graph:
every place two roads cross becomes a junction. That yields roughly 309
junctions and 400 links.

**Routes are searched, not drawn.** `buildRoute()` snaps both ends to the
nearest junction and runs Dijkstra across that graph. So a route bends through
real streets, the console can name them, and the lake has to be driven around
rather than through. The cost is mostly travel time with a distance term mixed
in — on pure travel time the router happily adds 20 km of expressway to save
thirty seconds, which is optimal on paper and absurd to the person paying by
the kilometre.

**The car drives; it does not slide.** `traffic.js` accelerates and brakes at
different rates, slows for sharp bends, moves at the speed the road class and
its congestion allow, and stops at red lights. The ETA is built from the
harmonic mean of the speeds still ahead plus the lights not yet sat at —
averaging speeds arithmetically quietly promises a trip nobody can drive,
because one crawling kilometre costs far more than one clear kilometre saves.
Opening ETAs land within about 4% of the actual drive.

**Only the clock is compressed.** A 24 km airport run really does take about an
hour at these speeds, so the publisher measures the leg first and scales the
demo clock to finish it in a few seconds. The speedometer and the ETA stay
honest; only time runs fast.

---

## A five-minute demo script

1. **Open the page.** Point at the console: it is already full. Booting the app
   built four vehicles through the Factory and subscribed four Observers.
2. **Click SUV, then Bike.** Console prints
   `VehicleFactory.create("BIKE") -> new Bike`. Say: *the UI asked for a type,
   the factory decided the class.*
3. **Change the pricing rule to Surge ×1.8.** Same trip, same vehicle — the
   receipt rebuilds with different line items. Say: *one object was swapped;
   no calling code changed.*
4. **Press Book ride, with the console filtered to FACADE.** Two lines. Then
   clear the filter and scroll back through what those two lines triggered.
5. **While the driver approaches, untick EtaPanelObserver.** The ETA freezes,
   the car keeps moving. Say: *the publisher does not know who is listening.*
6. **Press Cancel during "Driver arriving"** — allowed, Rs.35 fee. Book again
   and **wait for "Ride in progress"** — the button disables itself. Say: *the
   state object decides, not the button.*
7. **Scroll down** to the reference section for the real code behind each one.

---

## Questions you may be asked

**Why Factory and not just `new Bike()`?**
Because `new Bike()` scattered across the app means every screen must be edited
when a category is added. The factory makes that a one-line change in one file.

**Is this Factory Method or Simple Factory?**
`VehicleFactory` is a **Simple Factory** with a registry — one static `create()`
that returns different subclasses. Classic Factory Method puts the creation in an
abstract method that subclasses override. Simple Factory is the right fit here
because the app has one creator and only the product varies; a registry also
means adding a product needs no new subclass of the creator.

**Strategy and State look like the same UML. What is the difference?**
The structure is nearly identical; the *intent* differs. In Strategy the client
chooses the algorithm and the strategies do not know about each other — surge
pricing has never heard of night pricing. In State the objects know their
successors and change the context themselves — `ArrivingState` creates
`InProgressState`. Strategy swaps *how* something is done; State tracks *where in
a lifecycle* something is.

**Why is Observer better than just calling the four updates directly?**
Because the GPS code would then depend on the map, the label, the logger and the
push service. In the app you can unsubscribe any of them at runtime and nothing
else breaks — which the direct-call version cannot do at all.

**Does the Facade add anything, or is it just a wrapper?**
It is a wrapper, and that is the point: it owns the *order* of seven steps and
the lifetime of five subsystems. Without it, that knowledge lives in a click
handler. It is also the single seam where the other four patterns meet.

**Where is the Singleton risk?**
Singletons are global state and make unit tests share data between runs. It is
justified here because a log genuinely must be one object; it would be the wrong
choice for something like a user session or a database connection in a large app.

---

Built for a Design Patterns course. Everything runs client-side in one HTML file.
