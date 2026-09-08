/* ============================================================
   auth.js - the sign-in flow: phone -> OTP -> name.
   ------------------------------------------------------------
   Fake on purpose. No network, no SMS, no password. What it does
   do is exercise the SessionManager Singleton: this screen is the
   only one that WRITES the account, and eight screens read it.
   ============================================================ */

const Auth = {
  phone: "",
  otp: "0000",
  resendTimer: null,
  onDone: null,

  /* ---------- screen plumbing ---------- */

  el(step) { return document.querySelector(`.authstep[data-step="${step}"]`); },

  show(step) {
    document.querySelectorAll(".authstep").forEach((s) => {
      s.hidden = s.dataset.step !== step;
    });
    const focusable = this.el(step).querySelector("input");
    if (focusable) setTimeout(() => focusable.focus(), 60);
  },

  error(id, message) {
    const el = document.getElementById(id);
    el.textContent = message || "";
    el.hidden = !message;
  },

  /* ---------- step 1: the number ---------- */

  sendOtp() {
    const raw = document.getElementById("authPhone").value.replace(/\D/g, "");

    if (raw.length !== 10) {
      this.error("authPhoneErr", "That needs to be 10 digits. Any 10 will do.");
      return;
    }
    if (/^[0-5]/.test(raw)) {
      this.error("authPhoneErr", "Indian mobile numbers start with 6, 7, 8 or 9.");
      return;
    }

    this.error("authPhoneErr", "");
    this.phone = raw;

    // A "sent" code, generated here because there is nowhere to send it.
    this.otp = String(1000 + Math.floor(Math.random() * 8999));
    log("SYSTEM", `Auth: OTP {{${this.otp}}} generated for ${fmt.phone(raw)} - no SMS is sent, this is a demo`);

    document.getElementById("authPhoneEcho").textContent = fmt.phone(raw);
    document.getElementById("authOtpHint").textContent = this.otp;
    document.querySelectorAll(".otpbox__cell").forEach((c) => { c.value = ""; });

    this.show("otp");
    this.startResendCountdown();
  },

  startResendCountdown() {
    clearInterval(this.resendTimer);
    let left = 30;
    const el = document.getElementById("authResend");

    const tick = () => {
      el.textContent = left > 0 ? `Resend code in ${left}s` : "Didn't get it? Tap to resend";
      el.classList.toggle("is-ready", left <= 0);
      if (left <= 0) clearInterval(this.resendTimer);
      left -= 1;
    };
    tick();
    this.resendTimer = setInterval(tick, 1000);
  },

  /* ---------- step 2: the code ---------- */

  typedOtp() {
    return [...document.querySelectorAll(".otpbox__cell")].map((c) => c.value).join("");
  },

  verify() {
    const typed = this.typedOtp();

    if (typed.length !== 4) {
      this.error("authOtpErr", "Enter all four digits.");
      return;
    }
    if (typed !== this.otp) {
      this.error("authOtpErr", `That is not the code. It is ${this.otp}, printed right below.`);
      return;
    }

    this.error("authOtpErr", "");
    clearInterval(this.resendTimer);

    const known = session().user && session().user.phone === this.phone;
    if (known) {
      log("SYSTEM", `Auth: ${fmt.phone(this.phone)} recognised - signing straight back in`);
      this.finish(session().user.name, session().user.email);
      return;
    }

    document.getElementById("authName").value = "";
    document.getElementById("authEmail").value = "";
    this.show("name");
  },

  /* ---------- step 3: the account ---------- */

  createAccount() {
    const name = document.getElementById("authName").value.trim();
    const email = document.getElementById("authEmail").value.trim();

    if (name.length < 2) {
      this.error("authNameErr", "Tell us a name your driver can read out.");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.error("authNameErr", "That email does not look right. Leave it blank if you like.");
      return;
    }

    this.error("authNameErr", "");
    this.finish(name, email);
  },

  finish(name, email) {
    session().signIn({ name, phone: this.phone, email });
    if (this.onDone) this.onDone();
  },

  /** The impatient path - one tap into a furnished demo account. */
  demoSignIn() {
    this.phone = "9848012345";
    log("SYSTEM", "Auth: demo rider requested - skipping the OTP round trip");
    this.finish("Sai Chandan", "sai@example.com");
  },

  /* ---------- wiring ---------- */

  wire(onDone) {
    this.onDone = onDone;

    const phoneInput = document.getElementById("authPhone");
    phoneInput.addEventListener("input", () => {
      // Live 5+5 grouping, the way a real number field behaves.
      const d = phoneInput.value.replace(/\D/g, "").slice(0, 10);
      phoneInput.value = d.length > 5 ? d.slice(0, 5) + " " + d.slice(5) : d;
      this.error("authPhoneErr", "");
    });
    phoneInput.addEventListener("keydown", (e) => { if (e.key === "Enter") this.sendOtp(); });

    document.getElementById("authSendOtp").addEventListener("click", () => this.sendOtp());
    document.getElementById("authDemo").addEventListener("click", () => this.demoSignIn());
    document.getElementById("authChangeNo").addEventListener("click", () => this.show("phone"));
    document.getElementById("authVerify").addEventListener("click", () => this.verify());
    document.getElementById("authFinish").addEventListener("click", () => this.createAccount());

    document.getElementById("authResend").addEventListener("click", (e) => {
      if (e.target.classList.contains("is-ready")) this.sendOtp();
    });

    // OTP boxes: type forward, backspace back, paste all four at once.
    const cells = [...document.querySelectorAll(".otpbox__cell")];
    cells.forEach((cell, i) => {
      cell.addEventListener("input", () => {
        cell.value = cell.value.replace(/\D/g, "").slice(0, 1);
        this.error("authOtpErr", "");
        if (cell.value && cells[i + 1]) cells[i + 1].focus();
        if (this.typedOtp().length === 4) this.verify();
      });
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !cell.value && cells[i - 1]) cells[i - 1].focus();
        if (e.key === "Enter") this.verify();
      });
      cell.addEventListener("paste", (e) => {
        const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 4);
        if (!digits) return;
        e.preventDefault();
        digits.split("").forEach((d, k) => { if (cells[k]) cells[k].value = d; });
        if (digits.length === 4) this.verify();
      });
    });

    document.getElementById("authName").addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("authEmail").focus();
    });
    document.getElementById("authEmail").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.createAccount();
    });
  },

  /** Back to a blank sign-in screen. */
  reset() {
    clearInterval(this.resendTimer);
    document.getElementById("authPhone").value = "";
    document.querySelectorAll(".otpbox__cell").forEach((c) => { c.value = ""; });
    ["authPhoneErr", "authOtpErr", "authNameErr"].forEach((id) => this.error(id, ""));
    this.show("phone");
  },
};
