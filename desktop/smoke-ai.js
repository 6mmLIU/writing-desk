// AI 接线测试：配合本地假服务（ANTHROPIC_BASE_URL 指过去），测 Claude 和 OpenAI 兼容两条流式通路、JSON 解析和停止。
//   ANTHROPIC_BASE_URL=http://127.0.0.1:4890 npx electron smoke-ai.js
const { app } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wd-ai-"));
app.setPath("userData", path.join(tmp, "userData"));
process.env.WD_VAULT = path.join(tmp, "vault");

const TEST = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(1200);
  const out = {};
  await window.desk.ai.save({ provider: "claude", keys: { claudeKey: "sk-ant-test-123456", openaiKey: "sk-test-abcdef" }, openai: { baseURL: "http://127.0.0.1:4890/v1", models: { quick: "mock-mini", default: "mock-mini", complex: "mock-big" } } });
  await W.AI.init();
  out.label = W.AI.label();
  const deltas = [];
  const r1 = await W.AI.fn("你好", { modelTier: "quick", onText: ({ text }) => deltas.push(text) });
  out.claude = { text: r1.text, model: r1.model, deltas: deltas.length };
  out.claudeJson = await W.AI.fn.json("给我 JSON", { modelTier: "default" });
  await window.desk.ai.save({ provider: "openai" }); await W.AI.init();
  const d2 = [];
  const r2 = await W.AI.fn("你好", { modelTier: "complex", onText: ({ text }) => d2.push(text) });
  out.openai = { text: r2.text, model: r2.model, deltas: d2.length };
  out.openaiJson = await W.AI.fn.json("给我 JSON", { modelTier: "quick" });
  const s = await window.desk.ai.settings();
  out.keysHidden = !JSON.stringify(s).includes("sk-ant-test-123456");
  return out;
})()`;
app.on("browser-window-created", (_e, win) => {
  win.webContents.on("console-message", (_ev, level, message) => { if (level >= 2) console.log("[page]", message); });
  win.webContents.once("did-finish-load", async () => {
    try { console.log("AI " + JSON.stringify(await win.webContents.executeJavaScript(TEST), null, 1)); } catch (e) { console.log("AI FAILED", e.message); }
    console.log("requests seen by mock:", await (await fetch("http://127.0.0.1:4890/log")).text());
    const raw = fs.readFileSync(path.join(tmp, "userData", "ai.json"), "utf8");
    console.log("key stored in plain text:", raw.includes("sk-ant-test-123456"));
    app.quit();
  });
});
require("./main.js");
