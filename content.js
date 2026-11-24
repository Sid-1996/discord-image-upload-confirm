// content script:攔截貼上 / 拖曳的圖片 → 顯示確認視窗 → 使用者按下上傳才送出

(() => {
  "use strict";

  const MAX_BYTES = 200 * 1024 * 1024;
  // 輸入框選擇器：Discord 的 Slate 編輯器與 Stoat 的 CodeMirror 6 編輯器
  const DISCORD_EDITOR_SELECTOR = '[role="textbox"][data-slate-editor="true"]';
  const STOAT_EDITOR_SELECTOR = '.cm-editor .cm-content';
  const EDITORS = [DISCORD_EDITOR_SELECTOR, STOAT_EDITOR_SELECTOR];
  const DEFAULT_SETTINGS = { choice: "uguu", autoConfirm: false }; // "uguu" 或 "imglink"; autoConfirm=true → 直接上傳、不彈視窗

  const findEditor = () => {
    for (const sel of EDITORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  };
  const isStoatEditor = (el) => !!el.closest(".cm-editor");

  let modal = null; // 目前開啟的確認視窗

  // ---------- 小工具 ----------
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n[k] = v;
    }
    n.append(...kids);
    return n;
  };

  const toDataUrl = (file) =>
    new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(new Error(t("readFileFailed")));
      fr.readAsDataURL(file);
    });

  const fmtSize = (n) =>
    n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

  async function loadSettings() {
    try {
      const { settings } = await chrome.storage.local.get("settings");
      return { ...DEFAULT_SETTINGS, ...(settings || {}) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 讓平台自己處理插入,內部狀態才會同步,之後打字網址不會消失
  async function insertText(editor, text) {
    const box = editor && editor.isConnected ? editor : findEditor();
    if (!box) {
      navigator.clipboard?.writeText(text).catch(() => {});
      return false;
    }
    const probe = text.trim().split(/\s+/).pop();
    const present = () => (box.textContent || "").includes(probe);

    box.focus();
    await sleep(80);

    if (isStoatEditor(box)) {
      // Stoat 用 CodeMirror 6:合成 paste 事件將網址插入編輯器
      const dt = new DataTransfer();
      dt.setData("text/plain", text + " ");
      box.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
      );
    } else {
      // Discord(Slate):方法 1 模擬貼上純文字(走 Discord 自己的貼上處理)
      try {
        const dt = new DataTransfer();
        dt.setData("text/plain", text + " ");
        box.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
        );
      } catch (e) {
        console.warn("[catbox] 模擬貼上失敗", e);
      }
    }
    await sleep(150);
    if (present()) return true;

    // 方法 2:備用,execCommand
    box.focus();
    document.execCommand("insertText", false, text + " ");
    await sleep(150);
    if (present()) return true;

    navigator.clipboard?.writeText(text).catch(() => {});
    return false;
  }

  // ---------- 樣式 ----------
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "Segoe UI","Microsoft JhengHei",sans-serif; }
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.65);
      display: flex; align-items: center; justify-content: center; }
    .card { width: min(560px, 92vw); max-height: 86vh; display: flex; flex-direction: column;
      background: #2b2d31; color: #f2f3f5; border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,.5); }
    .head { padding: 16px 20px 8px; font-size: 18px; font-weight: 700; }
    .warn { padding: 0 20px 10px; font-size: 13px; color: #b5bac1; line-height: 1.5; }
    .list { padding: 4px 20px; overflow-y: auto; flex: 1; }
    .item { display: flex; align-items: center; gap: 12px; padding: 8px; margin-bottom: 8px;
      background: #1e1f22; border-radius: 8px; }
    .item input { width: 18px; height: 18px; flex: none; cursor: pointer; }
    .item img { width: 72px; height: 72px; object-fit: cover; border-radius: 6px; flex: none; background: #111; }
    .info { min-width: 0; flex: 1; }
    .name { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta { font-size: 12px; color: #b5bac1; margin-top: 2px; }
    .status { font-size: 12px; margin-top: 4px; min-height: 16px; }
    .status.err { color: #fa777c; } .status.ok { color: #57f287; }
    .opts { padding: 8px 20px; display: flex; align-items: center; gap: 8px; font-size: 13px; color: #b5bac1; }
    select { background: #1e1f22; color: #f2f3f5; border: 1px solid #3f4147; border-radius: 6px; padding: 5px 8px; }
    .autoRow { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #b5bac1; margin-left: 8px; white-space: nowrap; }
    .toast {
      max-width: 86vw;
      padding: 10px 16px;
      border-radius: 10px;
      background: rgba(32, 32, 36, 0.95);
      color: #f2f3f5;
      font-size: 14px;
      line-height: 1.4;
      box-shadow: 0 8px 24px rgba(0,0,0,.5);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .note { padding: 0 20px 6px; font-size: 12px; color: #fee75c; min-height: 16px; }
    .hint { padding: 0 20px 8px; font-size: 12px; color: #b5bac1; line-height: 1.6; }
    .hint a { color: #00a8fc; }
    .foot { display: flex; justify-content: flex-end; gap: 10px; padding: 12px 20px 16px; }
    button { border: 0; border-radius: 6px; padding: 9px 18px; font-size: 14px; cursor: pointer; color: #fff; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    .cancel { background: #4e5058; } .cancel:hover:not(:disabled) { background: #6d6f78; }
    .go { background: #5865f2; } .go:hover:not(:disabled) { background: #4752c4; }
    .cancel:focus-visible, .go:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  `;

  // ---------- 自動上傳時的「運行中」提示 ----------
  let toastHost = null;
  let toastEl = null;
  let toastTimer = null;
  function showToast(text, dismissMs = 4000) {
    if (!toastHost) {
      toastHost = document.createElement("div");
      toastHost.style.cssText =
        "all:initial;position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;";
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastHost.append(toastEl);
      document.documentElement.append(toastHost);
    }
    toastEl.textContent = text;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastHost.remove();
      toastHost = null;
      toastEl = null;
      toastTimer = null;
    }, dismissMs);
  }

  // ---------- 確認視窗 ----------
  async function openModal(files, editor) {
    const settings = await loadSettings();
    const items = [];
    let busy = false;

    const host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;";
    const root = host.attachShadow({ mode: "closed" });

    const list = el("div", { class: "list" });
    const note = el("div", { class: "note" });
    const link = (href, text) =>
      el("a", { href, target: "_blank", rel: "noopener noreferrer", text });
    const hint = el("div", { class: "hint" });
    const updateHint = () => {
      hint.replaceChildren();
      if (select.value === "imglink") {
        hint.append(
          t("hintImglink"),
          link("https://imglink.cc", "imglink.cc"),
          "・",
          link("https://imglink.cc/register", t("register")),
          "・",
          link("https://imglink.cc/dashboard", t("dashboard"))
        );
      } else {
        hint.append(
          t("hintUguu"),
          link("https://uguu.se", "uguu.se")
        );
      }
    };

    const select = el("select", {
      onchange: () => {
        // 合併寫回,保留 autoConfirm(勾選框會更新 storage 上的完整 settings)
        chrome.storage.local
          .set({ settings: { ...settings, choice: select.value } })
          .catch(() => {});
        updateHint();
      },
    });
    [
      ["uguu", "optUguu"],
      ["imglink", "optImglink"],
    ].forEach(([v, key]) => select.append(el("option", { value: v, text: t(key) })));
    select.value = settings.choice;
    if (select.value !== settings.choice) select.value = "uguu";
    updateHint();

    // 「不再彈出確認視窗」開關:勾選時同時存下 autoConfirm 與目前選擇,下次觸發直接上傳
    const autoConfirmCb = el("input", {
      type: "checkbox",
      onchange: () => {
        chrome.storage.local
          .set({
            settings: {
              ...settings,
              autoConfirm: autoConfirmCb.checked,
              choice: select.value,
            },
          })
          .catch(() => {});
      },
    });
    autoConfirmCb.checked = settings.autoConfirm === true;

    const cancelBtn = el("button", { class: "cancel", text: t("cancelUpload"), onclick: () => !busy && close() });
    const goBtn = el("button", { class: "go", onclick: () => upload() });

    const card = el(
      "div",
      { class: "card", role: "dialog" },
      el("div", { class: "head", text: t("modalTitle") }),
      el("div", {
        class: "warn",
        text: t("modalWarn"),
      }),
      list,
      el(
        "div",
        { class: "opts" },
        el("span", { text: t("uploadTo") }),
        select,
        el("label", { class: "autoRow" }, autoConfirmCb, el("span", { text: t("autoConfirmLabel") }))
      ),
      hint,
      note,
      el("div", { class: "foot" }, cancelBtn, goBtn)
    );
    const overlay = el("div", {
      class: "overlay",
      onmousedown: (e) => {
        if (e.target === overlay && !busy) close(); // 點背景 = 取消
      },
    }, card);
    root.append(el("style", { text: CSS }), overlay);

    function refresh() {
      const n = items.filter((i) => !i.done && i.checkbox.checked).length;
      goBtn.textContent = t(
        items.some((i) => i.failed) ? "retrySelected" : "uploadSelected",
        [String(n)]
      );
      goBtn.disabled = busy || n === 0;
      cancelBtn.disabled = busy;
    }

    function addFiles(newFiles) {
      for (const file of newFiles) {
        const url = URL.createObjectURL(file);
        const checkbox = el("input", { type: "checkbox", checked: true, onchange: refresh });
        const status = el("div", { class: "status" });
        const row = el(
          "label",
          { class: "item" },
          checkbox,
          el("img", { src: url, alt: "" }),
          el(
            "div",
            { class: "info" },
            el("div", { class: "name", text: file.name || t("defaultImageName"), title: file.name }),
            el("div", { class: "meta", text: `${file.type} · ${fmtSize(file.size)}` }),
            status
          )
        );
        list.append(row);
        items.push({ file, url, checkbox, status, row, done: false, failed: false });
      }
      refresh();
    }

    async function upload(toast) {
      busy = true;
      note.textContent = "";
      refresh();
      const sel = items.filter((i) => !i.done && i.checkbox.checked);
      const [target, time] = select.value.split(":");
      const okUrls = [];
      if (toast) showToast(t("autoUploadToast", [String(sel.length)]));

      for (const it of sel) {
        it.checkbox.disabled = true;
        it.status.className = "status";
        it.status.textContent = t("uploading");
        try {
          if (it.file.size > MAX_BYTES) throw new Error(t("fileTooLarge"));
          const dataUrl = await toDataUrl(it.file);
          const resp = await chrome.runtime.sendMessage({
            type: "upload",
            dataUrl,
            name: it.file.name,
            target,
            time,
          });
          if (!resp?.ok) throw new Error(resp?.error || t("unknownError"));
          it.done = true;
          it.failed = false;
          okUrls.push(resp.url);
          if (toast) showToast(t("autoUploadToast", [String(sel.length - okUrls.length)]));
          it.status.className = "status ok";
          it.status.textContent = t("uploaded");
        } catch (e) {
          it.failed = true;
          it.checkbox.disabled = false;
          it.status.className = "status err";
          it.status.textContent = "✗ " + (e?.message || e);
        }
      }

      busy = false;
      for (const it of items.filter((i) => i.done)) {
        URL.revokeObjectURL(it.url);
        it.row.remove();
      }
      items.splice(0, items.length, ...items.filter((i) => !i.done));

      const allDone = items.length === 0;
      const failedN = sel.filter((i) => i.failed).length;
      if (toast) {
        if (allDone && okUrls.length > 0) showToast(t("autoUploadDone", [String(okUrls.length)]), 5000);
        else if (failedN > 0) showToast(t("autoUploadFailed", [String(failedN)]), 5000);
      }
      if (allDone) close(); // 先關閉視窗,再把焦點交還輸入框後插入網址
      else refresh();

      if (okUrls.length) {
        const inserted = await insertText(editor, okUrls.join(" "));
        if (!inserted) {
          const msg = t("insertFailed");
          if (allDone) alert(msg);
          else note.textContent = msg;
        }
      }
    }

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (!busy) close();
      }
    }

    function close() {
      document.removeEventListener("keydown", onKey, true);
      items.forEach((i) => URL.revokeObjectURL(i.url));
      host.remove();
      modal = null;
      const box = editor && editor.isConnected ? editor : findEditor();
      box?.focus();
    }

    document.addEventListener("keydown", onKey, true);
    document.documentElement.append(host);
    addFiles(files);
    cancelBtn.focus(); // 預設焦點在「取消」,避免手滑按 Enter 就上傳

    modal = { addFiles };

    // 跳過確認視窗:直接上傳,沿用 storage 裡記錄的選擇
    if (settings.autoConfirm) {
      host.remove();
      modal = null;
      upload(true);
    }
  }

  // ---------- 攔截範圍 ----------
  // 只在指定的頻道 / 伺服器攔截,其他地方的貼上、拖曳一律交還給 Discord。
  const DEFAULT_SCOPE = { mode: "list", rules: [] };
  let scope = DEFAULT_SCOPE;

  function normalizeScope(s) {
    return {
      mode: ["list", "all", "off"].includes(s?.mode) ? s.mode : "list",
      rules: (Array.isArray(s?.rules) ? s.rules : []).filter(
        (r) => r && typeof r.id === "string" && (r.type === "guild" || r.type === "channel")
      ),
    };
  }

  function loadScope() {
    return chrome.storage.local
      .get("scope")
      .then(({ scope: s }) => {
        scope = normalizeScope(s);
      })
      .catch(() => {
        scope = { ...DEFAULT_SCOPE };
      });
  }

  // ---------- Stoat 網址 ----------
  // Stoat 路由（stoatchat/for-web 的 routing）：伺服器頁 /server/<ID>，
  // 頻道頁 /server/<伺服器ID>/channel/<頻道ID>，私訊頁 /channel/<頻道ID>（無伺服器）
  const STOAT_RE_SERVER = /\/server\/([A-Z\d]{26})/;
  const STOAT_RE_CHANNEL = /\/channel\/([A-Z\d]{26})/;
  const isStoatHost = (host) => host === "stoat.chat" || host.endsWith(".stoat.chat");
  function parseStoatUrl(url) {
    try {
      const u = new URL(url);
      if (!isStoatHost(u.hostname)) return null;
      const server = u.pathname.match(STOAT_RE_SERVER);
      const channel = u.pathname.match(STOAT_RE_CHANNEL);
      if (!server && !channel) return null;
      return { guildId: server?.[1] || null, channelId: channel?.[1] || null };
    } catch {
      return null;
    }
  }

  // 這兩個平台都是單頁應用程式（或 Discord 是單頁）,切換頻道時網址會變但腳本不會重載,
  // 所以每次事件發生時都用當下的網址重新判斷,而不是啟動時判斷一次。
  function currentLocation() {
    if (isStoatHost(location.hostname)) return parseStoatUrl(location.href);
    const m = location.pathname.match(/^\/channels\/([^/]+)(?:\/([^/]+))?/);
    // 必須有頻道 ID 才算訊息情境(例如 /channels/@me 好友頁就沒有)
    if (!m || !m[2]) return null;
    return { guildId: m[1], channelId: m[2] };
  }

  function inScope() {
    if (scope.mode === "off") return false;
    if (scope.mode === "all") return true;
    const loc = currentLocation();
    if (!loc) return false;
    return scope.rules.some(
      (r) =>
        (r.type === "guild" && r.id === loc.guildId) ||
        (r.type === "channel" && r.id === loc.channelId)
    );
  }

  loadScope();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.scope) scope = normalizeScope(changes.scope.newValue);
  });

  // ---------- 攔截 ----------
  const pickImages = (dt) => [...(dt?.files || [])].filter((f) => f.type.startsWith("image/"));
  const editorFrom = (t) =>
    (t instanceof Element ? t.closest(DISCORD_EDITOR_SELECTOR) : null) ||
    (t instanceof Element ? t.closest(STOAT_EDITOR_SELECTOR) : null) ||
    findEditor();

  function intercept(e, dt) {
    if (!inScope()) return; // 不在攔截範圍內:完全交給 Discord 處理
    const imgs = pickImages(dt);
    if (!imgs.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (modal) modal.addFiles(imgs);
    else openModal(imgs, editorFrom(e.target));
  }

  document.addEventListener("paste", (e) => intercept(e, e.clipboardData), true);
  document.addEventListener("drop", (e) => intercept(e, e.dataTransfer), true);
  document.addEventListener(
    "dragover",
    (e) => {
      if (!inScope()) return;
      if ([...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault();
    },
    true
  );
})();
