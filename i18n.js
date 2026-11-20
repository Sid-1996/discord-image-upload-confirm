// 共用 i18n 小工具：包裝 chrome.i18n.getMessage，並填入 HTML 的 data-i18n 屬性。
// 需搭配 _locales/<locale>/messages.json 與 manifest.json 的 default_locale 使用。
// 載入順序：必須在各頁面的 popup.js / options.js / content.js 之前。
(() => {
  "use strict";

  // 找不到的 key 直接回傳 key，開發時容易發現漏譯。
  function t(key, substitutions) {
    let msg = "";
    try {
      msg = chrome.i18n.getMessage(key, substitutions) || "";
    } catch (_) {}
    return msg || key;
  }

  // 把 HTML 上的 data-i18n / data-i18n-placeholder / data-i18n-html 換成翻譯。
  // data-i18n-html 只用在自己寫的翻譯字串（含 <strong> / <a> 等標記），不是使用者輸入。
  function applyI18n(root) {
    const scope = root || document;
    try {
      document.documentElement.lang = (chrome.i18n.getUILanguage() || "zh-TW").replace("_", "-");
    } catch (_) {}

    scope.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      node.placeholder = t(node.dataset.i18nPlaceholder);
    });
    scope.querySelectorAll("[data-i18n-html]").forEach((node) => {
      node.innerHTML = t(node.dataset.i18nHtml);
    });
  }

  globalThis.i18n = { t, applyI18n };
  globalThis.t = t;
})();
