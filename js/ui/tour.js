/* ============================================================
   tour.js - THE GUIDED DEMO  (user interface only, not a pattern)
   ------------------------------------------------------------
   One button runs a complete ride, start to finish, and explains
   every stage as it happens: what is going on, which pattern is
   doing it, which file the code is in, and what to look at.

   It drives the app exactly the way a person would - it selects
   options and clicks the real buttons - so every console line is
   the real pattern doing its real job. Nothing is scripted around
   the app; the tour only decides WHEN to click and WHAT to say.

   While a stage is being read, the ride is held still (SimClock),
   so the car can never race ahead of the explanation.
   ============================================================ */

const TOUR_ROUTE = { pickup: "kukatpally", drop: "airport", vehicle: "SEDAN" };

/* ---------- small helpers: act like a user ---------- */

function tourSelect(id, value) {
  const el = $(id);
  el.value = value;
  el.dispatchEvent(new Event("change"));
}

function tourVehicle(code) {
  const card = [...document.querySelectorAll(".vcard")]
    .find((c) => c.querySelector(".vcard__name").textContent.toUpperCase() === code);
  if (card) card.click();
}

const rideKey = () => (ui.ride ? ui.ride.state.key : null);
const visible = (id) => !$(id).hidden;

/* ============================================================
   THE STAGES
   Each stage: what to say, where to point, which console tag to
   filter to, an optional action, and an optional condition to
   wait for before the reading time starts.
   ============================================================ */

