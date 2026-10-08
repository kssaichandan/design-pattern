/* ============================================================
   Map geometry + the city itself - plain helper code, NOT a
   design pattern.

   The map is an SVG with a 720 x 420 coordinate space. Everything
   the app knows about distance comes from this file: the city has
   a real road network (a planar graph built from named roads),
   and routes are found by shortest-travel-time search across it.
   Nothing here is a straight line between two dots.
   ============================================================ */

/** 1 map pixel = 0.05 km, i.e. 200 px across the map = 10 km. */
const KM_PER_PX = 0.05;

/* ------------------------------------------------------------
   1. LANDMARKS the rider can pick
   ------------------------------------------------------------ */

const LOCATIONS = [
  { id: "kukatpally",   name: "Kukatpally",       kind: "suburb",   x:  95, y:  95 },
  { id: "hitech",       name: "Hitech City",      kind: "business", x: 250, y: 175 },
  { id: "gachibowli",   name: "Gachibowli",       kind: "business", x: 170, y: 300 },
  { id: "jubilee",      name: "Jubilee Hills",    kind: "suburb",   x: 395, y: 120 },
  { id: "secunderabad", name: "Secunderabad Stn", kind: "rail",     x: 560, y:  95 },
  { id: "charminar",    name: "Charminar",        kind: "heritage", x: 470, y: 330 },
  { id: "airport",      name: "RGIA Airport",     kind: "airport",  x: 630, y: 375 },
];

const findLocation = (id) => LOCATIONS.find((l) => l.id === id);

/* ------------------------------------------------------------
   2. TERRAIN - the things roads have to go around
   ------------------------------------------------------------ */

/** Hussain Sagar. Roads stop at its bank; a route has to go round. */
const WATER = [
  {
    name: "Hussain Sagar",
    points: [
      { x: 452, y: 150 }, { x: 470, y: 128 }, { x: 500, y: 122 }, { x: 524, y: 134 },
      { x: 532, y: 158 }, { x: 528, y: 186 }, { x: 512, y: 205 }, { x: 486, y: 210 },
      { x: 462, y: 198 }, { x: 448, y: 174 },
    ],
  },
];

/** The Musi, running east-west across the old city. */
const RIVER = {
  name: "Musi River",
  points: [
    { x: 352, y: 296 }, { x: 400, y: 286 }, { x: 448, y: 292 },
    { x: 500, y: 284 }, { x: 556, y: 292 }, { x: 612, y: 282 }, { x: 720, y: 288 },
  ],
};

const PARKS = [
  { name: "KBR Park",       points: [{ x: 322, y: 132 }, { x: 372, y: 124 }, { x: 386, y: 160 }, { x: 350, y: 178 }, { x: 316, y: 164 }] },
  { name: "Botanical Gdn",  points: [{ x: 196, y: 214 }, { x: 240, y: 208 }, { x: 248, y: 240 }, { x: 208, y: 250 }] },
  { name: "Public Gardens", points: [{ x: 424, y: 232 }, { x: 462, y: 226 }, { x: 468, y: 254 }, { x: 430, y: 260 }] },
];

/* ------------------------------------------------------------
   3. THE ROAD NETWORK
   ------------------------------------------------------------
   Each road is a named polyline with a class. The class sets how
   fast traffic moves on it, which is what makes the router prefer
   the expressway to a lane even when the lane is shorter.
   ------------------------------------------------------------ */

const ROAD_SPEED = {   // km/h, free-flow
  highway:  62,
  arterial: 38,
  street:   22,
};

