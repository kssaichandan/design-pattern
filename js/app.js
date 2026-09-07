/* ============================================================
   app.js - THE USER INTERFACE ONLY
   ------------------------------------------------------------
   Read this file to see the payoff of the five patterns. It draws
   things and handles clicks. It never prices a ride, never decides
   what a ride is allowed to do next, never constructs a vehicle,
   and never talks to a subsystem. It calls the Facade and renders
   whatever comes back.
   ============================================================ */

const $ = (id) => document.getElementById(id);

/* ---------------- vehicle icons (presentation detail) ---------------- */

const VEHICLE_ICONS = {
  bike: '<svg viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="17" r="5"/><circle cx="32" cy="17" r="5"/><path d="M8 17l6-9h7l4 9M21 8l-2-4h-4M25 8h6"/></svg>',
  auto: '<svg viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="18" r="3.5"/><circle cx="30" cy="18" r="3.5"/><path d="M7 18H5v-6c0-5 4-9 9-9h4c5 0 9 4 9 9v6h-3M15 18h11M28 12H8"/></svg>',
  sedan: '<svg viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="17" r="3.5"/><circle cx="29" cy="17" r="3.5"/><path d="M4 17v-4l4-1 4-5h13l5 5 5 1v4h-3M15 17h10"/></svg>',
  suv: '<svg viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="17" r="3.5"/><circle cx="30" cy="17" r="3.5"/><path d="M4 17v-6l3-6h24l4 6h1v6h-3M15 17h11M9 11h24"/></svg>',
};

/* ---------------- the lifecycle timeline (labels only) ---------------- */

const STEPS = [
  { label: "Ride requested",   cls: "RequestedState" },
  { label: "Driver assigned",  cls: "DriverAssignedState" },
  { label: "Driver arriving",  cls: "ArrivingState" },
  { label: "Ride in progress", cls: "InProgressState" },
  { label: "Trip completed",   cls: "CompletedState" },
];

/* ---------------- local UI state ---------------- */

const ui = {
  pickupId: "hitech",
  dropId: "charminar",
  vehicleType: "SEDAN",
  strategyKey: "STANDARD",
  ride: null,
  filter: "ALL",
};

let facade;
let observerList = [];

/* ============================================================
   MAP RENDERING
   ============================================================ */

const SVG_NS = "http://www.w3.org/2000/svg";
const mk = (tag, attrs) => {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
};

function drawStreets() {
  const g = $("streets");
  g.innerHTML = "";
  g.appendChild(mk("rect", { x: 0, y: 0, width: 720, height: 420, class: "mp-bg" }));

  [[60, 250, 120, 90], [430, 60, 150, 70], [300, 300, 130, 80]].forEach(([x, y, w, h]) => {
    g.appendChild(mk("rect", { x, y, width: w, height: h, rx: 6, class: "mp-block" }));
  });

  [60, 140, 220, 300, 380].forEach((y) =>
    g.appendChild(mk("line", { x1: 0, y1: y, x2: 720, y2: y, class: "mp-street" })));
  [80, 190, 300, 410, 520, 630].forEach((x) =>
    g.appendChild(mk("line", { x1: x, y1: 0, x2: x, y2: 420, class: "mp-street" })));
}

function drawRoute(pickup, drop, path) {
  const g = $("routelayer");
  g.innerHTML = "";

  g.appendChild(mk("path", { d: path.toSvgPath(), class: "mp-route", id: "routebase" }));
  const done = mk("path", { d: path.toSvgPath(), class: "mp-route-done", id: "routedone" });
  g.appendChild(done);
  const len = done.getTotalLength();
  done.style.strokeDasharray = len;
  done.style.strokeDashoffset = len;

  const pins = [
    { p: pickup, cls: "mp-pin-a", text: pickup.name },
    { p: drop,   cls: "mp-pin-b", text: drop.name },
  ];
  pins.forEach(({ p, cls, text }) => {
    g.appendChild(mk("circle", { cx: p.x, cy: p.y, r: 10, class: cls + " mp-halo" }));
    g.appendChild(mk("circle", { cx: p.x, cy: p.y, r: 5, class: cls }));
    const label = mk("text", { x: p.x + 14, y: p.y + 4, class: "mp-label" });
    label.textContent = text;
    g.appendChild(label);
  });
}

