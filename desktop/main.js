// 主进程：窗口、菜单、写作库文件、AI 调用。页面本身和网页版是同一套代码（web/ 由 build-web.mjs 生成）。
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, protocol, net, nativeTheme } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { Vault } = require("./vault");
const AI = require("./ai");

const WEB = path.join(__dirname, "web");
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: "vault", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

// ---------- App 自己的小设置：用哪个写作库、窗口大小 ----------
const prefsFile = () => path.join(app.getPath("userData"), "app.json");
const readPrefs = () => { try { return JSON.parse(fs.readFileSync(prefsFile(), "utf8")); } catch { return {}; } };
const writePrefs = (p) => { fs.mkdirSync(path.dirname(prefsFile()), { recursive: true }); fs.writeFileSync(prefsFile(), JSON.stringify({ ...readPrefs(), ...p }, null, 1)); };

let win = null, vault = null;
function openVault(dir) {
  vault?.unwatch();
  fs.mkdirSync(dir, { recursive: true });
  vault = new Vault(dir, (ev) => win?.webContents.send("vault:external", ev));
  vault.watch();
  writePrefs({ vault: dir, recent: [dir, ...(readPrefs().recent || []).filter((d) => d !== dir)].slice(0, 8) });
}
function defaultVault() { return path.join(app.getPath("documents"), "主理人写作库"); }

