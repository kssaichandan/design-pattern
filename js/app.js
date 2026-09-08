/* ============================================================
   app.js - THE USER INTERFACE ONLY
   ------------------------------------------------------------
   Read this file to see the payoff of the seven patterns. It draws
   things and handles clicks. It never prices a ride, never decides
   what a ride is allowed to do next, never constructs a vehicle,
   never talks to a payment provider and never touches a subsystem.
   It calls the Facade and renders whatever comes back.
   ============================================================ */

const $ = (id) => document.getElementById(id);

/* ---------------- vehicle icons (presentation detail) ---------------- */

const VEHICLE_ICONS = {
  bike:  '<svg viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="17" r="5"/><circle cx="32" cy="17" r="5"/><path d="M8 17l6-9h7l4 9M21 8l-2-4h-4M25 8h6"/></svg>',
  erick: '<svg viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="18" r="3.5"/><circle cx="30" cy="18" r="3.5"/><path d="M7 18H5v-6c0-5 4-9 9-9h4c5 0 9 4 9 9v6h-3M15 18h11"/><path d="m19 7-3 5h4l-3 5"/></svg>',
  auto:  '<svg viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="18" r="3.5"/><circle cx="30" cy="18" r="3.5"/><path d="M7 18H5v-6c0-5 4-9 9-9h4c5 0 9 4 9 9v6h-3M15 18h11M28 12H8"/></svg>',
  sedan: '<svg viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="17" r="3.5"/><circle cx="29" cy="17" r="3.5"/><path d="M4 17v-4l4-1 4-5h13l5 5 5 1v4h-3M15 17h10"/></svg>',
  suv:   '<svg viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="17" r="3.5"/><circle cx="30" cy="17" r="3.5"/><path d="M4 17v-6l3-6h24l4 6h1v6h-3M15 17h11M9 11h24"/></svg>',
  prime: '<svg viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="17" r="3.5"/><circle cx="29" cy="17" r="3.5"/><path d="M4 17v-4l4-1 4-5h13l5 5 5 1v4h-3M15 17h10"/><path d="m20 2 1.2 2.4L24 4.8l-2 1.9.5 2.7-2.5-1.3-2.5 1.3.5-2.7-2-1.9 2.8-.4z"/></svg>',
};

/* ---------------- local UI state ---------------- */

const ui = {
  pickupId: "hitech",
  dropId: "charminar",
  vehicleType: "SEDAN",
  strategyKey: "STANDARD",
  addOns: [],
  ride: null,
  filter: "ALL",
};

let facade;
let router;
let observerList = [];
let ambient;
let vehicleCatalog = [];
let meterObserver;

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

    const need = road.cls === "highway" ? 60 : 82;
    if (!best || best.len < need) return;

    const mid = { x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2 };
    if (mid.x < 56 || mid.x > 664 || mid.y < 18 || mid.y > 404) return;
    if (placed.some((q) => Math.hypot(q.x - mid.x, q.y - mid.y) < 54)) return;
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
  market:   "M-4-3h8l-1 8h-6z",
  leisure:  "M0-5 1.6-1h4.2L2.6 1.6 3.8 5.6 0 3.2l-3.8 2.4 1.2-4L-5.8-1h4.2z",
  suburb:   "M-4 4v-5l4-3 4 3v5z",
};

/**
 * Every landmark on the map. With 29 of them, only the majors get a
 * printed name - label them all and the city turns into soup. The
 * rest name themselves on hover, and any of them can be tapped to
 * become your drop.
 */
function drawLandmarks() {
  const g = $("pois");

  LOCATIONS.forEach((loc) => {
    const node = mk("g", {
      class: "poi" + (loc.major ? " poi--major" : ""),
      "data-loc": loc.id,
      transform: `translate(${loc.x} ${loc.y})`,
      tabindex: "0",
      role: "button",
    });

    node.appendChild(mk("circle", { r: loc.major ? 7.5 : 4.6, class: "poi__disc" }));
    node.appendChild(mk("path", {
      d: POI_GLYPH[loc.kind] || POI_GLYPH.suburb,
      class: "poi__glyph",
      transform: "scale(" + (loc.major ? 0.62 : 0.4) + ")",
    }));

    const label = mk("text", { x: 0, y: loc.major ? 19 : 15, class: "mp-poi-label", "text-anchor": "middle" });
    label.textContent = loc.name;
    node.appendChild(label);

    const tip = document.createElementNS(SVG_NS, "title");
    tip.textContent = `${loc.name} — ${loc.area}`;
    node.appendChild(tip);

    node.addEventListener("click", () => {
      if (loc.id === ui.pickupId) return;
      setRoute(null, loc.id);
      pushToast(`Drop set to <b>${fmt.esc(loc.name)}</b>.`);
    });

    g.appendChild(node);
  });
}

