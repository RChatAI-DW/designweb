// specblocks — 압축기 「대분류 × 메이커」 화면(대표 11/16). 「101 밀폐왕복동 › 엠브라코」 완성본(자료/묶음화면_엠브라코_예시_1116)을 그대로 옮기고
//   엠브라코 전용으로 박혀 있던 것(계열·냉매 칩·메이커 표기·가격표 이름·성능 조건)만 자료에서 읽게 바꿨다.
// 자료: /api/spec/blocks?cate=101&maker=엠브라코 (server/spec/blocks.ts ← data/comp_blocks_build.py)
// 앱은 화면 전체를 자주 다시 그린다 → 이 화면은 자기 상태(탭·거르기·찾기·펼친 줄·스크롤)를 여기 두고, 다시 그려지면 그 상태로 되살린다.
// 손(누름·입력)은 이 화면 바깥 상자(host)에 직접 단다 — 앱 click 처리보다 먼저 돈다.
const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const isNum = (v) => v !== null && v !== "" && v !== undefined && !isNaN(Number(v));
const won = (v) => (v === null || v === undefined || v === "" ? "" : isNum(v) ? Number(v).toLocaleString("ko-KR") : `<span class="cb-fade">${esc(v)}</span>`);
const blank = '<span class="cb-fade">–</span>';
// 모델명 해석 카드 글자 꾸밈 — <b>…</b> 굵게 · «…» 옅게 만 살린다
const rich = (v) => esc(v).replace(/&lt;(\/?)b&gt;/g, "<$1b>").replace(/«([^»]*)»/g, '<span class="cb-fade">$1</span>');
const MS = "마스터 사양 시트";

// ───────────── 툴팁(한 개, body 에) ─────────────
let TIPS = [];
const tipId = (html) => (TIPS.push(html), TIPS.length - 1);
let tipEl = null, hideT = null, pinned = false;
// 이 화면 모양(차례의 대분류·메이커 줄 포함) — 모듈을 읽을 때 한 번 붙인다
if (typeof document !== "undefined" && !document.querySelector("link[data-cb-css]")) {
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "specblocks.css"; l.dataset.cbCss = "1"; document.head.appendChild(l);
}
function ensureTip() {
  if (tipEl) return;
  tipEl = document.createElement("div"); tipEl.id = "cb-tip"; document.body.appendChild(tipEl);
  tipEl.addEventListener("mouseenter", () => clearTimeout(hideT));
  tipEl.addEventListener("mouseleave", () => { if (!pinned) hideT = setTimeout(hideTip, 180); });
  document.addEventListener("mouseover", (e) => { const t = e.target.closest?.(".cb [data-tip]"); if (t && !pinned) showTip(t); });
  document.addEventListener("mouseout", (e) => { const t = e.target.closest?.(".cb [data-tip]"); if (t && !pinned) hideT = setTimeout(hideTip, 180); });
  // 누름(휴대폰) — 값을 누르면 툴팁을 고정하고 줄 펼침은 하지 않는다. 다른 곳을 누르면 닫힘
  document.addEventListener("click", (e) => {
    const t = e.target.closest?.(".cb [data-tip]");
    if (t) { e.stopPropagation(); pinned = true; showTip(t); return; }
    if (!e.target.closest?.("#cb-tip")) hideTip();
  }, true);
  addEventListener("scroll", () => { if (!pinned) hideTip(); }, { passive: true, capture: true });
}
function showTip(el) {
  clearTimeout(hideT);
  const h = TIPS[+el.dataset.tip]; if (h == null) return;
  tipEl.innerHTML = h; tipEl.style.display = "block";
  const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
  const x = Math.min(Math.max(8, r.left), innerWidth - w - 8);
  let y = r.bottom + 6;
  if (y + hh > innerHeight - 8) y = Math.max(8, r.top - hh - 6);
  tipEl.style.left = `${x}px`; tipEl.style.top = `${y}px`;
}
function hideTip() { if (tipEl) tipEl.style.display = "none"; pinned = false; }

// ───────────── 출처 줄 ─────────────
function qClean(q) {
  q = String(q || "").replace(/https?:\/\/\S+/g, "").replace(/file:\S+/g, "").replace(/\s*[\/·]\s*(?=[\/·]|$)/g, "").replace(/\s{2,}/g, " ").trim();
  return q.length > 140 ? `${q.slice(0, 140)}…` : q;
}
function srcLine(s) {
  const lab = s.u ? `<a href="${esc(s.u)}" target="_blank" rel="noopener">${esc(s.l)}</a>` : esc(s.l);
  return `<div class="cb-ts">${lab}${s.c ? `<span class="c">확실도 ${esc(s.c)}</span>` : ""}${s.k ? `<span class="c">${esc(s.k)}</span>` : ""}${qClean(s.q) && s.l !== MS ? `<div class="cb-q">${esc(qClean(s.q))}</div>` : ""}</div>`;
}
function srcBlock(v) {
  const docs = v.src.filter((s) => s.l !== MS);
  if (docs.length) return docs.map(srcLine).join("");
  const m = v.src.find((s) => s.l === MS), c = (m && m.cand) || [];
  return `<div class="cb-ts cb-nv">값마다 확인 안 됨</div>${c.length ? `<div class="cb-tf">후보 문서 · 마스터 근거 칸</div>${c.map(srcLine).join("")}` : ""}`;
}
const srcNames = (v) => { const d = v.src.filter((s) => s.l !== MS); return d.length ? d.map((s) => s.l).join(", ") : "값마다 확인 안 됨"; };
const valsTip = (vals, title) => (title ? `<div class="cb-tf">${esc(title)}</div>` : "") + vals.map((v) => `<div class="cb-tv"><div class="cb-tvv">${esc(v.v)}</div>${srcBlock(v)}</div>`).join("");

