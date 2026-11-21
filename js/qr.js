// Zeus One Authenticator - self-contained QR code reader (no libraries).
// Pipeline: adaptive binarization -> finder pattern search -> alignment pattern
// -> perspective sampling -> format/version -> unmask -> de-interleave ->
// Reed-Solomon error correction -> segment decoding.
// The version/error-correction tables are the standard ISO/IEC 18004 values
// (as also used by Kazuhiko Arase's QRCode library), with the version 15-H
// entry corrected to 11x(36,12) + 7x(37,13) per the standard.

// [alignment centers, [L, M, Q, H] block specs: count,total,data(,count2,total2,data2)]
const VERSIONS = [[[],[[1,26,19],[1,26,16],[1,26,13],[1,26,9]]],[[6,18],[[1,44,34],[1,44,28],[1,44,22],[1,44,16]]],[[6,22],[[1,70,55],[1,70,44],[2,35,17],[2,35,13]]],[[6,26],[[1,100,80],[2,50,32],[2,50,24],[4,25,9]]],[[6,30],[[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12]]],[[6,34],[[2,86,68],[4,43,27],[4,43,19],[4,43,15]]],[[6,22,38],[[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14]]],[[6,24,42],[[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15]]],[[6,26,46],[[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13]]],[[6,28,50],[[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16]]],[[6,30,54],[[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13]]],[[6,32,58],[[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15]]],[[6,34,62],[[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12]]],[[6,26,46,66],[[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13]]],[[6,26,48,70],[[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12,7,37,13]]],[[6,26,50,74],[[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16]]],[[6,30,54,78],[[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15]]],[[6,30,56,82],[[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15]]],[[6,30,58,86],[[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14]]],[[6,34,62,90],[[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16]]],[[6,28,50,72,94],[[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17]]],[[6,26,50,74,98],[[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13]]],[[6,30,54,78,102],[[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16]]],[[6,28,54,80,106],[[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17]]],[[6,32,58,84,110],[[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16]]],[[6,30,58,86,114],[[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17]]],[[6,34,62,90,118],[[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16]]],[[6,26,50,74,98,122],[[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16]]],[[6,30,54,78,102,126],[[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16]]],[[6,26,52,78,104,130],[[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16]]],[[6,30,56,82,108,134],[[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16]]],[[6,34,60,86,112,138],[[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16]]],[[6,30,58,86,114,142],[[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16]]],[[6,34,62,90,118,146],[[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17]]],[[6,30,54,78,102,126,150],[[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16]]],[[6,24,50,76,102,128,154],[[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16]]],[[6,28,54,80,106,132,158],[[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16]]],[[6,32,58,84,110,136,162],[[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16]]],[[6,26,54,82,110,138,166],[[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16]]],[[6,30,58,86,114,142,170],[[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]]]];

// ------------------------------------------------------------------ bitmap
class Bits {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8Array(w * h); }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[y * this.w + x] === 1; }
  set(x, y, v = 1) { this.d[y * this.w + x] = v ? 1 : 0; }
  region(x, y, w, h) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j); }
}

// --------------------------------------------------------------- binarize
function luminance(rgba, w, h) {
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = (rgba[p] * 0.2126 + rgba[p + 1] * 0.7152 + rgba[p + 2] * 0.0722);
  }
  return out;
}

