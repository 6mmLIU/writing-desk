// 自动冒烟测试：用临时的写作库和临时的 App 数据目录启动真正的 App，跑一遍关键流程，打印结果后退出。
//   npx electron smoke.js
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wd-smoke-"));
app.setPath("userData", path.join(tmp, "userData"));
process.env.WD_VAULT = path.join(tmp, "vault");
fs.mkdirSync(path.join(process.env.WD_VAULT, "旧笔记"), { recursive: true });
// 模拟一篇在 Obsidian 里写好的笔记：没有 id，带自己的属性
fs.writeFileSync(path.join(process.env.WD_VAULT, "旧笔记", "从 Obsidian 来的.md"), "---\naliases: [老笔记]\ntags: [读书]\n---\n这是一篇 Obsidian 里的笔记，链接到 [[双屏手机踩坑]]。\n");

const TEST = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { errors: [] };
  addEventListener("error", (e) => out.errors.push(e.message));
  await wait(1500);
  out.mode = W.P.mode; out.vault = W.S.vault?.name; out.loaded = W.S.notes.map((n) => n.folder + "/" + n.title);
  const a = W.Desk.create({ title: "双屏手机踩坑", folder: "文章/科技", text: "第一批用户踩了坑，见 [[从 Obsidian 来的]]。" });
  W.saveNote(a, 0); await wait(600);
  out.backlinksOfA = W.Links.backlinks(a).map((x) => x.note.title);
  a.title = "双屏手机，修不了"; W.saveNote(a, 0); W.Links.renameRefs("双屏手机踩坑", "双屏手机，修不了", a.id); await wait(800);
  out.ai = W.AI.label(); out.hasKey = W.AI.hasKey();
  try { await W.AI.fn("你好", { modelTier: "quick" }); out.aiCall = "ok"; } catch (e) { out.aiCall = e.code; }
  W.Cmd.run("split"); await wait(200); out.panes = W.Desk.panes.length;
  W.App.go("graph"); await wait(400); out.graph = document.querySelector("#graph-info")?.textContent;
  W.App.go("settings"); await wait(200); out.aiButton = !!document.querySelector('[data-st="ai"]');
  W.P.flushAll(); await wait(800);
  return out;
})()`;

app.on("browser-window-created", (_e, win) => {
  win.webContents.on("console-message", (_ev, level, message) => { if (level >= 2) console.log("[page]", message); });
  win.webContents.once("did-finish-load", async () => {
    try {
      const r = await win.webContents.executeJavaScript(TEST);
      const list = (d, base = "") => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? list(path.join(d, e.name), base + e.name + "/") : [base + e.name]);
      r.files = list(process.env.WD_VAULT).filter((f) => !f.startsWith(".writing-desk/versions"));
      r.renamedFile = fs.existsSync(path.join(process.env.WD_VAULT, "文章/科技/双屏手机，修不了.md"));
      r.obsidianNote = fs.readFileSync(path.join(process.env.WD_VAULT, "旧笔记", "从 Obsidian 来的.md"), "utf8");
      console.log("SMOKE " + JSON.stringify(r, null, 1));
    } catch (e) { console.log("SMOKE FAILED", e.message); }
    app.quit();
  });
});
require("./main.js");
