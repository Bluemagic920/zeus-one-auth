// Zeus One Authenticator - iPhone / web app
import * as C from "./core.js";
import { decodeQR } from "./qr.js";

const VERSION = "1.0.0";
const LS_STORE = "zoauth.store.v1";
const LS_META = "zoauth.meta.v1";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const S = {
  store: null,       // encrypted store (persisted)
  dataKey: null,     // decrypted data key (memory only while unlocked)
  accounts: [],
  hiddenAt: 0,
  tick: null,
  lastCounter: new Map(),
  pendingCreate: null,  // { importAccounts } when restoring on a fresh install
  meta: loadMeta(),
};

function loadMeta() {
  const d = { lockMinutes: 1, changedAt: 0, backedUpAt: 0, skipInstall: false };
  try { return { ...d, ...JSON.parse(localStorage.getItem(LS_META) || "{}") }; } catch { return d; }
}
function saveMeta() { try { localStorage.setItem(LS_META, JSON.stringify(S.meta)); } catch { /* ignore */ } }
function loadStore() { try { return JSON.parse(localStorage.getItem(LS_STORE) || "null"); } catch { return null; } }
function writeStore() { localStorage.setItem(LS_STORE, JSON.stringify(S.store)); }

// ------------------------------------------------------------------ helpers
function show(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.add("hidden"));
  $(id).classList.remove("hidden");
  $(id).scrollTop = 0;
}
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}
function bolt() {
  const b = $("#bolt");
  b.classList.remove("go");
  void b.offsetWidth;
  b.classList.add("go");
  setTimeout(() => b.classList.remove("go"), 750);
}
async function busy(el, fn) {
  el?.classList.add("busy");
  await new Promise((r) => setTimeout(r, 30)); // let the UI paint before heavy crypto
  try { return await fn(); } finally { el?.classList.remove("busy"); }
}
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
const today = () => new Date().toISOString().slice(0, 10);

async function shareOrDownload(filename, text, mime = "application/octet-stream") {
  const file = new File([text], filename, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return true; }
    catch (e) { if (e.name === "AbortError") return false; }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

function pickFile() {
  return new Promise((resolve) => {
    const inp = $("#file-input");
    inp.value = "";
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      resolve(f ? await f.text() : null);
    };
    inp.click();
  });
}

// ------------------------------------------------------------------ sheets
function sheet(html) {
  const bd = document.createElement("div");
  bd.className = "backdrop";
  bd.innerHTML = `<div class="sheet"><button class="close" aria-label="Close">✕</button>${html}</div>`;
  const close = () => bd.remove();
  bd.addEventListener("click", (e) => { if (e.target === bd) close(); });
  bd.querySelector(".close").onclick = close;
  document.body.appendChild(bd);
  const el = bd.querySelector(".sheet");
  el.close = close;
  el.q = (s) => el.querySelector(s);
  return el;
}
function closeSheets() { document.querySelectorAll(".backdrop").forEach((b) => b.remove()); }

function askPassword({ title, text = "", confirm = false, button = "Continue", minLen = 1 }) {
  return new Promise((resolve) => {
    const sh = sheet(`<h2>${esc(title)}</h2><p class="muted">${text}</p>
      <form autocomplete="off"><label>Password</label><input type="password" class="p1" autocomplete="off">
      ${confirm ? '<label>Confirm password</label><input type="password" class="p2" autocomplete="off">' : ""}
      <div class="err"></div><button class="btn gold" type="submit">${esc(button)}</button></form>`);
    const done = (v) => { sh.close(); resolve(v); };
    sh.q(".close").onclick = () => done(null);
    sh.q("form").onsubmit = (e) => {
      e.preventDefault();
      const p = sh.q(".p1").value;
      if (p.length < minLen) { sh.q(".err").textContent = `Use at least ${minLen} characters.`; return; }
      if (confirm && p !== sh.q(".p2").value) { sh.q(".err").textContent = "The passwords don't match."; return; }
      done(p);
    };
    setTimeout(() => sh.q(".p1").focus(), 250);
  });
}

