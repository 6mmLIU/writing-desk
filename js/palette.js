/* 快速切换（⌘O）和命令面板（⌘P），像 Obsidian。所有命令也在这里登记，Mac App 的菜单栏发来的就是这些命令名。 */
W.Cmd = (() => {
  const S = W.S, I = (n, s) => W.UI.icon(n, s);
  const C = {};
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const k = (s) => (mac ? s : s.replace(/⌘/g, "Ctrl+").replace(/⇧/g, "Shift+").replace(/⌥/g, "Alt+"));
  const desk = () => { if (S.ui.view !== "desk") W.App.go("desk"); };
  const need = (fn) => () => { desk(); if (!W.note()) { W.toast("先打开一篇笔记"); return; } fn(); };
  const views = { desk: "写作", topics: "选题", illus: "配图（写作页右侧）", graph: "关系图谱", souls: "灵魂", mind: "用户心智", nature: "人性表", memory: "记忆", settings: "参数" };

  // id: [名字, 分组, 运行, 快捷键]
  const list = {
    "switcher": ["快速切换笔记", "笔记", () => C.open("switcher"), "⌘O"],
    "palette": ["命令面板", "通用", () => C.open("commands"), "⌘P"],
    "note:new": ["新建笔记", "笔记", () => { desk(); W.Desk.create({ status: "draft" }, { newTab: true }); }, "⌘N"],
    "note:new-ai": ["让 AI 写一篇", "笔记", () => { desk(); W.Desk.create({ status: "idea" }, { newTab: true }); W.Desk.setTab("write"); }, "⇧⌘N"],
    "folder:new": ["新建文件夹", "笔记", () => { desk(); W.Desk.newFolder(); }],
    "search": ["搜索全部笔记", "笔记", () => W.Desk.sideMode("search"), "⇧⌘F"],
    "tab:close": ["关闭标签页", "窗格", () => W.Desk.closeTab(), "⌘W"],
    "split": ["向右分屏 / 切到另一侧", "窗格", () => { desk(); W.Desk.split(); }, "⌘\\"],
    "mode:toggle": ["切换编辑 / 预览", "窗格", () => { desk(); S.ui.mode = S.ui.mode === "preview" ? "edit" : "preview"; W.Desk.renderPanes(); }, "⌘E"],
    "toggle:notes": ["显示 / 隐藏笔记栏", "窗格", () => { desk(); W.Desk.toggleSide(); }, "⌘["],
    "toggle:insp": ["显示 / 隐藏 AI 面板", "窗格", () => { desk(); document.body.classList.toggle(innerWidth < 1000 ? "show-insp" : "hide-insp"); }, "⌘]"],
    "anno:new": ["批注选中的文字", "写作", () => W.Editors.annotateSelection(), "⌘J"],
    "write": ["写初稿", "AI", need(() => W.Desk.write())],
    "topic": ["打选题卡", "AI", need(() => W.Desk.topic())],
    "score": ["给这篇评分", "AI", need(() => W.Desk.score())],
    "iterate": ["自动迭代到达标", "AI", need(() => W.Desk.iterate())],
    "titles": ["起标题", "AI", need(() => W.Desk.titles())],
    "pack": ["写分发包", "AI", need(() => W.Desk.pack())],
    "revise-all": ["按全部批注改", "AI", need(() => W.Desk.reviseAnnos())],
    "distill": ["从批注提炼记忆", "AI", need(() => W.Memory.distill(W.note()))],
    "topics:run": ["联网找选题", "AI", () => { W.App.go("topics"); setTimeout(() => W.$('[data-tp="run"]')?.click(), 60); }],
    "illus:plan": ["生成配图计划", "AI", need(() => { W.App.go("illus"); setTimeout(() => W.$('[data-il="plan"]')?.click(), 60); })],
    "links": ["看反向链接", "写作", need(() => W.Desk.setTab("links"))],
    "insert:link": ["插入 [[链接]]", "写作", need(() => { const e = W.Editor; e.ta.focus(); e.replace(e.ta.selectionStart, e.ta.selectionEnd, "[["); })],
    "note:export": ["导出这篇为 Markdown", "笔记", need(() => { const n = W.note(); W.download(W.Desk.titleOf(n).replace(/[\\/:*?"<>|]/g, "") + ".md", n.text || "", "text/markdown"); }), "⇧⌘E"],
    "note:pin": ["置顶 / 取消置顶", "笔记", need(() => { const n = W.note(); n.pinned = !n.pinned; W.saveNote(n, 0); W.Desk.renderList(); })],
    "note:delete": ["删除这篇笔记", "笔记", need(() => W.Desk.deleteNote(W.note()))],
    "sample": ["打开示例笔记", "笔记", () => { desk(); W.Desk.loadSample(); }],
    ...Object.fromEntries(Object.entries(views).map(([v, nm]) => ["view:" + v, ["去「" + nm + "」", "页面", () => W.App.go(v), v === "graph" ? "⌘G" : v === "settings" ? "⌘," : ""]])),
    ...(window.desk ? {
      "ai:settings": ["设置 AI 服务（API key）", "通用", () => W.Panels.aiSettings()],
      "vault:open": ["打开别的写作库…", "通用", () => window.desk.vault.choose()],
      "vault:reveal": ["在访达中显示写作库", "通用", () => window.desk.vault.reveal()],
    } : {}),
  };
  C.list = list;
  C.run = (id) => { const c = list[id]; if (c) c[2](); else console.warn("unknown command", id); };

  // ---------- 弹出面板 ----------
  let root = null, mode = "", items = [], idx = 0;
  C.open = (m) => {
    if (root) C.close(true);
    mode = m; idx = 0;
    root = document.createElement("div");
    root.className = "palette";
    root.innerHTML = `<div class="pal-back"></div><div class="pal-card" role="dialog" aria-label="${m === "switcher" ? "快速切换笔记" : "命令面板"}">
      <div class="pal-input">${I(m === "switcher" ? "search" : "command", 17)}<input id="pal-q" autocomplete="off" spellcheck="false" placeholder="${m === "switcher" ? "输入笔记名…  回车打开，⌘回车在新标签页打开" : "输入命令…"}" aria-label="搜索"></div>
      <div class="pal-list" role="listbox"></div>
      <div class="pal-foot muted">${m === "switcher" ? "↑↓ 选择 · ↵ 打开 · ⌘↵ 新标签页 · ⌥↵ 另一侧 · Esc 关闭" : "↑↓ 选择 · ↵ 执行 · Esc 关闭"}</div></div>`;
    document.body.append(root);
    const q = root.querySelector("#pal-q");
    q.addEventListener("input", () => { idx = 0; render(q.value); });
    q.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); idx = (idx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % Math.max(1, items.length); render(q.value, true); }
      else if (e.key === "Enter") { e.preventDefault(); pick(idx, e); }
      else if (e.key === "Escape") { e.preventDefault(); C.close(); }
    });
    root.addEventListener("mousedown", (e) => { if (e.target.classList.contains("pal-back")) C.close(); });
    root.addEventListener("click", (e) => { const it = e.target.closest(".pal-item"); if (it) pick(+it.dataset.i, e); });
    root.addEventListener("mousemove", (e) => { const it = e.target.closest(".pal-item"); if (it && +it.dataset.i !== idx) { idx = +it.dataset.i; mark(); } });
    render("");
    W.raf(() => { root.classList.add("in"); q.focus(); });
  };
  C.close = (now) => { if (!root) return; const r = root; root = null; if (now) return r.remove(); r.classList.remove("in"); r.classList.add("out"); setTimeout(() => r.remove(), 180); };
  const mark = () => root.querySelectorAll(".pal-item").forEach((el, i) => { el.classList.toggle("on", i === idx); el.setAttribute("aria-selected", i === idx); if (i === idx) el.scrollIntoView({ block: "nearest" }); });
  function render(q, keep) {
    const box = root.querySelector(".pal-list"), key = q.trim().toLowerCase();
    if (mode === "switcher") {
      const recent = S.ui.recent || [];
      const rank = (n) => { const i = recent.indexOf(n.id); return i < 0 ? 999 : i; };
      items = S.notes.map((n) => ({ n, t: W.Desk.titleOf(n), s: key ? Math.max(W.Links.score(W.Desk.titleOf(n), key), W.Links.score(n.folder || "", key) * 0.3) : 1 }))
        .filter((x) => x.s > 0).sort((a, b) => b.s - a.s || rank(a.n) - rank(b.n) || (b.n.updatedAt > a.n.updatedAt ? 1 : -1)).slice(0, 40)
        .map((x) => ({ type: "note", id: x.n.id, title: x.t, sub: x.n.folder || "", status: x.n.status }));
      if (key && !items.some((x) => x.title.toLowerCase() === key)) items.push({ type: "create", title: q.trim() });
    } else {
      items = Object.entries(list).map(([id, [name, group, , kb]]) => ({ type: "cmd", id, title: name, sub: group, kb, s: key ? Math.max(W.Links.score(name, key), W.Links.score(group, key) * 0.5) : 1 }))
        .filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    }
    if (!keep && idx >= items.length) idx = 0;
    box.innerHTML = items.length ? items.map((it, i) => `<div class="pal-item ${i === idx ? "on" : ""}" role="option" aria-selected="${i === idx}" data-i="${i}">
      ${it.type === "note" ? `<i class="sdot st-${it.status}"></i>` : it.type === "create" ? I("plus", 15) : ""}
      <span class="pal-title">${it.type === "create" ? `新建笔记「${W.esc(it.title)}」` : hl(it.title, key)}</span>
      ${it.sub ? `<span class="pal-sub">${W.esc(it.sub)}</span>` : ""}${it.kb ? `<kbd class="pal-kb">${k(it.kb)}</kbd>` : ""}</div>`).join("")
      : `<div class="pal-empty muted">没有匹配的${mode === "switcher" ? "笔记" : "命令"}</div>`;
    if (keep) mark();
  }
  const hl = (t, key) => { if (!key) return W.esc(t); const i = t.toLowerCase().indexOf(key); return i < 0 ? W.esc(t) : W.esc(t.slice(0, i)) + `<mark>${W.esc(t.slice(i, i + key.length))}</mark>` + W.esc(t.slice(i + key.length)); };
  function pick(i, e) {
    const it = items[i]; if (!it) return;
    C.close();
    if (it.type === "cmd") return setTimeout(() => C.run(it.id), 0);
    if (S.ui.view !== "desk") W.App.go("desk");
    const o = { newTab: e?.metaKey || e?.ctrlKey, pane: e?.altKey ? W.Desk.otherPane() : undefined };
    if (it.type === "note") W.Desk.open(it.id, o);
    else { const parts = it.title.split("/"), title = parts.pop(); W.Desk.create({ title, folder: parts.join("/") || W.Desk.currentFolder(), status: "draft" }, { ...o, newTab: true }); }
  }

  // 网页版自己处理快捷键；Mac App 由菜单栏处理（菜单再调 C.run）
  if (!window.desk) document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const key = e.key.toLowerCase(), map = { o: "switcher", p: "palette", "\\": "split", e: "mode:toggle", g: "view:graph", "[": "toggle:notes", "]": "toggle:insp" };
    const id = e.shiftKey ? { f: "search" }[key] : map[key];
    if (id) { e.preventDefault(); C.run(id); }
  });
  return C;
})();