const NAMED_ROADS = [
  { name: "Outer Ring Road", cls: "highway", points: [
    { x:  62, y:  52 }, { x:  44, y: 150 }, { x:  58, y: 252 }, { x: 118, y: 336 },
    { x: 232, y: 382 }, { x: 366, y: 400 }, { x: 502, y: 396 }, { x: 604, y: 386 }, { x: 662, y: 356 } ] },

  { name: "PVNR Expressway", cls: "highway", points: [
    { x: 286, y: 268 }, { x: 372, y: 316 }, { x: 468, y: 354 }, { x: 556, y: 372 }, { x: 630, y: 375 } ] },

  { name: "NH-44", cls: "highway", points: [
    { x: 548, y:  28 }, { x: 560, y:  95 }, { x: 552, y: 168 }, { x: 546, y: 236 },
    { x: 522, y: 296 }, { x: 470, y: 330 } ] },

  { name: "NH-65 Mumbai Hwy", cls: "highway", points: [
    { x:  95, y:  95 }, { x: 166, y: 128 }, { x: 250, y: 175 }, { x: 318, y: 206 }, { x: 396, y: 224 } ] },

  { name: "Old Mumbai Rd", cls: "arterial", points: [
    { x: 250, y: 175 }, { x: 226, y: 232 }, { x: 196, y: 268 }, { x: 170, y: 300 } ] },

  { name: "Gachibowli Link", cls: "arterial", points: [
    { x: 170, y: 300 }, { x: 214, y: 322 }, { x: 286, y: 268 } ] },

  { name: "Jubilee Hills Rd 36", cls: "arterial", points: [
    { x: 250, y: 175 }, { x: 312, y: 152 }, { x: 356, y: 124 }, { x: 395, y: 120 } ] },

  { name: "Banjara Hills Rd 1", cls: "arterial", points: [
    { x: 395, y: 120 }, { x: 412, y: 166 }, { x: 408, y: 214 }, { x: 396, y: 224 } ] },

  { name: "Necklace Rd", cls: "arterial", points: [
    { x: 440, y: 196 }, { x: 438, y: 158 }, { x: 452, y: 126 }, { x: 486, y: 108 },
    { x: 522, y: 112 }, { x: 540, y: 140 } ] },

  { name: "Tank Bund Rd", cls: "arterial", points: [
    { x: 540, y: 140 }, { x: 544, y: 172 }, { x: 530, y: 206 }, { x: 502, y: 224 }, { x: 466, y: 222 } ] },

  { name: "Sardar Patel Rd", cls: "arterial", points: [
    { x: 560, y:  95 }, { x: 522, y: 112 } ] },

  { name: "Rajiv Gandhi Rd", cls: "arterial", points: [
    { x: 396, y: 224 }, { x: 432, y: 262 }, { x: 448, y: 292 }, { x: 470, y: 330 } ] },

  { name: "Charminar–Airport Rd", cls: "arterial", points: [
    { x: 470, y: 330 }, { x: 540, y: 344 }, { x: 596, y: 360 }, { x: 630, y: 375 } ] },

  { name: "Secunderabad Link", cls: "arterial", points: [
    { x: 560, y:  95 }, { x: 596, y: 132 }, { x: 606, y: 190 }, { x: 590, y: 246 }, { x: 546, y: 236 } ] },

  { name: "Banjara Hills Rd 12", cls: "arterial", points: [
    { x: 395, y: 120 }, { x: 418, y: 152 }, { x: 432, y: 178 }, { x: 440, y: 196 } ] },

  { name: "Basheerbagh Rd", cls: "arterial", points: [
    { x: 466, y: 222 }, { x: 432, y: 230 }, { x: 396, y: 224 } ] },

  { name: "Kukatpally Main", cls: "arterial", points: [
    { x:  95, y:  95 }, { x: 104, y: 160 }, { x: 128, y: 214 }, { x: 170, y: 260 }, { x: 170, y: 300 } ] },
];

/* ---------- a jittered minor-street grid, kept out of the water ---------- */

/** Deterministic pseudo-random in [0,1) so the city looks the same every load. */
function cityNoise(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inWater = (pt) => WATER.some((w) => pointInPolygon(pt, w.points));

function buildMinorStreets() {
  const roads = [];
  const wob = (i, j) => (cityNoise(i, j) - 0.5) * 26;

  for (let r = 0; r < 7; r++) {                     // east-west lanes
    const y = 34 + r * 58;
    const pts = [];
    for (let c = 0; c <= 9; c++) pts.push({ x: c * 80, y: y + wob(r, c) });
    roads.push({ name: "", cls: "street", points: pts });
  }
  for (let c = 0; c < 9; c++) {                     // north-south lanes
    const x = 40 + c * 82;
    const pts = [];
    for (let r = 0; r <= 7; r++) pts.push({ x: x + wob(c + 40, r), y: r * 60 });
    roads.push({ name: "", cls: "street", points: pts });
  }
  return roads;
}

/** Every road in the city, majors first so they win when drawn. */
const ROADS = NAMED_ROADS.concat(buildMinorStreets());

/* ------------------------------------------------------------
   4. TURNING THE ROADS INTO A GRAPH
   ------------------------------------------------------------
   Roads are drawn as free polylines, so they cross wherever they
   cross. This splits every segment at each crossing and welds
   shared corners, producing a proper junction network to search.
   ------------------------------------------------------------ */

const EPS = 1e-9;

/** Where two segments cross, as parameters along each, or null. */
function segIntersect(a1, a2, b1, b2) {
  const rx = a2.x - a1.x, ry = a2.y - a1.y;
  const sx = b2.x - b1.x, sy = b2.y - b1.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < EPS) return null;                 // parallel
  const t = ((b1.x - a1.x) * sy - (b1.y - a1.y) * sx) / denom;
  const u = ((b1.x - a1.x) * ry - (b1.y - a1.y) * rx) / denom;
  if (t < EPS || t > 1 - EPS || u < EPS || u > 1 - EPS) return null;
  return { t, u };
}

