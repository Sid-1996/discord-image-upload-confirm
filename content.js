// content script:攔截貼上 / 拖曳的圖片 → 顯示確認視窗 → 使用者按下上傳才送出

(() => {
  "use strict";

  const MAX_BYTES = 200 * 1024 * 1024;
  const EDITOR_SELECTOR = '[role="textbox"][data-slate-editor="true"]';
  const DEFAULT_SETTINGS = { choice: "uguu" }; // "uguu" 或 "imglink"

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
      fr.onerror = () => rej(new Error("讀取檔案失敗"));
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

  // 讓 Discord(Slate)自己處理插入,內部狀態才會同步,之後打字網址不會消失
  async function insertText(editor, text) {
    const box = editor && editor.isConnected ? editor : document.querySelector(EDITOR_SELECTOR);
    if (!box) {
      navigator.clipboard?.writeText(text).catch(() => {});
      return false;
    }
    const probe = text.trim().split(/\s+/).pop();
    const present = () => (box.textContent || "").includes(probe);

    box.focus();
    await sleep(80);

    // 方法 1:模擬貼上純文字(走 Discord 自己的貼上處理)
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", text + " ");
      box.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
      );
    } catch (e) {
      console.warn("[catbox] 模擬貼上失敗", e);
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
          "ImgLink 需要先自行註冊帳號,並建立 API Key 貼到擴充功能的「選項」頁。" +
            "圖片預設可能是公開的,建議到 ImgLink 後台設為私密(只有知道網址的人看得到)。官網:",
          link("https://imglink.cc", "imglink.cc"),
          "・",
          link("https://imglink.cc/register", "註冊"),
          "・",
          link("https://imglink.cc/dashboard", "後台")
        );
      } else {
        hint.append(
          "Uguu 不需要帳號,檔案為臨時保存,保存多久由 Uguu 決定;知道網址的人都能看到。官網:",
          link("https://uguu.se", "uguu.se")
        );
      }
    };

    const select = el("select", {
      onchange: () => {
        chrome.storage.local.set({ settings: { choice: select.value } }).catch(() => {});
        updateHint();
      },
    });
    [
      ["uguu", "Uguu(臨時保存,時間由 Uguu 決定)"],
      ["imglink", "ImgLink(需要 API Key,見擴充選項)"],
    ].forEach(([v, t]) => select.append(el("option", { value: v, text: t })));
    select.value = settings.choice;
    if (select.value !== settings.choice) select.value = "uguu";
    updateHint();

    const cancelBtn = el("button", { class: "cancel", text: "取消(不上傳)", onclick: () => !busy && close() });
    const goBtn = el("button", { class: "go", onclick: () => upload() });

    const card = el(
      "div",
      { class: "card", role: "dialog" },
      el("div", { class: "head", text: "確認上傳圖片?" }),
      el("div", {
        class: "warn",
        text: "圖片會被上傳到你選擇的第三方圖床,取得連結的人都能看到。取消勾選或按「取消」就不會上傳任何東西。",
      }),
      list,
      el("div", { class: "opts" }, el("span", { text: "上傳到:" }), select),
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
      goBtn.textContent = items.some((i) => i.failed) ? `重試選取的 ${n} 張` : `上傳選取的 ${n} 張`;
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
            el("div", { class: "name", text: file.name || "image", title: file.name }),
            el("div", { class: "meta", text: `${file.type} · ${fmtSize(file.size)}` }),
            status
          )
        );
        list.append(row);
        items.push({ file, url, checkbox, status, row, done: false, failed: false });
      }
      refresh();
    }

    async function upload() {
      busy = true;
      note.textContent = "";
      refresh();
      const [target, time] = select.value.split(":");
      const okUrls = [];

      for (const it of items.filter((i) => !i.done && i.checkbox.checked)) {
        it.checkbox.disabled = true;
        it.status.className = "status";
        it.status.textContent = "上傳中…";
        try {
          if (it.file.size > MAX_BYTES) throw new Error("檔案超過 200MB");
          const dataUrl = await toDataUrl(it.file);
          const resp = await chrome.runtime.sendMessage({
            type: "upload",
            dataUrl,
            name: it.file.name,
            target,
            time,
          });
          if (!resp?.ok) throw new Error(resp?.error || "未知錯誤");
          it.done = true;
          it.failed = false;
          okUrls.push(resp.url);
          it.status.className = "status ok";
          it.status.textContent = "✓ 已上傳";
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
      if (allDone) close(); // 先關閉視窗,再把焦點交還輸入框後插入網址
      else refresh();

      if (okUrls.length) {
        const inserted = await insertText(editor, okUrls.join(" "));
        if (!inserted) {
          const msg = "找不到輸入框或插入失敗,網址已複製到剪貼簿,請手動貼上(Ctrl+V)。";
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
      const box = editor && editor.isConnected ? editor : document.querySelector(EDITOR_SELECTOR);
      box?.focus();
    }

    document.addEventListener("keydown", onKey, true);
    document.documentElement.append(host);
    addFiles(files);
    cancelBtn.focus(); // 預設焦點在「取消」,避免手滑按 Enter 就上傳

    modal = { addFiles };
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

  // Discord 是單頁應用程式,切換頻道時網址會變但腳本不會重載,
  // 所以每次事件發生時都用當下的網址重新判斷,而不是啟動時判斷一次。
  function currentLocation() {
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
  const editorFrom = (t) => (t instanceof Element ? t.closest(EDITOR_SELECTOR) : null) || document.querySelector(EDITOR_SELECTOR);

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
