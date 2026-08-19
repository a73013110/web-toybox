# Web Toybox

一個收集輕量網頁小作品的靜態網站。所有作品都使用原生 HTML、CSS 與 JavaScript 製作，可直接部署至 GitHub Pages。

## 作品

### Invitation Card

五步驟互動邀請卡，包含：

- 接受邀請與趣味按鈕互動
- 日期選擇與驗證
- 活動選擇
- 行程摘要與完成動畫
- 鍵盤操作、讀屏標記與減少動態效果支援

## 專案結構

```text
web-toybox/
├── index.html
├── style.css
├── shared/
│   └── base.css
└── pages/
    └── invitation-card/
        ├── index.html
        ├── style.css
        └── script.js
```

## 本機預覽

此專案不需要安裝套件，可直接開啟 `index.html`，或使用任一靜態伺服器：

```powershell
python -m http.server 8000
```

接著開啟 `http://localhost:8000/`。

## GitHub Pages

在 GitHub 儲存庫的 **Settings → Pages** 中，將來源設定為主要分支的根目錄即可。
