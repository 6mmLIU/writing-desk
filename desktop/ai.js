// AI 服务：Claude（官方 Anthropic SDK）和 OpenAI 兼容接口（DeepSeek、Kimi、通义等也走这条）。
// 密钥用 macOS 钥匙串加密（Electron safeStorage）后存在 App 自己的数据目录，不进写作库。
const fs = require("node:fs");
const path = require("node:path");
const { app, safeStorage } = require("electron");
const Anthropic = require("@anthropic-ai/sdk").default;

const FILE = () => path.join(app.getPath("userData"), "ai.json");
const DEFAULTS = {
  provider: "claude", // 写作用哪家：claude | openai
  claude: { models: { complex: "claude-opus-5-5", default: "claude-opus-5-5", quick: "claude-haiku-5-5" }, effort: { complex: "high", default: "medium", quick: "low" } },
  openai: { baseURL: "https://api.openai.com/v1", models: { complex: "", default: "", quick: "" }, imageModel: "gpt-image-1", imageQuality: "high" },
};
const KEY_FIELDS = ["claudeKey", "openaiKey"];

function readRaw() { try { return JSON.parse(fs.readFileSync(FILE(), "utf8")); } catch { return {}; } }
function writeRaw(d) { fs.mkdirSync(path.dirname(FILE()), { recursive: true }); fs.writeFileSync(FILE(), JSON.stringify(d, null, 1), { mode: 0o600 }); }
const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(a?.[k] || {}, v) : v; return o; };
function settings() { const r = readRaw(); return merge(DEFAULTS, r.settings || {}); }
function getKey(name) {
  const enc = readRaw().keys?.[name]; if (!enc) return "";
  try { return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(enc, "base64")) : Buffer.from(enc, "base64").toString(); } catch { return ""; }
}
// 给页面看的设置：不含密钥本身，只告诉它填没填
function publicSettings() {
  const s = settings();
  return { ...s, hasKey: Object.fromEntries(KEY_FIELDS.map((k) => [k, !!getKey(k)])), keyHint: Object.fromEntries(KEY_FIELDS.map((k) => { const v = getKey(k); return [k, v ? v.slice(0, 7) + "…" + v.slice(-4) : ""]; })) };
}
function saveSettings(patch) {
  const raw = readRaw(); const { keys = {}, ...rest } = patch || {};
  raw.settings = merge(raw.settings || {}, rest);
  raw.keys = raw.keys || {};
  for (const k of KEY_FIELDS) if (k in keys) {
    const v = String(keys[k] || "").trim();
    if (!v) delete raw.keys[k];
    else raw.keys[k] = (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(v) : Buffer.from(v)).toString("base64");
  }
  writeRaw(raw);
  return publicSettings();
}

// 失败时抛出 {code, message}，页面按 code 显示中文提示
const fail = (code, message) => { const e = new Error(JSON.stringify({ code, message })); e.code = code; return e; };

