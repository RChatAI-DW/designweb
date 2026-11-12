// 유니트 계통도 · 유닛쿨러 외형도 · 팽창변 구성도 (대표 11/09 「구성품 가격만 보여 주지 말고 유니트 자체를 그리고, 부품에 마우스를 얹으면 그 부품 정보」)
// 그림 조각마다 data-tip(정보 열쇠) — 정보 글은 TIPS 에 모으고 app.js 가 띄운다. data-link 가 같은 가운데·왼쪽 목록 줄은 함께 강조된다.
// ☠️ 값은 전부 서버 결과 그대로다. 배치·기호는 일반 계통도·외형도 꼴이고 제조사 도면이 아니다(배관 위치·팬 모양 등).
//    설명 문장은 넣지 않는다(대표 11/09 「쓸데없는 설명 다 빼」) — 이름·규격·값만.

export const TIPS = new Map();
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n, d = 0) => (n == null || !Number.isFinite(Number(n)) ? "-" : Number(n).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const won = (n) => (n == null ? "가격 문의" : `${fmt(n)}원`);

// 색 — theme.ts 토큰 안에서(잉크·회색·위험·경고·파랑·청록). 배관: 토출 가스=빨강, 액=주황, 저압(팽창 뒤·흡입)=파랑, 오일=갈색 점선
const INK = "#191F28", LN = "#4E5968", SUB = "#8B95A1", W0 = "#FFFFFF", F2 = "#F2F4F6", F3 = "#E5E8EB";
const HOT = "#F04452", LIQ = "#F57800", LOW = "#3182F6", OIL = "#8A6A10", WATER = "#18A5A5";

/** 그림 조각 — key 로 정보 글을 TIPS 에 두고, link 가 같은 목록 줄과 함께 강조. hits = 마우스가 닿는 면 [x,y,w,h] 여러 개 */
function part(key, title, rows, inner, { link = null, hits = [] } = {}) {
  TIPS.set(key, { title, rows: rows.filter((r) => r && (r.head || (r[1] != null && r[1] !== ""))) });
  const h = hits.map(([x, y, w, hh]) => `<rect class="hit" x="${x}" y="${y}" width="${w}" height="${hh}" rx="10"/>`).join("");
  return `<g class="part" data-tip="${esc(key)}"${link ? ` data-link="${esc(link)}"` : ""} tabindex="0" aria-label="${esc(title)}">${h}${inner}</g>`;
}
const tx = (x, y, s, cls = "nm", anchor = "middle") => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${esc(s)}</text>`;
/** 여러 줄 글 — y 를 가운데로. arr = [[글, 꼴]] */
function lines(x, y, arr, anchor) {
  const lh = 19, y0 = y - ((arr.length - 1) * lh) / 2 + 5;
  return arr.map(([t, c], i) => tx(x, y0 + i * lh, t, c, anchor)).join("");
}
function arrow(x, y, dir, col) {
  const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir], s = 6, px = -dy, py = dx;
  return `<polygon points="${x + dx * s},${y + dy * s} ${x - dx * s + px * s},${y - dy * s + py * s} ${x - dx * s - px * s},${y - dy * s - py * s}" fill="${col}"/>`;
}
const pipe = (pts, col, extra = "") => `<polyline points="${pts.map((p) => p.map((n) => Math.round(n * 10) / 10).join(",")).join(" ")}" fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
const capsule = (x, y, w, h, fill = F3) => `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}" fill="${fill}" stroke="${LN}" stroke-width="1.5"/>`;
/** 세트 밖 부품 — 같은 기호를 회색 점선으로 */
const dashed = (svg) => svg.replace(/<(polygon|rect|path|line|polyline|circle|ellipse)\b/g, '<$1 stroke-dasharray="3 2"').replace(/stroke="#4E5968"/g, `stroke="${SUB}"`);
/** 밸브 기호(나비꼴) — 세로 배관(v)·가로 배관(h) */
function bowtie(x, y, o = "v", s = 11) {
  const st = `fill="${W0}" stroke="${LN}" stroke-width="1.5" stroke-linejoin="round"`;
  return o === "v"
    ? `<polygon points="${x - s},${y - s - 2} ${x + s},${y - s - 2} ${x},${y}" ${st}/><polygon points="${x - s},${y + s + 2} ${x + s},${y + s + 2} ${x},${y}" ${st}/>`
    : `<polygon points="${x - s - 2},${y - s} ${x - s - 2},${y + s} ${x},${y}" ${st}/><polygon points="${x + s + 2},${y - s} ${x + s + 2},${y + s} ${x},${y}" ${st}/>`;
}
function fanDisc(cx, cy, r) {
  let b = "";
  for (let k = 0; k < 3; k++) {
    const a = (k * 120 - 90) * Math.PI / 180, ex = cx + Math.cos(a) * r * 0.42, ey = cy + Math.sin(a) * r * 0.42;
    b += `<ellipse cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" rx="${(r * 0.4).toFixed(1)}" ry="${(r * 0.17).toFixed(1)}" transform="rotate(${k * 120 - 90 + 20} ${ex.toFixed(1)} ${ey.toFixed(1)})" fill="${F3}" stroke="${LN}" stroke-width="1"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${F2}" stroke="${LN}" stroke-width="1.5"/>${b}<circle cx="${cx}" cy="${cy}" r="${Math.max(2, r * 0.13)}" fill="${LN}"/>`;
}

// ═════════════════════════════ 유니트 계통도 ═════════════════════════════
// 구성품 칸(slot) 목록을 그대로 배관 순서에 놓는다. 세트에 없는 칸은 그리지 않고, 자리를 모르는 칸(제작공임·콘트롤판넬 등)은 그림 아래 칩으로.
//   왼쪽 줄(저압·흡입, 아래→위): 흡입관 입구 → 증발압력조정변 → 후렉시블(흡입) → 액분리기 → 압축기
//   오른쪽 줄(고압, 위→아래): 압축기 → 후렉시블(토출) → 소음기 → 유분리기 → 응축기 → 수액기 → 브라켓밸브 → 드라이어 → 사이트글라스 → 전자변 → 액관 출구
//   칠링: 전자변 → 팽창변+TC → 유니트 칠라 → 왼쪽 줄(세트 안에서 사이클이 닫힌다) · 가운데: 오일 리턴(유분리기→압축기), 프레샤·게이지
const PANEL = new Set(["프레샤", "게이지"]);
export const unitLink = (s) => (PANEL.has(s.slot) ? `u:${s.slot}:${s.spec ?? ""}` : `u:${s.slot}`);
const SPLIT = { "R/C 일체": ["R/C", "일체"], "드라이어(분리식)": ["드라이어", "(분리식)"], "후렉시블(흡입)": ["후렉시블", "(흡입)"], "후렉시블(토출)": ["후렉시블", "(토출)"], "증발압력조정변": ["증발압력", "조정변"], "유니트 수액기": ["유니트", "수액기"], "유니트 응축기": ["유니트", "응축기"], "사이트글라스": ["사이트", "글라스"], "오일리턴밸브": ["오일리턴밸브"] };
const uniq = (xs) => [...new Set(xs.filter((x) => x != null && x !== ""))];

function slotRows(list) {
  const out = [];
  for (const s of list) {
    if (list.length > 1) out.push({ head: `${s.slot} ${s.spec ?? ""}`.trim() });
    out.push(["규격", list.length > 1 ? "" : s.spec], ["품명", s.modelNo ?? (s.separate || s.priceKrw != null ? "" : "확인 후 안내")], ["메이커", s.brand],
      ["기본가", s.separate ? "별도(세트 합계 제외)" : s.priceKrw == null ? "확인 후 안내" : won(s.priceKrw)],
      ["다른 후보", s.alsoCount > 1 ? `${s.alsoCount - 1}개` : ""], ["상태", /확인|미확정/.test(s.kind ?? "") ? s.kind : ""], ["비고", s.note]);
  }
  return out;
}

function unitLoop(D) {
  const VW = 440, LX = 108, RX = 322, CX = 215, TOPY = 72;
  const by = new Map();
  for (const s of D.slots ?? []) { if (!by.has(s.slot)) by.set(s.slot, []); by.get(s.slot).push(s); }
  const used = new Set();
  const get = (n) => { const r = by.get(n); if (r) used.add(n); return r ?? null; };
  const chilling = by.has("유니트 칠라") || String(D.form ?? "").startsWith("칠링");
  const two = D.stage === "2단";
  const condName = ["R/C 일체", "유니트 응축기"].find((n) => by.has(n)) ?? null;
  // 응축기 공냉/수냉 — 형식 이름이 아니라 세트에 든 품목의 DB 이름·분류로 가른다(대표 11/09 「제대로 만든 거 맞아?」).
  //   유니트 응축기 = 동화윈 DHCU 「수냉식 응축기 (유니트형)」 — 응축기형·칠링 수냉 둘 다(10/29 사장님 단가표·0271). R/C 일체 = DCS 일체형(공냉, 사장님 ✓ 9/29).
  //   품목 정보가 없으면(서버를 다시 띄우기 전) 「유니트 응축기」 칸 = 수냉으로 본다(10/29 단가표: 응축기형·칠링 수냉 둘 다 DHCU 수냉).
  const condList = condName ? by.get(condName) : null;
  const waterCooled = condList ? (condList.some((x) => x.partCat || x.partName)
    ? condList.some((x) => /수냉/.test(`${x.partCat ?? ""} ${x.partName ?? ""} ${x.modelNo ?? ""}`))
    : condName === "유니트 응축기") : false;
  // ③ 흡입 후렉시블이 두 관(2단 R/C 10HP↑ 「1 3/8, 5/8」)이면 큰 관만 그림에 — 작은 관은 쓰임을 몰라(자료 없음) 그림 밖 칩으로
  const inch = (sp) => { const m = String(sp ?? "").trim().match(/^(\d+)?\s*(?:(\d+)\/(\d+))?$/); return m ? (Number(m[1]) || 0) + (m[2] ? Number(m[2]) / Number(m[3]) : 0) : 0; };
  const sucFlex = by.get("후렉시블(흡입)");
  if (sucFlex && uniq(sucFlex.map((x) => x.spec)).length > 1) {
    const sorted = [...sucFlex].sort((a, b) => inch(b.spec) - inch(a.spec));
    by.set("후렉시블(흡입)", sorted.filter((x) => x.spec === sorted[0].spec));
    for (const x of sorted.filter((x) => x.spec !== sorted[0].spec)) {
      const k = `후렉시블(흡입) ${x.spec}`;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push({ ...x, note: [x.note, "그림 자리 확인 전"].filter(Boolean).join(" · ") });
    }
  }
  const recvName = ["수액기", "유니트 수액기"].find((n) => by.has(n)) ?? null;
  const add = (arr, name, kind, h, half) => { const list = get(name); if (list) arr.push({ name, kind, h, half, list }); };

  // ── 오른쪽 줄(고압)
  const R = [];
  add(R, "후렉시블(토출)", "flex", 40, 10);
  add(R, "소음기", "muffler", 40, 15);
  add(R, "유분리기", "oilsep", 66, 17);
  if (condName) add(R, condName, waterCooled ? "condW" : "condA", waterCooled ? 54 : 80, 44);
  else R.push({ name: "응축기", kind: "condX", h: 62, half: 44, list: null });
  if (recvName) add(R, recvName, "recv", 40, recvName === "유니트 수액기" ? 44 : 38);
  add(R, "브라켓밸브", "bracket", 36, 13);
  // ② 2단 — 중간냉각기는 세트 구성표에 없지만(서브쿨러 세트 따로) 2단 사이클에 든다: 삼영 BITZER 제품 가이드 29쪽 2단 배관도
  //   (중간냉각기 · 팽창밸브(중간냉각) · 중간압 → 압축기). 주 액관이 지나가고, 갈래 액이 팽창해 중간압 가스로 압축기에 간다.
  if (two) R.push({ name: "중간냉각기", kind: "subX", h: 56, half: 44, list: null });
  add(R, by.has("드라이어") ? "드라이어" : "드라이어(분리식)", "drier", 42, 12);   // 15마력 이상 구성표는 「드라이어(분리식)」(11/09 85조합 전수)
  add(R, "사이트글라스", "sight", 30, 13);
  add(R, "전자변", "sol", 36, 13);
  let y = 132;
  for (const it of R) { it.y = y + it.h / 2; y += it.h + 22; }
  const bottomY = Math.max(y + 14, 460);
  // ── 왼쪽 줄(저압) — 위에서 아래로 고르게
  const L = [];
  add(L, "액분리기", "accum", 86, 23);
  add(L, "후렉시블(흡입)", "flex", 40, 10);
  add(L, "증발압력조정변", "epr", 36, 13);
  const lTop = 140, lBot = bottomY - 50;
  L.forEach((it, i) => { it.y = lTop + ((lBot - lTop) * (i + 0.5)) / L.length; });

  const g = [];      // 배관(뒤)
  const parts = [];  // 부품(앞)
  const cond = R.find((it) => it.kind.startsWith("cond"));
  const condTop = cond.y - cond.h / 2, condBot = cond.y + cond.h / 2;
  const lastR = R[R.length - 1];
  // 배관 — 흡입(파랑)·토출(빨강)·액(주황)
  g.push(pipe([[LX, TOPY], [CX - 65, TOPY]], LOW), arrow((LX + CX - 65) / 2, TOPY, "right", LOW));
  g.push(pipe([[CX + 65, TOPY], [RX, TOPY], [RX, condTop]], HOT), arrow((CX + 65 + RX) / 2, TOPY, "right", HOT));
  const txvX = RX - 58, chX = LX + 62;
  if (chilling) {
    g.push(pipe([[RX, condBot], [RX, bottomY], [txvX, bottomY]], LIQ), arrow(RX, (lastR.y + lastR.h / 2 + bottomY) / 2, "down", LIQ));
    g.push(pipe([[txvX, bottomY], [LX, bottomY], [LX, TOPY]], LOW), arrow((chX - 42 + LX) / 2, bottomY, "left", LOW));
  } else {
    g.push(pipe([[RX, condBot], [RX, bottomY]], LIQ), arrow(RX, bottomY - 8, "down", LIQ), `<circle cx="${RX}" cy="${bottomY + 2}" r="5" fill="${W0}" stroke="${LIQ}" stroke-width="2"/>`, tx(RX + 12, bottomY + 7, "액관 출구", "sp", "start"));
    g.push(pipe([[LX, bottomY], [LX, TOPY]], LOW), arrow(LX, bottomY - 22, "up", LOW), `<circle cx="${LX}" cy="${bottomY + 2}" r="5" fill="${W0}" stroke="${LOW}" stroke-width="2"/>`, tx(LX - 12, bottomY + 7, "흡입관 입구", "sp", "end"));
  }
  if (cond && R.indexOf(cond) < R.length - 1) g.push(arrow(RX, condBot + 11, "down", LIQ));
  if (L.length) g.push(arrow(LX, L[0].y - L[0].h / 2 - 14, "up", LOW));

  // ── 압축기
  const comp = get("압축기");
  const cm = comp?.[0]?.modelNo ?? D.compressorModel ?? "";
  const cmShort = cm.length > 14 ? `${cm.slice(0, 13)}…` : cm;
  parts.push(part("u:압축기", "압축기", comp ? slotRows(comp) : [["품명", D.compressorModel]],
    `<rect x="${CX - 65}" y="${TOPY - 32}" width="130" height="64" rx="12" fill="${F3}" stroke="${LN}" stroke-width="1.5"/>${tx(CX, TOPY - 4, "압축기")}${cmShort ? tx(CX, TOPY + 17, cmShort, "sp") : ""}`,
    { link: "u:압축기", hits: [[CX - 71, TOPY - 38, 142, 76]] }));

  // ── 줄 부품
  const sym = (it, x) => {
    const yy = it.y;
    switch (it.kind) {
      case "flex": { let r = `<rect x="${x - 9}" y="${yy - it.h / 2 + 4}" width="18" height="${it.h - 8}" rx="3" fill="${W0}" stroke="${LN}" stroke-width="1.5"/>`; for (let k = yy - it.h / 2 + 10; k < yy + it.h / 2 - 6; k += 5) r += `<line x1="${x - 9}" x2="${x + 9}" y1="${k}" y2="${k}" stroke="${SUB}"/>`; return r; }
      case "muffler": return capsule(x, yy, 30, it.h, F3) + `<line x1="${x - 15}" x2="${x + 15}" y1="${yy}" y2="${yy}" stroke="${SUB}"/>`;
      case "oilsep": return capsule(x, yy, 34, it.h, F3) + `<line x1="${x - 11}" x2="${x + 11}" y1="${yy + 14}" y2="${yy + 14}" stroke="${OIL}" stroke-width="2"/>`;
      case "accum": return capsule(x, yy, 46, it.h, F3);
      case "condA": {
        let z = `M${x - 38},${yy - 30}`; for (let k = 0; k < 8; k++) z += ` L${k % 2 ? x - 38 : x - 6},${yy - 30 + (k + 1) * 7.5}`;
        return `<rect x="${x - 44}" y="${yy - it.h / 2}" width="88" height="${it.h}" rx="8" fill="${W0}" stroke="${LN}" stroke-width="1.5"/><path d="${z}" fill="none" stroke="${LN}" stroke-width="1.5"/>${fanDisc(x + 21, yy, 18)}`;
      }
      case "condW": return capsule(x, yy, 88, it.h, F3) + [-10, 0, 10].map((d) => `<line x1="${x - 30}" x2="${x + 30}" y1="${yy + d}" y2="${yy + d}" stroke="${SUB}"/>`).join("")
        + [x - 26, x + 26].map((sx, k) => `<line x1="${sx}" x2="${sx}" y1="${yy - it.h / 2 - 12}" y2="${yy - it.h / 2}" stroke="${WATER}" stroke-width="3"/>${arrow(sx, yy - it.h / 2 - 10, k ? "up" : "down", WATER)}`).join("");
      case "subX": return `<rect x="${x - 44}" y="${yy - it.h / 2}" width="88" height="${it.h}" rx="8" fill="${W0}" stroke="${SUB}" stroke-width="1.5" stroke-dasharray="5 4"/>${tx(x, yy - 2, "중간냉각기", "sp")}${tx(x, yy + 16, "세트 외", "sp")}`;
      case "condX": return `<rect x="${x - 44}" y="${yy - it.h / 2}" width="88" height="${it.h}" rx="8" fill="${W0}" stroke="${SUB}" stroke-width="1.5" stroke-dasharray="5 4"/>${tx(x, yy - 2, "응축기", "sp")}${tx(x, yy + 16, "세트 외", "sp")}`;
      case "recv": return capsule(x, yy, it.half * 2, it.h, F3);
      case "bracket": return `<line x1="${x}" x2="${x - 22}" y1="${yy}" y2="${yy}" stroke="${LN}" stroke-width="2"/><rect x="${x - 30}" y="${yy - 6}" width="10" height="12" rx="2" fill="${F3}" stroke="${LN}"/>${bowtie(x, yy)}`;
      case "drier": return capsule(x, yy, 24, it.h, F2) + [-8, 0, 8].map((d) => `<line x1="${x - 7}" x2="${x + 7}" y1="${yy + d + 4}" y2="${yy + d - 4}" stroke="${SUB}"/>`).join("");
      case "sight": return `<circle cx="${x}" cy="${yy}" r="13" fill="${W0}" stroke="${LN}" stroke-width="1.5"/><circle cx="${x}" cy="${yy}" r="7" fill="${LOW}" opacity=".25"/>`;
      case "sol": return `<line x1="${x}" x2="${x - 20}" y1="${yy}" y2="${yy}" stroke="${LN}" stroke-width="2"/><rect x="${x - 38}" y="${yy - 10}" width="18" height="20" rx="3" fill="${F3}" stroke="${LN}"/>${bowtie(x, yy)}`;
      case "epr": { let z = `M${x + 4},${yy}`; for (let k = 0; k < 6; k++) z += ` L${x + 8 + k * 3},${yy + (k % 2 ? 5 : -5)}`; return `${bowtie(x, yy)}<path d="${z}" fill="none" stroke="${LN}" stroke-width="1.5"/>`; }
      default: return capsule(x, yy, 24, it.h, F2);
    }
  };
  const label = (it) => {
    if (it.kind === "condX" || it.kind === "subX") return [];
    const nm = (SPLIT[it.name] ?? [it.name]).map((t) => [t, "nm"]);
    const sp = it.list ? uniq(it.list.map((s) => s.spec)).join(" · ") : "";
    return sp && !/^1식|1대$/.test(sp) ? [...nm, [sp, "sp"]] : nm;
  };
  // 강조 면 높이 = 기호·이름 줄(줄당 19) 중 큰 쪽 — 이름이 세 줄이면 면 밖으로 삐져나오던 것(대표 11/09)
  const hitSpan = (it) => Math.max(it.h, 40, label(it).length * 19 + 6);
  for (const it of R) {
    const hitTop = it.y - hitSpan(it) / 2 - 4, hitH = hitSpan(it) + 8;
    const inner = sym(it, RX) + lines(RX + Math.max(it.half, 13) + 16, it.y, label(it), "start");
    const hits = [[RX - it.half - (it.kind === "bracket" || it.kind === "sol" ? 30 : 8), hitTop, VW - 4 - (RX - it.half - (it.kind === "bracket" || it.kind === "sol" ? 30 : 8)), hitH]];
    parts.push(it.list
      ? part(`u:${it.name}`, it.name, slotRows(it.list), inner, { link: `u:${it.name}`, hits })
      : it.kind === "subX"
        ? part("u:중간냉각기", "중간냉각기 (세트 외)", [["구성", "2단 구성표에 없음 — 서브쿨러 세트 따로"], ["근거", "삼영 BITZER 제품 가이드 29쪽 2단 배관도"]], inner, { hits })
        : part("u:응축기 없음", "응축기", [["구성", `${D.form === "수액기형" ? "수액기형 " : ""}구성표에 응축기 칸 없음`]], inner, { hits }));
  }
  for (const it of L) {
    const hitTop = it.y - hitSpan(it) / 2 - 4, hitH = hitSpan(it) + 8, right = LX + it.half + (it.kind === "epr" ? 26 : 8);
    parts.push(part(`u:${it.name}`, it.name, slotRows(it.list), sym(it, LX) + lines(LX - Math.max(it.half, 13) - 16, it.y, label(it), "end"), { link: `u:${it.name}`, hits: [[4, hitTop, right - 4, hitH]] }));
  }

  // ── 오일 리턴 — 유분리기 아래 → 압축기 바닥(갈색 점선)
  const os = R.find((it) => it.kind === "oilsep");
  let panelTop = 200;
  if (os) {
    const oy = os.y + 22, ox = CX + 28;
    g.push(pipe([[RX - 17, oy], [ox, oy], [ox, TOPY + 32]], OIL, `stroke-width="2" stroke-dasharray="6 4"`), arrow(ox, TOPY + 44, "up", OIL));
    const orv = get("오일리턴밸브");
    if (orv) {
      // 밸브는 세로 구간(압축기 바로 아래)에 — 가로 구간 아래는 응축기 자리라 글이 겹친다
      const vy = (TOPY + 32 + oy) / 2 + 6;
      parts.push(part("u:오일리턴밸브", "오일리턴밸브", slotRows(orv), bowtie(ox, vy, "v", 9) + lines(ox - 16, vy, [["오일리턴", "nm"], ["밸브", "nm"], [uniq(orv.map((s) => s.spec)).join(" · "), "sp"]], "end"),
        { link: "u:오일리턴밸브", hits: [[ox - 86, vy - 34, 100, 68]] }));
    }
    panelTop = oy + 22;
  }

  // ── 2단 중간압 회로(세트 외, 회색 점선): 액관 갈래 → 팽창밸브(중간냉각) → 중간냉각기 → 중간압 가스 → 압축기(BITZER 29쪽)
  const sub = R.find((it) => it.kind === "subX");
  if (sub) {
    const ty = sub.y - sub.h / 2 - 11, ix = RX - 62, vx = CX + 4, vy = sub.y + 12, dash = `stroke-width="2" stroke-dasharray="5 4"`;
    g.push(pipe([[RX, ty], [ix, ty], [ix, sub.y - 8], [RX - 44, sub.y - 8]], SUB, dash));
    g.push(pipe([[RX - 44, vy], [vx, vy], [vx, TOPY + 32]], SUB, dash), arrow(vx, TOPY + 46, "up", SUB), tx(vx - 8, TOPY + 66, "중간압", "sp", "end"));
    parts.push(part("u:중간냉각 팽창밸브", "팽창밸브(중간냉각) (세트 외)", [["구성", "2단 구성표에 없음"], ["근거", "삼영 BITZER 제품 가이드 29쪽 2단 배관도"]],
      dashed(bowtie(ix, (ty + sub.y - 8) / 2, "v", 8)), { hits: [[ix - 14, ty - 2, 28, sub.y - 8 - ty + 4]] }));
  }

  // ── 칠링: 팽창변+TC → 유니트 칠라
  if (chilling) {
    const tv = get("팽창변+TC");
    if (tv) parts.push(part("u:팽창변+TC", "팽창변+TC", slotRows(tv), `${bowtie(txvX, bottomY, "h")}<path d="M${txvX - 12},${bottomY - 13} A12,12 0 0 1 ${txvX + 12},${bottomY - 13} Z" fill="${F3}" stroke="${LN}" stroke-width="1.5"/>`
      + tx(txvX, bottomY + 32, "팽창변+TC") + (tv[0]?.spec ? tx(txvX, bottomY + 50, tv[0].spec, "sp") : ""), { link: "u:팽창변+TC", hits: [[txvX - 36, bottomY - 32, 72, 90]] }));
    const ch = get("유니트 칠라");
    if (ch) {
      let pl = ""; for (let k = chX - 36; k <= chX + 36; k += 6) pl += `<line x1="${k}" x2="${k}" y1="${bottomY - 22}" y2="${bottomY + 22}" stroke="${SUB}"/>`;
      parts.push(part("u:유니트 칠라", "유니트 칠라", slotRows(ch), `<rect x="${chX - 42}" y="${bottomY - 28}" width="84" height="56" rx="8" fill="${W0}" stroke="${LN}" stroke-width="1.5"/>${pl}`
        + [chX - 20, chX + 20].map((sx, k) => `<line x1="${sx}" x2="${sx}" y1="${bottomY + 28}" y2="${bottomY + 42}" stroke="${WATER}" stroke-width="3"/>${arrow(sx, bottomY + 40, k ? "down" : "up", WATER)}`).join("")
        + tx(chX, bottomY + 64, "유니트 칠라") + (ch[0]?.spec ? tx(chX, bottomY + 82, ch[0].spec, "sp") : ""), { link: "u:유니트 칠라", hits: [[chX - 48, bottomY - 34, 96, 124]] }));
    }
  }

  // ── 가운데: 프레샤·게이지(줄마다 하나). 점 색 = 받는 압력(고압 빨강·저압 파랑·유압 갈색)
  const sw = get("프레샤") ?? [], gg = get("게이지") ?? [];
  const dots = (spec) => { const s = String(spec ?? "").toUpperCase(); const c = /^HP$|고압/.test(s) ? [HOT] : /^LP$|저압/.test(s) ? [LOW] : /^OP$|유압/.test(s) ? [OIL] : /^DP$/.test(s) ? [HOT, LOW] : []; return c; };
  if (sw.length || gg.length) {
    // 칸 수만큼만 넓힌다 — 2단(프레샤 3종·게이지 4종 한 줄씩)은 좁아져 오른쪽으로 중간압 배관이 지나간다
    const ncol = Math.max(sw.length, gg.length, 1), px = LX + 31, pw = Math.min(RX - 50 - px, ncol * 44 + 26), rowH = 86, ph = (sw.length ? rowH : 0) + (gg.length ? rowH : 0) + 8;
    parts.push(`<rect x="${px}" y="${panelTop}" width="${pw}" height="${ph}" rx="12" fill="${F2}"/>`);
    let ry = panelTop + 8;
    const row = (list, cap, draw) => {
      parts.push(tx(px + 8, ry + 12, cap, "sp", "start"));
      const step = (pw - 8) / Math.max(ncol, list.length);
      list.forEach((s, i) => {
        const dx = px + 4 + step * (i + 0.5), cy = ry + 38;
        const dd = dots(s.spec).map((c, k) => `<circle cx="${dx + 13 - k * 8}" cy="${cy - 16}" r="3.5" fill="${c}"/>`).join("");
        parts.push(part(`u:${s.slot}:${s.spec ?? i}`, `${s.slot} ${s.spec ?? ""}`.trim(), slotRows([s]), draw(dx, cy, s) + dd + tx(dx, cy + 33, s.spec ?? "", "sp"),
          { link: unitLink(s), hits: [[dx - step / 2 + 1, ry + 18, step - 2, rowH - 20]] }));
      });
      ry += rowH;
    };
    if (sw.length) row(sw, "프레샤", (x, cy) => `<rect x="${x - 17}" y="${cy - 12}" width="34" height="24" rx="5" fill="${W0}" stroke="${LN}" stroke-width="1.5"/><line x1="${x - 8}" x2="${x + 8}" y1="${cy}" y2="${cy}" stroke="${LN}" stroke-width="1.5"/><line x1="${x + 2}" x2="${x + 8}" y1="${cy - 5}" y2="${cy}" stroke="${LN}" stroke-width="1.5"/>`);
    if (gg.length) row(gg, "게이지", (x, cy) => `<circle cx="${x}" cy="${cy}" r="15" fill="${W0}" stroke="${LN}" stroke-width="1.5"/><path d="M${x - 10},${cy + 6} A11,11 0 1 1 ${x + 10},${cy + 6}" fill="none" stroke="${SUB}"/><line x1="${x}" y1="${cy}" x2="${x + 7}" y2="${cy - 8}" stroke="${INK}" stroke-width="1.8"/><circle cx="${x}" cy="${cy}" r="2" fill="${INK}"/>`);
  }

  // 범례 조각 — 전체 계통도가 창고 쪽을 더 붙인다
  const legend = [`<span><i style="background:${HOT}"></i>토출 가스</span>`, `<span><i style="background:${LIQ}"></i>액</span>`, `<span><i style="background:${LOW}"></i>저압·흡입</span>`];
  if (os) legend.push(`<span><i class="dash" style="border-color:${OIL}"></i>오일 리턴</span>`);
  if (R.some((it) => it.kind === "condX" || it.kind === "subX")) legend.push(`<span><i class="dash" style="border-color:${SUB}"></i>세트 외</span>`);
  if (chilling || waterCooled) legend.push(`<span><i style="background:${WATER}"></i>${[waterCooled ? "냉각수" : "", chilling ? "냉수·브라인" : ""].filter(Boolean).join(" · ")}</span>`);
  // 창고 배관 정보에 붙일 유니트 쪽 규격 — 액은 전자변(없으면 사이트글라스·드라이어), 흡입은 후렉시블(흡입)
  const specOf = (...names) => { for (const n of names) { const l = by.get(n); if (l?.length) return { name: n, spec: uniq(l.map((x) => x.spec)).join(" · ") }; } return null; };
  const liqSide = specOf("전자변", "사이트글라스", "드라이어", "드라이어(분리식)"), sucSide = specOf("후렉시블(흡입)", "액분리기");
  // 자리를 정하지 않은 칸 — 칩으로(값은 같은 정보 글)
  const rest = [...by.keys()].filter((n) => !used.has(n));
  const chips = rest.length ? `<div class="figchips">${rest.map((n) => {
    const list = by.get(n), key = `u:${n}`;
    TIPS.set(key, { title: n, rows: slotRows(list).filter((r) => r && (r.head || (r[1] != null && r[1] !== ""))) });
    const v = list.every((s) => s.separate) ? "별도" : list.some((s) => s.priceKrw != null) ? won(list.reduce((a, s) => a + (s.priceKrw ?? 0), 0)) : "확인 후 안내";
    return `<span class="figchip" data-tip="${esc(key)}" data-link="${esc(key)}" tabindex="0">${esc(n)}<b>${esc(v)}</b></span>`;
  }).join("")}</div>` : "";
  return { svg: g.join("") + parts.join(""), bottomY, H: bottomY + (chilling ? 96 : 40), chilling, legend, chips, liqSide, sucSide };
}

// ═════════════════════════════ 전체 계통도(유니트 + 창고) ═════════════════════════════
// 대표 11/09 「유닛쿨러·팽창변도 계통도에」 — 유니트 액관 출구·흡입관 입구를 창고 안으로 이어 사이클 한 장으로.
//   유닛쿨러 대수만큼 가지(4대 넘으면 4가지 + 「외 N대」), 가지마다 팽창변 1조(쿨러 1대당 1조), 감온통은 쿨러 출구 흡입관.
//   세 탭(유니트·유닛쿨러·팽창변)이 같은 그림을 쓰고, 보고 있는 탭의 부품만 진하게(focus) 나머지는 흐리게.
//   칠링 형식은 팽창변·칠라가 세트 안이라 창고 쪽을 그리지 않는다. 유니트를 못 짰으면 유니트 자리는 점선 상자.
function unitPlaceholder(why) {
  const LX = 108, RX = 322, top = 34, bot = 120, bottomY = 160;
  const svg = `<rect x="${LX - 40}" y="${top}" width="${RX - LX + 80}" height="${bot - top}" rx="12" fill="${W0}" stroke="${SUB}" stroke-width="1.5" stroke-dasharray="6 4"/>`
    + tx((LX + RX) / 2, (top + bot) / 2 - 4, "유니트") + tx((LX + RX) / 2, (top + bot) / 2 + 16, why, "sp")
    + pipe([[RX, bot], [RX, bottomY]], LIQ) + arrow(RX, bottomY - 10, "down", LIQ) + `<circle cx="${RX}" cy="${bottomY + 2}" r="5" fill="${W0}" stroke="${LIQ}" stroke-width="2"/>` + tx(RX + 12, bottomY + 7, "액관 출구", "sp", "start")
    + pipe([[LX, bottomY], [LX, bot]], LOW) + arrow(LX, bot + 14, "up", LOW) + `<circle cx="${LX}" cy="${bottomY + 2}" r="5" fill="${W0}" stroke="${LOW}" stroke-width="2"/>` + tx(LX - 12, bottomY + 7, "흡입관 입구", "sp", "end");
  return { svg, bottomY, H: bottomY + 40, chilling: false, legend: [`<span><i style="background:${LIQ}"></i>액</span>`, `<span><i style="background:${LOW}"></i>저압·흡입</span>`], chips: "", liqSide: null, sucSide: null };
}

function roomSection(ctx, y0, U, focus) {
  const LX = 108, RX = 322, cX = 180, vX = 276, bX = 125;
  const C = ctx.cooler ?? null, T = ctx.txv ?? null;
  const c = C?.chosen ?? null, o = T?.chosen ?? null;
  const n = Math.max(1, Number(C?.count) || Number(T?.count) || 1), shown = Math.min(n, 4);
  const top = y0 + 40;
  const ys = [];
  for (let i = 0; i < shown; i++) ys.push(top + 70 + (i === 0 ? 0 : 120 + (i - 1) * 72));
  const yl = ys[ys.length - 1];
  const bottom = yl + (shown === 1 ? 82 : 40) + (n > shown ? 24 : 0);
  const dim = (on) => (on ? "" : ' class="dim"');
  // 창고·배관
  const base = [`<rect x="20" y="${top}" width="400" height="${bottom - top}" rx="14" fill="${F2}" fill-opacity=".6" stroke="${SUB}" stroke-width="1.5" stroke-dasharray="6 4"/>`,
    tx(LX + 14, top + 22, `창고 · 고내온도 ${ctx.roomC != null ? `${fmt(ctx.roomC, 0)}℃` : "-"}`, "sp", "start"),
    pipe([[RX, y0 + 8], [RX, yl]], LIQ), arrow(RX, top + 16, "down", LIQ),
    pipe([[LX, yl], [LX, y0 + 8]], LOW), arrow(LX, top + 16, "up", LOW)];
  for (const y of ys) {
    base.push(pipe([[RX, y], [vX + 14, y]], LIQ), arrow((RX + vX + 14) / 2 + 3, y, "left", LIQ));
    base.push(pipe([[vX - 14, y], [cX + 38, y]], LOW), arrow((vX - 14 + cX + 38) / 2 - 2, y, "left", LOW));
    base.push(pipe([[cX - 38, y], [LX, y]], LOW));
  }
  if (n > shown) base.push(tx((LX + RX) / 2, yl + 50, `외 ${n - shown}대 같은 구성`, "sp"));
  // 배관 정보 — 유니트 쪽 규격과 유닛쿨러 접속 관경을 나란히(맞는지 보라고, 판정은 하지 않는다)
  const pipeParts = [
    part("r:liq", "액관", [["유니트 쪽", U.liqSide ? `${U.liqSide.spec} (${U.liqSide.name})` : ""], ["유닛쿨러 액관 입구", c ? pipeTxt(c.pipe_in) : ""]], "", { link: "r:liq c:pin", hits: [[RX - 9, y0 + 10, 18, yl - y0 - 10]] }),
    part("r:suc", "흡입관", [["유니트 쪽", U.sucSide ? `${U.sucSide.spec} (${U.sucSide.name})` : ""], ["유닛쿨러 흡입관 출구", c ? pipeTxt(c.pipe_out) : ""]], "", { link: "r:suc c:pout", hits: [[LX - 9, y0 + 10, 18, yl - y0 - 10]] }),
  ];
  // 유닛쿨러
  const coolRows = c ? [["모델", c.model], ["메이커", c.maker], ["형식", c.form], ["대수", `${n}대`], ["1대 냉각능력", `${fmt(c.kcal)} kcal/h`], ["1대 필요능력", C?.perUnit ? `${fmt(C.perUnit)} kcal/h` : ""],
    ["여유율", c.margin_pct != null ? `${fmt(c.margin_pct, 0)}%` : ""], ["팬", c.fanInfo?.count ? `${c.fanInfo.count}개${c.fanInfo.dia ? ` · ${c.fanInfo.dia}mm` : ""}` : ""], ["풍량", c.airflow_cmm != null ? `${fmt(c.airflow_cmm)} CMM` : ""],
    ["액관 입구", pipeTxt(c.pipe_in)], ["흡입관 출구", pipeTxt(c.pipe_out)], ["제상", c.defrost]] : [["상태", "해당 모델 없음"]];
  const coolSym = (y) => {
    if (!c) return `<rect x="${cX - 38}" y="${y - 22}" width="76" height="44" rx="6" fill="${W0}" stroke="${SUB}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    let z = `M${cX - 32},${y - 16}`; for (let k = 0; k < 6; k++) z += ` L${k % 2 ? cX - 32 : cX - 4},${y - 16 + (k + 1) * 5.4}`;
    return `<rect x="${cX - 38}" y="${y - 22}" width="76" height="44" rx="6" fill="${W0}" stroke="${LN}" stroke-width="1.5"/><path d="${z}" fill="none" stroke="${LN}" stroke-width="1.3"/>${fanDisc(cX + 18, y, 13)}`;
  };
  // 팽창변(머리·모세관·감온통)
  const sum = o ? (o.components ?? []).reduce((a, x) => (a == null || x.price_krw == null ? null : a + x.price_krw), 0) : null;
  const txvRows = o ? [["모델", o.model], ["메이커", o.components?.[0]?.brand ?? ""], ["수량", `${n}조 (유닛쿨러 1대당 1조)`], ["부하율", o.load_pct != null ? `${o.load_pct}%` : ""],
    ["밸브 1개당 부하", T?.in?.capacityKw != null ? `${fmt(T.in.capacityKw, 1)} kW` : ""], { head: "구성 품번" }, ...(o.components ?? []).map((x) => [x.role ?? "구성품", `${x.code_no} · ${won(x.price_krw)}`]),
    ["1조 기본가", sum != null ? won(sum) : "가격 문의"]] : [["상태", T?.message ?? "해당 모델 없음"]];
  const txvSym = (y) => `${bowtie(vX, y, "h", 10)}<path d="M${vX - 11},${y - 11} A11,11 0 0 1 ${vX + 11},${y - 11} Z" fill="${F3}" stroke="${o ? LN : SUB}" stroke-width="1.5"/>`
    + `<polyline points="${vX},${y - 22} ${vX},${y - 34} ${bX},${y - 34} ${bX},${y - 6}" fill="none" stroke="${LN}" stroke-width="1.3"/>`
    + `<rect x="${bX - 11}" y="${y - 6}" width="22" height="12" rx="6" fill="${F3}" stroke="${LN}" stroke-width="1.3"/>`;
  const cool = [], valve = [];
  ys.forEach((y, i) => {
    const first = i === 0;
    // 이름은 위 줄 맞춤(줄 수와 상관없이 첫 줄이 기호 바로 아래) — 가운데 맞춤이면 세 줄일 때 기호에 닿는다
    const below = (x, arr) => lines(x, y + 39 + ((arr.length - 1) * 19) / 2, arr, "middle");
    const cl = first ? below(cX, [["유닛쿨러", "nm"], ...(c ? wrapCode(c.model, 14) : ["해당 모델 없음"]).map((t) => [t, "sp"])]) : "";
    cool.push(part("r:cooler", "유닛쿨러", coolRows, coolSym(y) + cl, { link: "c:body", hits: [[cX - 44, y - 28, 88, 56], ...(first ? [[cX - 50, y + 28, 100, 46]] : [])] }));
    const vl = first ? below(vX, [["팽창변", "nm"], ...(o ? wrapCode(o.model, 13) : ["-"]).map((t) => [t, "sp"])]) : "";
    valve.push(part("r:txv", "팽창변", txvRows, txvSym(y) + vl, { hits: [[vX - 20, y - 40, 40, 62], [bX - 14, y - 12, 28, 24], ...(first ? [[vX - 46, y + 24, 92, 66]] : [])] }));
  });
  const svg = `<g${dim(focus !== "unit")} data-room="1">${base.join("")}${pipeParts.join("")}</g><g${dim(focus === "cooler")}>${cool.join("")}</g><g${dim(focus === "txv")}>${valve.join("")}</g>`;
  return { svg, bottom, legend: o ? [`<span><i style="background:${LN}"></i>모세관</span>`] : [] };
}

/** 냉동 사이클 계통도 — 유니트(구성품 칸 그대로) + 창고(팽창변·유닛쿨러). ctx = { focus: unit|cooler|txv, cooler: 쿨러 out, txv: 팽창변 out+in, roomC, unitWhy } */
export function cycleFigure(D, ctx = {}) {
  const U = D ? unitLoop(D) : unitPlaceholder(ctx.unitWhy ?? "구성 불가");
  const withRoom = !U.chilling && !!(ctx.cooler || ctx.txv);
  const focus = withRoom ? (ctx.focus ?? "unit") : "unit";
  const room = withRoom ? roomSection(ctx, U.bottomY, U, focus) : null;
  const H = room ? room.bottom + 14 : U.H;
  const svg = `<svg class="fig" viewBox="0 0 440 ${H}" role="group" aria-label="냉동 사이클 계통도"><g${focus === "unit" ? "" : ' class="dim"'}>${U.svg}</g>${room ? room.svg : ""}</svg>`;
  const legend = `<div class="figlegend">${[...U.legend, ...(room?.legend ?? [])].join("")}</div>`;
  // 자리 없는 칸 칩(제작공임·콘트롤판넬·5/8 흡입 후렉시블)은 걷음 — 가운데 구성품 목록·기본가 막대에 같은 정보가 있다(대표 11/09 「없어도 되지 않을까?」→「빼줘」)
  return svg + legend;
}

// ═════════════════════════════ 유닛쿨러 외형도 ═════════════════════════════
// 정면(L×H, 팬 면) + 측면(W×H, 냉매관 접속 끝면)을 같은 축척으로. 팬 대수·지름은 카탈로그 표기에서 읽은 값(서버 coolerFan).
// 매달기(천장)·받침(상치형)은 형식 글로 가른다. 냉매관·드레인 위치는 일반 위치다.
const INCH = [[6.35, "1/4"], [9.52, "3/8"], [12.7, "1/2"], [15.88, "5/8"], [19.05, "3/4"], [22.22, "7/8"], [25.4, "1"], [28.58, "1 1/8"], [34.92, "1 3/8"], [41.28, "1 5/8"], [53.98, "2 1/8"], [66.68, "2 5/8"], [79.38, "3 1/8"]];
const pipeTxt = (mm) => { if (mm == null) return null; const m = INCH.find(([a]) => Math.abs(a - mm) < 0.06); return `${mm}mm${m ? ` (${m[1]}")` : ""}`; };

export function coolerFigure(c) {
  const L = Number(c.L), Wd = Number(c.W), Hh = Number(c.H);
  if (!(L > 0 && Wd > 0 && Hh > 0)) return null;
  const VW = 440, PL = 50, GAP = 56, PR = 40, PT = 58;
  const s = Math.min((VW - PL - GAP - PR) / (L + Wd), 230 / Hh);
  const fw = L * s, sw = Wd * s, fh = Hh * s;
  const x0 = PL, x1 = PL + fw + GAP, y0 = PT, yb = y0 + fh;
  const floor = /상치형/.test(c.form ?? "") && !/천장/.test(c.form ?? "");
  const F = c.fanInfo ?? {}, n = Number(F.count) || 0;
  const pan = Math.max(6, Math.min(12, fh * 0.1));
  const g = [];
  // 천장·바닥
  if (floor) {
    for (const lx of [x0 + 10, x0 + fw - 22, x1 + 6, x1 + sw - 18]) g.push(`<rect x="${lx}" y="${yb}" width="12" height="12" fill="${F3}" stroke="${LN}"/>`);
    g.push(`<line x1="${x0 - 14}" x2="${x1 + sw + 14}" y1="${yb + 12}" y2="${yb + 12}" stroke="${SUB}" stroke-width="1.5"/>`);
  } else {
    g.push(`<line x1="${x0 - 14}" x2="${x1 + sw + 14}" y1="${y0 - 22}" y2="${y0 - 22}" stroke="${SUB}" stroke-width="1.5" stroke-dasharray="6 4"/>`);
    for (const hx of [x0 + fw * 0.12, x0 + fw * 0.88, x1 + sw * 0.5]) g.push(`<line x1="${hx}" x2="${hx}" y1="${y0 - 22}" y2="${y0}" stroke="${LN}" stroke-width="2"/>`);
  }
  g.push(tx(x0, y0 - 32, "정면", "sp", "start"), tx(x1, y0 - 32, "측면", "sp", "start"));
  // 몸체
  const bodyRows = [["메이커", c.maker], ["계열", c.series], ["형식", c.form], ["외형", `${fmt(L)}×${fmt(Wd)}×${fmt(Hh)} mm`], ["중량", c.kg != null ? `${c.kg} kg` : ""], ["전원", c.power], ["출처", c.source]];
  const body = `<rect x="${x0}" y="${y0}" width="${fw}" height="${fh}" rx="4" fill="${W0}" stroke="${LN}" stroke-width="1.5"/><rect x="${x1}" y="${y0}" width="${sw}" height="${fh}" rx="4" fill="${W0}" stroke="${LN}" stroke-width="1.5"/>`;
  const P = [part("c:body", c.model, bodyRows, body, { link: "c:body", hits: [[x0 - 4, y0 - 4, fw + 8, fh + 8], [x1 - 4, y0 - 4, sw + 8, fh + 8]] })];
  // 코일(측면) — 핀 빗금 + 제상(전기=빨간 히터 점·살수=물 뿌림 관)
  const cx0 = x1 + sw * 0.3, cx1 = x1 + sw * 0.9, cy0 = y0 + fh * 0.08, cy1 = yb - pan - fh * 0.04;
  let coil = `<rect x="${cx0}" y="${cy0}" width="${cx1 - cx0}" height="${cy1 - cy0}" fill="${F2}" stroke="${LN}"/>`;
  for (let k = cx0 + 3; k < cx1 - 1; k += 3.5) coil += `<line x1="${k.toFixed(1)}" x2="${k.toFixed(1)}" y1="${cy0}" y2="${cy1}" stroke="${SUB}" stroke-width=".6"/>`;
  if (c.defrost === "전기") {
    for (let r = 1; r <= 3; r++) for (let q = 1; q <= 2; q++) coil += `<circle cx="${(cx0 + (cx1 - cx0) * q / 3).toFixed(1)}" cy="${(cy0 + (cy1 - cy0) * r / 4).toFixed(1)}" r="2.6" fill="${HOT}"/>`;
  } else if (c.defrost === "살수") {
    coil += `<line x1="${cx0}" x2="${cx1}" y1="${cy0 - 5}" y2="${cy0 - 5}" stroke="${WATER}" stroke-width="2.5"/>`;
    for (let q = 1; q <= 3; q++) coil += `<circle cx="${(cx0 + (cx1 - cx0) * q / 4).toFixed(1)}" cy="${cy0 + 4}" r="2" fill="${WATER}"/>`;
  }
  const coilRows = [["냉각능력", `${fmt(c.kcal)} kcal/h (${fmt(c.kw, 2)} kW)`], ["TD", c.tdUsed != null ? `${c.tdUsed}K${c.scaled ? " 칸 환산" : ""}` : ""], ["카탈로그 고내", c.room_c != null ? `${c.room_c}℃ 칸` : ""],
    ["전열면적", c.area_m2 != null ? `${c.area_m2} ㎡` : ""], ["핀 피치", c.fin_mm != null ? `${c.fin_mm} mm` : ""], ["제상", c.defrost], ["제상 히터", c.defrost === "전기" ? c.heater : ""], ["확인", c.check]];
  P.push(part("c:coil", "코일", coilRows, coil, { link: "c:coil", hits: [[cx0 - 3, cy0 - 9, cx1 - cx0 + 6, cy1 - cy0 + 12]] }));
  // 팬 — 정면 원판 n개 + 측면 얇은 판
  const fanRows = [["대수", n ? `${n}개` : ""], ["지름", F.dia ? `${F.dia} mm` : ""], ["팬·모터", F.motor], ["풍량", c.airflow_cmm != null ? `${fmt(c.airflow_cmm)} CMM` : ""], ["도달거리", c.throw_m != null ? `${c.throw_m} m` : ""]];
  let fans = "";
  const fanHits = [];
  if (n > 0) {
    const slot = fw / n, room = fh - pan;
    const r = Math.max(5, Math.min(F.dia ? (F.dia * s) / 2 : room * 0.36, room * 0.44, slot * 0.44));
    for (let i = 0; i < n; i++) {
      const cx = x0 + slot * (i + 0.5), cy = y0 + room / 2;
      fans += fanDisc(cx, cy, r);
      fanHits.push([cx - r - 3, cy - r - 3, 2 * r + 6, 2 * r + 6]);
    }
  }
  const fsx = x1 + sw * 0.06, fsw = Math.max(4, sw * 0.08);
  fans += `<rect x="${fsx}" y="${y0 + fh * 0.12}" width="${fsw}" height="${fh * 0.7 - pan}" rx="2" fill="${F3}" stroke="${LN}"/>`;
  fanHits.push([fsx - 4, y0 + fh * 0.12 - 4, fsw + 8, fh * 0.7 - pan + 8]);
  P.push(part("c:fan", "팬", fanRows, fans, { link: "c:fan", hits: fanHits }));
  // 바람 — 뒤(측면 오른쪽)로 들어와 코일을 지나 앞(팬)으로
  const ay = y0 + fh * 0.45;
  g.push(`<line x1="${x1 + sw + 30}" x2="${x1 + sw + 8}" y1="${ay}" y2="${ay}" stroke="${LOW}" stroke-width="2" stroke-dasharray="4 3"/>${arrow(x1 + sw + 8, ay, "left", LOW)}`);
  g.push(`<line x1="${x1 - 6}" x2="${x1 - 30}" y1="${ay}" y2="${ay}" stroke="${LOW}" stroke-width="2" stroke-dasharray="4 3"/>${arrow(x1 - 32, ay, "left", LOW)}`);
  // 드레인 팬
  const dx = x0 + fw * 0.9;
  const drain = `<rect x="${x0}" y="${yb - pan}" width="${fw}" height="${pan}" fill="${F3}" stroke="${LN}"/><rect x="${x1}" y="${yb - pan}" width="${sw}" height="${pan}" fill="${F3}" stroke="${LN}"/>`
    + (floor ? "" : `<line x1="${dx}" x2="${dx}" y1="${yb}" y2="${yb + 12}" stroke="${LN}" stroke-width="3"/>`);
  P.push(part("c:drain", "드레인", [["드레인 관경", c.drain], ["드레인 히터", c.drainHeater]], drain, { link: "c:drain", hits: [[x0 - 2, yb - pan - 3, fw + 4, pan + 18], [x1 - 2, yb - pan - 3, sw + 4, pan + 6]] }));
  // 냉매관 — 측면(끝면)에 관 끝 두 개, 아래에 이름·관경
  const pr = (mm, min) => Math.max(min, ((Number(mm) || 0) * s) / 2);
  const po = { x: x1 + sw * 0.62, y: y0 + fh * 0.32, r: pr(c.pipe_out, 6) }, pi = { x: x1 + sw * 0.62, y: y0 + fh * 0.62, r: pr(c.pipe_in, 4.5) };
  const dimY = yb + 30;
  const labY = dimY + 34;
  const lcx = x1 + sw / 2;
  const pipeDraw = (p, col) => `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${W0}" stroke="${col}" stroke-width="2.5"/><circle cx="${p.x}" cy="${p.y}" r="${Math.max(1.5, p.r * 0.45)}" fill="${col}" opacity=".35"/>`;
  P.push(part("c:pout", "흡입관 출구", [["관경", pipeTxt(c.pipe_out)]], pipeDraw(po, LOW) + lines(lcx, labY + 16, [["흡입관 출구", "nm"], [pipeTxt(c.pipe_out) ?? "-", "sp"]], "middle"),
    { link: "c:pout c:pipe", hits: [[po.x - po.r - 4, po.y - po.r - 4, 2 * po.r + 8, 2 * po.r + 8], [lcx - 62, labY - 4, 124, 42]] }));
  P.push(part("c:pin", "액관 입구", [["관경", pipeTxt(c.pipe_in)]], pipeDraw(pi, LIQ) + lines(lcx, labY + 62, [["액관 입구", "nm"], [pipeTxt(c.pipe_in) ?? "-", "sp"]], "middle"),
    { link: "c:pin c:pipe", hits: [[pi.x - pi.r - 4, pi.y - pi.r - 4, 2 * pi.r + 8, 2 * pi.r + 8], [lcx - 62, labY + 42, 124, 42]] }));
  // 치수
  const dimH = (xa, xb, yy, t) => `<line x1="${xa}" x2="${xb}" y1="${yy}" y2="${yy}" stroke="${INK}" stroke-width="1"/><line x1="${xa}" x2="${xa}" y1="${yy - 5}" y2="${yy + 5}" stroke="${INK}"/><line x1="${xb}" x2="${xb}" y1="${yy - 5}" y2="${yy + 5}" stroke="${INK}"/>${tx((xa + xb) / 2, yy + 20, t, "dm")}`;
  g.push(dimH(x0, x0 + fw, dimY, `${fmt(L)}mm`), dimH(x1, x1 + sw, dimY, `${fmt(Wd)}mm`));
  const hx = x0 - 18;
  g.push(`<line x1="${hx}" x2="${hx}" y1="${y0}" y2="${yb}" stroke="${INK}" stroke-width="1"/><line x1="${hx - 5}" x2="${hx + 5}" y1="${y0}" y2="${y0}" stroke="${INK}"/><line x1="${hx - 5}" x2="${hx + 5}" y1="${yb}" y2="${yb}" stroke="${INK}"/><text x="${hx - 8}" y="${(y0 + yb) / 2}" class="dm" text-anchor="middle" transform="rotate(-90 ${hx - 8} ${(y0 + yb) / 2})">${fmt(Hh)}mm</text>`);
  const H = labY + 92;
  const legend = `<div class="figlegend"><span><i style="background:${LOW}"></i>바람 · 흡입관</span><span><i style="background:${LIQ}"></i>액관</span>${c.defrost === "전기" ? `<span><i class="dot" style="background:${HOT}"></i>제상 히터</span>` : c.defrost === "살수" ? `<span><i style="background:${WATER}"></i>살수 제상</span>` : ""}</div>`;
  return `<svg class="fig" viewBox="0 0 ${VW} ${H}" role="group" aria-label="유닛쿨러 외형도">${g.join("")}${P.join("")}</svg>${legend}`;
}

// ═════════════════════════════ 팽창변 구성도 ═════════════════════════════
// 설치 자리(액관 → 팽창변 → 유닛쿨러 증발기 → 흡입관, 감온통은 증발기 출구 흡입관) 위에 구성 품번을 역할대로 놓는다.
//   감온부(머리·모세관·감온통) / 바디 / 오리피스·케이지(빼서 그림 — 바디에 끼우는 부품) · 일체형(밸브·팽창변·본체)은 머리+바디가 한 조각
//   외부 균압관은 댄포스 TE·TE2·TGE 만 그린다(이름의 E = 외부 균압). 다른 계열은 자료로 확인 전이라 그리지 않는다.
/** 긴 품번(사기노미야 「ATX-71110DUS 12.5T R-404A」)은 띄어쓰기에서 줄을 나눈다 — 그림 밖으로 잘리지 않게 */
function wrapCode(code, max = 14) {
  const out = [];
  for (const w of String(code ?? "").split(/\s+/).filter(Boolean)) {
    if (out.length && (out[out.length - 1] + " " + w).length <= max) out[out.length - 1] += " " + w; else out.push(w);
  }
  return out.length ? out : [""];
}
export function txvFigure(o, ctx = {}) {
  const cs = o?.components ?? [];
  if (!cs.length) return null;
  const at = (r) => cs.findIndex((c) => c.role === r);
  const iHead = ["감온부", "팽창변", "본체", "밸브"].map(at).find((i) => i >= 0) ?? 0;
  const iBody = at("바디") >= 0 ? at("바디") : iHead;
  const iIns = ["오리피스", "케이지"].map(at).find((i) => i >= 0) ?? -1;
  const fam = String(o.family ?? "").replace(/\s+/g, "").toUpperCase();
  const eq = cs[0]?.brand === "댄포스" && /^(TE|TGE)/.test(fam);
  const VW = 440, BX = 150, BY = 206, EX0 = 246, EX1 = 356, SY = 64, RX = 400;
  const compRows = (c) => [["역할", c.role], ["품번", c.code_no], ["품명", c.detail?.model_name], ["사양", c.detail?.spec], ["접속", c.detail?.connection_size], ["냉매", c.detail?.refrigerant], ["기본가", won(c.price_krw)], ["취급", c.in_catalog ? "취급" : "미취급"]];
  // 오리피스 번호는 댄포스만(사기노미야·알코의 orifice 칸은 모델·케이지 품번이라 번호가 아니다). range 는 엔진 칸 이름 그대로 「범위」
  const valveRows = [{ head: "선정" }, ["모델", o.model], ["오리피스", cs[0]?.brand === "댄포스" && o.orifice != null ? `No. ${o.orifice}` : ""], ["범위", o.range], ["부하율", o.load_pct != null ? `${o.load_pct}%` : ""], ["공칭 능력", o.nominal_kw != null ? `${fmt(o.nominal_kw, 1)} kW` : ""]];
  const g = [];
  // 배관 — 액관(주황) → 밸브 → 증발기(파랑) → 흡입관(파랑, 위로 돌아 왼쪽)
  g.push(pipe([[24, BY], [BX - 36, BY]], LIQ), arrow(70, BY, "right", LIQ), tx(24, BY - 12, "액관", "sp", "start"));
  g.push(pipe([[BX + 36, BY], [EX0, BY]], LOW), arrow((BX + 36 + EX0) / 2 + 6, BY, "right", LOW));
  g.push(pipe([[EX1, BY], [RX, BY], [RX, SY], [24, SY]], LOW), arrow(RX, (BY + SY) / 2, "up", LOW), arrow(110, SY, "left", LOW), tx(24, SY - 12, "흡입관", "sp", "start"));
  if (eq) {
    g.push(`<polyline points="${BX + 36},${BY - 12} ${BX + 58},${BY - 12} ${BX + 58},${BY - 74} ${EX0 + 24},${BY - 74} ${EX0 + 24},${SY}" fill="none" stroke="${LN}" stroke-width="1.6"/><circle cx="${EX0 + 24}" cy="${SY}" r="3.5" fill="${LN}"/>`);
    g.push(tx(BX + 66, BY - 56, "균압관", "sp", "start"));
  }
  // 증발기(유닛쿨러) — 부하 조건
  let coil = `M${EX0 + 12},${BY - 24}`; for (let k = 0; k < 8; k++) coil += ` L${EX0 + 12 + (k + 1) * (EX1 - EX0 - 24) / 8},${BY + (k % 2 ? -24 : 24)}`;
  const evapRows = [["밸브 1개당 부하", ctx.capacityKw != null ? `${fmt(ctx.capacityKw, 1)} kW` : ""], ["냉매", ctx.refrigerant], ["증발온도", ctx.evapC != null ? `${ctx.evapC}℃` : ""], ["응축온도", ctx.condC != null ? `${ctx.condC}℃` : ""], ["과냉도", ctx.subcoolK != null ? `${ctx.subcoolK}K` : ""], ["수량", ctx.count ? `${ctx.count}조 (유닛쿨러 1대당 1조)` : ""]];
  const P = [part("x:evap", "유닛쿨러(증발기)", evapRows, `<rect x="${EX0}" y="${BY - 34}" width="${EX1 - EX0}" height="68" rx="8" fill="${W0}" stroke="${LN}" stroke-width="1.5"/><path d="${coil}" fill="none" stroke="${SUB}" stroke-width="1.5"/>${tx((EX0 + EX1) / 2, BY + 58, "유닛쿨러", "nm")}${tx((EX0 + EX1) / 2, BY + 76, "증발기", "sp")}`,
    { hits: [[EX0 - 4, BY - 38, EX1 - EX0 + 8, 122]] })];
  // 감온부(머리·모세관·감온통)
  const bulbX = 340;
  const head = `<path d="M${BX - 26},${BY - 22} A26,26 0 0 1 ${BX + 26},${BY - 22} Z" fill="${F3}" stroke="${LN}" stroke-width="1.5"/><line x1="${BX - 22}" x2="${BX + 22}" y1="${BY - 28}" y2="${BY - 28}" stroke="${SUB}"/>`
    + `<polyline points="${BX},${BY - 48} ${BX},${BY - 92} ${bulbX},${BY - 92} ${bulbX},${SY + 9}" fill="none" stroke="${LN}" stroke-width="1.4"/>`
    + `<rect x="${bulbX - 24}" y="${SY - 9}" width="48" height="18" rx="9" fill="${F3}" stroke="${LN}" stroke-width="1.5"/><line x1="${bulbX - 14}" x2="${bulbX - 14}" y1="${SY - 12}" y2="${SY + 12}" stroke="${LN}" stroke-width="2"/><line x1="${bulbX + 14}" x2="${bulbX + 14}" y1="${SY - 12}" y2="${SY + 12}" stroke="${LN}" stroke-width="2"/>`
    + tx(bulbX, SY - 18, "감온통", "sp");
  const bodyShape = `<rect x="${BX - 36}" y="${BY - 22}" width="72" height="44" rx="8" fill="${F3}" stroke="${LN}" stroke-width="1.5"/>`;
  const hc = cs[iHead], bc = cs[iBody];
  const headLabel = lines(BX - 40, BY - 62, [[hc.role, "nm"], ...wrapCode(hc.code_no).map((t) => [t, "sp"])], "end");
  const headHits = [[BX - 120, BY - 82, 150, 64], [bulbX - 30, SY - 34, 60, 50]];
  if (iBody === iHead) {
    P.push(part("x:0", hc.role, [...compRows(hc), ...valveRows], bodyShape + head + headLabel, { link: `x:${iHead}`, hits: [...headHits, [BX - 40, BY - 26, 80, 52]] }));
  } else {
    P.push(part(`x:${iHead}`, hc.role, compRows(hc), head + headLabel, { link: `x:${iHead}`, hits: headHits }));
    P.push(part(`x:${iBody}`, bc.role, [...compRows(bc), ...valveRows], bodyShape + lines(BX - 44, BY + 44, [[bc.role, "nm"], ...wrapCode(bc.code_no).map((t) => [t, "sp"])], "end"), { link: `x:${iBody}`, hits: [[BX - 120, BY - 26, 160, 92]] }));
  }
  // 오리피스·케이지 — 바디 아래로 빼서(점선 화살표 = 끼우는 자리)
  if (iIns >= 0) {
    const ic = cs[iIns], iy = BY + 76;
    P.push(part(`x:${iIns}`, ic.role, compRows(ic), `<line x1="${BX}" x2="${BX}" y1="${iy - 18}" y2="${BY + 28}" stroke="${SUB}" stroke-width="1.5" stroke-dasharray="4 3"/>${arrow(BX, BY + 30, "up", SUB)}`
      + `<rect x="${BX - 15}" y="${iy - 16}" width="30" height="32" rx="5" fill="${W0}" stroke="${LN}" stroke-width="1.5"/><line x1="${BX - 6}" x2="${BX + 6}" y1="${iy}" y2="${iy}" stroke="${LN}" stroke-width="3"/>`
      + lines(BX + 26, iy, [[ic.role, "nm"], ...wrapCode(ic.code_no).map((t) => [t, "sp"])], "start"), { link: `x:${iIns}`, hits: [[BX - 22, iy - 22, 140, 46]] }));
  }
  // 그 밖의 구성 품번(역할을 정하지 않은 것) — 오른쪽 아래 글로
  const restIdx = cs.map((_, i) => i).filter((i) => i !== iHead && i !== iBody && i !== iIns);
  restIdx.forEach((i, k) => {
    const c = cs[i], yy = BY + 76 + k * 44, xx = EX0 + 8;
    P.push(part(`x:${i}`, c.role, compRows(c), lines(xx, yy, [[c.role, "nm"], [c.code_no, "sp"]], "start"), { link: `x:${i}`, hits: [[xx - 6, yy - 22, 150, 44]] }));
  });
  const H = BY + 112 + Math.max(0, restIdx.length - 1) * 44;
  const legend = `<div class="figlegend"><span><i style="background:${LIQ}"></i>액</span><span><i style="background:${LOW}"></i>저압·흡입</span>${eq ? `<span><i style="background:${LN}"></i>균압관·모세관</span>` : `<span><i style="background:${LN}"></i>모세관</span>`}</div>`;
  return `<svg class="fig" viewBox="0 0 ${VW} ${H}" role="group" aria-label="팽창변 구성도">${g.join("")}${P.join("")}</svg>${legend}`;
}
