// RChatAI 냉동 설계 — 화면. 상태(손님이 정한 칸 값·고른 모델)만 들고 있고, 계산은 전부 서버(상담 엔진)가 한다.
// 모양은 RChatAI 앱 규칙 그대로(app/src/lib/theme.ts·components/tools/Form.tsx·components/chat/ChatScreenV2.tsx):
//   SectionLabel + Card, 왼쪽 라벨·오른쪽 회색 숫자 상자, 알약 칩, 카드 모양 펼침, 잉크 검정 주 버튼, 상담은 답변 무배경·내 말 검정 말풍선.
import { ICONS } from "./icons.js";
import { TIPS, cycleFigure, unitLink, coolerFigure, txvFigure } from "./figures.js";
import { createPartMap } from "./partmap.js";
import { viewHow, viewData } from "./explain.js";
import { createSpec } from "./spectable.js";
import { planRoute, playRoute, navList } from "./route.js";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n, d = 0) => (n == null || !Number.isFinite(Number(n)) ? "-" : Number(n).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const won = (n) => (n == null ? "가격 문의" : `${fmt(n)}원`);
// 마력 — 회사 품목에 표기가 없어 품명 모터 코드로 추정한 값은 「추정」(엔진 hp_guessed, 11/09)
const hpLabel = (x) => (x?.hp == null ? "-마력" : `${hpText(x.hp)}${x.hp_guessed ? "(추정)" : ""}`);
const HP_FRAC = { 0.25: "1/4", 0.333: "1/3", 0.375: "3/8", 0.5: "1/2", 0.625: "5/8", 0.75: "3/4" };
const hpText = (h) => `${HP_FRAC[Math.round(h * 1000) / 1000] ?? h}마력`;   // 댄포스 소형 분수 마력(0.333 → 1/3마력)
const icon = (n, cls = "") => (ICONS[n] ?? "").replace("<svg ", `<svg class="ic ${cls}" aria-hidden="true" `);

const STAGES = ["load", "comp", "unit", "cooler", "txv"];
const TABS = [
  { id: "parts", nm: "부품 검색" },
  { id: "load", nm: "부하계산" },
  { id: "comp", nm: "압축기" },
  { id: "unit", nm: "유니트" },
  { id: "cooler", nm: "유닛쿨러" },
  { id: "txv", nm: "팽창변" },
  { id: "quote", nm: "견적" },
];
const fresh = () => ({ load: { in: {} }, comp: { in: {}, pick: null }, unit: { in: {} }, cooler: { in: {}, pick: null }, txv: { in: {}, pick: null } });
// 부품 검색 — 글자로 찾기(q, 결과 = 제품 목록 + 지도 표시) · 지도에서 고른 품번(pick) · 오른쪽 칸 제품 상세(detail)
// view: map(부품 지도) · how(찾는 과정) · data(데이터 현황) — 대표 11/15 · how/data = 그 화면 자료(explain.js)
// nav = 지도 길 안내(대표 11/15) { steps, at, fast } · add = 갈림길에서 고른 값 [{item, value, said}]
const freshParts = () => ({ q: "", items: [], detail: null, busy: false, pick: null, lit: 0, seq: 0, view: "map", how: null, data: null, nav: null, navPending: false, add: [], log: [], prevSteps: null, logN: 0 });
const S = {
  fields: null, chatOn: false, state: fresh(), result: null, tab: "load", seq: 0, open: {},
  modelCustom: new Set(), modelSeen: new Map(),   // 「직접 입력…」을 고른 모델 칸(stage.key)
  mainView: (() => { try { return localStorage.getItem("designweb.mainView") === "fig" ? "fig" : "3d"; } catch { return "3d"; } })(),   // 가운데 큰 칸 3D | 계통도
  parts: freshParts(),
  site: { query: "", places: [], place: null, climate: null, busy: false, err: null },
  chat: [], chatBusy: false, chatGen: 0, lastVals: new Map(),
  att: [],   // 보내기 전 첨부(사진·파일) — [보내기]로 글과 함께 나간다
};

// ───────────────────────── 서버 ─────────────────────────
// 배포본(깃허브 Pages): config.js 의 DW_CFG.api(Supabase 함수 주소)·anon 키로 부르고, 관문 비밀번호를 x-dw-pw 로 싣는다.
// 로컬: DW_CFG 가 비어 있어 같은 주소의 /api 를 부른다(비밀번호 없음).
const PTR = { down: false, slide: false, pending: false };   // 누름 상태 — render·ptrUp 이 쓴다
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
/** 채팅 — 진행 문구를 흘려받는 호출(대표 11/14). 서버가 text/event-stream 으로 답하면 progress 마다 onProgress, done 이면 최종 답.
 *  배포 함수처럼 한 번에(JSON) 답하는 곳이면 그대로 JSON 을 받는다 */
async function apiStream(path, body, onProgress) {
  const headers = { "content-type": "application/json", accept: "text/event-stream, application/json" };
  if (CFG.api) {
    if (!PW) await askPw();
    Object.assign(headers, { authorization: `Bearer ${CFG.anon}`, apikey: CFG.anon, "x-dw-pw": encodeURIComponent(PW) });
  }
  const r = await fetch((CFG.api || "") + path, { method: "POST", headers, body: JSON.stringify(body) });
  if (!(r.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const j = await r.json().catch(() => ({}));
    if (CFG.api && r.status === 401 && j.auth === false) { await askPw(j.error); return apiStream(path, body, onProgress); }
    if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { data: j });
    return j;
  }
  const rd = r.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let k;
    while ((k = buf.indexOf("\n\n")) >= 0) {
      const blk = buf.slice(0, k); buf = buf.slice(k + 2);
      const type = /^event: (.+)$/m.exec(blk)?.[1], data = /^data: (.*)$/m.exec(blk)?.[1];
      let j = {}; try { j = JSON.parse(data ?? "{}"); } catch {}
      if (type === "progress") onProgress?.(j.text ?? "");
      else if (type === "done") return j;
      else if (type === "error") throw Object.assign(new Error(j.error || "채팅 오류"), { data: j });
    }
  }
  throw new Error("답이 중간에 끊겼어요");
}
/** 기다리는 줄 문구(대표 11/14) — 새 문구는 줄을 세워 하나에 최소 0.9초씩 보인다(같은 순간 몇 줄이 몰려와도 읽히게).
 *  너무 밀리면 가운데 문구는 건너뛰고 가장 새 문구로. 바뀔 때는 옅게 사라졌다 나타남 */
const PROG_MIN_MS = 900;
const PQ = { q: [], shownAt: 0, t: 0 };
function setChatProgress(t) {
  S.chatProgressAt = Date.now();
  if (t === (PQ.q[PQ.q.length - 1] ?? S.chatProgress)) return;
  PQ.q.push(t); if (PQ.q.length > 2) PQ.q.splice(0, PQ.q.length - 2);
  pumpProgress();
}
function pumpProgress() {
  clearTimeout(PQ.t);
  if (!PQ.q.length) return;
  const wait = PQ.shownAt + PROG_MIN_MS - Date.now();
  if (wait > 0) { PQ.t = setTimeout(pumpProgress, wait); return; }
  const t = PQ.q.shift(); S.chatProgress = t; PQ.shownAt = Date.now();
  const el = document.querySelector("#msgs .waitrow .wait");
  if (el && el.dataset.t !== t) { el.classList.add("swap"); setTimeout(() => { el.textContent = t; el.dataset.t = t; el.classList.remove("swap"); }, 160); }
  if (PQ.q.length) PQ.t = setTimeout(pumpProgress, PROG_MIN_MS);
}
function resetProgress() { clearTimeout(PQ.t); PQ.q = []; PQ.shownAt = Date.now(); S.chatProgress = null; }

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
    if (my !== S.seq) return true;
    S.result = res; render();
    return true;
  } catch (e) { status(`계산하지 못했습니다: ${e.message}`); return false; }
  finally { if (my === S.seq) setBusy(false); }
}
let timer = null;
const computeSoon = () => { clearTimeout(timer); timer = setTimeout(compute, 20); };
function setBusy(b) { $("#status").textContent = b ? "계산 중…" : ""; }
function status(t) { const el = $("#status"); el.textContent = t; el.title = t || ""; }   // 머리 줄에선 한 줄로 줄여 보이고(11/28) 마우스를 올리면 전체
// 사양 표 보기(대표 11/16) — 상태·그리기·손은 spectable.js 가 맡는다. 품번을 지도에서 보려면 부품 지도 보기로 바꾸고 그 품번을 고른다
const SPEC = createSpec({ api, render: () => render(), status, toMap: (d) => {
  S.parts.view = "map"; render();
  PM?.pick(d.id); if (PM?.ready()) PM.navFly([d.id], { ms: 600, pad: 0.3, spot: false });
  pickVariant([d.id, d.modelNo, d.price, 0, d.brand ?? "", d.partId ?? null, d.modelName ?? null], d.tableName ?? "");
} });

// ── 처음부터 채워야 하는 값(대표 11/14 「채워야 하는 값은 모두 처음부터 빈칸」 — 11/05 시공자 질문 지도의 꼭 묻기) ──
//   손님(시공자)이 직접 넣기 전에는 칸을 비워 두고(옅은 예시만), 결과·그림·다음 단계·견적을 보여 주지 않는다 — 기본 창고로 견적이 나가지 않게
const REQ_KEYS = ["roomC", "pyeong", "w", "d", "h", "insulMm", "item"];
const hasIn = (k) => { const v = S.state?.load?.in?.[k]; return v != null && String(v).trim() !== ""; };
const REQ = [
  { nm: "고내온도", key: "roomC", ok: () => hasIn("roomC") },
  { nm: "창고 크기 (평수, 또는 가로·세로)", key: "pyeong", ok: () => hasIn("pyeong") || (hasIn("w") && hasIn("d")) },
  { nm: "높이", key: "h", ok: () => hasIn("h") },
  { nm: "판넬 두께", key: "insulMm", ok: () => hasIn("insulMm") },
  { nm: "보관 품목", key: "item", ok: () => hasIn("item") },
];
const missingReq = () => REQ.filter((r) => !r.ok());
const loadReady = () => missingReq().length === 0;
// 탭마다 제 값만(대표 11/16 「부하계산이 꼭 먼저가 아니다 — 압축기만 먼저 고정하고 가능한 창고 크기·온도를 찾는 것도」).
//   부하계산이 덜 찼으면 서버가 기본 창고 값을 뒤 탭에 넘기지 않고, 그 탭에서 넣어야 할 칸을 out.need 로 돌려준다 → 결과 위 「넣어야 할 값」 칸
const needOf = (stage) => S.result?.[stage]?.out?.need ?? [];
const isNeed = (stage, key) => needOf(stage).some((n) => n.key === key);
function needCard(stage) {
  const fs = needOf(stage).map((n) => S.fields[stage].find((f) => f.key === n.key)).filter(Boolean).map((f) => fieldHtml(stage, f)).join("");
  return fs ? `${sl("넣어야 할 값")}${card(fs)}` : "";
}
/** 결과가 없을 때 큰 글씨 — 값이 모자란 것과 맞는 모델이 없는 것을 가른다 */
const noneVal = (O) => (O?.need?.length ? "값을 넣어 주세요" : "해당 모델 없음");
/** 이 칸을 비워 보여 줄까 — 필수 칸이고 손님이 아직 안 넣었으면(평수로 가로·세로가 정해졌으면 가로·세로는 보여 줌) */
const blankReq = (stage, key) => stage === "load" && REQ_KEYS.includes(key) && !hasIn(key) && !((key === "w" || key === "d") && hasIn("pyeong"));