// ---------- Claude ----------
async function sampleClaude({ input, tier, images, search }, onText, signal) {
  const key = getKey("claudeKey"); if (!key) throw fail("no_key", "还没有填 Claude 的 API key");
  const s = settings().claude;
  const model = s.models[tier] || s.models.default, effort = s.effort[tier] || "medium";
  const client = new Anthropic({ apiKey: key });
  let messages = toMessages(input, images, "claude");
  // Opus / Sonnet / Fable 打开服务端兜底：被安全分类器拒绝时，自动换 Anthropic 推荐的模型重跑；Haiku 没有兜底
  const fallback = /^claude-(opus|sonnet|fable)/.test(model);
  // 联网搜索：服务端工具，搜索在 Anthropic 那边跑完再接着写。Haiku 只能用基础版
  const tools = search ? [{ type: /haiku/.test(model) ? "web_search_20250305" : "web_search_20260209", name: "web_search", max_uses: search.maxUses || 8 }] : null;
  let text = "", final = "", msg = null;
  const sources = new Map();
  try {
    // 服务端搜索跑太久会先停一下（pause_turn）：把这一轮原样接回去再发，它会接着搜，不要另加“继续”
    for (let round = 0; round < 5; round++) {
      const params = { model, max_tokens: 64000, messages, output_config: { effort }, ...(tools ? { tools } : {}) };
      const stream = fallback
        ? client.beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
        : client.messages.stream(params);
      const stop = () => stream.abort(); signal.addEventListener("abort", stop);
      stream.on("text", (delta) => { text += delta; onText(text); });
      try { msg = await stream.finalMessage(); } finally { signal.removeEventListener("abort", stop); }
      for (const b of msg.content) {
        if (b.type === "text") final += b.text;
        // 搜索出错时 content 是一个错误对象而不是列表
        if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r.url && !sources.has(r.url)) sources.set(r.url, { url: r.url, title: r.title || r.url, age: r.page_age || "" });
      }
      if (msg.stop_reason !== "pause_turn") break;
      messages = [...messages, { role: "assistant", content: msg.content }];
    }
    if (msg.stop_reason === "refusal") throw fail("refused", "Claude 拒绝了这次请求");
    if (!final.trim()) throw fail("empty_completion", "没有写出内容");
    return { text: final, truncated: msg.stop_reason === "max_tokens", model: msg.model, sources: [...sources.values()] };
  } catch (e) {
    if (e.code) throw e;
    if (e instanceof Anthropic.APIUserAbortError) throw fail("cancelled", "已停止");
    if (e instanceof Anthropic.AuthenticationError) throw fail("auth", "Claude 的 API key 不对或已失效");
    if (e instanceof Anthropic.PermissionDeniedError) throw fail("auth", "这个 key 没有权限用 " + model);
    if (e instanceof Anthropic.NotFoundError) throw fail("bad_model", "找不到模型 " + model);
    if (e instanceof Anthropic.RateLimitError) throw fail("rate_limited", "调用太频繁或额度用完了");
    if (e instanceof Anthropic.BadRequestError) throw fail("bad_request", e.message);
    if (e instanceof Anthropic.APIConnectionError) throw fail("network", "连不上 Anthropic：检查网络或代理");
    if (e instanceof Anthropic.APIError) throw fail("upstream_error", `${e.status ?? ""} ${e.message}`);
    throw fail("upstream_error", e.message || String(e));
  }
}

// ---------- OpenAI 兼容 ----------
// 有的服务商（实测 DeepSeek 的流式输出）会把一个汉字的字节拆到前后两条消息里。
// 所以按字节读：每条消息里的文字先还原成字节，跨消息接起来再解码，被拆开的字就能拼回去。
const enc = new TextEncoder();
const toBytes = (s) => { // JSON 里原样的字节是 0–255 的字符；\u 转义出来的是真字符，按 UTF-8 编回字节
  const out = []; for (const ch of s) { const c = ch.codePointAt(0); if (c <= 0xff) out.push(c); else out.push(...enc.encode(ch)); } return Uint8Array.from(out);
};
async function sampleOpenAI({ input, tier, images, json }, onText, signal) {
  const key = getKey("openaiKey"); if (!key) throw fail("no_key", "还没有填 OpenAI 兼容服务的 API key");
  const s = settings().openai;
  const model = s.models[tier] || s.models.default || s.models.complex;
  if (!model) throw fail("bad_model", "还没有填 OpenAI 兼容服务的模型名");
  let res;
  try {
    res = await fetch(s.baseURL.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      // 要 JSON 的任务（评分、选题、配图计划…）一次性返回，不走流式：避开服务商流式输出里被拆坏的字
      body: JSON.stringify({ model, stream: !json, messages: toMessages(input, images, "openai") }),
    });
  } catch (e) {
    if (signal.aborted) throw fail("cancelled", "已停止");
    throw fail("network", "连不上 " + s.baseURL + "：" + (e.cause?.code || e.message));
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const msg = (() => { try { return JSON.parse(body).error?.message || body; } catch { return body; } })().slice(0, 300);
    throw fail(res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "rate_limited" : res.status === 404 ? "bad_model" : res.status === 400 ? "bad_request" : "upstream_error", `${res.status} ${msg}`);
  }
  if (json) {
    const raw = new Uint8Array(await res.arrayBuffer());
    let j = {}; try { j = JSON.parse(new TextDecoder().decode(raw)); } catch {}
    const c = j.choices?.[0], text = c?.message?.content || "";
    if (c?.finish_reason === "content_filter") throw fail("refused", "服务商拒绝了这次请求");
    if (!text.trim()) throw fail("empty_completion", "没有写出内容");
    onText(text);
    return { text, truncated: c?.finish_reason === "length", model };
  }
  let text = "", finish = null, buf = "";
  const dec = new TextDecoder(); // 跨消息的字节解码器：stream 模式会把没收完的半个字留到下一次
  try {
    for await (const chunk of res.body) {
      buf += Buffer.from(chunk).toString("latin1"); // 一个字节对应一个字符（真正的 ISO-8859-1；TextDecoder 的 "latin1" 其实是 Windows-1252，会改掉 0x80–0x9F）
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim(); if (data === "[DONE]") continue;
        try {
          const j = JSON.parse(data), c = j.choices?.[0];
          const d = c?.delta?.content; if (d) { text += dec.decode(toBytes(d), { stream: true }); onText(text); }
          if (c?.finish_reason) finish = c.finish_reason;
        } catch {}
      }
    }
    text += dec.decode();
  } catch (e) { if (signal.aborted) throw fail("cancelled", "已停止"); throw fail("upstream_error", e.message); }
  if (finish === "content_filter") throw fail("refused", "服务商拒绝了这次请求");
  if (!text.trim()) throw fail("empty_completion", "没有写出内容");
  return { text, truncated: finish === "length", model };
}