class RoadNetwork {
  constructor(roads) {
    this.nodes = [];            // { x, y }
    this.adj = new Map();       // nodeId -> [{ to, cost, km, cls, name }]
    this.edges = [];            // flattened, for drawing
    this._ids = new Map();
    this._build(roads);
  }

  _nodeId(pt) {
    const key = Math.round(pt.x * 2) + ":" + Math.round(pt.y * 2);
    if (this._ids.has(key)) return this._ids.get(key);
    const id = this.nodes.length;
    this.nodes.push({ x: pt.x, y: pt.y });
    this.adj.set(id, []);
    this._ids.set(key, id);
    return id;
  }

  _build(roads) {
    // Flatten every road into segments, dropping anything under water.
    const segs = [];
    roads.forEach((road) => {
      for (let i = 0; i < road.points.length - 1; i++) {
        const a = road.points[i], b = road.points[i + 1];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (inWater(mid) || inWater(a) || inWater(b)) continue;
        segs.push({ a, b, cls: road.cls, name: road.name, cuts: [] });
      }
    });

    // Record every crossing as a cut on both segments.
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const hit = segIntersect(segs[i].a, segs[i].b, segs[j].a, segs[j].b);
        if (!hit) continue;
        segs[i].cuts.push(hit.t);
        segs[j].cuts.push(hit.u);
      }
    }

    // Split at the cuts and wire the pieces into the graph.
    segs.forEach((seg) => {
      const ts = [0].concat(seg.cuts, [1]).sort((p, q) => p - q);
      const at = (t) => ({ x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t });
      for (let k = 0; k < ts.length - 1; k++) {
        const p = at(ts[k]), q = at(ts[k + 1]);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 1.5) continue;
        this._link(this._nodeId(p), this._nodeId(q), seg.cls, seg.name);
      }
    });
  }

  _link(from, to, cls, name) {
    if (from === to) return;
    const a = this.nodes[from], b = this.nodes[to];
    const km = Math.hypot(b.x - a.x, b.y - a.y) * KM_PER_PX;
    // Congestion is fixed per stretch of road, so the same trip routes
    // and prices the same way twice - a demo that reshuffles is useless.
    const jam = 0.72 + cityNoise(from, to) * 0.5;
    const hours = km / (ROAD_SPEED[cls] * jam);

    // Cost is mostly travel time, with a distance term mixed in. On pure
    // time the router will happily add 20 km of expressway to save thirty
    // seconds - technically optimal, obviously wrong to the person paying
    // by the kilometre.
    const cost = hours * 0.72 + (km / 45) * 0.28;

    this.adj.get(from).push({ to, cost, km, cls, name });
    this.adj.get(to).push({ to: from, cost, km, cls, name });
    this.edges.push({ a, b, cls, name });
  }

  /** The junction a rider standing at `pt` would walk out to. */
  nearestNode(pt) {
    let best = 0, bestD = Infinity;
    this.nodes.forEach((n, i) => {
      const d = (n.x - pt.x) * (n.x - pt.x) + (n.y - pt.y) * (n.y - pt.y);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  /** Dijkstra on travel time. Returns the chain of junctions, or null. */
  shortestPath(startId, goalId) {
    const dist = new Map([[startId, 0]]);
    const prev = new Map();
    const seen = new Set();
    const queue = [{ id: startId, d: 0 }];

    while (queue.length) {
      queue.sort((p, q) => p.d - q.d);
      const { id } = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      if (id === goalId) break;

      for (const edge of this.adj.get(id) || []) {
        if (seen.has(edge.to)) continue;
        const alt = dist.get(id) + edge.cost;
        if (alt < (dist.has(edge.to) ? dist.get(edge.to) : Infinity)) {
          dist.set(edge.to, alt);
          prev.set(edge.to, { from: id, edge });
          queue.push({ id: edge.to, d: alt });
        }
      }
    }

    if (startId === goalId) return [{ id: startId, cls: "street", name: "" }];
    if (!prev.has(goalId)) return null;

    const chain = [];
    let cur = goalId;
    while (cur !== startId) {
      const step = prev.get(cur);
      if (!step) break;
      chain.unshift({ id: cur, cls: step.edge.cls, name: step.edge.name });
      cur = step.from;
    }
    chain.unshift({ id: startId, cls: chain.length ? chain[0].cls : "street", name: "" });
    return chain;
  }
}

const CITY = new RoadNetwork(ROADS);

/* ------------------------------------------------------------
   5. A ROUTE ALONG THOSE ROADS
   ------------------------------------------------------------ */

/**
 * A polyline route that knows three things the rest of the app
 * needs: where the car is at progress t, which way it faces, and
 * what kind of road it is on right there - so traffic.js can pick
 * a believable speed for that stretch.
 */
class RoutePath {
  constructor(points, classes, names) {
    this.points = points;
    this.segments = [];
    this.lengthPx = 0;
    classes = classes || [];
    names = names || [];

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      this.segments.push({
        a, b, len,
        start: this.lengthPx,
        cls:  classes[i] || "street",
        name: names[i] || "",
      });
      this.lengthPx += len;
    }
  }

  _segmentAt(t) {
    const target = Math.max(0, Math.min(1, t)) * this.lengthPx;
    for (const s of this.segments) {
      if (target <= s.start + s.len) return { s, local: s.len === 0 ? 0 : (target - s.start) / s.len };
    }
    const last = this.segments[this.segments.length - 1];
    return last ? { s: last, local: 1 } : null;
  }

  /** @param {number} t 0 = start of route, 1 = destination */
  pointAt(t) {
    const hit = this._segmentAt(t);
    if (!hit) return this.points[0];
    return {
      x: hit.s.a.x + (hit.s.b.x - hit.s.a.x) * hit.local,
      y: hit.s.a.y + (hit.s.b.y - hit.s.a.y) * hit.local,
    };
  }

  /** Degrees of rotation for the car marker. */
  headingAt(t) {
    const p1 = this.pointAt(Math.max(0, t - 0.008));
    const p2 = this.pointAt(Math.min(1, t + 0.008));
    return (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
  }

  /** Road class under the car right now: highway | arterial | street. */
  classAt(t) {
    const hit = this._segmentAt(t);
    return hit ? hit.s.cls : "street";
  }

  /** Name of the road under the car, "" for an unnamed lane. */
  roadAt(t) {
    const hit = this._segmentAt(t);
    return hit ? hit.s.name : "";
  }

  /** How sharply the road bends `ahead` down the route, in degrees. */
  turnAt(t, ahead) {
    const h1 = this.headingAt(t);
    const h2 = this.headingAt(Math.min(1, t + (ahead || 0.035)));
    const d = Math.abs(h2 - h1) % 360;
    return d > 180 ? 360 - d : d;
  }

  /** The named roads this route uses, in order - the turn-by-turn list. */
  legNames() {
    const out = [];
    this.segments.forEach((s) => {
      if (s.name && out[out.length - 1] !== s.name) out.push(s.name);
    });
    return out;
  }

  /** Shortest distance from a point to this route, in map pixels. */
  distanceFrom(pt) {
    let best = Infinity;
    this.segments.forEach(({ a, b, len }) => {
      const t = len === 0 ? 0
        : Math.max(0, Math.min(1, ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / (len * len)));
      best = Math.min(best, Math.hypot(pt.x - (a.x + (b.x - a.x) * t), pt.y - (a.y + (b.y - a.y) * t)));
    });
    return best;
  }

  toSvgPath() {
    return this.points.map((p, i) => (i === 0 ? "M" : "L") + " " + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ");
  }
}

/**
 * Route from one point to another ALONG THE ROADS. Both ends snap
 * to the nearest junction, the network is searched for the quickest
 * way between them, and the short hops from the kerb to that
 * junction are stitched on either end.
 */
function buildRoute(from, to) {
  const startId = CITY.nearestNode(from);
  const goalId  = CITY.nearestNode(to);
  const chain   = CITY.shortestPath(startId, goalId);

  if (!chain || chain.length < 2) {
    // Nothing connected (shouldn't happen) - fall back to a bent line.
    const bendX = from.x + (to.x - from.x) * 0.62;
    return new RoutePath(
      [{ x: from.x, y: from.y }, { x: bendX, y: from.y }, { x: bendX, y: to.y }, { x: to.x, y: to.y }]
    );
  }

  const points  = [{ x: from.x, y: from.y }];
  const classes = [];
  const names   = [];

  chain.forEach((step, i) => {
    const n = CITY.nodes[step.id];
    const prev = points[points.length - 1];
    if (Math.hypot(n.x - prev.x, n.y - prev.y) < 0.6) return;
    points.push({ x: n.x, y: n.y });
    classes.push(i === 0 ? "street" : step.cls);
    names.push(i === 0 ? "" : step.name);
  });

  const last = points[points.length - 1];
  if (Math.hypot(to.x - last.x, to.y - last.y) > 0.6) {
    points.push({ x: to.x, y: to.y });
    classes.push("street");
    names.push("");
  }

  return new RoutePath(points, classes, names);
}

/** Road distance (following every bend), rounded to one decimal. */
function roadKm(path) {
  return +(path.lengthPx * KM_PER_PX).toFixed(1);
}
