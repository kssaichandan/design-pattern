/* ============================================================
   PATTERN 7 - ADAPTER  (structural)
   ------------------------------------------------------------
   PROBLEM: the app takes money four ways, and every provider's
   SDK was written by someone else with their own ideas:

       upiSdk.collect("me@okhdfc", 24500)        // PAISE, not rupees
       cardApi.authorise({ token, amount: 245 }) // rupees, object arg
       wallet.debit(userId, 245)                 // throws if short
       // cash has no SDK at all - the driver just takes the note

   Different method names, different argument shapes, different
   units, different failure behaviour. Without an adapter the
   payment code becomes a switch that has to remember all four,
   and every new provider edits that switch.

   SOLUTION: define the interface WE want - pay(rupees, rideId) -
   and write one small class per provider that translates our call
   into theirs. The gateway holds a PaymentMethod and calls pay().
   It never learns that UPI counts in paise.

   Adapter vs Strategy: a Strategy swaps behaviour we wrote and
   control. An Adapter exists because someone else's interface is
   the wrong shape and we cannot change it.
   ============================================================ */

/* ------------------------------------------------------------
   THE ADAPTEES - four "third-party SDKs" we do not control.
   Pretend these came from four different npm packages.
   ------------------------------------------------------------ */

/** Bank UPI rail. Talks in paise and returns its own result shape. */
class UpiRailSdk {
  collect(vpa, paise) {
    return { status: "SUCCESS", rrn: "UPI" + Date.now().toString().slice(-9), debited_paise: paise, payer: vpa };
  }
}

/** Card network. Rupees, but an object argument and a two-step flow. */
class CardNetworkApi {
  authorise({ cardToken, amount }) {
    return { authCode: "AUTH-" + Math.random().toString(36).slice(2, 8).toUpperCase(), amount, token: cardToken };
  }
  capture(authCode) {
    return { captureId: "CAP" + Date.now().toString().slice(-8), authCode, settled: true };
  }
}

/** Our own stored-value ledger. Throws rather than returning a status. */
class WalletLedger {
  constructor(session) { this.session = session; }

  debit(rupees) {
    const balance = this.session.wallet.balance;
    if (balance < rupees) throw new Error(`Wallet short by Rs.${(rupees - balance).toFixed(0)}`);
    return this.session.spend(rupees, "Ride fare");
  }
}

/** Cash has no SDK. There is nothing to call. */

/* ------------------------------------------------------------
   THE TARGET INTERFACE - the only shape the app wants to see.
   ------------------------------------------------------------ */

class PaymentMethod {
  constructor(id, label, detail) {
    this.id = id;
    this.label = label;
    this.detail = detail;
  }

  /** Unique across the whole list - two cards would collide on id alone. */
  get key() { return this.id; }

  /** Can this method cover the amount right now? */
  canCover() { return true; }

  /**
   * @returns {{txnId: string, method: string, amount: number}}
   */
  pay(rupees, rideId) { throw new Error("not implemented"); }
}

/* ------------------------------------------------------------
   THE ADAPTERS - one per provider. Each is small on purpose:
   translating is all it is allowed to do.
   ------------------------------------------------------------ */

class UpiAdapter extends PaymentMethod {
  constructor(vpa) {
    super("UPI", "UPI", vpa);
    this.vpa = vpa;
    this.sdk = new UpiRailSdk();
  }

  pay(rupees, rideId) {
    // Translation 1: rupees -> paise. Translation 2: their shape -> ours.
    const res = this.sdk.collect(this.vpa, Math.round(rupees * 100));
    log("ADAPTER", `UpiAdapter: pay(Rs.${rupees}) -> collect("${this.vpa}", {{${Math.round(rupees * 100)} paise}})`);
    return { txnId: res.rrn, method: `UPI \u00b7 ${this.vpa}`, amount: rupees };
  }
}

class CardAdapter extends PaymentMethod {
  constructor(last4, brand) {
    super("CARD", `${brand} card`, `\u2022\u2022\u2022\u2022 ${last4}`);
    this.last4 = last4;
    this.token = "tok_" + last4;
    this.api = new CardNetworkApi();
  }

  get key() { return "CARD-" + this.last4; }

  pay(rupees, rideId) {
    // Translation: one call for us, an authorise + capture pair for them.
    const auth = this.api.authorise({ cardToken: this.token, amount: rupees });
    const cap = this.api.capture(auth.authCode);
    log("ADAPTER", `CardAdapter: pay(Rs.${rupees}) -> authorise() then capture() - {{two calls hidden behind one}}`);
    return { txnId: cap.captureId, method: `${this.label} ${this.detail}`, amount: rupees };
  }
}

class WalletAdapter extends PaymentMethod {
  constructor(session) {
    super("WALLET", "RideFlow Wallet", "");
    this.session = session;
    this.ledger = new WalletLedger(session);
  }

  get detail() { return `Balance Rs.${this.session.wallet.balance.toFixed(0)}`; }
  set detail(v) { /* computed - the balance moves under us */ }

  canCover(rupees) { return this.session.wallet.balance >= rupees; }

  pay(rupees, rideId) {
    // Translation: their exception becomes our return value, because
    // the rest of the app should not need a try/catch per provider.
    try {
      const txn = this.ledger.debit(rupees);
      log("ADAPTER", `WalletAdapter: pay(Rs.${rupees}) -> ledger.debit() ok, {{Rs.${this.session.wallet.balance.toFixed(0)}}} left`);
      return { txnId: txn.id, method: "RideFlow Wallet", amount: rupees };
    } catch (err) {
      log("ADAPTER", `WalletAdapter: ledger.debit() threw - {{${err.message}}} - falling back to UPI`);
      return PAYMENT_METHODS.get("UPI").pay(rupees, rideId);
    }
  }
}

class CashAdapter extends PaymentMethod {
  constructor() {
    super("CASH", "Cash", "Pay the driver directly");
  }

  pay(rupees) {
    // There is no SDK behind this one. The adapter still exists so
    // the gateway keeps making exactly one kind of call.
    log("ADAPTER", `CashAdapter: pay(Rs.${rupees}) -> {{no SDK at all}}, just a note for the driver`);
    return { txnId: "CASH-" + Date.now().toString().slice(-6), method: "Cash to driver", amount: rupees };
  }
}

/* ------------------------------------------------------------
   The registry the wallet screen renders from.
   ------------------------------------------------------------ */

const PAYMENT_METHODS = {
  _list: [],
  _activeId: "UPI",

  build(session) {
    this._list = [
      new UpiAdapter(session.user ? session.user.vpa : "rider@okaxis"),
      new WalletAdapter(session),
      new CardAdapter("4291", "HDFC Visa"),
      new CardAdapter("8830", "ICICI Amex"),
      new CashAdapter(),
    ];
    return this._list;
  },

  all()  { return this._list; },
  get(key) { return this._list.find((m) => m.key === key) || this._list.find((m) => m.id === key) || this._list[0]; },

  default() { return this._list[0] || new CashAdapter(); },
};
