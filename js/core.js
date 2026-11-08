/* 核心：工具函数、状态、存储（云端数据库 / 本机兜底）、Claude 调用、提示词拼装。 */
window.W = (() => {
  const W = {};
  const D = window.DEF, K = window.SKILL;

  // ---------- 工具 ----------
  W.$ = (s, r = document) => r.querySelector(s);
  W.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  W.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  W.uid = (p = "") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  W.clone = (o) => JSON.parse(JSON.stringify(o));
  W.now = () => new Date().toISOString();
  W.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // 下一帧执行；后台标签页里 rAF 可能不触发，用定时器兜底
  W.raf = (fn) => { let done = false; const run = () => { if (!done) { done = true; fn(); } }; requestAnimationFrame(run); setTimeout(run, 60); };
  W.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  W.words = (t) => (String(t).match(/[一-鿿]|[A-Za-z0-9]+/g) || []).length;
  W.ago = (iso) => {
    if (!iso) return "";
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "刚刚"; if (s < 3600) return Math.floor(s / 60) + " 分钟前";
    if (s < 86400) return Math.floor(s / 3600) + " 小时前"; if (s < 86400 * 7) return Math.floor(s / 86400) + " 天前";
    const d = new Date(iso); return `${d.getMonth() + 1}月${d.getDate()}日`;
  };
  const merge = (base, over) => {
    if (!over || typeof over !== "object" || Array.isArray(over)) return over ?? base;
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const [k, v] of Object.entries(over)) out[k] = v && typeof v === "object" && !Array.isArray(v) && base && typeof base[k] === "object" ? merge(base[k], v) : v;
    return out;
  };
  W.merge = merge;
  const ls = {
    get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  W.ls = ls;

  // ---------- 状态 ----------
  W.S = {
    config: W.clone(D.config), mindset: W.clone(D.mindset), rules: {}, rubric: W.clone(D.rubric),
    platforms: W.clone(D.platforms), genres: W.clone(D.genres), folders: [...D.folders],
    souls: [], nature: [], memory: [], notes: [], plans: {}, topics: [],
    ui: { view: "desk", noteId: null, tab: "write", folder: "all", status: "all", q: "" },
  };
  const S = W.S;
  W.rule = (k) => S.rules[k] ?? D.rules[k]?.text ?? "";
  W.platform = (id) => S.platforms.find((p) => p.id === (id || S.config.platform)) || S.platforms[0];
  W.genre = (id) => S.genres.find((g) => g.id === (id || S.config.genre)) || S.genres[0];
  W.soul = (id) => S.souls.find((s) => s.id === (id || S.config.activeSoul)) || S.souls[0] || null;
  W.note = (id) => S.notes.find((n) => n.id === (id || S.ui.noteId)) || null;
  W.idAtLevel = (v) => S.mindset.bands.find((b) => v < b.max) || S.mindset.bands.at(-1);
  W.identityLock = () => S.config.img.identity || K.character.identity_lock;

  // 事件
  const subs = {};
  W.on = (ev, fn) => (subs[ev] ||= []).push(fn);
  W.emit = (ev, ...a) => (subs[ev] || []).forEach((fn) => { try { fn(...a); } catch (e) { console.error(e); } });

  // ---------- 存储 ----------
  // 云端：claude.use("db")；不可用时退回本机 localStorage（只在这台浏览器里）。
  const P = (W.P = { mode: "local", db: null, queue: {}, busy: {}, timers: {} });
  const CFG_DOCS = ["main", "mindset", "rules", "rubric", "platforms", "genres", "folders", "topics"];
  const COLS = ["souls", "nature", "memory", "notes"];
  const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);

  // Mac App：window.desk 存在时，数据就是写作库文件夹里的 .md 文件（见 desktop/vault.js）
  const V = window.desk?.vault;
  P.init = async () => {
    const use = window.claude?.use;
    if (V) P.mode = "vault";
    else if (use) {
      try { P.db = await withTimeout(use("db"), 12000); } catch { P.db = null; }
    }
    if (!V) P.mode = P.db ? "cloud" : "local";
    await P.loadAll();
    W.emit("storage", P.mode);
  };

  P.loadAll = async () => {
    const cfg = {}, cols = {};
    if (V) {
      const r = await V.load();
      S.vault = await V.info();
      Object.assign(cfg, r.cfg); Object.assign(S.plans, r.plans);
      cols.souls = r.souls; cols.nature = r.nature; cols.memory = r.memory; cols.notes = r.notes;
      cfg.folders = { list: r.folders };
    } else if (P.db) {
      try {
        const [cs, ...lists] = await Promise.all([P.db.collection("config").get(), ...COLS.map((c) => P.db.collection(c).get())]);
        for (const d of cs.docs) cfg[d.id] = d.data();
        COLS.forEach((c, i) => (cols[c] = lists[i].docs.map((d) => ({ ...d.data(), id: d.id }))));
        const ps = await P.db.collection("plans").get();
        for (const d of ps.docs) S.plans[d.id] = d.data();
      } catch (e) {
        console.warn("db load failed, falling back to local", e);
        P.db = null; P.mode = "local";
      }
    }
    if (!P.db && !V) {
      for (const k of CFG_DOCS) { const v = ls.get("wbd:config/" + k); if (v) cfg[k] = v; }
      for (const c of COLS) cols[c] = Object.values(ls.get("wbd:col:" + c) || {});
      Object.assign(S.plans, ls.get("wbd:col:plans") || {});
    }
    if (cfg.main) S.config = merge(W.clone(D.config), cfg.main);
    if (cfg.mindset) S.mindset = merge(W.clone(D.mindset), cfg.mindset);
    if (cfg.rules) S.rules = cfg.rules;
    if (cfg.rubric?.list) S.rubric = cfg.rubric.list;
    if (cfg.platforms?.list) S.platforms = cfg.platforms.list;
    if (cfg.genres?.list) S.genres = cfg.genres.list;
    if (cfg.folders?.list) S.folders = cfg.folders.list;
    if (cfg.topics?.list) S.topics = cfg.topics.list;
    S.souls = cols.souls || []; S.nature = (cols.nature || []).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    S.memory = cols.memory || []; S.notes = cols.notes || [];
  };

  // 写入：同一个文档一次只写一个，连续修改合并成一次（防抖）。
  P.put = (col, id, data, delay = 700) => {
    const key = col + "/" + id;
    P.queue[key] = { col, id, data: W.clone(data) };
    clearTimeout(P.timers[key]);
    W.emit("saving", true);
    P.timers[key] = setTimeout(() => P.flush(key), delay);
  };
  P.flush = async (key) => {
    if (P.busy[key]) return;
    const job = P.queue[key]; if (!job) return;
    delete P.queue[key]; P.busy[key] = true;
    try {
      if (V) {
        if (job.col === "config" && job.id === "folders") { /* 写作库里文件夹就是真的文件夹 */ }
        else {
          const r = await V.save(job.col, job.id, job.data);
          if (job.col === "notes" && r) W.emit("note:saved", job.id, r); // 文件名重名时会自动加编号
        }
      } else if (P.db) await P.db.doc(key).set(job.data);
      else if (job.col === "config") ls.set("wbd:config/" + job.id, job.data);
      else { const all = ls.get("wbd:col:" + job.col) || {}; all[job.id] = job.data; ls.set("wbd:col:" + job.col, all); }
    } catch (e) {
      console.error("save failed", key, e);
      W.toast(e?.code === "quota_exceeded" ? "存储空间满了：删掉一些旧版本或笔记再试" : "保存失败，稍后会再试一次", "bad");
      P.queue[key] ||= job; setTimeout(() => P.flush(key), 4000);
    } finally {
      P.busy[key] = false;
      if (P.queue[key]) P.flush(key);
      else if (!Object.keys(P.queue).length && !Object.values(P.busy).some(Boolean)) W.emit("saving", false);
    }
  };
  P.flushAll = () => Object.keys(P.queue).forEach((k) => { clearTimeout(P.timers[k]); P.flush(k); });
  P.del = async (col, id) => {
    const key = col + "/" + id; delete P.queue[key]; clearTimeout(P.timers[key]);
    try {
      if (V) await V.remove(col, id);
      else if (P.db) await P.db.doc(key).delete();
      else { const all = ls.get("wbd:col:" + col) || {}; delete all[id]; ls.set("wbd:col:" + col, all); }
    } catch (e) { console.error(e); W.toast("删除失败", "bad"); }
  };
  // 版本：放在 notes/<id>/versions 子集合，打开"版本"页才读。
  P.versions = async (noteId) => {
    if (V) return V.versions(noteId);
    if (P.db) {
      const snap = await P.db.doc("notes/" + noteId).collection("versions").get();
      return snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => (b.at > a.at ? 1 : -1));
    }
    return (ls.get("wbd:ver:" + noteId) || []).sort((a, b) => (b.at > a.at ? 1 : -1));
  };
  P.addVersion = async (noteId, v) => {
    const id = W.uid("v");
    const body = { ...v, at: W.now() };
    try {
      if (V) await V.addVersion(noteId, v);
      else if (P.db) await P.db.doc("notes/" + noteId).collection("versions").doc(id).set(body);
      else { const list = ls.get("wbd:ver:" + noteId) || []; list.push({ ...body, id }); ls.set("wbd:ver:" + noteId, list.slice(-30)); }
    } catch (e) { console.error(e); }
  };
  P.delVersion = async (noteId, vid) => {
    if (V) return V.delVersion(noteId, vid);
    if (P.db) await P.db.doc("notes/" + noteId + "/versions/" + vid).delete();
    else ls.set("wbd:ver:" + noteId, (ls.get("wbd:ver:" + noteId) || []).filter((v) => v.id !== vid));
  };

  // 保存快捷方式
  W.saveConfig = () => P.put("config", "main", S.config);
  W.saveMindset = () => P.put("config", "mindset", S.mindset);
  W.saveRules = () => P.put("config", "rules", S.rules);
  W.saveList = (name) => P.put("config", name, { list: S[name] });
  W.saveSoul = (s) => P.put("souls", s.id, s);
  W.saveNature = (n) => P.put("nature", n.id, n);
  W.saveMemory = (m) => P.put("memory", m.id, m);
  W.saveNote = (n, delay) => { n.updatedAt = W.now(); P.put("notes", n.id, n, delay ?? 900); };
  W.savePlan = (id) => P.put("plans", id, S.plans[id]);
  // 文件夹：写作库里是真的文件夹；网页版只是一个名字列表（"文章/AI" 这样用斜杠表示层级）
  P.mkdir = async (rel) => { if (V) await V.mkdir(rel); if (!S.folders.includes(rel)) { S.folders.push(rel); W.saveList("folders"); } };
  P.renameFolder = async (from, to) => {
    if (V) await V.renameFolder(from, to);
    const mv = (p) => (p === from || p.startsWith(from + "/") ? to + p.slice(from.length) : p);
    S.folders = [...new Set(S.folders.map(mv))];
    for (const n of S.notes) { const f = mv(n.folder || ""); if (f !== n.folder) { n.folder = f; if (!V) W.saveNote(n, 0); } }
    W.saveList("folders");
  };
  P.deleteFolder = async (rel) => {
    const inside = (p) => p === rel || p.startsWith(rel + "/");
    if (V) await V.deleteFolder(rel);
    else for (const n of S.notes.filter((x) => inside(x.folder || ""))) await P.del("notes", n.id);
    S.notes = S.notes.filter((n) => !inside(n.folder || ""));
    S.folders = S.folders.filter((p) => !inside(p)); W.saveList("folders");
  };

  // ---------- Claude ----------
  const AI = (W.AI = { fn: null, ready: false, desk: !!window.desk });
  // Mac App 里走 API key（Claude 或 OpenAI 兼容），接口和 claude.ai 的 sample 一样：(input, {onText, signal, images, modelTier})
  const deskSample = async (input, o = {}) => {
    const id = W.uid("r");
    const images = o.images ? await Promise.all([].concat(o.images).map(async (b) => {
      const buf = new Uint8Array(await b.arrayBuffer()); let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { mime: b.type || "image/png", data: btoa(s) };
    })) : [];
    const onAbort = () => window.desk.ai.abort(id);
    if (o.signal) { if (o.signal.aborted) throw { code: "cancelled" }; o.signal.addEventListener("abort", onAbort); }
    try {
      const r = await window.desk.ai.sample({ id, input, tier: o.modelTier || "default", images, ...(o.search ? { search: o.search } : {}), ...(o.json ? { json: true } : {}) }, (text) => o.onText?.({ text, delta: "" }));
      // 服务商偶尔把一个字拆坏后再发过来（显示成 �），这种字找不回来：提醒一下，免得悄悄存进笔记
      const bad = (r?.text?.match(/\ufffd/g) || []).length;
      if (bad) W.toast(`AI 服务返回的文字里有 ${bad} 处乱码（�），是服务商那边拆坏的；可以重试一次`, "bad");
      return r;
    } finally { o.signal?.removeEventListener("abort", onAbort); }
  };
  deskSample.json = async (input, o = {}) => {
    const r = await deskSample(typeof input === "string" ? input + "\n\n（只输出 JSON 本身，不要任何解释，不要 Markdown 代码块以外的文字。）" : input, { ...o, json: true });
    const t = r.text.trim(), fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    for (const cand of [t, fence?.[1], (() => { const a = t.search(/[{[]/), b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]")); return a >= 0 && b > a ? t.slice(a, b + 1) : null; })()]) {
      if (!cand) continue; try { const out = JSON.parse(cand); if (out && typeof out === "object" && r.sources) out._sources = r.sources; return out; } catch {}
    }
    throw { code: "invalid_json", text: r.text };
  };
  AI.init = async () => {
    if (window.desk) { AI.fn = deskSample; AI.settings = await window.desk.ai.settings().catch(() => null); }
    else {
      const use = window.claude?.use;
      if (use) { try { AI.fn = await withTimeout(use("sample"), 12000); } catch { AI.fn = null; } }
    }
    AI.ready = !!AI.fn;
    W.emit("ai", AI.ready);
  };
  // 状态栏用：当前写作用的是哪家、填没填 key
  // 状态栏用作者的话：能不能用。真的调通过一次才说“AI 可用”；细节（哪家、key）放在 AI.detail 里做提示
  AI.label = () => {
    if (!AI.desk) return AI.ready ? "AI 可用" : "AI 未连接";
    if (!AI.settings) return "AI 未设置";
    return AI.hasKey() ? (AI.okAt ? "AI 可用" : "模型已配置") : "AI 未配置";
  };
  AI.detail = () => {
    if (!AI.desk) return AI.ready ? "通过 claude.ai 使用 Claude" : "在 claude.ai 里打开本页才能用 AI；现在点 AI 按钮会给你完整提示词";
    const s = AI.settings; if (!s) return "点一下设置 AI 服务";
    const p = s.provider === "openai" ? "OpenAI 兼容接口" : "Claude";
    return `${p} · ${AI.hasKey() ? "已填 API key" : "还没填 API key"}${AI.okAt ? " · 刚刚调用成功" : AI.hasKey() ? " · 还没实际调用过" : ""}。点一下修改`;
  };
  // 能不能联网：Mac App 里的 Claude 都能；OpenAI 兼容接口只有 DeepSeek、Kimi、通义千问能
  AI.searchVia = () => {
    if (!AI.desk || !AI.hasKey()) return "";
    const s = AI.settings; if (s?.provider !== "openai") return "Claude 联网搜索";
    const b = s.openai?.baseURL || "";
    return /deepseek/i.test(b) ? "DeepSeek 联网搜索（deepseek-v4-pro）" : /moonshot|kimi/i.test(b) ? "Kimi 联网搜索" : /dashscope|aliyuncs|qwen/i.test(b) ? "通义千问联网搜索" : "";
  };
  AI.hasKey = () => !AI.desk || !!AI.settings?.hasKey?.[AI.settings.provider === "openai" ? "openaiKey" : "claudeKey"];
  const ERR = {
    not_granted: "你没有允许本页使用 Claude。刷新页面后在弹窗里点允许即可。",
    sampling_disabled: "这个账号现在用不了 Claude。",
    rate_limited: "调用太频繁或额度用完了，过一会儿再试。",
    session_expired: "登录过期了，重新登录 claude.ai 后刷新。",
    prompt_too_large: "这次塞给 Claude 的内容太长了：少选几篇素材，或者分段处理。",
    refused: "Claude 拒绝了这次请求，换个说法再试。",
    empty_completion: "Claude 没有写出内容，简化要求再试。",
    invalid_json: "Claude 返回的格式不对，再点一次试试。",
    image_rejected: "图片格式或大小不行，换一张（JPG / PNG / WebP）。",
    images_unavailable: "这个视图不能把图片发给 Claude。",
    upstream_error: "连接中断了，已保留写出来的部分，可以再试一次。",
    no_search: "现在的 AI 接口不能联网搜索：换成 Claude，或者 DeepSeek / Kimi / 通义千问的接口。",
    no_key: "还没有填 API key：在“设置 › AI 服务”里填上就能用。",
    auth: "API key 不对或已失效，去“设置 › AI 服务”换一个。",
    bad_model: "模型名不对，去“设置 › AI 服务”改一下。",
    network: "连不上 AI 服务：检查网络或代理。",
  };
  AI.msg = (e) => ERR[e?.code] || (e?.code === "cancelled" ? "已停止" : "出错了：" + (e?.message || e?.code || e));
  AI.tier = (k) => S.config["tier" + k[0].toUpperCase() + k.slice(1)] || "default";
  // 统一入口：没有 Claude 时弹出完整提示词，让你复制去别处用。
  AI.run = async (prompt, o = {}) => {
    if (!AI.ready) { W.UI.promptModal(prompt, o.label); throw { code: "unavailable", silent: true }; }
    const opts = { modelTier: AI.tier(o.tier || "quick"), cache: false };
    if (o.onText) opts.onText = o.onText;
    if (o.signal) opts.signal = o.signal;
    if (o.images) opts.images = o.images;
    if (o.search && AI.desk) opts.search = o.search;
    try { const r = await (o.json ? AI.fn.json(prompt, opts) : AI.fn(prompt, opts)); if (!AI.okAt) { AI.okAt = Date.now(); W.emit("ai", true); } return r; }
    catch (e) { if (["no_key", "auth", "bad_model"].includes(e?.code)) W.emit("ai:fix", e); throw e; }
  };

  // ---------- 提示词拼装 ----------
  const band = (v) => (v >= 60 ? "high" : v <= 40 ? "low" : "mid");
  W.mindsetText = (ms = S.mindset, plat = W.platform()) => {
    const b = W.idAtLevel(ms.distance);
    const L = [`心智距离 ${ms.distance}/100（${b.name}）：${b.text}`];
    for (const f of ms.factors) {
      const k = band(f.value);
      L.push(`- ${f.name} ${f.value}/100：${k === "high" ? "偏向「" + f.high + "」" : k === "low" ? "偏向「" + f.low + "」" : "适中，在「" + f.low + "」和「" + f.high + "」之间"}`);
    }
    if (plat) L.push(`- 受众画像（${plat.name}，作者的粗略判断）：女性约 ${plat.audience.female}%，${plat.audience.age} 岁为主；${plat.audience.vibe}`);
    const a = Object.entries(ms.anchors).map(([g, xs]) => `${g}：${xs.join("、")}`).join("；");
    L.push(`可用的大众锚点：${a}`);
    return L.join("\n");
  };
  W.natureFor = (note) => {
    const focus = note?.natureFocus?.length ? note.natureFocus : null;
    let list = S.nature.filter((n) => n.on);
    if (focus) list = list.filter((n) => focus.includes(n.id));
    else list = list.filter((n) => n.weight >= S.config.natureMin).sort((a, b) => b.weight - a.weight).slice(0, S.config.natureTop);
    return list;
  };
  W.natureText = (note) => {
    const list = W.natureFor(note);
    if (!list.length) return "（作者没有指定，按题材自行判断）";
    return list.map((n, i) => `${i + 1}. ${n.name}（${n.tag}，权重 ${n.weight}）\n   哲学阐释：${n.philosophy}\n   在内容里：${n.shows}\n   抓手：${n.lever}\n   红线：${n.redline}`).join("\n");
  };
  // ---------- 神经递质 / 激素、脑区 ----------
  // 定义和默认目标值在 S.config.neuro / brain（人性页可改）；单篇在 note.neuro / note.brain 里只存改过的数值
  W.neuroDefs = () => (S.config.neuro?.length ? S.config.neuro : D.neuro);
  W.brainDefs = () => (S.config.brain?.length ? S.config.brain : D.brain);
  W.levels = (kind, note) => { const own = note?.[kind]; return Object.fromEntries((kind === "neuro" ? W.neuroDefs() : W.brainDefs()).map((d) => [d.id, own?.[d.id] ?? d.level])); };
  const tier = (v) => (v >= 75 ? "很高" : v >= 60 ? "偏高" : v > 35 ? "适中" : v > 20 ? "偏低" : "很低");
  const NEURO_HI = { dopamine: "期待拉满，想一直往下读", oxytocin: "像朋友在说话，愿意信", cortisol: "有危机感，怕错过", serotonin: "读完心里有底", norepinephrine: "第一眼就被抓住" };
  const NEURO_LO = { dopamine: "不吊胃口", oxytocin: "就事论事，保持距离", cortisol: "不制造焦虑", serotonin: "不急着给答案", norepinephrine: "节奏舒缓" };
  // 一句话读出来：高的说效果，很低的说克制；都在中间就是“正常节律”
  W.neuroCaption = (lv) => {
    const defs = W.neuroDefs(), hi = defs.filter((d) => lv[d.id] >= 65).sort((a, b) => lv[b.id] - lv[a.id]), lo = defs.filter((d) => lv[d.id] <= 25);
    const parts = [...hi.map((d) => `<b>${W.esc(d.name)}</b>${tier(lv[d.id])}：${NEURO_HI[d.id] || ""}`), ...lo.map((d) => `${W.esc(d.name)}${tier(lv[d.id])}：${NEURO_LO[d.id] || ""}`)].slice(0, 3);
    let s = parts.length ? parts.join("；") + "。" : "各项都在中间，激素按正常节律走。";
    if (lv.cortisol >= 70 && lv.serotonin <= 40) s += "危机感高、安定感低，结尾记得给出路。";
    return s;
  };
  W.brainCaption = (lv) => {
    const top = [...W.brainDefs()].sort((a, b) => lv[b.id] - lv[a.id]), a = top[0], b = top[1];
    if (!a || lv[a.id] - (lv[top[top.length - 1].id] ?? 0) < 12) return "四层平均用力，没有特别想住进哪里。";
    return `主要住进 <b>${W.esc(a.name)}</b>（${W.esc(a.sub)}），其次是${W.esc(b.name)}：${W.esc(a.how.split("；")[0])}。`;
  };
  W.neuroText = (note) => {
    const lv = W.levels("neuro", note);
    return "数值 0–100，50 是平常状态，是读者读这篇时希望被激起的程度：\n" +
      W.neuroDefs().map((d) => { const v = lv[d.id], t = tier(v); return `- ${d.name} ${v}（${t}）：${d.does}${v >= 60 ? `\n  往上调：${d.raise}` : v <= 25 ? "\n  压低它，别往这个方向写" : ""}\n  红线：${d.redline}`; }).join("\n") +
      `\n整体：${W.neuroCaption(lv).replace(/<\/?b>/g, "")}`;
  };
  W.brainText = (note) => {
    const lv = W.levels("brain", note);
    return "数值 0–100，越高越希望这篇被记在这一层：\n" +
      [...W.brainDefs()].sort((a, b) => lv[b.id] - lv[a.id]).map((d) => `- ${d.name}（${d.sub}）${lv[d.id]}（${tier(lv[d.id])}）：${d.does}\n  写法：${d.how}`).join("\n");
  };

  W.memoryFor = (kind) => S.memory.filter((m) => m.enabled && (m.scope === "all" || m.scope === kind));
  W.memoryText = (kind) => {
    const list = W.memoryFor(kind);
    const avoid = list.filter((m) => m.polarity !== "keep").sort((a, b) => (a.level === "core" ? -1 : 1) - (b.level === "core" ? -1 : 1));
    const keep = list.filter((m) => m.polarity === "keep");
    const fmt = (m) => `- [${m.level === "core" ? "根本性" : "偏好"}] ${m.rule}${m.why ? "（为什么：" + m.why + "）" : ""}${m.bad ? "\n  错：" + m.bad : ""}${m.good ? "\n  对：" + m.good : ""}`;
    return { avoid: avoid.map(fmt).join("\n") || "（暂无）", keep: keep.map(fmt).join("\n") || "（暂无）", count: list.length };
  };
  W.soulText = (s = W.soul()) => {
    if (!s) return "（没有设置灵魂）";
    return [`名字：${s.name}`, `我是谁：${s.identity}`, `怎么称呼读者：\n${s.address}`, `说话的样子：${s.voice}`, `口头禅：${s.sayings}`,
      `会对什么兴奋：${s.excite}`, `会对什么翻白眼：${s.eyeroll}`, `我在乎什么：${s.care}`,
      s.stance ? `我的立场与价值观：${s.stance}` : "", `评论区腔浓度 ${s.comment}/100；情绪浓度 ${s.emotion}/100`,
      `真实经历库（只能使用这里写到的经历，没写的一律标 [需补经历：……]）：${s.experiences?.trim() || "（空：不得声称任何亲身经历）"}`].filter(Boolean).join("\n");
  };
  const openingName = { lede: "引子开头（3–8 段内揭晓核心事实）", punch: "第一行就是全文最反常的事实", cover: "封面一句话 + 正文第一行接住承诺" };
  W.taskText = (note) => {
    const p = W.platform(note?.platform), g = W.genre(note?.genre), k = D.kinds.find((x) => x.id === p.kind);
    return [`形式：${k?.name || ""} · ${p.name}`, `篇幅：${p.len}；标题不超过 ${p.titleMax} 字；开头方式：${openingName[p.opening]}`,
      `评论区腔占比约 ${p.voice}%；emoji 最多 ${p.emoji} 个；每段不超过 ${p.paraMax} 字`, `平台规格：${p.spec}`,
      `体裁：${g.name}；骨架：${g.skeleton}`].join("\n");
  };
  W.paramsText = () => {
    const c = S.config;
    return [`达标线：总分 ≥ ${c.targetScore}，且每个维度 ≥ 该项满分的 ${c.dimMinPct}%`, `自动迭代最多 ${c.maxRounds} 轮；连续两轮提升都小于 ${c.minGain} 分就停`,
      `写完删掉约 ${c.cutPct}%`, `标题一次出 ${c.titleCount} 个、覆盖至少 ${c.titleSkeletons} 种骨架，挑 ${c.titlePick} 个推荐；首屏出 ${c.ledeVersions} 个版本`,
      `选题门槛线：大众度 + 切身性 ≥ ${c.topicBar}（满分 10）`, `AI 味句式每千字不超过 ${c.aiTasteMax} 处；“不是 X 而是 Y”全文最多 ${c.notXbutYMax} 次；同一称呼最多 ${c.addressMax} 次；防御性免责每千字最多 ${c.hedgeMax} 处`,
      `封顶：写不出信息增量总分最多 ${c.capNoGain}；灵魂低于 ${c.soulMin} 分总分最多 ${c.capNoSoul}；扣分合计最多 ${c.deductCap}`].join("\n");
  };
  const RULE_ORDER = ["priority", "topics", "opening", "titles", "style", "aiTaste", "soulCraft", "redlines", "ending"];
  W.rulesText = (keys = RULE_ORDER) => keys.map((k) => `■ ${D.rules[k].title}\n${W.rule(k)}`).join("\n\n");

  W.context = (note, o = {}) => {
    const p = W.platform(note?.platform);
    const mem = W.memoryText(p.kind);
    return [
      "你是作者的写作搭档，按下面这套写作系统工作。数值以【参数】为准；【记忆】是作者亲自纠正过的错误和认可的写法，优先级高于其它规则。所有输出用简体中文。",
      `【这次的载体】\n${W.taskText(note)}`,
      `【灵魂：作者是谁】\n${W.soulText(W.soul(note?.soul))}`,
      `【用户心智：写给谁、往哪写】\n${W.mindsetText(S.mindset, p)}`,
      `【人性抓手：本篇优先调动的欲望】\n${W.natureText(note)}`,
      `【读者的身体：希望激起的神经递质 / 激素】\n${W.neuroText(note)}`,
      `【记忆落点：想住进读者大脑的哪一层】\n${W.brainText(note)}`,
      `【记忆 · 绝不再犯】\n${mem.avoid}`,
      `【记忆 · 保持这些写法】\n${mem.keep}`,
      o.noRules ? "" : `【规则】\n${W.rulesText(o.rules)}`,
      `【参数】\n${W.paramsText()}`,
    ].filter(Boolean).join("\n\n");
  };
  W.rubricText = () => S.rubric.map((r, i) => `${i + 1}. ${r.name}（满分 ${r.max}，key=${r.key}）：${r.q} 档位：${r.c}`).join("\n") + `\n扣分项（合计最多扣 ${S.config.deductCap}）：\n${D.deductions}`;

  // 素材笔记 → 文本
  // 引用的素材笔记，加上正文里 [[链接]] 到的笔记，一起作为素材
  W.materialText = (note) => {
    const ids = new Set(note?.materials || []);
    for (const o of W.Links?.outgoing(note) || []) if (o.note && o.note.id !== note.id) ids.add(o.note.id);
    const ms = [...ids].map((id) => W.note(id)).filter(Boolean).slice(0, 8);
    if (!ms.length) return "";
    return ms.map((m) => `〔素材：${W.Links?.titleOf(m) || m.title || "无标题"}〕\n${(m.text || "").slice(0, 6000)}`).join("\n\n");
  };

  // ---------- 本地检查（不调用 Claude） ----------
  W.lint = (text, note) => {
    const p = W.platform(note?.platform);
    const out = { aiTaste: [], longParas: [], needs: [], address: {}, exclaim: [], notXbutY: 0 };
    const phrases = new Set();
    for (const line of W.rule("aiTaste").split("\n")) for (const m of line.matchAll(/[“"]([^”"]{2,14})[”"]/g)) {
      const s = m[1].replace(/……|…/g, "").trim();
      if (s && !/[XY]/.test(s) && s.length >= 2) phrases.add(s);
    }
    for (const s of phrases) { let i = -1; while ((i = text.indexOf(s, i + 1)) !== -1) out.aiTaste.push({ start: i, end: i + s.length, label: s }); }
    for (const m of text.matchAll(/不是[^。！？\n，,]{1,24}?[，,]\s*(而是|是)/g)) { out.aiTaste.push({ start: m.index, end: m.index + m[0].length, label: "不是…而是…" }); out.notXbutY++; }
    let pos = 0;
    for (const para of text.split("\n")) {
      const len = para.replace(/\s/g, "").length;
      if (len > p.paraMax && !para.startsWith("#")) out.longParas.push({ start: pos, end: pos + para.length, len });
      pos += para.length + 1;
    }
    for (const m of text.matchAll(/\[需补[^\]]*\]/g)) out.needs.push({ start: m.index, end: m.index + m[0].length });
    for (const m of text.matchAll(/[!！]{2,}/g)) out.exclaim.push({ start: m.index, end: m.index + m[0].length });
    const s = W.soul(note?.soul);
    const names = (s?.address || "").split("\n").flatMap((l) => ((l.split(/[:：]/)[1] || "").split(/[，,（(]/)[0] || "").split(/[\/、]/)).map((x) => x.trim()).filter((x) => x && x.length <= 6 && !/不用|称呼/.test(x));
    for (const n of names) { const c = text.split(n).length - 1; if (c) out.address[n] = c; }
    out.words = W.words(text);
    out.aiPerK = out.words ? +(out.aiTaste.length / (out.words / 1000)).toFixed(1) : 0;
    return out;
  };

  // ---------- 小型 Markdown 渲染（预览用） ----------
  W.md = (src, o = {}) => {
    const inl = (s) => W.esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/==(.+?)==/g, "<mark>$1</mark>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[\[([^\[\]\n|#]+)(#[^\[\]\n|]*)?(?:\|([^\[\]\n]*))?\]\]/g, (_m, t, h, a) => `<a class="wikilink${W.Links?.resolve(t) ? "" : " miss"}" href="#" data-link="${t.trim()}">${a || t.trim() + (h || "")}</a>`)
      .replace(/\[(需补[^\]]*)\]/g, '<span class="need">[$1]</span>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|\s)#([\p{L}\p{N}_\-/]+)/gu, '$1<span class="tag">#$2</span>');
    const out = []; let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const raw of String(src).split("\n")) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { close(); continue; }
      if ((m = line.match(/^\[配图[：:]\s*([^\]\s]*)\s*([^\]]*)\]$/))) { close(); out.push(o.figure ? o.figure(m[1], m[2]) : `<figure class="ph">配图：${W.esc(m[1] + " " + m[2])}</figure>`); continue; }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { close(); const n = m[1].length; out.push(`<h${n}>${inl(m[2])}</h${n}>`); continue; }
      if ((m = line.match(/^>\s?(.*)$/))) { close(); out.push(`<blockquote>${inl(m[1])}</blockquote>`); continue; }
      if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inl(m[1])}</li>`); continue; }
      if ((m = line.match(/^\s*\d+[.、]\s+(.*)$/))) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inl(m[1])}</li>`); continue; }
      close(); out.push(`<p>${inl(line)}</p>`);
    }
    close();
    return out.join("\n");
  };

  // 下载（viewer 里只能走 downloads 能力）
  W.download = async (filename, data, type = "text/plain") => {
    if (window.desk) {
      try {
        const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
        const r = await window.desk.saveFile(filename, bytes);
        if (r.saved) W.toast("已保存到 " + r.path);
        return r.saved;
      } catch (e) { W.toast("没有保存：" + (e?.message || e), "bad"); return false; }
    }
    const use = window.claude?.use;
    const dl = use ? await withTimeout(use("downloads"), 8000).catch(() => null) : null;
    if (dl) {
      try { await dl.save({ filename, data: data instanceof Blob ? data : new Blob([data], { type: type + ";charset=utf-8" }) }); return true; }
      catch (e) { if (e?.code !== "cancelled" && e?.code !== "declined") W.toast("没有保存：" + (e?.message || e?.code), "bad"); return false; }
    }
    try {
      const a = document.createElement("a"); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
      a.download = filename; document.body.append(a); a.click(); a.remove();
      return true;
    } catch { W.toast("这里不能直接下载，请复制内容", "bad"); return false; }
  };
  W.copy = async (text, btn) => {
    try { await navigator.clipboard.writeText(text); W.toast("已复制"); return true; }
    catch { W.UI.promptModal(text, "复制下面的内容"); return false; }
  };

  // toast（UI 模块里会覆盖成带样式的版本）
  W.toast = (m) => console.log(m);
  return W;
})();