// ───────────── 값 정리 ─────────────
function hpNum(v) {
  v = String(v || "").toUpperCase().replace("HP", "").replace("+", "").trim();
  if (!v || /[가-힣]/.test(v)) return null;
  const mx = v.match(/^(\d+)\s+(\d+)\/(\d+)$/); if (mx) return Number(mx[1]) + Number(mx[2]) / Number(mx[3]);
  if (v.includes("/")) { const [a, b] = v.split("/").map(Number); return b && !isNaN(a) ? a / b : null; }
  const n = Number(v); return isNaN(n) ? null : n;
}
function firstVal(it, f) { const a = it.spec[f]; return a && a.length ? a[0].v : ""; }
function phaseOf(it) {
  const p = firstVal(it, "전원");
  if (/3상|삼상|3P/i.test(p)) return "3상";
  if (/단상|1P/i.test(p)) return "단상";
  const s = firstVal(it, "상"); if (s === "3") return "3상"; if (s === "1") return "단상";
  return "";
}
function powerOf(it) {
  const p = firstVal(it, "전원").replace("삼상", "3상");
  if (/V/.test(p) && /상/.test(p)) return p;
  const ph = phaseOf(it), v = p || (firstVal(it, "전압 최저(V)") ? `${firstVal(it, "전압 최저(V)")}V` : "");
  return [v, ph].filter(Boolean).join(" ");
}
function useSets(it) { return [...new Set((it.spec["용도"] || []).map((x) => x.v.match(/저온|중온|고온/g) || []).filter((a) => a.length).map((a) => [...new Set(a)].join("·")))]; }
function useOf(it) { const s = useSets(it); return s.length ? s[0].split("·") : []; }
const strip = (v) => String(v || "").replace(/\s*(℃|°C|V)$/, "").trim();
// 「최저 ~ 최고」 한 줄 — 한쪽만 알면 모르는 쪽은 옅은 「–」(HTML)
const DASH = '<span class="cb-fade">–</span>';
function rangeHtml(lo, hi, unit) {
  // 판별 전압 「220 (D) / 380 (Y)」 ~ 「240 (D) / 420 (Y)」 → 「220~240 (D) / 380~420 (Y)」
  const a = String(lo || "").split("/"), b = String(hi || "").split("/");
  if (a.length > 1 && a.length === b.length) {
    const pair = a.map((x, i) => { const m = x.trim().match(/^([\d.]+)\s*(.*)$/), n = b[i].trim().match(/^([\d.]+)\s*(.*)$/); return m && n ? `${m[1]}~${n[1]}${m[2] ? ` ${m[2]}` : ""}` : null; });
    if (pair.every(Boolean)) return esc(pair.join(" / ") + unit);
  }
  return lo || hi ? `${lo ? esc(lo) : DASH} ~ ${hi ? esc(hi) : DASH}${esc(unit)}` : "";
}
function evapOf(it) { return rangeHtml(strip(firstVal(it, "사용온도 최저(℃)")), strip(firstVal(it, "사용온도 최고(℃)")), "℃"); }
function hpDiffer(it) { return new Set((it.spec["마력"] || []).map((x) => hpNum(x.v)).filter((n) => n !== null).map((n) => n.toFixed(3))).size > 1; }
const rtoks = (v) => String(v || "").toUpperCase().replace(/R-/g, "R").replace(/\s/g, "").match(/R\d{2,3}[A-Z]?/g) || [];
function refDiffer(it) {
  const sets = (it.spec["냉매"] || []).map((x) => new Set(rtoks(x.v))).filter((s) => s.size);
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) if (![...sets[i]].some((r) => sets[j].has(r))) return true;
  return false;
}
const refsOf = (c, it) => (it ? it.refs : c.refs) || [];
const refText = (c, it) => refsOf(c, it).map((r) => r.v).join("·");
const wbr = (h) => h.replace(/·/g, "·<wbr>");   // 좁을 때 냉매·용도 목록이 「·」 뒤에서 줄바꿈
const REF_ORDER = ["R134A", "R404A", "R507", "R507A", "R452A", "R448A", "R449A", "R407C", "R407F", "R22", "R422D", "R410A", "R12", "R290", "R600A"];

// ───────────── 압축기 히터(110) 칸 ─────────────
const hv = (o, f) => { const a = o && o.spec && o.spec[f]; return a && a.length ? a[0].v : ""; };
const wattOf = (o) => { const w = hv(o, "전력(W)"); return w ? `${w}W` : ""; };
function voltHtml(o) { const lo = strip(hv(o, "전압 최저(V)")), hi = strip(hv(o, "전압 최고(V)")); return lo || hi ? (lo === hi ? esc(`${lo}V`) : rangeHtml(lo, hi, "V")) : esc(hv(o, "전압 구간")); }
function voltKey(o) { const lo = strip(hv(o, "전압 최저(V)")), hi = strip(hv(o, "전압 최고(V)")); return lo && hi ? (lo === hi ? `${lo}V` : `${lo}~${hi}V`) : lo || hi ? `${lo || hi}V` : ""; }
const numDiffer = (o, f) => new Set(((o.spec || {})[f] || []).map((x) => String(x.v).replace(/[^\d.~-]/g, "")).filter(Boolean)).size > 1;
// 히터 전압 — 자료마다 [최저, 최고] 구간을 만들어 서로 겹치지 않을 때만 갈림(상품명 100V 와 제조사 100~140V 는 같음)
function voltConflict(o) {
  const by = {};
  [["전압 최저(V)", 0], ["전압 최고(V)", 1]].forEach(([f, i]) => ((o.spec || {})[f] || []).forEach((v) => v.src.forEach((sd) => { const n = parseFloat(v.v); if (!isNaN(n)) (by[sd.l] ??= [null, null])[i] = n; })));
  const iv = Object.values(by).map(([a, b]) => [a ?? b, b ?? a]).filter(([a, b]) => a != null);
  return iv.some((x, i) => iv.slice(i + 1).some((y) => x[1] < y[0] || y[1] < x[0]));
}

