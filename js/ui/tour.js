/* ============================================================
   tour.js - THE GUIDED DEMO  (user interface only, not a pattern)
   ------------------------------------------------------------
   One button runs a complete ride, start to finish, and explains
   every stage as it happens: what is going on, which pattern is
   doing it, which file the code is in, and what to look at.

   It drives the app exactly the way a person would - it selects
   options and clicks the real buttons - so every console line is
   the real pattern doing its real job. The tour only decides WHEN
   to click and WHAT to say.

   Pace: each stage stays up only as long as its text needs (with a
   countdown), the dull part of the drive is fast-forwarded, and the
   ride is held still only where it must not run ahead of the words.
   ============================================================ */

const TOUR_ROUTE = { pickup: "kukatpally", drop: "airport", vehicle: "SEDAN" };
const TOUR_RATE = 1;          // normal speed while you watch
const TOUR_FAST = 3;          // fast-forward while waiting for the next moment

/* ---------- small helpers: act like a user ---------- */

function tourSelect(id, value) {
  const el = $(id);
  el.value = value;
  el.dispatchEvent(new Event("change"));
}

function tourVehicle(code) {
  const row = document.querySelector('.vrow[data-veh="' + code + '"]');
  if (row) row.click();
}

const rideKey = () => (ui.ride ? ui.ride.state.key : null);
const visible = (id) => !$(id).hidden;
const fare = () => (ui.ride ? "Rs." + ui.ride.quote.total : "-");
const driverName = (fallback) => (ui.ride && ui.ride.driver ? ui.ride.driver.name : fallback);

/* ============================================================
   THE STAGES
   tag/title/body/look/file    what the card says (file = hover the tag)
   problem                     the real-world problem (fix stages)
   view                        which tab of the ride sheet to show
   focusFirst / focus          what glows while working / reading
   filter                      the console tag to show
   run(t)                      the clicks for this stage
   waitFor()                   the moment to wait for (fast-forwarded)
   hold                        keep the ride still while this is read
   ============================================================ */