const TOUR_STEPS = [
  {
    tag: "TOUR",
    title: "One ride, start to finish",
    focus: [".chiprack"],
    filter: "ALL",
    body: `I will book a <b>Sedan from Kukatpally to RGIA Airport</b> and press the real buttons
           for you. At every stage this card explains what is happening, which design pattern is
           doing the work, and which file the code lives in.`,
    notice: [
      "The <b>amber glow</b> shows where to look.",
      "The <b>console</b> is filtered to the lines of the pattern being explained.",
      "The ride <b>holds still while you read</b>. Next moves on, Pause freezes everything, Exit stops the tour.",
    ],
    read: 9000,
    async run(t) {
      $("btnClear").click();
      tourSelect("pickup", TOUR_ROUTE.pickup);
      tourSelect("drop", TOUR_ROUTE.drop);
      tourSelect("strategy", "STANDARD");
    },
  },

  {
    tag: "SINGLETON",
    title: "One shared log for the whole app",
    file: "js/core/dispatchLog.js",
    focus: [".term"],
    filter: "ALL",
    body: `Every line in this console is written by a different file - the factory, the pricing
           rules, the GPS publisher, the ride states - yet they all land in <b>one list</b>.
           That works because <code>DispatchLog.getInstance()</code> always returns the same object.`,
    notice: [
      "The coloured tag on each line names the pattern that wrote it.",
      "If each file made its own log, this console would show only a fraction of what happened.",
    ],
  },

  {
    tag: "FACTORY",
    title: "Choosing a vehicle - the Factory builds it",
    file: "js/patterns/factory.js",
    focus: ["#vehicles"],
    filter: "FACTORY",
    body: `I click <b>Bike</b>, then <b>Sedan</b>. Each click asks
           <code>VehicleFactory.create("SEDAN")</code> for a vehicle; the factory looks the type up in
           its registry and returns a new <code>SedanCab</code> carrying its own base fare, per-km and
           per-minute rates. The screen never writes <code>new SedanCab()</code> itself.`,
    notice: [
      "Console: <code>VehicleFactory.create(\"BIKE\") -&gt; new Bike</code>, then the Sedan.",
      "Adding an e-rickshaw = one new class + one registry line. The picker updates by itself.",
    ],
    async run(t) {
      tourVehicle("BIKE");
      await t.sleep(1400);
      tourVehicle("SEDAN");
    },
  },

  {
    tag: "STRATEGY",
    title: "Changing the pricing rule - Strategy",
    file: "js/patterns/strategy.js",
    focus: ["#strategy", ".receipt"],
    filter: "STRATEGY",
    body: `Same trip, same car - I switch the pricing rule to <b>Surge ×1.8</b>. The dropdown calls
           <code>facade.useFareStrategy("SURGE")</code>, which hands the <code>FareCalculator</code> a
           new <code>SurgePricingFare</code> object. The calculator contains no if-else about pricing:
           it simply calls <code>strategy.calculate(trip)</code> on whatever rule it holds.`,
    notice: [
      "The receipt rebuilt itself with a red surge line.",
      "Console: <code>Pricing rule swapped: StandardFare -&gt; SurgePricingFare x1.8</code>.",
    ],
    async run(t) {
      await t.sleep(600);
      tourSelect("strategy", "SURGE");
    },
  },

  {
    tag: "DECORATOR",
    title: "Real problem #2 - unfair fares, fixed by Decorator",
    file: "js/patterns/decorator.js",
    focus: [".receipt"],
    filter: "DECORATOR",
    problem: "Riders report 3x-4x festival surges and an alleged iPhone-vs-Android price gap. The 2025 guidelines cap surge at 2x.",
    body: `Now <b>Festival surge ×3</b>. The rule asks for three times the normal price, but every rule
           is wrapped in two decorators before it reaches you. <code>FairInputGuard</code> strips your
           <b>device type</b> from the pricing input, so no rule can charge by phone.
           <code>SurgeCapGuard</code> then cuts the fare to the <b>legal 2x</b>.`,
    notice: [
      "Green line on the receipt: <b>Surge capped at 2x (MoRTH 2025)</b>.",
      "Receipt header: <i>guarded by FairInputGuard › SurgeCapGuard</i>.",
      "The surge rule itself was not edited - it was <b>wrapped</b>.",
    ],
    async run(t) {
      await t.sleep(600);
      tourSelect("strategy", "FESTIVAL");
    },
  },

  {
    tag: "FACADE",
    title: "Booking - one call behind one button (Facade)",
    file: "js/patterns/facade.js",
    focus: ["#btnBook", ".receipt"],
    filter: "FACADE",
    dock: "left",                        // keep the two FACADE console lines in view
    body: () => `Back to the standard fare, and I press <b>Book ride</b>. The button makes one call,
           <code>facade.bookRide()</code>. Behind it the facade builds the vehicle (Factory), routes and
           prices the trip (Strategy + Decorator guards), creates the <code>Ride</code>, connects the GPS
           publisher (Observer) and starts the state machine (State).
           Your fare is now <b>locked at Rs.${ui.ride ? ui.ride.quote.total : "-"}</b>.`,
    notice: [
      "Filtered to FACADE the console shows just two lines - everything else was set off by them.",
      "The button knows nothing about the five subsystems or the order to call them in.",
    ],
    async run(t) {
      tourSelect("strategy", "STANDARD");
      await t.sleep(1200);
      $("btnBook").click();
    },
    waitFor: () => rideKey() !== null,
  },

  {
    tag: "STATE",
    title: "A driver accepts - the State machine moves on",
    file: "js/patterns/state.js",
    focus: ["#lifecycle", "#driverCard"],
    filter: "STATE",
    body: () => `The ride holds a <b>state object</b>. <code>RequestedState</code> waited while matching ran,
           then <code>DriverMatchingService</code> found <b>${ui.ride && ui.ride.driver ? ui.ride.driver.name : "a driver"}</b>
           and the ride moved to <code>DriverAssignedState</code>. The route to you is planned from where
           <i>this</i> driver is actually parked.`,
    notice: [
      "The grey label on the right of each row is the <b>real class</b> the ride is holding.",
      "The ride never asks \"what status am I in?\" - each state decides what comes next.",
    ],
    waitFor: () => rideKey() === "DriverAssignedState",
  },

  {
    tag: "STATE",
    title: "Real problem #1 - the driver cancels on you",
    file: "js/patterns/state.js",
    focus: ["#rematchNote", "#lifecycle"],
    filter: "STATE",
    problem: "84% of app-cab users have been pushed into cancelling, so the rider paid the fee (LocalCircles survey).",
    body: () => `The driver was on the way - and just <b>cancelled</b>. In most apps your ride dies here.
           In this one the state machine moved to a new state, <code>RematchingState</code>: the driver is
           penalised (10% of the fare, max Rs.100), <b>you pay Rs.0</b>, and the fare stays
           <b>locked at Rs.${ui.ride ? ui.ride.quote.total : "-"}</b> while a different driver is found.`,
    notice: [
      "Row 1 now reads <b>RematchingState</b>.",
      "The driver who cancelled is excluded from the next match.",
      "Adding this whole stage took <b>one new class</b>.",
    ],
    async run(t) {
      await t.until(() => rideKey() === "ArrivingState");
      await t.sleep(2600);                       // let the car visibly set off first
      if (!$("btnDriverCancel").disabled) $("btnDriverCancel").click();
    },
    waitFor: () => rideKey() === "RematchingState",
  },

  {
    tag: "OBSERVER",
    title: "The new driver drives in - Observer broadcasts GPS",
    file: "js/patterns/observer.js",
    focus: ["#map", "#observers"],
    filter: "OBSERVER",
    body: () => `<b>${ui.ride && ui.ride.driver ? ui.ride.driver.name : "A new driver"}</b> accepted and is driving in
           from their own street. Their phone is the <b>Subject</b>: <code>DriverLocationPublisher</code>
           sends a GPS fix about 12 times a second to <b>five subscribers</b> - the map marker, the ETA panel,
           the trip log, push notifications and the safety monitor.`,
    notice: [
      "The publisher never learns who is listening.",
      "Untick any subscriber box and only that one goes quiet - try EtaPanelObserver after the tour.",
      "Push alerts (\"5 minutes away\") are just another subscriber.",
    ],
    async run(t) {
      await t.until(() => rideKey() === "ArrivingState");
      await t.sleep(2600);
    },
  },

  {
    tag: "STATE",
    title: "You're in the car - cancelling is now refused",
    file: "js/patterns/state.js",
    focus: ["#lifecycle", "#btnCancel"],
    filter: "STATE",
    body: `The driver reached you and <code>ArrivingState</code> handed over to
           <code>InProgressState</code>. Its <code>canCancel</code> is <b>false</b>, so the Cancel
           button disabled itself - the button has no rules of its own, it asks the state. From
           here on the safety monitor is watching, because the rider is aboard.`,
    notice: [
      "Cancel ride and Driver cancels are both greyed out now.",
      "Unexpected stop and Route detour became available.",
    ],
    waitFor: () => rideKey() === "InProgressState",
  },

  {
    tag: "OBSERVER",
    title: "Real problem #3 - the car leaves the route",
    file: "js/patterns/observer.js",
    focus: ["#map", "#safetyCard"],
    filter: "OBSERVER",
    problem: "The NCW's 2026 guidelines ask app cabs for route-deviation alerts and checks on long stops.",
    body: `The driver turned off the planned <b>blue</b> route onto the <b>red dashed</b> one.
           <code>SafetyMonitorObserver</code> compares every GPS fix with the route you were promised; at
           <b>0.8 km off</b> it raised <b>"Are you okay?"</b> with an SOS button that would send the car
           details and live location to 112 and your emergency contact.`,
    notice: [
      "Console: <b>DETOUR ALERT</b> from SafetyMonitorObserver.",
      "The publisher and the other four observers did not change by a line to add this.",
      "I will answer \"I'm okay\" for you when this card moves on.",
    ],
    async run(t) {
      await t.sleep(2600);
      if (!$("btnDetour").disabled) $("btnDetour").click();
    },
    waitFor: () => visible("safetyCard"),
  },

  {
    tag: "STATE",
    title: "Trip complete - you pay the upfront fare",
    file: "js/patterns/state.js",
    focus: ["#lifecycle", ".receipt"],
    filter: "ALL",
    body: () => `I answered <b>I'm okay</b> and the trip finished. <code>CompletedState</code> charged
           <b>Rs.${ui.ride ? ui.ride.quote.total : "-"}</b> - exactly the fare quoted before booking -
           even though the detour added <b>${ui.ride ? ui.ride.detourKm : 0} km</b>.
           The quote is the bill.`,
    notice: [
      "Console: <b>one</b> PaymentGateway charge - the fare. No cancellation fee, because the driver cancelled, not you.",
      "Console: the cancelling driver's penalty is on record, and the detour is noted at completion.",
    ],
    async run(t) {
      if (visible("safetyCard")) $("btnSafeOk").click();
    },
    waitFor: () => rideKey() === "CompletedState",
  },

  {
    tag: "TOUR",
    title: "What you just watched",
    focus: [],
    filter: "ALL",
    final: true,
    body: `<table class="tour__recap">
             <tr><td>Singleton</td><td>one shared log for every line in the console</td></tr>
             <tr><td>Factory</td><td>built the Bike and the Sedan</td></tr>
             <tr><td>Strategy</td><td>swapped the pricing rule live</td></tr>
             <tr><td>Decorator</td><td>held a 3x festival surge to the legal 2x</td></tr>
             <tr><td>Facade</td><td>turned "Book ride" into one call</td></tr>
             <tr><td>State</td><td>ran the lifecycle and re-matched after a driver cancelled</td></tr>
             <tr><td>Observer</td><td>moved the car and caught the detour</td></tr>
           </table>`,
    notice: [
      "Try it yourself: Cancel during <i>Driver arriving</i> and pick <i>The driver asked me to cancel</i> - free.",
      "Try <b>Unexpected stop</b> during a trip for the long-stop alert and SOS.",
    ],
  },
];

