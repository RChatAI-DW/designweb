// partmap.js — 부품 지도(대표 11/10 「전체 지도를 만든 다음 끌어서 상하좌우 이동하거나 확대해서 세부 카테고리까지」).
//   자료: 서버 /api/partmap = 회사 새 상품코드 분류 나무(대분류 → 중분류 → 소분류, classes.ts) + 끝 노드마다 품번(판매순).
//   칸 넓이 = 품번 수의 제곱근(대표 11/10 권장안 — 작은 분류도 처음 화면에서 이름이 읽히게, 실제 수는 글자로 적는다).
//   미분류는 지도 맨 오른쪽 띠 하나.
//   그리기: 캔버스 한 장 · 화면에 보이는 칸만 · 칸이 충분히 커지면 아래 단(소분류 → 품번 칸)을 펼친다 · 글자는 읽힐 만큼 큰 칸에만.
//   조작: 끌기 = 이동 · 휠/두 손가락 = 확대·축소(마우스·손가락 자리 기준) · 칸 누르기 = 그 칸으로 들어가기 · 품번 칸 누르기 = 고르기
//         [＋][－][전체] 단추 · 위 경로 줄(전체 › 배관부품 › 팽창변)을 누르면 그 단으로.
//   길 안내(대표 11/15 「검색하면 단계별로 지금 뭘 하는지 지도에서 길 찾듯 움직이며」) — nav* 함수들. 순서는 route.js 가 정한다.
//     구역 비추기(spot: 나머지는 흐린 막) · 지나온 길(trail: 점선 + 지금 자리 점) · 품번 칸 상태(on 남음 · diff 값 달라 빠짐 · blank 값 비어 빠짐 · fin 도착) · 도착 순번.
//   색은 앱 토큰(style.css :root)만 쓴다 — 새 색을 만들지 않는다.

const HEAD = 0.12;            // 펼친 칸 윗머리(이름 줄) 높이 = 칸 높이의 비율
const OPEN_W = 180, OPEN_H = 170;   // 화면에서 이만큼 커지면 아래 단을 펼친다(px)
const TILE_LABEL_W = 60, TILE_LABEL_H = 24;
const FONT = '"SUIT", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const fmt = (n) => Number(n).toLocaleString("ko-KR");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const norm = (s) => String(s ?? "").toUpperCase().replace(/[\s\-_.()/,·]+/g, "");

/** 줄 세우기(squarified) — 값 비율대로 직사각형을 나눈다. 값은 큰 것부터 넣는다. */
function squarify(vals, x, y, w, h) {
  const out = [], sum = vals.reduce((a, b) => a + b, 0);
  if (!sum || w <= 0 || h <= 0) return vals.map(() => ({ x, y, w: 0, h: 0 }));
  const areas = vals.map((v) => (v / sum) * w * h);
  const worst = (row, s) => { const r = row.reduce((a, b) => a + b, 0), mx = Math.max(...row), mn = Math.min(...row); return Math.max((s * s * mx) / (r * r), (r * r) / (s * s * mn)); };
  let i = 0;
  while (i < areas.length) {
    const s = Math.min(w, h);
    let row = [areas[i]], j = i + 1;
    while (j < areas.length && worst([...row, areas[j]], s) <= worst(row, s)) { row.push(areas[j]); j++; }
    const rs = row.reduce((a, b) => a + b, 0);
    if (w >= h) { const cw = rs / h; let yy = y; for (const a of row) { out.push({ x, y: yy, w: cw, h: a / cw }); yy += a / cw; } x += cw; w -= cw; }
    else { const rh = rs / w; let xx = x; for (const a of row) { out.push({ x: xx, y, w: a / rh, h: rh }); xx += a / rh; } y += rh; h -= rh; }
    i = j;
  }
  return out;
}