// ================================================================= startup
function start() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.storage?.persist?.().catch(() => {});
  S.store = loadStore();
  if (S.store) { show("#screen-lock"); return; }
  if (isIOS() && !isStandalone() && !S.meta.skipInstall) { show("#screen-install"); return; }
  show("#screen-welcome");
}

$("#btn-skip-install").onclick = () => {
  if (!confirm("Safari may clear website data that isn't added to the Home Screen. Continue anyway?")) return;
  S.meta.skipInstall = true; saveMeta(); show("#screen-welcome");
};

// --------------------------------------------------------------- welcome
$("#btn-start-new").onclick = () => {
  S.pendingCreate = { importAccounts: [] };
  $("#create-note").textContent = "This password unlocks the app. Use at least 6 characters.";
  show("#screen-create");
};
$("#btn-start-restore").onclick = async () => {
  const text = await pickFile();
  if (text === null) return;
  const pw = await askPassword({ title: "Backup password", text: "Enter the password you chose when you made this backup." });
  if (pw === null) return;
  try {
    const accounts = await busy(document.body, () => C.openBackup(text, pw));
    S.pendingCreate = { importAccounts: accounts };
    $("#create-note").textContent = `Found ${accounts.length} account${accounts.length === 1 ? "" : "s"}. Now choose a password to unlock the app on this phone (at least 6 characters).`;
    show("#screen-create");
  } catch (e) {
    toast(e.name === "WrongSecret" ? "Wrong backup password." : e.message);
  }
};
$("#btn-create-back").onclick = () => show("#screen-welcome");

$("#form-create").onsubmit = async (e) => {
  e.preventDefault();
  const pw = $("#create-pw").value, pw2 = $("#create-pw2").value, err = $("#create-err");
  if (pw.length < 6) { err.textContent = "Use at least 6 characters."; return; }
  if (pw !== pw2) { err.textContent = "The passwords don't match."; return; }
  err.textContent = "";
  await busy($("#form-create"), async () => {
    const { store, dataKey, recoveryKey } = await C.createStore(pw);
    S.store = store; S.dataKey = dataKey;
    S.accounts = S.pendingCreate?.importAccounts || [];
    await C.saveData(S.store, S.dataKey, S.accounts);
    writeStore();
    if (S.accounts.length) { S.meta.backedUpAt = Date.now(); S.meta.changedAt = Date.now() - 1; saveMeta(); }
    $("#create-pw").value = $("#create-pw2").value = "";
    showRecoveryKey(recoveryKey, () => { bolt(); enterMain(); });
  });
};

// ----------------------------------------------------------- recovery key
let rkDone = null;
function showRecoveryKey(rk, onDone) {
  rkDone = onDone;
  $("#recovery-key").textContent = rk;
  $("#rk-ok").checked = false;
  $("#btn-rk-done").disabled = true;
  show("#screen-recovery");
}
$("#rk-ok").onchange = () => { $("#btn-rk-done").disabled = !$("#rk-ok").checked; };
$("#btn-rk-copy").onclick = async () => {
  try { await navigator.clipboard.writeText($("#recovery-key").textContent); toast("Recovery Key copied"); }
  catch { toast("Press and hold the key to copy it"); }
};
$("#btn-rk-save").onclick = () => {
  const rk = $("#recovery-key").textContent;
  const text = `ZEUS ONE AUTHENTICATOR - RECOVERY KEY\n\nCreated: ${new Date().toLocaleString()}\n\n    ${rk}\n\n` +
    "If you forget your app password, open the app, tap 'Forgot password?' and enter this key.\n" +
    "Keep it somewhere safe and offline. Anyone with this key AND your phone can open your codes.\n";
  shareOrDownload(`Zeus One Auth Recovery Key ${today()}.txt`, text, "text/plain");
};
$("#btn-rk-done").onclick = () => { const f = rkDone; rkDone = null; $("#recovery-key").textContent = ""; f && f(); };

