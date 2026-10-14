# RideFlow — a ride-hailing app built on seven design patterns

A working ride-hailing web app — sign up with an OTP, pick from 29 places across
Hyderabad, choose a vehicle and extras, watch a driver take real roads to you,
pay, rate the trip, and find it waiting in your history — where **seven GoF
design patterns do the actual work**. It also fixes three problems real riders
on Uber, Ola and Rapido keep complaining about
(see [Real-world problems](#real-world-problems-this-app-solves)).

A dispatch console slides out from the right and prints a tagged line every time
a pattern executes, so the patterns are not just described: they are visible
while the app runs.

| Pattern | Category | Job in this app |
|---|---|---|
| **Factory** | Creational | Creates the six vehicle classes from a registry |
| **Strategy** | Behavioural | Swaps the fare-calculation rule at runtime (8 rules) |
| **Decorator** | Structural | Stacks extras and promo codes onto any fare, then wraps it in the legal surge cap |
| **Observer** | Behavioural | Broadcasts driver location to six subscribers, including a safety monitor |
| **State** | Behavioural | Runs the ride lifecycle, re-matching and fair cancellation |
| **Adapter** | Structural | Fits four incompatible payment SDKs behind one `pay()` |
| **Facade** | Structural | Hides the 12-step booking process behind one call |
| **Singleton** | Creational | The shared dispatch log, and the shared user session |

Everything is fake on purpose: no server, no network, no real money. It is a
college project for a Design Patterns course.

---

## How to run it

Double-click **`index.html`**. That is the whole setup — no install, no server,
no build step, no internet connection needed (fonts fall back gracefully offline).

On the sign-in screen choose **Sign in** or **Create account**, type any
10-digit number starting with 6–9, and the OTP is printed on screen. Or press
**Continue as a demo rider** to land in a furnished account straight away.

A flattened single-file copy for emailing or a USB stick lives at
**`dist/rideflow.html`**. Rebuild it after any edit with:

```
node build-single-file.js
```

Your account, wallet, saved places, trip history and settings are kept in
`localStorage`, so a refresh does not sign you out. **Profile → Erase demo data**
clears the lot.

---

## The screen

```
┌─────────────┬─────────────────────────────────────────────────────────┐
│ RideFlow    │  pattern chips         ▶ Guided demo  ▣ console  ☾  👤   │
├─────────────┼───────────────────────┬─────────────────────────────────┤
│ Book a ride │ Plan a ride│ Your trip │  Live map (Observer subject)    │
│ Activity    │                       │                                 │
│ Wallet      │  pickup / drop        ├─────────────────────────────────┤
│ Offers      │  choose a ride        │  Ride lifecycle (State)         │
│ Saved       │  extras, pricing,     ├─────────────────────────────────┤
│ Safety      │  payment, fare        │  GPS subscribers (tick/untick)  │
│ Profile     │  ───────────────────  │                                 │
│ Settings    │  Rs.366  [Book Sedan] │                                 │
│ How it works│                       │                                 │
└─────────────┴───────────────────────┴─────────────────────────────────┘
                 the console slides in from the right when you want it
```

- **The left sidebar** reaches all nine screens. The button at the top left
  collapses it to icons; on a phone it becomes a bottom tab bar.
- **The ride panel** works like a real ride app: *Plan a ride* (route, vehicle,
  extras, pricing rule, payment, fare breakdown, Book) switches to *Your trip*
  (driver, trip OTP, locked fare, cancel) the moment you book.
- **The console is hidden until you want it.** Open it from the top bar (a badge
  counts new lines) or press the <kbd>`</kbd> key. On a wide screen the app
  makes room for it; on a narrow one it slides over.
- **Light and dark themes**, from the sun/moon button or *Settings → Appearance*
  (System follows your device).
- **Prefer it to look like a plain ride app?** *Settings → Show pattern hints*
  hides every pattern tag and the chips in the top bar.

---

## The nine screens

| Screen | What it is | Pattern it shows off |
|---|---|---|
| **Sign in / Create account** | Phone → OTP → your details | Singleton (writes the session) |
| **Book a ride** | Route, vehicle, extras, pricing, payment, live map, lifecycle | Factory, Strategy, Decorator, Observer, State, Facade |
| **Activity** | Every past trip, receipts, ratings, re-book | Singleton |
| **Wallet** | Balance, top-ups, four payment methods, transactions | Adapter |
| **Offers** | Six promo codes, applied live to the fare | Decorator |
| **Saved** | Home / Work shortcuts, all 29 places by zone | Singleton |
| **Safety** | SOS, trusted contacts, flagged events | Observer |
| **Profile** | Account details, ride stats, sign out | Singleton |
| **Settings** | Theme, notifications, pattern hints, map traffic, demo speed | Singleton |
| **How it works** | Real-world problems, plus problem / solution / real code for all seven | — |

---

## Project structure

```
index.html                  every screen, plus the code samples in "How it works"
css/styles.css              all styling, light and dark
js/
  core/
    dispatchLog.js          SINGLETON  - the shared log every pattern writes to
    session.js              SINGLETON  - the shared account, wallet, saved places, history
    clock.js                the simulation clock - lets the guided demo slow or pause the ride
    geo.js                  the city: 29 places, roads, terrain, road graph, routing (helper)
    traffic.js              how a car drives it: speed, congestion, signals (helper)
    services.js             the subsystems the Facade hides, plus the 28-driver roster
  patterns/
    factory.js              FACTORY    - Vehicle + 6 concrete vehicles + VehicleFactory
    strategy.js             STRATEGY   - FareStrategy + 8 pricing rules + FareCalculator
    decorator.js            DECORATOR  - 5 extras + PromoCodeDecorator, FairInputGuard + SurgeCapGuard
    observer.js             OBSERVER   - DriverLocationPublisher + 6 observers
    state.js                STATE      - RideState + 8 states (incl. Arrived, Rematching) + Ride
    adapter.js              ADAPTER    - 3 foreign SDKs + PaymentMethod + 4 adapters
    facade.js               FACADE     - RideBookingFacade
  ui/
    router.js               screen switching, the modal sheet, formatting (helper)
    auth.js                 the sign-in / create-account flow (helper)
    screens.js              activity, wallet, offers, saved, safety, profile, settings
    tour.js                 the guided demo - narrates one complete ride
  app.js                    the booking screen, the map and boot - UI only
build-single-file.js        flattens everything into dist/ for sharing
```

**The most important thing to point out:** nothing in `js/ui/` or `app.js`
prices a ride, constructs a vehicle, decides what a ride may do next, or talks to
a payment provider. They call the Facade and render what comes back. That
separation is what the seven patterns bought.

---

## Real-world problems this app solves

Ride-hailing in India has three complaints that come up again and again in
consumer surveys, regulator notices and new government rules. Each one is fixed
here, each fix is built on a pattern, and each can be triggered from
**Your trip → Test a real-world problem** (*Driver cancels*, *Long stop*,
*Detour*).

| # | Problem riders report | Fix in RideFlow | Pattern |
|---|---|---|---|
| 1 | Driver cancels after accepting, or pressures the rider to cancel so the **rider** pays the fee | Ride goes to `RematchingState`: same fare, a different driver, Rs.0 for the rider, penalty on the driver. "The driver asked me to cancel" is a free cancel reason. | **State** |
| 2 | Fares you can't trust: 3x–4x festival surge, charges missing from the quote, an alleged iPhone-vs-Android price gap | Every pricing rule is wrapped in `FairInputGuard` + `SurgeCapGuard` (max 2x, min 50%). The upfront quote is the bill, even after a detour. | **Decorator** |
| 3 | Safety: no alert when the car leaves its route or stops for a long time | `SafetyMonitorObserver` asks "Are you okay?" and offers SOS | **Observer** |

**Where the problems come from** (secondary sources — news coverage of surveys
and notices, not the official documents themselves):

- **Cancellations.** A LocalCircles survey of ~33,000 app-cab users (Dec 2024)
  found 84% had been pushed into cancelling and 42% met charges not shown
  upfront. India's Central Consumer Protection Authority (CCPA) warned Uber and
  Ola about drivers forcing riders to cancel so the rider pays the charge.
- **Pricing.** CCPA sent notices to Ola and Uber in January 2025 over alleged
  different fares on iPhone and Android (Uber denied pricing by phone).
- **The rules.** The Motor Vehicle Aggregator Guidelines, 2025 (MoRTH) cap surge
  at 2x the base fare, set a floor of 50% off-peak, and set a cancellation
  penalty of 10% of the fare, capped at Rs.100, for drivers *and* riders.
- **Safety.** The National Commission for Women's guidelines for app cabs
  (October 2026) ask for route-deviation alerts, checks on prolonged stops and
  a working SOS.

**What this app can and can't show.** It is a simulation: there are no real
drivers, so a driver cancellation, a long stop and a detour are triggered by
buttons. What is real is the mechanism — the code that reacts is the same code a
real app would need.

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
else worked. Cost: one class each, plus one registry line each. *Choose a ride*
draws itself from `VehicleFactory.available()`, so both appeared on screen
without the UI being edited either.

---

## 2. Strategy — fare calculation

**The problem.** The same ride costs different amounts under standard, surge,
festival, night, subscriber, pool, airport and corporate rules. One
`calculateFare()` method grows an `if` branch per festival offer and never shrinks.

**The solution.** Each rule is its own class behind one method. `FareCalculator`
holds whichever one is active and can be handed a different one at runtime.

Note the seam between `lineItems()` and `calculate()`: a rule writes only *its*
rows, and the base class applies the platform fee and 5% GST the same way for
all of them. That seam is also what lets the Decorator bolt extras onto any rule
without the rule knowing.

**See it live.** Switch the pricing rule to *Surge ×1.8*. Same trip, same
vehicle — the fare breakdown rebuilds with different lines, and no calling code
changed.

---

## 3. Decorator — extras, promo codes, and the law

**The problem.** A rider wants a child seat **and** is carrying luggage **and**
has a promo code — on top of whichever pricing rule is running. Subclasses mean a
class per combination; flags mean the same `if` block copy-pasted into all eight
rules. And the 2025 surge cap applies to *every* rule, including next season's.

**The solution.** A decorator **is** a `FareStrategy` and **holds** a
`FareStrategy`. Two kinds are used:

- **Extras and promo codes** ask the thing they wrap for its rows, then append
  their own. A promo code is an extra with a negative charge — same base class,
  no special case.
- **Guards** wrap the whole stack and enforce a rule instead of adding a row.
  `FairInputGuard` strips everything but vehicle, distance and time (so no rule
  can price by phone model); `SurgeCapGuard` holds the ride price between 50%
  and 2x of the standard fare.

```js
let rule = new SurgePricingFare(3);
rule = new ChildSeatAddOn(rule);
rule = new PromoCodeDecorator(rule, { code: "HYD20", value: 20, cap: 80 });
rule = new FairInputGuard(new SurgeCapGuard(rule));

calculator.setStrategy(rule);     // it cannot tell the difference
```

**See it live.** Choose *Festival surge ×3*: the breakdown shows the rule asking
for 3x and `Surge capped at 2x (MoRTH 2025)` trimming it back. Tick *Child seat*
— one more row, outside the cap, and `FareCalculator` still thinks it holds one
plain strategy.

---

## 4. Observer — driver location updates

**The problem.** One fact — "the driver moved" — has to reach the map marker,
the ETA, the fare meter, the safety monitor, the trip log and the push service.
The naive version wires them all into the GPS code, which then breaks if any one
of them is removed.

**The solution.** `DriverLocationPublisher` keeps a list of subscribers and
announces its new position. It never learns who they are.

**The proof it pays.** `FareMeterObserver` and `SafetyMonitorObserver` were added
last. Each needed one `subscribe()` call; the GPS code was never opened. The
safety monitor flags speeding, a 3-minute unexplained stop, or 0.8 km off the
promised route, and asks the rider "Are you okay?".

**See it live.** Book a ride, then untick *EtaPanelObserver* under the map while
the car is moving. The ETA freezes, the car keeps driving, the meter keeps counting.

---

## 5. State — the ride lifecycle

**The problem.** A ride goes Requested → Assigned → Arriving → Waiting at pickup
→ In progress → Completed, and is cancellable from some of those but not all.
With a status flag, the same `if` ladder gets copy-pasted into `cancel()`,
`next()`, `canRate()` and every other method — and one missed branch is a bug.

**The solution.** Each stage is a class holding the behaviour legal at that
stage. `Ride.cancel()` is one line: `this.state.cancel(this, reason)`.
Delegation, not decision.

```
RequestedState ─▶ DriverAssignedState ─▶ ArrivingState ─▶ ArrivedState ─▶ InProgressState ─▶ CompletedState
  cancel: free      cancel: 10% (≤Rs.100)  cancel: 10%      cancel: 10%     cancel: REFUSED
       ▲                   │                    │               │
       │                   └──── driverCancel ──┴───────────────┘
       │                                  ▼
  RematchingState ◀──────── driver walked away (rider pays Rs.0, driver penalised)
    cancel: free
```

**The proof it pays.** `ArrivedState` (the driver waiting at the kerb with a trip
OTP) and `RematchingState` (the driver cancelled on you) were both added after
the app worked — one class each.

**See it live.** Cancel during *Driver arriving* and the app asks why. *I changed
my plans* costs 10% of the fare; *the driver asked me to* is free. Wait for
*Ride in progress* and the Cancel button disables itself, because
`InProgressState.canCancel` is false.

---

## 6. Adapter — payments

**The problem.** Four payment providers, four interfaces:

```js
upiSdk.collect("me@okhdfc", 24500)          // PAISE, not rupees
cardApi.authorise({ cardToken, amount })    // rupees, object arg, then capture()
walletLedger.debit(245)                     // throws if short
// cash has no SDK at all
```

**The solution.** Define the interface *we* want — `pay(rupees, rideId)` — and
write one small class per provider that translates. `PaymentGateway` holds a
`PaymentMethod` and calls `pay()`. It never learns that UPI counts in paise.

**See it live.** Spend the wallet below the fare and book anyway. The console
shows `ledger.debit()` throwing and `WalletAdapter` quietly falling back to UPI.

---

## 7. Facade — the booking process

**The problem.** "Book a ride" is one button on top of twelve steps across seven
subsystems, in a specific order.

**The solution.** `RideBookingFacade` builds the subsystems once, keeps them
private, and exposes a handful of methods. The UI says `bookRide(request)` and
knows nothing else. It is also the single seam where the other six patterns meet.

**See it live.** Open the console, filter to *FACADE* and book. Two lines. Then
clear the filter to see everything those two lines set in motion.

---

## 8. Singleton — the log, and the session

Used twice. **`DispatchLog`** is the console: every pattern writes to it and the
UI reads from it. **`SessionManager`** is the account: who is signed in, the
wallet, saved places, trip history and preferences — nine screens read it. Two
instances would mean signing in on one screen and still being a stranger on the
next. Both use the same guard, so `new SessionManager() === SessionManager.getInstance()`.

---

## Guided demo

**▶ Guided demo** (top bar) runs one complete ride, Kukatpally → RGIA Airport,
and explains it as it goes. It drives the app the way a person would — it picks
options and clicks the real buttons — so every console line is the real pattern
doing its real job. It opens the console drawer with a narration card on top.

| # | Stage | Pattern |
|---|---|---|
| 1 | Intro | — |
| 2 | One shared log | Singleton |
| 3 | Bike, then Sedan, built by the factory | Factory |
| 4 | Pricing rule swapped to Surge ×1.8 | Strategy |
| 5 | **Real problem #2:** Festival ×3 held to the legal 2x | Decorator |
| 6 | Book — one call | Facade |
| 7 | A driver accepts | State |
| 8 | **Real problem #1:** the driver cancels → `RematchingState`, rider pays Rs.0 | State |
| 9 | A new driver drives in, GPS to six subscribers | Observer |
| 10 | Driver at the kerb — trip OTP | State |
| 11 | Rider aboard — Cancel disables itself | State |
| 12 | **Real problem #3:** route detour → "Are you okay?" | Observer |
| 13 | Trip complete — charged the upfront fare | State, Adapter |
| 14 | Recap | — |

**Controls.** **Next** (or →) moves on, **Pause** (or P) freezes the whole
simulation, **Exit** (or Esc) stops the tour. The State timers and the GPS
stream ask `SimClock` (`js/core/clock.js`) for time instead of the browser, so
the tour can slow or pause the ride without any pattern knowing a demo is running.

---

## A ten-minute demo script

0. **Short on time?** Press **▶ Guided demo** and let it run.
1. **Sign in** with any number, or *Continue as a demo rider*. Open the console:
   booting built six vehicles through the Factory and subscribed six Observers.
2. **Click SUV, then Bike.** Console: `VehicleFactory.create("BIKE") -> new Bike`.
3. **Change the pricing rule to Surge ×1.8.** Same trip, new breakdown.
4. **Choose Festival ×3**, then tick *Child seat*. The cap line appears; the
   extra sits outside it.
5. **Offers → apply HYD20.** A promo is a decorator with a minus sign.
6. **Wallet → pick RideFlow Wallet.** Four adapters, one `pay()` call.
7. **Book, with the console filtered to FACADE.** Two lines.
8. **While the driver approaches, untick EtaPanelObserver.** The ETA freezes.
9. **Your trip → Test a real-world problem → Driver cancels.** `RematchingState`,
   same fare, Rs.0 for you.
10. **When the driver arrives**, read out the OTP and press Start ride.
11. **Press Detour** once the ride is in progress. "Are you okay?" appears.
12. **Open Activity and Wallet.** The trip and the charge are already there.
13. **How it works** for the real code behind each one.

---

## Questions you may be asked

**Is this Factory Method or Simple Factory?**
`VehicleFactory` is a **Simple Factory** with a registry — one static `create()`
returning different subclasses. Classic Factory Method puts creation in an
abstract method that subclasses override. Simple Factory fits because the app
has one creator and only the product varies.

**Strategy and State look like the same UML. What is the difference?**
Intent. In Strategy the client chooses the algorithm and the strategies do not
know each other. In State the objects know their successors and change the
context themselves — `ArrivingState` creates `ArrivedState`.

**Decorator and Strategy also look alike. Why both?**
A Strategy *replaces* the algorithm; a Decorator *adds to* or *constrains* one.
`FareDecorator` holds a `FareStrategy` **and is one**, so it can wrap a wrapper.
You cannot stack strategies.

**Why is the surge cap a Decorator and not another Strategy?**
A strategy *is* a pricing rule; the cap is a limit on all of them. As a strategy
it would replace the surge rule instead of constraining it.

**Adapter and Decorator are both wrappers. What separates them?**
A Decorator has the *same* interface as what it wraps and adds behaviour. An
Adapter has a *different* interface and changes nothing but the shape of the call.

**How does the app know a driver "really" cancelled?**
It doesn't — the button stands in for the driver's phone. What happens next is
real: the state machine decides who pays and who is matched.

**Where is the Singleton risk?**
Singletons are global state: they make tests share data and hide dependencies.
Both uses here are defensible — a log and a signed-in user genuinely must be one
object per running app — but in a codebase with tests you would more likely
create one instance at startup and pass it in.

---

Built for a Design Patterns course. Everything runs client-side, no dependencies.
