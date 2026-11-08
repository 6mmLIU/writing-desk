/* 配图：配图计划（Claude 生成或手写）→ 每张图的完整生图提示词（移植自 brand-ip-illustrator 的 illustrate.mjs）
   → 复制去 ChatGPT 画 → 上传结果 → Claude 看图自检 → 导出 plan.json 给 skill 跑。 */
W.Illus = (() => {
  const S = W.S, K = window.SKILL, U = W.UI, I = W.UI.icon, esc = W.esc;
  const X = {};
  const STY = Object.fromEntries(K.styles.map((s) => [s.id, s]));
  const PAT = Object.fromEntries(K.patterns.map((p) => [p.id, p]));
  const PRE = K.presets;
  const EXPR = K.character.variable.expression;
  const ACC = K.character.accessories;
  const files = {}; // 本次会话里上传的原始文件，自检时直接用

  // ---------- 尺寸与画布（同 illustrate.mjs） ----------
  const CANVAS = { portrait: [1024, 1536], landscape: [1536, 1024], square: [1024, 1024] };
  const sizeOf = (s) => (PRE[s] ? { w: PRE[s].w, h: PRE[s].h } : (([w, h]) => ({ w: +w, h: +h }))(String(s).split("x")));
  const canvasFor = (s) => { const a = PRE[s]?.ai_size; if (a) return a === "1024x1536" ? "portrait" : a === "1536x1024" ? "landscape" : "square"; const { w, h } = sizeOf(s); const r = w / h; return r > 1.2 ? "landscape" : r < 0.83 ? "portrait" : "square"; };
  const groups = (item) => { const g = {}; for (const s of item.sizes?.length ? item.sizes : ["xhs-page"]) (g[canvasFor(s)] ||= []).push(s); return g; };
  function ratioLabel(w, h) {
    const g = (a, b) => (b ? g(b, a % b) : a); const d = g(w, h); const [a, b] = [w / d, h / d];
    const orient = w > h ? "landscape" : w < h ? "portrait" : "square";
    return a <= 21 && b <= 21 ? `${orient} ${a}:${b}` : `${orient} ${(w / h).toFixed(2)}:1`;
  }
  function want(canvas, sizes) {
    const rs = [...new Set(sizes.map((s) => { const { w, h } = sizeOf(s); return +(w / h).toFixed(3); }))];
    if (rs.length === 1) { const { w, h } = sizeOf(sizes[0]); return { r: w / h, label: ratioLabel(w, h) }; }
    const [cw, ch] = CANVAS[canvas]; return { r: cw / ch, label: ratioLabel(cw, ch) };
  }
  function keep(canvas, sizes) {
    const C = want(canvas, sizes).r; let kw = 1, kh = 1;
    for (const s of sizes) { const { w, h } = sizeOf(s); const T = w / h; if (T > C) kh = Math.min(kh, C / T); else kw = Math.min(kw, T / C); }
    return { kw, kh };
  }

  // ---------- 提示词（同 illustrate.mjs 的 prompt()，身份锁、角色说明可在参数里改） ----------
  const strip = (s) => String(s || "").replace(/==|\*\*/g, "");
  const emph = (s) => [...String(s || "").matchAll(/==(.+?)==/g)].map((m) => m[1]);
  const q = (s) => `「${strip(s)}」`;
  function textBlock(t = {}) {
    const lines = [], expected = [];
    const add = (label, v) => { if (!v || (Array.isArray(v) && !v.length)) return; const vs = Array.isArray(v) ? v : [v]; for (const x of vs) for (const part of strip(x).split(/\n|\\n/)) if (part.trim()) expected.push(part.trim());
      const em = vs.flatMap(emph); lines.push(`- ${label}: ${vs.map((x) => q(String(x).replace(/\\n/g, "\n"))).join("  ")}${em.length ? ` — emphasize ${em.map((e) => `「${e}」`).join(" ")} (bigger, accent color)` : ""}`); };
    add("MAIN TITLE (largest, eye-catching hand-lettered word art; line breaks as given)", t.title);
    add("Subtitle (medium)", t.subtitle); add("Small tag / badge", t.tag);
    add("Labels written ON the objects they belong to (small, neat)", t.labels);
    add("Short notes", t.notes); add("Speech bubble from the character", t.bubble);
    return { lines, expected };
  }
  X.prompt = (item, canvas, sizes, plan) => {
    const C = S.config.img, style = STY[item.style || plan.style] || STY.pop;
    const variant = item.variant || plan.variant || "standard";
    const V = K.character.variants?.[variant];
    const { kw, kh } = keep(canvas, sizes);
    const { lines: tl, expected } = textBlock(item.text);
    const slot = item.slot || "inline";
    const role = { cover: C.roleCover, inline: C.roleInline, ending: C.roleEnding }[slot] || C.roleInline;
    const accs = (item.accessories || []).map((k) => ACC[k]?.en || k);
    const safe = [...new Set(sizes.map((s) => PRE[s]?.safe).filter(Boolean))];
    const lock = W.identityLock();
    const P = ["Please GENERATE AN IMAGE.", `Create ${role}`, `What the reader must understand from this image: ${item.purpose || ""}`, `SCENE — the character acts it out: ${item.scene || ""}`];
    if (item.pattern && PAT[item.pattern]) P.push(`Visual metaphor: ${PAT[item.pattern].en}.`);
    P.push(C.performRule);
    if (variant === "chibi") {
      const l = lock.replace(/chunky chibi proportions \(head ≈ 1\/3\.5 of body\)/, "SUPER-DEFORMED CHIBI proportions (head ≈ 1/2 of the total height)").replace(/do NOT make him realistic, older, thinner or more handsome\./, "do NOT make him realistic or give him normal body proportions.");
      P.push(`THE CHARACTER — DRAW HIM AS A Q-VERSION SUPER-DEFORMED CHIBI: a huge round head that is about HALF of his total height, a tiny stubby body, short stubby arms and legs, small round hands and feet — exactly like the attached chibi reference sheets (turnaround, expressions, poses). NOT normal proportions. ${l} Give him a NEW chibi pose that fits this scene.`);
    } else P.push(`THE CHARACTER — ${lock}${V?.identity_suffix ? " " + V.identity_suffix : ""} Use the attached reference sheets for his face and proportions; give him a NEW pose that fits this scene.`);
    const outfit = item.outfit || C.outfit;
    P.push([item.expression ? `Expression: ${item.expression}.` : "Expression: pick the one that matches the emotion of this idea.",
      outfit ? `Outfit for this image: ${outfit} (face and head stay identical).` : `Outfit: his signature ${K.character.signature_outfit}.`,
      accs.length ? `Accessories: ${accs.join("; ")}.${(item.accessories || []).includes("sunglasses") ? " The sunglasses replace his round glasses; the rest of the face stays identical." : ""}` : ""].filter(Boolean).join(" "));
    P.push(`VISUAL STYLE: ${style.ai_prompt}.${style.ai_lettering ? ` Title lettering: ${style.ai_lettering}.` : ""} The character keeps his own flat anime look inside this style.`);
    P.push(tl.length ? `TEXT IN THE IMAGE — write exactly these Chinese strings, every character correct, nothing added, nothing missing, no other words:\n${tl.join("\n")}` : "No text in the image.");
    P.push("No logos, no watermark, no account name, no UI chrome unless the scene itself needs it.");
    const mt = Math.max(6, Math.round((1 - kh) * 50) + 4), ml = Math.max(5, Math.round((1 - kw) * 50) + 3);
    P.push(`MARGINS: leave the top ${mt}% and bottom ${mt}% of the picture, and the left ${ml}% and right ${ml}%, as plain background only — the title must start at least ${mt}% below the top edge, and no text, face or key object may touch those margins (the image will be cropped to other formats).`);
    if (safe.length) P.push(`Platform notes: ${safe.join("; ")}.`);
    if (item.extra) P.push(item.extra);
    P.push(`Image format: ${want(canvas, sizes).label} — make the whole canvas exactly this aspect ratio.`);
    const refs = variant === "chibi" ? ["chibi-turnaround", "chibi-expressions", "chibi-poses"] : ["turnaround-sheet", "expression-sheet"];
    if (accs.length) refs.push("acc-sheet-a");
    if (outfit && /suit|pajama|apron|sport|hoodie|T-shirt|西装|睡衣|围裙|运动|卫衣/i.test(outfit)) refs.push("outfit-sheet");
    return { prompt: P.join("\n\n"), refs, expected, label: want(canvas, sizes).label };
  };
  const REF_NAME = { "turnaround-sheet": "三视图", "expression-sheet": "表情表", "acc-sheet-a": "配件表", "outfit-sheet": "服装表", "pose-sheet-a": "动作表 A", "pose-sheet-b": "动作表 B", "chibi-turnaround": "Q 版三视图", "chibi-expressions": "Q 版表情", "chibi-poses": "Q 版动作", original: "原图" };

  // ---------- 计划 ----------
  const planOf = (id) => S.plans[id];
  const ensurePlan = (note) => (S.plans[note.id] ||= { style: S.config.img.style, variant: S.config.img.variant, images: [], updatedAt: W.now() });
  const sizesFor = (slot, p) => (slot === "cover" ? [...p.img.cover] : [p.img.inline]);
  function recommend(note) {
    const t = ((note.title || "") + "\n" + (note.text || "")).toLowerCase(), p = W.platform(note.platform);
    const bias = K.bias[p.id === "xhs" ? "小红书" : p.id.startsWith("wechat") ? "公众号" : p.id === "zhihu" ? "知乎" : p.id.startsWith("x") ? "X" : ""] || [];
    return K.styles.map((s) => {
      let sc = 0; for (const k of s.keywords || []) if (t.includes(k.toLowerCase())) sc += 2;
      for (const b of s.best_for || []) if (t.includes(b.toLowerCase())) sc += 1;
      if (bias.includes(s.id)) sc += 3;
      const soft = S.mindset.factors.find((f) => f.key === "soft")?.value ?? 50;
      if (soft >= 60 && s.energy <= 2) sc += 1; if (soft <= 40 && s.energy >= 4) sc += 1;
      return { id: s.id, sc };
    }).sort((a, b) => b.sc - a.sc).slice(0, 5).filter((x) => x.sc > 0).map((x) => x.id);
  }
  const warnText = (it) => {
    const C = S.config.img, t = it.text || {}, w = [];
    const title = strip(t.title).replace(/\\n|\n/g, "");
    if (title.length > C.titleMax) w.push(`标题 ${title.length} 字，超过 ${C.titleMax}`);
    const blocks = [t.title, t.subtitle, t.tag, t.bubble, ...(t.labels || []), ...(t.notes || [])].filter(Boolean).length;
    if (blocks > C.textBlocks) w.push(`文字 ${blocks} 段，超过 ${C.textBlocks}`);
    for (const l of t.labels || []) if (strip(l).length > C.labelMax) w.push(`标签“${strip(l)}”超过 ${C.labelMax} 字`);
    if (t.bubble && strip(t.bubble).length > C.bubbleMax) w.push(`气泡超过 ${C.bubbleMax} 字`);
    if (!it.scene?.trim()) w.push("还没写 scene：人物在对什么做什么");
    return w;
  };

  // ---------- 渲染：放在写作页右侧流程的“配图”一步里 ----------
  // 同一个根节点在右栏里挂上、取下，事件只绑一次
  const root = document.createElement("div"); root.className = "il-root";
  const SLOT = { cover: "封面", inline: "正文", ending: "结尾" };
  X.mountInto = (host) => { if (!host) return; host.append(root); X.render(); };
  X.render = () => {
    if (!root.isConnected) return;
    const note = W.note();
    if (!note) { root.innerHTML = `<p class="empty-small">先打开一篇笔记</p>`; return; }
    const plan = ensurePlan(note), p = W.platform(note.platform), rec = recommend(note), st = STY[plan.style] || STY.pop;
    const accCount = plan.images.filter((x) => x.accessories?.length).length, accMax = Math.ceil(plan.images.length / S.config.img.accEvery);
    const has = (note.text || "").trim().length > 20;
    root.innerHTML = `
      <section class="pcard"><div class="pcard-b il-setup">
        <div class="il-setrow">
          <button type="button" class="il-style-now" data-il="styles" aria-expanded="${!!S.ui.ilStyles}" title="换画风"><img src="img/styles/${st.id}.jpg" alt="" width="30" height="40"><span><b>${esc(st.name)}</b><span class="small muted">${esc(st.look)}</span></span>${I("chev", 14)}</button>
          <div class="seg sm" role="group" aria-label="人物比例"><button type="button" class="${plan.variant !== "chibi" ? "on" : ""}" data-il="variant" data-id="standard">标准</button><button type="button" class="${plan.variant === "chibi" ? "on" : ""}" data-il="variant" data-id="chibi">Q 版</button></div>
        </div>
        <div class="sg" ${S.ui.ilStyles ? "" : "hidden"}>${K.styles.map((x) => `<button type="button" class="sg-item ${x.id === plan.style ? "on" : ""}" data-il="style" data-id="${x.id}" title="${esc(x.look)}。适合：${esc((x.best_for || []).join("、"))}">
          <img src="img/styles/${x.id}.jpg" alt="" loading="lazy" width="120" height="160"><span class="sg-name">${esc(x.name)}${rec.includes(x.id) ? `<i class="pill good">荐</i>` : ""}</span></button>`).join("")}</div>
        <p class="hint">${esc(p.name)}：${esc(p.img.rule)}</p>
      </div></section>
      ${accCount > accMax ? `<p class="note-box">${accCount} 张图用了配件，超过“每 ${S.config.img.accEvery} 张最多 1 张”，人物会像在走秀。</p>` : ""}
      ${plan.images.length ? `<div class="il-list">${plan.images.map((it, i) => itemCard(it, i, plan, note)).join("")}</div>
        <div class="il-foot"><button type="button" class="btn sm" data-il="add">${I("plus", 14)}加一张</button><span class="grow"></span><button type="button" class="btn sm ghost" data-il="markers" title="把每张图的位置写成 [配图：…] 插进正文">写进正文</button><button type="button" class="btn sm ghost" data-il="export">导出</button></div>`
      : `<section class="il-empty"><img class="il-hero" src="img/char/original.jpg" alt="" width="88" height="88">
          <b>让“我”来演这篇文章</b>
          <p>AI 读完全文，决定哪里配图、人物怎么演、图上写什么字。<br>也可以在正文里选中一段，点工具条上的<b>配图</b>，只给那一段配。</p>
          <button type="button" class="btn sm" data-il="add">${I("plus", 14)}手动加一张</button></section>`}
      <div class="insp-actions"><button type="button" class="btn primary" data-il="plan" ${has ? "" : "disabled"}>${I("image", 16)}${plan.images.length ? "重新排配图" : "让 AI 排配图"}</button></div>`;
    if (S.ui.ilOpen) root.querySelector(`.il-card[data-id="${CSS.escape(S.ui.ilOpen)}"]`)?.scrollIntoView({ block: "nearest" });
  };
  const sizeChips = (it, i, p) => {
    const all = [...new Set([...p.img.cover, p.img.inline, ...(it.sizes || [])])];
    return all.map((s) => `<button type="button" class="chip sm ${it.sizes?.includes(s) ? "on" : ""}" data-il="size" data-i="${i}" data-id="${s}" title="${esc(PRE[s]?.safe || "")}">${esc(PRE[s]?.platform || "")} ${esc(PRE[s]?.slot || s)} <span class="mono dim">${esc(PRE[s]?.ratio || s)}</span></button>`).join("") +
      `<select class="chip-add" data-il-addsize="${i}" aria-label="添加尺寸"><option value="">＋ 其它尺寸</option>${Object.entries(PRE).filter(([k]) => !all.includes(k)).map(([k, x]) => `<option value="${k}">${esc(x.platform)} · ${esc(x.slot)} ${esc(x.ratio)}</option>`).join("")}</select>`;
  };
  function itemCard(it, i, plan, note) {
    const p = W.platform(note.platform), t = it.text || {}, warns = warnText(it);
    const gs = Object.entries(groups(it));
    const ar = (() => { const [c, ss] = gs[0] || ["portrait", ["xhs-page"]]; return want(c, ss).r; })();
    const prompts = gs.map(([c, ss]) => ({ c, ss, ...X.prompt(it, c, ss, plan) }));
    const ck = it.check, open = S.ui.ilOpen === it.id, busy = X._gen?.has(i) || X._fill?.has(it.id);
    return `<article class="il-card ${open ? "open" : ""} ${busy ? "busy" : ""}" data-ii="${i}" data-id="${esc(it.id)}">
      <div class="il-row1">
        <div class="il-thumb" style="aspect-ratio:${ar.toFixed(3)}">${it.image?.url ? `<img src="${esc(it.image.url)}" alt="${esc(it.purpose || "")}" loading="lazy">` : `<span class="il-ph">${I("image", 18)}</span>`}
          <label class="il-up" title="${it.image ? "换一张" : "上传画好的图"}">${I("upload", 13)}<input type="file" accept="image/png,image/jpeg,image/webp" data-il-up="${i}" hidden></label></div>
        <div class="il-info">
          <div class="il-tags"><span class="pill">${SLOT[it.slot] || "正文"}</span><span class="small muted">${esc(it.id)}</span>${ck ? `<span class="pill ${ck.verdict === "pass" ? "good" : ck.verdict === "redo" ? "bad" : "warn"}">${ck.verdict === "pass" ? "可以用" : ck.verdict === "redo" ? "重画" : "要改"}</span>` : ""}${busy ? `<span class="ink-dot busy" aria-label="AI 在处理"></span>` : ""}</div>
          <b class="il-purpose">${esc(it.purpose || "还没写这张要讲什么")}</b>
          ${it.scene ? `<p class="il-scene">${esc(it.scene)}</p>` : `<p class="il-scene muted">人物在对什么做什么？点“编辑”补上</p>`}
        </div>
      </div>
      ${warns.length ? `<p class="warn-list small">${warns.map(esc).join(" · ")}</p>` : ""}
      <div class="il-acts">
        <button type="button" class="btn sm" data-il="copy" data-i="${i}">${I("copy", 14)}复制提示词</button>
        ${window.desk ? `<button type="button" class="btn sm" data-il="gen" data-i="${i}" ${X._gen?.has(i) ? "disabled" : ""}>${X._gen?.has(i) ? `<span class="spinner sm"></span>在画` : `${I("spark", 14)}直接画`}</button>` : `<a class="btn sm ghost" href="https://chatgpt.com/" target="_blank" rel="noopener">ChatGPT</a>`}
        <span class="grow"></span>
        ${it.anchor ? `<button type="button" class="icon-btn sm" data-il="locate" data-i="${i}" title="在正文里找到这张图的位置" aria-label="定位">${I("search", 15)}</button>` : ""}
        ${it.image ? `<button type="button" class="icon-btn sm" data-il="check" data-i="${i}" title="让 AI 看图检查" aria-label="检查">${I("eye", 15)}</button>` : ""}
        <button type="button" class="icon-btn sm" data-il="edit" data-i="${i}" aria-expanded="${open}" title="编辑这张" aria-label="编辑">${I("pen", 15)}</button>
      </div>
      ${ck ? `<div class="check ${ck.verdict}"><p><b>${ck.verdict === "pass" ? "可以用" : ck.verdict === "redo" ? "建议重画" : "需要局部修改"}</b> ${esc(ck.summary || "")}</p>
        <ul class="plain small">${(ck.items || []).map((x) => `<li class="${x.ok ? "good" : "bad"}">${x.ok ? "✓" : "✗"} ${esc(x.name)}${x.note ? "：" + esc(x.note) : ""}</li>`).join("")}</ul>
        ${ck.editPrompt ? `<button type="button" class="btn sm" data-il="copy-edit" data-i="${i}">${I("copy", 14)}复制局部修改提示词</button>` : ""}</div>` : ""}
      ${open ? `<div class="il-edit">
        <div class="grid2 tight">
          <label class="field"><span>位置</span><select data-it="${i}" data-k="slot">${Object.entries(SLOT).map(([k, nm]) => `<option value="${k}" ${it.slot === k ? "selected" : ""}>${nm}</option>`).join("")}</select></label>
          <label class="field"><span>编号</span><input data-it="${i}" data-k="id" value="${esc(it.id)}"></label>
        </div>
        <label class="field"><span>插在哪（原文里的一句话）</span><input data-it="${i}" data-k="anchor" value="${esc(it.anchor || "")}"></label>
        <label class="field"><span>读者看完要明白什么</span><input data-it="${i}" data-k="purpose" value="${esc(it.purpose || "")}"></label>
        <label class="field"><span>人物在对什么做什么 <em>· 遮住人物图就讲不明白才合格</em></span><textarea data-it="${i}" data-k="scene" rows="3">${esc(it.scene || "")}</textarea></label>
        <label class="field"><span>演绎方式</span><select data-it="${i}" data-k="pattern"><option value="">自创演绎</option>${K.patterns.map((x) => `<option value="${x.id}" ${it.pattern === x.id ? "selected" : ""}>${esc(x.fit)}</option>`).join("")}</select></label>
        <div class="grid2 tight">
          <label class="field"><span>表情</span><input data-it="${i}" data-k="expression" list="expr-list" value="${esc(it.expression || "")}"></label>
          <label class="field"><span>服装 <em>· 空 = 招牌</em></span><input data-it="${i}" data-k="outfit" value="${esc(it.outfit || "")}"></label>
        </div>
        <label class="field"><span>人物比例</span><select data-it="${i}" data-k="variant"><option value="">跟随全篇</option><option value="standard" ${it.variant === "standard" ? "selected" : ""}>标准</option><option value="chibi" ${it.variant === "chibi" ? "selected" : ""}>Q 版</option></select></label>
        <div class="field"><span>配件</span><div class="chips">${Object.entries(ACC).map(([k, a]) => `<button type="button" class="chip sm ${it.accessories?.includes(k) ? "on" : ""}" data-il="acc" data-i="${i}" data-id="${k}" title="${esc(a.when)}">${esc(a.zh)}</button>`).join("")}</div></div>
        <label class="field"><span>图上标题 <em>· \\n 换行，==词== 强调</em></span><input data-it="${i}" data-k="text.title" value="${esc((t.title || "").replace(/\n/g, "\\n"))}"></label>
        <div class="grid2 tight">
          <label class="field"><span>人物说的话</span><input data-it="${i}" data-k="text.bubble" value="${esc(t.bubble || "")}"></label>
          <label class="field"><span>小标签</span><input data-it="${i}" data-k="text.tag" value="${esc(t.tag || t.subtitle || "")}"></label>
        </div>
        <label class="field"><span>贴在物体上的标签 <em>· 逗号隔开</em></span><input data-it="${i}" data-k="text.labels" value="${esc((t.labels || []).join("，"))}"></label>
        <div class="field"><span>尺寸</span><div class="chips">${sizeChips(it, i, p)}</div></div>
        ${prompts.map((pr) => `<details class="prompt"><summary><span>提示词 · ${esc(pr.label)}</span><span class="muted small">参考图 ${pr.refs.length} 张</span></summary><pre class="pre mono small">${esc(pr.prompt)}</pre></details>`).join("")}
        <div class="row-inline"><input class="input sm" data-rev="${i}" placeholder="画好后要改哪里，比如：标题换成黄色"><button type="button" class="btn sm" data-il="rev" data-i="${i}">修改提示词</button></div>
        <div class="btn-row"><button type="button" class="btn sm" data-il="refs" data-i="${i}">参考图</button>${window.desk ? "" : ""}<span class="grow"></span><button type="button" class="btn sm ghost danger" data-il="del" data-i="${i}">${I("trash", 14)}删除这张</button></div>
      </div>` : ""}
    </article>`;
  }
  // 正文里选中一段 → 配一张：插在那一段，打开它，AI 只为这一段写演出
  X.fromSelection = (sel) => {
    const note = W.note(); if (!note || !sel) return;
    const plan = ensurePlan(note), p = W.platform(note.platform), t = note.text || "";
    const ps = t.lastIndexOf("\n", Math.max(0, sel.start - 1)) + 1, line = t.slice(ps, (t.indexOf("\n", ps) + 1 || t.length + 1) - 1).trim();
    const anchor = line.slice(0, 24) || sel.quote.trim().slice(0, 24);
    let k = plan.images.length + 1; while (plan.images.some((x) => x.id === "s" + k)) k++;
    const it = { id: "s" + k, slot: "inline", anchor, purpose: sel.quote.trim().replace(/\s+/g, " ").slice(0, 60), pattern: "", scene: "", expression: "", outfit: "", accessories: [], text: { title: "", labels: [], bubble: "", tag: "" }, sizes: sizesFor("inline", p) };
    plan.images.push(it);
    const pos = (x) => (x.slot === "cover" ? -1 : x.slot === "ending" ? 1e9 : (() => { const j = t.indexOf(x.anchor || "\u0000"); return j < 0 ? 1e8 : j; })());
    plan.images.sort((a, b) => pos(a) - pos(b));
    plan.updatedAt = W.now(); W.savePlan(note.id); S.ui.ilOpen = it.id;
    W.Desk.setTab("illus");
    if (W.AI.ready) fillOne(it.id, sel.quote);
  };
  async function fillOne(id, passage) {
    const note = W.note(), plan = planOf(note.id), it = plan.images.find((x) => x.id === id); if (!it) return;
    const C = S.config.img;
    const prompt = `${W.context(note, { noRules: true })}
【任务】只给下面这一段配一张正文讲解图。一个固定的卡通“我”（作者的品牌形象）亲自演出这一段在讲的东西：人物必须参与内容，遮住人物图就讲不明白才合格。
图上标题不超过 ${C.titleMax} 字，标签不超过 ${C.labelMax} 字且贴在物体上，气泡不超过 ${C.bubbleMax} 字；只从原文提炼，不新增事实。按心智距离，比喻物用大众熟悉的东西。
可用演绎方式 pattern：${K.patterns.map((x) => x.id + "=" + x.fit).join("；")}
可用表情（英文）：${EXPR.join(", ")}
【这一段】
${passage}
只输出 JSON：{"purpose":"读者看完要明白什么","pattern":"id 或空","scene":"他在对什么做什么：动作 + 被讲解的物体 + 情绪 + 文字贴在哪（中文，具体）","expression":"英文表情","text":{"title":"","tag":"","labels":[],"bubble":""}}`;
    (X._fill ||= new Set()).add(id); X.render();
    try {
      const r = await W.AI.run(prompt, { json: true, tier: "quick", label: "这一段的配图" });
      Object.assign(it, { purpose: r.purpose || it.purpose, pattern: PAT[r.pattern] ? r.pattern : "", scene: r.scene || "", expression: r.expression || "", text: { title: r.text?.title || "", tag: r.text?.tag || "", labels: r.text?.labels || [], bubble: r.text?.bubble || "" } });
      W.savePlan(note.id);
    } catch (e) { if (!e?.silent) W.toast(W.AI.msg(e), "bad"); }
    finally { X._fill.delete(id); X.render(); }
  }
  function locate(i) {
    const note = W.note(), it = planOf(note.id).images[i], j = (note.text || "").indexOf(it.anchor || "\u0000");
    if (j < 0) { W.toast("正文里找不到这句话了，改一下“插在哪”"); return; }
    if (S.ui.mode === "preview") { S.ui.mode = "edit"; W.Desk.renderPanes(); }
    W.Editor.select(j, j + it.anchor.length);
  }

  // ---------- 动作 ----------
  async function genPlan() {
    const note = W.note(); if (!note || !(note.text || "").trim()) { W.toast("这篇还没有正文"); return; }
    const plan = ensurePlan(note), p = W.platform(note.platform), C = S.config.img;
    const pats = K.patterns.map((x) => `${x.id}：${x.fit}（${x.scene}）`).join("\n");
    const prompt = `${W.context(note, { noRules: true })}
【任务】给这篇文章写配图计划。系统规则：
- 一个固定的卡通“我”（作者的品牌形象）在每张图里亲自演出这一段在讲的东西：人物必须参与内容，遮住人物图就讲不明白才合格；不能是站在文本框旁边的贴纸。
- 封面必配，回答“这篇讲什么”，人物演出全文核心观点并和标题有接触（扶着、推着、坐在字上、从字后面探出来）。正文每张图只讲一个点。结尾可以放一张金句卡。
- 不配图：纯过渡、一笔带过的感受、已被相邻图讲过的内容、画出来不比文字更快的内容。
- 数量规则（${p.name}）：${p.img.rule}${p.kind === "pic" ? "。这是贴图类：图就是正文，按图文分页来出，每页一个点。" : ""}
- 文字：图上标题不超过 ${C.titleMax} 字，每张图文字不超过 ${C.textBlocks} 段，标签不超过 ${C.labelMax} 字且贴在物体上，气泡不超过 ${C.bubbleMax} 字。标题和要点只从原文提炼，不新增原文没有的事实或数字。用 \\n 换行，==词== 表示强调。
- 表情、服装、配件跟着这一段走（踩坑 → 惊慌，揭秘 → 好奇 + 放大镜，商务 → 西装，结论 → 自信）；配件大约每 ${C.accEvery} 张最多 1 张。
- 按【用户心智】：心智距离越低，scene 里的比喻物越要用大众熟悉的东西（锚点库里的猫、风景、外卖、手机……）。
可用演绎方式 pattern（也可以自创，填 ""）：
${pats}
可用表情（英文）：${EXPR.join(", ")}
可用配件 key：${Object.entries(ACC).map(([k, a]) => `${k}=${a.zh}（${a.when}）`).join("；")}
可选风格 id：${K.styles.map((s) => `${s.id}=${s.name}`).join("，")}
【正文】
<<<
${note.text}
>>>
只输出 JSON：{"style":"最合适的风格 id","why":"一句话理由","images":[{"id":"cover / s1 / s2 … / end","slot":"cover|inline|ending","anchor":"插在哪（原文的小标题或段落开头，一字不差）","purpose":"读者看完要明白什么","pattern":"演绎方式 id 或空","scene":"他在对什么做什么：动作 + 被讲解的物体 + 情绪 + 文字贴在哪（中文，具体）","expression":"英文表情","outfit":"需要换装才写，英文","accessories":["配件 key"],"text":{"title":"","tag":"","labels":[],"bubble":""}}]}`;
    const btn = root.querySelector('[data-il="plan"]'); if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>AI 在读全文、排配图…`; }
    try {
      const r = await W.AI.run(prompt, { json: true, tier: "score", label: "配图计划" });
      if (plan.images.length) await W.Desk.snapshot(note, "重新生成配图计划前");
      plan.images = (r.images || []).map((x, k) => ({ id: x.id || "s" + k, slot: ["cover", "inline", "ending"].includes(x.slot) ? x.slot : "inline", anchor: x.anchor || "", purpose: x.purpose || "", pattern: PAT[x.pattern] ? x.pattern : "",
        scene: x.scene || "", expression: x.expression || "", outfit: x.outfit || "", accessories: (x.accessories || []).filter((a) => ACC[a]), text: { title: x.text?.title || "", tag: x.text?.tag || "", labels: x.text?.labels || [], bubble: x.text?.bubble || "" }, sizes: sizesFor(x.slot, p) }));
      if (STY[r.style]) plan.style = r.style;
      plan.why = r.why || ""; plan.updatedAt = W.now(); W.savePlan(note.id); W.Desk.renderFlow?.();
      W.toast(`排好了 ${plan.images.length} 张${r.why ? "：" + r.why : ""}`);
    } catch (e) { if (!e?.silent) W.toast(W.AI.msg(e), "bad"); }
    X.render();
  }
  async function check(i) {
    const note = W.note(), plan = planOf(note.id), it = plan.images[i];
    let blob = files[it.image?.id];
    if (!blob) { try { blob = await (await fetch(it.image.url)).blob(); } catch { W.toast("取不到这张图，重新上传一次", "bad"); return; } }
    const [c, ss] = Object.entries(groups(it))[0];
    const { expected } = X.prompt(it, c, ss, plan);
    const prompt = `你在检查一张品牌配图是否合格。附件是 ChatGPT 画好的图。
人物身份锁：${W.identityLock()}
一致性清单：${K.character.checklist || "对照参考图逐项核对脸型、发型、五官、配饰、头身比和画风"}。
这张图要讲清楚：${it.purpose}
人物应该在做：${it.scene}
图上应该一字不差地出现这些文字：${expected.map((x) => "「" + x + "」").join(" ") || "（无文字）"}
平台安全区：${ss.map((s) => PRE[s]?.safe).filter(Boolean).join("；")}
逐项检查：人物像不像、人物是否在“演”内容（遮住人物图还能不能讲明白）、文字是否全对（逐字核对，标出错字漏字）、是否讲清了 purpose、关键信息是否在安全区里、有没有 logo 水印。
只输出 JSON：{"verdict":"pass|fix|redo","summary":"一句话结论","items":[{"name":"检查项","ok":true/false,"note":"问题"}],"editPrompt":"如果是 fix：写一段英文修改提示词，开头是 Please EDIT the attached image.，只改有问题的地方，其他一律保持不变；pass 或 redo 时留空"}`;
    W.toast("Claude 在看图…");
    try {
      const r = await W.AI.run(prompt, { json: true, tier: "score", images: [blob], label: "配图自检" });
      it.check = r; W.savePlan(note.id); X.render();
    } catch (e) { if (!e?.silent) W.toast(W.AI.msg(e), "bad"); }
  }
  async function upload(i, file) {
    const note = W.note(), plan = planOf(note.id), it = plan.images[i];
    const use = window.claude?.use; let assets = null;
    if (use) { try { assets = await use("assets"); } catch {} }
    if (window.desk) { // Mac App：存进写作库的 attachments/
      try { const r = await window.desk.vault.attach(file.name || "image.png", new Uint8Array(await file.arrayBuffer())); it.image = { id: r.id, url: r.url, at: W.now() }; files[r.id] = file; }
      catch (e) { W.toast("没存进写作库：" + (e?.message || e), "bad"); return; }
    } else if (assets) {
      try { const r = await assets.upload(file); it.image = { id: r.id, url: r.url, at: W.now() }; files[r.id] = file; }
      catch (e) { W.toast("上传失败：" + (e?.message || e?.code || ""), "bad"); return; }
    } else {
      const id = W.uid("local"); it.image = { id, url: URL.createObjectURL(file), local: true, at: W.now() }; files[id] = file;
      W.toast("没连上云端素材库：这张图只在这次打开时可见");
    }
    it.check = null; W.savePlan(note.id); X.render();
  }
  // Mac App：用 OpenAI 兼容服务的生图接口直接画（带人物参考图），画好存进写作库，再让 Claude 检查
  async function generate(i) {
    const note = W.note(), plan = planOf(note.id), it = plan.images[i];
    (X._gen ||= new Set()).add(i); X.render();
    const [c, ss] = Object.entries(groups(it))[0];
    const { prompt, refs } = X.prompt(it, c, ss, plan);
    try {
      const r = await window.desk.ai.image({ prompt, refs, size: CANVAS[c].join("x"), name: `${W.Desk.titleOf(note)}-${it.id}` });
      it.image = { id: r.id, url: r.url, at: W.now() }; it.check = null; W.savePlan(note.id);
      W.toast(`「${it.id}」画好了，存在写作库的 attachments 里`);
    } catch (e) { W.toast(W.AI.msg(e) + (e?.message && !["no_key"].includes(e.code) ? "：" + e.message : ""), "bad"); if (e?.code === "no_key" || e?.code === "auth") W.Panels.aiSettings(); }
    finally { X._gen.delete(i); X.render(); }
  }
  function refsModal(i) {
    const note = W.note(), plan = planOf(note.id), it = plan.images[i];
    const [c, ss] = Object.entries(groups(it))[0];
    const { refs } = X.prompt(it, c, ss, plan);
    const extra = ["pose-sheet-a", "pose-sheet-b", "outfit-sheet", "original"].filter((r) => !refs.includes(r));
    const card = (r, need) => `<figure class="ref ${need ? "need" : ""}"><img src="img/char/${r}.jpg" alt="${esc(REF_NAME[r])}" loading="lazy"><figcaption>${esc(REF_NAME[r])}${need ? `<span class="pill good">这张要用</span>` : ""}<button type="button" class="btn sm" data-m="keep" data-ref="${r}">${I("down", 14)}下载</button></figcaption></figure>`;
    U.modal({ title: "参考图：和提示词一起发给 ChatGPT", wide: true,
      body: `<p class="hint">ChatGPT 靠这些图记住人物长相。标着“这张要用”的必须附上；其它按需。</p><div class="refs">${refs.map((r) => card(r, true)).join("")}${extra.map((r) => card(r, false)).join("")}</div>`,
      actions: [{ label: "关闭", act: "close" }],
      onOpen: (root) => root.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-ref]"); if (!b) return;
        try { const blob = await (await fetch(`img/char/${b.dataset.ref}.jpg`)).blob(); W.download(`${REF_NAME[b.dataset.ref]}.jpg`, blob, "image/jpeg"); } catch { W.toast("下载失败", "bad"); }
      }) });
  }
  function exportPlan() {
    const note = W.note(), plan = planOf(note?.id); if (!plan?.images.length) { W.toast("还没有配图计划"); return; }
    const p = W.platform(note.platform);
    const mk = { xhs: "小红书", wechat: "公众号", wechatpic: "公众号", zhihu: "知乎", xpost: "X", xthread: "X", xarticle: "X", ig: "Instagram", threads: "Instagram" }[p.id] || p.name;
    const out = { article: "article.md", style: plan.style, variant: plan.variant === "chibi" ? "chibi" : undefined, platforms: [mk], output_dir: "out", space: "brand-ip illustrator",
      images: plan.images.map(({ image, check, ...x }) => ({ ...x, text: Object.fromEntries(Object.entries(x.text || {}).filter(([, v]) => v && (!Array.isArray(v) || v.length))) })) };
    W.download("plan.json", JSON.stringify(out, null, 2), "application/json");
    setTimeout(() => W.download("article.md", note.text || "", "text/markdown"), 400);
    W.toast("在 Claude Code 里：node scripts/illustrate.mjs prepare --plan plan.json");
  }
  function markers() {
    const note = W.note(), plan = planOf(note.id); let t = note.text || "", k = 0;
    for (const it of plan.images) {
      if (it.slot === "cover" || t.includes(`[配图：${it.id} `) || t.includes(`[配图：${it.id}]`)) continue;
      const a = (it.anchor || "").trim(); if (!a) continue;
      const i = t.indexOf(a); if (i < 0) continue;
      let end = t.indexOf("\n", i + a.length); if (end < 0) end = t.length;
      t = t.slice(0, end) + `\n\n[配图：${it.id} ${it.purpose}]` + t.slice(end); k++;
    }
    if (!k) { W.toast("没有能对上原文的位置（或者已经写过了）"); return; }
    W.Desk.snapshot(note, "插入配图位置前"); note.text = t; W.saveNote(note, 0); W.Editors.forNote(note.id).forEach((e) => e.load(note)); W.toast(`写进了 ${k} 个配图位置，预览里能看到`);
  }

  X.mount = () => {
    const v = root;
    v.addEventListener("click", (e) => {
      const b = e.target.closest("[data-il]"); if (!b) return;
      const note = W.note(), plan = note && ensurePlan(note), a = b.dataset.il, i = +b.dataset.i;
      if (a === "plan") return genPlan();
      if (a === "export") return exportPlan();
      if (a === "markers") return markers();
      if (a === "styles") { S.ui.ilStyles = !S.ui.ilStyles; v.querySelector(".sg").hidden = !S.ui.ilStyles; b.setAttribute("aria-expanded", S.ui.ilStyles); return; }
      if (a === "style") { plan.style = b.dataset.id; S.config.img.style = b.dataset.id; W.saveConfig(); S.ui.ilStyles = false; }
      if (a === "variant") plan.variant = b.dataset.id;
      if (a === "edit") { const id = plan.images[i].id; S.ui.ilOpen = S.ui.ilOpen === id ? null : id; X.render(); return; }
      if (a === "locate") return locate(i);
      if (a === "add") { const sl = plan.images.length ? "inline" : "cover"; let k = plan.images.length + 1; while (plan.images.some((x) => x.id === "s" + k)) k++;
        const id = sl === "cover" ? "cover" : "s" + k; plan.images.push({ id, slot: sl, anchor: "", purpose: "", pattern: "", scene: "", expression: "", outfit: "", accessories: [], text: { title: "", labels: [], bubble: "", tag: "" }, sizes: sizesFor(sl, W.platform(note.platform)) }); S.ui.ilOpen = id; }
      if (a === "del") plan.images.splice(i, 1);
      if (a === "acc") { const it = plan.images[i]; it.accessories ||= []; const k = it.accessories.indexOf(b.dataset.id); k >= 0 ? it.accessories.splice(k, 1) : it.accessories.push(b.dataset.id); }
      if (a === "size") { const it = plan.images[i]; it.sizes ||= []; const k = it.sizes.indexOf(b.dataset.id); k >= 0 ? (it.sizes.length > 1 && it.sizes.splice(k, 1)) : it.sizes.push(b.dataset.id); }
      if (a === "copy") { const it = plan.images[i]; const ps = Object.entries(groups(it)).map(([c, ss]) => X.prompt(it, c, ss, plan)); W.copy(ps.map((x) => x.prompt).join("\n\n———— 另一个画布比例 ————\n\n")); return; }
      if (a === "copy-edit") { W.copy(plan.images[i].check?.editPrompt || ""); return; }
      if (a === "refs") return refsModal(i);
      if (a === "check") return check(i);
      if (a === "gen") return generate(i);
      if (a === "rev") { const note2 = v.querySelector(`[data-rev="${i}"]`).value.trim(); if (!note2) { W.toast("先写要改哪里"); return; } W.copy(`Please EDIT the attached image.\n\nChange ONLY this: ${note2}\n\nKeep everything else exactly the same: the character's face, hair, glasses and proportions (identical to the reference sheets), the layout, the colors, and every other piece of text character by character. Same aspect ratio.`); return; }
      plan.updatedAt = W.now(); W.savePlan(note.id); X.render(); W.Desk.renderFlow?.();
    });
    v.addEventListener("input", W.debounce((e) => {
      const t = e.target; if (t.dataset.it == null || t.tagName === "SELECT") return;
      const note = W.note(), plan = ensurePlan(note), it = plan.images[+t.dataset.it], k = t.dataset.k;
      if (k.startsWith("text.")) { const f = k.slice(5); it.text ||= {}; if (f === "labels") it.text.labels = t.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean); else if (f === "title") it.text.title = t.value.replace(/\\n/g, "\n"); else it.text[f] = t.value; }
      else it[k] = t.value;
      if (k === "id") S.ui.ilOpen = t.value;
      plan.updatedAt = W.now(); W.savePlan(note.id);
      // 只更新提示词、提醒和卡片上的摘要，不重画输入框（保留光标）
      const card = t.closest(".il-card"), fresh = document.createElement("div"); fresh.innerHTML = itemCard(it, +t.dataset.it, plan, note);
      card.querySelectorAll("details.prompt pre").forEach((pre, k2) => { const np = fresh.querySelectorAll("details.prompt pre")[k2]; if (np) pre.textContent = np.textContent; });
      for (const sel of [".il-purpose", ".il-scene"]) { const o = card.querySelector(sel), nn = fresh.querySelector(sel); if (o && nn) o.replaceWith(nn); }
      const ow = card.querySelector(".warn-list"), nw = fresh.querySelector(".warn-list");
      if (ow && nw) ow.innerHTML = nw.innerHTML; else if (ow && !nw) ow.remove(); else if (!ow && nw) card.querySelector(".il-row1").after(nw);
    }, 250));
    v.addEventListener("change", (e) => {
      const t = e.target, note = W.note();
      if (t.dataset.ilUp != null && t.files[0]) return upload(+t.dataset.ilUp, t.files[0]);
      if (t.dataset.ilAddsize != null && t.value) { const plan = ensurePlan(note); plan.images[+t.dataset.ilAddsize].sizes.push(t.value); W.savePlan(note.id); X.render(); return; }
      if (t.tagName === "SELECT" && t.dataset.it != null) { const plan = ensurePlan(note), it = plan.images[+t.dataset.it]; it[t.dataset.k] = t.value; if (t.dataset.k === "slot") it.sizes = sizesFor(t.value, W.platform(note.platform)); W.savePlan(note.id); X.render(); }
    });
    // 悬停在风格上时预加载缩略图
    v.addEventListener("pointerover", (e) => { if (e.target.closest('[data-il="styles"]') && !X._pre) { X._pre = true; K.styles.forEach((x) => { const im = new Image(); im.src = `img/styles/${x.id}.jpg`; }); } });
    const dl = document.createElement("datalist"); dl.id = "expr-list"; dl.innerHTML = EXPR.map((x) => `<option value="${x}">`).join(""); document.body.append(dl);
  };
  return X;
})();
