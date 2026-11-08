// 把主进程的能力以 window.desk 交给页面。每个调用返回结果；失败时抛出 {code, message}。
const { contextBridge, ipcRenderer } = require("electron");

const call = async (ch, ...a) => {
  const r = await ipcRenderer.invoke(ch, ...a);
  if (!r.ok) throw r.error;
  return r.value;
};

contextBridge.exposeInMainWorld("desk", {
  platform: process.platform,
  vault: {
    info: () => call("vault:info"),
    load: () => call("vault:load"),
    save: (col, id, data) => call("vault:save", col, id, data),
    remove: (col, id) => call("vault:delete", col, id),
    mkdir: (rel) => call("vault:mkdir", rel),
    renameFolder: (a, b) => call("vault:renameFolder", a, b),
    deleteFolder: (rel) => call("vault:deleteFolder", rel),
    versions: (id) => call("vault:versions", id),
    addVersion: (id, v) => call("vault:addVersion", id, v),
    delVersion: (id, vid) => call("vault:delVersion", id, vid),
    attach: (name, bytes) => call("vault:attach", name, bytes),
    reveal: (rel) => call("vault:reveal", rel),
    choose: () => call("vault:choose"),
    onExternal: (fn) => { const h = (_e, ev) => fn(ev); ipcRenderer.on("vault:external", h); return () => ipcRenderer.off("vault:external", h); },
  },
  ai: {
    settings: () => call("ai:settings"),
    save: (patch) => call("ai:save", patch),
    // onText 收到的是“到目前为止的全文”
    sample: async (req, onText) => {
      const h = (_e, id, text) => { if (id === req.id) onText?.(text); };
      ipcRenderer.on("ai:delta", h);
      try { return await call("ai:sample", req); } finally { ipcRenderer.off("ai:delta", h); }
    },
    abort: (id) => call("ai:abort", id),
    image: (req) => call("ai:image", req),
  },
  saveFile: (filename, data) => call("file:save", filename, data),
  onMenu: (fn) => { const h = (_e, cmd) => fn(cmd); ipcRenderer.on("menu", h); return () => ipcRenderer.off("menu", h); },
});