/* ---------- ambient traffic: the rest of the city, moving ---------- */

function drawAmbient() {
  const g = $("ambient");
  g.innerHTML = "";
  ambient.positions().forEach(() =>
    g.appendChild(mk("rect", { x: -2.6, y: -1.5, width: 5.2, height: 3, rx: 1, class: "mp-ambient" })));
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
   OBSERVER WIRING - the six subscribers and their checkboxes
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

function showMeter(rupees) {
  $("hudMeterWrap").hidden = rupees === null;
  if (rupees !== null) $("hudMeter").textContent = fmt.money(rupees);
}

function buildObservers() {
  meterObserver = new FareMeterObserver(showMeter, 0);

  observerList = [
    new MapMarkerObserver(moveCar),
    new EtaPanelObserver(showTelemetry),
    meterObserver,
    new SafetyMonitorObserver((text) => Screens.raiseAlert(text)),
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
   THE DRIVER CARD AND THE TRIP OTP
   ============================================================ */

function renderDriver(ride) {
  const card = $("driverCard");
  if (!ride || !ride.driver || ride.state.key === "RequestedState") {
    card.hidden = true;
    return;
  }
  const d = ride.driver;

  card.hidden = false;
  card.innerHTML =
    '<span class="dcard__ava">' + initialsOf(d.name) + "</span>" +
    '<span class="dcard__who">' +
      "<b>" + fmt.esc(d.name) + "</b>" +
      '<span class="dcard__meta">' + d.rating + " ★ · " + d.trips.toLocaleString("en-IN") + " trips · " +
        fmt.esc(d.langs.join(", ")) + "</span>" +
    "</span>" +
    '<span class="dcard__car">' +
      "<b>" + fmt.esc(d.plate) + "</b>" +
      '<span class="dcard__meta">' + fmt.esc(d.colour + " " + d.model) + "</span>" +
    "</span>" +
    '<span class="dcard__acts">' +
      '<span class="iconbtn" title="' + fmt.esc(d.phone) + '"><svg><use href="#i-phone"/></svg></span>' +
      '<span class="iconbtn" title="Message driver"><svg><use href="#i-chat"/></svg></span>' +
    "</span>";
}

function renderOtp(ride) {
  const card = $("otpCard");
  const showing = ride && ride.otp && ride.state.key === "ArrivedState";
  card.hidden = !showing;
  if (!showing) return;

  card.innerHTML =
    '<span class="otpcard__k">Trip OTP · read this out to your driver</span>' +
    '<span class="otpcard__v">' + ride.otp.split("").map((d) => "<b>" + d + "</b>").join("") + "</span>";
}

/* ============================================================
   TOASTS
   ============================================================ */

function pushToast(html) {
  const wrap = $("toasts");
  if (!wrap) return;
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

const TAGS = ["ALL", "FACTORY", "STRATEGY", "DECORATOR", "OBSERVER", "STATE", "ADAPTER", "FACADE", "SINGLETON"];

function appendLogLine(entry) {
  const body = $("terminal");
  const row = document.createElement("div");
  row.className = "logline";
  row.dataset.tag = entry.tag;
  if (ui.filter !== "ALL" && ui.filter !== entry.tag) row.style.display = "none";

  const time = entry.time.toTimeString().slice(0, 8);
  const msg = fmt.esc(entry.message).replace(/\{\{(.+?)\}\}/g, "<em>$1</em>");

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
  document.querySelectorAll(".filter[data-tag]").forEach((b) =>
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

function toggleDock(force) {
  const dock = $("dock");
  const open = force === undefined ? dock.hidden : force;
  dock.hidden = !open;
  document.body.classList.toggle("has-dock", open);
  $("dockToggle").setAttribute("aria-pressed", String(open));
  if (open) $("terminal").scrollTop = $("terminal").scrollHeight;
}

/* ============================================================
   BOOKING FORM
   ============================================================ */

function setRoute(pickupId, dropId) {
  if (pickupId) ui.pickupId = pickupId;
  if (dropId) ui.dropId = dropId;

  if (ui.pickupId === ui.dropId) {
    const other = LOCATIONS.find((l) => l.id !== ui.pickupId);
    if (dropId) ui.pickupId = other.id; else ui.dropId = other.id;
  }

  $("pickup").value = ui.pickupId;
  $("drop").value = ui.dropId;
  refreshQuote();
}

function renderQuickPlaces() {
  const saved = session().saved;
  const box = $("quickPlaces");

  box.innerHTML = saved.slice(0, 4).map((p) => {
    const loc = findLocation(p.locationId);
    if (!loc) return "";
    return `<button class="quick" data-quick="${p.locationId}" type="button">
      <svg><use href="#i-${p.icon === "home" ? "home" : p.icon === "work" ? "work" : "star"}"/></svg>
      <span><b>${fmt.esc(p.label)}</b><span>${fmt.esc(loc.name)}</span></span>
    </button>`;
  }).join("") +
  `<button class="quick quick--add" data-go="saved" type="button">
     <svg><use href="#i-plus"/></svg><span><b>Add place</b><span>Saved shortcuts</span></span>
   </button>`;
}

function buildLocationSelects() {
  [["pickup", "pickupId"], ["drop", "dropId"]].forEach(([id, key]) => {
    const sel = $(id);
    fillLocationSelect(sel);
    sel.value = ui[key];
    sel.addEventListener("change", () => {
      if (key === "pickupId") setRoute(sel.value, null);
      else setRoute(null, sel.value);
    });
  });

  $("swap").addEventListener("click", () => {
    const from = ui.pickupId;
    ui.pickupId = ui.dropId;
    ui.dropId = from;
    $("pickup").value = ui.pickupId;
    $("drop").value = ui.dropId;
    refreshQuote();
  });

  $("quickPlaces").addEventListener("click", (e) => {
    const b = e.target.closest("[data-quick]");
    if (b) setRoute(null, b.dataset.quick);
  });
}

function buildVehiclePicker() {
  const grid = $("vehicles");
  grid.innerHTML = "";

  // The UI asks the FACTORY what exists. It never lists vehicle classes itself.
  vehicleCatalog = VehicleFactory.available();

  vehicleCatalog.forEach((vehicle) => {
    const b = document.createElement("button");
    b.className = "vcard";
    b.type = "button";
    b.dataset.veh = vehicle.code;
    b.setAttribute("aria-pressed", String(vehicle.code === ui.vehicleType));
    b.innerHTML =
      '<span class="vcard__ico">' + VEHICLE_ICONS[vehicle.iconId] + "</span>" +
      '<span class="vcard__name">' + vehicle.label + "</span>" +
      '<span class="vcard__price" data-price="' + vehicle.code + '">—</span>' +
      '<span class="vcard__meta">' + vehicle.capacity + " seat · " + vehicle.blurb + "</span>";

    b.addEventListener("click", () => {
      ui.vehicleType = vehicle.code;
      grid.querySelectorAll(".vcard").forEach((c) =>
        c.setAttribute("aria-pressed", String(c.dataset.veh === vehicle.code)));
      refreshQuote();
    });
    grid.appendChild(b);
  });
}

function buildAddOnPicker() {
  const box = $("addons");
  box.innerHTML = Object.entries(RIDE_ADDONS).map(([key, a]) => `
    <label class="addon">
      <input type="checkbox" data-addon="${key}">
      <span class="addon__mid"><b>${a.label}</b><span>${a.hint}</span></span>
    </label>`).join("");

  box.addEventListener("change", () => {
    ui.addOns = [...box.querySelectorAll("[data-addon]")]
      .filter((c) => c.checked).map((c) => c.dataset.addon);
    facade.useAddOns(ui.addOns);          // <- the DECORATOR stack rebuilds
    refreshQuote();
  });
}

function buildStrategySelect() {
  const sel = $("strategy");
  sel.innerHTML = Object.keys(FARE_STRATEGIES)
    .map((k) => `<option value="${k}">${FARE_STRATEGY_LABELS[k]}</option>`).join("");
  sel.value = ui.strategyKey;

  sel.addEventListener("change", (e) => {
    ui.strategyKey = e.target.value;
    facade.useFareStrategy(ui.strategyKey);      // <- the Strategy swap, live
    refreshQuote();
  });
}

function buildPaymentSelect() {
  syncPaymentSelect();
  $("payMethod").addEventListener("change", (e) => {
    facade.usePaymentMethod(e.target.value);     // <- picks an ADAPTER
    Screens.wallet();
  });
}

function syncPaymentSelect() {
  const sel = $("payMethod");
  sel.innerHTML = facade.paymentMethods()
    .map((m) => `<option value="${m.key}">${fmt.esc(m.label)}${m.detail ? " — " + fmt.esc(m.detail) : ""}</option>`)
    .join("");
  sel.value = facade.activePayment().key;
}

function refreshQuote() {
  const priced = facade.quote({
    pickupId: ui.pickupId,
    dropId: ui.dropId,
    vehicleType: ui.vehicleType,
  });

  const active = facade.calculator.strategy;
  const stack = active.chain ? active.chain() : null;

  $("receiptStrategy").innerHTML =
    "<span>" + (stack ? "wrapped in " + stack.wraps.length + " decorator(s)" : fmt.esc(active.note)) +
    "</span><b>" + fmt.esc(active.name) + "</b>";

  $("receiptLines").innerHTML =
    priced.quote.lines.map((l) =>
      '<div class="rline' + (l.kind ? " rline--" + l.kind : "") + '"><span>' + fmt.esc(l.label) +
      "</span><span>" + (l.amount < 0 ? "−" : "") + "Rs." + Math.abs(l.amount).toFixed(0) + "</span></div>"
    ).join("") +
    '<div class="rline rline--total"><span>Total</span><span>Rs.' + priced.quote.total + "</span></div>";

  // Price every tile so the picker reads like a real one.
  facade.quoteAllVehicles({ pickupId: ui.pickupId, dropId: ui.dropId, vehicles: vehicleCatalog })
    .forEach((row) => {
      const el = document.querySelector('[data-price="' + row.vehicle.code + '"]');
      if (el) el.textContent = fmt.money(row.total);
    });

  $("hudKm").textContent = priced.km.toFixed(1) + " km";
  $("hudEta").textContent = priced.minutes + " min";

  if (!ui.ride || ui.ride.state.isFinal) {
    drawRoute(priced.pickup, priced.drop, priced.path);
    $("car").style.opacity = 0;
  }
  if (meterObserver) meterObserver.setQuote(priced.quote.total);
  return priced;
}

/* ============================================================
   LIFECYCLE PANEL  (pure reflection of the current State object)
   ============================================================ */

function renderLifecycle(ride) {
  const wrap = $("lifecycle");
  const cancelled = ride && ride.state.key === "CancelledState";
  const current = ride ? ride.state.step : -99;

  wrap.innerHTML = RIDE_STEPS.map((s, i) => {
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
  $("rideIdLabel").textContent = ride ? ride.id : "";
  $("btnCancel").disabled = !ride || !ride.canCancel;
  $("btnStart").hidden = !ride || ride.state.key !== "ArrivedState";

  const done = !ride || ride.state.isFinal;
  $("btnBook").disabled = !done;
  $("btnBook").textContent = ride && ride.state.isFinal ? "Book another ride" : "Book ride";
}

/* ============================================================
   CODE SAMPLES in the reference screen
   ============================================================ */

function highlight(src) {
  const re = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(class|extends|constructor|new|return|const|let|var|if|else|for|get|set|static|throw|super|this|function|null|true|false|of|in|try|catch|forEach)\b|\b(\d+(?:\.\d+)?)\b/g;
  let out = "", last = 0, m;
  while ((m = re.exec(src)) !== null) {
    out += fmt.esc(src.slice(last, m.index));
    const cls = m[1] ? "tk-com" : m[2] ? "tk-str" : m[3] ? "tk-key" : "tk-num";
    out += '<span class="' + cls + '">' + fmt.esc(m[0]) + "</span>";
    last = m.index + m[0].length;
  }
  return out + fmt.esc(src.slice(last));
}

function renderCodeSamples() {
  document.querySelectorAll("pre[data-src]").forEach((pre) => {
    const src = $(pre.dataset.src);
    if (src && !pre.dataset.done) {
      pre.innerHTML = highlight(src.textContent.trim());
      pre.dataset.done = "1";
    }
  });
}

/* ============================================================
   RIDE UPDATES
   ============================================================ */

function onRideUpdate(ride, payload) {
  ui.ride = ride;
  renderLifecycle(ride);
  renderDriver(ride);
  renderOtp(ride);

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
    showMeter(null);
  }

  // The ride is over: hand the record to the session Singleton, and
  // every other screen already has it.
  if (payload && payload.finished && !ride.recorded) {
    ride.recorded = true;
    const record = ride.toTripRecord();
    session().recordTrip(record);
    log("SINGLETON", `SessionManager.recordTrip({{${record.id}}}) - Activity, Wallet and Profile update themselves`);

    router.bumpBadge("activity");
    syncUserChip();

    if (record.status === "completed") {
      setTimeout(() => { if (router.current === "home") Screens.ratingSheet(record.id); }, 1100);
    }
  }
}

/* ============================================================
   SESSION-DRIVEN CHROME
   ============================================================ */

function syncUserChip() {
  const s = session();
  if (!s.user) return;
  $("userAva").textContent = s.initials;
  $("userName").textContent = s.user.name.split(/\s+/)[0];
  $("userPhone").textContent = fmt.money(s.wallet.balance) + " · " + fmt.phone(s.user.phone);
}

function enterApp() {
  $("auth").hidden = true;
  $("app").hidden = false;

  PAYMENT_METHODS.build(session());
  facade.usePaymentMethod("UPI");

  // Anything the rider set on a previous visit comes back with them.
  facade.usePromo(session().promo);
  facade.notifications.muted = !session().prefs.notifications;

  syncUserChip();
  syncPaymentSelect();
  renderQuickPlaces();

  // The screen has to be on before the route is drawn: measuring an
  // SVG path inside a hidden section is not something to rely on.
  router.go("home");
  refreshQuote();
  log("SYSTEM", `Signed in as ${session().user.name}. Nine screens, one SessionManager instance.`);
}

function signOut() {
  if (facade.activeRide) facade.activeRide.dispose();
  ui.ride = null;
  session().signOut();
  $("app").hidden = true;
  $("auth").hidden = false;
  Auth.reset();
}

/* ============================================================
   BOOT
   ============================================================ */

function init() {
  log("SINGLETON", "DispatchLog.getInstance() - one shared log for the whole app.");

  applyTheme();

  facade = new RideBookingFacade({ pushToast, onRideUpdate });
  router = new ScreenRouter("stage", "rail");

  // The map is drawn once and reused by every screen that shows it.
  drawCity();
  ambient = new AmbientTraffic(CITY, 22);
  drawAmbient();
  requestAnimationFrame(tickAmbient);

  // The wallet adapter needs a session, and the session must exist
  // before any screen reads it.
  PAYMENT_METHODS.build(session());
  facade.payments.use(PAYMENT_METHODS.get("UPI"));

  buildLocationSelects();
  buildVehiclePicker();
  buildAddOnPicker();
  buildStrategySelect();
  buildPaymentSelect();
  buildObservers();
  buildConsole();
  Sheet.wire();

  router.buildRail();
  router.register("home");
  router.register("activity", () => Screens.activity());
  router.register("wallet",   () => Screens.wallet());
  router.register("offers",   () => Screens.offers());
  router.register("saved",    () => Screens.saved());
  router.register("safety",   () => Screens.safety());
  router.register("profile",  () => Screens.profile());
  router.register("settings", () => Screens.settings());
  router.register("patterns", () => renderCodeSamples());

  Screens.wire();
  Auth.wire(enterApp);

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
  $("btnStart").addEventListener("click", () => facade.startRide());

  $("btnClear").addEventListener("click", () => {
    $("terminal").innerHTML = "";
    DispatchLog.getInstance().entries = [];
    log("SYSTEM", "Console cleared.");
  });

  $("dockToggle").addEventListener("click", () => toggleDock());
  $("dockClose").addEventListener("click", () => toggleDock(false));
  $("userChip").addEventListener("click", () => router.go("profile"));

  renderLifecycle(null);

  log("SYSTEM", `City loaded: ${LOCATIONS.length} places, ${CITY.nodes.length} junctions, ${CITY.edges.length} road links. Routes are searched across that network, not drawn straight.`);
  log("SYSTEM", `Fleet ready: ${DRIVER_POOL.length} drivers, ${Object.keys(VehicleFactory.registry).length} vehicle classes, ${Object.keys(FARE_STRATEGIES).length} pricing rules.`);

  // Splash, then either straight in or the sign-in screen.
  setTimeout(() => {
    $("splash").classList.add("is-gone");
    setTimeout(() => { $("splash").hidden = true; }, 420);

    if (session().isSignedIn) {
      log("SINGLETON", "SessionManager found a saved account - skipping sign-in");
      enterApp();
    } else {
      $("auth").hidden = false;
      Auth.show("phone");
    }
  }, 1150);
}

document.addEventListener("DOMContentLoaded", init);