function binarize(lum, w, h, invert = false, B = 8) {
  const bw = Math.ceil(w / B), bh = Math.ceil(h / B);
  const bits = new Bits(w, h);
  if (bw < 5 || bh < 5) {
    let s = 0;
    for (let i = 0; i < lum.length; i++) s += lum[i];
    const t = s / lum.length;
    for (let i = 0; i < lum.length; i++) bits.d[i] = (lum[i] <= t) !== invert ? 1 : 0;
    return bits;
  }
  const avg = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let min = 255, max = 0, sum = 0, n = 0;
      for (let y = by * B; y < Math.min(h, by * B + B); y++) {
        for (let x = bx * B; x < Math.min(w, bx * B + B); x++) {
          const v = lum[y * w + x];
          sum += v; n++;
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      let a = sum / n;
      if (max - min <= 24) {
        a = min / 2;
        if (by > 0 && bx > 0) {
          const nb = (avg[(by - 1) * bw + bx] + 2 * avg[by * bw + bx - 1] + avg[(by - 1) * bw + bx - 1]) / 4;
          if (min < nb) a = nb;
        }
      }
      avg[by * bw + bx] = a;
    }
  }
  for (let by = 0; by < bh; by++) {
    const cy = Math.min(Math.max(by, 2), bh - 3);
    for (let bx = 0; bx < bw; bx++) {
      const cx = Math.min(Math.max(bx, 2), bw - 3);
      let s = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s += avg[(cy + dy) * bw + cx + dx];
      const t = s / 25;
      for (let y = by * B; y < Math.min(h, by * B + B); y++) {
        for (let x = bx * B; x < Math.min(w, bx * B + B); x++) {
          bits.d[y * w + x] = (lum[y * w + x] <= t) !== invert ? 1 : 0;
        }
      }
    }
  }
  return bits;
}

// ---------------------------------------------------------- finder patterns
function ratioOk(c, diag = false) {
  const total = c[0] + c[1] + c[2] + c[3] + c[4];
  if (total < 7 || c.some(v => v === 0)) return false;
  const m = total / 7, v = diag ? m / 1.333 : m / 2;
  return Math.abs(m - c[0]) < v && Math.abs(m - c[1]) < v && Math.abs(3 * m - c[2]) < 3 * v &&
    Math.abs(m - c[3]) < v && Math.abs(m - c[4]) < v;
}
const centerFromEnd = (c, end) => end - c[4] - c[3] - c[2] / 2;

function crossCheck(bits, cx, cy, dx, dy, maxCount, originalTotal) {
  // walk from (cx,cy) along -d then +d counting dark/light/dark runs
  const c = [0, 0, 0, 0, 0];
  const dark = (k) => bits.get(Math.round(cx + dx * k), Math.round(cy + dy * k));
  const inside = (k) => {
    const x = Math.round(cx + dx * k), y = Math.round(cy + dy * k);
    return x >= 0 && y >= 0 && x < bits.w && y < bits.h;
  };
  let k = 0;
  while (inside(k) && dark(k)) { c[2]++; k--; }
  if (!inside(k)) return NaN;
  while (inside(k) && !dark(k) && c[1] <= maxCount) { c[1]++; k--; }
  if (!inside(k) || c[1] > maxCount) return NaN;
  while (inside(k) && dark(k) && c[0] <= maxCount) { c[0]++; k--; }
  if (c[0] > maxCount) return NaN;
  k = 1;
  while (inside(k) && dark(k)) { c[2]++; k++; }
  if (!inside(k)) return NaN;
  while (inside(k) && !dark(k) && c[3] < maxCount) { c[3]++; k++; }
  if (!inside(k) || c[3] >= maxCount) return NaN;
  while (inside(k) && dark(k) && c[4] < maxCount) { c[4]++; k++; }
  if (c[4] >= maxCount) return NaN;
  const total = c[0] + c[1] + c[2] + c[3] + c[4];
  if (5 * Math.abs(total - originalTotal) >= 2 * originalTotal) return NaN;
  if (!ratioOk(c, dx !== 0 && dy !== 0)) return NaN;
  return { offset: k - c[4] - c[3] - c[2] / 2, total };
}

