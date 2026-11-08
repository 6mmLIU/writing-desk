/* 编辑器：textarea 负责输入（中文输入法、撤销都原生可靠），下面垫一层同排版的"镜像"画高亮。
   批注用字符区间锚定；每次输入按"公共前后缀"算出改动区，把区间整体平移，原文被改到的批注标记为"已改动"。
   分屏时每个窗格一个编辑器实例（W.Editors.make）；W.Editor 永远指向当前聚焦的那个，旧代码照常用。 */
(() => {
  const editors = [];
  let active = null;
  W.Editor = new Proxy({}, { get: (_, k) => active?.[k], set: (_, k, v) => { if (active) active[k] = v; return true; } });
  W.Editors = {
    all: editors,
    get active() { return active; },
    setActive(e) { if (e && e !== active) { active?.hideBar?.(true); active = e; } },
    forNote(id) { return editors.filter((e) => e.note?.id === id); },
    remove(e) { const i = editors.indexOf(e); if (i >= 0) editors.splice(i, 1); if (active === e) active = editors[0] || null; },
    make: (wrap, scroller) => make(wrap, scroller),
  };

  function make(wrap, scroller) {
    const E = { ta: null, mir: null, note: null, score: [], showScore: true, flash: null, pending: null };
    Object.defineProperty(E, "lintOn", { get: () => W.S.ui.lintOn !== false, set: (v) => { W.S.ui.lintOn = v; } });
    let last = "";
    wrap.innerHTML = `<div class="ed-mirror" aria-hidden="true"></div><textarea class="ed-ta" spellcheck="false" autocomplete="off" aria-label="正文"></textarea>`;
    E.wrap = wrap; E.mir = wrap.firstChild; E.ta = wrap.lastChild; E.scroller = scroller;
    E.ta.addEventListener("focus", () => { W.Editors.setActive(E); W.emit("editor:focus", E); });
    E.ta.addEventListener("input", onInput);
    for (const ev of ["mouseup", "keyup", "select"]) E.ta.addEventListener(ev, () => setTimeout(() => Bar.onSel(E), 0));
    E.ta.addEventListener("keydown", onKey);
    E.ta.addEventListener("blur", () => setTimeout(() => { if (!W.$("#selbar").contains(document.activeElement)) Bar.maybeHide(E); Suggest.close(); }, 150));
    E.ta.addEventListener("click", onClick);
    scroller?.addEventListener("scroll", () => { if (active === E) { Bar.position(); Suggest.close(); } }, { passive: true });
    editors.push(E); if (!active) active = E;

    E.value = () => E.ta?.value ?? "";
    E.load = (note) => {
      E.note = note; E.score = []; E.pending = null; Bar.hide(true);
      E.ta.value = note?.text || ""; last = E.ta.value;
      E.ta.readOnly = !note;
      E.ta.placeholder = note ? "从这里开始写。选中任意一段文字，可以批注、让 AI 改。\n\n# 用井号写标题\n[[笔记名]] 链接到另一篇笔记\n[配图：s1 说明] 标出配图位置" : "左边新建一篇笔记";
      if (note) reanchorAll(note);
      E.paint();
    };
    // 另一个窗格改了同一篇：把内容同步过来，尽量保住光标
    E.syncFrom = (note) => {
      if (E.note !== note || E.ta.value === note.text) return;
      const s = E.ta.selectionStart, e = E.ta.selectionEnd, focused = document.activeElement === E.ta;
      E.ta.value = note.text; last = note.text;
      if (focused) E.ta.setSelectionRange(Math.min(s, note.text.length), Math.min(e, note.text.length));
      paintSoon();
    };
    E.readonly = (on) => { if (E.ta) { E.ta.readOnly = on; E.wrap.classList.toggle("is-streaming", on); } };
    E.setStreaming = (text) => { E.ta.value = text; last = text; E.paint(); };
    E.hideBar = (f) => Bar.hide(f);
    E.positionBar = () => Bar.position();

    // ---------- 输入与锚点平移 ----------
    function onInput() {
      const now = E.ta.value, note = E.note;
      if (note) {
        const d = diff(last, now);
        for (const a of note.annotations || []) shift(a, d, now);
        note.text = now;
        W.saveNote(note, 1200);
        W.emit("text", note, E);
      }
      last = now;
      paintSoon();
      Suggest.check(E);
    }
    function diff(a, b) {
      let p = 0; const n = Math.min(a.length, b.length);
      while (p < n && a[p] === b[p]) p++;
      let s = 0; while (s < n - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
      return { p, oldEnd: a.length - s, newEnd: b.length - s, delta: b.length - a.length };
    }
    function shift(a, d, text) {
      if (a.orphan || a.start == null) return;
      if (a.end <= d.p) return;
      if (a.start >= d.oldEnd) { a.start += d.delta; a.end += d.delta; return; }
      a.start = Math.min(a.start, d.p);
      a.end = Math.max(a.start, a.end <= d.oldEnd ? d.newEnd : a.end + d.delta);
      if (a.status === "open" || a.status === "proposed") a.edited = true;
      a.current = text.slice(a.start, a.end);
      if (a.end <= a.start) a.orphan = true;
    }
    function reanchorAll(note) {
      const t = note.text || "";
      for (const a of note.annotations || []) {
        if (a.start != null && t.slice(a.start, a.end) === (a.current ?? a.quote)) continue;
        const q = a.current ?? a.quote; if (!q) { a.orphan = true; continue; }
        let best = -1, bestD = Infinity, i = -1;
        while ((i = t.indexOf(q, i + 1)) !== -1) { const dd = Math.abs(i - (a.start ?? 0)); if (dd < bestD) { best = i; bestD = dd; } }
        if (best >= 0) { a.start = best; a.end = best + q.length; a.orphan = false; } else a.orphan = true;
      }
    }
    E.reanchor = () => { if (E.note) { reanchorAll(E.note); E.paint(); } };
    E.findRange = (q, near = 0) => {
      const t = E.value(); if (!q) return null;
      let best = -1, bestD = Infinity, i = -1;
      while ((i = t.indexOf(q, i + 1)) !== -1) { const dd = Math.abs(i - near); if (dd < bestD) { best = i; bestD = dd; } }
      if (best < 0 && q.length > 12) {
        const core = q.replace(/^[\s“"「（(]+|[\s。！？”"」）)]+$/g, "");
        if (core !== q) return E.findRange(core, near);
      }
      return best < 0 ? null : { start: best, end: best + q.length };
    };
    // 用 execCommand 替换，保留原生撤销
    E.replace = (start, end, text) => {
      const ta = E.ta, ro = ta.readOnly; ta.readOnly = false;
      ta.focus({ preventScroll: true }); ta.setSelectionRange(start, end);
      let ok = false;
      try { ok = document.execCommand("insertText", false, text); } catch {}
      if (!ok) { ta.setRangeText(text, start, end, "end"); onInput(); }
      ta.readOnly = ro;
    };
    E.select = (start, end, focus = true) => {
      if (focus) E.ta.focus({ preventScroll: true });
      E.ta.setSelectionRange(start, end);
      E.flash = { start, end }; E.paint();
      E.scrollTo(start);
      clearTimeout(E._ft); E._ft = setTimeout(() => { E.flash = null; E.paint(); }, 1400);
    };
    E.scrollTo = (pos) => {
      const r = markerRect(pos), sc = E.scroller;
      if (!r || !sc) return;
      const box = sc.getBoundingClientRect();
      if (r.top < box.top + 80 || r.bottom > box.bottom - 80) sc.scrollBy({ top: r.top - box.top - box.height / 3, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    };

    // ---------- 镜像高亮 ----------
    const paintSoon = W.debounce(() => E.paint(), 90);
    E.paint = (markers = []) => {
      if (!E.mir) return;
      const t = E.value(), note = E.note, R = [];
      let pos = 0;
      for (const line of t.split("\n")) {
        let m;
        if ((m = line.match(/^(#{1,4})\s/))) { R.push({ s: pos, e: pos + m[1].length + 1, c: "k-syn" }); R.push({ s: pos + m[1].length + 1, e: pos + line.length, c: "k-head" }); }
        else if ((m = line.match(/^(>\s?|\s*[-*]\s|\s*\d+[.、]\s)/))) R.push({ s: pos, e: pos + m[1].length, c: "k-syn" });
        if (/^\[配图[：:]/.test(line)) R.push({ s: pos, e: pos + line.length, c: "k-fig" });
        for (const mm of line.matchAll(/\*\*|==/g)) R.push({ s: pos + mm.index, e: pos + mm.index + 2, c: "k-syn" });
        pos += line.length + 1;
      }
      // [[双链]]：能找到的笔记是蓝色，找不到的是虚线
      for (const l of W.Links.parse(t)) {
        R.push({ s: l.start, e: l.start + 2, c: "k-syn" }); R.push({ s: l.end - 2, e: l.end, c: "k-syn" });
        R.push({ s: l.start + 2, e: l.end - 2, c: W.Links.resolve(l.target) ? "k-link" : "k-link miss" });
      }
      for (const m of t.matchAll(/(^|\s)#([\p{L}\p{N}_\-/]+)/gu)) R.push({ s: m.index + m[1].length, e: m.index + m[0].length, c: "k-tag" });
      if (note && E.lintOn) {
        const key = note.id + "|" + t;
        if (E._lintKey !== key) { E._lintKey = key; E.lastLint = W.lint(t, note); if (active === E) W.emit("lint", E.lastLint, E); }
        const L = E.lastLint;
        for (const x of L.aiTaste) R.push({ s: x.start, e: x.end, c: "k-ai" });
        for (const x of L.needs) R.push({ s: x.start, e: x.end, c: "k-need" });
        for (const x of L.exclaim) R.push({ s: x.start, e: x.end, c: "k-ai" });
        for (const x of L.longParas) R.push({ s: x.start, e: x.end, c: "k-long" });
      } else if (note && E._lintKey !== note.id + "|" + t) { E._lintKey = note.id + "|" + t; E.lastLint = W.lint(t, note); }
      if (note) for (const a of note.annotations || []) {
        if (a.orphan || a.start == null || a.status === "dismissed") continue;
        const cls = a.status === "applied" ? "k-done" : a.type === "keep" ? "k-keep" : "k-anno";
        R.push({ s: a.start, e: a.end, c: cls + (a.id === E.activeId ? " k-on" : "") + (a.id === W._freshAnno && Date.now() - W._freshAt < 900 ? " k-fresh" : "") });
      }
      if (E.showScore) for (const s of E.score) R.push({ s: s.start, e: s.end, c: "k-" + s.mark });
      if (E.pending) R.push({ s: E.pending.start, e: E.pending.end, c: "k-sel" });
      if (E.flash) R.push({ s: E.flash.start, e: E.flash.end, c: "k-flash" });
      E.mir.innerHTML = build(t, R, markers);
    };
    function markerRect(pos) {
      E.paint([{ id: "mk-x", at: pos }]);
      return document.getElementById("mk-x")?.getBoundingClientRect();
    }
    E.rectFor = (start, end) => {
      E.paint([{ id: "mk-a", at: start }, { id: "mk-b", at: end }]);
      const a = document.getElementById("mk-a")?.getBoundingClientRect(), b = document.getElementById("mk-b")?.getBoundingClientRect();
      return a && b ? { top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom), left: a.left, right: b.right, ax: a.left, bx: b.left, ay: a.top, by: b.bottom } : null;
    };

    // ---------- 键盘与点击 ----------
    function onClick(e) {
      const p = E.ta.selectionStart; if (E.ta.selectionEnd !== p || !E.note) return;
      // ⌘ 点击双链：打开那篇（没有就新建）；再按住 Option 在另一侧分屏打开
      if (e.metaKey || e.ctrlKey) {
        const l = W.Links.parse(E.value()).find((x) => x.start < p && x.end > p);
        if (l) { e.preventDefault(); W.Links.follow(l.target, { split: e.altKey, newTab: e.shiftKey }); return; }
      }
      const hit = (E.note.annotations || []).find((a) => !a.orphan && a.status !== "dismissed" && a.start <= p && a.end >= p);
      if (hit) W.emit("anno:focus", hit.id);
    }
    function onKey(e) {
      if (Suggest.key(e, E)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j" && !window.desk) { e.preventDefault(); Bar.annotateSelection(E); }
      if (e.key === "Escape") Bar.hide(true);
    }
    return E;
  }

  function build(t, R, markers) {
    const pts = new Set([0, t.length]);
    for (const r of R) { r.s = W.clamp(r.s, 0, t.length); r.e = W.clamp(r.e, 0, t.length); if (r.e > r.s) { pts.add(r.s); pts.add(r.e); } }
    for (const m of markers) pts.add(W.clamp(m.at, 0, t.length));
    const arr = [...pts].sort((a, b) => a - b);
    let html = "";
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      for (const m of markers) if (W.clamp(m.at, 0, t.length) === a) html += `<span class="mk" id="${m.id}"></span>`;
      if (i === arr.length - 1) break;
      const b = arr[i + 1], seg = t.slice(a, b);
      const cls = [...new Set(R.filter((r) => r.s <= a && r.e >= b && r.e > r.s).flatMap((r) => r.c.split(" ")))];
      html += cls.length ? `<span class="${cls.join(" ")}">${W.esc(seg)}</span>` : W.esc(seg);
    }
    return html + "​";
  }

  // ---------- 选区工具条（同一个容器展开成批注编辑框）：所有编辑器共用一个 ----------
  const Bar = (() => {
    let bar, chosenType = "rewrite", owner = null;
    const setup = () => {
      if (bar) return; bar = W.$("#selbar");
      const types = window.DEF.annoTypes;
      W.$("#sb-quick").innerHTML = types.filter((t) => ["rewrite", "cut", "expand", "example", "keep"].includes(t.id))
        .map((t) => `<button type="button" class="sb-btn" data-type="${t.id}">${t.name}</button>`).join("") +
        `<span class="sb-sep" aria-hidden="true"></span><button type="button" class="sb-btn" data-sb-illus title="给这一段配一张图（在右侧“配图”里）">${W.UI.icon("image", 15)}配图</button>` +
        `<button type="button" class="sb-btn sb-more" data-type="custom">批注…</button>`;
      W.$("#sb-types").innerHTML = types.map((t) => `<button type="button" class="chip" data-type="${t.id}" title="${t.hint}">${t.name}</button>`).join("");
      bar.addEventListener("mousedown", (e) => { if (!e.target.closest("textarea,input,label")) e.preventDefault(); });
      bar.addEventListener("click", (e) => {
        const chip = e.target.closest("#sb-types .chip");
        if (chip) { chosenType = chip.dataset.type; W.$$("#sb-types .chip").forEach((x) => x.classList.toggle("on", x === chip)); return; }
        if (e.target.closest("[data-sb-illus]")) { const p = owner?.pending; hide(true); W.Illus.fromSelection(p); return; }
        const b = e.target.closest("[data-type]");
        if (b) { open(b.dataset.type); return; }
        const act = e.target.closest("[data-sb]")?.dataset.sb;
        if (act === "cancel") hide(true);
        if (act === "save") save(false);
        if (act === "now") save(true);
      });
      W.$("#sb-note").addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(e.shiftKey); }
        if (e.key === "Escape") { e.preventDefault(); hide(true); owner?.ta.focus(); }
      });
      window.addEventListener("resize", W.debounce(() => position(), 80));
    };
    const onSel = (E) => {
      setup();
      if (!E.note || E.ta.readOnly) return;
      const { selectionStart: s, selectionEnd: e } = E.ta;
      if (e > s && E.value().slice(s, e).trim()) {
        if (bar.classList.contains("open")) return;
        owner = E; E.pending = { start: s, end: e, quote: E.value().slice(s, e) };
        show();
      } else if (!bar.classList.contains("open")) hide();
    };
    const annotateSelection = (E = active) => {
      if (!E) return; setup();
      const { selectionStart: s, selectionEnd: t } = E.ta;
      if (t > s) { owner = E; E.pending = { start: s, end: t, quote: E.value().slice(s, t) }; show(); open("custom"); }
      else W.toast("先在正文里选中一段文字");
    };
    const show = () => { bar.hidden = false; W.raf(() => { position(); bar.classList.add("show"); }); };
    const maybeHide = () => { if (bar && !bar.classList.contains("open")) hide(); };
    const hide = (force) => {
      if (!bar) return;
      if (bar.classList.contains("open") && !force) return;
      bar.classList.remove("show", "open");
      if (owner) { owner.pending = null; owner.paint(); }
      clearTimeout(hide._t); hide._t = setTimeout(() => { if (!bar.classList.contains("show")) bar.hidden = true; }, 200);
    };
    const position = () => {
      const E = owner;
      if (!bar || bar.hidden || !E?.pending) return;
      const r = E.rectFor(E.pending.start, E.pending.end); if (!r) return;
      const vw = innerWidth, vh = innerHeight, bw = bar.offsetWidth, bh = bar.offsetHeight, g = 12;
      const x = W.clamp((r.ax + r.bx) / 2 - bw / 2, g, vw - bw - g);
      let y = r.ay - bh - 10, below = false;
      if (y < 64) { y = r.by + 10; below = true; }
      if (y + bh > vh - g) y = Math.max(g, vh - bh - g);
      bar.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      bar.dataset.below = below;
    };
    const open = (type) => {
      const E = owner; if (!E?.pending) return;
      chosenType = type;
      W.$$("#sb-types .chip").forEach((c) => c.classList.toggle("on", c.dataset.type === type));
      W.$("#sb-quote").textContent = E.pending.quote.length > 120 ? E.pending.quote.slice(0, 120) + "…" : E.pending.quote;
      W.$("#sb-note").value = "";
      W.$("#sb-remember").checked = type === "keep";
      W.$("#sb-note").placeholder = type === "keep" ? "好在哪？（会记进“保持这些写法”）" : "怎么改？写具体一点，比如：换成一个外卖的例子；删掉第二句……（可以不写）";
      bar.classList.add("open"); E.paint();
      W.raf(() => { position(); W.$("#sb-note").focus({ preventScroll: true }); });
    };
    const save = (now) => {
      const E = owner; if (!E?.pending || !E.note) return;
      const a = { id: W.uid("a"), start: E.pending.start, end: E.pending.end, quote: E.pending.quote, type: chosenType,
        note: W.$("#sb-note").value.trim(), remember: W.$("#sb-remember").checked, status: "open", by: "me", createdAt: W.now() };
      (E.note.annotations ||= []).push(a);
      W._freshAnno = a.id; W._freshAt = Date.now(); // 新批注：荧光笔从左往右划过去
      W.saveNote(E.note, 300);
      hide(true); E.activeId = a.id; E.paint();
      W.Editors.setActive(E);
      W.emit("anno:new", a, now);
    };
    return { onSel, annotateSelection, hide, maybeHide, position };
  })();
  W.Editors.annotateSelection = () => Bar.annotateSelection();

  // ---------- [[ 自动补全：输入 [[ 后弹出笔记名 ----------
  const Suggest = (() => {
    let box = null, items = [], idx = 0, ctx = null;
    const el = () => box ||= Object.assign(document.body.appendChild(document.createElement("div")), { className: "link-suggest", hidden: true, role: "listbox" });
    const close = () => { if (box) box.hidden = true; ctx = null; };
    const check = (E) => {
      const t = E.value(), p = E.ta.selectionStart;
      const m = t.slice(Math.max(0, p - 80), p).match(/\[\[([^\[\]\n|#]*)$/);
      if (!m) return close();
      const q = m[1];
      items = W.Links.search(q, E.note?.id).slice(0, 8);
      if (q.trim() && !items.some((n) => n.title === q.trim())) items.push({ create: true, title: q.trim() });
      if (!items.length) return close();
      ctx = { E, from: p - q.length, to: p }; idx = 0; render();
      const r = E.rectFor(p, p); E.paint(); if (!r) return;
      const b = el(); b.hidden = false;
      b.style.left = Math.min(r.ax, innerWidth - 300) + "px"; b.style.top = Math.min(r.by + 6, innerHeight - b.offsetHeight - 8) + "px";
    };
    const render = () => {
      el().innerHTML = items.map((n, i) => `<div class="ls-item ${i === idx ? "on" : ""}" role="option" aria-selected="${i === idx}" data-i="${i}">${n.create ? `<span class="ls-new">${W.UI.icon("plus", 14)}新建「${W.esc(n.title)}」</span>` : `<b>${W.esc(n.title)}</b>${n.folder ? `<span class="muted small">${W.esc(n.folder)}</span>` : ""}`}</div>`).join("") +
        `<div class="ls-foot muted">↑↓ 选择 · 回车插入 · Esc 关闭</div>`;
    };
    const pick = (i) => {
      const it = items[i]; if (!it || !ctx) return;
      const { E, from, to } = ctx, t = E.value();
      const closeBr = t.slice(to, to + 2) === "]]" ? "" : "]]";
      E.replace(from, to, it.title + closeBr);
      E.ta.setSelectionRange(from + it.title.length + 2, from + it.title.length + 2);
      close();
    };
    const key = (e, E) => {
      if (!ctx || ctx.E !== E || box?.hidden) return false;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); idx = (idx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; render(); return true; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(idx); return true; }
      if (e.key === "Escape") { e.preventDefault(); close(); return true; }
      return false;
    };
    document.addEventListener("mousedown", (e) => { const it = e.target.closest?.(".link-suggest .ls-item"); if (it) { e.preventDefault(); pick(+it.dataset.i); } });
    return { check, key, close };
  })();
})();