const TOUR_STEPS = [
  {
    tag: "TOUR",
    title: "One ride, start to finish",
    view: "plan",
    focus: [".chiprack"],
    filter: "ALL",
    body: `I'll book <b>Kukatpally &rarr; RGIA Airport</b> by pressing the real buttons, one stage at a time.`,
    look: "The outlined part is what each stage is about.",
    async run() {
      $("btnClear").click();
      document.querySelectorAll("[data-addon]:checked").forEach((c) => c.click());
      tourSelect("pickup", TOUR_ROUTE.pickup);
      tourSelect("drop", TOUR_ROUTE.drop);
      tourSelect("strategy", "STANDARD");
    },
  },

  {
    tag: "SINGLETON",
    title: "One shared log",
    file: "js/core/dispatchLog.js",
    focus: ["#term"],
    filter: "ALL",
    body: `Every pattern writes to the same console: <code>DispatchLog.getInstance()</code> always returns one object.`,
    look: "Each line's tag names the pattern that wrote it.",
  },

  {
    tag: "FACTORY",
    title: "Pick a car",
    file: "js/patterns/factory.js",
    view: "plan",
    focus: ["#vehicles", "#term"],
    filter: "FACTORY",
    body: `Each tap asks <code>VehicleFactory.create()</code> for a car. The screen never says <code>new</code>.`,
    look: `Console: <code>create("SEDAN") &rarr; new SedanCab</code>`,
    async run(t) {
      tourVehicle("BIKE");
      await t.sleep(900);
      tourVehicle("SEDAN");
    },
  },

  {
    tag: "STRATEGY",
    title: "Change the price rule",
    file: "js/patterns/strategy.js",
    view: "plan",
    focus: ["#strategy", "#receipt"],
    filter: "STRATEGY",
    body: `<b>Surge &times;1.8</b> swaps in a new pricing object; the calculator just calls <code>calculate()</code>.`,
    look: "Receipt: a red surge line appears.",
    async run(t) {
      await t.sleep(400);
      tourSelect("strategy", "SURGE");
    },
  },

  {
    tag: "DECORATOR",
    title: "Problem 2: unfair fares",
    file: "js/patterns/decorator.js",
    view: "plan",
    focus: ["#receipt"],
    filter: "DECORATOR",
    problem: "3&ndash;4&times; festival surges; claims of prices set by phone model.",
    body: `<b>Fix:</b> two wrappers drop your device type and cap surge at the <b>legal 2&times;</b>.`,
    look: `Receipt: green &ldquo;Surge capped at 2x&rdquo; line.`,
    async run(t) {
      await t.sleep(400);
      tourSelect("strategy", "FESTIVAL");
    },
  },

  {
    tag: "FACADE",
    title: "Book with one call",
    file: "js/patterns/facade.js",
    view: "plan",
    focusFirst: ["#btnBook"],
    focus: ["#tripFare", "#term"],
    filter: "FACADE",
    hold: true,
    body: () => `<code>facade.bookRide()</code> runs all seven booking steps. Fare locked at <b>${fare()}</b>.`,
    look: "Console: just two FACADE lines.",
    async run(t) {
      tourSelect("strategy", "STANDARD");
      await t.sleep(900);
      $("btnBook").click();
    },
    waitFor: () => rideKey() !== null && !ui.ride.state.isFinal,
  },

  {
    tag: "STATE",
    title: "A driver accepts",
    file: "js/patterns/state.js",
    view: "trip",
    focus: ["#lifeCard", "#driverCard"],
    filter: "STATE",
    hold: true,
    body: () => `The ride swaps its state object: <b>${driverName("a driver")}</b> is assigned, so it now holds <code>DriverAssignedState</code>.`,
    look: "Trip progress names the class the ride now holds.",
    waitFor: () => rideKey() === "DriverAssignedState",
  },

  {
    tag: "STATE",
    title: "Problem 1: the driver cancels",
    file: "js/patterns/state.js",
    view: "trip",
    focus: ["#rematchNote", "#lifeCard"],
    filter: "STATE",
    hold: true,
    problem: "84% of riders were pushed into cancelling &mdash; and paid the fee.",
    body: () => `<b>Fix:</b> a new <code>RematchingState</code> finds another driver. You pay <b>Rs.0</b>; the fare stays <b>${fare()}</b>.`,
    look: "Trip progress (top right) now reads RematchingState.",
    async run(t) {
      await t.until(() => rideKey() === "ArrivingState");
      await t.sleep(1300);                      // let the car visibly set off first
      if (!$("btnDriverCancel").disabled) $("btnDriverCancel").click();
    },
    waitFor: () => rideKey() === "RematchingState",
  },

  {
    tag: "OBSERVER",
    title: "The new driver drives in",
    file: "js/patterns/observer.js",
    view: "trip",
    focus: ["#mapCard", "#obsPanel"],
    filter: "OBSERVER",
    body: () => `${driverName("The driver")}'s phone sends ~12 GPS updates a second to <b>6 subscribers</b> that never know about each other.`,
    look: "The car moves; untick a subscriber later to silence just that one.",
    async run(t) {
      await t.until(() => rideKey() === "ArrivingState");
      await t.sleep(700);
    },
  },

  {
    tag: "STATE",
    title: "Your driver is at the kerb",
    file: "js/patterns/state.js",
    view: "trip",
    focus: ["#otpCard", "#lifeCard"],
    filter: "STATE",
    hold: true,
    body: `<code>ArrivedState</code> issued a trip OTP; the ride can't start until you share it. This whole step was one class, added last.`,
    look: "The four digits on the Trip tab. I'll press Start ride next.",
    waitFor: () => rideKey() === "ArrivedState",
  },

  {
    tag: "STATE",
    title: "You're aboard",
    file: "js/patterns/state.js",
    view: "trip",
    focus: ["#lifeCard", "#btnCancel"],
    filter: "STATE",
    hold: true,
    body: `<code>InProgressState</code> says <code>canCancel</code> is false, so the Cancel button disables itself.`,
    look: "Cancel is now greyed out.",
    async run() {
      if (rideKey() === "ArrivedState") $("btnStart").click();
    },
    waitFor: () => rideKey() === "InProgressState",
  },

  {
    tag: "OBSERVER",
    title: "Problem 3: the car leaves the route",
    file: "js/patterns/observer.js",
    view: "trip",
    focus: ["#mapCard", "#term"],
    filter: "OBSERVER",
    hold: true,
    problem: "No alert when a cab strays from its route (NCW, 2026).",
    body: `<b>Fix:</b> one more subscriber, <code>SafetyMonitorObserver</code>, saw the red detour and asked <b>&ldquo;Are you okay?&rdquo;</b>`,
    look: "Console: DETOUR ALERT. I'll answer “I'm okay” next.",
    async run(t) {
      await t.sleep(1200);
      if (!$("btnDetour").disabled) $("btnDetour").click();
    },
    waitFor: () => visible("safetyCard"),
  },

  {
    tag: "STATE",
    title: "Trip done",
    file: "js/patterns/state.js",
    view: "trip",
    focus: ["#tripFare", "#lifeCard", "#term"],
    filter: "ALL",
    body: () => `<code>CompletedState</code> charged <b>${fare()}</b> through the payment <b>Adapter</b> &mdash; the quoted fare, even after the ${ui.ride ? ui.ride.detourKm : 0} km detour.`,
    look: "Console: one charge, and no cancellation fee for you. The trip is already in Activity.",
    async run() {
      if (visible("safetyCard")) $("btnSafeOk").click();
    },
    waitFor: () => rideKey() === "CompletedState",
  },

  {
    tag: "TOUR",
    title: "What you just saw",
    focus: [],
    filter: "ALL",
    final: true,
    body: `<dl class="tour__recap">
             <dt>Singleton</dt><dd>one shared log</dd>
             <dt>Factory</dt><dd>built the cars</dd>
             <dt>Strategy</dt><dd>swapped the price rule</dd>
             <dt>Decorator</dt><dd>capped the surge at 2&times;</dd>
             <dt>Facade</dt><dd>booked in one call</dd>
             <dt>State</dt><dd>ran the ride, re-matched it</dd>
             <dt>Observer</dt><dd>moved the car, caught the detour</dd>
             <dt>Adapter</dt><dd>charged the fare</dd>
           </dl>`,
    look: `Try it yourself: Cancel &rarr; &ldquo;The driver asked me to&rdquo; is free.`,
  },
];

