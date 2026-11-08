/* 灵魂、用户心智、人性表、记忆、参数 五个页面，以及“批注 → 记忆”的提炼。 */
(() => {
  const S = W.S, D = window.DEF, U = W.UI, I = W.UI.icon, esc = W.esc;
  const head = (title, sub, actions = "") => `<header class="vh"><div><h1>${title}</h1><p class="vh-sub">${sub}</p></div><div class="btn-row">${actions}</div></header>`;

  // ================= 记忆 =================
  const kindNames = { all: "所有形式", long: "长文", post: "帖子", pic: "贴图", blog: "博客" };
  W.Memory = {
    fromAnno(note, a) {
      const quote = a.current ?? a.quote;
      const m = { id: W.uid("m"), polarity: a.type === "keep" ? "keep" : "avoid", level: "pref", scope: "all", enabled: true, hits: 0,
        rule: a.note || (a.type === "keep" ? "保持这种写法：" : "别再这样写：") + quote.slice(0, 60), why: "",
        bad: a.type === "keep" ? "" : quote.slice(0, 200), good: a.type === "keep" ? quote.slice(0, 200) : a.proposal?.revised || "",
        source: { noteId: note.id, annoId: a.id }, pending: W.AI.ready, createdAt: W.now() };
      S.memory.unshift(m); a.memoryId = m.id; a.remember = true;
      W.saveMemory(m); W.saveNote(note);
      W.Desk.renderInsp();
      if (!W.AI.ready) { W.toast("记下了（原话）。连上 Claude 后可以在“记忆”里让它提炼成规则"); return; }
      this.generalize(m, note, a);
    },
    async generalize(m, note, a) {
      const p = W.platform(note?.platform);
      const existing = S.memory.filter((x) => x.id !== m.id && !x.pending).map((x) => `- id=${x.id}：${x.rule}`).join("\n") || "（无）";
      const prompt = `你在帮作者维护一份“写作记忆”：把作者的一条具体批注，提炼成以后写作都适用的一条规则，让 AI 不再犯同类错误（或保持同类优点）。规则要具体、可执行、像人话，一句话说完。
作者的灵魂：${W.soul(note?.soul)?.name || ""}；载体：${p.name}（${kindNames[p.kind]}）
批注类型：${D.annoTypes.find((t) => t.id === a.type)?.name}；作者意见：${a.note || "（没写）"}
原文：「${(a.proposal?.original ?? a.quote).slice(0, 400)}」${a.proposal ? `\n改成了：「${a.proposal.revised.slice(0, 400)}」` : ""}
已有记忆（如果说的是同一件事，把 mergeWith 设成它的 id）：
${existing}
只输出 JSON：{"rule":"规则","why":"为什么","bad":"错的写法示例","good":"对的写法示例","level":"core 或 pref（core = 根本性：事实、编造、结构、选题、立场、开头这类；pref = 措辞、语气偏好）","scope":"all|long|post|pic|blog","polarity":"avoid 或 keep","mergeWith":null}`;
      try {
        const r = await W.AI.run(prompt, { json: true, tier: "quick" });
        const target = r.mergeWith && S.memory.find((x) => x.id === r.mergeWith);
        if (target) {
          Object.assign(target, { rule: r.rule || target.rule, why: r.why || target.why, good: r.good || target.good, bad: r.bad || target.bad });
          S.memory = S.memory.filter((x) => x.id !== m.id); W.P.del("memory", m.id); W.saveMemory(target);
          a.memoryId = target.id; W.saveNote(note);
          W.toast("合并进了已有的记忆：" + target.rule.slice(0, 30));
        } else {
          Object.assign(m, { rule: r.rule || m.rule, why: r.why || "", bad: r.bad || m.bad, good: r.good || m.good, level: r.level === "core" ? "core" : "pref",
            scope: kindNames[r.scope] ? r.scope : "all", polarity: r.polarity === "keep" ? "keep" : "avoid", pending: false });
          W.saveMemory(m); W.toast("记住了：" + m.rule.slice(0, 36));
        }
      } catch (e) { m.pending = false; W.saveMemory(m); if (!e?.silent) W.toast("提炼没成功，先记下原话：" + W.AI.msg(e), "bad"); }
      if (S.ui.view === "memory") renderMemory();
      W.Desk.renderInsp();
    },
    async distill(note) {
      const annos = (note?.annotations || []).filter((a) => a.note || a.proposal);
      if (!annos.length) { W.toast("这篇还没有写了意见的批注"); return; }
      const p = W.platform(note.platform);
      const existing = S.memory.map((x) => `- id=${x.id}：${x.rule}`).join("\n") || "（无）";
      const list = annos.map((a) => `· [${D.annoTypes.find((t) => t.id === a.type)?.name}] 意见：${a.note || "（无）"}；原文：「${(a.proposal?.original ?? a.quote).slice(0, 200)}」${a.proposal ? `；改成：「${a.proposal.revised.slice(0, 200)}」` : ""}${a.status === "dismissed" && a.by === "ai" ? "（作者拒绝了这条 AI 修改）" : ""}`).join("\n");
      const prompt = `作者在一篇${p.name}上留下了下面这些批注。请找出背后反复出现的“根本性问题”和作者明确认可的写法，提炼成最多 6 条写作记忆，让 AI 以后写作不再犯。只提炼有普遍意义的，一次性的小改动不要提炼。已有的记忆不要重复；如果是在补充已有记忆，用 mergeWith 指向它。
【批注】
${list}
【已有记忆】
${existing}
只输出 JSON：{"rules":[{"rule":"一句话规则","why":"为什么","bad":"错的示例","good":"对的示例","level":"core|pref","scope":"all|long|post|pic|blog","polarity":"avoid|keep","mergeWith":null}]}`;
      let r;
      try { W.toast("Claude 在读你的批注…"); r = await W.AI.run(prompt, { json: true, tier: "score", label: "从批注提炼记忆" }); }
      catch (e) { if (!e?.silent) W.toast(W.AI.msg(e), "bad"); return; }
      const rules = r.rules || [];
      if (!rules.length) { W.toast("没有提炼出值得记的规则"); return; }
      U.modal({ title: `提炼出 ${rules.length} 条，勾选要记住的`, wide: true,
        body: `<div class="cand-list">${rules.map((x, i) => `<label class="cand"><input type="checkbox" checked data-i="${i}">
          <span><b>${esc(x.rule)}</b> <span class="pill ${x.level === "core" ? "bad" : ""}">${x.level === "core" ? "根本性" : "偏好"}</span><span class="pill">${x.polarity === "keep" ? "保持" : "别再犯"}</span><span class="pill">${kindNames[x.scope] || "所有形式"}</span>${x.mergeWith ? `<span class="pill soft">补充已有</span>` : ""}
          <span class="small muted block">${esc(x.why || "")}</span>${x.bad ? `<span class="small block"><del>${esc(x.bad)}</del></span>` : ""}${x.good ? `<span class="small block"><ins>${esc(x.good)}</ins></span>` : ""}</span></label>`).join("")}</div>`,
        actions: [{ label: "取消", act: "close" }, { label: "记住勾选的", act: "save", primary: true }],
        onAct: (a, root) => {
          if (a !== "save") return;
          let n = 0;
          root.querySelectorAll("input[data-i]:checked").forEach((c) => {
            const x = rules[+c.dataset.i], t = x.mergeWith && S.memory.find((m) => m.id === x.mergeWith);
            if (t) { Object.assign(t, { rule: x.rule, why: x.why || t.why, bad: x.bad || t.bad, good: x.good || t.good }); W.saveMemory(t); }
            else { const m = { id: W.uid("m"), rule: x.rule, why: x.why || "", bad: x.bad || "", good: x.good || "", level: x.level === "core" ? "core" : "pref", scope: kindNames[x.scope] ? x.scope : "all", polarity: x.polarity === "keep" ? "keep" : "avoid", enabled: true, hits: 0, source: { noteId: note.id }, createdAt: W.now() }; S.memory.unshift(m); W.saveMemory(m); }
            n++;
          });
          W.toast(`记住了 ${n} 条`); W.Desk.renderInsp();
        } });
    },
  };

  function renderMemory() {
    const v = W.$("#v-memory"), f = S.ui.memF || "all";
    const list = S.memory.filter((m) => f === "all" || (f === "avoid" && m.polarity !== "keep") || (f === "keep" && m.polarity === "keep") || (f === "core" && m.level === "core") || (f === "off" && !m.enabled));
    const core = S.memory.filter((m) => m.level === "core").length, keep = S.memory.filter((m) => m.polarity === "keep").length;
    const hits = S.memory.reduce((s, m) => s + (m.hits || 0), 0);
    const cnt = { all: S.memory.length, avoid: S.memory.length - keep, keep, core, off: S.memory.filter((m) => !m.enabled).length };
    v.innerHTML = head("记忆", "你纠正过的错误和认可的写法。每次写作、改稿、评分都会带上，评分时还会检查有没有再犯。",
      `<button type="button" class="btn primary" data-mm="add">${I("plus", 15)}手写一条</button>`) +
      `<div class="stats">
        <div class="stat"><span><i>${I("memory", 15)}</i>记忆</span><b>${S.memory.length}<small>条</small></b></div>
        <div class="stat"><span><i class="r">${I("alert", 15)}</i>根本性</span><b>${core}<small>条</small></b></div>
        <div class="stat"><span><i class="g">${I("check", 15)}</i>保持的写法</span><b>${keep}<small>条</small></b></div>
        <div class="stat"><span><i class="y">${I("search", 15)}</i>评分抓到再犯</span><b>${hits}<small>次</small></b></div>
      </div>
      <div class="chips" role="group" aria-label="筛选">${[["all", "全部"], ["avoid", "绝不再犯"], ["keep", "保持"], ["core", "根本性"], ["off", "已停用"]].map(([id, nm]) => `<button type="button" class="chip ${f === id ? "on" : ""}" aria-pressed="${f === id}" data-mm="filter" data-id="${id}">${nm}<span class="dim">${cnt[id]}</span></button>`).join("")}</div>
      <div class="mem-list">${list.length ? list.map(memCard).join("") : `<div class="empty card"><p><b>还没有记忆</b></p><p class="muted">在正文里批注时勾选“记住”，或者在批注页点“从批注提炼记忆”，规则会出现在这里。</p></div>`}</div>`;
  }
  const memCard = (m, i) => `<article class="mem ${m.enabled ? "" : "off"} ${m.polarity === "keep" ? "keep" : ""}" data-mid="${m.id}" style="animation-delay:${Math.min(i, 8) * 30}ms">
    <header class="mem-top">
      <span class="mem-id">R-${String(S.memory.indexOf(m) + 1).padStart(2, "0")}</span>
      ${U.segRadios("mp-" + m.id, 'data-mf="polarity"', m.polarity === "keep" ? "keep" : "avoid", [["avoid", "绝不再犯"], ["keep", "保持"]], "类型")}
      ${U.segRadios("ml-" + m.id, 'data-mf="level"', m.level === "core" ? "core" : "pref", [["core", "根本性"], ["pref", "偏好"]], "级别")}
      ${U.segRadios("ms-" + m.id, 'data-mf="scope"', kindNames[m.scope] ? m.scope : "all", Object.entries(kindNames).map(([k, nm]) => [k, k === "all" ? "全部" : nm]), "用在")}
      ${m.example ? `<span class="pill soft">示例</span>` : ""}${m.pending ? `<span class="pill soft"><span class="spinner sm"></span>提炼中</span>` : ""}
      <span class="grow"></span>${m.hits ? `<span class="small warn">被抓到 ${m.hits} 次</span>` : ""}
      <label class="toggle">启用<input type="checkbox" class="sw" data-mf="enabled" ${m.enabled ? "checked" : ""}></label>
      <button type="button" class="icon-btn sm" data-mm="del" data-id="${m.id}" aria-label="删除这条记忆">${I("trash", 15)}</button>
    </header>
    <div class="mem-b">
      <textarea class="mem-rule" data-mf="rule" rows="1" aria-label="规则" placeholder="一句话写清楚规则">${esc(m.rule)}</textarea>
      <label class="mem-why"><span>为什么</span><input data-mf="why" value="${esc(m.why || "")}" placeholder="写给以后的自己看"></label>
      <div class="mem-pair">
        <label class="bad-box"><span>${I("x", 14)}错</span><input data-mf="bad" value="${esc(m.bad || "")}" placeholder="反面例句"></label>
        <label class="good-box"><span>${I("check", 14)}对</span><input data-mf="good" value="${esc(m.good || "")}" placeholder="正面例句"></label>
      </div>
      ${m.source?.noteId && W.note(m.source.noteId) ? `<button type="button" class="link small" style="justify-self:start" data-mm="src" data-id="${m.source.noteId}">来自：${esc(W.note(m.source.noteId).title || "一篇笔记")}</button>` : ""}
    </div>
  </article>`;

  // ================= 灵魂 =================
  function renderSouls() {
    const v = W.$("#v-souls"); const sel = S.ui.soulSel && W.soul(S.ui.soulSel) ? S.ui.soulSel : S.config.activeSoul;
    const s = S.souls.find((x) => x.id === sel) || S.souls[0];
    v.innerHTML = head("灵魂", "写手先有灵魂：被什么触动、站哪边、想让读者带走什么。可以写好几个，按文章选用。",
      `<button type="button" class="btn primary" data-sm="add">${I("plus", 15)}新灵魂</button>`) +
      (S.souls.length ? `<div class="two-col">
        <div class="soul-list">${S.souls.map((x) => `<button type="button" class="soul-card ${x.id === s?.id ? "on" : ""}" data-sm="pick" data-id="${x.id}">
          <span class="soul-name">${U.orb(x.id)}${esc(x.name)}${x.id === S.config.activeSoul ? `<span class="pill good">默认</span>` : ""}</span>
          <span class="small muted clamp2">${esc(x.identity)}</span>
          <span class="soul-meters mono small"><span>评论区腔 ${x.comment}</span><span>情绪 ${x.emotion}</span><span>经历 ${x.experiences?.trim() ? x.experiences.trim().split("\n").length + " 条" : "空"}</span></span></button>`).join("")}</div>
        ${s ? soulForm(s) : ""}</div>` : `<div class="empty"><p><b>还没有灵魂</b></p><button type="button" class="btn" data-sm="defaults">导入默认灵魂</button></div>`);
  }
  const soulForm = (s) => `<form class="card form soul-form" data-soul="${s.id}" onsubmit="return false">
    <div class="form-head"><input class="title-input" data-sf="name" value="${esc(s.name)}" aria-label="灵魂名字">
      <div class="btn-row">${s.id !== S.config.activeSoul ? `<button type="button" class="btn sm" data-sm="default" data-id="${s.id}">设为默认</button>` : ""}<button type="button" class="btn sm" data-sm="dup" data-id="${s.id}">${I("copy", 14)}复制</button><button type="button" class="icon-btn sm" data-sm="del" data-id="${s.id}" aria-label="删除">${I("trash", 14)}</button></div></div>
    <label class="field"><span>我是谁</span><textarea data-sf="identity" rows="3">${esc(s.identity)}</textarea></label>
    <div class="grid2">
      <label class="field"><span>怎么称呼读者（一行一种场合）</span><textarea data-sf="address" rows="3">${esc(s.address)}</textarea></label>
      <label class="field"><span>说话的样子</span><textarea data-sf="voice" rows="3">${esc(s.voice)}</textarea></label>
    </div>
    <label class="field"><span>口头禅</span><input data-sf="sayings" value="${esc(s.sayings)}"></label>
    <div class="grid2">
      <label class="field"><span>会对什么兴奋</span><textarea data-sf="excite" rows="2">${esc(s.excite)}</textarea></label>
      <label class="field"><span>会对什么翻白眼</span><textarea data-sf="eyeroll" rows="2">${esc(s.eyeroll)}</textarea></label>
    </div>
    <label class="field"><span>我在乎什么</span><textarea data-sf="care" rows="2">${esc(s.care)}</textarea></label>
    <label class="field"><span>我的立场与价值观（我信什么、反对什么）</span><textarea data-sf="stance" rows="2" placeholder="比如：工具应该让普通人更有掌控感；反对用焦虑卖课">${esc(s.stance || "")}</textarea></label>
    <label class="field"><span>真实经历库 <em class="muted">AI 只会用这里写到的经历，没写的一律标 [需补经历]</em></span><textarea data-sf="experiences" rows="5" placeholder="一行一条，比如：&#10;2025 年做了一个键盘 App，上架 App Store&#10;养了一盆龟背竹，三年没养死">${esc(s.experiences || "")}</textarea></label>
    <div class="grid2">${U.range("sf-comment", s.comment, { label: "评论区腔浓度", hint: "低 = 编辑腔，句子完整；高 = 短句、先反应后内容、毒舌比喻" })}${U.range("sf-emotion", s.emotion, { label: "情绪浓度", hint: "称呼、感叹、吐槽出现得多不多" })}</div>
  </form>`;

  // ================= 用户心智 =================
  function renderMind() {
    const v = W.$("#v-mind"), ms = S.mindset, b = W.idAtLevel(ms.distance);
    v.innerHTML = head("用户心智", "决定往哪写：数值越低，越往大家都知道、都摸得到的东西上写。") + `
      <section class="card why-card"><h2 class="card-h">为什么要调这个</h2><textarea class="plain-area" id="ms-why" rows="5" aria-label="说明">${esc(ms.why)}</textarea></section>
      <section class="card mind-main">
        <div class="mind-dial">
          <div class="mind-num"><span class="mono" id="ms-num">${ms.distance}</span><span class="mind-band" id="ms-band">${b.name}</span></div>
          <input type="range" id="ms-distance" min="0" max="100" value="${ms.distance}" style="--p:${ms.distance}%" aria-label="心智距离">
          <div class="ticks mono">${ms.bands.map((x, i) => `<span>${x.name}</span>`).join("")}</div>
          <p class="band-text" id="ms-band-text">${esc(b.text)}</p>
        </div>
        <div class="factors">${ms.factors.map((f, i) => `<div class="factor">${U.range("mf-" + f.key, f.value, { label: f.name })}
          <div class="ends small"><input data-mfk="${i}" data-end="low" value="${esc(f.low)}" aria-label="${esc(f.name)}低端"><input data-mfk="${i}" data-end="high" value="${esc(f.high)}" aria-label="${esc(f.name)}高端"></div></div>`).join("")}</div>
      </section>
      <section class="card"><h2 class="card-h">AI 会收到的心智指令</h2><pre class="pre mono small" id="ms-preview">${esc(W.mindsetText())}</pre></section>
      <section class="card"><h2 class="card-h">试一试：同一个题目，三种心智距离</h2>
        <div class="row-inline"><input class="input" id="ms-try" placeholder="比如：OpenAI 发布了新的推理模型"><button type="button" class="btn primary" data-ms="try">看三种写法</button></div>
        <div id="ms-try-out" class="try-out"></div></section>
      <section class="card"><h2 class="card-h">大众锚点库 <span class="muted small">心智距离低时，AI 会优先从这里找切入物</span></h2>
        <div class="anchor-groups">${Object.entries(ms.anchors).map(([g, xs]) => `<div class="anchor-group"><b>${esc(g)}</b><div class="chips">${xs.map((x, i) => `<span class="chip">${esc(x)}<button type="button" class="chip-x" data-ms="anc-del" data-g="${esc(g)}" data-i="${i}" aria-label="删除 ${esc(x)}">${I("x", 12)}</button></span>`).join("")}<input class="chip-input" data-anc="${esc(g)}" placeholder="＋ 添加，回车"></div></div>`).join("")}</div>
        <button type="button" class="btn sm" data-ms="group-add">${I("plus", 14)}新分组</button></section>
      <section class="card"><h2 class="card-h">各平台受众画像 <span class="muted small">默认值只是粗略印象，按你后台的真实数据改</span></h2>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>平台</th><th>女性占比</th><th>年龄</th><th>调性</th></tr></thead><tbody>
        ${S.platforms.map((p, i) => `<tr><td>${esc(p.name)}</td><td>${U.stepper(`data-aud="${i}" data-k="female"`, p.audience.female, { max: 100, step: 5, label: p.name + " 女性占比", size: "sm" })} %</td><td><input class="input sm" data-aud="${i}" data-k="age" value="${esc(p.audience.age)}"></td><td><input class="input sm" data-aud="${i}" data-k="vibe" value="${esc(p.audience.vibe)}"></td></tr>`).join("")}
        </tbody></table></div></section>`;
  }
  const refreshMindPreview = W.debounce(() => { const p = W.$("#ms-preview"); if (p) p.textContent = W.mindsetText(); }, 120);

  // ================= 人性表 =================
  // 人性分三层，一次只看一层：读者想要什么（欲望）→ 读的时候身体的反应（激素）→ 读完记在哪里（脑区）
  const NAT_SECS = [["want", "欲望", "读者想要什么"], ["neuro", "激素", "读的时候的反应"], ["brain", "记忆落点", "读完记在哪里"]];
  let natDir = 0;
  const explain = (what, how) => `<section class="explain"><div><b>这是什么</b><p>${what}</p></div><div><b>AI 怎么用它</b><p>${how}</p></div></section>`;
  function renderNature() {
    const v = W.$("#v-nature"), open = S.ui.natOpen, sec = S.ui.natSec || "want";
    const body = sec === "want" ? `
      ${explain("人性里的欲望，每条配一句哲学家的解释。比如“好奇与求知”：人看到缺口就想补上；“被承认”：人转发、晒、站队，很多时候是在争取被看见。",
        `写每一篇时，AI 自动挑权重最高的 <b>${S.config.natureTop}</b> 条（低于 <b>${S.config.natureMin}</b> 的不用）作为打动读者的抓手；也可以在写作页右侧给单篇手动点选。每条的<b>红线</b>永远生效。`)}
      <div class="nat-controls">${U.range("cfg-natureMin", S.config.natureMin, { label: "低于这个权重不自动用" })}${U.range("cfg-natureTop", S.config.natureTop, { min: 1, max: 10, label: "每篇最多用几条" })}</div>
      <div class="nat-list">${S.nature.length ? [...S.nature].sort((a, b) => b.weight - a.weight).map((n) => natRow(n, open === n.id)).join("") : `<div class="empty"><p><b>欲望表是空的</b></p><button type="button" class="btn" data-nm="defaults">导入默认的 16 条</button></div>`}</div>
      <div class="btn-row nat-foot"><button type="button" class="btn sm" data-nm="add">${I("plus", 14)}加一条欲望</button><button type="button" class="btn sm ghost" data-nm="defaults">补回默认条目</button></div>`
      : sec === "neuro" ? `
      ${explain("读者读这篇时，你希望他身体里发生什么。五种物质对应五种感受：<b>多巴胺</b>想往下读，<b>催产素</b>信任亲近，<b>皮质醇</b>紧张、怕错过，<b>血清素</b>满足安心，<b>去甲肾上腺素</b>警觉专注。50 是平常。",
        "AI 按这组数决定开头怎么抓人、要不要制造紧张、结尾给不给安定感；评分时还会估计实际激起了多少，和目标并排对比。不知道怎么调，先从上面挑一个预设。")}
      ${bodyCard("neuro")}`
      : `
      ${explain("这篇想被记在大脑的哪一层。<b>脑干</b>管本能，决定第一秒停不停；<b>杏仁核</b>管情绪，越强烈记得越牢；<b>海马体</b>管情节，能复述的小故事最容易留下；<b>前额叶</b>管判断，决定收不收藏、转不转发。",
        "数值越高，AI 越往这一层使劲。比如海马体高，就多写具体场景、时间地点和一个能讲给别人听的故事；前额叶高，就给清单、框架和下一步行动。")}
      ${bodyCard("brain")}`;
    v.innerHTML = head("人性", "AI 写作时，往读者的哪里使劲。", "") + `
      <div class="seg nat-tabs" role="tablist" aria-label="人性的三层">${NAT_SECS.map(([id, nm, sub]) => `<button type="button" role="tab" class="${sec === id ? "on" : ""}" aria-selected="${sec === id}" data-nm="sec" data-id="${id}">${nm}<span class="seg-sub">${sub}</span></button>`).join("")}</div>
      <div class="nat-sec" data-dir="${natDir}">${body}</div>`;
    natDir = 0;
  }
  // 激素 / 脑区：这里调的是默认目标，每篇还能在写作面板里单独调；下面可以展开改每一项的说法（会写进提示词）
  const factory = (kind) => Object.fromEntries(D[kind].map((x) => [x.id, x.level]));
  const presetOn = (lv) => D.neuroPresets.find((p) => Object.entries(p.v).every(([k, v]) => lv[k] === v))?.id;
  const bodyCard = (kind) => {
    const neuro = kind === "neuro", defs = neuro ? W.neuroDefs() : W.brainDefs(), lv = W.levels(kind), on = neuro && presetOn(lv);
    return `<section class="card" data-body="${kind}">
      <h2 class="card-h">${neuro ? "神经递质 / 激素" : "脑区 · 记忆住在哪"}<span class="hint">默认目标，每篇可以单独调</span></h2>
      ${neuro ? `<div class="nr-presets" role="group" aria-label="预设">${D.neuroPresets.map((p) => `<button type="button" class="chip sm ${p.id === on ? "on" : ""}" data-nm="preset" data-id="${p.id}" title="${esc(p.hint)}">${esc(p.name)}</button>`).join("")}</div>` : ""}
      ${U.bars(kind, defs, lv, { attrs: `data-nb="${kind}"`, def: factory(kind), thin: !neuro })}
      <p class="nr-cap" data-cap="${kind}">${neuro ? W.neuroCaption(lv) : W.brainCaption(lv)}</p>
      <h3 class="sub-h">每一项是什么意思 <span class="hint">展开可以改说法，会写进提示词</span></h3>
      <div class="nr-defs">${defs.map((d) => `<details class="nr-def"><summary><i style="background:var(--c-${d.id})"></i>${esc(d.name)}${d.sub ? `<span class="muted small">${esc(d.sub)}</span>` : ""}<span class="hint">${esc(d.does)}</span></summary>
        <label class="field"><span>${neuro ? "它在读者身上做什么" : "这一层管什么"}</span><textarea rows="2" data-nd="${kind}" data-id="${d.id}" data-k="does">${esc(d.does)}</textarea></label>
        <label class="field"><span>${neuro ? "怎么写能调动它" : "怎么写能住进这里"}</span><textarea rows="2" data-nd="${kind}" data-id="${d.id}" data-k="${neuro ? "raise" : "how"}">${esc(neuro ? d.raise : d.how)}</textarea></label>
        ${neuro ? `<label class="field"><span>红线</span><input data-nd="${kind}" data-id="${d.id}" data-k="redline" value="${esc(d.redline)}"></label>` : ""}</details>`).join("")}</div>
    </section>`;
  };
  const ensureBody = (kind) => { if (!S.config[kind]?.length) S.config[kind] = W.clone(D[kind]); return S.config[kind]; };
  const saveBody = W.debounce(() => W.saveConfig(), 300);
  const refreshCap = (kind, box) => { const lv = W.levels(kind); box.querySelector(`[data-cap="${kind}"]`).innerHTML = kind === "neuro" ? W.neuroCaption(lv) : W.brainCaption(lv);
    if (kind === "neuro") { const on = presetOn(lv); box.querySelectorAll("[data-nm=preset]").forEach((c) => c.classList.toggle("on", c.dataset.id === on)); } };

  const natRow = (n, open) => `<article class="nat ${open ? "open" : ""} ${n.on ? "" : "off"}" data-nid="${n.id}">
    <div class="nat-head">
      <label class="switch" title="启用"><input type="checkbox" data-nf2="on" ${n.on ? "checked" : ""}><span></span></label>
      <button type="button" class="nat-title" data-nm="toggle" data-id="${n.id}" aria-expanded="${open}"><b>${esc(n.name)}</b><span class="pill">${esc(n.tag)}</span><span class="muted small nat-who">${esc(n.thinkers)}</span></button>
      <input type="range" min="0" max="100" value="${n.weight}" data-nf2="weight" style="--p:${n.weight}%" aria-label="${esc(n.name)} 权重"><output class="mono w">${n.weight}</output>
    </div>
    <p class="nat-sum">${esc(n.philosophy)}</p>
    <div class="nat-body" ${open ? "" : "hidden"}>
      <div class="grid2"><label class="field"><span>名字</span><input data-nf2="name" value="${esc(n.name)}"></label><label class="field"><span>标签</span><input data-nf2="tag" value="${esc(n.tag)}"></label></div>
      <label class="field"><span>出处</span><input data-nf2="thinkers" value="${esc(n.thinkers)}"></label>
      <label class="field"><span>哲学阐释</span><textarea data-nf2="philosophy" rows="4">${esc(n.philosophy)}</textarea></label>
      <label class="field"><span>在内容里的样子</span><textarea data-nf2="shows" rows="2">${esc(n.shows)}</textarea></label>
      <label class="field"><span>写作抓手</span><textarea data-nf2="lever" rows="2">${esc(n.lever)}</textarea></label>
      <label class="field"><span>红线</span><textarea data-nf2="redline" rows="2">${esc(n.redline)}</textarea></label>
      <div class="btn-row"><button type="button" class="btn sm danger" data-nm="del" data-id="${n.id}">${I("trash", 14)}删除这一条</button></div>
    </div></article>`;

  // ================= 参数 =================
  // 数值不用浏览器自带的上下小箭头：选项不超过 10 个 → 数字按钮；百分比和分数 → 滑杆；其它计数 → − / +
  const cfgVal = (path) => path.split(".").reduce((a, k) => a?.[k], S.config);
  const cfgDef = (path) => path.split(".").reduce((a, k) => a?.[k], D.config);
  const num = (path, label, o = {}) => {
    const v = cfgVal(path), def = cfgDef(path), min = o.min ?? 0, max = o.max ?? 999, step = o.step ?? 1;
    const kind = o.kind || (max - min <= 9 ? "pills" : "stepper");
    const attrs = `data-cfg="${path}"`;
    const ctl = kind === "pills" ? U.pills("cfg-" + path, attrs, v, { min, max, def, label })
      : kind === "slider" ? U.slider("cfg-" + path.replace(/\./g, "-"), attrs, v, { min, max, step, def, unit: o.unit || "", label })
      : U.stepper(attrs, v, { min, max, step, label }) + (o.unit ? `<span class="unit">${o.unit}</span>` : "");
    return `<div class="tile"><div class="tile-h"><b>${label}</b><button type="button" class="reset" data-st="reset-cfg" data-k="${path}" ${+v === +def ? "hidden" : ""}>恢复 ${def}</button></div>${o.hint ? `<p class="hint">${o.hint}</p>` : ""}<div class="tile-ctl">${ctl}${o.dot ? `<span class="verdot na" data-chk="${o.dot}"><i></i><span></span></span>` : ""}</div></div>`;
  };
  const seg = (path, label, opts) => `<div class="tile"><div class="tile-h"><b>${label}</b></div><div class="tile-ctl">${U.segRadios("cfg-" + path, `data-cfg="${path}"`, cfgVal(path), opts, label)}</div></div>`;
  const sel = (path, label, opts) => { const v = cfgVal(path); return `<div class="tile"><div class="tile-h"><b>${label}</b></div><select data-cfg="${path}" aria-label="${label}">${opts.map(([k, nm]) => `<option value="${k}" ${String(v) === String(k) ? "selected" : ""}>${nm}</option>`).join("")}</select></div>`; };
  const read = (path) => `<b data-read="${path}">${cfgVal(path)}</b>`;
  const SHADES = ["#1F4FD8", "#3A66E3", "#5A80EA", "#7A9AF0", "#2D3A57", "#46536F", "#62708A", "#8390A6", "#0E7A4E", "#3A9871"];
  const rubBar = () => {
    const sum = S.rubric.reduce((s, r) => s + (+r.max || 0), 0), den = Math.max(sum, 100);
    return S.rubric.map((r, i) => `<span style="width:calc(${(((+r.max || 0) / den) * 100).toFixed(3)}% - 3px);background:${SHADES[i % SHADES.length]}" title="${esc(r.name)} ${r.max}">${+r.max || ""}</span>`).join("") + (sum < 100 ? `<span class="gap" title="还差 ${100 - sum} 分"></span>` : "");
  };
  function renderSettings() {
    const v = W.$("#v-settings"), K = window.SKILL;
    const tiers = [["complex", "最强", "最慢"], ["default", "均衡"], ["quick", "最快"]];
    v.innerHTML = head("参数", "两个 skill 里的每个数字、每条规则都在这里，改了马上生效。数字按住 − / + 会连续变化，按住 Shift 一次走 5 格，中间的数字也能直接输入。") + `
      <nav class="toc">${[["s-iter", "自动迭代"], ["s-out", "写稿与标题"], ["s-style", "文风限制"], ["s-rubric", "评分量表"], ["s-plat", "平台规格"], ["s-genre", "体裁"], ["s-rules", "规则原文"], ["s-img", "配图"], ["s-model", "模型"], ["s-data", "数据"]].map(([id, nm]) => `<a href="#${id}">${nm}</a>`).join("")}</nav>
      <section class="card set-card" id="s-iter"><h2 class="card-h">自动迭代<span class="hint">没达标时，AI 自己改到什么程度</span></h2><div class="set-b">
        <p class="readout" aria-live="polite">评分到 ${read("targetScore")} 分、每一项都拿到满分的 ${read("dimMinPct")}% 以上，才算达标。没达标就自动改，最多改 ${read("maxRounds")} 轮；哪一轮涨不到 ${read("minGain")} 分，就停下来交给你。</p>
        <div class="num-grid">
          ${num("targetScore", "达标分", { kind: "slider", max: 100, unit: "分", hint: "总分到这里才算达标，停止自动修改" })}
          ${num("dimMinPct", "每一项最低", { kind: "slider", max: 100, step: 5, unit: "%", hint: "每个维度都要拿到满分的这个比例，防止总分高但有一项很差" })}
          ${num("maxRounds", "最多改几轮", { min: 1, max: 8, hint: "没达标时自动修改的轮数上限，小点是默认值" })}
          ${num("minGain", "一轮至少涨几分", { max: 20, unit: "分", hint: "涨不到这么多，说明 AI 改不动了，停下来交给你" })}
        </div></div></section>
      <section class="card set-card" id="s-out"><h2 class="card-h">写稿与标题<span class="hint">初稿、标题、开头各出多少，选题门槛多高</span></h2><div class="set-b">
        <p class="readout" aria-live="polite">初稿写完先删掉约 ${read("cutPct")}% 的字。标题一次出 ${read("titleCount")} 个，至少用 ${read("titleSkeletons")} 种句式骨架，从里面推荐 ${read("titlePick")} 个；开头写 ${read("ledeVersions")} 个版本。选题卡上“大众度 + 切身性”到 ${read("topicBar")} 分（满分 10）才往下写。</p>
        <p class="note-box" id="pick-warn" role="alert" hidden>推荐数或骨架数比生成的标题还多，Claude 凑不够。把“标题一次出几个”调大一点。</p>
        <div class="num-grid">
          ${num("cutPct", "写完删掉", { kind: "slider", max: 60, step: 5, unit: "%", hint: "初稿写完先砍掉的比例，删掉不影响意思的句子" })}
          ${num("titleCount", "标题一次出几个", { min: 1, max: 30, unit: "个", hint: "点“起标题”时一次生成的数量，1 到 30" })}
          ${num("titleSkeletons", "至少几种骨架", { min: 1, max: 6, hint: "这批标题至少用几种不同的句式，避免一个模子刻出来" })}
          ${num("titlePick", "推荐几个", { min: 1, max: 10, hint: "从生成的标题里挑出来标“推荐”的数量" })}
          ${num("ledeVersions", "开头写几个版本", { min: 1, max: 5, hint: "首屏（开头两三行）写几个版本让你挑" })}
          ${num("topicBar", "选题门槛", { min: 1, max: 10, hint: "“大众度 + 切身性”到这个分才往下写，满分 10" })}
        </div></div></section>
      <section class="card set-card" id="s-style"><h2 class="card-h">文风限制<span class="hint">数字旁边的圆点，是拿当前打开的这篇试出来的结果</span></h2><div class="set-b"><div class="num-grid">
        ${num("aiTasteMax", "AI 味句式", { max: 20, unit: "处 / 千字", hint: "每一千字里最多出现几处", dot: "ai" })}
        ${num("notXbutYMax", "“不是…而是…”", { max: 10, unit: "次 / 全文", hint: "全文最多用几次这个句式", dot: "nxy" })}
        ${num("addressMax", "同一个称呼", { max: 20, unit: "次 / 全文", hint: "“朋友们”“兄弟们”这类称呼，全文最多几次", dot: "addr" })}
        ${num("hedgeMax", "免责句", { max: 10, unit: "处 / 千字", hint: "“仅供参考”“因人而异”这类话，每千字最多几处", dot: "hedge" })}
      </div></div></section>
      <section class="card set-card" id="s-rubric"><h2 class="card-h">评分量表<span class="hint">十个维度的满分加起来要正好 100</span><span class="rub-sum" id="rub-sum"></span></h2><div class="set-b">
        <div class="rub-bar" id="rub-bar" aria-hidden="true">${rubBar()}</div>
        <div class="rub-list">${S.rubric.map((r, i) => `<div class="rub"><span class="rub-name"><i style="background:${SHADES[i % SHADES.length]}"></i><input class="input sm" data-rub="${i}" data-k="name" value="${esc(r.name)}" aria-label="维度名"></span>${U.stepper(`data-rub="${i}" data-k="max"`, r.max, { min: 0, max: 30, label: r.name + " 满分", size: "sm" })}<input class="input sm grow" data-rub="${i}" data-k="q" value="${esc(r.q)}" aria-label="一句话问题"><textarea class="input sm full" data-rub="${i}" data-k="c" rows="2" aria-label="档位">${esc(r.c)}</textarea></div>`).join("")}</div>
        <div class="readout"><b>封顶规则</b><br>没有信息增量时，总分最多 ${U.stepper('data-cfg="capNoGain"', cfgVal("capNoGain"), { max: 100, step: 5, label: "无信息增量封顶", size: "sm" })} 分。灵魂这一项低于 ${U.stepper('data-cfg="soulMin"', cfgVal("soulMin"), { max: 10, label: "灵魂最低分", size: "sm" })} 分时，总分最多 ${U.stepper('data-cfg="capNoSoul"', cfgVal("capNoSoul"), { max: 100, step: 5, label: "灵魂不足封顶", size: "sm" })} 分。所有扣分加起来不超过 ${U.stepper('data-cfg="deductCap"', cfgVal("deductCap"), { max: 50, label: "扣分合计上限", size: "sm" })} 分。</div>
        <div><button type="button" class="btn sm" data-st="reset-rubric">恢复默认量表</button></div>
      </div></section>
      <section class="card set-card" id="s-plat"><h2 class="card-h">平台规格<span class="hint">${S.platforms.length} 个平台，点开逐项改</span></h2><div class="set-b">${S.platforms.map((p, i) => `<details class="plat"><summary><b>${esc(p.name)}</b><span class="muted small">${esc(D.kinds.find((k) => k.id === p.kind)?.name)} · ${esc(p.len)}</span><span class="grow"></span>${I("chev", 16)}</summary>
        <div class="num-grid">
          <label class="field"><span>名称</span><input data-pl="${i}" data-k="name" value="${esc(p.name)}"></label><label class="field"><span>篇幅</span><input data-pl="${i}" data-k="len" value="${esc(p.len)}"></label>
          <div class="field"><span>标题上限</span><div class="tile-ctl">${U.stepper(`data-pl="${i}" data-k="titleMax"`, p.titleMax, { max: 60, label: "标题上限" })}<span class="unit">字</span></div></div>
          <div class="field"><span>开头方式</span>${U.segRadios("pl-open-" + i, `data-pl="${i}" data-k="opening"`, p.opening, [["lede", "引子开头"], ["punch", "首行反常"], ["cover", "封面句"]], "开头方式")}</div>
          <div class="field"><span>评论区腔</span>${U.slider("pl-voice-" + i, `data-pl="${i}" data-k="voice"`, p.voice, { max: 100, unit: "%", label: "评论区腔" })}</div>
          <div class="field"><span>emoji 上限</span><div class="tile-ctl">${U.stepper(`data-pl="${i}" data-k="emoji"`, p.emoji, { max: 10, label: "emoji 上限" })}<span class="unit">个</span></div></div>
          <div class="field"><span>每段字数上限</span><div class="tile-ctl">${U.stepper(`data-pl="${i}" data-k="paraMax"`, p.paraMax, { min: 20, max: 300, step: 5, label: "每段字数上限" })}<span class="unit">字</span></div></div></div>
        <label class="field"><span>平台规格说明</span><textarea data-pl="${i}" data-k="spec" rows="3">${esc(p.spec)}</textarea></label>
        <label class="field"><span>配图规则</span><input data-pl="${i}" data-k="img.rule" value="${esc(p.img.rule)}"></label></details>`).join("")}
        <div><button type="button" class="btn sm" data-st="reset-plat">恢复默认平台规格</button></div></div></section>
      <section class="card set-card" id="s-genre"><h2 class="card-h">体裁骨架</h2><div class="set-b">${S.genres.map((g, i) => `<div class="genre"><input class="input sm" data-gn="${i}" data-k="name" value="${esc(g.name)}" aria-label="体裁名"><textarea class="input sm" data-gn="${i}" data-k="skeleton" rows="2" aria-label="骨架">${esc(g.skeleton)}</textarea></div>`).join("")}
        <div><button type="button" class="btn sm" data-st="reset-genre">恢复默认体裁</button></div></div></section>
      <section class="card set-card" id="s-rules"><h2 class="card-h">规则原文<span class="hint">每次写作都会原样带给 Claude</span></h2><div class="set-b">${Object.entries(D.rules).map(([k, r]) => `<details class="rule"><summary><b>${esc(r.title)}</b>${S.rules[k] != null ? `<span class="pill warn">已改</span>` : ""}<span class="grow"></span>${I("chev", 16)}</summary>
        <textarea class="input rule-text" data-rule="${k}" rows="10">${esc(W.rule(k))}</textarea><div><button type="button" class="btn sm" data-st="reset-rule" data-k="${k}">恢复这一条</button></div></details>`).join("")}</div></section>
      <section class="card set-card" id="s-img"><h2 class="card-h">配图</h2><div class="set-b"><div class="num-grid">
        ${sel("img.style", "默认风格", K.styles.map((s) => [s.id, s.name]))}${seg("img.variant", "人物比例", [["standard", "标准", "头身比 1:3.5"], ["chibi", "Q 版", "头身比 1:2"]])}
        ${num("img.titleMax", "图上标题字数上限", { max: 40, unit: "字" })}${num("img.textBlocks", "每张图文字段数上限", { max: 12, unit: "段" })}${num("img.labelMax", "标签字数上限", { max: 20, unit: "字" })}${num("img.bubbleMax", "气泡字数上限", { max: 30, unit: "字" })}${num("img.accEvery", "几张图最多 1 张用配件", { min: 1, max: 10 })}</div>
        <label class="field"><span>人物身份锁（每张图的提示词都以它开头）</span><textarea data-cfg="img.identity" rows="5" placeholder="${esc(K.character.identity_lock)}">${esc(S.config.img.identity)}</textarea></label>
        <label class="field"><span>招牌服装（留空 = ${esc(K.character.signature_outfit)}）</span><input data-cfg="img.outfit" value="${esc(S.config.img.outfit)}"></label>
        <label class="field"><span>人物必须“演”出内容</span><textarea data-cfg="img.performRule" rows="3">${esc(S.config.img.performRule)}</textarea></label>
        <div class="grid2"><label class="field"><span>封面的角色说明</span><textarea data-cfg="img.roleCover" rows="4">${esc(S.config.img.roleCover)}</textarea></label><label class="field"><span>正文配图的角色说明</span><textarea data-cfg="img.roleInline" rows="4">${esc(S.config.img.roleInline)}</textarea></label></div>
        <label class="field"><span>结尾卡的角色说明</span><textarea data-cfg="img.roleEnding" rows="3">${esc(S.config.img.roleEnding)}</textarea></label></div></section>
      <section class="card set-card" id="s-model"><h2 class="card-h">模型与编辑器<span class="hint">只有两三个选项，就全部摆出来</span></h2><div class="set-b"><div class="num-grid">
        ${seg("tierWrite", "写初稿、迭代用", tiers)}${seg("tierScore", "评分、改批注用", tiers)}${seg("tierQuick", "提炼记忆等小事用", tiers)}${seg("editorFont", "正文字体", [["serif", "宋体", "稿纸感"], ["sans", "黑体", "界面感"]])}</div>
        ${W.AI.desk ? `<div class="btn-row"><button type="button" class="btn primary" data-st="ai">${I("key", 15)}设置 AI 服务（API key 和模型）</button><span class="hint">${esc(W.AI.label())}</span></div>` : ""}</div></section>
      <section class="card set-card" id="s-data"><h2 class="card-h">数据</h2><div class="set-b">
        <p class="hint">${W.P.mode === "vault" ? `笔记就是写作库里的 .md 文件，可以用 Obsidian 或任何编辑器打开：${esc(S.vault?.path || "")}` : W.P.mode === "cloud" ? "现在存在这个页面的云端数据库里，换设备打开同一个链接也在。" : "现在只存在这台浏览器里（没连上云端数据库）。记得定期备份。"}</p>
        ${window.desk ? `<div class="btn-row"><button type="button" class="btn" data-st="vault-reveal">${I("folder", 15)}在访达中显示写作库</button><button type="button" class="btn" data-st="vault-open">打开别的写作库…</button></div>` : ""}
        <div class="btn-row"><button type="button" class="btn" data-st="backup">${I("down", 15)}备份全部（JSON）</button>
          <label class="btn">${I("upload", 15)}从备份恢复<input type="file" accept="application/json,.json" id="restore-file" hidden></label>
          <button type="button" class="btn danger" data-st="reset-config">恢复全部默认参数</button></div></div></section>`;
    syncSettings();
  }
  // 改了数字之后：更新“读出来”的那句话、恢复默认按钮、圆点判断、量表合计
  function syncSettings() {
    const v = W.$("#v-settings"); if (!v || v.hidden && !v.innerHTML) return;
    W.$$("[data-read]", v).forEach((el) => { el.textContent = cfgVal(el.dataset.read); });
    W.$$('[data-st="reset-cfg"]', v).forEach((b) => { b.hidden = +cfgVal(b.dataset.k) === +cfgDef(b.dataset.k); });
    const c = S.config, pw = W.$("#pick-warn"); if (pw) pw.hidden = !(c.titlePick > c.titleCount || c.titleSkeletons > c.titleCount);
    const L = W.Editor.lastLint, note = W.note();
    const verdict = (key, now, nowText, limit) => {
      const el = W.$(`[data-chk="${key}"]`, v); if (!el) return;
      if (now == null) { el.className = "verdot na"; el.lastChild.textContent = note ? "评分时由 Claude 检查" : "打开一篇笔记后，这里会显示它的情况"; return; }
      const ok = now <= limit; el.className = "verdot" + (ok ? "" : " over");
      el.lastChild.textContent = `这篇 ${nowText}，${ok ? "在范围内" : "超了 " + Math.round((now - limit) * 10) / 10}`;
    };
    const has = L && note;
    verdict("ai", has ? L.aiPerK : null, has ? `${L.aiPerK} 处/千字` : "", c.aiTasteMax);
    verdict("nxy", has ? L.notXbutY : null, has ? `${L.notXbutY} 次` : "", c.notXbutYMax);
    const addr = has ? Math.max(0, ...Object.values(L.address || {})) : null;
    verdict("addr", addr, `最多 ${addr} 次`, c.addressMax);
    verdict("hedge", null, "", c.hedgeMax);
    const sum = S.rubric.reduce((s, r) => s + (+r.max || 0), 0), rs = W.$("#rub-sum");
    if (rs) { rs.textContent = sum === 100 ? "合计 100 / 100" : sum < 100 ? `合计 ${sum} · 还差 ${100 - sum} 分` : `合计 ${sum} · 多了 ${sum - 100} 分`; rs.classList.toggle("off", sum !== 100); }
  }

  // ================= 事件绑定 =================
  const setPath = (obj, path, val) => { const ks = path.split("."); let o = obj; ks.slice(0, -1).forEach((k) => (o = o[k] ||= {})); o[ks.at(-1)] = val; };
  W.Panels = {
    render(view) { ({ memory: renderMemory, souls: renderSouls, mind: renderMind, nature: renderNature, settings: renderSettings }[view] || (() => {}))(); },
    mount() {
      // 记忆
      const vm = W.$("#v-memory");
      vm.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-mm]"); if (!b) return; const a = b.dataset.mm;
        if (a === "filter") { S.ui.memF = b.dataset.id; renderMemory(); }
        if (a === "add") { const m = { id: W.uid("m"), rule: "", why: "", bad: "", good: "", level: "core", scope: "all", polarity: "avoid", enabled: true, hits: 0, createdAt: W.now() }; S.memory.unshift(m); W.saveMemory(m); renderMemory(); W.$(`[data-mid="${m.id}"] .mem-rule`)?.focus(); }
        if (a === "del") { if (!(await U.confirm("删除这条记忆？", { ok: "删除", danger: true }))) return; S.memory = S.memory.filter((x) => x.id !== b.dataset.id); W.P.del("memory", b.dataset.id); renderMemory(); }
        if (a === "src") { W.App.go("desk"); W.Desk.open(b.dataset.id); }
      });
      const memField = (e) => {
        const t = e.target, card = t.closest("[data-mid]"); if (!card || !t.dataset.mf) return;
        const m = S.memory.find((x) => x.id === card.dataset.mid); m[t.dataset.mf] = t.type === "checkbox" ? t.checked : t.value; W.saveMemory(m);
        if (t.type === "checkbox") card.classList.toggle("off", !t.checked);
        if (t.dataset.mf === "polarity") card.classList.toggle("keep", t.value === "keep");
      };
      vm.addEventListener("input", memField); vm.addEventListener("change", memField);

      // 灵魂
      const vs = W.$("#v-souls");
      vs.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-sm]"); if (!b) return; const a = b.dataset.sm;
        if (a === "pick") { S.ui.soulSel = b.dataset.id; renderSouls(); }
        if (a === "add") { const s = { ...W.clone(D.souls[0]), id: W.uid("s"), name: "新灵魂", note: "", identity: "", voice: "", sayings: "", excite: "", eyeroll: "", care: "", stance: "", experiences: "" }; S.souls.push(s); W.saveSoul(s); S.ui.soulSel = s.id; renderSouls(); W.$('[data-sf="name"]')?.select(); }
        if (a === "dup") { const o = W.soul(b.dataset.id), s = { ...W.clone(o), id: W.uid("s"), name: o.name + "（副本）" }; S.souls.push(s); W.saveSoul(s); S.ui.soulSel = s.id; renderSouls(); }
        if (a === "default") { S.config.activeSoul = b.dataset.id; W.saveConfig(); renderSouls(); }
        if (a === "del") { if (S.souls.length <= 1) { W.toast("至少要留一个灵魂"); return; } if (!(await U.confirm("删除这个灵魂？用它写过的文章不受影响。", { ok: "删除", danger: true }))) return; S.souls = S.souls.filter((x) => x.id !== b.dataset.id); W.P.del("souls", b.dataset.id); if (S.config.activeSoul === b.dataset.id) { S.config.activeSoul = S.souls[0].id; W.saveConfig(); } S.ui.soulSel = null; renderSouls(); }
        if (a === "defaults") { for (const s of D.souls) if (!S.souls.find((x) => x.id === s.id)) { const c = W.clone(s); S.souls.push(c); W.saveSoul(c); } renderSouls(); }
      });
      vs.addEventListener("input", (e) => {
        const f = e.target.closest("[data-soul]"); if (!f) return;
        const s = W.soul(f.dataset.soul), t = e.target;
        if (t.dataset.sf) s[t.dataset.sf] = t.value;
        if (t.id === "sf-comment") s.comment = +t.value; if (t.id === "sf-emotion") s.emotion = +t.value;
        W.saveSoul(s);
        if (t.dataset.sf === "name") { const c = W.$(`.soul-card[data-id="${s.id}"] .soul-name`); if (c) [...c.childNodes].find((x) => x.nodeType === 3).textContent = t.value; }
      });

      // 心智
      const vmi = W.$("#v-mind");
      vmi.addEventListener("input", (e) => {
        const t = e.target, ms = S.mindset;
        if (t.id === "ms-distance") { ms.distance = +t.value; const b = W.idAtLevel(ms.distance); W.$("#ms-num").textContent = t.value; W.$("#ms-band").textContent = b.name; W.$("#ms-band-text").textContent = b.text; }
        else if (t.id?.startsWith("mf-")) ms.factors.find((f) => "mf-" + f.key === t.id).value = +t.value;
        else if (t.dataset.mfk) ms.factors[+t.dataset.mfk][t.dataset.end] = t.value;
        else if (t.id === "ms-why") ms.why = t.value;
        else if (t.dataset.aud) { const p = S.platforms[+t.dataset.aud]; p.audience[t.dataset.k] = t.dataset.k === "female" ? W.clamp(+t.value, 0, 100) : t.value; W.saveList("platforms"); refreshMindPreview(); return; }
        else return;
        W.saveMindset(); refreshMindPreview();
      });
      vmi.addEventListener("keydown", (e) => {
        const t = e.target; if (!t.dataset.anc || e.key !== "Enter" || !t.value.trim()) return;
        S.mindset.anchors[t.dataset.anc].push(t.value.trim()); W.saveMindset(); renderMind(); W.$(`[data-anc="${t.dataset.anc}"]`)?.focus();
      });
      vmi.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-ms]"); if (!b) return; const a = b.dataset.ms;
        if (a === "anc-del") { S.mindset.anchors[b.dataset.g].splice(+b.dataset.i, 1); W.saveMindset(); renderMind(); }
        if (a === "group-add") { const g = await U.ask("新的锚点分组", { placeholder: "比如：节日" }); if (g && !S.mindset.anchors[g]) { S.mindset.anchors[g] = []; W.saveMindset(); renderMind(); } }
        if (a === "try") tryMind();
      });

      // 人性
      const vn = W.$("#v-nature");
      vn.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-nm]"); if (!b) return; const a = b.dataset.nm;
        if (a === "sec") { const ids = NAT_SECS.map((x) => x[0]); natDir = Math.sign(ids.indexOf(b.dataset.id) - ids.indexOf(S.ui.natSec || "want")); S.ui.natSec = b.dataset.id; renderNature(); return; }
        if (a === "preset") {
          const p = D.neuroPresets.find((x) => x.id === b.dataset.id), box = b.closest("[data-body]");
          ensureBody("neuro").forEach((d) => { if (p.v[d.id] != null) d.level = p.v[d.id]; });
          U.setBars(box, p.v); refreshCap("neuro", box); saveBody();
        }
        if (a === "toggle") { S.ui.natOpen = S.ui.natOpen === b.dataset.id ? null : b.dataset.id; const card = b.closest(".nat"); const open = S.ui.natOpen === b.dataset.id;
          W.$$(".nat.open", vn).forEach((x) => { if (x !== card) { x.classList.remove("open"); x.querySelector(".nat-body").hidden = true; x.querySelector(".nat-title").setAttribute("aria-expanded", "false"); } });
          card.classList.toggle("open", open); card.querySelector(".nat-body").hidden = !open; b.setAttribute("aria-expanded", open); }
        if (a === "add") { const n = { id: W.uid("h"), name: "新的欲望", tag: "", weight: 50, on: true, thinkers: "", philosophy: "", shows: "", lever: "", redline: "", order: S.nature.length }; S.nature.push(n); W.saveNature(n); S.ui.natOpen = n.id; renderNature(); }
        if (a === "del") { if (!(await U.confirm("删除这一条？", { ok: "删除", danger: true }))) return; S.nature = S.nature.filter((x) => x.id !== b.dataset.id); W.P.del("nature", b.dataset.id); renderNature(); }
        if (a === "defaults") { let k = 0; D.nature.forEach((n, i) => { if (!S.nature.find((x) => x.id === n.id)) { const c = { ...W.clone(n), order: i }; S.nature.push(c); W.saveNature(c); k++; } }); W.toast(k ? `补回了 ${k} 条` : "默认条目都在"); renderNature(); }
      });
      const natField = (e) => {
        const t = e.target;
        if (t.id === "cfg-natureMin" || t.id === "cfg-natureTop") { S.config[t.id.slice(4)] = +t.value; W.saveConfig(); return; }
        if (t.dataset.nb) { const d = ensureBody(t.dataset.nb).find((x) => x.id === t.dataset.id); d.level = +t.value; refreshCap(t.dataset.nb, t.closest("[data-body]")); saveBody(); return; }
        if (t.dataset.nd) { const d = ensureBody(t.dataset.nd).find((x) => x.id === t.dataset.id); d[t.dataset.k] = t.value; if (t.dataset.k === "does") t.closest("details").querySelector("summary .hint").textContent = t.value; saveBody(); return; }
        const card = t.closest("[data-nid]"); if (!card || !t.dataset.nf2) return;
        const n = S.nature.find((x) => x.id === card.dataset.nid), k = t.dataset.nf2;
        n[k] = k === "on" ? t.checked : k === "weight" ? +t.value : t.value; W.saveNature(n);
        if (k === "weight") { card.querySelector("output.w").textContent = t.value; t.style.setProperty("--p", t.value + "%"); }
        if (k === "on") card.classList.toggle("off", !t.checked);
        if (k === "philosophy") card.querySelector(".nat-sum").textContent = t.value;
      };
      vn.addEventListener("input", natField); vn.addEventListener("change", natField);

      // 参数
      const vst = W.$("#v-settings");
      vst.addEventListener("input", (e) => {
        const t = e.target;
        const isNum = t.type === "number" || "num" in t.dataset;
        if (t.dataset.cfg) { setPath(S.config, t.dataset.cfg, isNum ? +t.value : t.value); W.saveConfig(); if (t.dataset.cfg === "editorFont") W.App.applyFont(); syncSettings(); }
        else if (t.dataset.rub) { const r = S.rubric[+t.dataset.rub]; r[t.dataset.k] = t.dataset.k === "max" ? +t.value : t.value; W.saveList("rubric"); if (t.dataset.k === "max") { W.$("#rub-bar").innerHTML = rubBar(); syncSettings(); } }
        else if (t.dataset.pl) { setPath(S.platforms[+t.dataset.pl], t.dataset.k, isNum ? +t.value : t.value); W.saveList("platforms"); }
        else if (t.dataset.gn) { S.genres[+t.dataset.gn][t.dataset.k] = t.value; W.saveList("genres"); }
        else if (t.dataset.rule) { S.rules[t.dataset.rule] = t.value; W.saveRules(); }
      });
      vst.addEventListener("change", (e) => {
        const t = e.target;
        if (t.tagName === "SELECT" && (t.dataset.cfg || t.dataset.pl)) t.dispatchEvent(new Event("input", { bubbles: true }));
        if (t.id === "restore-file" && t.files[0]) restore(t.files[0]);
      });
      vst.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-st]"); if (!b) return; const a = b.dataset.st;
        if (a === "reset-rule") { delete S.rules[b.dataset.k]; W.saveRules(); renderSettings(); }
        if (a === "reset-cfg") { const k = b.dataset.k, d = cfgDef(k); setPath(S.config, k, d); W.saveConfig(); const sc = W.$("#v-settings").scrollTop; renderSettings(); W.$("#v-settings").scrollTop = sc; }
        if (a === "reset-rubric" && (await U.confirm("恢复默认评分量表？"))) { S.rubric = W.clone(D.rubric); W.saveList("rubric"); renderSettings(); }
        if (a === "reset-plat" && (await U.confirm("恢复默认平台规格？受众画像也会一起恢复。"))) { S.platforms = W.clone(D.platforms); W.saveList("platforms"); renderSettings(); }
        if (a === "reset-genre" && (await U.confirm("恢复默认体裁？"))) { S.genres = W.clone(D.genres); W.saveList("genres"); renderSettings(); }
        if (a === "reset-config" && (await U.confirm("把流程、配图、模型这些参数恢复默认？笔记、灵魂、人性表、记忆不受影响。", { ok: "恢复", danger: true }))) { const keep = { activeSoul: S.config.activeSoul, platform: S.config.platform, genre: S.config.genre, kind: S.config.kind }; S.config = { ...W.clone(D.config), ...keep }; W.saveConfig(); renderSettings(); W.App.applyFont(); }
        if (a === "backup") backup();
        if (a === "ai") W.Panels.aiSettings();
        if (a === "vault-reveal") window.desk.vault.reveal();
        if (a === "vault-open") window.desk.vault.choose();
      });
    },
  };

  async function tryMind() {
    const topic = W.$("#ms-try").value.trim(); if (!topic) { W.toast("先写一个题目"); return; }
    const out = W.$("#ms-try-out");
    const prompt = `同一个题目，按三种“心智距离”各写一个标题和切口，展示差别。心智距离 0 = 写给完全不关心这个领域的普通人，必须挂到人人都知道的东西上（可以从锚点库选）；50 = 写给对这个话题有兴趣的普通人；90 = 写给行业专家。
${W.mindsetText()}
作者的灵魂：${W.soul()?.name || ""}
题目：${topic}
只输出 JSON：{"levels":[{"distance":10,"title":"标题","anchor":"用了哪个大众锚点","angle":"切口一句话","nature":"主要调动的人性"},{"distance":50,…},{"distance":90,…}]}`;
    out.innerHTML = `<div class="jobbar"><span class="spinner"></span><span>Claude 在写三种版本…</span></div>`;
    try {
      const r = await W.AI.run(prompt, { json: true, tier: "quick", label: "心智对比" });
      out.innerHTML = (r.levels || []).map((l) => `<article class="try-card"><span class="mono small">心智 ${l.distance} · ${esc(W.idAtLevel(l.distance).name)}</span><b>${esc(l.title)}</b><p class="small">${esc(l.angle || "")}</p><p class="small muted">锚点：${esc(l.anchor || "—")} · 人性：${esc(l.nature || "—")}</p></article>`).join("");
    } catch (e) { out.innerHTML = e?.silent ? "" : `<p class="small bad">${esc(W.AI.msg(e))}</p>`; }
  }

  function backup() {
    const data = { app: "主理人写作台", version: 1, at: W.now(), config: S.config, mindset: S.mindset, rules: S.rules, rubric: S.rubric, platforms: S.platforms, genres: S.genres, folders: S.folders, souls: S.souls, nature: S.nature, memory: S.memory, notes: S.notes, plans: S.plans };
    W.download(`写作台备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json");
  }
  async function restore(file) {
    let d; try { d = JSON.parse(await file.text()); } catch { W.toast("这不是写作台的备份文件", "bad"); return; }
    if (d.app !== "主理人写作台") { W.toast("这不是写作台的备份文件", "bad"); return; }
    if (!(await U.confirm(`用这份备份（${d.at?.slice(0, 10) || "未知日期"}，${d.notes?.length || 0} 篇笔记）覆盖同名的条目？备份里没有的条目会保留。`, { ok: "恢复" }))) return;
    Object.assign(S, { config: W.merge(W.clone(D.config), d.config), mindset: d.mindset || S.mindset, rules: d.rules || {}, rubric: d.rubric || S.rubric, platforms: d.platforms || S.platforms, genres: d.genres || S.genres, folders: d.folders || S.folders });
    W.saveConfig(); W.saveMindset(); W.saveRules(); ["rubric", "platforms", "genres", "folders"].forEach(W.saveList);
    const upsert = (name, list, save) => { for (const x of list || []) { const i = S[name].findIndex((y) => y.id === x.id); i >= 0 ? (S[name][i] = x) : S[name].push(x); save(x); } };
    upsert("souls", d.souls, W.saveSoul); upsert("nature", d.nature, W.saveNature); upsert("memory", d.memory, W.saveMemory); upsert("notes", d.notes, (n) => W.saveNote(n, 0));
    for (const [k, v] of Object.entries(d.plans || {})) { S.plans[k] = v; W.savePlan(k); }
    W.toast("恢复好了"); W.App.go("desk"); W.Desk.refresh();
  }
})();

/* Mac App：AI 服务设置。密钥交给主进程用钥匙串加密保存，页面里只看得到前几位。 */
W.Panels.aiSettings = async (first) => {
  if (!window.desk) return;
  const U = W.UI, esc = W.esc, I = U.icon;
  let s = await window.desk.ai.settings();
  const tierRows = (p, list) => [["complex", "最强"], ["default", "均衡"], ["quick", "最快"]].map(([t, nm]) =>
    `<label class="field"><span>${nm}</span><input class="input" data-ai="${p}.models.${t}" value="${esc(s[p].models[t] || "")}" placeholder="${p === "claude" ? "" : "服务商给的模型名"}" list="${list}"></label>`).join("");
  const keyField = (k, label, hint) => `<label class="field"><span>${label} ${s.hasKey[k] ? `<em class="good">已保存 ${esc(s.keyHint[k])}</em>` : `<em class="muted">未填</em>`}</span>
    <input class="input mono" type="password" autocomplete="off" data-key="${k}" placeholder="${s.hasKey[k] ? "留空 = 不改；要换就粘贴新的" : hint}"></label>`;
  const body = `${first ? `<p class="note-box">写作台现在是 Mac App 了：AI 用你自己的 API key。先填一个，写初稿、评分、批注改稿才能用。</p>` : ""}
    <div class="field"><span>写作用哪家</span>${U.segRadios("ai-provider", 'data-ai="provider"', s.provider, [["claude", "Claude", "Anthropic"], ["openai", "OpenAI 兼容", "OpenAI、DeepSeek、Kimi…"]], "写作用哪家")}</div>
    <section class="ai-sec"><h3 class="sec-h">Claude</h3>
      ${keyField("claudeKey", "API key", "sk-ant-…（在 console.anthropic.com 创建）")}
      <div class="grid3">${tierRows("claude", "claude-models")}</div>
      <p class="hint">三档对应“参数 › 模型”里的最强 / 均衡 / 最快。默认都用 Claude Opus 5.5，“最快”用 Haiku 5.5；被安全分类器拒绝时会自动换模型重跑。</p></section>
    <section class="ai-sec"><h3 class="sec-h">OpenAI 兼容</h3>
      <label class="field"><span>接口地址</span><input class="input mono" data-ai="openai.baseURL" value="${esc(s.openai.baseURL)}" placeholder="https://api.openai.com/v1"></label>
      ${keyField("openaiKey", "API key", "sk-…")}
      <div class="grid3">${tierRows("openai", "")}</div>
      <div class="grid2"><label class="field"><span>生图模型</span><input class="input" data-ai="openai.imageModel" value="${esc(s.openai.imageModel || "")}" placeholder="gpt-image-1"></label>
        <div class="field"><span>生图质量</span>${U.segRadios("ai-iq", 'data-ai="openai.imageQuality"', s.openai.imageQuality || "high", [["low", "低"], ["medium", "中"], ["high", "高"]], "生图质量")}</div></div>
      <p class="hint">DeepSeek、Kimi、通义等兼容 OpenAI 接口的服务，把接口地址换成它们的就行。配图页的“直接生成”用这里的 key 和生图模型。</p></section>
    <datalist id="claude-models"><option value="claude-opus-5-5"><option value="claude-sonnet-5-5"><option value="claude-haiku-5-5"><option value="claude-fable-5-1"></datalist>
    <div class="ai-test" id="ai-test"></div>`;
  U.modal({ title: "AI 服务", wide: true, body, actions: [{ label: "测试连接", act: "test" }, { label: "关闭", act: "close" }, { label: "保存", act: "save", primary: true }],
    onAct: async (a, root, close) => {
      const patch = { keys: {}, claude: { models: {} }, openai: { models: {} } };
      root.querySelectorAll("[data-ai]").forEach((el) => {
        if (el.type === "radio" && !el.checked) return;
        const path = el.dataset.ai.split("."); let o = patch; path.slice(0, -1).forEach((k) => (o = o[k] ||= {})); o[path.at(-1)] = el.value.trim();
      });
      root.querySelectorAll("[data-key]").forEach((el) => { if (el.value.trim()) patch.keys[el.dataset.key] = el.value.trim(); });
      if (a === "save" || a === "test") { s = await window.desk.ai.save(patch); W.AI.settings = s; W.emit("ai:settings"); }
      if (a === "test") {
        const box = root.querySelector("#ai-test"); box.innerHTML = `<span class="spinner"></span> 正在请求${s.provider === "openai" ? "OpenAI 兼容服务" : " Claude"}…`;
        try { const r = await W.AI.fn("只回复两个字：收到", { modelTier: "quick" }); box.innerHTML = `<span class="good">${I("check", 15)} 连上了：${esc(r.text.trim().slice(0, 40))}${r.model ? `（${esc(r.model)}）` : ""}</span>`; }
        catch (e) { box.innerHTML = `<span class="bad">${esc(W.AI.msg(e))}${e.message ? `<br><span class="small mono">${esc(e.message)}</span>` : ""}</span>`; }
        return false;
      }
      if (a === "save") W.toast("AI 设置已保存");
    } });
};
