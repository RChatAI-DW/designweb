// route.js — 부품 검색 길 안내(대표 11/15 「설명서가 아니라, 정말로 검색하면 단계별로 지금 뭘 하는지 지도에서 길 찾아가듯 움직이는 모션으로」).
//   자료 = /api/parts/explain(server/explain.ts) 그대로 — 지도에 켜지고 꺼지는 칸·세는 수는 엔진이 실제로 가른 품번이다(꾸민 수 없음).
//   검색어에서 소분류를 읽으면 「분류 길」, 못 읽으면 「글자 길」을 탄다:
//     분류 길 — 라이브 상담 소거 엔진(chat/elim.ts): 대분류 → 중분류 → 소분류로 날아가 출발 품번을 켜고, 조건마다 빠지는 칸을 지운다
//              (값이 달라 빠짐·값이 비어 빠짐 모두 하이라이트만 꺼짐 — 까닭별 수는 안내 글에) → 남은 품번에 순번 → 갈림길(다음에 물을 항목)
//     글자 길 — 검색 상자 RPC(search_catalog): 걸린 까닭(품번 정확 → 품번 비슷 → 이름 → 낱말 일부)마다 칸이 켜진다 → 제품 차례 순번
//   지도 그리기는 partmap.js 의 nav* — 여기서는 차례와 기다림만 정한다. [건너뛰기]는 기다림·움직임을 0 으로.
import { readTokens, tokenChip } from "./explain.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n) => Number(n ?? 0).toLocaleString("ko-KR");
const ease = (k) => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);
const KINDS = [["model_exact", "품번이 정확히 같음"], ["model", "품번 앞부분·코드가 비슷함"], ["name", "이름에 낱말이 있음"], ["partial", "낱말 일부가 맞음"]];

/** 길 차례 만들기 — 지도(PM) 위 어느 칸으로 가는지까지 정한다 */
export function planRoute(X, PM) {
  const T = X.text;
  // 옛 서버(품번 id 를 안 돌려주는 판)면 분류 길을 그릴 수 없다 — 글자 길로
  const P = Array.isArray(X.path?.startIds) ? X.path : null;
  const steps = [{ k: "read", toks: readTokens(X) }];
  if (P) {
    const { chain, onMap } = PM.routeOf(P.startIds);
    chain.forEach((n, i) => steps.push({ k: "node", id: n.id, name: n.name, n: n.n, lvl: n.leaf ? "소분류" : i === 0 ? "대분류" : "중분류" }));
    const start = new Set(P.startIds);
    const under = chain.length ? PM.tilesUnder(chain[chain.length - 1].id) : [];
    const out = under.filter(([id]) => !start.has(id));
    const end = chain[chain.length - 1];
    // 출발이 소분류 하나가 아니면(「압축기」= 소분류 7개) 그 아래 소분류를 다 보여 준다
    const multi = !end?.leaf;
    steps.push({ k: "start", multi, root: end?.id ?? null, ids: P.startIds, n: P.start, onMap, mapN: under.length, outN: out.length, discN: out.filter(([, d]) => d).length, label: P.label });
    for (const s of P.steps) steps.push({ k: "cond", ...s });
    if (P.pruned.length) steps.push({ k: "prune", ids: P.pruned, before: P.left + P.pruned.length, after: P.left });
    // 매출순 줄 세우기는 다 좁힌 뒤에만(대표 11/16 「되묻기로 5개 이하로 줄어든 다음에만」) — 아직 되물을 게 있으면 도착 대신 「되묻기」로 끝난다.
    //   되물을 항목이 없는데 남은 수가 많을 때(사양 값 빈칸)도 목록을 보여 주므로 줄 세운다.
    const ask = P.left > (P.askUntil ?? 5) && (P.ask?.length ?? 0) > 0;
    if (!ask && P.left) steps.push({ k: "sort", mode: "route", ids: P.rows.map((r) => r.id), n: P.left });
    steps.push({ k: "arrive", mode: "route", ask, n: P.left, zero: P.zero, traceOk: P.traceOk });
  } else {
    const groups = KINDS.map(([k, t]) => {
      const rows = T.rows.filter((r) => (k === "model" ? r.kind === "model_prefix" || r.kind === "model_norm" : r.kind === k));
      return { t, products: rows.length, ids: [...PM.idsOfParts(rows.map((r) => r.id))] };
    }).filter((g) => g.products);
    steps.push({ k: "text", groups, found: T.found, shown: T.shown, handledOnly: T.handledOnly, capped: T.capped });
    // 품번 글자까지 — 제품 안에서 품번·모델명·메이커에 낱말이 다 든 칸이 있으면 그 칸만(「DML 163」 → DML 제품 23칸 중 163 칸). 없는 제품은 그대로
    const exact = PM.matchText(X.q), all = groups.flatMap((g) => g.ids);
    const per = T.rows.map((r) => { const ids = [...PM.idsOfParts([r.id])]; const hit = ids.filter((id) => exact.has(id)); return hit.length ? hit : ids; }).filter((l) => l.length);
    const keep = per.flat(), keepSet = new Set(keep), out = all.filter((id) => !keepSet.has(id));
    if (out.length) steps.push({ k: "narrow", before: all.length, keep, out, toks: T.tokens });
    // 순번 — 제품 차례대로, 제품마다 지도 칸 하나(남은 칸 중 첫 칸 = 그 제품 판매 1위 품번)
    steps.push({ k: "sort", mode: "text", ids: per.map((l) => l[0]), all: keep, n: T.shown });
    steps.push({ k: "arrive", mode: "text", n: T.shown });
  }
  return steps;
}

