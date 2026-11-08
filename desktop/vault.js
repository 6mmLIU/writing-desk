// 写作库：一个普通文件夹，每篇笔记是一个 .md 文件（文件名就是标题，子文件夹就是笔记文件夹），
// 平台、体裁、状态、标签等写在文件开头的 YAML 属性里，所以能直接用 Obsidian 打开。
// 批注、评分、过程材料这些不适合写进正文的东西，按笔记 id 存在 .writing-desk/notes/<id>.json。
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const YAML = require("yaml");
const { shell } = require("electron");

const META = ".writing-desk";
const COLS = ["souls", "nature", "memory", "plans"];
// 写进 .md 属性的字段（Obsidian 里也看得到、改得了）
const FM_KEYS = { id: "id", status: "status", tags: "tags", platform: "platform", genre: "genre", soul: "soul", pinned: "pinned", createdAt: "created", updatedAt: "updated" };
const SKIP_DIRS = new Set([META, ".obsidian", ".git", ".trash", "node_modules", "attachments"]);

class Vault {
  constructor(dir, onExternal) {
    this.dir = dir;
    this.onExternal = onExternal;
    this.paths = new Map(); // note id -> 相对路径
    this.recent = new Map(); // 我们刚写过的文件 -> 时间，用来忽略自己触发的变更
    this.watcher = null;
  }
  abs(...p) { return path.join(this.dir, ...p); }
  async ensure() {
    await fsp.mkdir(this.abs(META, "config"), { recursive: true });
    for (const c of [...COLS, "notes", "versions"]) await fsp.mkdir(this.abs(META, c), { recursive: true });
  }

  // ---------- 读整个库 ----------
  async load() {
    await this.ensure();
    const out = { cfg: {}, souls: [], nature: [], memory: [], plans: {}, notes: [], folders: [] };
    for (const f of await this.list(this.abs(META, "config"))) if (f.endsWith(".json")) out.cfg[f.slice(0, -5)] = await this.readJSON(this.abs(META, "config", f));
    for (const c of COLS) for (const f of await this.list(this.abs(META, c))) {
      if (!f.endsWith(".json")) continue;
      const d = await this.readJSON(this.abs(META, c, f)); if (!d) continue;
      if (c === "plans") out.plans[f.slice(0, -5)] = d; else out[c].push({ ...d, id: d.id || f.slice(0, -5) });
    }
    this.paths.clear();
    const walk = async (rel) => {
      for (const ent of await fsp.readdir(this.abs(rel), { withFileTypes: true }).catch(() => [])) {
        if (ent.name.startsWith(".") || SKIP_DIRS.has(ent.name)) continue;
        const r = rel ? rel + "/" + ent.name : ent.name;
        if (ent.isDirectory()) { out.folders.push(r); await walk(r); }
        else if (ent.isFile() && ent.name.toLowerCase().endsWith(".md")) {
          const n = await this.readNote(r); if (n) out.notes.push(n);
        }
      }
    };
    await walk("");
    return out;
  }
  async list(dir) { return fsp.readdir(dir).catch(() => []); }
  async readJSON(f) { try { return JSON.parse(await fsp.readFile(f, "utf8")); } catch { return null; } }
  async writeJSON(f, d) { await fsp.mkdir(path.dirname(f), { recursive: true }); const t = f + ".tmp"; await fsp.writeFile(t, JSON.stringify(d, null, 1)); await fsp.rename(t, f); }

