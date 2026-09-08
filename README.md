# RideFlow — a ride-hailing app built on seven design patterns

A working ride-hailing web app — sign in with an OTP, pick from 29 places across
Hyderabad, choose a vehicle and add-ons, watch a driver take real roads to you,
pay, rate the trip, and find it waiting in your history — where **seven GoF
design patterns do the actual work**. A dispatch console runs alongside the app
and prints a tagged line every time a pattern executes, so the patterns are not
just described: they are visible while the app runs.

| Pattern | Category | Job in this app |
|---|---|---|
| **Factory** | Creational | Creates the six vehicle classes from a registry |
| **Strategy** | Behavioural | Swaps the fare-calculation rule at runtime |
| **Decorator** | Structural | Stacks ride add-ons and promo codes onto any fare rule |
| **Observer** | Behavioural | Broadcasts driver location to six subscribers |
| **State** | Behavioural | Runs the ride lifecycle and its legal actions |
| **Adapter** | Structural | Fits four incompatible payment SDKs behind one `pay()` |
| **Facade** | Structural | Hides the 12-step booking process behind one call |
| **Singleton** | Creational | The shared dispatch log, and the shared user session |

Everything is fake on purpose: no server, no network, no real money. It is a
college project for a Design Patterns course.

---

## How to run it

Double-click **`index.html`**. That is the whole setup — no install, no server,
no build step, no internet connection needed (fonts fall back gracefully offline).

On the sign-in screen, type any 10-digit number starting with 6–9 and the OTP is
printed on screen, or press **“Skip — sign me in as a demo rider”** to land in a
furnished account straight away.

A flattened single-file copy for emailing or a USB stick lives at
**`dist/rideflow.html`**. Rebuild it after any edit with:

```
node build-single-file.js
```

Your account, wallet, saved places and trip history are kept in `localStorage`,
so a refresh does not sign you out. **Profile → Erase demo data** clears the lot.

---

## The nine screens

| Screen | What it is | Pattern it shows off |
|---|---|---|
| **Sign in** | Phone → OTP → name, three steps | Singleton (writes the session) |
| **Book a ride** | Route, vehicle, add-ons, pricing, payment, live map, lifecycle | Factory, Strategy, Decorator, Observer, State, Facade |
| **Activity** | Every past trip, receipts, ratings, re-book | Singleton |
| **Wallet** | Balance, top-ups, four payment methods, transactions | Adapter |
| **Offers** | Six promo codes, applied live to the fare | Decorator |
| **Saved places** | Home / Work shortcuts, all 29 places by zone | Singleton |
| **Safety** | SOS, trusted contacts, flagged events | Observer |
| **Profile** | Account details, ride stats, sign out | Singleton |
| **Settings** | Theme, notification and demo preferences | Singleton |
| **Patterns** | The reference: problem, solution, real code, for all seven | — |

---

## Project structure

```
index.html                  every screen, plus the code samples in the reference
css/styles.css              all styling
js/
  core/
    dispatchLog.js          SINGLETON  - the shared log every pattern writes to
    session.js              SINGLETON  - the shared account, wallet, saved places, history
    geo.js                  the city: 29 places, roads, terrain, road graph, routing (helper)
    traffic.js              how a car drives it: speed, congestion, signals (helper)
    services.js             the subsystems the Facade hides, plus the 28-driver roster
  patterns/
    factory.js              FACTORY    - Vehicle + 6 concrete vehicles + VehicleFactory
    strategy.js             STRATEGY   - FareStrategy + 7 pricing rules + FareCalculator
    decorator.js            DECORATOR  - FareDecorator + 5 add-ons + PromoCodeDecorator
    observer.js             OBSERVER   - DriverLocationPublisher + 6 observers
    state.js                STATE      - RideState + 7 states + Ride context
    adapter.js              ADAPTER    - 3 foreign SDKs + PaymentMethod + 4 adapters
    facade.js               FACADE     - RideBookingFacade
  ui/
    router.js               screen switching, the modal sheet, formatting (helper)
    auth.js                 the sign-in flow (helper)
    screens.js              activity, wallet, offers, saved, safety, profile, settings
  app.js                    the booking screen, the map and boot - UI only
build-single-file.js        flattens everything into dist/ for sharing
```

**The most important thing to point out:** nothing in `js/ui/` or `app.js`
prices a ride, constructs a vehicle, decides what a ride may do next, or talks to
a payment provider. They call the Facade and render what comes back. That
separation is what the seven patterns bought.

---

## 1. Factory — vehicle creation