function createWindow() {
  const b = readPrefs().bounds || { width: 1440, height: 900 };
  win = new BrowserWindow({
    ...b, minWidth: 900, minHeight: 600, show: false,
    titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 15 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0A0A0B" : "#F4F4F5",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, spellcheck: false },
  });
  win.loadURL("app://bundle/app.html");
  win.once("ready-to-show", () => win.show());
  if (process.env.WD_LAUNCH_CHECK) win.webContents.once("did-finish-load", () => setTimeout(async () => {
    const r = await win.webContents.executeJavaScript('JSON.stringify({ mode: W.P.mode, vault: W.S.vault && W.S.vault.name, panes: document.querySelectorAll(".pane").length, ai: W.AI.label() })').catch((e) => "ERR " + e.message);
    console.log("LAUNCH " + r); app.quit();
  }, 2000));
  const saveBounds = () => { if (!win.isMinimized() && !win.isFullScreen()) writePrefs({ bounds: win.getBounds() }); };
  win.on("resize", debounce(saveBounds, 500)); win.on("move", debounce(saveBounds, 500));
  // 页面里的外部链接用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("app://")) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.on("closed", () => { win = null; });
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---------- 菜单：每一项都发给页面执行同名命令（命令面板里也是这些） ----------
const send = (cmd) => () => win?.webContents.send("menu", cmd);
function buildMenu() {
  const recent = (readPrefs().recent || []).filter((d) => d !== vault?.dir && fs.existsSync(d));
  const tpl = [
    { label: app.name, submenu: [
      { role: "about", label: "关于主理人写作台" }, { type: "separator" },
      { label: "设置…", accelerator: "Cmd+,", click: send("view:settings") },
      { label: "AI 服务…", click: send("ai:settings") }, { type: "separator" },
      { role: "hide", label: "隐藏" }, { role: "hideOthers", label: "隐藏其他" }, { role: "unhide", label: "全部显示" }, { type: "separator" },
      { role: "quit", label: "退出主理人写作台" } ] },
    { label: "文件", submenu: [
      { label: "新建笔记", accelerator: "Cmd+N", click: send("note:new") },
      { label: "让 AI 写一篇", accelerator: "Shift+Cmd+N", click: send("note:new-ai") },
      { label: "新建文件夹", click: send("folder:new") }, { type: "separator" },
      { label: "快速切换笔记…", accelerator: "Cmd+O", click: send("switcher") },
      { label: "关闭标签页", accelerator: "Cmd+W", click: send("tab:close") }, { type: "separator" },
      { label: "打开写作库…", accelerator: "Shift+Cmd+O", click: () => chooseVault() },
      { label: "最近的写作库", enabled: recent.length > 0, submenu: recent.length ? recent.map((d) => ({ label: path.basename(d) + "  —  " + d, click: () => switchVault(d) })) : [{ label: "无" }] },
      { label: "在访达中显示写作库", click: () => vault && shell.openPath(vault.dir) }, { type: "separator" },
      { label: "导出 Markdown…", accelerator: "Shift+Cmd+E", click: send("note:export") } ] },
    { label: "编辑", submenu: [
      { role: "undo", label: "撤销" }, { role: "redo", label: "重做" }, { type: "separator" },
      { role: "cut", label: "剪切" }, { role: "copy", label: "拷贝" }, { role: "paste", label: "粘贴" }, { role: "selectAll", label: "全选" }, { type: "separator" },
      { label: "批注选中文字", accelerator: "Cmd+J", click: send("anno:new") },
      { label: "搜索全部笔记", accelerator: "Shift+Cmd+F", click: send("search") } ] },
    { label: "视图", submenu: [
      { label: "命令面板…", accelerator: "Cmd+P", click: send("palette") },
      { label: "切换编辑 / 预览", accelerator: "Cmd+E", click: send("mode:toggle") },
      { label: "向右分屏", accelerator: "Cmd+\\", click: send("split") },
      { label: "关系图谱", accelerator: "Cmd+G", click: send("view:graph") }, { type: "separator" },
      { label: "显示 / 隐藏笔记栏", accelerator: "Cmd+[", click: send("toggle:notes") },
      { label: "显示 / 隐藏 AI 面板", accelerator: "Cmd+]", click: send("toggle:insp") }, { type: "separator" },
      { role: "resetZoom", label: "实际大小" }, { role: "zoomIn", label: "放大" }, { role: "zoomOut", label: "缩小" }, { type: "separator" },
      { role: "togglefullscreen", label: "全屏" }, { role: "toggleDevTools", label: "开发者工具" } ] },
    { label: "窗口", role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}
async function chooseVault() {
  const r = await dialog.showOpenDialog(win, { title: "打开写作库", message: "选一个文件夹当写作库（可以是空文件夹，也可以是现有的 Obsidian 库）", buttonLabel: "打开", properties: ["openDirectory", "createDirectory"] });
  if (!r.canceled && r.filePaths[0]) switchVault(r.filePaths[0]);
}
function switchVault(dir) { openVault(dir); buildMenu(); win?.webContents.reload(); }

// ---------- IPC ----------
const wrap = (fn) => async (_e, ...a) => { try { return { ok: true, value: await fn(...a) } ; } catch (e) { let err; try { err = JSON.parse(e.message); } catch { err = { code: "error", message: e.message }; } return { ok: false, error: err }; } };
function ipc() {
  ipcMain.handle("vault:info", wrap(() => ({ path: vault.dir, name: path.basename(vault.dir) })));
  ipcMain.handle("vault:load", wrap(() => vault.load()));
  ipcMain.handle("vault:save", wrap((col, id, data) => vault.saveDoc(col, id, data)));
  ipcMain.handle("vault:delete", wrap((col, id) => vault.deleteDoc(col, id)));
  ipcMain.handle("vault:mkdir", wrap((rel) => vault.mkdir(rel)));
  ipcMain.handle("vault:renameFolder", wrap((a, b) => vault.renameFolder(a, b)));
  ipcMain.handle("vault:deleteFolder", wrap((rel) => vault.deleteFolder(rel)));
  ipcMain.handle("vault:versions", wrap((id) => vault.versions(id)));
  ipcMain.handle("vault:addVersion", wrap((id, v) => vault.addVersion(id, v)));
  ipcMain.handle("vault:delVersion", wrap((id, vid) => vault.delVersion(id, vid)));
  ipcMain.handle("vault:attach", wrap((name, bytes) => vault.saveAttachment(name, bytes)));
  ipcMain.handle("vault:reveal", wrap((rel) => rel ? shell.showItemInFolder(vault.abs(rel)) : shell.openPath(vault.dir)));
  ipcMain.handle("vault:choose", wrap(() => chooseVault()));
  ipcMain.handle("ai:settings", wrap(() => AI.publicSettings()));
  ipcMain.handle("ai:save", wrap((patch) => AI.saveSettings(patch)));
  ipcMain.handle("ai:sample", wrap((req) => AI.sample(req, (text) => win?.webContents.send("ai:delta", req.id, text))));
  ipcMain.handle("ai:abort", wrap((id) => AI.abort(id)));
  ipcMain.handle("ai:image", wrap(async (req) => {
    const png = await AI.generateImage(req, path.join(WEB, "img", "char"));
    return vault.saveAttachment((req.name || "image") + ".png", png);
  }));
  ipcMain.handle("file:save", wrap(async (filename, data) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath("downloads"), filename) });
    if (r.canceled || !r.filePath) return { saved: false };
    fs.writeFileSync(r.filePath, typeof data === "string" ? data : Buffer.from(data));
    return { saved: true, path: r.filePath };
  }));
}

app.setName("主理人写作台");
// 测试用：WD_USERDATA 换一个数据目录，WD_LAUNCH_CHECK 打开后自检一次就退出
if (process.env.WD_USERDATA) app.setPath("userData", process.env.WD_USERDATA);
app.whenReady().then(() => {
  protocol.handle("app", (req) => {
    const p = path.normalize(path.join(WEB, decodeURIComponent(new URL(req.url).pathname)));
    if (!p.startsWith(WEB)) return new Response("not found", { status: 404 });
    return net.fetch(pathToFileURL(p).toString());
  });
  protocol.handle("vault", (req) => {
    const p = vault?.resolveVaultUrl(new URL(req.url).pathname);
    if (!p || !fs.existsSync(p)) return new Response("not found", { status: 404 });
    return net.fetch(pathToFileURL(p).toString());
  });
  const saved = readPrefs().vault;
  openVault(process.env.WD_VAULT || (saved && fs.existsSync(saved) ? saved : defaultVault()));
  ipc(); buildMenu(); createWindow();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on("window-all-closed", () => { vault?.unwatch(); app.quit(); });