function moveCar(point, heading, progress) {
  const car = $("car");
  car.setAttribute("transform", `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)}) rotate(${heading.toFixed(0)})`);
  car.style.opacity = 1;

  const done = $("routedone");
  if (done) {
    const len = done.getTotalLength();
    done.style.strokeDashoffset = len * (1 - progress);
  }
}

/* ============================================================
   OBSERVER WIRING - the four subscribers and their checkboxes
   ============================================================ */

function buildObservers() {
  observerList = [
    new MapMarkerObserver(moveCar),
    new EtaPanelObserver((etaMin, km, speed) => {
      $("hudEta").textContent = etaMin + " min";
      $("hudKm").textContent = km.toFixed(1) + " km";
      $("hudSpeed").textContent = speed + " km/h";
    }),
    new TripLogObserver(),
    new PushNotificationObserver(pushToast),
  ];

  const box = $("observers");
  box.innerHTML = "";
  observerList.forEach((observer) => {
    const label = document.createElement("label");
    label.className = "toggle";
    label.innerHTML =
      '<input type="checkbox" checked>' +
      '<span><span class="toggle__name">' + observer.label + "</span>" +
      '<span class="toggle__desc">' + observer.description + "</span></span>";

    label.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) facade.attachObserver(observer);
      else facade.detachObserver(observer);
    });
    box.appendChild(label);
  });
}

/* ============================================================
   TOASTS
   ============================================================ */

function pushToast(html) {
  const wrap = $("toasts");
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = html;
  wrap.appendChild(t);
  while (wrap.children.length > 3) wrap.removeChild(wrap.firstChild);
  setTimeout(() => t.remove(), 5200);
}

/* ============================================================
   THE DISPATCH CONSOLE  (renders whatever the Singleton log holds)
   ============================================================ */

const TAGS = ["ALL", "FACTORY", "STRATEGY", "OBSERVER", "STATE", "FACADE"];

function appendLogLine(entry) {
  const body = $("terminal");
  const row = document.createElement("div");
  row.className = "logline";
  row.dataset.tag = entry.tag;
  if (ui.filter !== "ALL" && ui.filter !== entry.tag) row.style.display = "none";

  const time = entry.time.toTimeString().slice(0, 8);
  const msg = entry.message
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\{\{(.+?)\}\}/g, "<em>$1</em>");

  row.innerHTML =
    '<span class="logline__t">' + time + "</span>" +
    '<span class="logline__tag tag-' + entry.tag + '">' + entry.tag + "</span>" +
    '<span class="logline__msg">' + msg + "</span>";

  body.appendChild(row);
  while (body.children.length > 300) body.removeChild(body.firstChild);
  body.scrollTop = body.scrollHeight;

  pulseChip(entry.tag);
}

let pulseTimers = {};
function pulseChip(tag) {
  const chip = document.querySelector('.pchip[data-tag="' + tag + '"]');
  if (!chip) return;
  chip.classList.add("is-hot");
  clearTimeout(pulseTimers[tag]);
  pulseTimers[tag] = setTimeout(() => chip.classList.remove("is-hot"), 700);
}

function applyFilter(tag) {
  ui.filter = tag;
  document.querySelectorAll(".filter").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.tag === tag)));
  document.querySelectorAll(".logline").forEach((row) => {
    row.style.display = tag === "ALL" || row.dataset.tag === tag ? "" : "none";
  });
}

function buildConsole() {
  const ft = $("filters");
  TAGS.forEach((tag) => {
    const b = document.createElement("button");
    b.className = "filter";
    b.dataset.tag = tag;
    b.textContent = tag;
    b.setAttribute("aria-pressed", String(tag === "ALL"));
    b.addEventListener("click", () => applyFilter(tag));
    ft.insertBefore(b, $("btnClear"));
  });

  const dispatchLog = DispatchLog.getInstance();
  dispatchLog.entries.forEach(appendLogLine);     // whatever happened before the UI was ready
  dispatchLog.onWrite((entry) => { if (entry) appendLogLine(entry); });
}

