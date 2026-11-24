const $ = (id) => document.getElementById(id);

function normalizeScope(s) {
  return {
    mode: ["list", "all", "off"].includes(s?.mode) ? s.mode : "list",
    rules: Array.isArray(s?.rules) ? s.rules : [],
  };
}

function parseDiscordUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== "discord.com") return null;
    const m = u.pathname.match(/^\/channels\/([^/]+)(?:\/([^/]+))?/);
    if (!m) return null;
    return { guildId: m[1], channelId: m[2] || null };
  } catch {
    return null;
  }
}

function parseStoatUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== "stoat.chat" && !u.hostname.endsWith(".stoat.chat")) return null;
    const server = u.pathname.match(/\/server\/([A-Z\d]{26})/);
    const channel = u.pathname.match(/\/channel\/([A-Z\d]{26})/);
    if (!server && !channel) return null;
    return { guildId: server?.[1] || null, channelId: channel?.[1] || null };
  } catch {
    return null;
  }
}

function parsePlatformUrl(url) {
  return parseDiscordUrl(url) || parseStoatUrl(url);
}

const cleanTitle = (title = "") =>
  title.replace(/^\(\d+\)\s*/, "").replace(/\s*-\s*Discord$/, "").trim() || t("unnamed");

// 與 content.js 的判斷邏輯相同
function matches(scope, loc) {
  if (scope.mode === "off") return false;
  if (scope.mode === "all") return true;
  if (!loc) return false;
  return scope.rules.some(
    (r) =>
      (r.type === "guild" && r.id === loc.guildId) ||
      (r.type === "channel" && loc.channelId && r.id === loc.channelId)
  );
}

let scope, loc, label;

const hasRule = (type, id) => scope.rules.some((r) => r.type === type && r.id === id);

async function save() {
  await chrome.storage.local.set({ scope });
  render();
}

function toggle(type, id) {
  if (hasRule(type, id)) {
    scope.rules = scope.rules.filter((r) => !(r.type === type && r.id === id));
  } else {
    scope.rules.push({ type, id, label });
  }
  return save();
}

function setButton(btn, type, id, addText, removeText) {
  const exists = hasRule(type, id);
  btn.textContent = exists ? removeText : addText;
  btn.classList.toggle("remove", exists);
  btn.classList.remove("hidden");
}

function render() {
  document.querySelectorAll('input[name="mode"]').forEach((r) => {
    r.checked = r.value === scope.mode;
  });
  $("modeHint").classList.toggle("hidden", scope.mode === "list");

  $("notDiscord").classList.toggle("hidden", !!loc);
  $("pageBox").classList.toggle("hidden", !loc);
  if (!loc) return;

  $("page").textContent = label;
  const on = matches(scope, loc);
  if (on) {
    $("status").textContent = t("statusBlocked");
  } else if (scope.mode === "list" && scope.rules.length === 0) {
    $("status").textContent = t("statusEmpty");
  } else {
    $("status").textContent = t("statusNotBlocked");
  }
  $("status").className = "status " + (on ? "on" : "off");

  if (loc.channelId) {
    setButton($("btnChannel"), "channel", loc.channelId, t("addChannel"), t("removeChannel"));
  } else {
    $("btnChannel").classList.add("hidden");
  }
  if (loc.guildId) {
    const guildName = t(loc.guildId === "@me" ? "allDMs" : "wholeGuild");
    setButton(
      $("btnGuild"),
      "guild",
      loc.guildId,
      t("addGuildNamed", [guildName]),
      t("removeGuildNamed", [guildName])
    );
  } else {
    $("btnGuild").classList.add("hidden");
  }
}

(async () => {
  i18n.applyI18n();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  loc = tab?.url ? parsePlatformUrl(tab.url) : null;
  label = cleanTitle(tab?.title);

  const { scope: s } = await chrome.storage.local.get("scope");
  scope = normalizeScope(s);

  document.querySelectorAll('input[name="mode"]').forEach((r) =>
    r.addEventListener("change", () => {
      scope.mode = r.value;
      save();
    })
  );
  $("btnChannel").addEventListener("click", () => loc?.channelId && toggle("channel", loc.channelId));
  $("btnGuild").addEventListener("click", () => loc && toggle("guild", loc.guildId));
  $("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());

  render();
})();