const ABORT = Symbol("navAbort");
/** 단계마다 최소한 이만큼은 화면에 머문다(대표 11/16 「단계별로 2초는 나오도록」) */
const MIN_STEP_MS = 2000, TAIL_MS = 500;

/** 길 따라 움직이기. ui = { at(i): 지금 단계 알림, alive(): 이 재생이 아직 살아 있나, fast(): 건너뛰기 }
 *  from·to — from 앞 단계는 움직임 없이 바로 그 상태로 만들고, from~to 단계만 움직여 보인다(이전/다음 버튼 = from=to=그 단계) */
export async function playRoute(PM, steps, ui, from = 0, to = steps.length - 1) {
  let inst = false;   // from 앞 단계를 순간 재생하는 중
  const fast = () => inst || ui.fast();
  // 이전/다음을 눌러 새 재생이 시작되면 옛 재생은 기다림이 끝나는 자리에서 멈춘다(지도를 건드리지 않게)
  const live = () => { if (!ui.alive()) throw ABORT; };
  const wait = (ms) => new Promise((r) => setTimeout(r, fast() ? 0 : ms)).then(live);
  const fly = (target, o) => PM.navFly(target, o).then(live);
  const T = (ms) => (fast() ? 1 : ms);
  const last = steps.length - 1;
  const ctl = (i) => `<div class="hd-ctl"><button type="button" class="hd-btn" data-navgo="${i - 1}"${i <= 0 ? " disabled" : ""}>‹ 이전</button><button type="button" class="hd-btn" data-navgo="${i + 1}"${i >= last ? " disabled" : ""}>다음 ›</button></div>`;
  const hud = (i, title, body = "") => PM.hud(`<div class="hd-k">${i} / ${last}</div><div class="hd-t">${title}</div>${body ? `<div class="hd-b">${body}</div>` : ""}${ctl(i)}`);
  /** 안내 글 속 숫자를 굴린다 */
  const roll = (el, from, to, ms) => {
    const c = el?.querySelector("[data-cnt]"); if (!c) return;
    if (fast() || ms <= 1) { c.textContent = fmt(to); return; }
    const t0 = performance.now();
    const tick = (now) => { const k = (now - t0) / ms; c.textContent = fmt(Math.round(from + (to - from) * ease(k))); if (k < 1 && c.isConnected) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
  let on = new Set();   // 지금 남은(켜진) 품번
  const narrowTo = async () => {
    // 남은 칸이 화면의 30% 아래로 줄었으면 그쪽으로 더 들어간다(길도 이어 긋는다)
    if (!on.size || PM.navShare([...on]) >= 0.3) return;
    await fly([...on], { ms: T(700), pad: 0.14 });
  };

  const STEP = {
    async read(s, i) {
      fly("all", { ms: T(500), spot: false }).catch(() => {});
      for (let j = 1; j <= s.toks.length; j++) {
        hud(i, "검색어 읽기", `<div class="hd-chips">${s.toks.slice(0, j).map(tokenChip).join("")}</div>`);
        await wait(380);
      }
      await wait(350);
    },
    async node(s, i) {
      hud(i, `${s.lvl}로 들어가요`, `<b>${esc(s.name)}</b> · 품번 ${fmt(s.n)}`);
      await fly(s.id, { ms: T(800) });
      await wait(450);
    },
    async start(s, i) {
      const el = hud(i, "출발 품번 켜기", `<b data-cnt>0</b>개 · ${esc(s.label)} 판매 중 품번${s.outN ? ` <span class="hd-d">단종 등 ${fmt(s.outN)}칸 뺌</span>` : ""}${s.n > s.onMap ? ` <span class="hd-d">지도 밖 ${fmt(s.n - s.onMap)}</span>` : ""}`);
      PM.navMark(s.ids, "on", T(450), T(5));
      roll(el, 0, s.n, T(800));
      on = new Set(s.ids);
      PM.navCount(on);
      await wait(1100);
      if (s.multi) {
        // 출발 = 여러 소분류 — 어느 소분류들에서 찾는지 먼저 보여 준다(지도 칸 머리마다 「남음 N」)
        const sp = PM.spreadUnder(s.root, s.ids).filter((x) => x.n);
        hud(i, `${esc(s.label)} 소분류 ${sp.length}개 전부에서 찾아요`, sp.map((x) => `${esc(x.name)} ${fmt(x.n)}`).join(" · "));
        await wait(2400);
      }
      await narrowTo();
    },
    async cond(s, i) {
      const head = `${esc(s.item)} = ${esc(s.said)}${s.added ? ` <span class="hd-tag">고른 값</span>` : ""}`;
      if (s.skipped) {
        hud(i, head, `<span class="hd-d">거르지 않음 — ${s.why === "nocol" ? "이 부품 사양 표에는 이 칸이 없어요(원래 없는 값)" : s.why === "rule" ? "엔진에 이 값을 읽는 규칙이 없어요" : "이 소분류에서 묻는 항목이 아니에요"}</span>`);
        await wait(1300);
        return;
      }
      const el = hud(i, head, `<b data-cnt>${fmt(s.before)}</b>개 남음 <span class="hd-d">값 달라 뺌 ${fmt(s.diff)}</span>${s.off ? ` <span class="hd-d">이 값이 없는 종류 뺌 ${fmt(s.off)}</span>` : ""}${s.none ? ` <span class="hd-d">${s.spec ? `사양 확인 필요 ${fmt(s.none)}(따로 보여 줌)` : `값 없어 뺌 ${fmt(s.none)}`}</span>` : ""}${s.kept ? ` <span class="hd-d">빈칸이지만 남김 ${fmt(s.kept)}</span>` : ""}`);
      PM.navMark(s.out, "diff", T(650), T(4));
      PM.navMark(s.blank, "blank", T(650), T(4));
      for (const id of [...s.out, ...s.blank]) on.delete(id);
      roll(el, s.before, s.ok, T(900));
      PM.navCount(on);
      await wait(1200);
      if (s.ok === 0) { hud(i, head, `<b>0</b>개 — 이 값의 품번이 없어요`); await wait(900); return; }
      // 남은 품번이 어느 소분류에 있나 — 여러 소분류에 걸쳐 찾는 중이면 들어가기 전에 나눠 보여 준다
      const root = steps.find((x) => x.k === "start");
      if (root?.multi) {
        // 0개 목록은 출발 때 품번이 있던 소분류만(악세서리·히터처럼 원래 출발 범위 밖인 칸은 빼고)
        const was = new Set(PM.spreadUnder(root.root, root.ids).filter((x) => x.n).map((x) => x.name));
        const sp = PM.spreadUnder(root.root, [...on]), has = sp.filter((x) => x.n), none = sp.filter((x) => !x.n && was.has(x.name));
        hud(i, head, `<b>${fmt(s.ok)}</b>개 남음 · 남은 소분류 ${has.length}개<br>${has.map((x) => `<b class="hd-s">${esc(x.name)} ${fmt(x.n)}</b>`).join(" · ")}${none.length ? `<br><span class="hd-d">${none.map((x) => esc(x.name)).join("·")} — ${esc(s.said)} 0개</span>` : ""}`);
        await wait(2600);
      }
      await narrowTo();
      await wait(250);
    },
    async prune(s, i) {
      const el = hud(i, "관 크기 확인 안 된 품번 빼기", `<b data-cnt>${fmt(s.before)}</b>개 남음 <span class="hd-d">관 크기 값 없어 뺌 ${fmt(s.ids.length)}</span>`);
      PM.navMark(s.ids, "blank", T(650), T(4));
      for (const id of s.ids) on.delete(id);
      PM.navCount(on);
      roll(el, s.before, s.after, T(900));
      await wait(1200);
      await narrowTo();
    },
    async text(s, i) {
      await fly("all", { ms: T(600) });
      if (!s.groups.length) { hud(i, "글자로 찾기", "글자가 맞은 제품이 없어요"); await wait(1200); return; }
      let n = 0;
      for (const g of s.groups) {
        n += g.products;
        hud(i, "글자로 찾기", `<b>${esc(g.t)}</b> · 제품 ${fmt(g.products)} · 지도 칸 ${fmt(g.ids.length)}<br><span class="hd-d">지금까지 제품 ${fmt(n)}</span>`);
        PM.navMark(g.ids, "on", T(450), T(8));
        g.ids.forEach((id) => on.add(id));
        await wait(1100);
      }
      await narrowTo();
    },
    async narrow(s, i) {
      const el = hud(i, "품번 글자까지 맞는 칸만", `<b data-cnt>${fmt(s.before)}</b>칸 남음 <span class="hd-d">품번·모델명에 ${s.toks.map((t) => `「${esc(t)}」`).join("")}이 다 든 칸</span>`);
      PM.navMark(s.out, "diff", T(650), T(6));
      for (const id of s.out) on.delete(id);
      roll(el, s.before, s.keep.length, T(900));
      await wait(1200);
      await narrowTo();
    },
    async sort(s, i) {
      const top = s.ids.slice(0, 30);
      hud(i, s.mode === "route" ? "매출순으로 줄 세우기" : "검색 순서대로 줄 세우기",
        (s.mode === "route" ? "1번이 가장 많이 팔린 품번 · 빈칸 항목이 있는 품번은 뒤로" : "품번 일치 → 검색어 속 메이커 → 매출 실적 → 맞힌 낱말 수 → 매출순")
        + (s.mode === "route" && on.size > top.length ? `<br>지도 숫자는 앞 ${top.length}개(오른쪽 목록과 같은 차례) · 켜진 칸은 남은 ${fmt(on.size)}개 전부예요` : ""));
      // 도착 = 남은 품번 전부를 똑같이 켠다(대표 11/16 「팽창변만 말했는데 왜 세 줄만」 — 서버 목록 앞 300개·순번 30개만 비춰 일부만 남은 것처럼 보였다)
      const fin = s.mode === "route" ? [...on] : s.all;
      PM.navMark(fin, "fin", T(450), T(6));
      PM.navBadges(top);
      await wait(500);
      // 도착 화면 — 분류 길은 순번 단 앞 30칸, 글자 길은 남은 칸 전부가 보이게
      const view = fin.length ? fin : top;
      if (view.length) await fly(view, { ms: T(700), pad: 0.14 });
      await wait(500);
    },
    async arrive(s, i) {
      if (s.ask) {
        // 아직 많이 남음 — 남은 칸 전부를 비추고 멈춘다(순번 없음). 오른쪽 상담 칸이 되묻는다
        hud(i, "되묻기", `<b>${fmt(s.n)}</b>개 남음 · ${fmt(5)}개 이하가 될 때까지 오른쪽에서 되물어요`);
        if (on.size) await fly([...on], { ms: T(700), pad: 0.14 });
        PM.navEnd();
        return;
      }
      hud(i, "도착", s.mode === "route"
        ? (s.n ? `<b>${fmt(s.n)}</b>개 · 오른쪽 목록이 지도 순번과 같은 차례예요` : `<b>0</b>개 — 조건에 맞는 품번이 없어요`)
        : `제품 <b>${fmt(s.n)}</b>개 · 오른쪽 목록이 지도 순번과 같은 차례예요`);
      PM.navEnd();
    },
  };

  PM.navStart();
  try {
    for (let i = 0; i <= to; i++) {
      live();
      inst = i < from;
      if (!inst) ui.at(i);
      const t0 = performance.now();
      await STEP[steps[i].k](steps[i], i);
      live();
      // 단계마다 최소 2초 — 움직임이 끝난 뒤에도 잠깐(0.5초)은 그 모습에 머문다. 마지막으로 보일 단계(to)는 그대로 둔다
      if (!fast() && i < to) await wait(Math.max(TAIL_MS, MIN_STEP_MS - (performance.now() - t0)));
    }
  } catch (e) { if (e === ABORT) return; throw e; }
  inst = false;
  ui.at(to >= last ? steps.length : to);
}

/** 오른쪽 칸 길 안내 줄(지나온 단계 ✓ · 지금 단계 · 남은 단계) */
export function navList(steps, at) {
  const row = (s, i) => {
    const st = i < at ? "done" : i === at ? "now" : "wait";
    let t = "", sub = "";
    switch (s.k) {
      case "read": t = "검색어 읽기"; sub = s.toks.map((x) => `${esc(x.t)}<small>${esc(x.tag)}</small>`).join(" · "); break;
      case "node": t = `${s.lvl} · ${esc(s.name)}`; sub = `품번 ${fmt(s.n)}`; break;
      case "start": t = s.multi ? "출발 품번 — 소분류 여럿" : "출발 품번"; sub = `${fmt(s.n)}개${s.outN ? ` · 단종 등 ${fmt(s.outN)}칸 뺌` : ""}${s.n > s.onMap ? ` · 지도 밖 ${fmt(s.n - s.onMap)}` : ""}`; break;
      case "cond": t = `${esc(s.item)} = ${esc(s.said)}${s.added ? ` <span class="nv-tag">고른 값</span>` : ""}`;
        sub = s.skipped ? `거르지 않음 — ${s.why === "rule" ? "읽는 규칙 없음" : "이 소분류 항목 아님"}` : `${fmt(s.before)} → <b>${fmt(s.ok)}</b> · 값 다름 ${fmt(s.diff)}${s.none ? ` · <span class="w">빈칸 ${fmt(s.none)}</span>` : ""}${s.kept ? ` · 빈칸이지만 남김 ${fmt(s.kept)}` : ""}`; break;
      case "prune": t = "관 크기 확인 안 된 품번 빼기"; sub = `${fmt(s.before)} → <b>${fmt(s.after)}</b>`; break;
      case "text": t = "글자로 찾기"; sub = `제품 ${fmt(s.shown)}${s.found > s.shown ? ` (걸린 ${fmt(s.found)}${s.capped ? "+" : ""} 중 앞 ${fmt(s.shown)})` : ""}${s.handledOnly ? " · 취급 제품만" : ""}`; break;
      case "narrow": t = "품번 글자까지 맞는 칸만"; sub = `${fmt(s.before)} → <b>${fmt(s.keep.length)}</b>칸`; break;
      case "sort": t = s.mode === "route" ? "매출순 줄 세우기" : "검색 순서 줄 세우기"; sub = s.mode === "route" ? "빈칸 항목 적은 순 → 매출순" : "품번 일치 → 메이커 → 매출 실적 → 낱말 수"; break;
      case "arrive": t = s.ask ? "되묻기" : "도착"; sub = `${s.mode === "text" ? "제품 " : ""}${fmt(s.n)}개`; break;
    }
    return `<li class="nv-i ${st}"><span class="nv-dot"></span><div class="nv-m"><div class="nv-t">${t}</div>${sub ? `<div class="nv-s">${sub}</div>` : ""}</div></li>`;
  };
  return `<ol class="nv-list">${steps.map(row).join("")}</ol>`;
}
