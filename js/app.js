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
let ambient;

/* ============================================================
   MAP RENDERING
   ============================================================ */

const SVG_NS = "http://www.w3.org/2000/svg";
const mk = (tag, attrs) => {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
};

const polyD = (pts, close) =>
  pts.map((p, i) => (i === 0 ? "M" : "L") + " " + p.x + " " + p.y).join(" ") + (close ? " Z" : "");

/* ---------- city blocks: the built-up land between the roads ---------- */

function blockShapes() {
  const out = [];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 9; c++) {
      const n = cityNoise(r * 9 + c, 17);
      if (n < 0.38) continue;                       // leave gaps, not a waffle
      const x = c * 80 + 12 + n * 10;
      const y = r * 58 + 14 + cityNoise(c, r) * 10;
      const w = 34 + cityNoise(r, c * 3) * 30;
      const h = 20 + cityNoise(c * 5, r) * 18;
      const mid = { x: x + w / 2, y: y + h / 2 };
      if (inWater(mid)) continue;
      if (PARKS.some((p) => pointInPolygon(mid, p.points))) continue;
      out.push({ x, y, w, h, tone: n > 0.72 ? "dense" : "plain" });
    }
  }
  return out;
}

/**
 * Draws the city once: land, water, parks, then the roads in class
 * order so highways sit on top of lanes, then the landmarks.
 */
