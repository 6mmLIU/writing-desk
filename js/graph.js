/* 关系图谱：笔记是点，[[链接]] 是线。点越大，连接越多。拖动画布平移，滚轮缩放，拖点调位置，点一下打开。
   可以只看当前笔记的邻居（局部图谱），也可以把还没创建的链接和标签一起画出来。 */
W.Graph = (() => {
  const S = W.S, U = W.UI, I = (n, s) => U.icon(n, s);
  const G = {};
  const opt = Object.assign({ local: false, depth: 1, missing: true, tags: false, color: "folder", repel: 60, link: 50 }, W.ls.get("wbd:graph") || {});
  const saveOpt = () => W.ls.set("wbd:graph", opt);
  let cv, ctx, nodes = [], edges = [], byId = new Map(), raf = 0, alpha = 1, hover = null, drag = null, pan = null;
  let view = { x: 0, y: 0, k: 1 }, dpr = 1, W0 = 0, H0 = 0, mounted = false;
  const PALETTE = ["#4F7CFF", "#E0812E", "#2EA36B", "#C2477E", "#8A63D2", "#1F9AA8", "#C0A12A", "#D2543A"];
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  function build() {
    const { edges: E, missing } = W.Links.graph();
    let ids = new Set(S.notes.map((n) => n.id));
    const nb = new Map(); const add = (a, b) => { (nb.get(a) || nb.set(a, new Set()).get(a)).add(b); (nb.get(b) || nb.set(b, new Set()).get(b)).add(a); };
    const tagEdges = [];
    if (opt.tags) for (const n of S.notes) for (const t of new Set([...(n.tags || []), ...[...(n.text || "").matchAll(/(^|\s)#([\p{L}\p{N}_\-/]+)/gu)].map((m) => m[2])])) tagEdges.push([n.id, "#" + t]);
    const all = [...E.filter(([, b]) => opt.missing || !b.startsWith("?")), ...tagEdges];
    for (const [a, b] of all) add(a, b);
    if (opt.local && S.ui.noteId) { // 局部图谱：当前笔记往外几层
      let frontier = new Set([S.ui.noteId]); const keep = new Set(frontier);
      for (let d = 0; d < opt.depth; d++) { const nx = new Set(); for (const x of frontier) for (const y of nb.get(x) || []) if (!keep.has(y)) { keep.add(y); nx.add(y); } frontier = nx; }
      ids = keep;
    } else for (const [a, b] of all) { ids.add(a); ids.add(b); }
    const old = byId; byId = new Map(); nodes = [];
    const folders = [...new Set(S.notes.map((n) => (n.folder || "").split("/")[0]))].sort();
    for (const id of ids) {
      const n = W.note(id), deg = nb.get(id)?.size || 0;
      const kind = n ? "note" : id.startsWith("#") ? "tag" : "missing";
      const label = n ? W.Links.titleOf(n) : id.startsWith("#") ? id : missing.get(id) || id.slice(1);
      const o = old.get(id);
      const node = { id, kind, label, deg, r: 4 + Math.sqrt(deg) * 2.6, note: n, x: o?.x ?? (Math.random() - 0.5) * 400, y: o?.y ?? (Math.random() - 0.5) * 400, vx: 0, vy: 0, fixed: false,
        color: kind === "tag" ? css("--warn") || "#C0A12A" : kind === "missing" ? css("--fg-3") || "#999" : opt.color === "status" ? statusColor(n.status) : PALETTE[folders.indexOf((n.folder || "").split("/")[0]) % PALETTE.length] };
      byId.set(id, node); nodes.push(node);
    }
    edges = all.filter(([a, b]) => byId.has(a) && byId.has(b)).map(([a, b]) => ({ a: byId.get(a), b: byId.get(b) }));
    alpha = 1;
  }
  const statusColor = (s) => ({ idea: "#9AA3B5", draft: "#4F7CFF", review: "#E0812E", done: "#2EA36B", published: "#1F9AA8" }[s] || "#9AA3B5");

  // ---------- 力导向 ----------
  function step() {
    const n = nodes.length, rep = opt.repel * 60, len = 30 + opt.link * 1.6;
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]; let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy || 0.01;
        if (d2 > 250000) continue;
        const f = (rep / d2) * alpha, d = Math.sqrt(d2); dx /= d; dy /= d;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
      a.vx -= a.x * 0.004 * alpha; a.vy -= a.y * 0.004 * alpha; // 往中间收
    }
    for (const { a, b } of edges) {
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01, f = ((d - len) / d) * 0.06 * alpha;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const p of nodes) { if (p.fixed) { p.vx = p.vy = 0; continue; } p.vx *= 0.82; p.vy *= 0.82; p.x += p.vx; p.y += p.vy; }
    alpha = Math.max(0, alpha * 0.985);
  }
  function loop() { raf = 0; if (!mounted) return; if (alpha > 0.02 || drag) step(); draw(); if (alpha > 0.02 || drag) raf = requestAnimationFrame(loop); }
  const kick = (a = 0.5) => { alpha = Math.max(alpha, a); if (!raf) raf = requestAnimationFrame(loop); };

  // ---------- 绘制 ----------
  const toScreen = (p) => [W0 / 2 + (p.x + view.x) * view.k, H0 / 2 + (p.y + view.y) * view.k];
  const toWorld = (sx, sy) => [(sx - W0 / 2) / view.k - view.x, (sy - H0 / 2) / view.k - view.y];
  function draw() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W0, H0);
    const near = hover ? new Set([hover.id, ...edges.filter((e) => e.a === hover || e.b === hover).flatMap((e) => [e.a.id, e.b.id])]) : null;
    const line = css("--line-2") || "#ccc", fg = css("--fg") || "#111", fg3 = css("--fg-3") || "#888", acc = css("--primary") || "#2F55D4";
    ctx.lineWidth = Math.max(0.6, view.k * 0.9);
    for (const e of edges) {
      const [x1, y1] = toScreen(e.a), [x2, y2] = toScreen(e.b), on = near && near.has(e.a.id) && near.has(e.b.id) && (e.a === hover || e.b === hover);
      ctx.strokeStyle = on ? acc : line; ctx.globalAlpha = near && !on ? 0.25 : 1;
      if (e.b.kind === "missing") ctx.setLineDash([3, 3]); else ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.setLineDash([]);
    const cur = S.ui.noteId;
    for (const p of nodes) {
      const [x, y] = toScreen(p), r = p.r * Math.max(0.6, Math.min(1.6, view.k));
      ctx.globalAlpha = near && !near.has(p.id) ? 0.25 : 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      if (p.kind === "missing") { ctx.fillStyle = css("--surface") || "#fff"; ctx.fill(); ctx.strokeStyle = p.color; ctx.lineWidth = 1.2; ctx.stroke(); }
      else { ctx.fillStyle = p.color; ctx.fill(); }
      if (p.id === cur) { ctx.strokeStyle = fg; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke(); }
      const showLabel = view.k > 0.75 || p === hover || (near && near.has(p.id)) || p.deg >= 4 || p.id === cur;
      if (showLabel) {
        ctx.fillStyle = p === hover || p.id === cur ? fg : fg3; ctx.font = `${p === hover ? 600 : 400} ${Math.round(11 + Math.min(3, view.k))}px -apple-system, "PingFang SC", sans-serif`;
        ctx.textAlign = "center"; ctx.fillText(p.label.length > 18 ? p.label.slice(0, 17) + "…" : p.label, x, y + r + 13);
      }
    }
    ctx.globalAlpha = 1;
    const info = W.$("#graph-info"); if (info) info.textContent = `${nodes.filter((p) => p.kind === "note").length} 篇笔记 · ${edges.length} 条链接`;
  }
  const hit = (sx, sy) => { let best = null, bd = 1e9; for (const p of nodes) { const [x, y] = toScreen(p), d = Math.hypot(x - sx, y - sy), r = p.r * Math.max(0.6, Math.min(1.6, view.k)) + 5; if (d < r && d < bd) { best = p; bd = d; } } return best; };

  // ---------- 页面 ----------
  G.render = () => {
    const v = W.$("#v-graph");
    v.innerHTML = `<header class="vh"><div><h1>关系图谱</h1><p class="vh-sub">笔记之间的 [[链接]] 画成一张网。点一下打开，拖动整理，滚轮缩放。</p></div>
      <div class="btn-row"><span class="muted small" id="graph-info"></span><button type="button" class="btn" data-g="fit">${I("collapse", 15)}放到正中</button></div></header>
      <div class="graph-wrap card">
        <canvas id="graph-cv" aria-label="笔记关系图"></canvas>
        <aside class="graph-ctl">
          <div class="seg seg-radio" role="radiogroup" aria-label="范围"><label><input type="radio" name="g-scope" value="all" ${!opt.local ? "checked" : ""}><span>全部</span></label><label><input type="radio" name="g-scope" value="local" ${opt.local ? "checked" : ""}><span>当前笔记</span></label></div>
          ${opt.local ? `<div class="field"><span>往外几层</span>${U.pills("g-depth", 'data-g="depth"', opt.depth, { min: 1, max: 3, label: "往外几层" })}</div>` : ""}
          <label class="toggle"><input type="checkbox" class="sw" data-g="missing" ${opt.missing ? "checked" : ""}> 显示还没创建的链接</label>
          <label class="toggle"><input type="checkbox" class="sw" data-g="tags" ${opt.tags ? "checked" : ""}> 显示标签</label>
          <div class="field"><span>颜色</span>${U.segRadios("g-color", 'data-g="color"', opt.color, [["folder", "按文件夹"], ["status", "按状态"]], "颜色")}</div>
          <div class="field"><span>斥力</span>${U.slider("g-repel", 'data-g="repel"', opt.repel, { min: 10, max: 100, def: 60, label: "斥力" })}</div>
          <div class="field"><span>连线长度</span>${U.slider("g-link", 'data-g="link"', opt.link, { min: 10, max: 100, def: 50, label: "连线长度" })}</div>
        </aside>
      </div>`;
    cv = W.$("#graph-cv"); ctx = cv.getContext("2d"); mounted = true;
    resize(); build();
    // 先在后台把布局算个大概，第一帧就是排好的样子，不会从一团乱点开始飘
    const warm = nodes.some((p) => p._warm) ? 0 : Math.min(200, 20000 / Math.max(1, nodes.length));
    // 最多算 60ms，剩下的在画面里慢慢散开，大库也不会卡住切页
    const t0 = performance.now(); for (let i = 0; i < warm && performance.now() - t0 < 60; i++) step();
    nodes.forEach((p) => (p._warm = true));
    if (!G._fitted) { G._fitted = true; fit(); } else draw();
    kick(0.3);
    bind();
  };
  G.leave = () => { mounted = false; cancelAnimationFrame(raf); raf = 0; };
  function resize() {
    if (!cv) return; const r = cv.getBoundingClientRect(); dpr = devicePixelRatio || 1; W0 = r.width; H0 = r.height;
    cv.width = Math.round(W0 * dpr); cv.height = Math.round(H0 * dpr); draw();
  }
  function fit() {
    if (!nodes.length) return;
    const xs = nodes.map((p) => p.x), ys = nodes.map((p) => p.y), w = Math.max(...xs) - Math.min(...xs) + 80, h = Math.max(...ys) - Math.min(...ys) + 80;
    view.k = Math.max(0.3, Math.min(2, Math.min(W0 / w, H0 / h))); view.x = -(Math.max(...xs) + Math.min(...xs)) / 2; view.y = -(Math.max(...ys) + Math.min(...ys)) / 2; draw();
  }
  function bind() {
    const v = W.$("#v-graph");
    cv.addEventListener("pointerdown", (e) => {
      const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, p = hit(sx, sy);
      cv.setPointerCapture(e.pointerId);
      if (p) { drag = { p, moved: false, sx, sy }; p.fixed = true; kick(0.3); } else pan = { sx, sy, vx: view.x, vy: view.y };
    });
    cv.addEventListener("pointermove", (e) => {
      const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (drag) { const [wx, wy] = toWorld(sx, sy); drag.p.x = wx; drag.p.y = wy; if (Math.hypot(sx - drag.sx, sy - drag.sy) > 4) drag.moved = true; kick(0.3); return; }
      if (pan) { view.x = pan.vx + (sx - pan.sx) / view.k; view.y = pan.vy + (sy - pan.sy) / view.k; draw(); return; }
      const h = hit(sx, sy); if (h !== hover) { hover = h; cv.style.cursor = h ? "pointer" : "grab"; draw(); }
    });
    const up = (e) => {
      if (drag) { const { p, moved } = drag; p.fixed = false; drag = null; if (!moved && p.kind === "note") { W.App.go("desk"); W.Desk.open(p.id, { newTab: e.metaKey || e.ctrlKey }); } else if (!moved && p.kind === "missing") W.Links.follow(p.label); }
      pan = null;
    };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", () => { if (drag) drag.p.fixed = false; drag = pan = null; });
    cv.addEventListener("pointerleave", () => { if (hover) { hover = null; draw(); } });
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, [wx, wy] = toWorld(sx, sy);
      view.k = Math.max(0.2, Math.min(4, view.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018))));
      view.x = (sx - W0 / 2) / view.k - wx; view.y = (sy - H0 / 2) / view.k - wy; draw();
    }, { passive: false });
    v.addEventListener("click", (e) => { if (e.target.closest('[data-g="fit"]')) fit(); });
    v.addEventListener("input", (e) => {
      const t = e.target, g = t.dataset.g, nm = t.name;
      if (nm === "g-scope") { opt.local = t.value === "local"; saveOpt(); G.render(); return; }
      if (!g) return;
      opt[g] = t.type === "checkbox" ? t.checked : t.type === "range" || t.dataset.num != null ? +t.value : t.value;
      saveOpt();
      if (g === "repel" || g === "link") kick(0.6); else { if (g === "depth") G.render(); else { build(); kick(0.8); } }
    });
  }
  addEventListener("resize", W.debounce(() => { if (mounted) resize(); }, 120));
  // 笔记变了（新建、改名、加链接）就在后台重算，回到图谱时是新的
  W.on("text", W.debounce(() => { if (mounted) { build(); kick(0.3); } }, 800));
  return G;
})();
