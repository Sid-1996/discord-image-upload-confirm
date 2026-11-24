const $ = (id) => document.getElementById(id);

i18n.applyI18n();

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
    show(t("savedKey"));
  }
});

$("save").addEventListener("click", async () => {
  const v = keyInput.value.trim();
  if (!v) return show(t("pasteKeyFirst"), false);
  await chrome.storage.local.set({ imglinkKey: v });
  show(t("saved"));
});

$("clear").addEventListener("click", async () => {
  await chrome.storage.local.remove("imglinkKey");
  keyInput.value = "";
  show(t("cleared"));
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

function parseStoatUrl(input) {
  const v = String(input || "").trim();
  if (!v) return null;
  let u;
  try {
    u = new URL(v);
  } catch {
    try {
      u = new URL(v.startsWith("/") ? "https://stoat.chat" + v : "https://" + v);
    } catch {
      return null;
    }
  }
  if (u.hostname !== "stoat.chat" && !u.hostname.endsWith(".stoat.chat")) return null;
  const server = u.pathname.match(/\/server\/([A-Z\d]{26})/);
  const channel = u.pathname.match(/\/channel\/([A-Z\d]{26})/);
  if (!server && !channel) return null;
  return { guildId: server?.[1] || null, channelId: channel?.[1] || null };
}

function parsePlatformUrl(input) {
  return parseDiscordUrl(input) || parseStoatUrl(input);
}

const guildLabel = (id) => (id === "@me" ? t("allDMs") : t("guildNamed", [id]));
const channelLabel = (id) => t("channelNamed", [id]);

function ruleTag(r) {
  if (r.type === "channel") return t("tagChannel");
  return r.id === "@me" ? t("tagDM") : t("tagGuild");
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
    del.textContent = t("remove");
    del.addEventListener("click", () => {
      scope.rules.splice(index, 1);
      saveScope();
      scopeMsg(t("removed"));
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
  if (!id) return scopeMsg(t(type === "guild" ? "noGuildId" : "noChannelId"), false);
  if (scope.rules.some((r) => r.type === type && r.id === id)) {
    return scopeMsg(t(type === "guild" ? "guildExists" : "channelExists"), false);
  }
  scope.rules.push({
    type,
    id,
    label: type === "guild" ? guildLabel(id) : channelLabel(id),
  });
  urlInput.value = "";
  saveScope();
  scopeMsg(t("added"));
}

modeEl.addEventListener("change", () => {
  scope.mode = modeEl.value;
  saveScope();
});

// 「不再彈出確認視窗」開關
const autoConfirmEl = $("autoConfirm");
chrome.storage.local.get("settings").then(({ settings }) => {
  autoConfirmEl.checked = settings?.autoConfirm === true;
});
autoConfirmEl.addEventListener("change", async () => {
  const { settings } = await chrome.storage.local.get("settings");
  await chrome.storage.local.set({
    settings: { ...(settings || {}), autoConfirm: autoConfirmEl.checked },
  });
});

$("addChannel").addEventListener("click", () => {
  const loc = parsePlatformUrl(urlInput.value);
  if (!loc) return scopeMsg(t("badUrl"), false);
  if (!loc.channelId) return scopeMsg(t("noChannelInUrl"), false);
  addRule("channel", loc.channelId);
});

$("addGuild").addEventListener("click", () => {
  const loc = parsePlatformUrl(urlInput.value);
  if (!loc) return scopeMsg(t("badUrl"), false);
  if (!loc.guildId) return scopeMsg(t("noGuildId"), false);
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
