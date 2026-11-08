// =============================================
// 謝幕布幕（作品頁 → 首頁 的換頁動畫）
// - 在作品頁點上面的 LIAN's Portfolio / Home / About Me / Arts / Contact：
//   紅色絲絨布幕從左右拉上（布的「唰」聲）→ 中間出現 Thank you! → 換到首頁
// - 到了首頁：布幕往上拉起來，露出舞台
// - 切換中文 / English 時也會用同一個布幕（i18n.js 會呼叫 window.lianCurtain）
// - 音效檔：sounds/curtain.mp3（由 sound.js 播放，音效關掉就不會響）
// =============================================

(() => {
  // ---------- 可以自己調整的數值（毫秒） ----------
  const CLOSE_TIME = 800;    // 布幕拉上要多久
  const BOW_AT = 820;        // 拉上後多久出現 Thank you!
  const LEAVE_AT = 1550;     // 多久之後真的換頁（「唰」的聲音已經播完）
  const RISE_DELAY = 250;    // 到了新頁面，等多久開始拉起布幕
  const RISE_TIME = 1100;    // 布幕拉起來要多久

  const FLAG = "lian-curtain-arrive";   // 告訴下一頁「是拉著布幕過來的」
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 哪些連結要用布幕換頁：上方導覽列的名字和分頁
  const LINKS = ".nav-logo, .nav-tab";

  // ---------- 建立布幕 ----------
  // 布幕的樣子跟首頁 Arts 舞台一樣：一條一條紅色布褶＋亮面弧線，上方三個垂簾＋金色流蘇和繩結
  const FOLDS = `
    <svg width="0" height="0" style="position:absolute">
      <defs>
        <linearGradient id="cc-folds" x1="0" y1="0" x2="40" y2="0" gradientUnits="userSpaceOnUse" spreadMethod="repeat">
          <stop offset="0" stop-color="#8E2414"/>
          <stop offset="0.35" stop-color="#C03A22"/>
          <stop offset="0.6" stop-color="#D24A2B"/>
          <stop offset="1" stop-color="#8E2414"/>
        </linearGradient>
        <linearGradient id="cc-swag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#7A1E10"/>
          <stop offset="1" stop-color="#B23420"/>
        </linearGradient>
      </defs>
    </svg>`;

  // 一片布：直直垂下來，下緣微微波浪；亮面的弧線是布褶
  // （右邊那片是同一個圖左右翻過來）
  const PANEL = (flip) => `
    <svg viewBox="0 0 300 1000" preserveAspectRatio="none">
      <g ${flip ? 'transform="translate(300 0) scale(-1 1)"' : ""}>
        <path d="M0 0 H300 V990 Q285 1000 262 992 Q240 1000 214 992 Q190 1000 166 992 Q142 1000 118 992 Q94 1000 70 992 Q46 1000 22 992 Q10 998 0 994 Z" fill="url(#cc-folds)"/>
        <path d="M262 0 C258 300 266 650 258 992" fill="none" stroke="#E25A36" stroke-width="9" opacity="0.5"/>
        <path d="M205 0 C200 320 210 660 202 994" fill="none" stroke="#E25A36" stroke-width="8" opacity="0.4"/>
        <path d="M140 0 C136 300 146 680 138 994" fill="none" stroke="#E25A36" stroke-width="8" opacity="0.45"/>
        <path d="M78 0 C74 330 84 640 76 994" fill="none" stroke="#E25A36" stroke-width="7" opacity="0.35"/>
        <path d="M232 0 C228 320 236 660 230 994" fill="none" stroke="#7A1E10" stroke-width="7" opacity="0.5"/>
        <path d="M108 0 C104 300 112 660 106 994" fill="none" stroke="#7A1E10" stroke-width="6" opacity="0.45"/>
        <path d="M298 0 V994" fill="none" stroke="#6E1A0E" stroke-width="6"/>
        <path d="M0 994 Q10 998 22 992 Q46 1000 70 992 Q94 1000 118 992 Q142 1000 166 992 Q190 1000 214 992 Q240 1000 262 992 Q285 1000 300 990" fill="none" stroke="#F0BE57" stroke-width="5" stroke-dasharray="2 8" stroke-linecap="round"/>
      </g>
    </svg>`;

  const VALANCE = `
    <svg viewBox="0 0 1200 170" preserveAspectRatio="none">
      <rect width="1200" height="22" fill="#7A1E10"/>
      <path d="M0 10 Q200 175 400 10 Z" fill="url(#cc-swag)"/>
      <path d="M400 10 Q600 175 800 10 Z" fill="url(#cc-swag)"/>
      <path d="M800 10 Q1000 175 1200 10 Z" fill="url(#cc-swag)"/>
      <path d="M14 10 Q200 140 386 10" fill="none" stroke="#C03A22" stroke-width="16"/>
      <path d="M414 10 Q600 140 786 10" fill="none" stroke="#C03A22" stroke-width="16"/>
      <path d="M814 10 Q1000 140 1186 10" fill="none" stroke="#C03A22" stroke-width="16"/>
      <path d="M30 10 Q200 108 370 10" fill="none" stroke="#D9532F" stroke-width="12"/>
      <path d="M430 10 Q600 108 770 10" fill="none" stroke="#D9532F" stroke-width="12"/>
      <path d="M830 10 Q1000 108 1170 10" fill="none" stroke="#D9532F" stroke-width="12"/>
      <path d="M50 10 Q200 76 350 10" fill="none" stroke="#E86A42" stroke-width="7" opacity="0.8"/>
      <path d="M450 10 Q600 76 750 10" fill="none" stroke="#E86A42" stroke-width="7" opacity="0.8"/>
      <path d="M850 10 Q1000 76 1150 10" fill="none" stroke="#E86A42" stroke-width="7" opacity="0.8"/>
      <path d="M0 10 Q200 175 400 10 Q600 175 800 10 Q1000 175 1200 10" fill="none" stroke="#F0BE57" stroke-width="5" stroke-dasharray="2 9" stroke-linecap="round"/>
      <g fill="#F0BE57">
        <ellipse cx="400" cy="18" rx="10" ry="16"/>
        <ellipse cx="800" cy="18" rx="10" ry="16"/>
        <ellipse cx="6" cy="18" rx="8" ry="16"/>
        <ellipse cx="1194" cy="18" rx="8" ry="16"/>
      </g>
    </svg>`;

  function buildStage() {
    const stage = document.createElement("div");
    stage.className = "curtain-stage";
    stage.setAttribute("aria-hidden", "true");
    stage.innerHTML = `
      ${FOLDS}
      <div class="curtain-valance">${VALANCE}</div>
      <div class="curtain-panel curtain-left">${PANEL(false)}</div>
      <div class="curtain-panel curtain-right">${PANEL(true)}</div>
      <div class="curtain-bow">
        <p class="curtain-bow-small">★ Curtain Call ★</p>
        <p class="curtain-bow-big">Thank you!</p>
        <p class="curtain-bow-to"></p>
      </div>
    `;
    document.body.appendChild(stage);
    return stage;
  }

  const parts = (stage) => ({
    left: stage.querySelector(".curtain-left"),
    right: stage.querySelector(".curtain-right"),
    valance: stage.querySelector(".curtain-valance")
  });

  // ---------- 離開：布幕拉上 ----------
  let leaving = false;

  // options：small / big = 中間的小字和大字（不給就用 Curtain Call / Thank you!）；reload = 拉上後重新整理這一頁
  function closeAndGo(href, label, options = {}) {
    if (leaving) return;
    leaving = true;

    const stage = buildStage();
    stage.classList.add("is-active");
    if (options.small) stage.querySelector(".curtain-bow-small").textContent = options.small;
    if (options.big) stage.querySelector(".curtain-bow-big").textContent = options.big;
    stage.querySelector(".curtain-bow-to").textContent = label ? `Next stop: ${label} →` : "";
    const { left, right, valance } = parts(stage);
    const time = reduceMotion ? 250 : CLOSE_TIME;

    // 垂幔先掉下來
    valance.animate(
      [{ transform: "translateY(-105%)" }, { transform: "translateY(0)" }],
      { duration: time * 0.6, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)", fill: "both" }
    );

    // 兩片布從兩邊滑進來，碰到中間時晃一下（像真的布有重量）
    const swing = (dir) => [
      { transform: `translateX(${dir * 100}%) skewX(0deg)` },
      { transform: `translateX(${dir * -1.5}%) skewX(${dir * 2.5}deg)`, offset: 0.78 },
      { transform: `translateX(${dir * 0.6}%) skewX(${dir * -1}deg)`, offset: 0.9 },
      { transform: "translateX(0) skewX(0deg)" }
    ];
    left.animate(swing(-1), { duration: time, easing: "cubic-bezier(0.55, 0, 0.35, 1)", fill: "both" });
    right.animate(swing(1), { duration: time, easing: "cubic-bezier(0.55, 0, 0.35, 1)", fill: "both" });

    // 音效：布的「唰」
    window.dispatchEvent(new CustomEvent("lian:sfx", { detail: "curtain" }));

    setTimeout(() => stage.classList.add("is-bowing"), reduceMotion ? 260 : BOW_AT);
    setTimeout(() => {
      try { sessionStorage.setItem(FLAG, "1"); } catch (e) { /* 存不了就算了，下一頁不會有拉起動畫 */ }
      if (options.reload) window.location.reload();
      else window.location.href = href;
    }, reduceMotion ? 700 : LEAVE_AT);
  }

  // 給 i18n.js（切換語言）用
  window.lianCurtain = { closeAndGo };

  // 判斷這次點擊要不要用布幕（同一頁的 #區塊、開新分頁、按住 Ctrl 點的都不要）
  function shouldCurtain(link, event) {
    if (event.defaultPrevented || event.button !== 0) return false;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
    if (link.target && link.target !== "_self") return false;
    const url = new URL(link.href, window.location.href);
    // 只有「換到另一個頁面」才拉布幕；同一頁只是跳到某一段就不用
    return url.pathname !== window.location.pathname || url.origin !== window.location.origin;
  }

  // 用「捕獲」階段攔下點擊，比 sound.js 的翻頁聲先處理
  document.addEventListener("click", (event) => {
    const link = event.target.closest && event.target.closest(LINKS);
    if (!link || !link.href || !shouldCurtain(link, event)) return;
    event.preventDefault();
    closeAndGo(link.href, link.textContent.trim());
  }, true);

  // 按上一頁回來（瀏覽器把舊畫面留著）：把拉上的布幕拿掉
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    leaving = false;
    document.querySelectorAll(".curtain-stage").forEach((stage) => stage.remove());
  });

  // ---------- 到達：布幕拉起來 ----------
  function arrive() {
    let came = false;
    try {
      came = sessionStorage.getItem(FLAG) === "1";
      sessionStorage.removeItem(FLAG);
    } catch (e) { /* 讀不到就當作不是拉布幕過來的 */ }

    const root = document.documentElement;
    if (!came) {
      root.classList.remove("curtain-arrive");
      return;
    }

    const stage = buildStage();
    stage.classList.add("is-active");
    root.classList.remove("curtain-arrive");   // 換成真的布幕了，拿掉暫時的紅色遮罩
    const { left, right, valance } = parts(stage);
    const time = reduceMotion ? 300 : RISE_TIME;
    const delay = reduceMotion ? 0 : RISE_DELAY;

    // 兩片布一起往上收，左邊稍微先走，邊收邊往旁邊縮一點（像被拉繩拉起來）
    const rise = (dir) => [
      { transform: "translateY(0) scaleX(1)" },
      { transform: `translateY(-30%) scaleX(0.96)`, offset: 0.35 },
      { transform: "translateY(-108%) scaleX(0.9)" }
    ];
    left.animate(rise(-1), { duration: time, delay, easing: "cubic-bezier(0.55, 0, 0.3, 1)", fill: "both" });
    right.animate(rise(1), { duration: time, delay: delay + 70, easing: "cubic-bezier(0.55, 0, 0.3, 1)", fill: "both" });
    const last = valance.animate(
      [{ transform: "translateY(0)" }, { transform: "translateY(-110%)" }],
      { duration: time * 0.5, delay: delay + time * 0.7, easing: "cubic-bezier(0.5, 0, 0.75, 0)", fill: "both" }
    );
    last.finished.then(() => stage.remove()).catch(() => stage.remove());
  }

  if (document.body) arrive();
  else document.addEventListener("DOMContentLoaded", arrive);
})();