/** How each tag is shown on the card. */
const TOUR_LABEL = {
  TOUR: "Guided demo", SINGLETON: "Singleton", FACTORY: "Factory", STRATEGY: "Strategy",
  DECORATOR: "Decorator", FACADE: "Facade", STATE: "State", OBSERVER: "Observer", ADAPTER: "Adapter",
};

/* ============================================================
   THE ENGINE
   ============================================================ */

const Tour = {
  running: false,
  userPaused: false,
  frozen: false,
  skip: false,
  aborted: false,
  step: null,

  /** The ride stands still if the user paused OR a stage asked to hold it. */
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

  /** Reading time, with a countdown bar. Next ends it early. */
  async read(ms) {
    let left = ms;
    this.skip = false;
    while (left > 0 && !this.skip) {
      $("tourTimer").style.width = (left / ms) * 100 + "%";   // Next empties as time runs out
      await this.tick();
      if (!this.userPaused) left -= 100;
    }
  },

  /** Wait for a moment in the ride - fast-forwarding the drive meanwhile. */
  async until(cond, ms = 90000) {
    let left = ms;
    const ride = ui.ride && !ui.ride.state.isFinal;
    if (ride) {
      SimClock.rate = TOUR_FAST;
      $("tourNextLbl").textContent = "\u23E9 Skipping ahead";
      $("tourStatusText").textContent = "Fast-forwarding to the next moment";
    }
    try {
      while (!cond()) {
        if (left <= 0) throw new Error("tour-timeout");
        if (ui.ride && ui.ride.state.key === "CancelledState") throw new Error("tour-cancelled");
        await this.tick();
        if (!this.userPaused) left -= 100;
      }
    } finally {
      SimClock.rate = TOUR_RATE;
      if (ride) $("tourNextLbl").textContent = "Working\u2026";
    }
  },

  /** How long a stage stays up: enough to read it, not a second more. */
  readTime(step) {
    const text = [typeof step.body === "function" ? step.body() : step.body, step.problem || "", step.look || ""]
      .join(" ").replace(/<[^>]+>/g, " ");
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(3500, Math.min(6500, 1800 + words * 90));
  },

  /* ---- start / stop ---- */

  async start() {
    if (this.running) return;
    if (ui.ride && !ui.ride.state.isFinal) return;
    this.running = true;
    this.aborted = false;
    this.userPaused = false;
    this.frozen = false;
    SimClock.rate = TOUR_RATE;
    this.syncClock();
    document.body.classList.add("is-touring");
    if (typeof Sheet !== "undefined") Sheet.close();
    router.go("home");
    toggleDock(true);
    $("tour").hidden = false;
    $("tour").classList.remove("is-paused");
    $("tourPause").textContent = "Pause";
    $("btnTour").disabled = true;

    try {
      for (let i = 0; i < TOUR_STEPS.length; i++) {
        const step = TOUR_STEPS[i];
        this.step = step;
        if (step.view) setView(step.view);
        this.render(step, i, "working");
        if (step.run) await step.run(this);
        if (step.waitFor) await this.until(step.waitFor);
        this.frozen = !!step.hold && !step.final;
        this.syncClock();
        this.render(step, i, step.final ? "done" : "reading");
        if (step.final) break;
        await this.read(this.readTime(step));
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
    this.step = null;
    document.querySelectorAll(".tour-focus").forEach((n) => n.classList.remove("tour-focus"));
    document.querySelectorAll(".is-dim").forEach((n) => n.classList.remove("is-dim"));
    document.querySelectorAll(".pchip.is-current").forEach((n) => n.classList.remove("is-current"));
    toggleSubs(false);
    applyFilter("ALL");
    $("btnTour").disabled = !!(ui.ride && !ui.ride.state.isFinal);
    $("tourPause").hidden = true;
    $("tourNext").hidden = true;
    $("tourRestart").hidden = false;
    $("tourExit").textContent = "Close";
    $("tour").classList.remove("is-paused");
    if (closeCard) this.close();
  },

  close() {
    $("tour").hidden = true;
    document.body.classList.remove("is-touring");
  },

  exit() {
    if (!this.running) { this.finish(true); return; }
    // Stop the loop; it cleans up (finish) itself within a tick, so a
    // quick restart can never run two tours at once.
    this.aborted = true;
    this.frozen = false;
    this.userPaused = false;
    SimClock.rate = 1;
    this.syncClock();
    this.close();
  },

  togglePause() {
    if (!this.running) return;
    this.userPaused = !this.userPaused;
    this.syncClock();
    $("tourPause").textContent = this.userPaused ? "Resume" : "Pause";
    $("tour").classList.toggle("is-paused", this.userPaused);
  },

  /* ---- drawing the card ---- */

  render(step, i, phase) {
    const body = typeof step.body === "function" ? step.body() : step.body;
    const total = TOUR_STEPS.length;

    $("tourCount").textContent = (i + 1) + " / " + total;
    $("tourTag").textContent = TOUR_LABEL[step.tag] || step.tag;
    $("tourTag").className = "tour__tag tag-" + step.tag;
    $("tourTag").title = step.file ? "Code: " + step.file : "";
    $("tourTitle").textContent = step.title;
    $("tourProblem").hidden = !step.problem;
    $("tourProblem").innerHTML = step.problem ? "<b>Problem:</b> " + step.problem : "";
    $("tourBody").innerHTML = body;
    $("tourLook").innerHTML = step.look || "";
    $("tourBar").style.width = ((i + (phase === "working" ? 0.5 : 1)) / total) * 100 + "%";

    $("tourStatus").dataset.phase = phase;
    $("tourTimer").style.width = "0%";
    $("tourNextLbl").textContent = phase === "working" ? "Working\u2026" : "Next \u25B8";
    $("tourStatusText").textContent = phase === "done" ? "Tour complete"
      : phase === "working" ? "Working" : (this.frozen ? "Ride paused while you read" : "");

    $("tourPause").hidden = phase === "done";
    $("tourNext").hidden = phase === "done";
    $("tourNext").disabled = phase !== "reading";
    $("tourRestart").hidden = phase !== "done";
    $("tourExit").textContent = phase === "done" ? "Close" : "Exit";

    applyFilter(step.filter || "ALL");
    document.querySelectorAll(".pchip").forEach((c) =>
      c.classList.toggle("is-current", c.dataset.tag === step.tag));

    const focus = phase === "working" && step.focusFirst ? step.focusFirst : step.focus;
    toggleSubs((focus || []).includes("#obsPanel"));
    this.point(focus);
  },

  /** Make the stage's elements glow, and bring them into view. */
  point(selectors) {
    document.querySelectorAll(".tour-focus").forEach((n) => n.classList.remove("tour-focus"));
    const nodes = (selectors || []).map((sel) => document.querySelector(sel)).filter(Boolean);
    nodes.forEach((n) => n.classList.add("tour-focus"));
    this.spotlight(nodes);
    if (!nodes.length) return;

    // Bring every highlighted part into view inside whichever panel
    // scrolls (on a phone, the page itself) - but only if it is not
    // already fully visible, so the screen does not jump for nothing.
    nodes.filter((n) => n.offsetParent !== null).forEach((n, i) => {
      const r = n.getBoundingClientRect();
      const box = scrollBox(n);
      const v = box ? box.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const tourCard = window.innerWidth < 900 && !$("tour").hidden ? $("tour").getBoundingClientRect().height + 80 : 0;
      const fits = r.top >= v.top + 4 && r.bottom <= v.bottom - 4 - (box ? 0 : tourCard);
      if (!fits && i === 0) n.scrollIntoView({ block: r.height > (v.bottom - v.top) * 0.8 ? "start" : "center", behavior: "smooth" });
    });
  },

  /** Fade back every panel this stage is not about (all of them come back afterwards). */
  spotlightPanels: ["#ridePanel", "#mapCard", "#term"],
  spotlight(nodes) {
    const panels = this.spotlightPanels
      .map((sel) => document.querySelector(sel)).filter(Boolean);
    panels.forEach((panel) => {
      const relevant = !nodes.length || nodes.some((n) => panel.contains(n) || n.contains(panel));
      panel.classList.toggle("is-dim", !relevant);
    });
  },

  renderStopped(text) {
    $("tourTitle").textContent = "Walkthrough stopped";
    $("tourProblem").hidden = true;
    $("tourBody").textContent = text;
    $("tourLook").innerHTML = "Press <b>Guided demo</b> again once no ride is active.";
    $("tourStatus").dataset.phase = "done";
    $("tourStatusText").textContent = "Stopped";
  },
};

document.addEventListener("DOMContentLoaded", () => {
  $("btnTour").addEventListener("click", () => Tour.start());
  $("tourPause").addEventListener("click", () => Tour.togglePause());
  $("tourNext").addEventListener("click", () => { Tour.skip = true; });
  $("tourRestart").addEventListener("click", () => { Tour.close(); Tour.start(); });
  $("tourExit").addEventListener("click", () => Tour.exit());

  // Presenter keys: -> next, P pause, Esc exit.
  document.addEventListener("keydown", (e) => {
    if (!Tour.running || e.target.tagName === "SELECT") return;
    if (e.key === "ArrowRight" && !$("tourNext").disabled) Tour.skip = true;
    else if (e.key === "p" || e.key === "P") Tour.togglePause();
    else if (e.key === "Escape") Tour.exit();
  });
});

/** The nearest ancestor that scrolls, or null when the page itself does. */
function scrollBox(node) {
  for (let el = node.parentElement; el && el !== document.body; el = el.parentElement) {
    const o = getComputedStyle(el).overflowY;
    if ((o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}
