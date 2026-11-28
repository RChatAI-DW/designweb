// explain — 부품 검색 「찾는 과정」·「데이터 현황」 그림(대표 11/15). 자료는 /api/parts/explain · /api/part/:id/data (server/explain.ts).
//   찾는 과정: 검색어 읽기 → 두 길(① 글자로 찾기 ② 분류로 좁히기) 깔때기 → 정렬 열쇠와 결과 줄(매출 순위 그림) → 다음에 물을 항목 → 그 소분류에 있는 데이터
//   데이터 현황: 제품 하나의 품번 × 데이터 종류 표(있음·빈칸·규칙 없음) + 종류별 채움 막대
//   색은 style.css 토큰만 쓴다.
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n) => (n == null || !Number.isFinite(Number(n)) ? "-" : Number(n).toLocaleString("ko-KR"));
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

const KIND = {
  model_exact: ["품번 정확히 같음", "k-exact"], model_prefix: ["품번 앞부분 같음", "k-model"], model_norm: ["품번·코드 비슷함", "k-model"],
  name: ["이름에 낱말 있음", "k-name"], partial: ["낱말 일부 맞음", "k-part"],
};
const kindTag = (k) => { const [t, c] = KIND[k] ?? [k, "k-part"]; return `<span class="xp-tag ${c}">${esc(t)}</span>`; };

const sec = (no, title, sub, body) => `<section class="xp-sec"><div class="xp-h"><span class="xp-no">${no}</span><div><div class="xp-t">${title}</div>${sub ? `<div class="xp-s">${sub}</div>` : ""}</div></div>${body}</section>`;

/** 깔때기 한 줄 — 막대 폭 = 처음 수 대비(√ 눈금: 840 → 9 처럼 차이가 커도 작은 쪽이 보이게). segs = [{n, cls, t}] */
function fRow(label, n, base, segs, note = "") {
  const w = base ? Math.max(2, Math.sqrt(n / base) * 100) : 0;
  const inner = segs?.length ? segs.filter((s) => s.n > 0).map((s) => `<i class="${s.cls}" style="flex:${s.n}" title="${esc(`${s.t} ${fmt(s.n)}`)}"></i>`).join("") : `<i class="f-all" style="flex:1"></i>`;
  return `<div class="fr"><div class="fl">${label}</div><div class="fb"><div class="fbar" style="width:${w}%">${inner}</div><b class="num">${fmt(n)}</b></div>${note ? `<div class="fn">${note}</div>` : ""}</div>`;
}
const legend = (xs) => `<div class="xp-leg">${xs.map(([c, t]) => `<span><i class="${c}"></i>${t}</span>`).join("")}</div>`;

// ───────────────────────── 찾는 과정 ─────────────────────────
/** 검색어 낱말마다 무엇으로 읽었나 — [{t, kind: brand|cat|val|word, tag, to}] (찾는 과정 화면·지도 길 안내가 같이 쓴다) */
export function readTokens(X) {
  const T = X.text, P = X.path;
  return T.tokens.map((t) => {
    const b = T.brands.find((x) => x.said === t);
    if (b) return { t, kind: "brand", tag: "메이커", to: b.brand !== t ? b.brand : null };
    if (P && P.said.split(/\s+/).includes(t)) return { t, kind: "cat", tag: "소분류", to: `${P.label} (${P.cates.join("·")})` };
    const st = P?.steps.find((s) => s.item !== "메이커" && !s.added && (String(s.said).includes(t) || t.includes(String(s.said))));
    if (st) return { t, kind: "val", tag: st.item, to: null };
    return { t, kind: "word", tag: "낱말", to: null };
  });
}
export const tokenChip = (x) => `<span class="xp-chip${x.kind === "word" ? "" : ` c-${x.kind}`}"><small>${esc(x.tag)}</small>${esc(x.t)}${x.to ? ` → ${esc(x.to)}` : ""}</span>`;