// ------------------------------------------------------------------ unlock
$("#form-unlock").onsubmit = async (e) => {
  e.preventDefault();
  const pw = $("#unlock-pw").value;
  if (!pw) return;
  $("#unlock-err").textContent = "";
  await busy($("#form-unlock"), async () => {
    try {
      S.dataKey = await C.unlockWithPassword(S.store, pw);
      S.accounts = await C.loadData(S.store, S.dataKey);
      $("#unlock-pw").value = "";
      bolt();
      enterMain();
    } catch (err) {
      S.dataKey = null;
      $("#unlock-err").textContent = err.name === "WrongSecret" ? "Wrong password." : err.message;
      $("#unlock-pw").select();
    }
  });
};
$("#btn-forgot").onclick = () => show("#screen-forgot");
$("#btn-forgot-back").onclick = () => show("#screen-lock");
$("#form-forgot").onsubmit = async (e) => {
  e.preventDefault();
  const pw = $("#forgot-pw").value, err = $("#forgot-err");
  if (pw.length < 6) { err.textContent = "Use at least 6 characters."; return; }
  if (pw !== $("#forgot-pw2").value) { err.textContent = "The passwords don't match."; return; }
  err.textContent = "";
  await busy($("#form-forgot"), async () => {
    try {
      S.dataKey = await C.unlockWithRecovery(S.store, $("#forgot-rk").value);
      S.accounts = await C.loadData(S.store, S.dataKey);
      await C.wrapPassword(S.store, S.dataKey, pw);
      writeStore();
      $("#forgot-rk").value = $("#forgot-pw").value = $("#forgot-pw2").value = "";
      bolt();
      enterMain();
      toast("New password set. Your Recovery Key still works.");
    } catch (ex) {
      S.dataKey = null;
      err.textContent = ex.name === "WrongSecret" && !/48/.test(ex.message) ? "That Recovery Key doesn't open this app." : ex.message;
    }
  });
};

function lock() {
  S.dataKey = null;
  S.accounts = [];
  clearInterval(S.tick);
  S.tick = null;
  $("#list").innerHTML = "";
  closeSheets();
  stopScanner();
  show("#screen-lock");
}
$("#btn-lock").onclick = lock;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { S.hiddenAt = Date.now(); return; }
  if (S.dataKey && Date.now() - S.hiddenAt > S.meta.lockMinutes * 60000) lock();
});

// ================================================================== main
function enterMain() {
  show("#screen-main");
  renderList();
  clearInterval(S.tick);
  S.tick = setInterval(updateCodes, 1000);
}

async function persist() {
  await C.saveData(S.store, S.dataKey, S.accounts);
  writeStore();
  S.meta.changedAt = Date.now();
  saveMeta();
  renderBanner();
}

function renderBanner() {
  const need = S.accounts.length > 0 && S.meta.changedAt > S.meta.backedUpAt;
  $("#banner-backup").classList.toggle("hidden", !need);
  if (need) {
    $("#banner-text").textContent = S.meta.backedUpAt
      ? "You've changed accounts since your last backup."
      : "If this phone is lost, a backup is how you get your codes back.";
  }
}

function displayName(a) { return a.issuer || a.label || "Account"; }
function fmtCode(c) { return c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c.length === 8 ? `${c.slice(0, 4)} ${c.slice(4)}` : c; }

