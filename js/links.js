/* 双链：[[笔记名]]、[[笔记名|显示文字]]、[[笔记名#小标题]]。和 Obsidian 一样按笔记名（文件名）找笔记，
   反向链接、未链接的提及、改名时自动更新别处的链接，都在这里。 */
W.Links = (() => {
  const S = W.S;
  const L = {};
  const RE = /\[\[([^\[\]\n|#]+)(#[^\[\]\n|]*)?(\|[^\[\]\n]*)?\]\]/g;
  const norm = (s) => String(s || "").trim().toLowerCase();
  // 没写标题时用正文第一行：只扫到第一行有字为止，不切整篇
  const firstLine = (t) => { t = t || ""; for (let i = 0; i < t.length;) { let e = t.indexOf("\n", i); if (e < 0) e = t.length; const l = t.slice(i, e).trim(); if (l) return l.replace(/^#+\s*/, "").slice(0, 40); i = e + 1; } return ""; };
  L.titleOf = (n) => n.title?.trim() || firstLine(n.text) || "无标题";

  // 解析结果按笔记缓存，正文没变就不重新跑正则
  const parsed = new WeakMap();
  const parseRaw = (text) => {
    const out = [];
    for (const m of String(text || "").matchAll(RE)) out.push({ start: m.index, end: m.index + m[0].length, target: m[1].trim(), heading: (m[2] || "").slice(1), alias: (m[3] || "").slice(1) });
    return out;
  };
  L.parse = (text) => parseRaw(text);
  const linksOf = (n) => { const c = parsed.get(n); if (c && c.text === n.text) return c.links; const links = parseRaw(n.text); parsed.set(n, { text: n.text, links }); return links; };
  // 名字 → 笔记的索引：同一次操作里共用，下一轮事件就作废（笔记改名、新建、删除都不用手动通知）
  let idx = null;
  const index = () => {
    if (idx) return idx;
    const full = new Map(), name = new Map();
    for (const n of S.notes) { const t = L.titleOf(n), k = norm(t), f = norm((n.folder ? n.folder + "/" : "") + t); if (!full.has(f)) full.set(f, n); if (!name.has(k)) name.set(k, n); }
    idx = { full, name }; queueMicrotask(() => { idx = null; });
    return idx;
  };
  // 先按完整路径（文件夹/名字），再按名字
  L.resolve = (target) => {
    const t = norm(target).replace(/\.md$/, "");
    if (!t) return null;
    const x = index(); return x.full.get(t) || x.name.get(t) || null;
  };
  L.outgoing = (note) => {
    const seen = new Map();
    for (const l of note ? linksOf(note) : []) { const k = norm(l.target); if (!seen.has(k)) seen.set(k, { target: l.target, note: L.resolve(l.target), count: 0 }); seen.get(k).count++; }
    return [...seen.values()];
  };
  // 反向链接：哪些笔记链到了这篇，连同那一行上下文
  L.backlinks = (note) => {
    if (!note) return [];
    const out = [];
    for (const n of S.notes) {
      if (n.id === note.id) continue;
      const hits = linksOf(n).filter((l) => L.resolve(l.target)?.id === note.id);
      if (hits.length) out.push({ note: n, lines: hits.map((h) => lineAt(n.text, h.start)) });
    }
    return out;
  };
  // 未链接的提及：正文里出现了这篇的名字，但没加 [[ ]]
  L.mentions = (note) => {
    const title = L.titleOf(note); if (!note || title.length < 2 || title === "无标题") return [];
    const out = [];
    for (const n of S.notes) {
      if (n.id === note.id || !n.text) continue;
      let i = n.text.indexOf(title); if (i < 0) continue;
      const links = linksOf(n); i = -1; const pos = [];
      while ((i = n.text.indexOf(title, i + 1)) !== -1) if (!links.some((l) => l.start <= i && l.end >= i + title.length)) pos.push(i);
      if (pos.length) out.push({ note: n, pos, lines: pos.slice(0, 3).map((p) => lineAt(n.text, p)) });
    }
    return out;
  };
  const lineAt = (text, at) => { const s = text.lastIndexOf("\n", at - 1) + 1, e = text.indexOf("\n", at); return text.slice(s, e < 0 ? undefined : e).trim().slice(0, 160); };

  // 补全用：按名字匹配，最近改过的排前面
  L.search = (q, exceptId) => {
    const k = norm(q);
    return S.notes.filter((n) => n.id !== exceptId).map((n) => ({ n, s: L.score(L.titleOf(n), k) })).filter((x) => x.s > 0 || !k)
      .sort((a, b) => b.s - a.s || (b.n.updatedAt > a.n.updatedAt ? 1 : -1)).map((x) => ({ id: x.n.id, title: L.titleOf(x.n), folder: x.n.folder }));
  };
  // 模糊匹配打分：连续命中、开头命中分高；中文按字逐个匹配
  L.score = (text, q) => {
    const t = norm(text); if (!q) return 1;
    if (t === q) return 1000; if (t.startsWith(q)) return 500 + q.length; const i = t.indexOf(q); if (i >= 0) return 300 - i;
    let ti = 0, sc = 0, run = 0;
    for (const ch of q) { const j = t.indexOf(ch, ti); if (j < 0) return 0; run = j === ti ? run + 1 : 0; sc += 5 + run * 3; ti = j + 1; }
    return sc;
  };

  // 点开一个链接：有就打开，没有就新建一篇同名笔记（Obsidian 的做法）
  L.follow = (target, o = {}) => {
    const n = L.resolve(target);
    if (W.S.ui.view !== "desk") W.App.go("desk");
    if (n) return W.Desk.open(n.id, { newTab: o.newTab, pane: o.split ? W.Desk.otherPane() : undefined });
    const parts = target.split("/"), title = parts.pop().trim();
    W.Desk.create({ title, folder: parts.join("/") || W.Desk.currentFolder(), status: "idea" }, { newTab: o.newTab, pane: o.split ? W.Desk.otherPane() : undefined });
    W.toast(`新建了「${title}」`);
  };

  // 改名后，把别的笔记里指向旧名字的链接改成新名字
  L.renameRefs = (oldTitle, newTitle, exceptId) => {
    if (!oldTitle || !newTitle || norm(oldTitle) === norm(newTitle)) return 0;
    const esc = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\[\\[(?:[^\\[\\]\\n|#]*/)?${esc}(#[^\\[\\]\\n|]*)?(\\|[^\\[\\]\\n]*)?\\]\\]`, "gi");
    let changed = 0;
    for (const n of S.notes) {
      if (n.id === exceptId || !n.text || !re.test(n.text)) continue;
      re.lastIndex = 0;
      n.text = n.text.replace(re, (_m, h = "", a = "") => `[[${newTitle}${h}${a}]]`);
      W.saveNote(n, 0); changed++;
      for (const e of W.Editors.forNote(n.id)) e.syncFrom(n);
    }
    return changed;
  };
  // 把一处“未链接的提及”变成链接
  L.linkMention = (noteId, title) => {
    const n = W.note(noteId); if (!n) return;
    const links = L.parse(n.text); let i = -1;
    while ((i = n.text.indexOf(title, i + 1)) !== -1) if (!links.some((l) => l.start <= i && l.end >= i + title.length)) break;
    if (i < 0) return;
    n.text = n.text.slice(0, i) + `[[${title}]]` + n.text.slice(i + title.length);
    W.saveNote(n, 0); for (const e of W.Editors.forNote(n.id)) e.syncFrom(n);
  };

  // 图谱用：所有笔记之间的边
  L.graph = () => {
    const edges = [], missing = new Map();
    for (const n of S.notes) for (const o of L.outgoing(n)) {
      if (o.note) { if (o.note.id !== n.id) edges.push([n.id, o.note.id]); }
      else { const k = "?" + norm(o.target); if (!missing.has(k)) missing.set(k, o.target); edges.push([n.id, k]); }
    }
    return { edges, missing };
  };
  return L;
})();