// ───────────────────────── 칸(Form.tsx 의 Field·ChoiceRow) ─────────────────────────
function fieldHtml(stage, f) {
  const r = S.result?.[stage];
  const needed = isNeed(stage, f.key);   // 이 탭에서 넣어야 계산되는 칸(대표 11/16)
  const blank = blankReq(stage, f.key) || needed;
  const ex = r?.in?.[f.key];
  const v = blank ? null : ex;
  const src = r?.src?.[f.key];
  const changed = src === "user";
  const id = `f-${stage}-${f.key}`;
  const shown = v == null ? "" : typeof v === "number" ? String(Math.round(v * 1000) / 1000) : String(v);
  const foot = blank ? "" : !changed && src === "link" ? `<div class="sub ok">자동</div>` : "";
  if (f.menu) return menuField(stage, f, v, changed);
  if (f.group === "pin" && f.type === "text" && !S.modelCustom.has(`${stage}.${f.key}`)) return modelField(stage, f, v, changed);
  if (f.type === "enum" && f.options.length <= 4) {
    const cv = v == null && f.options.some((o) => o.value === "auto") ? "auto" : v;   // 「잘 모름」 칩(창고 용도, 11/19)
    return `<div class="crow"><div>${esc(f.label)}</div><div class="chips segctl" role="radiogroup" aria-label="${esc(f.label)}" data-fk="in.${stage}.${f.key}" data-fv="${esc(shown)}">${f.options.map((o) => `<button type="button" role="radio" aria-checked="${String(cv) === o.value}" class="chip ${String(cv) === o.value ? "on" : ""}" data-seg="${stage}.${f.key}" data-val="${esc(o.value)}">${esc(o.label)}</button>`).join("")}</div>${foot}</div>`;
  }
  let box;
  if (f.type === "enum") {
    box = `<div class="numbox wide ${changed ? "changed" : ""}" data-fk="in.${stage}.${f.key}" data-fv="${esc(shown)}"><select id="${id}" data-stage="${stage}" data-key="${f.key}">${f.def === undefined ? `<option value="" ${v == null ? "selected" : ""}>자동</option>` : v == null ? `<option value="">선택</option>` : ""}${f.options.map((o) => `<option value="${esc(o.value)}" ${String(v) === o.value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></div>`;
  } else {
    const isNum = f.type === "num";
    box = `<div class="numbox ${isNum ? "" : "wide"} ${changed ? "changed" : ""}" data-fk="in.${stage}.${f.key}" data-fv="${esc(shown)}"><input id="${id}" ${isNum ? `type="number" inputmode="decimal" step="${f.step ?? "any"}"` : `type="text"`} value="${esc(shown)}" placeholder="${blank ? (ex != null && ex !== "" ? `예: ${esc(ex)}` : "넣어 주세요") : isNum ? "자동" : f.group === "pin" ? "모델명 입력" : "선택 입력"}" data-stage="${stage}" data-key="${f.key}"${f.group === "pin" && !isNum ? ` list="dl-${stage}-${f.key}" autocomplete="off"` : ""}>${f.group === "pin" && !isNum ? modelList(stage, f.key) : ""}${f.unit ? `<span class="u">${esc(f.unit)}</span>` : ""}${f.group === "pin" && !isNum ? `<button type="button" class="txtbtn mlback" data-modelpick="${stage}.${f.key}">목록</button>` : ""}</div>`;
  }
  // 슬라이더 — 숫자 칸에 범위가 있으면 라벨 아래에. 끄는 동안 바로 계산(input → liveCompute), 손을 떼면 전체 계산(change)
  const slider = f.type === "num" && f.range
    ? `<input type="range" class="slider ${v == null ? "unset" : ""}" min="${f.range[0]}" max="${f.range[1]}" step="${f.step ?? 1}" value="${v ?? f.range[0]}" data-slide="${stage}.${f.key}" aria-label="${esc(f.label)} 슬라이더" style="--p:${Math.max(0, Math.min(100, ((v ?? f.range[0]) - f.range[0]) / (f.range[1] - f.range[0]) * 100))}%">`
    : "";
  return `<div class="frow"><div class="lb"><label class="t" for="${id}">${esc(f.label)}${blank ? `<span class="req" aria-label="필수">*</span>` : ""}</label>${foot}</div>${box}${slider}</div>`;   // 슬라이더는 줄 전체 폭(좁은 칸에서도 길게)
}
// 계산 결과에서 목록을 받는 고르기 칸(압축기 마력, 대표 11/11) — 메이커·냉매·단수마다 실제로 있는 마력만, 회사 품목에 없거나 가격 빈칸뿐이면 「주문 제작」
function menuField(stage, f, v, changed) {
  const id = `f-${stage}-${f.key}`, menu = S.result?.[stage]?.out?.[f.menu] ?? [];
  const cur = v == null || v === "" ? null : Number(v);
  const opts = menu.map((m) => ({ value: String(m.hp), label: `${hpText(m.hp)}${m.stock ? "" : " (주문 제작)"}` }));
  if (cur != null && !menu.some((m) => Math.abs(m.hp - cur) < 0.005)) opts.push({ value: String(cur), label: `${hpText(cur)} (이 조건에 없음)` });
  const sel = (o) => cur != null && Math.abs(Number(o.value) - cur) < 0.005;
  return `<div class="frow"><div class="lb"><label class="t" for="${id}">${esc(f.label)}</label></div><div class="numbox wide ${changed ? "changed" : ""}" data-fk="in.${stage}.${f.key}" data-fv="${esc(cur ?? "")}"><select id="${id}" data-stage="${stage}" data-key="${f.key}"><option value="" ${cur == null ? "selected" : ""}>자동</option>${opts.map((o) => `<option value="${esc(o.value)}" ${sel(o) ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></div></div>`;
}
const orderTag = (c) => (c?.order ? " · 주문 제작" : "");
// 「넣어야 할 값」 칸에 세운 칸은 원래 자리에서 뺀다(같은 칸이 두 번 그려지면 id 가 겹친다)
const fieldsOf = (stage, group) => S.fields[stage].filter((f) => (f.group ?? "main") === group && !isNeed(stage, f.key)).map((f) => (stage === "load" && f.key === "item" && S.items ? itemField(f) : fieldHtml(stage, f))).join("");

// ── 면별 조건 표(엑셀 13~15행) — 천정·마루·동·서·남·북 × 외벽온도·열전도율·단열두께. 비우면 공통 값에서 자동 ──
// ───────────────────────── 부품 지정·고정(대표 11/11) ─────────────────────────
// 각 부품 화면 맨 위 「부품 지정」: 메이커·마력·모델 칸 + [고정]. 고정 = 지금 부품의 모델명을 모델 칸에 넣는 것 —
//   모델 칸은 손님 값이라 앞 조건(부하·압축기)이 바뀌어도 그대로 남고, 서버는 그 모델의 여유·부족만 다시 계산한다.
//   유니트는 마력·압축기 모델 두 칸을 지금 값으로 넣는다. [고정 풀기] = 그 칸들을 비워 자동으로.
const chosenModel = (stage) => { const c = S.result?.[stage]?.out?.chosen; return c ? (stage === "comp" ? c.product_id : c.model) : null; };
function modelNames(stage, key) {
  const O = S.result?.[stage]?.out; if (!O) return [];
  const names = stage === "comp" ? [...(O.candidates ?? []), ...(O.nearMiss ?? [])].map((c) => c.product_id)
    : stage === "cooler" ? (O.candidates ?? []).map((c) => c.model)
    : stage === "txv" ? (O.options ?? []).map((o) => o.model)
    : stage === "unit" && key === "compModel" ? [S.result?.comp?.out?.chosen?.product_id, ...(S.result?.comp?.out?.candidates ?? []).map((c) => c.product_id)] : [];
  return [...new Set(names.filter(Boolean))];
}
function modelList(stage, key) {
  return `<datalist id="dl-${stage}-${key}">${modelNames(stage, key).map((n) => `<option value="${esc(n)}">`).join("")}</datalist>`;
}
/** 부품 지정 모델 칸 — 마력 칸처럼 고르기(대표 11/28 「메이커·마력 정하면 모델도 정해지는 거 아니야?」).
 *  비었으면 첫 줄 「자동 — 지금 고른 모델」, 아래는 조건에 맞는 후보(서버 순서 = 판매순), 끝에 「직접 입력…」(목록에 없는 모델) */
function modelField(stage, f, v, changed) {
  // 손님이 정한 값만 「고른 값」 — 앞 단계에서 이어받은 값(link)은 자동으로 본다(유니트 압축기 모델)
  const id = `f-${stage}-${f.key}`, ck = `${stage}.${f.key}`, cur = !changed || v == null || v === "" ? null : String(v);
  const auto = stage === "unit" ? (v ?? S.result?.comp?.out?.chosen?.product_id) : chosenModel(stage);
  // 모델을 정하면 서버 후보가 그 모델 하나로 줄어든다 → 자동일 때 본 목록을 기억해 두고 이어서 보여 준다(다른 후보로 바로 바꾸기)
  let names = modelNames(stage, f.key);
  if (cur == null) S.modelSeen.set(ck, names); else names = [...new Set([...(S.modelSeen.get(ck) ?? []), ...names])];
  if (cur != null && !names.includes(cur)) names.unshift(cur);
  const opts = names.map((n) => `<option value="${esc(n)}" ${cur === n ? "selected" : ""}>${esc(n)}</option>`).join("");
  return `<div class="frow"><div class="lb"><label class="t" for="${id}">${esc(f.label)}</label>${cur == null ? `<div class="sub ok">자동</div>` : ""}</div><div class="numbox wide ${changed ? "changed" : ""}" data-fk="in.${stage}.${f.key}" data-fv="${esc(cur ?? "")}"><select id="${id}" data-stage="${stage}" data-key="${f.key}"><option value="" ${cur == null ? "selected" : ""}>${cur == null && auto ? `자동 — ${esc(auto)}` : "자동"}</option>${opts}<option value="__custom">직접 입력…</option></select></div></div>`;
}
const lockRow = (stage, on, t, sub) => `<div class="lrow pinrow ${on ? "on" : ""}" data-fk="pin.${stage}" data-fv="${on ? "1" : "0"}"><div class="m"><div class="t">${on ? icon("lock-closed-outline") : ""}${esc(t)}</div><div class="sub">${esc(sub)}</div></div><button class="selbtn" data-${on ? "unlock" : "lock"}="${stage}">${on ? "고정 풀기" : "고정"}</button></div>`;
function pinBlock(stage) {
  const R = S.result?.[stage]; if (!R) return "";
  let row = "";
  if (stage === "unit") {
    const D = R.out.draft, cm = R.in.compModel;
    if (R.out.pinned) row = lockRow(stage, true, `고정됨 — ${R.in.hp ?? "-"}마력${cm ? ` · ${cm}` : ""}`, "압축기가 바뀌어도 이 구성 그대로");
    else if (D) row = lockRow(stage, false, `${D.hp}마력${cm ? ` · ${cm}` : ""} 고정`, "압축기가 바뀌어도 이 구성 그대로");
  } else {
    const pinned = R.out.pin?.model, cur = chosenModel(stage);
    if (pinned) row = lockRow(stage, true, `고정됨 — ${pinned}`, "조건이 바뀌어도 이 부품 그대로");
    else if (cur) row = lockRow(stage, false, `${cur} 고정`, "조건이 바뀌어도 이 부품 그대로");
  }
  return `${sl("부품 지정")}${card(fieldsOf(stage, "pin") + row)}`;
}
function lockStage(stage, on) {
  const st = S.state[stage] ??= { in: {} }; st.in ??= {};
  if (stage === "unit") {
    const R = S.result?.unit;
    if (on) { if (R?.out?.draft) st.in.hp = String(R.out.draft.hp); if (R?.in?.compModel) st.in.compModel = R.in.compModel; }
    else { delete st.in.hp; delete st.in.compModel; }
    for (const s of STAGES.slice(STAGES.indexOf("unit"))) if (S.state[s]) S.state[s].pick = null;
    return computeSoon();
  }
  const m = on ? chosenModel(stage) : "";
  if (on && !m) return;
  setField(stage, "model", m);
}
/** 고정·지정 고지 — 결과 칸 경고 줄 */
const pinNotesHtml = (O) => (O?.pinNotes ?? []).map((n) => note(esc(n), "warn")).join("");

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
  let html = `<div class="crow"><div>${esc(f.label)}${hasIn("item") ? "" : `<span class="req" aria-label="필수">*</span>`}</div><div class="chips" data-fk="in.load.item" data-fv="${esc(v)}">`
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
// 고정 중(모델 칸이 찼을 때)엔 [선택]이 듣지 않는다 — 고른 줄에 「고정」 표시만
const selOr = (stage, model, on) => S.result?.[stage]?.out?.pin?.model ? (on ? `<span class="selmark">${icon("lock-closed-outline")}고정</span>` : "") : selCell(stage, model, on);
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
  // 지금 화면 값과 같은 값을 다시 넣는 것은 바꿈이 아니다 — 고른 모델을 풀지 않는다(대표 11/12: 위치를 넣으며 외기온도 40→40 에 고른 압축기가 풀림)
  const f0 = S.fields[stage]?.find((x) => x.key === key), was = S.result?.[stage]?.in?.[key];
  const same = raw !== "" && raw != null && was != null && (f0?.type === "num" ? Number(raw) === Number(was) : String(raw) === String(was));
  if (raw === "" || raw == null) delete st.in[key]; else st.in[key] = raw;
  if (stage === "load" && key === "pyeong" && raw !== "") { delete st.in.w; delete st.in.d; }
  if (stage === "load" && (key === "w" || key === "d") && raw !== "") delete st.in.pyeong;
  // 앞 단계 조건이 바뀌면 그 단계부터 고른 모델을 풀어 준다(새 조건의 첫 후보로)
  if (!same) for (const s of STAGES.slice(STAGES.indexOf(stage))) if (S.state[s]) S.state[s].pick = null;
  const R = S.result?.[stage];
  if (R?.in) {
    const f = S.fields[stage].find((x) => x.key === key);
    R.in[key] = raw === "" || raw == null ? null : f?.type === "num" ? Number(raw) : raw;
    R.src = { ...(R.src ?? {}), [key]: raw === "" || raw == null ? "default" : "user" };
    if (!live) render();
  }
  if (live === "quiet") return;   // 선택지 카드(11/17) — 여러 칸을 넣은 뒤 부른 쪽이 한 번 계산한다
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
  if (id === "load") return loadReady() ? `${fmt(R.load.out.총냉각열량Kw, 1)} kW` : "부하계산 값 남음";
  if (id === "comp") return C?.chosen ? C.chosen.product_id : "없음";
  if (id === "unit") return U?.draft ? `${U.draft.hp}마력` : "없음";
  if (id === "cooler") return K?.chosen ? `${K.chosen.model} ${K.count}대` : "없음";
  if (id === "txv") return T?.chosen ? T.chosen.model : "없음";
  return "";
}
// 위 탭은 셋(대표 11/19 「부하계산·압축기·유니트·유닛쿨러·팽창변을 하나의 탭으로」) — 「설계」 안에서 다섯 단계는 단계 칩으로 고른다.
//   S.tab 은 그대로 단계 이름(load…txv)을 쓴다 — 계산·채팅·안내가 단계 이름으로 이어져 있어서.
const TOP = [{ id: "parts", nm: "부품 검색" }, { id: "design", nm: "설계" }, { id: "quote", nm: "견적" }];
function topBar() {
  const cur = STAGES.includes(S.tab) ? "design" : S.tab;
  return `<div class="stick"><div class="seg" role="tablist">${TOP.map((t) => `<button role="tab" class="${cur === t.id ? "on" : ""}" data-tab="${t.id}">${t.nm}</button>`).join("")}</div></div>`;   // 「지금 설계 …」 줄은 걷음(대표 11/10 「없어도 될 것 같아」) — 채팅 답 아래 요약(chainSummary)은 그대로
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
  // 증발온도를 아직 모르면(압축기만 고정, 대표 11/16) 범위만 그리고 운전점은 찍지 않는다
  if (te == null) te = NaN;
  const hasPt = Number.isFinite(te);
  const xd = [Math.min(...rows.map((r) => r[1]), ...(hasPt ? [te] : [])) - 5, Math.max(...rows.map((r) => r[2]), ...(hasPt ? [te] : [])) + 5];
  const yd = [Math.min(...rows.map((r) => r[0]), tc) - 5, Math.max(...rows.map((r) => r[0]), tc) + 5];
  const xs = scale(xd[0], xd[1], P.l, W - P.r), ys = scale(yd[0], yd[1], H - P.b, P.t);
  const poly = [...rows.map((r) => [r[1], r[0]]), ...rows.slice().reverse().map((r) => [r[2], r[0]])].map(([x, y]) => `${xs(x)},${ys(y)}`).join(" ");
  // 응축온도 열 사이는 선형으로 — 그 응축온도에서의 증발온도 범위 안이면 안
  const at = (() => { for (let i = 0; i < rows.length; i++) { if (rows[i][0] === tc) return rows[i]; if (i && rows[i - 1][0] < tc && tc < rows[i][0]) { const a = rows[i - 1], b = rows[i], f = (tc - a[0]) / (b[0] - a[0]); return [tc, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; } } return null; })();
  const inside = at != null && te >= at[1] - 1e-9 && te <= at[2] + 1e-9;
  const col = inside ? "#191F28" : "#F04452";
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${axes(W, H, P, xs, ys, xd, yd, "증발온도 ℃", "응축온도 ℃")}
    <polygon points="${poly}" fill="#F2F4F6" stroke="#8B95A1" stroke-width="1.5"/>
    ${hasPt ? `<circle cx="${xs(te)}" cy="${ys(tc)}" r="6" fill="${col}"/>
    <text x="${xs(te) + 10}" y="${ys(tc) - 8}" style="fill:${col};font-weight:600">운전점 ${te}/${tc}℃${inside ? "" : " (범위 밖)"}</text>` : ""}</svg>`;
}
function curveSvg(curve, reqKw, te, chosenKw, W = 600) {
  if (!curve?.length) return `<div class="empty">능력 곡선 자료 없음</div>`;
  const H = 260, P = { l: 46, r: 12, t: 12, b: 36 };
  const xd = [curve[0].te, curve[curve.length - 1].te];
  const yMax = Math.max(...curve.map((p) => p.kw), reqKw ?? 0) * 1.1;
  const xs = scale(xd[0], xd[1], P.l, W - P.r), ys = scale(0, yMax, H - P.b, P.t);
  const path = curve.map((p, i) => `${i ? "L" : "M"}${xs(p.te)},${ys(p.kw)}`).join("");
  const inX = te != null && te >= xd[0] && te <= xd[1];
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
function siteCard(R) { return card(siteBody(R)); }
function siteBody(R) {
  const T = S.site, c = T.climate;
  const form = `<form id="site-form" class="searchbox" style="margin-top:8px">${icon("search-outline")}<input id="site-q" value="${esc(T.query)}" placeholder="주소 또는 지역명 (해외 포함)"></form>`;
  let body = "";
  if (T.busy) body = `<div class="sub" style="padding:12px 4px">불러오는 중…</div>`;
  else if (T.err) body = note(esc(T.err), "warn");
  else if (T.places.length && !T.place) body = `<div class="sub" style="padding:8px 4px 0">검색 결과 ${T.places.length}건</div>` + T.places.map((p, i) => `<div class="lrow tap" data-place="${i}"><div class="m"><div class="t">${esc(p.short)}</div><div class="sub">${esc(p.name)} · ${({ address: "주소", city: "도시", town: "읍·면", village: "마을", state: "주·도", province: "도", county: "군", administrative: "행정구역", suburb: "동네", country: "나라" })[p.kind] ?? "장소"} · ${p.lat >= 0 ? "북위" : "남위"} ${Math.abs(p.lat).toFixed(2)} ${p.lon >= 0 ? "동경" : "서경"} ${Math.abs(p.lon).toFixed(2)}</div></div>${icon("chevron-forward", "c2")}</div>`).join("");
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
  return form + body;
}
/** 설계 외기온도 = 연중 최고기온을 5℃ 단위로 올림(대표 11/08) — 48.3 → 50, 36.0 → 40, 45.0 → 45 */
const designOut = (c) => Math.ceil(Math.round(c.hottest.max * 10) / 10 / 5) * 5;
/** 위치 검색은 브라우저에서 Nominatim 을 바로 부른다(2026-11-21) — 배포판 함수(Supabase) IP 는 Nominatim·Photon 둘 다
 *  HTTP 403 으로 막는다. 브라우저 요청은 쓰는 사람 IP·사이트 Referer 로 가서 통과. 실패하면 서버 /api/geocode(로컬은 됨). */
//   OpenStreetMap 은 한국 건물 주소가 따로 없고 입점 가게마다 주소가 붙어 있다 → 「목동동로 100」 을 찾으면 같은 건물 가게 5곳이 나온다(대표 11/28).
//   그래서 ① 가게·건물 같은 장소는 이름 대신 도로명 주소로 보이고(검색어에 그 이름을 넣었으면 이름 유지) ② 같은 주소는 하나로 합친다.
//   ③ 「김해」 처럼 지역 이름만 넣었는데 후보가 공항·학교뿐이면 시·군·읍 같은 지역만 한 번 더 찾아 맨 앞에 둔다(Nominatim featureType=settlement).
const PLACE_KIND = new Set(["country", "state", "province", "region", "county", "city", "town", "village", "hamlet", "municipality", "borough", "city_district", "district", "suburb", "quarter", "neighbourhood", "island"]);
const nows = (s) => String(s ?? "").replace(/\s/g, "");
async function nominatimRows(q, extra = "") {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&addressdetails=1&accept-language=ko${extra}&q=${encodeURIComponent(q)}`,
    { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function placeOf(r, q) {
  const r4 = (x) => Math.round(Number(x) * 10000) / 10000;
  const a = Object.fromEntries(Object.entries(r.address ?? {}).map(([k, v]) => [k, String(v).replace(/[\s,;]+$/, "").trim()])); // 「100,」 처럼 끝에 쉼표 붙은 자료
  const base = { lat: r4(r.lat), lon: r4(r.lon) };
  if (PLACE_KIND.has(r.addresstype)) return { ...base, name: r.display_name, short: r.display_name.split(",").slice(0, 3).map((s) => s.trim()).join(", "), kind: r.addresstype };
  const kr = a.country_code === "kr";
  const street = a.road ? (kr ? `${a.road}${a.house_number ? ` ${a.house_number}` : ""}` : `${a.house_number ? `${a.house_number} ` : ""}${a.road}`) : "";
  const parts = [street, a.quarter ?? a.suburb ?? a.neighbourhood ?? a.village ?? a.town, a.borough ?? a.city_district ?? a.county, a.city, a.province ?? a.state]
    .filter((s, i, arr) => s && arr.indexOf(s) === i);
  const addr = parts.join(", ");
  if (!addr) return { ...base, name: r.display_name, short: r.display_name.split(",").slice(0, 3).map((s) => s.trim()).join(", "), kind: "" };
  const named = r.name && nows(q).includes(nows(r.name));
  return named
    ? { ...base, name: `${r.name} · ${addr}, ${a.country ?? ""}`, short: `${r.name}, ${parts.slice(0, 2).join(", ")}`, kind: "" }
    : { ...base, name: `${addr}, ${a.country ?? ""}`, short: parts.slice(0, 3).join(", "), kind: "address" };
}
async function geocodeBrowser(q) {
  let rows = await nominatimRows(q);
  const isAddrQuery = rows.some((r) => r.address?.road && nows(q).includes(nows(r.address.road)));
  if (!isAddrQuery && !rows.some((r) => PLACE_KIND.has(r.addresstype))) {
    await new Promise((ok) => setTimeout(ok, 1100)); // Nominatim 사용 규칙: 초당 1회 이하
    rows = [...(await nominatimRows(q, "&featureType=settlement").catch(() => [])), ...rows];
  }
  const seen = new Set(), out = [];
  for (const p of rows.map((r) => placeOf(r, q))) { const k = nows(p.short).replace(/,/g, ""); if (!seen.has(k)) { seen.add(k); out.push(p); } }
  return out.slice(0, 5);
}
async function searchSite(q) {
  Object.assign(S.site, { query: q, places: [], place: null, climate: null, busy: true, err: null }); render();
  try {
    S.site.places = await geocodeBrowser(q).catch(async () => (await api(`/api/geocode?q=${encodeURIComponent(q)}`)).items);
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
  el.innerHTML = sceneHtml(v, S.result.load);
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

/** 고정한 압축기·유닛쿨러가 이 부하의 몇 %를 내는지(대표 11/11 — 부품을 먼저 정하고 부하계산 값을 바꿔 맞추는 쓰임) */
function pinVsLoad(L) {
  const PC = S.result?.comp?.out, PK = S.result?.cooler?.out, rows = [];
  let short = false;
  if (PC?.pin?.model && PC.chosen) { const p = PC.chosen.capacity_kw / (L.총냉각열량Kw || 1) * 100; short ||= p < 100; rows.push(rrow(`압축기 ${esc(PC.chosen.product_id)}`, `${fmt(PC.chosen.capacity_kw, 1)} kW · ${fmt(p, 0)}%`, false, "a.load.pin.comp")); }
  if (PK?.pin?.model && PK.chosen) { const k = PK.chosen.kcal * PK.count, p = k / (L.총냉각열량 || 1) * 100; short ||= p < 100; rows.push(rrow(`유닛쿨러 ${esc(PK.chosen.model)} ${PK.count}대`, `${fmt(k)} kcal/h · ${fmt(p, 0)}%`, false, "a.load.pin.cooler")); }
  if (!rows.length) return "";
  // 가능한 창고(대표 11/16) — 고정한 압축기로 맞는 고내온도·평수 표는 압축기 탭에
  if (PC?.fit) rows.push(`<div class="lrow tap" data-tab="comp"><div class="m"><div class="t">이 압축기로 가능한 창고 크기·온도</div><div class="sub">고내온도별 최대 평수 — 누르면 그 값으로 바꿔요</div></div>${icon("chevron-forward", "c2")}</div>`);
  return `${sl("고정한 부품 능력 (부하 대비)")}${card(rows.join(""))}${short ? note("고정한 부품 능력이 부하보다 작습니다 — 입력값을 바꿔 부하를 맞추거나 고정을 풀어 주세요", "warn") : ""}`;
}

// ── 부하계산 장면(대표 11/12 「창고 시각화를 가운데 메인으로, 부분을 누르면 조절창」) ──
//   가운데 = 큰 창고 그림(부분마다 이름표: 그 부분 부하 kcal/h·%), 오른쪽 = 고른 부분의 입력 칸·결과, 왼쪽 채팅은 늘 그대로.
//   값을 바꾸면 바로 다시 계산(liveCompute)하는 것은 그대로 — 그림·이름표 숫자가 따라 바뀐다.
const ZONES = [
  { id: "room", name: "창고", sub: "크기·고내온도", keys: ["roomC", "pyeong", "w", "d", "h"], terms: [] },
  { id: "out", name: "바깥", sub: "창고 위치·외기온도", keys: ["outdoorC"], terms: [] },
  { id: "wall", name: "벽·천정·바닥", sub: "침입열", keys: ["insulMm", "insulationK"], terms: ["침입열"] },
  { id: "door", name: "문·환기", sub: "환기", keys: ["ventCount", "ventLoad"], terms: ["환기"] },
  { id: "goods", name: "상품", sub: "입고품·호흡열", keys: ["item", "inMode", "dailyTon", "inC", "storeC", "prodMethod", "foodWater", "foodProtein", "foodTf", "loadRatePct", "handling", "cpAbove", "cpBelow", "latent", "freezeC", "freezeRatio", "respiration", "capA", "capB"], terms: ["입고품", "호흡열"] },
  { id: "people", name: "작업자", sub: "작업원", keys: ["workers", "workHours", "workerKcal"], terms: ["작업원"] },
  { id: "equip", name: "조명·팬·제상", sub: "전기", keys: ["lampKw", "lampH", "lampKcal", "motorKw", "motorH", "motorKcal", "heaterKw", "heaterH", "heaterKcal"], terms: ["전기"] },
  { id: "run", name: "운전·여유", sub: "운전시간·안전율·증발온도차", keys: ["runHours", "safety", "evapDiff"], terms: [] },
];
const ZONE_COLOR = { room: BLUE, out: ORANGE, wall: TERM.침입열[0], door: "#2FA84F", goods: TERM.입고품[0], people: TERM.작업원[0], equip: "#6B7684", run: "#6B7684" };
const zoneOfKey = (k) => (/^(wallC|k|mm)_/.test(k) ? ZONES.find((z) => z.id === "wall") : ZONES.find((z) => z.keys.includes(k)));
const zoneKcal = (L, z) => z.terms.reduce((a, k) => a + Math.max(0, L?.terms?.find((t) => t.key === k)?.kcal ?? 0), 0);
/** 이름표·고르기 칸에 쓰는 한 줄 값 */
function zoneLine(R, z) {
  const L = R.out, total = L.terms.reduce((a, t) => a + Math.max(0, t.kcal), 0) || 1, v = R.in;
  if (z.id === "room") return `${fmt(v.roomC, 0)}℃ · ${fmt(v.w * v.d / 3.3058, 1)}평`;
  if (z.id === "out") { const nm = S.site.place && S.site.climate ? S.site.place.short.split(",")[0].trim().slice(0, 10) : ""; return `${nm ? `${nm} · ` : ""}외기 ${fmt(v.outdoorC, 0)}℃`; }
  if (z.id === "run") return `운전 ${fmt(v.runHours, 0)}시간 · 안전율 ${v.safety}`;
  const k = zoneKcal(L, z);
  return `${fmt(k)} kcal/h · ${fmt(k / total * 100, 0)}%`;
}

/** 큰 창고 장면 — 등각 투영(whSvg 와 같은 좌표), 벽·문·상품·작업자·쿨러·조명을 그리고 부분마다 이름표를 단다.
 *  이름표·부분을 누르면 그 부분이 골라진다(data-zone). */
function sceneSvg(v, R, zone) {
  const { w, d, h } = v, t = v.insulMm, W = 980, H = 680, PAD = { l: 250, r: 250, t: 110, b: 150 };
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
  const T = Math.min((6 + t / 12) / k, Math.min(w, d, h) * 0.2);
  const C = coldFill(v.roomC);
  const on = (id) => (zone === id ? " on" : "");
  const g = (id, inner) => `<g class="zone${on(id)}" data-zone="${id}">${inner}</g>`;
  // 상자 하나(바닥 위, 보이는 세 면)
  const box = (bx, by, bz, bw, bd, bh, top, left, right) =>
    poly([[bx, by, bz + bh], [bx + bw, by, bz + bh], [bx + bw, by + bd, bz + bh], [bx, by + bd, bz + bh]], top, `stroke="#8A6A3A" stroke-width="1"`)
    + poly([[bx, by + bd, bz], [bx + bw, by + bd, bz], [bx + bw, by + bd, bz + bh], [bx, by + bd, bz + bh]], left, `stroke="#8A6A3A" stroke-width="1"`)
    + poly([[bx + bw, by, bz], [bx + bw, by + bd, bz], [bx + bw, by + bd, bz + bh], [bx + bw, by, bz + bh]], right, `stroke="#8A6A3A" stroke-width="1"`);

  // ① 안쪽(바닥·먼 두 벽) — 창고(고내온도)
  const inner = poly([[T, T, T], [w - T, T, T], [w - T, d - T, T], [T, d - T, T]], C.floor, `stroke="#B0B8C1"`)
    + poly([[T, T, T], [T, d - T, T], [T, d - T, h], [T, T, h]], C.wall, `stroke="#B0B8C1"`)
    + poly([[T, T, T], [w - T, T, T], [w - T, T, h], [T, T, h]], C.floor, `stroke="#B0B8C1"`);
  // ② 쿨러(안쪽 왼벽 위)·조명(천정 가운데에 매달림) — 조명·팬·제상
  const n = Math.max(1, Math.min(R?.cooler ?? 1, 6)), slot = (d - 2 * T) / n;
  const cw = Math.min(slot * 0.62, 1.8), dx = Math.min(0.75, w * 0.16), ch = Math.min(0.7, h * 0.2), z1 = h - Math.min(0.4, h * 0.1), z0 = z1 - ch;
  let cool = "";
  for (let i = 0; i < n; i++) {
    const yc = T + slot * (i + 0.5), ya = yc - cw / 2, yb = yc + cw / 2, xa = T, xb = T + dx;
    const [fx, fy] = P(xb, yc, (z0 + z1) / 2), [tx, ty] = P(xb + Math.min(w * 0.3, 2.5), yc, z0 - ch * 0.6);
    cool += poly([[xa, ya, z1], [xb, ya, z1], [xb, yb, z1], [xa, yb, z1]], "#fff") + poly([[xb, ya, z0], [xb, yb, z0], [xb, yb, z1], [xb, ya, z1]], "#F2F4F6")
      + poly([[xa, yb, z0], [xb, yb, z0], [xb, yb, z1], [xa, yb, z1]], "#D1D6DB")
      + `<line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" stroke="${BLUE}" stroke-width="2" stroke-dasharray="4 3" marker-end="url(#scB)"/>`;
  }
  const [lx, ly] = P(w * 0.6, d * 0.32, h), [lx2, ly2] = P(w * 0.6, d * 0.32, h - Math.min(0.6, h * 0.15));
  const lamp = `<line x1="${lx}" y1="${ly}" x2="${lx2}" y2="${ly2}" stroke="#4E5968" stroke-width="1.5"/><circle cx="${lx2}" cy="${ly2 + 6}" r="14" fill="#FFE58A" opacity=".55"/><circle cx="${lx2}" cy="${ly2 + 6}" r="7" fill="#F5B800" stroke="#8A6A10"/>`;
  const equipAnchor = P(T + dx, T + slot * 0.5, (z0 + z1) / 2);
  // ③ 상품 — 바닥 가운데 팔레트 더미(뒤에서 앞으로 그린다)
  const bw = Math.min(1.1, w * 0.14), bd = Math.min(1.1, d * 0.12), bh = Math.min(1.3, h * 0.32);
  const spots = [[0.42, 0.34], [0.62, 0.34], [0.42, 0.56], [0.62, 0.56]].map(([a, b]) => [w * a, d * b]).sort((p1, p2) => p1[0] + p1[1] - p2[0] - p2[1]);
  let goods = "";
  for (const [bx, by] of spots) {
    goods += box(bx, by, T, bw, bd, 0.15, "#C9A27A", "#A97F55", "#8E6A45")
      + box(bx + 0.05, by + 0.05, T + 0.15, bw - 0.1, bd - 0.1, bh, "#F0D3A8", "#DDB27C", "#C89660");
  }
  const goodsAnchor = P(w * 0.62 + bw / 2, d * 0.45, T + 0.15 + bh);
  // ④ 작업자 — 바닥 위 사람 하나(키 1.7m)
  const px = w * 0.27, py = d * 0.5, hd = P(px, py, T + 1.6), nk = P(px, py, T + 1.45), hp = P(px, py, T + 0.9), fl = P(px - 0.18, py, T), fr = P(px + 0.18, py, T), al = P(px - 0.32, py, T + 1.05), ar = P(px + 0.32, py, T + 1.05);
  const person = `<g stroke="${TERM.작업원[0]}" stroke-width="3" stroke-linecap="round" fill="none"><line x1="${nk[0]}" y1="${nk[1]}" x2="${hp[0]}" y2="${hp[1]}"/><line x1="${hp[0]}" y1="${hp[1]}" x2="${fl[0]}" y2="${fl[1]}"/><line x1="${hp[0]}" y1="${hp[1]}" x2="${fr[0]}" y2="${fr[1]}"/><line x1="${al[0]}" y1="${al[1]}" x2="${nk[0]}" y2="${nk[1] + 4}"/><line x1="${ar[0]}" y1="${ar[1]}" x2="${nk[0]}" y2="${nk[1] + 4}"/></g><circle cx="${hd[0]}" cy="${hd[1]}" r="${Math.max(5, 0.14 * k)}" fill="${TERM.작업원[0]}"/>`;
  const peopleAnchor = P(px, py, T + 1.2);
  // ⑤ 가까운 두 벽(겉면)·벽 윗단면(판넬 두께)·천정 점선 — 벽·천정·바닥(침입열). 바깥 열 화살표(주황)
  // 앞 두 벽은 반투명 — 안의 상품·작업자·쿨러가 보이게(쿨셀렉터 냉동창고 그림처럼)
  const nearY = poly([[0, d, 0], [w, d, 0], [w, d, h], [0, d, h]], "#DDE2E7", `${LN} fill-opacity=".42"`), nearX = poly([[w, 0, 0], [w, d, 0], [w, d, h], [w, 0, h]], "#C9D0D7", `${LN} fill-opacity=".42"`);
  const ring = `<path d="${pathOf([[0, 0, h], [w, 0, h], [w, d, h], [0, d, h]])} ${pathOf([[T, T, h], [w - T, T, h], [w - T, d - T, h], [T, d - T, h]])}" fill="#F7E3A1" fill-rule="evenodd" ${LN}/>`;
  const lid = poly([[0, 0, h], [w, 0, h], [w, d, h], [0, d, h]], "none", `stroke="#8B95A1" stroke-width="1" stroke-dasharray="5 4"`);
  const heat = [0.3, 0.7].map((f) => { const [ax, ay] = P(w, d * f, h * 0.55); return `<line x1="${ax + 54}" y1="${ay - 30}" x2="${ax + 6}" y2="${ay - 3}" stroke="${ORANGE}" stroke-width="3" marker-end="url(#scO)"/>`; }).join("");
  const wallAnchor = P(w, d * 0.5, h * 0.5);
  // ⑥ 문 — 앞 왼벽(y=d)에 문 한 짝, 바깥 공기(초록 화살표)가 들어온다 — 문·환기
  const dw = Math.min(1.4, w * 0.24), dx0 = Math.min(w * 0.14, w - dw - 0.2), dz = Math.min(2.2, h * 0.72);
  const door = poly([[dx0, d, 0], [dx0 + dw, d, 0], [dx0 + dw, d, dz], [dx0, d, dz]], "#C9D3DD", `stroke="#4E5968" stroke-width="2"`)
    + (() => { const [hx, hy] = P(dx0 + dw * 0.82, d, dz * 0.48); return `<circle cx="${hx}" cy="${hy}" r="3.5" fill="#4E5968"/>`; })();
  const [dcx, dcy] = P(dx0 + dw / 2, d, dz * 0.5);
  const air = `<path d="M${dcx - 70},${dcy + 58} Q${dcx - 40},${dcy + 10} ${dcx - 6},${dcy + 2}" fill="none" stroke="#2FA84F" stroke-width="3" marker-end="url(#scG)"/>`;
  const doorAnchor = [dcx, dcy];
  // 치수선
  const dim = (a, b, off, label, vertical) => {
    const [ax, ay] = P(...a), [bx2, by2] = P(...b), A = [ax + off[0], ay + off[1]], B = [bx2 + off[0], by2 + off[1]];
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, nn = Math.hypot(...off);
    const txt = vertical
      ? `<text x="${A[0] - 12}" y="${my}" text-anchor="middle" class="dimt" transform="rotate(-90 ${A[0] - 12} ${my})">${label}</text>`
      : `<text x="${mx + off[0] / nn * 34}" y="${my + off[1] / nn * 22 + 6}" text-anchor="middle" class="dimt">${label}</text>`;
    return `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="#191F28" stroke-width="1.2"/><circle cx="${A[0]}" cy="${A[1]}" r="2.5" fill="#191F28"/><circle cx="${B[0]}" cy="${B[1]}" r="2.5" fill="#191F28"/>${txt}`;
  };
  const dims = dim([0, d, 0], [w, d, 0], [-10, 16], `가로 ${fmt(w, 1)}m`) + dim([w, d, 0], [w, 0, 0], [12, 14], `세로 ${fmt(d, 1)}m`) + dim([0, d, 0], [0, d, h], [-16, 0], `높이 ${fmt(h, 1)}m`, true);
  const roomAnchor = P(w * 0.5, d * 0.5, h);

  // 이름표 — 그림 둘레 고정 자리. [부분, 왼쪽 위 x, y, 가리키는 점]
  const LW = 214, LH = 66;
  const slots = [
    ["room", 12, 12, roomAnchor], ["out", W - LW - 12, 12, null],
    ["equip", 12, 196, equipAnchor], ["door", 12, 420, doorAnchor],
    ["people", 250, H - LH - 12, peopleAnchor], ["goods", 516, H - LH - 12, goodsAnchor],
    ["wall", W - LW - 12, 250, wallAnchor], ["run", W - LW - 12, 440, null],
  ];
  const labels = slots.map(([id, lx0, ly0, an]) => {
    const z = ZONES.find((zz) => zz.id === id), col = ZONE_COLOR[id], sel = zone === id;
    const cx = lx0 + LW / 2, ey = ly0 + LH / 2;
    let lead = "";
    if (an) {
      const ex = an[0] < lx0 ? lx0 : an[0] > lx0 + LW ? lx0 + LW : cx, ey2 = an[1] < ly0 ? ly0 : an[1] > ly0 + LH ? ly0 + LH : ey;
      lead = `<line x1="${ex}" y1="${ey2}" x2="${an[0]}" y2="${an[1]}" stroke="${sel ? BLUE : "#8B95A1"}" stroke-width="${sel ? 2.5 : 1.5}"/><circle cx="${an[0]}" cy="${an[1]}" r="${sel ? 7 : 5}" fill="${sel ? BLUE : "#fff"}" stroke="${sel ? BLUE : "#4E5968"}" stroke-width="2"/>`;
    }
    const line = R ? zoneLine(R, z) : "";
    return `<g class="zone lab${on(id)}" data-zone="${id}">${lead}<rect x="${lx0}" y="${ly0}" width="${LW}" height="${LH}" rx="14"/><rect x="${lx0}" y="${ly0 + 12}" width="5" height="${LH - 24}" rx="2.5" fill="${col}"/>
      <text x="${lx0 + 18}" y="${ly0 + 27}" class="zn">${esc(z.name)}</text><text x="${lx0 + 18}" y="${ly0 + 51}" class="zv">${esc(line)}</text></g>`;
  }).join("");
  // 합계 — 그림 위 가운데(끄는 중에도 바로 바뀐다)
  const L0 = R?.out, tot = L0 ? `<g transform="translate(${W / 2 - 130},14)"><rect width="260" height="62" rx="14" fill="#191F28"/><text x="130" y="25" text-anchor="middle" style="font-size:14px;fill:#B0B8C1">냉동부하 · 안전율 ${L0.안전율}배 포함</text><text x="130" y="52" text-anchor="middle" style="font-size:24px;font-weight:800;fill:#fff">${fmt(L0.총냉각열량Kw, 1)} kW <tspan style="font-size:15px;font-weight:500;fill:#D1D6DB">${fmt(L0.총냉각열량)} kcal/h</tspan></text></g>` : "";
  // 바깥 해
  const sun = `<g class="zone${on("out")}" data-zone="out" transform="translate(${W - LW - 60},40)"><circle cx="16" cy="16" r="11" fill="${ORANGE}"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => { const r = (a * Math.PI) / 180; return `<line x1="${16 + Math.cos(r) * 15}" y1="${16 + Math.sin(r) * 15}" x2="${16 + Math.cos(r) * 21}" y2="${16 + Math.sin(r) * 21}" stroke="${ORANGE}" stroke-width="2.5" stroke-linecap="round"/>`; }).join("")}</g>`;
  const defs = `<defs>${[["scB", BLUE], ["scO", ORANGE], ["scG", "#2FA84F"]].map(([id, c]) => `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="${c}"/></marker>`).join("")}</defs>`;
  return `<svg class="chart wh scene" viewBox="0 0 ${W} ${H}" role="img" aria-label="창고 부하 그림 — 부분을 누르면 오른쪽에서 값을 고칩니다">${defs}
    ${g("room", inner)}${g("equip", cool + lamp)}${g("goods", goods)}${g("people", person)}${g("wall", nearY + nearX + ring + heat)}${g("door", door + air)}${g("room", lid + dims)}${sun}${tot}${labels}</svg>`;
}
const sceneHtml = (v, R) => sceneSvg(v, R ? { ...R, cooler: S.result?.cooler?.out?.count } : null, S.zone) + boxInfo(v.w, v.d, v.h, v.insulMm);

/** 오른쪽 조절창 — 고른 부분의 입력 칸(손님이 아는 칸 먼저, 표 값 칸은 아래)과 그 부분 결과 */
function zonePanel(R, z) {
  const L = R.out, total = L.terms.reduce((a, t) => a + Math.max(0, t.kcal), 0) || 1;
  const fs = z.keys.map((k) => S.fields.load.find((f) => f.key === k)).filter(Boolean);
  const html = (f) => (f.key === "item" && S.items ? itemField(f) : fieldHtml("load", f));
  const first = fs.filter((f) => (f.group ?? "main") === "main"), rest = fs.filter((f) => (f.group ?? "main") !== "main");
  let head = "";
  if (z.terms.length) {
    const kc = zoneKcal(L, z);
    head = `<div data-live="zh-${z.id}"><div class="zhead"><div class="k">${esc(z.sub)}</div><div class="v" ${fk(`load.z.${z.id}`, Math.round(kc))}>${fmt(kc)}<small> kcal/h</small> <span class="sub">${fmt(kc / total * 100, 0)}%</span></div>
      <div class="bt meter"><div style="width:${Math.min(100, kc / total * 100)}%;background:${ZONE_COLOR[z.id]}"></div></div></div><div class="divider"></div></div>`;
  }
  let extra = "";
  if (z.id === "out") {
    // 위치 검색·월별 기온 그래프는 가운데 창고 그림 바로 아래(#sitebox)에 늘 보인다(대표 11/12 「날씨 확인이 화면에 안 보인다」) — 여기엔 요약만
    const T = S.site, c = T.climate;
    extra = `<div data-live="zx-out">` + card((T.place && c ? rrow("위치", esc(T.place.short)) + rrow("연중 최고기온", `${fmt(c.hottest.max, 1)}℃ (${c.hottest.date})`) + rrow("연중 최저기온", `${fmt(c.coldest.min, 1)}℃ (${c.coldest.date})`) : "")
      + note("창고 위치 검색과 월별 기온 그래프는 왼쪽 창고 그림 바로 아래에 있어요")) + `</div>`;
  }
  if (z.id === "wall") {
    const pf = L.면별침입열 ?? {};
    extra = `<div data-live="zx-wall">${sl("면별 침입열 (kcal/h)")}${card(barRows(FACES.map(([, nm]) => [nm, pf[nm] ?? 0, TERM.침입열[0]])))}</div>${exp("zone-wall-face", "면별 조건 — 바닥(마루) 온도·두께", faceTable())}`;
  }
  if (z.id === "goods") {
    const B = L.입고품분해 ?? {}, frozen = (L.notes ?? []).find((x) => x.includes("식품 물성으로") || x.includes("참고값(식품 물성)"));
    extra = `<div data-live="zx-goods">${sl("입고량")}${card(`<div class="rrow"><div class="k">일일 입고량 / 수용량</div><div class="v" ${fk("a.load.in", fmt(L.입고량Ton, 1))}>${fmt(L.입고량Ton, 1)} / ${fmt(L.수용량Ton, 1)} 톤</div></div>
        <div class="bt meter"><div style="width:${Math.min(100, L.입고량Ton / (L.수용량Ton || 1) * 100)}%;background:#18A5A5"></div></div>
        <div class="sub" style="text-align:right">입고율 ${fmt(L.입고량Ton / (L.수용량Ton || 1) * 100, 0)}%</div>`)}
      ${sl(`입고품 열 나눔 (kcal/h) — ${altName(L.method)}${L.methodAuto ? " · 자동" : ""}`)}${card(rrow("동결 전 냉각", fmt(B.동결전)) + rrow("동결(잠열)", fmt(B.동결)) + rrow("동결 후 냉각", fmt(B.동결후)) + rrow("호흡열", fmt(L.terms.find((t) => t.key === "호흡열")?.kcal ?? 0))
        + (L.alt ? `<div class="divider"></div>` + rrow(`참고 · ${altName(L.alt.method)} 입고품`, `${fmt(L.alt.입고품)} <span class="sub">(동결 전 ${fmt(L.alt.입고품분해?.동결전)} · 잠열 ${fmt(L.alt.입고품분해?.동결)} · 동결 후 ${fmt(L.alt.입고품분해?.동결후)})</span>`) : ""))}
      ${frozen ? note(esc(frozen)) : ""}</div>`;
  }
  if (z.id === "run") extra = `<div data-live="zx-run">${card(rrow("증발온도", `${fmt(L.증발온도, 0)}℃`, false, "a.load.evap"))}</div>`;
  // 시공자가 아는 값(꼭 묻기·모르면 기본값 — 11/05 시공자 질문 지도)만 펼쳐 두고, 나머지 표·자동 값은 접는다(대표 11/13)
  const folded = rest.length ? exp(`zone-${z.id}`, `세부 값 ${rest.length}칸 — 비우면 표·자동 값`, rest.map(html).join("")) : "";
  return `${sl(`${esc(z.name)} <span class="sub">${esc(z.sub)}</span>`)}${card(head + first.map(html).join("") + (first.length ? "" : `<div class="sub" style="padding:2px 0 6px">시공자가 따로 넣을 값 없음 — 표·자동 값으로 계산</div>`))}${folded}${extra}`;
}

/** 참고값(대표 11/13 「기본 엑셀 + 식품 물성 참고」) — 다른 입고품 계산 방식의 냉동부하. 15% 넘게 다르면 노란 알림 */
const altName = (m) => (m === "food" ? "식품 물성(ASHRAE)" : "엑셀 식");
const altGap = (L) => (L.alt ? (L.alt.총냉각열량Kw - L.총냉각열량Kw) / (L.총냉각열량Kw || 1) * 100 : 0);
const altRow = (L) => (L.alt ? rrow(`참고 · ${altName(L.alt.method)}`, `${fmt(L.alt.총냉각열량Kw, 1)} kW <span class="sub">(${altGap(L) >= 0 ? "+" : ""}${fmt(altGap(L), 0)}%)</span>`, false, "a.load.alt") : "");
const altWarn = (L) => (L.alt && L.method === "excel" && Math.abs(altGap(L)) > 15 ? note(`입고품 열을 ${altName(L.alt.method)}으로 계산하면 ${fmt(L.alt.총냉각열량Kw, 1)} kW로 ${fmt(Math.abs(altGap(L)), 0)}% ${altGap(L) > 0 ? "커요" : "작아요"}. 덜 언 채(동결점 아래 −2~−10℃) 들어오거나 이미 언 채 들어오면 두 계산이 크게 갈려요 — 상품 칸에서 확인하세요`, "warn") : "");

/** 부하 결과의 「창고 용도」 줄(대표 11/19) — 무엇으로 가정했는지 늘 보이고, 누르면 상품 구역 칸으로 */
function inModeRow(R) {
  const m = R.in.inMode, inC = R.in.inC, own = R.src?.inC === "user";
  const chill = R.out?.band === "냉장";
  const t = own ? `입고온도 ${fmt(inC, 0)}℃ (직접 넣음)` : m === "frozen" && chill ? `보관만 — 냉장창고라 계수표 값 · 입고 ${fmt(inC, 0)}℃` : m === "frozen" ? `보관만 · 입고 ${fmt(inC, 0)}℃` : m === "ambient" ? `얼리기도 함 · 입고 ${fmt(inC, 0)}℃` : `모름 → ${inC < 0 ? "언 채" : "상온"} 반입 가정 · 입고 ${fmt(inC, 0)}℃`;
  return `<div class="rrow tap" data-zone="goods" title="누르면 창고 용도를 고를 수 있어요"><div class="k">창고 용도</div><div class="v">${esc(t)} <span class="sub">바꾸기</span></div></div>`;
}
function viewLoad() {
  const R = S.result?.load; if (!R) return waitOut("load");
  S.zone ??= "room";
  const L = R.out, total = L.terms.reduce((a, t) => a + Math.max(0, t.kcal), 0) || 1;
  // 가운데 — 큰 창고 그림 + 부하 구성 막대(누르면 그 부분)
  const termZone = (k) => ZONES.find((z) => z.terms.includes(k))?.id;
  const Cl = S.site.climate;
  const siteBox = `<div id="sitebox">${sl(`창고 위치 · 월별 기온${S.site.place && Cl ? ` — ${esc(S.site.place.short)}` : ""}`)}${siteCard(R)}${Cl && S.site.place ? card(climateSvg(Cl, R.in.outdoorC)) : ""}</div>`;
  const main = `${siteBox}
    ${sl("부하 구성 (안전율 전)")}${card(`<div class="stack">${L.terms.map((t) => `<div style="flex-grow:${Math.max(0, t.kcal)};background:${TERM[t.key][0]}"></div>`).join("")}</div>
      ${L.terms.map((t) => `<div class="brow zrow" data-zone="${termZone(t.key)}"><div class="bk"><span class="dot" style="background:${TERM[t.key][0]}"></span>${t.key}</div><div class="bt"><div style="width:${Math.max(0, t.kcal) / Math.max(...L.terms.map((x) => Math.max(0, x.kcal)), 1) * 100}%;background:${TERM[t.key][0]}"></div></div><div class="bv" ${fk(`load.t.${t.key}`, Math.round(t.kcal))}>${fmt(t.kcal)} <span class="sub">${fmt(t.kcal / total * 100, 0)}%</span></div></div>`).join("")}`)}`;
  // 오른쪽 — 결과(합계) · 부분 고르기 · 고른 부분 조절창
  const zs = S.zone === "all" ? ZONES : [ZONES.find((z) => z.id === S.zone) ?? ZONES[0]];
  const side = `<div data-live="res">${sl("결과")}${card(hero("냉동부하 (총냉각열량)", fmt(L.총냉각열량Kw, 1), "kW", `${fmt(L.총냉각열량)} kcal/h · 안전율 ${L.안전율}배 포함`, "a.load")
      + altRow(L)
      + `<div class="divider"></div>` + inModeRow(R) + rrow("증발온도", `${fmt(L.증발온도, 0)}℃`, false, "a.load.evap") + rrow("창고 종류", `${L.band}창고`, false, "a.load.band") + rrow("내형 용적", `${fmt(L.내형.volume, 0)} ㎥`, false, "a.load.vol"))}
    ${altWarn(L)}
    ${pinVsLoad(L)}</div>
    <div class="zall"><button type="button" class="txtbtn" data-zone="${S.zone === "all" ? "room" : "all"}">${S.zone === "all" ? "그림에서 고른 부분만 보기" : "모든 입력 한 번에 보기"}</button></div>
    ${zs.map((z) => zonePanel(R, z)).join("")}
    ${navrow(null, "comp")}`;
  return { side, main, viz: "", sceneMain: true, holdSide: true };
}

/** 같은 몸체 모터 형제(대표 11/12 「15마력이 25마력보다 능력이 큰 까닭」) — 비쳐 반밀폐는 이름의 마력이 모터 크기.
 *  앞 이름(「-」 앞)이 같고 마력이 다르며 냉동능력 차이가 6% 안이면 같은 몸체로 본다. 후보 목록 안에서만 찾는다. */
function motorTwin(x, list) {
  if (!x?.product_id || x.hp == null || !/비쳐|bitzer/i.test(String(x.brand ?? ""))) return null;
  const body = String(x.product_id).split("-")[0];
  return list.find((y) => y !== x && y.product_id !== x.product_id && String(y.product_id ?? "").split("-")[0] === body && y.hp != null && y.hp !== x.hp
    && Math.abs(y.capacity_kw - x.capacity_kw) / Math.max(x.capacity_kw, 1e-9) <= 0.06) ?? null;
}
const twinTag = (x, list) => { const y = motorTwin(x, list); return y ? ` · <span class="twin">${x.hp > y.hp ? `모터만 큼 — ${esc(y.product_id)}(${hpText(y.hp)})와 능력 비슷` : `${esc(y.product_id)}(${hpText(y.hp)})와 같은 몸체`}</span>` : ""; };

// ── 가능한 창고(대표 11/16 「압축기만 먼저 고정하고 나머지 값 맞춰 가능한 창고 크기와 온도 찾기」) ──
//   서버 fitRooms: 고내온도마다 압축기 능력(증발 = 고내 − 온도차) ≥ 냉동부하(안전율 포함)인 최대 평수. 막대·줄을 누르면 그 고내온도·평수를 부하계산에 넣는다.
function fitSvg(F, W = 520) {
  const rows = [...F.rows].sort((a, b) => a.roomC - b.roomC), H = 210, P = { l: 40, r: 8, t: 22, b: 36 };
  const max = Math.max(1, ...rows.map((r) => r.maxPyeong ?? 0)) * 1.12;
  const bw = (W - P.l - P.r) / rows.length, ys = scale(0, max, H - P.b, P.t);
  const cur = hasIn("roomC") ? Number(S.state.load.in.roomC) : null;
  const grid = ticks(0, max, 4).map((v) => `<line x1="${P.l}" x2="${W - P.r}" y1="${ys(v)}" y2="${ys(v)}" stroke="#F2F4F6"/><text x="${P.l - 6}" y="${ys(v) + 4}" text-anchor="end">${fmt(v)}</text>`).join("");
  const bars = rows.map((r, i) => {
    const x = P.l + i * bw + bw * 0.17, w = bw * 0.66, v = r.maxPyeong ?? 0, on = cur === r.roomC, ok = v > 0;
    const top = r.capKw == null ? "밖" : v === 0 ? "0" : fmt(v, v < 10 ? 1 : 0);
    return `<g${ok ? ` data-fit="${r.roomC}|${r.maxPyeong}" style="cursor:pointer"` : ""}><rect x="${x}" y="${ys(v)}" width="${w}" height="${Math.max(0, H - P.b - ys(v))}" rx="3" fill="${ok ? (on ? "#191F28" : "#8B95A1") : "#E5E8EB"}"/>`
      + `<text x="${x + w / 2}" y="${(ok ? ys(v) : H - P.b) - 5}" text-anchor="middle" style="font-size:11px;fill:${ok ? "#191F28" : "#8B95A1"};font-weight:${ok ? 600 : 400}">${top}</text>`
      + `<text x="${x + w / 2}" y="${H - P.b + 15}" text-anchor="middle" style="font-size:11px;font-weight:${on ? 700 : 400}">${r.roomC}</text></g>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><g class="grid">${grid}</g>${bars}<text x="${(W + P.l) / 2}" y="${H - 4}" text-anchor="middle" style="font-size:11px;fill:#6B7684">고내온도 ℃</text><text x="2" y="12" style="font-size:11px;fill:#6B7684">최대 평수</text></svg>`;
}
function fitBlock(F) {
  if (!F?.rows?.length) return "";
  const cur = hasIn("roomC") ? Number(S.state.load.in.roomC) : null;
  const rows = [...F.rows].sort((a, b) => b.roomC - a.roomC).map((r) => {
    const ok = r.maxPyeong > 0;
    return `<div class="lrow${ok ? " tap" : " dim"}${cur === r.roomC ? " lk" : ""}"${ok ? ` data-fit="${r.roomC}|${r.maxPyeong}"` : ""}><div class="m"><div class="t">고내 ${r.roomC}℃ <span class="sub">증발 ${fmt(r.evapC, 0)}℃</span></div>`
      + `<div class="sub">${ok ? `압축기 ${fmt(r.capKw, 1)} kW · 부하 ${fmt(r.loadKw, 1)} kW · 가로 ${fmt(r.w, 1)} × 세로 ${fmt(r.d, 1)} m · 판넬 ${fmt(r.insulMm)}T${r.inC != null ? ` · 입고 ${fmt(r.inC, 0)}℃(${r.inC < 0 ? "언 채" : "상온"})` : ""}` : r.capKw != null ? `압축기 ${fmt(r.capKw, 1)} kW · ${esc(r.why ?? "")}` : esc(r.why ?? "")}</div></div>`
      + `<div class="r f-bodyStrong num">${ok ? `${fmt(r.maxPyeong, 1)}평${r.maxPyeong >= 2000 ? " 이상" : ""}` : "—"}</div></div>`;
  }).join("");
  const how = `판정: 압축기 능력 ≥ 냉동부하(안전율 ${fmt(F.safety, 2)}배 포함) · 증발온도 = 고내 − ${fmt(F.evapDiff, 0)}K · 응축 ${fmt(F.condC, 0)}℃ · 가로:세로 1:2`
    + (F.sizeGiven ? " · 넣은 창고 크기 대신 평수를 넓혀 가며 찾았어요" : "")
    + (F.assumed?.length ? `<br>추정(안 넣은 값은 기본값): ${F.assumed.map(esc).join(", ")} — 넣으면 다시 찾아요` : "");
  // 「창고 용도」 바로가기 칸은 걷음(대표 11/28 「부하계산에서 이미 하는 거 아니야?」) — 같은 칸이 부하계산에 있고, 기본값은 아래 판정 글 「추정」에 나온다
  return `${sl(`가능한 창고 — ${esc(F.model)} <span class="sub">고내온도별 최대 평수 · 누르면 부하계산에 넣어요</span>`)}${card(fitSvg(F) + `<div class="divider"></div>` + rows, "fitcard")}${note(how)}`;
}
/** 가능한 창고 줄을 누름 — 그 고내온도·평수를 부하계산 칸에 넣고 부하계산으로(남은 필수 값은 거기서 채운다) */
function applyFit(s) {
  const [T, P] = s.split("|").map(Number);
  if (!Number.isFinite(T) || !Number.isFinite(P)) return;
  const L = S.state.load ??= { in: {} }; L.in ??= {};
  L.in.roomC = String(T); L.in.pyeong = String(P); delete L.in.w; delete L.in.d;
  // 압축기 칸에 직접 넣은 증발온도·필요 능력은 비운다 — 고른 창고의 부하계산 값을 이어받게(모델·마력 고정은 그대로)
  const C = S.state.comp?.in; if (C) { delete C.evapC; delete C.capacityKw; }
  for (const st of STAGES) if (S.state[st]) S.state[st].pick = null;
  computeSoon(); setTab("load");
}

function viewComp() {
  const R = S.result?.comp; if (!R) return waitOut("comp");
  const O = R.out, c = O.chosen, req = R.in.capacityKw, dev = c?.deviation_pct;
  // 증발온도를 아직 모르면(O.probe) 그 조건 능력은 없다 — 모델·가격만, 능력 곡선은 증발온도 없이 그린다
  const capRow = c?.capacity_kw != null ? rrow("운전조건 냉동능력", `${fmt(c.capacity_kw, 1)} kW`, false, "a.comp.cap") : rrow("운전조건 냉동능력", `<span class="sub">증발온도를 넣으면 나와요</span>`);
  const reqRows = req != null && dev != null ? rrow("필요 냉동능력", `${fmt(req, 1)} kW`, false, "a.comp.req") + rrow(dev >= 0 ? "여유율" : "부족률", `${fmt(Math.abs(dev), 0)}%`, false, "a.comp.dev") : "";
  const top = c
    ? card(hero(O.pin?.model ? "고정한 압축기" : O.pin?.hp != null ? `${O.pin.hp}마력 압축기` : "추천 압축기", esc(c.product_id), "", `${esc(c.brand)} · ${hpLabel(c)}${orderTag(c)}`, "a.comp") + `<div class="divider"></div>`
      + capRow + reqRows + rrow("기본가", won(c.price_krw), true, "a.comp.price"))
    : card(hero("추천 압축기", noneVal(O), "", esc(O.message ?? ""), "a.comp"));
  const warn = c && c.match_level !== "exact" && c.in_catalog !== false && c.model_no ? note(`재고 품목 「${esc(c.model_no)}」은 계산 모델(${esc(c.product_id)})과 품명이 달라 동일 기종 확인 필요`, "warn") : "";
  const list = O.candidates.slice(0, 8);
  // 고른 압축기에 마력이 더 작은 같은 몸체 형제가 있으면 알린다 — 마력을 올려도 냉동능력은 그대로
  const tw = O.twin ?? (c ? motorTwin(c, O.candidates) : null);   // 서버가 성능표에서 찾은 형제(마력을 정해 후보에 없을 때도) → 없으면 목록 안에서
  const twinNote = tw && tw.hp < c.hp ? note(`${esc(c.product_id)}(${hpText(c.hp)})는 ${esc(tw.product_id)}(${hpText(tw.hp)})와 몸체가 같아 냉동능력이 거의 같아요(${fmt(c.capacity_kw, 1)} kW · ${fmt(tw.capacity_kw, 1)} kW). 비쳐 반밀폐의 마력은 모터 크기예요 — 크기는 냉동능력(kW)으로 비교하세요${tw.price_krw != null ? ` · ${esc(tw.product_id)} 기본가 ${won(tw.price_krw)}` : tw.order ? ` · ${esc(tw.product_id)}는 주문 제작` : ""}`, "warn") : "";
  const res = `<div data-live="res">${sl("결과")}${top}${pinNotesHtml(O)}${warn}${twinNote}</div>`;
  // 가운데(대표 11/13 「압축기·유니트·유닛쿨러·팽창변도 부하계산처럼」) — 큰 그림: 능력·운전 범위·능력 곡선 + 계통도
  const fit = fitBlock(O.fit);
  const bars = req != null && c?.capacity_kw != null ? `<div class="sl2">능력 대조 (kW)</div>` + barRows([["필요", req, ORANGE, "", null, `${fmt(req, 1)} kW`], ["압축기", c.capacity_kw, "#191F28", "", null, `${fmt(c.capacity_kw, 1)} kW`]]) : "";
  const cyc = "";   // 계통도는 가운데 큰 칸 토글로 옮김(11/28)
  // 부하계산이 덜 찼으면 가능한 창고를 맨 위에(압축기부터 정하는 쓰임), 다 찼으면 능력 대조 아래에
  const main = c
    ? `${loadReady() ? "" : fit}${sl(bars ? "압축기 — 필요 능력과 운전 범위" : "압축기 — 운전 범위와 증발온도별 능력")}<div class="vgrid">${card(bars + `<div class="sl2">운전 범위${R.in.evapC != null ? " — 점이 범위 안에 있어야 해요" : ""}</div>` + envelopeSvg(O.envelope, R.in.evapC, R.in.condC, 520))}${card(`<div class="sl2">증발온도별 냉동능력 (응축 ${R.in.condC}℃)</div>` + curveSvg(O.curve, req, R.in.evapC, c.capacity_kw, 520))}</div>
      ${loadReady() ? fit : ""}${cyc}`
    : `<div class="empty">${O.need?.length ? "오른쪽에 값을 넣거나 모델·마력을 정하면 그림이 나와요" : "해당 모델이 없어 그림이 없습니다"}</div>${cyc}`;
  const side = `${res}
    ${pinBlock("comp")}
    ${needCard("comp")}
    ${sl("압축기 조건")}${card(fieldsOf("comp", "main"))}
    ${exp("comp-detail", "운전 조건 — 비우면 자동·표 값", fieldsOf("comp", "detail"))}
    <div data-live="cands">${list.length ? `${sl("후보 <span class=\"sub\">마력은 모터 크기 — 크기는 냉동능력(kW)으로 비교</span>")}${card(list.map((x, i) => `<div class="lrow"><div class="m"><div class="t">${esc(x.product_id)}</div><div class="sub">${esc(x.brand)}${x.capacity_kw != null ? ` · <b class="num">${fmt(x.capacity_kw, 1)} kW</b>` : ""} · ${hpLabel(x)}${x.deviation_pct != null ? ` · ${x.deviation_pct >= 0 ? "여유율" : "부족률"} ${fmt(Math.abs(x.deviation_pct), 0)}%` : ""}${orderTag(x)}${twinTag(x, list)}</div></div><div class="r f-bodyStrong num">${won(x.price_krw)}</div>${selOr("comp", x.product_id, i === O.chosenIdx)}</div>`).join(""))}` : ""}
    ${!c && O.nearMiss?.length ? `${sl("능력 부족 최대 모델")}${card(O.nearMiss.slice(0, 5).map((x) => `<div class="lrow"><div class="m"><div class="t">${esc(x.product_id)}</div><div class="sub">${hpLabel(x)} · ${fmt(x.capacity_kw, 1)} kW · 부족률 ${fmt(Math.abs(x.deviation_pct), 0)}%</div></div></div>`).join(""))}` : ""}</div>
    ${navrow("load", "unit")}`;
  return { side, main, viz: "", sceneMain: true, holdSide: true };
}

function viewUnit() {
  const R = S.result?.unit; if (!R) return waitOut("unit");
  const D = R.out.draft;
  const top = D
    ? card(hero(R.out.pinned ? "고정한 유니트 세트" : "유니트 세트", `${D.hp}마력 ${formLabel(D.form)}`, "", `압축기 ${esc(D.compressorModel ?? "-")}`, "a.unit") + `<div class="divider"></div>`
      + rrow("구성품", `${D.slots.length}종`) + rrow("참고 합계", won(D.total), true, "a.unit.total"))
    : card(hero("유니트 세트", "구성 불가", "", "", "a.unit"));
  const res = `<div data-live="res">${sl("결과")}${top}${(R.out.notes ?? []).map((n) => note(esc(n), "warn")).join("")}</div>`;
  const side = `${res}
    ${pinBlock("unit")}
    ${sl("유니트 조건")}${card(fieldsOf("unit", "main"))}
    ${sl(`유니트 놓는 자리 <span class="sub">3D 그림에만 써요 · 계산에는 아직 안 씀</span>`)}${card(fieldsOf("unit", "site"))}
    ${exp("unit-detail", "세부 조건 — 비우면 자동 값", fieldsOf("unit", "detail"))}
    <div data-live="parts">${D ? `${sl("구성품")}${card(D.slots.map((s) => `<div class="lrow" data-link="${esc(unitLink(s))}"><div class="m"><div class="t">${esc(s.slot)} <span class="sub">${esc(s.spec ?? "")}</span></div><div class="sub">${esc(s.modelNo ?? (s.separate ? "" : "확인 후 안내"))}</div></div><div class="r f-bodyStrong num">${s.separate ? "별도" : s.priceKrw == null ? "확인 후 안내" : won(s.priceKrw)}</div></div>`).join(""))}` : ""}</div>
    ${navrow("comp", "cooler")}`;
  // 계통도(대표 11/09) — 부품에 마우스를 얹으면 그 칸 정보, 가격 막대는 아래에 그대로
  // 계통도는 가운데 큰 칸 토글로(11/28). 구성품 기본가 막대는 걷음(대표 11/28 「가격도 안 나와도 되지 않아?」 — 구성품 목록·참고 합계에 같은 값)
  return { side, main: "", viz: "", sceneMain: true, holdSide: true };
}
/** 냉동 사이클 계통도 — 유니트·유닛쿨러·팽창변 세 화면 맨 위에 같은 그림, 보고 있는 화면의 부품만 진하게(대표 11/09 ⓑ) */
function cycleBlock(focus, hint) {
  const U = S.result?.unit, D = U?.out?.draft ?? null;
  const T = S.result?.txv;
  const fig = cycleFigure(D, {
    focus, cooler: S.result?.cooler?.out ?? null, txv: T ? { ...T.out, in: T.in } : null, roomC: hasIn("roomC") ? S.result?.load?.in?.roomC : null,
    unitWhy: U ? "구성 불가" : "계산 중…",
  });
  return `${sl(`${D ? `계통도 — ${D.hp}마력 ${formLabel(D.form)}` : "계통도"}${hint ? ` <span class="sub">${hint}</span>` : ""}`)}${card(fig, "figcard")}`;
}
/** 가운데 큰 칸 — 3D 와 계통도를 토글로(대표 11/28 「스크롤로 왔다 갔다 말고 토글로」). 부하계산은 사이클 부품이 없어 3D 만 */
function mainSlot() {
  const figOk = S.tab !== "load", fig = figOk && S.mainView === "fig";
  const tog = figOk ? `<div class="vtog"><div class="chips segctl" role="radiogroup" aria-label="가운데 보기" data-fk="view.main">${[["3d", "3D"], ["fig", "계통도"]].map(([v, t]) => `<button type="button" role="radio" aria-checked="${(fig ? "fig" : "3d") === v}" class="chip ${(fig ? "fig" : "3d") === v ? "on" : ""}" data-view="${v}" data-val="${v}">${t}</button>`).join("")}</div></div>` : "";
  if (!fig) return `<div class="vwrap">${tog}<div id="d3slot" class="d3slot"></div></div>`;
  const U = S.result?.unit, D = U?.out?.draft ?? null, T = S.result?.txv;
  const svg = cycleFigure(D, {
    focus: S.tab === "comp" ? "unit" : S.tab, cooler: S.result?.cooler?.out ?? null, txv: T ? { ...T.out, in: T.in } : null, roomC: hasIn("roomC") ? S.result?.load?.in?.roomC : null,
    unitWhy: U ? (S.result?.comp?.out?.chosen ? "구성 불가" : "압축기가 정해지면 구성") : "계산 중…",
  });
  return `<div class="vwrap">${tog}<div class="figslot"><div class="fighead">${D ? `${D.hp}마력 ${formLabel(D.form)}` : ""}<span class="sub">부품을 누르면 정보가 뜨고, 다른 단계 부품은 그 화면으로 넘어가요</span></div><div class="figbody">${svg}</div></div></div>`;
}

function viewCooler() {
  const R = S.result?.cooler; if (!R) return waitOut("cooler");
  const O = R.out, c = O.chosen, bal = S.result.balance;
  // 필요 능력 없이 모델·마력만 정했으면(대표 11/16) 1대 능력만 — 필요능력·여유율 줄은 없다
  const needRows = O.perUnit > 0 && c?.margin_pct != null ? rrow("1대당 필요능력", `${fmt(O.perUnit)} kcal/h`, false, "a.cooler.need") + rrow(c.margin_pct >= 0 ? "여유율" : "부족률", `${fmt(Math.abs(c.margin_pct), 0)}%`, false, "a.cooler.margin") : "";
  const top = c
    ? card(hero(O.pin?.model ? "고정한 유닛쿨러" : O.pin?.hp != null ? `${O.pin.hp}마력 유닛쿨러` : "추천 유닛쿨러", esc(c.model), `${O.count}대`, `${esc(c.maker)} · ${esc(c.defrost)} 제상`, "a.cooler") + `<div class="divider"></div>`
      + rrow("1대당 냉각능력", `${fmt(c.kcal)} kcal/h`, false, "a.cooler.cap") + needRows + (bal ? rrow("압축기 대비 쿨러 합계", `${bal.ratio}%`, false, "a.cooler.bal") : ""))
    : card(hero(O.pin?.model ? "고정한 유닛쿨러" : "추천 유닛쿨러", noneVal(O), "", esc(O.message ?? "대수 증가 또는 메이커 「상관없음」"), "a.cooler"));
  const list = O.candidates.slice(0, 8);
  const res = `<div data-live="res">${sl("결과")}${top}${pinNotesHtml(O)}
    ${c ? `${sl("사양")}${card([["형식", c.form, "c:body"], ["제상", `${c.defrost}${c.heater ? ` · 히터 ${c.heater}` : ""}`, "c:coil"], ["풍량", c.airflow_cmm != null ? `${c.airflow_cmm} CMM` : "-", "c:fan"], ["냉매관 입구/출구", `${c.pipe_in ?? "-"} / ${c.pipe_out ?? "-"} mm`, "c:pipe"], ["외형", c.dims ? `${c.dims} mm` : "-", "c:body"], ["중량", c.kg != null ? `${c.kg} kg` : "-", "c:body"], ["전원", c.power ?? "-", "c:body"], ["출처", c.source, "c:body"]].map(([k, v, lk]) => rrow(k, esc(v)).replace('<div class="rrow">', `<div class="rrow" data-link="${lk}">`)).join(""))}` : ""}</div>`;
  const side = `${res}
    ${pinBlock("cooler")}
    ${needCard("cooler")}
    ${sl("유닛쿨러 조건")}${card(fieldsOf("cooler", "main"))}
    ${exp("cooler-detail", "세부 조건 — 비우면 자동 값", fieldsOf("cooler", "detail"))}
    <div data-live="cands">${list.length ? `${sl("후보")}${card(list.map((x, i) => `<div class="lrow"><div class="m"><div class="t">${esc(x.model)}</div><div class="sub">${esc(x.maker)} · ${fmt(x.kcal)} kcal/h${x.margin_pct != null ? ` · 여유율 ${fmt(x.margin_pct, 0)}%` : ""}</div></div>${selOr("cooler", x.model, i === O.chosenIdx)}</div>`).join(""))}` : ""}</div>
    ${navrow("unit", "txv")}`;
  // 창고 안 배치 그림은 부하계산 값이 다 찼을 때만 — 덜 찼으면 기본 창고 치수라 그리지 않는다(대표 11/14·11/16)
  const Lin = loadReady() ? S.result.load?.in : null;
  const fig = c ? coolerFigure(c) : null;
  const main = (c
    ? `${sl(`유닛쿨러 — ${esc(c.model)}${O.count > 1 ? ` × ${O.count}대` : ""}`)}<div class="vgrid">${fig ? card(`<div class="sl2">외형도</div>` + fig, "figcard") : ""}${Lin ? card(`<div class="sl2">창고 안 배치 — ${O.count}대</div>` + whSvg({ w: Lin.w, d: Lin.d, h: Lin.h, t: Lin.insulMm, roomC: Lin.roomC, outC: Lin.outdoorC, coolers: O.count })) : ""}${card(`<div class="sl2">능력 대조 (kcal/h)</div>` + barRows([...(R.in.needKcal != null ? [["필요 합계", R.in.needKcal, ORANGE, "", null, `${fmt(R.in.needKcal)}`]] : []), [`쿨러 ${O.count}대`, c.kcal * O.count, BLUE, "", null, `${fmt(c.kcal * O.count)}`], ...(bal ? [["압축기", bal.compKw * 860, "#191F28", "", null, `${fmt(bal.compKw * 860)}`]] : [])]))}</div>`
    : "");
  return { side, main, viz: "", sceneMain: true, holdSide: true };
}

function viewTxv() {
  const R = S.result?.txv; if (!R) return waitOut("txv");
  const O = R.out, c = O.chosen;
  const sum = (o) => !(o.components ?? []).length ? null : o.components.reduce((a, x) => (a == null || x.price_krw == null ? null : a + x.price_krw), 0);
  const top = c
    ? card(hero(O.pin?.model ? "고정한 팽창변" : "추천 팽창변", esc(c.model), `${O.count}조`, `${esc(O.usedBrand ?? R.in.brand)} · 유닛쿨러 1대당 1조`, "a.txv") + `<div class="divider"></div>`
      + rrow("부하율", `${c.load_pct ?? "-"}%`, false, "a.txv.lp") + rrow("밸브 1개당 부하", `${fmt(R.in.capacityKw, 1)} kW`) + rrow("1조 기본가", c.components?.length ? won(sum(c)) : "-", true, "a.txv.price"))
    : card(hero(O.pin?.model ? "고정한 팽창변" : "추천 팽창변", noneVal(O), "", esc(O.message ?? ""), "a.txv"));
  const list = O.options.slice(0, 8);
  const res = `<div data-live="res">${sl("결과")}${top}${pinNotesHtml(O)}
    ${c?.components?.length ? `${sl("구성 품번 (1조 기준)")}${card(c.components.map((x, i) => `<div class="lrow" data-link="x:${i}"><div class="m"><div class="t num">${esc(x.code_no)}</div>${x.role ? `<div class="sub">${esc(x.role)}</div>` : ""}</div><div class="r f-bodyStrong num">${won(x.price_krw)}</div></div>`).join(""))}` : ""}</div>`;
  const side = `${res}
    ${pinBlock("txv")}
    ${needCard("txv")}
    ${fieldsOf("txv", "main") ? `${sl("팽창변 조건")}${card(fieldsOf("txv", "main"))}` : ""}
    ${exp("txv-detail", "세부 조건 — 비우면 자동 값", fieldsOf("txv", "detail"))}
    <div data-live="cands">${list.length ? `${sl("후보")}${card(list.map((o, i) => `<div class="lrow"><div class="m"><div class="t">${esc(o.model)}</div><div class="sub">부하율 ${o.load_pct}% · 공칭 ${fmt(o.nominal_kw, 1)} kW</div></div><div class="r f-bodyStrong num">${o.components?.length ? won(sum(o)) : "-"}</div>${selOr("txv", o.model, i === O.chosenIdx)}</div>`).join(""))}` : ""}</div>
    ${navrow("cooler", "quote")}`;
  const fig = c ? txvFigure(c, { ...R.in, count: O.count }) : null;
  const main = (list.length
    ? `${sl(`팽창변${c ? ` — ${esc(c.model)}${O.count > 1 ? ` × ${O.count}조` : ""}` : ""}`)}<div class="vgrid">${fig ? card(`<div class="sl2">구성도</div>` + fig, "figcard") : ""}${card(`<div class="sl2">후보별 부하율</div>` + loadPctSvg(list, O.chosenIdx))}</div>`
    : "");
  return { side, main, viz: "", sceneMain: true, holdSide: true };
}

// ── 견적(대표 11/13 「부하계산에서 팽창변까지 이어져야 최종 견적」) — 유니트 세트(압축기 포함) + 유닛쿨러 × 대수 + 팽창변 × 조수.
//   기본가(부가세 따로 적지 않음). 가격을 모르는 칸은 「확인 필요」로 세고 합계에서 뺀다. 설치·운송 등은 「별도」 ──
function quoteText(Q) {
  const L = S.result?.load?.out;
  const lines = [`RChatAI 냉동 설계 견적(기본가) — ${dayLabel(Date.now())}`, L && loadReady() ? `창고 ${S.result.load.in.roomC}℃ · ${fmt(S.result.load.in.w * S.result.load.in.d / 3.3058, 1)}평 · 냉동부하 ${fmt(L.총냉각열량Kw, 1)} kW` : "", ""];
  for (const x of Q.items) lines.push(`${x.name}${x.sub ? ` (${x.sub})` : ""} × ${x.qty} = ${x.amount != null ? won(x.amount) : "가격 문의"}${x.check ? ` — ${x.check}` : ""}`);
  if (Q.warnings?.length) lines.push("", "※ 능력 확인 필요", ...Q.warnings.map((w) => `- ${w}`));
  lines.push("", `기본가 합계 ${won(Q.total)}${Q.unknown ? ` (확인 필요 ${Q.unknown}건 제외)` : ""}`, `별도: ${Q.extra.join(", ")}`);
  return lines.filter((l, i) => l !== "" || i > 0).join("\n");
}
function viewQuote() {
  const Q = S.result?.quote;
  if (!Q) { if (!S.quoteAsked) { S.quoteAsked = true; computeSoon(); } return { side: `<div class="empty">견적 계산 중…</div>`, main: `<div class="empty">견적 계산 중…</div>`, viz: "" }; }
  S.quoteAsked = false;
  const W = Q.warnings ?? [];
  const warnBox = W.length ? note(`<b>능력이 모자란 부품이 ${W.length}건 있어요 — 이대로 보내기 전에 고쳐 주세요</b><br>${W.map(esc).join("<br>")}`, "bad") : "";
  const L = S.result.load?.out, max = Math.max(...Q.items.map((x) => x.amount ?? 0), 1);
  const rows = Q.items.map((x) => `<div class="qrow" data-tab="${x.key}"><div class="qn"><div class="t">${esc(x.name)}</div><div class="sub">${esc(x.sub ?? "")}</div>${x.check ? `<div class="qchk">${icon("alert-circle-outline")}${esc(x.check)}</div>` : ""}${(x.warn ?? []).map((w) => `<div class="qwarn">${icon("alert-circle-outline")}${esc(w)}</div>`).join("")}</div>
      <div class="qq num">× ${x.qty}</div><div class="qu num">${x.unitPrice != null ? won(x.unitPrice) : "—"}</div><div class="qa num">${x.amount != null ? won(x.amount) : "가격 문의"}</div>
      <div class="bt meter qbar"><div style="width:${(x.amount ?? 0) / max * 100}%;background:#191F28"></div></div></div>`).join("");
  const main = `${warnBox}${sl("견적 — 줄을 누르면 그 단계로 가서 고칠 수 있어요")}${card(`<div class="qhead"><span>품목</span><span>수량</span><span>단가</span><span>금액</span></div>${rows}
      <div class="divider"></div><div class="qrow qtot"><div class="qn"><div class="t">기본가 합계</div><div class="sub">${Q.unknown ? `확인 필요 ${Q.unknown}건은 빼고 더한 값` : "모든 품목 가격 확인됨"}</div></div><div></div><div></div><div class="qa num">${won(Q.total)}</div></div>`)}
    ${sl("별도")}${card(`<div class="sub" style="padding:4px 0">${Q.extra.map(esc).join(" · ")} — 현장 조건에 따라 따로 정해요</div>`)}`;
  const side = `<div data-live="res">${warnBox}${sl("결과")}${card(hero("기본가 합계", won(Q.total), "", Q.unknown ? `확인 필요 ${Q.unknown}건 빼고 · 설치·운송 별도` : "설치·운송 별도", "a.quote")
      + `<div class="divider"></div>` + (L && loadReady() ? rrow("냉동부하", `${fmt(L.총냉각열량Kw, 1)} kW`) : "") + Q.items.map((x) => rrow(esc(x.name), x.amount != null ? won(x.amount) : "가격 문의")).join(""))}
    ${Q.unknown ? note(`가격을 확인해야 하는 품목이 ${Q.unknown}건 있어요 — 왼쪽 줄의 사유를 보고 확인해 주세요`, "warn") : ""}</div>
    <div class="navrow"><button class="btn secondary" data-tab="txv">${icon("chevron-back")}팽창변</button><button class="btn" data-copyquote="1">견적 글 복사</button></div>`;
  return { side, main, viz: "", sceneMain: true, holdSide: true };
}

const PART_STEPS = [["comp", "압축기"], ["unit", "유니트"], ["cooler", "유닛쿨러"], ["txv", "팽창변"]];
const stageSet = (k) => (k === "unit" ? !!S.result?.unit?.out?.draft : !!S.result?.[k]?.out?.chosen && !needOf(k).length);
/** 부품 네 단계가 모두 손님 값으로 정해졌는지 — 그러면 부하계산이 덜 차도 견적을 낸다 */
const partsAllSet = () => PART_STEPS.every(([k]) => stageSet(k));
/** 필수 값이 남았을 때(대표 11/14) — 부하계산: 오른쪽에 필수 칸만, 가운데에 남은 값 목록·창고 위치 / 견적: 남은 값·부품 단계 안내 */
function viewNeedInputs(miss) {
  const done = REQ.length - miss.length;
  const list = REQ.map((r) => { const ok = r.ok(); return `<div class="needrow ${ok ? "ok" : ""}"><span class="mk">${ok ? icon("checkmark") : ""}</span><span>${esc(r.nm)}</span>${ok ? "" : `<span class="sub">비어 있어요</span>`}</div>`; }).join("");
  const head = `<div class="needhead"><div class="t">${miss.length}개만 넣으면 계산돼요</div><div class="sub">${done}/${REQ.length} 완료 · 하루 입고량은 모르면 비워 두세요(표 값으로 계산)</div><div class="bt meter"><div style="width:${done / REQ.length * 100}%;background:#191F28"></div></div></div>`;
  if (S.tab !== "load") {
    // 견적(대표 11/16) — 부하계산을 다 넣거나, 압축기·유니트·유닛쿨러·팽창변을 모두 정하면 나온다. 단계마다 무엇이 남았는지 보이고 누르면 그 탭으로
    const parts = PART_STEPS.map(([k, nm]) => { const ok = stageSet(k), ns = needOf(k).map((n) => n.nm).join("·");
      return `<div class="needrow tap ${ok ? "ok" : ""}" data-tab="${k}"><span class="mk">${ok ? icon("checkmark") : ""}</span><span>${nm}</span>${ok ? "" : `<span class="sub">${esc(ns ? `${ns} 비어 있어요` : "정해지지 않았어요")}</span>`}</div>`; }).join("");
    return { main: `${sl("견적")}${card(`<div class="needwrap"><div class="needbig">부하계산을 다 넣거나, 부품을 모두 정하면 견적이 나와요</div>${head}${list}
      <div class="sl2" style="margin-top:14px">부품부터 정할 때</div>${parts}
      <div class="navrow" style="margin-top:12px"><button class="btn" data-tab="load">부하계산으로</button><button class="btn secondary" data-tab="comp">압축기부터</button></div></div>`)}`, side: "", viz: "", sceneMain: true };
  }
  const R = S.result?.load, Cl = S.site.climate;
  const fs = (keys) => keys.map((k) => S.fields.load.find((f) => f.key === k)).filter(Boolean).map((f) => (f.key === "item" && S.items ? itemField(f) : fieldHtml("load", f))).join("");
  // 3D 에서 고른 부분(대표 11/19 「필수값 전에도 누르면 입력창이 바로」) — 그 부분 입력 칸만. 결과(kcal)는 필수값이 다 찬 뒤에만 보인다
  const GATE_KEYS = ["roomC", "pyeong", "w", "d", "h", "insulMm", "item", "inMode", "dailyTon"];
  const zg = S.zone && S.zone !== "room" ? ZONES.find((z) => z.id === S.zone) : null;
  let zoneBox = "";
  if (zg) {
    const zf = zg.keys.filter((k) => !GATE_KEYS.includes(k)).map((k) => S.fields.load.find((f) => f.key === k)).filter(Boolean);
    const main = zf.filter((f) => (f.group ?? "main") === "main"), rest = zf.filter((f) => (f.group ?? "main") !== "main");
    const html = (f) => (f.key === "item" && S.items ? itemField(f) : fieldHtml("load", f));
    const shown = zg.keys.filter((k) => GATE_KEYS.includes(k)).map((k) => S.fields.load.find((f) => f.key === k)?.label).filter(Boolean);
    zoneBox = `<div id="zonebox">${sl(`${esc(zg.name)} <span class="sub">${esc(zg.sub)} · 결과는 필수값을 다 넣은 뒤에 나와요</span>`)}${card(
      (shown.length ? `<div class="sub" style="padding:6px 0">${esc(shown.join("·"))}는 아래 필수 칸에 있어요</div>` : "")
      + main.map(html).join("") + (rest.length ? rest.map(html).join("") : "")
      + (!zf.length ? `<div class="sub" style="padding:6px 0 8px">따로 넣을 값 없음 — 표·자동 값으로 계산</div>` : ""))}
      ${zg.id === "wall" ? exp("zone-wall-face", "면별 조건 — 바닥(마루) 온도·두께", faceTable()) : ""}</div>`;
  }
  // 창고 위치 검색은 「넣어야 할 값」 박스 아래에 붙여 한 박스처럼(대표 11/28 「너무 밑에 있어서 찾기 힘들어」).
  //   data-live="res" 밖에 두는 까닭: 다른 칸 값을 넣을 때마다 res 가 갈아 끼워져 치던 검색어·포커스가 날아간다
  const siteIn = R ? `<div id="sitebox">${card(`<div class="needsite-t">창고 위치 <span class="sub">선택 · 넣으면 외기온도를 지역 여름 최고기온으로</span></div>${siteBody(R)}`, "needsite")}</div>` : "";
  const side = `<div data-live="res">${sl("넣어야 할 값")}${card(head + list, siteIn ? "needcard" : "")}</div>${siteIn}
    ${zoneBox}
    ${sl("창고")}${card(fs(["roomC", "pyeong", "w", "d", "h"]))}
    ${sl("판넬")}${card(fs(["insulMm"]))}
    ${sl("보관 품목·입고")}${card(fs(["item", "inMode", "dailyTon"]))}`;
  // 압축기를 먼저 고정했으면(대표 11/16) 그 압축기로 가능한 창고를 바로 여기에 — 줄을 누르면 고내온도·평수가 들어간다
  const CF = S.result?.comp?.out?.fit;
  // 「새 창고 설계 — 오른쪽 칸을 채우면…」 안내 카드는 걷음(대표 11/28 「이것도 없애줘」) — 압축기부터 시작은 시작 창·단계 칩으로
  const main = `${CF ? fitBlock(CF) : ""}
    ${Cl && S.site.place && R ? `${sl(`월별 기온 — ${esc(S.site.place.short)}`)}${card(climateSvg(Cl, R.in.outdoorC))}` : ""}`;
  return { side, main, viz: "", sceneMain: true, holdSide: true };
}

// 부품 상담 칸(대표 11/16 「부품 검색은 페이지 일부를 채팅창으로」·「남은 품번이 5개 이하가 될 때까지 되묻기로」·「이름뿐만 아니라 사양으로도」).
//   AI 없이 라이브 상담 소거 엔진(chat/elim.ts)만 — 손님 말에서 부품·사양을 읽고, 남은 품번이 많으면 사장님 지식 정리 파일 순서대로 되묻는다.
//   지난 말은 한 줄 요약, 지금 말은 지도 길 안내 단계 → 결과(되묻기 단추 · 좁힌 품번).
const PC_EX = ["댄포스 압축기", "R404A 5마력 380V", "드라이어 3/8", "R22 1/4 팽창변"];
function pcRows(rows, num = true) {
  return card(rows.map((r, i) => `<div class="lrow tap" data-rvar="${r.id}">${num ? `<span class="nv-no">${i + 1}</span>` : ""}<div class="m"><div class="t num">${esc(r.modelNo)}</div><div class="sub">${esc([r.brand, r.modelName].filter(Boolean).join(" · "))}${r.unknown.length ? ` · <span class="w">${esc(r.unknown.join("·"))} 빈칸</span>` : ""}</div>${r.line ? `<div class="sub pc-line">${esc(r.line)}</div>` : ""}</div><div class="r f-bodyStrong num">${won(r.price)}</div></div>`).join(""));
}
function pcText(P, num) {
  return card(P.items.map((x, i) => `<div class="lrow tap" data-part="${x.id}">${num ? `<span class="nv-no">${i + 1}</span>` : ""}${x.thumb ? `<img src="${esc(x.thumb)}" loading="lazy" onerror="this.outerHTML='<div class=thumb></div>'">` : `<div class="thumb"></div>`}<div class="m"><div class="t">${esc(x.name)}</div><div class="sub">${esc([x.brand, `품번 ${x.variants}개`].filter(Boolean).join(" · "))}</div></div><div class="r f-bodyStrong num">${x.minPrice ? `${fmt(x.minPrice)}원~` : ""}</div>${icon("chevron-forward", "c2")}</div>`).join(""));
}
/** 지난 답 한 줄 — 다음 말을 하면 지금 답이 이렇게 접힌다 */
function pcSum(P) {
  const X = P.how, R = X?.path;
  if (R) return `${esc(R.label)} ${fmt(R.start)}개 → <b>${fmt(R.left)}개</b>${R.left > (R.askUntil ?? 5) && R.ask?.length ? " · 되묻기" : ""}`;
  if (X?.cands) return "어떤 부품인지 되물음";
  return `글자로 찾은 제품 ${fmt(P.items.length)}개`;
}
/** 사양 표로 찾은 결과에 붙는 줄 — 사양 확인 필요(빈칸이라 맞는지 모르는 품번) · 표로 보기 · 표에 아직 없는 품번 수 */
function pcSpecTail(R) {
  if (!R?.spec) return "";
  const chk = R.checkN ? `<details class="nv-more pc-chk"><summary><span class="w">사양 확인 필요 ${fmt(R.checkN)}개</span> — 값이 빈 칸이 있어 맞는지 알 수 없는 품번</summary>${pcRows(R.check, false)}${R.checkN > R.check.length ? `<div class="sub" style="padding:8px 4px">외 ${fmt(R.checkN - R.check.length)}개</div>` : ""}</details>` : "";
  const un = R.unassigned?.미분류 ? ` · 사양 표에 아직 없는 품번 ${fmt(R.unassigned.미분류)}개는 빠져 있어요` : "";
  const ops = R.opens || [];
  const btn = ops.length > 1 ? ops.map((o) => `<button type="button" class="txtbtn" data-spopen="${esc(o.key)}">${esc(o.name)} ${o.n}개 표로 보기</button>`).join(" · ") : `<button type="button" class="txtbtn" data-spopen="1">표로 보기</button>`;
  return `${chk}<div class="pc-p sub">${esc(R.label)} 사양 표 ${R.tables.length}개로 찾았어요${un}. ${btn}</div>`;
}
// 사양 표 줄(pcSpecTail)은 검토용이라 손님 화면에서 뺌(대표 11/28 「실제로 사용자가 쓸 것만」)
function pcResult(P) { return pcResult0(P); }
function pcResult0(P) {
  const X = P.how, R = X.path, U = R?.askUntil ?? 5;
  const adds = "";   // 고른 조건 칩은 검색창 아래(partsBar)에
  if (R) {
    const conds = R.steps.filter((x) => !x.skipped).map((x) => `${esc(x.item)} ${esc(x.said)}`);
    const head = `<div class="pc-t"><b>${esc(R.label)}</b> 판매 중 ${fmt(R.start)}개${conds.length ? ` → ${conds.join(" · ")}` : ""} → <b class="pc-n">${fmt(R.left)}개</b></div>`;
    if (!R.left) return `${head}${adds}<div class="pc-p">조건에 맞는 품번이 없어요${R.zero?.values?.length ? ` — ${esc(R.zero.item)} 있는 값: ${esc(R.zero.values.join(", "))}` : ""}.${P.add.length ? " 고른 값의 ✕ 를 눌러 빼 보세요." : ""}</div>`;
    if (R.left <= U) return `${head}${adds}<div class="pc-p">${fmt(R.left)}개로 좁혔어요. 매출순이에요.</div>${pcRows(R.rows)}`;
    // 되묻는 중엔 순번 없이 훑어보기만 — 매출순 순번은 다 좁힌 뒤에(대표 11/16)
    const more = `<details class="nv-more"><summary>지금 남은 ${fmt(R.left)}개 훑어보기</summary>${pcRows(R.rows.slice(0, 30), false)}${R.left > 30 ? `<div class="sub" style="padding:8px 4px">외 ${fmt(R.left - 30)}개</div>` : ""}</details>`;
    if (R.ask?.length) {
      const ask = R.ask.map((a) => `<div class="nv-fork"><div class="nv-fi">${esc(a.item)}</div><div class="nv-fv">${a.picks.map((v) => `<button type="button" class="chip" data-fork="${esc(JSON.stringify({ item: a.key, name: a.key === "종류" ? "종류" : a.item, value: v.value, said: v.label }))}">${esc(v.label)} <small>${fmt(v.n)}</small></button>`).join("")}<button type="button" class="chip pc-skip" data-fork="${esc(JSON.stringify({ item: a.key, name: a.key === "종류" ? "종류" : a.item, value: "__skip__", said: "모름" }))}">모름</button></div></div>`).join("");
      return `${head}${adds}<div class="pc-p">${U}개 이하로 줄이려면 아는 것을 골라 주세요. 하나만 골라도 바로 다시 찾아요. 단추 숫자는 고르면 남는 품번 수예요.</div>${card(ask)}${more}`;
    }
    return `${head}${adds}<div class="pc-p">${fmt(R.left)}개가 남았는데, 더 가를 사양 값이 품번에 없어요. 매출순 앞 ${fmt(Math.min(30, R.left))}개예요(지도 순번과 같은 차례).</div>${pcRows(R.rows.slice(0, 30))}${R.left > 30 ? `<div class="sub" style="padding:8px 4px">외 ${fmt(R.left - 30)}개</div>` : ""}`;
  }
  if (X.cands) {
    return `<div class="pc-t">부품 이름 없이 <b>${X.cands.read.map((r) => esc(r.said)).join(" · ")}</b>만 있어요. 어떤 부품인가요?</div>
      ${card(`<div class="nv-fork"><div class="nv-fv">${X.cands.list.map((c) => `<button type="button" class="chip" data-cand="${esc(c.label)}">${esc(c.label)} <small>${fmt(c.n)}</small></button>`).join("")}</div></div>`)}
      <div class="pc-p sub">단추 숫자 = 그 부품에서 이 사양으로 남는 품번 수</div>
      ${P.items.length ? `<details class="nv-more"><summary>글자로 찾은 제품 ${fmt(P.items.length)}개</summary>${pcText(P, false)}</details>` : ""}`;
  }
  return P.items.length ? `<div class="pc-t">부품 종류를 못 읽어서 이름·품번 글자로 찾았어요. 제품 ${fmt(P.items.length)}개예요.</div>${pcText(P, true)}`
    : P.busy ? `<div class="pc-p sub">글자로 찾는 중…</div>` : `<div class="pc-t">찾은 부품이 없어요. 부품 이름(예: 드라이어)이나 품번을 적어 주세요.</div>`;
}
function pcNow(P) {
  const nv = P.nav;
  if (!P.how) return `<div class="pc-p sub">찾는 중…</div>`;
  const done = !nv || nv.at >= nv.steps.length;
  if (!done) return `<div class="nv-head"><div class="nv-h">지도에서 찾는 중</div><button type="button" class="chip" data-nav="skip">건너뛰기</button></div>${navList(nv.steps, nv.at)}`;
  return pcResult(P); // 끝난 뒤 「지도 길 안내 N단계」 접는 칸은 검토용이라 뺌(대표 11/28)
}
// 부품 검색창(대표 11/28 「창으로 나와서 채팅창이랑 헷갈려 — 그냥 상단에」) — 지도 위 검색창 + 고른 조건 칩, 결과·되묻기는 오른쪽 「검색 결과」 칸.
//   검색창에는 지금 검색어가 그대로 들어 있다 — 고쳐서 다시 찾으면 새 검색(같은 글이면 고른 조건 유지)
function partsBar(P) {
  const conds = P.add.length ? P.add.map((a, i) => `<button type="button" class="chip on" data-unadd="${i}" title="이 조건 빼기">${esc(a.name ?? a.item)} ${esc(a.said ?? a.value)} ${icon("close")}</button>`).join("") : "";
  const ex = !P.q ? `<span class="sub">예)</span>${PC_EX.map((t) => `<button type="button" class="chip" data-pcex="${esc(t)}">${esc(t)}</button>`).join("")}` : "";
  return `<div class="pm-search"><form id="parts-form" class="searchbox">${icon("search-outline")}<input id="parts-q" autocomplete="off" value="${esc(P.q)}" placeholder="부품 이름·품번·사양">${P.q ? `<button type="button" class="txtbtn" data-pclear="1">지우기</button>` : ""}</form>
    ${conds || ex ? `<div class="pm-conds">${conds}${ex}</div>` : ""}</div>`;
}
function resultPanel(P) {
  return `<div class="pc-head"><div class="nv-h">검색 결과</div></div><div class="pc-log"><div class="pc-res">${pcNow(P)}</div></div>`;
}

// 부품 검색(대표 11/10) — 위 검색 상자 / 아래 부품 지도(partmap.js, 회사 새 상품코드 분류) + 오른쪽 칸(고른 품번 · 검색 결과 · 제품 상세).
//   지도는 다시 그려도 같은 캔버스를 다시 붙인다(mountMap) — 보던 자리·확대가 그대로 남는다.
function viewParts() {
  const P = S.parts, d = P.detail, k = P.pick;
  const price = (v) => (v.discontinued ? `<span style="color:var(--dangerText)">단종</span>` : won(v.price_krw));
  // 사양 글이 품번으로 시작하면(「R-404A 10KG 중국 — 기타 사양: …」) 그 앞말은 뗀다 — 바로 위 줄이 품번
  const specOf = (v) => { const t = String(v.spec ?? ""); return t.startsWith(v.model_no) ? t.slice(v.model_no.length).replace(/^\s*[—–-]\s*/, "") : t; };
  let panel = "";
  if (d) {
    panel = `<button class="txtbtn" data-back="1">${icon("chevron-back")}${k ? "고른 품번" : "검색 결과"}</button>
      ${sl(`${esc(d.part?.brand ?? "")}`)}${card(`<div class="hero"><div class="v" style="font-size:22px;line-height:31px">${esc(d.part?.name ?? "")}</div><div class="s">품번 ${d.variants.length}개 · 지도에 표시 · 기본가, VAT 별도</div></div>`)}
      ${sl("품번")}${card(d.variants.map((v) => `<div class="lrow${k?.id === v.id ? " lk" : ""}"><div class="m"><div class="t num">${esc(v.model_no)}</div>${v.model_name || v.spec ? `<div class="sub">${esc([v.model_name, specOf(v).slice(0, 100)].filter(Boolean).join(" · "))}</div>` : ""}</div><div class="r f-bodyStrong num">${price(v)}</div></div>`).join(""))}`;
  } else if (k) {
    const sub = [k.brand, k.model_name && k.model_name !== k.model_no ? k.model_name : null].filter(Boolean).join(" · ");
    panel = `<button class="txtbtn" data-unpick="1">${icon("chevron-back")}${P.q ? "검색 결과" : "닫기"}</button>${sl(esc(k.path))}${card(`<div class="hero"><div class="v num" style="font-size:22px;line-height:31px">${esc(k.model_no)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ""}</div>
      <div class="lrow"><div class="m">기본가, VAT 별도</div><div class="r f-bodyStrong num">${price(k)}</div></div>
      ${k.discontinued && k.discontinued_note ? `<div class="sub" style="padding:4px 0 8px">${esc(k.discontinued_note)}</div>` : ""}
      ${k.spec ? `<div class="sub" style="padding:4px 0 8px;white-space:pre-line">${esc(specOf(k).slice(0, 400))}</div>` : ""}
      ${k.part_id ? `<div class="lrow tap" data-part="${k.part_id}"><div class="m"><div class="t">같은 제품 품번 보기</div>${k.part_name ? `<div class="sub">${esc(k.part_name)}</div>` : ""}</div>${icon("chevron-forward", "c2")}</div>` : ""}`)}`;
  } else if (P.q) panel = resultPanel(P);
  // 보기 전환(찾는 과정·데이터 현황·사양 표, 11/15~16)은 우리 검토용이라 뺌 — 손님은 부품 지도 + 부품 상담만(대표 11/28)
  P.view = "map";
  const body = `<div id="pm-host" class="pm-wrap"></div>${panel ? `<div class="pm-panel${d || k ? "" : " pc"}">${panel}</div>` : ""}`;
  return { side: "", viz: "", main: `<div class="pm-page">${partsBar(P)}<div class="pm-body">${body}</div></div>` };
}

const VIEWS = { parts: viewParts, load: viewLoad, comp: viewComp, unit: viewUnit, cooler: viewCooler, txv: viewTxv, quote: viewQuote };
/** 설계 단계 칩(1~5) — 누르면 그 단계(오른쪽 입력·결과, 3D 카메라)로 */
function stepChips() {
  return `<div class="steps" role="tablist" aria-label="설계 단계">${STAGES.map((s, i) => `<button type="button" role="tab" class="stp ${S.tab === s ? "on" : ""}" data-tab="${s}"><span class="n">${i + 1}</span><span class="m"><span class="t">${TABS.find((t) => t.id === s).nm}</span><span class="v">${esc(stepVal(s) || "-")}</span></span></button>`).join("")}</div>`;
}
// 3D(design3d.js) — 처음 설계 탭을 열 때 한 번 불러와 만들고, 다시 그릴 때마다 같은 요소를 자리에 붙인다(부품 지도와 같은 방식)
let D3 = null, D3P = null;
function mount3d() {
  const slot = document.getElementById("d3slot"); if (!slot) return;
  if (!D3) {
    D3P ??= import("./design3d.js").then((m) => {
      D3 = m.createDesign3D({
        onStep: (st) => setTab(st),
        onZone: (z) => {
          S.zone = z; if (S.tab !== "load") setTab("load"); else render();
          // 필수값 전이면 오른쪽 칸 맨 위는 「넣어야 할 값」이라 고른 부분 칸으로 내려 준다
          requestAnimationFrame(() => (document.getElementById("zonebox") ?? (z === "room" ? document.getElementById("f-load-roomC") : null))?.scrollIntoView({ block: "start", behavior: "smooth" }));
        },
        onField: (st, k) => { setTab(st); requestAnimationFrame(() => showTargets([`in.${st}.${k}`])); },
      });
      render();
    }).catch((e) => { D3P = null; status(`3D 화면을 불러오지 못했습니다: ${e.message}`); });
    if (!slot.firstChild) slot.innerHTML = `<div class="empty">3D 불러오는 중…</div>`;
    return;
  }
  if (D3.el.parentNode !== slot) { slot.innerHTML = ""; slot.appendChild(D3.el); D3.resize(); }
  const R = S.result, ready = loadReady();
  D3.update(R, { tab: S.tab, zone: S.zone ?? "room", loadReady: ready,
    zones: ZONES.map((z) => ({ id: z.id, name: z.name, sub: z.sub, line: R?.load && ready ? zoneLine(R.load, z) : z.sub })) });
}
function render() {
  // 새 창고 시작 창 — 이 탭(브라우저 세션)에서 처음 그릴 때 한 번. 새로고침은 같은 세션이라 안 뜬다(대표 11/14)
  if (!S.startChecked && S.result?.load) { S.startChecked = true; let shown = false; try { shown = sessionStorage.getItem("designweb.startShown") === "1"; } catch {} if (!shown) setTimeout(showStartPick, 400); }
  if (!S.fields) return;
  // 마우스·손가락을 누르고 있는 동안(슬라이더 끌기 말고)은 화면을 갈아 끼우지 않는다 — 누른 단추가 새 단추로 바뀌면 click 이 안 난다
  //   (칸에 숫자를 치고 바로 탭·칩을 누르면 change → 다시 그리기가 누른 단추를 지워 첫 클릭이 씹혔다). 손을 떼면 한 번 그린다.
  if (PTR.down && !PTR.slide) { PTR.pending = true; return; }
  const active = document.activeElement?.id;
  const sc = $("#main").scrollTop, ss = $("#side").scrollTop, sv = $("#viz").scrollTop;
  TIPS.clear();   // 그림 정보 글은 그릴 때마다 새 값으로
  // 부하계산 필수 값이 남았을 때 막는 것은 부하계산 탭(기본 창고 결과를 안 보임)과 견적(부품을 다 정하지 않았을 때)뿐 —
  //   압축기·유니트·유닛쿨러·팽창변은 그 탭 값만으로 계산한다(대표 11/16 「압축기만 먼저 고정하고 가능한 창고 찾기」)
  const miss = S.tab === "load" || S.tab === "quote" ? missingReq() : [];
  const gate = miss.length > 0 && (S.tab === "load" || !partsAllSet());
  const v = gate ? viewNeedInputs(miss) : VIEWS[S.tab]();
  if (STAGES.includes(S.tab)) v.main = stepChips() + mainSlot() + v.main;
  const tb = topBar(); if (S.lastTabs !== tb) { $("#tabsbar").innerHTML = tb; S.lastTabs = tb; }
  // 부하계산(대표 11/12): 가운데 = 창고 그림(입력 칸 없음 → 끄는 중에도 다시 그림), 오른쪽 = 조절창(입력 칸 → 끄는 중엔 그대로)
  if (!(S.holdMain && v.holdSide)) $("#side").innerHTML = v.side;
  else {
    // 끄는 중(대표 11/13 「슬라이드 옮길 때 이런 값들도 즉시」) — 입력 칸은 그대로 두고, 입력이 없는 결과 덩어리(data-live)만 새 값으로 바꾼다
    const t = document.createElement("template"); t.innerHTML = v.side;
    for (const el of $("#side").querySelectorAll("[data-live]")) {
      const n = t.content.querySelector(`[data-live="${CSS.escape(el.dataset.live)}"]`);
      if (n && n.innerHTML !== el.innerHTML) el.innerHTML = n.innerHTML;
    }
  }
  $("#side").hidden = !v.side;
  $("#view").classList.toggle("pm", S.tab === "parts");
  $("#view").classList.toggle("scene", !!v.sceneMain);
  document.querySelector(".body")?.classList.toggle("t-scene", !!v.sceneMain);
  if (!S.holdMain || v.sceneMain) { $("#view").innerHTML = v.main; if (S.tab === "parts") { mountMap(); SPEC.mount(); } }
  if (STAGES.includes(S.tab)) mount3d();
  if (S.holdMain) syncInputs();   // 끄는 중 — 칸은 다시 그리지 않고 숫자만 맞춘다(창고 크기를 끄는 동안 추정값 칸도 따라 바뀐다)
  $("#viz").innerHTML = v.viz ?? ""; $("#viz").hidden = !v.viz;
  $("#main").scrollTop = sc; $("#side").scrollTop = ss; $("#viz").scrollTop = sv;
  if (active && active !== "chat-input" && document.getElementById(active)) document.getElementById(active).focus();
  applyHl();
  refreshTip();
  // 바뀐 값 — 옅은 면이 잠깐 깔린다
  for (const el of document.querySelectorAll("[data-fk]")) {
    const k = el.dataset.fk, v = el.dataset.fv;
    // 끄는 중(holdMain)에는 깜빡이지 않는다 — 여러 칸이 연달아 깜빡여 어지러웠다(대표 11/13). 손을 뗀 뒤 한 번만
    if (!S.holdMain && S.lastVals.has(k) && S.lastVals.get(k) !== v) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
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
  if (S.tab === "load" && S.zone !== "all") {
    const z = ids.map((id) => /^in\.load\.(.+)$/.exec(id)?.[1]).filter(Boolean).map(zoneOfKey).find(Boolean);
    if (z && z.id !== S.zone) { S.zone = z.id; render(); }
  }
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
  for (const el of document.querySelectorAll("#view input[data-stage][data-key], #view [data-slide], #side input[data-stage][data-key], #side [data-slide]")) {
    if (el === act) continue;
    const [st, k] = el.dataset.slide ? el.dataset.slide.split(".") : [el.dataset.stage, el.dataset.key];
    const x = S.result?.[st]?.in?.[k]; if (x == null || typeof x === "object") continue;
    const sv = typeof x === "number" ? String(Math.round(x * 1000) / 1000) : String(x);
    if (el.value !== sv) el.value = sv;
    if (el.dataset.slide) el.style.setProperty("--p", `${Math.max(0, Math.min(100, (el.value - el.min) / (el.max - el.min) * 100))}%`);
  }
}
// 탭을 옮기면 입력 칸(가운데)은 늘 그 탭 것으로 다시 그린다 — 끄는 중 표시(holdMain)가 남아 있어도(대표 11/11 「두 번째 칸이 다 똑같다」)
function setTab(t) { if (t === "design") t = S.lastStage ?? "load"; if (STAGES.includes(t)) S.lastStage = t; const moved = S.tab !== t; S.tab = t; S.holdMain = false; S.livePending = false; history.replaceState(null, "", `#${t}`); render(); if (moved) { $("#main").scrollTop = 0; $("#side").scrollTop = 0; $("#viz").scrollTop = vizStart(t); } }
/** 유닛쿨러·팽창변 화면은 계통도 아래쪽(창고)이 그 화면 부품이라 시각화 칸을 그 자리로 내려 둔다 — 위로 올리면 유니트 쪽 */
function vizStart(t) {
  if (t !== "cooler" && t !== "txv") return 0;
  const room = document.querySelector('#viz [data-room]'), viz = $("#viz");
  if (!room) return 0;
  return Math.max(0, room.getBoundingClientRect().top - viz.getBoundingClientRect().top + viz.scrollTop - 120);
}

// ───────────────────────── 부품 검색 ─────────────────────────
// 부품 지도 — 처음 부품 검색 탭을 열 때 한 번 만들고 자료(/api/partmap)를 받는다. 다시 그릴 때마다 같은 요소를 자리에 붙인다.
let PM = null;
function mountMap() {
  const host = document.getElementById("pm-host"); if (!host) return;
  if (!PM) {
    PM = createPartMap({ onPick: pickVariant });
    api("/api/partmap").then((d) => { PM.setData(d); if (S.parts.navPending) startNav(S.parts.seq); else applyLit(); render(); }).catch((e) => status(`부품 지도를 불러오지 못했습니다: ${e.message}`));
  }
  host.replaceWith(PM.el);
  // 다른 탭·보기에 있는 동안 받은 길 안내 — 지도가 다시 붙으면 시작
  if (S.parts.navPending && PM.ready() && S.parts.view === "map") setTimeout(() => { if (S.parts.navPending) startNav(S.parts.seq); }, 0);
  // 겹쳐 뜬 오른쪽 칸이 가린 폭을 지도에 알린다(좁은 화면에선 칸이 지도 아래로 내려가 0)
  const pn = document.querySelector(".pm-panel");
  PM.setInset(pn && getComputedStyle(pn).position === "absolute" ? pn.offsetWidth + 16 : 0);
  // 상담 칸 — 새 말·새 단계가 오면 맨 아래로, 아니면 보던 자리 그대로(다시 그릴 때마다 맨 위로 튀지 않게)
  const lg = document.querySelector(".pc-log");
  if (lg) {
    const P = S.parts, sig = `${P.log.length}|${P.seq}|${P.nav?.at ?? ""}|${P.how ? 1 : 0}|${P.items.length}`;
    lg.scrollTop = sig !== P.logSig ? lg.scrollHeight : P.logTop ?? lg.scrollHeight;
    P.logSig = sig;
    lg.addEventListener("scroll", () => { P.logTop = lg.scrollTop; }, { passive: true });
  }
}
/** 검색 표시 — 품번·메이커·모델명에 낱말이 다 든 품번을 먼저(「R404」 → R-404A 품번들), 없으면 검색 결과 제품의 품번 */
function applyLit() {
  const P = S.parts;
  if (!PM?.ready() || P.nav) return;   // 길 안내 중엔 지도 칸 표시를 길 안내가 쥔다
  if (!P.q) { P.lit = PM.highlight(null); return; }
  let ids = PM.matchText(P.q);
  if (!ids.size) ids = PM.idsOfParts(P.items.map((x) => x.id));
  P.lit = PM.highlight(ids);
}
// 검색 = 지도 길 안내(대표 11/15) + 부품 상담 칸(11/16). 길 자료(/api/parts/explain — 소거 엔진·검색 RPC)가 오면 지도에서 단계대로 움직인다.
//   add = 되묻기에서 고른 값 · opt.me = 상담 칸에 손님 말로 남길 글(없으면 새 상담) · opt.ctx = 앞 검색어(이번 말에 부품 이름이 없으면 이어 붙임)
async function searchParts(q, add = [], opt = {}) {
  const P = S.parts, my = ++P.seq;
  if (opt.me != null) {
    if (P.q && P.how) P.log.push({ who: "bot", html: pcSum(P) });
    P.log.push({ who: "me", text: opt.me });
    P.prevSteps = P.nav?.steps ?? null;
  } else { P.log = []; P.prevSteps = null; }
  const q0 = opt.ctx ? `${opt.ctx} ${q}` : q;
  Object.assign(P, { q: q0, add, items: [], detail: null, pick: null, busy: !!q, how: null, nav: null, navPending: false, view: P.view === "data" ? "map" : P.view });
  PM?.pick(null); PM?.navClear();
  if (!q) { applyLit(); return render(); }
  render();
  let x = null;
  try { x = await api(`/api/parts/explain?q=${encodeURIComponent(q)}${add.length ? `&add=${encodeURIComponent(JSON.stringify(add))}` : ""}${opt.ctx ? `&ctx=${encodeURIComponent(opt.ctx)}` : ""}`); }
  catch (e) { if (my !== P.seq) return; status(`길 안내 자료를 불러오지 못했습니다: ${e.message}`); }
  if (my !== P.seq) return;
  if (x) {
    P.how = x; P.q = x.q;
    if (x.fresh) { P.add = []; P.prevSteps = null; }   // 이번 말이 새 부품이면 앞에서 고른 값은 버린다(서버도 버렸다)
    if (S.tab === "parts" && P.view === "how") render();
    startNav(my);
  }
  let items = [];
  try { items = (await api(`/api/parts?q=${encodeURIComponent(P.q)}`)).items; } catch (e) { status(`찾지 못했습니다: ${e.message}`); }
  if (my !== P.seq) return;
  P.items = items; P.busy = false;
  if (!x) applyLit();
  render();
}
/** 길 안내 시작 — 지도 자료·부품 지도 보기가 준비돼야 움직인다(아니면 미뤄 두고 준비되면 시작) */
function startNav(my) {
  const P = S.parts;
  if (my !== P.seq || !P.how) return;
  if (!PM?.ready() || S.tab !== "parts" || P.view !== "map") {
    P.navPending = true;
    // 지도 자료가 아직이면(처음 여는 순간) 잠시 뒤 다시 — 보기·탭이 다르면 그쪽으로 돌아올 때 시작
    if (!PM?.ready() && S.tab === "parts" && P.view === "map") setTimeout(() => { if (S.parts.navPending) startNav(my); }, 400);
    return;
  }
  P.navPending = false;
  // 움직임 줄이기를 켠 사람에겐 기다림 없이 바로 끝 모습(같은 단계·같은 수)
  const nav = { steps: planRoute(P.how, PM), at: 0, fast: !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches };
  P.nav = nav;
  render();
  // 이어 말한 턴(되묻기 답·사양 더 댐)이면 앞 턴과 같은 단계는 움직임 없이 그 상태로 두고, 달라진 단계부터 움직인다
  const key = (s) => `${s.k}|${s.k === "read" ? "" : s.id ?? s.item ?? ""}|${s.said ?? ""}|${s.k === "start" ? s.n : ""}`;
  let from = 0;
  if (P.prevSteps) { while (from < nav.steps.length - 1 && from < P.prevSteps.length && key(nav.steps[from]) === key(P.prevSteps[from]) && nav.steps[from].k !== "prune" && nav.steps[from].k !== "sort") from++; }
  P.prevSteps = null;
  runNav(nav, my, from);
}
/** 길 안내 재생 — 새로 부르면 앞선 재생은 멈춘다(nav.run). from~to 단계만 움직이고 그 앞은 바로 그 상태로 */
function runNav(nav, my, from, to) {
  const P = S.parts, run = (nav.run = (nav.run ?? 0) + 1);
  playRoute(PM, nav.steps, {
    at: (i) => { if (P.nav !== nav || nav.run !== run) return; nav.at = i; if (S.tab === "parts" && P.view === "map" && !P.detail && !P.pick) render(); },
    alive: () => P.nav === nav && P.seq === my && nav.run === run,
    fast: () => nav.fast,
  }, from, to);
}
/** 지도 안내 상자의 이전/다음(대표 11/16) — 그 단계 하나만 움직여 보이고 멈춘다 */
function navGo(k) {
  const P = S.parts, nav = P.nav;
  if (!nav || !PM?.ready()) return;
  k = Math.max(0, Math.min(nav.steps.length - 1, k));
  nav.fast = false;
  runNav(nav, P.seq, k, k);
}
/** 지도에서 품번 칸을 눌렀다 — 칸에 있는 값으로 먼저 보이고, 사양 글·제품 이름은 받아 와서 채운다 */
async function pickVariant(v, path) {
  const P = S.parts;
  P.detail = null;
  P.pick = { id: v[0], model_no: v[1], price_krw: v[2], discontinued: !!v[3], brand: v[4], part_id: v[5], model_name: v[6], path };
  render();
  try { const x = await api(`/api/variant/${v[0]}`); if (x && P.pick?.id === v[0]) Object.assign(P.pick, x); } catch { /* 칸 값만으로 보인다 */ }
  render();
}
/** 제품 상세 — 오른쪽 칸에, 그 제품 품번을 지도에 표시 */
async function openPart(id) {
  const P = S.parts;
  try { P.detail = await api(`/api/part/${id}`); } catch (e) { status(`열지 못했습니다: ${e.message}`); }
  render();
  if (P.detail && PM?.ready()) {
    // 길 안내 중이면 길(칸 상태)은 두고 그 제품 칸만 테두리 + 그쪽으로
    if (P.nav) { const ids = PM.idsOfParts([id]); PM.pickMany(ids); if (ids.size) PM.navFly([...ids], { ms: 600, pad: 0.2, spot: false }); }
    else { P.lit = PM.highlight(PM.idsOfParts([id])); render(); }
  }
  $(".pm-panel")?.scrollTo(0, 0);
}

// ───────────────────────── 상담 — 라이브 앱 상담 화면(ChatScreenV2) 모양 그대로 ─────────────────────────
//   빈 화면: 가운데 「무엇을 도와드릴까요?」 + 한 줄 설명 · 내 말: 검정 말풍선 · 답변: 바탕 없는 글 · 말 아래 [복사] 아이콘
//   기다림: 「생각해 보고 있어요…」 위로 흰빛 띠 · 입력줄: 회색 상자 안에 글칸·[마이크], 글이 있을 때만 [보내기](웹 규칙)
//   ⚠️ 라이브의 👍·👎 는 이 사이트에 받을 곳이 없어 넣지 않았다 — 눌러도 아무 일이 없는 단추를 두지 않는다.
//   [+] 는 메뉴 없이 바로 사진·파일 고르기(대표 11/09 「클립보드 사진·파일 첨부」) — 붙여넣기(⌘V)·끌어 놓기도 같은 첨부 줄로 간다.
const EMPTY_TITLE = "무엇을 도와드릴까요?";
const FIRST_PROGRESS_TEXT = "질문을 읽고 있어요…";   // 서버 첫 문구와 같게 — 0.3초 만에 바뀌며 깜빡이지 않게(대표 11/14)
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
      else main = `<div class="arow"><div>${esc(m.text)}</div>${m.facts?.length ? `<div class="facts">${m.facts.map((f) => `<div>${esc(f)}</div>`).join("")}</div>` : ""}${m.changes?.length ? `<div class="cap">바꾼 값 · ${esc(m.changes.join(" · "))}</div>` : ""}${m.moved?.length ? `<div class="cap">바뀐 모델 · ${esc(m.moved.join(" · "))}</div>` : ""}${m.sum ? `<div class="cap">${esc(m.sum)}</div>` : ""}${m.unverified?.length ? `<div class="cap">화면 자료로 확인되지 않은 숫자 · ${esc(m.unverified.join(", "))}</div>` : ""}${askHtml(m, i)}${procHtml(m, i)}</div>`;
      const tools = m.err ? "" : `<div class="tools ${m.role === "user" ? "u" : "a"}"><button class="tool ${copiedId === i ? "done" : ""}" data-copy="${i}" aria-label="복사">${icon(copiedId === i ? "checkmark" : "copy-outline")}</button></div>`;
      return `<div class="turn">${day}${main}${tools}</div>`;
    }).join("")
    + (S.chatBusy ? `<div class="waitrow"><span class="wait" data-t="${esc(S.chatProgress ?? FIRST_PROGRESS_TEXT)}">${esc(S.chatProgress ?? FIRST_PROGRESS_TEXT)}</span></div>` : "");
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
      const did = [m.changes?.length ? `[화면에서 바꾼 값: ${m.changes.join(" · ")}]` : "", m.moved?.length ? `[바뀐 모델: ${m.moved.join(" · ")}]` : "", m.ask?.length ? `[선택지 카드: ${m.ask.map((q) => q.label).join(" · ")}${m.askDone ? " — 손님이 골라 다음 말로 보냄" : ""}]` : "", m.facts?.length ? `[화면에 보인 값: ${m.facts.join(" · ")}]` : "", m.memo ? `[찾아본 것: ${m.memo}]` : ""].filter(Boolean).join("\n");
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
// ───────────────────────── 선택지 카드(대표 11/17 「챗지피티처럼 선택지까지 고를 수 있게」) ─────────────────────────
//   서버(agent.ts sanitizeAsk)는 «어느 칸을 물을지»만 준다 → 선택지는 여기서 칸 목록·결과표·보관 품목 메뉴로 만든다(목록 밖 선택지가 나갈 수 없다).
//   답이 온 그 시점 값으로 굳혀 둔다(뒤에 결과가 바뀌어도 카드가 흔들리지 않게). 누르면 AI 를 부르지 않고 칸에 바로 넣어 다시 계산한다.
//   질문이 하나이고 고르기(선택 칸·후보·품목)면 누르는 즉시, 아니면 [반영하기]. 목록이 정해진 칸엔 「기타」를 두지 않는다(보관 품목은 메뉴에 있음).
const ASK_ORDER = ["item", "roomC", "pyeong", "h", "insulMm"];
const STAGE_NM = { comp: "압축기", cooler: "유닛쿨러", txv: "팽창변", unit: "유니트", load: "부하계산" };
const hasJong = (w) => { const c = String(w).trim().slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0; };
const eulReul = (w) => `${w}${hasJong(w) ? "을" : "를"}`;
const txvSetWon = (o) => (o?.components?.length ? o.components.reduce((a, x) => (a == null || x.price_krw == null ? null : a + x.price_krw), 0) : null);
function candNames(R, stage) {
  const O = R?.[stage]?.out;
  return stage === "comp" ? (O?.candidates ?? []).map((c) => c.product_id) : stage === "cooler" ? (O?.candidates ?? []).map((c) => c.model) : stage === "txv" ? (O?.options ?? []).map((o) => o.model) : [];
}
function chosenOf(R, stage) {
  const O = R?.[stage]?.out;
  return stage === "comp" ? O?.chosen?.product_id ?? null : stage === "cooler" ? O?.chosen?.model ?? null : stage === "txv" ? O?.chosen?.model ?? null : stage === "unit" ? (O?.draft ? `${O.draft.hp}마력` : null) : null;
}
function buildAsk(items, R) {
  const qs = [];
  for (const { stage, key } of items ?? []) {
    if (key === "pick") {
      const O = R?.[stage]?.out;
      const opts = stage === "comp" ? (O?.candidates ?? []).slice(0, 4).map((c) => ({ value: c.product_id, label: c.product_id, price: c.price_krw ?? null,
          sub: [c.hp != null ? `${hpText(c.hp)}${c.hp_guessed ? "(추정)" : ""}` : null, c.capacity_kw != null ? `${fmt(c.capacity_kw, 1)} kW` : null, c.deviation_pct != null ? `여유 ${fmt(c.deviation_pct, 1)}%` : null].filter(Boolean).join(" · ") }))
        : stage === "cooler" ? (O?.candidates ?? []).slice(0, 4).map((c) => ({ value: c.model, label: c.model,
          sub: [c.maker, c.kcal != null ? `${fmt(c.kcal)} kcal/h` : null, c.margin_pct != null ? `여유 ${fmt(c.margin_pct, 1)}%` : null].filter(Boolean).join(" · ") }))
        : stage === "txv" ? (O?.options ?? []).slice(0, 4).map((o) => ({ value: o.model, label: o.model, price: txvSetWon(o),
          sub: o.load_pct != null ? `부하율 ${fmt(o.load_pct)}%` : "" }))
        : [];
      if (opts.length >= 2) qs.push({ id: `${stage}.pick`, kind: "pick", stage, key, label: STAGE_NM[stage], opts, now: chosenOf(R, stage) });
      continue;
    }
    const f = S.fields[stage]?.find((x) => x.key === key); if (!f) continue;
    const cur = R?.[stage]?.in?.[key];
    if (stage === "load" && key === "item") { if (S.items) qs.push({ id: "load.item", kind: "item", stage, key, label: f.label }); continue; }
    if (stage === "load" && key === "pyeong") { qs.push({ id: "load.size", kind: "size", stage, key, label: "창고 크기" }); continue; }
    if (f.type === "enum") { qs.push({ id: `${stage}.${key}`, kind: "enum", stage, key, label: f.label, opts: f.options.map((o) => ({ value: o.value, label: o.label })), now: cur != null && cur !== "" ? String(cur) : null }); continue; }
    if (f.menu) {
      const menu = R?.[stage]?.out?.[f.menu] ?? [];
      const opts = menu.map((x) => ({ value: String(x.hp), label: `${hpText(x.hp)}${x.stock ? "" : " (주문 제작)"}` }));
      if (opts.length >= 2) qs.push({ id: `${stage}.${key}`, kind: "enum", stage, key, label: f.label, opts, now: cur != null && cur !== "" ? String(Number(cur)) : null });
      continue;
    }
    if (f.type === "num") qs.push({ id: `${stage}.${key}`, kind: "num", stage, key, label: f.label, unit: f.unit ?? "", step: f.step ?? "any", ex: cur ?? null });
  }
  return qs;
}
const askNum = (v) => v != null && String(v).trim() !== "" && Number.isFinite(Number(v));
function askAnswered(q, sel) {
  const v = sel[q.id];
  if (q.kind === "size") return askNum(v?.pyeong) || (askNum(v?.w) && askNum(v?.d));
  if (q.kind === "num") return askNum(v);
  if (q.kind === "item") return v?.val != null && String(v.val).trim() !== "";
  return v != null && v !== "";
}
const askInstant = (m) => m.ask.length === 1 && ["enum", "pick", "item"].includes(m.ask[0].kind);
function askGoBtn(m, i) {
  const sel = m.askSel ?? {}, n = m.ask.filter((q) => askAnswered(q, sel)).length;
  if (askInstant(m) && !(m.ask[0].kind === "item" && sel["load.item"]?.other)) return "";
  return `<button type="button" class="btn ask-go" data-ask-go="${i}" ${n === 0 || S.chatBusy ? "disabled" : ""}>반영하기${m.ask.length > 1 ? `<span class="n">${n} / ${m.ask.length}</span>` : ""}</button>`;
}
// 과정 보기(대표 11/28 「중간 과정도 접힌 채로 — 잘못 답하면 펼쳐서 왜 그런지」) — 서버가 돌려준 도구 기록(trace·out)·숫자 검사·토큰을 그대로 적는다.
//   원가 = luna 단가($/1M 입력 0.20·캐시 0.02·출력 1.20) × 1달러 1,450원 어림
const TOOL_NM = { apply: "값 바꾸기", search_parts: "부품 찾기", part_detail: "제품 품번 읽기", find_site: "위치 찾기", calc: "계산" };
function procTool(t, P) {
  const a = t.args ?? {}, o = t.out && typeof t.out === "object" ? t.out : {}, L = [];
  const cut = (x, n = 160) => { const v = typeof x === "string" ? x : JSON.stringify(x); return v.length > n ? `${v.slice(0, n)}…` : v; };
  let head = TOOL_NM[t.tool] ?? t.tool;
  if (t.tool === "find_site") {
    head += ` 「${a.query ?? ""}」`;
    const bs = P.browserSite;
    if (bs) L.push(`서버 검색 막힘 → 브라우저에서 찾음 · 후보 ${bs.places.length}곳${bs.places.length ? `: ${bs.places.map((p) => p.short).join(" | ")}` : ""}`);
    if (o.ok) {
      L.push(`고른 곳: ${o.고른_곳}`);
      if (o.연중_최고) L.push(`연중 최고 ${o.연중_최고.max}℃ (${o.연중_최고.date}) · 외기온도 칸 ${o.외기온도_칸}℃`);
      if (!bs && Array.isArray(o.후보) && o.후보.length > 1) L.push(`다른 후보: ${o.후보.slice(1).join(" | ")}`);
    }
  } else if (t.tool === "apply") {
    const ch = Array.isArray(a.changes) ? a.changes : [];
    if (ch.length) L.push(`넣으려 한 값: ${ch.map((c) => `${c.stage}.${c.key}=${c.value === "" ? "(비움)" : c.value}`).join(", ")}`);
    if (a.pick?.model) L.push(`고르려 한 모델: ${a.pick.stage} ${a.pick.model}`);
    for (const [k, v] of Object.entries(o)) if (k !== "ok") L.push(`${k}: ${cut(v)}`);
  } else if (t.tool === "search_parts") {
    head += ` 「${a.query ?? ""}」${a.price_min != null || a.price_max != null ? ` ${a.price_min ?? ""}~${a.price_max ?? ""}원` : ""}`;
    if (o.부품) {   // 부품 검색 화면과 같은 엔진(11/28) — 좁힌 과정·남은 품번
      L.push(`${o.부품} 판매 중 ${fmt(o.판매중_품번_수)}개${(o.고른_조건 ?? []).map((c) => ` → ${c}`).join("")} → 남은 ${fmt(o.남은_품번_수)}개`);
      const V = Array.isArray(o.품번) ? o.품번 : [];
      if (V.length) L.push(`앞쪽: ${V.slice(0, 5).map((x) => `${x.품번}${x.모델명 ? ` ${x.모델명}` : ""}·${x.메이커 ?? ""}·${typeof x.기본가_원 === "number" ? `${fmt(x.기본가_원)}원` : x.기본가_원}`).join(" | ")}`);
      if ((o.더_가를_수_있는_항목 ?? []).length) L.push(`더 가를 항목: ${o.더_가를_수_있는_항목.map((q) => q.항목).join(", ")}`);
    } else {
      const R = Array.isArray(o.결과) ? o.결과 : [];
      L.push(`글자 검색 결과 ${R.length}개${R.length ? `: ${R.slice(0, 5).map((x) => `${x.제품 ?? x.품번}${x.메이커 ? `(${x.메이커})` : ""}`).join(" · ")}` : ""}`);
    }
  } else if (t.tool === "part_detail") {
    head += ` #${a.part_id}`;
    if (o.제품) L.push(`${o.제품}${o.메이커 ? ` · ${o.메이커}` : ""} · 품번 ${Array.isArray(o.품번) ? o.품번.length : 0}개`);
  } else if (t.tool === "calc") {
    head += ` ${a.expression ?? ""}`;
    if (o.ok) L.push(`= ${o.결과}`);
  } else L.push(`입력: ${cut(a)}`);
  if (o.ok === false && o.error) L.push(`실패: ${o.error}`);
  return `<li><div class="pt"><b>${esc(head)}</b> <span class="${t.ok ? "ok" : "ng"}">${t.ok ? "성공" : "실패"}</span> <span class="ms">${fmt(t.ms ?? 0)}ms</span></div>${L.map((x) => `<div class="pl">${esc(x)}</div>`).join("")}</li>`;
}
function procHtml(m, i) {
  const P = m.proc; if (!P) return "";
  const u = P.usage.reduce((s, x) => ({ inp: s.inp + (x.input_tokens ?? 0), cached: s.cached + (x.input_tokens_details?.cached_tokens ?? 0), out: s.out + (x.output_tokens ?? 0) }), { inp: 0, cached: 0, out: 0 });
  const usd = ((u.inp - u.cached) * 0.2 + u.cached * 0.02 + u.out * 1.2) / 1e6, krw = usd * 1450;
  const tools = P.trace.map((t) => procTool(t, P)).join("");
  const nc = P.numCheck;
  const check = P.rewrites ? `답 숫자 검사: 처음 답에 근거 없는 숫자 ${P.firstMiss.join(", ")} → 다시 쓰게 함 → ${nc?.ok ? "통과" : `여전히 ${nc.unknown.join(", ")}`}`
    : nc ? (nc.ok ? "답 숫자 검사: 통과 (답의 숫자가 모두 손님 말·화면 값·도구 결과에 있음)" : `답 숫자 검사: 근거 없는 숫자 ${nc.unknown.join(", ")}`) : "";
  return `<details class="proc" data-proc="${i}"${m.procOpen ? " open" : ""}><summary>과정 보기 · 도구 ${P.trace.length}번 · ${fmt(P.ms / 1000, 1)}초</summary>
    ${tools ? `<ol>${tools}</ol>` : `<div class="pl">도구 없이 화면 자료만 보고 답함</div>`}
    ${P.fastPath ? `<div class="pl">값만 바꾸는 지시라 AI 를 다시 부르지 않고 끝냄</div>` : ""}
    ${check ? `<div class="pl">${esc(check)}</div>` : ""}
    <div class="pl sub">AI 왕복 ${P.rounds}번 · 입력 ${fmt(u.inp)} 토큰(캐시 ${fmt(u.cached)}) · 출력 ${fmt(u.out)} · 약 ${fmt(krw, 1)}원</div></details>`;
}
function askHtml(m, i) {
  if (!m.ask?.length || m.askDone) return "";
  const sel = m.askSel ?? {}, off = S.chatBusy ? " disabled" : "", instant = askInstant(m);
  const chip = (q, o, on, cur) => `<button type="button" class="chip ${on ? "on" : cur ? "cur" : ""}" data-aq="${i}|${esc(q.id)}" data-av="${esc(o.value)}"${cur && instant ? ` aria-disabled="true"` : ""}${off}>${esc(o.label)}</button>`;
  const box = (q, k, ph, unit, val, type = "number") => `<div class="numbox"><input type="${type}" ${type === "number" ? `inputmode="decimal" step="${q.step ?? "any"}"` : ""} value="${esc(val ?? "")}" placeholder="${esc(ph)}" data-aq="${i}|${esc(q.id)}" data-ain="${k}" aria-label="${esc(q.label)}${k !== "v" ? ` ${esc(ph)}` : ""}"${off}>${unit ? `<span class="u">${esc(unit)}</span>` : ""}</div>`;
  const parts = m.ask.map((q) => {
    const v = sel[q.id];
    let body = "";
    if (q.kind === "enum") body = `<div class="chips">${q.opts.map((o) => chip(q, o, v === o.value, v == null && q.now === o.value)).join("")}</div>`;
    else if (q.kind === "pick") body = `<div class="aopts">${q.opts.map((o) => { const on = v === o.value, cur = v == null && q.now === o.value;
      return `<button type="button" class="aopt ${on || cur ? "on" : ""}" data-aq="${i}|${esc(q.id)}" data-av="${esc(o.value)}"${cur && instant ? ` aria-disabled="true"` : ""}${off}><span class="rd"></span><span class="m"><span class="hd"><span class="t">${esc(o.label)}${o.value === q.now ? `<span class="tag">지금</span>` : ""}</span>${o.price !== undefined ? `<span class="p ${o.price == null ? "x" : ""}">${o.price == null ? "가격 확인 필요" : won(o.price)}</span>` : ""}</span>${o.sub ? `<span class="s">${esc(o.sub)}</span>` : ""}</span></button>`; }).join("")}</div>`;
    else if (q.kind === "item") {
      const M = S.items, cat = M.cats.find((c) => c.send === v?.cat) ?? null;
      body = `<div class="chips">${M.cats.map((c) => chip(q, { value: c.send, label: c.label }, v?.cat === c.send && !v?.other, false)).join("")}${chip(q, { value: "__other", label: "기타" }, !!v?.other, false)}</div>`;
      if (cat?.items && !v?.other) body += `<div class="chips sub2">${cat.items.map((s) => chip(q, { value: `__sub:${s.send}`, label: s.label }, v?.val === s.send, false)).join("")}</div>`;
      if (v?.other) body += `<div style="margin-top:8px">${box(q, "other", "품목명 입력", "", v.val, "text")}</div>`;
    } else if (q.kind === "size") body = `${box(q, "pyeong", "평수", "평", v?.pyeong)}<div class="sizerow"><span class="or">또는</span>${box(q, "w", "가로", "m", v?.w)}<span class="or">×</span>${box(q, "d", "세로", "m", v?.d)}</div>`;
    else if (q.kind === "num") body = box(q, "v", q.ex != null && q.ex !== "" ? `예: ${q.ex}` : "", q.unit, v);
    const nowTxt = q.kind === "enum" && q.now != null ? q.opts.find((o) => o.value === q.now)?.label : null;
    return `<div class="aq"><div class="aq-t"><span>${esc(q.label)}</span>${nowTxt ? `<span class="now">지금 ${esc(nowTxt)}</span>` : ""}</div>${body}</div>`;
  }).join("");
  return `<div class="askcard" data-askcard="${i}">${parts}${askGoBtn(m, i)}</div>`;
}
function askTap(el) {
  const [is, qid] = el.dataset.aq.split("|"), i = Number(is), m = S.chat[i];
  if (!m?.ask || m.askDone || S.chatBusy || el.getAttribute("aria-disabled") === "true") return;
  const q = m.ask.find((x) => x.id === qid); if (!q) return;
  const sel = m.askSel ??= {}, v = el.dataset.av;
  let leaf = true;
  if (q.kind === "item") {
    const cur = sel[qid] ?? {};
    if (v === "__other") { sel[qid] = { other: true, val: cur.other ? cur.val : "" }; leaf = false; }
    else if (v.startsWith("__sub:")) sel[qid] = { cat: cur.cat, val: v.slice(6) };
    else { const c = S.items.cats.find((x) => x.send === v); if (c?.items) { sel[qid] = { cat: v, val: null }; leaf = false; } else sel[qid] = { cat: v, val: v }; }
  } else sel[qid] = sel[qid] === v && !askInstant(m) ? null : v;   // 여러 질문 카드에선 다시 누르면 고름 풀기
  if (askInstant(m) && leaf) return askGo(i);
  renderChat();
}
function askInput(el) {
  const [is, qid] = el.dataset.aq.split("|"), m = S.chat[Number(is)]; if (!m?.ask) return;
  const sel = m.askSel ??= {}, k = el.dataset.ain, raw = el.value.trim();
  if (k === "v") sel[qid] = raw;
  else if (k === "other") sel[qid] = { ...(sel[qid] ?? {}), other: true, val: raw };
  else { sel[qid] = { ...(sel[qid] ?? {}), [k]: raw }; if (k === "pyeong" && raw) { delete sel[qid].w; delete sel[qid].d; } }
  // 치는 중엔 다시 그리지 않는다(칸이 끊긴다) — [반영하기] 단추만 고친다
  const card = el.closest("[data-askcard]"), old = card?.querySelector(".ask-go");
  if (old) old.outerHTML = askGoBtn(m, Number(is));
  if (k === "pyeong" && raw) card?.querySelectorAll('[data-ain="w"], [data-ain="d"]').forEach((x) => { x.value = ""; });
  if ((k === "w" || k === "d") && raw) { const p = card?.querySelector('[data-ain="pyeong"]'); if (p) p.value = ""; if (sel[qid]) delete sel[qid].pyeong; }
}
/** 고른 값 반영 — AI 를 부르지 않는다. 칸에 넣고 다시 계산한 뒤, 무엇이 바뀌었는지 코드가 한 줄로 알린다 */
async function askGo(i) {
  const m = S.chat[i]; if (!m?.ask || m.askDone || S.chatBusy) return;
  const sel = m.askSel ?? {}, changes = [], picks = [], said = [], miss = [];
  let fill = true;
  for (const q of m.ask) {
    if (!askAnswered(q, sel)) continue;
    const v = sel[q.id];
    if (["size", "item", "num"].includes(q.kind) && (q.kind === "size" ? hasIn("pyeong") || hasIn("w") : hasIn(q.key))) fill = false;   // 있던 값을 바꾸면 「바꿔」
    if (q.kind === "size") {
      if (askNum(v.pyeong)) { changes.push(["load", "pyeong", String(Number(v.pyeong))]); said.push(`창고 크기 ${v.pyeong}평`); }
      else { changes.push(["load", "w", String(Number(v.w))], ["load", "d", String(Number(v.d))]); said.push(`창고 크기 ${v.w}×${v.d}m`); }
      continue;
    }
    if (q.kind === "item") {
      const c = S.items.cats.find((x) => x.send === v.val) ?? S.items.cats.flatMap((x) => x.items ?? []).find((x) => x.send === v.val);
      changes.push(["load", "item", String(v.val).trim()]); said.push(`${q.label} ${c?.label ?? String(v.val).trim()}`); continue;
    }
    if (q.kind === "pick") {
      if (!candNames(S.result, q.stage).includes(v)) { miss.push(`${q.label} ${v}`); continue; }   // 그 사이 결과표가 바뀌었다
      picks.push([q.stage, v]); said.push(`${q.label} ${v}`); fill = false; continue;
    }
    if (q.kind === "enum") { changes.push([q.stage, q.key, v]); said.push(`${q.label} ${q.opts.find((o) => o.value === v)?.label ?? v}`); fill = false; continue; }
    if (q.kind === "num") { changes.push([q.stage, q.key, String(Number(v))]); said.push(`${q.label} ${v}${q.unit}`); }
  }
  if (!changes.length && !picks.length && !miss.length) return;
  m.askDone = true;
  const gen = S.chatGen;
  S.chat.push({ role: "user", text: said.join(" · ") || miss.join(" · "), att: [], ts: Date.now(), fromAsk: true });
  S.chatBusy = true; resetProgress(); S.chatProgress = "다시 계산하고 있어요…"; renderChat();
  const before = Object.fromEntries(["comp", "unit", "cooler", "txv"].map((s) => [s, chosenOf(S.result, s)]));
  for (const [s, k, v] of changes) setField(s, k, v, "quiet");
  for (const [s, model] of picks) { (S.state[s] ??= { in: {} }).pick = model; for (const t of STAGES.slice(STAGES.indexOf(s) + 1)) if (S.state[t]) S.state[t].pick = null; }
  const ok = await compute();
  if (gen !== S.chatGen) return;
  resetProgress();
  const moved = [];
  for (const s of ["comp", "unit", "cooler", "txv"]) { const a = before[s], b = chosenOf(S.result, s); if (a && b && a !== b) moved.push(`${STAGE_NM[s]} ${a} → ${b}`); }
  const q1 = m.ask.find((q) => askAnswered(q, sel));
  let text = ok === false ? "값은 넣었는데 계산하지 못했어요. 잠시 뒤 다시 시도해 주세요."
    : changes.length + picks.length === 0 ? "" : said.length === 1 ? `${eulReul(q1.label)} ${fill ? "넣고" : "바꿔"} 다시 계산했어요.` : `고른 값${fill ? "을 넣고" : "으로 바꿔"} 다시 계산했어요.`;
  if (miss.length) text += `${text ? "\n" : ""}${miss.join(", ")} — 지금 결과표에 없어 고르지 못했어요.`;
  // 부하계산 필수 값이 아직 남았으면 남은 것만 다시 카드로(같은 칸 목록 — AI 를 부르지 않는다)
  const left = m.ask.some((q) => q.stage === "load") ? missingReq().map((r) => ({ stage: "load", key: r.key })).sort((x, y) => ASK_ORDER.indexOf(x.key) - ASK_ORDER.indexOf(y.key)) : [];
  if (left.length) text += ` 남은 값 ${left.length}가지도 알려 주세요.`;
  const chs = changes.map(([s, k]) => ({ stage: s, key: k }));
  S.chat.push({ role: "bot", text: text.trim(), changes: changeLabels(chs, S.result), moved, sum: loadReady() || picks.length ? chainSummary() : null, ts: Date.now(), byCode: true,
    ask: left.length ? buildAsk(left, S.result) : null });
  S.chatBusy = false; renderChat();
}
async function say(text, att = []) {
  if ((!text.trim() && !att.length) || S.chatBusy || !S.chatOn) return;
  S.chat.push({ role: "user", text, att, ts: Date.now() }); S.chatBusy = true; renderChat();
  const gen = S.chatGen;
  try {
    const history = historyFor(S.chat.filter((m) => !m.err).slice(0, -1), att.reduce((s, a) => s + a.size, 0));
    const P = S.parts;
    // 부품 검색 화면에서 찾은 것(대표 11/28 「검색창이든 채팅이든 동기화」) — 좁힌 과정·고른 조건·남은 품번 앞쪽까지
    const PR = P.how?.path;
    const partsCtx = P.q && PR ? `부품 검색 화면 「${P.q}」: ${PR.label} 판매 중 ${PR.start}개${PR.steps.filter((x) => !x.skipped).map((x) => ` → ${x.item} ${x.said}`).join("")} → 남은 ${PR.left}개 (${(PR.rows ?? []).slice(0, 8).map((r) => `${r.modelNo}${r.modelName ? ` ${r.modelName}` : ""}·${r.brand ?? ""}·${r.price != null ? `${r.price}원` : "가격 문의"}`).join(", ")})`
      : P.q ? `「${P.q}」 결과 ${P.items.slice(0, 5).map((x) => x.name).join(", ")}`
      : P.pick ? `부품 지도에서 고른 품번 「${P.pick.model_no}」(${P.pick.path})`
      : PM?.ready() && S.tab === "parts" ? `부품 지도에서 보는 곳 「${PM.pathText() || "전체"}」` : "";
    // 창고 위치·기온도 화면 값이다 — 상담이 읽을 수 있게 같이 보낸다(11/12)
    const site = S.site.place && S.site.climate ? { place: S.site.place, climate: S.site.climate } : null;
    resetProgress(); clearInterval(S.chatSlowT);
    // 새 소식이 없을 때 — 3.5초 「질문을 읽고」에 머물면 「답을 정리하고」, 12초 넘으면 「조금만 더」
    S.chatSlowT = setInterval(() => {
      if (!S.chatBusy) return;
      const idle = Date.now() - (S.chatProgressAt ?? 0), cur = S.chatProgress ?? FIRST_PROGRESS_TEXT;
      if (idle > 12000 && cur !== "조금만 더 기다려 주세요…") setChatProgress("조금만 더 기다려 주세요…");
      else if (idle > 3500 && cur === FIRST_PROGRESS_TEXT) setChatProgress("답을 정리하고 있어요…");
    }, 500);
    S.chatProgressAt = Date.now();
    const req = { message: text, history, state: S.state, tab: S.tab, partsCtx, partsQ: P.q || "", partsAdd: P.add || [], site, missing: missingReq().map((x) => x.nm), attachments: att.map((a) => ({ name: a.name, type: a.type, data: a.data })) };
    const onP = (t) => { if (gen === S.chatGen) setChatProgress(t); };
    const tStart = Date.now();
    let r = await apiStream("/api/chat", req, onP), first = null;
    // 서버가 위치를 못 찾음(배포판 함수 IP 는 Nominatim 이 막는다, 11/28) — 브라우저에서 찾아 후보를 실어 같은 말을 한 번 더 보낸다
    if (r.needSite && gen === S.chatGen) {
      onP(`「${r.needSite}」 위치를 찾고 있어요…`);
      const places = await geocodeBrowser(r.needSite).catch(() => []);
      first = { query: r.needSite, places, usage: r.usage ?? [], rounds: r.rounds ?? 0 };
      r = await apiStream("/api/chat", { ...req, sitePlaces: { query: r.needSite, places } }, onP);
    }
    clearInterval(S.chatSlowT); resetProgress();
    if (gen !== S.chatGen) return;   // 기다리는 사이 [새 상담]을 눌렀다 — 옛 상담의 답·값 바꾸기는 버린다
    S.state = r.state; S.result = r.result;
    if (r.parts && !r.partsQuery) { Object.assign(S.parts, { q: r.plan.parts_query, items: r.parts, detail: null, pick: null, busy: false, seq: S.parts.seq + 1 }); PM?.pick(null); }
    if (r.site) { Object.assign(S.site, { query: r.site.query, places: r.site.places, place: r.site.climate ? r.site.place : null, climate: r.site.climate, busy: false, err: r.site.climate ? null : "기온 자료를 받지 못했어요" }); if (r.site.climate) setField("load", "outdoorC", String(designOut(r.site.climate))); }
    const show = r.show ?? [];
    // 부품 검색 탭에 있으면 설계 값이 실제로 바뀌었거나 AI 가 탭을 정했을 때만 넘어간다(대표 11/28 「댄포스 걸로」에 설계 압축기로 넘어감)
    const stayParts = S.tab === "parts" && !r.changed.length && r.plan.tab === "keep" && (r.plan.pick?.stage ?? "none") === "none";
    const tab = r.parts || (r.partsQuery && S.tab === "parts") || stayParts ? "parts" : r.plan.tab !== "keep" ? r.plan.tab : show[0]?.tab ?? S.tab;
    const moved = r.changed.length || r.plan.pick?.stage !== "none";
    const extra = (r.rejected?.length ? `\n(알아듣지 못한 값은 바꾸지 않았어요: ${r.rejected.join(", ")})` : "")
      + (r.attachRejected?.length ? `\n(첨부 중 읽지 못한 것: ${r.attachRejected.join(" · ")})` : "");
    setTab(tab);
    // 채팅이 부품을 찾았으면 부품 검색 화면도 같은 검색어로 — 검색창·조건·지도 길 안내가 따라간다(다른 탭에 있으면 그 탭은 그대로, 부품 탭에 가면 보인다)
    //   이어 좁히기면 앞 단계는 건너뛰고 새 조건만 움직인다(opt.me → prevSteps)
    if (r.partsQuery) searchParts(r.partsQuery, r.partsAdd ?? [], r.partsQuery !== S.parts.q && S.parts.q ? { me: text } : {});
    else if (r.parts) { applyLit(); render(); }   // 부품 탭이 선 뒤에 — 지도가 오른쪽 칸 폭을 안 다음 찾은 칸에 맞춘다
    if (show.length && !stayParts) showTargets(show.map((x) => x.id));
    if (r.site?.climate && S.tab === "load") { S.zone = "out"; render(); showSiteBox(); }   // 채팅이 창고 위치를 찾았으면 기온 그래프를 보여 준다(11/12)
    // 물어본 값 — 화면에 보이는 그대로 옮겨 적는다(다른 화면 값은 그 화면 이름과 함께)
    const facts = show.filter((x) => x.asked).map((x) => { const v = x.tab === S.tab ? shownText(x.id) : null; return v ? `${x.label} ${v}` : `${x.label} → ${TABS.find((t) => t.id === x.tab)?.nm ?? x.tab} 화면`; });
    S.chat.push({ role: "bot", text: r.plan.reply + extra, changes: changeLabels(r.changed, r.result), facts, sum: moved ? chainSummary() : null, ts: Date.now(), ask: r.plan.ask?.length ? buildAsk(r.plan.ask, r.result) : null,
      memo: r.memo || "", unverified: r.numCheck && !r.numCheck.ok ? r.numCheck.unknown : null,
      proc: { trace: r.trace ?? [], usage: [...(first?.usage ?? []), ...(r.usage ?? [])], rounds: (r.rounds ?? 0) + (first?.rounds ?? 0), ms: Date.now() - tStart,
        fastPath: !!r.fastPath, rewrites: r.rewrites ?? 0, firstMiss: r.firstMiss ?? [], numCheck: r.numCheck ?? null, browserSite: first ? { query: first.query, places: first.places } : null } });
    if (!r.partsQuery && r.parts?.length === 1) openPart(r.parts[0].id);
  } catch (e) {
    const why = e.data?.attachRejected?.length ? `첨부를 읽지 못했어요 — ${e.data.attachRejected.join(" · ")}`
      : /너무 커요/.test(e.message) ? e.message : "답변을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.";
    if (gen !== S.chatGen) return;
    S.chat.push({ role: "bot", err: true, retry: text, retryAtt: att, text: why, ts: Date.now() });
    console.error(e);
  }
  clearInterval(S.chatSlowT); resetProgress();
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

// ── 대화 전체 공유(대표 11/12) — 화면에 보이는 그대로(답·물어본 값·바꾼 값·지금 설계 줄)를 글로 ──
const SHARE_IC = `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12"/></svg>`;
const two = (n) => String(n).padStart(2, "0");
const hhmm = (ts) => { const d = new Date(ts); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
function chatTranscript() {
  const now = new Date(), out = [`RChatAI 냉동 설계 상담 — ${dayLabel(now)} ${hhmm(now)} 내보냄`, ""];
  let day = "";
  for (const m of S.chat) {
    const d = dayLabel(m.ts); if (d !== day) { out.push(`[${d}]`, ""); day = d; }
    if (m.role === "user") {
      out.push(`나 (${hhmm(m.ts)})`);
      if (m.att?.length) out.push(`  첨부: ${m.att.map((a) => a.name).join(", ")}`);
      if (m.text.trim()) out.push(...m.text.split("\n").map((l) => `  ${l}`));
    } else {
      out.push(`AI (${hhmm(m.ts)})${m.err ? " — 오류" : ""}`);
      out.push(...m.text.split("\n").map((l) => `  ${l}`));
      for (const f of m.facts ?? []) out.push(`  · ${f}`);
      if (m.changes?.length) out.push(`  바꾼 값 · ${m.changes.join(" · ")}`);
      if (m.moved?.length) out.push(`  바뀐 모델 · ${m.moved.join(" · ")}`);
      if (m.sum) out.push(`  ${m.sum}`);
      for (const q of m.ask ?? []) out.push(`  [선택지] ${q.label}${q.opts ? ` — ${q.opts.map((o) => o.label).join(" / ")}` : ""}`);
      if (m.unverified?.length) out.push(`  화면 자료로 확인되지 않은 숫자 · ${m.unverified.join(", ")}`);
    }
    out.push("");
  }
  // 끝에 지금 화면 상태 — 받는 사람이 대화가 어디서 끝났는지 알 수 있게
  if (S.result) out.push("── 지금 설계 ──", chainSummary().replace(/^지금 설계 /, ""));
  if (S.site.place && S.site.climate) out.push(`창고 위치 ${S.site.place.short} · 적용 외기온도 ${S.result?.load?.in?.outdoorC ?? "-"}℃`);
  return out.join("\n").trim() + "\n";
}
function setShareMenu(open) {
  const m = $("#chat-sharemenu"); if (!m) return;
  m.hidden = !open; $("#chat-share").setAttribute("aria-expanded", String(open));
  if (open) m.querySelector('[data-share="native"]').hidden = !navigator.share;
}
async function shareChat(how) {
  setShareMenu(false);
  if (!S.chat.length) return attNote("공유할 대화가 아직 없어요");
  const text = chatTranscript(), now = new Date();
  const name = `냉동설계-상담-${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}.txt`;
  try {
    if (how === "copy") { await navigator.clipboard.writeText(text); attNote(`대화 전체(${S.chat.length}개 말)를 복사했어요 — 카톡·메일에 붙여 넣으면 돼요`); }
    else if (how === "file") {
      const url = URL.createObjectURL(new Blob(["\ufeff" + text], { type: "text/plain;charset=utf-8" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000); attNote(`「${name}」로 저장했어요`);
    } else if (how === "native") await navigator.share({ title: "냉동 설계 상담", text });
  } catch (e) { if (e?.name !== "AbortError") attNote(`공유하지 못했어요 (${e?.message ?? e})`); }
}

/** 가운데 칸을 창고 위치·월별 기온 자리로 굴린다 */
document.addEventListener("toggle", (e) => { const d = e.target; if (d?.dataset?.proc != null) { const m = S.chat[Number(d.dataset.proc)]; if (m) m.procOpen = d.open; } }, true);
function showSiteBox() { requestAnimationFrame(() => document.getElementById("sitebox")?.scrollIntoView({ block: "start", behavior: "smooth" })); }

// ── 새 창고 시작 창(대표 11/14) — 「안내 받으며 시작」 = 부하계산부터 견적까지 이어지는 사용 안내 / 「바로 입력」 · 「다음부터 묻지 않기」 ──
const START_ASK = "designweb.startAsk";
function showStartPick(force = false) {
  if (!force && lsGet(START_ASK) === "off") return;
  try { sessionStorage.setItem("designweb.startShown", "1"); } catch {}
  if (TS.on) return;
  const el = $("#startpick"); $("#sp-noask").checked = lsGet(START_ASK) === "off"; el.hidden = false;
  requestAnimationFrame(() => el.classList.add("show"));
}
function closeStartPick(how) {
  const el = $("#startpick"); if (el.hidden) return;
  lsSet(START_ASK, $("#sp-noask").checked ? "off" : "on");
  el.classList.remove("show"); setTimeout(() => { el.hidden = true; }, 220);
  if (how === "tour") { if (S.tab !== "load") setTab("load"); setTimeout(() => startTour("load"), 240); }
  if (how === "comp") setTab("comp");   // 부품부터(대표 11/16) — 가진 압축기를 정하고 가능한 창고 크기·온도를 찾는다
}

// ── 채팅 — 오른쪽 아래 떠 있는 단추, 누르면 팝업 창(대표 11/12 「채팅 버튼 호버링 · 팝업 · 드래그로 크기·위치 자유롭게」) ──
//   창 머리를 끌면 옮기고, 가장자리·모서리를 끌면 크기가 바뀐다. 연 상태·위치·크기는 이 브라우저에 기억(없거나 막혀 있으면 기본 자리).
//   채팅이 칸을 가리키는 강조(showTargets)는 닫혀 있어도 그대로 된다.
const CHAT_KEY = "designweb.chatOpen", CHAT_BOX = "designweb.chatBox", CHAT_MIN = { w: 320, h: 360 }, CHAT_EDGE = 7;
const CHAT_IC = `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z"/><path d="M8.5 9.5h7M8.5 12.5h4.5" stroke-linecap="round"/></svg>`;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const chatSaved = () => lsGet(CHAT_KEY) === "1";
let chatBox = null;
const chatBoxDefault = () => { const w = Math.min(420, innerWidth - 16), h = Math.min(640, innerHeight - 120); return { x: innerWidth - w - 24, y: innerHeight - h - 100, w, h }; };
function placeChat(b) {
  const vw = innerWidth, vh = innerHeight;
  const w = Math.min(Math.max(b.w, CHAT_MIN.w), vw - 16), h = Math.min(Math.max(b.h, CHAT_MIN.h), vh - 16);
  chatBox = { w, h, x: Math.max(8, Math.min(b.x, vw - w - 8)), y: Math.max(8, Math.min(b.y, vh - h - 8)) };
  Object.assign($("#chat").style, { left: `${chatBox.x}px`, top: `${chatBox.y}px`, width: `${chatBox.w}px`, height: `${chatBox.h}px` });
}
function setChatOpen(open, focus = false) {
  $("#chat").hidden = !open;
  const f = $("#chat-fab"); f.classList.toggle("on", open); f.setAttribute("aria-expanded", String(open)); f.setAttribute("aria-label", open ? "채팅 닫기" : "채팅 열기");
  f.innerHTML = open ? icon("close") : CHAT_IC;
  if (open) { let b = null; try { b = JSON.parse(lsGet(CHAT_BOX) || "null"); } catch {} placeChat(b && b.w ? b : chatBoxDefault()); }
  lsSet(CHAT_KEY, open ? "1" : "0");
  if (open && focus) $("#chat-input").focus();
}
// 끌기 — 머리 = 옮기기, 가장자리·모서리(7px) = 크기
(() => {
  const el = $("#chat");
  const CUR = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };
  const edgeOf = (e) => {
    // 모서리는 둥글게 깎여 맨 끝이 창 밖으로 잡히므로, 두 가장자리에 함께 가까우면(18px) 모서리로 본다
    const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, C = 18;
    const v = y < C ? "n" : y > r.height - C ? "s" : "", hz = x < C ? "w" : x > r.width - C ? "e" : "";
    if (v && hz) return v + hz;
    return (y < CHAT_EDGE ? "n" : y > r.height - CHAT_EDGE ? "s" : "") + (x < CHAT_EDGE ? "w" : x > r.width - CHAT_EDGE ? "e" : "");
  };
  el.addEventListener("pointermove", (e) => { if (!el._drag) { const s = edgeOf(e); el.style.cursor = s ? CUR[s] : ""; } });
  el.addEventListener("pointerdown", (e) => {
    const s = edgeOf(e), head = !s && e.target.closest(".chathead") && !e.target.closest("button");
    if ((!s && !head) || !chatBox) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId); el._drag = true; document.body.classList.add("resizing");
    const b0 = { ...chatBox }, x0 = e.clientX, y0 = e.clientY;
    const move = (ev) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0, b = { ...b0 };
      if (head) { b.x += dx; b.y += dy; }
      else {
        if (s.includes("e")) b.w = b0.w + dx;
        if (s.includes("s")) b.h = b0.h + dy;
        if (s.includes("w")) { b.w = Math.max(CHAT_MIN.w, b0.w - dx); b.x = b0.x + b0.w - b.w; }
        if (s.includes("n")) { b.h = Math.max(CHAT_MIN.h, b0.h - dy); b.y = b0.y + b0.h - b.h; }
      }
      placeChat(b);
    };
    const up = () => { el._drag = false; document.body.classList.remove("resizing"); el.removeEventListener("pointermove", move); lsSet(CHAT_BOX, JSON.stringify(chatBox)); };
    el.addEventListener("pointermove", move); el.addEventListener("pointerup", up, { once: true }); el.addEventListener("pointercancel", up, { once: true });
  });
  addEventListener("resize", () => { if (!el.hidden && chatBox) placeChat(chatBox); });
})();
// ── 사용 안내(튜토리얼, 대표 11/13) — 시공자가 넣을 값(11/05 시공자 질문 지도의 꼭 묻기·모르면 기본값)을 실제 화면에서 차례로 비춘다 ──
//   칸은 그대로 쓸 수 있다(어둡게만 할 뿐 막지 않음) — 값을 넣으면 바로 계산되는 것도 그대로. 처음 한 번 저절로, 머리 [사용 안내]로 다시.
const TOUR_KEY = "designweb.tourDone";
const rowOf = (id) => document.getElementById(id)?.closest(".frow, .crow");
const TOUR_LOAD = [
  { zone: null, t: "창고 위치", d: "창고를 지을 곳(시·군·구, 해외도 돼요)을 넣으면 그 지역 여름 최고기온으로 외기온도를 자동으로 맞춰요.", el: () => document.getElementById("site-q")?.closest(".card") },
  { zone: "room", t: "고내온도", d: "창고 안 온도예요. 냉장은 0~5℃, 냉동은 −18~−25℃가 보통이에요. 숫자를 치거나 막대를 끌면 바로 다시 계산돼요.", el: () => rowOf("f-load-roomC") },
  { zone: "room", t: "창고 크기", d: "평수만 넣어도 돼요(가로:세로 1:2로 잡아요). 실제 치수를 알면 가로·세로·높이를 넣으세요. 바깥 치수 기준이에요.", el: () => ["f-load-pyeong", "f-load-w", "f-load-d", "f-load-h"].map(rowOf) },
  { zone: "wall", t: "판넬 두께", d: "벽·천정 우레탄 판넬 두께예요. 100T면 100이에요. 두꺼울수록 벽으로 들어오는 열이 줄어요.", el: () => rowOf("f-load-insulMm") },
  { zone: "goods", t: "보관 품목", d: "무엇을 보관하는지 골라 주세요. 채소·과일은 숨 쉬는 열(호흡열)이 더해져요.", el: () => document.querySelector('[data-fk="in.load.item"]')?.closest(".crow") },
  { zone: "goods", t: "하루 입고량", d: "하루에 들어오는 물건 무게(톤)예요. 모르면 비워 두세요 — 창고 크기에 맞는 표 값으로 계산해요.", el: () => rowOf("f-load-dailyTon") },
  { zone: "room", t: "결과", d: "여기에 냉동부하가 바로 나와요. 다른 값은 왼쪽 그림에서 벽·문·상품 이름표를 누르면 그 부분 칸이 열려요. 다 됐으면 위의 압축기 탭으로 넘어가세요.", el: () => document.querySelector('#side [data-live="res"] .card') },
];
const card0 = () => document.querySelector('#side [data-live="res"] .card');
const crowOf = (fk) => document.querySelector(`[data-fk="${fk}"]`)?.closest(".crow, .frow");
const figOf = () => document.querySelector("#view .figcard");
/** 탭마다 안내(대표 11/13 「압축기·유니트·유닛쿨러·팽창변도」) — 시공자가 고르거나 볼 것만. 없는 칸은 건너뛴다 */
const TOURS = {
  load: TOUR_LOAD,
  comp: [
    { t: "추천 압축기", d: "필요 냉동능력(부하계산에서 자동, 또는 직접 입력)으로 압축기를 골라요. 여유율이 0~25%면 알맞아요.", el: card0 },
    { t: "압축기부터 정하기", d: "가진 압축기가 있으면 「부품 지정」에서 모델이나 마력을 정하세요. 부하계산 없이도 그 압축기로 가능한 창고 크기·온도를 찾아 드려요.", el: () => crowOf("in.comp.model") ?? rowOf("f-comp-model") },
    { t: "가능한 창고", d: "고내온도마다 이 압축기로 맞는 최대 평수예요. 막대나 줄을 누르면 그 고내온도·평수가 부하계산에 들어가요.", el: () => document.querySelector("#view .fitcard") },
    { t: "메이커", d: "메이커를 정하면 그 메이커 안에서만 골라요. 「상관없음」이면 전부에서 골라요.", el: () => crowOf("in.comp.brand") },
    { t: "냉매", d: "쓸 냉매를 고르세요. 새로 짓는 창고면 R448A·R449A 같은 대체 냉매도 검토하세요.", el: () => rowOf("f-comp-refrigerant") },
    { t: "후보", d: "여유율 25% 안의 후보는 많이 팔리는 순, 그보다 큰 것은 능력이 작은 순이에요. 「선택」으로 바꿀 수 있어요. 마력은 모터 크기라 능력(kW)으로 비교하세요.", el: () => document.querySelector('#side [data-live="cands"] .card') },
    { t: "운전 범위", d: "검은 점(지금 운전 조건)이 범위 안에 있어야 해요. 곡선은 증발온도에 따라 능력이 어떻게 바뀌는지 보여 줘요.", el: () => document.querySelector("#view .vgrid") },
  ],
  unit: [
    { t: "유니트 세트", d: "고른 압축기로 회사 표준 유니트 세트를 짜요. 구성품과 참고 합계가 여기 나와요.", el: card0 },
    { t: "유니트 형식", d: "R/C 일체형·수액기형 등 형식을 고르세요. 모르면 그대로 두세요.", el: () => rowOf("f-unit-form") ?? crowOf("in.unit.form") },
    { t: "전원", d: "현장 전원(380V·220V)을 고르세요.", el: () => crowOf("in.unit.voltage") },
    { t: "계통도", d: "부품에 마우스를 얹으면 정보가 떠요. 유닛쿨러·팽창변을 누르면 그 화면으로 넘어가요.", el: figOf },
    { t: "구성품", d: "칸마다 모델과 기본가예요. 「확인 후 안내」는 가격을 확인해 드려야 하는 칸이에요.", el: () => document.querySelector('#side [data-live="parts"] .card') },
  ],
  cooler: [
    { t: "추천 유닛쿨러", d: "창고 부하를 대수로 나눠 1대 능력에 맞는 유닛쿨러를 골라요.", el: card0 },
    { t: "메이커", d: "동화윈·베이어 중 고르거나 「상관없음」으로 두세요.", el: () => crowOf("in.cooler.maker") },
    { t: "대수", d: "창고가 길거나 크면 2대 이상으로 나눠요. 대수를 바꾸면 1대 능력이 다시 계산돼요.", el: () => rowOf("f-cooler-count") },
    { t: "제상 방식", d: "전기 제상·살수 제상 중 고르세요. 냉동창고는 보통 전기 제상이에요.", el: () => crowOf("in.cooler.defrost") },
    { t: "그림", d: "계통도·외형도·창고 안 배치를 볼 수 있어요. 팽창변을 누르면 팽창변 화면으로 넘어가요.", el: figOf },
  ],
  txv: [
    { t: "추천 팽창변", d: "유닛쿨러 1대당 1조씩, 부하율이 알맞은 팽창변을 골라요.", el: card0 },
    { t: "메이커", d: "댄포스·사기노미야·알코 중 고르세요.", el: () => crowOf("in.txv.brand") },
    { t: "구성도", d: "몸체·오리피스 등 1조에 들어가는 부품과 품번이에요.", el: figOf },
    { t: "후보", d: "부하율이 적정(25~100%)인 후보예요. 「선택」으로 바꿀 수 있어요.", el: () => document.querySelector('#side [data-live="cands"] .card') },
  ],
};
const tourKey = (tab) => (tab === "load" ? TOUR_KEY : `designweb.tour.${tab}`);
TOURS.quote = [
  { t: "기본가 합계", d: "유니트 세트(압축기 포함)·유닛쿨러·팽창변을 모두 더한 기본가예요. 가격을 모르는 품목은 빼고 더해요.", el: card0 },
  { t: "품목별 금액", d: "줄마다 수량·단가·금액이에요. 「확인 필요」가 붙은 줄은 가격을 확인해야 해요. 줄을 누르면 그 단계로 가서 고칠 수 있어요.", el: () => document.querySelector("#view .card") },
  { t: "견적 글 복사", d: "다 되면 견적 글을 복사해 카톡·문자로 보내세요. 설치·배관 공임과 운송비는 별도예요.", el: () => document.querySelector("[data-copyquote]") },
];
/** 안내는 부하계산 → 압축기 → 유니트 → 유닛쿨러 → 팽창변 → 견적으로 이어진다(대표 11/13 「마법사가 이어져야 최종 견적」) */
const TOUR_ORDER = ["load", "comp", "unit", "cooler", "txv", "quote"];
const nextTourTab = (tab) => TOUR_ORDER[TOUR_ORDER.indexOf(tab) + 1] ?? null;
const TS = { on: false, i: 0, raf: 0, tab: "load", steps: TOUR_LOAD };
function tourRect() {
  const st = TS.steps[TS.i]; if (!st) return null; let els = st.el(); els = (Array.isArray(els) ? els : [els]).filter(Boolean);
  if (!els.length) return null;
  const rs = els.map((e) => e.getBoundingClientRect());
  const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top)), r = Math.max(...rs.map((r) => r.right)), b = Math.max(...rs.map((r) => r.bottom));
  // 화면보다 큰 칸(계통도·긴 목록)은 보이는 만큼만 비춘다 — 테두리가 화면 밖으로 나가지 않게
  const L = Math.max(l - 8, 6), T = Math.max(t - 8, 6), Rr = Math.min(r + 8, innerWidth - 6), B = Math.min(b + 8, innerHeight - 6);
  return { l: L, t: T, w: Math.max(0, Rr - L), h: Math.max(0, B - T) };
}
function tourPlace() {
  if (!TS.on) return;
  const R = tourRect(), spot = $("#tour .tour-spot"), bub = $("#tour .tour-bub");
  if (R) {
    Object.assign(spot.style, { left: `${R.l}px`, top: `${R.t}px`, width: `${R.w}px`, height: `${R.h}px`, opacity: 1 });
    // 말풍선 자리(대표 11/13 「튜토리얼이 값을 가린다」) — 왼쪽·오른쪽·아래·위 네 자리를 재서, 비춘 칸과 덜 겹치는 곳에 둔다
    const bw = bub.offsetWidth, bh = bub.offsetHeight, gap = 16, vw = innerWidth, vh = innerHeight;
    const clampX = (x) => Math.min(Math.max(8, x), vw - bw - 8), clampY = (y) => Math.min(Math.max(8, y), vh - bh - 8);
    const cands = [
      [R.l - bw - gap, R.t], [R.l + R.w + gap, R.t],
      [R.l, R.t + R.h + gap], [R.l, R.t - bh - gap],
    ].map(([x, y]) => [clampX(x), clampY(y)]);
    const over = ([x, y]) => Math.max(0, Math.min(x + bw, R.l + R.w) - Math.max(x, R.l)) * Math.max(0, Math.min(y + bh, R.t + R.h) - Math.max(y, R.t));
    const best = cands.reduce((a, c) => (over(c) < over(a) ? c : a));
    TS.overlap = over(best);
    Object.assign(bub.style, { left: `${best[0]}px`, top: `${best[1]}px` });
  } else spot.style.opacity = 0;
  TS.raf = requestAnimationFrame(tourPlace);   // 화면이 다시 그려지거나 굴러도 따라간다
}
function tourGo(i, dir = 1) {
  const n = TS.steps.length; i = Math.max(0, Math.min(n - 1, i));
  const bub = $("#tour .tour-bub"), spot = $("#tour .tour-spot");
  bub.classList.add("out");
  clearTimeout(TS.t1); clearTimeout(TS.t2);
  TS.t1 = setTimeout(() => {
    if (S.tab !== TS.tab) setTab(TS.tab);
    let st = TS.steps[i];
    if (st.zone && S.zone !== st.zone) { S.zone = st.zone; S.holdMain = false; render(); }
    // 칸이 없는 단계(후보가 없을 때 등)는 건너뛴다
    const has = (x) => { let e = x.el(); e = Array.isArray(e) ? e.filter(Boolean)[0] : e; return !!e; };
    let guard = n; while (!has(st) && guard-- > 0) { const j = i + dir; if (j < 0 || j >= n) break; i = j; st = TS.steps[i]; if (st.zone && S.zone !== st.zone) { S.zone = st.zone; render(); } }
    TS.i = i;
    $("#tour .tour-step").innerHTML = TS.steps.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
    $("#tour .tour-t").textContent = st.t; $("#tour .tour-d").textContent = st.d;
    $("#tour .tour-prev").disabled = i === 0;
    const nx = nextTourTab(TS.tab), si = TOUR_ORDER.indexOf(TS.tab);
    $("#tour .tour-stage").textContent = si >= 0 ? `${si + 1}/${TOUR_ORDER.length}단계 · ${TABS.find((x) => x.id === TS.tab)?.nm ?? ""}` : "";
    $("#tour .tour-next").textContent = i < n - 1 ? "다음" : nx ? `다음 단계 — ${TABS.find((x) => x.id === nx).nm}` : "완료";
    // 그 칸이 든 스크롤 칸을 바로(애니메이션 없이) 굴린다 — 굴림과 틀 움직임이 겹치면 어지럽다
    let e = st.el(); e = Array.isArray(e) ? e.filter(Boolean)[0] : e;
    const box = e?.closest("#side, #main"), R = tourRect();
    if (box && R) { const B = box.getBoundingClientRect(), want = R.h < B.height - 24 ? B.top + (B.height - R.h) / 2 : B.top + 12; box.scrollBy({ top: R.t - want, behavior: "auto" }); }
    spot.classList.add("move"); clearTimeout(TS.t3); TS.t3 = setTimeout(() => spot.classList.remove("move"), 620);
    TS.t2 = setTimeout(() => bub.classList.remove("out"), 380);
  }, TS.first ? 0 : 180);
  TS.first = false;
}
function startTour(tab = S.tab) {
  if (!TOURS[tab]) tab = "load";
  Object.assign(TS, { on: true, tab, steps: TOURS[tab], first: true, i: 0 });
  document.body.classList.add("touring"); const t = $("#tour"); t.hidden = false; t.classList.remove("show");
  requestAnimationFrame(() => t.classList.add("show"));
  tourGo(0); cancelAnimationFrame(TS.raf); TS.raf = requestAnimationFrame(tourPlace);
}
function endTour() {
  lsSet(tourKey(TS.tab), "1");
  const t = $("#tour"); t.classList.remove("show");
  setTimeout(() => { TS.on = false; document.body.classList.remove("touring"); t.hidden = true; cancelAnimationFrame(TS.raf); }, 260);
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#startpick").hidden) return closeStartPick("direct");
  if (!TS.on) return; if (e.key === "Escape") endTour();
});

// ───────────────────────── 이벤트 ─────────────────────────
document.addEventListener("click", (e) => {
  if (S.tab === "parts" && S.parts.view === "spec" && e.target.closest?.(".sp-page") && SPEC.click(e)) return;
  if (!viewerEl.hidden) return closeViewer();
  if (e.target.closest("#chat-fab")) return setChatOpen($("#chat").hidden, true);
  if (e.target.closest("#tour-start")) return startTour();
  const sp = e.target.closest("[data-start]"); if (sp) return closeStartPick(sp.dataset.start);
  if (e.target.id === "startpick") return closeStartPick("direct");   // 바깥(어두운 곳) 누르면 바로 입력
  if (e.target.closest("[data-copyquote]") && S.result?.quote) { navigator.clipboard?.writeText(quoteText(S.result.quote)).then(() => { const b = e.target.closest("[data-copyquote]"); b.textContent = "복사했어요"; setTimeout(() => render(), 1500); }); return; }
  if (e.target.closest(".tour-skip")) return endTour();
  const mp = e.target.closest("[data-modelpick]"); if (mp) { S.modelCustom.delete(mp.dataset.modelpick); return render(); }
  const vw = e.target.closest("[data-view]"); if (vw) { S.mainView = vw.dataset.view; lsSet("designweb.mainView", S.mainView); return render(); }
  if (e.target.closest(".tour-prev")) return tourGo(TS.i - 1, -1);
  if (e.target.closest(".tour-next")) {
    if (TS.i < TS.steps.length - 1) return tourGo(TS.i + 1, 1);
    const nx = nextTourTab(TS.tab);
    if (!nx) return endTour();
    // 다음 단계 화면으로 넘어가 그 안내를 이어서 — 이 단계 안내는 본 것으로
    lsSet(tourKey(TS.tab), "1"); S.tourSeen ??= {}; S.tourSeen[nx] = true;
    Object.assign(TS, { tab: nx, steps: TOURS[nx], i: 0 });
    setTab(nx); if (nx === "quote" && !S.result?.quote) computeSoon();
    return setTimeout(() => tourGo(0, 1), 120);
  }
  if (e.target.closest("#chat-close")) return setChatOpen(false);
  if (e.target.closest("#chat-share")) return setShareMenu($("#chat-sharemenu").hidden);
  const aq = e.target.closest("[data-av]"); if (aq) return askTap(aq);   // 선택지 카드(11/17)
  const ag = e.target.closest("[data-ask-go]"); if (ag) return askGo(Number(ag.dataset.askGo));
  const sh = e.target.closest("[data-share]"); if (sh) return shareChat(sh.dataset.share);
  if (!$("#chat-sharemenu").hidden) setShareMenu(false);
  const ad = e.target.closest("[data-attdel]"); if (ad) { S.att.splice(Number(ad.dataset.attdel), 1); renderAtt(); return $("#chat-input").focus(); }
  const av = e.target.closest("[data-attview]"); if (av) return openViewer(S.att[Number(av.dataset.attview)]);
  const mi = e.target.closest("[data-msgimg]"); if (mi) { const [i, k] = mi.dataset.msgimg.split(":").map(Number); const a = S.chat[i]?.att?.[k]; return a && openViewer(a); }
  if (e.target.closest("#chat-add")) return $("#chat-file").click();
  // 계통도 부품을 누르면 그 부품의 단계 화면으로(대표 11/13) — 같은 화면의 부품이면 지금처럼 정보 상자
  const gp = e.target.closest?.(".fig [data-tip]");
  if (gp) {
    const k = gp.dataset.tip, to = k === "u:압축기" ? "comp" : k.startsWith("u:") ? "unit" : k === "r:cooler" ? "cooler" : k === "r:txv" ? "txv" : null;
    if (to && to !== S.tab) { hideTip(); return setTab(to); }
  }
  const tp = e.target.closest("[data-tip]");
  // 터치는 얹기가 없어 누르면 고정(바깥을 누르면 닫힘). 마우스는 얹는 동안만
  if (tp) { showTip(tp, e.clientX, e.clientY); TIP.pinned = e.pointerType === "touch" || e.pointerType === "pen"; return; }
  if (TIP.pinned) hideTip();
  const fi = e.target.closest("[data-fit]"); if (fi) return applyFit(fi.dataset.fit);   // 가능한 창고 줄·막대(대표 11/16)
  const t = e.target.closest("[data-tab]"); if (t) return setTab(t.dataset.tab);
  const ib = e.target.closest("[data-item]"); if (ib) { S.itemOther = false; return setField("load", "item", ib.dataset.item); }
  if (e.target.closest("[data-item-other]")) { S.itemOther = true; setField("load", "item", ""); return; }
  const sg = e.target.closest("[data-seg]"); if (sg) { const [s, k] = sg.dataset.seg.split("."); return setField(s, k, sg.dataset.val); }
  const p = e.target.closest("[data-pick]"); if (p) return pick(p.dataset.pick, p.dataset.model);
  const lk = e.target.closest("[data-lock]"); if (lk) return lockStage(lk.dataset.lock, true);
  const ul = e.target.closest("[data-unlock]"); if (ul) return lockStage(ul.dataset.unlock, false);
  const pl = e.target.closest("[data-place]"); if (pl) return pickPlace(Number(pl.dataset.place));
  if (e.target.closest("[data-replace]")) { S.site.place = null; S.site.climate = null; return render(); }
  const uo = e.target.closest("[data-useout]"); if (uo) return setField("load", "outdoorC", uo.dataset.useout);
  const zn = e.target.closest("[data-zone]"); if (zn && zn.dataset.zone !== "undefined") { S.zone = zn.dataset.zone; S.holdMain = false; render(); $("#side").scrollTop = 0; if (S.zone === "out") showSiteBox(); return; }
  const pt = e.target.closest("[data-part]"); if (pt) return openPart(Number(pt.dataset.part));
  // 찾는 과정 표의 제품 줄 → 그 제품 데이터 현황(대표 11/15)
  const xp = e.target.closest("[data-xpart]"); if (xp) { S.parts.view = "data"; return openPart(Number(xp.dataset.xpart)); }
  const pvw = e.target.closest("[data-pview]"); if (pvw && !pvw.disabled) { S.parts.view = pvw.dataset.pview; if (S.parts.view === "spec") SPEC.open(); render(); if (S.parts.view === "map") { if (S.parts.navPending) startNav(S.parts.seq); else { applyLit(); render(); } } return; }
  if (e.target.closest("[data-back]")) { S.parts.detail = null; PM?.pickMany(null); render(); applyLit(); return render(); }
  // 길 안내(대표 11/15) — 건너뛰기 · 다시 보기 · 갈림길 값 고르기 · 고른 값 빼기 · 도착 목록 품번
  const ngo = e.target.closest("[data-navgo]");
  if (ngo) { if (!ngo.disabled) navGo(Number(ngo.dataset.navgo)); return; }
  const nvb = e.target.closest("[data-nav]");
  if (nvb) { const P = S.parts; if (nvb.dataset.nav === "skip" && P.nav) { const last = P.nav.steps.length - 1; P.nav.fast = true; runNav(P.nav, P.seq, last, last); } else if (nvb.dataset.nav === "replay") { P.nav = null; PM?.navClear(); startNav(P.seq); } return; }
  const fk = e.target.closest("[data-fork]"); if (fk) { const f = JSON.parse(fk.dataset.fork); return searchParts(S.parts.q, [...S.parts.add.filter((a) => a.item !== f.item), f], { me: `${f.name ?? f.item} ${f.said}` }); }
  const cd = e.target.closest("[data-cand]"); if (cd) return searchParts(`${cd.dataset.cand} ${S.parts.q}`, [], { me: cd.dataset.cand });
  const ex = e.target.closest("[data-pcex]"); if (ex) return searchParts(ex.dataset.pcex, [], { me: ex.dataset.pcex });
  const ua = e.target.closest("[data-unadd]"); if (ua) { const a = S.parts.add[Number(ua.dataset.unadd)]; return searchParts(S.parts.q, S.parts.add.filter((_, i) => i !== Number(ua.dataset.unadd)), { me: `${a?.name ?? a?.item ?? ""} ${a?.said ?? ""} 빼기` }); }
  const rv = e.target.closest("[data-rvar]");
  if (rv) {
    const id = Number(rv.dataset.rvar), R = S.parts.how?.path;
    const r = R?.rows.find((x) => x.id === id) ?? R?.check?.find((x) => x.id === id);
    if (!r) return;
    PM?.pick(r.id); if (PM?.ready()) PM.navFly([r.id], { ms: 600, pad: 0.3, spot: false });
    return pickVariant([r.id, r.modelNo, r.price, 0, r.brand, r.partId, r.modelName], R.label);
  }
  // 부품 상담 「표로 보기」 — 지금 조건 그대로 거른 사양 표를 연다
  const spo = e.target.closest("[data-spopen]");
  if (spo) { const P = S.parts.how?.path; S.parts.view = "spec"; SPEC.open((P?.opens || []).find((o) => o.key === spo.dataset.spopen) ?? P?.open); return; }
  if (e.target.closest("[data-unpick]")) { S.parts.pick = null; PM?.pick(null); return render(); }
  if (e.target.closest("[data-pclear]")) { const i = $("#parts-q"); if (i) i.value = ""; return searchParts(""); }
  const cp = e.target.closest("[data-copy]");
  if (cp) { const i = Number(cp.dataset.copy); navigator.clipboard?.writeText(S.chat[i]?.text ?? "").then(() => { copiedId = i; renderChat(); setTimeout(() => { copiedId = null; renderChat(); }, 1500); }); return; }
  const rt = e.target.closest("[data-retry]");
  if (rt) { const i = Number(rt.dataset.retry); const m = S.chat[i]; S.chat.splice(i - 1, 2); return say(m.retry, m.retryAtt ?? []); }
  if (e.target.closest("#chat-mic")) return toggleMic();
  if (e.target.closest("#chat-new")) return newChat();
  if (e.target.closest("#reset-all")) { S.state = fresh(); S.parts = { ...freshParts(), seq: S.parts.seq + 1 }; SPEC.reset(); PM?.pick(null); PM?.navClear(); PM?.highlight(null); S.site = { query: "", places: [], place: null, climate: null, busy: false, err: null }; S.chat = []; S.att = []; renderAtt(); attNote(""); renderChat(); setTab("load"); setTimeout(() => showStartPick(), 500); return compute(); }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (SPEC.change(e)) return;
  if (el.id === "chat-file") { addFiles(el.files).finally(() => $("#chat-input").focus()); el.value = ""; return; }
  S.holdMain = false; S.livePending = false;
  if (el.dataset?.slide) { const [st, k] = el.dataset.slide.split("."); return setField(st, k, el.value); }
  if (el.dataset?.stage && el.value === "__custom") {
    const k = `${el.dataset.stage}.${el.dataset.key}`; S.modelCustom.add(k); render();
    return document.getElementById(`f-${el.dataset.stage}-${el.dataset.key}`)?.focus();
  }
  if (el.dataset?.stage) setField(el.dataset.stage, el.dataset.key, el.value.trim());
});
document.addEventListener("keydown", (e) => {
  if (e.target.dataset?.stage && e.key === "Enter") e.target.blur();
  if (e.target.id === "chat-input" && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#chat-form").requestSubmit(); }
  if (e.target.dataset?.ain && e.key === "Enter" && !e.isComposing) { e.preventDefault(); askGo(Number(e.target.dataset.aq.split("|")[0])); }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "chat-input") return syncInput();
  if (e.target.dataset?.ain) return askInput(e.target);
  if (SPEC.input(e)) return;
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
// 바꾸지 않고 칸을 떠나면 입력 칸을 다시 그려 결과와 맞춘다(슬라이더도 — 끌었다가 처음 값에 놓으면 change 가 안 난다)
document.addEventListener("focusout", (e) => { if (S.holdMain && (e.target.dataset?.stage || e.target.dataset?.slide)) setTimeout(() => { if (S.holdMain) { S.holdMain = false; render(); } }, 0); });
// 누름 추적(대표 11/11): ① 누르는 동안 다시 그리기를 미룬다(render) ② 슬라이더를 놓으면 끄는 중 표시를 푼다 —
//   끌다가 처음 값으로 돌아와 놓으면 change 가 없어 holdMain 이 남고, 그 뒤 어느 탭을 눌러도 가운데 칸이 부하계산 칸 그대로였다.
document.addEventListener("pointerdown", (e) => { PTR.down = true; PTR.slide = !!e.target.closest?.("[data-slide]"); }, true);
function ptrUp() {
  if (!PTR.down) return;
  const slid = PTR.slide; PTR.down = false; PTR.slide = false;
  // click 이 먼저 돌고 나서(같은 입력 처리 안) 그린다
  setTimeout(() => {
    if (slid && S.holdMain) { S.holdMain = false; S.livePending = false; PTR.pending = true; }
    if (PTR.pending) { PTR.pending = false; render(); }
  }, 0);
}
document.addEventListener("pointerup", ptrUp, true);
document.addEventListener("pointercancel", ptrUp, true);
window.addEventListener("blur", ptrUp);
document.addEventListener("toggle", (e) => { const d = e.target.closest?.("[data-more]"); if (d) S.open[d.dataset.more] = d.open; }, true);
document.addEventListener("submit", (e) => {
  if (e.target.id === "site-form") { e.preventDefault(); const q = $("#site-q").value.trim(); if (q) searchSite(q); return; }
  if (e.target.id === "parts-form") {
    e.preventDefault();
    const t = $("#parts-q").value.trim(), P = S.parts;
    if (!t) return searchParts("");
    // 검색창 글이 곧 검색어 — 그대로 다시 누르면 고른 조건 유지, 고쳤으면 새 검색
    searchParts(t, t === P.q ? P.add : []);
  }
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
  $("#reset-all").innerHTML = `${icon("refresh-outline")}<span class="tl">처음부터</span>`;
  $("#tour-start").innerHTML = `${icon("information-circle-outline")}<span class="tl">사용 안내</span>`;
  $("#chat-close").innerHTML = icon("close");
  $("#chat-share").innerHTML = SHARE_IC;
  setChatOpen(chatSaved());
  const sc = await api("/api/schema");
  S.fields = sc.fields; S.items = sc.items; S.chatOn = sc.chat;
  renderChat();
  const [h, q] = location.hash.slice(1).split("?q=");
  if (TABS.some((t) => t.id === h)) S.tab = h; else if (h === "design") S.tab = "load";
  if (STAGES.includes(S.tab)) S.lastStage = S.tab;
  await compute();
  if (h === "parts" && q) searchParts(decodeURIComponent(q), [], { me: decodeURIComponent(q) });
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
// 11/28 대표 「여전히 fps 가 낮고 딱딱」 — 프레임마다 JS 로 --tx 를 넣던 방식은 탭을 바꾸는 순간 새 화면(3D·지도)을 그리느라
//   주 스레드가 막혀 끊겼다. 판을 진짜 요소(.segthumb)로 두고 Web Animations 의 translate·scale(합성 스레드에서 돎)로 움직인다.
//   늘어남 = scale 이 가는 동안 커졌다 돌아옴 · 스프링은 아주 살짝(cubic-bezier 끝 1.06)
//   통이 innerHTML 로 새로 생기면 같은 움직임을 지난 시간(currentTime)부터 이어 붙인다.
const SEG_MS = 360;
const SEG_MOVE = "cubic-bezier(0.32, 0.72, 0.28, 1.06)";
const segState = new Map();   // key → { val, x, w, el, a: { fx, fw, tx, tw, t0 } | null }
const segKey = (g) => (g.classList.contains("seg") ? "tabs" : g.dataset.fk);
function segThumbEl(g) {
  let t = g.querySelector(":scope > .segthumb");
  if (!t) { t = document.createElement("span"); t.className = "segthumb"; t.setAttribute("aria-hidden", "true"); g.prepend(t); }
  return t;
}
function segPose(t, x, w) { for (const a of t.getAnimations()) a.cancel(); t.style.width = `${w}px`; t.style.translate = `${x}px 0`; t.style.scale = "1 1"; }
function segRun(t, a) {
  segPose(t, a.tx, a.tw);
  const el = performance.now() - a.t0; if (el >= SEG_MS || a.tw <= 0) return;
  const s0 = a.fw / a.tw, x0 = a.fx + (a.fw - a.tw) / 2;   // 크기는 가운데 기준 — 처음 모양(fx, fw)에서 출발
  const peak = 1 + Math.min(0.18, (Math.abs(a.tx - a.fx) / a.tw) * 0.09);
  const m = t.animate([{ translate: `${x0}px 0` }, { translate: `${a.tx}px 0` }], { duration: SEG_MS, easing: SEG_MOVE });
  const sc = t.animate([{ scale: `${s0} 1` }, { scale: `${((s0 + 1) / 2) * peak} 1`, offset: 0.42 }, { scale: "1 1" }], { duration: SEG_MS, easing: "ease-in-out" });
  m.currentTime = el; sc.currentTime = el;
}
function segThumbs(jump = false) {
  for (const g of document.querySelectorAll(".seg, .chips.segctl")) {
    const on = g.querySelector(":scope > .on, .on");
    if (!on || !g.offsetParent) { g.classList.remove("thumbed"); continue; }
    const t = segThumbEl(g); g.classList.add("thumbed");
    // 자리는 통 기준으로 잰다(offsetLeft 는 기준 요소가 바뀌면 엉뚱한 값이 나옴)
    const gr = g.getBoundingClientRect(), r = on.getBoundingClientRect();
    const key = segKey(g), val = on.dataset.val ?? on.dataset.tab ?? on.textContent, tx = r.left - gr.left, tw = r.width;
    let st = segState.get(key);
    if (!st || jump) { segState.set(key, { val, x: tx, w: tw, el: t, a: null }); segPose(t, tx, tw); continue; }
    if (st.val !== val) {
      // 지금 보이는 판 자리에서 출발 — 옛 판이 아직 화면에 있으면 그 모양(움직이는 중이면 그 순간)을 잰다
      let fx = st.x, fw = st.w;
      if (st.el?.isConnected && st.el.parentElement) { const tr = st.el.getBoundingClientRect(), pr = st.el.parentElement.getBoundingClientRect(); if (tr.width) { fx = tr.left - pr.left; fw = tr.width; } }
      Object.assign(st, { val, x: tx, w: tw, el: t, a: { fx, fw, tx, tw, t0: performance.now() } });
      segRun(t, st.a);
    } else if (st.a && performance.now() - st.a.t0 < SEG_MS) {
      // 움직이는 중 — 통이 새로 생겼거나 도착점이 바뀌었으면 같은 움직임을 이어 붙인다
      if (st.el !== t || Math.abs(st.a.tx - tx) > 0.5 || Math.abs(st.a.tw - tw) > 0.5) { Object.assign(st.a, { tx, tw }); Object.assign(st, { x: tx, w: tw, el: t }); segRun(t, st.a); }
    } else if (st.el !== t || Math.abs(st.x - tx) > 0.5 || Math.abs(st.w - tw) > 0.5) {
      Object.assign(st, { x: tx, w: tw, el: t, a: null }); segPose(t, tx, tw);   // 처음·폭만 바뀜 → 바로 맞춤
    }
  }
}
new MutationObserver(() => segThumbs())
  .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
window.addEventListener("resize", () => segThumbs(true));
// 칸 경계를 끌어 폭이 바뀌어도 판 자리를 다시 잰다
//   (11/28) 탭을 바꾸면 오른쪽 칸이 생기거나 사라져 #main 폭이 바뀐다 — 이때 jump 하면 움직이던 판이 순간 이동했다. 크기만 바뀐 판은 segThumbs 가 바로 맞추고, 움직이는 판은 도착점만 고친다
const segRO = new ResizeObserver(() => segThumbs());
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
