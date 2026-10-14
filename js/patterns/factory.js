/* ============================================================
   PATTERN 1 - FACTORY  (creational)
   ------------------------------------------------------------
   PROBLEM: a ride app supports Bike, Auto, Sedan and SUV, and
   more get added later (e-rickshaw, XL, rentals...). If the
   booking code says:

       if (type === "BIKE")      vehicle = new Bike();
       else if (type === "AUTO") vehicle = new Auto();
       else if (type === "SUV")  vehicle = new SUV();

   then every screen that creates a vehicle has to be edited
   whenever a new category launches.

   SOLUTION: one class owns creation. Callers say WHAT they want
   ("SUV"), never HOW it is built. Adding a category = registering
   one new class in the factory; no other file changes.
   ============================================================ */

/* ---------- the product interface (abstract base class) ---------- */

class Vehicle {
  constructor() {
    if (new.target === Vehicle) {
      throw new Error("Vehicle is abstract - create a concrete vehicle instead.");
    }
  }

  // Subclasses must supply these. They are the contract the rest
  // of the app relies on, so the app never needs to know the subclass.
  get code()     { throw new Error("not implemented"); }
  get label()    { throw new Error("not implemented"); }
  get capacity() { throw new Error("not implemented"); }
  get baseFare() { throw new Error("not implemented"); }
  get perKm()    { throw new Error("not implemented"); }
  get perMin()   { throw new Error("not implemented"); }
  get speedKmph(){ throw new Error("not implemented"); }
  get iconId()   { return this.code.toLowerCase(); }

  /** One line of sell copy under the tile. Optional - default is empty. */
  get blurb()    { return ""; }

  /** Shared behaviour every vehicle inherits for free. */
  tripMinutes(km) {
    return Math.max(3, Math.round((km / this.speedKmph) * 60));
  }

  describe() {
    return `${this.label} - up to ${this.capacity} seat(s), Rs.${this.perKm}/km`;
  }
}

/* ---------- concrete products ---------- */

class Bike extends Vehicle {
  get code()      { return "BIKE"; }
  get label()     { return "Bike"; }
  get capacity()  { return 1; }
  get baseFare()  { return 20; }
  get perKm()     { return 6; }
  get perMin()    { return 0.8; }
  get speedKmph() { return 32; }   // weaves through traffic - fastest
  get blurb()     { return "Cheapest, beats the jam"; }
}

class Auto extends Vehicle {
  get code()      { return "AUTO"; }
  get label()     { return "Auto"; }
  get capacity()  { return 3; }
  get baseFare()  { return 30; }
  get perKm()     { return 11; }
  get perMin()    { return 1.0; }
  get speedKmph() { return 24; }
  get blurb()     { return "Metered, three up"; }
}

class SedanCab extends Vehicle {
  get code()      { return "SEDAN"; }
  get label()     { return "Sedan"; }
  get capacity()  { return 4; }
  get baseFare()  { return 55; }
  get perKm()     { return 16; }
  get perMin()    { return 1.5; }
  get speedKmph() { return 27; }
  get blurb()     { return "AC, four seats"; }
}

class SuvCab extends Vehicle {
  get code()      { return "SUV"; }
  get label()     { return "SUV"; }
  get capacity()  { return 6; }
  get baseFare()  { return 90; }
  get perKm()     { return 22; }
  get perMin()    { return 2.0; }
  get speedKmph() { return 26; }
  get blurb()     { return "Six seats, big boot"; }
}

/**
 * The two categories added AFTER the app shipped. Look at what it
 * cost: one class each, plus one line each in the registry below.
 * No screen, no booking code and no pricing rule was touched -
 * which is the whole argument for the Factory pattern.
 */
class ERickshaw extends Vehicle {
  get code()      { return "ERICK"; }
  get label()     { return "E-Rick"; }
  get capacity()  { return 3; }
  get baseFare()  { return 25; }
  get perKm()     { return 8; }
  get perMin()    { return 0.7; }
  get speedKmph() { return 20; }   // slow, but the cheapest thing with a roof
  get blurb()     { return "Electric - zero tailpipe"; }
}

class PrimeSedan extends Vehicle {
  get code()      { return "PRIME"; }
  get label()     { return "Prime"; }
  get capacity()  { return 4; }
  get baseFare()  { return 120; }
  get perKm()     { return 26; }
  get perMin()    { return 2.4; }
  get speedKmph() { return 29; }
  get blurb()     { return "Top-rated drivers only"; }
}

/* ---------- the factory ---------- */

class VehicleFactory {
  /**
   * Registry of type-code -> class. Adding "E-Rickshaw" tomorrow is
   * one new class plus one line here. Nothing else in the app changes.
   */
  static registry = {
    BIKE:  Bike,
    ERICK: ERickshaw,
    AUTO:  Auto,
    SEDAN: SedanCab,
    SUV:   SuvCab,
    PRIME: PrimeSedan,
  };

  /** The single place in the whole app where a vehicle is constructed. */
  static create(type) {
    const VehicleClass = VehicleFactory.registry[type];

    if (!VehicleClass) {
      log("FACTORY", `Unknown vehicle type {{${type}}} - refusing to build.`);
      throw new Error(`VehicleFactory cannot build "${type}"`);
    }

    const vehicle = new VehicleClass();
    log("FACTORY", `VehicleFactory.create("${type}") -> new {{${VehicleClass.name}}}  |  ${vehicle.describe()}`);
    return vehicle;
  }

  /** Lets the UI draw the vehicle picker without hard-coding the list. */
  static available() {
    return Object.keys(VehicleFactory.registry).map((t) => VehicleFactory.create(t));
  }
}
