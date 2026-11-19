// spectable — 부품 종류별 사양 표 보기(대표 11/16 재설계). 자료: /api/spec/* (server/spec/store.ts · 화면 모양 정의 server/spec/layout.ts)
//
// 이 화면을 여는 까닭 세 가지에 맞춰 그린다
//   ① 값 찾아보기 → 목록형: 한 품번 = 한 줄 · 고를 때 보는 칸만 · 위에서 값으로 거르기 · 줄을 누르면 나머지 값과 출처가 펼쳐진다
//   ② 세트 맞추기 → 세트 구성표(댄포스 T2·TE): 회사 팽창변 세트 파일 순서 — 팽창변·감온부(냉매 × N형/B형) → 오리피스 번호 → 바디. 누르면 세트 합계
//   ③ 데이터 검수 → 빈칸은 평소엔 옅은 「?」, 「빈칸 있는 품번만」을 켰을 때만 색 · 칸별 빈칸 수는 아래 한 줄 · 표에 없는 품번·값 충돌은 「확인할 것」
// 왼쪽 = 부품 차례(부품 → 표), 오른쪽 = 고른 표. 상태는 여기 st 하나에 두고, 화면은 언제나 st 로 다시 그릴 수 있다(스크롤 자리 포함).
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n) => (n == null || !Number.isFinite(Number(n)) ? "-" : Number(n).toLocaleString("ko-KR"));
const won = (n) => (n == null || !Number(n) ? `<span class="sp-dim">가격 문의</span>` : `${fmt(n)}원`);
const enc = encodeURIComponent;
import { createBlocks } from "./specblocks.js";