function drawCity() {
  const g = $("terrain");
  g.innerHTML = "";
  g.appendChild(mk("rect", { x: 0, y: 0, width: 720, height: 420, class: "mp-land" }));

  blockShapes().forEach((b) =>
    g.appendChild(mk("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 2, class: "mp-block mp-block--" + b.tone })));

  PARKS.forEach((park) => g.appendChild(mk("path", { d: polyD(park.points, true), class: "mp-park" })));

  g.appendChild(mk("path", { d: polyD(RIVER.points), class: "mp-river" }));

  WATER.forEach((w) => g.appendChild(mk("path", { d: polyD(w.points, true), class: "mp-water" })));

  drawRoads();
  drawGreenLabels();
  drawLandmarks();
}

function drawRoads() {
  const g = $("roads");
  g.innerHTML = "";

  // Casing first, then the surface on top - the trick every real map
  // uses to make roads read as roads rather than as coloured lines.
  ["street", "arterial", "highway"].forEach((cls) => {
    const roads = ROADS.filter((r) => r.cls === cls);
    ["case", "fill"].forEach((layer) => {
      roads.forEach((road) => {
        g.appendChild(mk("path", {
          d: polyD(road.points),
          class: "rd rd--" + cls + " rd--" + layer,
          fill: "none",
        }));
      });
    });
  });

  // Name the majors, laid along their longest straight. A map that
  // labels every road just looks noisy, so this keeps the highways and
  // drops any label that is cramped, clipped by the edge, or sitting on
  // top of one already placed.
  const placed = [];
  NAMED_ROADS.forEach((road, i) => {
    let best = null;
    for (let k = 0; k < road.points.length - 1; k++) {
      const a = road.points[k], b = road.points[k + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (!best || len > best.len) best = { a, b, len };
    }

    const need = road.cls === "highway" ? 60 : 78;
    if (!best || best.len < need) return;

    const mid = { x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2 };
    if (mid.x < 56 || mid.x > 664 || mid.y < 18 || mid.y > 404) return;
    if (placed.some((q) => Math.hypot(q.x - mid.x, q.y - mid.y) < 48)) return;
    placed.push(mid);

    const id = "rdlbl" + i;
    const flip = best.b.x < best.a.x;
    const from = flip ? best.b : best.a;
    const to = flip ? best.a : best.b;

    const guide = mk("path", { id, d: polyD([from, to]), fill: "none", stroke: "none" });
    g.appendChild(guide);

    const text = mk("text", { class: "mp-road-label rdl--" + road.cls, dy: -3 });
    const tp = document.createElementNS(SVG_NS, "textPath");
    tp.setAttribute("href", "#" + id);
    tp.setAttribute("startOffset", "50%");
    tp.setAttribute("text-anchor", "middle");
    tp.textContent = road.name;
    text.appendChild(tp);
    g.appendChild(text);
  });
}

/** Centre of a polygon, near enough for placing a label in it. */
function centroid(points) {
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  };
}

/**
 * Park and lake names, drawn AFTER the roads. Put them in the terrain
 * layer and the road surfaces paint straight over the text.
 */
function drawGreenLabels() {
  const g = $("pois");
  g.innerHTML = "";

  PARKS.forEach((park) => {
    const c = centroid(park.points);
    const t = mk("text", { x: c.x, y: c.y + 3, class: "mp-green-label", "text-anchor": "middle" });
    t.textContent = park.name;
    g.appendChild(t);
  });

  WATER.forEach((w) => {
    const c = centroid(w.points);
    const t = mk("text", { x: c.x, y: c.y, class: "mp-water-label", "text-anchor": "middle" });
    t.textContent = w.name;
    g.appendChild(t);
  });
}

const POI_GLYPH = {
  airport:  "M2 0l-9-3 1-2 8 1 4-4 2 1-3 5 4 4-1 2z",
  rail:     "M-4-5h8v7h-8z",
  heritage: "M-4 4v-6l4-4 4 4v6z",
  business: "M-4 5v-9h8v9z",
  suburb:   "M-4 4v-5l4-3 4 3v5z",
};

/** Every landmark on the map, not only the two on the current route. */
function drawLandmarks() {
  const g = $("pois");

  LOCATIONS.forEach((loc) => {
    const node = mk("g", { class: "poi", "data-loc": loc.id, transform: `translate(${loc.x} ${loc.y})` });
    node.appendChild(mk("circle", { r: 7.5, class: "poi__disc" }));
    node.appendChild(mk("path", { d: POI_GLYPH[loc.kind] || POI_GLYPH.suburb, class: "poi__glyph", transform: "scale(.62)" }));

    const label = mk("text", { x: 0, y: 19, class: "mp-poi-label", "text-anchor": "middle" });
    label.textContent = loc.name;
    node.appendChild(label);
    g.appendChild(node);
  });
}

/* ---------- ambient traffic: the rest of the city, moving ---------- */

function drawAmbient() {
  const g = $("ambient");
  g.innerHTML = "";
  ambient.positions().forEach(() => g.appendChild(mk("rect", { x: -2.6, y: -1.5, width: 5.2, height: 3, rx: 1, class: "mp-ambient" })));
}

function tickAmbient() {
  ambient.tick(0.016);
  const g = $("ambient");
  const pos = ambient.positions();
  for (let i = 0; i < g.children.length; i++) {
    const p = pos[i];
    g.children[i].setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.heading.toFixed(0)})`);
  }
  requestAnimationFrame(tickAmbient);
}

/* ---------- the active route ---------- */

function drawRoute(pickup, drop, path) {
  const g = $("routelayer");
  g.innerHTML = "";

  // The route prints big labels for these two, so silence the small
  // landmark labels underneath and avoid printing each name twice.
  document.querySelectorAll(".poi").forEach((n) => n.classList.remove("is-muted"));
  [pickup.id, drop.id].filter(Boolean).forEach((id) => {
    const n = document.querySelector('.poi[data-loc="' + id + '"]');
    if (n) n.classList.add("is-muted");
  });

  g.appendChild(mk("path", { d: path.toSvgPath(), class: "mp-route-case" }));
  g.appendChild(mk("path", { d: path.toSvgPath(), class: "mp-route", id: "routebase" }));
  const done = mk("path", { d: path.toSvgPath(), class: "mp-route-done", id: "routedone" });
  g.appendChild(done);
  const len = done.getTotalLength();
  done.style.strokeDasharray = len;
  done.style.strokeDashoffset = len;

  [
    { p: pickup, cls: "mp-pin-a", text: pickup.name },
    { p: drop,   cls: "mp-pin-b", text: drop.name },
  ].forEach(({ p, cls, text }) => {
    g.appendChild(mk("circle", { cx: p.x, cy: p.y, r: 11, class: cls + " mp-halo" }));
    g.appendChild(mk("circle", { cx: p.x, cy: p.y, r: 5.5, class: cls }));
    const label = mk("text", { x: p.x + 14, y: p.y + 4, class: "mp-label" });
    label.textContent = text;
    g.appendChild(label);
  });

  // Show the roads this route actually uses.
  const names = path.legNames().slice(0, 4);
  $("viaLine").textContent = names.length ? "via " + names.join(" › ") : "via local streets";
}

function moveCar(point, heading, progress, status) {
  const car = $("car");
  car.setAttribute("transform", `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)}) rotate(${heading.toFixed(0)})`);
  car.style.opacity = 1;
  car.classList.toggle("is-stopped", status === "STOPPED");

  const done = $("routedone");
  if (done) done.style.strokeDashoffset = done.getTotalLength() * (1 - progress);
}

/* ============================================================
   OBSERVER WIRING - the four subscribers and their checkboxes
   ============================================================ */

function showTelemetry(fix) {
  $("hudEta").textContent = fix.etaMin + " min";
  $("hudKm").textContent = fix.remainingKm.toFixed(1) + " km";
  $("hudSpeed").textContent = fix.speedKmph + " km/h";
  $("hudRoad").textContent = fix.road || "side lane";

  const chip = $("hudStatus");
  chip.textContent = fix.status === "STOPPED" ? "at a signal"
    : fix.status === "CRAWLING" ? "slow traffic"
    : fix.status === "CRUISING" ? "clear road" : "moving";
  chip.dataset.status = fix.status;
}

function buildObservers() {
  observerList = [
    new MapMarkerObserver(moveCar),
    new EtaPanelObserver(showTelemetry),
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
   THE DRIVER CARD
   ============================================================ */

function renderDriver(ride) {
  const card = $("driverCard");
  if (!ride || !ride.driver || ride.state.key === "RequestedState") {
    card.hidden = true;
    return;
  }
  const d = ride.driver;
  const initials = d.name.split(" ").map((w) => w[0]).join("").slice(0, 2);

  card.hidden = false;
  card.innerHTML =
    '<span class="dcard__ava">' + initials + "</span>" +
    '<span class="dcard__who">' +
      '<b>' + d.name + "</b>" +
      '<span class="dcard__meta">' + d.rating + " ★ · " + d.trips.toLocaleString() + " trips</span>" +
    "</span>" +
    '<span class="dcard__car">' +
      "<b>" + d.plate + "</b>" +
      '<span class="dcard__meta">' + d.model + "</span>" +
    "</span>";
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
  renderDriver(ride);
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
    $("hudStatus").textContent = "idle";
    $("hudStatus").dataset.status = "IDLE";
  }
}

function init() {
  log("SINGLETON", "DispatchLog.getInstance() - one shared log for the whole app.");

  facade = new RideBookingFacade({ pushToast, onRideUpdate });

  drawCity();
  ambient = new AmbientTraffic(CITY, 22);
  drawAmbient();
  requestAnimationFrame(tickAmbient);

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
  log("SYSTEM", `City loaded: ${CITY.nodes.length} junctions, ${CITY.edges.length} road links. Routes are searched across that network, not drawn straight.`);
  log("SYSTEM", "RideFlow ready. Press Book ride and watch the tags on the left of each line.");
}

document.addEventListener("DOMContentLoaded", init);
