/* ============================================================
   screens.js - everything that is not the booking screen.
   ------------------------------------------------------------
   Activity, Wallet, Offers, Saved places, Safety, Profile and
   Settings. Presentation only: not one of these functions prices
   a ride, builds a vehicle or decides what a ride may do next.
   They read the SessionManager singleton and call the facade.
   ============================================================ */

/** Safety events raised by SafetyMonitorObserver during this session. */
const SAFETY_ALERTS = [];

const Screens = {

  /* ==========================================================
     ACTIVITY - the trip history
     ========================================================== */

  activityFilter: "all",

  activity() {
    const s = session();
    const stats = s.stats;

    document.getElementById("activityStats").innerHTML = [
      { k: "Trips taken",   v: stats.trips },
      { k: "Distance",      v: stats.km + " km" },
      { k: "Total spent",   v: fmt.money(stats.spent) },
      { k: "Cancelled",     v: stats.cancelled },
    ].map((t) => `<div class="stat"><span class="stat__k">${t.k}</span><span class="stat__v">${t.v}</span></div>`).join("");

    const rows = s.history.filter((t) =>
      this.activityFilter === "all" ? true : t.status === this.activityFilter);

    const list = document.getElementById("tripList");

    if (!rows.length) {
      list.innerHTML = `<div class="empty">
        <p>No trips here yet.</p>
        <button class="btn btn--alt" data-go="home" type="button">Book your first ride</button>
      </div>`;
      return;
    }

    list.innerHTML = rows.map((t) => `
      <button class="trip" data-trip="${t.id}" type="button">
        <span class="trip__ico trip__ico--${t.status}">
          <svg><use href="#${t.status === "cancelled" ? "i-close" : "i-book"}"/></svg>
        </span>
        <span class="trip__mid">
          <span class="trip__route">${fmt.esc(t.pickup)} <em>to</em> ${fmt.esc(t.drop)}</span>
          <span class="trip__meta">${fmt.when(t.at)} · ${fmt.esc(t.driver)} · ${fmt.esc(t.vehicle)}</span>
        </span>
        <span class="trip__right">
          <span class="trip__fare">${fmt.money(t.fare)}</span>
          <span class="trip__tag trip__tag--${t.status}">${t.status}</span>
          ${t.rating ? `<span class="trip__stars">${fmt.stars(t.rating)}</span>` : ""}
        </span>
      </button>`).join("");
  },

  /** The receipt sheet, opened by tapping a trip. */
  tripSheet(tripId) {
    const t = session().history.find((x) => x.id === tripId);
    if (!t) return;

    const cancelled = t.status === "cancelled";

    Sheet.open(`
      <div class="sheet__hd">
        <h3>${cancelled ? "Cancelled ride" : "Trip receipt"}</h3>
        <button class="iconbtn" data-sheet-close type="button" aria-label="Close"><svg><use href="#i-close"/></svg></button>
      </div>
      <div class="sheet__body">
        <div class="rcpt__total">${fmt.money(t.fare)}</div>
        <div class="rcpt__sub">${fmt.when(t.at)} · ${fmt.esc(t.id)}</div>

        <div class="rcpt__route">
          <div class="rcpt__leg"><span class="dot dot--a"></span>${fmt.esc(t.pickup)}</div>
          <div class="rcpt__leg"><span class="dot dot--b"></span>${fmt.esc(t.drop)}</div>
        </div>

        <div class="kvlist">
          <div class="kv"><span>Driver</span><b>${fmt.esc(t.driver)}</b></div>
          <div class="kv"><span>Vehicle</span><b>${fmt.esc(t.vehicle)} · ${fmt.esc(t.plate)}</b></div>
          <div class="kv"><span>Distance</span><b>${t.km} km</b></div>
          <div class="kv"><span>Duration</span><b>${t.minutes} min</b></div>
          <div class="kv"><span>Pricing rule</span><b class="mono">${fmt.esc(t.strategy)}</b></div>
          <div class="kv"><span>Paid with</span><b>${fmt.esc(t.payment)}</b></div>
          ${t.tip ? `<div class="kv"><span>Tip included</span><b>${fmt.money(t.tip)}</b></div>` : ""}
          ${t.rating ? `<div class="kv"><span>You rated</span><b>${fmt.stars(t.rating)}</b></div>` : ""}
        </div>

        <div class="sheet__actions">
          ${!cancelled && !t.rating
            ? `<button class="btn btn--alt" data-rate="${t.id}" type="button">Rate this trip</button>` : ""}
          <button class="btn btn--ghost" data-rebook="${t.pickupId}|${t.dropId}" type="button">Book this route again</button>
        </div>
      </div>`);
  },

  /** Rate the driver, optionally tip. Both land on the session singleton. */
  ratingSheet(tripId) {
    const t = session().history.find((x) => x.id === tripId);
    if (!t) return;

    Sheet.open(`
      <div class="sheet__hd">
        <h3>How was your ride?</h3>
        <button class="iconbtn" data-sheet-close type="button" aria-label="Close"><svg><use href="#i-close"/></svg></button>
      </div>
      <div class="sheet__body">
        <div class="ratedriver">
          <span class="bigava">${initialsOf(t.driver)}</span>
          <div>
            <b>${fmt.esc(t.driver)}</b>
            <span class="cardnote">${fmt.esc(t.pickup)} to ${fmt.esc(t.drop)} · ${fmt.money(t.fare)}</span>
          </div>
        </div>

        <div class="starpick" id="starPick">
          ${[1, 2, 3, 4, 5].map((n) =>
            `<button class="starpick__b" data-star="${n}" type="button" aria-label="${n} stars">
               <svg><use href="#i-star"/></svg></button>`).join("")}
        </div>
        <p class="starpick__word" id="starWord">Tap a star</p>

        <span class="field__label">Add a tip</span>
        <div class="tiprow" id="tipRow">
          ${[0, 20, 30, 50].map((n) =>
            `<button class="tipbtn" data-tip="${n}" type="button" aria-pressed="${n === 0}">${n ? "Rs." + n : "No tip"}</button>`).join("")}
        </div>

        <label class="field">
          <span class="field__label">Anything to add? · optional</span>
          <input id="rateNote" type="text" maxlength="80" placeholder="Clean car, knew the shortcuts…">
        </label>

        <button class="btn btn--go" id="rateSubmit" type="button" disabled>Submit rating</button>
      </div>`, (root) => {
      let stars = 0;
      let tip = 0;
      const words = ["", "Poor", "Not great", "Fine", "Good", "Excellent"];

      root.querySelector("#starPick").addEventListener("click", (e) => {
        const b = e.target.closest("[data-star]");
        if (!b) return;
        stars = +b.dataset.star;
        root.querySelectorAll(".starpick__b").forEach((s, i) =>
          s.classList.toggle("is-on", i < stars));
        root.querySelector("#starWord").textContent = words[stars];
        root.querySelector("#rateSubmit").disabled = false;
      });

      root.querySelector("#tipRow").addEventListener("click", (e) => {
        const b = e.target.closest("[data-tip]");
        if (!b) return;
        tip = +b.dataset.tip;
        root.querySelectorAll(".tipbtn").forEach((x) =>
          x.setAttribute("aria-pressed", String(x === b)));
      });

      root.querySelector("#rateSubmit").addEventListener("click", () => {
        const note = root.querySelector("#rateNote").value.trim();
        session().rateTrip(tripId, stars, tip, note);
        if (tip) session().spend(tip, "Tip · " + t.driver);
        log("SINGLETON", `SessionManager.rateTrip(${tripId}, {{${stars}★}}${tip ? ", tip Rs." + tip : ""}) - written once, read by every screen`);
        Sheet.close();
        pushToast(`Thanks — you rated ${fmt.esc(t.driver)} ${stars}★.`);
        Screens.activity();
      });
    });
  },

  /* ==========================================================
     WALLET - the Adapter screen
     ========================================================== */

  wallet() {
    const s = session();

    document.getElementById("walletBalance").textContent = fmt.money(s.wallet.balance);

    document.getElementById("topUpRow").innerHTML = [100, 250, 500, 1000]
      .map((n) => `<button class="chipbtn" data-topup="${n}" type="button">+ ${fmt.money(n)}</button>`)
      .join("");

    const active = facade.activePayment();
    document.getElementById("methodList").innerHTML = facade.paymentMethods().map((m) => `
      <button class="method ${m.key === active.key ? "is-on" : ""}" data-method="${m.key}" type="button">
        <span class="method__badge">${fmt.esc(m.id)}</span>
        <span class="method__mid">
          <b>${fmt.esc(m.label)}</b>
          <span class="method__detail">${fmt.esc(m.detail)}</span>
        </span>
        <span class="method__adapter mono">${m.constructor.name}</span>
        <span class="method__tick"><svg><use href="#i-check"/></svg></span>
      </button>`).join("");

    const txns = s.wallet.txns;
    document.getElementById("txnList").innerHTML = txns.length
      ? txns.map((t) => `
        <div class="txn">
          <span class="txn__ico txn__ico--${t.kind}">${t.kind === "credit" ? "+" : "−"}</span>
          <span class="txn__mid">
            <b>${fmt.esc(t.label)}</b>
            <span class="txn__meta">${fmt.when(t.at)} · ${fmt.esc(t.id)}</span>
          </span>
          <span class="txn__amt txn__amt--${t.kind}">${t.kind === "credit" ? "+" : "−"}${fmt.money(t.amount)}</span>
        </div>`).join("")
      : `<div class="empty"><p>Nothing here yet.</p></div>`;
  },

  /* ==========================================================
     OFFERS - the Decorator screen
     ========================================================== */

  offers() {
    const active = session().promo;

    const box = document.getElementById("promoActive");
    box.hidden = !active;
    if (active) {
      box.innerHTML = `
        <span class="promoactive__tag">Applied</span>
        <b>${fmt.esc(active.code)}</b>
        <span>${fmt.esc(active.title)}</span>
        <button class="linkbtn" id="promoClear" type="button">Remove</button>`;
      box.querySelector("#promoClear").addEventListener("click", () => {
        session().clearPromo();
        facade.usePromo(null);
        pushToast("Promo code removed.");
        Screens.offers();
        refreshQuote();
      });
    }

    document.getElementById("offerGrid").innerHTML = PROMO_CODES.map((p) => {
      const on = active && active.code === p.code;
      return `
        <article class="offer ${on ? "is-on" : ""}">
          <div class="offer__stub">
            <span class="offer__code">${p.code}</span>
            <span class="offer__value">${p.kind === "FLAT" ? "Rs." + p.value + " off" : p.value + "% off"}</span>
          </div>
          <div class="offer__body">
            <h3>${fmt.esc(p.title)}</h3>
            <p>${fmt.esc(p.terms)}</p>
            <p class="offer__pattern mono">new PromoCodeDecorator(fare, "${p.code}")</p>
          </div>
          <button class="btn ${on ? "btn--ghost" : "btn--alt"}" data-promo="${p.code}" type="button">
            ${on ? "Applied" : "Apply code"}
          </button>
        </article>`;
    }).join("");
  },

  applyPromo(code) {
    const promo = findPromo(code);
    if (!promo) {
      pushToast(`<b>${fmt.esc(code)}</b> is not a code we know.`);
      return;
    }
    session().applyPromo(promo);
    facade.usePromo(promo);
    pushToast(`<b>${promo.code}</b> applied — ${fmt.esc(promo.title)}`);
    this.offers();
    refreshQuote();
  },

  /* ==========================================================
     SAVED PLACES
     ========================================================== */

  saved() {
    const s = session();

    document.getElementById("savedList").innerHTML = s.saved.length
      ? s.saved.map((p) => {
          const loc = findLocation(p.locationId);
          return `
            <div class="saveditem">
              <span class="saveditem__ico"><svg><use href="#i-${p.icon === "home" ? "home" : p.icon === "work" ? "work" : "star"}"/></svg></span>
              <span class="saveditem__mid">
                <b>${fmt.esc(p.label)}</b>
                <span class="saveditem__meta">${loc ? fmt.esc(loc.name) + " · " + fmt.esc(loc.area) : "unknown"}</span>
              </span>
              <button class="iconbtn" data-usesaved="${p.locationId}" type="button" title="Set as drop">
                <svg><use href="#i-book"/></svg>
              </button>
              <button class="iconbtn iconbtn--danger" data-unsave="${p.id}" type="button" title="Remove">
                <svg><use href="#i-trash"/></svg>
              </button>
            </div>`;
        }).join("")
      : `<div class="empty"><p>No shortcuts saved.</p></div>`;

    const sel = document.getElementById("savedPlace");
    if (!sel.options.length) fillLocationSelect(sel);

    document.getElementById("zoneGrid").innerHTML = ZONES.map((zone) => {
      const places = LOCATIONS.filter((l) => l.zone === zone);
      return `
        <div class="zone">
          <h4 class="zone__name">${zone} <span>${places.length}</span></h4>
          <div class="zone__places">
            ${places.map((l) => `
              <button class="placechip" data-place="${l.id}" type="button">
                <b>${fmt.esc(l.name)}</b><span>${fmt.esc(l.area)}</span>
              </button>`).join("")}
          </div>
        </div>`;
    }).join("");
  },

  /* ==========================================================
     SAFETY - proof the Observer stream has more than one listener
     ========================================================== */

  safety() {
    document.getElementById("contactList").innerHTML = [
      { name: "Amma", rel: "Mother", phone: "+91 98490 11223" },
      { name: "Harsha", rel: "Flatmate", phone: "+91 90000 55441" },
      { name: "RideFlow Support", rel: "24x7 helpline", phone: "1800 200 4455" },
    ].map((c) => `
      <div class="contact">
        <span class="contact__ava">${initialsOf(c.name)}</span>
        <span class="contact__mid"><b>${fmt.esc(c.name)}</b><span>${fmt.esc(c.rel)}</span></span>
        <span class="contact__phone mono">${fmt.esc(c.phone)}</span>
        <span class="iconbtn"><svg><use href="#i-phone"/></svg></span>
      </div>`).join("");

    const list = document.getElementById("alertList");
    list.innerHTML = SAFETY_ALERTS.length
      ? SAFETY_ALERTS.map((a) => `
          <div class="alert">
            <span class="alert__dot"></span>
            <span class="alert__mid"><b>${fmt.esc(a.text)}</b><span>${a.at}</span></span>
          </div>`).join("")
      : `<div class="empty"><p>Nothing flagged. SafetyMonitorObserver is subscribed and quiet.</p></div>`;
  },

  raiseAlert(text) {
    SAFETY_ALERTS.unshift({ text, at: new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" }) });
    if (SAFETY_ALERTS.length > 20) SAFETY_ALERTS.pop();
    router.bumpBadge("safety");
    if (router.current === "safety") this.safety();
    pushToast(`<b>Safety</b> ${fmt.esc(text)}`);
  },

  /* ==========================================================
     PROFILE
     ========================================================== */

  profile() {
    const s = session();
    if (!s.user) return;

    document.getElementById("profileAva").textContent = s.initials;
    document.getElementById("profileName").textContent = s.user.name;
    document.getElementById("profileMeta").innerHTML =
      `${fmt.phone(s.user.phone)} &middot; ${fmt.esc(s.user.email)}<br>` +
      `<span class="mono">Rider since ${new Date(s.user.since).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>`;

    document.getElementById("profNameInput").value = s.user.name;
    document.getElementById("profEmailInput").value = s.user.email;
    document.getElementById("profPhoneInput").value = fmt.phone(s.user.phone);

    const stats = s.stats;
    document.getElementById("profileStats").innerHTML = [
      { k: "Trips", v: stats.trips },
      { k: "Kilometres", v: stats.km },
      { k: "Spent", v: fmt.money(stats.spent) },
      { k: "CO2 est.", v: stats.co2 + " kg" },
      { k: "Wallet", v: fmt.money(s.wallet.balance) },
    ].map((t) => `<div class="stat"><span class="stat__k">${t.k}</span><span class="stat__v">${t.v}</span></div>`).join("");
  },

  /* ==========================================================
     SETTINGS
     ========================================================== */

  settings() {
    const s = session();

    document.querySelectorAll("#themePick .segmented__b").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.theme === s.prefs.theme)));

    const switches = [
      { key: "notifications", label: "In-app notifications", hint: "Toasts from NotificationService" },
      { key: "sound",         label: "Alert sound",          hint: "Off in the demo, kept for the settings shape" },
      { key: "fastDemo",      label: "Fast demo clock",      hint: "Runs the ride simulation roughly twice as quick" },
    ];

    document.getElementById("switchList").innerHTML = switches.map((sw) => `
      <label class="switchrow">
        <span class="switchrow__mid"><b>${sw.label}</b><span>${sw.hint}</span></span>
        <input type="checkbox" data-pref="${sw.key}" ${s.prefs[sw.key] ? "checked" : ""}>
        <span class="switchrow__track"><span class="switchrow__knob"></span></span>
      </label>`).join("");

    document.getElementById("aboutList").innerHTML = [
      ["App", "RideFlow Pattern Lab"],
      ["Patterns", "Factory, Strategy, Decorator, Observer, State, Adapter, Facade, Singleton"],
      ["City", `${LOCATIONS.length} places · ${CITY.nodes.length} junctions · ${CITY.edges.length} road links`],
      ["Fleet", `${DRIVER_POOL.length} drivers · ${Object.keys(VehicleFactory.registry).length} vehicle classes`],
      ["Storage", "localStorage only. Nothing leaves this browser."],
    ].map(([k, v]) => `<div class="kv"><span>${k}</span><b>${fmt.esc(v)}</b></div>`).join("");
  },

  /* ==========================================================
     Shared wiring for all of the above
     ========================================================== */

  wire() {
    /* --- activity --- */
    document.getElementById("activityFilter").addEventListener("click", (e) => {
      const b = e.target.closest("[data-f]");
      if (!b) return;
      this.activityFilter = b.dataset.f;
      document.querySelectorAll("#activityFilter .segmented__b").forEach((x) =>
        x.setAttribute("aria-pressed", String(x === b)));
      this.activity();
    });

    document.getElementById("tripList").addEventListener("click", (e) => {
      const b = e.target.closest("[data-trip]");
      if (b) this.tripSheet(b.dataset.trip);
    });

    /* --- sheet actions that can appear in more than one sheet --- */
    document.getElementById("sheet").addEventListener("click", (e) => {
      const rate = e.target.closest("[data-rate]");
      if (rate) { const id = rate.dataset.rate; Sheet.close(); this.ratingSheet(id); return; }

      const again = e.target.closest("[data-rebook]");
      if (again) {
        const [from, to] = again.dataset.rebook.split("|");
        Sheet.close();
        setRoute(from, to);
        router.go("home");
      }
    });

    /* --- wallet --- */
    document.getElementById("topUpRow").addEventListener("click", (e) => {
      const b = e.target.closest("[data-topup]");
      if (!b) return;
      facade.topUpWallet(+b.dataset.topup);
      this.wallet();
    });

    document.getElementById("methodList").addEventListener("click", (e) => {
      const b = e.target.closest("[data-method]");
      if (!b) return;
      facade.usePaymentMethod(b.dataset.method);
      this.wallet();
      syncPaymentSelect();
      pushToast(`Paying with <b>${fmt.esc(facade.activePayment().label)}</b>.`);
    });

    /* --- offers --- */
    document.getElementById("promoApply").addEventListener("click", () => {
      const input = document.getElementById("promoInput");
      this.applyPromo(input.value);
      input.value = "";
    });
    document.getElementById("promoInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("promoApply").click();
    });
    document.getElementById("offerGrid").addEventListener("click", (e) => {
      const b = e.target.closest("[data-promo]");
      if (b) this.applyPromo(b.dataset.promo);
    });

    /* --- saved places --- */
    document.getElementById("savedAdd").addEventListener("click", () => {
      const label = document.getElementById("savedLabel").value.trim();
      const place = document.getElementById("savedPlace").value;
      if (label.length < 2) { pushToast("Give the shortcut a label first."); return; }
      if (!session().addSaved(label, place, "star")) { pushToast("That shortcut already exists."); return; }
      document.getElementById("savedLabel").value = "";
      pushToast(`Saved <b>${fmt.esc(label)}</b>.`);
      this.saved();
      renderQuickPlaces();
    });

    document.getElementById("savedList").addEventListener("click", (e) => {
      const del = e.target.closest("[data-unsave]");
      if (del) {
        session().removeSaved(del.dataset.unsave);
        this.saved();
        renderQuickPlaces();
        return;
      }
      const use = e.target.closest("[data-usesaved]");
      if (use) {
        setRoute(null, use.dataset.usesaved);
        router.go("home");
      }
    });

    document.getElementById("zoneGrid").addEventListener("click", (e) => {
      const b = e.target.closest("[data-place]");
      if (b) { setRoute(null, b.dataset.place); router.go("home"); }
    });

    /* --- safety --- */
    document.getElementById("sosBtn").addEventListener("click", () => {
      log("SYSTEM", "SOS triggered - in a real app this dials 112 and shares live location");
      this.raiseAlert("SOS triggered by rider. Support notified.");
    });

    /* --- profile --- */
    document.getElementById("profSave").addEventListener("click", () => {
      const name = document.getElementById("profNameInput").value.trim();
      const email = document.getElementById("profEmailInput").value.trim();
      if (name.length < 2) { pushToast("A name needs at least two characters."); return; }
      session().updateProfile({ name, email });
      this.profile();
      syncUserChip();
      pushToast("Profile updated.");
    });

    document.getElementById("btnSignOut").addEventListener("click", () => signOut());

    document.getElementById("btnWipe").addEventListener("click", () => {
      Sheet.open(`
        <div class="sheet__hd">
          <h3>Erase demo data?</h3>
          <button class="iconbtn" data-sheet-close type="button" aria-label="Close"><svg><use href="#i-close"/></svg></button>
        </div>
        <div class="sheet__body">
          <p class="cardnote">This clears the account, wallet, saved places and trip history out of
             localStorage and signs you out. The SessionManager instance itself stays alive — it is
             a Singleton, there is only ever one.</p>
          <div class="sheet__actions">
            <button class="btn btn--danger" id="wipeYes" type="button">Erase everything</button>
            <button class="btn btn--ghost" data-sheet-close type="button">Keep it</button>
          </div>
        </div>`, (root) => {
        root.querySelector("#wipeYes").addEventListener("click", () => {
          session().wipe();
          Sheet.close();
          signOut();
        });
      });
    });

    /* --- settings --- */
    document.getElementById("themePick").addEventListener("click", (e) => {
      const b = e.target.closest("[data-theme]");
      if (!b) return;
      session().setPref("theme", b.dataset.theme);
      applyTheme();
      this.settings();
    });

    document.getElementById("switchList").addEventListener("change", (e) => {
      const box = e.target.closest("[data-pref]");
      if (!box) return;
      session().setPref(box.dataset.pref, box.checked);
      if (box.dataset.pref === "notifications") facade.notifications.muted = !box.checked;
      log("SINGLETON", `SessionManager.setPref({{${box.dataset.pref}}}, ${box.checked}) - saved to localStorage`);
    });
  },
};

/** Theme is a preference on the session singleton, applied to <html>. */
function applyTheme() {
  const pref = session().prefs.theme;
  if (pref === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", pref);
}

/** Fills any <select> with every location, grouped by zone. */
function fillLocationSelect(sel) {
  sel.innerHTML = ZONES.map((zone) => {
    const places = LOCATIONS.filter((l) => l.zone === zone);
    if (!places.length) return "";
    return `<optgroup label="${zone}">` +
      places.map((l) => `<option value="${l.id}">${fmt.esc(l.name)} — ${fmt.esc(l.area)}</option>`).join("") +
      "</optgroup>";
  }).join("");
}
