// Zeus One Authenticator - shared core (browser + Node 18+).
// TOTP (RFC 6238), otpauth:// parsing, and the encrypted formats shared with the
// Windows app. Uses only the built-in Web Crypto API.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

// ------------------------------------------------------------------ encoding
export function b64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function unb64(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, ""));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export function b64url(bytes) {
  return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export function randomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function normalizeSecret(s) {
  return String(s || "").toUpperCase().replace(/[\s\-=]/g, "");
}
export function base32Decode(str) {
  const s = normalizeSecret(str);
  if (!s.length) throw new Error("The secret key is empty.");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error("The secret key contains an invalid character: " + ch);
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}
export function base32Encode(bytes) {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

// ---------------------------------------------------------------------- TOTP
const HASHES = { SHA1: "SHA-1", SHA256: "SHA-256", SHA512: "SHA-512" };

export async function totp(account, nowMs = Date.now()) {
  const period = account.period || 30;
  const digits = account.digits || 6;
  const counter = Math.floor(nowMs / 1000 / period);
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
  const key = await subtle.importKey("raw", base32Decode(account.secret),
    { name: "HMAC", hash: HASHES[account.algorithm || "SHA1"] || "SHA-1" }, false, ["sign"]);
  const h = new Uint8Array(await subtle.sign("HMAC", key, msg));
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  const code = (bin % 10 ** digits).toString().padStart(digits, "0");
  const remaining = period - (Math.floor(nowMs / 1000) % period);
  return { code, remaining, period };
}

// ------------------------------------------------------------------ otpauth
export function cleanAccount(a) {
  const alg = String(a.algorithm || "SHA1").toUpperCase().replace("-", "");
  const out = {
    id: a.id || b64url(randomBytes(9)),
    issuer: String(a.issuer || "").trim().slice(0, 80),
    label: String(a.label || "").trim().slice(0, 120),
    secret: normalizeSecret(a.secret),
    algorithm: HASHES[alg] ? alg : "SHA1",
    digits: [6, 7, 8].includes(Number(a.digits)) ? Number(a.digits) : 6,
    period: Number(a.period) > 0 && Number(a.period) <= 300 ? Number(a.period) : 30,
    created: a.created || Date.now(),
  };
  base32Decode(out.secret); // validates
  if (!out.issuer && !out.label) out.label = "Account";
  return out;
}

export function parseOtpauth(uri) {
  const text = String(uri || "").trim();
  if (!/^otpauth:\/\//i.test(text)) throw new Error("That isn't a 2-factor (otpauth) code.");
  const m = text.match(/^otpauth:\/\/([^/]+)\/([^?]*)\??(.*)$/i);
  if (!m) throw new Error("That 2-factor link is malformed.");
  const type = m[1].toLowerCase();
  if (type !== "totp") throw new Error("Only time-based (TOTP) codes are supported.");
  const params = new URLSearchParams(m[3]);
  let labelPart = decodeURIComponent(m[2] || "");
  let issuer = params.get("issuer") || "";
  let label = labelPart;
  const colon = labelPart.indexOf(":");
  if (colon >= 0) {
    const prefix = labelPart.slice(0, colon).trim();
    label = labelPart.slice(colon + 1).trim();
    if (!issuer) issuer = prefix;
  }
  if (!params.get("secret")) throw new Error("That 2-factor link has no secret key.");
  return cleanAccount({
    issuer, label, secret: params.get("secret"),
    algorithm: params.get("algorithm") || "SHA1",
    digits: params.get("digits") || 6, period: params.get("period") || 30,
  });
}

export function toOtpauth(a) {
  const label = encodeURIComponent(a.issuer ? `${a.issuer}:${a.label}` : a.label);
  const q = new URLSearchParams({ secret: a.secret });
  if (a.issuer) q.set("issuer", a.issuer);
  if (a.algorithm !== "SHA1") q.set("algorithm", a.algorithm);
  if (a.digits !== 6) q.set("digits", String(a.digits));
  if (a.period !== 30) q.set("period", String(a.period));
  return `otpauth://totp/${label}?${q.toString()}`;
}

// ----------------------------------------------------------- key derivation
async function pbkdf2(secretText, salt, iterations) {
  const base = await subtle.importKey("raw", enc.encode(secretText), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, 256);
  return new Uint8Array(bits);
}
async function hkdf(ikm, salt, info) {
  const base = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: enc.encode(info) }, base, 256);
  return new Uint8Array(bits);
}
async function aesKey(raw) {
  return subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(raw, plain, aad) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) },
    await aesKey(raw), plain));
  return { iv, ct };
}
async function open(raw, iv, ct, aad) {
  try {
    return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) },
      await aesKey(raw), ct));
  } catch {
    throw new WrongSecret();
  }
}
export class WrongSecret extends Error {
  constructor(msg = "Wrong password or code.") { super(msg); this.name = "WrongSecret"; }
}

