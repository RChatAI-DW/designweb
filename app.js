// RChatAI 냉동 설계 — 화면. 상태(손님이 정한 칸 값·고른 모델)만 들고 있고, 계산은 전부 서버(상담 엔진)가 한다.
// 모양은 RChatAI 앱 규칙 그대로(app/src/lib/theme.ts·components/tools/Form.tsx·components/chat/ChatScreenV2.tsx):
//   SectionLabel + Card, 왼쪽 라벨·오른쪽 회색 숫자 상자, 알약 칩, 카드 모양 펼침, 잉크 검정 주 버튼, 상담은 답변 무배경·내 말 검정 말풍선.
import { ICONS } from "./icons.js";
import { TIPS, cycleFigure, unitLink, coolerFigure, txvFigure } from "./figures.js";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n, d = 0) => (n == null || !Number.isFinite(Number(n)) ? "-" : Number(n).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const won = (n) => (n == null ? "가격 문의" : `${fmt(n)}원`);
// 마력 — 회사 품목에 표기가 없어 품명 모터 코드로 추정한 값은 「추정」(엔진 hp_guessed, 11/09)
const hpLabel = (x) => (x?.hp == null ? "-마력" : `${x.hp}마력${x.hp_guessed ? "(추정)" : ""}`);
const icon = (n, cls = "") => (ICONS[n] ?? "").replace("<svg ", `<svg class="ic ${cls}" aria-hidden="true" `);

const STAGES = ["load", "comp", "unit", "cooler", "txv"];
const TABS = [
  { id: "parts", nm: "부품 검색" },
  { id: "load", nm: "부하계산" },
  { id: "comp", nm: "압축기" },
  { id: "unit", nm: "유니트" },
  { id: "cooler", nm: "유닛쿨러" },
  { id: "txv", nm: "팽창변" },
];
const fresh = () => ({ load: { in: {} }, comp: { in: {}, pick: null }, unit: { in: {} }, cooler: { in: {}, pick: null }, txv: { in: {}, pick: null } });
const S = {
  fields: null, chatOn: false, state: fresh(), result: null, tab: "load", seq: 0, open: {},
  parts: { q: "", items: [], detail: null, busy: false },
  site: { query: "", places: [], place: null, climate: null, busy: false, err: null },
  chat: [], chatBusy: false, chatGen: 0, lastVals: new Map(),
  att: [],   // 보내기 전 첨부(사진·파일) — [보내기]로 글과 함께 나간다
};

// ───────────────────────── 서버 ─────────────────────────
// 배포본(깃허브 Pages): config.js 의 DW_CFG.api(Supabase 함수 주소)·anon 키로 부르고, 관문 비밀번호를 x-dw-pw 로 싣는다.
// 로컬: DW_CFG 가 비어 있어 같은 주소의 /api 를 부른다(비밀번호 없음).
const CFG = window.DW_CFG || {};
const PW_KEY = "designweb.pw";
let PW = ""; try { PW = localStorage.getItem(PW_KEY) || ""; } catch {}
let pwAsk = null;
function askPw(msg) {
  if (pwAsk) return pwAsk;
  pwAsk = new Promise((done) => {
    const el = document.createElement("div");
    el.className = "gate";
    el.innerHTML = `<form class="gate-card"><div class="f-title">냉동 설계</div><label class="gate-l" for="gate-pw">비밀번호</label>
      <div class="numbox wide"><input id="gate-pw" type="password" autocomplete="current-password" required></div>
      <div class="gate-err">${msg && PW ? esc(msg) : ""}</div><button class="gate-btn" type="submit">들어가기</button></form>`;
    document.body.appendChild(el);
    const input = el.querySelector("input"); input.focus();
    el.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      PW = input.value; try { localStorage.setItem(PW_KEY, PW); } catch {}
      el.remove(); pwAsk = null; done();
    });
  });
  return pwAsk;
}
async function api(path, body) {
  const headers = body ? { "content-type": "application/json" } : {};
  if (CFG.api) {
    if (!PW) await askPw();
    Object.assign(headers, { authorization: `Bearer ${CFG.anon}`, apikey: CFG.anon, "x-dw-pw": encodeURIComponent(PW) });
  }
  const r = await fetch((CFG.api || "") + path, body ? { method: "POST", headers, body: JSON.stringify(body) } : { headers });
  const j = await r.json().catch(() => ({}));
  if (CFG.api && r.status === 401 && j.auth === false) { await askPw(j.error); return api(path, body); }
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { data: j });
  return j;
}
async function compute() {
  const my = ++S.seq;
  setBusy(true);
  let fullDone = false;
  // 빠른 답 — 보고 있는 단계까지만(부하 1ms·압축기 0.1초). 유니트 화면은 어차피 전부 필요해서 생략(대표 11/08 「반응이 느리다」)
  if (STAGES.includes(S.tab) && S.tab !== "unit") {
    api("/api/compute", { state: S.state, upto: S.tab }).then((q) => {
      if (my !== S.seq || fullDone || !S.result) return;
      const next = { ...S.result, errors: { ...(S.result.errors ?? {}), ...(q.errors ?? {}) } };
      for (const k of STAGES) if (k in q) { next[k] = q[k]; if (!q.errors?.[k]) delete next.errors[k]; }
      S.result = next; render();
    }).catch(() => {});
  }
  try {
    const res = await api("/api/compute", { state: S.state });
    fullDone = true;
    if (my !== S.seq) return;
    S.result = res; render();
  } catch (e) { status(`계산하지 못했습니다: ${e.message}`); }
  finally { if (my === S.seq) setBusy(false); }
}
let timer = null;
const computeSoon = () => { clearTimeout(timer); timer = setTimeout(compute, 20); };
function setBusy(b) { $("#status").textContent = b ? "계산 중…" : ""; }
function status(t) { $("#status").textContent = t; }

