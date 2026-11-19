// 설계 3D — 부하계산·압축기·유니트·유닛쿨러·팽창변을 한 장면에(대표 11/19 「하나의 탭으로 통일 · 3D 로 직관적으로」).
// 숫자는 전부 app.js 가 넘기는 계산 결과(S.result). 거리·높이차는 unit.in.distM·unitPos·liftM(그림에만 씀) — 비면 «예시» 값.
// 좌표: m, y 위, +x 동, −z 북. 창고 바깥 모서리 (0,0,0)~(가로, 높이, 세로). 문 = 남쪽(z=세로), 유니트 = 서쪽(x<0).
import * as THREE from "three";
import { OrbitControls } from "./vendor/three/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "./vendor/three/CSS2DRenderer.js";
import { RoundedBoxGeometry } from "./vendor/three/RoundedBoxGeometry.js";
import { RoomEnvironment } from "./vendor/three/RoomEnvironment.js";

const fmt = (n, d = 0) => (n == null || !Number.isFinite(Number(n)) ? "-" : Number(n).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const won = (n) => (n == null ? "가격 문의" : `${fmt(n)}원`);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const FLOW = { dis: 0xF04452, liq: 0xF57800, low: 0x3182F6, oil: 0x8A6A10, water: 0x18A5A5 };
const STEP_NM = { load: "부하계산", comp: "압축기", unit: "유니트", cooler: "유닛쿨러", txv: "팽창변" };

const CSS = `
.d3 { position: relative; width: 100%; height: 100%; min-height: 420px; overflow: hidden; border-radius: 16px; background: linear-gradient(#F7F9FB, #E9EDF1); user-select: none; }
.d3 canvas { display: block; outline: none; }
.d3 .d3-lab { position: absolute; inset: 0; pointer-events: none; }
.d3 .d3-ov { position: absolute; top: 12px; right: 12px; display: flex; gap: 8px; z-index: 4; flex-wrap: wrap; justify-content: flex-end; }
.d3 .d3-ov button { border: 1px solid #E5E8EB; background: rgba(255,255,255,.95); min-height: 40px; padding: 0 12px; border-radius: 10px; font: inherit; font-size: 14px; color: #4E5968; cursor: pointer; }
.d3 .d3-ov button.on { color: #191F28; font-weight: 600; border-color: #191F28; }
.d3 .d3-ov button:hover { background: #F2F4F6; }
.d3 .d3-leg { position: absolute; left: 12px; bottom: 12px; display: flex; gap: 12px; flex-wrap: wrap; background: rgba(255,255,255,.94); border: 1px solid #E5E8EB; border-radius: 10px; padding: 8px 12px; font-size: 13px; color: #4E5968; z-index: 4; max-width: calc(100% - 24px); }
.d3 .d3-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; vertical-align: -1px; margin-right: 5px; }
.d3 .d3-leg i.bar { width: 16px; height: 5px; border-radius: 3px; vertical-align: 2px; }
.d3 .d3-hint { position: absolute; right: 12px; bottom: 12px; font-size: 12px; color: #8B95A1; background: rgba(255,255,255,.9); padding: 6px 10px; border-radius: 8px; z-index: 4; }
.d3 .d3-tip { position: absolute; z-index: 9; pointer-events: none; display: none; min-width: 220px; max-width: 300px; background: #fff; border: 1px solid #E5E8EB; border-radius: 14px; box-shadow: 0 8px 24px rgba(0,23,51,.14); padding: 12px 14px; }
.d3 .d3-tip .k { font-size: 12px; color: #8B95A1; }
.d3 .d3-tip .t { font-size: 16px; font-weight: 700; margin-top: 2px; line-height: 22px; color: #191F28; }
.d3 .d3-tip .r { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; line-height: 19px; margin-top: 4px; color: #4E5968; }
.d3 .d3-tip .r b { color: #191F28; font-weight: 600; text-align: right; }
.d3 .d3-tip .pr { margin-top: 8px; padding-top: 8px; border-top: 1px solid #E5E8EB; font-size: 15px; font-weight: 700; color: #191F28; text-align: right; }
.d3 .d3-tip .go { margin-top: 8px; font-size: 12px; color: #3182F6; }
.d3 .d3-tip .ft { margin-top: 6px; font-size: 12px; color: #8B95A1; line-height: 17px; }
.l3 { display: flex; flex-direction: column; align-items: center; pointer-events: none; transition: opacity .15s; }
.l3.cull { opacity: 0; }
.l3.cull .lb { pointer-events: none; }
.l3 .lb { pointer-events: auto; cursor: pointer; background: #fff; border: 1px solid #E5E8EB; border-radius: 10px; padding: 4px 9px; box-shadow: 0 2px 8px rgba(0,23,51,.10); white-space: nowrap; line-height: 17px; text-align: center; font-size: 13px; }
.l3 .lb:hover { border-color: #3182F6; box-shadow: 0 2px 10px rgba(49,130,246,.25); }
.l3 .lb b { display: block; font-weight: 700; color: #191F28; }
.l3 .lb span { display: block; font-size: 12px; color: #4E5968; }
.l3 .lb.dark { background: #191F28; border-color: #191F28; } .l3 .lb.dark b { color: #fff; font-size: 14px; } .l3 .lb.dark span { color: #D1D6DB; }
.l3 .lb.ex { background: #FFF3E0; border-color: #FFD8A8; } .l3 .lb.ex b { color: #A84B00; } .l3 .lb.ex span { color: #A84B00; }
.l3 .lb.heat b { color: #C62833; }
.l3 .lb.ghost { background: #F2F4F6; border-style: dashed; } .l3 .lb.ghost b { color: #4E5968; }
.l3 .stem { width: 1.5px; background: #8B95A1; }
.l3 .dot { width: 7px; height: 7px; border-radius: 50%; background: #191F28; border: 1.5px solid #fff; margin-top: -1px; }
`;

export function createDesign3D(cb = {}) {
  if (!document.getElementById("d3-css")) { const st = document.createElement("style"); st.id = "d3-css"; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement("div"); el.className = "d3";
  el.innerHTML = `<div class="d3-lab"></div>
    <div class="d3-ov"><button type="button" data-d3="all">전체 보기</button><button type="button" data-d3="color">실물 색으로 보기</button><button type="button" data-d3="flow" class="on">냉매 흐름</button></div>
    <div class="d3-leg"></div><div class="d3-hint">끌어서 돌리기 · 휠로 확대 · 부품·이름표를 누르면 그 단계로</div><div class="d3-tip"></div>`;
  const labEl = el.querySelector(".d3-lab"), tip = el.querySelector(".d3-tip"), leg = el.querySelector(".d3-leg");

  // ── 렌더러·장면 ──
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  el.prepend(renderer.domElement);
  const labelR = new CSS2DRenderer({ element: labEl });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xEEF1F4);
  scene.fog = new THREE.Fog(0xEEF1F4, 50, 130);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.03, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  // 마우스와 화면이 같이 움직이게(대표 11/19 「속도가 달라 어지럽다」) — 관성(감속 미끄러짐) 끔: 손을 멈추면 화면도 바로 멈춘다.
  //   돌리기: 화면 높이만큼 끌면 반 바퀴(기본은 한 바퀴라 빨랐다) · 확대: 마우스가 가리킨 곳 쪽으로, 한 칸에 조금씩 · 옮기기: 잡은 점이 커서를 따라감
  controls.enableDamping = false; controls.rotateSpeed = 0.5; controls.zoomSpeed = 1.6; controls.zoomToCursor = true; controls.panSpeed = 1; controls.screenSpacePanning = true; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 0.4; controls.maxDistance = 90;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xB8C0CA, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);
  // 땅
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), std(0xE4E7EB, { r: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const grid = new THREE.GridHelper(240, 240, 0xD6DBE0, 0xDDE1E6); grid.position.y = 0.003; grid.material.transparent = true; grid.material.opacity = 0.6; scene.add(grid);

  // ── 재질 ──
  function std(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.7, metalness: o.m ?? 0.05, transparent: o.op != null, opacity: o.op ?? 1, side: o.side ?? THREE.FrontSide, map: o.map ?? null, emissive: o.em ?? 0, emissiveIntensity: o.ei ?? 0, depthWrite: o.op == null || o.op > 0.5 }); }
  const tex = (draw, w = 256, h = 256) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const finTex = tex((g, w, h) => { g.fillStyle = "#B9C1CA"; g.fillRect(0, 0, w, h); g.fillStyle = "#8F99A5"; for (let i = 0; i < w; i += 4) g.fillRect(i, 0, 1.6, h); g.fillStyle = "rgba(199,123,74,.55)"; for (let j = 18; j < h; j += 32) g.fillRect(0, j, w, 3); });
  const panelTex = tex((g, w, h) => { g.fillStyle = "#FAFBFC"; g.fillRect(0, 0, w, h); g.fillStyle = "#DDE1E6"; g.fillRect(0, 0, 2, h); g.fillStyle = "rgba(0,0,0,.025)"; for (let i = 12; i < w; i += 24) g.fillRect(i, 0, 1, h); }, 128, 16);
  const boxTex = tex((g, w, h) => { g.fillStyle = "#D9C4A0"; g.fillRect(0, 0, w, h); g.fillStyle = "#C8B08A"; g.fillRect(0, h * 0.46, w, h * 0.08); g.fillStyle = "rgba(0,0,0,.08)"; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h); }, 128, 128);
  const dialTex = tex((g, w) => { g.fillStyle = "#fff"; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2); g.fill(); g.strokeStyle = "#191F28"; g.lineWidth = 3; for (let i = 0; i <= 10; i++) { const a = Math.PI * (0.75 + i * 0.15); g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * w * 0.36, w / 2 + Math.sin(a) * w * 0.36); g.lineTo(w / 2 + Math.cos(a) * w * 0.44, w / 2 + Math.sin(a) * w * 0.44); g.stroke(); } g.strokeStyle = "#F04452"; g.lineWidth = 5; g.beginPath(); g.moveTo(w / 2, w / 2); g.lineTo(w / 2 + w * 0.3, w / 2 - w * 0.12); g.stroke(); }, 128, 128);
  const M = {
    floorIn: std(0xD7DEE6, { r: 0.85 }), trim: std(0xC9CED6, { r: 0.35, m: 0.7 }), concrete: std(0xCDD2D8, { r: 0.95 }), building: std(0xDCE0E5, { r: 0.9 }),
    frame: std(0x3A4350, { r: 0.5, m: 0.55 }), casing: std(0xEEF0F2, { r: 0.42, m: 0.3 }), machine: std(0x5D6B79, { r: 0.4, m: 0.55 }), head: std(0x48535F, { r: 0.45, m: 0.6 }),
    vessel: std(0x6B7684, { r: 0.4, m: 0.45 }), copper: std(0xC27A4C, { r: 0.3, m: 0.9 }), brass: std(0xC9A227, { r: 0.28, m: 0.85 }), steel: std(0xAEB6BF, { r: 0.3, m: 0.85 }),
    insul: std(0x1C2127, { r: 0.92, m: 0 }), black: std(0x16191D, { r: 0.55, m: 0.2 }), guard: std(0x2B3138, { r: 0.4, m: 0.6 }), blade: std(0x3D4752, { r: 0.5, m: 0.3, side: THREE.DoubleSide }),
    fin: std(0xffffff, { map: finTex, r: 0.45, m: 0.5 }), dial: std(0xffffff, { map: dialTex, r: 0.4 }), glass: std(0xBFE3FF, { em: 0x3182F6, ei: 0.35, r: 0.1, m: 0.2 }),
    pallet: std(0xA9875A, { r: 1 }), box: std(0xffffff, { map: boxTex, r: 0.95 }), red: std(0xF04452, { r: 0.4 }), water: std(0x18A5A5, { r: 0.35, m: 0.5 }),
    person: std(0x3182F6, { r: 0.8 }), skin: std(0xF2C9A0, { r: 0.8 }), lamp: std(0xffffff, { em: 0xffffff, ei: 0.9 }), ghost: std(0xB0B8C1, { op: 0.28, r: 0.6 }),
  };
  const pipeMat = { dis: [M.copper, std(FLOW.dis, { r: 0.4, m: 0.3 })], liq: [M.copper, std(FLOW.liq, { r: 0.4, m: 0.3 })], low: [M.insul, std(FLOW.low, { r: 0.4, m: 0.3 })], oil: [M.copper, std(FLOW.oil, { r: 0.4, m: 0.3 })], water: [M.steel, std(FLOW.water, { r: 0.4, m: 0.3 })], lowbare: [M.copper, std(FLOW.low, { r: 0.4, m: 0.3 })] };
  const beadMat = Object.fromEntries(Object.entries(FLOW).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.3 })]));

  // ── 상태 ──
  let world = null, sig = "", tab = "load", mode = "load", R = null, ctx = {};
  let labels = [], picks = [], flows = [], fans = [], walls = [], dims = [], heat = [], airs = [], INFO = new Map(), CAM = {};
  let colorPipes = true, flowOn = true, tween = null, hoverKey = null, cullDirty = true, lastCam = "";
  const hl = new THREE.Box3Helper(new THREE.Box3(), 0x3182F6); hl.visible = false; scene.add(hl);

  // ── 도구 ──
  const sh = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };
  function box(a, b, mat, r = 0) {
    const sx = Math.abs(b[0] - a[0]), sy = Math.abs(b[1] - a[1]), sz = Math.abs(b[2] - a[2]);
    const g = r > 0 ? new RoundedBoxGeometry(sx, sy, sz, 3, Math.min(r, sx / 2.01, sy / 2.01, sz / 2.01)) : new THREE.BoxGeometry(sx, sy, sz);
    const m = new THREE.Mesh(g, mat); m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return sh(m);
  }
  function cyl(r, len, axis, mat, p, seg = 28, r2 = r) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, seg), mat);
    if (axis === "x") m.rotation.z = -Math.PI / 2; else if (axis === "z") m.rotation.x = Math.PI / 2;
    m.position.set(p[0], p[1], p[2]); return sh(m);
  }
  /** 둥근 끝 통(탱크) — axis 방향 길이 len(끝 반구 포함) */
  function capsule(r, len, axis, mat, p) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 8, 24), mat);
    if (axis === "x") m.rotation.z = Math.PI / 2; else if (axis === "z") m.rotation.x = Math.PI / 2;
    m.position.set(p[0], p[1], p[2]); return sh(m);
  }
  function reg(obj, key) { obj.traverse((m) => { if (m.isMesh) { m.userData.key = key; picks.push(m); } }); obj.userData.key = key; return obj; }
  /** 꺾인 곳을 둥글게 굽힌 길(관) — 꼭짓점마다 반지름 rb 로 */
  function bentPath(P, rb) {
    const path = new THREE.CurvePath(); let prev = P[0].clone();
    for (let i = 1; i < P.length; i++) {
      const cur = P[i];
      if (i < P.length - 1) {
        const a = cur.clone().sub(P[i - 1]), b = P[i + 1].clone().sub(cur), la = a.length(), lb = b.length();
        const r = Math.min(rb, la / 2.05, lb / 2.05);
        if (la < 1e-4) continue;
        if (lb < 1e-4 || a.clone().normalize().dot(b.clone().normalize()) > 0.999) { continue; }
        const p1 = cur.clone().sub(a.normalize().multiplyScalar(r)), p2 = cur.clone().add(b.normalize().multiplyScalar(r));
        if (prev.distanceTo(p1) > 1e-4) path.add(new THREE.LineCurve3(prev.clone(), p1));
        path.add(new THREE.QuadraticBezierCurve3(p1, cur.clone(), p2)); prev = p2;
      } else if (prev.distanceTo(cur) > 1e-4) path.add(new THREE.LineCurve3(prev.clone(), cur.clone()));
    }
    return path;
  }
  /** 관 — kind: dis·liq·low·oil·water, 흐름 구슬이 kind 색으로 지나간다 */
  function pipe(points, r, kind, key, { flow = true, speed = 0.55, lowBare = false } = {}) {
    const P = points.map(v3); if (P.length < 2) return { length: 0 };
    const path = bentPath(P, Math.max(r * 3, 0.08)); const L = path.getLength(); if (L < 1e-3) return { length: 0 };
    const mk = lowBare && kind === "low" ? "lowbare" : kind;
    const radius = kind === "low" && !lowBare ? r * 1.35 : r;   // 흡입관 = 검은 보온재(굵게)
    const m = new THREE.Mesh(new THREE.TubeGeometry(path, Math.min(600, Math.max(12, Math.round(L / 0.03))), radius, 14, false), pipeMat[mk][colorPipes ? 1 : 0]);
    m.userData.pipeKind = mk; sh(m); world.add(m);
    for (const e of [P[0], P[P.length - 1]]) { const c = new THREE.Mesh(CAP, m.material); c.scale.setScalar(radius); c.position.copy(e); c.userData.pipeKind = mk; c.castShadow = true; world.add(c); if (key) reg(c, key); }   // 관 끝 막음
    if (key) reg(m, key);
    if (flow) {
      const n = Math.max(2, Math.round(L / 0.42)), beads = [];
      for (let i = 0; i < n; i++) { const b = new THREE.Mesh(BEAD, beadMat[kind]); b.userData.kind = kind; b.scale.setScalar(radius * 1.18); b.raycast = () => {}; world.add(b); beads.push(b); }
      flows.push({ path, beads, L, speed, off: Math.random() });
    }
    return { length: L, mesh: m };
  }
  const BEAD = new THREE.SphereGeometry(1, 12, 8), CAP = new THREE.SphereGeometry(1, 16, 12);
  /** 팬 — 보호망(고리 셋+살) + 돌아가는 날개 4장. normal = 바람 나가는 방향 축(x·z) */
  function fan(center, dia, axis, sign, key) {
    const g = new THREE.Group(), r = dia / 2;
    for (const k of [1, 0.66, 0.33]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r * k, Math.max(0.006, r * 0.025), 8, 48), M.guard); g.add(t); }
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(r * 2, r * 0.035, r * 0.035), M.guard); s.rotation.z = (i * Math.PI) / 4; g.add(s); }
    const rot = new THREE.Group(); rot.position.z = -r * 0.18 * 1;
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.CircleGeometry(r * 0.48, 16, -0.42, 0.84), M.blade); b.position.set(Math.cos((i * Math.PI) / 2) * r * 0.42, Math.sin((i * Math.PI) / 2) * r * 0.42, 0); b.rotation.z = (i * Math.PI) / 2; b.rotation.x = 0.35; rot.add(b); }
    rot.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.13, r * 0.13, r * 0.12, 20).rotateX(Math.PI / 2), M.black));
    g.add(rot); fans.push(rot);
    if (axis === "x") g.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2; else if (sign < 0) g.rotation.y = Math.PI;
    g.position.set(center[0], center[1], center[2]);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    world.add(g); if (key) reg(g, key); return g;
  }
  /** 이름표 — steps: 보일 화면(all = 전체 보기), prio: 겹치면 큰 쪽이 남는다 */
  function label(pos, title, sub, { steps = ["all"], key = null, prio = 1, stem = 22, cls = "", act = null, fixed = false } = {}) {
    const e = document.createElement("div"); e.className = "l3";
    e.innerHTML = `<div class="lb ${cls}"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</div><i class="stem" style="height:${stem}px"></i><i class="dot"></i>`;
    const o = new CSS2DObject(e); o.position.copy(v3(pos)); o.center.set(0.5, 1); Object.assign(o.userData, { steps, prio, key, act, fixed });
    e.querySelector(".lb").addEventListener("click", (ev) => { ev.stopPropagation(); doAct(act ?? (key ? { key } : null)); });
    e.querySelector(".lb").addEventListener("pointerenter", () => setHover(key));
    e.querySelector(".lb").addEventListener("pointerleave", () => setHover(null));
    world.add(o); labels.push(o); return o;
  }
  /** 끌어낸 이름표 — 부품 점(part)에서 가는 선을 이름표 자리(at)까지. 겹침 숨기기에서 빠진다(늘 보임) */
  function callout(part, at, title, { steps, key, below = false }) {
    const e = document.createElement("div"); e.className = "l3";
    e.innerHTML = `<div class="lb"><b>${esc(title)}</b></div>`;
    const o = new CSS2DObject(e); o.position.copy(v3(at)); o.center.set(0.5, below ? 0 : 1); Object.assign(o.userData, { steps, prio: 50, key, fixed: true });
    const lb = e.querySelector(".lb");
    lb.addEventListener("click", (ev) => { ev.stopPropagation(); doAct({ key }); });
    lb.addEventListener("pointerenter", () => setHover(key)); lb.addEventListener("pointerleave", () => setHover(null));
    world.add(o); labels.push(o);
    const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(part), v3(at)]), new THREE.LineBasicMaterial({ color: 0x6B7684 }));
    ln.userData.steps = steps; ln.raycast = () => {}; world.add(ln); dims.push(ln);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), new THREE.MeshBasicMaterial({ color: 0x191F28 })); dot.position.copy(v3(part)); dot.userData.steps = steps; dot.raycast = () => {}; world.add(dot); dims.push(dot);
  }
  function dimLine(a, b, text, sub, steps, act, tick) {
    const A = v3(a), B = v3(b), t = v3(tick);
    const ln = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([A, B, A.clone().sub(t), A.clone().add(t), B.clone().sub(t), B.clone().add(t)]), new THREE.LineBasicMaterial({ color: 0xA84B00 }));
    ln.userData.steps = steps; world.add(ln); dims.push(ln);
    return label(A.clone().add(B).multiplyScalar(0.5).toArray(), text, sub, { steps, cls: "ex", prio: 6, stem: 8, act });
  }
  function dashed(a, b, steps) {
    const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(a), v3(b)]), new THREE.LineDashedMaterial({ color: 0xA84B00, dashSize: 0.16, gapSize: 0.1 }));
    ln.computeLineDistances(); ln.userData.steps = steps; world.add(ln); dims.push(ln);
  }

  // ═════════════════════════ 장면 짓기 ═════════════════════════
  function clearWorld() {
    if (!world) return;
    for (const o of labels) o.element.remove();
    world.traverse((m) => { if (m.geometry && m.geometry !== BEAD && m.geometry !== CAP) m.geometry.dispose(); });
    scene.remove(world);
    labels = []; picks = []; flows = []; fans = []; walls = []; dims = []; heat = []; airs = []; INFO = new Map(); hoverKey = null; hl.visible = false;
  }
  function build() {
    clearWorld(); world = new THREE.Group(); scene.add(world);
    const L = R?.load, Lin = L?.in ?? {}, Lout = L?.out ?? null, ready = !!ctx.loadReady;
    const W = Number(Lin.w) || 5, Dd = Number(Lin.d) || 10, H = Number(Lin.h) || 3.5, T = (Number(Lin.insulMm) || 100) / 1000;
    const UD = R?.unit?.out?.draft ?? null, CO = R?.cooler?.out ?? null, CL = CO?.chosen ?? null, TO = R?.txv?.out ?? null, TX = TO?.chosen ?? null, CP = R?.comp?.out?.chosen ?? null;
    const site = R?.unit?.in ?? {};
    const distM = Number.isFinite(Number(site.distM)) && site.distM != null && site.distM !== "" ? Number(site.distM) : null;
    const liftM = Number.isFinite(Number(site.liftM)) && site.liftM != null && site.liftM !== "" ? Number(site.liftM) : null;
    const above = site.unitPos === "위";
    const BASE_SET = ["R/C 일체", "압축기", "수액기", "액분리기", "유분리기", "오일리턴밸브", "전자변", "사이트글라스", "드라이어(분리식)", "브라켓밸브", "후렉시블(흡입)", "후렉시블(토출)", "콘트롤판넬"];
    const slots = UD?.slots ?? [], slot = (n) => slots.find((s) => s.slot === n) ?? null, has = (n) => (UD ? slots.some((s) => s.slot === n) : BASE_SET.includes(n));
    const unitWhy = UD ? "" : R?.errors?.unit ? "구성 불가" : R?.unit?.out ? "구성 불가" : "구성 전";
    const chilling = has("유니트 칠라") || String(UD?.form ?? "").startsWith("칠링");

    // ── 창고 ──
    sun.position.set(-14, 26, Dd + 10); sun.target.position.set(W / 2 - 2, 0, Dd / 2);
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 }); sun.shadow.camera.updateProjectionMatrix();
    const wallDef = [
      ["북", [0, 0, 0], [W, H, T], [0, 0, -1], W], ["남", [0, 0, Dd - T], [W, H, Dd], [0, 0, 1], W],
      ["서", [0, 0, 0], [T, H, Dd], [-1, 0, 0], Dd], ["동", [W - T, 0, 0], [W, H, Dd], [1, 0, 0], Dd], ["천정", [0, H - T, 0], [W, H, Dd], [0, 1, 0], W],
    ];
    for (const [nm, a, b, n, len] of wallDef) {
      const t = panelTex.clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(len / 1.0)), 1); t.needsUpdate = true;
      const mat = std(0xffffff, { map: t, r: 0.6, m: 0.05, op: 1 }); mat.transparent = true;
      const m = box(a, b, mat); m.material.side = THREE.DoubleSide; world.add(m); reg(m, "z:wall");
      walls.push({ m, n: v3(n), c: m.position.clone(), nm });
    }
    world.add(box([T, 0, T], [W - T, T, Dd - T], M.floorIn)); reg(world.children[world.children.length - 1], "z:wall");
    // 모서리 마감(L 후레싱)
    for (const [a, b] of [[[-0.02, H - 0.05, -0.02], [W + 0.02, H + 0.02, 0.05]], [[-0.02, H - 0.05, Dd - 0.05], [W + 0.02, H + 0.02, Dd + 0.02]], [[-0.02, H - 0.05, -0.02], [0.05, H + 0.02, Dd + 0.02]], [[W - 0.05, H - 0.05, -0.02], [W + 0.02, H + 0.02, Dd + 0.02]],
      [[-0.02, 0, -0.02], [0.05, H, 0.05]], [[W - 0.05, 0, -0.02], [W + 0.02, H, 0.05]], [[-0.02, 0, Dd - 0.05], [0.05, H, Dd + 0.02]], [[W - 0.05, 0, Dd - 0.05], [W + 0.02, H, Dd + 0.02]]]) world.add(box(a, b, M.trim));
    // 문(남쪽) — 판넬 미닫이 문, 손잡이
    const door = new THREE.Group(); world.add(door);
    const dw = Math.min(1.6, W * 0.4), dh = Math.min(2.4, H - 0.4), dx0 = W * 0.62 - dw / 2;
    door.add(box([dx0 - 0.08, 0, Dd], [dx0 + dw + 0.08, dh + 0.08, Dd + 0.06], M.trim));
    door.add(box([dx0, 0.02, Dd + 0.06], [dx0 + dw, dh, Dd + 0.16], M.casing, 0.02));
    door.add(box([dx0 + 0.12, dh * 0.42, Dd + 0.16], [dx0 + 0.18, dh * 0.62, Dd + 0.24], M.black, 0.01));
    door.add(box([dx0 - 0.1, dh + 0.1, Dd], [dx0 + dw * 2 + 0.1, dh + 0.18, Dd + 0.1], M.steel));   // 레일
    reg(door, "z:door");
    // 조명(천정)
    const lamps = new THREE.Group(); world.add(lamps);
    for (let i = 0; i < Math.max(2, Math.round(Dd / 4)); i++) { const z = Dd * (i + 0.6) / (Math.max(2, Math.round(Dd / 4)) + 0.2); lamps.add(box([W / 2 - 0.6, H - T - 0.06, z - 0.07], [W / 2 + 0.6, H - T - 0.01, z + 0.07], M.lamp, 0.02)); }
    reg(lamps, "z:equip");
    // 상품(팔레트) — 앞쪽 바닥
    const goods = new THREE.Group(); world.add(goods);
    const nx = Math.max(1, Math.floor((W - 1.2) / 1.35)), nz = Math.max(1, Math.min(3, Math.floor(Dd / 4)));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      if ((i + j) % 3 === 2) continue;
      const x = 0.9 + i * 1.35 + 0.55, z = Dd - 1.2 - j * 1.4 - (i === Math.floor(nx / 2) ? 1.2 : 0); if (z < Dd * 0.45) continue;
      goods.add(box([x - 0.55, T, z - 0.5], [x + 0.55, T + 0.14, z + 0.5], M.pallet));
      const st = 1 + ((i * 7 + j * 3) % 2);
      for (let k = 0; k < st; k++) goods.add(box([x - 0.5, T + 0.14 + k * 0.62, z - 0.45], [x + 0.5, T + 0.14 + k * 0.62 + 0.6, z + 0.45], M.box, 0.015));
    }
    reg(goods, "z:goods");
    // 작업자
    const person = new THREE.Group(); world.add(person);
    { const px = Math.min(W - 0.7, 1.0), pz = Dd * 0.55, at = (g, m, y) => { const o = new THREE.Mesh(g, m); o.position.set(px, T + y, pz); person.add(sh(o)); };
      at(new THREE.CapsuleGeometry(0.2, 0.75, 6, 16), M.person, 0.58); at(new THREE.SphereGeometry(0.13, 20, 14), M.skin, 1.22); at(new THREE.SphereGeometry(0.14, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.red, 1.26); }
    reg(person, "z:people");

    // ── 유닛쿨러(창고 안, 천장) ──
    const n = Math.max(1, Number(CO?.count) || 1);
    const CLL = CL ? CL.L / 1000 : 1.1, CLW = CL ? CL.W / 1000 : 0.6, CLH = CL ? CL.H / 1000 : 0.55;
    const oneRow = n * (CLL + 0.6) <= W - 2 * T - 0.4;
    const units = [];
    const cy1 = H - T - 0.08, cy0 = cy1 - CLH, cMid = (cy0 + cy1) / 2;
    for (let i = 0; i < n; i++) {
      const cxm = oneRow ? T + 0.3 + (W - 2 * T - 0.6) * (i + 0.5) / n : W / 2;
      const cz0 = oneRow ? T + 0.25 : T + 0.25 + i * Math.max(CLW + 1.2, (Dd - 2) / n);
      units.push({ x0: cxm - CLL / 2, x1: cxm + CLL / 2, z0: cz0, z1: cz0 + CLW });
    }
    const coolerG = new THREE.Group(); world.add(coolerG);
    units.forEach((u, i) => {
      const g = new THREE.Group(); coolerG.add(g);
      if (!CL) { g.add(box([u.x0, cy0, u.z0], [u.x1, cy1, u.z1], M.ghost, 0.03)); reg(g, "cooler"); return; }
      g.add(box([u.x0, cy0 + 0.05, u.z0], [u.x1, cy1, u.z1], M.casing, 0.03));
      // 코일(뒤 = 공기 들어가는 면)
      const coil = new THREE.Mesh(new THREE.PlaneGeometry(CLL * 0.9, CLH * 0.78), M.fin); coil.position.set((u.x0 + u.x1) / 2, cMid + 0.02, u.z0 - 0.004); coil.rotation.y = Math.PI; g.add(coil);
      // 팬(앞 = 문 쪽)
      const nf = CL.fanInfo?.count ?? 1, fd = Math.min((CL.fanInfo?.dia ?? 450) / 1000, CLH * 0.85, CLL / nf * 0.9);
      for (let k = 0; k < nf; k++) fan([u.x0 + CLL * (k + 0.5) / nf, cMid + 0.02, u.z1 + 0.03], fd, "z", 1, "cooler");
      // 물받이·드레인·매달기 봉
      g.add(box([u.x0 - 0.02, cy0, u.z0 - 0.02], [u.x1 + 0.02, cy0 + 0.05, u.z1 + 0.02], M.steel, 0.01));
      for (const [x, z] of [[u.x0 + 0.08, u.z0 + 0.08], [u.x1 - 0.08, u.z0 + 0.08], [u.x0 + 0.08, u.z1 - 0.08], [u.x1 - 0.08, u.z1 - 0.08]]) g.add(cyl(0.008, H - T - cy1, "y", M.steel, [x, (cy1 + H - T) / 2, z], 8));
      reg(g, "cooler");
      pipe([[u.x1 - 0.12, cy0, u.z0 + 0.12], [u.x1 - 0.12, cy0 - 0.25, u.z0 + 0.12], [u.x1 - 0.12, cy0 - 0.25, T + 0.02]], 0.016, "water", "cooler:drain", { flow: false });
    });
    // 찬 바람
    const airGeo = new THREE.ConeGeometry(0.05, 0.18, 14); airGeo.rotateX(Math.PI / 2);
    for (const u of units) for (let i = 0; i < 9; i++) { const a = new THREE.Mesh(airGeo, std(0x5AA0FF, { op: 0.6, em: 0x3182F6, ei: 0.35 })); a.userData = { k: i / 9, dx: ((i * 7) % 5 - 2) * 0.12, dy: (i % 3 - 1) * 0.12, cx: (u.x0 + u.x1) / 2, cy: cMid, z1: u.z1 }; a.raycast = () => {}; world.add(a); airs.push(a); }

    // ── 팽창변 + 분배기 (쿨러마다) ──
    const R_LIQ = 0.026, R_SUC = 0.034, R_DIS = 0.03;
    const txvs = units.map((u) => ({ p: [u.x0 - 0.3, cy0 + 0.18, u.z0 + 0.28], suc: [u.x0, cy1 - 0.2, u.z0 + Math.min(CLW - 0.1, 0.55)] }));
    const Zp = Math.max(...units.map((u) => u.z1)) + 0.45 + (oneRow ? 0 : 0), Zs = Zp + 0.24;   // 벽 관통 자리(z)
    const Hl = H - T - 0.32, Hs = H - T - 0.16;
    txvs.forEach((t, i) => {
      const [x, y, z] = t.p, g = new THREE.Group(); world.add(g); const k = 1.5;
      g.add(box([x - 0.045 * k, y - 0.04 * k, z - 0.035 * k], [x + 0.045 * k, y + 0.04 * k, z + 0.035 * k], M.brass, 0.008));
      g.add(cyl(0.022 * k, 0.05 * k, "x", M.brass, [x + 0.065 * k, y, z], 16));
      g.add(cyl(0.05 * k, 0.03 * k, "y", M.steel, [x, y + 0.07 * k, z], 28));
      g.add(cyl(0.012, 0.03 * k, "y", M.steel, [x, y + 0.1 * k, z], 10));
      reg(g, "txv");
      // 분배기 → 가는 분배관 6개가 코일로
      const u = units[i], dx = u.x0 - 0.1, dg = new THREE.Group(); world.add(dg);
      pipe([[x + 0.1, y, z], [dx, y, z]], R_LIQ * 0.8, "low", "txv:dist", { flow: true, lowBare: true, speed: 0.3 });
      dg.add(cyl(0.012, 0.07, "x", M.copper, [dx + 0.03, y, z], 14, 0.035));
      for (let j = 0; j < 6; j++) { const ty = cy0 + 0.12 + (CLH - 0.24) * j / 5, tz = u.z0 + 0.1 + (CLW - 0.2) * ((j * 3) % 6) / 5;
        const c = new THREE.CatmullRomCurve3([v3([dx + 0.06, y, z]), v3([dx + 0.06, (y + ty) / 2, (z + tz) / 2]), v3([u.x0 - 0.01, ty, tz])]);
        dg.add(sh(new THREE.Mesh(new THREE.TubeGeometry(c, 24, 0.005, 6), M.copper), false)); }
      reg(dg, "txv:dist");
      // 감온통 + 모세관, 균압관
      const sx = t.suc[0] - 0.14, bulb = [sx, Hs - R_SUC * 1.35 - 0.014, t.suc[2] + 0.35];
      const bg = new THREE.Group(); world.add(bg); bg.add(cyl(0.011, 0.12, "z", M.steel, bulb, 12));
      bg.add(box([bulb[0] - 0.03, bulb[1] - 0.004, bulb[2] - 0.045], [bulb[0] + 0.03, bulb[1] + 0.05, bulb[2] - 0.035], M.steel), box([bulb[0] - 0.03, bulb[1] - 0.004, bulb[2] + 0.035], [bulb[0] + 0.03, bulb[1] + 0.05, bulb[2] + 0.045], M.steel));
      bg.add(sh(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v3([x, y + 0.17, z]), v3([x - 0.05, y + 0.32, z + 0.05]), v3([x - 0.12, y + 0.36, z - 0.06]), v3([x - 0.02, Hs - 0.25, (z + bulb[2]) / 2]), v3([bulb[0], bulb[1] - 0.01, bulb[2] - 0.06])]), 60, 0.0035, 6), M.steel), false));
      bg.add(sh(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v3([x - 0.04, y - 0.05, z]), v3([x - 0.1, y - 0.02, z + 0.12]), v3([sx, Hs - 0.3, bulb[2] + 0.18]), v3([sx, Hs - R_SUC * 1.3, bulb[2] + 0.2])]), 50, 0.004, 6), M.copper), false));
      reg(bg, "txv:bulb");
      t.bulb = bulb;
    });

    // ── 유니트(건물 밖) ──
    const coolerAbove = cMid;
    const dist = distM ?? 4.0;
    let uy = 0;
    if (liftM != null) uy = above ? coolerAbove + liftM : Math.max(0, coolerAbove - liftM);
    else if (above) uy = H + 0.6;
    const liftShown = liftM ?? Math.abs(coolerAbove - uy);
    const UW = 1.1, UL = chilling ? 3.9 : 2.95, ux0 = -dist - UW, uz0 = Zp - 2.52;
    const U = (lx, y, lz) => [ux0 + lx, uy + y, uz0 + lz];
    const unitG = new THREE.Group(); world.add(unitG);
    if (uy > 0.05) {   // 받침·건물
      // 옥상이면 이웃 건물(넉넉한 바닥 + 난간), 땅이면 받침대
      const big = above || uy > 1.5, bx0 = big ? ux0 - 2.2 : ux0 - 0.4, bx1 = big ? Math.min(-0.6, ux0 + UW + 1.2) : ux0 + UW + 0.4, bz0 = big ? uz0 - 1.6 : uz0 - 0.5, bz1 = big ? uz0 + UL + 1.6 : uz0 + UL + 0.5;
      const bg = new THREE.Group(); world.add(bg);
      bg.add(box([bx0, 0, bz0], [bx1, uy, bz1], M.building, 0.02));
      if (big) for (const [a, b] of [[[bx0, uy, bz0], [bx1, uy + 0.35, bz0 + 0.12]], [[bx0, uy, bz1 - 0.12], [bx1, uy + 0.35, bz1]], [[bx0, uy, bz0], [bx0 + 0.12, uy + 0.35, bz1]], [[bx1 - 0.12, uy, bz0], [bx1, uy + 0.35, bz1]]]) bg.add(box(a, b, M.concrete));
      reg(bg, "site:lift");
      label([ux0 - 0.5, uy * 0.5, uz0 + UL / 2], above ? "건물 옥상" : "받침대", `높이 ${fmt(uy, 1)}m`, { steps: ["all"], prio: 2, stem: 6, cls: "ghost", act: { field: "liftM" } });
    }
    world.add(box([ux0 - 0.25, uy, uz0 - 0.25], U(UW + 0.25, 0.08, UL + 0.25), M.concrete));
    for (const lx of [0.05, UW - 0.13]) unitG.add(box(U(lx, 0.08, 0), U(lx + 0.08, 0.2, UL), M.frame));
    unitG.add(box(U(0.05, 0.16, 0.05), U(UW - 0.05, 0.2, UL - 0.05), M.frame));
    // 응축기
    const condG = new THREE.Group(); unitG.add(condG);
    let condKey = "slot:응축기";
    if (has("R/C 일체")) {
      condKey = "slot:R/C 일체";
      condG.add(box(U(0, 0.2, 0), U(UW, 1.6, 1.05), M.casing, 0.03));
      const fin = new THREE.Mesh(new THREE.PlaneGeometry(UW - 0.12, 1.25), M.fin); fin.position.set(...U(UW / 2, 0.92, -0.004)); fin.rotation.y = Math.PI; condG.add(fin);
      fan(U(-0.01, 0.92, 0.52), 0.78, "x", -1, condKey);
    } else if (has("유니트 응축기")) {
      condKey = "slot:유니트 응축기";
      condG.add(capsule(0.2, 1.0, "z", M.vessel, U(0.55, 0.55, 0.52)));
      for (const lz of [0.08, 0.96]) condG.add(cyl(0.24, 0.05, "z", M.machine, U(0.55, 0.55, lz), 28));
      for (const lz of [0.25, 0.8]) { condG.add(cyl(0.035, 0.32, "y", M.water, U(0.55, 0.9, lz), 14)); }
      for (const lz of [0.25, 0.8]) condG.add(box(U(0.38, 0.2, lz - 0.08), U(0.72, 0.38, lz + 0.08), M.frame));
    } else {
      condG.add(box(U(0, 0.2, 0), U(UW, 1.6, 1.05), M.ghost, 0.03));
    }
    reg(condG, condKey);
    // 프레샤·게이지 판(응축기 남쪽 면)
    const pg = new THREE.Group(); unitG.add(pg);
    pg.add(box(U(0.06, 1.0, 1.05), U(0.66, 1.5, 1.07), M.casing, 0.01));
    [0.17, 0.36, 0.55].forEach((lx, i) => { pg.add(box(U(lx - 0.06, 1.26, 1.07), U(lx + 0.06, 1.44, 1.13), i === 0 ? M.machine : M.head, 0.01)); const d = new THREE.Mesh(new THREE.CircleGeometry(0.045, 32), M.dial); d.position.set(...U(lx, 1.12, 1.101)); pg.add(d); pg.add(cyl(0.05, 0.03, "z", M.black, U(lx, 1.12, 1.085), 28)); });
    reg(pg, "pg");
    // 압축기(반밀폐) — 모터(갈비) + 크랭크 + 헤드(냉각 핀) + 단자함 + 밸브
    const cg = new THREE.Group(); unitG.add(cg);
    cg.add(box(U(0.18, 0.2, 1.22), U(0.62, 0.62, 1.68), M.machine, 0.05));
    cg.add(cyl(0.19, 0.5, "z", M.machine, U(0.4, 0.42, 1.93), 36));
    for (let j = 0; j < 6; j++) cg.add(cyl(0.2, 0.018, "z", M.head, U(0.4, 0.42, 1.73 + j * 0.08), 36));
    cg.add(capsule(0.12, 0.24, "z", M.machine, U(0.4, 0.42, 2.17)));
    cg.add(box(U(0.27, 0.6, 1.88), U(0.53, 0.72, 2.08), M.black, 0.02));                     // 단자함
    for (const lz of [1.33, 1.57]) { cg.add(box(U(0.22, 0.62, lz - 0.09), U(0.58, 0.68, lz + 0.09), M.head, 0.02)); for (let j = 0; j < 4; j++) cg.add(box(U(0.21, 0.69 + j * 0.022, lz - 0.085), U(0.59, 0.7 + j * 0.022, lz + 0.085), M.head)); }
    cg.add(cyl(0.035, 0.012, "x", M.glass, U(0.625, 0.3, 1.45), 20));
    for (const lz of [1.3, 1.6]) cg.add(box(U(0.2, 0.2, lz - 0.05), U(0.6, 0.24, lz + 0.05), M.frame));
    reg(cg, "slot:압축기");
    // 수액기
    if (has("수액기") || has("유니트 수액기")) { const big = has("유니트 수액기"); const g = new THREE.Group(); unitG.add(g); g.add(capsule(big ? 0.15 : 0.11, big ? 0.95 : 0.75, "z", M.vessel, U(0.85, 0.36, 1.55))); for (const lz of [1.28, 1.82]) g.add(box(U(0.75, 0.2, lz - 0.03), U(0.95, 0.26, lz + 0.03), M.frame)); g.add(cyl(0.02, 0.06, "y", M.brass, U(0.85, (big ? 0.15 : 0.11) + 0.4, 1.85), 12)); reg(g, big ? "slot:유니트 수액기" : "slot:수액기"); }
    // 유분리기·액분리기
    if (has("유분리기")) { const g = new THREE.Group(); unitG.add(g); g.add(capsule(0.075, 0.55, "y", M.vessel, U(0.86, 0.5, 2.62))); reg(g, "slot:유분리기"); }
    if (has("액분리기")) { const g = new THREE.Group(); unitG.add(g); g.add(capsule(0.1, 0.62, "y", M.vessel, U(0.3, 0.52, 2.52))); reg(g, "slot:액분리기"); }
    // 액관 부품 줄(y .86, lx .92)
    const LY = 0.86, LX = 0.92;
    const sub = (key, objs) => { const g = new THREE.Group(); unitG.add(g); for (const o of objs) g.add(o); reg(g, key); };
    if (has("브라켓밸브")) sub("slot:브라켓밸브", [box(U(LX - 0.04, LY - 0.05, 1.95), U(LX + 0.04, LY + 0.06, 2.03), M.brass, 0.01), cyl(0.012, 0.06, "y", M.steel, U(LX, LY + 0.09, 1.99), 10), cyl(0.03, 0.012, "y", M.red, U(LX, LY + 0.12, 1.99), 16)]);
    const drN = has("드라이어") ? "드라이어" : has("드라이어(분리식)") ? "드라이어(분리식)" : null;
    if (drN) sub(`slot:${drN}`, [cyl(0.06, 0.24, "z", std(0x2E4C7A, { r: 0.4, m: 0.5 }), U(LX, LY, 2.17), 24), cyl(0.07, 0.02, "z", M.steel, U(LX, LY, 2.29), 24)]);
    if (has("사이트글라스")) sub("slot:사이트글라스", [cyl(0.03, 0.05, "z", M.brass, U(LX, LY, 2.36), 18), cyl(0.02, 0.012, "x", M.glass, U(LX - 0.032, LY, 2.36), 18)]);
    if (has("전자변")) sub("slot:전자변", [box(U(LX - 0.03, LY - 0.03, 2.42), U(LX + 0.03, LY + 0.03, 2.5), M.brass, 0.008), box(U(LX - 0.035, LY + 0.03, 2.425), U(LX + 0.035, LY + 0.11, 2.495), M.black, 0.01)]);
    // 칠러(칠링)·중간냉각기(2단, 세트 외)
    if (has("유니트 칠라")) { const g = new THREE.Group(); unitG.add(g); g.add(capsule(0.17, 0.85, "z", M.vessel, U(0.55, 0.42, 3.4))); for (const lz of [3.15, 3.65]) g.add(cyl(0.035, 0.3, "y", M.water, U(0.55, 0.72, lz), 14)); reg(g, "slot:유니트 칠라"); }
    if (has("팽창변+TC")) sub("slot:팽창변+TC", [box(U(0.85, 0.58, 2.92), U(0.95, 0.66, 3.0), M.brass, 0.01), cyl(0.035, 0.03, "y", M.steel, U(0.9, 0.69, 2.96), 20)]);
    if (UD?.stage === "2단") { const g = new THREE.Group(); unitG.add(g); g.add(capsule(0.11, 0.6, "y", M.ghost, U(0.6, 0.5, UL - 0.15))); reg(g, "ghost:중간냉각기"); }
    // 콘트롤판넬(따로) — 창고 서쪽 바깥벽
    const cpg = new THREE.Group(); world.add(cpg);
    cpg.add(box([-0.26, 1.05, Zs + 1.1], [-0.02, 1.95, Zs + 1.75], M.casing, 0.02));
    for (const [c, z] of [[0x2FA84F, 1.25], [0xF04452, 1.38], [0xF57800, 1.51]]) cpg.add(cyl(0.025, 0.02, "x", std(c, { em: c, ei: 0.5 }), [-0.27, 1.82, Zs + z], 16));
    cpg.add(box([-0.28, 1.1, Zs + 1.6], [-0.26, 1.5, Zs + 1.64], M.black));
    reg(cpg, "slot:콘트롤판넬");

    // ── 유니트 안 배관 ──
    const disTo = has("R/C 일체") ? U(0.8, 1.3, 1.05) : has("유니트 응축기") ? U(0.55, 0.78, 1.0) : U(0.8, 1.3, 1.05);
    pipe([U(0.4, 0.73, 1.45), U(0.4, 1.12, 1.45), U(0.4, 1.12, 2.62), U(0.92, 1.12, 2.62), U(0.92, 0.82, 2.62)], R_DIS, "dis", "pipe:dis");
    pipe([U(0.8, 0.82, 2.62), U(0.8, 1.3, 2.62), disTo], R_DIS, "dis", "pipe:dis");
    pipe([U(0.85, 0.25, 1.05), U(0.85, 0.25, 1.15)], R_LIQ, "liq", null, { flow: false });
    pipe([U(0.85, 0.36, 1.95), U(LX, 0.36, 1.92), U(LX, LY, 1.92), U(LX, LY, 2.52), U(UW + 0.02, LY, 2.52)], R_LIQ, "liq", "pipe:liq");
    pipe([U(0.3, 0.96, 2.78), U(0.3, 0.84, 2.52)], R_SUC, "low", null, { flow: false });
    pipe([U(0.22, 0.84, 2.48), U(0.22, 1.0, 2.48), U(0.22, 1.0, 2.25), U(0.4, 1.0, 2.25), U(0.4, 0.62, 2.12)], R_SUC, "low", "pipe:suc");
    pipe([U(0.86, 0.24, 2.62), U(0.68, 0.24, 2.7), U(0.68, 0.24, 1.45), U(0.62, 0.28, 1.45)], 0.011, "oil", "slot:오일리턴밸브", { speed: 0.25 });
    if (has("오일리턴밸브")) sub("slot:오일리턴밸브", [box(U(0.65, 0.2, 2.0), U(0.71, 0.28, 2.08), M.brass, 0.008)]);
    const flex = (a, b, r, key) => { const A = v3(a), B = v3(b), g = new THREE.Group(); for (let i = 0; i <= 10; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(r * 1.2, r * 0.3, 8, 20), M.steel); t.position.copy(A.clone().lerp(B, i / 10)); t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), B.clone().sub(A).normalize()); g.add(t); } unitG.add(g); reg(g, key); };
    if (has("후렉시블(토출)")) flex(U(0.4, 0.78, 1.45), U(0.4, 1.02, 1.45), R_DIS, "slot:후렉시블(토출)");
    if (has("후렉시블(흡입)")) flex(U(0.22, 1.0, 2.44), U(0.22, 1.0, 2.29), R_SUC * 1.1, "slot:후렉시블(흡입)");

    // ── 현장 배관(유니트 ↔ 창고) ──
    const fieldKind = chilling ? "water" : null;
    const wallX = -0.14;
    const liqOut = U(UW + 0.02, LY, 2.52), sucIn = U(UW + 0.02, 0.96, 2.78);
    // 밖: 유니트 → 벽 → 위(아래)로 → 관통
    const liqField = pipe([liqOut, [wallX, liqOut[1], Zp], [wallX, Hl, Zp], [T + 0.12, Hl, Zp]], R_LIQ, fieldKind ?? "liq", "pipe:liq");
    const sucField = pipe([[T + 0.12, Hs, Zs], [wallX, Hs, Zs], [wallX, sucIn[1], Zs], sucIn, U(0.3, 0.96, 2.78)], R_SUC, fieldKind ?? "low", "pipe:suc");
    for (const [y, z, r] of [[Hl, Zp, R_LIQ], [Hs, Zs, R_SUC * 1.35]]) world.add(cyl(r * 1.8, T + 0.08, "x", M.steel, [T / 2, y, z], 18));
    // 받침대(땅 위 관)
    const runY = Math.min(liqOut[1], sucIn[1]);
    if (dist > 1.5 && uy < 0.05 && runY < 1.6) for (let x = -1.2; x > -dist + 0.4; x -= 1.6) { world.add(box([x - 0.025, uy > runY ? runY - 0.05 : 0, Zp - 0.08], [x + 0.025, runY - 0.04, Zp + 0.32], M.steel)); }
    // 안: 헤더 → 쿨러마다
    let liqIn = 0, sucBack = 0;
    txvs.forEach((t, i) => {
      const [x, y, z] = t.p;
      const a = pipe([[T + 0.12, Hl, Zp], [x - 0.17, Hl, Zp], [x - 0.17, Hl, z], [x - 0.17, y, z], [x - 0.07, y, z]], R_LIQ, fieldKind ?? "liq", "pipe:liq"); liqIn = Math.max(liqIn, a.length);
      const b = pipe([t.suc, [t.suc[0] - 0.14, t.suc[1], t.suc[2]], [t.suc[0] - 0.14, Hs, t.suc[2]], [t.suc[0] - 0.14, Hs, Zs], [T + 0.12, Hs, Zs]], R_SUC, fieldKind ?? "low", "pipe:suc"); sucBack = Math.max(sucBack, b.length);
    });
    const liqLen = liqField.length + liqIn, sucLen = sucField.length + sucBack;

    // ── 치수(거리·높이차) ──
    const exD = distM == null, exH = liftM == null;
    dimLine([-dist, uy + 0.03, uz0 - 0.55], [0, 0.03, uz0 - 0.55].map((v, i) => (i === 1 ? uy + 0.03 : v)), `거리 ${fmt(dist, 1)}m`, exD ? "예시 · 눌러서 입력" : "입력값", ["all"], { field: "distM" }, [0, 0, 0.18]);
    const hx = -dist + 0.4, hz = (units[0].z0 + units[0].z1) / 2;
    dimLine([hx, uy, hz], [hx, coolerAbove, hz], `높이차 ${fmt(liftShown, 1)}m`, `${uy > coolerAbove ? "유니트가 위" : "쿨러가 위"} · ${exH ? "예시 · 눌러서 입력" : "입력값"}`, ["all"], { field: "liftM" }, [0.18, 0, 0]);
    dashed([hx, coolerAbove, hz], [units[0].x0, coolerAbove, hz], ["all"]);

    // ── 부하(면별 침입열 화살표·구역 이름표) ──
    if (Lout && ready) {
      const F = Lout.면별침입열 ?? {}, mx = Math.max(1, ...Object.values(F));
      const mH = std(0xF04452, { op: 0.85, em: 0xF04452, ei: 0.2 });
      const faces = { 천정: [[W / 2, H, Dd / 2], [0, -1, 0]], 동: [[W, H / 2, Dd / 2], [-1, 0, 0]], 서: [[0, H / 2, Dd * 0.7], [1, 0, 0]], 남: [[W * 0.25, H / 2, Dd], [0, 0, -1]], 북: [[W * 0.75, H / 2, 0], [0, 0, 1]] };
      for (const [k, [p, dir]] of Object.entries(faces)) {
        if (!(k in F)) continue;
        const len = 0.5 + (2.0 * F[k]) / mx, d = v3(dir), P = v3(p), g = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 14), mH), cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.38, 20), mH);
        shaft.position.y = len / 2 + 0.38; cone.position.y = 0.19; cone.rotation.x = Math.PI; g.add(shaft, cone);
        g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().negate()); g.position.copy(P); g.userData.steps = ["load"]; g.traverse((m) => { if (m.isMesh) { m.userData.key = "z:wall"; picks.push(m); } });
        world.add(g); heat.push(g);
        label(P.clone().add(d.clone().multiplyScalar(-(len + 0.45))).toArray(), `${k} ${fmt(F[k])}`, "kcal/h", { steps: ["load"], cls: "heat", prio: 3, stem: 8, key: "z:wall" });
      }
    }
    const zpos = { room: [W / 2, H + 0.05, Dd * 0.4], out: [-0.6, H + 0.9, Dd - 0.3], wall: [W, H * 0.8, Dd * 0.3], door: [dx0 + dw / 2, dh + 0.25, Dd + 0.1], goods: [W * 0.5, 1.5, Dd - 1.4], people: [Math.min(W - 0.7, 1.0), 1.5, Dd * 0.55], equip: [W / 2, H - T - 0.05, Dd * 0.6], run: [-0.26, 1.95, Zs + 1.4] };
    for (const z of ctx.zones ?? []) {
      if (!zpos[z.id]) continue;
      label(zpos[z.id], z.name, z.line, { steps: ["load"], key: `z:${z.id}`, prio: z.id === ctx.zone ? 9 : 4, stem: z.id === "room" ? 30 : 16, cls: z.id === ctx.zone ? "dark" : "" });
    }

    // ── 이름표(단계·전체) ──
    const pos = (g) => { const b = new THREE.Box3().setFromObject(g); const c = b.getCenter(new THREE.Vector3()); return [c.x, b.max.y, c.z]; };
    label([W / 2, H + 0.05, Dd * 0.55], `${ready ? "" : "창고 크기 입력 전 · "}냉동창고 ${fmt(Lin.roomC)}℃`, `${fmt(W, 1)}×${fmt(Dd, 1)}×${fmt(H, 1)}m${ready && Lout ? ` · 부하 ${fmt(Lout.총냉각열량Kw, 1)} kW` : ""}`, { steps: ["all"], key: "z:room", prio: 8, stem: 26, cls: ready ? "dark" : "ghost" });
    label(U(UW / 2, 1.62, 0.52), `유니트${uy > 0.05 && above ? " (옥상)" : " (건물 밖)"}`, UD ? `${UD.hp}마력 ${formName(UD.form)} · ${UD.refrigerant ?? ""}` : "구성 전", { steps: ["all"], key: "slot:압축기", act: { step: "unit" }, prio: 9, stem: 30, cls: "dark" });
    units.forEach((u, i) => { if (i === 0) label([u.x1 - 0.1, cy1, (u.z0 + u.z1) / 2], `유닛쿨러${n > 1 ? ` × ${n}대` : ""}`, CL ? `${CL.model} · ${fmt(CL.kcal)} kcal/h` : "미정", { steps: ["all", "cooler"], key: "cooler", prio: 8, stem: 34, cls: CL ? "" : "ghost" }); });
    txvs.forEach((t, i) => { if (i === 0) label([t.p[0], t.p[1] + 0.12, t.p[2]], "팽창변", TX ? `${TX.model}${(TO?.count ?? 1) > 1 ? ` × ${TO.count}조` : ""}` : "미정", { steps: ["all", "cooler", "txv"], key: "txv", prio: 7, stem: 14, cls: TX ? "" : "ghost" }); });
    label([-0.27, 1.95, Zs + 1.42], "콘트롤판넬", "따로 설치", { steps: ["all", "unit"], key: "slot:콘트롤판넬", prio: 3, stem: 14 });
    label([(liqOut[0] + wallX) / 2, liqOut[1] + 0.04, Zp], chilling ? "냉수·브라인 (보냄)" : "액관", `약 ${fmt(liqLen, 1)}m`, { steps: ["all"], key: "pipe:liq", prio: 5, stem: 18 });
    label([(sucIn[0] + wallX) / 2 - 0.6, sucIn[1] + 0.05, Zs], chilling ? "냉수·브라인 (돌아옴)" : "흡입관", `약 ${fmt(sucLen, 1)}m · 보온`, { steps: ["all"], key: "pipe:suc", prio: 5, stem: 46 });
    // 유니트 단계 — 구성품
    const UN = ["unit"];
    // 유니트 단계 — 첫 시안처럼 이름표를 유니트 위 줄(높은 부품)·앞 줄(낮은 부품)로 끌어내 가는 선으로 잇는다. 줄 이름표는 늘 다 보인다.
    label(U(UW / 2, 1.62, 0.3), has("R/C 일체") ? "응축기 (R/C 일체)" : has("유니트 응축기") ? "응축기 (수냉)" : "응축기 (세트 외)", has("R/C 일체") || has("유니트 응축기") ? (slot("R/C 일체") ?? slot("유니트 응축기"))?.modelNo ?? "" : "", { steps: UN, key: condKey, prio: 60, stem: 24, cls: has("R/C 일체") || has("유니트 응축기") ? "" : "ghost" });
    const upper = [["pg", U(0.36, 1.45, 1.07), "프레샤·게이지", true], ["slot:후렉시블(토출)", U(0.4, 0.95, 1.45), "후렉시블(토출)"], ["slot:브라켓밸브", U(LX, LY + 0.1, 1.99), "브라켓밸브"], [drN ? `slot:${drN}` : "-", U(LX, LY + 0.06, 2.17), "드라이어"], ["slot:사이트글라스", U(LX, LY + 0.03, 2.36), "사이트글라스"], ["slot:전자변", U(LX, LY + 0.11, 2.46), "전자변"], ["slot:유분리기", U(0.86, 0.8, 2.62), "유분리기"], ["slot:팽창변+TC", U(0.9, 0.7, 2.96), "팽창변+TC"]]
      .filter(([k, , , always]) => always || (k.startsWith("slot:") && has(k.slice(5))));
    upper.forEach(([k, p, t], i) => callout(p, U(UW + 0.05, 1.82 + (i % 2) * 0.26, 1.15 + i * 0.36), t, { steps: UN, key: k }));
    const lower = [["slot:수액기", U(0.85, 0.36, 1.5), "수액기"], ["slot:유니트 수액기", U(0.85, 0.36, 1.5), "수액기(유니트)"], ["slot:압축기", U(0.2, 0.42, 1.6), "압축기"], ["slot:오일리턴밸브", U(0.68, 0.24, 2.04), "오일리턴밸브"], ["slot:후렉시블(흡입)", U(0.22, 1.0, 2.36), "후렉시블(흡입)"], ["slot:액분리기", U(0.2, 0.6, 2.52), "액분리기"], ["slot:유니트 칠라", U(0.55, 0.42, 3.4), "칠러"]]
      .filter(([k]) => has(k.slice(5)));
    lower.forEach(([k, p, t], i) => callout(p, U(-0.45, 0.02, 1.1 + i * 0.42), t, { steps: UN, key: k, below: true }));
    if (UD?.stage === "2단") label(U(0.6, 0.85, UL - 0.15), "중간냉각기", "세트 외", { steps: UN, key: "ghost:중간냉각기", prio: 3, stem: 20, cls: "ghost" });
    if (!UD) label(U(-0.5, 1.6, -0.4), `유니트 ${unitWhy} — 보통 구성으로 그림`, String(R?.unit?.out?.notes?.[0] ?? R?.errors?.unit ?? "압축기가 정해지면 구성표대로 그려요").split(" — ")[0], { steps: ["unit", "all"], key: "slot:응축기", prio: 10, stem: 30, cls: "ex", fixed: true });
    // 압축기 단계
    label(U(0.4, 0.8, 1.85), CP?.model_no ?? (CP ? CP.product_id : "압축기 미정"), CP ? `${CP.hp}마력 · ${fmt(CP.capacity_kw, 2)} kW` : "", { steps: ["comp"], key: "slot:압축기", prio: 9, stem: 60, cls: "dark" });
    label(U(0.4, 1.12, 1.45), "토출 → 유분리기", "고압 가스", { steps: ["comp"], key: "pipe:dis", prio: 4, stem: 16 });
    label(U(0.22, 1.0, 2.25), "흡입 ← 액분리기", "저압 가스", { steps: ["comp"], key: "pipe:suc", prio: 4, stem: 16 });
    // 유닛쿨러 단계
    if (CL) {
      const u = units[0];
      label([(u.x0 + u.x1) / 2, cMid - 0.1, u.z1 + 0.05], "팬", `Ø${CL.fanInfo?.dia ?? "-"}mm × ${CL.fanInfo?.count ?? 1}대 · ${fmt(CL.airflow_cmm)}㎥/min`, { steps: ["cooler"], key: "cooler", prio: 5, stem: 14 });
      label([u.x1 - 0.12, cy0 - 0.25, u.z0 + 0.12], "드레인", `${CL.drain ?? "-"} · 제상 ${CL.heater ?? "-"}`, { steps: ["cooler"], key: "cooler:drain", prio: 3, stem: 12 });
      label([u.x1, cy1 - 0.1, u.z0 + 0.02], "코일(뒤쪽)", `전열면적 ${fmt(CL.area_m2, 1)}㎡`, { steps: ["cooler"], key: "cooler", prio: 4, stem: 20 });
      label([u.x0 - 0.1, cy0 + 0.18, u.z0 + 0.28], "분배기", "팽창한 냉매를 코일 여러 줄로", { steps: ["cooler", "txv"], key: "txv:dist", prio: 4, stem: 40 });
      label([txvs[0].suc[0] - 0.14, Hs, txvs[0].suc[2]], "흡입관 출구", `${CL.pipe_out ?? "-"} mm`, { steps: ["cooler"], key: "pipe:suc", prio: 3, stem: 12 });
    }
    // 팽창변 단계
    if (TX) {
      const [x, y, z] = txvs[0].p, cp = (role) => TX.components?.find((c) => c.role === role);
      label([x, y - 0.06, z], "바디", `${cp("바디")?.detail?.connection_size ?? ""} · ${cp("바디")?.code_no ?? ""}`, { steps: ["txv"], key: "txv", prio: 5, stem: 12 });
      label([x + 0.1, y, z], "오리피스", `${cp("오리피스")?.detail?.model_name ?? ""} · ${cp("오리피스")?.code_no ?? ""}`, { steps: ["txv"], key: "txv", prio: 5, stem: 46 });
      label([x, y + 0.13, z], "감온부", `${cp("감온부")?.detail?.model_name ?? ""} · ${cp("감온부")?.code_no ?? ""}`, { steps: ["txv"], key: "txv", prio: 6, stem: 80 });
      label(txvs[0].bulb, "감온통", "흡입관 온도를 잼", { steps: ["txv"], key: "txv:bulb", prio: 5, stem: 22 });
      label([x - 0.17, Hl, z + 0.3], "액관 (유니트에서)", "", { steps: ["txv"], key: "pipe:liq", prio: 3, stem: 14 });
    }

    // ── 마우스 카드 정보 ──
    const slotInfo = (s) => ({ kind: `유니트 구성품 · ${s.slot}`, title: s.partName ?? s.slot, rows: [["규격", s.spec], ["품번", s.modelNo ?? "-"], ...(s.brand ? [["메이커", s.brand]] : []), ...(s.note ? [["메모", s.note]] : [])], price: s.separate ? null : s.priceKrw, step: "unit" });
    for (const s of slots) if (!INFO.has(`slot:${s.slot}`)) INFO.set(`slot:${s.slot}`, slotInfo(s));
    if (!UD) { const why = R?.unit?.out?.notes?.[0] ?? R?.errors?.unit ?? "압축기가 정해지면 구성표대로 그려요"; for (const n of BASE_SET) INFO.set(`slot:${n}`, { kind: `유니트 ${unitWhy}`, title: n, rows: [["설명", why], ["그림", "보통 R/C 일체형 구성으로 그렸어요"]], step: "unit" }); INFO.set("slot:응축기", INFO.get("slot:R/C 일체")); }
    else if (!has("R/C 일체") && !has("유니트 응축기")) INFO.set("slot:응축기", { kind: "유니트", title: "응축기 (세트 외)", rows: [["형식", formName(UD?.form)], ["설명", "이 형식은 응축기가 세트에 들지 않아요"]], step: "unit" });
    if (!CP) INFO.set("slot:압축기", { kind: "압축기", title: "압축기 미정", rows: [["설명", "압축기 단계에서 정해요"]], step: "comp" });
    if (CP) INFO.set("slot:압축기", { kind: "압축기", title: CP.model_no, rows: [["메이커", CP.brand], ["마력", `${CP.hp}마력`], ["냉동능력", `${fmt(CP.capacity_kw, 2)} kW`], ...(CP.deviation_pct != null ? [["필요 대비", `${CP.deviation_pct >= 0 ? "+" : ""}${fmt(CP.deviation_pct, 1)}%`]] : [])], price: CP.price_krw, step: "comp" });
    const ps = slots.filter((s) => s.slot === "프레샤" || s.slot === "게이지");
    if (ps.length) INFO.set("pg", { kind: "유니트 구성품", title: "프레샤·게이지", rows: ps.map((s) => [`${s.slot} ${s.spec}`, s.modelNo]), price: ps.reduce((a, s) => a + (s.priceKrw ?? 0), 0), step: "unit" });
    INFO.set("cooler", CL ? { kind: "유닛쿨러", title: `${CL.model}${n > 1 ? ` × ${n}대` : ""}`, rows: [["메이커·형식", `${CL.maker} · ${CL.form}`], ["능력(1대)", `${fmt(CL.kcal)} kcal/h`], ...(CL.margin_pct != null ? [["필요 대비", `여유 ${fmt(CL.margin_pct, 1)}%`]] : []), ["크기 L×W×H", `${CL.dims} mm`], ["배관 입구/출구", `${CL.pipe_in ?? "-"} / ${CL.pipe_out ?? "-"} mm`]], foot: CL.source, step: "cooler" } : { kind: "유닛쿨러", title: "아직 정하지 않음", rows: [], step: "cooler" });
    INFO.set("cooler:drain", { kind: "유닛쿨러", title: "드레인(물 빠지는 관)", rows: [["관경", CL?.drain ?? "-"], ["제상히터", CL?.heater ?? "-"]], step: "cooler" });
    INFO.set("txv", TX ? { kind: "팽창변", title: `${TX.model}${(TO?.count ?? 1) > 1 ? ` × ${TO.count}조` : ""}`, rows: [["부하율", `${TX.load_pct ?? "-"}%`], ...(TX.components ?? []).map((c) => [c.role, `${c.code_no} · ${won(c.price_krw)}`])], price: (TX.components ?? []).reduce((a, c) => (a == null || c.price_krw == null ? null : a + c.price_krw), 0), step: "txv" } : { kind: "팽창변", title: "아직 정하지 않음", rows: [], step: "txv" });
    INFO.set("txv:bulb", { kind: "팽창변", title: "감온통·균압관", rows: [["감온통", "쿨러 출구 흡입관 온도를 잼"], ["균압관", "쿨러 출구 압력을 팽창변에 알림"]], step: "txv" });
    INFO.set("txv:dist", { kind: "팽창변 → 쿨러", title: "분배기", rows: [["하는 일", "팽창한 냉매를 코일 여러 줄로 고르게 나눔"]], step: "txv" });
    const lp = (L) => `약 ${fmt(L, 1)} m (그림 경로)`;
    INFO.set("pipe:liq", { kind: "배관", title: chilling ? "냉수·브라인 배관(보냄)" : "액관 — 고압 액", rows: [["유니트 쪽 액관 부품", `${slot("전자변")?.spec ?? "-"}″`], ["쿨러 액 입구", `${CL?.pipe_in ?? "-"} mm`], ["길이", lp(liqLen)]], foot: "관경·길이에 따른 압력 손실은 아직 계산에 없어요", step: "unit" });
    INFO.set("pipe:suc", { kind: "배관", title: chilling ? "냉수·브라인 배관(돌아옴)" : "흡입관 — 저압 가스(보온)", rows: [["유니트 흡입 후렉시블", `${slot("후렉시블(흡입)")?.spec ?? "-"}″`], ["쿨러 출구", `${CL?.pipe_out ?? "-"} mm`], ["길이", lp(sucLen)]], foot: "올라가는 흡입관의 오일 회수는 아직 계산에 없어요", step: "unit" });
    INFO.set("pipe:dis", { kind: "배관", title: "토출관 — 고압 가스", rows: [["압축기 → 유분리기 → 응축기", ""]], step: "comp" });
    INFO.set("site:lift", { kind: "유니트 위치", title: above ? "건물 옥상" : "받침대", rows: [["높이", `${fmt(uy, 1)} m`]], act: { field: "liftM" } });
    INFO.set("ghost:중간냉각기", { kind: "2단", title: "중간냉각기 (세트 외)", rows: [["설명", "2단 사이클에 들지만 유니트 세트 구성표에는 없어요"]], step: "unit" });
    const Z = Object.fromEntries((ctx.zones ?? []).map((z) => [z.id, z]));
    for (const id of ["room", "out", "wall", "door", "goods", "people", "equip", "run"]) INFO.set(`z:${id}`, { kind: "부하계산", title: Z[id]?.name ?? id, rows: Z[id] ? [[Z[id].sub ?? "", Z[id].line ?? ""]] : [], zone: id, step: "load" });

    // ── 카메라 자리 ──
    const roomC = new THREE.Vector3(W / 2, H / 2, Dd / 2), span = Math.max(W, Dd, dist + W);
    const allC = new THREE.Vector3((ux0 + W) / 2, Math.max(1, uy / 2), Dd * 0.4);
    CAM = {
      all: { pos: [allC.x - span * 0.95, span * 0.75 + uy * 0.5, allC.z + span * 1.05], tgt: allC.toArray() },
      load: { pos: [W + span * 0.85, span * 0.95, Dd + span * 0.85], tgt: [roomC.x, H * 0.2, roomC.z] },
      comp: { pos: U(-1.7, 1.6, 3.8), tgt: U(0.42, 0.5, 1.75) },
      unit: { pos: U(-3.3, 2.9, 5.9 + (chilling ? 0.8 : 0)), tgt: U(0.45, 0.85, UL * 0.55) },
      cooler: { pos: [Math.max(T + 0.5, units[0].x0 - 1.6), cMid - 0.9, units[0].z1 + 2.8], tgt: [(units[0].x0 + units[0].x1) / 2 - 0.15, cMid - 0.1, units[0].z1 - 0.1] },
      txv: { pos: [txvs[0].p[0] - 1.3, txvs[0].p[1] + 0.45, txvs[0].p[2] + 2.3], tgt: [txvs[0].p[0] + 0.2, txvs[0].p[1] + 0.25, txvs[0].p[2] + 0.15] },
    };
    applyPipeColors(); legend(chilling); cullDirty = true;
  }
  const formName = (f) => ({ rc_일체형: "R/C 일체형", 수액기형: "수액기형", 응축기형: "응축기형", 칠링_공냉: "칠링 공냉", 칠링_수냉: "칠링 수냉" })[f] ?? (f ?? "");
  function legend(chilling) {
    leg.innerHTML = colorPipes
      ? `<span><i class="bar" style="background:#F04452"></i>토출 가스</span><span><i class="bar" style="background:#F57800"></i>액(고압)</span><span><i class="bar" style="background:#3182F6"></i>저압</span><span><i class="bar" style="background:#8A6A10"></i>오일</span>${chilling ? `<span><i class="bar" style="background:#18A5A5"></i>냉수·브라인</span>` : ""}`
      : `<span>냉매 흐름 —</span><span><i style="background:#F04452"></i>토출 가스</span><span><i style="background:#F57800"></i>액(고압)</span><span><i style="background:#3182F6"></i>저압</span><span><i style="background:#8A6A10"></i>오일</span>${chilling ? `<span><i style="background:#18A5A5"></i>냉수·브라인</span>` : ""}<span>· 흡입관 = 검은 보온재</span>`;
  }
  // 흐름 색 배관이면 구슬은 흰색(첫 시안), 실물 색(동관·보온재)이면 구슬이 흐름 색
  const WHITE_BEAD = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  function applyPipeColors() { world?.traverse((m) => { if (m.userData.pipeKind) m.material = pipeMat[m.userData.pipeKind][colorPipes ? 1 : 0]; if (m.userData.kind) m.material = colorPipes ? WHITE_BEAD : beadMat[m.userData.kind]; }); }

  // ═════════════════════════ 보기·행동 ═════════════════════════
  function applyVisibility() {
    for (const o of labels) o.visible = o.userData.steps.includes(mode);
    for (const o of [...dims, ...heat]) o.visible = o.userData.steps.includes(mode);
    cullDirty = true;
  }
  function go(id, instant = false) {
    const c = CAM[id]; if (!c) return;
    const P = v3(c.pos), Tg = v3(c.tgt);
    if (instant) { camera.position.copy(P); controls.target.copy(Tg); controls.update(); }
    else tween = { t0: performance.now(), p0: camera.position.clone(), q0: controls.target.clone(), P, Tg };
  }
  function focusKey(key) {
    const objs = picks.filter((m) => m.userData.key === key); if (!objs.length) return;
    const b = new THREE.Box3(); for (const m of objs) b.expandByObject(m);
    const c = b.getCenter(new THREE.Vector3()), s = Math.max(0.35, b.getSize(new THREE.Vector3()).length());
    const dir = camera.position.clone().sub(controls.target).normalize();
    tween = { t0: performance.now(), p0: camera.position.clone(), q0: controls.target.clone(), P: c.clone().add(dir.multiplyScalar(s * 2.2)), Tg: c };
  }
  function doAct(a) {
    if (!a) return;
    if (a.field) return cb.onField?.("unit", a.field);
    if (a.step) return a.step === tab ? (mode !== tab && setMode(tab)) : cb.onStep?.(a.step);
    const I = INFO.get(a.key); if (!I) return;
    if (I.act) return doAct(I.act);
    if (I.zone && tab === "load") return cb.onZone?.(I.zone);
    if (I.step && I.step !== tab) return cb.onStep?.(I.step);
    if (mode !== tab) setMode(tab);
    focusKey(a.key);
  }
  function setMode(m, instant = false) { mode = m; for (const b of el.querySelectorAll("[data-d3=all]")) b.classList.toggle("on", m === "all"); applyVisibility(); go(m, instant); }
  el.querySelector(".d3-ov").addEventListener("click", (e) => {
    const b = e.target.closest("[data-d3]"); if (!b) return;
    if (b.dataset.d3 === "all") setMode(mode === "all" ? tab : "all");
    if (b.dataset.d3 === "color") { colorPipes = !colorPipes; b.classList.toggle("on", !colorPipes); applyPipeColors(); legend(!!R?.unit?.out?.draft?.slots?.some((s) => s.slot === "유니트 칠라")); }
    if (b.dataset.d3 === "flow") { flowOn = !flowOn; b.classList.toggle("on", flowOn); for (const f of flows) for (const x of f.beads) x.visible = flowOn; }
  });

  // ── 마우스 ──
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  function setHover(key) {
    if (key === hoverKey) return; hoverKey = key;
    if (key && !key.startsWith("z:wall")) { const objs = picks.filter((m) => m.userData.key === key); const b = new THREE.Box3(); for (const m of objs) b.expandByObject(m); if (!b.isEmpty()) { hl.box.copy(b.expandByScalar(0.02)); hl.visible = true; } else hl.visible = false; }
    else hl.visible = false;
    renderer.domElement.style.cursor = key ? "pointer" : "";
  }
  function showTip(key, x, y) {
    const I = key ? INFO.get(key) : null;
    if (!I) { tip.style.display = "none"; return; }
    const goTxt = I.zone && tab === "load" ? "누르면 오른쪽에서 이 부분 값을 고쳐요" : I.act?.field ? "누르면 입력 칸으로" : I.step && I.step !== tab ? `누르면 「${STEP_NM[I.step]}」 단계로` : "누르면 가까이";
    tip.innerHTML = `<div class="k">${esc(I.kind)}</div><div class="t">${esc(I.title)}</div>${I.rows.filter((r) => r[1] != null && r[1] !== "").map(([a, b]) => `<div class="r"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join("")}${I.price != null ? `<div class="pr">${won(I.price)}</div>` : ""}${I.foot ? `<div class="ft">${esc(I.foot)}</div>` : ""}<div class="go">${goTxt}</div>`;
    tip.style.display = "block";
    const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    let L = x - r.left + 16, Tt = y - r.top + 16; if (L + tw > r.width - 8) L = x - r.left - tw - 16; if (Tt + th > r.height - 8) Tt = y - r.top - th - 16;
    tip.style.left = `${Math.max(4, L)}px`; tip.style.top = `${Math.max(4, Tt)}px`;
  }
  renderer.domElement.addEventListener("pointermove", (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld(); ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(picks, false).find((h) => h.object.visible && !(h.object.material?.transparent && h.object.material.opacity < 0.3 && h.object.userData.key === "z:wall"));
    const key = hit?.object.userData.key ?? null; setHover(key); showTip(key, e.clientX, e.clientY);
  });
  renderer.domElement.addEventListener("pointerleave", () => { setHover(null); tip.style.display = "none"; });
  labEl.addEventListener("pointermove", (e) => { if (hoverKey && e.target.closest(".lb")) showTip(hoverKey, e.clientX, e.clientY); });
  labEl.addEventListener("pointerleave", () => { tip.style.display = "none"; });
  labEl.addEventListener("wheel", (e) => { e.preventDefault(); renderer.domElement.dispatchEvent(new WheelEvent("wheel", e)); }, { passive: false });
  let down = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; if (hoverKey) doAct({ key: hoverKey }); });

  // ── 그리기 ──
  const ro = new ResizeObserver(() => resize()); ro.observe(el);
  function resize() { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h); labelR.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); cullDirty = true; }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let last = performance.now(), raf = 0;
  const tmp = new THREE.Vector3();
  function cull() {
    const vis = labels.filter((o) => o.visible).sort((a, b) => (b.userData.fixed ? 1 : 0) - (a.userData.fixed ? 1 : 0) || b.userData.prio - a.userData.prio), placed = [];
    for (const o of vis) {
      const lb = o.element.querySelector(".lb"); o.element.classList.remove("cull");
      const r = lb.getBoundingClientRect(); if (!r.width) continue;
      if (o.userData.fixed) { placed.push(r); continue; }
      const hit = placed.some((p) => !(r.right + 4 < p.left || r.left - 4 > p.right || r.bottom + 3 < p.top || r.top - 3 > p.bottom));
      if (hit) o.element.classList.add("cull"); else placed.push(r);
    }
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!el.isConnected || !world) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (tween) { const k = Math.min(1, (now - tween.t0) / 700), e = ease(k); camera.position.lerpVectors(tween.p0, tween.P, e); controls.target.lerpVectors(tween.q0, tween.Tg, e); if (k >= 1) tween = null; }
    controls.update();
    // 보는 쪽 벽은 투명하게(자르기) — 카메라가 그 벽 바깥에 있으면
    for (const w of walls) { const out = tmp.copy(camera.position).sub(w.c).dot(w.n) > 0; const op = out ? (ctx.loadReady ? 0.12 : 0.08) : ctx.loadReady ? 1 : 0.45; if (w.m.material.opacity !== op) { w.m.material.opacity = op; w.m.material.depthWrite = op > 0.5; w.m.castShadow = op > 0.5; } }
    if (flowOn) for (const f of flows) { f.off = (f.off + (dt * f.speed) / f.L) % 1; f.beads.forEach((b, i) => { const q = f.path.getPointAt(Math.min(0.999, (f.off + i / f.beads.length) % 1)); if (q) b.position.copy(q); }); }
    for (const r of fans) r.rotation.z += dt * 9;
    for (const a of airs) { const d = a.userData; d.k = (d.k + dt * 0.14) % 1; a.position.set(d.cx + d.dx, d.cy + d.dy - d.k * 0.5, d.z1 + 0.15 + d.k * 2.6); a.material.opacity = 0.65 * (1 - d.k); a.visible = mode === "cooler" || mode === "all"; }
    renderer.render(scene, camera); labelR.render(scene, camera);
    const cs = camera.position.toArray().map((v) => v.toFixed(2)).join() + controls.target.toArray().map((v) => v.toFixed(2)).join();
    if (cullDirty || (cs !== lastCam && !tween)) { cull(); cullDirty = false; lastCam = cs; }
    else if (tween) lastCam = "";
  }
  raf = requestAnimationFrame(frame);

  /** 계산 결과·화면 상태를 받는다 — 모양이 바뀌면 다시 짓고, 단계가 바뀌면 카메라를 옮긴다 */
  function update(result, c) {
    R = result; ctx = c ?? {};
    const L = R?.load?.in ?? {}, U = R?.unit?.out?.draft, K = R?.cooler?.out, T = R?.txv?.out, Ui = R?.unit?.in ?? {};
    const s = JSON.stringify([L.w, L.d, L.h, L.insulMm, L.roomC, ctx.loadReady, R?.load?.out?.총냉각열량, U?.form, U?.stage, U?.hp, (U?.slots ?? []).map((x) => x.slot + x.modelNo).join(), K?.chosen?.model, K?.count, T?.chosen?.model, T?.count, R?.comp?.out?.chosen?.model_no, Ui.distM, Ui.liftM, Ui.unitPos, ctx.zone, (ctx.zones ?? []).map((z) => z.line).join()]);
    const first = !world;
    if (s !== sig) {
      sig = s; build();
    }
    const newTab = ctx.tab ?? "load";
    if (first || newTab !== tab) { tab = newTab; setMode(tab, first); }
    else applyVisibility();
  }
  return { el, update, resize };
}