function findFinders(bits) {
  const cands = [];
  const add = (sc, y, endX) => {
    const total = sc.reduce((a, b) => a + b, 0);
    let cx = centerFromEnd(sc, endX);
    const v = crossCheck(bits, Math.floor(cx), y, 0, 1, sc[2], total);
    if (!v || Number.isNaN(v)) return;
    const cy = y + v.offset;
    const hz = crossCheck(bits, Math.floor(cx), Math.round(cy), 1, 0, sc[2], total);
    if (!hz || Number.isNaN(hz)) return;
    cx = Math.floor(cx) + hz.offset;
    const dg = crossCheck(bits, Math.round(cx), Math.round(cy), 1, 1, sc[2], total);
    if (!dg || Number.isNaN(dg)) return;
    const ms = (total + v.total + hz.total) / 21;
    for (const p of cands) {
      if (Math.abs(cy - p.y) <= ms && Math.abs(cx - p.x) <= ms && (Math.abs(ms - p.ms) <= 1 || Math.abs(ms - p.ms) <= p.ms)) {
        const n = p.count + 1;
        p.x = (p.count * p.x + cx) / n; p.y = (p.count * p.y + cy) / n; p.ms = (p.count * p.ms + ms) / n; p.count = n;
        return;
      }
    }
    cands.push({ x: cx, y: cy, ms, count: 1 });
  };
  for (let y = 0; y < bits.h; y++) {
    const sc = [0, 0, 0, 0, 0];
    let st = 0;
    for (let x = 0; x < bits.w; x++) {
      if (bits.d[y * bits.w + x]) {
        if (st & 1) st++;
        sc[st]++;
      } else if (!(st & 1)) {
        if (st === 4) {
          if (ratioOk(sc)) add(sc, y, x);
          sc[0] = sc[2]; sc[1] = sc[3]; sc[2] = sc[4]; sc[3] = 1; sc[4] = 0; st = 3;
        } else { st++; sc[st]++; }
      } else sc[st]++;
    }
    if (st === 4 && ratioOk(sc)) add(sc, y, bits.w);
  }
  return cands;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function finderTriples(cands) {
  let pool = cands.filter(c => c.count >= 2);
  if (pool.length < 3) pool = cands.slice();
  pool.sort((a, b) => b.count - a.count);
  pool = pool.slice(0, 10);
  const out = [];
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) for (let k = j + 1; k < pool.length; k++) {
    let [a, b, c] = [pool[i], pool[j], pool[k]];
    const mss = [a.ms, b.ms, c.ms];
    if (Math.max(...mss) / Math.min(...mss) > 1.8) continue;
    // top-left = vertex opposite the longest side
    const ab = dist(a, b), bc = dist(b, c), ac = dist(a, c);
    let tl, p, q;
    if (bc >= ab && bc >= ac) { tl = a; p = b; q = c; }
    else if (ac >= ab && ac >= bc) { tl = b; p = a; q = c; }
    else { tl = c; p = a; q = b; }
    const v1 = { x: p.x - tl.x, y: p.y - tl.y }, v2 = { x: q.x - tl.x, y: q.y - tl.y };
    const l1 = Math.hypot(v1.x, v1.y), l2 = Math.hypot(v2.x, v2.y);
    const ms = (a.ms + b.ms + c.ms) / 3;
    if (l1 < ms * 10 || l2 < ms * 10) continue;
    const cos = (v1.x * v2.x + v1.y * v2.y) / (l1 * l2);
    const legRatio = Math.max(l1, l2) / Math.min(l1, l2);
    if (Math.abs(cos) > 0.55 || legRatio > 2) continue;
    // orientation: in y-down image coords, TR x BL cross product is positive
    const cross = v1.x * v2.y - v1.y * v2.x;
    const [tr, bl] = cross > 0 ? [p, q] : [q, p];
    out.push({ tl, tr, bl, ms, score: Math.abs(cos) + (legRatio - 1) + (Math.max(...mss) / Math.min(...mss) - 1) });
  }
  out.sort((x, y) => x.score - y.score);
  return out.slice(0, 6);
}

// -------------------------------------------------------------- homography
function solve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    if (Math.abs(A[i][i]) < 1e-12) return null;
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / A[i][i];
  }
  return x;
}
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i], [x, y] = dst[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  const h = solve(A, b);
  if (!h) return null;
  return (u, v) => {
    const d = h[6] * u + h[7] * v + 1;
    return [(h[0] * u + h[1] * v + h[2]) / d, (h[3] * u + h[4] * v + h[5]) / d];
  };
}