export function viewHow(X) {
  if (!X) return `<div class="empty">찾는 과정을 불러오는 중…</div>`;
  const T = X.text, P = X.path;
  // ⓪ 검색어 읽기
  const chips = readTokens(X).map(tokenChip).join(`<span class="xp-plus">+</span>`);
  const read = sec(1, "검색어를 이렇게 읽었어요", "글자 그대로 맞춰 봅니다 · AI 를 부르지 않습니다", `<div class="xp-chips">${chips}</div>`);

  // ① 글자로 찾기
  const K = T.kinds, kn = (k) => K[k] ?? 0;
  const lane1 = `<div class="xp-lane"><div class="xp-lt">① 글자로 찾기 <small>지금 검색 상자 · 앱 검색과 같은 방식</small></div>
    ${fRow("등록 제품", T.totalParts ?? 0, T.totalParts)}
    ${fRow("글자가 맞은 제품", T.found, T.totalParts, [
      { n: kn("model_exact"), cls: "f-exact", t: "품번 정확히 같음" }, { n: kn("model_prefix") + kn("model_norm"), cls: "f-model", t: "품번·코드" },
      { n: kn("name"), cls: "f-name", t: "이름" }, { n: kn("partial"), cls: "f-part", t: "낱말 일부" }], T.capped ? "200개에서 끊음" : "")}
    ${fRow(T.handledOnly ? "취급 제품만 남김" : "취급 + 카탈로그", T.handledOnly ? T.handledCount : T.found, T.totalParts, T.handledOnly ? null : [{ n: T.handledCount, cls: "f-ok", t: "취급" }, { n: T.found - T.handledCount, cls: "f-none", t: "카탈로그" }],
      T.handledOnly ? "취급 제품이 걸려서 카탈로그 제품은 뺌" : "걸린 취급 제품이 없어 카탈로그까지")}
    ${fRow("화면에 보이는 제품", T.shown, T.totalParts, null, "제품 단위 · 최대 40")}
    ${legend([["f-exact", "품번 정확"], ["f-model", "품번·코드"], ["f-name", "이름"], ["f-part", "낱말 일부"]])}</div>`;

  // ② 분류로 좁히기
  let lane2;
  if (!P) lane2 = `<div class="xp-lane"><div class="xp-lt">② 분류로 좁히기 <small>소거법 · 라이브 상담 엔진</small></div><div class="xp-miss">검색어에서 소분류를 못 읽었어요.<br>「드라이어」「전자변」처럼 부품 종류 이름이 있어야 이 길을 탑니다.</div></div>`;
  else {
    const steps = P.steps.map((s) => s.skipped
      ? fRow(`${esc(s.item)} = ${esc(s.said)}`, s.ok, P.start, null, s.why === "rule" ? "엔진에 이 값을 읽는 규칙이 없어 거르지 않음" : "이 소분류 항목이 아니라 거르지 않음")
      : fRow(`${esc(s.item)} = ${esc(s.said)}`, s.before, P.start, [{ n: s.ok, cls: "f-ok", t: "남음" }, { n: s.diff, cls: "f-diff", t: "값이 달라 지움" }, { n: s.none, cls: "f-none", t: "값이 비어 지움" }],
        `남음 ${fmt(s.ok)} · 다름 ${fmt(s.diff)} · <span class="w">빈칸 ${fmt(s.none)}</span>${s.kept ? ` · 갈래 항목 빈칸이라 남김 ${fmt(s.kept)}` : ""}`)).join("");
    lane2 = `<div class="xp-lane"><div class="xp-lt">② 분류로 좁히기 <small>소거법 · 라이브 상담 엔진(chat/elim.ts)</small></div>
      ${fRow(`${esc(P.label)} 품번 전체`, P.start, P.start, [{ n: P.sold, cls: "f-ok", t: "판매 실적 있음" }, { n: P.start - P.sold, cls: "f-diff", t: "판매 실적 없음" }], `판매 실적 ${fmt(P.sold)} · 단종 제외`)}
      ${steps || `<div class="xp-miss">검색어에 거를 값(메이커·관사이즈·냉매…)이 없어 소분류 전체가 남았어요.</div>`}
      ${P.steps.length ? fRow("남은 품번", P.left, P.start, [{ n: P.left, cls: "f-ok", t: "남음" }], "매출순") : ""}
      ${P.zero ? `<div class="xp-miss">「${esc(P.zero.item)} = ${esc(P.zero.value)}」에서 0개가 됐어요. 남아 있던 값: ${esc(P.zero.values.join(", ") || "없음")}</div>` : ""}
      ${legend([["f-ok", "남음"], ["f-diff", "값이 달라 지움"], ["f-none", "값이 비어 지움"]])}</div>`;
  }
  const lanes = sec(2, "두 길로 찾아요", "왼쪽이 지금 검색 상자가 하는 일, 오른쪽이 상담 엔진의 소거법입니다", `<div class="xp-lanes">${lane1}${lane2}</div>`);

  // ③ 정렬 — 열쇠 사다리 + 결과 줄 + 순서-매출 그림
  const ladder = ["품번이 정확히 맞은 것", "검색어 속 메이커 제품", "매출 실적 있는 것", "검색어 낱말을 더 많이 맞힌 것", "매출 순위 높은 것", "취급 · 낱말 위치 · 이름 길이"]
    .map((t, i) => `<span class="xp-step${i === 4 ? " on" : ""}"><b>${i + 1}</b>${t}</span>`).join(`<span class="xp-arrow">›</span>`);
  const J = Object.entries(T.jumps);
  const jumpNote = J.length ? `매출순보다 앞에 선 줄 ${J.reduce((a, [, n]) => a + n, 0)}개 — ${J.map(([k, n]) => `${esc(k)} ${n}`).join(" · ")}` : "매출 순위 그대로 섰어요";
  const rows = T.rows.map((r) => `<tr class="tap${r.aheadOf ? " jump" : ""}" data-xpart="${r.id}">
      <td class="num c">${r.pos}</td>
      <td><div class="t">${esc(r.name)}</div><div class="sub">${esc([r.brand, r.category, `품번 ${r.variants}개`].filter(Boolean).join(" · "))}</div></td>
      <td>${kindTag(r.kind)}${r.matched ? `<div class="sub num">${esc(String(r.matched).slice(0, 28))}</div>` : ""}</td>
      <td>${r.brandHit ? `<span class="xp-tag k-brand">메이커 일치</span>` : ""}<div class="sub">${r.hitWords.length ? `맞힌 낱말 ${r.hits}/${T.tokens.length}` : "낱말 없음(품번·별칭)"}</div></td>
      <td class="num r">${r.salesRank != null ? `${fmt(r.salesRank)}위` : `<span class="mut">실적 없음</span>`}</td>
      <td class="c">${r.handled ? `<span class="xp-tag k-ok">취급</span>` : `<span class="xp-tag">카탈로그</span>`}</td>
      <td class="why">${r.aheadOf ? `${r.aheadOf.pos}번(${fmt(r.aheadOf.salesRank)}위)보다 앞 · <b>${esc(r.aheadOf.why)}</b>` : ""}</td></tr>`).join("");
  const sort = sec(3, "이 순서로 줄을 세웠어요", `${jumpNote} · 메이커 일치·맞힌 낱말은 검색 함수와 같은 뜻으로 여기서 다시 센 값`,
    `<div class="xp-ladder">${ladder}</div>${scatter(T.rows)}
     <div class="xp-tw"><table class="xp-tb"><thead><tr><th>순서</th><th>제품</th><th>걸린 까닭</th><th>메이커·낱말</th><th>매출 순위</th><th>취급</th><th>매출순과 다른 까닭</th></tr></thead><tbody>${rows || `<tr><td colspan="7" class="mut c">찾은 제품이 없습니다</td></tr>`}</tbody></table></div>`);

  // ④ 소거 결과 + 다음에 물을 항목
  let ask = "";
  if (P) {
    const top = P.top.map((r, i) => `<tr class="tap" data-xpart="${r.partId}"><td class="num c">${i + 1}</td><td class="num">${esc(r.modelNo)}</td><td>${esc(r.brand)}</td><td class="num r">${r.salesRank != null ? `${fmt(r.salesRank)}위` : `<span class="mut">실적 없음</span>`}</td><td class="num r">${r.price != null ? `${fmt(r.price)}원` : "가격 문의"}</td><td>${r.unknown.length ? `<span class="xp-tag k-warn">${esc(r.unknown.join("·"))} 자료 없음</span>` : ""}</td></tr>`).join("");
    const next = P.next.length ? P.next.map((x) => valueBar(x.item, x.kind, x.values, x.blank, x.filled + x.blank, `물으면 ${fmt(x.filled + x.blank)}개 → 많아야 ${fmt(x.worst)}개`)).join("")
      : `<div class="xp-miss">${P.left <= 1 ? "하나로 좁혀져 더 물을 게 없어요." : "남은 품번 사이에서 값이 갈리는 사장님 항목이 없어요(값이 다 같거나 비어 있음)."}</div>`;
    ask = sec(4, `소거 결과 ${fmt(P.left)}개 · 다음에 물으면 좋은 항목`, "사장님 되묻기 항목 중 남은 품번에서 값이 갈리는 것 · 잘 가르는 순",
      `<div class="xp-2col"><div><div class="xp-tw"><table class="xp-tb"><thead><tr><th></th><th>품번</th><th>메이커</th><th>매출</th><th>기본가</th><th></th></tr></thead><tbody>${top || `<tr><td colspan="6" class="mut c">남은 품번 없음</td></tr>`}</tbody></table></div>${P.left > P.top.length ? `<div class="sub">외 ${fmt(P.left - P.top.length)}개</div>` : ""}</div><div>${next}</div></div>`);
  }

  // ⑤ 그 소분류에 있는 데이터
  let have = "";
  if (P) {
    const lines = P.have.map((x) => x.ruled
      ? `<div class="hv"><div class="hvl">${esc(x.item)} <span class="xp-tag">${x.kind === "base" ? "전체" : "갈래"}</span></div><div class="hb"><div class="hbar"><i style="width:${pct(x.filled, x.of)}%"></i></div><b class="num">${pct(x.filled, x.of)}%</b></div><div class="hvv">${esc(x.values.map(([v, n]) => `${v} ${n}`).join(" · ")) || "값 없음"}</div></div>`
      : `<div class="hv"><div class="hvl">${esc(x.item)} <span class="xp-tag">${x.kind === "base" ? "전체" : "갈래"}</span></div><div class="hb"><span class="xp-tag k-bad">엔진에 읽는 규칙 없음</span></div><div class="hvv mut">물어도 품번을 거를 수 없음</div></div>`).join("");
    have = sec(5, `${esc(P.label)} 품번 ${fmt(P.start)}개에 있는 데이터`, "사장님 필수 확인 항목별로 값이 적힌 품번 비율 · 전체 = 모든 품번에 해당, 갈래 = 일부 갈래만",
      `<div class="hvs">${lines || `<div class="xp-miss">사장님 파일에 이 소분류 항목이 없어요.</div>`}</div>`);
  }
  return `<div class="xp">${read}${lanes}${sort}${ask}${have}</div>`;
}