**The problem.** The app supports Bike, E-Rick, Auto, Sedan, SUV and Prime, and
more get added later. Written the obvious way, every screen that makes a vehicle
grows the same ladder:

```js
if (type === "BIKE")      vehicle = new Bike();
else if (type === "AUTO") vehicle = new Auto();
else if (type === "SUV")  vehicle = new SuvCab();
```

**The solution.** `VehicleFactory` owns a registry of type-code → class and one
`create()` method. Callers say *what* they want, never *how* it is built.

**The proof it pays.** `ERickshaw` and `PrimeSedan` were added after everything
else worked. Cost: one class each, plus one registry line each. The picker draws
itself from `VehicleFactory.available()`, so both appeared on screen without the
UI being edited either.

**See it live.** Click a different vehicle tile. The console prints the exact
class the factory built and the fare rates it carries.

---

## 2. Strategy — fare calculation

**The problem.** The same ride costs different amounts under normal, surge,
night, subscriber, pool, airport and corporate rules. One `calculateFare()`
method grows an `if` branch per festival offer and never shrinks.

**The solution.** Each rule is its own class behind one method. `FareCalculator`
holds whichever one is active and can be handed a different one at runtime.

Note the seam between `lineItems()` and `calculate()`: a rule writes only *its*
rows, and the base class applies the platform fee and 5% GST the same way for
all of them. A rule that wants no platform fee (`RidePassFare`) overrides one
getter rather than reimplementing the arithmetic. That seam is also what lets the
Decorator bolt add-ons onto any rule without the rule knowing.

**See it live.** Switch to *Surge pricing ×1.8*. Same trip, same vehicle — the
receipt rebuilds with different line items, and no calling code changed.

---

## 3. Decorator — ride add-ons and promo codes

**The problem.** A rider wants a child seat **and** is carrying luggage **and**
has a promo code — on top of whichever pricing rule is running. Subclasses mean a
class per combination (5 add-ons × 7 rules = 224, doubling with the next add-on).
Flags mean the same `if` block copy-pasted into all seven rules.

**The solution.** A decorator **is** a `FareStrategy` and **holds** a
`FareStrategy`. It asks the thing it wraps for its rows, then appends its own.
Because a decorator is itself a strategy, decorators stack:

```js
let rule = new SurgePricingFare(1.8);
rule = new ChildSeatAddOn(rule);
rule = new PetFriendlyAddOn(rule);
rule = new PromoCodeDecorator(rule, { code: "HYD20", value: 20, cap: 80 });

calculator.setStrategy(rule);     // it cannot tell the difference
```

A promo code is an add-on with a negative charge — same base class, no special
case anywhere, which is the sign the abstraction was the right one.

**See it live.** Tick *Child seat* and *Pet friendly* on surge pricing. The
console prints the whole stack, the receipt grows two rows, and
`FareCalculator` still thinks it is holding one plain strategy.

---

## 4. Observer — driver location updates

**The problem.** One fact — “the driver moved” — has to reach the map marker,
the ETA panel, the fare meter, the safety monitor, the trip log and the push
service. The naive version wires them all into the GPS code, which then breaks if
any one of them is removed.

**The solution.** `DriverLocationPublisher` keeps a list of subscribers and
announces its new position. It never learns who they are.

**The proof it pays.** `FareMeterObserver` and `SafetyMonitorObserver` were added
last. Each needed one `subscribe()` call; the GPS code was never opened and no
other observer was told.

**See it live.** Book a ride, then untick *EtaPanelObserver* while the car is
moving. The ETA freezes, the car keeps driving, the meter keeps counting.

---

## 5. State — the ride lifecycle

**The problem.** A ride goes Requested → Assigned → Arriving → Waiting at pickup
→ In progress → Completed, and is cancellable from some of those but not all.
With a status flag, the same `if` ladder gets copy-pasted into `cancel()`,
`next()`, `canRate()` and every other method — and one missed branch is a bug.

**The solution.** Each stage is a class holding the behaviour legal at that
stage. `Ride.cancel()` is one line: `this.state.cancel(this)`. Delegation, not
decision.

**The proof it pays.** `ArrivedState` — the driver waiting at the kerb with a
trip OTP — was added last. It cost one class and one edited line
(`ArrivingState.next`). With an if-else ladder it would have meant finding every
ladder in the codebase.

**See it live.** Cancel during *Driver arriving* — allowed, Rs.35, and the fee is
charged through your chosen payment method. Wait for *Ride in progress* and the
button disables itself, because `InProgressState.canCancel` is false.

---

## 6. Adapter — payments

**The problem.** Four payment providers, four interfaces written by four
different people:

```js
upiSdk.collect("me@okhdfc", 24500)          // PAISE, not rupees
cardApi.authorise({ cardToken, amount })    // rupees, object arg, then capture()
walletLedger.debit(245)                     // throws if short
// cash has no SDK at all
```

Different method names, argument shapes, units and failure behaviour. Without an
adapter the payment code becomes a `switch` that has to remember all four, and
every new provider edits it.

**The solution.** Define the interface *we* want — `pay(rupees, rideId)` — and
write one small class per provider that translates. `PaymentGateway` holds a
`PaymentMethod` and calls `pay()`. It never learns that UPI counts in paise, that
cards need two calls, or that the wallet throws.

**Adapter vs Strategy.** A Strategy swaps behaviour we wrote and control. An
Adapter exists because someone else’s interface is the wrong shape and we are not
allowed to change it.

**See it live.** Spend the wallet down below the fare and book anyway. The
console shows `ledger.debit()` throwing and `WalletAdapter` quietly falling back
to UPI — the gateway never knew.

---

## 7. Facade — the booking process

**The problem.** “Book a ride” is one button on top of twelve steps across seven
subsystems, in a specific order. Without a facade, the click handler has to know
all of them.

**The solution.** `RideBookingFacade` builds the subsystems once, keeps them
private, and exposes a handful of methods. The UI says `bookRide(request)` and
knows nothing else. It is also the single seam where the other six patterns meet:
Factory makes the vehicle, Strategy prices it, Decorator wraps it, State runs it,
Observer tracks it, Adapter charges it.

**See it live.** Filter the console to *FACADE* and book. Two lines. Then clear
the filter to see everything those two lines set in motion.

---

## 8. Singleton — the log, and the session

Used twice, for two different reasons.

**`DispatchLog`** is the console. Seven files write to it and the UI reads from
it. If each module made its own with `new DispatchLog()`, the console would show
a fraction of what happened.

**`SessionManager`** is the account: who is signed in, the wallet balance, the
saved places, the trip history, the preferences. Nine screens read it, four write
it. Two instances would mean signing in on the login screen and still being a
stranger on the wallet screen.

Both use the same guard — a constructor that hands back the existing instance —
so `new SessionManager() === SessionManager.getInstance()` is true.

**See it live.** Book a ride, then open Activity and Wallet. The trip and the
debit are already there, because all three screens hold the same object.

---

## The city underneath it

None of this is a design pattern — it is the world the patterns operate on — but
it is what makes the app behave like a ride app rather than a diagram.

**The map is a road network, not a backdrop.** `geo.js` defines 32 named roads
(Outer Ring Road, PVNR Expressway, NH-44, Tank Bund Road, Attapur Road …) plus
Hussain Sagar, the Musi and three parks. Those polylines are cut into a planar
graph: every place two roads cross becomes a junction. That yields roughly 360
junctions and 500 links.

**Landmarks get access lanes.** The 29 pickup points are places a planner chose,
not junctions the grid happened to produce, so several land mid-block with one
way in and one way out — and a car leaving a dead end must drive back out the way
it came. That is how a 1.6 km hop across Banjara Hills once routed as a 12 km
loop. Real cities solve it with access lanes, and so does `_addAccessLanes()`:
every landmark is welded to its three nearest junctions, skipping any hop that
would cross the lake. Those lanes are then drawn on the map, because a route must
never run over ground with no road painted on it.

**Routes are searched, not drawn.** `buildRoute()` snaps both ends to the nearest
junction and runs Dijkstra across that graph. So a route bends through real
streets, the console can name them, and the lake has to be driven around rather
than through. The cost is mostly travel time with a distance term mixed in — on
pure travel time the router happily adds 20 km of expressway to save thirty
seconds, which is optimal on paper and absurd to the person paying by the
kilometre. All 812 place-to-place routes solve, none more than 2.6× the straight
line.

**The car drives; it does not slide.** `traffic.js` accelerates and brakes at
different rates, slows for sharp bends, moves at the speed the road class and its
congestion allow, and stops at red lights. The ETA is built from the harmonic
mean of the speeds still ahead plus the lights not yet sat at — averaging speeds
arithmetically quietly promises a trip nobody can drive, because one crawling
kilometre costs far more than one clear kilometre saves.

**Only the clock is compressed.** A 24 km airport run really does take about an
hour at these speeds, so the publisher measures the leg first and scales the demo
clock to finish it in a few seconds. The speedometer and the ETA stay honest;
only time runs fast.

---

## A ten-minute demo script