// ───────────────────────── 칸(Form.tsx 의 Field·ChoiceRow) ─────────────────────────
function fieldHtml(stage, f) {
  const r = S.result?.[stage];
  const v = r?.in?.[f.key];
  const src = r?.src?.[f.key];
  const changed = src === "user";
  const id = `f-${stage}-${f.key}`;
  const shown = v == null ? "" : typeof v === "number" ? String(Math.round(v * 1000) / 1000) : String(v);
  const foot = !changed && src === "link" ? `<div class="sub ok">자동</div>` : "";
  if (f.type === "enum" && f.options.length <= 4) {
    return `<div class="crow"><div>${esc(f.label)}</div><div class="chips segctl" role="radiogroup" aria-label="${esc(f.label)}" data-fk="in.${stage}.${f.key}" data-fv="${esc(shown)}">${f.options.map((o) => `<button type="button" role="radio" aria-checked="${String(v) === o.value}" class="chip ${String(v) === o.value ? "on" : ""}" data-seg="${stage}.${f.key}" data-val="${esc(o.value)}">${esc(o.label)}</button>`).join("")}</div>${foot}</div>`;
  }
  let box;
  if (f.type === "enum") {
    box = `<div class="numbox wide ${changed ? "changed" : ""}" data-fk="in.${stage}.${f.key}" data-fv="${esc(shown)}"><select id="${id}" data-stage="${stage}" data-key="${f.key}">${v == null ? `<option value="">선택</option>` : ""}${f.options.map((o) => `<option value="${esc(o.value)}" ${String(v) === o.value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></div>`;
  } else {
    const isNum = f.type === "num";
    box = `<div class="numbox ${isNum ? "" : "wide"} ${changed ? "changed" : ""}" data-fk="in.${stage}.${f.key}" data-fv="${esc(shown)}"><input id="${id}" ${isNum ? `type="number" inputmode="decimal" step="${f.step ?? "any"}"` : `type="text"`} value="${esc(shown)}" placeholder="${isNum ? "자동" : "선택 입력"}" data-stage="${stage}" data-key="${f.key}">${f.unit ? `<span class="u">${esc(f.unit)}</span>` : ""}</div>`;
  }
  // 슬라이더 — 숫자 칸에 범위가 있으면 라벨 아래에. 끄는 동안 바로 계산(input → liveCompute), 손을 떼면 전체 계산(change)
  const slider = f.type === "num" && f.range
    ? `<input type="range" class="slider ${v == null ? "unset" : ""}" min="${f.range[0]}" max="${f.range[1]}" step="${f.step ?? 1}" value="${v ?? f.range[0]}" data-slide="${stage}.${f.key}" aria-label="${esc(f.label)} 슬라이더" style="--p:${Math.max(0, Math.min(100, ((v ?? f.range[0]) - f.range[0]) / (f.range[1] - f.range[0]) * 100))}%">`
    : "";
  return `<div class="frow"><div class="lb"><label class="t" for="${id}">${esc(f.label)}</label>${foot}</div>${box}${slider}</div>`;   // 슬라이더는 줄 전체 폭(좁은 칸에서도 길게)
}
const fieldsOf = (stage, group) => S.fields[stage].filter((f) => (f.group ?? "main") === group).map((f) => (stage === "load" && f.key === "item" && S.items ? itemField(f) : fieldHtml(stage, f))).join("");

// ── 면별 조건 표(엑셀 13~15행) — 천정·마루·동·서·남·북 × 외벽온도·열전도율·단열두께. 비우면 공통 값에서 자동 ──
const FACES = [["ceil", "천정"], ["floor", "마루"], ["east", "동"], ["west", "서"], ["south", "남"], ["north", "북"]];
function faceTable() {
  const r = S.result?.load; if (!r) return "";
  const cell = (key, step) => {
    const v = r.in?.[key], user = r.src?.[key] === "user";
    return `<td><div class="numbox mini ${user ? "changed" : "auto"}" data-fk="in.load.${key}" data-fv="${esc(v ?? "")}"><input id="f-load-${key}" type="number" inputmode="decimal" step="${step}" value="${esc(v ?? "")}" data-stage="load" data-key="${key}" aria-label="${esc(S.fields.load.find((f) => f.key === key)?.label ?? key)}"></div></td>`;
  };
  return `<table class="facetbl"><thead><tr><th></th><th>외벽온도<small>℃</small></th><th>열전도율<small>kcal/m·h·℃</small></th><th>단열두께<small>mm</small></th></tr></thead><tbody>
    ${FACES.map(([id, nm]) => `<tr><th>${nm}</th>${cell(`wallC_${id}`, 1)}${cell(`k_${id}`, 0.001)}${cell(`mm_${id}`, 25)}</tr>`).join("")}</tbody></table>`;
}

// ── 보관 품목 버튼 — 1단 범주, 채소·과일은 2단 품목(서버 itemMenu 가 엔진 matchItem 으로 어느 표 값인지 붙여 준다) ──
function itemField(f) {
  const r = S.result?.load, v = String(r?.in?.item ?? "").trim(), M = S.items;
  const cat = M.cats.find((c) => c.send === v || c.items?.some((i) => i.send === v)) ?? null;
  const other = !cat && (v !== "" || S.itemOther);
  const sub = cat?.items?.find((i) => i.send === v) ?? null;
  const chip = (label, attr, on) => `<button type="button" class="chip ${on ? "on" : ""}" ${attr}>${esc(label)}</button>`;
  let html = `<div class="crow"><div>${esc(f.label)}</div><div class="chips" data-fk="in.load.item" data-fv="${esc(v)}">`
    + M.cats.map((c) => chip(c.label, `data-item="${esc(c.send)}"`, cat === c)).join("")
    + chip("기타", `data-item-other="1"`, other) + `</div>`;
  if (cat?.items) html += `<div class="chips sub2">${cat.items.map((i) => chip(i.label, `data-item="${esc(i.send)}"`, sub === i)).join("")}</div>`;
  if (other) html += `<div class="numbox wide" style="margin-top:6px"><input id="f-load-item" type="text" value="${esc(v)}" placeholder="품목명 입력" data-stage="load" data-key="item"></div>`;
  // 안내 한 줄 — 어느 표 값으로 계산했는지
  const it = r?.out?.item, band = r?.out?.band;
  let info = "";
  if (v && it) {
    if (!it.key) info = "호흡열 0";
    else {
      const sel = sub ?? cat; const tname = sel?.table ?? it.key;
      const vals = (M.resp[tname] ?? []).map(([t, q]) => `${t}℃ ${fmt(q)}`).join(" · ");
      info = band && band !== "냉장" ? "호흡열 0 (냉동)" : `호흡열 ${esc(tname)}${vals ? ` ${vals} kcal/24h·톤` : ""}`;
    }
  } else if (v && !it) info = "호흡열 0 (표에 없음)";
  return html + (info ? `<div class="sub">${info}</div>` : "") + `</div>`;
}
const sl = (t) => `<div class="sl">${t}</div>`;
const card = (inner, cls = "") => `<div class="card ${cls}">${inner}</div>`;
const fk = (k, v) => `data-fk="${k}" data-fv="${esc(v)}"`;
const rrow = (k, v, strong, key) => `<div class="rrow"><div class="k">${k}</div><div class="v ${strong ? "strong" : ""}" ${key ? fk(key, v) : ""}>${v}</div></div>`;
const note = (t, tone = "") => `<div class="note ${tone}">${icon(tone ? "alert-circle-outline" : "information-circle-outline")}<div>${t}</div></div>`;
function exp(key, title, inner) {
  return `<details class="exp" data-more="${key}" ${S.open[key] ? "open" : ""}><summary><span class="grow">${title}</span>${icon("chevron-down", "chev")}</summary><div class="in">${inner}</div></details>`;
}
const hero = (k, v, unit, s, key) => `<div class="hero"><div class="k">${k}</div><div class="v" ${fk(key, v)}>${v}${unit ? `<small>${unit}</small>` : ""}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
const selCell = (stage, model, on) => on ? `<span class="selmark">${icon("checkmark")}선택됨</span>` : `<button class="selbtn" data-pick="${stage}" data-model="${esc(model)}">선택</button>`;

function setField(stage, key, raw, live = false) {
  // 다른 탭의 같은 값이면 정본 칸에 저장(대표 11/09) — 화면에 보이는 이 칸도 바로 따라 바뀌게 먼저 고쳐 둔다
  const sf = S.fields[stage]?.find((x) => x.key === key);
  if (sf?.same) {
    const [cs, ck] = sf.same.split(".");
    const R0 = S.result?.[stage]; if (R0?.in) { R0.in[key] = raw === "" || raw == null ? null : sf.type === "num" ? Number(raw) : raw; R0.src = { ...(R0.src ?? {}), [key]: raw === "" ? "link" : "user" }; }
    let v = raw;
    if (raw !== "" && raw != null && sf.fold === "td") v = String(Math.round((Number(S.result?.load?.in?.roomC ?? -20) - Number(raw)) * 10) / 10);
    if (raw !== "" && raw != null && sf.fold === "kcal") v = String(Math.round(Number(raw) / 860 * 10000) / 10000);
    if (S.state[stage]?.in) delete S.state[stage].in[key];
    return setField(cs, ck, v, live);
  }
  const st = S.state[stage] ??= { in: {} }; st.in ??= {};
  if (raw === "" || raw == null) delete st.in[key]; else st.in[key] = raw;
  if (stage === "load" && key === "pyeong" && raw !== "") { delete st.in.w; delete st.in.d; }
  if (stage === "load" && (key === "w" || key === "d") && raw !== "") delete st.in.pyeong;
  // 앞 단계 조건이 바뀌면 그 단계부터 고른 모델을 풀어 준다(새 조건의 첫 후보로)
  for (const s of STAGES.slice(STAGES.indexOf(stage))) if (S.state[s]) S.state[s].pick = null;
  const R = S.result?.[stage];
  if (R?.in) {
    const f = S.fields[stage].find((x) => x.key === key);
    R.in[key] = raw === "" || raw == null ? null : f?.type === "num" ? Number(raw) : raw;
    R.src = { ...(R.src ?? {}), [key]: raw === "" || raw == null ? "default" : "user" };
    if (!live) render();
  }
  if (live) liveCompute(); else computeSoon();
}
// 끄는·치는 중(대표 11/09 「손 떼거나 엔터 안 눌러도 바로바로」) — 보이는 화면 단계까지만 계산해 결과·시각화만 다시 그린다.
//   입력 칸(가운데)은 그대로 둔다(다시 그리면 끌던 슬라이더·치던 칸이 끊긴다). 손을 떼면(change) 전체 계산·전체 다시 그림.
//   계산이 도는 중에 값이 또 바뀌면 끝나자마자 마지막 값으로 한 번 더 — 요청이 쌓이지 않는다.
async function liveCompute() {
  S.holdMain = true;
  if (S.liveBusy) { S.livePending = true; return; }
  S.liveBusy = true;
  try {
    do {
      S.livePending = false;
      const my = ++S.seq, upto = STAGES.includes(S.tab) && S.tab !== "unit" ? S.tab : undefined;
      try {
        const q = await api("/api/compute", { state: S.state, upto });
        if (my !== S.seq || !S.result || !S.holdMain) continue;
        if (!upto) S.result = q;
        else { const next = { ...S.result, errors: { ...(S.result.errors ?? {}), ...(q.errors ?? {}) } }; for (const k of STAGES) if (k in q) { next[k] = q[k]; if (!q.errors?.[k]) delete next.errors[k]; } S.result = next; }
        render();
      } catch {}
    } while (S.livePending && S.holdMain);   // 손을 뗐으면 전체 계산(change)에 맡긴다
  } finally { S.liveBusy = false; }
}
function pick(stage, model) { S.state[stage].pick = model; for (const s of STAGES.slice(STAGES.indexOf(stage) + 1)) if (S.state[s]) S.state[s].pick = null; computeSoon(); }

// ───────────────────────── 위쪽(Segmented + 설계 요약 한 줄) ─────────────────────────
function formLabel(f) { return ({ rc_일체형: "R/C 일체형", 수액기형: "수액기형", 응축기형: "응축기형", 칠링_공냉: "칠링 공냉", 칠링_수냉: "칠링 수냉" })[f] ?? f; }
function stepVal(id) {
  const R = S.result; if (!R?.load) return "";
  const C = R.comp?.out, U = R.unit?.out, K = R.cooler?.out, T = R.txv?.out;
  if (id === "load") return `${fmt(R.load.out.총냉각열량Kw, 1)} kW`;
  if (id === "comp") return C?.chosen ? C.chosen.product_id : "없음";
  if (id === "unit") return U?.draft ? `${U.draft.hp}마력` : "없음";
  if (id === "cooler") return K?.chosen ? `${K.chosen.model} ${K.count}대` : "없음";
  if (id === "txv") return T?.chosen ? T.chosen.model : "없음";
  return "";
}
function topBar() {
  return `<div class="stick"><div class="seg" role="tablist">${TABS.map((t) => `<button role="tab" class="${S.tab === t.id ? "on" : ""}" data-tab="${t.id}">${t.nm}</button>`).join("")}</div></div>`;   // 「지금 설계 …」 줄은 걷음(대표 11/10 「없어도 될 것 같아」) — 채팅 답 아래 요약(chainSummary)은 그대로
}
function navrow(prev, next) {
  const nm = (id) => TABS.find((t) => t.id === id).nm;
  return `<div class="navrow">${prev ? `<button class="btn secondary" data-tab="${prev}">${icon("chevron-back")}${nm(prev)}</button>` : ""}${next ? `<button class="btn" data-tab="${next}">다음 — ${nm(next)}</button>` : ""}</div>`;
}
const errBox = (k) => S.result?.errors?.[k] ? note(`계산하지 못했습니다: ${esc(S.result.errors[k])}`, "bad") : "";

// ───────────────────────── 그래프 ─────────────────────────
function scale(d0, d1, r0, r1) { return (v) => r0 + (v - d0) / (d1 - d0 || 1) * (r1 - r0); }
function ticks(a, b, n = 6) { const step = niceStep((b - a) / n); const out = []; for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(Math.round(v * 100) / 100); return out; }
function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x || 1))); const m = x / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; }
function axes(W, H, P, xs, ys, xd, yd, xl, yl) {
  const g = [`<g class="grid">`];
  for (const t of ticks(xd[0], xd[1])) g.push(`<line x1="${xs(t)}" x2="${xs(t)}" y1="${P.t}" y2="${H - P.b}"/><text x="${xs(t)}" y="${H - P.b + 16}" text-anchor="middle">${t}</text>`);
  for (const t of ticks(yd[0], yd[1], 5)) g.push(`<line x1="${P.l}" x2="${W - P.r}" y1="${ys(t)}" y2="${ys(t)}"/><text x="${P.l - 6}" y="${ys(t) + 4}" text-anchor="end">${t}</text>`);
  g.push(`</g><text x="${(P.l + W - P.r) / 2}" y="${H - 4}" text-anchor="middle">${xl}</text><text x="12" y="${(P.t + H - P.b) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(P.t + H - P.b) / 2})">${yl}</text>`);
  return g.join("");
}
function envelopeSvg(env, te, tc, W = 600) {
  if (!env?.rows?.length) return `<div class="empty">운전 범위 자료 없음</div>`;
  const H = 260, P = { l: 46, r: 12, t: 12, b: 36 };
  const rows = [...env.rows].sort((a, b) => a[0] - b[0]);
  const xd = [Math.min(...rows.map((r) => r[1]), te) - 5, Math.max(...rows.map((r) => r[2]), te) + 5];
  const yd = [Math.min(...rows.map((r) => r[0]), tc) - 5, Math.max(...rows.map((r) => r[0]), tc) + 5];
  const xs = scale(xd[0], xd[1], P.l, W - P.r), ys = scale(yd[0], yd[1], H - P.b, P.t);
  const poly = [...rows.map((r) => [r[1], r[0]]), ...rows.slice().reverse().map((r) => [r[2], r[0]])].map(([x, y]) => `${xs(x)},${ys(y)}`).join(" ");
  // 응축온도 열 사이는 선형으로 — 그 응축온도에서의 증발온도 범위 안이면 안
  const at = (() => { for (let i = 0; i < rows.length; i++) { if (rows[i][0] === tc) return rows[i]; if (i && rows[i - 1][0] < tc && tc < rows[i][0]) { const a = rows[i - 1], b = rows[i], f = (tc - a[0]) / (b[0] - a[0]); return [tc, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; } } return null; })();
  const inside = at != null && te >= at[1] - 1e-9 && te <= at[2] + 1e-9;
  const col = inside ? "#191F28" : "#F04452";
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${axes(W, H, P, xs, ys, xd, yd, "증발온도 ℃", "응축온도 ℃")}
    <polygon points="${poly}" fill="#F2F4F6" stroke="#8B95A1" stroke-width="1.5"/>
    <circle cx="${xs(te)}" cy="${ys(tc)}" r="6" fill="${col}"/>
    <text x="${xs(te) + 10}" y="${ys(tc) - 8}" style="fill:${col};font-weight:600">운전점 ${te}/${tc}℃${inside ? "" : " (범위 밖)"}</text></svg>`;
}
function curveSvg(curve, reqKw, te, chosenKw, W = 600) {
  if (!curve?.length) return `<div class="empty">능력 곡선 자료 없음</div>`;
  const H = 260, P = { l: 46, r: 12, t: 12, b: 36 };
  const xd = [curve[0].te, curve[curve.length - 1].te];
  const yMax = Math.max(...curve.map((p) => p.kw), reqKw ?? 0) * 1.1;
  const xs = scale(xd[0], xd[1], P.l, W - P.r), ys = scale(0, yMax, H - P.b, P.t);
  const path = curve.map((p, i) => `${i ? "L" : "M"}${xs(p.te)},${ys(p.kw)}`).join("");
  const inX = te >= xd[0] && te <= xd[1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${axes(W, H, P, xs, ys, xd, [0, yMax], "증발온도 ℃", "냉동능력 kW")}
    <path d="${path}" fill="none" stroke="#191F28" stroke-width="2"/>
    ${reqKw ? `<line x1="${P.l}" x2="${W - P.r}" y1="${ys(reqKw)}" y2="${ys(reqKw)}" stroke="#F57800" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - P.r - 4}" y="${ys(reqKw) - 6}" text-anchor="end" style="fill:#A84B00;font-weight:600">필요 ${fmt(reqKw, 1)} kW</text>` : ""}
    ${chosenKw && inX ? `<circle cx="${xs(te)}" cy="${ys(chosenKw)}" r="5" fill="#191F28"/><text x="${xs(te) + 9}" y="${ys(chosenKw) + 17}" style="fill:#191F28;font-weight:600">${fmt(chosenKw, 1)} kW</text>` : ""}
  </svg>`;
}

// ───────────────────────── 화면들 ─────────────────────────
const TERM = { 침입열: ["#191F28"], 입고품: ["#18A5A5"], 환기: ["#8B95A1"], 작업원: ["#F57800"], 전기: ["#B0B8C1"], 호흡열: ["#0F766E"] };

// ── 창고 위치 → 월별 기온(1년치) ──
//   위치는 OpenStreetMap, 기온은 NASA POWER 25년 평균(server/climate.ts). 바깥 온도 칸은 손님이 [바깥 온도로 쓰기]를 눌러야 바뀐다.
function climateSvg(c, outdoorC) {
  const W = 600, H = 260, P = { l: 40, r: 12, t: 18, b: 30 };
  const lo = Math.min(...c.months.map((x) => x.min)), hi = Math.max(...c.months.map((x) => x.max), outdoorC ?? -99);
  const yd = [Math.floor((lo - 3) / 5) * 5, Math.ceil((hi + 3) / 5) * 5];
  const xs = (m) => P.l + (m - 0.5) / 12 * (W - P.l - P.r), ys = scale(yd[0], yd[1], H - P.b, P.t);
  const grid = ticks(yd[0], yd[1], 5).map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${ys(t)}" y2="${ys(t)}" stroke="${t === 0 ? "#B0B8C1" : "#F2F4F6"}"/><text x="${P.l - 6}" y="${ys(t) + 4}" text-anchor="end">${t}</text>`).join("");
  const band = [...c.months.map((x) => `${xs(x.m)},${ys(x.max)}`), ...c.months.slice().reverse().map((x) => `${xs(x.m)},${ys(x.min)}`)].join(" ");
  const line = (k) => c.months.map((x, i) => `${i ? "L" : "M"}${xs(x.m)},${ys(x[k])}`).join("");
  const dots = c.months.map((x) => `<circle cx="${xs(x.m)}" cy="${ys(x.avg)}" r="3.5" fill="#191F28"/><text x="${xs(x.m)}" y="${H - P.b + 18}" text-anchor="middle">${x.m}월</text>
    <text x="${xs(x.m)}" y="${ys(x.max) - 6}" text-anchor="middle" style="fill:#A84B00">${Math.round(x.max)}</text><text x="${xs(x.m)}" y="${ys(x.min) + 15}" text-anchor="middle" style="fill:#4E5968">${Math.round(x.min)}</text>`).join("");
  const out = outdoorC != null && outdoorC >= yd[0] && outdoorC <= yd[1]
    ? `<line x1="${P.l}" x2="${W - P.r}" y1="${ys(outdoorC)}" y2="${ys(outdoorC)}" stroke="#191F28" stroke-dasharray="5 4"/><text x="${W - P.r - 2}" y="${ys(outdoorC) - 5}" text-anchor="end" style="fill:#191F28;font-weight:600">적용 외기온도 ${outdoorC}℃</text>` : "";
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><g class="grid">${grid}</g>
    <polygon points="${band}" fill="#F2F4F6"/>
    <path d="${line("max")}" fill="none" stroke="#F57800" stroke-width="1.5"/><path d="${line("min")}" fill="none" stroke="#8B95A1" stroke-width="1.5"/><path d="${line("avg")}" fill="none" stroke="#191F28" stroke-width="2"/>
    ${out}${dots}</svg>
    <div class="sub" style="display:flex;gap:16px;flex-wrap:wrap;padding:4px 0 8px"><span><span class="dot" style="background:#F57800"></span>월최고기온</span><span><span class="dot" style="background:#191F28"></span>월평균기온</span><span><span class="dot" style="background:#8B95A1"></span>월최저기온</span><span>℃</span></div>`;
}
function siteCard(R) {
  const T = S.site, c = T.climate;
  const form = `<form id="site-form" class="searchbox" style="margin-top:8px">${icon("search-outline")}<input id="site-q" value="${esc(T.query)}" placeholder="주소 또는 지역명 (해외 포함)"></form>`;
  let body = "";
  if (T.busy) body = `<div class="sub" style="padding:12px 4px">불러오는 중…</div>`;
  else if (T.err) body = note(esc(T.err), "warn");
  else if (T.places.length && !T.place) body = `<div class="sub" style="padding:8px 4px 0">검색 결과 ${T.places.length}건</div>` + T.places.map((p, i) => `<div class="lrow tap" data-place="${i}"><div class="m"><div class="t">${esc(p.short)}</div><div class="sub">${esc(p.name)} · ${({ city: "도시", town: "읍·면", village: "마을", state: "주·도", province: "도", county: "군", administrative: "행정구역", suburb: "동네", country: "나라" })[p.kind] ?? "장소"} · ${p.lat >= 0 ? "북위" : "남위"} ${Math.abs(p.lat).toFixed(2)} ${p.lon >= 0 ? "동경" : "서경"} ${Math.abs(p.lon).toFixed(2)}</div></div>${icon("chevron-forward", "c2")}</div>`).join("");
  if (T.place && c) {
    const out = R.in.outdoorC;
    const design = designOut(c);
    const same = Math.abs(out - design) < 0.05;
    body += `<div class="rrow"><div class="k">위치</div><div class="v">${esc(T.place.short)}</div></div>
      ${T.places.length > 1 ? `<button class="undo" data-replace="1" style="margin:-4px 0 4px auto">위치 다시 선택</button>` : ""}
      ${rrow("연중 최고기온", `${fmt(c.hottest.max, 1)}℃ (${c.hottest.date})`, false, "site.hot")}
      ${rrow("연중 최저기온", `${fmt(c.coldest.min, 1)}℃ (${c.coldest.date})`)}
      ${rrow("적용 외기온도", `${out}℃`, false, "site.out")}
      ${same ? "" : `<button class="btn secondary" data-useout="${design}" style="margin:8px 0">외기온도 ${design}℃ 적용</button>`}
      <div class="sub" style="padding:4px 0 8px">기온: ${esc(c.source)}, ${esc(c.period)} · © OpenStreetMap</div>`;
  }
  return card(form + body);
}
/** 설계 외기온도 = 연중 최고기온을 5℃ 단위로 올림(대표 11/08) — 48.3 → 50, 36.0 → 40, 45.0 → 45 */
const designOut = (c) => Math.ceil(Math.round(c.hottest.max * 10) / 10 / 5) * 5;
async function searchSite(q) {
  Object.assign(S.site, { query: q, places: [], place: null, climate: null, busy: true, err: null }); render();
  try {
    S.site.places = (await api(`/api/geocode?q=${encodeURIComponent(q)}`)).items;
    if (!S.site.places.length) S.site.err = "검색 결과 없음 — 시·군·구 또는 도시명으로 재검색";
    else if (S.site.places.length === 1) return pickPlace(0);
  } catch (e) { S.site.err = `위치를 찾지 못했어요 (${e.message})`; }
  S.site.busy = false; render();
}
async function pickPlace(i) {
  const p = S.site.places[i]; S.site.place = p; S.site.busy = true; S.site.err = null; render();
  try { S.site.climate = await api(`/api/climate?lat=${p.lat}&lon=${p.lon}`); setField("load", "outdoorC", String(designOut(S.site.climate))); }
  catch (e) { S.site.err = `기온 자료를 받지 못했어요 (${e.message})`; S.site.place = null; }
  S.site.busy = false; render();
}

// ── 시각화 칸(대표 11/08 「결과 / 입력 / 시각화 / 채팅」) ──
const BLUE = "#3182F6", ORANGE = "#F57800";
/** 고내온도 → 창고 안쪽 색. 따뜻할수록 옅고(냉장) 추울수록 짙은 파랑(냉동) */
function coldFill(t) {
  const f = Math.max(0, Math.min(1, (15 - t) / 55));
  const m = (a, b) => Math.round(a + (b - a) * f);
  return { wall: `rgb(${m(240, 196)},${m(246, 218)},${m(255, 251)})`, floor: `rgb(${m(228, 170)},${m(238, 200)},${m(252, 246)})` };
}
/** 창고 그림 — 등각(30°) 투영. 천정을 점선(투명)으로 두고 위에서 안을 들여다본다.
 *  벽 윗단면(노란 테) = 판넬 두께(보기 쉽게 키움) · 안쪽 색·글씨 = 고내온도 · 오른쪽 위 = 외기온도 · coolers = 안쪽 벽 유닛쿨러 대수 */
function whSvg({ w, d, h, t, roomC, outC, coolers = 0 }) {
  const W = 520, H = 440, PAD = { l: 56, r: 112, t: 104, b: 66 };
  const c30 = Math.cos(Math.PI / 6);
  const pr = (x, y, z) => [(x - y) * c30, (x + y) * 0.5 - z];
  const cs = [[0, 0, 0], [w, 0, 0], [0, d, 0], [w, d, 0], [0, 0, h], [w, 0, h], [0, d, h], [w, d, h]].map((p) => pr(...p));
  const x0 = Math.min(...cs.map((p) => p[0])), x1 = Math.max(...cs.map((p) => p[0])), y0 = Math.min(...cs.map((p) => p[1])), y1 = Math.max(...cs.map((p) => p[1]));
  const AW = W - PAD.l - PAD.r, AH = H - PAD.t - PAD.b;
  const k = Math.min(AW / (x1 - x0 || 1), AH / (y1 - y0 || 1));
  const ox = PAD.l + (AW - (x1 - x0) * k) / 2 - x0 * k, oy = PAD.t + (AH - (y1 - y0) * k) / 2 - y0 * k;
  const P = (x, y, z) => { const [a, b] = pr(x, y, z); return [ox + a * k, oy + b * k]; };
  const q = (ps) => ps.map((p) => P(...p).map((n) => n.toFixed(1)).join(",")).join(" ");
  const pathOf = (ps) => `M${q(ps).split(" ").join("L")}Z`;
  const LN = `stroke="#4E5968" stroke-width="1.5" stroke-linejoin="round"`;
  const poly = (ps, fill, extra = LN) => `<polygon points="${q(ps)}" fill="${fill}" ${extra}/>`;
  // 판넬 두께 — 실제 비율로는 안 보여서 화면 두께(px)를 판넬 두께에 비례해 키운다(50T 9px · 100T 12px · 250T 23px)
  const T = Math.min((5 + t / 14) / k, Math.min(w, d, h) * 0.2);
  const C = coldFill(roomC);
  // ① 안쪽(먼 쪽 두 벽의 안면·바닥) — 가까운 두 벽이 나중에 덮어 가린다
  const floor = poly([[T, T, T], [w - T, T, T], [w - T, d - T, T], [T, d - T, T]], C.floor, `stroke="#B0B8C1"`);
  const wallX = poly([[T, T, T], [T, d - T, T], [T, d - T, h], [T, T, h]], C.wall, `stroke="#B0B8C1"`);
  const wallY = poly([[T, T, T], [w - T, T, T], [w - T, T, h], [T, T, h]], C.floor, `stroke="#B0B8C1"`);
  // 유닛쿨러 — 안쪽 벽(x=T) 천정 가까이, 대수만큼 고르게. 파란 점선 = 토출 바람
  let cool = "";
  if (coolers > 0) {
    const n = Math.min(coolers, 8), slot = (d - 2 * T) / n;
    const cw = Math.min(slot * 0.62, 1.8), dx = Math.min(0.75, w * 0.16), ch = Math.min(0.7, h * 0.2);
    const z1 = h - Math.min(0.4, h * 0.1), z0 = z1 - ch;
    for (let i = 0; i < n; i++) {
      const yc = T + slot * (i + 0.5), ya = yc - cw / 2, yb = yc + cw / 2, xa = T, xb = T + dx;
      const [fx, fy] = P(xb, yc, (z0 + z1) / 2), [tx, ty] = P(xb + Math.min(w * 0.3, 2.5), yc, z0 - ch * 0.6);
      cool += poly([[xa, ya, z1], [xb, ya, z1], [xb, yb, z1], [xa, yb, z1]], "#fff") + poly([[xb, ya, z0], [xb, yb, z0], [xb, yb, z1], [xb, ya, z1]], "#F2F4F6")
        + poly([[xa, yb, z0], [xb, yb, z0], [xb, yb, z1], [xa, yb, z1]], "#D1D6DB")
        + `<line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" stroke="${BLUE}" stroke-width="2" stroke-dasharray="4 3" marker-end="url(#ahB)"/>`;
    }
  }
  // ② 가까운 두 벽 겉면 ③ 벽 윗단면 = 판넬 두께(우레탄 색) ④ 천정은 점선으로만
  const nearY = poly([[0, d, 0], [w, d, 0], [w, d, h], [0, d, h]], "#E5E8EB");
  const nearX = poly([[w, 0, 0], [w, d, 0], [w, d, h], [w, 0, h]], "#D1D6DB");
  const ring = `<path d="${pathOf([[0, 0, h], [w, 0, h], [w, d, h], [0, d, h]])} ${pathOf([[T, T, h], [w - T, T, h], [w - T, d - T, h], [T, d - T, h]])}" fill="#F7E3A1" fill-rule="evenodd" ${LN}/>`;
  const lid = poly([[0, 0, h], [w, 0, h], [w, d, h], [0, d, h]], "none", `stroke="#8B95A1" stroke-width="1" stroke-dasharray="5 4"`);
  // 치수선
  const dim = (a, b, off, label, vertical) => {
    const [ax, ay] = P(...a), [bx, by] = P(...b), A = [ax + off[0], ay + off[1]], B = [bx + off[0], by + off[1]];
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, n = Math.hypot(...off);
    const txt = vertical
      ? `<text x="${A[0] - 12}" y="${my}" text-anchor="middle" class="dimt" transform="rotate(-90 ${A[0] - 12} ${my})">${label}</text>`
      : `<text x="${mx + off[0] / n * 34}" y="${my + off[1] / n * 22 + 6}" text-anchor="middle" class="dimt">${label}</text>`;
    return `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="#191F28" stroke-width="1.2"/><circle cx="${A[0]}" cy="${A[1]}" r="2.5" fill="#191F28"/><circle cx="${B[0]}" cy="${B[1]}" r="2.5" fill="#191F28"/>${txt}`;
  };
  const dims = dim([0, d, 0], [w, d, 0], [-10, 16], `가로 ${fmt(w, 1)}m`) + dim([w, d, 0], [w, 0, 0], [12, 14], `세로 ${fmt(d, 1)}m`) + dim([0, d, 0], [0, d, h], [-16, 0], `높이 ${fmt(h, 1)}m`, true);
  // 글씨 — 안: 고내온도(바닥 위 가운데), 오른쪽 위: 외기온도, 오른쪽: 판넬
  // 고내온도 — 왼쪽 위(외기온도와 마주 보게), 파란 지시선은 윗면(천정) 가운데를 가리킨다(대표 11/09)
  const [ix, iy] = P(w * 0.5, d * 0.5, h);
  const inside = `<g transform="translate(16,16)"><rect x="0" y="6" width="22" height="32" rx="11" fill="${BLUE}" opacity=".15"/><rect x="7" y="12" width="8" height="20" rx="4" fill="${BLUE}"/>
    <text x="32" y="14" class="whk">고내온도</text><text x="32" y="42" class="whv" style="fill:${BLUE}">${fmt(roomC, 0)}℃</text></g>
    <line x1="60" y1="66" x2="${ix}" y2="${iy}" stroke="${BLUE}" stroke-width="1.5"/><circle cx="${ix}" cy="${iy}" r="4" fill="${BLUE}"/>`;
  const outside = `<g transform="translate(${W - 150},16)"><circle cx="16" cy="22" r="10" fill="${ORANGE}"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => { const r = (a * Math.PI) / 180; return `<line x1="${16 + Math.cos(r) * 14}" y1="${22 + Math.sin(r) * 14}" x2="${16 + Math.cos(r) * 19}" y2="${22 + Math.sin(r) * 19}" stroke="${ORANGE}" stroke-width="2.5" stroke-linecap="round"/>`; }).join("")}
    <text x="44" y="14" class="whk">외기온도</text><text x="44" y="42" class="whv" style="fill:${ORANGE}">${fmt(outC, 0)}℃</text></g>`;
  const [px, py] = P(w - T / 2, d * 0.3, h), lx = Math.min(Math.max(px + 40, P(w, 0, h)[0] + 14), W - 70);
  const panel = `<line x1="${px}" y1="${py}" x2="${lx - 4}" y2="${py - 22}" stroke="#4E5968"/><circle cx="${px}" cy="${py}" r="3" fill="#4E5968"/><text x="${lx}" y="${py - 44}" class="whk">판넬</text><text x="${lx}" y="${py - 20}" class="whp">${fmt(t, 0)}T</text>`;
  const defs = `<defs><marker id="ahB" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="${BLUE}"/></marker></defs>`;
  return `<svg class="chart wh" viewBox="0 0 ${W} ${H}">${defs}${floor}${wallX}${wallY}${cool}${nearY}${nearX}${ring}${lid}${dims}${inside}${outside}${panel}</svg>`;
}
function boxInfo(w, d, h, t) {
  // 내형 = 외형 − 두께×2 — 엑셀 B9·D9·F9 대로 가로는 동, 세로는 남, 높이는 천정 두께(면별 칸에 손님 값이 있을 때)
  const L = S.result?.load, fm = (id) => (L?.src?.[`mm_${id}`] === "user" ? Number(L.in[`mm_${id}`]) : t);
  const area = w * d, iw = w - 2 * fm("east") / 1000, id = d - 2 * fm("south") / 1000, ih = h - 2 * fm("ceil") / 1000;
  return `<div class="boxinfo">
    <div><div class="k">평수</div><div class="v">${fmt(area / 3.3058, 1)}<small>평</small></div></div>
    <div><div class="k">바닥면적</div><div class="v">${fmt(area, 1)}<small>㎡</small></div></div>
    <div><div class="k">외형 용적</div><div class="v">${fmt(area * h, 0)}<small>㎥</small></div></div>
    <div><div class="k">내형 용적</div><div class="v">${fmt(Math.max(0, iw * id * ih), 0)}<small>㎥</small></div></div></div>
    <div class="sub" style="padding:2px 4px 10px">외형 ${fmt(w, 1)}×${fmt(d, 1)}×${fmt(h, 1)}m · 내형 ${fmt(iw, 2)}×${fmt(id, 2)}×${fmt(ih, 2)}m</div>`;
}
const whBlock = (v) => whSvg({ w: v.w, d: v.d, h: v.h, t: v.insulMm, roomC: v.roomC, outC: v.outdoorC }) + boxInfo(v.w, v.d, v.h, v.insulMm);
const LIVE_KEYS = ["w", "d", "h", "pyeong", "insulMm", "roomC", "outdoorC"];
/** 슬라이더를 끄는 동안·숫자를 치는 동안 창고 그림만 바로 다시 그린다(계산은 손을 뗄 때) */
function liveBox(changedKey) {
  const el = document.getElementById("boxviz"); if (!el) return;
  const cur = S.result.load.in;
  const num = (k) => { const x = document.getElementById(`f-load-${k}`)?.value; return x === "" || x == null ? cur[k] : Number(x); };
  let w = num("w"), d = num("d");
  if (changedKey === "pyeong") { const area = num("pyeong") * 3.3058; w = Math.round(Math.sqrt(area / 2) * 100) / 100; d = Math.round(area / w * 100) / 100; }
  const v = { w, d, h: num("h"), insulMm: num("insulMm"), roomC: num("roomC"), outdoorC: num("outdoorC") };
  if (![v.w, v.d, v.h, v.insulMm].every((x) => x > 0) || ![v.roomC, v.outdoorC].every(Number.isFinite)) return;
  el.innerHTML = whBlock(v);
}
/** 가로 막대 목록 — [이름, 값, 색, 곁글, 깜빡임 키, 보이는 값] */
function barRows(items, unit = "") {
  const max = Math.max(...items.map((x) => Math.max(0, x[1])), 1);
  return items.map(([k, val, col, aside, key, shown]) => `<div class="brow"><div class="bk">${k}</div><div class="bt"><div style="width:${Math.max(0, val) / max * 100}%;background:${col}"></div></div><div class="bv" ${key ? fk(key, Math.round(val)) : ""}>${shown ?? `${fmt(val)}${unit}`}${aside ? ` <span class="sub">${aside}</span>` : ""}</div></div>`).join("");
}
/** 팽창변 부하율 — 적정 25~100% 띠 위에 후보마다 점 */
function loadPctSvg(opts, chosenIdx, W = 520) {
  const rows = opts.slice(0, 8), rh = 34, P = { l: 150, r: 24, t: 10, b: 30 }, H = P.t + rows.length * rh + P.b;
  const hi = Math.max(150, Math.ceil((Math.max(...rows.map((o) => o.load_pct)) + 10) / 50) * 50);
  const xs = scale(0, hi, P.l, W - P.r);
  const band = `<rect x="${xs(25)}" y="${P.t}" width="${xs(100) - xs(25)}" height="${H - P.t - P.b}" fill="#E8F7F7"/><text x="${(xs(25) + xs(100)) / 2}" y="${H - 4}" text-anchor="middle" style="fill:#0F766E;font-weight:600">적정 25~100%</text>`;
  const grid = [0, 25, 50, 75, 100, 125, 150, 200, 250, 300].filter((t) => t <= hi).map((t) => `<text x="${xs(t)}" y="${H - P.b + 14}" text-anchor="middle">${t}</text>`).join("");
  const body = rows.map((o, i) => { const y = P.t + i * rh + rh / 2, on = i === chosenIdx;
    return `<text x="0" y="${y + 5}" style="fill:${on ? "#191F28" : "#6B7684"};font-size:14px;font-weight:${on ? 700 : 400}">${esc(o.model.length > 18 ? o.model.slice(0, 17) + "…" : o.model)}</text><line x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}" stroke="#F2F4F6"/><circle cx="${xs(o.load_pct)}" cy="${y}" r="${on ? 8 : 6}" fill="${on ? "#191F28" : "#B0B8C1"}"/><text x="${xs(o.load_pct) + 12}" y="${y + 5}" style="font-size:14px;fill:${on ? "#191F28" : "#6B7684"};font-weight:${on ? 700 : 400}">${o.load_pct}%</text>`; }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${band}<g class="grid">${grid}</g>${body}</svg>`;
}

// 화면마다 { side: 결과, main: 입력, viz: 시각화 } — 대표 11/08 「결과 / 입력 / 시각화 / 채팅」
const waitOut = (k) => ({ side: errBox(k) || `<div class="empty">계산 중…</div>`, main: errBox(k), viz: `<div class="empty">계산 중…</div>` });

function viewLoad() {
  const R = S.result?.load; if (!R) return waitOut("load");
  const L = R.out, total = L.terms.reduce((a, t) => a + Math.max(0, t.kcal), 0) || 1;
  const side = `${sl("결과")}${card(hero("냉동부하 (총냉각열량)", fmt(L.총냉각열량Kw, 1), "kW", `${fmt(L.총냉각열량)} kcal/h · 안전율 ${L.안전율}배 포함`, "a.load")
      + `<div class="divider"></div>` + rrow("증발온도", `${fmt(L.증발온도, 0)}℃`, false, "a.load.evap") + rrow("외기온도", `${R.in.outdoorC}℃`, false, "a.load.out") + rrow("창고 종류", `${L.band}창고`, false, "a.load.band") + rrow("내형 용적", `${fmt(L.내형.volume, 0)} ㎥`, false, "a.load.vol")
      + `<div class="divider"></div><div class="rrow"><div class="k">일일 입고량 / 수용량</div><div class="v" ${fk("a.load.in", fmt(L.입고량Ton, 1))}>${fmt(L.입고량Ton, 1)} / ${fmt(L.수용량Ton, 1)} 톤</div></div>
        <div class="bt meter"><div style="width:${Math.min(100, L.입고량Ton / (L.수용량Ton || 1) * 100)}%;background:#18A5A5"></div></div>
        <div class="sub" style="text-align:right">입고율 ${fmt(L.입고량Ton / (L.수용량Ton || 1) * 100, 0)}%</div>`)}
    ${sl("부하 항목 (kcal/h, 안전율 전)")}${card(L.terms.map((t) => `<div class="rrow"><div class="k"><span class="dot" style="background:${TERM[t.key][0]}"></span>${t.key}</div><div class="v" ${fk(`load.t.${t.key}`, Math.round(t.kcal))}>${fmt(t.kcal)} <span class="sub">${fmt(t.kcal / total * 100, 0)}%</span></div></div>`).join(""))}`;
  const main = `
    ${sl("창고 위치")}${siteCard(R)}
    ${sl("시공자 입력값")}${card(fieldsOf("load", "main"))}
    ${sl("추정값")}${card(fieldsOf("load", "detail"))}
    ${sl("계수")}${card(fieldsOf("load", "coef"))}
    ${sl("면별 조건")}${card(faceTable())}
    ${navrow(null, "comp")}`;
  const C = S.site.climate;
  const viz = `${sl("창고")}${card(`<div id="boxviz">${whBlock(R.in)}</div>`)}
    ${sl("부하 구성 (안전율 전)")}${card(`<div class="stack">${L.terms.map((t) => `<div style="flex-grow:${Math.max(0, t.kcal)};background:${TERM[t.key][0]}"></div>`).join("")}</div>
      ${barRows(L.terms.map((t) => [`<span class="dot" style="background:${TERM[t.key][0]}"></span>${t.key}`, t.kcal, TERM[t.key][0], "", null, `${fmt(t.kcal / total * 100, 0)}%`]))}`)}
    ${C && S.site.place ? `${sl(`월별 기온 — ${esc(S.site.place.short)}`)}${card(climateSvg(C, R.in.outdoorC))}` : ""}`;
  return { side, main, viz };
}

function viewComp() {
  const R = S.result?.comp; if (!R) return waitOut("comp");
  const O = R.out, c = O.chosen, req = R.in.capacityKw, dev = c?.deviation_pct;
  const top = c
    ? card(hero("추천 압축기", esc(c.product_id), "", `${esc(c.brand)} · ${hpLabel(c)}`, "a.comp") + `<div class="divider"></div>`
      + rrow("운전조건 냉동능력", `${fmt(c.capacity_kw, 1)} kW`, false, "a.comp.cap") + rrow("필요 냉동능력", `${fmt(req, 1)} kW`, false, "a.comp.req") + rrow(dev >= 0 ? "여유율" : "부족률", `${fmt(Math.abs(dev), 0)}%`, false, "a.comp.dev") + rrow("기본가", won(c.price_krw), true, "a.comp.price"))
    : card(hero("추천 압축기", "해당 모델 없음", "", esc(O.message ?? ""), "a.comp"));
  const warn = c && c.match_level !== "exact" ? note(`재고 품목 「${esc(c.model_no)}」은 계산 모델(${esc(c.product_id)})과 품명이 달라 동일 기종 확인 필요`, "warn") : "";
  const list = O.candidates.slice(0, 8);
  const side = `${sl("결과")}${top}${warn}`;
  const viz = c
    ? `${sl("능력 대조 (kW)")}${card(barRows([["필요", req, ORANGE, "", null, `${fmt(req, 1)} kW`], ["압축기", c.capacity_kw, "#191F28", "", null, `${fmt(c.capacity_kw, 1)} kW`]]))}
      ${sl("운전 범위")}${card(envelopeSvg(O.envelope, R.in.evapC, R.in.condC, 520))}${sl(`증발온도별 냉동능력 (응축 ${R.in.condC}℃)`)}${card(curveSvg(O.curve, req, R.in.evapC, c.capacity_kw, 520))}`
    : `<div class="empty">해당 모델이 없어 그림이 없습니다</div>`;
  const main = `
    ${sl("압축기 조건")}${card(fieldsOf("comp", "main"))}
    ${sl("운전 조건")}${card(fieldsOf("comp", "detail"))}
    ${list.length ? `${sl("후보")}${card(list.map((x, i) => `<div class="lrow"><div class="m"><div class="t">${esc(x.product_id)}</div><div class="sub">${esc(x.brand)} · ${hpLabel(x)} · ${fmt(x.capacity_kw, 1)} kW · 여유율 ${fmt(x.deviation_pct, 0)}%</div></div><div class="r f-bodyStrong num">${won(x.price_krw)}</div>${selCell("comp", x.product_id, i === O.chosenIdx)}</div>`).join(""))}` : ""}
    ${!c && O.nearMiss?.length ? `${sl("능력 부족 최대 모델")}${card(O.nearMiss.slice(0, 5).map((x) => `<div class="lrow"><div class="m"><div class="t">${esc(x.product_id)}</div><div class="sub">${hpLabel(x)} · ${fmt(x.capacity_kw, 1)} kW · 부족률 ${fmt(Math.abs(x.deviation_pct), 0)}%</div></div></div>`).join(""))}` : ""}
    ${navrow("load", "unit")}`;
  return { side, main, viz };
}

function viewUnit() {
  const R = S.result?.unit; if (!R) return waitOut("unit");
  const D = R.out.draft;
  const top = D
    ? card(hero("유니트 세트", `${D.hp}마력 ${formLabel(D.form)}`, "", `압축기 ${esc(D.compressorModel ?? "-")}`, "a.unit") + `<div class="divider"></div>`
      + rrow("구성품", `${D.slots.length}종`) + rrow("참고 합계", won(D.total), true, "a.unit.total"))
    : card(hero("유니트 세트", "구성 불가", "", "", "a.unit"));
  const side = `${sl("결과")}${top}${(R.out.notes ?? []).map((n) => note(esc(n), "warn")).join("")}`;
  const main = `
    ${sl("유니트 조건")}${card(fieldsOf("unit", "main"))}
    ${sl("세부 조건")}${card(fieldsOf("unit", "detail"))}
    ${D ? `${sl("구성품")}${card(D.slots.map((s) => `<div class="lrow" data-link="${esc(unitLink(s))}"><div class="m"><div class="t">${esc(s.slot)} <span class="sub">${esc(s.spec ?? "")}</span></div><div class="sub">${esc(s.modelNo ?? (s.separate ? "" : "확인 후 안내"))}</div></div><div class="r f-bodyStrong num">${s.separate ? "별도" : s.priceKrw == null ? "확인 후 안내" : won(s.priceKrw)}</div></div>`).join(""))}` : ""}
    ${navrow("comp", "cooler")}`;
  const priced = (D?.slots ?? []).filter((x) => !x.separate && x.priceKrw > 0).sort((a, b) => b.priceKrw - a.priceKrw);
  // 계통도(대표 11/09) — 부품에 마우스를 얹으면 그 칸 정보, 가격 막대는 아래에 그대로
  const viz = cycleBlock("unit")
    + (priced.length ? `${sl("구성품 기본가")}${card(barRows(priced.map((x) => [esc(x.slot), x.priceKrw, "#191F28", "", null, won(x.priceKrw)])))}` : "");
  return { side, main, viz };
}
/** 냉동 사이클 계통도 — 유니트·유닛쿨러·팽창변 세 화면 맨 위에 같은 그림, 보고 있는 화면의 부품만 진하게(대표 11/09 ⓑ) */
function cycleBlock(focus) {
  const U = S.result?.unit, D = U?.out?.draft ?? null;
  const T = S.result?.txv;
  const fig = cycleFigure(D, {
    focus, cooler: S.result?.cooler?.out ?? null, txv: T ? { ...T.out, in: T.in } : null, roomC: S.result?.load?.in?.roomC,
    unitWhy: U ? "구성 불가" : "계산 중…",
  });
  return `${sl(D ? `계통도 — ${D.hp}마력 ${formLabel(D.form)}` : "계통도")}${card(fig, "figcard")}`;
}

function viewCooler() {
  const R = S.result?.cooler; if (!R) return waitOut("cooler");
  const O = R.out, c = O.chosen, bal = S.result.balance;
  const top = c
    ? card(hero("추천 유닛쿨러", esc(c.model), `${O.count}대`, `${esc(c.maker)} · ${esc(c.defrost)} 제상`, "a.cooler") + `<div class="divider"></div>`
      + rrow("1대당 냉각능력", `${fmt(c.kcal)} kcal/h`, false, "a.cooler.cap") + rrow("1대당 필요능력", `${fmt(O.perUnit)} kcal/h`, false, "a.cooler.need") + rrow("여유율", `${fmt(c.margin_pct, 0)}%`, false, "a.cooler.margin") + (bal ? rrow("압축기 대비 쿨러 합계", `${bal.ratio}%`, false, "a.cooler.bal") : ""))
    : card(hero("추천 유닛쿨러", "해당 모델 없음", "", "대수 증가 또는 메이커 「상관없음」", "a.cooler"));
  const list = O.candidates.slice(0, 8);
  const side = `${sl("결과")}${top}
    ${c ? `${sl("사양")}${card([["형식", c.form, "c:body"], ["제상", `${c.defrost}${c.heater ? ` · 히터 ${c.heater}` : ""}`, "c:coil"], ["풍량", c.airflow_cmm != null ? `${c.airflow_cmm} CMM` : "-", "c:fan"], ["냉매관 입구/출구", `${c.pipe_in ?? "-"} / ${c.pipe_out ?? "-"} mm`, "c:pipe"], ["외형", c.dims ? `${c.dims} mm` : "-", "c:body"], ["중량", c.kg != null ? `${c.kg} kg` : "-", "c:body"], ["전원", c.power ?? "-", "c:body"], ["출처", c.source, "c:body"]].map(([k, v, lk]) => rrow(k, esc(v)).replace('<div class="rrow">', `<div class="rrow" data-link="${lk}">`)).join(""))}` : ""}`;
  const main = `
    ${sl("유닛쿨러 조건")}${card(fieldsOf("cooler", "main"))}
    ${sl("세부 조건")}${card(fieldsOf("cooler", "detail"))}
    ${list.length ? `${sl("후보")}${card(list.map((x, i) => `<div class="lrow"><div class="m"><div class="t">${esc(x.model)}</div><div class="sub">${esc(x.maker)} · ${fmt(x.kcal)} kcal/h · 여유율 ${fmt(x.margin_pct, 0)}%</div></div>${selCell("cooler", x.model, i === O.chosenIdx)}</div>`).join(""))}` : ""}
    ${navrow("unit", "txv")}`;
  const Lin = S.result.load?.in;
  const fig = c ? coolerFigure(c) : null;
  const viz = cycleBlock("cooler") + (c
    ? `${fig ? `${sl(`외형도 — ${esc(c.model)}${O.count > 1 ? ` × ${O.count}대` : ""}`)}${card(fig, "figcard")}` : ""}${Lin ? `${sl(`창고 안 배치 — ${esc(c.model)} ${O.count}대`)}${card(whSvg({ w: Lin.w, d: Lin.d, h: Lin.h, t: Lin.insulMm, roomC: Lin.roomC, outC: Lin.outdoorC, coolers: O.count }))}` : ""}
      ${sl("능력 대조 (kcal/h)")}${card(barRows([["필요 합계", R.in.needKcal, ORANGE, "", null, `${fmt(R.in.needKcal)}`], [`쿨러 ${O.count}대`, c.kcal * O.count, BLUE, "", null, `${fmt(c.kcal * O.count)}`], ...(bal ? [["압축기", bal.compKw * 860, "#191F28", "", null, `${fmt(bal.compKw * 860)}`]] : [])]))}`
    : "");
  return { side, main, viz };
}

function viewTxv() {
  const R = S.result?.txv; if (!R) return waitOut("txv");
  const O = R.out, c = O.chosen;
  const sum = (o) => (o.components ?? []).reduce((a, x) => (a == null || x.price_krw == null ? null : a + x.price_krw), 0);
  const top = c
    ? card(hero("추천 팽창변", esc(c.model), `${O.count}조`, `${esc(R.in.brand)} · 유닛쿨러 1대당 1조`, "a.txv") + `<div class="divider"></div>`
      + rrow("부하율", `${c.load_pct}%`, false, "a.txv.lp") + rrow("밸브 1개당 부하", `${fmt(R.in.capacityKw, 1)} kW`) + rrow("1조 기본가", won(sum(c)), true, "a.txv.price"))
    : card(hero("추천 팽창변", "해당 모델 없음", "", esc(O.message ?? ""), "a.txv"));
  const list = O.options.slice(0, 8);
  const side = `${sl("결과")}${top}
    ${c?.components?.length ? `${sl("구성 품번 (1조 기준)")}${card(c.components.map((x, i) => `<div class="lrow" data-link="x:${i}"><div class="m"><div class="t num">${esc(x.code_no)}</div>${x.role ? `<div class="sub">${esc(x.role)}</div>` : ""}</div><div class="r f-bodyStrong num">${won(x.price_krw)}</div></div>`).join(""))}` : ""}`;
  const main = `
    ${sl("팽창변 조건")}${card(fieldsOf("txv", "main"))}
    ${sl("세부 조건")}${card(fieldsOf("txv", "detail"))}
    ${list.length ? `${sl("후보")}${card(list.map((o, i) => `<div class="lrow"><div class="m"><div class="t">${esc(o.model)}</div><div class="sub">부하율 ${o.load_pct}% · 공칭 ${fmt(o.nominal_kw, 1)} kW</div></div><div class="r f-bodyStrong num">${won(sum(o))}</div>${selCell("txv", o.model, i === O.chosenIdx)}</div>`).join(""))}` : ""}
    ${navrow("cooler", null)}`;
  const fig = c ? txvFigure(c, { ...R.in, count: O.count }) : null;
  const viz = cycleBlock("txv") + (list.length
    ? `${fig ? `${sl(`구성도 — ${esc(c.model)}${O.count > 1 ? ` × ${O.count}조` : ""}`)}${card(fig, "figcard")}` : ""}${sl("후보별 부하율")}${card(loadPctSvg(list, O.chosenIdx))}`
    : "");
  return { side, main, viz };
}

function viewParts() {
  const P = S.parts, d = P.detail;
  let body;
  if (d) {
    body = `<button class="txtbtn" data-back="1" style="margin-top:12px">${icon("chevron-back")}목록</button>
      ${sl(`${esc(d.part?.brand ?? "")}`)}${card(`<div class="hero"><div class="v" style="font-size:22px;line-height:31px">${esc(d.part?.name ?? "")}</div><div class="s">품번 ${d.variants.length}개 · 기본가, VAT 별도</div></div>`)}
      ${sl("품번")}${card(d.variants.map((v) => `<div class="lrow"><div class="m"><div class="t num">${esc(v.model_no)}</div>${v.model_name || v.spec ? `<div class="sub">${esc([v.model_name, (v.spec ?? "").slice(0, 100)].filter(Boolean).join(" · "))}</div>` : ""}</div><div class="r f-bodyStrong num">${v.discontinued ? `<span style="color:var(--dangerText)">단종</span>` : won(v.price_krw)}</div></div>`).join(""))}`;
  } else if (P.busy) body = `<div class="empty">찾는 중…</div>`;
  else if (P.items.length) body = `${sl(`검색 결과 ${P.items.length}개`)}${card(P.items.map((x) => `<div class="lrow tap" data-part="${x.id}">${x.thumb ? `<img src="${esc(x.thumb)}" loading="lazy" onerror="this.outerHTML='<div class=thumb></div>'">` : `<div class="thumb"></div>`}<div class="m"><div class="t">${esc(x.name)}</div><div class="sub">${esc(x.brand ?? "")} · 품번 ${x.variants}개</div></div><div class="r f-bodyStrong num">${x.minPrice ? `${fmt(x.minPrice)}원~` : ""}</div>${icon("chevron-forward", "c2")}</div>`).join(""))}`;
  else body = `<div class="empty">${P.q ? "찾은 부품이 없습니다" : "품번이나 부품 이름을 넣어 보세요"}</div>`;
  return { side: "", viz: "", main: `
    <form id="parts-form" class="searchbox">${icon("search-outline")}<input id="parts-q" value="${esc(P.q)}" placeholder="품번, 모델명, 부품 이름"></form>${body}` };
}

const VIEWS = { parts: viewParts, load: viewLoad, comp: viewComp, unit: viewUnit, cooler: viewCooler, txv: viewTxv };
function render() {
  if (!S.fields) return;
  const active = document.activeElement?.id;
  const sc = $("#main").scrollTop, ss = $("#side").scrollTop, sv = $("#viz").scrollTop;
  TIPS.clear();   // 그림 정보 글은 그릴 때마다 새 값으로
  const v = VIEWS[S.tab]();
  $("#tabsbar").innerHTML = topBar();
  $("#side").innerHTML = v.side; $("#side").hidden = !v.side;
  if (!S.holdMain) $("#view").innerHTML = v.main;
  else syncInputs();   // 끄는 중 — 칸은 다시 그리지 않고 숫자만 맞춘다(창고 크기를 끄는 동안 추정값 칸도 따라 바뀐다)
  $("#viz").innerHTML = v.viz ?? ""; $("#viz").hidden = !v.viz;
  $("#main").scrollTop = sc; $("#side").scrollTop = ss; $("#viz").scrollTop = sv;
  if (active && active !== "chat-input" && document.getElementById(active)) document.getElementById(active).focus();
  applyHl();
  refreshTip();
  // 바뀐 값 — 옅은 면이 잠깐 깔린다
  for (const el of document.querySelectorAll("[data-fk]")) {
    const k = el.dataset.fk, v = el.dataset.fv;
    if (S.lastVals.has(k) && S.lastVals.get(k) !== v) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
    S.lastVals.set(k, v);
  }
}
// 채팅이 가리킨 곳 강조(대표 11/08) — 파란 면 3초 뒤 1초에 걸쳐 사라짐. 다시 그려져도 남은 시간만큼 이어 간다.
const HL_MS = 4000;
function applyHl() {
  if (!S.hl) return;
  const left = HL_MS - (Date.now() - S.hl.at); if (left <= 0) { S.hl = null; return; }
  for (const id of S.hl.ids) for (const el of document.querySelectorAll(`[data-fk="${CSS.escape(id)}"]`)) {
    el.classList.add("hl"); el.style.animationDelay = `-${HL_MS - left}ms`;
  }
}
/** 강조할 곳을 보이게 — 접힌 「세부 조건」은 펼치고, 첫 칸으로 스크롤 */
function showTargets(ids) {
  S.hl = { ids, at: Date.now() };
  for (const id of ids) for (const el of document.querySelectorAll(`[data-fk="${CSS.escape(id)}"]`)) {
    const d = el.closest("details[data-more]"); if (d && !d.open) { d.open = true; S.open[d.dataset.more] = true; }
  }
  applyHl();
  const first = ids.map((id) => document.querySelector(`[data-fk="${CSS.escape(id)}"]`)).find(Boolean);
  if (first) first.scrollIntoView({ block: "center", behavior: "smooth" });
}
/** 화면에 지금 보이는 값 그대로(답 아래 붙이는 줄) — AI 가 숫자를 만들지 않게 */
function shownText(id) {
  const el = document.querySelector(`[data-fk="${CSS.escape(id)}"]`); if (!el) return null;
  const sel = el.querySelector("select"); if (sel) return sel.selectedOptions[0]?.textContent ?? null;
  const inp = el.querySelector("input"); if (inp) return inp.value ? `${inp.value}${el.querySelector(".u")?.textContent ?? ""}` : "자동";
  const on = el.querySelectorAll(".chip.on"); if (el.classList.contains("chips")) return [...on].map((c) => c.textContent).join(" · ") || "-";
  return el.textContent.replace(/\s+/g, " ").trim();
}
function syncInputs() {
  const act = document.activeElement;
  for (const el of document.querySelectorAll("#view input[data-stage][data-key], #view [data-slide]")) {
    if (el === act) continue;
    const [st, k] = el.dataset.slide ? el.dataset.slide.split(".") : [el.dataset.stage, el.dataset.key];
    const x = S.result?.[st]?.in?.[k]; if (x == null || typeof x === "object") continue;
    const sv = typeof x === "number" ? String(Math.round(x * 1000) / 1000) : String(x);
    if (el.value !== sv) el.value = sv;
    if (el.dataset.slide) el.style.setProperty("--p", `${Math.max(0, Math.min(100, (el.value - el.min) / (el.max - el.min) * 100))}%`);
  }
}
function setTab(t) { const moved = S.tab !== t; S.tab = t; history.replaceState(null, "", `#${t}`); render(); if (moved) { $("#main").scrollTop = 0; $("#side").scrollTop = 0; $("#viz").scrollTop = vizStart(t); } }
/** 유닛쿨러·팽창변 화면은 계통도 아래쪽(창고)이 그 화면 부품이라 시각화 칸을 그 자리로 내려 둔다 — 위로 올리면 유니트 쪽 */
function vizStart(t) {
  if (t !== "cooler" && t !== "txv") return 0;
  const room = document.querySelector('#viz [data-room]'), viz = $("#viz");
  if (!room) return 0;
  return Math.max(0, room.getBoundingClientRect().top - viz.getBoundingClientRect().top + viz.scrollTop - 120);
}

// ───────────────────────── 부품 검색 ─────────────────────────
async function searchParts(q) {
  S.parts.q = q; S.parts.busy = true; S.parts.detail = null; render();
  try { S.parts.items = (await api(`/api/parts?q=${encodeURIComponent(q)}`)).items; }
  catch (e) { S.parts.items = []; status(`찾지 못했습니다: ${e.message}`); }
  S.parts.busy = false; render();
  if (S.parts.items.length === 1) openPart(S.parts.items[0].id);
}
async function openPart(id) {
  try { S.parts.detail = await api(`/api/part/${id}`); } catch (e) { status(`열지 못했습니다: ${e.message}`); }
  render(); $("#main").scrollTop = 0;
}

// ───────────────────────── 상담 — 라이브 앱 상담 화면(ChatScreenV2) 모양 그대로 ─────────────────────────
//   빈 화면: 가운데 「무엇을 도와드릴까요?」 + 한 줄 설명 · 내 말: 검정 말풍선 · 답변: 바탕 없는 글 · 말 아래 [복사] 아이콘
//   기다림: 「생각해 보고 있어요…」 위로 흰빛 띠 · 입력줄: 회색 상자 안에 글칸·[마이크], 글이 있을 때만 [보내기](웹 규칙)
//   ⚠️ 라이브의 👍·👎 는 이 사이트에 받을 곳이 없어 넣지 않았다 — 눌러도 아무 일이 없는 단추를 두지 않는다.
//   [+] 는 메뉴 없이 바로 사진·파일 고르기(대표 11/09 「클립보드 사진·파일 첨부」) — 붙여넣기(⌘V)·끌어 놓기도 같은 첨부 줄로 간다.
const EMPTY_TITLE = "무엇을 도와드릴까요?";
const FIRST_PROGRESS_TEXT = "생각해 보고 있어요…";
const dayLabel = (ts) => { const d = new Date(ts); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
let copiedId = null;
function renderChat() {
  const empty = S.chat.length === 0;
  syncNewBtn();
  const body = empty
    ? `<div class="empty-hello"><div class="t">${EMPTY_TITLE}</div>${S.chatOn ? "" : `<div class="s">채팅 사용 불가(AI 키 없음)</div>`}</div>`
    : S.chat.map((m, i) => {
      const prev = S.chat[i - 1];
      const day = !prev || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString() ? `<div class="day">${dayLabel(m.ts)}</div>` : "";
      let main;
      if (m.role === "user") main = sentAttHtml(m, i) + (m.text.trim() ? `<div class="ubub">${esc(m.text)}</div>` : "");
      else if (m.err) main = `<div class="errcard">${esc(m.text)}${m.retry != null ? `<div><button class="retry" data-retry="${i}" ${S.chatBusy ? "disabled" : ""}>다시 시도</button></div>` : ""}</div>`;
      else main = `<div class="arow"><div>${esc(m.text)}</div>${m.facts?.length ? `<div class="facts">${m.facts.map((f) => `<div>${esc(f)}</div>`).join("")}</div>` : ""}${m.changes?.length ? `<div class="cap">바꾼 값 · ${esc(m.changes.join(" · "))}</div>` : ""}${m.sum ? `<div class="cap">${esc(m.sum)}</div>` : ""}${m.unverified?.length ? `<div class="cap">화면 자료로 확인되지 않은 숫자 · ${esc(m.unverified.join(", "))}</div>` : ""}</div>`;
      const tools = m.err ? "" : `<div class="tools ${m.role === "user" ? "u" : "a"}"><button class="tool ${copiedId === i ? "done" : ""}" data-copy="${i}" aria-label="복사">${icon(copiedId === i ? "checkmark" : "copy-outline")}</button></div>`;
      return `<div class="turn">${day}${main}${tools}</div>`;
    }).join("")
    + (S.chatBusy ? `<div class="waitrow"><span class="wait">${FIRST_PROGRESS_TEXT}</span></div>` : "");
  $("#msgs").innerHTML = `<div class="msgs-in ${empty ? "empty" : ""}">${body}</div>`;
  $("#msgs").scrollTop = 1e9;
  syncInput();
}
// 입력줄 단추 — 글이 있으면 [보내기], 없으면 숨김(웹 규칙). 마이크는 브라우저가 받아쓰기를 지원할 때만
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
function syncInput() {
  const t = $("#chat-input");
  const can = S.chatOn && !S.chatBusy && (t.value.trim() !== "" || S.att.length > 0);
  $("#chat-send").hidden = !can;
  $("#chat-add").hidden = !S.chatOn;
  const mic = $("#chat-mic");
  mic.hidden = !SR || !S.chatOn;
  mic.classList.toggle("on", !!rec);
  mic.innerHTML = icon(rec ? "stop-circle" : "mic-outline");
  mic.setAttribute("aria-label", rec ? "음성 입력 중지" : "음성으로 입력");
  t.placeholder = rec ? "듣고 있어요" : "메시지 입력";
  t.style.height = "auto"; t.style.height = `${Math.min(160, t.scrollHeight)}px`;
}
function toggleMic() {
  if (!SR) return;
  if (rec) { rec.stop(); return; }
  const t = $("#chat-input"), base = t.value.trim();
  rec = new SR(); rec.lang = "ko-KR"; rec.interimResults = true; rec.continuous = false;
  rec.onresult = (e) => { let said = ""; for (const r of e.results) said += r[0].transcript; t.value = (base ? `${base} ` : "") + said; syncInput(); };
  rec.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") status(`음성 입력을 못 했어요(${e.error})`); };
  rec.onend = () => { rec = null; syncInput(); };
  rec.start(); syncInput();
}

// ── 첨부(대표 11/09) — 사진·PDF·엑셀·CSV·글 파일. [+]·붙여넣기(⌘V)·끌어 놓기 셋 다 같은 첨부 줄로 ──
//   한도는 서버(server/attach.ts ATTACH_LIMITS)와 같다. 사진은 앱(photoPick SHRINK)과 같은 긴변 1280·JPEG 0.8 로 줄여 보낸다
//   (작은 PNG·JPG·WEBP 는 그대로 — 화면 캡처 글자가 뭉개지지 않게). 무엇을 읽을지는 서버·AI 몫이고, 여기는 담고 줄이고 보여 주기만.
const ATTACH = { count: 5, imageBytes: 10 << 20, fileBytes: 20 << 20, totalBytes: 32 << 20, longSide: 1280, quality: 0.8 };
const ATT_SHEET = ["xlsx", "xls", "xlsm"], ATT_TEXT = ["csv", "tsv", "txt", "md", "json", "log"];
const attExt = (n) => (String(n).match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
function attKind(f) {
  const e = attExt(f.name), t = (f.type || "").toLowerCase();
  if (e === "pdf" || t === "application/pdf") return "pdf";
  if (ATT_SHEET.includes(e)) return "sheet";
  if (ATT_TEXT.includes(e)) return "text";
  if (t.startsWith("image/")) return "image";
  if (t.includes("spreadsheetml") || t === "application/vnd.ms-excel") return "sheet";
  if (t.startsWith("text/") || t === "application/json") return "text";
  return null;
}
const ATT_KO = { image: "사진", pdf: "PDF", sheet: "엑셀", text: "파일" };
const mbText = (n) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const dataBytes = (d) => Math.floor((d.length - d.indexOf(",") - 1) * 3 / 4);
const readDataUrl = (f) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(f); });
async function shrinkImage(f) {
  const bmp = await createImageBitmap(f);   // 브라우저가 못 여는 형식(크롬의 HEIC 등)은 여기서 실패
  const long = Math.max(bmp.width, bmp.height);
  if (long <= ATTACH.longSide && ["image/png", "image/jpeg", "image/webp"].includes(f.type) && f.size <= 2 << 20) { bmp.close(); return readDataUrl(f); }
  const k = Math.min(1, ATTACH.longSide / long);
  const c = Object.assign(document.createElement("canvas"), { width: Math.max(1, Math.round(bmp.width * k)), height: Math.max(1, Math.round(bmp.height * k)) });
  const g = c.getContext("2d");
  const png = f.type === "image/png";
  if (!png) { g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, c.width, c.height); }   // 투명 바탕 → JPEG 검정 방지
  g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
  const out = png ? c.toDataURL("image/png") : "";
  return out && dataBytes(out) <= 3 << 20 ? out : c.toDataURL("image/jpeg", ATTACH.quality);   // 사진을 PNG 로 저장한 것은 JPEG 로
}
let attSeq = 0, attNoteT = 0;
function attNote(t) {
  const el = $("#chat-attnote"); el.textContent = t; el.hidden = !t;
  clearTimeout(attNoteT); if (t) attNoteT = setTimeout(() => { el.hidden = true; }, 8000);
}
async function addFiles(list) {
  if (!S.chatOn) return;
  const errs = [];
  for (const f of [...list]) {
    if (S.att.length >= ATTACH.count) { errs.push(`첨부는 한 번에 ${ATTACH.count}개까지예요`); break; }
    const kind = attKind(f);
    const name = !f.name || /^image\.(png|jpe?g|gif|webp)$/i.test(f.name) ? `붙여넣은 사진 ${++attSeq}.${(f.type.split("/")[1] || "png").replace("jpeg", "jpg")}` : f.name;
    if (!kind) { errs.push(`${name}: 읽을 수 없는 형식이에요(사진·PDF·엑셀·CSV·글 파일)`); continue; }
    if (kind !== "image" && f.size > ATTACH.fileBytes) { errs.push(`${name}: ${mbText(f.size)} — ${mbText(ATTACH.fileBytes)}까지예요`); continue; }
    let data;
    try { data = kind === "image" ? await shrinkImage(f) : await readDataUrl(f); }
    catch { errs.push(`${name}: 열지 못했어요${/hei[cf]/i.test(f.type + f.name) ? "(HEIC 사진은 JPG 로 바꿔 주세요)" : ""}`); continue; }
    const size = dataBytes(data);
    if (kind === "image" && size > ATTACH.imageBytes) { errs.push(`${name}: 사진이 너무 커요`); continue; }
    if (S.att.reduce((s, a) => s + a.size, 0) + size > ATTACH.totalBytes) { errs.push(`${name}: 첨부 합계가 ${mbText(ATTACH.totalBytes)}를 넘어요`); continue; }
    const type = kind === "image" ? data.slice(5, data.indexOf(";")) : f.type || "";
    S.att.push({ id: ++attSeq, kind, name: kind === "image" && type === "image/jpeg" ? name.replace(/\.(png|webp|gif|hei[cf]|bmp|tiff?)$/i, ".jpg") : name, type, size, data });
    renderAtt();
  }
  attNote(errs.join("\n"));
}
// 첨부 줄 — 라이브 composerAttachRow 모양: 사진 56 썸네일(누르면 크게)·파일은 이름 칩, 오른쪽 위 × 로 하나씩 뺀다
function renderAtt() {
  syncNewBtn();
  const box = $("#chat-att");
  box.hidden = !S.att.length;
  box.innerHTML = S.att.map((a, i) => a.kind === "image"
    ? `<div class="athumb"><button type="button" class="aimg" data-attview="${i}" aria-label="첨부한 ${i + 1}번째 사진 크게 보기"><img src="${esc(a.data)}" alt=""></button><button type="button" class="ax" data-attdel="${i}" aria-label="첨부한 ${i + 1}번째 사진 빼기">${icon("close")}</button></div>`
    : `<div class="athumb file" title="${esc(a.name)}">${icon("document-text-outline")}<div class="m"><div class="n">${esc(a.name)}</div><div class="s">${ATT_KO[a.kind]} · ${mbText(a.size)}</div></div><button type="button" class="ax" data-attdel="${i}" aria-label="${esc(a.name)} 빼기">${icon("close")}</button></div>`).join("");
  syncInput();
}
// 보낸 말의 첨부 — 사진 한 장은 200 정사각(라이브 userImage), 여러 장은 96, 파일은 이름 칩
function sentAttHtml(m, i) {
  if (!m.att?.length) return "";
  // 사진 줄과 파일 줄을 나눈다 — 한 줄에 섞으면 파일 칩이 사진 높이(200)로 늘어난다
  const row = (want, cls) => { const h = m.att.map((a, k) => [a, k]).filter(([a]) => (a.kind === "image") === want); return h.length ? `<div class="uatt ${cls}">${h.map(([a, k]) => want
    ? `<button type="button" class="ui" data-msgimg="${i}:${k}" aria-label="보낸 사진 크게 보기"><img src="${esc(a.data)}" alt=""></button>`
    : `<div class="uf" title="${esc(a.name)}">${icon("document-text-outline")}<div class="m"><div class="n">${esc(a.name)}</div><div class="s">${ATT_KO[a.kind]} · ${mbText(a.size)}</div></div></div>`).join("")}</div>` : ""; };
  return row(true, m.att.filter((a) => a.kind === "image").length > 1 ? "multi" : "") + row(false, "files");
}
// 앞 대화 — ChatGPT 처럼 처음부터 통째로, 앞서 보낸 첨부도 그 자리에 다시 싣는다(대표 11/09).
//   첨부 내용은 새것부터 HIST_ATT_BYTES(서버 HIST_LIMITS.attBytes 와 같은 값)까지만 싣고, 그보다 오래된 것은 이름만 — 보내는 양이 끝없이 커지지 않게.
//   서버(chat.ts historyInput)가 같은 규칙으로 한 번 더 거르고, 글이 너무 길면 가장 오래된 말부터 뺀다.
//   답 쪽에는 그때 실제로 바꾼 값을 붙인다 — AI 가 자기가 앞에서 무엇을 바꿨는지 알게.
const HIST_ATT_BYTES = 24 << 20, HIST_IMAGES = 20;
function historyFor(msgs, curBytes) {
  let bytes = curBytes, images = 0;
  const out = [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== "user") {
      const did = [m.changes?.length ? `[화면에서 바꾼 값: ${m.changes.join(" · ")}]` : "", m.facts?.length ? `[화면에 보인 값: ${m.facts.join(" · ")}]` : "", m.memo ? `[찾아본 것: ${m.memo}]` : ""].filter(Boolean).join("\n");
      out.push({ role: "assistant", text: m.text + (did ? `\n${did}` : "") });
      continue;
    }
    const keep = [], old = [];
    for (const a of m.att ?? []) {
      const img = a.kind === "image" ? 1 : 0;
      if (bytes + a.size <= HIST_ATT_BYTES && images + img <= HIST_IMAGES) { keep.push({ name: a.name, type: a.type, data: a.data }); bytes += a.size; images += img; }
      else old.push(`${ATT_KO[a.kind]} ${a.name}`);
    }
    out.push({ role: "user", text: m.text + (old.length ? `\n[예전 첨부 — 오래되어 내용은 빠짐: ${old.join(" · ")}]` : ""), ...(keep.length ? { attachments: keep } : {}) });
  }
  return out.reverse();
}
// 사진 크게 보기 — 아무 데나 누르거나 Esc 로 닫는다
const viewerEl = Object.assign(document.createElement("div"), { className: "viewer", hidden: true });
viewerEl.setAttribute("role", "dialog"); viewerEl.setAttribute("aria-label", "사진 크게 보기");
document.body.appendChild(viewerEl);
function openViewer(a) { viewerEl.innerHTML = `<img src="${esc(a.data)}" alt="${esc(a.name)}"><div class="vn">${esc(a.name)}</div>`; viewerEl.hidden = false; }
function closeViewer() { viewerEl.hidden = true; viewerEl.innerHTML = ""; }
function chainSummary() { return `지금 설계 ${STAGES.map((s) => stepVal(s)).join(" → ")}`; }
function changeLabels(changed, result) {
  return changed.map(({ stage, key }) => {
    const f = S.fields[stage].find((x) => x.key === key);
    const v = result?.[stage]?.in?.[key], src = result?.[stage]?.src?.[key];
    const shown = f?.options ? (f.options.find((o) => o.value === String(v))?.label ?? v) : v;
    return `${f?.label ?? key} ${src === "user" ? `${shown ?? "-"}${f?.unit && !f.options ? f.unit : ""}` : "자동"}`;
  });
}
async function say(text, att = []) {
  if ((!text.trim() && !att.length) || S.chatBusy || !S.chatOn) return;
  S.chat.push({ role: "user", text, att, ts: Date.now() }); S.chatBusy = true; renderChat();
  const gen = S.chatGen;
  try {
    const history = historyFor(S.chat.filter((m) => !m.err).slice(0, -1), att.reduce((s, a) => s + a.size, 0));
    const partsCtx = S.parts.q ? `「${S.parts.q}」 결과 ${S.parts.items.slice(0, 5).map((x) => x.name).join(", ")}` : "";
    // 창고 위치·기온도 화면 값이다 — 상담이 읽을 수 있게 같이 보낸다(11/12)
    const site = S.site.place && S.site.climate ? { place: S.site.place, climate: S.site.climate } : null;
    const r = await api("/api/chat", { message: text, history, state: S.state, tab: S.tab, partsCtx, site, attachments: att.map((a) => ({ name: a.name, type: a.type, data: a.data })) });
    if (gen !== S.chatGen) return;   // 기다리는 사이 [새 상담]을 눌렀다 — 옛 상담의 답·값 바꾸기는 버린다
    S.state = r.state; S.result = r.result;
    if (r.parts) { S.parts.q = r.plan.parts_query; S.parts.items = r.parts; S.parts.detail = null; }
    if (r.site) { Object.assign(S.site, { query: r.site.query, places: r.site.places, place: r.site.climate ? r.site.place : null, climate: r.site.climate, busy: false, err: r.site.climate ? null : "기온 자료를 받지 못했어요" }); if (r.site.climate) setField("load", "outdoorC", String(designOut(r.site.climate))); }
    const show = r.show ?? [];
    const tab = r.parts ? "parts" : r.plan.tab !== "keep" ? r.plan.tab : show[0]?.tab ?? S.tab;
    const moved = r.changed.length || r.plan.pick?.stage !== "none";
    const extra = (r.rejected?.length ? `\n(알아듣지 못한 값은 바꾸지 않았어요: ${r.rejected.join(", ")})` : "")
      + (r.attachRejected?.length ? `\n(첨부 중 읽지 못한 것: ${r.attachRejected.join(" · ")})` : "");
    setTab(tab);
    if (show.length) showTargets(show.map((x) => x.id));
    // 물어본 값 — 화면에 보이는 그대로 옮겨 적는다(다른 화면 값은 그 화면 이름과 함께)
    const facts = show.filter((x) => x.asked).map((x) => { const v = x.tab === S.tab ? shownText(x.id) : null; return v ? `${x.label} ${v}` : `${x.label} → ${TABS.find((t) => t.id === x.tab)?.nm ?? x.tab} 화면`; });
    S.chat.push({ role: "bot", text: r.plan.reply + extra, changes: changeLabels(r.changed, r.result), facts, sum: moved ? chainSummary() : null, ts: Date.now(),
      memo: r.memo || "", unverified: r.numCheck && !r.numCheck.ok ? r.numCheck.unknown : null });
    if (r.parts?.length === 1) openPart(r.parts[0].id);
  } catch (e) {
    const why = e.data?.attachRejected?.length ? `첨부를 읽지 못했어요 — ${e.data.attachRejected.join(" · ")}`
      : /너무 커요/.test(e.message) ? e.message : "답변을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.";
    if (gen !== S.chatGen) return;
    S.chat.push({ role: "bot", err: true, retry: text, retryAtt: att, text: why, ts: Date.now() });
    console.error(e);
  }
  S.chatBusy = false; renderChat();
}