// ----------------------------------------------- transfer QR (PC -> phone)
// "ZO1T." + base64url(salt16 | iv12 | AES-256-GCM ciphertext)
// key = PBKDF2-SHA256(transfer code, salt, 200000). Payload JSON: {"v":1,"a":[[issuer,label,secret,alg,digits,period],...]}
export const TRANSFER_PREFIX = "ZO1T.";
export const TRANSFER_ITER = 200000;
const AAD_TRANSFER = "zeusone-auth/transfer/v1";
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function normalizeTransferCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function isTransfer(text) {
  return String(text || "").startsWith(TRANSFER_PREFIX);
}
export async function makeTransfer(accounts, code) {
  const payload = JSON.stringify({ v: 1, a: accounts.map(a => [a.issuer, a.label, a.secret, a.algorithm, a.digits, a.period]) });
  const salt = randomBytes(16);
  const key = await pbkdf2(normalizeTransferCode(code), salt, TRANSFER_ITER);
  const { iv, ct } = await seal(key, enc.encode(payload), AAD_TRANSFER);
  return TRANSFER_PREFIX + b64url(concat(salt, iv, ct));
}
export async function openTransfer(text, code) {
  if (!isTransfer(text)) throw new Error("This isn't a Zeus One transfer code.");
  const raw = unb64(text.slice(TRANSFER_PREFIX.length));
  if (raw.length < 16 + 12 + 16) throw new Error("The transfer code is damaged.");
  const key = await pbkdf2(normalizeTransferCode(code), raw.slice(0, 16), TRANSFER_ITER);
  const plain = await open(key, raw.slice(16, 28), raw.slice(28), AAD_TRANSFER);
  const data = JSON.parse(dec.decode(plain));
  return data.a.map(([issuer, label, secret, algorithm, digits, period]) =>
    cleanAccount({ issuer, label, secret, algorithm, digits, period }));
}

// ------------------------------------------------- backup file (.zoauth)
export const BACKUP_ITER = 600000;
const AAD_BACKUP = "zeusone-auth/backup/v1";

export async function makeBackup(accounts, password) {
  const salt = randomBytes(16);
  const key = await pbkdf2(password, salt, BACKUP_ITER);
  const { iv, ct } = await seal(key, enc.encode(JSON.stringify({ accounts })), AAD_BACKUP);
  return JSON.stringify({
    format: "zeusone-auth-backup", v: 1,
    kdf: { name: "PBKDF2-SHA256", iter: BACKUP_ITER, salt: b64(salt) },
    iv: b64(iv), ct: b64(ct), created: new Date().toISOString(),
  }, null, 1);
}
export async function openBackup(text, password) {
  let doc;
  try { doc = JSON.parse(text); } catch { throw new Error("This file isn't a Zeus One Authenticator backup."); }
  if (doc.format !== "zeusone-auth-backup") throw new Error("This file isn't a Zeus One Authenticator backup.");
  if (doc.v !== 1 || doc.kdf?.name !== "PBKDF2-SHA256") throw new Error("This backup was made by a newer version.");
  const key = await pbkdf2(password, unb64(doc.kdf.salt), doc.kdf.iter);
  const plain = await open(key, unb64(doc.iv), unb64(doc.ct), AAD_BACKUP);
  return JSON.parse(dec.decode(plain)).accounts.map(cleanAccount);
}

// ------------------------------------------- on-device store (iPhone app)
// Same envelope idea as Zeus One Vault: a random data key wrapped by the
// password (PBKDF2) and by a Recovery Key (HKDF).
export const STORE_ITER = 600000;
const AAD_PW = "zeusone-auth/store/pw", AAD_RK = "zeusone-auth/store/rk", AAD_DATA = "zeusone-auth/store/data";

export function formatRecoveryKey(raw) {
  const s = base32Encode(raw);
  return s.match(/.{1,4}/g).join("-");
}
export function parseRecoveryKey(text) {
  let s = String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
    .replace(/0/g, "O").replace(/1/g, "I").replace(/8/g, "B");
  if (s.length !== 48) throw new WrongSecret("A Recovery Key is 48 letters and digits (12 groups of 4).");
  return base32Decode(s);
}

export async function createStore(password) {
  const dataKey = randomBytes(32);
  const recovery = randomBytes(30);
  const store = { format: "zeusone-auth-store", v: 1, kdf: { iter: STORE_ITER, salt: b64(randomBytes(16)) } };
  await wrapPassword(store, dataKey, password);
  await wrapRecovery(store, dataKey, recovery);
  await saveData(store, dataKey, []);
  return { store, dataKey, recoveryKey: formatRecoveryKey(recovery) };
}
export async function wrapPassword(store, dataKey, password) {
  store.kdf = { iter: STORE_ITER, salt: b64(randomBytes(16)) };
  const k = await pbkdf2(password, unb64(store.kdf.salt), store.kdf.iter);
  const { iv, ct } = await seal(k, dataKey, AAD_PW);
  store.pw = { iv: b64(iv), ct: b64(ct) };
}
export async function wrapRecovery(store, dataKey, recoveryRaw) {
  const salt = randomBytes(16);
  const k = await hkdf(recoveryRaw, salt, "zeusone-auth/recovery");
  const { iv, ct } = await seal(k, dataKey, AAD_RK);
  store.rk = { salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
export async function unlockWithPassword(store, password) {
  const k = await pbkdf2(password, unb64(store.kdf.salt), store.kdf.iter);
  return open(k, unb64(store.pw.iv), unb64(store.pw.ct), AAD_PW);
}
export async function unlockWithRecovery(store, recoveryText) {
  const raw = parseRecoveryKey(recoveryText);
  const k = await hkdf(raw, unb64(store.rk.salt), "zeusone-auth/recovery");
  return open(k, unb64(store.rk.iv), unb64(store.rk.ct), AAD_RK);
}
export async function saveData(store, dataKey, accounts) {
  const { iv, ct } = await seal(dataKey, enc.encode(JSON.stringify({ accounts })), AAD_DATA);
  store.data = { iv: b64(iv), ct: b64(ct) };
}
export async function loadData(store, dataKey) {
  const plain = await open(dataKey, unb64(store.data.iv), unb64(store.data.ct), AAD_DATA);
  return JSON.parse(dec.decode(plain)).accounts.map(cleanAccount);
}