// --------------------------------------------------------------- alignment
function findAlignment(bits, t, dim) {
  // affine estimate of module-space -> image
  const ex = { x: (t.tr.x - t.tl.x) / (dim - 7), y: (t.tr.y - t.tl.y) / (dim - 7) };
  const ey = { x: (t.bl.x - t.tl.x) / (dim - 7), y: (t.bl.y - t.tl.y) / (dim - 7) };
  const u = dim - 6.5 - 3.5;
  const est = { x: t.tl.x + ex.x * u + ey.x * u, y: t.tl.y + ex.y * u + ey.y * u };
  const ms = t.ms;
  const R = Math.max(4, ms * 6);
  const step = Math.max(1, ms / 4);
  let best = null;
  for (let y = est.y - R; y <= est.y + R; y += step) {
    for (let x = est.x - R; x <= est.x + R; x += step) {
      let score = 0;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
        const px = Math.round(x + ex.x * a + ey.x * b), py = Math.round(y + ex.y * a + ey.y * b);
        const want = Math.max(Math.abs(a), Math.abs(b)) !== 1;
        if (bits.get(px, py) === want) score++;
      }
      if (score >= 22) {
        const d = Math.hypot(x - est.x, y - est.y);
        if (!best || score > best.score || (score === best.score && d < best.d)) best = { x, y, score, d };
      }
    }
  }
  return best;
}

function sampleGrid(bits, t, dim, align) {
  const src = [[3.5, 3.5], [dim - 3.5, 3.5], [3.5, dim - 3.5]];
  const dst = [[t.tl.x, t.tl.y], [t.tr.x, t.tr.y], [t.bl.x, t.bl.y]];
  if (align) { src.push([dim - 6.5, dim - 6.5]); dst.push([align.x, align.y]); }
  else { src.push([dim - 3.5, dim - 3.5]); dst.push([t.tr.x + t.bl.x - t.tl.x, t.tr.y + t.bl.y - t.tl.y]); }
  const H = homography(src, dst);
  if (!H) return null;
  const m = new Bits(dim, dim);
  let outside = 0;
  for (let y = 0; y < dim; y++) for (let x = 0; x < dim; x++) {
    const [px, py] = H(x + 0.5, y + 0.5);
    const ix = Math.round(px), iy = Math.round(py);
    if (ix < 0 || iy < 0 || ix >= bits.w || iy >= bits.h) { outside++; continue; }
    if (bits.d[iy * bits.w + ix]) m.set(x, y);
  }
  return outside > dim * 2 ? null : m;
}

// ------------------------------------------------------------ format/version
function bchCode(data, poly, polyDeg, dataBits) {
  let v = data << polyDeg;
  for (let i = dataBits + polyDeg - 1; i >= polyDeg; i--) if (v & (1 << i)) v ^= poly << (i - polyDeg);
  return (data << polyDeg) | v;
}
const FORMAT = [];
for (let d = 0; d < 32; d++) FORMAT.push([bchCode(d, 0x537, 10, 5) ^ 0x5412, d]);
const VERSION_CODES = [];
for (let v = 7; v <= 40; v++) VERSION_CODES.push([bchCode(v, 0x1f25, 12, 6), v]);
const popcount = (x) => { let c = 0; while (x) { c += x & 1; x >>>= 1; } return c; };
function bestMatch(table, ...reads) {
  let best = null, bd = 99;
  for (const r of reads) for (const [code, val] of table) {
    const d = popcount(r ^ code);
    if (d < bd) { bd = d; best = val; }
  }
  return bd <= 3 ? best : null;
}

function readFormat(m, dim) {
  let a = 0, b = 0;
  const bit = (x, y, acc) => (acc << 1) | (m.get(x, y) ? 1 : 0);
  for (let i = 0; i <= 5; i++) a = bit(i, 8, a);
  a = bit(7, 8, a); a = bit(8, 8, a); a = bit(8, 7, a);
  for (let j = 5; j >= 0; j--) a = bit(8, j, a);
  for (let j = dim - 1; j >= dim - 7; j--) b = bit(8, j, b);
  for (let i = dim - 8; i < dim; i++) b = bit(i, 8, b);
  const d = bestMatch(FORMAT, a, b);
  if (d === null) return null;
  return { ec: [1, 0, 3, 2][(d >> 3) & 3], mask: d & 7 }; // ec index into [L,M,Q,H]
}

