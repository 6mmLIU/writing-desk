/* 第一次用到某个功能时的介绍：高亮那一块，旁边一张小卡片讲清楚怎么用，可以一步步往下点。
   每个页面头部还有一条指引栏（一句话 + “看看怎么用”），关掉后不再出现。看过的介绍记在本机。 */
W.Tour = (() => {
  const T = {};
  const seen = new Set(W.ls.get("wbd:tour") || []);
  const shut = new Set(W.ls.get("wbd:guides") || []);
  const save = () => { W.ls.set("wbd:tour", [...seen]); W.ls.set("wbd:guides", [...shut]); };

  // 每个页面的一句话指引
  const GUIDES = {
    topics: "填几个关注的领域，点“联网找选题”：AI 去搜最近的新闻和讨论，挑出大众关心、你又有话说的，改成能直接写的题。点“开写”就建好一篇。",
    graph: "每个点是一篇笔记，线是正文里的 [[链接]]。拖动整理，点一下打开那篇。",
    souls: "灵魂就是“作者是谁”：身份、说话的样子、口头禅、真实经历。AI 写每一篇都用你选的那个灵魂说话。",
    mind: "心智是“写给多大众的人”。数值越低，越用人人都懂的东西打比方（小猫、外卖、明星）；越高越写给行家。",
    nature: "人性分三层：读者想要什么 → 读的时候身体的反应 → 读完记在哪里。这里是默认值，每篇还能在写作页右侧单独调。",
    memory: "批注时勾上“记住”，或者让 AI 从批注里提炼，就会变成一条记忆。之后写作、改稿、评分都会带上，同样的错不再犯。",
    settings: "所有数字都在这里：达标分、篇幅、文风限制……改了马上生效，每组上面那句话会跟着变。",
  };
  // 介绍：el 是要高亮的元素，side 是卡片放在哪边（默认自动）
  const TOURS = {
    "view-desk": [
      { el: "#new-rows", title: "新建一篇", body: "“新建笔记”自己写；“让 AI 写一篇”先填题目和要求，AI 写初稿。" },
      { el: ".pane .ed-scroll", title: "在正文里划线", body: "选中任何一段文字，旁边会出现工具条：改写、精简、配图……AI 只改你划过的地方。", side: "inside" },
      { el: "#insp-tabs .flow", title: "右边是一条写作流程", body: "写作 → 批注 → 评分 → 配图 → 发布。做完一步，墨点变蓝，线往前走一格。" },
      { el: "#status-filter", title: "拖动整理", body: "把笔记拖到状态上就改状态，拖进文件夹就移动，拖进正文就插入 [[链接]]。" },
    ],
    "tab-write": [{ el: "#insp-body", title: "写作", body: "还没有正文时，这里填题目和要求，点“写初稿”。有了正文，这里先给检查和修改，要求收成一张摘要卡。", side: "left" }],
    "tab-anno": [{ el: "#insp-body", title: "批注", body: "在正文里选中文字 → 选“改写 / 精简…”或写一句意见 → 点“让 AI 改”。每处改动你都能接受或撤销；勾上“记住”，以后都不再犯。", side: "left" }],
    "tab-score": [{ el: "#insp-body", title: "评分", body: "按量表逐项打分，每一项都引用原文；“最该改的三处”可以一键转成批注。也会估计读者实际的感受，和你定的目标对比。", side: "left" }],
    "tab-illus": [{ el: "#insp-body", title: "配图", body: "让 AI 读全文排好配图，或者在正文里选中一段点“配图”只配那一段。每张图可以复制提示词、直接画，画好再让 AI 检查。", side: "left" }],
    "tab-meta": [{ el: "#insp-body", title: "发布", body: "标题候选、分发包、选题卡和写作过程中的材料都在这里，发之前来这里挑。", side: "left" }],
    "tab-links": [{ el: "#insp-body", title: "链接", body: "正文里写 [[笔记名]] 就会连起来。这里看谁链到了这篇、这篇链到了谁，以及哪里提到了却没加链接。", side: "left" }],
    "tab-ver": [{ el: "#insp-body", title: "版本", body: "AI 每次大改之前都会自动存一个版本，你也可以随时手动存。点一下就能回到那时候。", side: "left" }],
    "view-souls": [{ el: ".soul-list", title: "选一个灵魂", body: "左边是你的几个灵魂，点一下编辑；标着“默认”的那个是新文章用的。真实经历只写你真的经历过的，AI 不会编。" }],
    "view-mind": [{ el: ".mind-dial", title: "拖这一个数就够了", body: "心智距离决定写给谁：越低越大众。右边的几个因素是细调，平常不用动。" }],
    "view-nature": [{ el: ".nat-tabs", title: "一次看一层", body: "欲望、激素、记忆落点三层分开看。每层上面都写着它是什么、AI 怎么用。" }],
    "view-memory": [{ el: "#v-memory .vh", title: "记忆", body: "“根本性”的错误每次都会检查；“偏好”是习惯。可以关掉某一条，或者限定只用在长文、帖子上。" }],
    "view-settings": [{ el: ".toc", title: "按组找", body: "点上面的组名跳过去。改过的数字旁边会出现“恢复默认”。" }],
    "view-topics": [{ el: ".tp-bar", title: "自动找选题", body: "关键词决定去哪找，时间范围决定多新。每个选题都带着对应的真实事件和来源链接，点链接能核对。" }, { el: ".tp-go", title: "点一下才跑", body: "联网搜索会消耗额度，所以只在你点的时候跑。用 Claude、DeepSeek、Kimi 或通义千问的接口才能联网。" }],
    "view-graph": [{ el: "#graph-cv", title: "关系图谱", body: "滚轮缩放，拖动画布，点一个点打开那篇。右上角可以只看当前笔记的邻居。", side: "inside" }],
  };

  let box = null, steps = [], k = 0, key = "";
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  // 高亮框和卡片都只用 transform 移动：先放到旧位置，再滑到新位置
  const flip = (el, to) => {
    const prev = el._r;
    el.style.width = to.w + "px"; el.style.height = to.h + "px";
    if (prev && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.remove("go");
      el.style.transform = `translate(${prev.x}px, ${prev.y}px) scale(${prev.w / to.w}, ${prev.h / to.h})`;
      void el.offsetWidth; el.classList.add("go");
    }
    el.style.transform = `translate(${to.x}px, ${to.y}px)`; el._r = to;
  };
  function place() {
    const s = steps[k], el = s && document.querySelector(s.el);
    if (!el) return next();
    const r = rectOf(el), pad = 6, vw = innerWidth, vh = innerHeight;
    const spot = s.side === "inside" ? { x: r.x + 12, y: r.y + 12, w: Math.min(r.w - 24, 420), h: Math.min(r.h - 24, 220) } : { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: Math.min(r.h + pad * 2, vh - r.y) };
    flip(box.querySelector(".tour-spot"), spot);
    const card = box.querySelector(".tour-card"), cw = 300, ch = card.offsetHeight || 170;
    let x, y;
    if (s.side === "left") { x = spot.x - cw - 14; y = spot.y + 10; }
    else if (s.side === "inside") { x = spot.x + 16; y = spot.y + spot.h - 16 - ch; if (y < spot.y + 40) y = spot.y + 40; }
    else if (spot.y + spot.h + ch + 14 < vh) { x = spot.x; y = spot.y + spot.h + 12; }
    else { x = spot.x; y = spot.y - ch - 12; }
    if (x + cw > vw - 12) x = spot.x + spot.w - cw; if (x < 12) x = Math.min(spot.x + spot.w + 14, vw - cw - 12);
    flip(card, { x: W.clamp(x, 12, vw - cw - 12), y: W.clamp(y, 12, vh - ch - 12), w: cw, h: ch });
    card.style.height = "";
  }
  function paint() {
    const s = steps[k], card = box.querySelector(".tour-card");
    card.innerHTML = `${steps.length > 1 ? `<div class="tour-dots">${steps.map((_, i) => `<i class="${i === k ? "on" : i < k ? "past" : ""}"></i>`).join("")}</div>` : ""}
      <b>${W.esc(s.title)}</b><p>${W.esc(s.body)}</p>
      <div class="tour-acts">${steps.length > 1 && k < steps.length - 1 ? `<button type="button" class="btn sm ghost" data-t="skip">跳过</button>` : "<span></span>"}<button type="button" class="btn sm primary" data-t="next">${k < steps.length - 1 ? "下一步" : "知道了"}</button></div>`;
    card.classList.remove("swap"); void card.offsetWidth; card.classList.add("swap");
    place(); card.querySelector("[data-t=next]")?.focus({ preventScroll: true });
  }
  function next() { k++; if (k >= steps.length) return close(); paint(); }
  function close() {
    if (!box) return; const b = box; box = null;
    b.classList.add("out"); setTimeout(() => b.remove(), 160);
    removeEventListener("resize", onResize); removeEventListener("keydown", onKey, true);
  }
  const onResize = W.debounce(() => box && place(), 60);
  const onKey = (e) => { if (!box) return; if (e.key === "Escape") { e.preventDefault(); close(); } if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); next(); } };

  T.run = (id, force) => {
    const list = TOURS[id]; if (!list) return;
    steps = list.filter((s) => document.querySelector(s.el)); if (!steps.length) return;
    if (!force && seen.has(id)) return;
    seen.add(id); save(); key = id; k = 0;
    close();
    box = document.createElement("div"); box.className = "tour"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "使用介绍");
    box.innerHTML = `<div class="tour-spot"></div><div class="tour-card"></div>`;
    box.addEventListener("click", (e) => { const t = e.target.closest("[data-t]")?.dataset.t; if (t === "next") next(); else if (t === "skip" || e.target === box) close(); });
    document.body.append(box);
    paint(); W.raf(() => box?.classList.add("in"));
    addEventListener("resize", onResize); addEventListener("keydown", onKey, true);
  };
  // 只在第一次、并且没有对话框挡着的时候自动出现
  // 被对话框挡着就等它关掉再出现；等的时候用户已经去了别处，就不出了
  T.maybe = (id) => {
    clearTimeout(T._wait);
    if (seen.has(id) || box) return;
    if (id !== "view-" + W.S.ui.view && id !== "tab-" + W.S.ui.tab) return;
    if (document.querySelector(".modal, .palette")) { T._wait = setTimeout(() => T.maybe(id), 1000); return; }
    T.run(id);
  };

  // 页面头部的指引栏
  T.guide = (view) => {
    const head = document.querySelector(`#v-${view} > .vh`); if (!head || !GUIDES[view]) return;
    head.parentElement.querySelector(":scope > .guide")?.remove();
    if (!head.querySelector(".vh-help")) head.querySelector(".btn-row")?.insertAdjacentHTML("afterbegin", `<button type="button" class="btn ghost vh-help" data-tour="view-${view}">${W.UI.icon("info", 15)}怎么用</button>`);
    if (shut.has(view)) return;
    head.insertAdjacentHTML("afterend", `<div class="guide" data-guide="${view}"><span class="ink-dot" aria-hidden="true"></span><p>${W.esc(GUIDES[view])}</p><button type="button" class="link small" data-tour="view-${view}">看看怎么用</button><button type="button" class="icon-btn sm" data-guide-x="${view}" aria-label="不再显示这条指引" title="不再显示">${W.UI.icon("x", 14)}</button></div>`);
  };
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tour]"); if (t) { e.preventDefault(); T.run(t.dataset.tour, true); return; }
    const x = e.target.closest("[data-guide-x]"); if (x) { const g = x.closest(".guide"); shut.add(x.dataset.guideX); save(); g.classList.add("out"); setTimeout(() => g.remove(), 200); }
  });
  // 页面自己重画了头部（改名、切换小节之类）时，把指引栏和“怎么用”补回去
  const mo = new MutationObserver((ms) => { for (const m of ms) if ([...m.addedNodes].some((n) => n.classList?.contains("vh"))) { T.guide(m.target.id.slice(2)); return; } });
  document.querySelectorAll("#main > .view").forEach((v) => mo.observe(v, { childList: true }));
  T.reset = () => { seen.clear(); shut.clear(); save(); };
  return T;
})();