function renderList() {
  const list = $("#list");
  const q = $("#search").value.trim().toLowerCase();
  $("#search").classList.toggle("hidden", S.accounts.length < 6);
  $("#empty").classList.toggle("hidden", S.accounts.length > 0);
  const items = S.accounts
    .filter((a) => !q || `${a.issuer} ${a.label}`.toLowerCase().includes(q))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  list.innerHTML = items.map((a) => `
    <div class="card" data-id="${esc(a.id)}">
      <svg class="ring" viewBox="0 0 34 34"><circle class="bg" cx="17" cy="17" r="14"/><circle class="fg" cx="17" cy="17" r="14" stroke-dasharray="87.96" stroke-dashoffset="0"/></svg>
      <div class="info">
        <div class="issuer">${esc(displayName(a))}</div>
        ${a.issuer && a.label ? `<div class="label">${esc(a.label)}</div>` : ""}
        <div class="code">··· ···</div>
      </div>
      <button class="more" aria-label="Options">⋯</button>
    </div>`).join("");
  S.lastCounter.clear();
  renderBanner();
  updateCodes();
}

async function updateCodes() {
  if (!S.dataKey) return;
  const now = Date.now();
  for (const card of document.querySelectorAll("#list .card")) {
    const a = S.accounts.find((x) => x.id === card.dataset.id);
    if (!a) continue;
    const counter = Math.floor(now / 1000 / a.period);
    const remaining = a.period - (Math.floor(now / 1000) % a.period);
    if (S.lastCounter.get(a.id) !== counter) {
      S.lastCounter.set(a.id, counter);
      try {
        const r = await C.totp(a, now);
        card.querySelector(".code").textContent = fmtCode(r.code);
        card.dataset.code = r.code;
      } catch { card.querySelector(".code").textContent = "invalid key"; }
    }
    const fg = card.querySelector(".fg");
    fg.style.strokeDashoffset = String(87.96 * (1 - remaining / a.period));
    card.querySelector(".code").classList.toggle("soon", remaining <= 5);
  }
}

$("#search").oninput = renderList;
$("#list").addEventListener("click", async (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  const a = S.accounts.find((x) => x.id === card.dataset.id);
  if (!a) return;
  if (e.target.closest(".more")) { accountSheet(a); return; }
  try {
    await navigator.clipboard.writeText(card.dataset.code || "");
    toast(`⚡ ${displayName(a)} code copied`);
  } catch { toast("Couldn't copy - press and hold the code instead"); }
});

function accountSheet(a) {
  const sh = sheet(`<h2>${esc(displayName(a))}</h2>
    <label>Site / service</label><input type="text" class="iss" value="${esc(a.issuer)}">
    <label>Account (email or username)</label><input type="text" class="lab" value="${esc(a.label)}">
    <p class="muted">${a.digits} digits · every ${a.period} seconds · ${a.algorithm}</p>
    <button class="btn gold sv">Save</button>
    <button class="btn danger del">Delete this account</button>`);
  sh.q(".sv").onclick = async () => {
    a.issuer = sh.q(".iss").value.trim().slice(0, 80);
    a.label = sh.q(".lab").value.trim().slice(0, 120);
    await persist();
    renderList();
    sh.close();
    toast("Saved");
  };
  sh.q(".del").onclick = async () => {
    if (!confirm(`Delete ${displayName(a)}?\n\nMake sure you've turned off 2-factor on that site, or have another way to get codes, or you could be locked out.`)) return;
    S.accounts = S.accounts.filter((x) => x.id !== a.id);
    await persist();
    renderList();
    sh.close();
    toast("Deleted");
  };
}

// --------------------------------------------------------------- adding
const sameAccount = (a, b) => a.secret === b.secret && a.issuer === b.issuer && a.label === b.label;
async function addAccounts(list) {
  const fresh = list.filter((n) => !S.accounts.some((o) => sameAccount(o, n)));
  if (!fresh.length) { toast(list.length ? "Already added" : "Nothing to add"); return; }
  S.accounts.push(...fresh);
  await persist();
  renderList();
  for (const n of fresh) document.querySelector(`.card[data-id="${CSS.escape(n.id)}"]`)?.classList.add("zap");
  bolt();
  toast(`⚡ Added ${fresh.length} account${fresh.length === 1 ? "" : "s"}`);
}

