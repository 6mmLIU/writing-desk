// 把仓库根目录的网页版（index.html、js/、img/）复制进 desktop/web/，并包上和 claude.ai 发布时一样的页面骨架。
// 网页版是唯一的源码；Mac App 只多了 main.js / preload.js / vault.js / ai.js。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const out = path.join(here, "web");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const d of ["js", "img"]) fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true });
// 自己的品牌人物和素材放在 private/（不进 git）：有的话盖在公开版的示例角色上面
const priv = path.join(root, process.env.WD_PUBLIC ? "（不用）" : "private"); // WD_PUBLIC=1：按公开版构建（截图、检查用）
if (fs.existsSync(path.join(priv, "img"))) fs.cpSync(path.join(priv, "img"), path.join(out, "img"), { recursive: true });
const hasChar = fs.existsSync(path.join(priv, "character.js"));
if (hasChar) fs.copyFileSync(path.join(priv, "character.js"), path.join(out, "js", "character.local.js"));
// Mac App 不从网上加载字体：宋体用系统自带的，启动时不用等 Google（国内经常连不上，会卡住第一屏）
const body = fs.readFileSync(path.join(root, "index.html"), "utf8").replace(/<link rel="(preconnect|stylesheet)" href="https:\/\/fonts\.[^>]*>\s*/g, "");
const skeleton = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' app: vault:; img-src \'self\' app: vault: data: blob:; style-src \'self\' app: \'unsafe-inline\'; font-src \'self\' app:; script-src \'self\' app:; connect-src \'self\' app: vault:">' +
  "<style>:root{color-scheme:light;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>" +
  "</head><body>";
const page = hasChar ? body.replace('<script src="js/skilldata.js"></script>', '<script src="js/skilldata.js"></script>\n<script src="js/character.local.js"></script>') : body;
fs.writeFileSync(path.join(out, "app.html"), skeleton + page + "</body></html>");
console.log("web/ ready:", fs.readdirSync(path.join(out, "js")).length, "scripts", hasChar ? "+ 自己的人物" : "（示例角色）");