export function createSpec({ api, render, status, toMap }) {
  // blocks = 압축기 「대분류 × 메이커」 화면 차례(대표 11/16, specblocks.js) · bcate = 차례에서 펼친 대분류 · sel "b:101:엠브라코" = 그 화면
  const fresh = () => ({ nav: null, blocks: null, bcate: null, sel: null, list: null, f: {}, q: "", sort: null, dir: 1, blank: false, open: null, detail: {}, txv: null, set: {}, fam: null, issues: null, scroll: 0, err: null, seq: 0 });
  const BLK = createBlocks({ api });
  // 다른 시트(200.응축기 등) 화면 모듈 — public/blocks_<시트>.js 를 처음 열 때 불러온다(시트마다 다른 세션이 만든다)
  const SHEETS = {};
  const sheetMod = (s) => (SHEETS[s] ??= import(`./blocks_${s}.js`).then((m) => m.createBlocks({ api, sheet: s })));
  let st = fresh();
  let timer = null;

  // ───────────── 자료 ─────────────
  const key = () => (st.sel?.startsWith("t:") ? st.sel.slice(2) : null);
  const query = () => `key=${enc(key())}&f=${enc(JSON.stringify(st.f))}&q=${enc(st.q)}${st.sort ? `&sort=${enc(st.sort)}&dir=${st.dir}` : ""}${st.blank ? "&blank=1" : ""}`;
  async function load() {
    const my = ++st.seq;
    try {
      if (st.sel === "txvset") { if (!st.txv) { const x = await api("/api/spec/txvset"); if (my === st.seq) st.txv = x; } }
      else if (st.sel === "issues") { if (!st.issues) { const x = await api("/api/spec/issues"); if (my === st.seq) st.issues = x; } }
      else if (key()) { const x = await api(`/api/spec/list?${query()}`); if (my !== st.seq) return false; st.list = x; }
      st.err = null;
    } catch (e) { if (my === st.seq) st.err = `사양 표를 불러오지 못했습니다: ${e.message}`; }
    return my === st.seq;
  }
  const resetList = () => { st.f = {}; st.q = ""; st.sort = null; st.dir = 1; st.blank = false; st.open = null; st.scroll = 0; };
  /** 열기 — arg 없음: 보던 표(없으면 첫 표) · {key, f}: 그 표를 그 조건으로(부품 상담 「표로 보기」) */
  async function open(arg) {
    try { if (!st.nav) { render(); [st.nav, st.blocks] = await Promise.all([api("/api/spec/nav"), api("/api/spec/blocks").catch(() => null)]); } }
    catch (e) { st.err = `사양 표를 불러오지 못했습니다: ${e.message}`; return render(); }
    // 부품 종류별 사양 표(snapshot.json)가 없고 압축기 화면만 있을 때(배포판, 대표 11/19 「100번만」) — 압축기 묶음을 따로 세운다.
    //   압축기 화면 차례는 「압축기」 묶음 안에 붙으므로, 그 묶음이 없으면 화면이 있어도 「없어요」로 끝났다.
    if (st.blocks?.groups?.length && !st.nav.groups.some((g) => g.name === "압축기")) {
      st.noTables = !st.nav.groups.some((g) => g.tables?.length);
      st.nav.groups.unshift({ name: "압축기", n: st.blocks.groups.reduce((a, B) => a + (B.codes || 0), 0), tables: [] });
    }
    const all = st.nav.groups.flatMap((g) => g.tables.map((t) => t.key));
    if (arg?.key && all.includes(arg.key)) { resetList(); st.sel = `t:${arg.key}`; st.f = { ...(arg.f ?? {}) }; st.list = null; }
    if (!st.sel) {
      const B = (st.blocks?.groups ?? []).find((x) => x.makers?.some((m) => m.built)), M = B?.makers.find((m) => m.built);
      st.sel = all[0] ? `t:${all[0]}` : B ? `b:${B.cate}:${M.maker}` : null;
      if (!all[0] && B) st.bcate = B.cate;
    }
    if (st.sel && (st.sel !== "txvset" || !st.txv) && (st.sel !== "issues" || !st.issues) && (!key() || st.list?.key !== key() || arg?.key)) { render(); await load(); }
    render();
  }

  // ───────────── 왼쪽 차례 ─────────────
  const shortName = (name, g) => name.replace(g, "").trim().replace(/^\((.+)\)$/, "$1") || name;
  function navHtml() {
    const N = st.nav;
    const item = (sel, label, n) => `<button type="button" class="sp-ni${st.sel === sel ? " on" : ""}" data-spnav="${esc(sel)}"><span>${esc(label)}</span><small>${n}</small></button>`;
    const un = N.issues.미분류 + N.issues.부속;
    // 압축기 → 대분류(101~107) → 메이커 화면. 펼친 대분류 하나만 메이커를 보인다. 아직 안 만든 화면은 흐리게(누를 수 없음)
    //   다른 시트(st.blocks.sheets)의 대분류는 navGroup 이 있는 부품 묶음(팽창변 등) 안에, 없으면 시트 이름으로 새 묶음을 만들어 둔다
    //   열쇠: 압축기 「b:101:엠브라코」·펼침 「101」 / 다른 시트 「s:200:201:동화윈」·펼침 「200:201」
    const selP = st.sel?.split(":") ?? [];
    const selOpen = selP[0] === "b" ? selP[1] : selP[0] === "s" ? `${selP[1]}:${selP[2]}` : null;
    const openCate = st.bcate ?? selOpen;
    const cateTree = (cates) => cates.map(({ ok, sel, B }) => `<button type="button" class="sp-ni sp-bc${openCate === ok ? " open" : ""}${selOpen === ok ? " in" : ""}" data-spcate="${esc(ok)}" aria-expanded="${openCate === ok}"><span>${esc(B.cate)} ${esc(B.name)}</span><small>${fmt(B.codes)}</small></button>${openCate === ok ? `<div class="sp-bm">${B.makers.map((m) => m.built
        ? item(sel(m.maker), m.maker, fmt(m.codes)).replace('class="sp-ni', 'class="sp-ni sp-bmk')
        : `<button type="button" class="sp-ni sp-bmk off" disabled><span>${esc(m.maker)}</span><small>${fmt(m.codes)}</small></button>`).join("")}</div>` : ""}`).join("");
    const sheetCates = (S, B) => ({ ok: `${S.sheet}:${B.cate}`, sel: (mk) => `s:${S.sheet}:${B.cate}:${mk}`, B });
    const sheets = st.blocks?.sheets ?? [];
    const inGroup = (name) => sheets.flatMap((S) => S.groups.filter((B) => B.navGroup === name).map((B) => sheetCates(S, B)));
    const blockTree = (g) => {
      const cs = [...(g.name === "압축기" ? (st.blocks?.groups ?? []).map((B) => ({ ok: B.cate, sel: (mk) => `b:${B.cate}:${mk}`, B })) : []), ...inGroup(g.name)];
      return cs.length ? `${cateTree(cs)}${g.tables.length ? `<div class="sp-nst">품번 표</div>` : ""}` : "";
    };
    const names = new Set(N.groups.map((g) => g.name));
    const sheetGroups = sheets.map((S) => { const cs = S.groups.filter((B) => !names.has(B.navGroup)).map((B) => sheetCates(S, B)); return cs.length ? `<div class="sp-ng"><div class="sp-nt">${esc(S.name)} <small>${fmt(cs.reduce((a, c) => a + (c.B.codes || 0), 0))}</small></div>${cateTree(cs)}</div>` : ""; }).join("");
    return `<nav class="sp-nav" aria-label="사양 표 차례">${N.groups.map((g) => `<div class="sp-ng"><div class="sp-nt">${esc(g.name)} <small>${fmt(g.n)}</small></div>
      ${blockTree(g)}${g.setView ? item(g.setView.key, g.setView.name, esc(g.setView.sub)) : ""}${g.tables.map((t) => item(`t:${t.key}`, shortName(t.name, g.name), fmt(t.n))).join("")}</div>`).join("")}${sheetGroups}
      ${st.noTables ? "" : `<div class="sp-ng"><div class="sp-nt">확인할 것</div>${item("issues", "표에 없는 품번 · 값 충돌", fmt(un + N.issues.충돌))}</div>`}</nav>`;
  }

  // ───────────── 목록형 ─────────────
  const cntHtml = (L) => {
    const filtered = Object.keys(st.f).length > 0 || st.q.trim() !== "" || st.blank;
    return filtered ? `${fmt(L.total)}품번 중 <b>${fmt(L.matched)}</b>${L.check.length ? ` · <span class="sp-warn">사양 확인 필요 ${fmt(L.check.length)}</span>` : ""}` : `${fmt(L.total)}품번`;
  };
  function facetsHtml(L) {
    const sel = L.facets.map((f, i) => `<select class="sp-sel${f.value ? " on" : ""}" id="sp-f${i}" data-spf="${esc(f.key)}" aria-label="${esc(f.name)}">
      <option value="">${esc(f.name.replace(/ 범위$/, ""))} 전체</option>${f.options.map((o) => `<option value="${esc(o.value)}"${o.value === f.value ? " selected" : ""}>${esc(o.label)} (${fmt(o.n)})</option>`).join("")}</select>`).join("");
    const any = Object.keys(st.f).length > 0 || st.q.trim() !== "";
    return `${sel}${any ? `<button type="button" class="sp-x" data-spclear="1">조건 지우기</button>` : ""}`;
  }
  const cellTd = (c) => (c.s === "blank" ? (st.blank ? `<td class="sp-b">확인 필요</td>` : `<td class="sp-q" title="값을 모름 — 확인 필요">?</td>`)
    : c.s === "none" ? `<td class="sp-n" title="없는 것이 확인된 값">없음</td>` : `<td${c.full || c.t.length > 22 ? ` title="${esc(c.full ?? c.t)}"` : ""}>${esc(c.t)}</td>`);
  function detailHtml(id, span) {
    const d = st.detail[id];
    if (!d) return `<tr class="sp-d"><td colspan="${span}"><div class="sp-det sub">불러오는 중…</div></td></tr>`;
    const cells = d.cells.map((c) => `<div class="sp-dc"><span class="l">${esc(c.name)}</span>${c.s === "blank" ? `<span class="v w">확인 필요</span><span class="s">값을 모름</span>` : c.s === "none" ? `<span class="v n">없음</span><span class="s">${esc(c.src)}</span>` : `<span class="v">${esc(c.t)}</span><span class="s">${esc(c.src)}</span>`}</div>`).join("");
    const pairs = d.pairs.map((p) => `<div class="sp-dp"><span class="l">맞는 ${esc(p.who)}</span><div>${p.items.slice(0, 40).map((x) => `<button type="button" class="sp-pc${x.std ? " std" : ""}" data-spjump="${x.id}" title="${x.std ? "회사 표준 · " : ""}이 품번으로 가기">${x.cond ? `${esc(x.cond)} ` : ""}<i>${esc(x.modelNo)}</i></button>`).join("")}${p.items.length > 40 ? `<span class="sp-dim">외 ${p.items.length - 40}</span>` : ""}</div></div>`).join("");
    const cf = d.conflicts.map((c) => `<div class="sp-dw w">${esc(c.col)} — ${/↔/.test(c.col) ? "" : "자료끼리 값이 달라 넣지 않았어요: "}${esc(c.detail)}</div>`).join("");
    const ex = (d.extra || []).map((x) => `<div class="sp-dp"><span class="l">${esc(x.name)}</span><div class="sp-dx">${esc(x.text)}</div></div>`).join("");
    return `<tr class="sp-d"><td colspan="${span}"><div class="sp-det">
      <div class="sp-dh"><div><b>${esc(d.modelNo)}</b>${d.std ? `<span class="sp-std">회사 표준 세트</span>` : ""} <span class="sub">${esc([d.modelName, d.brand, d.rank ? `매출 ${fmt(d.rank)}위` : "매출 기록 없음"].filter(Boolean).join(" · "))}</span></div>
        <button type="button" class="sp-x" data-spmap="${d.id}">부품 지도에서 보기</button></div>
      <div class="sp-dg">${cells}</div>${ex}${pairs}${cf}
      <div class="sp-dw">이 표(${esc(d.tableName)})에 넣은 근거: ${esc(d.why)} · 출처 = 값을 가져온 자리(제조사 문서는 문서 이름·쪽)</div></div></td></tr>`;
  }
  function resHtml(L) {
    const span = L.cols.length + 2;
    const arrow = (k) => (st.sort === k ? (st.dir === 1 ? " ▲" : " ▼") : "");
    const head = `<thead><tr><th class="sp-k" data-spsort="" title="매출순으로">품번 · 이름${st.sort ? "" : " <small>매출순</small>"}</th>${L.cols.map((c) => `<th data-spsort="${esc(c.key)}" title="이 칸으로 줄 세우기">${esc(c.name)}${c.unit ? ` <small>${esc(c.unit)}</small>` : ""}${arrow(c.key)}</th>`).join("")}<th class="sp-r" data-spsort="price" title="가격으로 줄 세우기">기본가${arrow("price")}</th></tr></thead>`;
    // 둘째 줄 = 메이커 · 이름(메이커로 묶은 표는 이름만)
    const sub = (r) => [L.showBrand ? r.brand : "", r.modelName].filter(Boolean).join(" · ");
    const row = (r) => `<tr class="sp-row${st.open === r.id ? " open" : ""}" data-sprow="${r.id}"><td class="sp-k" title="${esc([r.modelNo, sub(r)].filter(Boolean).join(" — "))}"><b>${esc(r.modelNo)}${r.std ? `<span class="sp-std" title="사장님 팽창변 세트 파일의 회사 표준 품번">표준</span>` : ""}</b>${sub(r) || r.why || r.blanks ? `<small>${esc(sub(r))}${r.why ? `<span class="w"> ${esc(r.why.join("·"))} 빈칸</span>` : ""}${r.blanks?.length ? `<span class="w"> 빈칸: ${esc(r.blanks.join("·"))}</span>` : ""}</small>` : ""}</td>${r.cells.map(cellTd).join("")}<td class="sp-r">${won(r.price)}</td></tr>${st.open === r.id ? detailHtml(r.id, span) : ""}`;
    const body = L.groups.map((g) => `<tr class="sp-g"><td colspan="${span}">${esc(g.name)} <small>${fmt(g.rows.length)}</small></td></tr>${g.rows.map(row).join("")}`).join("");
    const chk = L.check.length ? `<tr class="sp-g chk"><td colspan="${span}">사양 확인 필요 <small>${fmt(L.check.length)}</small> <span>거른 칸의 값이 비어 맞는지 알 수 없는 품번 — 빼지 않고 따로 둡니다</span></td></tr>${L.check.map(row).join("")}` : "";
    if (!L.matched && !L.check.length) return `<div class="sp-empty">조건에 맞는 품번이 없어요.<button type="button" class="sp-x" data-spclear="1">조건 지우기</button></div>`;
    return `<table class="sp-t">${head}<tbody>${body}${chk}</tbody></table>`;
  }
  const footHtml = (L) => `<span>줄을 누르면 나머지 값${L.hidden.length ? `(${esc(L.hidden.join("·"))})` : ""}과 출처가 펼쳐져요</span><span><i class="sp-q">?</i> 값을 모름(확인 필요)</span><span><i class="sp-n">없음</i> 없는 것이 확인됨</span>${st.blank ? (L.blanks.length ? `<span class="w">빈칸 — ${L.blanks.map((b) => `${esc(b.name)} ${fmt(b.n)}`).join(" · ")}</span>` : "") : ""}${L.conflicts ? `<span>값 충돌 ${fmt(L.conflicts)}건</span>` : ""}`;
  function listHtml() {
    const L = st.list;
    if (!L || L.key !== key()) return `<div class="sp-empty sub">표를 불러오는 중…</div>`;
    return `<header class="sp-head"><div class="sp-title"><h2>${esc(L.name)}</h2><span class="sp-cnt" id="sp-cnt">${cntHtml(L)}</span>
        <span class="sp-tools"><input id="sp-q" type="search" autocomplete="off" placeholder="품번·이름 찾기" value="${esc(st.q)}" aria-label="품번·이름 찾기"><button type="button" class="sp-x${st.blank ? " on" : ""}" data-spblank="1" title="값이 빈 칸이 있는 품번만 보고, 빈칸을 색으로 표시">빈칸 있는 품번만 ${fmt(L.blankRows)}</button><button type="button" class="sp-x" data-spcsv="1" title="지금 보는 줄을 칸 전부와 함께 엑셀(CSV)로">엑셀로 받기</button></span></div>
      <div class="sp-bar" id="sp-facets">${facetsHtml(L)}</div></header>
      <div class="sp-scroll" id="sp-res">${resHtml(L)}</div>
      <footer class="sp-foot" id="sp-foot">${footHtml(L)}</footer>`;
  }

  // ───────────── 세트 구성표 ─────────────
  const famSet = (k) => (st.set[k] ??= { valve: null, no: null, angle: false });
  function setBar(F) {
    const s = famSet(F.key);
    const v = s.valve != null ? F.valveRows.flatMap((r) => Object.values(r.cells).flat()).find((x) => x.id === s.valve) : null;
    const orow = F.orificeRows.find((r) => !v?.conn || r.conn === v.conn) ?? F.orificeRows[0];
    const o = s.no != null ? orow?.cells[s.no] : null;
    const brow = F.bodyRows.find((r) => r.kind === (s.angle ? "앵글" : "일자"));
    const b = s.no != null ? brow?.cells[s.no] : null;
    const first = F.key === "T2" ? "팽창변" : "감온부";
    if (!v && s.no == null) return "";
    const part = (label, x, extra = "") => (x ? `<span class="sp-sp"><small>${esc(label)}</small><b>${esc(x.name ? `${x.name} ` : "")}${esc(x.modelNo)}</b>${extra}<em>${x.missing ? "회사 품목에 없음" : x.price ? `${fmt(x.price)}원` : "가격 문의"}</em></span>` : `<span class="sp-sp need"><small>${esc(label)}</small><b>골라 주세요</b></span>`);
    const need = F.bodyRows.length > 0;
    const parts = [part(first, v), part(s.no != null ? `오리피스 ${s.no}번` : "오리피스", s.no != null ? (o ?? { modelNo: "이 접속용 품번 없음", missing: true }) : null), ...(need ? [part(`바디 ${s.angle ? "앵글" : "일자"}`, s.no != null ? (b ?? { modelNo: "품번 없음", missing: true }) : null)] : [])];
    const items = [v, o, ...(need ? [b] : [])];
    const done = items.every((x) => x), priced = done && items.every((x) => x.price && !x.missing);
    const sum = !done ? "" : priced ? `<span class="sp-sum">합계 <b>${fmt(items.reduce((n, x) => n + x.price, 0))}원</b> <small>기본가 · VAT 별도</small></span>` : `<span class="sp-sum sub">가격이 없는 품번이 있어 합계를 낼 수 없어요</span>`;
    return `<span class="sp-sf">${esc(F.title)} 세트</span>${parts.join(`<span class="sp-plus">+</span>`)}${sum}${need ? `<button type="button" class="sp-x" data-spang="${esc(F.key)}">${s.angle ? "일자 바디로" : "앵글 바디로"}</button>` : ""}<button type="button" class="sp-x" data-spunset="${esc(F.key)}">다시 고르기</button>`;
  }
  function txvHtml() {
    const D = st.txv;
    if (!D) return `<div class="sp-empty sub">세트 구성표를 불러오는 중…</div>`;
    const fams = D.families.map((F) => {
      const s = famSet(F.key);
      const entry = (x) => `<button type="button" class="sp-e${x.std ? " std" : ""}${s.valve === x.id ? " on" : ""}" data-spv="${esc(F.key)}|${x.id}" title="${x.std ? "회사 표준 세트 품번 · " : ""}눌러서 세트에 넣기"><b>${esc(x.name)}${x.std ? `<span class="sp-std">표준</span>` : ""}</b><i>${esc(x.modelNo)}</i><em>${x.price ? `${fmt(x.price)}원` : "가격 문의"}</em>${x.tags.length ? `<small>${esc(x.tags.join(" · "))}</small>` : ""}</button>`;
      const v = `<table class="sp-m"><thead><tr><th class="sp-ml">${F.key === "T2" ? "① 팽창변" : "① 감온부"}</th>${F.refCols.map((l) => `<th>${esc(l)}</th>`).join("")}</tr></thead><tbody>${F.valveRows.map((r) => `<tr><th class="sp-ml">${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</th>${F.refCols.map((l) => `<td>${(r.cells[l] ?? []).map(entry).join("") || `<span class="sp-dim">–</span>`}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      const oc = (x, no) => `<td class="sp-oc${s.no === no ? " on" : ""}" data-spo="${esc(F.key)}|${esc(no)}">${x ? `${x.name ? `<b>${esc(x.name)}</b>` : ""}<i>${esc(x.modelNo)}</i><em>${x.missing ? `<span class="sp-dim">회사 품목에 없음</span>` : x.price ? `${fmt(x.price)}원` : "가격 문의"}</em>` : `<span class="sp-dim">–</span>`}</td>`;
      const o = `<table class="sp-m sp-mo"><thead><tr><th class="sp-ml">② 오리피스 번호${F.bodyRows.length ? " · ③ 바디" : ""}</th>${F.nos.map((n) => `<th class="sp-oc${s.no === n ? " on" : ""}" data-spo="${esc(F.key)}|${esc(n)}">${esc(n)}번</th>`).join("")}</tr></thead><tbody>
        ${[...F.orificeRows, ...F.bodyRows].map((r) => `<tr><th class="sp-ml">${esc(r.label)}</th>${F.nos.map((n) => oc(r.cells[n], n)).join("")}</tr>`).join("")}</tbody></table>`;
      return `<section class="sp-fam" id="sp-fam-${esc(F.key)}"><h3>${esc(F.title)} <small>${esc(F.parts)}</small></h3>${v}${o}</section>`;
    }).join("");
    const cur = D.families.find((F) => F.key === st.fam) ?? D.families[0];
    const bar = cur ? setBar(cur) : "";
    const jump = D.families.map((F) => `<button type="button" class="sp-x" data-spfam="${esc(F.key)}">${esc(F.title)}</button>`).join("");
    return `<header class="sp-head"><div class="sp-title"><h2>세트 구성표</h2><span class="sp-cnt">댄포스 T2·TE 감온식 팽창변 — 회사 팽창변 세트 파일 순서</span><span class="sp-tools">${jump}</span></div>
      <div class="sp-note">① 냉매와 온도 범위(N형 −40~+10℃ 우선, 그보다 낮으면 B형)로 팽창변·감온부 → ② 용량에 맞는 오리피스 번호 → ③ TE5~55 는 번호로 바디가 정해집니다. 팽창변·감온부와 오리피스 번호를 누르면 맨 아래에 세트 합계가 나와요.</div></header>
      <div class="sp-scroll sp-famwrap" id="sp-res">${fams}</div>
      ${bar ? `<footer class="sp-foot sp-setfoot">${bar}</footer>` : `<footer class="sp-foot"><span><i class="sp-std">표준</i> 회사 표준 세트 품번(사장님 팽창변 세트 파일)</span><span>바디 일자 = 회사 표준</span><span>오리피스 번호별 용량은 이 표에 없어요 — 용량표로 계산합니다</span><span>– = 회사 품목에 그 조합 없음</span></footer>`}`;
  }

  // ───────────── 확인할 것 ─────────────
  function issuesHtml() {
    const D = st.issues;
    if (!D) return `<div class="sp-empty sub">불러오는 중…</div>`;
    const un = D.unassigned.map((u) => `<tr><td class="sp-k"><b>${esc(u.modelNo)}</b>${u.modelName ? `<small>${esc(u.modelName)}</small>` : ""}</td><td>${esc(u.brand)}</td><td>${esc(u.group)}</td><td>${esc(u.kind)}</td><td class="sp-wrap">${esc(u.why)}</td></tr>`).join("");
    const cf = D.conflicts.map((c) => `<tr><td class="sp-k"><b>${esc(c.modelNo)}</b></td><td>${esc(c.table)}</td><td>${esc(c.col)}</td><td class="sp-wrap">${esc(c.detail)}</td></tr>`).join("");
    return `<header class="sp-head"><div class="sp-title"><h2>확인할 것</h2><span class="sp-cnt">사양 표에 없는 품번 ${fmt(D.unassigned.length)} · 값 충돌 ${fmt(D.conflicts.length)}</span></div>
</header>
      <div class="sp-scroll" id="sp-res"><table class="sp-t sp-plain"><thead><tr><th class="sp-k">사양 표에 없는 품번</th><th>메이커</th><th>부품</th><th>구분</th><th>까닭</th></tr></thead><tbody>${un}</tbody></table>
      <table class="sp-t sp-plain"><thead><tr><th class="sp-k">값 충돌 품번</th><th>표</th><th>칸</th><th>서로 다른 값</th></tr></thead><tbody>${cf}</tbody></table></div>
      <footer class="sp-foot"><span>미분류 = 이름만으로 어느 표인지 가를 수 없어 아직 넣지 않은 품번(부품 상담에서도 빠져 있어요)</span><span>부속 = 컨트롤러·어댑터처럼 사양 표를 만들지 않는 품번</span><span>값 충돌 = 자료끼리 값이 달라 넣지 않은 칸</span></footer>`;
  }

  // ───────────── 화면 ─────────────
  function view() {
    if (st.err && !st.nav) return `<div class="sp-empty">${esc(st.err)}</div>`;
    if (!st.nav) return `<div class="sp-empty sub">사양 표를 불러오는 중…</div>`;
    if (!st.nav.groups.length) return `<div class="sp-empty sub">아직 만들어진 사양 표가 없어요.</div>`;
    // 메이커 화면은 빈 상자만 두고 그린 뒤(mount) specblocks 가 채운다 — 화면 안 손은 specblocks 가 맡는다
    if (/^[bs]:/.test(st.sel ?? "") && !st.err) return `<div class="sp-page">${navHtml()}<section class="sp-main cb-main" id="cb-host"></section></div>`;
    const main = st.err ? `<div class="sp-empty">${esc(st.err)}</div>` : st.sel === "txvset" ? txvHtml() : st.sel === "issues" ? issuesHtml() : listHtml();
    return `<div class="sp-page">${navHtml()}<section class="sp-main">${main}</section></div>`;
  }
  /** 다시 그린 뒤 — 표 스크롤 자리를 되돌리고 따라 적는다. 찾기 칸에 있던 커서는 글 끝으로 */
  function mount() {
    const bh = document.getElementById("cb-host");
    if (bh && st.sel?.startsWith("b:")) { const [, cate, maker] = st.sel.split(":"); BLK.mount(bh, cate, maker); return; }
    if (bh && st.sel?.startsWith("s:")) {
      const [, sheet, cate, ...mk] = st.sel.split(":"), maker = mk.join(":");
      sheetMod(sheet).then((M) => { if (bh.isConnected) M.mount(bh, cate, maker); })
        .catch((e) => { delete SHEETS[sheet]; if (bh.isConnected) bh.innerHTML = `<div class="sp-empty">화면을 불러오지 못했습니다: ${esc(e.message)}</div>`; });
      return;
    }
    const el = document.getElementById("sp-res");
    if (!el) return;
    el.scrollTop = st.scroll;
    el.addEventListener("scroll", () => { st.scroll = el.scrollTop; }, { passive: true });
    const q = document.getElementById("sp-q");
    if (q && document.activeElement === q) { const n = q.value.length; try { q.setSelectionRange(n, n); } catch { /* search 칸이 아닌 브라우저 */ } }
  }
  /** 찾기 칸을 치는 동안 — 입력 칸은 그대로 두고(한글 조합이 끊기지 않게) 수·거르기·표만 바꾼다 */
  async function typed() {
    if (!(await load()) || !key()) return;
    const L = st.list, a = document.getElementById("sp-cnt"), b = document.getElementById("sp-facets"), c = document.getElementById("sp-res"), d = document.getElementById("sp-foot");
    if (!L || !a || !b || !c) return render();
    a.innerHTML = cntHtml(L); b.innerHTML = facetsHtml(L); c.innerHTML = resHtml(L); if (d) d.innerHTML = footHtml(L);
    c.scrollTop = 0; st.scroll = 0;
  }

  // ───────────── 손 ─────────────
  function click(e) {
    const t = e.target;
    if (t.closest(".cb-main")) return true;   // 메이커 화면 안 — specblocks 가 이미 처리
    const bc = t.closest("[data-spcate]");
    if (bc) { const c = bc.dataset.spcate, p = st.sel?.split(":") ?? [], cur = st.bcate ?? (p[0] === "b" ? p[1] : p[0] === "s" ? `${p[1]}:${p[2]}` : null); st.bcate = cur === c ? "" : c; render(); return true; }
    const nv = t.closest("[data-spnav]");
    if (nv) { if (st.sel !== nv.dataset.spnav) { st.sel = nv.dataset.spnav; resetList(); st.list = null; } open(); return true; }
    if (t.closest("[data-spclear]")) { st.f = {}; st.q = ""; st.open = null; st.scroll = 0; load().then(render); return true; }
    if (t.closest("[data-spblank]")) { st.blank = !st.blank; st.open = null; st.scroll = 0; load().then(render); return true; }
    if (t.closest("[data-spcsv]")) {
      api(`/api/spec/csv?${query()}`).then((x) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([x.csv], { type: "text/csv;charset=utf-8" })); a.download = x.name;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }).catch((err) => status?.(`엑셀 파일을 만들지 못했습니다: ${err.message}`));
      return true;
    }
    const mp = t.closest("[data-spmap]");
    if (mp) { const d = st.detail[Number(mp.dataset.spmap)]; if (d) toMap(d); return true; }
    const jp = t.closest("[data-spjump]");
    if (jp) {   // 짝 품번으로 — 그 품번의 표를 열고 그 줄을 펼친다
      const id = Number(jp.dataset.spjump);
      api(`/api/spec/row?id=${id}`).then((d) => { st.detail[id] = d; resetList(); st.sel = `t:${d.table}`; st.q = d.modelNo; st.open = id; st.list = null; return load(); }).then(render)
        .catch(() => status?.("그 품번은 사양 표에 아직 없어요(확인할 것 → 표에 없는 품번)."));
      return true;
    }
    const sv = t.closest("[data-spv]");
    if (sv) { const [k, id] = sv.dataset.spv.split("|"); const s = famSet(k); s.valve = s.valve === Number(id) ? null : Number(id); st.fam = k; render(); return true; }
    const so = t.closest("[data-spo]");
    if (so) { const [k, no] = so.dataset.spo.split("|"); const s = famSet(k); s.no = s.no === no ? null : no; st.fam = k; render(); return true; }
    const sf = t.closest("[data-spfam]");
    if (sf) {   // 계열로 바로 가기
      const box = document.getElementById("sp-res"), sec = document.getElementById(`sp-fam-${sf.dataset.spfam}`);
      if (box && sec) { st.scroll = Math.max(0, sec.offsetTop - 12); st.fam = sf.dataset.spfam; render(); }
      return true;
    }
    const sa = t.closest("[data-spang]");
    if (sa) { const s = famSet(sa.dataset.spang); s.angle = !s.angle; render(); return true; }
    const su = t.closest("[data-spunset]");
    if (su) { st.set[su.dataset.spunset] = { valve: null, no: null, angle: false }; render(); return true; }
    const th = t.closest("[data-spsort]");
    if (th) {
      const k = th.dataset.spsort || null;
      if (k == null) { st.sort = null; st.dir = 1; } else if (st.sort === k) { if (st.dir === 1) st.dir = -1; else { st.sort = null; st.dir = 1; } } else { st.sort = k; st.dir = 1; }
      st.open = null; st.scroll = 0; load().then(render);
      return true;
    }
    if (t.closest(".sp-d")) return true;   // 펼친 칸 안을 눌러도 접히지 않는다
    const tr = t.closest("[data-sprow]");
    if (tr) {
      const id = Number(tr.dataset.sprow);
      st.open = st.open === id ? null : id;
      if (st.open != null && !st.detail[id]) api(`/api/spec/row?id=${id}`).then((d) => { st.detail[id] = d; render(); }).catch((err) => status?.(`품번 값을 불러오지 못했습니다: ${err.message}`));
      render();
      return true;
    }
    return !!t.closest(".sp-page");
  }
  function change(e) {
    const el = e.target.closest?.("[data-spf]");
    if (!el) return false;
    if (el.value === "") delete st.f[el.dataset.spf]; else st.f[el.dataset.spf] = el.value;
    st.open = null; st.scroll = 0;
    load().then(render);
    return true;
  }
  function input(e) {
    if (e.target.id !== "sp-q") return false;
    st.q = e.target.value; st.open = null;
    clearTimeout(timer); timer = setTimeout(typed, 220);
    return true;
  }
  return { view, mount, click, change, input, open, reset: () => { st = fresh(); }, get state() { return st; } };
}