$("#btn-add").onclick = () => {
  const sh = sheet(`<h2>Add an account</h2>
    <button class="choice" data-k="scan"><span class="ico">📷</span><div><b>Scan a QR code</b><span>A site's 2-factor QR code, or a transfer code from your PC</span></div></button>
    <button class="choice" data-k="manual"><span class="ico">⌨︎</span><div><b>Enter a setup key</b><span>When a site shows "can't scan? enter this key"</span></div></button>
    <button class="choice" data-k="link"><span class="ico">🔗</span><div><b>Paste a 2-factor link</b><span>A link starting with otpauth://</span></div></button>
    <button class="choice" data-k="backup"><span class="ico">🗂</span><div><b>Import a backup file</b><span>From Zeus One Authenticator on another device</span></div></button>`);
  sh.addEventListener("click", (e) => {
    const k = e.target.closest(".choice")?.dataset.k;
    if (!k) return;
    sh.close();
    if (k === "scan") openScanner();
    if (k === "manual") manualSheet();
    if (k === "link") linkSheet();
    if (k === "backup") importBackup();
  });
};

function manualSheet() {
  const sh = sheet(`<h2>Enter a setup key</h2>
    <label>Site / service</label><input type="text" class="iss" placeholder="e.g. GitHub" autocapitalize="words">
    <label>Account (email or username)</label><input type="text" class="lab" placeholder="optional" autocapitalize="off" autocorrect="off">
    <label>Setup key</label><input type="text" class="sec" placeholder="e.g. JBSW Y3DP EHPK 3PXP" autocapitalize="characters" autocorrect="off" spellcheck="false">
    <details><summary>Advanced (only if the site says so)</summary>
      <div class="row">
        <div><label>Digits</label><select class="dig"><option>6</option><option>8</option></select></div>
        <div><label>Seconds</label><select class="per"><option>30</option><option>60</option></select></div>
        <div><label>Algorithm</label><select class="alg"><option>SHA1</option><option>SHA256</option><option>SHA512</option></select></div>
      </div></details>
    <div class="err"></div><button class="btn gold add">Add account</button>`);
  sh.q(".add").onclick = async () => {
    try {
      if (!sh.q(".iss").value.trim()) throw new Error("Enter the site's name.");
      const a = C.cleanAccount({ issuer: sh.q(".iss").value, label: sh.q(".lab").value, secret: sh.q(".sec").value,
        digits: sh.q(".dig").value, period: sh.q(".per").value, algorithm: sh.q(".alg").value });
      sh.close();
      await addAccounts([a]);
    } catch (e) { sh.q(".err").textContent = e.message; }
  };
}

function linkSheet() {
  const sh = sheet(`<h2>Paste a 2-factor link</h2><label>Link</label>
    <textarea class="uri" placeholder="otpauth://totp/..." autocapitalize="off" autocorrect="off" spellcheck="false"></textarea>
    <div class="err"></div><button class="btn gold add">Add account</button>`);
  sh.q(".add").onclick = async () => {
    try { const a = C.parseOtpauth(sh.q(".uri").value); sh.close(); await confirmAdd([a]); }
    catch (e) { sh.q(".err").textContent = e.message; }
  };
}

function confirmAdd(list) {
  const sh = sheet(`<h2>Add ${list.length === 1 ? "this account" : `${list.length} accounts`}?</h2>
    ${list.map((a) => `<div class="acct"><b>${esc(displayName(a))}</b>${a.issuer && a.label ? `<div class="muted">${esc(a.label)}</div>` : ""}</div>`).join("")}
    <button class="btn gold ok">Add</button>`);
  sh.q(".ok").onclick = async () => { sh.close(); await addAccounts(list); };
}

async function handleScan(text) {
  if (C.isTransfer(text)) { receiveTransfer(text); return; }
  if (/^otpauth-migration:/i.test(text)) {
    toast("Google Authenticator exports aren't supported - add accounts one by one");
    return;
  }
  try { await confirmAdd([C.parseOtpauth(text)]); }
  catch { toast("That QR code isn't a 2-factor code"); }
}