function readVersion(m, dim) {
  const prov = (dim - 17) / 4;
  if (prov <= 6) return prov;
  let a = 0, b = 0;
  for (let j = 5; j >= 0; j--) for (let i = dim - 9; i >= dim - 11; i--) a = (a << 1) | (m.get(i, j) ? 1 : 0);
  for (let i = 5; i >= 0; i--) for (let j = dim - 9; j >= dim - 11; j--) b = (b << 1) | (m.get(i, j) ? 1 : 0);
  const v = bestMatch(VERSION_CODES, a, b);
  return v !== null && v * 4 + 17 === dim ? v : null;
}

function functionPattern(version, dim) {
  const f = new Bits(dim, dim);
  f.region(0, 0, 9, 9); f.region(dim - 8, 0, 8, 9); f.region(0, dim - 8, 9, 8);
  const centers = VERSIONS[version - 1][0];
  const last = centers.length - 1;
  for (let i = 0; i < centers.length; i++) for (let j = 0; j < centers.length; j++) {
    if ((i === 0 && (j === 0 || j === last)) || (i === last && j === 0)) continue;
    f.region(centers[i] - 2, centers[j] - 2, 5, 5);
  }
  f.region(6, 9, 1, dim - 17); f.region(9, 6, dim - 17, 1);
  if (version > 6) { f.region(dim - 11, 0, 3, 6); f.region(0, dim - 11, 6, 3); }
  return f;
}

const MASKS = [
  (i, j) => ((i + j) & 1) === 0,
  (i) => (i & 1) === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => ((Math.floor(i / 2) + Math.floor(j / 3)) & 1) === 0,
  (i, j) => (i * j) % 6 === 0,
  (i, j) => (i * j) % 6 < 3,
  (i, j) => ((i + j + ((i * j) % 3)) & 1) === 0,
];

function readCodewords(m, dim, version, mask) {
  const f = functionPattern(version, dim);
  const isMasked = MASKS[mask];
  const out = [];
  let up = true, cur = 0, n = 0;
  for (let j = dim - 1; j > 0; j -= 2) {
    if (j === 6) j--;
    for (let c = 0; c < dim; c++) {
      const i = up ? dim - 1 - c : c;
      for (let col = 0; col < 2; col++) {
        const x = j - col;
        if (f.get(x, i)) continue;
        let bit = m.get(x, i);
        if (isMasked(i, x)) bit = !bit;
        cur = (cur << 1) | (bit ? 1 : 0);
        if (++n === 8) { out.push(cur); cur = 0; n = 0; }
      }
    }
    up = !up;
  }
  return out;
}

function dataBlocks(raw, version, ec) {
  const spec = VERSIONS[version - 1][1][ec];
  const blocks = [];
  for (let s = 0; s < spec.length; s += 3) {
    for (let k = 0; k < spec[s]; k++) blocks.push({ data: spec[s + 2], cw: new Array(spec[s + 1]) });
  }
  const ecPer = spec[1] - spec[2];
  const shortTotal = blocks[0].cw.length;
  let longStart = blocks.length - 1;
  while (longStart >= 0 && blocks[longStart].cw.length !== shortTotal) longStart--;
  longStart++;
  const shortData = shortTotal - ecPer;
  let o = 0;
  for (let i = 0; i < shortData; i++) for (const b of blocks) b.cw[i] = raw[o++];
  for (let j = longStart; j < blocks.length; j++) blocks[j].cw[shortData] = raw[o++];
  const max = blocks[0].cw.length;
  for (let i = shortData; i < max; i++) {
    for (let j = 0; j < blocks.length; j++) blocks[j].cw[j < longStart ? i : i + 1] = raw[o++];
  }
  return blocks;
}

// ------------------------------------------------------------ Reed-Solomon
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
const gdiv = (a, b) => (a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0);
const polyEval = (p, x) => { let y = 0; for (let i = p.length - 1; i >= 0; i--) y = gmul(y, x) ^ p[i]; return y; }; // low-first

