/* 写作页：笔记管理（文件夹、状态、标签、搜索）、编辑器头尾、右侧面板（写作 / 批注 / 评分 / 过程 / 版本）和所有 AI 流程。 */
W.Desk = (() => {
  const S = W.S, D = window.DEF, E = W.Editor, U = W.UI, I = W.UI.icon;
  const X = {};
  let job = null; // {label, ctl}

  // ================= 笔记 =================
  const newNote = (o = {}) => ({
    id: W.uid("n"), title: "", folder: X.currentFolder(),
    status: "draft", tags: [], platform: S.config.platform, genre: S.config.genre, soul: S.config.activeSoul,
    brief: "", reader: "", promise: "", stance: "", materials: [], natureFocus: [],
    text: "", annotations: [], meta: {}, score: null, iterLog: [], pinned: false, createdAt: W.now(), updatedAt: W.now(), ...o,
  });
  // 新笔记放进哪个文件夹：树里选中的那个；没选就放根目录（网页版放第一个文件夹）
  X.currentFolder = () => (S.ui.folder != null && S.ui.folder !== "all" && S.ui.folder !== "pinned" ? S.ui.folder : W.P.mode === "vault" ? "" : S.folders[0] || "收件箱");
  X.create = (o = {}, open = {}) => {
    const n = newNote(o);
    if (W.P.mode === "vault" && !n.title) { let i = 1; const taken = new Set(S.notes.filter((x) => (x.folder || "") === (n.folder || "")).map(titleOf)); while (taken.has(i === 1 ? "未命名" : "未命名 " + i)) i++; n.title = i === 1 ? "未命名" : "未命名 " + i; }
    S.notes.unshift(n); W.saveNote(n, 0); X.open(n.id, open); X.renderFolders();
    return n;
  };
  X.loadSample = () => {
    const s = W.clone(D.sampleNote);
    const n = newNote({ ...s, annotations: [] });
    n.annotations = s.annotations.map((a) => { const i = n.text.indexOf(a.quote); return { ...a, id: W.uid("a"), start: i, end: i + a.quote.length, orphan: i < 0, by: "me", createdAt: W.now() }; });
    if (W.P.mode === "vault") { n.folder = ""; n.title = "示例：用 AI 做个人 IP 的第 90 天"; }
    S.notes.unshift(n); W.saveNote(n, 0); X.open(n.id); X.renderFolders(); X.setTab("anno");
  };
  const kindOf = (n) => W.platform(n?.platform).kind;
  const titleOf = (n) => W.Links.titleOf(n);
  X.titleOf = titleOf;
  const statusName = (id) => D.statuses.find((s) => s.id === id)?.name || id;

  function searched() {
    const { status, q } = S.ui, k = q.toLowerCase();
    return S.notes.filter((n) => (status === "all" || n.status === status) && (titleOf(n) + "\n" + n.text + "\n" + (n.tags || []).join(" ")).toLowerCase().includes(k))
      .map((n) => { const t = n.text || "", i = t.toLowerCase().indexOf(k); return { n, snip: i < 0 ? t.slice(0, 60) : t.slice(Math.max(0, i - 18), i + 48).replace(/\n/g, " "), inTitle: titleOf(n).toLowerCase().includes(k) }; })
      .sort((a, b) => (b.inTitle - a.inTitle) || (b.n.updatedAt > a.n.updatedAt ? 1 : -1));
  }

  X.renderFolders = () => {
    const cnt0 = W.$("#notes-count"); if (cnt0) cnt0.textContent = S.notes.length;
    // 状态：一行一个，带颜色点和篇数；点一下筛选，再点一下取消；把笔记拖上来就改成这个状态
    const cnt = (id) => (id === "all" ? S.notes.length : S.notes.filter((n) => n.status === id).length);
    W.$("#status-filter").innerHTML = [{ id: "all", name: "全部" }, ...D.statuses].map((s) => `<button type="button" class="st-row ${S.ui.status === s.id ? "on" : ""}" aria-pressed="${S.ui.status === s.id}" data-act="status-filter" data-id="${s.id}"${s.id === "all" ? "" : ` data-drop-status="${s.id}"`}><i class="sdot st-${s.id}" aria-hidden="true"></i><span>${s.name}</span><span class="st-n">${cnt(s.id)}</span></button>`).join("");
  };

  // ---------- 文件树（像 Obsidian 的文件列表：文件夹可折叠，拖动整理） ----------
  const collapsed = new Set(W.ls.get("wbd:collapsed") || []);
  const saveCollapsed = () => W.ls.set("wbd:collapsed", [...collapsed]);
  function treeData() {
    const root = { path: "", name: "", dirs: new Map(), notes: [] };
    const dirOf = (p) => {
      if (!p) return root;
      let node = root, acc = "";
      for (const seg of p.split("/")) { acc = acc ? acc + "/" + seg : seg; if (!node.dirs.has(seg)) node.dirs.set(seg, { path: acc, name: seg, dirs: new Map(), notes: [] }); node = node.dirs.get(seg); }
      return node;
    };
    for (const f of S.folders) dirOf(f);
    for (const n of S.notes) if (S.ui.status === "all" || n.status === S.ui.status) dirOf(n.folder || "").notes.push(n);
    return root;
  }
  const countIn = (d) => d.notes.length + [...d.dirs.values()].reduce((s, x) => s + countIn(x), 0);
  const zh = (a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true });
  function treeHtml(d, depth) {
    const open = new Set(panes.flatMap((p) => p.tabs));
    let h = "";
    for (const sub of [...d.dirs.values()].sort((a, b) => zh(a.name, b.name))) {
      const shut = collapsed.has(sub.path);
      h += `<div class="tr tr-folder ${S.ui.folder === sub.path ? "sel" : ""}" role="treeitem" aria-expanded="${!shut}" tabindex="0" draggable="true" data-folder="${W.esc(sub.path)}" style="--d:${depth}">
        <span class="tr-chev">${I("chev", 12)}</span><span class="tr-name">${W.esc(sub.name)}</span><span class="tr-cnt">${countIn(sub)}</span></div>
        <div class="tr-kids" role="group" style="--d:${depth}" ${shut ? "hidden" : ""}>${treeHtml(sub, depth + 1)}</div>`;
    }
    for (const n of d.notes.sort((a, b) => (b.pinned - a.pinned) || zh(titleOf(a), titleOf(b)))) {
      h += `<button type="button" class="tr tr-note ${n.id === S.ui.noteId ? "on" : ""} ${open.has(n.id) ? "is-open" : ""}" role="treeitem" draggable="true" data-act="open" data-id="${n.id}" style="--d:${depth}" title="${W.esc((n.folder ? n.folder + "/" : "") + titleOf(n))}">
        <i class="sdot st-${n.status}" aria-hidden="true"></i><span class="tr-name">${W.esc(titleOf(n))}</span>${n.pinned ? I("pin", 12) : ""}${n.score ? `<span class="tr-score">${n.score.total}</span>` : ""}</button>`;
    }
    return h;
  }
  X.renderList = () => {
    const box = W.$("#note-list");
    box.classList.toggle("anim", X._listAnim !== false); X._listAnim = false;
    if (S.ui.q) {
      const list = searched();
      box.innerHTML = list.length ? `<div class="tr-search-head muted small">${list.length} 篇包含「${W.esc(S.ui.q)}」</div>` + list.map(({ n, snip }, i) => `<button type="button" class="nitem ${n.id === S.ui.noteId ? "on" : ""}" data-act="open" data-id="${n.id}" draggable="true" style="animation-delay:${Math.min(i, 8) * 25}ms">
        <span class="nitem-top"><span class="nitem-title">${W.esc(titleOf(n))}</span><span class="pill st-${n.status}">${statusName(n.status)}</span></span>
        <span class="nitem-snip">${hl(snip, S.ui.q)}</span><span class="nitem-meta">${W.esc(n.folder || "根目录")}</span></button>`).join("") : `<div class="empty-small">没有找到。换个关键词？</div>`;
      return;
    }
    const t = treeData();
    box.innerHTML = (t.dirs.size || t.notes.length) ? `<div class="tree" role="tree" aria-label="笔记">${treeHtml(t, 0)}</div><div class="tr-root-drop" data-folder="" aria-hidden="true"></div>` : `<div class="empty-small">还没有笔记。点上面的“自己写”或“让 AI 写”。</div>`;
  };
  const hl = (s, q) => { const e = W.esc(s), k = W.esc(q); const i = e.toLowerCase().indexOf(k.toLowerCase()); return i < 0 ? e : e.slice(0, i) + `<mark>${e.slice(i, i + k.length)}</mark>` + e.slice(i + k.length); };

  // ================= 窗格与标签页（可以左右分屏） =================
  const panes = [];
  const PANE_HTML = `<div class="tabbar" role="tablist" aria-label="打开的笔记"></div>
    <header class="doc-head"></header>
    <div class="ed-scroll">
      <div class="paper"><div class="doc-meta"></div><div class="ed"></div><div class="preview" hidden></div></div>
      <div class="desk-empty"><div class="empty">
        <h2>从一篇笔记开始</h2>
        <p class="muted">自己写、让 AI 写都行。写完可以在正文里划线批注，让 AI 按批注改；你纠正过的错误会记进“记忆”，下次不再犯。<br>按 <kbd>⌘</kbd><kbd>O</kbd> 快速打开笔记，<kbd>⌘</kbd><kbd>P</kbd> 打开命令面板。</p>
        <div class="btn-row" style="justify-content:center">
          <button type="button" class="btn" data-act="new-me">自己写一篇</button>
          <button type="button" class="btn primary" data-act="new-ai">让 AI 写</button>
          <button type="button" class="btn ghost" data-act="sample">打开示例笔记</button>
        </div>
        <button type="button" class="link only-narrow" data-act="drawer-notes">打开笔记列表</button>
      </div></div>
    </div>
    <footer class="doc-foot"></footer>`;
  function makePane() {
    const root = document.createElement("div");
    root.className = "desk-main pane"; root.innerHTML = PANE_HTML;
    const q = (s) => root.querySelector(s);
    const p = { root, tabs: [], active: null, el: { tabs: q(".tabbar"), head: q(".doc-head"), meta: q(".doc-meta"), ed: q(".ed"), preview: q(".preview"), foot: q(".doc-foot"), scroll: q(".ed-scroll") } };
    p.editor = W.Editors.make(p.el.ed, p.el.scroll);
    root.addEventListener("mousedown", () => X.focusPane(panes.indexOf(p)), true);
    root.addEventListener("focusin", () => X.focusPane(panes.indexOf(p)));
    W.$("#panes").append(root);
    panes.push(p);
    W.$("#panes").classList.toggle("split", panes.length > 1);
    return p;
  }
  const pane = (i = S.ui.pane) => panes[i] || panes[0];
  X.pane = pane; X.panes = panes;
  const edOf = (n) => (n && (W.Editors.forNote(n.id).find((e) => e === W.Editors.active) || W.Editors.forNote(n.id)[0])) || W.Editors.active;
  const savePanes = () => W.ls.set("wbd:panes", { panes: panes.map((p) => ({ tabs: p.tabs, active: p.active })), cur: S.ui.pane });

  X.open = (id, o = {}) => {
    W.P.flushAll();
    let pi = o.pane ?? S.ui.pane ?? 0;
    if (pi >= panes.length) { makePane(); pi = panes.length - 1; }
    const p = pane(pi), n = W.note(id);
    if (n) {
      if (!p.tabs.includes(id)) {
        const at = p.tabs.indexOf(p.active);
        if (o.newTab || at < 0) p.tabs.splice(at + 1, 0, id); else p.tabs[at] = id; // 和 Obsidian 一样：默认在当前标签页打开
      }
      p.active = id;
      S.ui.recent = [id, ...(S.ui.recent || []).filter((x) => x !== id)].slice(0, 30); W.ls.set("wbd:recent", S.ui.recent);
    } else p.active = null;
    S.ui.pane = pi; S.ui.noteId = n ? id : null; W.ls.set("wbd:last", S.ui.noteId);
    p.editor.load(n); W.Editors.setActive(p.editor);
    panes.forEach((x, i) => x.root.classList.toggle("focused", i === pi && panes.length > 1));
    X.renderPane(pi); X.renderInsp(); X.renderList();
    applyScoreMarks(n);
    closeDrawers(); savePanes();
  };
  X.focusPane = (i) => {
    if (i < 0 || i === S.ui.pane || !panes[i]) return;
    S.ui.pane = i; S.ui.noteId = panes[i].active;
    W.Editors.setActive(panes[i].editor);
    panes.forEach((x, k) => x.root.classList.toggle("focused", k === i));
    X.renderInsp(); X.renderList(); crumb(); savePanes();
  };
  X.otherPane = () => { if (panes.length < 2) { makePane(); } return S.ui.pane === 0 ? 1 : 0; };
  X.split = () => {
    if (panes.length > 1) return X.focusPane(S.ui.pane === 0 ? 1 : 0);
    const cur = S.ui.noteId; makePane();
    X.open(cur, { pane: 1 });
  };
  X.closeTab = (pi = S.ui.pane, id = pane(pi).active) => {
    const p = pane(pi); if (!p) return;
    const i = p.tabs.indexOf(id); if (i < 0 && id) return;
    if (i >= 0) p.tabs.splice(i, 1);
    if (!p.tabs.length && panes.length > 1) return X.closePane(pi);
    if (p.active === id || !id) X.open(p.tabs[Math.max(0, i - 1)] || null, { pane: pi });
    else { X.renderTabs(pi); savePanes(); }
  };
  X.closePane = (pi) => {
    const p = panes[pi]; if (!p || panes.length < 2) return;
    W.Editors.remove(p.editor); p.root.remove(); panes.splice(pi, 1);
    W.$("#panes").classList.remove("split"); panes[0].root.classList.remove("focused");
    S.ui.pane = 0; X.open(panes[0].active, { pane: 0 });
  };
  // 笔记被删掉或改名后，刷新每个窗格
  X.dropNote = (id) => { for (let i = panes.length - 1; i >= 0; i--) if (panes[i].tabs.includes(id)) X.closeTab(i, id); };
  X.renderPane = (pi = S.ui.pane) => {
    const p = pane(pi);
    X.renderTabs(pi); X.renderHead(pi); X.renderPreview(pi); X.renderFoot(p.editor.lastLint, pi); p.root.classList.toggle("no-note", !p.active); if (pi === S.ui.pane) crumb();
    // 换了一篇：稿纸轻轻浮上来（同一个容器，只换内容）
    if (p.active && p._shown !== p.active) { const pa = p.root.querySelector(".paper"); pa.classList.remove("enter"); void pa.offsetWidth; pa.classList.add("enter"); }
    p._shown = p.active;
  };
  X.renderPanes = () => panes.forEach((_, i) => X.renderPane(i));
  X.renderTabs = (pi = S.ui.pane) => {
    const p = pane(pi);
    const seen = p._seenTabs || new Set(p.tabs); p._seenTabs = new Set(p.tabs); // 新开的标签页才弹出来
    p.el.tabs.innerHTML = p.tabs.map((id) => { const n = W.note(id); if (!n) return ""; return `<div class="tab-note ${id === p.active ? "on" : ""}${seen.has(id) ? "" : " new"}" role="tab" aria-selected="${id === p.active}" data-tab="${id}" title="${W.esc((n.folder ? n.folder + "/" : "") + titleOf(n))}">
      <i class="sdot st-${n.status}" aria-hidden="true"></i><span>${W.esc(titleOf(n))}</span><button type="button" class="tab-x" data-act="tab-close" data-id="${id}" aria-label="关闭 ${W.esc(titleOf(n))}">${I("x", 12)}</button></div>`; }).join("") +
      `<button type="button" class="icon-btn sm tab-add" data-act="new-me" aria-label="新标签页里新建笔记">${I("plus", 15)}</button><span class="grow"></span>
       <button type="button" class="icon-btn sm" data-act="split" aria-label="${panes.length > 1 ? "切到另一侧" : "向右分屏"}" title="${panes.length > 1 ? "切到另一侧" : "向右分屏"}（⌘\\）">${I("side", 16)}</button>
       ${panes.length > 1 ? `<button type="button" class="icon-btn sm" data-act="pane-close" data-id="${pi}" aria-label="关闭这一侧">${I("x", 15)}</button>` : ""}`;
  };
  const crumb = () => { const n = W.note(); W.App?.crumb(n ? [...(n.folder ? n.folder.split("/") : []), titleOf(n)] : ["写作"]); };

  // ================= 头部 / 尾部 =================
  // 稿纸底栏右侧的工具：标记开关、存版本、编辑 / 预览、更多（和左侧的字数、问题在同一条上）
  X.renderHead = (pi = S.ui.pane) => {
    const p = pane(pi), n = W.note(p.active), head = p.el.head, meta = p.el.meta;
    if (!n) { head.innerHTML = ""; meta.innerHTML = ""; return; }
    const pl = W.platform(n.platform), ed = p.editor;
    head.innerHTML = `
      <button type="button" class="icon-btn only-narrow" data-act="drawer-notes" aria-label="笔记列表">${I("menu")}</button>
      <label class="dh-hint dh-hide" title="在正文里标出 AI 味句式和太长的段落"><input type="checkbox" class="sw" data-act="lint-toggle" ${ed.lintOn ? "checked" : ""}>标出问题</label>
      <button type="button" class="icon-btn sm dh-hide" data-act="ver-save" aria-label="存一个版本" title="存一个版本">${I("history", 16)}</button>
      <div class="seg sm" role="group" aria-label="视图">
        <button type="button" class="${S.ui.mode !== "preview" ? "on" : ""}" aria-pressed="${S.ui.mode !== "preview"}" data-act="mode" data-id="edit">编辑</button>
        <button type="button" class="${S.ui.mode === "preview" ? "on" : ""}" aria-pressed="${S.ui.mode === "preview"}" data-act="mode" data-id="preview">预览</button>
      </div>
      <button type="button" class="icon-btn sm" data-act="note-menu" aria-label="更多">${I("more", 16)}</button>
      <button type="button" class="icon-btn only-mid" data-act="drawer-insp" aria-label="AI 面板">${I("side")}</button>`;
    // 先让人看到文章：标题下面只留一行轻量摘要（平台 · 体裁 · 状态 · 灵魂），文件夹、标签收进“文档属性”。
    // 正文第一行是“# 标题”时，那才是文章标题；上面的标题框退成“文件名”，未命名时可以一键用文章标题命名
    const folders = [...new Set(["", ...S.folders, n.folder || ""])].sort(zh);
    const h1 = h1Of(n), asFile = !!h1, untitled = !n.title?.trim() || /^未命名( \d+)?$/.test(n.title.trim());
    meta.innerHTML = `
      <div class="doc-name"><input class="doc-title" data-doc="title" value="${W.esc(n.title)}" placeholder="${W.esc(titleOf(n) === "无标题" ? "标题" : titleOf(n))}" aria-label="标题">${asFile && untitled ? `<button type="button" class="link small" data-act="title-from-h1" title="把正文第一行的标题当作这篇的名字">用正文标题「${W.esc(h1.slice(0, 12))}」</button>` : ""}</div>
      <div class="doc-sum">
        <button type="button" class="ds" data-act="ds-pick" data-k="platform" aria-haspopup="menu" title="换平台">${W.esc(pl.name)}${I("chev", 11)}</button><i aria-hidden="true">·</i>
        <button type="button" class="ds" data-act="ds-pick" data-k="genre" aria-haspopup="menu" title="换体裁">${W.esc(W.genre(n.genre).name)}${I("chev", 11)}</button><i aria-hidden="true">·</i>
        <button type="button" class="ds" data-act="ds-pick" data-k="status" aria-haspopup="menu" title="改状态"><span class="sdot st-${n.status}"></span>${W.esc(D.statuses.find((x) => x.id === n.status)?.name || "")}${I("chev", 11)}</button><i aria-hidden="true">·</i>
        <button type="button" class="ds" data-act="ds-pick" data-k="soul" aria-haspopup="menu" title="换灵魂（作者人设和语气）">${W.esc(W.soul(n.soul)?.name || "无灵魂")}${I("chev", 11)}</button>
        <button type="button" class="ds more" data-act="props-toggle" aria-expanded="${!!S.ui.propsOpen}">文档属性${I("chev", 12)}</button>
      </div>
      <div class="props" ${S.ui.propsOpen ? "" : "hidden"}>
        <label class="prop"><span>文件夹</span><select data-doc="folder" aria-label="文件夹">${folders.map((f) => `<option value="${W.esc(f)}" ${f === (n.folder || "") ? "selected" : ""}>${W.esc(f || "根目录")}</option>`).join("")}</select></label>
        <label class="prop"><span>标签</span><input data-doc="tags" value="${W.esc((n.tags || []).join("，"))}" placeholder="用逗号隔开" aria-label="标签"></label>
      </div>`;
  };
  const h1Of = (n) => (n.text || "").split("\n").find((l) => l.trim())?.match(/^#\s+(.+)/)?.[1].trim() || "";
  // 底部状态栏：字数进度（按平台篇幅）、本地检查、保存状态
  X.renderFoot = (L, pi = S.ui.pane) => {
    const p = pane(pi), n = W.note(p.active), f = p.el.foot;
    if (!n || !L) { f.innerHTML = ""; return; }
    const addr = Object.entries(L.address).map(([k, v]) => `${k}×${v}`).join(" ");
    const over = Object.values(L.address).some((v) => v > S.config.addressMax);
    const pl = W.platform(n.platform), m = String(pl.len || "").match(/(\d+)\s*[–\-~]\s*(\d+)/);
    const lo = m ? +m[1] : 0, hi = m ? +m[2] : 0, pct = hi ? Math.min(100, Math.round((L.words / hi) * 100)) : 0;
    const back = W.Links.backlinks(n).length;
    f.innerHTML = `<span class="fchip" title="${W.esc(pl.name)}建议篇幅 ${W.esc(pl.len || "")}"><b>${L.words}</b>${hi ? `<span class="muted">/ ${lo}–${hi} 字</span><span class="fbar ${L.words > hi ? "over" : ""}" aria-hidden="true"><i style="width:${pct}%"></i></span>` : "字"}</span>
      ${L.needs.length ? `<button type="button" class="fchip warn" data-act="lint-jump" data-k="needs" title="点一下跳到下一处">${L.needs.length} 处要补经历或证据</button>` : ""}
      ${L.longParas.length ? `<button type="button" class="fchip warn" data-act="lint-jump" data-k="longParas" title="点一下跳到下一处">${L.longParas.length} 段太长</button>` : ""}
      ${L.aiTaste.length ? `<button type="button" class="fchip ${L.aiPerK > S.config.aiTasteMax ? "warn" : ""}" data-act="lint-jump" data-k="aiTaste" title="点一下跳到下一处">${L.aiTaste.length} 处 AI 味句式</button>` : ""}
      ${over ? `<span class="fchip warn" title="同一个称呼用太多次">称呼重复：${W.esc(addr)}</span>` : ""}
      ${!L.needs.length && !L.longParas.length && !L.aiTaste.length && !over && L.words ? `<span class="fchip">${I("check", 13)}没有要处理的问题</span>` : ""}
      ${back ? `<button type="button" class="fchip" data-act="tab" data-id="links" title="哪些笔记链接到了这篇">${back} 篇链接到这里</button>` : ""}
      <span class="grow"></span><span class="save-state" title="${saveText(false)}">${I("check", 14)}<span class="save-text">${saveText(false)}</span></span>`;
  };
  const saveText = (on) => on ? "保存中…" : W.P.mode === "cloud" ? "已同步" : W.P.mode === "vault" ? "已存进写作库" : "存在本机";
  W.on("lint", (L, ed) => { const i = panes.findIndex((p) => p.editor === ed); X.renderFoot(L, i < 0 ? S.ui.pane : i); });
  W.on("saving", (on) => W.$$(".save-text").forEach((s) => (s.textContent = saveText(on))));
  W.on("text", W.debounce(() => { X.renderList(); if (S.ui.mode === "preview") X.renderPanes(); }, 600));

  X.renderPreview = (pi = S.ui.pane) => {
    const pp = pane(pi), n = W.note(pp.active), pv = pp.el.preview, isPv = S.ui.mode === "preview";
    pp.el.ed.hidden = isPv; pv.hidden = !isPv;
    if (!n || !isPv) return;
    const p = W.platform(n.platform), plan = S.plans[n.id];
    const fig = (id, rest) => {
      const it = plan?.images?.find((x) => x.id === id);
      if (it?.image?.url) return `<figure><img src="${W.esc(it.image.url)}" alt="${W.esc(it.purpose || rest)}" loading="lazy"><figcaption>${W.esc(it.purpose || rest)}</figcaption></figure>`;
      return `<figure class="ph"><span class="mono">配图 ${W.esc(id)}</span>${W.esc(it?.purpose || rest)}</figure>`;
    };
    // 预览就是正常的文章排版；贴图类在上面多一排图文分页
    let html;
    if (p.kind === "pic") {
      const imgs = (plan?.images || []).map((it) => `<div class="pv-card">${it.image?.url ? `<img src="${W.esc(it.image.url)}" alt="">` : `<span class="mono">${W.esc(it.id)}</span><b>${W.esc((it.text?.title || "").replace(/==/g, ""))}</b><small>${W.esc(it.purpose || "")}</small>`}</div>`).join("");
      html = `${imgs ? `<div class="pv-strip">${imgs}</div>` : `<p class="pv-hint">还没有图文分页<button type="button" class="link" data-act="tab" data-id="illus">去生成分页</button></p>`}<div class="pv-article pic">${W.md(n.text || "", { figure: fig })}</div>`;
    } else html = `<article class="pv-article">${W.md(n.text || "", { figure: fig })}</article>`;
    pv.innerHTML = html;
  };

  // ================= 右侧面板 =================
  // 右栏是一条写作流程：写 → 改 → 评 → 图 → 发，后面两个（链接、版本）是随时用的工具
  const FLOW = [["write", "写作", "write", "这篇写给谁、往哪写；写初稿"], ["anno", "批注", "anno", "在正文里划线写意见，AI 只改你划过的地方"], ["score", "评分", "score", "按量表逐项打分，指出最该改的三处"],
    ["illus", "配图", "image", "让固定的卡通“我”演出每一段"], ["meta", "发布", "send", "标题候选、分发包和写作过程材料"]];
  const AUX = [["links", "链接", "link", "谁链到了这篇、这篇链到了谁"], ["ver", "版本", "history", "存过的版本，随时回到之前"]];
  const TAB_ORDER = [...FLOW, ...AUX].map((x) => x[0]);
  const stepDone = (id, n) => ({ write: (n.text || "").trim().length > 20, anno: (n.annotations || []).some((a) => a.status === "applied"), score: !!n.score, illus: !!S.plans[n.id]?.images?.length, meta: !!(n.meta?.pack || n.meta?.titleList?.length) }[id]);
  const setNewMode = (m) => { W.ls.set("wbd:newMode", m); W.$$("#newtog > button").forEach((b) => b.classList.toggle("on", b.dataset.act === "new-" + m)); };
  X.setTab = (t) => { X._dir = Math.sign(TAB_ORDER.indexOf(t) - TAB_ORDER.indexOf(S.ui.tab)); S.ui.tab = t; X.renderInsp(true); setTimeout(() => W.Tour?.maybe("tab-" + t), 420); };
  X.renderFlow = (n = W.note(), counts = { anno: (n?.annotations || []).filter((a) => ["open", "proposed"].includes(a.status) && !a.orphan).length }) => {
    // 流程线：做完的步骤墨点变蓝；线一段一段被墨水填到最后完成的那一步。当前这一步下面一行说它是干什么的
    const all = [...FLOW, ...AUX], cur = all.find((x) => x[0] === S.ui.tab) || FLOW[0];
    const done = FLOW.map(([id]) => !!(n && stepDone(id, n))), last = done.lastIndexOf(true);
    const was = X._lit ?? last, capSwap = X._capTab !== cur[0]; X._capTab = cur[0];
    const badge = (id) => id === "anno" && counts.anno ? `<span class="fl-badge warn">${counts.anno}</span>` : id === "score" && n?.score ? `<span class="fl-badge">${n.score.total}</span>` : id === "illus" && S.plans[n?.id]?.images?.length ? `<span class="fl-badge">${S.plans[n.id].images.length}</span>` : "";
    const step = ([id, name, ic, hint], i, aux) => `<button type="button" role="tab" aria-selected="${S.ui.tab === id}" aria-label="${name}" title="${name}：${W.esc(hint)}" style="--i:${Math.max(0, i - Math.max(0, was))}"
      class="fl ${aux ? "aux" : ""} ${S.ui.tab === id ? "on" : ""} ${!aux && done[i] ? "done" : ""} ${!aux && i < was ? "lit" : ""}" data-act="tab" data-id="${id}">${I(ic, 19)}${badge(id)}</button>`;
    W.$("#insp-tabs").innerHTML = `<div class="flow-wrap"><nav class="flow ${job ? "busy" : ""}" role="tablist" aria-label="写作流程">${FLOW.map((x, i) => step(x, i, false)).join("")}<span class="gi flow-aux">${AUX.map((x, i) => step(x, i, true)).join("")}</span></nav>
        <p class="flow-cap ${capSwap ? "swap" : ""}"><b>${cur[1]}</b><span>${cur[3]}</span><button type="button" class="link small" data-tour="tab-${cur[0]}">怎么用</button></p></div>` +
      `<button type="button" class="icon-btn sm only-mid" data-act="close-drawers" aria-label="收起面板">${I("x", 16)}</button>`;
    X._lit = last;
    if (was !== last) W.raf(() => W.raf(() => W.$$("#insp-tabs .flow > .fl").forEach((b, i) => b.classList.toggle("lit", i < last))));
  };
  // swap = 换了标签页或刚拿到新评分：内容逐块淡入、仪表和进度条从 0 长出来；其它刷新不动
  X.renderInsp = (swap) => {
    const n = W.note();
    const counts = { anno: (n?.annotations || []).filter((a) => ["open", "proposed"].includes(a.status) && !a.orphan).length };
    X.renderFlow(n, counts);
    const body = W.$("#insp-body");
    const fresh = swap || (n?.score && X._seenScore !== n.score && S.ui.tab === "score");
    X._seenScore = n?.score;
    body.classList.toggle("swap", !!fresh);
    body.dataset.dir = X._dir || 0; X._dir = 0; // 换标签时内容从标签所在的方向滑进来
    if (!n) { body.innerHTML = `<div class="empty-small">先打开或新建一篇笔记</div>`; return; }
    body.innerHTML = jobBar() + ({ write: tabWrite, anno: tabAnno, score: tabScore, illus: () => `<div id="il-host"></div>`, links: tabLinks, meta: tabMeta, ver: tabVer }[S.ui.tab] || tabWrite)(n);
    if (S.ui.tab === "illus") W.Illus.mountInto(W.$("#il-host"));
    if (swap) body.scrollTop = 0;
    // 分数从 0 数到实际值，和弧线一起长出来（系统开了“减少动态效果”就直接显示）
    const gn = fresh && W.$(".g-n", body);
    if (gn && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const to = +gn.textContent, t0 = performance.now(), dur = 900;
      const tick = (t) => { const k = Math.min(1, (t - t0 - 100) / dur), e = 1 - Math.pow(1 - Math.max(0, k), 3); gn.textContent = Math.round(to * e); if (k < 1) requestAnimationFrame(tick); };
      gn.textContent = "0"; requestAnimationFrame(tick);
    }
    if (S.ui.tab === "ver") loadVersions(n);
  };
  const jobBar = () => job ? `<div class="jobbar" role="status"><span class="ink-dot busy" aria-hidden="true"></span><span>${W.esc(job.label)}</span><span class="grow"></span><button type="button" class="btn sm" data-act="stop">${I("stop", 14)}停止</button></div>` : "";
  const aiNote = () => W.AI.ready ? "" : `<p class="ai-note"><span class="ink-dot off" aria-hidden="true"></span>还没连上 AI：点按钮会给你完整提示词，复制去别处也能用。</p>`;
  const card = (title, body, extra = "") => `<section class="pcard"><header class="pcard-h"><h3>${title}</h3>${extra}</header><div class="pcard-b">${body}</div></section>`;
  const optChip = (k, v, name, on, title = "") => `<button type="button" class="chip ${on ? "on" : ""}" aria-pressed="${on}" data-act="nf-set" data-k="${k}" data-v="${W.esc(v)}"${title ? ` title="${W.esc(title)}"` : ""}>${W.esc(name)}</button>`;

  // 链接：谁链到了这篇、这篇链到了谁、哪里提到了这篇的名字却没加链接
  function tabLinks(n) {
    const back = W.Links.backlinks(n), out = W.Links.outgoing(n), men = W.Links.mentions(n), me = titleOf(n);
    const mark = (s) => { const e = W.esc(s), k = W.esc(me), i = e.indexOf(k); return i < 0 ? e : e.slice(0, i) + `<mark>${k}</mark>` + e.slice(i + k.length); };
    return `<section class="sec"><h3 class="sec-h">反向链接 <span class="badge gray">${back.length}</span></h3>
        ${back.length ? back.map(({ note, lines }) => `<article class="lk"><button type="button" class="lk-title" data-act="open" data-id="${note.id}">${I("list", 14)}${W.esc(titleOf(note))}</button>${lines.map((l) => `<p class="lk-line">${mark(l)}</p>`).join("")}</article>`).join("")
          : `<p class="hint">还没有笔记链接到这篇。在别的笔记里写 <code>[[${W.esc(me)}]]</code> 就会出现在这里。</p>`}</section>
      <section class="sec"><h3 class="sec-h">这篇链接到 <span class="badge gray">${out.length}</span></h3>
        ${out.length ? `<div class="lk-out">${out.map((o) => o.note
          ? `<button type="button" class="chip" data-act="open" data-id="${o.note.id}">${W.esc(o.target)}</button>`
          : `<button type="button" class="chip miss" data-act="link-create" data-id="${W.esc(o.target)}" title="还没有这篇，点一下新建">${I("plus", 12)}${W.esc(o.target)}</button>`).join("")}</div>
          <p class="hint">链接到的笔记写作时会自动当作素材。</p>` : `<p class="hint">正文里输入 <kbd>[</kbd><kbd>[</kbd> 就能链接到别的笔记。</p>`}</section>
      <section class="sec"><h3 class="sec-h">提到了但没链接 <span class="badge gray">${men.length}</span></h3>
        ${men.length ? men.map(({ note, lines }) => `<article class="lk"><div class="lk-row"><button type="button" class="lk-title" data-act="open" data-id="${note.id}">${W.esc(titleOf(note))}</button><button type="button" class="btn sm" data-act="link-mention" data-id="${note.id}">变成链接</button></div>${lines.map((l) => `<p class="lk-line">${mark(l)}</p>`).join("")}</article>`).join("")
          : `<p class="hint">没有别的笔记提到「${W.esc(me)}」。</p>`}</section>`;
  }

  function tabWrite(n) {
    const p = W.platform(n.platform);
    const plats = S.platforms.filter((x) => x.kind === p.kind);
    const auto = W.natureFor({ natureFocus: [] }).map((x) => x.id);
    const nat = S.nature.filter((x) => x.on).sort((a, b) => b.weight - a.weight);
    const mats = (n.materials || []).map((id) => W.note(id)).filter(Boolean);
    const dist = S.mindset.distance, b = W.idAtLevel(dist);
    const bands = S.mindset.bands || D.mindset.bands;
    const mem = W.memoryFor(p.kind).length;
    const has = (n.text || "").trim().length > 20;
    const lenShort = (String(p.len || "").match(/\d+\s*[–\-~]\s*\d+\s*字/) || [p.len || "—"])[0];
    let lo = 0;
    const bandBtns = bands.map((x) => { const hi = Math.min(100, x.max), mid = Math.round((lo + hi) / 2), on = dist >= lo && dist < x.max; lo = x.max; return `<button type="button" class="${on ? "on" : ""}" aria-pressed="${on}" data-act="mind-band" data-v="${mid}" title="${W.esc(x.text)}">${W.esc(x.name)}</button>`; }).join("");
    const k = D.kinds.find((x) => x.id === p.kind);
    // 已经有正文了：先给“检查和修改”，生成要求收成一张摘要卡，需要时再展开
    const reqSummary = has && !S.ui.reqOpen ? card("这篇的要求", `
      ${n.brief ? `<p class="req-brief">${W.esc(n.brief)}</p>` : ""}
      <dl class="req-kv"><dt>写给</dt><dd>${W.esc(p.name)} · ${W.esc(W.genre(n.genre).name)}</dd><dt>灵魂</dt><dd>${W.esc(W.soul(n.soul)?.name || "无")}</dd><dt>心智</dt><dd>${dist} · ${W.esc(b.name)}</dd><dt>读者</dt><dd>${W.neuroCaption(W.levels("neuro", n)).replace(/<\/?b>/g, "")}</dd></dl>`, `<button type="button" class="link small" data-act="req-toggle">修改</button>`) : "";
    const row = (act, ic, name, hint) => `<button type="button" class="act-row" data-act="${act}" ${job ? "disabled" : ""}>${I(ic, 16)}<span>${name}</span><em>${hint}</em></button>`;
    const after = has ? card("检查和修改", `
      <div class="act-list">
        ${row("iterate", "score", `自动迭代到 ${S.config.targetScore}`, "只改最弱的两项")}
        ${row("titles", "spark", "起标题", `出 ${S.config.titleCount} 个`)}
        ${row("pack", "send", "分发包", "各平台的版本")}
        ${row("topic", "list", "选题卡", "换个角度")}
      </div>
      <div class="ask-box">
        <textarea id="global-ask" rows="2" placeholder="对全文说一句，比如：整体再口语一点；第三节加一个外卖的例子" aria-label="对全文说一句"></textarea>
        <button type="button" class="btn sm" data-act="global" ${job ? "disabled" : ""}>给出修改</button>
      </div>
      <p class="hint">想改某一句：在正文里选中它，工具条会出现在旁边。</p>`) : "";
    const actions = has
      ? `<div class="insp-actions"><button type="button" class="btn ghost" data-act="write" ${job ? "disabled" : ""}>${I("pen", 15)}重写初稿</button><button type="button" class="btn primary" data-act="score" ${job ? "disabled" : ""}>${I("score", 15)}评分</button></div>`
      : `<div class="insp-actions"><button type="button" class="btn" data-act="topic" ${job ? "disabled" : ""}>${I("spark", 15)}选题卡</button><button type="button" class="btn primary" data-act="write" ${job ? "disabled" : ""}>${I("pen", 16)}写初稿</button></div>`;
    if (has && !S.ui.reqOpen) return `${aiNote()}${after}${reqSummary}${actions}`;
    return `${aiNote()}
    ${has ? `<button type="button" class="link small req-close" data-act="req-toggle">收起要求</button>` : ""}
    ${card("写给哪里", `
      <div class="seg wide" role="group" aria-label="形式">${D.kinds.map((k) => `<button type="button" class="${k.id === p.kind ? "on" : ""}" aria-pressed="${k.id === p.kind}" data-act="kind" data-id="${k.id}" title="${k.hint}">${k.name}</button>`).join("")}</div>
      <p class="hint">${W.esc(k?.hint || "")}</p>
      <div class="field"><span>平台</span><div class="chips" role="group" aria-label="平台">${plats.map((x) => optChip("platform", x.id, x.name, x.id === p.id)).join("")}</div></div>
      <div class="field"><span>体裁</span><div class="chips" role="group" aria-label="体裁">${S.genres.map((g) => optChip("genre", g.id, g.name, g.id === n.genre, g.skeleton)).join("")}</div></div>
      <div class="info-cells"><div class="icell" title="${W.esc(p.len)}"><span>篇幅</span><b>${W.esc(lenShort)}</b></div><div class="icell"><span>标题</span><b>≤ ${p.titleMax} 字</b></div><div class="icell" title="评论区腔：多少句子像网友在评论区说话。越高越口语、越像聊天；关键信息仍保持准确"><span>口语化</span><b>${p.voice}%</b></div></div>`)}
    ${card("写什么", `
      <label class="field"><span>题目 / 想法 / 素材</span><textarea data-nf="brief" rows="4" placeholder="比如：iPhone Duo 屏幕漏液，售后说没配件修不了。贴链接、数据、截图描述都行">${W.esc(n.brief)}</textarea></label>
      <div class="grid2 tight">
        <label class="field"><span>读者（具体到一个人）</span><input data-nf="reader" value="${W.esc(n.reader)}" placeholder="可以不填，AI 推断"></label>
        <label class="field"><span>读完得到什么</span><input data-nf="promise" value="${W.esc(n.promise)}" placeholder="可以不填"></label>
      </div>
      <label class="field"><span>我的立场</span><input data-nf="stance" value="${W.esc(n.stance)}" placeholder="站哪边？拿不准的写出来"></label>
      <div class="field"><span>素材笔记</span>
        <div class="chips">${mats.map((m) => `<span class="chip on">${W.esc(titleOf(m))}<button type="button" class="chip-x" data-act="mat-del" data-id="${m.id}" aria-label="移除">${I("x", 12)}</button></span>`).join("")}
          <select class="chip-add" id="mat-add" aria-label="添加素材笔记"><option value="">＋ 引用一篇笔记</option>${S.notes.filter((x) => x.id !== n.id && !(n.materials || []).includes(x.id)).map((x) => `<option value="${x.id}">${W.esc(x.folder)} / ${W.esc(titleOf(x))}</option>`).join("")}</select></div>
      </div>`, `<span class="hint">除了题目都可以不填</span>`)}
    ${card("谁在写、往哪写", `
      <div class="field"><span>灵魂</span><div class="chips" role="group" aria-label="灵魂">${S.souls.map((s) => optChip("soul", s.id, s.name, s.id === n.soul)).join("")}</div></div>
      <div class="field"><span>心智距离 <em>· 现在是 ${dist}</em></span>
        <div class="bands" role="group" aria-label="心智距离">${bandBtns}</div>
        <p class="band-note">${W.esc(b.text)}</p>
        <button type="button" class="link small" style="justify-self:start" data-view-go="mind">去“心智”页精确调整</button></div>
      <div class="field"><span>人性抓手 ${n.natureFocus?.length ? "" : `<em>· 虚线是自动选的前 ${S.config.natureTop} 个</em>`}</span>
        <div class="chips">${nat.map((x) => { const on = n.natureFocus?.includes(x.id), au = !n.natureFocus?.length && auto.includes(x.id); return `<button type="button" class="chip ${on ? "on" : au ? "auto" : ""}" data-act="nat" data-id="${x.id}" title="${W.esc(x.lever)}">${W.esc(x.name)}<span class="dim">${x.weight}</span></button>`; }).join("")}</div>
      </div>`, `<button type="button" class="link small" data-view-go="memory">会带上 ${mem} 条记忆</button>`)}
    ${bodyCard(n)}
    ${after}
    ${actions}`;
  }

  // 读者的身体：这一篇想激起的激素、想住进的脑区。不动就跟着“人性”页的默认值走；动过只记改过的数
  const globalLv = (kind) => Object.fromEntries((kind === "neuro" ? W.neuroDefs() : W.brainDefs()).map((d) => [d.id, d.level]));
  const presetOf = (lv) => D.neuroPresets.find((p) => Object.entries(p.v).every(([k, v]) => lv[k] === v))?.id;
  function bodyCard(n) {
    const lvN = W.levels("neuro", n), lvB = W.levels("brain", n), own = n.neuro || n.brain, on = presetOf(lvN);
    return card("读者的身体", `
      <div class="nr-presets" role="group" aria-label="预设">${D.neuroPresets.map((p) => `<button type="button" class="chip sm ${p.id === on ? "on" : ""}" data-act="neuro-preset" data-id="${p.id}" title="${W.esc(p.hint)}">${W.esc(p.name)}</button>`).join("")}</div>
      <div class="field"><span>神经递质 / 激素</span>${U.bars("neuro", W.neuroDefs(), lvN, { attrs: 'data-bar="neuro"', def: globalLv("neuro") })}</div>
      <p class="nr-cap" data-cap="neuro">${W.neuroCaption(lvN)}</p>
      <div class="field"><span>脑区 · 记忆住在哪</span>${U.bars("brain", W.brainDefs(), lvB, { attrs: 'data-bar="brain"', def: globalLv("brain"), thin: true })}</div>
      <p class="nr-cap" data-cap="brain">${W.brainCaption(lvB)}</p>`,
      own ? `<button type="button" class="link small" data-act="body-reset">恢复默认</button>` : `<button type="button" class="link small" data-view-go="nature">改默认值</button>`);
  }
  const bodyRefresh = (n) => {
    const box = W.$("#insp-body"); if (!box) return;
    const lvN = W.levels("neuro", n), on = presetOf(lvN);
    const c1 = box.querySelector('[data-cap="neuro"]'), c2 = box.querySelector('[data-cap="brain"]');
    if (c1) c1.innerHTML = W.neuroCaption(lvN); if (c2) c2.innerHTML = W.brainCaption(W.levels("brain", n));
    box.querySelectorAll("[data-act=neuro-preset]").forEach((c) => c.classList.toggle("on", c.dataset.id === on));
  };
  const saveBodySoon = W.debounce((n) => W.saveNote(n), 300);

  // 评分里的“实际 vs 目标”：色条是 Claude 估计的实际值，黑色刻度是这篇的目标
  function bodyCompare(n, sc) {
    if (!sc.neuro && !sc.brain) return "";
    const gap = (kind) => { const t = W.levels(kind, n), a = sc[kind] || {}; return (kind === "neuro" ? W.neuroDefs() : W.brainDefs()).map((d) => ({ d, diff: (+a[d.id] || 0) - t[d.id] })).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))[0]; };
    const g = sc.neuro && gap("neuro");
    return card("读者的身体：实际 vs 目标", `
      <div class="cmp-legend"><span>色条 = 估计的实际</span><span><i></i>目标</span></div>
      ${sc.neuro ? U.bars("neuro", W.neuroDefs(), sc.neuro, { edit: false, target: W.levels("neuro", n) }) : ""}
      ${sc.brain ? `<div class="field"><span>记忆落点</span>${U.bars("brain", W.brainDefs(), sc.brain, { edit: false, target: W.levels("brain", n), thin: true })}</div>` : ""}
      <p class="nr-cap">${g && Math.abs(g.diff) >= 10 ? `离目标最远：<b>${W.esc(g.d.name)}</b>${g.diff > 0 ? "高了" : "低了"} ${Math.abs(g.diff)}。` : "和目标基本一致。"}${sc.bodyNote ? W.esc(sc.bodyNote) : ""}</p>`);
  }

  const typeName = (t) => D.annoTypes.find((x) => x.id === t)?.name || "批注";
  function tabAnno(n) {
    const all = n.annotations || [];
    const showAll = S.ui.annoAll;
    const list = all.filter((a) => showAll || ["open", "proposed"].includes(a.status)).sort((a, b) => (a.start ?? 1e9) - (b.start ?? 1e9));
    const open = all.filter((a) => a.status === "open" && !a.orphan && a.type !== "keep").length;
    const prop = all.filter((a) => a.status === "proposed").length;
    const keeps = all.filter((a) => a.type === "keep" && a.status !== "dismissed").length;
    const rememberable = all.filter((a) => a.note || a.proposal).length;
    return `${aiNote()}
      <section class="pcard"><div class="pcard-b">
        <div class="info-cells"><div class="icell"><span>待处理</span><b class="big">${open}</b></div><div class="icell"><span>待你决定</span><b class="big" style="color:var(--link)">${prop}</b></div><div class="icell"><span>写得好</span><b class="big" style="color:var(--good)">${keeps}</b></div></div>
        <button type="button" class="btn primary" style="height:40px;font-weight:600" data-act="revise-all" ${!open || job ? "disabled" : ""}>${I("spark", 15)}按 ${open} 条批注改</button>
        <div class="grid2 tight">
          <button type="button" class="btn sm" data-act="accept-all" ${!prop ? "disabled" : ""}>全部接受（${prop}）</button>
          <button type="button" class="btn sm" data-act="distill" ${!rememberable || job ? "disabled" : ""}>从批注提炼记忆</button>
        </div>
        <p class="hint">在正文里选中文字就能批注（<kbd>⌘</kbd><kbd>J</kbd>）。勾了“记住”的批注会提炼成记忆，下次写作自动带上。</p>
      </div></section>
      <div class="btn-row" style="justify-content:space-between">
        <div class="seg sm" role="group" aria-label="批注筛选"><button type="button" class="${!showAll ? "on" : ""}" aria-pressed="${!showAll}" data-act="anno-filter" data-id="open">待处理</button><button type="button" class="${showAll ? "on" : ""}" aria-pressed="${!!showAll}" data-act="anno-filter" data-id="all">全部 ${all.length}</button></div>
        <span class="hint">按正文里的位置排</span>
      </div>
      <div class="anno-list">${list.length ? list.map(annoCard).join("") : `<div class="empty-small">${all.length ? "都处理完了" : "还没有批注。去正文里选中一段试试"}</div>`}</div>`;
  }
  function annoCard(a) {
    const st = a.orphan ? `<span class="pill bad">原文已删</span>` : a.edited && a.status !== "applied" ? `<span class="pill warn">原文改过</span>` : a.status === "applied" ? `<span class="pill good">已改</span>` : a.status === "dismissed" ? `<span class="pill">已忽略</span>` : "";
    const isProp = !!(a.proposal && a.status === "proposed");
    const prop = isProp ? `<div class="diff"><del>${W.esc(a.proposal.original)}</del><ins>${W.esc(a.proposal.revised)}</ins>${a.proposal.why ? `<p class="why">${W.esc(a.proposal.why)}</p>` : ""}</div>
      <div class="anno-acts three"><button type="button" class="btn sm primary" data-act="accept" data-id="${a.id}">${I("check", 14)}接受</button><button type="button" class="btn sm" data-act="retry" data-id="${a.id}">换一个</button><button type="button" class="btn sm" data-act="reject" data-id="${a.id}">不要</button></div>` : "";
    const del = `<span class="grow"></span><button type="button" class="icon-btn sm" data-act="anno-del" data-id="${a.id}" aria-label="删除批注">${I("trash", 15)}</button>`;
    const actions = a.status === "open" ? `<div class="anno-acts">${a.type !== "keep" ? `<button type="button" class="btn sm" data-act="revise-one" data-id="${a.id}" ${a.orphan || job ? "disabled" : ""}>${I("spark", 14)}AI 改</button>` : ""}<button type="button" class="btn sm ghost" data-act="resolve" data-id="${a.id}">${I("check", 14)}标为已处理</button>${del}</div>` :
      a.status === "applied" && a.proposal ? `<div class="anno-acts"><button type="button" class="btn sm ghost" data-act="undo" data-id="${a.id}">${I("undo", 14)}改回去</button>${del}</div>` :
      a.status !== "proposed" ? `<div class="anno-acts"><button type="button" class="btn sm ghost" data-act="reopen" data-id="${a.id}">重新打开</button>${del}</div>` : "";
    return `<article class="anno ${a.id === E.activeId ? "on" : ""} ${isProp ? "is-prop" : ""} t-${a.type}" data-anno="${a.id}">
      <header class="anno-top"><span class="pill t">${typeName(a.type)}</span>${a.by === "ai" ? `<span class="pill soft">AI 提议</span>` : isProp ? `<span class="pill soft">AI 已给出修改</span>` : ""}${st}<span class="grow"></span>
        <label class="remember" title="记成规则，以后写作都会带上">${a.memoryId ? "已记住" : "记住"}<input type="checkbox" class="sw" data-act="remember" data-id="${a.id}" ${a.remember ? "checked" : ""}></label></header>
      <div class="anno-b">
        <button type="button" class="anno-quote" data-act="jump" data-id="${a.id}">${W.esc((a.current ?? a.quote).slice(0, 140))}</button>
        ${a.note ? `<p class="anno-note">${W.esc(a.note)}</p>` : ""}
        ${prop}${actions}
      </div>
    </article>`;
  }

  function tabScore(n) {
    const sc = n.score, L = E.lastLint;
    const local = L ? `<section class="sec"><h3 class="sec-h">本地检查 <span class="hint">不用 Claude</span></h3><div class="kv">
      <div class="${L.aiPerK > S.config.aiTasteMax ? "warn" : ""}"><span>AI 味</span><b>${L.aiTaste.length} 处${L.words > 300 ? ` <small>${L.aiPerK}/千字</small>` : ""}</b></div>
      <div class="${L.needs.length ? "warn" : ""}"><span>需补证据 / 经历</span><b>${L.needs.length}</b></div>
      <div class="${L.longParas.length ? "warn" : ""}"><span>超长段落</span><b>${L.longParas.length}</b></div>
      <div class="${L.notXbutY > S.config.notXbutYMax ? "warn" : ""}"><span>“不是…而是…”</span><b>${L.notXbutY} 次</b></div></div></section>` : "";
    if (!sc) return `${aiNote()}${card("评分", `<p class="hint">按 ${S.rubric.length} 个维度、满分 100 打分，每一项引用原文作依据，并检查有没有违反记忆。</p>
      <button type="button" class="btn primary" data-act="score" ${job ? "disabled" : ""}>评分</button>`)}${local}${iterLogHtml(n)}`;
    const dims = S.rubric.map((r) => { const d = sc.dims?.find((x) => x.key === r.key) || {}; const pct = d.score != null ? d.score / r.max : 0; return { r, d, pct }; });
    const target = S.config.targetScore;
    const pass = sc.total >= target && dims.every((x) => x.pct * 100 >= S.config.dimMinPct);
    const low = dims.filter((x) => x.pct * 100 < S.config.dimMinPct).length;
    const diff = sc.total - target;
    return `${aiNote()}
      <section class="score-hero" aria-label="总分">
        <div class="sh-top"><span>总分</span><span class="sh-tag"><i></i>达标线 ${target}</span></div>
        <div class="gauge-box">${U.gauge(sc.total, target)}
          <div class="gauge-num"><b><span class="g-n">${sc.total}</span><small>/ 100</small></b><span class="g-pass ${pass ? "ok" : ""}">${pass ? "达标" : "未达标"}</span></div>
          <span class="g-end l">0</span><span class="g-end r">100</span></div>
        ${sc.grade ? `<p class="score-grade">${W.esc(sc.grade)}</p>` : ""}
        <div class="hero-cells"><div><span>${diff >= 0 ? "高出达标线" : "离达标还差"}</span><b>${Math.abs(diff)} 分</b></div><div><span>偏低的项</span><b>${low} 项</b></div><div><span>触犯记忆</span><b>${(sc.memoryViolations || []).length} 条</b></div></div>
        ${sc.verdict ? `<p class="verdict">${W.esc(sc.verdict)}</p>` : ""}
        ${sc.caps ? `<p class="verdict caps">封顶：${W.esc(sc.caps)}</p>` : ""}${sc.gainLine ? `<p class="verdict">信息增量：${W.esc(sc.gainLine)}</p>` : ""}
      </section>
      <div class="btn-row"><button type="button" class="btn" data-act="score" ${job ? "disabled" : ""}>重新评分</button><button type="button" class="btn primary" style="flex:1" data-act="iterate" ${job || pass ? "disabled" : ""}>自动迭代到 ${target}</button></div>
      <label class="toggle" style="justify-content:space-between;padding:4px 2px">在正文里标出评分依据<input type="checkbox" class="sw" data-act="score-marks" ${E.showScore ? "checked" : ""}></label>
      <section class="pcard"><header class="pcard-h"><h3>分项得分</h3><span class="hint">橙色 = 低于满分的 ${S.config.dimMinPct}%</span></header>
        <div class="dims">${dims.map(({ r, d, pct }, i) => `<details class="dim ${pct * 100 < S.config.dimMinPct ? "low" : ""}"><summary><span>${W.esc(r.name)}</span><span class="bar"><i style="width:${Math.round(pct * 100)}%;animation-delay:${i * 40}ms"></i></span><span class="mono">${d.score ?? "–"}<small>/${r.max}</small></span></summary>
          <p class="small">${W.esc(d.why || "")}</p>${d.evidence ? `<blockquote class="small">${W.esc(d.evidence)}</blockquote>` : ""}</details>`).join("")}</div>
        ${(sc.deductions || []).length ? `<div class="pcard-b" style="padding-top:0"><h4 class="sub-h" style="margin:4px 0 0">扣分</h4><ul class="plain small">${sc.deductions.map((x) => `<li><b class="bad">${x.points}</b> ${W.esc(x.issue)}${x.quote ? `：「${W.esc(x.quote)}」` : ""}</li>`).join("")}</ul></div>` : ""}
      </section>
      ${bodyCompare(n, sc)}
      ${(sc.top3 || []).length ? `<section class="sec"><h3 class="sec-h">最该改的三处</h3>${sc.top3.map((t, i) => `<article class="fix"><p class="fix-t"><span class="fix-n">${i + 1}</span>${W.esc(t.problem)}</p>${t.why ? `<p class="hint">${W.esc(t.why)}</p>` : ""}
        <div class="diff"><del>${W.esc(t.quote || "")}</del><ins>${W.esc(t.rewrite || "")}</ins></div>
        <button type="button" class="btn sm" style="justify-self:start" data-act="fix-to-anno" data-i="${i}">转成批注</button></article>`).join("")}</section>` : ""}
      ${(sc.memoryViolations || []).length ? card(`<span class="warn">触犯了记忆</span>`, `<ul class="plain small">${sc.memoryViolations.map((v) => { const m = S.memory.find((x) => x.id === v.ruleId); return `<li><b>${W.esc(m?.rule || v.ruleId)}</b>${v.quote ? `：「${W.esc(v.quote)}」` : ""}</li>`; }).join("")}</ul>`) : ""}
      ${sc.lesson ? card("这篇值得学的一招", `<p>${W.esc(sc.lesson)}</p>`) : ""}
      ${local}
      ${iterLogHtml(n)}`;
  }
  const iterLogHtml = (n) => (n.iterLog || []).length ? card("迭代记录", `<div class="tbl-wrap"><table class="tbl small"><thead><tr><th>版本</th><th>总分</th><th>这轮改了什么</th></tr></thead><tbody>${n.iterLog.map((r) => `<tr><td>${W.esc(r.v)}</td><td><b>${r.total ?? "–"}</b></td><td>${W.esc(r.note || "")}</td></tr>`).join("")}</tbody></table></div>${n.iterStop ? `<p class="small muted">停止原因：${W.esc(n.iterStop)}</p>` : ""}`) : "";

  function tabMeta(n) {
    const m = n.meta || {};
    const sec = (k, t) => m[k] ? card(t, `<div class="pre">${W.esc(m[k])}</div>`) : "";
    const tc = m.topicCard;
    const topic = tc ? card("选题卡", `${[tc.input, ...(tc.alternatives || [])].filter(Boolean).map((c, i) => topicCardHtml(c, i, tc.recommend)).join("")}${tc.why ? `<p class="small">${W.esc(tc.why)}</p>` : ""}`) : "";
    const titles = (m.titleList || []).length ? card("标题候选", `<ol class="titles">${m.titleList.map((t, i) => `<li class="${t.rec ? "rec" : ""}"><span class="t">${W.esc(t.t)}</span><span class="muted small">${W.esc(t.type || "")}${t.why ? " · " + W.esc(t.why) : ""}</span><button type="button" class="btn sm ghost" data-act="use-title" data-i="${i}">用这个</button></li>`).join("")}</ol>`) : sec("titles", "标题候选");
    const any = Object.keys(m).length;
    return any ? topic + sec("assume", "假设") + sec("motive", "动机卡") + titles + sec("ledes", "首屏备选") + sec("pages", "图文分页") + sec("pack", "分发包") + sec("check", "自检") + sec("extra", "其它")
      : card("过程材料", `<p class="hint">写初稿、选题卡、起标题、分发包的过程材料会放在这里。</p>`);
  }
  function topicCardHtml(c, i, rec) {
    const keys = [["mass", "大众度"], ["relevance", "切身性"], ["emotion", "情绪"], ["timely", "时效"], ["fresh", "新角度"], ["barrier", "门槛"]];
    const s = c.scores || {};
    const bar = (s.mass || 0) + (s.relevance || 0);
    return `<article class="topic ${rec === i ? "rec" : ""}">
      <header><b>${W.esc(c.title || "")}</b>${rec === i ? `<span class="pill good">推荐</span>` : ""}<span class="pill ${bar >= S.config.topicBar ? "good" : "warn"}">${bar}/10</span></header>
      <div class="tscores">${keys.map(([k, nme]) => `<span>${nme}<i class="dots">${"●".repeat(s[k] || 0)}${"○".repeat(5 - (s[k] || 0))}</i></span>`).join("")}</div>
      ${c.anchor ? `<p class="small"><b>大众锚点</b> ${W.esc(c.anchor)}</p>` : ""}${c.angle ? `<p class="small"><b>我的切口</b> ${W.esc(c.angle)}</p>` : ""}
      ${c.risk ? `<p class="small muted">${W.esc(c.risk)}</p>` : ""}
      <button type="button" class="btn sm" style="justify-self:start" data-act="use-topic" data-i="${i}">用这个写</button></article>`;
  }

  function tabVer(n) {
    return card("版本", `<p class="hint">写初稿、自动迭代、接受批注修改之前都会自动存一版。</p>
      <button type="button" class="btn" style="justify-self:start" data-act="ver-save">存一个版本</button>
      <div id="ver-list" class="ver-list"><div class="empty-small">读取中…</div></div>`);
  }
  async function loadVersions(n) {
    const box = W.$("#ver-list"); if (!box) return;
    let list = [];
    try { list = await W.P.versions(n.id); } catch (e) { box.innerHTML = `<div class="empty-small">读不到版本</div>`; return; }
    X._vers = list;
    box.innerHTML = list.length ? list.map((v, i) => `<article class="ver"><div><b>${W.esc(v.label || "版本")}</b><p class="small muted mono">${W.ago(v.at)} · ${W.words(v.text || "")} 字${v.score != null ? " · " + v.score + " 分" : ""}</p></div>
      <div class="btn-row"><button type="button" class="btn sm" data-act="ver-view" data-i="${i}">看</button><button type="button" class="btn sm" data-act="ver-restore" data-i="${i}">恢复</button><button type="button" class="icon-btn sm" data-act="ver-del" data-i="${i}" aria-label="删除版本">${I("trash", 14)}</button></div></article>`).join("")
      : `<div class="empty-small">还没有版本</div>`;
  }
  X.snapshot = (n, label) => W.P.addVersion(n.id, { text: n.text || "", label, score: n.score?.total ?? null });

  // ================= AI 流程 =================
  const startJob = (label) => { job = { label, ctl: new AbortController() }; X.renderInsp(); return job.ctl.signal; };
  const endJob = () => { job = null; W.Editors.all.forEach((e) => e.readonly(false)); X.renderInsp(); };
  const fail = (e) => { if (!e?.silent) W.toast(W.AI.msg(e), e?.code === "cancelled" ? "" : "bad"); };
  const textBlock = (n) => `【正文】\n<<<\n${edOf(n)?.value() ?? n.text}\n>>>`;

  X.topic = async () => {
    const n = W.note(); if (!n) return;
    if (!n.brief.trim()) { W.toast("先在“题目 / 想法”里写点什么"); W.$('[data-nf="brief"]')?.focus(); return; }
    const prompt = `${W.context(n, { rules: ["priority", "topics"] })}
${W.materialText(n)}
【任务】给作者的题目打选题卡，并按【用户心智】给出 3 个更好的写法（挂上大众锚点、大题小做）。心智距离越低，越要把题目挂到人人都知道的东西上。
作者的题目 / 想法：${n.brief}
只输出 JSON：{"input":{"title":"原题整理成一句","scores":{"mass":1-5,"relevance":1-5,"emotion":1-5,"timely":1-5,"fresh":1-5,"barrier":1-5},"anchor":"大众锚点","angle":"我的切口","natures":["调动的人性"],"risk":"风险或红线提醒"},"alternatives":[同样结构 ×3],"recommend":0-3（0 表示原题最好）,"why":"一句话理由"}`;
    const signal = startJob("Claude 在打选题卡…");
    try {
      const r = await W.AI.run(prompt, { json: true, tier: "score", signal, label: "选题卡" });
      n.meta = { ...(n.meta || {}), topicCard: r }; W.saveNote(n, 0); S.ui.tab = "meta";
    } catch (e) { fail(e); } finally { endJob(); }
  };

  const SEC = { "假设": "assume", "动机卡": "motive", "标题候选": "titles", "正文": "body", "图文分页": "pages", "分发包": "pack", "自检": "check", "首屏备选": "ledes" };
  function parseSections(t) {
    const re = /^={3}\s*(.+?)\s*={3}\s*$/gm, marks = []; let m;
    while ((m = re.exec(t))) marks.push({ name: m[1], s: m.index, e: re.lastIndex });
    const out = {};
    marks.forEach((mk, i) => { out[SEC[mk.name] || mk.name] = t.slice(mk.e, i + 1 < marks.length ? marks[i + 1].s : t.length).replace(/^\n+/, "").trimEnd(); });
    return { out, n: marks.length };
  }
  const parseTitles = (t) => (t || "").split("\n").map((l) => l.replace(/^\s*\d+[.、)]\s*/, "").trim()).filter(Boolean).map((l) => {
    const [tt, type, ...rest] = l.split(/[｜|]/).map((x) => x.trim());
    const r = rest.join(" "); return { t: tt, type, rec: /推荐/.test(r) || /推荐/.test(type || ""), why: r.replace(/^推荐[：:]?/, "") };
  });

  X.write = async () => {
    const n = W.note(); if (!n) return;
    const E = edOf(n);
    if (!n.brief.trim() && !(n.materials || []).length) { W.toast("先写题目 / 想法，或者引用素材笔记"); W.$('[data-nf="brief"]')?.focus(); return; }
    const p = W.platform(n.platform), kind = p.kind;
    const extra = kind === "pic" ? "\n===图文分页===\n封面：一句话（≤8 个大字）\nP1：这一页的标题｜不超过 30 字的要点\n……（3–8 页，最后一页放金句或总结）" : "";
    const prompt = `${W.context(n)}
${W.materialText(n)}
【任务】写作模式：写一篇 ${p.name}。
作者给的题目 / 想法：${n.brief || "（见素材）"}
读者：${n.reader || "（你推断，写进假设）"}；承诺：${n.promise || "（你推断）"}；立场：${n.stance || "（按灵魂和素材推断，在动机卡里写“我替你选的立场是……”）"}
先在心里依次完成：确认四件事 → 动机卡 → 信息增量检查（写不出“大多数人以为 X，其实 Y”，就在假设里明说风险）→ 骨架 → 成稿 → 删改 → 最后起标题、定首屏。
${kind === "post" && p.id === "xthread" ? "正文按串文写：每条以“1/”“2/”开头，条与条之间空一行。" : kind === "post" ? "正文一句一行，行间空一行。" : ""}
按下面的格式输出，分隔行原样保留，不要在分隔行之外加任何说明：
===假设===
读者 / 承诺 / 体裁 / 信息增量那一句（各一行）
===动机卡===
为什么写 / 我的立场 / 情绪曲线 / 最想让读者记住的一句话 / 我在乎读者什么
===标题候选===
${S.config.titleCount} 个，每行一个：标题｜骨架类型；最好的 ${S.config.titlePick} 个在行尾再加“｜推荐：理由”
===首屏备选===
${S.config.ledeVersions} 个不同的开头，每个 2–4 行，用空行隔开
===正文===
（成稿 Markdown。第一行写“# 推荐标题”。配图位置单独一行写 [配图：s1 这里画什么]；缺证据处写 [需补证据：要什么]；灵魂经历库里没有的经历写 [需补经历：……]）${extra}
===分发包===
${p.id.startsWith("x") ? "配套推文 / 封面建议 / 作者首条回复 / 发布后一小时的动作" : "这个平台怎么发：封面文字、摘要或首句、话题标签、发布后动作"}
===自检===
发出前检查逐条 ✅ / ⚠️；AI 味句式计数；这次用到了哪几条记忆`;
    if ((n.text || "").trim()) await X.snapshot(n, "写初稿前");
    const signal = startJob("Claude 在写初稿…（先思考，再开始出字）");
    E.readonly(true);
    let lastBody = null;
    try {
      const r = await W.AI.run(prompt, { tier: "write", signal, label: "写初稿",
        onText: ({ text }) => {
          const { out } = parseSections(text);
          if (out.body != null && out.body !== lastBody && E.note === n) { lastBody = out.body; E.setStreaming(out.body); }
          if (job) { job.label = out.body != null ? `正在写正文 · ${W.words(out.body)} 字` : "Claude 在想动机卡和骨架…"; const j = W.$(".jobbar span:nth-child(2)"); if (j) j.textContent = job.label; }
        } });
      const { out, n: cnt } = parseSections(r.text);
      const body = cnt ? out.body ?? "" : r.text;
      n.text = body; n.annotations = []; n.score = null; n.iterLog = [];
      n.meta = { ...(n.meta?.topicCard ? { topicCard: n.meta.topicCard } : {}), assume: out.assume, motive: out.motive, titles: out.titles, titleList: parseTitles(out.titles), ledes: out.ledes, pages: out.pages, pack: out.pack, check: out.check };
      const h = body.match(/^#\s+(.+)$/m); if (!n.title && h) n.title = h[1].trim();
      if (n.status === "idea") n.status = "draft";
      W.saveNote(n, 0); for (const e of W.Editors.forNote(n.id)) e.load(n); X.renderPanes(); X.renderList();
      if (r.truncated) W.toast("写到一半被截断了：可以让它“接着写”，或者缩短篇幅", "bad");
      else W.toast("初稿写好了。过程材料在“过程”里");
    } catch (e) {
      if (e?.text) { const { out } = parseSections(e.text); if (out.body) { n.text = out.body; W.saveNote(n, 0); for (const e of W.Editors.forNote(n.id)) e.load(n); } }
      fail(e);
    } finally { endJob(); }
  };

  X.titles = async () => {
    const n = W.note(); if (!n) return;
    const E = edOf(n);
    const prompt = `${W.context(n, { rules: ["titles", "opening", "soulCraft"] })}
${textBlock(n)}
【任务】按标题规则，为这篇正文出 ${S.config.titleCount} 个标题（覆盖至少 ${S.config.titleSkeletons} 种骨架，每个都过 6 项检查），挑 ${S.config.titlePick} 个推荐；再给 ${S.config.ledeVersions} 个首屏版本。
只输出 JSON：{"titles":[{"t":"标题","type":"骨架类型","rec":true/false,"why":"推荐理由（只给推荐的写）"}],"ledes":["开头 1","开头 2"]}`;
    const signal = startJob("Claude 在起标题…");
    try {
      const r = await W.AI.run(prompt, { json: true, tier: "score", signal, label: "起标题" });
      n.meta = { ...(n.meta || {}), titleList: r.titles || [], ledes: (r.ledes || []).join("\n\n") };
      W.saveNote(n, 0); S.ui.tab = "meta";
    } catch (e) { fail(e); } finally { endJob(); }
  };

  X.pack = async () => {
    const n = W.note(); if (!n) return;
    const E = edOf(n);
    const p = W.platform(n.platform);
    const prompt = `${W.context(n, { rules: ["ending", "titles"] })}
${textBlock(n)}
【任务】为这篇写发布用的分发包（平台：${p.name}）。${p.id.startsWith("x") ? "包括：配套推文（一个和标题不同的钩子 + 2–3 个看点）、封面建议（字 ≤ 8 个）、作者首条回复、发布后一小时的动作。" : "包括：封面文字（≤ 8 个字，和标题互补）、摘要或首句、话题标签、发布时间建议、发布后一小时的动作。"}直接输出纯文本，分小节。`;
    const signal = startJob("Claude 在写分发包…");
    try {
      const r = await W.AI.run(prompt, { tier: "score", signal, label: "分发包", onText: ({ text }) => { n.meta = { ...(n.meta || {}), pack: text }; } });
      n.meta = { ...(n.meta || {}), pack: r.text }; W.saveNote(n, 0); S.ui.tab = "meta";
    } catch (e) { fail(e); } finally { endJob(); }
  };

  // ---------- 评分 ----------
  async function score(n, signal) {
    const E = edOf(n);
    const memList = W.memoryFor(kindOf(n)).filter((m) => m.polarity !== "keep").map((m) => `id=${m.id}：${m.rule}`).join("\n") || "（无）";
    const prompt = `${W.context(n, { rules: ["priority", "opening", "titles", "style", "aiTaste", "soulCraft", "redlines"] })}
【任务】评分模式。先判体裁和目标读者，再按量表打分。每一项都必须引用原文作依据，引用要一字不差地出自正文（方便定位），找不到就写“未发现”，不凭印象给分。普通初稿通常 55–70，85 以上很少见，不要为了让作者高兴给高分。先说最大的问题，再说优点。
同时逐条检查有没有违反下面这些记忆：
${memList}
【量表】
${W.rubricText()}
${textBlock(n)}
只输出 JSON：{"genre":"体裁","total":0-100,"grade":"等级（可以直接发 / 改 1–2 处就能发 / 骨架在，证据或开头需要重做 / 选题或结构有问题 / 建议换角度重写）","verdict":"一句话：最大的问题 + 最大的优点","gainLine":"这篇比同题文章多了什么（写不出就留空）","topicNote":"选题的大众度一句话","caps":"触发了哪条封顶，没有就留空",
"dims":[{"key":"量表里的 key","score":数字,"evidence":"原文短引或未发现","why":"一句话"}],
"deductions":[{"issue":"问题","points":-数字,"quote":"原文短引"}],
"paragraphs":[{"quote":"该段开头 10–20 个字，一字不差","mark":"good|warn|bad","note":"好在哪 / 可以更好 / 问题"}],
"top3":[{"problem":"问题","why":"为什么","quote":"要改的原文，一字不差","rewrite":"改写"}],
"memoryViolations":[{"ruleId":"记忆 id","quote":"原文"}],"lesson":"这篇值得学的一招",
"neuro":{${W.neuroDefs().map((d) => `"${d.id}":0-100`).join(",")}},"brain":{${W.brainDefs().map((d) => `"${d.id}":0-100`).join(",")}},"bodyNote":"一句话：实际激起的状态和【读者的身体】【记忆落点】的目标差在哪，怎么改"}
neuro 和 brain 是你估计的普通读者读这篇时实际会被激起的程度（0–100，50 是平常），不是照抄目标值。`;
    const r = await W.AI.run(prompt, { json: true, tier: "score", signal, label: "评分" });
    if (!Array.isArray(r.dims)) throw { code: "invalid_json", message: "no dims" };
    if (typeof r.total !== "number") r.total = r.dims.reduce((s, d) => s + (+d.score || 0), 0) + (r.deductions || []).reduce((s, d) => s + (+d.points || 0), 0);
    r.at = W.now();
    for (const v of r.memoryViolations || []) { const m = S.memory.find((x) => x.id === v.ruleId); if (m) { m.hits = (m.hits || 0) + 1; W.saveMemory(m); } }
    return r;
  }
  X.score = async () => {
    const n = W.note(); const E = edOf(n); if (!n || !E.value().trim()) return;
    const signal = startJob("Claude 在逐项打分…");
    try { n.score = await score(n, signal); W.saveNote(n, 0); S.ui.tab = "score"; applyScoreMarks(n); X.renderList(); }
    catch (e) { fail(e); } finally { endJob(); }
  };
  function applyScoreMarks(n) {
    const E = edOf(n); if (!E) return;
    E.score = [];
    for (const p of n?.score?.paragraphs || []) {
      const r = E.findRange(p.quote); if (!r) continue;
      const t = E.value(); let end = t.indexOf("\n", r.start); if (end < 0) end = t.length;
      E.score.push({ start: r.start, end, mark: ["good", "warn", "bad"].includes(p.mark) ? p.mark : "warn" });
    }
    E.paint();
  }

  // ---------- 批注 → 修改 ----------
  const ctxAround = (a, t) => `${t.slice(Math.max(0, a.start - 60), a.start)}【${t.slice(a.start, a.end)}】${t.slice(a.end, a.end + 60)}`;
  async function proposeFor(n, annos, signal, extraInstr = "") {
    const E = edOf(n);
    const t = E.value();
    const list = annos.map((a) => `#${a.id} 类型：${typeName(a.type)}；作者意见：${a.note || "（没写，按类型处理）"}\n原文：「${t.slice(a.start, a.end)}」\n上下文：${ctxAround(a, t)}`).join("\n\n");
    const prompt = `${W.context(n, { rules: ["style", "aiTaste", "soulCraft", "redlines"] })}
【任务】作者在正文里划线批注了 ${annos.length} 处。逐条只改被划的那一段（必要时可以连带改同一句前后几个字），不要整篇重写，不要动没被批注的地方。改写要遵守【记忆】和【规则】，说话像【灵魂】。“查证据”类：没有可靠来源就改成带 [需补证据：要什么] 的写法，绝不编造。${extraInstr}
${textBlock(n)}
【批注】
${list}
只输出 JSON：{"edits":[{"id":"批注 id（不带 #）","original":"要替换的原文，一字不差，可以比划线范围略大以包含整句","revised":"改后的文字","why":"一句话说改了什么"}]}`;
    const r = await W.AI.run(prompt, { json: true, tier: "score", signal, label: "按批注改" });
    let ok = 0;
    for (const ed of r.edits || []) {
      const a = annos.find((x) => x.id === String(ed.id).replace(/^#/, "")); if (!a || ed.revised == null) continue;
      const orig = ed.original && t.includes(ed.original) ? ed.original : t.slice(a.start, a.end);
      const rg = E.findRange(orig, a.start) || { start: a.start, end: a.end };
      a.proposal = { start: rg.start, end: rg.end, original: t.slice(rg.start, rg.end), revised: ed.revised, why: ed.why || "" };
      a.status = "proposed"; ok++;
    }
    return ok;
  }
  X.reviseAnnos = async (ids) => {
    const n = W.note(); if (!n) return;
    const annos = (n.annotations || []).filter((a) => (ids ? ids.includes(a.id) : a.status === "open") && !a.orphan && a.type !== "keep");
    if (!annos.length) { W.toast("没有待改的批注"); return; }
    const signal = startJob(`Claude 在按 ${annos.length} 条批注改…`);
    try { const ok = await proposeFor(n, annos, signal); W.saveNote(n, 0); S.ui.tab = "anno"; W.toast(ok ? `给出了 ${ok} 处修改，逐条决定要不要` : "没有给出可用的修改", ok ? "" : "bad"); }
    catch (e) { fail(e); } finally { endJob(); }
  };
  X.accept = async (id, silent) => {
    const n = W.note(), a = n?.annotations?.find((x) => x.id === id); if (!a?.proposal) return;
    const E = edOf(n);
    const t = E.value(), P = a.proposal;
    let rg = t.slice(P.start, P.end) === P.original ? { start: P.start, end: P.end } : E.findRange(P.original, P.start);
    if (!rg) { W.toast("原文已经变了，找不到要替换的地方", "bad"); return; }
    E.replace(rg.start, rg.end, P.revised);
    a.start = rg.start; a.end = rg.start + P.revised.length; a.current = P.revised; a.status = "applied"; a.edited = false;
    W.saveNote(n, 300); E.paint();
    if (!silent) { X.renderInsp(); if (a.remember && !a.memoryId) W.Memory.fromAnno(n, a); }
  };
  X.acceptAll = async () => {
    const n = W.note(); const list = (n.annotations || []).filter((a) => a.status === "proposed").sort((a, b) => b.proposal.start - a.proposal.start);
    await X.snapshot(n, "接受批注修改前");
    for (const a of list) await X.accept(a.id, true);
    for (const a of list) if (a.remember && !a.memoryId) W.Memory.fromAnno(n, a);
    X.renderInsp(); W.toast(`接受了 ${list.length} 处修改`);
  };
  X.undoAnno = (id) => {
    const n = W.note(), a = n.annotations.find((x) => x.id === id); if (!a?.proposal) return;
    const E = edOf(n);
    const rg = E.value().slice(a.start, a.end) === a.proposal.revised ? { start: a.start, end: a.end } : E.findRange(a.proposal.revised, a.start);
    if (!rg) { W.toast("改后的文字已经变了，没法自动改回", "bad"); return; }
    E.replace(rg.start, rg.end, a.proposal.original);
    a.start = rg.start; a.end = rg.start + a.proposal.original.length; a.current = a.proposal.original; a.status = "open"; a.proposal = null;
    W.saveNote(n, 300); X.renderInsp(); E.paint();
  };

  X.global = async () => {
    const n = W.note(), E = edOf(n), ask = W.$("#global-ask")?.value.trim(); if (!n) return;
    if (!ask) { W.toast("先写一句你想怎么改"); return; }
    const t = E.value();
    const prompt = `${W.context(n, { rules: ["style", "aiTaste", "soulCraft", "redlines"] })}
【任务】作者对全文的意见：${ask}
按这条意见给出逐处的局部修改（不整篇重写，最多 12 处），每处改动尽量小，遵守【记忆】和【规则】。
${textBlock(n)}
只输出 JSON：{"edits":[{"original":"要替换的原文，一字不差","revised":"改后的文字","why":"一句话"}]}`;
    const signal = startJob("Claude 在找要改的地方…");
    try {
      const r = await W.AI.run(prompt, { json: true, tier: "score", signal, label: "整体修改" });
      let ok = 0;
      for (const ed of r.edits || []) {
        const rg = ed.original && E.findRange(ed.original); if (!rg) continue;
        n.annotations.push({ id: W.uid("a"), start: rg.start, end: rg.end, quote: t.slice(rg.start, rg.end), type: "custom", note: ask, remember: false, by: "ai", status: "proposed", createdAt: W.now(),
          proposal: { start: rg.start, end: rg.end, original: t.slice(rg.start, rg.end), revised: ed.revised, why: ed.why || "" } });
        ok++;
      }
      W.saveNote(n, 0); S.ui.tab = "anno"; E.paint();
      W.toast(ok ? `给出了 ${ok} 处修改，在“批注”里逐条决定` : "没有找到能对上原文的修改", ok ? "" : "bad");
    } catch (e) { fail(e); } finally { endJob(); }
  };

  // ---------- 自动迭代 ----------
  X.iterate = async () => {
    const n = W.note(); const E = edOf(n); if (!n || !E.value().trim()) return;
    const c = S.config, signal = startJob("自动迭代：先评分…");
    const passes = (s) => s.total >= c.targetScore && S.rubric.every((r) => { const d = s.dims.find((x) => x.key === r.key); return d && (d.score / r.max) * 100 >= c.dimMinPct; });
    n.iterLog = []; n.iterStop = "";
    const setLabel = (l) => { if (job) { job.label = l; const j = W.$(".jobbar span:nth-child(2)"); if (j) j.textContent = l; } };
    try {
      await X.snapshot(n, "自动迭代前");
      let s = await score(n, signal); n.score = s; n.iterLog.push({ v: "v1", total: s.total, note: "起点" }); W.saveNote(n, 0); X.renderInsp();
      const gains = [];
      for (let round = 1; round <= c.maxRounds; round++) {
        if (passes(s)) { n.iterStop = "达标"; break; }
        const weak = S.rubric.map((r) => ({ r, d: s.dims.find((x) => x.key === r.key) || { score: 0 } })).sort((a, b) => a.d.score / a.r.max - b.d.score / b.r.max).slice(0, 2);
        setLabel(`第 ${round} 轮：改 ${weak.map((w) => w.r.name).join("、")}…`);
        const prompt = `${W.context(n)}
【任务】自动迭代第 ${round} 轮。这轮只改最弱的两个维度：${weak.map((w) => `${w.r.name}（${w.d.score}/${w.r.max}，问题：${w.d.why || "见评分"}）`).join("；")}。
局部修改，不整篇重写；已经好的部分不要动。绝不为了过线编造证据或经历：只能靠作者补的材料，就在对应位置留 [需补证据：要什么]，并写进 needUser。
${textBlock(n)}
只输出 JSON：{"plan":"这轮改什么、怎么改（一句话）","edits":[{"original":"要替换的原文，一字不差","revised":"改后的文字"}],"needUser":["需要作者补的材料"]}`;
        const r = await W.AI.run(prompt, { json: true, tier: "write", signal, label: "迭代修改" });
        let applied = 0;
        for (const ed of (r.edits || []).sort((a, b) => (E.value().indexOf(b.original) - E.value().indexOf(a.original)))) {
          const rg = ed.original && E.findRange(ed.original); if (!rg || ed.revised == null) continue;
          E.replace(rg.start, rg.end, ed.revised); applied++;
        }
        n.text = E.value(); W.saveNote(n, 0);
        setLabel(`第 ${round} 轮：重新评分…`);
        const prev = s.total; s = await score(n, signal); n.score = s;
        const dimMove = weak.map((w) => `${w.r.name} ${w.d.score}→${s.dims.find((x) => x.key === w.r.key)?.score ?? "?"}`).join("，");
        n.iterLog.push({ v: "v" + (round + 1), total: s.total, note: `${r.plan || ""}（改了 ${applied} 处；${dimMove}）` });
        await X.snapshot(n, `迭代 v${round + 1}`);
        W.saveNote(n, 0); X.renderInsp(); applyScoreMarks(n);
        gains.push(s.total - prev);
        if ((r.needUser || []).length && s.total - prev < c.minGain) { n.iterStop = "剩下的失分要靠你补材料：" + r.needUser.join("；"); break; }
        if (gains.length >= 2 && gains.slice(-2).every((g) => g < c.minGain)) { n.iterStop = `连续两轮提升都小于 ${c.minGain} 分，改不动了`; break; }
        if (round === c.maxRounds && !passes(s)) n.iterStop = `已经跑满 ${c.maxRounds} 轮`;
      }
      if (!n.iterStop && passes(s)) n.iterStop = "达标";
      W.saveNote(n, 0); S.ui.tab = "score";
      W.toast(`迭代结束：${n.score.total} 分 · ${n.iterStop}`);
    } catch (e) { fail(e); } finally { endJob(); }
  };

  X.fixToAnno = (i) => {
    const n = W.note(), f = n.score?.top3?.[i]; if (!f) return;
    const E = edOf(n);
    const rg = E.findRange(f.quote); if (!rg) { W.toast("在正文里找不到这段原文", "bad"); return; }
    const t = E.value();
    n.annotations.push({ id: W.uid("a"), start: rg.start, end: rg.end, quote: t.slice(rg.start, rg.end), type: "rewrite", note: f.problem + (f.why ? "：" + f.why : ""), remember: false, by: "ai", status: "proposed", createdAt: W.now(),
      proposal: { start: rg.start, end: rg.end, original: t.slice(rg.start, rg.end), revised: f.rewrite, why: f.why || "" } });
    W.saveNote(n, 0); S.ui.tab = "anno"; X.renderInsp(); E.paint(); W.toast("已转成批注");
  };

  // ================= 事件 =================
  function closeDrawers() { document.body.classList.remove("show-notes", "show-insp"); }
  const acts = {
    open: (d, e) => X.open(d.id, { newTab: e?.metaKey || e?.ctrlKey || e?.button === 1, pane: e?.altKey ? X.otherPane() : undefined }),
    "folder-add": () => X.newFolder(),
    "tab-close": (d) => X.closeTab(S.ui.pane, d.id),
    split: () => X.split(),
    "pane-close": (d) => X.closePane(+d.id),
    "link-create": (d) => W.Links.follow(d.id),
    "link-mention": (d) => { W.Links.linkMention(d.id, titleOf(W.note())); X.renderInsp(); W.toast("已变成链接"); },
    "tree-new": () => X.create({ status: "draft" }),
    "tree-collapse": () => { for (const f of S.folders) collapsed.add(f); saveCollapsed(); X.renderList(); },
    "status-filter": (d) => { S.ui.status = S.ui.status === d.id && d.id !== "all" ? "all" : d.id; X._listAnim = true; X.renderFolders(); X.renderList(); },
    "new-me": () => { setNewMode("me"); X.create({ status: "draft" }, { newTab: true }); S.ui.tab = "anno"; X.renderInsp(); setTimeout(() => { const t = pane().el.meta.querySelector('[data-doc="title"]'); t?.focus(); t?.select(); }, 30); },
    "new-ai": () => { setNewMode("ai"); X.create({ status: "idea" }, { newTab: true }); X.setTab("write"); setTimeout(() => W.$('[data-nf="brief"]')?.focus(), 30); if (innerWidth < 1000) document.body.classList.add("show-insp"); },
    sample: () => X.loadSample(),
    mode: (d) => { S.ui.mode = d.id; X.renderPanes(); },
    tab: (d) => { X.setTab(d.id); if (innerWidth < 1000) document.body.classList.add("show-insp"); },
    kind: (d) => { const n = W.note(); const p = S.platforms.find((x) => x.kind === d.id); if (n && p) { n.platform = p.id; S.config.platform = p.id; S.config.kind = d.id; W.saveConfig(); W.saveNote(n); X.renderInsp(); X.renderHead(); E.paint(); } },
    nat: (d) => { const n = W.note(); n.natureFocus ||= []; const i = n.natureFocus.indexOf(d.id); i >= 0 ? n.natureFocus.splice(i, 1) : n.natureFocus.push(d.id); W.saveNote(n); X.renderInsp(); },
    "mat-del": (d) => { const n = W.note(); n.materials = (n.materials || []).filter((x) => x !== d.id); W.saveNote(n); X.renderInsp(); },
    topic: () => X.topic(), write: () => X.write(), score: () => X.score(), iterate: () => X.iterate(), titles: () => X.titles(), pack: () => X.pack(), global: () => X.global(),
    stop: () => job?.ctl.abort(),
    "revise-all": () => X.reviseAnnos(), "revise-one": (d) => X.reviseAnnos([d.id]),
    retry: (d) => { const a = W.note().annotations.find((x) => x.id === d.id); if (a) { a.status = "open"; a.proposal = null; X.reviseAnnos([d.id]); } },
    accept: (d) => { X.snapshot(W.note(), "接受修改前"); X.accept(d.id); },
    "accept-all": () => X.acceptAll(),
    reject: (d) => { const a = W.note().annotations.find((x) => x.id === d.id); a.status = a.by === "ai" ? "dismissed" : "open"; a.proposal = null; W.saveNote(W.note()); X.renderInsp(); E.paint(); },
    resolve: (d) => { const n = W.note(), a = n.annotations.find((x) => x.id === d.id); a.status = "dismissed"; W.saveNote(n); X.renderInsp(); E.paint(); },
    reopen: (d) => { const n = W.note(), a = n.annotations.find((x) => x.id === d.id); a.status = "open"; W.saveNote(n); X.renderInsp(); E.paint(); },
    undo: (d) => X.undoAnno(d.id),
    "anno-del": (d) => { const n = W.note(); n.annotations = n.annotations.filter((x) => x.id !== d.id); W.saveNote(n); X.renderInsp(); E.paint(); },
    "anno-filter": (d) => { S.ui.annoAll = d.id === "all"; X.renderInsp(); },
    jump: (d) => { const a = W.note().annotations.find((x) => x.id === d.id); if (a && !a.orphan) { E.activeId = a.id; E.select(a.start, a.end); X.renderInsp(); closeDrawers(); } },
    distill: () => W.Memory.distill(W.note()),
    "fix-to-anno": (d) => X.fixToAnno(+d.i),
    "use-title": (d) => { const n = W.note(), t = n.meta.titleList[+d.i], was = titleOf(n); n.title = t.t; W.saveNote(n, 0); W.Links.renameRefs(was, titleOf(n), n.id); X.renderPanes(); X.renderList(); W.toast("标题已换"); },
    "use-topic": (d) => { const n = W.note(), tc = n.meta.topicCard, c = [tc.input, ...(tc.alternatives || [])][+d.i]; n.brief = `${c.title}\n大众锚点：${c.anchor || ""}\n切口：${c.angle || ""}`; W.saveNote(n, 0); X.setTab("write"); },
    "lint-toggle": () => { E.lintOn = !E.lintOn; W.Editors.all.forEach((e) => e.paint()); W.$$('.doc-head [data-act="lint-toggle"]').forEach((sw) => (sw.checked = E.lintOn)); W.toast(E.lintOn ? "显示 AI 味、需补、长段标记" : "已隐藏标记"); },
    // 写作面板里的平台 / 体裁 / 灵魂：选项全部摆出来，点一下就换
    "nf-set": (d) => setNf(d.k, d.v),
    // 标题下面那一行：点哪一项就在原地弹出选项，选完马上生效
    "ds-pick": (d, e) => {
      const n = W.note(), b = e.target.closest("[data-act]"), r = b.getBoundingClientRect(), k = d.k;
      const opts = k === "platform" ? S.platforms.map((p) => [p.id, `${D.kinds.find((x) => x.id === p.kind)?.name || ""} · ${p.name}`, p.id === W.platform(n.platform).id])
        : k === "genre" ? S.genres.map((g) => [g.id, g.name, g.id === W.genre(n.genre).id])
        : k === "status" ? D.statuses.map((x) => [x.id, x.name, x.id === n.status])
        : S.souls.map((x) => [x.id, x.name, x.id === W.soul(n.soul)?.id]);
      U.menu(r.left - 4, r.bottom + 6, opts.map(([v, label, on]) => ({ label, icon: on ? "check" : "blank", run: () => {
        if (k === "status") { n.status = v; W.saveNote(n, 0); X.renderFolders(); X.renderList(); X.renderPanes(); }
        else setNf(k, v);
      } })));
    },
    "props-toggle": () => { S.ui.propsOpen = !S.ui.propsOpen; panes.forEach((_, i) => X.renderHead(i)); },
    "title-from-h1": () => { const n = W.note(), was = titleOf(n), h = h1Of(n); if (!h) return; n.title = h; W.saveNote(n, 0); const k = W.Links.renameRefs(was, h, n.id); if (k) W.toast(`更新了 ${k} 篇笔记里的链接`); X.renderList(); X.renderPanes(); },
    // 底栏的问题：点一下选中下一处，再点跳到再下一处
    "lint-jump": (d) => { const list = E.lastLint?.[d.k]; if (!list?.length) return; X._lj = X._ljk === d.k ? (X._lj + 1) % list.length : 0; X._ljk = d.k; const it = list[X._lj]; S.ui.mode = "edit"; X.renderPanes(); E.select(it.start, it.end); },
    "req-toggle": () => { S.ui.reqOpen = !S.ui.reqOpen; X.renderInsp(); },
    "neuro-preset": (d) => { const n = W.note(), p = D.neuroPresets.find((x) => x.id === d.id); n.neuro = { ...p.v }; U.setBars(W.$("#insp-body").querySelector(".nr-list"), p.v); bodyRefresh(n); W.saveNote(n); },
    "body-reset": () => { const n = W.note(); delete n.neuro; delete n.brain; W.saveNote(n); X.renderInsp(); },
    // 心智距离五档：点一档就把数值放到这一档中间，精确值去“心智”页拖
    "mind-band": (d) => { S.mindset.distance = +d.v; W.saveMindset(); X.renderInsp(); },
    "ver-save": async () => { const n = W.note(); await X.snapshot(n, "手动保存"); loadVersions(n); W.toast("存好了"); },
    "ver-view": (d) => { const v = X._vers[+d.i]; U.modal({ title: `${v.label} · ${W.ago(v.at)}`, wide: true, body: `<div class="pv-article">${W.md(v.text || "")}</div>`, actions: [{ label: "关闭", act: "close" }] }); },
    "ver-restore": async (d) => { const n = W.note(), v = X._vers[+d.i]; if (!(await U.confirm("用这个版本替换当前正文？当前正文会先存成一个版本。", { ok: "恢复" }))) return; await X.snapshot(n, "恢复前"); n.text = v.text; n.score = null; W.saveNote(n, 0); W.Editors.forNote(n.id).forEach((e) => e.load(n)); X.renderInsp(); W.toast("已恢复"); },
    "ver-del": async (d) => { const v = X._vers[+d.i]; if (!(await U.confirm("删除这个版本？删除后找不回来。", { ok: "删除", danger: true }))) return; await W.P.delVersion(W.note().id, v.id); loadVersions(W.note()); },
    "note-menu": () => noteMenu(),
    "drawer-notes": () => document.body.classList.toggle("show-notes"),
    "drawer-insp": () => document.body.classList.toggle("show-insp"),
    "close-drawers": () => closeDrawers(),
  };
  function noteMenu() {
    const n = W.note(); if (!n) return;
    U.modal({ title: titleOf(n), body: `<div class="menu-list">
      <button type="button" class="menu-item" data-m="pin">${I("pin", 16)}${n.pinned ? "取消置顶" : "置顶"}</button>
      <button type="button" class="menu-item" data-m="split">${I("side", 16)}在另一侧打开</button>
      <button type="button" class="menu-item" data-m="dup">${I("copy", 16)}复制一份</button>
      ${window.desk ? `<button type="button" class="menu-item" data-m="reveal">${I("folder", 16)}在访达中显示</button>` : ""}
      <button type="button" class="menu-item" data-m="copy">${I("copy", 16)}复制全文</button>
      <button type="button" class="menu-item" data-m="md">${I("down", 16)}导出 Markdown</button>
      <button type="button" class="menu-item danger" data-m="del">${I("trash", 16)}删除这篇笔记</button></div>`,
      onAct: async (a) => {
        if (a === "pin") { n.pinned = !n.pinned; W.saveNote(n, 0); X.renderList(); X.renderFolders(); }
        if (a === "dup") X.duplicate(n);
        if (a === "reveal") window.desk?.vault.reveal(n.path);
        if (a === "split") X.open(n.id, { pane: X.otherPane() });
        if (a === "copy") W.copy(n.text || "");
        if (a === "md") W.download((n.title || titleOf(n)).replace(/[\\/:*?"<>|]/g, "") + ".md", n.text || "", "text/markdown");
        if (a === "del") {
          setTimeout(async () => {
            X.deleteNote(n);
          }, 240);
        }
      } });
  }

  function setNf(k, val) {
    const n = W.note(); if (!n) return;
    n[k] = val; W.saveNote(n);
    if (k === "platform") { S.config.platform = val; W.saveConfig(); }
    if (k === "genre") { S.config.genre = val; W.saveConfig(); }
    if (k === "soul") { S.config.activeSoul = val; W.saveConfig(); }
    X.renderInsp(); X.renderPanes(); E.paint();
  }

  // ---------- 笔记、文件夹的增删改 ----------
  X.duplicate = (n) => { const c = W.clone(n); delete c.path; X.create({ ...c, id: W.uid("n"), title: titleOf(n) + " 副本", createdAt: W.now() }, { newTab: true }); };
  X.deleteNote = async (n) => {
    const back = W.Links.backlinks(n).length;
    if (!(await U.confirm(`删除“${titleOf(n)}”？${W.P.mode === "vault" ? "文件会放进废纸篓。" : "正文、批注和配图计划都会删掉，找不回来。"}${back ? `还有 ${back} 篇笔记链接到它，那些链接会变成未创建。` : ""}`, { ok: "删除", danger: true }))) return;
    S.notes = S.notes.filter((x) => x.id !== n.id); await W.P.del("notes", n.id);
    if (S.plans[n.id]) { delete S.plans[n.id]; W.P.del("plans", n.id); }
    X.dropNote(n.id); X.renderFolders(); X.renderList(); W.toast("已删除");
  };
  X.newFolder = async (parent = S.ui.folder && S.ui.folder !== "all" && S.ui.folder !== "pinned" ? S.ui.folder : "") => {
    const name = await U.ask(parent ? `在「${parent}」里新建文件夹` : "新建文件夹", { placeholder: "比如：AI 工具、旅行" });
    if (!name) return;
    const rel = (parent ? parent + "/" : "") + name.replace(/[\\/:*?"<>|]/g, " ").trim();
    if (S.folders.includes(rel)) { W.toast("已经有这个文件夹了"); return; }
    try { await W.P.mkdir(rel); } catch (e) { W.toast("没建成：" + (e?.message || e), "bad"); return; }
    S.ui.folder = rel; collapsed.delete(parent); saveCollapsed(); X.renderList();
  };
  const renameFolder = async (from) => {
    const base = from.split("/").pop(), parent = from.slice(0, -base.length - 1);
    const name = await U.ask("重命名文件夹", { value: base }); if (!name || name === base) return;
    const to = (parent ? parent + "/" : "") + name.replace(/[\\/:*?"<>|]/g, " ").trim();
    try { await W.P.renameFolder(from, to); } catch (e) { W.toast("没改成：" + (e?.message || e), "bad"); return; }
    if (S.ui.folder === from) S.ui.folder = to;
    X.renderList(); X.renderPanes();
  };
  const moveFolder = async (from, into) => {
    const to = (into ? into + "/" : "") + from.split("/").pop();
    if (to === from || into === from || into.startsWith(from + "/")) return;
    try { await W.P.renameFolder(from, to); } catch (e) { W.toast("没移动成：" + (e?.message || e), "bad"); return; }
    X.renderList(); X.renderPanes();
  };
  const deleteFolder = async (rel) => {
    const n = S.notes.filter((x) => (x.folder || "") === rel || (x.folder || "").startsWith(rel + "/")).length;
    if (!(await U.confirm(`删除文件夹「${rel}」${n ? `和里面的 ${n} 篇笔记` : ""}？${W.P.mode === "vault" ? "会放进废纸篓。" : "删除后找不回来。"}`, { ok: "删除", danger: true }))) return;
    const ids = S.notes.filter((x) => (x.folder || "") === rel || (x.folder || "").startsWith(rel + "/")).map((x) => x.id);
    await W.P.deleteFolder(rel); ids.forEach(X.dropNote);
    if (S.ui.folder === rel) S.ui.folder = null;
    X.renderFolders(); X.renderList();
  };
  const moveNote = (id, folder) => {
    const n = W.note(id); if (!n || (n.folder || "") === folder) return;
    n.folder = folder; W.saveNote(n, 0); collapsed.delete(folder); saveCollapsed(); X.renderList(); X.renderPanes();
  };
  // 右键菜单
  const noteCtx = (n, x, y) => U.menu(x, y, [
    { label: "在新标签页打开", icon: "plus", run: () => X.open(n.id, { newTab: true }) },
    { label: "在另一侧打开", icon: "side", run: () => X.open(n.id, { pane: X.otherPane() }) }, "-",
    { label: "重命名", icon: "pen", run: () => { X.open(n.id); setTimeout(() => { const t = pane().el.meta.querySelector('[data-doc="title"]'); t?.focus(); t?.select(); }, 30); } },
    { label: n.pinned ? "取消置顶" : "置顶", icon: "pin", run: () => { n.pinned = !n.pinned; W.saveNote(n, 0); X.renderList(); } },
    { label: "复制一份", icon: "copy", run: () => X.duplicate(n) },
    { label: "复制链接 [[ ]]", icon: "list", run: () => W.copy(`[[${titleOf(n)}]]`) },
    ...(window.desk ? [{ label: "在访达中显示", icon: "folder", run: () => window.desk.vault.reveal(n.path) }] : []), "-",
    { label: "删除", icon: "trash", danger: true, run: () => X.deleteNote(n) },
  ]);
  const folderCtx = (rel, x, y) => U.menu(x, y, [
    { label: "在这里新建笔记", icon: "plus", run: () => { S.ui.folder = rel; X.create({ status: "draft" }, { newTab: true }); } },
    { label: "新建子文件夹", icon: "folder", run: () => X.newFolder(rel) }, "-",
    { label: "重命名", icon: "pen", run: () => renameFolder(rel) },
    ...(window.desk ? [{ label: "在访达中显示", icon: "folder", run: () => window.desk.vault.reveal(rel) }] : []), "-",
    { label: "删除文件夹", icon: "trash", danger: true, run: () => deleteFolder(rel) },
  ]);

  X.mount = () => {
    const v = W.$("#v-desk"), list = W.$("#note-list");
    makePane();
    // 恢复上次打开的标签页和分屏
    const saved = W.ls.get("wbd:panes");
    S.ui.recent = W.ls.get("wbd:recent") || [];
    X.restore = () => {
      const ok = (ids) => (ids || []).filter((id) => W.note(id));
      const ps = saved?.panes?.map((p) => ({ tabs: ok(p.tabs), active: W.note(p.active) ? p.active : null })).filter((p) => p.tabs.length) || [];
      if (!ps.length) return false;
      ps.slice(0, 2).forEach((p, i) => { if (i >= panes.length) makePane(); panes[i].tabs = p.tabs; X.open(p.active || p.tabs[0], { pane: i }); });
      if (panes.length > 1) X.focusPane(Math.min(saved.cur || 0, panes.length - 1));
      return true;
    };
    v.addEventListener("click", (e) => {
      // 文件夹：点一下展开 / 收起，同时选中（新笔记放进去）
      const fo = e.target.closest(".tr-folder");
      if (fo) { const f = fo.dataset.folder; S.ui.folder = f; collapsed.has(f) ? collapsed.delete(f) : collapsed.add(f); saveCollapsed(); X.renderList(); return; }
      const tab = e.target.closest(".tab-note");
      if (tab && !e.target.closest(".tab-x")) { const pi = panes.findIndex((p) => p.root.contains(tab)); X.open(tab.dataset.tab, { pane: pi }); return; }
      const el = e.target.closest("[data-act]"); if (!el || el.tagName === "INPUT" && el.type === "checkbox") return;
      const fn = acts[el.dataset.act]; if (fn) { e.preventDefault(); fn(el.dataset, e); }
    });
    // 中键关闭标签页 / 新标签页打开
    v.addEventListener("auxclick", (e) => {
      if (e.button !== 1) return;
      const tab = e.target.closest(".tab-note"); if (tab) { e.preventDefault(); X.closeTab(panes.findIndex((p) => p.root.contains(tab)), tab.dataset.tab); return; }
      const it = e.target.closest('[data-act="open"]'); if (it) { e.preventDefault(); X.open(it.dataset.id, { newTab: true }); }
    });
    v.addEventListener("keydown", (e) => {
      const fo = e.target.closest?.(".tr-folder"); if (fo && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fo.click(); }
    });
    list.addEventListener("contextmenu", (e) => {
      const it = e.target.closest('[data-act="open"]'), fo = e.target.closest(".tr-folder");
      if (it) { e.preventDefault(); noteCtx(W.note(it.dataset.id), e.clientX, e.clientY); }
      else if (fo) { e.preventDefault(); folderCtx(fo.dataset.folder, e.clientX, e.clientY); }
    });
    W.$("#panes").addEventListener("contextmenu", (e) => { const tab = e.target.closest(".tab-note"); if (tab) { e.preventDefault(); noteCtx(W.note(tab.dataset.tab), e.clientX, e.clientY); } });
    // 拖动整理：笔记拖进文件夹 = 移动；文件夹拖进文件夹 = 移动；笔记拖进正文 = 插入 [[链接]]
    list.addEventListener("dragstart", (e) => {
      const it = e.target.closest('[data-act="open"]'), fo = e.target.closest(".tr-folder");
      if (it) { const n = W.note(it.dataset.id); e.dataTransfer.setData("text/wd-note", n.id); e.dataTransfer.setData("text/plain", `[[${titleOf(n)}]]`); e.dataTransfer.effectAllowed = "copyMove"; }
      else if (fo) { e.dataTransfer.setData("text/wd-folder", fo.dataset.folder); e.dataTransfer.effectAllowed = "move"; }
    });
    const dropTarget = (e) => e.target.closest(".tr-folder, .tr-root-drop") || (e.target.closest(".note-list") ? list.querySelector(".tr-root-drop") : null);
    list.addEventListener("dragover", (e) => {
      const t = dropTarget(e); if (!t || !(e.dataTransfer.types.includes("text/wd-note") || e.dataTransfer.types.includes("text/wd-folder"))) return;
      e.preventDefault(); e.dataTransfer.dropEffect = "move";
      list.querySelectorAll(".drop").forEach((x) => x !== t && x.classList.remove("drop")); t.classList.add("drop");
      clearTimeout(X._dragOpen); if (t.classList.contains("tr-folder") && collapsed.has(t.dataset.folder)) X._dragOpen = setTimeout(() => { collapsed.delete(t.dataset.folder); X.renderList(); }, 700);
    });
    list.addEventListener("dragleave", (e) => { if (!list.contains(e.relatedTarget)) list.querySelectorAll(".drop").forEach((x) => x.classList.remove("drop")); });
    list.addEventListener("drop", (e) => {
      const t = dropTarget(e); list.querySelectorAll(".drop").forEach((x) => x.classList.remove("drop")); if (!t) return;
      e.preventDefault(); const into = t.dataset.folder || "";
      const nid = e.dataTransfer.getData("text/wd-note"), fid = e.dataTransfer.getData("text/wd-folder");
      if (nid) moveNote(nid, into); else if (fid) moveFolder(fid, into);
    });
    // 把笔记拖到“状态”上：改成那个状态
    const stBox = W.$("#status-filter");
    const stClear = () => stBox.querySelectorAll(".drop").forEach((x) => x.classList.remove("drop"));
    stBox.addEventListener("dragover", (e) => {
      const r = e.target.closest("[data-drop-status]"); if (!r || !e.dataTransfer.types.includes("text/wd-note")) return;
      e.preventDefault(); e.dataTransfer.dropEffect = "move"; stBox.querySelectorAll(".drop").forEach((x) => x !== r && x.classList.remove("drop")); r.classList.add("drop");
    });
    stBox.addEventListener("dragleave", (e) => { if (!stBox.contains(e.relatedTarget)) stClear(); });
    stBox.addEventListener("drop", (e) => {
      const r = e.target.closest("[data-drop-status]"); stClear(); if (!r) return;
      e.preventDefault(); const n = W.note(e.dataTransfer.getData("text/wd-note")), to = r.dataset.dropStatus; if (!n || n.status === to) return;
      n.status = to; W.saveNote(n, 0); X.renderFolders(); X.renderList(); X.renderPanes();
      W.$(`#status-filter [data-drop-status="${to}"]`)?.classList.add("got");
      W.toast(`「${titleOf(n)}」改成了${D.statuses.find((x) => x.id === to).name}`);
    });
    document.addEventListener("dragend", () => { stClear(); list.querySelectorAll(".drop").forEach((x) => x.classList.remove("drop")); });
    setNewMode(W.ls.get("wbd:newMode") || "ai");
    W.$("#note-q").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); X.sideMode("files"); } });
    if (W.ls.get("wbd:sideHidden") && !narrow()) document.body.classList.add("hide-notes");
    document.body.dataset.side = S.ui.side = "files";

    v.addEventListener("change", (e) => {
      const t = e.target, n = W.note();
      if (t.dataset.doc === "folder") { moveNote(n.id, t.value); }
      else if (t.dataset.doc === "status") { n.status = t.value; W.saveNote(n, 0); X.renderFolders(); X.renderList(); X.renderPanes(); }
      else if (t.dataset.doc === "title") commitTitle(n, t);
      else if (t.dataset.act === "lint-toggle") { E.lintOn = t.checked; W.Editors.all.forEach((x) => x.paint()); }
      else if (t.id === "mat-add" && t.value) { (n.materials ||= []).push(t.value); W.saveNote(n); X.renderInsp(); }
      else if (t.dataset.nf && t.tagName === "SELECT") setNf(t.dataset.nf, t.value);
      else if (t.dataset.act === "remember") {
        const a = n.annotations.find((x) => x.id === t.dataset.id); a.remember = t.checked; W.saveNote(n);
        if (t.checked && !a.memoryId) W.Memory.fromAnno(n, a);
      } else if (t.dataset.act === "score-marks") { E.showScore = t.checked; E.paint(); }
    });
    // 标题：边打边更新列表；写作库里离开输入框才改文件名，同时更新别处的 [[链接]]
    v.addEventListener("focusin", (e) => { if (e.target.dataset?.doc === "title") e.target._was = titleOf(W.note()); });
    v.addEventListener("keydown", (e) => { if (e.target.dataset?.doc === "title" && e.key === "Enter") { e.preventDefault(); e.target.blur(); pane().editor.ta.focus(); } });
    const commitTitle = (n, t) => {
      const was = t._was; t._was = titleOf(n);
      if (W.P.mode === "vault") W.saveNote(n, 0);
      if (was && was !== titleOf(n)) { const k = W.Links.renameRefs(was, titleOf(n), n.id); if (k) W.toast(`更新了 ${k} 篇笔记里的链接`); }
    };
    v.addEventListener("input", (e) => {
      const t = e.target, n = W.note();
      if (t.id === "note-q") { S.ui.q = t.value.trim(); X._listAnim = true; X.renderList(); return; }
      if (!n) return;
      if (t.dataset.doc === "title") {
        n.title = t.value;
        if (W.P.mode !== "vault") W.saveNote(n); else n.updatedAt = W.now();
        X.renderList(); panes.forEach((_, i) => X.renderTabs(i)); crumb();
      }
      else if (t.dataset.doc === "tags") { n.tags = t.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean); W.saveNote(n); }
      else if (t.dataset.nf && t.tagName !== "SELECT") { n[t.dataset.nf] = t.value; W.saveNote(n); }
      else if (t.dataset.bar) { const k = t.dataset.bar; n[k] = { ...(n[k] || {}), [t.dataset.id]: +t.value }; bodyRefresh(n); saveBodySoon(n); }
      else if (t.id === "w-mind") { S.mindset.distance = +t.value; W.$("#w-mind-band").textContent = W.idAtLevel(+t.value).name; W.saveMindset(); }
    });
    v.addEventListener("mouseover", (e) => {
      const c = e.target.closest("[data-anno]"); const id = c?.dataset.anno || null;
      if (id === X._hover) return; X._hover = id;
      const a = id && W.note()?.annotations.find((x) => x.id === id);
      E.flash = a && !a.orphan ? { start: a.start, end: a.end } : null; E.paint();
    });
    // 预览里的 [[链接]]
    W.$("#panes").addEventListener("click", (e) => { const a = e.target.closest("a.wikilink"); if (a) { e.preventDefault(); W.Links.follow(a.dataset.link, { newTab: e.metaKey || e.ctrlKey, split: e.altKey }); } });
    W.$("#scrim").addEventListener("click", closeDrawers);
    W.on("anno:new", (a, now) => {
      S.ui.tab = "anno"; X.renderInsp();
      if (a.remember) W.Memory.fromAnno(W.note(), a);
      if (now && a.type !== "keep") X.reviseAnnos([a.id]);
    });
    W.on("anno:focus", (id) => { E.activeId = id; E.paint(); if (S.ui.tab !== "anno") S.ui.tab = "anno"; X.renderInsp(); W.$(`[data-anno="${id}"]`)?.scrollIntoView({ block: "nearest" }); });
    // 同一篇在两侧都开着：一边改，另一边跟着变
    W.on("text", (note, src) => { for (const e of W.Editors.forNote(note.id)) if (e !== src) e.syncFrom(note); });
    W.on("editor:focus", (ed) => { const i = panes.findIndex((p) => p.editor === ed); if (i >= 0) X.focusPane(i); });
    // 写作库：保存后文件名可能被加了编号；别的程序（比如 Obsidian）改了文件就刷新
    W.on("note:saved", (id, r) => {
      const n = W.note(id); if (!n || !r) return;
      n.path = r.path;
      const editing = document.activeElement?.dataset?.doc === "title" && id === S.ui.noteId;
      if (!editing && r.title && r.title !== n.title) { n.title = r.title; X.renderList(); X.renderPanes(); }
    });
    window.desk?.vault.onExternal((ev) => {
      if (ev.type === "delete") { S.notes = S.notes.filter((x) => x.id !== ev.id); X.dropNote(ev.id); X.renderList(); return; }
      const nn = ev.note, cur = W.note(nn.id);
      if (cur) { Object.assign(cur, { text: nn.text, title: nn.title, folder: nn.folder, path: nn.path, tags: nn.tags, status: nn.status, extra: nn.extra }); for (const e of W.Editors.forNote(cur.id)) e.syncFrom(cur); }
      else { S.notes.unshift(nn); if (nn.folder && !S.folders.includes(nn.folder)) S.folders.push(nn.folder); }
      X.renderList(); X.renderPanes();
    });
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); W.P.flushAll(); W.toast("已保存"); }
    });
  };
  // ---------- 侧栏：笔记 / 搜索 两种模式，可以收起（标题栏上的图标，⌘[、⇧⌘F） ----------
  const narrow = () => innerWidth < 1280;
  const sideMark = () => {
    const shown = narrow() ? document.body.classList.contains("show-notes") : !document.body.classList.contains("hide-notes");
    W.$$("#top-side [data-side=files], #top-side [data-side=search]").forEach((b) => b.classList.toggle("on", shown && S.ui.view === "desk" && b.dataset.side === (S.ui.side || "files")));
    const t = W.$('#top-side [data-side="toggle"]'); if (t) t.setAttribute("aria-label", shown ? "收起侧栏" : "展开侧栏");
  };
  X.showSide = (show) => {
    const b = document.body;
    if (narrow()) { b.classList.toggle("show-notes", show); sideMark(); return; }
    const hidden = b.classList.contains("hide-notes"); if (show === !hidden) return sideMark();
    const pn = W.$("#panes"), x0 = pn.getBoundingClientRect().left;
    const settle = () => { // 稿纸从原来的位置滑到新位置，而不是跳过去
      const dx = x0 - pn.getBoundingClientRect().left; if (!dx || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      pn.classList.remove("shift"); pn.style.transform = `translateX(${dx}px)`; void pn.offsetWidth; pn.classList.add("shift"); pn.style.transform = "";
      setTimeout(() => pn.classList.remove("shift"), 400);
    };
    if (show) { b.classList.remove("hide-notes"); const nt = W.$("#notes"); nt.classList.remove("enter"); void nt.offsetWidth; nt.classList.add("enter"); settle(); }
    else { b.classList.add("notes-leaving"); setTimeout(() => { b.classList.remove("notes-leaving"); b.classList.add("hide-notes"); settle(); sideMark(); }, 130); }
    W.ls.set("wbd:sideHidden", !show); sideMark();
  };
  X.toggleSide = () => X.showSide(narrow() ? !document.body.classList.contains("show-notes") : document.body.classList.contains("hide-notes"));
  X.sideMode = (m) => {
    if (S.ui.view !== "desk") W.App.go("desk");
    S.ui.side = m; document.body.dataset.side = m; X.showSide(true);
    const q = W.$("#note-q");
    if (m === "search") { q.focus(); q.select(); }
    else if (S.ui.q) { q.value = ""; S.ui.q = ""; X._listAnim = true; X.renderList(); }
    sideMark();
  };
  X.sideMark = sideMark;
  X.refresh = () => { X.renderFolders(); X.renderList(); X.renderPanes(); X.renderInsp(); };
  return X;
})();