  // ---------- 笔记 <-> 文件 ----------
  parse(raw) {
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) return { fm: {}, body: raw };
    let fm = {}; try { fm = YAML.parse(m[1]) || {}; } catch { fm = {}; }
    return { fm: typeof fm === "object" ? fm : {}, body: raw.slice(m[0].length) };
  }
  async readNote(rel) {
    let raw, st;
    try { raw = await fsp.readFile(this.abs(rel), "utf8"); st = await fsp.stat(this.abs(rel)); } catch { return null; }
    const { fm, body } = this.parse(raw);
    let id = fm.id ? String(fm.id) : null;
    if (!id || this.paths.has(id)) { // 新放进来的 .md（比如在 Obsidian 里建的）：补一个 id 写回去
      id = "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      fm.id = id;
      await this.writeFile(rel, this.serialize(fm, body));
    }
    this.paths.set(id, rel);
    const side = (await this.readJSON(this.abs(META, "notes", id + ".json"))) || {};
    const folder = path.posix.dirname(rel) === "." ? "" : path.posix.dirname(rel);
    const tags = Array.isArray(fm.tags) ? fm.tags.map(String) : typeof fm.tags === "string" ? fm.tags.split(/[,，\s]+/).filter(Boolean) : [];
    return {
      ...side, id, title: path.posix.basename(rel, path.extname(rel)), folder, path: rel, text: body,
      status: fm.status || side.status || "draft", tags, platform: fm.platform || side.platform, genre: fm.genre || side.genre, soul: fm.soul || side.soul,
      pinned: !!fm.pinned, createdAt: fm.created ? new Date(fm.created).toISOString() : st.birthtime.toISOString(),
      updatedAt: fm.updated ? new Date(fm.updated).toISOString() : st.mtime.toISOString(),
      extra: Object.fromEntries(Object.entries(fm).filter(([k]) => !Object.values(FM_KEYS).includes(k))), // 别的工具写的属性原样保留
    };
  }
  serialize(fm, body) {
    const keys = Object.keys(fm).filter((k) => fm[k] !== undefined && fm[k] !== null && fm[k] !== "" && !(Array.isArray(fm[k]) && !fm[k].length));
    if (!keys.length) return body;
    const clean = Object.fromEntries(keys.map((k) => [k, fm[k]]));
    return "---\n" + YAML.stringify(clean, { lineWidth: 0 }).trimEnd() + "\n---\n" + body;
  }
  safeName(s) { return String(s || "").replace(/[\\/:*?"<>|#^\[\]\n\r\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "未命名"; }
  async uniqueRel(folder, title, selfRel) {
    const base = this.safeName(title);
    for (let i = 1; i < 999; i++) {
      const name = (i === 1 ? base : `${base} ${i}`) + ".md";
      const rel = folder ? folder + "/" + name : name;
      if (rel === selfRel) return rel;
      if (!fs.existsSync(this.abs(rel))) return rel;
    }
    return (folder ? folder + "/" : "") + base + " " + Date.now() + ".md";
  }
  async writeFile(rel, content) {
    await fsp.mkdir(path.dirname(this.abs(rel)), { recursive: true });
    this.recent.set(rel, Date.now());
    const t = this.abs(rel) + ".tmp-wd"; await fsp.writeFile(t, content); await fsp.rename(t, this.abs(rel));
  }
  async saveNote(n) {
    const folder = (n.folder || "").replace(/^\/+|\/+$/g, "");
    const old = this.paths.get(n.id);
    const title = n.title?.trim() || (old ? path.posix.basename(old, ".md") : "未命名");
    let rel = old;
    const wantDir = folder, curDir = old ? (path.posix.dirname(old) === "." ? "" : path.posix.dirname(old)) : null;
    if (!old || curDir !== wantDir || path.posix.basename(old, ".md") !== this.safeName(title)) rel = await this.uniqueRel(wantDir, title, old);
    if (old && rel !== old && fs.existsSync(this.abs(old))) {
      await fsp.mkdir(path.dirname(this.abs(rel)), { recursive: true });
      this.recent.set(old, Date.now()); this.recent.set(rel, Date.now());
      await fsp.rename(this.abs(old), this.abs(rel));
    }
    const fm = { ...(n.extra || {}) };
    for (const [k, y] of Object.entries(FM_KEYS)) fm[y] = n[k];
    fm.pinned = n.pinned ? true : undefined;
    await this.writeFile(rel, this.serialize(fm, n.text || ""));
    const { text, title: _t, folder: _f, path: _p, extra, ...side } = n;
    await this.writeJSON(this.abs(META, "notes", n.id + ".json"), side);
    this.paths.set(n.id, rel);
    return { path: rel, title: path.posix.basename(rel, ".md"), folder: wantDir };
  }
  async deleteNote(id) {
    const rel = this.paths.get(id);
    if (rel && fs.existsSync(this.abs(rel))) { this.recent.set(rel, Date.now()); await shell.trashItem(this.abs(rel)); } // 进废纸篓，找得回来
    await fsp.rm(this.abs(META, "notes", id + ".json"), { force: true });
    this.paths.delete(id);
  }

  // ---------- 文件夹 ----------
  async mkdir(rel) { await fsp.mkdir(this.abs(rel), { recursive: true }); }
  async renameFolder(from, to) {
    if (!from || fs.existsSync(this.abs(to))) throw new Error("同名文件夹已经存在");
    await fsp.mkdir(path.dirname(this.abs(to)), { recursive: true });
    await fsp.rename(this.abs(from), this.abs(to));
    for (const [id, rel] of this.paths) if (rel === from || rel.startsWith(from + "/")) { const nr = to + rel.slice(from.length); this.paths.set(id, nr); this.recent.set(nr, Date.now()); }
  }
  async deleteFolder(rel) {
    for (const [id, p] of this.paths) if (p.startsWith(rel + "/")) { await fsp.rm(this.abs(META, "notes", id + ".json"), { force: true }); this.paths.delete(id); }
    await shell.trashItem(this.abs(rel));
  }

  // ---------- 其它数据 ----------
  async saveDoc(col, id, data) {
    if (col === "notes") return this.saveNote(data);
    const dir = col === "config" ? "config" : col;
    await this.writeJSON(this.abs(META, dir, id + ".json"), data);
  }
  async deleteDoc(col, id) {
    if (col === "notes") return this.deleteNote(id);
    await fsp.rm(this.abs(META, col === "config" ? "config" : col, id + ".json"), { force: true });
  }
  async versions(noteId) {
    const dir = this.abs(META, "versions", noteId); const out = [];
    for (const f of await this.list(dir)) if (f.endsWith(".json")) { const d = await this.readJSON(path.join(dir, f)); if (d) out.push({ ...d, id: f.slice(0, -5) }); }
    return out.sort((a, b) => (b.at > a.at ? 1 : -1));
  }
  async addVersion(noteId, v) {
    const id = "v" + Date.now().toString(36);
    await this.writeJSON(this.abs(META, "versions", noteId, id + ".json"), { ...v, at: new Date().toISOString() });
    const all = await this.versions(noteId); // 每篇最多留 40 个版本
    for (const old of all.slice(40)) await fsp.rm(this.abs(META, "versions", noteId, old.id + ".json"), { force: true });
  }
  async delVersion(noteId, vid) { await fsp.rm(this.abs(META, "versions", noteId, vid + ".json"), { force: true }); }
  async saveAttachment(name, buf) {
    const safe = this.safeName(name).replace(/\s/g, "-");
    const rel = "attachments/" + Date.now().toString(36) + "-" + safe;
    await fsp.mkdir(this.abs("attachments"), { recursive: true });
    await fsp.writeFile(this.abs(rel), Buffer.from(buf));
    return { id: rel, url: "vault://file/" + rel.split("/").map(encodeURIComponent).join("/") };
  }
  resolveVaultUrl(urlPath) {
    const rel = decodeURIComponent(urlPath.replace(/^\/+/, ""));
    const p = path.normalize(this.abs(rel));
    if (!p.startsWith(path.normalize(this.dir) + path.sep)) return null; // 只给库里面的文件
    return p;
  }

  // ---------- 监听库外的修改（比如同时开着 Obsidian） ----------
  watch() {
    this.unwatch();
    const pending = new Map();
    try {
      this.watcher = fs.watch(this.dir, { recursive: true }, (_ev, file) => {
        if (!file) return;
        const rel = file.split(path.sep).join("/");
        if (!rel.toLowerCase().endsWith(".md") || rel.split("/").some((s) => s.startsWith(".") || SKIP_DIRS.has(s))) return;
        clearTimeout(pending.get(rel));
        pending.set(rel, setTimeout(async () => {
          pending.delete(rel);
          if (Date.now() - (this.recent.get(rel) || 0) < 2500) return; // 是我们自己刚写的
          if (fs.existsSync(this.abs(rel))) {
            const prevId = [...this.paths].find(([, p]) => p === rel)?.[0];
            if (prevId) this.paths.delete(prevId);
            const n = await this.readNote(rel); if (n) this.onExternal({ type: "change", note: n });
          } else {
            const id = [...this.paths].find(([, p]) => p === rel)?.[0];
            if (id) { this.paths.delete(id); this.onExternal({ type: "delete", id }); }
          }
        }, 400));
      });
    } catch (e) { console.warn("watch failed", e); }
  }
  unwatch() { this.watcher?.close(); this.watcher = null; }
}

module.exports = { Vault, META };