// ---------- OpenAI 兼容接口的联网搜索：各家写法不一样，按接口地址认 ----------
// DeepSeek：只有 Responses API 的 web_search 工具能搜（只支持 deepseek-v4-pro）
// Kimi（Moonshot）：内置工具 $web_search，模型发起调用后把参数原样回给它
// 通义千问（DashScope）：enable_search + forced_search
// 地址里带服务商名字就认（中转代理的地址常常写在路径里）
const searchKind = (base) => /deepseek/i.test(base) ? "deepseek" : /moonshot|kimi/i.test(base) ? "kimi" : /dashscope|aliyuncs|qwen/i.test(base) ? "qwen" : "";
async function postJSON(url, key, body, signal) {
  let res;
  try { res = await fetch(url, { method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: "Bearer " + key }, body: JSON.stringify(body) }); }
  catch (e) { if (signal.aborted) throw fail("cancelled", "已停止"); throw fail("network", "连不上 " + url + "：" + (e.cause?.code || e.message)); }
  const raw = await res.text().catch(() => "");
  let j = {}; try { j = JSON.parse(raw); } catch {}
  if (!res.ok) { const msg = (j.error?.message || raw).slice(0, 300); throw fail(res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "rate_limited" : res.status === 404 ? "bad_model" : res.status === 400 ? "bad_request" : "upstream_error", `${res.status} ${msg}`); }
  return j;
}
async function searchOpenAI({ input, tier, search }, onText, signal) {
  const key = getKey("openaiKey"); if (!key) throw fail("no_key", "还没有填 OpenAI 兼容服务的 API key");
  const s = settings().openai, base = s.baseURL.replace(/\/+$/, ""), kind = searchKind(base);
  if (!kind) throw fail("no_search", "这个接口不支持联网搜索。换成 Claude，或者 DeepSeek / Kimi / 通义千问的接口地址");
  const prompt = typeof input === "string" ? input : input.map((t) => t.content).join("\n\n");
  let model = s.models[tier] || s.models.default || s.models.complex;
  const sources = new Map();
  onText("正在联网搜索…");
  if (kind === "deepseek") {
    model = s.searchModel || "deepseek-v4-pro";
    const j = await postJSON(base + "/responses", key, { model, tools: [{ type: "web_search" }], input: prompt, max_output_tokens: 16000 }, signal);
    let text = "";
    for (const it of j.output || []) if (it.type === "message") for (const c of it.content || []) if (c.type === "output_text") {
      text += c.text || "";
      for (const a of c.annotations || []) if (a.url && !sources.has(a.url)) sources.set(a.url, { url: a.url, title: a.title || a.url });
    }
    if (!text.trim()) throw fail("empty_completion", "没有写出内容");
    return { text, model: j.model || model, sources: [...sources.values()] };
  }
  if (!model) throw fail("bad_model", "还没有填 OpenAI 兼容服务的模型名");
  let messages = [{ role: "user", content: prompt }];
  const extra = kind === "kimi" ? { tools: [{ type: "builtin_function", function: { name: "$web_search" } }] } : { enable_search: true, search_options: { forced_search: true } };
  for (let round = 0; round < 6; round++) {
    const j = await postJSON(base + "/chat/completions", key, { model, messages, ...extra }, signal);
    const c = j.choices?.[0], m = c?.message || {};
    if (kind === "kimi" && c?.finish_reason === "tool_calls" && m.tool_calls?.length) {
      messages = [...messages, m, ...m.tool_calls.map((tc) => ({ role: "tool", tool_call_id: tc.id, name: tc.function?.name, content: tc.function?.arguments || "{}" }))];
      continue;
    }
    if (c?.finish_reason === "content_filter") throw fail("refused", "服务商拒绝了这次请求");
    const text = m.content || "";
    if (!text.trim()) throw fail("empty_completion", "没有写出内容");
    return { text, model, sources: [...sources.values()] };
  }
  throw fail("upstream_error", "联网搜索没有结束");
}

