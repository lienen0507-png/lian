// =============================================
// 雙語切換（English / 中文）
// - 網頁本身寫英文；切到中文時，照 lang-zh.js 的翻譯表把文字換掉
// - 導覽列左邊有「EN / 中」切換鈕，選的語言會記住（下次來還是一樣）
// - 第一次來的訪客：瀏覽器是中文就顯示中文，其他顯示英文
// - 切換時會拉上布幕、重新整理一次（這樣動畫、故事打字效果都會用新的語言重來）
// - 之後才冒出來的文字（放大視窗、側邊圓點、泡泡…）也會自動翻
// - 中文字型：用 Google Fonts 的繁體中文字型，英文字還是原本的字型
//     大標題（Alfa Slab One 這類）→ Dela Gothic One（日文字型，缺的繁體字用 Noto Sans TC 特粗黑體補）
//     粗的小標、按鈕、分頁（black）→ Noto Sans TC 特粗黑體
//     手寫字（Yellowtail）→ Huninn 粉圓
//     內文 → Chiron Hei HK 黑體
// =============================================

(() => {
  const KEY = "lian-lang";
  const ZH = window.LIAN_ZH || {};
  const RULES = window.LIAN_ZH_RULES || [];

  // 只在某個區塊裡才用的翻法（同一個英文字，在不同地方意思不一樣）
  const SCOPED = [
    [".pg-bookmarks", { "Final": "終章", "I": "一", "II": "二", "III": "三" }],
    [".pg-stamp", { "Work in": "製作", "Progress": "中" }],
    [".vd-placard-title", { "Christmas Uniform Party": "Merry Uniformas" }]   // 第四幕的作品名稱照標準字寫
  ];

  // 要翻的屬性：圖片說明、提示文字、放大視窗的標題和說明、側邊圓點的名字
  const ATTRS = ["alt", "title", "aria-label", "data-title", "data-desc", "data-dot", "placeholder"];

  function savedLang() {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "zh" || v === "en") return v;
    } catch (e) { /* 讀不到就看瀏覽器語言 */ }
    return /^zh/i.test(navigator.language || "") ? "zh" : "en";
  }

  const lang = savedLang();
  const root = document.documentElement;

  // ---------- 切換鈕（每一頁的導覽列都有） ----------
  function buildToggle() {
    const bar = document.querySelector(".navbar");
    if (!bar || bar.querySelector(".lang-toggle")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lang-toggle";
    btn.setAttribute("data-no-translate", "");
    btn.setAttribute("aria-label", lang === "zh" ? "Switch to English" : "切換成中文");
    btn.title = lang === "zh" ? "Switch to English" : "切換成中文";
    btn.innerHTML = `<span class="lang-opt${lang === "en" ? " is-on" : ""}" lang="en">EN</span>`
                  + `<span class="lang-opt${lang === "zh" ? " is-on" : ""}" lang="zh-Hant">中</span>`;
    const logo = bar.querySelector(".nav-logo");
    if (logo) logo.after(btn); else bar.prepend(btn);

    btn.addEventListener("click", () => {
      const next = lang === "zh" ? "en" : "zh";
      try { localStorage.setItem(KEY, next); } catch (e) { /* 存不了也照樣切換這一次 */ }
      const go = () => window.location.reload();
      if (window.lianCurtain) {
        window.lianCurtain.closeAndGo(window.location.href, "", {
          small: next === "zh" ? "★ Intermission ★" : "★ 中場換幕 ★",
          big: next === "zh" ? "中文版" : "English",
          reload: true
        });
      } else {
        go();
      }
    });
  }

  if (lang !== "zh") {
    root.classList.remove("lang-zh", "i18n-pending");
    buildToggle();
    return;
  }

  // =============================================
  // 中文版
  // =============================================
  root.lang = "zh-Hant";
  root.classList.add("lang-zh");

  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const hasCJK = (s) => /[\u3040-\u30ff\u3400-\u9fff]/.test(s);   // 已經是中文（漢字）就不用再翻

  // 找翻譯：先看區塊專用的，再看翻譯表，最後看規則
  function translate(text, el) {
    const key = norm(text);
    if (!key) return null;
    if (hasCJK(key)) {
      // 已經有中文了，只看「規則」（例如布幕上的「Next stop: 關於我 →」）
      for (const [re, rep] of RULES) {
        if (re.test(key)) return key.replace(re, rep);
      }
      return null;
    }
    for (const [selector, map] of SCOPED) {
      if (el && el.closest(selector) && key in map) return map[key];
    }
    if (Object.prototype.hasOwnProperty.call(ZH, key)) return ZH[key];
    for (const [re, rep] of RULES) {
      if (re.test(key)) return key.replace(re, rep);
    }
    return null;
  }

  // 換了中文的元素，要補上中文字型
  const needFont = new Set();

  function skip(el) {
    return !el || el.closest("script, style, noscript, textarea, [data-no-translate]");
  }

  function doText(node) {
    const el = node.parentElement;
    if (skip(el)) return;
    const zh = translate(node.nodeValue, el);
    if (zh == null || zh === node.nodeValue) return;
    node.nodeValue = zh;   // 中文不需要前後的空白，直接換掉
    needFont.add(el);
  }

  function doAttrs(el) {
    if (skip(el)) return;
    ATTRS.forEach((name) => {
      const value = el.getAttribute(name);
      if (!value) return;
      const zh = translate(value, el);
      if (zh != null && zh !== value) el.setAttribute(name, zh);
    });
  }

  function doTree(node) {
    if (node.nodeType === 3) { doText(node); return; }
    if (node.nodeType !== 1) return;
    doAttrs(node);
    node.querySelectorAll("*").forEach(doAttrs);
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach(doText);
  }

  // ---------- 中文字型 ----------
  const GENERIC = ["serif", "sans-serif", "cursive", "fantasy", "monospace", "system-ui"];

  function cjkFontFor(first) {
    if (/yellowtail/.test(first)) return '"Huninn"';
    if (/^black$/.test(first)) return '"Noto Sans TC"';
    if (/alfa|anton|logo|georgia|times|serif$/.test(first) && !/sans/.test(first)) return '"Dela Gothic One", "Noto Sans TC"';
    return '"Chiron Hei HK", "Noto Sans TC"';
  }

  function applyFonts() {
    needFont.forEach((el) => {
      if (!el.isConnected || el.dataset.zhFont) return;
      const stack = getComputedStyle(el).fontFamily.split(",").map((s) => s.trim());
      if (stack.some((s) => /TC"?$|HK"?$|Huninn|Dela Gothic/.test(s))) return;
      const first = (stack[0] || "").replace(/["']/g, "").toLowerCase();
      const cjk = cjkFontFor(first);
      const last = (stack[stack.length - 1] || "").replace(/["']/g, "").toLowerCase();
      if (GENERIC.includes(last)) stack.splice(stack.length - 1, 0, cjk);
      else stack.push(cjk);
      el.style.fontFamily = stack.join(", ");
      el.dataset.zhFont = "1";
    });
    needFont.clear();
  }

  // ---------- 開始翻 ----------
  document.title = translate(document.title, null) || document.title;
  doTree(document.body);
  applyFonts();
  buildToggle();
  root.classList.remove("i18n-pending");

  // 之後才出現或改變的文字也翻（例如放大視窗、側邊圓點、音效按鈕的提示）
  let scheduled = false;
  const observer = new MutationObserver((list) => {
    list.forEach((m) => {
      if (m.type === "childList") m.addedNodes.forEach(doTree);
      else if (m.type === "characterData") doText(m.target);
      else if (m.type === "attributes") doAttrs(m.target);
    });
    if (!scheduled && needFont.size) {
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; applyFonts(); });
    }
  });
  observer.observe(document.body, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ATTRS
  });

  // 中文字型載入之後，讓會自動縮放的標題重新量一次
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => window.dispatchEvent(new Event("resize")));
  }
})();
