/* 选题：联网找最近的热点（Claude 联网搜索，或 DeepSeek / Kimi / 通义千问的搜索），
   按作者的灵魂、用户心智和人性表改成能写的题，放进选题池；点“开写”就新建一篇并把要求填好。 */
W.Topics = (() => {
  const S = W.S, D = window.DEF, U = W.UI, I = W.UI.icon, esc = W.esc;
  const T = {};
  let job = null;
  const cfg = () => (S.config.topic ||= { keywords: [], range: "3", count: 8 });
  const save = W.debounce(() => W.saveList("topics"), 300);
  const RANGE = { 1: "最近 24 小时", 3: "最近 3 天", 7: "最近一周" };
  const KEYS = [["mass", "大众度"], ["relevance", "切身性"], ["emotion", "情绪"], ["timely", "时效"], ["fresh", "新角度"], ["barrier", "门槛"]];
  const bar = (t) => (+t.scores?.mass || 0) + (+t.scores?.relevance || 0);
  const total = (t) => KEYS.reduce((s, [k]) => s + (k === "barrier" ? 6 - (+t.scores?.[k] || 3) : +t.scores?.[k] || 0), 0);
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

  T.render = () => {
    const v = W.$("#v-topics"), c = cfg(), via = W.AI.searchVia(), f = S.ui.tpFilter || "new";
    const list = S.topics.filter((t) => t.status !== "dropped");
    const counts = { new: list.filter((t) => t.status === "new").length, saved: list.filter((t) => t.status === "saved").length, used: list.filter((t) => t.status === "used").length, all: list.length };
    const shown = list.filter((t) => f === "all" || t.status === f).sort((a, b) => (b.at > a.at ? 1 : b.at < a.at ? -1 : total(b) - total(a)));
    const plats = S.platforms;
    v.innerHTML = `<header class="vh"><div><h1>选题</h1><p class="vh-sub">联网找最近的热点，按你的灵魂和读者改成能写的题。</p></div><div class="btn-row"></div></header>
      <section class="card tp-bar">
        <div class="field"><span>关注的领域和关键词 <em>· 不填就按灵魂里写的领域找</em></span>
          <div class="chips" id="tp-kw">${c.keywords.map((k, i) => `<span class="chip">${esc(k)}<button type="button" class="chip-x" data-tp="kw-del" data-i="${i}" aria-label="删掉 ${esc(k)}">${I("x", 12)}</button></span>`).join("")}<input class="chip-input" id="tp-kw-in" placeholder="＋ 加一个，回车" aria-label="加一个关键词"></div></div>
        <div class="tp-row">
          <div class="field"><span>时间范围</span>${U.segRadios("tp-range", 'data-tp-f="range"', c.range, Object.entries(RANGE).map(([k, nm]) => [k, nm.replace("最近 ", "")]), "时间范围")}</div>
          <label class="field"><span>写到哪</span><select data-tp-f="platform">${plats.map((p) => `<option value="${p.id}" ${p.id === (c.platform || S.config.platform) ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
          <div class="field"><span>一次出几个</span>${U.stepper('data-tp-f="count"', c.count, { min: 3, max: 15, label: "一次出几个", size: "sm" })}</div>
        </div>
        <div class="tp-go">
          <p class="hint">${via ? `用${esc(via)}：大约一两分钟，每次会搜索 6–10 次，消耗一些额度。` : W.AI.desk ? `现在的 AI 接口不能联网，只能凭已有知识出题，时效性差。<button type="button" class="link" data-tp="ai">换成能联网的接口</button>` : "网页版不能联网，AI 只能凭已有知识出题；在 Mac App 里用 Claude 或 DeepSeek 就能联网找热点。"}</p>
          ${job ? `<div class="jobbar tp-job" role="status"><span class="ink-dot busy" aria-hidden="true"></span><span class="grow">${esc(job.label)}</span><button type="button" class="btn sm" data-tp="stop">停止</button></div>`
            : `<button type="button" class="btn primary" data-tp="run">${I("search", 15)}${via ? "联网找选题" : "出选题"}</button>`}
        </div>
      </section>
      ${list.length ? `<div class="seg sm tp-filter" role="tablist" aria-label="筛选">${[["new", "新的"], ["saved", "收藏"], ["used", "已开写"], ["all", "全部"]].map(([k, nm]) => `<button type="button" class="${f === k ? "on" : ""}" data-tp="filter" data-id="${k}">${nm} <span class="muted">${counts[k]}</span></button>`).join("")}</div>` : ""}
      <div class="tp-list">${shown.length ? shown.map(card).join("") : list.length ? `<p class="empty-small">这里还没有选题</p>` : `<div class="tp-empty"><b>选题池是空的</b><p>填几个你关注的领域，点“${via ? "联网找选题" : "出选题"}”。AI 会去找最近的新闻、热点和讨论，挑出大众关心、你又有话说的，改成能直接写的题。</p></div>`}</div>`;
  };
  const card = (t) => {
    const b = bar(t), ok = b >= S.config.topicBar;
    return `<article class="tp-card ${t.status}" data-tid="${t.id}">
      <header class="tp-h"><span class="tp-score ${ok ? "good" : ""}" title="大众度 + 切身性，${S.config.topicBar} 分以上才过门槛">${b}<small>/10</small></span><b class="tp-title">${esc(t.title)}</b>
        <button type="button" class="icon-btn sm" data-tp="save" aria-pressed="${t.status === "saved"}" title="${t.status === "saved" ? "取消收藏" : "收藏"}" aria-label="收藏">${I("star", 16)}</button>
        <button type="button" class="icon-btn sm" data-tp="drop" title="不要这个">${I("x", 15)}</button></header>
      ${t.event ? `<p class="tp-event">${t.when ? `<span class="pill">${esc(t.when)}</span>` : ""}${esc(t.event)}</p>` : ""}
      <dl class="tp-kv">${t.why ? `<dt>为什么现在</dt><dd>${esc(t.why)}</dd>` : ""}${t.angle ? `<dt>我的切口</dt><dd>${esc(t.angle)}</dd>` : ""}${t.anchor ? `<dt>大众锚点</dt><dd>${esc(t.anchor)}</dd>` : ""}${t.natures?.length ? `<dt>调动</dt><dd>${esc(t.natures.join("、"))}</dd>` : ""}</dl>
      <div class="tp-scores">${KEYS.map(([k, nm]) => `<span title="${nm}${k === "barrier" ? "（越低越好）" : ""}">${nm}<i class="dots">${"●".repeat(+t.scores?.[k] || 0)}${"○".repeat(5 - (+t.scores?.[k] || 0))}</i></span>`).join("")}</div>
      ${t.risk ? `<p class="tp-risk">${I("alert", 14)}${esc(t.risk)}</p>` : ""}
      <div class="tp-foot">
        <div class="tp-src">${(t.sources || []).slice(0, 3).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title || s.url)}">${esc(host(s.url))}</a>`).join("") || (t.offline ? `<span class="muted small">没联网，凭已有知识</span>` : "")}</div>
        <button type="button" class="btn sm ${t.noteId ? "" : "primary"}" data-tp="write">${t.noteId ? "打开笔记" : `${I("pen", 14)}开写`}</button>
      </div>
    </article>`;
  };

  // ---------- 找选题 ----------
  async function run() {
    const c = cfg(), via = W.AI.searchVia(), soul = W.soul(), p = W.platform(c.platform || S.config.platform);
    const kw = c.keywords.length ? c.keywords.join("、") : `作者灵魂里写到的领域（${soul?.identity || "科技、生活"}）`;
    const seen = S.topics.slice(-60).map((t) => t.title).join("；") || "（无）";
    const written = S.notes.slice(0, 40).map((n) => W.Desk.titleOf(n)).join("；");
    const fake = { platform: p.id, genre: S.config.genre, soul: soul?.id };
    const prompt = `${W.context(fake, { rules: ["priority", "topics"] })}
【任务】自动选题。${via ? `先联网搜索${RANGE[c.range]}内和这些领域有关的新闻、新品、翻车、政策、争议和网上的讨论：${kw}。至少搜 6 次，覆盖不同角度（官方消息、媒体报道、社交平台上普通人的讨论）。只用搜到的、有日期的真实事件，不要编造事件、数字和引语。` : `凭你已有的知识，找和这些领域有关、近期大概率还有人关心的话题：${kw}。你没有联网，不要编造具体日期、数字和引语；拿不准的写“需核实”。`}
然后按【规则 · 选题】、作者的灵魂、用户心智和人性抓手，挑出 ${c.count} 个最值得写的，改成能直接写的选题（目标平台：${p.name}）。
要求：
- 每个选题对应一个具体的真实事件或讨论，写清楚是什么、什么时候${via ? "、来源网址" : ""}
- 切口必须是这个作者能写、别人没写的：用上灵魂里的立场、在乎的东西和真实经历
- 按选题卡 6 项各打 1–5 分；大众度 + 切身性低于 ${S.config.topicBar} 的不要
- 不要和这些重复：已经在选题池里的「${seen}」；已经写过的「${written}」
只输出 JSON：{"topics":[{"title":"选题标题（像能直接发的标题）","event":"对应的事件，一句话","when":"日期，如 11 月 1 日","why":"为什么现在写","angle":"我的切口","anchor":"大众锚点","natures":["调动的人性"],"scores":{"mass":1,"relevance":1,"emotion":1,"timely":1,"fresh":1,"barrier":1},"sources":[{"title":"来源标题","url":"https://…"}],"risk":"风险或红线，没有就留空"}]}`;
    const ctl = new AbortController();
    job = { label: via ? `正在用${via}找${RANGE[c.range]}的热点…` : "AI 在出选题…", ctl }; T.render();
    const tick = W.debounce((text) => { if (!job) return; const line = text.split("\n").map((x) => x.trim()).filter(Boolean).pop() || ""; job.label = line && !/^[{\["]/.test(line) ? line.slice(0, 60) : job.label; const el = W.$(".tp-job .grow"); if (el) el.textContent = job.label; }, 150);
    try {
      const r = await W.AI.run(prompt, { json: true, tier: "write", signal: ctl.signal, label: "自动选题", ...(via ? { search: { maxUses: 10 } } : {}), onText: ({ text }) => tick(text) });
      const at = W.now(), batch = W.uid("b"), extra = r._sources || [];
      const got = (r.topics || []).filter((t) => t?.title).map((t) => ({
        id: W.uid("t"), at, batch, status: "new", offline: !via, platform: p.id,
        title: String(t.title).trim(), event: t.event || "", when: t.when || "", why: t.why || "", angle: t.angle || "", anchor: t.anchor || "",
        natures: Array.isArray(t.natures) ? t.natures : [], scores: t.scores || {}, risk: t.risk || "",
        sources: (Array.isArray(t.sources) ? t.sources : []).filter((s) => /^https?:\/\//.test(s?.url || "")),
      }));
      // 模型没把网址写进某个选题时，至少把这次搜到的网页挂上，方便核对
      if (extra.length) for (const t of got) if (!t.sources.length) t.sources = extra.slice(0, 2);
      S.topics.push(...got);
      if (S.topics.length > 300) S.topics = S.topics.filter((t, i) => t.status !== "dropped" || i > S.topics.length - 300);
      save(); S.ui.tpFilter = "new";
      W.toast(got.length ? `找到 ${got.length} 个选题${extra.length ? `，参考了 ${extra.length} 个网页` : ""}` : "这次没找到合适的，换几个关键词试试");
    } catch (e) { if (!e?.silent && e?.code !== "cancelled") W.toast(W.AI.msg(e), "bad"); }
    finally { job = null; T.render(); }
  }
  // 开写：新建一篇，把选题、切口、来源都填进“写什么”，打开写作面板
  function write(t) {
    if (t.noteId && W.note(t.noteId)) { W.App.go("desk"); W.Desk.open(t.noteId); return; }
    const nat = S.nature.filter((n) => (t.natures || []).some((x) => x.includes(n.name) || n.name.includes(x))).map((n) => n.id);
    const brief = [t.title, t.event && `事件：${t.event}${t.when ? `（${t.when}）` : ""}`, t.why && `为什么现在写：${t.why}`, t.anchor && `大众锚点：${t.anchor}`,
      t.sources?.length && "来源：\n" + t.sources.map((s) => `- ${s.title || ""} ${s.url}`).join("\n"), t.risk && `注意：${t.risk}`].filter(Boolean).join("\n");
    W.App.go("desk");
    const n = W.Desk.create({ title: t.title, status: "idea", platform: t.platform || S.config.platform, brief, stance: t.angle || "", natureFocus: nat }, { newTab: true });
    t.status = "used"; t.noteId = n.id; save();
    W.Desk.setTab("write");
    W.toast("建好了：要求都填上了，看一眼就能点“写初稿”");
  }

  T.mount = () => {
    const v = W.$("#v-topics");
    v.addEventListener("click", (e) => {
      const b = e.target.closest("[data-tp]"); if (!b) return;
      const a = b.dataset.tp, t = S.topics.find((x) => x.id === b.closest("[data-tid]")?.dataset.tid);
      if (a === "run") return run();
      if (a === "stop") { job?.ctl.abort(); return; }
      if (a === "ai") return W.Panels.aiSettings();
      if (a === "filter") { S.ui.tpFilter = b.dataset.id; return T.render(); }
      if (a === "kw-del") { cfg().keywords.splice(+b.dataset.i, 1); W.saveConfig(); return T.render(); }
      if (!t) return;
      if (a === "save") { t.status = t.status === "saved" ? "new" : "saved"; save(); T.render(); }
      if (a === "drop") { const el = b.closest(".tp-card"); el.classList.add("out"); setTimeout(() => { t.status = "dropped"; save(); T.render(); }, 160); }
      if (a === "write") write(t);
    });
    v.addEventListener("keydown", (e) => {
      if (e.target.id !== "tp-kw-in" || e.key !== "Enter" || e.isComposing) return;
      e.preventDefault(); const k = e.target.value.trim(); if (!k) return;
      if (!cfg().keywords.includes(k)) { cfg().keywords.push(k); W.saveConfig(); }
      T.render(); W.$("#tp-kw-in")?.focus();
    });
    const field = (e) => {
      const t = e.target, k = t.dataset.tpF; if (!k) return;
      cfg()[k] = k === "count" ? W.clamp(+t.value || 8, 3, 15) : t.value; W.saveConfig();
    };
    v.addEventListener("change", field); v.addEventListener("input", field);
  };
  return T;
})();
