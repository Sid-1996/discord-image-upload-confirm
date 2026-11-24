# 隱私權政策 / Privacy Policy

最後更新:2026-11-21

本擴充功能(以下稱「本工具」)由 Sid-1996 開發。這份政策說明本工具會接觸到哪些資料、如何使用,以及資料會去哪裡。

## 一句話總結

你的圖片檔與 API Key 只在本機短暫讀取;圖片只會上傳到**你自己選擇**的第三方圖床。本工具沒有自己的伺服器,不會收集、分析或出售你的個人資料,也沒有廣告或追蹤。

## 我們處理的資料

| 資料 | 用途 | 保存位置 | 保存期間 |
| --- | --- | --- | --- |
| 你貼上或拖曳的圖片檔 | 上傳到圖床以取得網址 | 只在記憶體中讀取,用完即釋放 | 直到視窗關閉或上傳完成 |
| 上傳後的網址、檔名、時間 | 讓你知道產生過哪些連結 | 瀏覽器 `chrome.storage.local`(本機) | 最多 200 筆,可自行清除 |
| ImgLink API Key(選填) | 呼叫 ImgLink API | 瀏覽器 `chrome.storage.local`,僅背景程式使用 | 直到你按「清除 Key」 |
| 攔截範圍(伺服器 / 頻道 ID 與名稱) | 判斷哪些頻道要攔截圖片 | 瀏覽器 `chrome.storage.local` | 直到你修改或移除規則 |
| 目前分頁的網址與標題 | 在彈出視窗顯示目前頻道並判斷範圍 | 只在記憶體中使用,不寫入儲存 | 切換分頁時 |

本工具**不會**讀取你的 Discord/Stoat 帳號資訊、訊息內容或瀏覽紀錄,也不會把上述資料回傳給開發者。

## 第三方服務

當你按下確認上傳時,圖片檔會直接傳送給你選擇的圖床:

- **Uguu**(https://uguu.se):匿名圖床,檔案保存多久由 Uguu 決定;拿到網址的人都能看到圖片。
- **ImgLink**(https://imglink.cc):需自行註冊;你提供的 API Key 會直接傳給 ImgLink 的 API。圖片預設是否公開、能否設為私密,由 ImgLink 決定,請自行在帳號後台設定。

本工具與 Discord、Stoat、Uguu、ImgLink 均無隸屬關係。這些服務各有自己的隱私權政策,請自行查閱。

## 資料分享

我們不出售、出租你的資料,也不拿来做廣告或追蹤。除了你主動選擇的圖床之外,資料不會傳給其他第三方。

## 權限說明

- `storage`:保存上述本機設定與上傳紀錄。
- `https://discord.com/*`、`https://stoat.chat/*`、`https://*.stoat.chat/*`:在 Discord 或 Stoat 網頁版攔截貼上 / 拖曳的圖片,並把網址插回輸入框。
- `https://uguu.se/*`、`https://imglink.cc/*`:把圖片傳到你選擇的圖床。

## 你的控制權

- 選項頁可清除 ImgLink API Key、移除攔截規則,或切換成「全部停用」。
- 移除本擴充功能時,瀏覽器中的本機儲存資料會一併清除(依 Chrome 行為)。
- 上傳到圖床的匿名圖片,本工具無法替你刪除;請向該圖床服務提出。

## 聯絡

Sid-1996 — https://github.com/Sid-1996

---

## English (summary)

This extension is developed by Sid-1996. It has **no server of its own** and does not collect, analyze, or sell your personal data. There are no ads or trackers.

- **Images** are read locally only and uploaded, after your confirmation, to the image host you choose (Uguu or ImgLink). Anyone with the resulting URL can view the image.
- **Upload history** (URL, filename, timestamp), **scope rules**, and an optional **ImgLink API Key** are stored only in your browser's `chrome.storage.local`. The API Key is used by the background script and is never sent to Discord. You can clear all of them in the options page.
- The current tab URL/title is used in memory only to detect the active Discord or Stoat channel.
- We never read your Discord or Stoat account data, message content, or browsing history, and we never send your data back to the developer.
- Permissions: `storage` for local settings; Discord/Stoat/Uguu/ImgLink host access for the features described above.
- Contact: https://github.com/Sid-1996
