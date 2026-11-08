/* 通用界面：提示条、对话框（页面内确认，viewer 里没有 confirm()）、复制提示词。 */
W.UI = (() => {
  const U = {};
  W.toast = (msg, kind = "") => {
    const box = W.$("#toasts");
    const el = document.createElement("div");
    el.className = "toast " + kind; el.setAttribute("role", "status"); el.textContent = msg;
    box.append(el);
    W.raf(() => el.classList.add("in"));
    setTimeout(() => { el.classList.remove("in"); el.classList.add("out"); setTimeout(() => el.remove(), 260); }, kind === "bad" ? 4200 : 2200);
  };

  U.modal = ({ title, body, actions = [], wide = false, onAct, onOpen }) => {
    const root = document.createElement("div");
    root.className = "modal";
    root.innerHTML = `<div class="modal-back" data-m="close"></div>
      <div class="modal-card${wide ? " wide" : ""}" role="dialog" aria-modal="true" aria-label="${W.esc(title)}">
        <header class="modal-head"><h2>${W.esc(title)}</h2><button type="button" class="icon-btn" data-m="close" aria-label="关闭">${U.icon("x")}</button></header>
        <div class="modal-body">${body}</div>
        ${actions.length ? `<footer class="modal-foot">${actions.map((a) => `<button type="button" class="btn ${a.primary ? "primary" : ""} ${a.danger ? "danger" : ""}" data-m="${a.act}">${W.esc(a.label)}</button>`).join("")}</footer>` : ""}
      </div>`;
    const prevFocus = document.activeElement;
    const close = () => {
      root.classList.remove("in"); root.classList.add("out");
      document.removeEventListener("keydown", key);
      setTimeout(() => root.remove(), 220);
      prevFocus?.focus?.({ preventScroll: true });
    };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    root.addEventListener("click", (e) => {
      const a = e.target.closest("[data-m]")?.dataset.m; if (!a) return;
      if (a === "close") return close();
      if (onAct?.(a, root, close) !== false && a !== "keep") close();
    });
    document.addEventListener("keydown", key);
    W.$("#modal-root").append(root);
    W.raf(() => { root.classList.add("in"); (root.querySelector("[autofocus]") || root.querySelector(".modal-foot .primary") || root.querySelector("button"))?.focus({ preventScroll: true }); });
    onOpen?.(root, close);
    return { root, close };
  };

  U.confirm = (text, { ok = "确定", danger = false, title = "确认一下" } = {}) => new Promise((res) => {
    let done = false;
    const { root } = U.modal({ title, body: `<p class="modal-text">${W.esc(text)}</p>`,
      actions: [{ label: "取消", act: "no" }, { label: ok, act: "yes", primary: !danger, danger }],
      onAct: (a) => { done = true; res(a === "yes"); } });
    const obs = new MutationObserver(() => { if (!root.isConnected) { obs.disconnect(); if (!done) res(false); } });
    obs.observe(W.$("#modal-root"), { childList: true });
  });

  U.ask = (title, { value = "", placeholder = "", ok = "好" } = {}) => new Promise((res) => {
    let done = false;
    const { root } = U.modal({ title, body: `<input class="input" id="ask-input" value="${W.esc(value)}" placeholder="${W.esc(placeholder)}" autofocus>`,
      actions: [{ label: "取消", act: "no" }, { label: ok, act: "yes", primary: true }],
      onAct: (a, r) => { done = true; res(a === "yes" ? r.querySelector("#ask-input").value.trim() : null); } });
    root.querySelector("#ask-input").addEventListener("keydown", (e) => { if (e.key === "Enter") root.querySelector('[data-m="yes"]').click(); });
    const obs = new MutationObserver(() => { if (!root.isConnected) { obs.disconnect(); if (!done) res(null); } });
    obs.observe(W.$("#modal-root"), { childList: true });
  });

  U.promptModal = (text, label) => {
    U.modal({ title: label || "Claude 现在不可用：可以复制完整提示词去别处用", wide: true,
      body: `<p class="muted small">在 claude.ai 里打开本页时，这一步会直接由 Claude 完成。现在可以把下面的完整提示词复制到 Claude 对话里，结果再贴回来。</p>
        <textarea class="input mono prompt-box" readonly id="pm-text">${W.esc(text)}</textarea>`,
      actions: [{ label: "关闭", act: "close" }, { label: "复制提示词", act: "copy", primary: true }],
      onAct: (a, r) => { if (a === "copy") { W.copy(r.querySelector("#pm-text").value); return false; } } });
  };

  // 右键菜单：items 是 {label, icon, run, danger} 或 "-"（分隔线）；从鼠标位置长出来，Esc / 点别处关闭
  U.menu = (x, y, items) => {
    U.menu.close?.();
    const el = document.createElement("div");
    el.className = "ctx-menu"; el.setAttribute("role", "menu");
    el.innerHTML = items.map((it, i) => it === "-" ? `<div class="ctx-sep" role="separator"></div>` : `<button type="button" role="menuitem" class="ctx-item ${it.danger ? "danger" : ""}" data-i="${i}">${it.icon ? U.icon(it.icon, 15) : ""}<span>${W.esc(it.label)}</span></button>`).join("");
    document.body.append(el);
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.min(x, innerWidth - w - 8) + "px"; el.style.top = Math.min(y, innerHeight - h - 8) + "px";
    el.style.transformOrigin = `${x > innerWidth - w - 8 ? "right" : "left"} ${y > innerHeight - h - 8 ? "bottom" : "top"}`;
    W.raf(() => el.classList.add("in"));
    const close = () => { el.classList.remove("in"); el.classList.add("out"); setTimeout(() => el.remove(), 160); document.removeEventListener("mousedown", away, true); document.removeEventListener("keydown", key, true); U.menu.close = null; };
    const away = (e) => { if (!el.contains(e.target)) close(); };
    const key = (e) => {
      const btns = [...el.querySelectorAll(".ctx-item")], i = btns.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); close(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); btns[(i + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length]?.focus(); }
    };
    el.addEventListener("click", (e) => { const b = e.target.closest(".ctx-item"); if (b) { close(); items[+b.dataset.i].run?.(); } });
    document.addEventListener("mousedown", away, true); document.addEventListener("keydown", key, true);
    U.menu.close = close;
    el.querySelector(".ctx-item")?.focus({ preventScroll: true });
  };

  // 图标：1.6 线宽、圆角收口；“身份”类图标（导航、写作流程）都带一个实心墨点（class="ink"），
  // 选中时墨点变成品牌蓝并弹一下——这是整个产品的记号
  const I = {
    pen: '<path d="M15.3 4.7a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L10 18l-4.2 1.1L6.9 15z"/><path d="M13.6 6.4l4 4"/><path class="trail" d="M3 21.3c1.4-.9 2.7-.9 4 0s2.6.9 4 0"/><circle class="ink" cx="14.2" cy="21" r="1.25"/>',
    write: '<path d="M15.3 4.7a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L10 18l-4.2 1.1L6.9 15z"/><path d="M13.6 6.4l4 4"/><path class="trail" d="M3 21.3c1.4-.9 2.7-.9 4 0s2.6.9 4 0"/><circle class="ink" cx="14.2" cy="21" r="1.25"/>',
    ai: '<rect x="4.5" y="8.2" width="15" height="11.3" rx="4"/><path d="M12 8.2V5.6"/><circle class="ink" cx="12" cy="4.2" r="1.6"/><path class="eye" d="M9.4 12.6v2M14.6 12.6v2"/><path d="M2.6 12.6v2.6M21.4 12.6v2.6"/>',
    anno: '<path d="M6 4.5h12a2.5 2.5 0 0 1 2.5 2.5v7.5a2.5 2.5 0 0 1-2.5 2.5h-6.6L7 20.3V17H6a2.5 2.5 0 0 1-2.5-2.5V7A2.5 2.5 0 0 1 6 4.5z"/><path d="M8 9.2h8M8 12.6h4.5"/><circle class="ink" cx="16" cy="12.6" r="1.25"/>',
    score: '<path d="M3.8 17.2a8.2 8.2 0 1 1 16.4 0"/><path d="M12 17.2l3.8-5"/><circle class="ink" cx="12" cy="17.2" r="1.8"/>',
    send: '<path d="M20.6 3.4L3.6 10.2l6.7 2.7 2.7 6.7z"/><path d="M10.3 12.9l4.6-4.6"/><circle class="ink" cx="18.6" cy="18.6" r="1.6"/>',
    sidebar: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15"/>',
    radar: '<path d="M20.5 12A8.5 8.5 0 1 1 12 3.5"/><path d="M16.5 12A4.5 4.5 0 1 1 12 7.5"/><path d="M12 12l6.2-6.2"/><circle class="ink" cx="18.6" cy="5.4" r="1.7"/>',
    star: '<path d="M12 3.8l2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.6l-5 2.65.95-5.6L3.9 9.7l5.6-.8z"/>',
    link: '<path d="M10.2 13.8a4 4 0 0 0 5.6 0l2.9-2.9a4 4 0 0 0-5.6-5.6l-.9.9"/><path d="M13.8 10.2a4 4 0 0 0-5.6 0l-2.9 2.9a4 4 0 0 0 5.6 5.6l.9-.9"/>',
    history: '<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4.2v4h4"/><path d="M12 8v4.4l2.8 1.8"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><path d="M3.6 16.2l4.5-4.3a1.6 1.6 0 0 1 2.2 0l5.3 5.1"/><path d="M13.6 15l1.5-1.4a1.6 1.6 0 0 1 2.2 0l3.2 3"/><circle class="ink" cx="15.6" cy="9.2" r="1.7"/>',
    soul: '<circle cx="11" cy="8.6" r="3.6"/><path d="M4.4 20.5c1.2-3.9 3.8-5.8 6.6-5.8s5.4 1.9 6.6 5.8"/><circle class="ink" cx="18.7" cy="5.3" r="1.7"/>',
    mind: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.6"/><circle class="ink" cx="12" cy="12" r="1.8"/>',
    nature: '<path d="M12 20.2s-7.6-4.6-7.6-10.3A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.6 2.8c0 5.7-7.6 10.3-7.6 10.3z"/><circle class="ink" cx="15.4" cy="10.2" r="1.6"/>',
    memory: '<path d="M7 3.6h10a1 1 0 0 1 1 1v15.6l-6-4-6 4V4.6a1 1 0 0 1 1-1z"/><circle class="ink" cx="12" cy="9.6" r="1.7"/>',
    sliders: '<path d="M4 7h9.2M17.8 7H20M4 17h2.2M11.8 17H20"/><circle cx="15.5" cy="7" r="2.3"/><circle class="ink" cx="9" cy="17" r="2.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    pin: '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/>', more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', side: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>', down: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
    check: '<path d="M5 12l5 5 9-10"/>', undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    upload: '<path d="M12 20V8M7 13l5-5 5 5M5 4h14"/>', back: '<path d="M15 6l-6 6 6 6"/>',
    minus: '<path d="M5 12h14"/>', chev: '<path d="M9 6l6 6-6 6"/>', doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h0"/>',
    cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 7.96"/><path d="M9 15l2.5 2.5L16 13"/>',
    device: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    alert: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h0"/>', list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    graph: '<circle cx="6" cy="7" r="2.4"/><circle cx="11" cy="18" r="2.4"/><path d="M8.3 7.3l7.4-.9M7 9.2l2.9 6.6M16.5 8.3l-4.2 7.6"/><circle class="ink" cx="18" cy="6.3" r="2.1"/>',
    command: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>', key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
    collapse: '<path d="M7 9l5-5 5 5M7 15l5 5 5-5"/>', folderPlus: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>',
  };

  // 品牌图标：一条带横线的纸条绕成一圈，末端折了一个角
  U.logo = (s = 26) => `<svg width="${s}" height="${s}" viewBox="0 0 32 32" aria-hidden="true"><path d="M25.53 10.5A11 11 0 1 1 14.85 5.06L17.28 8.71L17.04 10.09A6 6 0 1 0 21.2 13Z" fill="#fff"/><path d="M14.85 5.06L17.28 8.71L13.77 7.92Z" fill="#0E1A33" opacity=".3"/><path d="M23.77 12.54A8.5 8.5 0 1 1 13.09 8.01" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle class="logo-ink" cx="25.2" cy="6.6" r="2.3" fill="#3B8BFF"/></svg>`;

  // ---------- 数值控件：不用浏览器自带的上下小箭头 ----------
  // attrs 是写在 <input> 上的数据属性（data-cfg 之类），事件照旧由各页面的 input 监听处理
  U.stepper = (attrs, val, { min = 0, max = 999, step = 1, label = "", size = "" } = {}) =>
    `<span class="stepper ${size}"><button type="button" class="step" data-step="-1" aria-label="减少${label ? "：" + W.esc(label) : ""}">${U.icon("minus", size ? 14 : 16)}</button><input class="step-num" type="text" inputmode="numeric" ${attrs} data-num data-min="${min}" data-max="${max}" data-stepby="${step}" value="${val}" aria-label="${W.esc(label)}"><button type="button" class="step" data-step="1" aria-label="增加${label ? "：" + W.esc(label) : ""}">${U.icon("plus", size ? 14 : 16)}</button></span>`;
  // 选项不超过 10 个：全部摆出来，点一下就选中；小点是默认值
  U.pills = (name, attrs, val, { min = 1, max = 5, def = null, label = "" } = {}) => {
    let h = "";
    for (let n = min; n <= max; n++) h += `<label class="npill${n === def ? " is-def" : ""}"><input type="radio" name="${name}" value="${n}" ${attrs} data-num ${n === +val ? "checked" : ""}><span>${n}</span></label>`;
    return `<span class="npills" role="radiogroup" aria-label="${W.esc(label)}">${h}</span>`;
  };
  // 两三个选项：分段选择器
  U.segRadios = (name, attrs, val, opts, label = "") =>
    `<span class="seg seg-radio" role="radiogroup" aria-label="${W.esc(label)}">${opts.map(([k, nm, sub]) => `<label><input type="radio" name="${name}" value="${W.esc(k)}" ${attrs} ${String(val) === String(k) ? "checked" : ""}><span>${nm}${sub ? `<em>${sub}</em>` : ""}</span></label>`).join("")}</span>`;
  // 百分比和分数：滑杆 + 右侧数字 + 默认值刻度
  U.slider = (id, attrs, val, { min = 0, max = 100, step = 1, def = null, unit = "", label = "" } = {}) => {
    const p = ((val - min) / (max - min)) * 100, d = def == null ? null : ((def - min) / (max - min)) * 100;
    return `<span class="slider"><span class="slider-track">${d == null ? "" : `<i class="slider-def" style="left:calc(11px + (100% - 22px) * ${(d / 100).toFixed(4)})" title="默认 ${def}"></i>`}<input type="range" id="${id}" ${attrs} data-num${def == null ? "" : ` data-def="${def}"`}${unit ? ` data-unit="${W.esc(unit)}"` : ""} min="${min}" max="${max}" step="${step}" value="${val}" style="--p:${p}%" aria-label="${W.esc(label)}"></span><output class="slider-out" id="${id}-out">${val}</output><span class="slider-unit">${unit}</span></span>`;
  };
  // 评分弧形仪表：240° 的弧，蓝色是得分，黄色短刻度是达标线
  U.gauge = (score, target) => {
    const cx = 120, cy = 118, r = 96, at = (pct) => { const a = ((150 + 2.4 * pct) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    const [sx, sy] = at(0), [ex, ey] = at(100), arc = `M${sx.toFixed(2)} ${sy.toFixed(2)}A${r} ${r} 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
    const ta = ((150 + 2.4 * target) * Math.PI) / 180, t1 = [cx + 82 * Math.cos(ta), cy + 82 * Math.sin(ta)], t2 = [cx + 110 * Math.cos(ta), cy + 110 * Math.sin(ta)];
    const s = W.clamp(+score || 0, 0, 100);
    return `<svg class="gauge" viewBox="0 0 240 176" role="img" aria-label="得分 ${s}，满分 100，达标线 ${target}">
      <path d="${arc}" class="g-track"/><path d="${arc}" class="g-val" pathLength="100" style="stroke-dashoffset:${100 - s}"/>
      <path d="M${t1[0].toFixed(2)} ${t1[1].toFixed(2)}L${t2[0].toFixed(2)} ${t2[1].toFixed(2)}" class="g-target"/></svg>`;
  };

  // 渐变小球头像：同一个名字永远是同一组颜色
  const ORBS = [["#BAE6FD", "#2563EB", "#60A5FA"], ["#FDE68A", "#F97316", "#FB923C"], ["#A7F3D0", "#059669", "#34D399"], ["#F5D0FE", "#C026D3", "#A855F7"],
    ["#FECDD3", "#E11D48", "#FB7185"], ["#C7D2FE", "#4F46E5", "#818CF8"], ["#99F6E4", "#0891B2", "#22D3EE"], ["#E4E4E7", "#27272A", "#52525B"]];
  U.orb = (seed = "", size = 28) => { let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0; const [a, b, c] = ORBS[h % ORBS.length];
    return `<span class="orb" style="--o1:${a};--o2:${b};--o3:${c};width:${size}px;height:${size}px" aria-hidden="true"></span>`; };
  // 激素 / 脑区色条：一行一项，色条本身就是滑杆（透明的 range 盖在上面，拖、点、方向键都行）
  // target 给了就在条上画一根黑色目标刻度（评分里“实际 vs 目标”）；edit=false 时只读
  U.bars = (kind, defs, lv, { attrs = "", edit = true, target = null, def = null, thin = false } = {}) =>
    `<div class="nr-list${kind === "brain" ? " nr-brain" : ""}${target ? " nr-cmp" : ""}" role="group">${defs.map((d, i) => { const v = Math.round(lv[d.id] ?? d.level); return `<div class="nr${thin ? " thin" : ""}" style="--c:var(--c-${d.id});--v:${v / 100};--i:${i}">
      <span class="nr-name"><i></i>${W.esc(d.name)}${d.sub ? `<small>${W.esc(d.sub)}</small>` : ""}</span>
      <span class="nr-track"><span class="nr-clip"><span class="nr-fill"></span></span>${target ? `<span class="nr-tgt" style="--t:${(target[d.id] ?? 50) / 100}" title="目标 ${target[d.id] ?? 50}"></span>` : ""}</span>
      <output class="nr-val">${v}</output>${edit ? `<input type="range" min="0" max="100" step="1" value="${v}" ${attrs} data-id="${d.id}"${def?.[d.id] != null ? ` data-def="${def[d.id]}"` : ""} aria-label="${W.esc(d.name)}${d.sub ? " · " + W.esc(d.sub) : ""}">` : ""}</div>`; }).join("")}</div>`;
  // 预设一键套用：不重新渲染，只改每行的数值，色条自己滑过去
  U.setBars = (box, lv) => box.querySelectorAll(".nr").forEach((row) => {
    const inp = row.querySelector("input[type=range]"), id = inp?.dataset.id; if (!id || lv[id] == null) return;
    inp.value = lv[id]; row.style.setProperty("--v", lv[id] / 100); row.querySelector(".nr-val").textContent = lv[id];
  });

  // 加减器：按一下走一格，按住连续走，Shift 一次 5 格；中间的数字能直接输入，方向键也能调
  (() => {
    let t1 = 0, t2 = 0;
    const stop = () => { clearTimeout(t1); clearInterval(t2); };
    const fire = (inp) => inp.dispatchEvent(new Event("input", { bubbles: true }));
    const bump = (inp, d) => {
      const min = +inp.dataset.min, max = +inp.dataset.max, by = +inp.dataset.stepby || 1;
      const cur = +inp.value || 0, next = W.clamp(Math.round((cur + d * by) / by) * by, min, max);
      if (next === cur) { stop(); return; }
      inp.value = next; fire(inp);
      const box = inp.closest(".stepper"); box?.classList.remove("bump"); void box?.offsetWidth; box?.classList.add("bump");
    };
    document.addEventListener("pointerdown", (e) => {
      const b = e.target.closest(".stepper .step"); if (!b || (e.pointerType === "mouse" && e.button !== 0)) return;
      e.preventDefault();
      const inp = b.parentElement.querySelector(".step-num"), d = +b.dataset.step * (e.shiftKey ? 5 : 1);
      stop(); bump(inp, d);
      t1 = setTimeout(() => { t2 = setInterval(() => bump(inp, d), 70); }, 380);
    });
    ["pointerup", "pointercancel", "blur"].forEach((ev) => addEventListener(ev, stop));
    document.addEventListener("pointerout", (e) => { if (e.target.closest?.(".stepper .step")) stop(); });
    document.addEventListener("click", (e) => { // 键盘按 Enter / 空格时只会触发 click
      const b = e.target.closest(".stepper .step"); if (!b || e.detail > 0) return;
      bump(b.parentElement.querySelector(".step-num"), +b.dataset.step * (e.shiftKey ? 5 : 1));
    });
    document.addEventListener("keydown", (e) => {
      const inp = e.target.closest?.(".step-num"); if (!inp) return;
      const big = e.shiftKey ? 5 : 1, d = { ArrowUp: big, ArrowDown: -big, PageUp: 5, PageDown: -5 }[e.key];
      if (d) { e.preventDefault(); bump(inp, d); }
    });
    document.addEventListener("beforeinput", (e) => { // 只收数字
      if (e.target.closest?.(".step-num") && e.data && /\D/.test(e.data)) e.preventDefault();
    });
    document.addEventListener("change", (e) => { // 输完离开时夹到范围内
      const inp = e.target.closest?.(".step-num"); if (!inp) return;
      const v = W.clamp(+String(inp.value).replace(/\D/g, "") || +inp.dataset.min, +inp.dataset.min, +inp.dataset.max);
      if (String(v) !== inp.value) { inp.value = v; fire(inp); }
    });
  })();
  U.icon = (n, s = 18) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ""}</svg>`;

  // 滑杆 + 数值
  U.range = (id, val, { min = 0, max = 100, step = 1, label = "", hint = "", attrs = "" } = {}) =>
    `<label class="range" for="${id}"><span class="range-top"><span class="range-label">${label}</span><output class="range-val mono" id="${id}-out">${val}</output></span>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}" ${attrs} style="--p:${((val - min) / (max - min)) * 100}%">
      ${hint ? `<span class="range-hint">${hint}</span>` : ""}</label>`;
  document.addEventListener("input", (e) => {
    if (e.target.type !== "range") return;
    const t = e.target, p = ((t.value - t.min) / (t.max - t.min)) * 100;
    t.style.setProperty("--p", p + "%");
    const o = document.getElementById(t.id + "-out") || t.closest(".nat-head")?.querySelector("output");
    if (o) { o.textContent = t.value; if (t.classList.contains("pressing")) pop(o); }
    const row = t.closest(".nr"); // 激素 / 脑区色条：滑杆是盖在色条上的透明层
    if (row) { row.style.setProperty("--v", p / 100); const v = row.querySelector(".nr-val"); if (v) { v.textContent = t.value; if (t.classList.contains("pressing")) pop(v); } }
  });
  const pop = (el) => { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); };

  // ---------- 滑杆手感：按下有反馈，点轨道滑过去，数值气泡跟着走，靠近默认值吸附 ----------
  (() => {
    const THUMB = 22, SNAP = 0.025, reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let tip = null, st = null;
    const tipEl = () => tip ||= Object.assign(document.createElement("div"), { className: "range-tip", ariaHidden: "true" });
    const num = (inp) => ({ min: +inp.min || 0, max: +(inp.max || 100), step: +inp.step || 1 });
    const ratioOf = (inp, v) => { const { min, max } = num(inp); return (v - min) / (max - min); };
    const valAt = (inp, x) => {
      const r = inp.getBoundingClientRect(), { min, max, step } = num(inp);
      const k = W.clamp((x - r.left - THUMB / 2) / (r.width - THUMB), 0, 1);
      let v = min + Math.round((k * (max - min)) / step) * step;
      const def = inp.dataset.def;
      if (def != null && Math.abs(v - +def) / (max - min) <= SNAP) v = +def;
      return W.clamp(+v.toFixed(4), min, max);
    };
    const place = (inp) => {
      const t = tipEl(), r = inp.getBoundingClientRect();
      t.textContent = inp.value + (inp.dataset.unit || "");
      t.style.left = r.left + THUMB / 2 + ratioOf(inp, +inp.value) * (r.width - THUMB) + "px";
      t.style.top = r.top + r.height / 2 - THUMB / 2 + "px";
    };
    const set = (inp, v) => {
      if (+inp.value === v) return;
      const def = inp.dataset.def;
      inp.value = v; inp.dispatchEvent(new Event("input", { bubbles: true })); place(inp);
      if (def != null && v === +def) { const d = inp.parentElement.querySelector(".slider-def"); if (d) pop(d); if (navigator.userActivation?.isActive) navigator.vibrate?.(4); }
    };
    // 点轨道：拇指沿着轨道滑到点击处（先快后慢），而不是瞬移
    const glide = (inp, to) => {
      const from = +inp.value, { step } = num(inp);
      if (reduce.matches || Math.abs(to - from) <= step) return set(inp, to);
      const t0 = performance.now(), dur = 200, ease = (k) => 1 - Math.pow(1 - k, 3);
      const tick = (now) => {
        if (!st || st.inp !== inp || st.dragging) return;
        const k = Math.min(1, (now - t0) / dur);
        set(inp, k < 1 ? +(from + Math.round(((to - from) * ease(k)) / step) * step).toFixed(4) : to);
        if (k < 1) st.raf = requestAnimationFrame(tick);
      };
      st.raf = requestAnimationFrame(tick);
      setTimeout(() => { if (st?.inp === inp && !st.dragging && +inp.value !== to) set(inp, to); }, dur + 40); // 后台标签页里 rAF 不跑时兜底
    };
    const press = (inp) => { inp.classList.add("pressing"); inp.closest(".slider, .range, .nat-head, .nr")?.classList.add("is-pressing"); place(inp); tipEl().isConnected || document.body.append(tip); W.raf(() => tip.classList.add("show")); };
    const release = () => {
      if (!st) return;
      const { inp, start } = st; cancelAnimationFrame(st.raf);
      inp.classList.remove("pressing"); inp.closest(".is-pressing")?.classList.remove("is-pressing");
      tip?.classList.remove("show");
      if (+inp.value !== start) inp.dispatchEvent(new Event("change", { bubbles: true }));
      st = null;
    };
    document.addEventListener("pointerdown", (e) => {
      const inp = e.target; if (inp.type !== "range" || inp.disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
      e.preventDefault(); inp.focus({ preventScroll: true });
      try { inp.setPointerCapture(e.pointerId); } catch {}
      st = { inp, id: e.pointerId, start: +inp.value, x: e.clientX, y: e.clientY, touch: e.pointerType === "touch", dragging: false, raf: 0 };
      if (st.touch) return; // 手指：先看是横着拖还是竖着滚，再决定
      press(inp);
      const r = inp.getBoundingClientRect(), thumbX = r.left + THUMB / 2 + ratioOf(inp, +inp.value) * (r.width - THUMB);
      if (Math.abs(e.clientX - thumbX) > THUMB / 2 + 2) glide(inp, valAt(inp, e.clientX)); // 点在拇指上：不动，只等拖
    }, { passive: false });
    document.addEventListener("pointermove", (e) => {
      if (!st || e.pointerId !== st.id) return;
      if (st.touch && !st.dragging) {
        const dx = Math.abs(e.clientX - st.x), dy = Math.abs(e.clientY - st.y);
        if (dx < 6 || dx < dy) return;
        press(st.inp);
      }
      st.dragging = true; cancelAnimationFrame(st.raf);
      set(st.inp, valAt(st.inp, e.clientX));
    });
    document.addEventListener("pointerup", (e) => {
      if (!st || e.pointerId !== st.id) return;
      if (st.touch && !st.dragging) { press(st.inp); set(st.inp, valAt(st.inp, e.clientX)); setTimeout(release, 380); return; } // 轻点：跳过去并亮一下
      release();
    });
    document.addEventListener("pointercancel", (e) => { if (st && e.pointerId === st.id) release(); });
    // 键盘调的时候也给反馈：数字弹一下，气泡露半秒
    document.addEventListener("keydown", (e) => {
      const inp = e.target; if (inp.type !== "range" || !/^(Arrow|Page|Home|End)/.test(e.key)) return;
      inp.classList.add("pressing"); place(inp); tipEl().isConnected || document.body.append(tip); tip.classList.add("show");
      clearTimeout(inp._kt); inp._kt = setTimeout(() => { inp.classList.remove("pressing"); if (!st) tip.classList.remove("show"); }, 650);
      W.raf(() => place(inp));
    });
    addEventListener("scroll", () => { if (st && tip) place(st.inp); }, true);
  })();

  // ---------- 会滑动的底：分段控件、左侧导航、心智档位、数字按钮共用一套 ----------
  // 每组只有一块底（.seg-ind）。选中项变了，底从旧位置滑到新位置（只动 transform）；
  // 整组被重新渲染时，按“在哪个容器里的哪一组”记住上次的位置，新的那块底从旧位置滑过来，看起来就是同一个东西在动。
  (() => {
    const SEL = ".seg, .rail, .bands, .npills, .sfilter, .flow, .newtog";
    const mem = new Map(), reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const items = (g) => [...g.querySelectorAll(":scope > button, :scope > label, :scope > .gi > button")];
    const activeOf = (g) => items(g).find((c) => c.classList.contains("on") || c.querySelector?.(":scope > input:checked"));
    const keyOf = (g) => {
      const host = g.parentElement?.closest("[id]"), label = g.getAttribute("aria-label") || g.className;
      const same = host ? [...host.querySelectorAll(SEL)].filter((x) => (x.getAttribute("aria-label") || x.className) === label) : [g];
      return (host?.id || "") + "|" + label + "|" + same.indexOf(g);
    };
    const ro = new ResizeObserver((es) => es.forEach((e) => { const g = e.target; if (g.isConnected) place(g, false); }));
    function place(g, animate = true) {
      const t = activeOf(g);
      let ind = g.querySelector(":scope > .seg-ind");
      if (!t) { if (ind) ind.style.opacity = "0"; return; }
      if (!ind) {
        ind = document.createElement("i"); ind.className = "seg-ind"; ind.setAttribute("aria-hidden", "true");
        g.prepend(ind); g.classList.add("glide"); ro.observe(g);
        if (animate) ind._r = mem.get(keyOf(g)); // 刚渲染出来的组：从上一次的位置滑过来
      }
      if (!t.offsetWidth) return; // 还没显示出来，等 ResizeObserver
      const r = { x: t.offsetLeft, y: t.offsetTop, w: t.offsetWidth, h: t.offsetHeight }, prev = ind._r;
      ind.style.opacity = ""; ind.style.width = r.w + "px"; ind.style.height = r.h + "px";
      const moved = prev && (prev.x !== r.x || prev.y !== r.y || prev.w !== r.w || prev.h !== r.h);
      if (moved && animate && !reduce.matches) {
        ind.classList.remove("go");
        ind.style.transform = `translate(${prev.x}px, ${prev.y}px) scale(${prev.w / r.w}, ${prev.h / r.h})`;
        void ind.offsetWidth;
        ind.classList.add("go");
      } else if (!animate) ind.classList.remove("go");
      ind.style.transform = `translate(${r.x}px, ${r.y}px)`;
      ind._r = r; mem.set(keyOf(g), r);
    }
    U.glide = place;
    const scan = (root) => { if (root.nodeType !== 1) return; if (root.matches(SEL)) place(root); root.querySelectorAll?.(SEL).forEach((g) => place(g)); };
    new MutationObserver((ms) => {
      const todo = new Set();
      for (const m of ms) {
        const t = m.target;
        if (m.type === "attributes") { if (!t.classList.contains("seg-ind") && t.parentElement?.matches(SEL)) todo.add(t.parentElement); continue; }
        if (t.closest?.(".ed, .preview, .note-list, .tabbar")) continue; // 正文、树这些频繁刷新的地方不用管
        if (t.matches?.(SEL) && m.addedNodes.length) todo.add(t); // 组自己的子元素被整体换掉（innerHTML）
        for (const n of m.addedNodes) if (n.nodeType === 1 && !n.classList.contains("seg-ind")) { if (n.matches(SEL)) todo.add(n); n.querySelectorAll(SEL).forEach((g) => todo.add(g)); }
      }
      todo.forEach((g) => g.isConnected && place(g));
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    document.addEventListener("change", (e) => { const g = e.target.type === "radio" && e.target.closest(SEL); if (g) place(g); });
    scan(document.body);
  })();
  return U;
})();
