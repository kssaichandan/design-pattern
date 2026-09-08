/* ============================================================
   router.js - screen switching and the modal sheet.
   ------------------------------------------------------------
   Plain UI plumbing, NOT a design pattern. It is here because a
   nine-screen app needs somewhere to keep "which screen is on",
   and burying that in app.js would hide the patterns underneath
   a pile of show/hide code.
   ============================================================ */

const NAV_ITEMS = [
  { id: "home",     label: "Book a ride", icon: "i-book",     hint: "Factory · Strategy · Facade" },
  { id: "activity", label: "Activity",    icon: "i-activity", hint: "Singleton" },
  { id: "wallet",   label: "Wallet",      icon: "i-wallet",   hint: "Adapter" },
  { id: "offers",   label: "Offers",      icon: "i-offer",    hint: "Decorator" },
  { id: "saved",    label: "Saved",       icon: "i-saved",    hint: "Singleton" },
  { id: "safety",   label: "Safety",      icon: "i-safety",   hint: "Observer" },
  { id: "profile",  label: "Profile",     icon: "i-profile",  hint: "Singleton" },
  { id: "settings", label: "Settings",    icon: "i-settings", hint: "Singleton" },
  { id: "patterns", label: "Patterns",    icon: "i-patterns", hint: "All seven, explained" },
];

class ScreenRouter {
  constructor(stageId, railId) {
    this.stage = document.getElementById(stageId);
    this.rail = document.getElementById(railId);
    this.screens = new Map();
    this.current = null;
    this.onEnterHooks = {};
    this.badges = {};
  }

  /** Draws the nav rail from NAV_ITEMS - add a screen, get a nav row. */
  buildRail() {
    this.rail.innerHTML = NAV_ITEMS.map((item) => `
      <button class="railitem" data-go="${item.id}" type="button" aria-pressed="false">
        <svg class="railitem__ico"><use href="#${item.icon}"/></svg>
        <span class="railitem__text">
          <span class="railitem__label">${item.label}</span>
          <span class="railitem__hint">${item.hint}</span>
        </span>
        <span class="railitem__badge" data-badge="${item.id}" hidden></span>
      </button>`).join("");

    this.rail.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-go]");
      if (btn) this.go(btn.dataset.go);
    });

    // Anything anywhere in the app can carry data-go and become a link.
    document.addEventListener("click", (e) => {
      const link = e.target.closest("[data-go]");
      if (link && !this.rail.contains(link)) this.go(link.dataset.go);
    });
  }

  /** @param {string} id  @param {function} onEnter runs every time it opens */
  register(id, onEnter) {
    const el = this.stage.querySelector(`[data-screen="${id}"]`);
    if (el) this.screens.set(id, el);
    if (onEnter) this.onEnterHooks[id] = onEnter;
  }

  go(id) {
    if (!this.screens.has(id)) return;
    this.current = id;

    this.screens.forEach((el, key) => { el.hidden = key !== id; });
    this.rail.querySelectorAll("[data-go]").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.go === id)));

    this.setBadge(id, 0);
    if (this.onEnterHooks[id]) this.onEnterHooks[id]();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  /** A little dot on a nav row - "something changed while you were away". */
  setBadge(id, count) {
    this.badges[id] = count;
    const el = this.rail.querySelector(`[data-badge="${id}"]`);
    if (!el) return;
    el.hidden = !count || this.current === id;
    el.textContent = count > 9 ? "9+" : String(count || "");
  }

  bumpBadge(id) {
    if (this.current === id) return;
    this.setBadge(id, (this.badges[id] || 0) + 1);
  }
}

/* ------------------------------------------------------------
   The modal sheet - trip receipts, rating, add-money, confirms.
   ------------------------------------------------------------ */

const Sheet = {
  el:    () => document.getElementById("sheet"),
  wrap:  () => document.getElementById("sheetWrap"),

  open(html, onMount) {
    this.el().innerHTML = html;
    this.wrap().hidden = false;
    document.body.classList.add("is-sheeted");
    if (onMount) onMount(this.el());

    const first = this.el().querySelector("[data-autofocus]");
    if (first) first.focus();
  },

  close() {
    this.wrap().hidden = true;
    this.el().innerHTML = "";
    document.body.classList.remove("is-sheeted");
  },

  wire() {
    document.getElementById("sheetScrim").addEventListener("click", () => this.close());
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-sheet-close]")) this.close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.wrap().hidden) this.close();
    });
  },
};

/* ------------------------------------------------------------
   Small formatting helpers used by every screen.
   ------------------------------------------------------------ */

const fmt = {
  money: (n) => "Rs." + Math.round(n).toLocaleString("en-IN"),

  when(iso) {
    const d = new Date(iso);
    const now = new Date();
    const days = Math.round((now.setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 864e5);
    const time = new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    if (days === 0) return "Today, " + time;
    if (days === 1) return "Yesterday, " + time;
    if (days < 7) return d.toLocaleDateString("en-IN", { weekday: "long" }) + ", " + time;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", " + time;
  },

  phone(p) {
    const digits = String(p).replace(/\D/g, "").slice(-10);
    return "+91 " + digits.slice(0, 5) + " " + digits.slice(5);
  },

  stars(n) {
    return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);
  },

  /** Never drop user text into innerHTML unescaped. */
  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};

/** Initials for an avatar disc. */
function initialsOf(name) {
  return String(name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
