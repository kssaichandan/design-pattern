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
  const card = [...document.querySelectorAll(".vcard")]
    .find((c) => c.querySelector(".vcard__name").textContent.toUpperCase() === code);
  if (card) card.click();
}

const rideKey = () => (ui.ride ? ui.ride.state.key : null);
const visible = (id) => !$(id).hidden;
const fare = () => (ui.ride ? "Rs." + ui.ride.quote.total : "-");
const driverName = (fallback) => (ui.ride && ui.ride.driver ? ui.ride.driver.name : fallback);

/* ============================================================
   THE STAGES
   tag/title/body/notice/file  what the card says
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
    body: `I'll book a <b>Sedan from Kukatpally to RGIA Airport</b> by clicking the real buttons.
           Each stage says what is happening and which pattern is doing it.`,
    notice: [
      "The <b>amber outline</b> shows where to look; panels a stage is not about fade back (hover to bring one back).",
      "The chip up top marks the pattern being explained. Dull driving is fast-forwarded &#9193;.",
    ],
    async run() {
      $("btnClear").click();
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
    body: `Every file - the factory, the pricing rules, the GPS, the ride states - writes into
           <b>one</b> console. <code>DispatchLog.getInstance()</code> always hands back the same object.`,
    notice: ["The coloured tag on each line names the pattern that wrote it."],
  },

  {
    tag: "FACTORY",
    title: "Pick a vehicle - the Factory builds it",
    file: "js/patterns/factory.js",
    view: "plan",
    focus: ["#vehicles", "#term"],
    filter: "FACTORY",
    body: `I tap <b>Bike</b>, then <b>Sedan</b>. Each tap calls <code>VehicleFactory.create("SEDAN")</code>,
           which returns a <code>SedanCab</code> carrying its own rates. The screen never says <code>new</code>.`,
    notice: [
      "Console: <code>create(\"BIKE\") -&gt; new Bike</code>, then the Sedan.",
      "A new vehicle type = one class + one registry line.",
    ],
    async run(t) {
      tourVehicle("BIKE");
      await t.sleep(900);
      tourVehicle("SEDAN");
    },
  },

  {
    tag: "STRATEGY",
    title: "Swap the pricing rule - Strategy",
    file: "js/patterns/strategy.js",
    view: "plan",
    focus: ["#strategy", "#receipt"],
    filter: "STRATEGY",
    body: `Same trip, same car. I switch to <b>Surge ×1.8</b>: the calculator is handed a new
           <code>SurgePricingFare</code> object and simply calls <code>calculate()</code> - it holds no
           if-else about pricing.`,
    notice: ["The receipt rebuilt itself with a red surge line."],
    async run(t) {
      await t.sleep(400);
      tourSelect("strategy", "SURGE");
    },
  },

  {
    tag: "DECORATOR",
    title: "Real problem #2 - unfair fares",
    file: "js/patterns/decorator.js",
    view: "plan",
    focus: ["#receipt"],
    filter: "DECORATOR",
    problem: "3-4x festival surges and an alleged iPhone-vs-Android price gap. The 2025 rules cap surge at 2x.",
    body: `<b>Festival ×3</b> asks for triple. Two wrappers stand between that rule and you:
           <code>FairInputGuard</code> drops your device type, and <code>SurgeCapGuard</code> trims the
           fare to the <b>legal 2×</b>.`,
    notice: [
      "Green receipt line: <b>Surge capped at 2x (MoRTH 2025)</b>.",
      "The surge rule was not edited - it was <b>wrapped</b>.",
    ],
    async run(t) {
      await t.sleep(400);
      tourSelect("strategy", "FESTIVAL");
    },
  },

  {
    tag: "FACADE",
    title: "Book - one call does it all (Facade)",
    file: "js/patterns/facade.js",
    view: "plan",
    focusFirst: ["#btnBook"],
    focus: ["#tripFare", "#term"],
    filter: "FACADE",
    hold: true,
    body: () => `Back to the standard fare, then <b>Book ride</b>. One call,
           <code>facade.bookRide()</code>, builds the vehicle, prices the trip, creates the ride,
           connects the GPS and starts the state machine. Fare locked at <b>${fare()}</b>.`,
    notice: ["Filtered to FACADE: just two lines - they set off everything else."],
    async run(t) {
      tourSelect("strategy", "STANDARD");
      await t.sleep(900);
      $("btnBook").click();
    },
    waitFor: () => rideKey() !== null && !ui.ride.state.isFinal,
  },

  {
    tag: "STATE",
    title: "A driver accepts - State",
    file: "js/patterns/state.js",
    view: "trip",
    focus: ["#lifecycle", "#driverCard"],
    filter: "STATE",
    hold: true,
    body: () => `The ride holds a <b>state object</b>. <code>RequestedState</code> found
           <b>${driverName("a driver")}</b> and handed over to <code>DriverAssignedState</code>. Their route
           to you starts from where they are actually parked.`,
    notice: ["The grey label on each row is the real class the ride is holding."],
    waitFor: () => rideKey() === "DriverAssignedState",
  },

  {
    tag: "STATE",
    title: "Real problem #1 - the driver cancels",
    file: "js/patterns/state.js",
    view: "trip",
    focus: ["#rematchNote", "#lifecycle"],
    filter: "STATE",
    hold: true,
    problem: "84% of app-cab users have been pushed into cancelling - and paid the fee themselves (LocalCircles).",
    body: () => `The driver set off - then <b>cancelled</b>. The ride did not die: it moved into a new
           <code>RematchingState</code>. The driver is penalised, <b>you pay Rs.0</b>, and the fare stays
           <b>${fare()}</b>.`,
    notice: [
      "Row 1 now reads <b>RematchingState</b> - the whole stage is one new class.",
      "That driver is left out of the next match.",
    ],
    async run(t) {
      await t.until(() => rideKey() === "ArrivingState");
      await t.sleep(1300);                      // let the car visibly set off first
      if (!$("btnDriverCancel").disabled) $("btnDriverCancel").click();
    },
    waitFor: () => rideKey() === "RematchingState",
  },

  {
    tag: "OBSERVER",
    title: "A new driver drives in - Observer",
    file: "js/patterns/observer.js",
    view: "trip",
    focus: ["#map", "#obsPanel"],
    filter: "OBSERVER",
    body: () => `<b>${driverName("A new driver")}</b> took the job. Their phone is the <b>Subject</b>:
           about 12 GPS fixes a second go out to <b>5 subscribers</b> - map, ETA panel, trip log,
           push alerts and the safety monitor.`,
    notice: [
      "The publisher never learns who is listening.",
      "Untick a subscriber later - only that one goes quiet.",
    ],
    async run(t) {
      await t.until(() => rideKey() === "ArrivingState");
      await t.sleep(700);
    },
  },

  {
    tag: "STATE",
    title: "You're aboard - Cancel locks itself",
    file: "js/patterns/state.js",
    view: "trip",
    focus: ["#lifecycle", "#btnCancel", "#simulate"],
    filter: "STATE",
    hold: true,
    body: `<code>ArrivingState</code> handed over to <code>InProgressState</code>, whose
           <code>canCancel</code> is <b>false</b> - so the Cancel button disabled itself. The button
           asks the state; it has no rules of its own.`,
    notice: ["<i>Unexpected stop</i> and <i>Route detour</i> just unlocked - the rider is in the car."],
    waitFor: () => rideKey() === "InProgressState",
  },

  {
    tag: "OBSERVER",
    title: "Real problem #3 - the car leaves the route",
    file: "js/patterns/observer.js",
    view: "trip",
    focus: ["#map", "#term"],
    filter: "OBSERVER",
    hold: true,
    problem: "The NCW's 2026 guidelines ask app cabs for route-deviation alerts and checks on long stops.",
    body: `The driver left the <b>blue</b> route for the <b>red dashed</b> one.
           <code>SafetyMonitorObserver</code>, a 5th subscriber, caught it at 0.8 km off and asked
           <b>"Are you okay?"</b> with an SOS button.`,
    notice: [
      "Console: <b>DETOUR ALERT</b>. No other observer changed to add this.",
      "I'll tap <i>I'm okay</i> for you next.",
    ],
    async run(t) {
      await t.sleep(1200);
      if (!$("btnDetour").disabled) $("btnDetour").click();
    },
    waitFor: () => visible("safetyCard"),
  },

  {
    tag: "STATE",
    title: "Trip done - you pay the upfront fare",
    file: "js/patterns/state.js",
    view: "trip",
    focus: ["#tripFare", "#lifecycle", "#term"],
    filter: "ALL",
    body: () => `I tapped <b>I'm okay</b> and the trip finished. <code>CompletedState</code> charged
           <b>${fare()}</b> - the exact quote - even after the <b>${ui.ride ? ui.ride.detourKm : 0} km</b>
           detour. The quote is the bill.`,
    notice: ["One charge only, and no cancellation fee - the driver cancelled, not you."],
    async run() {
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
             <tr><td>Singleton</td><td>one shared log behind the whole console</td></tr>
             <tr><td>Factory</td><td>built the Bike and the Sedan</td></tr>
             <tr><td>Strategy</td><td>swapped the pricing rule live</td></tr>
             <tr><td>Decorator</td><td>held a 3x festival surge to the legal 2x</td></tr>
             <tr><td>Facade</td><td>turned "Book ride" into one call</td></tr>
             <tr><td>State</td><td>ran the lifecycle and re-matched after a cancel</td></tr>
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
      $("tourStatusText").textContent = (this.frozen ? "Ride paused while you read · " : "") +
        "next in " + Math.ceil(left / 1000) + "s";
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
      $("tourStatusText").textContent = "⏩ Fast-forwarding to the next moment...";
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
    }
  },

  /** How long a stage stays up: enough to read it, not a second more. */
  readTime(step) {
    const text = [typeof step.body === "function" ? step.body() : step.body, step.problem || "", ...(step.notice || [])]
      .join(" ").replace(/<[^>]+>/g, " ");
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(4000, Math.min(7500, 2200 + words * 70));
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
    $("tour").hidden = false;
    $("tour").classList.remove("is-paused", "is-open");
    $("tourMore").setAttribute("aria-expanded", "false");
    $("tourMore").textContent = "Details";
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

  toggleDetails() {
    const open = $("tour").classList.toggle("is-open");
    $("tourMore").setAttribute("aria-expanded", String(open));
    $("tourMore").textContent = open ? "Less" : "Details";
  },

  /* ---- drawing the card ---- */

  render(step, i, phase) {
    const body = typeof step.body === "function" ? step.body() : step.body;
    const total = TOUR_STEPS.length;

    $("tourCount").textContent = "Step " + (i + 1) + " of " + total;
    $("tourTag").textContent = step.tag;
    $("tourTag").className = "tour__tag tag-" + step.tag;
    $("tourTitle").textContent = step.title;
    $("tourProblem").hidden = !step.problem;
    $("tourProblem").innerHTML = step.problem ? "<b>The problem:</b> " + step.problem : "";
    $("tourBody").innerHTML = body;
    $("tourNotice").innerHTML = (step.notice || []).map((n) => "<li>" + n + "</li>").join("");
    $("tourFile").innerHTML = step.file ? "Code: <code>" + step.file + "</code>" : "";
    $("tourBar").style.width = ((i + (phase === "working" ? 0.5 : 1)) / total) * 100 + "%";

    const status = $("tourStatus");
    status.dataset.phase = phase;
    $("tourTimer").style.width = "0%";
    $("tourStatusText").textContent = phase === "done" ? "Tour complete"
      : phase === "working" ? "Working - watch the glow..." : "";

    $("tourPause").hidden = phase === "done";
    $("tourNext").hidden = phase === "done";
    $("tourNext").disabled = phase !== "reading";
    $("tourRestart").hidden = phase !== "done";
    $("tourExit").textContent = phase === "done" ? "Close" : "Exit";

    applyFilter(step.filter || "ALL");
    this.renderFeed();
    document.querySelectorAll(".pchip").forEach((c) =>
      c.classList.toggle("is-current", c.dataset.tag === step.tag));

    this.point(phase === "working" && step.focusFirst ? step.focusFirst : step.focus);
  },

  /** Make the stage's elements glow, and bring them into view. */
  point(selectors) {
    document.querySelectorAll(".tour-focus").forEach((n) => n.classList.remove("tour-focus"));
    const nodes = (selectors || []).map((sel) => document.querySelector(sel)).filter(Boolean);
    nodes.forEach((n) => n.classList.add("tour-focus"));
    this.spotlight(nodes);
    if (!nodes.length) return;

    const docked = window.innerWidth < 1024;
    if (!docked) {
      // Laptop: everything is on one screen - only nudge inside a scrolling panel.
      nodes.forEach((n) => n.scrollIntoView({ block: "nearest", behavior: "smooth" }));
      return;
    }

    // Phone / tablet: the map is pinned on top (phone) and this card is
    // docked at the bottom. Scroll the stage's element into the space
    // between them. The pinned map itself never needs scrolling to.
    const stage = $("stage");
    const pinned = getComputedStyle(stage).position === "sticky";
    const targets = nodes.filter((n) => !(pinned && stage.contains(n)) && n.offsetParent !== null);
    if (!targets.length) return;
    const top = pinned ? stage.getBoundingClientRect().height : 0;
    const free = window.innerHeight - top - $("tour").offsetHeight - 20;

    // Show every highlighted part together if they fit; otherwise the first one.
    const rects = targets.map((n) => n.getBoundingClientRect());
    const unionTop = Math.min(...rects.map((r) => r.top));
    const unionBottom = Math.max(...rects.map((r) => r.bottom));
    const from = unionBottom - unionTop <= free ? unionTop : rects[0].top;
    window.scrollTo({ top: Math.max(0, window.scrollY + from - top - 10), behavior: "smooth" });
  },

  /** Fade back every panel this stage is not about (all of them come back afterwards). */
  spotlight(nodes) {
    const panels = ["#sheet", "#stage", "#obsPanel", "#term"]
      .map((sel) => document.querySelector(sel)).filter(Boolean);
    panels.forEach((panel) => {
      const relevant = !nodes.length || nodes.some((n) => panel.contains(n) || n.contains(panel));
      panel.classList.toggle("is-dim", !relevant);
    });
  },

  /** The latest console lines for this stage - shown where the console is out of view. */
  renderFeed() {
    if (!this.step) return;
    const filter = this.step.filter || "ALL";
    const lines = DispatchLog.getInstance().entries
      .filter((e) => (filter === "ALL" ? e.tag !== "SYSTEM" : e.tag === filter))
      .slice(-2);
    $("tourFeed").innerHTML = lines.map((e) =>
      '<div><span class="tag-' + e.tag + '">' + e.tag + "</span><span>" +
      e.message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\{\{|\}\}/g, "") +
      "</span></div>").join("");
  },

  renderStopped(text) {
    $("tourTitle").textContent = "Walkthrough stopped";
    $("tourProblem").hidden = true;
    $("tourBody").textContent = text;
    $("tourNotice").innerHTML = "<li>Press <b>Guided demo</b> again once no ride is active.</li>";
    $("tourFile").innerHTML = "";
    $("tourStatus").dataset.phase = "done";
    $("tourStatusText").textContent = "Stopped";
  },
};

document.addEventListener("DOMContentLoaded", () => {
  $("btnTour").addEventListener("click", () => Tour.start());
  $("tourPause").addEventListener("click", () => Tour.togglePause());
  $("tourNext").addEventListener("click", () => { Tour.skip = true; });
  $("tourMore").addEventListener("click", () => Tour.toggleDetails());
  $("tourRestart").addEventListener("click", () => { Tour.close(); Tour.start(); });
  $("tourExit").addEventListener("click", () => Tour.exit());

  // Keep the console lines in the card live while a stage is up.
  DispatchLog.getInstance().onWrite(() => { if (Tour.running) Tour.renderFeed(); });

  // Reserve exactly the docked card's height at the bottom of the page.
  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      document.body.style.setProperty("--tour-h", $("tour").offsetHeight + "px");
    }).observe($("tour"));
  }

  // Presenter keys: -> next, P pause, Esc exit.
  document.addEventListener("keydown", (e) => {
    if (!Tour.running || e.target.tagName === "SELECT") return;
    if (e.key === "ArrowRight" && !$("tourNext").disabled) Tour.skip = true;
    else if (e.key === "p" || e.key === "P") Tour.togglePause();
    else if (e.key === "Escape") Tour.exit();
  });
});