let lastTransferCode = "";
function receiveTransfer(text) {
  const sh = sheet(`<h2>Receive from your PC</h2>
    <p class="muted">Type the transfer code shown next to the QR code in Zeus One Authenticator on your PC.</p>
    <label>Transfer code</label>
    <input type="text" class="code" placeholder="XXXX-XXXX" autocapitalize="characters" autocorrect="off" spellcheck="false" value="${esc(lastTransferCode)}">
    <div class="err"></div><button class="btn gold ok">Unlock & add</button>`);
  setTimeout(() => sh.q(".code").focus(), 250);
  sh.q(".ok").onclick = async () => {
    const code = sh.q(".code").value;
    try {
      const list = await busy(sh, () => C.openTransfer(text, code));
      lastTransferCode = code;
      sh.close();
      await confirmAdd(list);
    } catch (e) {
      sh.q(".err").textContent = e.name === "WrongSecret" ? "That code doesn't match. Check the code on your PC screen." : e.message;
    }
  };
}

// ---------------------------------------------------------------- scanner
let scanStream = null, scanLoop = null;
async function openScanner() {
  const video = $("#video");
  $("#scan-hint").textContent = "Point the camera at the QR code";
  $("#scanner").classList.remove("hidden");
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) {
    stopScanner();
    toast(e.name === "NotAllowedError" ? "Camera blocked - allow it in Settings > Safari > Camera" : "Couldn't start the camera");
    return;
  }
  video.srcObject = scanStream;
  try { await video.play(); } catch { /* autoplay attr handles it */ }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let busyFrame = false;
  scanLoop = setInterval(() => {
    if (busyFrame || !video.videoWidth) return;
    busyFrame = true;
    try {
      // crop the centre square (where the on-screen frame is) and scale it down
      const vw = video.videoWidth, vh = video.videoHeight, side = Math.min(vw, vh);
      const out = Math.min(720, side);
      canvas.width = canvas.height = out;
      ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, out, out);
      const img = ctx.getImageData(0, 0, out, out);
      const text = decodeQR(img.data, out, out);
      if (text) { stopScanner(); bolt(); handleScan(text); }
    } catch { /* keep scanning */ }
    busyFrame = false;
  }, 160);
}
function stopScanner() {
  clearInterval(scanLoop);
  scanLoop = null;
  if (scanStream) scanStream.getTracks().forEach((t) => t.stop());
  scanStream = null;
  $("#video").srcObject = null;
  $("#scanner").classList.add("hidden");
}
$("#btn-scan-cancel").onclick = stopScanner;

// ---------------------------------------------------------------- backups
async function backupNow() {
  if (!S.accounts.length) { toast("No accounts to back up yet"); return; }
  const pw = await askPassword({ title: "Back up your codes",
    text: "Choose a password for this backup file. You'll need it to restore - on this phone, a new phone, or your PC. Use at least 8 characters.",
    confirm: true, button: "Create backup", minLen: 8 });
  if (pw === null) return;
  const text = await busy(document.body, () => C.makeBackup(S.accounts, pw));
  // Saving must happen in a fresh tap (iPhone requires it for the share sheet).
  const sh = sheet(`<h2>Backup ready ⚡</h2>
    <p class="muted">${S.accounts.length} account${S.accounts.length === 1 ? "" : "s"}, encrypted. Tap below and choose <b>Save to Files</b> (iCloud Drive is ideal), or send it to yourself.</p>
    <button class="btn gold save">Save backup file</button>`);
  sh.q(".save").onclick = async () => {
    const ok = await shareOrDownload(`ZeusOneAuth-backup-${today()}.zoauth`, text);
    if (ok) {
      S.meta.backedUpAt = Date.now();
      saveMeta();
      renderBanner();
      sh.close();
      toast("⚡ Backup saved");
    }
  };
}
$("#btn-banner-backup").onclick = backupNow;

