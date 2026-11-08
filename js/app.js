/* 启动、页面切换、连接状态。网页版和 Mac App 共用；window.desk 存在时就是 Mac App。 */
W.App = (() => {
  const S = W.S, D = window.DEF;
  const A = {};
  const VIEWS = ["desk", "topics", "graph", "souls", "mind", "nature", "memory", "settings"];

  const NAMES = { desk: "写作", topics: "选题", graph: "关系图谱", souls: "灵魂", mind: "心智", nature: "人性", memory: "记忆", settings: "参数" };
  // 顶栏里的“当前位置”：写作页显示 文件夹 › 标题，其它页面显示页面名
  A.crumb = (parts) => {
    const chev = W.UI.icon("chev", 14);
    const lead = S.vault ? [S.vault.name] : [];
    W.$("#crumb").innerHTML = [...lead, ...parts].filter(Boolean).map((p, i, a) => `${chev}${i === a.length - 1 ? `<b>${W.esc(p)}</b>` : `<span>${W.esc(p)}</span>`}`).join("");
  };

  A.go = (view) => {
    // 配图现在在写作页右侧的流程里
    if (view === "illus") { A.go("desk"); W.Desk.setTab("illus"); return; }
    if (!VIEWS.includes(view)) view = "desk";
    const prev = S.ui.view, changed = prev !== view;
    if (changed && prev === "graph") W.Graph.leave();
    S.ui.view = view; document.body.dataset.view = view; W.Desk.sideMark?.();
    // 换页：旧页留在原地 120ms 淡出，新页按导航方向（往下点从下面来，往上点从上面来）进来
    const dir = Math.sign(VIEWS.indexOf(view) - VIEWS.indexOf(prev)) || 1;
    for (const v of VIEWS) {
      const el = W.$("#v-" + v);
      clearTimeout(el._out); el.classList.remove("out");
      if (v === view) { el.hidden = false; if (changed) { el.dataset.dir = dir; el.classList.remove("in"); void el.offsetWidth; el.classList.add("in"); } }
      else if (changed && v === prev && prev && !el.hidden) { el.classList.remove("in"); el.classList.add("out"); el._out = setTimeout(() => { el.hidden = true; el.classList.remove("out"); }, 130); }
      else el.hidden = true;
    }
    if (view !== "desk") A.crumb([NAMES[view]]);
    if (changed) setTimeout(() => W.Tour?.maybe("view-" + view), 450);
    W.$$("#rail [data-view]").forEach((b) => { const on = b.dataset.view === view; b.classList.toggle("on", on); b.setAttribute("aria-current", on ? "page" : "false"); });
    document.body.classList.remove("show-notes", "show-insp");
    W.Editor.hideBar?.(true);
    if (view === "desk") { W.Desk.refresh(); W.Editors.all.forEach((e) => e.paint()); }
    else if (view === "graph") W.Graph.render();
    else if (view === "topics") W.Topics.render();
    else W.Panels.render(view);
    W.$("#main").scrollTop = 0;
    W.ls.set("wbd:view", view);
  };
  A.guide = (view) => W.Tour?.guide(view);
  A.applyFont = () => { document.documentElement.dataset.edfont = S.config.editorFont || "serif"; };

  function status() {
    const mode = W.P.mode, ai = W.AI.ready && W.AI.hasKey();
    const where = { cloud: ["cloud", "云端已同步", "保存在页面的云端数据库，换设备打开同一个链接也在"], vault: ["folder", "已存进写作库", "笔记就是写作库文件夹里的 .md 文件：" + (S.vault?.path || "")], local: ["device", "存在本机", "只保存在这台浏览器，记得在“参数 › 数据”里备份"] }[mode];
    W.$("#top-status").innerHTML = `<button type="button" class="tstat ai" data-top="ai" title="${W.esc(W.AI.detail())}"><span class="dot ${ai ? (W.AI.desk && !W.AI.okAt ? "warn" : "") : "off"}"></span>${W.esc(W.AI.label())}</button>
      <button type="button" class="tstat" data-top="vault" title="${W.esc(where[2])}">${W.UI.icon(where[0], 15)}<span id="save-top">${where[1]}</span></button>`;
  }
  A.status = status;
  // 侧栏顶上的写作库名字（像 Codex 的工作区切换）：点开是写作库相关的操作
  const vaultName = () => { const el = W.$("#vault-name"); if (el) el.textContent = S.vault?.name || (W.P.mode === "cloud" ? "云端笔记" : "我的笔记"); };
  A.vaultMenu = () => {
    const r = W.$("#vault-h").getBoundingClientRect();
    const items = window.desk
      ? [{ label: "打开其他写作库…", icon: "folder", run: () => window.desk.vault.choose() }, { label: "在访达中显示", icon: "eye", run: () => window.desk.vault.reveal() }, "-", { label: "导出 / 备份…", icon: "down", run: () => A.go("settings") }]
      : [{ label: W.P.mode === "cloud" ? "笔记存在页面的云端数据库" : "笔记只存在这台浏览器", icon: "info", run: () => A.go("settings") }, { label: "导出 / 备份…", icon: "down", run: () => A.go("settings") }];
    W.UI.menu(r.left, r.bottom + 4, items);
  };

  A.boot = async () => {
    try { history.scrollRestoration = "manual"; } catch {}
    if (window.desk) document.documentElement.classList.add("is-desk");
    W.$("#logo").innerHTML = W.UI.logo(24);
    // 写在 HTML 里的 data-ic：统一用同一套图标画
    W.$$("[data-ic]").forEach((el) => el.insertAdjacentHTML("afterbegin", W.UI.icon(el.dataset.ic, el.closest(".rail") ? 20 : el.closest(".top-side") ? 18 : el.matches(".vault-chev") ? 12 : 16)));
    A.crumb(["写作"]);
    A.applyFont();
    W.Desk.mount(); W.Panels.mount(); W.Illus.mount(); W.Topics.mount();
    W.$("#rail").addEventListener("click", (e) => { const b = e.target.closest("[data-view]"); if (b) A.go(b.dataset.view); });
    document.addEventListener("click", (e) => { const b = e.target.closest("[data-view-go]"); if (b) { e.preventDefault(); A.go(b.dataset.viewGo); } });
    W.$("#top-side").addEventListener("click", (e) => {
      const b = e.target.closest("[data-side]"); if (!b) return;
      if (b.dataset.side === "toggle") W.Desk.toggleSide(); else W.Desk.sideMode(b.dataset.side);
    });
    W.$("#notes").addEventListener("click", (e) => { if (e.target.closest(".search-x")) W.Desk.sideMode("files"); });
    W.$("#top-status").addEventListener("click", (e) => {
      const b = e.target.closest("[data-top]"); if (!b) return;
      if (b.dataset.top === "ai" && W.AI.desk) W.Panels.aiSettings();
      if (b.dataset.top === "vault" && window.desk) window.desk.vault.reveal();
    });
    W.$("#v-desk").classList.add("loading");
    await Promise.all([W.P.init(), W.AI.init()]);
    W.$("#v-desk").classList.remove("loading");
    // 空库时用出厂值兜底（只在内存里，第一次修改才写入）
    if (!S.souls.length) S.souls = W.clone(D.souls);
    if (!S.nature.length) S.nature = W.clone(D.nature).map((n, i) => ({ ...n, order: i }));
    if (!W.soul(S.config.activeSoul)) S.config.activeSoul = S.souls[0].id;
    A.applyFont(); status(); vaultName();
    W.$("#vault-h").addEventListener("click", A.vaultMenu);
    W.on("ai", status); W.on("storage", status); W.on("ai:settings", status);
    W.on("saving", (on) => { const s = W.$("#save-top"); if (s) s.textContent = on ? "保存中…" : { cloud: "云端已同步", vault: "已存进写作库", local: "存在本机" }[W.P.mode]; });
    W.on("ai:fix", () => { if (W.AI.desk) W.Panels.aiSettings(); });
    window.desk?.onMenu((cmd) => W.Cmd.run(cmd));
    const hash = location.hash.replace("#", "");
    A.go(VIEWS.includes(hash) ? hash : W.ls.get("wbd:view") || "desk");
    if (!W.Desk.restore()) {
      const lastId = W.ls.get("wbd:last");
      const first = W.note(lastId) ? lastId : [...S.notes].sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1))[0]?.id || null;
      W.Desk.open(first);
    }
    if (S.ui.view !== "desk") A.go(S.ui.view);
    // Mac App 第一次打开、还没填 key：提醒一次
    if (W.AI.desk && !W.AI.hasKey() && !W.ls.get("wbd:ai-asked")) { W.ls.set("wbd:ai-asked", 1); setTimeout(() => W.Panels.aiSettings(true), 600); }
    setTimeout(() => W.Tour.maybe("view-" + S.ui.view), 900);
    addEventListener("pagehide", () => W.P.flushAll());
    addEventListener("beforeunload", () => W.P.flushAll());
    document.addEventListener("visibilitychange", () => { if (document.hidden) W.P.flushAll(); });
  };
  return A;
})();
W.App.boot();