1. **Open the page.** Sign in with any number, or press *Skip*. Point at the
   console: it is already full — booting built six vehicles through the Factory
   and subscribed six Observers.
2. **Click SUV, then Bike.** Console prints
   `VehicleFactory.create("BIKE") -> new Bike`. Say: *the UI asked for a type,
   the factory decided the class.*
3. **Change the pricing rule to Surge ×1.8.** Same trip, same vehicle — the
   receipt rebuilds with different line items. Say: *one object was swapped; no
   calling code changed.*
4. **Tick Child seat and Pet friendly.** Two rows appear and the receipt header
   reads `SurgePricingFare x1.8 + ChildSeat + PetFriendly`. Say: *the calculator
   still thinks it holds one strategy.*
5. **Go to Offers and apply HYD20.** A third wrapper, this one negative. Say:
   *a promo code is an add-on with a minus sign — no special case anywhere.*
6. **Go to Wallet and pick RideFlow Wallet.** Point at the class name under each
   method: four adapters, one `pay()` call.
7. **Press Book ride, with the console filtered to FACADE.** Two lines. Then
   clear the filter and scroll back through what those two lines triggered.
8. **While the driver approaches, untick EtaPanelObserver.** The ETA freezes, the
   car keeps moving, the meter keeps counting.
9. **When the driver arrives**, read out the trip OTP and press Start ride.
   Say: *this whole step is one class that was added last.*
10. **Press Cancel during “Driver arriving”** — allowed, Rs.35. Book again and
    **wait for “Ride in progress”** — the button disables itself.
11. **Open Activity and Wallet.** The trip and the debit are already there. Say:
    *one SessionManager, read by every screen.*
12. **Open Patterns** for the real code behind each one.

---

## Questions you may be asked

**Why Factory and not just `new Bike()`?**
Because `new Bike()` scattered across the app means every screen must be edited
when a category is added. The factory makes that a one-line change in one file —
which is exactly what adding E-Rick and Prime cost.

**Is this Factory Method or Simple Factory?**
`VehicleFactory` is a **Simple Factory** with a registry — one static `create()`
returning different subclasses. Classic Factory Method puts creation in an
abstract method that subclasses override. Simple Factory fits here because the
app has one creator and only the product varies; a registry also means adding a
product needs no new subclass of the creator.

**Strategy and State look like the same UML. What is the difference?**
The structure is nearly identical; the *intent* differs. In Strategy the client
chooses the algorithm and the strategies do not know about each other — surge
pricing has never heard of night pricing. In State the objects know their
successors and change the context themselves — `ArrivingState` creates
`ArrivedState`. Strategy swaps *how* something is done; State tracks *where in a
lifecycle* something is.

**Decorator and Strategy also look alike. Why both?**
A Strategy *replaces* the algorithm; a Decorator *adds to* one. The give-away is
the field: `FareDecorator` holds a `FareStrategy` **and is one**, so it can wrap
a wrapper. You cannot stack strategies — setting a second one throws the first
away.

**Adapter and Decorator are both wrappers. What separates them?**
Intent again. A Decorator has the *same* interface as what it wraps and adds
behaviour. An Adapter has a *different* interface from what it wraps and changes
nothing but the shape of the call. `PetFriendlyAddOn` adds Rs.35; `UpiAdapter`
adds nothing at all — it just converts rupees to paise.

**Why is Observer better than calling the six updates directly?**
Because the GPS code would then depend on the map, the label, the meter, the
safety monitor, the logger and the push service. Here you can unsubscribe any of
them at runtime and nothing else breaks — which the direct-call version cannot do
at all.

**Does the Facade add anything, or is it just a wrapper?**
It is a wrapper, and that is the point: it owns the *order* of twelve steps and
the lifetime of seven subsystems. Without it that knowledge lives in a click
handler. It is also the single seam where the other six patterns meet.

**Where is the Singleton risk?**
Singletons are global state: they make unit tests share data between runs and
hide dependencies, because a class that calls `SessionManager.getInstance()`
never declares that it needs a session. Both uses here are defensible — a log and
a signed-in user genuinely must be one object per running app — but in a codebase
with tests you would more likely create one instance at startup and pass it in
(dependency injection), keeping “exactly one” without the global reach. The same
argument rules it out for things people reach for it too quickly, like a database
connection or a cache.

**Is any of this real?**
No. There is no server, no SMS, no payment rail and no money. The OTP is
generated in the browser and printed on screen; the “third-party SDKs” in
`adapter.js` are four stub classes written to have deliberately awkward
interfaces, which is what makes them worth adapting.

---

Built for a Design Patterns course. Everything runs client-side, no dependencies.
