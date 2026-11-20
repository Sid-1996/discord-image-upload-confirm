const $ = (id) => document.getElementById(id);

// ---------- ImgLink API Key ----------
const keyInput = $("key");
const statusEl = $("status");

function show(msg, ok = true) {
  statusEl.textContent = msg;
  statusEl.style.color = ok ? "#188038" : "#d93025";
}

chrome.storage.local.get("imglinkKey").then(({ imglinkKey }) => {
  if (imglinkKey) {
    keyInput.value = imglinkKey;
    show("已儲存 ImgLink API Key");
  }
});

$("save").addEventListener("click", async () => {
  const v = keyInput.value.trim();
  if (!v) return show("請先貼上 API Key", false);
  await chrome.storage.local.set({ imglinkKey: v });
  show("已儲存");
});

$("clear").addEventListener("click", async () => {
  await chrome.storage.local.remove("imglinkKey");
  keyInput.value = "";
  show("已清除");
});

// ---------- 攔截範圍 ----------
// 儲存格式與 popup.js、content.js 相同:
//   scope = { mode: "list" | "all" | "off", rules: [{ type: "guild" | "channel", id, label }] }
const modeEl = $("mode");
const rulesEl = $("rules");
const emptyEl = $("empty");
const urlInput = $("url");
const scopeMsgEl = $("scopeMsg");

let scope = normalizeScope(null);

function scopeMsg(msg, ok = true) {
  scopeMsgEl.textContent = msg;
  scopeMsgEl.style.color = ok ? "#188038" : "#d93025";
}

function normalizeScope(s) {
  return {
    mode: ["list", "all", "off"].includes(s?.mode) ? s.mode : "list",
    rules: (Array.isArray(s?.rules) ? s.rules : []).filter(
      (r) => r && typeof r.id === "string" && (r.type === "guild" || r.type === "channel")
    ),
  };
}

// 接受完整網址、省略 https:// 的網址,或只貼 /channels/... 路徑
function parseDiscordUrl(input) {
  const v = String(input || "").trim();
  if (!v) return null;
  let u;
  try {
    u = new URL(v);
  } catch {
    try {
      u = new URL(v.startsWith("/") ? "https://discord.com" + v : "https://" + v);
    } catch {
      return null;
    }
  }
  if (u.hostname !== "discord.com" && u.hostname !== "www.discord.com") return null;
  const m = u.pathname.match(/^\/channels\/([^/]+)(?:\/([^/]+))?/);
  if (!m) return null;
  return { guildId: m[1], channelId: m[2] || null };
}

const guildLabel = (id) => (id === "@me" ? "所有私訊" : `伺服器 ${id}`);
const channelLabel = (id) => `頻道 ${id}`;

function ruleTag(r) {
  if (r.type === "channel") return "頻道";
  return r.id === "@me" ? "私訊" : "伺服器";
}

function renderRules() {
  rulesEl.replaceChildren();
  emptyEl.style.display = scope.rules.length ? "none" : "block";

  scope.rules.forEach((r, index) => {
    const li = document.createElement("li");

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = ruleTag(r);

    const info = document.createElement("span");
    info.className = "info";
    info.textContent = r.label || (r.type === "guild" ? guildLabel(r.id) : channelLabel(r.id));

    const id = document.createElement("span");
    id.className = "id";
    id.textContent = r.id;

    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "移除";
    del.addEventListener("click", () => {
      scope.rules.splice(index, 1);
      saveScope();
      scopeMsg("已移除");
    });

    li.append(tag, info, id, del);
    rulesEl.append(li);
  });
}

async function saveScope() {
  await chrome.storage.local.set({ scope });
  renderRules();
}

function addRule(type, id) {
  if (!id) return scopeMsg(type === "guild" ? "找不到伺服器 ID" : "找不到頻道 ID", false);
  if (scope.rules.some((r) => r.type === type && r.id === id)) {
    return scopeMsg(type === "guild" ? "這個伺服器已經在清單中" : "這個頻道已經在清單中", false);
  }
  scope.rules.push({
    type,
    id,
    label: type === "guild" ? guildLabel(id) : channelLabel(id),
  });
  urlInput.value = "";
  saveScope();
  scopeMsg("已加入清單");
}

modeEl.addEventListener("change", () => {
  scope.mode = modeEl.value;
  saveScope();
});

$("addChannel").addEventListener("click", () => {
  const loc = parseDiscordUrl(urlInput.value);
  if (!loc) return scopeMsg("無法辨識網址,請貼上 https://discord.com/channels/… 這樣的網址", false);
  if (!loc.channelId) return scopeMsg("這個網址只有伺服器,沒有頻道;請改用「加入整個伺服器」", false);
  addRule("channel", loc.channelId);
});

$("addGuild").addEventListener("click", () => {
  const loc = parseDiscordUrl(urlInput.value);
  if (!loc) return scopeMsg("無法辨識網址,請貼上 https://discord.com/channels/… 這樣的網址", false);
  addRule("guild", loc.guildId);
});

urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("addChannel").click();
});

(async () => {
  const { scope: s } = await chrome.storage.local.get("scope");
  scope = normalizeScope(s);
  modeEl.value = scope.mode;
  renderRules();
})();
