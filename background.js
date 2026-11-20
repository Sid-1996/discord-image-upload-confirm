// background service worker:負責實際上傳(避開網頁的 CORS 限制)
// 支援:uguu / imglink

importScripts("i18n.js");

const TIMEOUT_MS = 120000;
const HISTORY_LIMIT = 200;

const ENDPOINTS = {
  uguu: "https://uguu.se/upload",
  imglink: "https://imglink.cc/api/v1/upload",
};

async function fetchWithTimeout(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...options, signal: ctrl.signal });
    const text = (await r.text()).trim();
    return { r, text };
  } catch (e) {
    if (e.name === "AbortError") throw new Error(t("uploadTimeout"));
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const tryJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
const isUrl = (s) => typeof s === "string" && s.startsWith("https://");

// ---------- 各圖床 ----------
async function uploadUguu(blob, name) {
  const form = new FormData();
  form.append("files[]", blob, name);
  const { r, text } = await fetchWithTimeout(ENDPOINTS.uguu, { method: "POST", body: form });
  const j = tryJson(text);
  const url = j?.files?.[0]?.url || (isUrl(text) ? text : null);
  if (!r.ok || !isUrl(url)) throw new Error((j?.description || text).slice(0, 200) || `HTTP ${r.status}`);
  return url;
}

async function uploadImglink(blob, name) {
  const { imglinkKey } = await chrome.storage.local.get("imglinkKey");
  if (!imglinkKey) throw new Error(t("needImglinkKey"));

  const form = new FormData();
  form.append("file", blob, name);
  const { r, text } = await fetchWithTimeout(ENDPOINTS.imglink, {
    method: "POST",
    headers: { "X-API-Key": imglinkKey },
    body: form,
  });
  const j = tryJson(text);
  // 文件的回應格式不只一種,全部都容錯處理
  const url =
    j?.url ||
    j?.directUrl ||
    j?.data?.url ||
    j?.images?.[0]?.url ||
    j?.data?.images?.[0]?.url ||
    null;
  if (!r.ok || !isUrl(url)) {
    throw new Error((j?.error || j?.message || text).toString().slice(0, 200) || `HTTP ${r.status}`);
  }
  return url;
}

// ---------- 主流程 ----------
async function saveHistory(entry) {
  try {
    const { history = [] } = await chrome.storage.local.get("history");
    history.unshift(entry);
    await chrome.storage.local.set({ history: history.slice(0, HISTORY_LIMIT) });
  } catch (e) {
    console.warn("[upload] 寫入歷史失敗", e);
  }
}

async function upload({ dataUrl, name, target }) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    throw new Error(t("imageOnly"));
  }
  if (!ENDPOINTS[target]) throw new Error(t("unknownTarget"));

  const blob = await (await fetch(dataUrl)).blob();
  const fileName = name || "image.png";

  const url =
    target === "uguu" ? await uploadUguu(blob, fileName) : await uploadImglink(blob, fileName);

  await saveHistory({ url, name: fileName, target, at: Date.now() });
  return url;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "upload") return;
  if (sender.id !== chrome.runtime.id) return;
  if (!sender.url || !sender.url.startsWith("https://discord.com/")) return;

  upload(msg)
    .then((url) => sendResponse({ ok: true, url }))
    .catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }));
  return true; // 非同步回應
});