/* ============================================================
   FORM + FARE RECEIPT
   ============================================================ */

function buildLocationSelects() {
  [["pickup", "pickupId"], ["drop", "dropId"]].forEach(([id, key]) => {
    const sel = $(id);
    LOCATIONS.forEach((loc) => {
      const o = document.createElement("option");
      o.value = loc.id;
      o.textContent = loc.name;
      sel.appendChild(o);
    });
    sel.value = ui[key];
    sel.addEventListener("change", () => {
      ui[key] = sel.value;
      if (ui.pickupId === ui.dropId) {
        const other = LOCATIONS.find((l) => l.id !== sel.value);
        const otherKey = key === "pickupId" ? "dropId" : "pickupId";
        ui[otherKey] = other.id;
        $(key === "pickupId" ? "drop" : "pickup").value = other.id;
      }
      refreshQuote();
    });
  });

  $("swap").addEventListener("click", () => {
    [ui.pickupId, ui.dropId] = [ui.dropId, ui.pickupId];
    $("pickup").value = ui.pickupId;
    $("drop").value = ui.dropId;
    refreshQuote();
  });
}

function buildVehiclePicker() {
  const grid = $("vehicles");
  grid.innerHTML = "";

  // The UI asks the FACTORY what exists. It never lists vehicle classes itself.
  VehicleFactory.available().forEach((vehicle) => {
    const b = document.createElement("button");
    b.className = "vcard";
    b.type = "button";
    b.setAttribute("aria-pressed", String(vehicle.code === ui.vehicleType));
    b.innerHTML =
      '<span class="vcard__ico">' + VEHICLE_ICONS[vehicle.iconId] + "</span>" +
      '<span class="vcard__name">' + vehicle.label + "</span>" +
      '<span class="vcard__meta">' + vehicle.capacity + " seat</span>" +
      '<span class="vcard__meta">Rs.' + vehicle.perKm + "/km</span>";

    b.addEventListener("click", () => {
      ui.vehicleType = vehicle.code;
      grid.querySelectorAll(".vcard").forEach((c) => c.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true");
      refreshQuote();
    });
    grid.appendChild(b);
  });
}

function buildStrategySelect() {
  $("strategy").addEventListener("change", (e) => {
    ui.strategyKey = e.target.value;
    facade.useFareStrategy(ui.strategyKey);      // <- the Strategy swap, live
    refreshQuote();
  });
}

function refreshQuote() {
  const priced = facade.quote({
    pickupId: ui.pickupId,
    dropId: ui.dropId,
    vehicleType: ui.vehicleType,
  });

  const active = facade.calculator.strategy;
  $("receiptStrategy").innerHTML =
    "<span>" + active.note + "</span><b>" + active.name + "</b>";

  $("receiptLines").innerHTML =
    priced.quote.lines.map((l) =>
      '<div class="rline' + (l.kind ? " rline--" + l.kind : "") + '"><span>' + l.label +
      "</span><span>" + (l.amount < 0 ? "-" : "") + "Rs." + Math.abs(l.amount).toFixed(0) + "</span></div>"
    ).join("") +
    '<div class="rline rline--total"><span>Total</span><span>Rs.' + priced.quote.total + "</span></div>";

  $("hudKm").textContent = priced.km.toFixed(1) + " km";
  $("hudEta").textContent = priced.minutes + " min";

  if (!ui.ride || ui.ride.state.isFinal) {
    drawRoute(priced.pickup, priced.drop, priced.path);
    $("car").style.opacity = 0;
  }
  return priced;
}

/* ============================================================
   LIFECYCLE PANEL  (pure reflection of the current State object)
   ============================================================ */

function renderLifecycle(ride) {
  const wrap = $("lifecycle");
  const cancelled = ride && ride.state.key === "CancelledState";
  const current = ride ? ride.state.step : -99;

  wrap.innerHTML = STEPS.map((s, i) => {
    let cls = "step";
    if (ride && !cancelled && i < current) cls += " is-done";
    if (ride && !cancelled && i === current) cls += " is-active";
    return '<div class="' + cls + '">' +
      '<span class="step__dot">' + (i + 1) + "</span>" +
      '<span class="step__name">' + s.label + "</span>" +
      '<span class="step__note">' + s.cls + "</span></div>";
  }).join("") +
  (cancelled
    ? '<div class="step is-dead"><span class="step__dot">&times;</span>' +
      '<span class="step__name">Ride cancelled</span>' +
      '<span class="step__note">CancelledState</span></div>'
    : "");

  $("stateNow").textContent = ride ? ride.state.key : "no active ride";
  $("stateLabel").textContent = ride ? ride.state.label : "Pick a route and book";
  $("btnCancel").disabled = !ride || !ride.canCancel;

  const done = !ride || ride.state.isFinal;
  $("btnBook").disabled = !done;
  $("btnBook").textContent = ride && ride.state.isFinal ? "Book another ride" : "Book ride";
}

/* ============================================================
   CODE SAMPLES in the reference section
   ============================================================ */

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlight(src) {
  const re = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(class|extends|constructor|new|return|const|let|var|if|else|for|get|set|static|throw|super|this|function|null|true|false|of|in|forEach)\b|\b(\d+(?:\.\d+)?)\b/g;
  let out = "", last = 0, m;
  while ((m = re.exec(src)) !== null) {
    out += esc(src.slice(last, m.index));
    const cls = m[1] ? "tk-com" : m[2] ? "tk-str" : m[3] ? "tk-key" : "tk-num";
    out += '<span class="' + cls + '">' + esc(m[0]) + "</span>";
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}

function renderCodeSamples() {
  document.querySelectorAll("pre[data-src]").forEach((pre) => {
    const src = $(pre.dataset.src);
    if (src) pre.innerHTML = highlight(src.textContent.trim());
  });
}

/* ============================================================
   BOOT
   ============================================================ */

function onRideUpdate(ride, payload) {
  ui.ride = ride;
  renderLifecycle(ride);
  if (payload && payload.toast) pushToast(payload.toast);

  if (ride.state.key === "ArrivingState") {
    drawRoute({ ...ride.legs.toPickup.points[0], name: ride.driver.name }, ride.pickup, ride.legs.toPickup);
  }
  if (ride.state.key === "InProgressState") {
    drawRoute(ride.pickup, ride.drop, ride.legs.toDrop);
    observerList.forEach((o) => { if (o.reset) o.reset(); });
  }
  if (ride.state.isFinal) {
    $("hudEta").textContent = "--";
    $("hudSpeed").textContent = "0 km/h";
  }
}

function init() {
  log("SINGLETON", "DispatchLog.getInstance() - one shared log for the whole app.");

  facade = new RideBookingFacade({ pushToast, onRideUpdate });

  drawStreets();
  buildLocationSelects();
  buildVehiclePicker();
  buildStrategySelect();
  buildObservers();
  buildConsole();
  renderCodeSamples();

  // Every observer starts subscribed.
  observerList.forEach((o) => facade.attachObserver(o));

  $("btnBook").addEventListener("click", () => {
    $("toasts").innerHTML = "";
    observerList.forEach((o) => { if (o.reset) o.reset(); });
    facade.bookRide({
      pickupId: ui.pickupId,
      dropId: ui.dropId,
      vehicleType: ui.vehicleType,
    });
  });

  $("btnCancel").addEventListener("click", () => facade.cancelRide());

  $("btnClear").addEventListener("click", () => {
    $("terminal").innerHTML = "";
    DispatchLog.getInstance().entries = [];
    log("SYSTEM", "Console cleared.");
  });

  refreshQuote();
  renderLifecycle(null);
  log("SYSTEM", "RideFlow ready. Press Book ride and watch the tags on the left of each line.");
}

document.addEventListener("DOMContentLoaded", init);