function rsCorrect(cw, nec) {
  const n = cw.length;
  const S = [];
  let bad = false;
  for (let i = 0; i < nec; i++) {
    let s = 0;
    for (let k = 0; k < n; k++) s = gmul(s, EXP[i]) ^ cw[k];
    S.push(s);
    if (s) bad = true;
  }
  if (!bad) return true;
  // Berlekamp-Massey
  let C = [1], B = [1], L = 0, m = 1, bb = 1;
  for (let r = 0; r < nec; r++) {
    let d = S[r];
    for (let i = 1; i <= L; i++) d ^= gmul(C[i] || 0, S[r - i]);
    if (d === 0) { m++; continue; }
    const coef = gdiv(d, bb);
    const T = C.slice();
    const len = Math.max(C.length, B.length + m);
    while (C.length < len) C.push(0);
    for (let i = 0; i < B.length; i++) C[i + m] ^= gmul(coef, B[i]);
    if (2 * L <= r) { L = r + 1 - L; B = T; bb = d; m = 1; } else m++;
  }
  if (L * 2 > nec) return false;
  // Chien search: error at power p <-> C(alpha^-p) == 0
  const errs = [];
  for (let p = 0; p < n; p++) if (polyEval(C, EXP[(255 - p) % 255]) === 0) errs.push(p);
  if (errs.length !== L) return false;
  // Omega = S(x) * C(x) mod x^nec
  const Om = new Array(nec).fill(0);
  for (let i = 0; i < nec; i++) for (let j = 0; j <= i && j < C.length; j++) Om[i] ^= gmul(C[j], S[i - j]);
  const dC = []; // formal derivative
  for (let i = 1; i < C.length; i++) dC.push(i & 1 ? C[i] : 0);
  for (const p of errs) {
    const Xi = EXP[(255 - p) % 255];
    const num = gmul(EXP[p], polyEval(Om, Xi));
    const den = polyEval(dC, Xi);
    if (!den) return false;
    cw[n - 1 - p] ^= gdiv(num, den);
  }
  return true;
}

// -------------------------------------------------------------- segments
const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
function decodeSegments(bytes, version) {
  let pos = 0;
  const avail = () => bytes.length * 8 - pos;
  const read = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++, pos++) v = (v << 1) | ((bytes[pos >> 3] >> (7 - (pos & 7))) & 1);
    return v;
  };
  const sz = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  let text = "";
  let raw = [];
  const flush = () => {
    if (!raw.length) return;
    const u8 = new Uint8Array(raw);
    try { text += new TextDecoder("utf-8", { fatal: true }).decode(u8); }
    catch { text += Array.from(u8, b => String.fromCharCode(b)).join(""); }
    raw = [];
  };
  while (avail() >= 4) {
    const mode = read(4);
    if (mode === 0) break;
    if (mode === 1) {
      flush();
      let count = read([10, 12, 14][sz]);
      while (count >= 3) { text += String(read(10)).padStart(3, "0"); count -= 3; }
      if (count === 2) text += String(read(7)).padStart(2, "0");
      else if (count === 1) text += String(read(4));
    } else if (mode === 2) {
      flush();
      let count = read([9, 11, 13][sz]);
      while (count >= 2) { const v = read(11); text += ALNUM[Math.floor(v / 45)] + ALNUM[v % 45]; count -= 2; }
      if (count === 1) text += ALNUM[read(6)];
    } else if (mode === 4) {
      const count = read([8, 16, 16][sz]);
      if (avail() < count * 8) return null;
      for (let i = 0; i < count; i++) raw.push(read(8));
    } else if (mode === 7) {
      const first = read(8);
      if ((first & 0x80) === 0x80) read((first & 0xc0) === 0xc0 ? 16 : 8);
    } else if (mode === 8) {
      flush();
      const count = read([8, 10, 12][sz]);
      for (let i = 0; i < count; i++) { read(13); text += "?"; }
    } else if (mode === 3) {
      read(16);
    } else if (mode === 5) {
      // FNC1 first position: nothing to read
    } else if (mode === 9) {
      read(8);
    } else return null;
  }
  flush();
  return text;
}