// ───────────────────────── 그림 위 부품 정보(대표 11/09) ─────────────────────────
// [data-tip] 에 마우스를 얹으면 정보 상자, [data-link] 가 같은 그림 조각·목록 줄은 함께 강조. 누르면(터치 포함) 상자를 고정, 바깥을 누르거나 Esc 면 닫힘.
const tipEl = Object.assign(document.createElement("div"), { className: "tip", hidden: true });
tipEl.setAttribute("role", "tooltip");
document.body.appendChild(tipEl);
const TIP = { key: null, link: null, pinned: false, x: 0, y: 0 };
function tipHtml(t) {
  return `<div class="tt">${esc(t.title)}</div>${t.rows.map((r) => r.head ? `<div class="th">${esc(r.head)}</div>` : `<div class="tr"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join("")}`;
}
function placeTip() {
  const r = tipEl.getBoundingClientRect(), m = 12;
  let L = TIP.x + 18, T = TIP.y + 18;
  if (L + r.width > innerWidth - m) L = Math.max(m, TIP.x - r.width - 18);
  if (T + r.height > innerHeight - m) T = Math.max(m, TIP.y - r.height - 18);
  tipEl.style.left = `${L}px`; tipEl.style.top = `${T}px`;
}
function markLink(link) {
  TIP.link = link;
  for (const el of document.querySelectorAll(".lk")) el.classList.remove("lk");
  // data-link 는 낱말 여럿(「c:pin c:pipe」) — 얹은 쪽은 첫 낱말로 찾고, 그 낱말을 가진 곳만 강조(목록 「냉매관」 줄은 c:pipe 라 두 관 다)
  if (link) for (const el of document.querySelectorAll(`[data-link~="${CSS.escape(link)}"]`)) el.classList.add("lk");
}
function showTip(el, x, y) {
  const t = TIPS.get(el.dataset.tip); if (!t) return hideTip();
  TIP.key = el.dataset.tip; TIP.x = x; TIP.y = y;
  tipEl.innerHTML = tipHtml(t); tipEl.hidden = false; placeTip();
  markLink(el.dataset.link?.split(" ")[0] || null);
}
function hideTip() { TIP.key = null; TIP.pinned = false; tipEl.hidden = true; markLink(null); }
/** 다시 그린 뒤 — 보던 상자는 새 값으로 바꾸고, 그 조각이 사라졌으면 닫는다 */
function refreshTip() {
  if (TIP.key) {
    const t = TIPS.get(TIP.key);
    if (!t) return hideTip();
    tipEl.innerHTML = tipHtml(t); placeTip();
  }
  markLink(TIP.link);
}
document.addEventListener("pointerover", (e) => {
  if (TIP.pinned) return;
  const el = e.target.closest?.("[data-tip], [data-link]"); if (!el) return;
  if (el.dataset.tip) showTip(el, e.clientX, e.clientY); else markLink(el.dataset.link.split(" ")[0]);
});
document.addEventListener("pointermove", (e) => { if (!TIP.pinned && TIP.key && e.pointerType === "mouse") { TIP.x = e.clientX; TIP.y = e.clientY; placeTip(); } });
document.addEventListener("pointerout", (e) => {
  if (TIP.pinned) return;
  const from = e.target.closest?.("[data-tip], [data-link]"); if (!from) return;
  if (e.relatedTarget && from.contains(e.relatedTarget)) return;
  if (from.dataset.tip) hideTip(); else markLink(null);
});
document.addEventListener("focusin", (e) => {
  const el = e.target.closest?.("[data-tip]"); if (!el || TIP.pinned) return;
  const r = el.getBoundingClientRect(); showTip(el, r.right, r.top);
});
document.addEventListener("focusout", (e) => { if (!TIP.pinned && e.target.closest?.("[data-tip]")) hideTip(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && TIP.key) hideTip(); });

// ───────────────────────── 이벤트 ─────────────────────────
document.addEventListener("click", (e) => {
  if (!viewerEl.hidden) return closeViewer();
  const ad = e.target.closest("[data-attdel]"); if (ad) { S.att.splice(Number(ad.dataset.attdel), 1); renderAtt(); return $("#chat-input").focus(); }
  const av = e.target.closest("[data-attview]"); if (av) return openViewer(S.att[Number(av.dataset.attview)]);
  const mi = e.target.closest("[data-msgimg]"); if (mi) { const [i, k] = mi.dataset.msgimg.split(":").map(Number); const a = S.chat[i]?.att?.[k]; return a && openViewer(a); }
  if (e.target.closest("#chat-add")) return $("#chat-file").click();
  const tp = e.target.closest("[data-tip]");
  // 터치는 얹기가 없어 누르면 고정(바깥을 누르면 닫힘). 마우스는 얹는 동안만
  if (tp) { showTip(tp, e.clientX, e.clientY); TIP.pinned = e.pointerType === "touch" || e.pointerType === "pen"; return; }
  if (TIP.pinned) hideTip();
  const t = e.target.closest("[data-tab]"); if (t) return setTab(t.dataset.tab);
  const ib = e.target.closest("[data-item]"); if (ib) { S.itemOther = false; return setField("load", "item", ib.dataset.item); }
  if (e.target.closest("[data-item-other]")) { S.itemOther = true; setField("load", "item", ""); return; }
  const sg = e.target.closest("[data-seg]"); if (sg) { const [s, k] = sg.dataset.seg.split("."); return setField(s, k, sg.dataset.val); }
  const p = e.target.closest("[data-pick]"); if (p) return pick(p.dataset.pick, p.dataset.model);
  const pl = e.target.closest("[data-place]"); if (pl) return pickPlace(Number(pl.dataset.place));
  if (e.target.closest("[data-replace]")) { S.site.place = null; S.site.climate = null; return render(); }
  const uo = e.target.closest("[data-useout]"); if (uo) return setField("load", "outdoorC", uo.dataset.useout);
  const pt = e.target.closest("[data-part]"); if (pt) return openPart(Number(pt.dataset.part));
  if (e.target.closest("[data-back]")) { S.parts.detail = null; return render(); }
  const cp = e.target.closest("[data-copy]");
  if (cp) { const i = Number(cp.dataset.copy); navigator.clipboard?.writeText(S.chat[i]?.text ?? "").then(() => { copiedId = i; renderChat(); setTimeout(() => { copiedId = null; renderChat(); }, 1500); }); return; }
  const rt = e.target.closest("[data-retry]");
  if (rt) { const i = Number(rt.dataset.retry); const m = S.chat[i]; S.chat.splice(i - 1, 2); return say(m.retry, m.retryAtt ?? []); }
  if (e.target.closest("#chat-mic")) return toggleMic();
  if (e.target.closest("#chat-new")) return newChat();
  if (e.target.closest("#reset-all")) { S.state = fresh(); S.parts = { q: "", items: [], detail: null, busy: false }; S.site = { query: "", places: [], place: null, climate: null, busy: false, err: null }; S.chat = []; S.att = []; renderAtt(); attNote(""); renderChat(); setTab("load"); return compute(); }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.id === "chat-file") { addFiles(el.files).finally(() => $("#chat-input").focus()); el.value = ""; return; }
  S.holdMain = false; S.livePending = false;
  if (el.dataset?.slide) { const [st, k] = el.dataset.slide.split("."); return setField(st, k, el.value); }
  if (el.dataset?.stage) setField(el.dataset.stage, el.dataset.key, el.value.trim());
});
document.addEventListener("keydown", (e) => {
  if (e.target.dataset?.stage && e.key === "Enter") e.target.blur();
  if (e.target.id === "chat-input" && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#chat-form").requestSubmit(); }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "chat-input") return syncInput();
  const sl1 = e.target.closest?.("[data-slide]");
  if (sl1) {   // 끄는 중 — 옆 숫자 칸과 채움 막대만 따라 움직인다
    const [st, k] = sl1.dataset.slide.split(".");
    const box = document.getElementById(`f-${st}-${k}`); if (box) box.value = sl1.value;
    sl1.classList.remove("unset");
    sl1.style.setProperty("--p", `${(sl1.value - sl1.min) / (sl1.max - sl1.min) * 100}%`);
    if (st === "load" && LIVE_KEYS.includes(k)) liveBox(k);
    setField(st, k, sl1.value, true);
  } else if (e.target.dataset?.stage && e.target.tagName === "INPUT") {
    const el = e.target, raw = el.value.trim(), f = S.fields[el.dataset.stage]?.find((x) => x.key === el.dataset.key);
    if (el.dataset.stage === "load" && LIVE_KEYS.includes(el.dataset.key)) liveBox(el.dataset.key);   // 입체도는 서버 기다리지 않고
    // 치다 만 숫자(「-」·빈칸)는 건너뛴다 — 손 떼면(change) 그때 반영
    if (f?.type === "num" ? raw !== "" && Number.isFinite(Number(raw)) : raw !== "") setField(el.dataset.stage, el.dataset.key, raw, true);
  }
});
// 바꾸지 않고 칸을 떠나면 입력 칸을 다시 그려 결과와 맞춘다
document.addEventListener("focusout", (e) => { if (S.holdMain && e.target.dataset?.stage) setTimeout(() => { if (S.holdMain) { S.holdMain = false; render(); } }, 0); });
document.addEventListener("toggle", (e) => { const d = e.target.closest?.("[data-more]"); if (d) S.open[d.dataset.more] = d.open; }, true);
document.addEventListener("submit", (e) => {
  if (e.target.id === "site-form") { e.preventDefault(); const q = $("#site-q").value.trim(); if (q) searchSite(q); return; }
  if (e.target.id === "parts-form") { e.preventDefault(); searchParts($("#parts-q").value.trim()); }
  if (e.target.id === "chat-form") {
    e.preventDefault(); const v = $("#chat-input").value;
    if ((!v.trim() && !S.att.length) || S.chatBusy) return;
    if (rec) rec.stop();
    const att = S.att; S.att = []; $("#chat-input").value = ""; renderAtt(); attNote("");
    say(v, att);
  }
});
// 붙여넣기 — 클립보드에 사진·파일이 있으면 첨부 줄로. 설계 칸(다른 입력칸)에 붙이는 것은 그 칸 몫이라 건드리지 않는다.
//   엑셀·워드에서 칸을 복사하면 글과 함께 그림도 실려 온다 — 그때는 글로 붙인다(표 글자를 그림으로 보내지 않게).
document.addEventListener("paste", (e) => {
  const dt = e.clipboardData; if (!S.chatOn || !dt) return;
  const files = [...dt.items].filter((it) => it.kind === "file").map((it) => it.getAsFile()).filter(Boolean);
  if (!files.length) return;
  const inChat = e.target.id === "chat-input";
  if (!inChat && e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  if (dt.getData("text/plain").trim() && /urn:schemas-microsoft-com:office|<table/i.test(dt.getData("text/html"))) return;
  e.preventDefault();
  addFiles(files).finally(() => $("#chat-input").focus());
});
// 끌어 놓기 — 화면 어디에 놓아도 채팅 첨부로(브라우저가 파일을 열어 버리지 않게). 끄는 동안 채팅 칸에 놓을 자리 표시
let dragDepth = 0;
const dragHasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
document.addEventListener("dragenter", (e) => { if (!dragHasFiles(e) || !S.chatOn) return; dragDepth++; $("#chat").classList.add("dropping"); });
document.addEventListener("dragleave", (e) => { if (!dragHasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $("#chat").classList.remove("dropping"); });
document.addEventListener("dragover", (e) => { if (!dragHasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = S.chatOn ? "copy" : "none"; });
document.addEventListener("drop", (e) => {
  if (!dragHasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; $("#chat").classList.remove("dropping");
  if (S.chatOn) addFiles(e.dataTransfer.files).finally(() => $("#chat-input").focus());
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !viewerEl.hidden) closeViewer(); });

(async function init() {
  $("#chat-send").innerHTML = icon("arrow-up");
  $("#chat-add").innerHTML = icon("add");
  $("#reset-all").innerHTML = `${icon("refresh-outline")}처음부터`;
  const sc = await api("/api/schema");
  S.fields = sc.fields; S.items = sc.items; S.chatOn = sc.chat;
  renderChat();
  const [h, q] = location.hash.slice(1).split("?q=");
  if (TABS.some((t) => t.id === h)) S.tab = h;
  await compute();
  if (h === "parts" && q) searchParts(decodeURIComponent(q));
})();

// 칸 경계 끌어서 폭 조절(대표 11/08) — 이웃 두 칸의 폭만 바꾸고 합은 그대로. 폭은 비율(flex-grow)로 두어 창 크기가 바뀌어도 비율 유지.
(function splitters() {
  const body = document.querySelector(".body"), KEY = "designweb.cols", MIN = 200;
  const panes = () => [...body.children].filter((el) => !el.classList.contains("gutter"));
  const visible = (el) => el && !el.hidden && el.offsetWidth > 0;
  const near = (g, dir) => { let el = g[dir]; while (el && (el.classList.contains("gutter") || !visible(el))) el = el[dir]; return el; };
  const fx = (w) => `${w} ${w} ${w}px`; // 기준 폭=끈 폭, 창이 커지거나 줄면 폭에 비례해 나눔
  const apply = (map) => { for (const el of panes()) { const w = map[el.id]; if (w) { el.style.flex = fx(w); el.classList.add("sized"); } } };
  try { const saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved) apply(saved); } catch {}
  const save = () => { const m = {}; for (const el of panes()) if (visible(el)) m[el.id] = Math.round(el.getBoundingClientRect().width); try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {} };
  body.addEventListener("pointerdown", (e) => {
    const g = e.target.closest(".gutter"); if (!g) return;
    // 두 번 누르면 처음 폭으로
    if (g._t && e.timeStamp - g._t < 350) { g._t = 0; for (const el of panes()) { el.style.flex = ""; el.classList.remove("sized"); } try { localStorage.removeItem(KEY); } catch {} return; }
    g._t = e.timeStamp;
    const a = near(g, "previousElementSibling"), b = near(g, "nextElementSibling"); if (!a || !b) return;
    e.preventDefault(); g.setPointerCapture(e.pointerId); g.classList.add("drag"); document.body.classList.add("resizing");
    // 끌기 시작할 때 보이는 칸 전부를 지금 폭(px 비율)으로 고정 — 다른 칸은 안 움직인다
    const m = {}; for (const el of panes()) if (visible(el)) m[el.id] = el.getBoundingClientRect().width; apply(m);
    const x0 = e.clientX, wa = a.getBoundingClientRect().width, wb = b.getBoundingClientRect().width, sum = wa + wb;
    const move = (ev) => { const na = Math.max(MIN, Math.min(sum - MIN, wa + ev.clientX - x0)); a.style.flex = fx(na); b.style.flex = fx(sum - na); };
    const up = () => { g.classList.remove("drag"); document.body.classList.remove("resizing"); g.removeEventListener("pointermove", move); save(); };
    g.addEventListener("pointermove", move); g.addEventListener("pointerup", up, { once: true }); g.addEventListener("pointercancel", up, { once: true });
  });
})();

// ── 분할 컨트롤의 흰 판(애플 형식, 대표 11/10) ──
// 화면은 계산이 올 때마다 innerHTML 로 통째로 다시 그려진다. CSS 전환에 맡기면 다시 그릴 때 움직임이 끊기고
// 한 프레임 판 없는 모양이 비쳐 깜빡였다(11/10 대표 「움직임 없음·잔상·진동」). 그래서 판 자리를 키별로 코드가 들고
// 매 프레임 지금 있는 통에 넣는다 — 통이 새로 생겨도 움직임은 이어진다.
// 관찰기는 그리기 직후(같은 프레임, 그리기 전)에 불려 판 없는 프레임이 생기지 않는다.
const SEG_MS = 320;
const segState = new Map();   // key → { x, w, fx, fw, tx, tw, t0 }
const segKey = (g) => (g.classList.contains("seg") ? "tabs" : g.dataset.fk);
const segEase = (p) => 1 - Math.pow(1 - p, 4);
let segLoop = 0;
function segPaint(g, st) {
  g.style.setProperty("--tx", `${st.x}px`); g.style.setProperty("--tw", `${st.w}px`);
  if (!g.classList.contains("thumbed")) g.classList.add("thumbed");
}
function segFrame() {
  let moving = false;
  for (const g of document.querySelectorAll(".seg.thumbed, .chips.segctl.thumbed")) {
    const st = segState.get(segKey(g)); if (!st || st.t0 == null) continue;
    const p = Math.min(1, Math.max(0, (performance.now() - st.t0) / SEG_MS)), e = segEase(p);   // rAF 시각은 누른 시각보다 앞설 수 있어 직접 잼
    st.x = st.fx + (st.tx - st.fx) * e; st.w = st.fw + (st.tw - st.fw) * e;
    if (p >= 1) st.t0 = null; else moving = true;
    segPaint(g, st);
  }
  segLoop = moving ? requestAnimationFrame(segFrame) : 0;
}
function segThumbs(jump = false) {
  for (const g of document.querySelectorAll(".seg, .chips.segctl")) {
    const on = g.querySelector(".on");
    if (!on || !g.offsetParent) { g.classList.remove("thumbed"); continue; }
    // 자리는 통 기준으로 잰다(offsetLeft 는 기준 요소가 바뀌면 엉뚱한 값이 나옴)
    const gr = g.getBoundingClientRect(), r = on.getBoundingClientRect();
    const key = segKey(g), val = on.dataset.val ?? on.dataset.tab ?? on.textContent, tx = r.left - gr.left, tw = r.width;
    let st = segState.get(key);
    if (!st || jump || (st.val === val && st.t0 == null)) { st = { x: tx, w: tw, tx, tw, t0: null, val }; segState.set(key, st); }   // 처음·폭만 바뀜 → 바로 맞춤
    else if (st.val !== val) {
      Object.assign(st, { fx: st.x, fw: st.w, tx, tw, t0: performance.now(), val });   // 고른 값이 바뀜 → 지금 보이는 자리에서 새 자리로
      if (!segLoop) segLoop = requestAnimationFrame(segFrame);
    } else { st.tx = tx; st.tw = tw; }   // 움직이는 중 폭이 바뀌면 도착점만 고침
    segPaint(g, st);
  }
}
new MutationObserver(() => segThumbs())
  .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
window.addEventListener("resize", () => segThumbs(true));
// 칸 경계를 끌어 폭이 바뀌어도 판 자리를 다시 잰다
const segRO = new ResizeObserver(() => segThumbs(true));
["#tabsbar", "#main", "#side", "#viz"].forEach((q) => { const el = document.querySelector(q); if (el) segRO.observe(el); });

// ── 새 상담(대표 11/10) — 대화·첨부·입력 글만 비운다. 설계 값은 그대로(전부 비우기는 위 막대 [처음부터]) ──
function newChat() {
  S.chatGen++; S.chat = []; S.chatBusy = false; S.att = [];
  const t = $("#chat-input"); if (t) { t.value = ""; t.dispatchEvent(new Event("input")); }
  renderAtt(); attNote(""); renderChat(); t?.focus();
}
{ const b = document.querySelector("#chat-new"); if (b) b.innerHTML = icon("create-outline"); }
// 비울 것이 없으면 흐리게(iOS 꺼진 단추)
function syncNewBtn() { const nb = $("#chat-new"); if (nb) nb.disabled = S.chat.length === 0 && S.att.length === 0 && !$("#chat-input")?.value; }
document.querySelector("#chat-input")?.addEventListener("input", syncNewBtn);
