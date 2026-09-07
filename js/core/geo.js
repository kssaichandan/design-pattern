/* ============================================================
   Map geometry - plain helper code, not a design pattern.
   The map is an SVG with a 720 x 420 coordinate space; every
   location below is a point in that space, so distances in the
   app are derived from the map rather than made up.
   ============================================================ */

/** 1 map pixel = 0.05 km, i.e. 200 px across the map = 10 km. */
const KM_PER_PX = 0.05;

const LOCATIONS = [
  { id: "kukatpally",   name: "Kukatpally",        x:  95, y:  95 },
  { id: "hitech",       name: "Hitech City",       x: 250, y: 175 },
  { id: "gachibowli",   name: "Gachibowli",        x: 170, y: 300 },
  { id: "jubilee",      name: "Jubilee Hills",     x: 395, y: 120 },
  { id: "secunderabad", name: "Secunderabad Stn",  x: 560, y:  95 },
  { id: "charminar",    name: "Charminar",         x: 470, y: 330 },
  { id: "airport",      name: "RGIA Airport",      x: 630, y: 375 },
];

const findLocation = (id) => LOCATIONS.find((l) => l.id === id);

/**
 * A polyline route with the two things the Observer pattern needs
 * from it: where the car is at progress t, and which way it faces.
 */
class RoutePath {
  constructor(points) {
    this.points = points;
    this.segments = [];
    this.lengthPx = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      this.segments.push({ a, b, len, start: this.lengthPx });
      this.lengthPx += len;
    }
  }

  /** @param {number} t 0 = start of route, 1 = destination */
  pointAt(t) {
    const target = Math.max(0, Math.min(1, t)) * this.lengthPx;
    for (const s of this.segments) {
      if (target <= s.start + s.len || s === this.segments[this.segments.length - 1]) {
        const local = s.len === 0 ? 0 : (target - s.start) / s.len;
        return {
          x: s.a.x + (s.b.x - s.a.x) * local,
          y: s.a.y + (s.b.y - s.a.y) * local,
        };
      }
    }
    return this.points[this.points.length - 1];
  }

  /** Degrees of rotation for the car marker. */
  headingAt(t) {
    const p1 = this.pointAt(Math.max(0, t - 0.01));
    const p2 = this.pointAt(Math.min(1, t + 0.01));
    return (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
  }

  toSvgPath() {
    return this.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  }
}

/**
 * Cars follow streets, not straight lines, so a route bends twice:
 * across, then down, then across again.
 */
function buildRoute(from, to) {
  const bendX = from.x + (to.x - from.x) * 0.62;
  const points = [
    { x: from.x, y: from.y },
    { x: bendX,  y: from.y },
    { x: bendX,  y: to.y   },
    { x: to.x,   y: to.y   },
  ];
  return new RoutePath(points);
}

/** Road distance (following the bends), rounded to one decimal. */
function roadKm(path) {
  return +(path.lengthPx * KM_PER_PX).toFixed(1);
}