function decodeMatrix(m) {
  const dim = m.w;
  const fmt = readFormat(m, dim);
  if (!fmt) return null;
  const version = readVersion(m, dim);
  if (!version || version < 1 || version > 40) return null;
  const raw = readCodewords(m, dim, version, fmt.mask);
  const blocks = dataBlocks(raw, version, fmt.ec);
  const data = [];
  for (const b of blocks) {
    if (b.cw.some(v => v === undefined)) return null;
    if (!rsCorrect(b.cw, b.cw.length - b.data)) return null;
    for (let i = 0; i < b.data; i++) data.push(b.cw[i]);
  }
  return decodeSegments(data, version);
}

function transpose(m) {
  const t = new Bits(m.w, m.h);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.get(x, y)) t.set(y, x);
  return t;
}

// Module size measured along the line between two finder centres (the module
// axis), so it stays correct when the code is rotated or tilted.
function runAlong(bits, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const walk = (sx, sy) => {
    // from the dark centre: dark -> light -> dark -> light; return distance to that last edge
    let state = 0;
    for (let k = 0; k < len; k += 0.5) {
      const d = bits.get(Math.round(from.x + sx * k), Math.round(from.y + sy * k));
      if ((state === 0 || state === 2) && !d) state++;
      else if (state === 1 && d) state++;
      if (state === 3) return k;
    }
    return NaN;
  };
  const a = walk(ux, uy), b = walk(-ux, -uy);
  return Number.isNaN(a) || Number.isNaN(b) ? NaN : (a + b) / 7;
}
function refineModuleSize(bits, t) {
  const v = [runAlong(bits, t.tl, t.tr), runAlong(bits, t.tr, t.tl), runAlong(bits, t.tl, t.bl), runAlong(bits, t.bl, t.tl)]
    .filter(x => Number.isFinite(x) && x > 0);
  if (!v.length) return t.ms;
  const m = v.reduce((p, c) => p + c, 0) / v.length;
  return m > t.ms * 0.5 && m < t.ms * 1.2 ? m : t.ms;
}

function dimensionCandidates(t) {
  const est = ((dist(t.tl, t.tr) + dist(t.tl, t.bl)) / 2) / t.ms + 7;
  const out = [];
  for (let v = 1; v <= 40; v++) out.push(17 + 4 * v);
  return out.filter(d => Math.abs(d - est) <= 6).sort((a, b) => Math.abs(a - est) - Math.abs(b - est)).slice(0, 3);
}

function tryBits(bits) {
  const triples = finderTriples(findFinders(bits));
  for (const t of triples) {
    t.ms = refineModuleSize(bits, t);
    for (const dim of dimensionCandidates(t)) {
      const version = (dim - 17) / 4;
      const align = version >= 2 ? findAlignment(bits, t, dim) : null;
      for (const al of align ? [align, null] : [null]) {
        const m = sampleGrid(bits, t, dim, al);
        if (!m) continue;
        const r = decodeMatrix(m) ?? decodeMatrix(transpose(m));
        if (r !== null && r !== undefined) return r;
      }
    }
  }
  return null;
}

/**
 * Decode a QR code from RGBA pixel data (e.g. canvas getImageData().data).
 * Returns the text, or null if no readable code was found.
 */
export function decodeQR(rgba, width, height) {
  const lum = luminance(rgba, width, height);
  const big = Math.max(16, Math.round(Math.min(width, height) / 20));
  return tryBits(binarize(lum, width, height))
    ?? tryBits(binarize(lum, width, height, false, big))     // smoother threshold for washed-out photos
    ?? tryBits(binarize(stretch(lum), width, height, false, big))
    ?? tryBits(binarize(lum, width, height, true));           // light-on-dark codes
}

// contrast stretch (1st..99th percentile) for dim, low-contrast camera frames
function stretch(lum) {
  const hist = new Uint32Array(256);
  for (const v of lum) hist[v]++;
  const n = lum.length;
  let lo = 0, hi = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.01) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.01) { hi = i; break; } }
  if (hi - lo < 10) return lum;
  const out = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) out[i] = ((lum[i] - lo) * 255) / (hi - lo);
  return out;
}

export const _internal = { rsCorrect, EXP, decodeMatrix, binarize, findFinders };