// ───────────── 화면 ─────────────
export function createBlocks({ api }) {
  const data = {};    // "101|엠브라코" → 자료
  const views = {};   // 같은 열쇠 → {tab, F, open, scroll}
  let cur = null;     // 지금 그린 화면 {key, host, D, ...}

  async function mount(host, cate, maker) {
    ensureTip(); hideTip();
    const key = `${cate}|${maker}`;
    const V = (views[key] ??= { tab: "items", F: { series: "", ref: "", use: "", volt: "", has: "", nc: "", q: "" }, open: null, scroll: 0 });
    if (!data[key]) {
      host.innerHTML = `<div class="cb"><div class="cb-loading">불러오는 중…</div></div>`;
      try { data[key] = await api(`/api/spec/blocks?cate=${encodeURIComponent(cate)}&maker=${encodeURIComponent(maker)}`); }
      catch (e) { host.innerHTML = `<div class="cb"><div class="cb-loading">화면 자료를 불러오지 못했습니다: ${esc(e.message)}</div></div>`; return; }
      if (!host.isConnected) return;   // 기다리는 사이 다른 화면으로 바뀜
    }
    draw(host, data[key], V);
    host.scrollTop = V.scroll;
    host.addEventListener("scroll", () => { V.scroll = host.scrollTop; hideTip(); }, { passive: true });
  }

  function draw(host, D0, V) {
    TIPS = [];
    // 한 화면 그리기마다 새로 계산(자료는 그대로 두고 화면용 값만 붙인 사본)
    const D = { ...D0, codes: D0.codes.map((c) => ({ ...c })) };
    const HT = D.kind === "heater", NC = HT ? 10 : 11;   // 히터 화면은 칸이 다르다(형식·전력·전압·적용 압축기)
    D.codes.forEach((c) => {
      c.hasItem = c.items.length > 0;
      c.volts = [...new Set((c.items.length ? c.items : [c]).map(voltKey).filter(Boolean))];
      c.refList = [...new Set((c.items.length ? c.items.flatMap((it) => refsOf(c, it)) : refsOf(c, null)).map((r) => r.v))];
      c.uses = c.items.flatMap(useOf);
      c.text = [c.code, c.model, ...c.items.flatMap((it) => [it.old, it.name, it.mfg])].join(" ").toUpperCase();
    });
    const nLinked = D.codes.reduce((a, c) => a + c.items.filter((i) => i.status === "연결").length, 0);
    const nCand = D.codes.reduce((a, c) => a + c.items.filter((i) => i.status === "후보").length, 0);
    const stat = (l, n, cls = "") => `<div class="cb-stat ${cls}"><div class="cb-sl">${l}</div><div class="cb-sn">${n}</div></div>`;
    const ranges = (D.blocks || []).map((b) => { const cs = D.codes.filter((c) => c.block === b); return cs.length > 1 ? `${cs[0].code}~${cs[cs.length - 1].code.slice(-4)}` : cs.length ? cs[0].code : ""; }).filter(Boolean).join(" · ");
    const refsAll = [...new Set(D.codes.flatMap((c) => c.refList))];
    const refOpts = [...REF_ORDER.filter((r) => refsAll.includes(r)), ...refsAll.filter((r) => !REF_ORDER.includes(r)).sort()];
    const voltOpts = [...new Set(D.codes.flatMap((c) => c.volts))].sort((a, b) => parseFloat(a) - parseFloat(b));
    const groups = HT ? [
      ...(D.series.length > 1 ? [["series", "형식", D.series.map((s) => s.key)]] : []),
      ...(voltOpts.length > 1 ? [["volt", "전압", voltOpts]] : []),
      ["has", "회사 품목", ["있음", "없음"]],
      ["nc", "신규 코드", ["있음", "없음"]],
    ] : [
      ...(D.series.length > 1 ? [["series", "계열", D.series.map((s) => s.key)]] : []),
      ["ref", "냉매", refOpts],
      ["use", "용도", ["저온", "중온", "고온"]],
      ["has", "회사 품목", ["있음", "없음"]],
      ["nc", "신규 코드", ["있음", "없음"]],
    ];
    const F = V.F;
    host.innerHTML = `<div class="cb">
      <div class="cb-crumb">100 압축기 › ${esc(D.cate)} ${esc(D.cateName)}</div>
      <div class="cb-title"><h1>${esc(D.maker)}</h1><span class="cb-src">코드표 26.10.19 · ${esc(ranges)}</span></div>
      <div class="cb-stats">${stat("신규 코드", D.codes.filter((c) => c.code).length) + stat("회사 품목 연결", nLinked) + stat("연결 후보", nCand, "warn")
        + stat("회사 품목 없음", D.codes.filter((c) => c.code && !c.hasItem).length) + stat("신규 코드 없는 회사 품목", D.codes.filter((c) => !c.code).length, "warn")}</div>
      <div class="cb-bar">
        <div class="cb-seg">
          <button type="button" data-cbtab="items"${V.tab === "items" ? ' class="on"' : ""}>품목</button>
          <button type="button" data-cbtab="naming"${V.tab === "naming" ? ' class="on"' : ""}>모델명 해석</button>
          <button type="button" data-cbtab="checks"${V.tab === "checks" ? ' class="on"' : ""}>확인 사항<span class="cb-segn" id="cb-ncheck"></span></button>
        </div>
        <input class="cb-search" id="cb-q" type="search" autocomplete="off" placeholder="코드 · 모델 · 상품명 · 구 코드" value="${esc(F.q)}"${V.tab === "items" ? "" : ' hidden'}>
      </div>
      <div class="cb-panel${V.tab === "items" ? " on" : ""}" id="cb-p-items">
        <div class="cb-card">
          <div class="cb-toolbar">${groups.map(([k, l, opts]) => `<div class="cb-fg"><span>${l}</span>${opts.map((o) => `<button type="button" class="cb-chip${F[k] === o ? " on" : ""}" data-k="${k}" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>`).join("")}</div>
          <div class="cb-scroll">
          <table class="cb-t" id="cb-tbl">
            ${HT ? `<colgroup><col class="c-code"><col class="c-hmodel"><col class="c-htype"><col class="c-hw"><col class="c-hv"><col><col><col class="c-price"><col class="c-stock"><col class="c-y3"></colgroup>
            <thead>
              <tr class="cb-grp"><th class="cb-ct" colspan="2">회사 코드표</th><th class="cb-sep" colspan="8">회사 품목 · 제조사 자료</th></tr>
              <tr><th class="cb-ct">코드번호</th><th class="cb-ct">모델명</th>
                <th class="cb-sep">형식</th><th>전력</th><th>전압</th><th>적용 압축기</th><th>회사 상품명</th>
                <th class="cb-num">판매가</th><th class="cb-num">재고</th><th class="cb-num">3년 판매</th></tr>
            </thead>` : `<colgroup><col class="c-code"><col class="c-model"><col class="c-hp"><col class="c-ref"><col class="c-pow"><col class="c-use"><col class="c-evap"><col><col class="c-price"><col class="c-stock"><col class="c-y3"></colgroup>
            <thead>
              <tr class="cb-grp"><th class="cb-ct" colspan="3">회사 코드표</th><th class="cb-sep" colspan="8">회사 품목 · 제조사 자료</th></tr>
              <tr><th class="cb-ct">코드번호</th><th class="cb-ct">모델명</th><th class="cb-ct">마력</th>
                <th class="cb-sep">냉매</th><th>전원</th><th>용도</th><th>증발온도</th><th>회사 상품명</th>
                <th class="cb-num">판매가</th><th class="cb-num">재고</th><th class="cb-num">3년 판매</th></tr>
            </thead>`}
          </table></div>
        </div>
      </div>
      <div class="cb-panel${V.tab === "naming" ? " on" : ""}" id="cb-p-naming"></div>
      <div class="cb-panel${V.tab === "checks" ? " on" : ""}" id="cb-p-checks"></div>
    </div>`;
    const $ = (s) => host.querySelector(s);
    const tbl = $("#cb-tbl");

    // ── 표: 계열 소제목 → 신규 코드 있는 줄 먼저, 「코드 없음」 줄 나중
    const heads = {};
    D.series.forEach((S) => {
      const g = D.codes.filter((c) => c.series === S.key);
      const hb = document.createElement("tbody"); hb.className = "cb-sh";
      hb.innerHTML = `<tr><th colspan="${NC}">${esc(S.label)}<span class="cb-hn">${g.length}</span></th></tr>`;
      heads[S.key] = hb; tbl.appendChild(hb);
      [...g.filter((c) => c.code), ...g.filter((c) => !c.code)].forEach(drawCode);
    });
    function drawHeater(c) {
      const tb = document.createElement("tbody"); tb.className = "cb-cr"; c.el = tb;
      const n = Math.max(1, c.items.length);
      const left = `
        <td class="cb-ct cb-code" rowspan="${n}">${c.code ? esc(c.code) : '<span class="cb-pill gray">코드 없음</span>'}</td>
        <td class="cb-ct" rowspan="${n}">${esc(c.model)}</td>`;
      const tipCell = (o, f, shown, dotOn) => shown ? `<span class="cb-tipv" data-tip="${tipId(valsTip(o.spec[f] || [], f))}">${shown}</span>${dotOn ? '<span class="cb-dot"></span>' : ""}` : blank;
      const cells = (o, fade) => {
        const vt = (o.spec || {})["전압 최저(V)"] ? "전압 최저(V)" : "전압 구간";
        return `<td class="cb-sep${fade ? " cb-fade" : ""}">${tipCell(o, "형식", esc(hv(o, "형식")))}</td>
          <td${fade ? ' class="cb-fade"' : ""}>${tipCell(o, "전력(W)", esc(wattOf(o)), numDiffer(o, "전력(W)"))}</td>
          <td${fade ? ' class="cb-fade"' : ""}>${tipCell(o, vt, voltHtml(o), voltConflict(o))}</td>
          <td${fade ? ' class="cb-fade"' : ""}>${tipCell(o, "적용 기종", esc(hv(o, "적용 기종")))}</td>`;
      };
      const pl0 = (c.plist || [])[0];
      tb.innerHTML = c.items.length ? c.items.map((it, i) => {
        const st = it.stock || {}, badge = it.status === "후보" ? '<span class="cb-pill amber">연결 후보</span>' : "";
        return `<tr class="cb-it" data-i="${i}">${i === 0 ? left : ""}${cells(it)}
          <td>${badge}${esc(it.name)}</td>
          <td class="cb-num">${won(it.price) || blank}</td>
          <td class="cb-num">${st.total ? won(st.total) : blank}</td>
          <td class="cb-num">${it.sales && it.sales.y3 ? won(it.sales.y3) : blank}</td></tr>`;
      }).join("") : `<tr class="cb-it" data-i="-1">${left}${cells(c, true)}
          <td class="cb-fade">회사 품목 없음</td>
          <td class="cb-num cb-fade">${pl0 ? won(pl0.price) : ""}</td>
          <td class="cb-num">${blank}</td><td class="cb-num">${blank}</td></tr>`;
      tbl.appendChild(tb);
    }
    function drawCode(c) {
      if (HT) return drawHeater(c);
      const tb = document.createElement("tbody"); tb.className = "cb-cr"; c.el = tb;
      const n = Math.max(1, c.items.length), it0 = c.items[0];
      const hpCell = it0 && hpDiffer(it0) ? `<span data-tip="${tipId(valsTip(it0.spec["마력"], "마력"))}">${esc(c.hp)}<span class="cb-dot"></span></span>` : esc(c.hp);
      const left = `
        <td class="cb-ct cb-code" rowspan="${n}">${c.code ? esc(c.code) : '<span class="cb-pill gray">코드 없음</span>'}</td>
        <td class="cb-ct" rowspan="${n}" title="${esc(c.model)}">${esc(c.model)}</td>
        <td class="cb-ct" rowspan="${n}">${hpCell}</td>`;
      const pl0 = (c.plist || [])[0];
      tb.innerHTML = c.items.length ? c.items.map((it, i) => {
        const st = it.stock || {}, use = useOf(it), rl = refsOf(c, it).map((r) => r.v);
        const ref = esc(rl.length > 4 ? `${rl.slice(0, 3).join("·")} 외 ${rl.length - 3}` : rl.join("·"));   // 목록 칸은 짧게 — 전부는 툴팁·상세
        const refCell = ref ? `<span class="cb-tipv" data-tip="${tipId(valsTip(refsOf(c, it), "냉매"))}">${wbr(ref)}</span>${refDiffer(it) ? '<span class="cb-dot"></span>' : ""}` : blank;
        const useCell = use.length ? (useSets(it).length > 1 ? `<span data-tip="${tipId(valsTip(it.spec["용도"], "용도"))}">${wbr(esc(use.join("·")))}<span class="cb-dot"></span></span>` : wbr(esc(use.join("·")))) : blank;
        const badge = it.status === "후보" ? '<span class="cb-pill amber">연결 후보</span>' : "";
        return `<tr class="cb-it" data-i="${i}">${i === 0 ? left : ""}
          <td class="cb-sep">${refCell}</td>
          <td>${esc(powerOf(it)) || blank}</td>
          <td>${useCell}</td>
          <td>${evapOf(it) || blank}</td>
          <td title="${esc(it.name)}">${badge}${esc(it.name)}</td>
          <td class="cb-num">${won(it.price) || blank}</td>
          <td class="cb-num">${st.total ? won(st.total) : blank}</td>
          <td class="cb-num">${it.sales && it.sales.y3 ? won(it.sales.y3) : blank}</td></tr>`;
      }).join("") : `<tr class="cb-it" data-i="-1">${left}
          <td class="cb-sep cb-fade">${refText(c, null) ? `<span class="cb-tipv" data-tip="${tipId(valsTip(refsOf(c, null), "냉매"))}">${esc(refText(c, null))}</span>` : "–"}</td>
          <td class="cb-fade">${pl0 && /\d{3}V/.test(pl0.note) ? esc(pl0.note.match(/\d{3}(?:\/\d{3})?V/)[0]) : "–"}</td>
          <td>${blank}</td><td>${blank}</td>
          <td class="cb-fade">회사 품목 없음</td>
          <td class="cb-num cb-fade">${pl0 ? won(pl0.price) : ""}</td>
          <td class="cb-num">${blank}</td><td class="cb-num">${blank}</td></tr>`;
      tbl.appendChild(tb);
    }

    // ── 거르기
    function apply(keepOpen) {
      D.codes.forEach((c) => {
        let ok = true;
        if (F.series && c.series !== F.series) ok = false;
        if (F.ref && !c.refList.includes(F.ref)) ok = false;
        if (F.volt && !c.volts.includes(F.volt)) ok = false;
        if (F.use && !c.uses.includes(F.use)) ok = false;
        if (F.nc === "있음" && !c.code) ok = false;
        if (F.nc === "없음" && c.code) ok = false;
        if (F.has === "있음" && !c.hasItem) ok = false;
        if (F.has === "없음" && c.hasItem) ok = false;
        const q = F.q.trim().toUpperCase();
        if (q && !c.text.includes(q.replace(/\s/g, "")) && !c.text.includes(q)) ok = false;
        c.el.style.display = ok ? "" : "none";
      });
      Object.entries(heads).forEach(([s, hb]) => { hb.style.display = D.codes.some((c) => c.series === s && c.el.style.display !== "none") ? "" : "none"; });
      if (!keepOpen) closeRow();
    }

    // ── 줄 펼치기
    let openRow = null;
    function closeRow() { if (openRow) { openRow.det.remove(); openRow.tb.classList.remove("open"); openRow = null; } V.open = null; }
    function toggle(c, it, tr) {
      const same = openRow && openRow.tr === tr;
      closeRow(); hideTip();
      if (same) return;
      const det = document.createElement("tr");
      det.innerHTML = `<td class="cb-detail" colspan="${NC}">${detail(c, it)}</td>`;
      tr.after(det); c.el.classList.add("open");
      openRow = { tr, det, tb: c.el };
      V.open = { key: c.code || (c.items[0] && c.items[0].old), i: +tr.dataset.i };
    }

    // ── 상세(세 칸: 회사 품목·가격·재고판매 / 사양 / 짝 부품, 성능 측정이 있으면 아래 증발 × 응축 표)
    const SPEC_ROWS = [
      ["제조사 형식명", ["제조사 형식명"]], ["마력", ["마력"]], ["냉매", ["냉매"], "refs"],
      ["전원", ["전원", "상", "전원 종류"], "power"], ["전압", ["전압 최저(V)", "전압 최고(V)", "전압 구간"], "range", "V"],
      ["주파수", ["주파수(Hz)"], "unit", "Hz"], ["압축 방식", ["압축 방식"]], ["단수", ["단수"]], ["실린더 수", ["실린더 수"]],
      ["배제량 60Hz", ["배제량 60Hz(m³/h)"], "unit", " m³/h"], ["배제량 50Hz", ["배제량 50Hz(m³/h)"], "unit", " m³/h"], ["기동 방식", ["기동 방식"]],
      ["용량 제어", ["용량 제어"]], ["중간 냉각", ["중간 냉각"]], ["용도", ["용도"]],
      ["증발온도", ["사용온도 최저(℃)", "사용온도 최고(℃)"], "range", "℃"], ["접속", ["접속"]], ["관경", ["관경(인치)"], "unit", "″"],
      ["흡입 관경", ["흡입 관경"]], ["토출 관경", ["토출 관경"]], ["오일", ["오일"]], ["오일량", ["오일량(L)"], "unit", " L"], ["냉동능력", ["냉동능력(kW)"], "unit", " kW"],
    ];
    const HEATER_ROWS = [
      ["메이커 품번", ["메이커 품번"]], ["형식", ["형식"]], ["전력", ["전력(W)"], "unit", "W"],
      ["전압", ["전압 최저(V)", "전압 최고(V)", "전압 구간"], "range", "V"], ["주파수", ["주파수(Hz)"], "unit", "Hz"], ["상", ["상"]],
      ["적용 압축기", ["적용 기종"]], ["치수", ["치수"]], ["접속", ["접속"]],
    ];
    function specRows(it) {
      let h = "";
      (HT ? HEATER_ROWS : SPEC_ROWS).forEach(([label, fields, kind, unit]) => {
        const have = fields.filter((f) => it.spec[f] && it.spec[f].length);
        if (!have.length) return;
        if (kind === "refs") { h += `<div>냉매</div><div><span class="cb-tipv" data-tip="${tipId(valsTip(it.refs || []))}">${esc((it.refs || []).map((r) => r.v).join(" · "))}</span>${refDiffer(it) ? '<span class="cb-dot"></span>' : ""}</div>`; return; }
        let shown;
        if (kind === "power") shown = powerOf(it) || firstVal(it, have[0]);
        else if (kind === "range") {
          const lo = strip(firstVal(it, fields[0])), hi = strip(firstVal(it, fields[1]));
          shown = lo && hi && lo === hi ? `${lo}${unit}` : lo || hi ? { html: rangeHtml(lo, hi, unit) } : firstVal(it, fields[2] || "");
        }
        else if (kind === "unit") shown = `${strip(firstVal(it, fields[0]))}${unit}`;
        else shown = firstVal(it, fields[0]);
        // 빨간 점 = 자료끼리 값이 실제로 갈릴 때만(마력 1/2 = 0.5 는 같음, 용도는 저온·중온·고온으로 바꾼 뒤 비교)
        const differ = label === "마력" ? hpDiffer(it) : label === "용도" ? useSets(it).length > 1
          : HT ? (label === "전력" ? numDiffer(it, "전력(W)") : label === "전압" ? voltConflict(it) : false)   // 히터 글 칸(형식·적용 압축기)은 표현 차라 점 없음
          : have.some((f) => it.spec[f].length > 1);
        const tip = have.map((f) => valsTip(it.spec[f], have.length > 1 || f !== label ? f : "")).join("");
        h += `<div>${esc(label)}</div><div><span class="cb-tipv" data-tip="${tipId(tip)}">${shown && shown.html ? shown.html : esc(shown)}</span>${differ ? '<span class="cb-dot"></span>' : ""}</div>`;
      });
      return h;
    }
    const plName = (p) => `${p.list}${p.tag ? ` ${p.tag}` : ""}${p.qual ? ` · ${p.qual}` : ""}`;
    const plTip = (p) => tipId(`<div class="cb-ts">${esc(`${p.list} p.${p.page}`)}</div>${p.model ? `<div class="cb-q">가격표 표기 ${esc(p.model)}</div>` : ""}${p.note ? `<div class="cb-q">${esc(p.note)}</div>` : ""}`);
    const plRows = (c) => (c.plist || []).map((p) => `<div><span class="cb-tipv" data-tip="${plTip(p)}">${esc(plName(p))}</span></div><div class="cb-r">${won(p.price)}</div>`).join("");
    function detail(c, it) {
      let L = "";
      if (it) {
        const st = it.stock || {}, sa = it.sales || {};
        const link = it.status === "연결" ? "연결" : it.status === "코드 없음" ? '<span class="cb-pill gray">신규 코드 없음</span>' : `<span class="cb-pill amber">연결 후보</span>${it.ckind ? `<span class="cb-fade">${esc(it.ckind)}</span>` : ""}`;
        const mk = it.maker && it.maker !== D.maker ? `${esc(D.maker)} <span class="cb-fade">· 마스터 「${esc(it.maker)}」</span>` : esc(D.maker);
        const eol = it.eol ? `<span class="cb-tipv" data-tip="${tipId(srcLine({ l: it.eol.src, c: it.eol.conf }))}">${esc(it.eol.state)}</span>` : blank;
        L += `<h3>회사 품목</h3><div class="cb-rows">
          <div>구 코드번호</div><div>${esc(it.old)}</div>
          <div>상품명</div><div>${esc(it.name)}</div>
          <div>회사 분류</div><div>${esc(it.cls) || blank}</div>
          <div>메이커</div><div>${mk}</div>
          <div>코드 연결</div><div>${link}</div>
          <div>앱 표시</div><div>${esc(it.avail) || blank}</div>
          <div>제조사 상태</div><div>${eol}</div></div>`;
        L += `<h3>가격</h3><div class="cb-rows">
          <div>회사 판매가</div><div class="cb-r">${won(it.price) || blank}</div>
          ${plRows(c)}
          ${c.rauction ? `<div>알옥션</div><div class="cb-r">${won(c.rauction)}</div>` : ""}</div>`;
        const stockTip = st.total != null ? tipId(`<div class="cb-tf">창고별</div><div class="cb-ts">부산 ${st["부산"] ?? 0} · 김해 ${st["김해"] ?? 0} · 대산 ${st["대산"] ?? 0}</div><div class="cb-ts">매출표 재고 ${st["매출표"] ?? "–"}</div>`) : null;
        L += `<h3>재고 · 판매</h3><div class="cb-rows">
          <div>실재고</div><div class="cb-r">${st.total != null ? `<span class="cb-tipv" data-tip="${stockTip}">${won(st.total)}</span>` : blank}</div>
          <div>매출수량</div><div class="cb-r">${sa.recent != null ? won(sa.recent) : blank}</div>
          <div>3년 매출</div><div class="cb-r">${sa.y3 != null ? (sa.avg3 != null ? `<span class="cb-tipv" data-tip="${tipId(`<div class="cb-ts">연평균 ${esc(sa.avg3)}</div>`)}">${won(sa.y3)}</span>` : won(sa.y3)) : blank}</div></div>`;
      } else {
        L += `<h3>회사 품목</h3><p class="cb-empty">없음</p>`;
        if ((c.plist || []).length) L += `<h3>가격</h3><div class="cb-rows">${plRows(c)}</div>`;
      }
      (c.notes || []).forEach((n) => { L += `<div class="cb-note"><b>${esc(n.t)}</b>${esc(n.s)}</div>`; });

      let M = "<h3>사양</h3>";
      const pl0 = (c.plist || [])[0];
      if (it && Object.keys(it.spec).length) M += `<div class="cb-rows">${specRows(it)}</div>`;
      else if (HT && c.spec && Object.keys(c.spec).length) M += `<div class="cb-rows">${specRows(c)}</div>`;
      else if (pl0) {
        const t = plTip(pl0);
        const pw = (pl0.note.match(/\d{3}(?:\/\d{3})?\s?V(?:\s?\d?\s?(?:1PH|3PH|PH|상))?/i) || [""])[0];
        M += `<div class="cb-rows"><div>마력</div><div><span class="cb-tipv" data-tip="${t}">${esc(c.hp)}</span></div>${refText(c, null) ? `<div>냉매</div><div><span class="cb-tipv" data-tip="${tipId(valsTip(refsOf(c, null)))}">${esc(refText(c, null))}</span></div>` : ""}${pw ? `<div>전원</div><div><span class="cb-tipv" data-tip="${t}">${esc(pw)}</span></div>` : ""}</div><p class="cb-empty" style="margin-top:10px">제조사 자료 미수집</p>`;
      } else M += '<p class="cb-empty">없음</p>';

      let R = "<h3>짝 부품</h3>";
      if (it && it.sets && it.sets.length) {
        R += `<div class="cb-sets">${it.sets.map((s) => {
          const t = tipId(`${s.cond ? `<div class="cb-tf">맞추는 조건</div><div class="cb-ts">${esc(s.cond)}</div>` : ""}<div class="cb-tf">출처</div>${srcLine({ l: s.src, u: s.u, c: s.conf })}`);
          return `<div class="cb-set"><span class="cb-pill ${s.rel === "꼭 필요" ? "blue" : "gray"}">${esc(s.rel)}</span><span class="cb-tipv" data-tip="${t}">${esc(s.desc)}</span></div>`;
        }).join("")}</div>`;
      } else R += '<p class="cb-empty">없음</p>';

      // 성능 측정(60Hz) — 냉매마다 표 하나, 여럿이면 칩으로 고른다. 점 = [증발, 응축, 냉동능력 W, 전력 W, 전류 A, 질량유량 kg/h]
      let P = "";
      const perfs = c.perf || [];
      if (perfs.length) {
        const sub = (x) => [x[3] != null ? `${won(Math.round(x[3]))}W` : "", x[4] != null ? `${esc(x[4])}A` : ""].filter(Boolean).join(" · ");
        const one = (p, i) => {
          const head = `<span class="cb-tipv" data-tip="${tipId(srcLine(p.src))}">${esc(p.title)}</span>`;
          let body;
          if (p.mode === "list") {
            body = `<table><tr><th>증발</th><th>응축</th><th>냉동능력 W</th><th>전력 W</th><th>전류 A</th></tr>${p.pts.map((x) => `<tr><td>${x[0]}℃</td><td>${x[1]}℃</td><td>${won(Math.round(x[2]))}</td><td>${x[3] != null ? won(Math.round(x[3])) : "–"}</td><td>${x[4] ?? "–"}</td></tr>`).join("")}</table>`;
          } else {
            const tes = [...new Set(p.pts.map((x) => x[0]))].sort((a, b) => a - b), tcs = [...new Set(p.pts.map((x) => x[1]))].sort((a, b) => a - b);
            const cell = (te, tc) => { const x = p.pts.find((q) => q[0] === te && q[1] === tc); return x ? `${won(Math.round(x[2]))}<small>${sub(x)}</small>` : '<span class="cb-fade">–</span>'; };
            body = `<table><tr><th>증발 \\ 응축</th>${tcs.map((t) => `<th>${t}℃</th>`).join("")}</tr>${tes.map((te) => `<tr><td>${te}℃</td>${tcs.map((tc) => `<td>${cell(te, tc)}</td>`).join("")}</tr>`).join("")}</table>`;
          }
          return `<div class="cb-pf" data-pf="${i}"${i ? " hidden" : ""}><h3>${head}</h3>${body}</div>`;
        };
        const refs = perfs.map((p) => p.ref);
        const chips = perfs.length > 1 ? `<div class="cb-pchips">${perfs.map((p, i) => `<button type="button" class="cb-chip cb-pchip${i ? "" : " on"}" data-pfi="${i}">${esc(p.ref)}${refs.filter((r) => r === p.ref).length > 1 ? ` · ${esc(p.who)}` : ""}</button>`).join("")}</div>` : "";
        P = `<div class="cb-perf">${chips}${perfs.map(one).join("")}</div>`;
      }
      return `<div class="cb-det"><div>${L}</div><div>${M}</div><div>${R}</div></div>${P}`;
    }

    // ── 모델명 해석(메이커 공식 nomenclature 만)
    const card = (C) => `<div class="cb-card cb-sec"><h2>${esc(C.title)}</h2><table class="cb-list"><tr>${C.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${C.rows.map((r) => `<tr>${r.map((x) => `<td>${rich(x)}</td>`).join("")}</tr>`).join("")}</table>${C.foot ? `<div class="cb-foot">${C.foot.u ? `<a href="${esc(C.foot.u)}" target="_blank" rel="noopener">${esc(C.foot.l)}</a>` : esc(C.foot.l)}</div>` : ""}</div>`;
    $("#cb-p-naming").innerHTML = (D.naming || []).length ? D.naming.map(card).join("") : `<div class="cb-card cb-sec"><p class="cb-empty" style="padding:16px">메이커 공식 모델명 규칙 문서 없음</p></div>`;

    // ── 확인 사항
    (function () {
      const rows = [];
      const fam = D.family || [D.maker];
      D.codes.forEach((c) => {
        const cc = c.code || (c.items[0] ? c.items[0].old : "");
        (c.notes || []).forEach((n) => rows.push([cc, c.model, n.t, n.s]));
        c.items.forEach((it) => {
          if (hpDiffer(it)) rows.push([cc, c.model, "마력", (it.spec["마력"] || []).map((v) => `${v.v} (${srcNames(v)})`).join(" / ")]);
          if (HT && numDiffer(it, "전력(W)")) rows.push([cc, c.model, "전력", (it.spec["전력(W)"] || []).map((v) => `${v.v} (${srcNames(v)})`).join(" / ")]);
          if (HT && voltConflict(it)) rows.push([cc, c.model, "전압", ["전압 최저(V)", "전압 최고(V)"].flatMap((f) => (it.spec[f] || []).map((v) => `${f.slice(3, 5)} ${v.v} (${srcNames(v)})`)).join(" / ")]);
          if (refDiffer(it)) rows.push([cc, c.model, "냉매", (it.spec["냉매"] || []).map((v) => `${v.v} (${srcNames(v)})`).join(" / ")]);
          if (useSets(it).length > 1) rows.push([cc, c.model, "용도", (it.spec["용도"] || []).map((v) => `${v.v} (${srcNames(v)})`).join(" / ")]);
          if (it.maker && !fam.includes(it.maker)) rows.push([cc, c.model, "메이커 표기", `마스터 「${it.maker}」 (${it.old})`]);
          // 공급사 가격표와 가격 차 — 2% 넘게 다를 때만(반올림·끝자리 차는 뺀다)
          if (isNum(it.price)) [...new Set((c.plist || []).map((p) => p.list))].forEach((L) => {
            const ps = c.plist.filter((p) => p.list === L && isNum(p.price));
            if (!ps.length || ps.some((p) => Math.abs(it.price - p.price) / p.price <= 0.02)) return;
            const p = ps.reduce((a, b) => (Math.abs(it.price - a.price) <= Math.abs(it.price - b.price) ? a : b));
            rows.push([cc, c.model, "가격 차", `회사 판매가 ${Number(it.price).toLocaleString("ko-KR")} · ${plName(p)} p.${p.page} ${Number(p.price).toLocaleString("ko-KR")} (${it.price > p.price ? "+" : ""}${Number(it.price - p.price).toLocaleString("ko-KR")}) · ${it.old}`]);
          });
        });
        if (c.code && c.items.length > 1) rows.push([cc, c.model, "코드 1 = 품목 2", c.items.map((i) => `${i.old} ${i.name}`).join(" / ")]);
        if (!c.code) rows.push([cc, c.model, "신규 코드 없음", `${c.items[0].name} · 판매가 ${isNum(c.items[0].price) ? Number(c.items[0].price).toLocaleString("ko-KR") : c.items[0].price}`]);
        if (c.items.some((i) => i.status === "후보")) rows.push([cc, c.model, "연결 후보", c.items.filter((i) => i.status === "후보").map((i) => `${i.old} ${i.name}`).join(" / ")]);
      });
      const seen = new Set();
      for (let i = rows.length - 1; i >= 0; i--) { const k = rows[i].join("|"); if (seen.has(k)) rows.splice(i, 1); else seen.add(k); }
      $("#cb-ncheck").textContent = rows.length;
      const amber = new Set(["연결 후보", "신규 코드 없음"]);
      let h = `<div class="cb-card cb-sec"><table class="cb-list"><tr><th style="width:110px">코드번호</th><th style="width:160px">모델명</th><th style="width:130px">항목</th><th>내용</th></tr>${
        rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td><span class="cb-pill ${amber.has(r[2]) ? "amber" : "red"}">${esc(r[2])}</span></td><td>${esc(r[3])}</td></tr>`).join("")}</table></div>`;
      if ((D.asks || []).length) {
        h += `<div class="cb-card cb-sec"><h2>회사 확인 질문</h2><table class="cb-list"><tr><th>질문</th><th style="width:40%">배경</th></tr>${
          D.asks.map((a) => `<tr><td>${esc(a.q)}<div class="cb-subt">${esc(a.items)}</div></td><td class="cb-subt">${esc(a.bg)}</td></tr>`).join("")}</table></div>`;
      }
      $("#cb-p-checks").innerHTML = h;
    })();

    // ── 손
    host.onclick = (e) => {
      const tab = e.target.closest("[data-cbtab]");
      if (tab) {
        V.tab = tab.dataset.cbtab;
        host.querySelectorAll("[data-cbtab]").forEach((x) => x.classList.toggle("on", x === tab));
        host.querySelectorAll(".cb-panel").forEach((p) => p.classList.toggle("on", p.id === `cb-p-${V.tab}`));
        $("#cb-q").hidden = V.tab !== "items";
        hideTip(); return;
      }
      const chip = e.target.closest(".cb-chip");
      if (chip) {
        const k = chip.dataset.k, v = chip.dataset.v; F[k] = F[k] === v ? "" : v;
        host.querySelectorAll(`.cb-chip[data-k="${k}"]`).forEach((x) => x.classList.toggle("on", x.dataset.v === F[k]));
        apply(); return;
      }
      const pfc = e.target.closest(".cb-pchip");
      if (pfc) {
        const box = pfc.closest(".cb-perf");
        box.querySelectorAll(".cb-pchip").forEach((x) => x.classList.toggle("on", x === pfc));
        box.querySelectorAll(".cb-pf").forEach((x) => { x.hidden = x.dataset.pf !== pfc.dataset.pfi; });
        return;
      }
      if (e.target.closest("td.cb-detail")) return;
      const tr = e.target.closest("tr.cb-it");
      if (tr) {
        const c = D.codes.find((x) => x.el === tr.closest("tbody")); if (!c) return;
        const i = +tr.dataset.i; toggle(c, i >= 0 ? c.items[i] : null, tr);
      }
    };
    $("#cb-q").oninput = (e) => { F.q = e.target.value; apply(); };
    apply(true);
    // 다시 그려졌을 때 펼쳐 둔 줄 되살리기
    if (V.open) {
      const c = D.codes.find((x) => (x.code || (x.items[0] && x.items[0].old)) === V.open.key);
      const tr = c && c.el.style.display !== "none" ? c.el.querySelector(`tr.cb-it[data-i="${V.open.i}"]`) : null;
      if (tr) toggle(c, V.open.i >= 0 ? c.items[V.open.i] : null, tr); else V.open = null;
    }
  }
  return { mount };
}