/* ============================================================
   THE ENGINE
   ============================================================ */

const Tour = {
  running: false,
  userPaused: false,
  frozen: false,
  skip: false,
  aborted: false,

  /** The ride stands still if the user paused OR a stage is being read. */
  syncClock() {
    SimClock.paused = this.userPaused || this.frozen;
  },

  /* ---- waiting that respects Pause and Exit ---- */

  tick() {
    if (this.aborted) throw new Error("tour-exit");
    return new Promise((r) => setTimeout(r, 100));
  },

  async sleep(ms) {
    let left = ms;
    while (left > 0) { await this.tick(); if (!this.userPaused) left -= 100; }
  },

  async read(ms) {
    let left = ms;
    this.skip = false;
    while (left > 0 && !this.skip) { await this.tick(); if (!this.userPaused) left -= 100; }
  },

  async until(cond, ms = 120000) {
    let left = ms;
    while (!cond()) {
      if (left <= 0) throw new Error("tour-timeout");
      if (ui.ride && ui.ride.state.key === "CancelledState") throw new Error("tour-cancelled");
      await this.tick();
      if (!this.userPaused) left -= 100;
    }
  },

  /* ---- start / stop ---- */

  async start() {
    if (this.running) return;
    if (ui.ride && !ui.ride.state.isFinal) return;
    this.running = true;
    this.aborted = false;
    this.userPaused = false;
    this.frozen = false;
    SimClock.rate = 0.7;                 // a little slower than normal, for watching
    this.syncClock();
    document.body.classList.add("is-touring");
    $("tour").hidden = false;
    $("btnTour").disabled = true;

    try {
      for (let i = 0; i < TOUR_STEPS.length; i++) {
        const step = TOUR_STEPS[i];
        this.render(step, i, "working");
        if (step.run) await step.run(this);
        if (step.waitFor) await this.until(step.waitFor);
        this.frozen = !step.final;       // hold the ride while this stage is read
        this.syncClock();
        this.render(step, i, "reading");
        if (step.final) break;
        await this.read(step.read || 11000);
        this.frozen = false;
        this.syncClock();
      }
    } catch (e) {
      if (e.message !== "tour-exit" && !this.aborted) {
        this.renderStopped(e.message === "tour-cancelled"
          ? "The ride was cancelled outside the tour, so the walkthrough stopped here."
          : "The ride didn't reach the next stage in time, so the walkthrough stopped here.");
      }
    }
    this.finish(false);
  },

  /** Restore everything the tour changed. `closeCard` hides the narration. */
  finish(closeCard) {
    this.frozen = false;
    this.userPaused = false;
    SimClock.rate = 1;
    this.syncClock();
    this.running = false;
    document.body.classList.remove("is-touring");
    document.querySelectorAll(".tour-focus").forEach((n) => n.classList.remove("tour-focus"));
    applyFilter("ALL");
    $("btnTour").disabled = !!(ui.ride && !ui.ride.state.isFinal);
    $("tourPause").hidden = true;
    $("tourNext").hidden = true;
    $("tourExit").textContent = "Close";
    if (closeCard) $("tour").hidden = true;
  },

  exit() {
    if (!this.running) { this.finish(true); return; }
    // Stop the loop; it cleans up (finish) itself within a tick, so a
    // quick restart can never run two tours at once.
    this.aborted = true;
    this.frozen = false;
    this.userPaused = false;
    this.syncClock();
    $("tour").hidden = true;
  },

  togglePause() {
    this.userPaused = !this.userPaused;
    this.syncClock();
    $("tourPause").textContent = this.userPaused ? "Resume" : "Pause";
    $("tour").classList.toggle("is-paused", this.userPaused);
  },

  /* ---- drawing the card ---- */

  render(step, i, phase) {
    const body = typeof step.body === "function" ? step.body() : step.body;
    const total = TOUR_STEPS.length;

    $("tourCount").textContent = "Step " + (i + 1) + " of " + total;
    $("tourTag").textContent = step.tag;
    $("tourTag").className = "tour__tag logline__tag tag-" + step.tag;
    $("tourTitle").textContent = step.title;
    $("tourProblem").hidden = !step.problem;
    $("tourProblem").innerHTML = step.problem ? "<b>The problem:</b> " + step.problem : "";
    $("tourBody").innerHTML = body;
    $("tourNotice").innerHTML = (step.notice || []).map((n) => "<li>" + n + "</li>").join("");
    $("tourFile").hidden = !step.file;
    $("tourFile").innerHTML = step.file ? "Code: <code>" + step.file + "</code>" : "";
    $("tourBar").style.width = ((i + (phase === "reading" ? 1 : 0.5)) / total) * 100 + "%";

    const status = $("tourStatus");
    status.textContent = step.final ? "Tour complete"
      : phase === "working" ? "Working - watch the highlighted area…"
      : ui.ride && !ui.ride.state.isFinal ? "Ride held while you read · Next to continue"
      : "Reading time · Next to continue";
    status.dataset.phase = step.final ? "done" : phase;

    $("tourPause").hidden = !!step.final;
    $("tourNext").hidden = !!step.final;
    $("tourNext").disabled = phase !== "reading";
    $("tourExit").textContent = step.final ? "Close" : "Exit";

    // Point at the part of the app this stage is about.
    if (phase === "working" || step.final) {
      document.querySelectorAll(".tour-focus").forEach((n) => n.classList.remove("tour-focus"));
      const nodes = step.focus.map((sel) => document.querySelector(sel)).filter(Boolean);
      nodes.forEach((n) => n.classList.add("tour-focus"));
      if (nodes[0]) {
        // On a phone the card covers the bottom half, so park the highlight at the top.
        const phone = window.innerWidth <= 640;
        nodes[0].scrollIntoView({ behavior: "smooth", block: phone ? "start" : "center" });
        // Dock the card on the opposite side, so it never covers what it explains.
        const r = nodes[0].getBoundingClientRect();
        $("tour").dataset.side = step.dock || (r.left + r.width / 2 > window.innerWidth / 2 ? "left" : "right");
      }
      applyFilter(step.filter || "ALL");
    }
  },

  renderStopped(text) {
    $("tourTitle").textContent = "Walkthrough stopped";
    $("tourProblem").hidden = true;
    $("tourBody").textContent = text;
    $("tourNotice").innerHTML = "<li>Press <b>Guided demo</b> again once no ride is active.</li>";
    $("tourFile").hidden = true;
    $("tourStatus").textContent = "Stopped";
    $("tourStatus").dataset.phase = "done";
  },
};

document.addEventListener("DOMContentLoaded", () => {
  $("btnTour").addEventListener("click", () => Tour.start());
  $("tourPause").addEventListener("click", () => Tour.togglePause());
  $("tourNext").addEventListener("click", () => { Tour.skip = true; });
  $("tourExit").addEventListener("click", () => Tour.exit());
});