function toMessages(input, images = [], kind) {
  const turns = typeof input === "string" ? [{ role: "user", content: input }] : input;
  return turns.map((t, i) => {
    const last = i === turns.length - 1;
    if (!last || !images.length || t.role !== "user") return { role: t.role, content: t.content };
    const imgs = images.map((im) => kind === "claude"
      ? { type: "image", source: { type: "base64", media_type: im.mime, data: im.data } }
      : { type: "image_url", image_url: { url: `data:${im.mime};base64,${im.data}` } });
    return { role: "user", content: [...imgs, { type: "text", text: t.content }] };
  });
}

const running = new Map();
async function sample(req, onText) {
  const ctl = new AbortController(); running.set(req.id, ctl);
  try {
    const provider = req.provider || settings().provider;
    const fn = provider === "openai" ? (req.search ? searchOpenAI : sampleOpenAI) : sampleClaude;
    return await fn(req, onText, ctl.signal);
  } finally { running.delete(req.id); }
}
function abort(id) { running.get(id)?.abort(); }

// ---------- 生图：OpenAI Images（带人物参考图编辑），同 skill 里的 gen-openai.mjs ----------
async function generateImage({ prompt, refs = [], size = "1024x1536" }, refDir) {
  const key = getKey("openaiKey"); if (!key) throw fail("no_key", "生图要用 OpenAI 兼容服务的 API key，先在设置里填上");
  const s = settings().openai;
  const form = new FormData();
  form.append("model", s.imageModel || "gpt-image-1");
  form.append("prompt", prompt.replace(/^Please GENERATE AN IMAGE\.\s*/i, ""));
  form.append("size", size);
  form.append("quality", s.imageQuality || "high");
  form.append("n", "1");
  for (const r of refs) {
    const f = path.join(refDir, r + ".jpg");
    if (fs.existsSync(f)) form.append("image[]", new Blob([fs.readFileSync(f)], { type: "image/jpeg" }), r + ".jpg");
  }
  let res;
  try { res = await fetch(s.baseURL.replace(/\/+$/, "") + "/images/edits", { method: "POST", headers: { Authorization: "Bearer " + key }, body: form }); }
  catch (e) { throw fail("network", "连不上生图服务：" + (e.cause?.code || e.message)); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(res.status === 401 ? "auth" : res.status === 429 ? "rate_limited" : "upstream_error", `${res.status} ${j.error?.message || ""}`.trim());
  const b64 = j.data?.[0]?.b64_json; if (!b64) throw fail("upstream_error", "生图服务没有返回图片");
  return Buffer.from(b64, "base64");
}

module.exports = { publicSettings, saveSettings, sample, abort, generateImage };