export function createPartMap({ onPick, onPath } = {}) {
  const el = document.createElement("div");
  el.className = "pm-wrap";
  el.innerHTML = `<canvas class="pm-canvas" aria-label="부품 지도"></canvas>
    <div class="pm-path"></div>
    <div class="pm-ctl"><button type="button" data-z="in" aria-label="확대">＋</button><button type="button" data-z="out" aria-label="축소">－</button></div>
    <div class="pm-hud" hidden></div>
    <div class="tip pm-tip" hidden></div>`;
  const cv = el.querySelector("canvas"), ctx = cv.getContext("2d");
  const pathEl = el.querySelector(".pm-path"), tipEl = el.querySelector(".pm-tip"), hudEl = el.querySelector(".pm-hud");
  const css = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  let C = null;   // 색 — 처음 그릴 때 읽는다
  let tops = [], all = [], tiles = [], W = 1600, H = 1000;
  let cw = 0, ch = 0, dpr = 1, s = 1, tx = 0, ty = 0, fitS = 1, maxS = 1, minTile = 1, touched = false;
  let inset = 0;   // 오른쪽에 겹쳐 뜬 칸(고른 품번·검색 결과)이 가린 폭 — 맞춤·가운데는 남은 자리 기준
  const vw = () => Math.max(160, cw - inset);
  let hover = null, picked = null, hits = null, anim = null, raf = 0, data = null, pickSet = null;
  // 길 안내 상태 — st: 품번 id → { s, t0, ms } · badge: 품번 id → 순번 · trail: 지나온 점(세계 좌표) · until: 이 때까지 움직이는 것이 있다
  const NAV = { cnt: null, on: false, live: false, spot: null, spotFrom: null, spotT0: 0, spotMs: 1, st: new Map(), badge: new Map(), badgeT0: 0, trail: [], trailFrom: 0, trailT0: 0, trailMs: 1, until: 0 };
  const ease = (k) => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);

  // ── 배치(세계 좌표) ──
  function build() {
    tops = []; all = []; tiles = []; minTile = Infinity;
    const make = (n, depth, parent) => {
      const node = { id: n.id, name: n.name, n: n.n, depth, parent, kids: [], tiles: [], x: 0, y: 0, w: 0, h: 0, hits: 0 };
      all.push(node);
      if (n.kids?.length) node.kids = n.kids.map((k) => make(k, depth + 1, node));
      else node.vars = data.vars[n.id] ?? [];
      return node;
    };
    tops = data.tree.map((t) => make(t, 0, null));
    const none = tops.find((t) => t.id === "none"), rest = tops.filter((t) => t !== none);
    const wt = (n) => Math.sqrt(n.n);
    const total = tops.reduce((a, n) => a + wt(n), 0);
    const stripW = none ? W * (wt(none) / total) : 0;
    place(rest, 0, 0, W - stripW, H);
    if (none) setRect(none, W - stripW, 0, stripW, H);
  }
  function place(list, x, y, w, h) {
    const sorted = [...list].sort((a, b) => Math.sqrt(b.n) - Math.sqrt(a.n));
    squarify(sorted.map((n) => Math.sqrt(n.n)), x, y, w, h).forEach((r, i) => setRect(sorted[i], r.x, r.y, r.w, r.h));
  }
  function setRect(n, x, y, w, h) {
    const g = Math.min(w, h) * 0.012;   // 칸 사이 틈
    Object.assign(n, { x: x + g, y: y + g, w: Math.max(0, w - 2 * g), h: Math.max(0, h - 2 * g) });
    const p = Math.min(n.w, n.h) * 0.02, hh = n.h * HEAD;
    const ix = n.x + p, iy = n.y + hh, iw = n.w - 2 * p, ih = n.h - hh - p;
    if (n.kids.length) place(n.kids, ix, iy, iw, ih);
    else if (n.vars.length) {
      // 품번 칸 — 같은 크기 격자, 판매순으로 왼쪽 위부터
      const k = n.vars.length, cols = Math.max(1, Math.round(Math.sqrt(k * (iw / Math.max(ih, 1e-9))))), rows = Math.ceil(k / cols);
      const tw = iw / cols, th = ih / rows, tg = Math.min(tw, th) * 0.06;
      n.tiles = n.vars.map((v, i) => ({ v, node: n, x: ix + (i % cols) * tw + tg, y: iy + Math.floor(i / cols) * th + tg, w: tw - 2 * tg, h: th - 2 * tg }));
      tiles.push(...n.tiles);
      minTile = Math.min(minTile, tw - 2 * tg, th - 2 * tg);
    }
  }

  // ── 보기(확대·이동) ──
  const sr = (r) => ({ x: r.x * s + tx, y: r.y * s + ty, w: r.w * s, h: r.h * s });
  const seen = (r) => r.x < cw && r.y < ch && r.x + r.w > 0 && r.y + r.h > 0;
  const isOpen = (n, r) => (n.kids.length || n.tiles.length) && r.w >= OPEN_W && r.h >= OPEN_H;
  // 가장 작은 품번 칸이 화면 절반쯤 될 때까지만 확대한다
  const clampS = (v) => Math.max(fitS * 0.9, Math.min(maxS, v));
  const setFit = () => { fitS = Math.min(vw() / W, ch / H) * 0.99; maxS = Math.max(fitS * 4, (Math.min(cw, ch) * 0.5) / (Number.isFinite(minTile) && minTile > 0 ? minTile : 1)); };
  function clampT() {   // 지도 가운데가 화면 밖으로 다 나가지 않게
    tx = Math.min(cw * 0.6, Math.max(cw * 0.4 - W * s, tx));
    ty = Math.min(ch * 0.6, Math.max(ch * 0.4 - H * s, ty));
  }
  function fitRect(r, pad = 0.04) {
    const ns = clampS(Math.min(vw() / (r.w * (1 + 2 * pad)), ch / (r.h * (1 + 2 * pad))));
    return { s: ns, tx: vw() / 2 - (r.x + r.w / 2) * ns, ty: ch / 2 - (r.y + r.h / 2) * ns };
  }
  let goRes = null;
  const settle = () => { const f = goRes; goRes = null; f?.(); };
  /** 화면 옮기기 — 끝나면(또는 손으로 끊으면) 풀리는 약속을 돌려준다(길 안내가 기다린다) */
  function go(to, ms = 320) {
    settle();
    const from = { s, tx, ty }, t0 = performance.now();
    // 확대 비율은 로그로, 가운데 점은 곧게 옮긴다 — 들어가는 동안 목표 칸이 화면 밖으로 튀지 않게
    const cx = (v) => (vw() / 2 - v.tx) / v.s, cy = (v) => (ch / 2 - v.ty) / v.s;
    const a = { x: cx(from), y: cy(from) }, b = { x: cx(to), y: cy(to) };
    anim = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      s = Math.exp(Math.log(from.s) + (Math.log(to.s) - Math.log(from.s)) * e);
      const x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e;
      tx = vw() / 2 - x * s; ty = ch / 2 - y * s;
      if (k >= 1) { anim = null; settle(); }
    };
    touched = true; kick();
    return new Promise((res) => { goRes = res; });
  }
  function zoomAt(px, py, f) {
    const ns = clampS(s * f), wx = (px - tx) / s, wy = (py - ty) / s;
    s = ns; tx = px - wx * s; ty = py - wy * s; clampT(); touched = true; kick();
  }
  function fit(animate = true) { const t = fitRect({ x: 0, y: 0, w: W, h: H }, 0.01); if (animate) go(t); else { ({ s, tx, ty } = t); kick(); } }
  /** 고른 품번 칸이 겹친 칸 밑에 들어가 있으면 왼쪽으로 옮겨 보이게 */
  function reveal(tl) {
    const r = sr(tl), right = vw() - 12;
    if (r.x + r.w > right) go({ s, tx: tx - (r.x + r.w - right) - 24, ty }, 240);
  }

  // ── 그리기 ──
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) { raf = 0; if (anim) { anim(now); if (anim) kick(); } draw(); if (NAV.on && (NAV.live || now < NAV.until)) kick(); }
  function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); else ctx.rect(x, y, w, h); }
  function fitText(text, maxW, sizes, weight = 700) {
    for (const z of sizes) { ctx.font = `${weight} ${z}px ${FONT}`; if (ctx.measureText(text).width <= maxW) return { text, z }; }
    const z = sizes[sizes.length - 1]; ctx.font = `${weight} ${z}px ${FONT}`;
    if (maxW < z * 2) return null;
    let t = text; while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
    return { text: `${t}…`, z };
  }
  function draw() {
    if (!cw || !ch) return;
    C ??= { bg: css("--bg"), sub: css("--bgSubtle"), line: css("--border"), ink: css("--textPrimary"), ink2: css("--textSecondary"), dim: css("--textDisabled"), on: css("--onPrimary"), danger: css("--dangerText"),
      ok: css("--success600"), warn: css("--warning700") };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.sub; ctx.fillRect(0, 0, cw, ch);
    ctx.textBaseline = "middle";
    for (const n of tops) drawNode(n);
    if (NAV.on) drawSpot();   // 지나온 길 점선(drawTrail)은 그리지 않는다 — 대표 11/16 「점선으로 연결되는 선은 없어도 될 것 같다」
    path();
  }
  function drawNode(n) {
    const r = sr(n);
    if (!seen(r) || r.w < 1.5 || r.h < 1.5) return;
    // 길 안내 중엔 칸마다 「지금 남은 품번 수」(navCount) — 남은 게 있는 칸은 굵은 테두리, 없는 칸은 흐리게
    const nc = NAV.on && NAV.cnt ? (NAV.cnt.get(n) ?? 0) : null;
    const open = isOpen(n, r), lit = nc != null ? nc > 0 : hits && n.hits > 0, off = nc != null ? nc === 0 : hits && !n.hits;
    ctx.fillStyle = n.depth % 2 ? C.sub : C.bg;
    rr(r.x, r.y, r.w, r.h, Math.min(14, r.w / 10, r.h / 10)); ctx.fill();
    ctx.lineWidth = lit ? 2.5 : hover?.node === n && !hover.tile ? 2 : 1;
    ctx.strokeStyle = lit ? C.ink : hover?.node === n && !hover.tile ? C.dim : C.line; ctx.stroke();
    const count = nc != null ? `${fmt(n.n)} · 남음 ${fmt(nc)}` : `${fmt(n.n)}${lit ? ` · 찾음 ${fmt(n.hits)}` : ""}`;
    if (open) {
      const hh = r.h * HEAD, pad = Math.max(8, r.w * 0.02);
      const t = fitText(n.name, r.w * 0.6, [Math.min(22, Math.max(15, hh * 0.42)), 15, 14, 13]);
      if (t) {
        ctx.font = `700 ${t.z}px ${FONT}`; ctx.fillStyle = off ? C.dim : C.ink; ctx.textAlign = "left";
        ctx.fillText(t.text, r.x + pad, r.y + Math.max(t.z, hh / 2));
        const nw = ctx.measureText(t.text).width;
        ctx.font = `500 ${Math.max(13, t.z - 3)}px ${FONT}`; ctx.fillStyle = lit ? C.ink : off ? C.dim : C.ink2;
        ctx.fillText(count, r.x + pad + nw + 8, r.y + Math.max(t.z, hh / 2));
      }
      if (n.kids.length) for (const k of n.kids) drawNode(k);
      else for (const tl of n.tiles) drawTile(tl);
      return;
    }
    // 접힌 칸 — 이름과 품번 수를 가운데에
    if (r.w < 26 || r.h < 16) return;
    const t = fitText(n.name, r.w - 10, [17, 16, 15, 14, 13, 12]);
    if (!t) return;
    const two = r.h >= t.z * 2 + 14;
    ctx.textAlign = "center";
    ctx.font = `700 ${t.z}px ${FONT}`; ctx.fillStyle = off ? C.dim : C.ink;
    ctx.fillText(t.text, r.x + r.w / 2, r.y + r.h / 2 - (two ? t.z * 0.6 : 0));
    if (two) {
      const c = fitText(count, r.w - 10, [Math.max(12, t.z - 3), 12], 500);
      if (c) { ctx.font = `500 ${c.z}px ${FONT}`; ctx.fillStyle = lit ? C.ink : off ? C.dim : C.ink2; ctx.fillText(c.text, r.x + r.w / 2, r.y + r.h / 2 + t.z * 0.7); }
    }
  }
  function drawTile(tl) {
    const r = sr(tl);
    if (!seen(r) || r.w < 1 || r.h < 1) return;
    const id = tl.v[0], navd = NAV.on && NAV.st.size > 0;
    const lit = !navd && hits?.has(id), sel = picked === id || pickSet?.has(id), hov = hover?.tile === tl;
    const rad = Math.min(8, r.w / 6, r.h / 6);
    ctx.fillStyle = lit ? C.ink : C.bg;
    rr(r.x, r.y, r.w, r.h, rad); ctx.fill();
    // 길 안내 — 칸 상태를 덧칠한다(바뀐 때부터 ms 동안 번진다)
    let bright = lit, faded = !!hits && !lit, edge = sel || hov ? C.ink : C.line, lw = sel ? 3 : hov ? 2 : 1;
    if (navd) {
      const e = NAV.st.get(id), now = performance.now();
      const k = e ? ease((now - e.t0) / e.ms) : 1;
      const paint = (c, a) => { if (a <= 0.01) return; ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = c; rr(r.x, r.y, r.w, r.h, rad); ctx.fill(); ctx.globalAlpha = 1; };
      faded = true; bright = false;
      if (e?.s === "on") { paint(C.ok, k); bright = k > 0.5; faded = !bright; }
      // 빠진 품번은 까닭(값 다름·값 빈칸)과 상관없이 하이라이트만 꺼진다(대표 11/16 「주황색으로 바뀌는 게 아니라 하이라이팅이 없어져야」) — 까닭별 수는 안내 글이 센다
      else if (e?.s === "diff" || e?.s === "blank") paint(C.ok, 1 - k);
      else if (e?.s === "fin") { paint(C.ok, 1 - k); paint(C.ink, k); bright = true; faded = false; }
    }
    if (r.w >= 4) { ctx.lineWidth = lw; ctx.strokeStyle = edge; rr(r.x, r.y, r.w, r.h, rad); ctx.stroke(); }
    const no = NAV.on ? NAV.badge.get(id) : null;
    if (r.w >= TILE_LABEL_W && r.h >= TILE_LABEL_H) {
      const [, model, price, disc] = tl.v;
      const t = fitText(model, r.w - 10, [15, 14, 13, 12]);
      if (t) {
        const two = r.h >= t.z * 2 + 14;
        ctx.textAlign = "center"; ctx.font = `700 ${t.z}px ${FONT}`; ctx.fillStyle = bright ? C.on : faded ? C.dim : C.ink;
        ctx.fillText(t.text, r.x + r.w / 2, r.y + r.h / 2 - (two ? t.z * 0.6 : 0));
        if (two) {
          const p = disc ? "단종" : price == null ? "가격 문의" : `${fmt(price)}원`;
          ctx.font = `500 ${Math.max(12, t.z - 2)}px ${FONT}`; ctx.fillStyle = bright ? C.on : disc ? C.danger : faded ? C.dim : C.ink2;
          ctx.fillText(p, r.x + r.w / 2, r.y + r.h / 2 + t.z * 0.7);
          // 칸이 넉넉하면 메이커까지
          const brand = tl.v[4];
          if (brand && r.h >= t.z * 4 + 20) { const b = fitText(brand, r.w - 10, [Math.max(12, t.z - 2), 12], 500); if (b) { ctx.font = `500 ${b.z}px ${FONT}`; ctx.fillStyle = bright ? C.on : faded ? C.dim : C.ink2; ctx.fillText(b.text, r.x + r.w / 2, r.y + r.h / 2 + t.z * 2); } }
        }
      }
    }
    if (no != null && r.w >= 14 && r.h >= 14) drawBadge(r, no);
  }
  /** 도착 순번 — 칸 왼쪽 위 동그라미, 순번마다 조금씩 늦게 튀어나온다 */
  function drawBadge(r, no) {
    const k = ease((performance.now() - NAV.badgeT0 - (no - 1) * 70) / 260);
    if (k <= 0) return;
    const R = Math.max(7, Math.min(13, Math.min(r.w, r.h) * 0.22)) * (0.6 + 0.4 * k);
    // 칸 왼쪽 위 모서리에 걸쳐 단다 — 칸 안 품번 글자를 가리지 않게
    const x = r.x + Math.min(R * 0.35, r.w / 4), y = r.y + Math.min(R * 0.35, r.h / 4);
    ctx.globalAlpha = k;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fillStyle = C.warn; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = C.bg; ctx.stroke();
    ctx.fillStyle = C.on; ctx.textAlign = "center"; ctx.font = `800 ${Math.round(R * (no > 9 ? 0.95 : 1.15))}px ${FONT}`;
    ctx.fillText(String(no), x, y + 0.5);
    ctx.globalAlpha = 1;
  }
  // 구역 비추기 — 보고 있는 구역 밖을 흐린 막으로 덮고 구역에 굵은 테두리. 구역은 세계 좌표라 화면과 같이 움직인다
  function spotNow() {
    if (!NAV.spot) return null;
    const k = ease((performance.now() - NAV.spotT0) / NAV.spotMs), a = NAV.spotFrom ?? { x: 0, y: 0, w: W, h: H }, b = NAV.spot;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k };
  }
  function drawSpot() {
    const sp = spotNow(); if (!sp) return;
    const q = sr(sp), p = 6, R = 14;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, cw, ch);
    if (ctx.roundRect) ctx.roundRect(q.x - p, q.y - p, q.w + 2 * p, q.h + 2 * p, R); else ctx.rect(q.x - p, q.y - p, q.w + 2 * p, q.h + 2 * p);
    ctx.globalAlpha = 0.74; ctx.fillStyle = C.sub; ctx.fill("evenodd");
    ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.strokeStyle = C.ink;
    rr(q.x - p, q.y - p, q.w + 2 * p, q.h + 2 * p, R); ctx.stroke();
    ctx.restore();
  }
  // 지나온 길 — 점선이 새 점까지 그어지고, 끝에 「지금 자리」 점(움직이는 동안 물결)
  function drawTrail() {
    if (!NAV.trail.length) return;
    const now = performance.now(), pts = NAV.trail.map((p) => ({ x: p.x * s + tx, y: p.y * s + ty }));
    const seg = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); total += d; }
    const done = seg.slice(0, Math.max(0, NAV.trailFrom - 1)).reduce((a, b) => a + b, 0);
    const L = done + (total - done) * ease((now - NAV.trailT0) / NAV.trailMs);
    let head = pts[0], left = L;
    ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
    const line = () => { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); left = L; head = pts[0];
      for (let i = 1; i < pts.length; i++) {
        if (left >= seg[i - 1]) { ctx.lineTo(pts[i].x, pts[i].y); left -= seg[i - 1]; head = pts[i]; continue; }
        const f = seg[i - 1] ? left / seg[i - 1] : 0; head = { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f }; ctx.lineTo(head.x, head.y); break;
      } };
    // 다 온 뒤엔 길을 옅게 — 도착 칸 글자가 읽히게
    if (!NAV.live) ctx.globalAlpha = 0.4;
    if (pts.length > 1) {
      line(); ctx.setLineDash([]); ctx.lineWidth = 8; ctx.strokeStyle = C.bg; ctx.stroke();
      line(); ctx.setLineDash([12, 8]); ctx.lineDashOffset = NAV.live ? -now / 30 : 0; ctx.lineWidth = 4; ctx.strokeStyle = C.ink; ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    if (NAV.live) { const ph = (now % 1400) / 1400; ctx.globalAlpha = 0.45 * (1 - ph); ctx.beginPath(); ctx.arc(head.x, head.y, 9 + ph * 22, 0, Math.PI * 2); ctx.fillStyle = C.warn; ctx.fill(); ctx.globalAlpha = 1; }
    ctx.beginPath(); ctx.arc(head.x, head.y, 9, 0, Math.PI * 2); ctx.fillStyle = C.warn; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.bg; ctx.stroke();
    ctx.restore();
  }

  // ── 지금 보는 곳(경로 줄) — 화면 가운데를 품고 화면 절반 넘게 차지한 칸까지 ──
  let lastPath = null;   // 처음 그릴 때 「전체」 단추가 서도록 빈 글자와 다르게 둔다
  function currentPath() {
    const wx = (vw() / 2 - tx) / s, wy = (ch / 2 - ty) / s, out = [];
    let list = tops;
    while (list?.length) {
      const n = list.find((k) => wx >= k.x && wx <= k.x + k.w && wy >= k.y && wy <= k.y + k.h);
      if (!n) break;
      const r = sr(n);
      if (r.w < vw() * 0.45 && r.h < ch * 0.45) break;
      out.push(n); list = n.kids;
    }
    return out;
  }
  function path() {
    const p = currentPath(), key = p.map((n) => n.id).join(">");
    if (key === lastPath) return;
    lastPath = key;
    pathEl.innerHTML = `<button type="button" data-pm="fit">전체</button>${p.map((n) => `<span>›</span><button type="button" data-pm="${esc(n.id)}">${esc(n.name)}</button>`).join("")}`;
    onPath?.(p.map((n) => n.name));
  }

  // ── 짚기 ──
  function hitAt(px, py) {
    const wx = (px - tx) / s, wy = (py - ty) / s, inside = (k) => wx >= k.x && wx <= k.x + k.w && wy >= k.y && wy <= k.y + k.h;
    let list = tops, found = null;
    while (list?.length) {
      const n = list.find(inside);
      if (!n) break;
      found = n;
      if (!isOpen(n, sr(n))) return { node: n };
      if (n.tiles.length) { const t = n.tiles.find(inside); return t ? { node: n, tile: t } : { node: n }; }
      list = n.kids;
    }
    return found ? { node: found } : null;
  }
  const crumbs = (n) => { const a = []; for (let k = n; k; k = k.parent) a.unshift(k.name); return a.join(" › "); };
  function showTip(h, x, y) {
    if (!h) { tipEl.hidden = true; return; }
    if (h.tile) {
      const [, model, price, disc, brand, , mname] = h.tile.v;
      tipEl.innerHTML = `<div class="tt">${esc(model)}</div>${brand ? `<div>${esc(brand)}</div>` : ""}${mname ? `<div>${esc(mname)}</div>` : ""}<div class="th">${disc ? "단종" : price == null ? "가격 문의" : `${fmt(price)}원 · 기본가, VAT 별도`}</div><div style="color:var(--textSecondary)">${esc(crumbs(h.node))}</div>`;
    } else {
      tipEl.innerHTML = `<div class="tt">${esc(h.node.name)}</div><div>품번 ${fmt(h.node.n)}개${hits && h.node.hits ? ` · 찾음 ${fmt(h.node.hits)}` : ""}</div><div style="color:var(--textSecondary)">${esc(crumbs(h.node))}</div>`;
    }
    tipEl.hidden = false;
    const b = tipEl.getBoundingClientRect();
    let L = x + 16, T = y + 16;
    if (L + b.width > innerWidth - 8) L = x - b.width - 16;
    if (T + b.height > innerHeight - 8) T = y - b.height - 16;
    tipEl.style.left = `${Math.max(8, L)}px`; tipEl.style.top = `${Math.max(8, T)}px`;
  }

  // ── 손·마우스 ──
  const ptrs = new Map();
  let down = null, pinch = null;
  const local = (e) => { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId);
    const p = local(e); ptrs.set(e.pointerId, p);
    anim = null; settle();
    if (ptrs.size === 1) down = { ...p, moved: false, touch: e.pointerType !== "mouse" };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }; if (down) down.moved = true; }
    showTip(null);
  });
  cv.addEventListener("pointermove", (e) => {
    const p = local(e);
    if (ptrs.has(e.pointerId)) {
      const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, p);
      if (ptrs.size >= 2 && pinch) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        tx += m.x - pinch.m.x; ty += m.y - pinch.m.y;
        zoomAt(m.x, m.y, d / Math.max(1, pinch.d));
        pinch = { d, m };
        return;
      }
      if (down && !down.moved && Math.hypot(p.x - down.x, p.y - down.y) > 5) { down.moved = true; cv.classList.add("drag"); }
      if (down?.moved) { tx += p.x - prev.x; ty += p.y - prev.y; clampT(); touched = true; kick(); }
      return;
    }
    // 얹기 — 칸 테두리 진하게 + 정보 상자
    const h = hitAt(p.x, p.y);
    if (h?.node !== hover?.node || h?.tile !== hover?.tile) { hover = h; kick(); }
    cv.style.cursor = h ? "pointer" : "grab";
    showTip(h, e.clientX, e.clientY);
  });
  const up = (e) => {
    const p = local(e), was = down, single = ptrs.size === 1;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (!ptrs.size) { down = null; cv.classList.remove("drag"); }
    if (e.type !== "pointerup" || !was || was.moved || !single) return;
    const h = hitAt(p.x, p.y);
    if (!h) return;
    if (h.tile) { picked = h.tile.v[0]; kick(); onPick?.(h.tile.v, crumbs(h.node)); lastPick = h.tile; if (was.touch) showTip(h, e.clientX, e.clientY); return; }
    zoomTo(h.node);
  };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("pointerleave", () => { if (!ptrs.size) { hover = null; showTip(null); kick(); } });
  cv.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = local(e), unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? ch : 1;
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0022)));
    showTip(null);
  }, { passive: false });
  el.addEventListener("click", (e) => {
    const z = e.target.closest("[data-z]")?.dataset.z, pm = e.target.closest("[data-pm]")?.dataset.pm;
    if (z === "in") go({ ...zoomAtTarget(1.8) });
    else if (z === "out") go({ ...zoomAtTarget(1 / 1.8) });
    else if (pm === "fit") fit();
    else if (pm) { const n = all.find((k) => k.id === pm); if (n) zoomTo(n); }
  });
  function zoomAtTarget(f) { const ns = clampS(s * f), wx = (vw() / 2 - tx) / s, wy = (ch / 2 - ty) / s; return { s: ns, tx: vw() / 2 - wx * ns, ty: ch / 2 - wy * ns }; }
  let lastPick = null;
  function zoomTo(n) { go(fitRect(n)); }

  // ── 길 안내 도움 ──
  function bump(ms) { NAV.until = Math.max(NAV.until, performance.now() + ms + 80); kick(); }
  /** exact = 칸들을 꼭 맞게 감싼 사각형(비추기 테두리용). 아니면 카메라용 — 너무 깊이 들어가지 않게 최소 크기를 둔다 */
  function rectOf(target, exact = false) {
    if (target === "all") return { x: 0, y: 0, w: W, h: H };
    if (typeof target === "string") { const n = all.find((k) => k.id === target); return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
    const set = target instanceof Set ? target : new Set(target);
    const lit = tiles.filter((t) => set.has(t.v[0]));
    if (!lit.length) return null;
    const x0 = Math.min(...lit.map((t) => t.x)), y0 = Math.min(...lit.map((t) => t.y)), x1 = Math.max(...lit.map((t) => t.x + t.w)), y1 = Math.max(...lit.map((t) => t.y + t.h));
    // 칸 하나·한 줄이어도 너무 깊이 들어가지 않게 — 최소 크기는 가장 작은 칸의 4배
    if (exact) return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const m = Math.max(minTile * 4, 1), w = Math.max(x1 - x0, m), h = Math.max(y1 - y0, m);
    return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
  }
  /** 지도 위 안내 글(왼쪽 아래) — null 이면 숨김 */
  function hud(html) { if (html == null) { hudEl.hidden = true; hudEl.innerHTML = ""; return hudEl; } hudEl.innerHTML = html; hudEl.hidden = false; return hudEl; }

  // ── 크기 ──
  new ResizeObserver(() => {
    const b = el.getBoundingClientRect();
    if (b.width < 10 || b.height < 10) return;
    const first = !cw;
    const keep = !first ? { wx: (cw / 2 - tx) / s, wy: (ch / 2 - ty) / s, rel: s / fitS } : null;
    cw = b.width; ch = b.height; dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    if (data && !tops.length) { H = W * (ch / cw); build(); }
    setFit();
    if (first || !touched) fit(false);
    else { s = clampS(keep.rel * fitS); tx = cw / 2 - keep.wx * s; ty = ch / 2 - keep.wy * s; kick(); }
  }).observe(el);
  document.fonts?.ready?.then(() => kick());

  return {
    el,
    setData(d) { data = d; tops = []; if (cw) { H = W * (ch / cw); build(); setFit(); fit(false); } },
    ready: () => tops.length > 0,
    /** 검색 표시 — 품번 id 묶음(null 이면 끔). 표시가 있으면 그 칸들이 다 보이게 옮긴다 */
    highlight(ids) {
      hits = ids && ids.size ? ids : null;
      for (const n of all) n.hits = 0;
      if (hits) for (const t of tiles) if (hits.has(t.v[0])) for (let k = t.node; k; k = k.parent) k.hits++;
      const lit = hits ? tiles.filter((t) => hits.has(t.v[0])) : [];
      if (lit.length) {
        // 찾은 칸들이 다 보이게 — 지도 절반 넘게 퍼져 있으면 지도 전체
        const x0 = Math.min(...lit.map((t) => t.x)), y0 = Math.min(...lit.map((t) => t.y)), x1 = Math.max(...lit.map((t) => t.x + t.w)), y1 = Math.max(...lit.map((t) => t.y + t.h));
        if ((x1 - x0) * (y1 - y0) > W * H * 0.5) fit(); else go(fitRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, 0.08));
      }
      kick();
      return hits ? hits.size : 0;
    },
    /** 글자로 품번 찾기 — 품번·메이커·모델명에 낱말이 모두 들어 있는 품번(띄어쓰기·하이픈 무시) */
    matchText(q) {
      const toks = String(q ?? "").split(/\s+/).map(norm).filter(Boolean);
      if (!toks.length) return new Set();
      return new Set(tiles.filter((t) => { const s2 = norm(`${t.v[1]} ${t.v[4] ?? ""} ${t.v[6] ?? ""}`); return toks.every((k) => s2.includes(k)); }).map((t) => t.v[0]));
    },
    idsOfParts(partIds) { const p = new Set(partIds); return new Set(tiles.filter((t) => p.has(t.v[5])).map((t) => t.v[0])); },
    pick(id) { picked = id; if (id == null) lastPick = null; kick(); },
    /** 제품 하나의 품번 칸 여럿을 고른 표시로(길 안내 중 제품을 열었을 때) — null 이면 끔 */
    pickMany(ids) { pickSet = ids && ids.size ? ids : null; kick(); },

    // ── 길 안내 ──
    navStart() { Object.assign(NAV, { cnt: null, on: true, live: true, spot: null, spotFrom: null, trail: [], trailFrom: 0, until: 0 }); NAV.st.clear(); NAV.badge.clear(); hits = null; pickSet = null; for (const n of all) n.hits = 0; hud(null); kick(); },
    /** 다 왔다 — 물결·움직이는 점선을 멈춘다(칸 상태·길은 남긴다) */
    navEnd() { NAV.live = false; kick(); },
    navClear() { NAV.cnt = null; NAV.on = false; NAV.live = false; NAV.st.clear(); NAV.badge.clear(); NAV.trail = []; NAV.spot = null; pickSet = null; hud(null); kick(); },
    navOn: () => NAV.on,
    /** 칸(대·중·소분류)마다 이 품번이 몇 개인지 — 칸 머리에 「남음 N」으로 쓴다. null 이면 끔 */
    navCount(ids) {
      if (ids == null) { NAV.cnt = null; kick(); return; }
      const set = ids instanceof Set ? ids : new Set(ids), m = new Map();
      for (const t of tiles) if (set.has(t.v[0])) for (let k = t.node; k; k = k.parent) m.set(k, (m.get(k) ?? 0) + 1);
      NAV.cnt = m; kick();
    },
    /** 칸 아래 소분류마다 이 품번 수 — [{name, total, n}] (칸 id 가 null 이면 지도 전체) */
    spreadUnder(id, ids) {
      const set = new Set(ids), root = id ? all.find((k) => k.id === id) : null, out = [];
      const walk = (k) => { if (k.kids.length) k.kids.forEach(walk); else out.push({ name: k.name, total: k.n, n: k.tiles.filter((t) => set.has(t.v[0])).length }); };
      (root ? [root] : tops).forEach(walk);
      return out.sort((a, b) => b.n - a.n || b.total - a.total);
    },
    /** 품번 id 들이 지도 어디에 있나 — 위에서부터 그 품번을 90% 넘게 품은 칸을 따라 내려간다(대분류 → 중분류 → 소분류) */
    routeOf(ids) {
      const set = new Set(ids), cnt = new Map();
      let onMap = 0;
      for (const t of tiles) if (set.has(t.v[0])) { onMap++; for (let k = t.node; k; k = k.parent) cnt.set(k, (cnt.get(k) ?? 0) + 1); }
      const chain = []; let list = tops;
      while (list?.length && onMap) {
        const best = list.reduce((a, b) => ((cnt.get(b) ?? 0) > (cnt.get(a) ?? 0) ? b : a));
        if ((cnt.get(best) ?? 0) < onMap * 0.9) break;
        chain.push({ id: best.id, name: best.name, n: best.n, depth: best.depth, leaf: !best.kids.length });
        list = best.kids;
      }
      return { chain, onMap };
    },
    /** 칸 아래 품번 [id, 단종] */
    tilesUnder(id) { const n = all.find((k) => k.id === id); if (!n) return []; const out = []; const walk = (k) => { if (k.kids.length) k.kids.forEach(walk); else for (const t of k.tiles) out.push([t.v[0], t.v[3]]); }; walk(n); return out; },
    /** 화면을 옮긴다 — 대상: "all" · 칸 id · 품번 id 묶음. 구역 비추기도 같이 옮긴다. 다 옮기면 풀리는 약속 */
    navFly(target, { ms = 750, pad = 0.06, spot = true } = {}) {
      const r = rectOf(target); if (!r) return Promise.resolve();
      // 비추기 테두리는 칸에 꼭 맞게(대표 11/16 「큰 사각형이 정렬 안 맞아」 — 카메라용 최소 크기를 테두리에도 써서 위아래가 빈 줄까지 감쌌다)
      if (spot) { NAV.spotFrom = spotNow() ?? { x: 0, y: 0, w: W, h: H }; NAV.spot = rectOf(target, true) ?? r; NAV.spotT0 = performance.now(); NAV.spotMs = Math.max(1, ms); bump(ms); }
      const to = fitRect(r, pad);
      if (ms <= 1) { ({ s, tx, ty } = to); touched = true; kick(); return Promise.resolve(); }
      return go(to, ms);
    },
    /** 지나온 길에 점 하나 — 대상의 가운데 */
    navTrail(target, ms = 750) { const r = rectOf(target); if (!r) return; NAV.trailFrom = NAV.trail.length; NAV.trail.push({ x: r.x + r.w / 2, y: r.y + r.h / 2 }); NAV.trailT0 = performance.now(); NAV.trailMs = Math.max(1, ms); bump(ms); },
    /** 품번 칸 상태 — st: on · diff · blank · fin. stagger(ms) 만큼 차례로(합쳐 최대 700ms) */
    navMark(ids, st, ms = 500, stagger = 0) {
      const now = performance.now(), list = [...ids], step = list.length > 1 ? Math.min(stagger, 700 / list.length) : 0;
      list.forEach((id, i) => NAV.st.set(id, { s: st, t0: now + i * step, ms: Math.max(1, ms) }));
      bump(ms + list.length * step);
    },
    navBadges(ids) { NAV.badge.clear(); [...ids].forEach((id, i) => NAV.badge.set(id, i + 1)); NAV.badgeT0 = performance.now(); bump(300 + NAV.badge.size * 70); },
    /** 이 품번들이 지금 화면에서 차지하는 넓이 비율(0~1) — 많이 줄었으면 더 들어간다 */
    navShare(ids) { const r = rectOf(ids); if (!r) return 1; const q = sr(r); return (q.w * q.h) / Math.max(1, vw() * ch); },
    hud,
    /** 오른쪽 겹친 칸 폭(px) — 바뀌면 고른 품번이 가려지지 않게 옮긴다 */
    setInset(px) { const v = Math.max(0, Math.round(px)); if (v === inset) return; inset = v; if (cw) setFit(); if (lastPick && picked === lastPick.v[0]) reveal(lastPick); },
    pathText: () => currentPath().map((n) => n.name).join(" › "),
    redraw: () => kick(),
  };
}