/** 값 분포 막대 — 값마다 한 칸(많은 순), 빈칸은 주황 */
function valueBar(item, kind, values, blank, total, note) {
  const segs = values.map(([v, n], i) => `<i class="vb${i % 4}" style="flex:${n}" title="${esc(`${v} ${n}개`)}">${n / total > 0.08 ? `<span>${esc(v)}</span>` : ""}</i>`).join("") + (blank ? `<i class="vbx" style="flex:${blank}" title="빈칸 ${blank}개">${blank / total > 0.08 ? "<span>빈칸</span>" : ""}</i>` : "");
  return `<div class="vbw"><div class="vbh"><b>${esc(item)}</b> <span class="xp-tag">${kind === "base" ? "전체" : "갈래"}</span><span class="sub">${note}</span></div><div class="vbar">${segs}</div>
    <div class="sub">${esc(values.slice(0, 8).map(([v, n]) => `${v} ${n}`).join(" · "))}${blank ? ` · 빈칸 ${blank}` : ""}</div></div>`;
}

/** 표시 순서(가로) × 매출 순위(세로, 로그) — 줄이 오른쪽 아래로만 내려가면 매출순. 실적 없는 줄은 맨 아래 띠 */
function scatter(rows) {
  if (rows.length < 2) return "";
  const W = 640, H = 200, L = 52, R = 12, Tp = 12, B = 34;
  const ranks = rows.map((r) => r.salesRank).filter((x) => x != null);
  if (!ranks.length) return "";
  const lo = Math.log10(Math.max(1, Math.min(...ranks))), hi = Math.log10(Math.max(...ranks) * 1.2 + 1);
  const x = (i) => L + ((W - L - R) * i) / Math.max(1, rows.length - 1);
  const band = H - B + 14;
  const y = (rk) => (rk == null ? band : Tp + ((H - B - Tp) * (Math.log10(rk) - lo)) / Math.max(0.01, hi - lo));
  const ticks = [1, 10, 100, 1000, 10000].filter((t) => Math.log10(t) >= lo - 0.01 && Math.log10(t) <= hi);
  const pts = rows.map((r, i) => `<circle cx="${x(i)}" cy="${y(r.salesRank)}" r="5" class="${r.salesRank == null ? "d-none" : r.aheadOf ? "d-jump" : "d-ok"}"><title>${esc(`${r.pos}. ${r.name} · ${r.salesRank != null ? `${r.salesRank}위` : "실적 없음"}${r.aheadOf ? ` · ${r.aheadOf.why}` : ""}`)}</title></circle>`).join("");
  const line = rows.map((r, i) => (r.salesRank != null ? `${x(i)},${y(r.salesRank)}` : null)).filter(Boolean).join(" ");
  return `<div class="xp-sc"><svg viewBox="0 0 ${W} ${H + 8}" role="img" aria-label="표시 순서와 매출 순위">
    ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="g"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}위</text>`).join("")}
    <line x1="${L}" x2="${W - R}" y1="${band}" y2="${band}" class="g"/><text x="${L - 8}" y="${band + 4}" text-anchor="end">없음</text>
    <polyline points="${line}" class="ln"/>${pts}
    <text x="${(L + W - R) / 2}" y="${H + 6}" text-anchor="middle">화면 표시 순서 →</text></svg>
    ${legend([["d-ok", "매출순 맞음"], ["d-jump", "매출순보다 앞(다른 열쇠)"], ["d-none", "매출 실적 없음"]])}</div>`;
}

// ───────────────────────── 데이터 현황 ─────────────────────────
export function viewData(D) {
  if (!D) return `<div class="empty">데이터 현황을 불러오는 중…</div>`;
  const R = D.rows, n = R.length, live = R.filter((r) => !r.discontinued);
  // 데이터 종류 — [이름, 품번에 있나(r) → bool, 설명]
  const KINDS = [
    ["기본가", (r) => r.hasPrice, "가격표 값(단종은 화면에서 숨김)"],
    ["매출 실적", (r) => r.salesRank != null, "3년 판매 순위"],
    ["재고 보유", (r) => r.stock === "재고 보유", "variant_availability 「재고 보유」 · 나머지는 문의 요망 등"],
    ["ERP 품목코드", (r) => r.erp.length > 0, "회사 품목 연결(erp_item_links)"],
    ["소분류 판정", (r) => r.cate != null, "회사 새 상품코드 분류"],
    ["사양 글", (r) => r.specText > 0, "품번 사양 글"],
    ["마스터 사양 축", (r) => r.specAxes.length > 0, "core_item_specs"],
    ["엔진 속성", (r) => r.attrs.length > 0, "variant_attrs"],
    ["품번 사진", (r) => r.photos > 0, "품번에 묶인 사진"],
    ["문서 쪽", (r) => r.pages > 0, "자료 PDF 쪽"],
  ];
  const head = `<div class="dh"><div><div class="dt">${esc(D.part.name)}</div><div class="sub">${esc([D.part.brand, D.cate ? `소분류 ${D.cate.id} ${D.cate.name}` : "소분류 없음", `품번 ${fmt(n)}개${D.capped ? "(300개까지)" : ""}`, `단종 ${fmt(n - live.length)}`].filter(Boolean).join(" · "))}</div></div>
    <div class="dtiles">${[["제품 사진", D.partLevel.photos], ["상세 이미지", D.partLevel.detailImages], ["제품 문서", D.partLevel.docs], ["설명 글", D.part.description ? "있음" : "없음"]].map(([t, v]) => `<div class="dtile"><b class="num">${typeof v === "number" ? fmt(v) : v}</b><span>${t}</span></div>`).join("")}</div></div>`;

  const askN = (it) => { const xs = live.map((r) => r.ask[it.item]); return { ok: xs.filter((x) => x?.s === "ok").length, of: live.length }; };
  const bars = [...KINDS.map(([t, f, d]) => ({ t, d, ok: R.filter(f).length, of: n, ask: false })),
    ...D.items.map((it) => ({ t: it.item, d: it.ruled ? `되묻기 ${it.kind === "base" ? "전체" : "갈래"} 항목 · 단종 제외` : "엔진에 읽는 규칙 없음", ...(it.ruled ? askN(it) : { ok: 0, of: live.length }), ask: true, norule: !it.ruled }))];
  const cov = `<div class="hvs two">${bars.map((b) => `<div class="hv"><div class="hvl">${esc(b.t)}${b.ask ? ` <span class="xp-tag k-cat">되묻기</span>` : ""}</div><div class="hb">${b.norule ? `<span class="xp-tag k-bad">규칙 없음</span>` : `<div class="hbar${b.ask ? " ask" : ""}"><i style="width:${pct(b.ok, b.of)}%"></i></div><b class="num">${fmt(b.ok)}/${fmt(b.of)}</b>`}</div><div class="hvv mut">${esc(b.d)}</div></div>`).join("")}</div>`;

  const dot = (on, title = "") => `<td class="c"><span class="dot${on ? " on" : ""}" title="${esc(title)}"></span></td>`;
  const askCell = (x) => !x ? `<td></td>` : x.s === "ok" ? `<td class="av">${esc(x.v)}</td>` : x.s === "blank" ? `<td class="ab">빈칸</td>` : x.s === "norule" ? `<td class="an">규칙 없음</td>` : x.s === "eol" ? `<td class="an">단종</td>` : `<td class="an">분류 밖</td>`;
  const body = R.map((r) => `<tr class="${r.discontinued ? "eol" : ""}">
      <th><div class="num">${esc(r.modelNo)}</div>${r.modelName ? `<div class="sub">${esc(r.modelName.slice(0, 30))}</div>` : ""}</th>
      <td class="num r">${r.discontinued ? `<span class="xp-tag k-bad">단종</span>` : r.price != null ? `${fmt(r.price)}원` : `<span class="mut">없음</span>`}</td>
      <td class="num r">${r.salesRank != null ? `${fmt(r.salesRank)}위` : `<span class="mut">-</span>`}</td>
      <td>${r.stock ? esc(r.stock) : `<span class="mut">-</span>`}</td>
      ${dot(r.erp.length, r.erp.join(", "))}${dot(r.cate != null, r.cate != null ? `소분류 ${r.cate}` : "")}${dot(r.specText > 0)}${dot(r.specAxes.length, r.specAxes.join(", "))}${dot(r.attrs.length, r.attrs.join(", "))}
      <td class="num c">${r.photos || `<span class="mut">0</span>`}</td><td class="num c">${r.pages || `<span class="mut">0</span>`}</td>
      ${D.items.map((it) => askCell(r.ask[it.item])).join("")}</tr>`).join("");
  const table = `<div class="xp-tw dm"><table class="xp-tb dmx"><thead>
      <tr class="grp"><th></th><th colspan="4">기본</th><th colspan="5">연결·사양</th><th colspan="2">자료</th>${D.items.length ? `<th colspan="${D.items.length}" class="g-ask">사장님 되묻기 항목 값(엔진이 읽은 값)</th>` : ""}</tr>
      <tr><th>품번</th><th>기본가</th><th>매출</th><th>재고</th><th>ERP</th><th>분류</th><th>사양 글</th><th>사양 축</th><th>속성</th><th>사진</th><th>문서 쪽</th>${D.items.map((it) => `<th class="g-ask">${esc(it.item)}</th>`).join("")}</tr></thead>
      <tbody>${body}</tbody></table></div>
    ${legend([["dot on", "있음"], ["dot", "없음"], ["ab-l", "되묻기 값 빈칸"], ["an-l", "규칙 없음·단종·분류 밖"]])}`;
  return `<div class="xp">${sec(1, "제품", "", head)}${sec(2, "데이터 종류별로 몇 품번에 있나", "막대 = 그 자료가 있는 품번 비율", cov)}${sec(3, "품번별 데이터", "매출순 · 점 위에 마우스를 올리면 내용(사양 축 이름·ERP 코드)", table)}</div>`;
}