async function importBackup() {
  const text = await pickFile();
  if (text === null) return;
  const pw = await askPassword({ title: "Backup password", text: "Enter the password you chose when you made this backup." });
  if (pw === null) return;
  try {
    const list = await busy(document.body, () => C.openBackup(text, pw));
    await confirmAdd(list);
  } catch (e) { toast(e.name === "WrongSecret" ? "Wrong backup password." : e.message); }
}

// --------------------------------------------------------------- settings
$("#btn-settings").onclick = () => {
  const sh = sheet(`<h2>Settings</h2>
    <button class="choice" data-k="backup"><span class="ico">⚡</span><div><b>Back up now</b><span>${S.meta.backedUpAt ? "Last backup " + new Date(S.meta.backedUpAt).toLocaleDateString() : "Never backed up"}</span></div></button>
    <button class="choice" data-k="import"><span class="ico">🗂</span><div><b>Import a backup file</b><span>Adds accounts; keeps the ones you have</span></div></button>
    <button class="choice" data-k="pw"><span class="ico">🔑</span><div><b>Change app password</b><span>Your Recovery Key keeps working</span></div></button>
    <button class="choice" data-k="rk"><span class="ico">🛟</span><div><b>Create a new Recovery Key</b><span>The old one stops working</span></div></button>
    <label>Lock when I leave the app for</label>
    <select class="lockm">${[[0, "Immediately"], [1, "1 minute"], [5, "5 minutes"], [15, "15 minutes"]].map(([v, t]) => `<option value="${v}" ${S.meta.lockMinutes === v ? "selected" : ""}>${t}</option>`).join("")}</select>
    <button class="btn danger" data-k="erase">Erase everything on this phone</button>
    <p class="muted" style="text-align:center;margin-top:14px">Zeus One Authenticator ${VERSION}<br>AES-256 encrypted · works offline · nothing leaves your phone</p>`);
  sh.q(".lockm").onchange = () => { S.meta.lockMinutes = Number(sh.q(".lockm").value); saveMeta(); };
  sh.addEventListener("click", async (e) => {
    const k = e.target.closest("[data-k]")?.dataset.k;
    if (!k) return;
    sh.close();
    if (k === "backup") backupNow();
    if (k === "import") importBackup();
    if (k === "pw") changePassword();
    if (k === "rk") newRecoveryKey();
    if (k === "erase") eraseAll();
  });
};

async function changePassword() {
  const cur = await askPassword({ title: "Current app password" });
  if (cur === null) return;
  try { await busy(document.body, () => C.unlockWithPassword(S.store, cur)); }
  catch { toast("Wrong password."); return; }
  const pw = await askPassword({ title: "New app password", confirm: true, minLen: 6, button: "Change password" });
  if (pw === null) return;
  await busy(document.body, () => C.wrapPassword(S.store, S.dataKey, pw));
  writeStore();
  toast("⚡ Password changed");
}

async function newRecoveryKey() {
  if (!confirm("Create a new Recovery Key? Your old one will stop working immediately.")) return;
  const raw = crypto.getRandomValues(new Uint8Array(30));
  await C.wrapRecovery(S.store, S.dataKey, raw);
  writeStore();
  showRecoveryKey(C.formatRecoveryKey(raw), () => enterMain());
}

function eraseAll() {
  const sh = sheet(`<h2>Erase everything?</h2>
    <p>This deletes every account from this phone. Without a backup, you could be locked out of those sites.</p>
    <label>Type ERASE to confirm</label><input type="text" class="cf" autocapitalize="characters">
    <button class="btn danger go">Erase</button>`);
  sh.q(".go").onclick = () => {
    if (sh.q(".cf").value.trim() !== "ERASE") { toast("Type ERASE to confirm"); return; }
    localStorage.removeItem(LS_STORE);
    localStorage.removeItem(LS_META);
    S.store = null; S.meta = loadMeta();
    lock();
    sh.close();
    show("#screen-welcome");
  };
}

start();
