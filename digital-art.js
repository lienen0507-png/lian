// =============================================
// Digital Art 頁的互動
// 1. 卡頁：跟首頁一樣，滾一下滑鼠就切到下一整頁（到位時彈一下、震一下）
//    （手機、平板用手指滑，改用瀏覽器內建的卡格）
// 2. 每一頁進到畫面時，裡面的東西依序浮上來；離開後重置，回來會再播一次
// 3. 還沒有圖：圖片讀不到時，畫框改成顯示「artwork coming soon」
// 4. 放大看作品：點畫框打開大圖，可以用 ← → 換下一張、Esc 或點旁邊關掉
// =============================================

// ---------- 1. 卡頁（從 home.js 搬過來的，數值也一樣可以調） ----------
(() => {
  // ---------- 可以自己調整的數值 ----------

  // 切換一格要花多久（毫秒）：越小越快
  const SNAP_DURATION = 450;

  // 到位時衝過頭的程度：0 = 不衝過頭；越大彈得越明顯（建議 0.5～1.5）
  const SNAP_OVERSHOOT = 0.9;

  // 落地時整格往下震的距離（px）：0 = 不震
  const LAND_BUMP = 7;


  const navbar = document.querySelector(".navbar");
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasMouse = window.matchMedia("(pointer: fine)").matches;

  // 把落地震動距離交給 CSS 使用
  root.style.setProperty("--land-bump", LAND_BUMP + "px");

  // 這一頁的每一格（main 裡面每個 section，順序就是由上到下）
  const sections = [...document.querySelectorAll("main > section")].map((el, i) => {
    if (!el.id) el.id = "part-" + (i + 1);      // 右側的點要用 #id 連過去
    return { el };
  });


  // =============================================
  // 1. 量導覽列高度
  //    把高度存成 CSS 變數 --nav-h，CSS 會用它來算每一格的高度和對齊位置
  // =============================================
  let navH = 0;

  function updateNavHeight() {
    navH = navbar ? navbar.offsetHeight : 0;
    root.style.setProperty("--nav-h", navH + "px");
    // 頁尾的高度也量一下：最後一格會補滿「畫面 − 導覽列 − 頁尾」，滑到底剛好看到整格＋頁尾
    const footer = document.querySelector("footer");
    if (footer) root.style.setProperty("--footer-h", footer.offsetHeight + "px");
  }
  updateNavHeight();
  window.addEventListener("resize", updateNavHeight);


  // =============================================
  // 2. 卡格
  // =============================================

  // 某一格「卡好」時，頁面應該捲到的位置（該格頂端剛好貼在導覽列下面）
  function sectionTop(el) {
    return Math.round(el.getBoundingClientRect().top + window.scrollY - navH);
  }

  // 頁面最底（看得到頁尾）
  function maxScroll() {
    return root.scrollHeight - window.innerHeight;
  }

  // 導覽列下方實際看得到的高度
  function viewHeight() {
    return window.innerHeight - navH;
  }

  // 所有可以卡住的位置：每一格的頂端＋頁面最底
  function snapPoints() {
    const points = sections.map(({ el }) => Math.min(sectionTop(el), maxScroll()));
    points.push(maxScroll());
    // 兩個位置太接近時只留下面那個（例如聯絡區和頁面最底只差一點點，就直接捲到底，連頁尾一起看到）
    points.sort((a, b) => a - b);
    return points.filter((p, i, arr) => i === arr.length - 1 || arr[i + 1] - p > 60);
  }

  // 現在在哪一格（最後一個頂端已經過了的那一格）
  function currentSectionIndex() {
    const y = window.scrollY;
    let index = 0;
    sections.forEach(({ el }, i) => {
      if (sectionTop(el) <= y + 3) index = i;
    });
    return index;
  }

  // 帶彈性的緩動曲線：快速衝過去 → 稍微超過 → 彈回定位
  function easeOutBack(t) {
    const s = SNAP_OVERSHOOT;
    return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
  }

  let animating = false;     // 是否正在切換中
  let animFrame = null;

  // 平滑捲到某個位置
  function scrollToY(targetY, onDone) {
    const startY = window.scrollY;
    const distance = targetY - startY;

    if (Math.abs(distance) < 2 || reduceMotion) {
      window.scrollTo(0, targetY);
      if (onDone) onDone();
      return;
    }

    cancelAnimationFrame(animFrame);
    animating = true;
    const startTime = performance.now();

    function step(now) {
      const t = Math.min((now - startTime) / SNAP_DURATION, 1);
      window.scrollTo(0, startY + distance * easeOutBack(t));

      if (t < 1) {
        animFrame = requestAnimationFrame(step);
      } else {
        animating = false;
        if (onDone) onDone();
      }
    }

    animFrame = requestAnimationFrame(step);
  }

  // 落地時整格震一下
  function landBump(targetY) {
    if (!LAND_BUMP || reduceMotion) return;

    const landed = sections.find(({ el }) => Math.abs(sectionTop(el) - targetY) < 4);
    if (!landed) return;

    landed.el.classList.remove("snap-land");
    void landed.el.offsetWidth; // 讓動畫可以重新播放
    landed.el.classList.add("snap-land");
  }

  // 切完一格後，冷卻多久才接受下一次捲動（毫秒）；固定時間，不會因為一直滾而被延長
  const SNAP_COOLDOWN = 180;

  // 在長區塊（例如作品區）捲到底／頂時，先停住多久才切到下一格（毫秒）
  const EDGE_HOLD = 300;

  let cooldownUntil = 0;   // 在這個時間之前，不接受切格
  let edgeHoldUntil = 0;   // 在這個時間之前，停在長區塊的邊緣

  // 切到某個卡點
  function snapTo(targetY) {
    // 真的換到別的畫面才播翻頁聲（通知 sound.js）
    if (Math.abs(targetY - window.scrollY) > 40) {
      window.dispatchEvent(new CustomEvent("lian:pageturn"));
    }
    cooldownUntil = performance.now() + SNAP_DURATION + SNAP_COOLDOWN;
    scrollToY(targetY, () => landBump(targetY));
  }

  // 在長區塊裡正常捲動；回傳 true 代表有捲（就不切格）
  function freeScroll(direction, delta) {
    const y = window.scrollY;
    const section = sections[currentSectionIndex()].el;
    const top = sectionTop(section);
    const bottom = top + section.offsetHeight;
    const isTall = section.offsetHeight > viewHeight() + 4;
    if (!isTall) return false;

    if (direction > 0) {
      const remaining = bottom - (y + viewHeight());
      if (remaining > 3) {
        const amount = Math.min(Math.abs(delta), remaining);
        window.scrollTo(0, y + amount);
        // 這一下剛好捲到底 → 在邊緣停一下，再滾才切到下一格
        if (amount >= remaining) edgeHoldUntil = performance.now() + EDGE_HOLD;
        return true;
      }
    } else {
      const above = y - top;
      if (above > 3) {
        const amount = Math.min(Math.abs(delta), above);
        window.scrollTo(0, y - amount);
        if (amount >= above) edgeHoldUntil = performance.now() + EDGE_HOLD;
        return true;
      }
    }
    return false;
  }

  // 往上或往下切一格
  function snapStep(direction) {
    if (performance.now() < edgeHoldUntil) return;

    const y = window.scrollY;
    const section = sections[currentSectionIndex()].el;
    const top = sectionTop(section);

    // 往上時，如果還沒回到這一格的頂端（例如停在頁尾），先回到這一格的頂端
    if (direction < 0 && y - top > 3) {
      snapTo(top);
      return;
    }

    const points = snapPoints();
    const target = direction > 0
      ? points.find((p) => p > y + 3)
      : [...points].reverse().find((p) => p < y - 3);

    if (target !== undefined) snapTo(target);
  }

  // 先試著在長區塊裡捲，不行就切格（鍵盤用）
  function move(direction, delta) {
    if (!freeScroll(direction, delta)) snapStep(direction);
  }

  // 只有用滑鼠的電腦才接手卡格；手機、平板保留瀏覽器內建的卡格
  if (hasMouse) {
    root.classList.add("js-snap");

    // ----- 滑鼠滾輪／觸控板 -----
    let wheelTotal = 0;      // 累積的捲動量（觸控板一次送很多小的量）
    let lastWheel = 0;       // 上一次收到捲動的時間
    let lastAbs = 0;         // 上一次捲動量的大小

    window.addEventListener("wheel", (event) => {
      // 按住 Ctrl 是縮放網頁，不要攔截
      if (event.ctrlKey) return;
      // 放大看作品的視窗打開時，不要切格
      if (document.body.classList.contains("da-lb-open")) { event.preventDefault(); return; }

      event.preventDefault();
      const now = performance.now();

      // 換算成 px（有些滑鼠回報的單位是「行」）
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const abs = Math.abs(delta);
      if (abs === 0) return;

      const gap = now - lastWheel;

      // 觸控板放手後的「慣性」：間隔很短、量很小、而且越來越小
      const isInertia = gap < 100 && abs < 30 && abs <= lastAbs;

      lastWheel = now;
      lastAbs = abs;

      // 正在切換中，或剛切完的冷卻時間 → 忽略
      if (animating || now < cooldownUntil) {
        wheelTotal = 0;
        return;
      }

      // 在長區塊裡就照量正常捲動
      if (freeScroll(Math.sign(delta), delta)) {
        wheelTotal = 0;
        return;
      }

      // 慣性不拿來切格，避免一路衝過好幾格
      if (isInertia) return;

      // 累積到一定的量才切格（滑鼠滾一格就夠；觸控板要輕輕滑一下）
      if (gap > 200) wheelTotal = 0;
      wheelTotal += delta;

      if (Math.abs(wheelTotal) >= 40) {
        snapStep(Math.sign(wheelTotal));
        wheelTotal = 0;
      }
    }, { passive: false });

    // ----- 鍵盤 -----
    window.addEventListener("keydown", (event) => {
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (document.body.classList.contains("da-lb-open")) return;
      if (animating) {
        if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Home", "End"].includes(event.key)) {
          event.preventDefault();
        }
        return;
      }

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          move(1, 90);
          break;
        case "ArrowUp":
          event.preventDefault();
          move(-1, 90);
          break;
        case "PageDown":
        case " ":
          event.preventDefault();
          move(event.shiftKey ? -1 : 1, viewHeight() * 0.85);
          break;
        case "PageUp":
          event.preventDefault();
          move(-1, viewHeight() * 0.85);
          break;
        case "Home":
          event.preventDefault();
          snapTo(0);
          break;
        case "End":
          event.preventDefault();
          snapTo(maxScroll());
          break;
      }
    });

    // ----- 點導覽列、右側星星這類「#區塊」連結時，也用同樣的方式切過去 -----
    document.addEventListener("click", (event) => {
      if (event.defaultPrevented) return; // 已經被別的效果處理（例如票根要先播撕開動畫）
      const link = event.target.closest && event.target.closest('a[href^="#"]');
      if (!link) return;

      const id = link.getAttribute("href").slice(1);
      const target = id ? document.getElementById(id) : null;
      if (!target) return;

      event.preventDefault();
      snapTo(Math.min(sectionTop(target), maxScroll()));
      history.replaceState(null, "", "#" + id);
    });
  }




  // =============================================
  // 右側的區塊指示（跟首頁一樣的 Bubble Float）：
  // 一條線上的點，每一格一個；切換時冒出綁著細線的彩色星星
  // 點旁邊的字寫在每個 <section> 的 data-dot
  // =============================================
  // ---------- 可以自己調整的數值 ----------
  const BUBBLE_COUNT = 7;          // 每次冒出幾顆星星
  const BUBBLE_MIN_SIZE = 9;       // 星星最小（px）
  const BUBBLE_MAX_SIZE = 18;      // 星星最大（px）
  const BUBBLE_RISE = 150;         // 往上飄多高（px）
  const BUBBLE_SPREAD = 140;       // 往左散開多遠（px）
  const BUBBLE_LIFE = 1500;        // 從冒出到爆開結束，總共多久（毫秒）

  // 星星用的顏色（跟 script.js 一樣的參考色）
  const BUBBLE_COLORS = ["#C03A22", "#D58A4B", "#F0BE57", "#82AAC7"];
  const STRING_COLOR = "rgba(213, 138, 75, 0.55)"; // 細線：半透明銅色

  // ----- 建立右側的點 -----
  const dotNav = document.createElement("nav");
  dotNav.className = "section-dots";
  dotNav.setAttribute("aria-label", "Page sections");

  const dots = sections.map(({ el }) => {
    const label = el.dataset.dot || "";
    const dot = document.createElement("a");
    dot.className = "section-dot";
    dot.href = "#" + el.id;
    dot.setAttribute("aria-label", label);
    dot.innerHTML =
      `<span class="section-dot-label">${label}</span>` +
      `<span class="section-dot-mark" aria-hidden="true"></span>`;
    dotNav.appendChild(dot);
    return dot;
  });

  document.body.appendChild(dotNav);

  // ----- 畫星星氣球用的畫布（蓋滿畫面、不擋點擊，在指示點的下面一層） -----
  const bubbleCanvas = document.createElement("canvas");
  bubbleCanvas.setAttribute("aria-hidden", "true");
  bubbleCanvas.style.cssText =
    "position:fixed; inset:0; width:100vw; height:100vh; pointer-events:none; z-index:89;";
  document.body.appendChild(bubbleCanvas);
  const bctx = bubbleCanvas.getContext("2d");

  function resizeBubbleCanvas() {
    const ratio = window.devicePixelRatio || 1;
    bubbleCanvas.width = window.innerWidth * ratio;
    bubbleCanvas.height = window.innerHeight * ratio;
    bctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  resizeBubbleCanvas();
  window.addEventListener("resize", resizeBubbleCanvas);

  // 目前畫面上的波紋和星星群
  const bursts = [];
  let bubbleLoopRunning = false;

  // 在某個點冒出一串星星
  function releaseBubbles(dot) {
    if (reduceMotion) return;

    const mark = dot.querySelector(".section-dot-mark");
    const rect = mark.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    const stars = [];
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      // 每顆星星往左上方散開，位置稍微隨機；越外圈的飄越遠
      const spreadT = (i + Math.random() * 0.8) / BUBBLE_COUNT;
      stars.push({
        dx: -(25 + spreadT * BUBBLE_SPREAD),
        dy: -(BUBBLE_RISE * (0.45 + Math.random() * 0.55)),
        size: BUBBLE_MIN_SIZE + Math.random() * (BUBBLE_MAX_SIZE - BUBBLE_MIN_SIZE),
        color: BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)],
        delay: Math.random() * 140,                  // 不同時冒出，比較自然
        popAt: 0.62 + Math.random() * 0.2,           // 在生命的 62%～82% 時爆開
        wobble: Math.random() * Math.PI * 2,         // 搖晃的起始角度
        spin: (Math.random() - 0.5) * 1.2            // 星星自轉
      });
    }

    bursts.push({ x: originX, y: originY, start: performance.now(), stars });

    if (!bubbleLoopRunning) {
      bubbleLoopRunning = true;
      requestAnimationFrame(drawBubbles);
    }
  }

  // 畫一顆四角星（跟游標同樣的形狀）
  function drawBubbleStar(x, y, size, rotation, color, alpha) {
    bctx.save();
    bctx.translate(x, y);
    bctx.rotate(rotation);
    bctx.globalAlpha = alpha;
    bctx.fillStyle = color;
    const long = size;
    const short = size * 0.7;
    const pinch = size * 0.16;
    bctx.beginPath();
    bctx.moveTo(0, -long);
    bctx.quadraticCurveTo(pinch, -pinch, short, 0);
    bctx.quadraticCurveTo(pinch, pinch, 0, long);
    bctx.quadraticCurveTo(-pinch, pinch, -short, 0);
    bctx.quadraticCurveTo(-pinch, -pinch, 0, -long);
    bctx.fill();
    bctx.restore();
  }

  // 緩動：一開始快、最後慢（像氣球往上飄、慢慢停住）
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function drawBubbles(now) {
    bctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (let b = bursts.length - 1; b >= 0; b--) {
      const burst = bursts[b];
      const elapsed = now - burst.start;

      if (elapsed > BUBBLE_LIFE + 300) {
        bursts.splice(b, 1);
        continue;
      }

      // ① 波紋：從點往外擴散的圓圈（前 0.6 秒）
      const rippleT = elapsed / 600;
      if (rippleT < 1) {
        bctx.save();
        bctx.globalAlpha = (1 - rippleT) * 0.7;
        bctx.strokeStyle = "#C03A22";
        bctx.lineWidth = 1.5;
        bctx.beginPath();
        bctx.arc(burst.x, burst.y, 10 + easeOutCubic(rippleT) * 34, 0, Math.PI * 2);
        bctx.stroke();
        bctx.restore();
      }

      burst.stars.forEach((star) => {
        const t = Math.max(0, (elapsed - star.delay) / BUBBLE_LIFE); // 0 → 1
        if (t <= 0) return;

        // ② 往上飄：位置照緩動曲線移動，再加上左右輕輕搖晃
        const rise = easeOutCubic(Math.min(t / star.popAt, 1));
        const sway = Math.sin(t * 9 + star.wobble) * 5 * rise;
        const x = burst.x + star.dx * rise + sway;
        const y = burst.y + star.dy * rise;

        if (t < star.popAt) {
          // 細線：從點連到星星
          bctx.save();
          bctx.strokeStyle = STRING_COLOR;
          bctx.lineWidth = 1;
          bctx.beginPath();
          bctx.moveTo(burst.x, burst.y);
          // 用一點弧度，看起來像軟軟的線
          bctx.quadraticCurveTo(
            burst.x + star.dx * rise * 0.4 - sway,
            burst.y + star.dy * rise * 0.7,
            x, y + star.size * 0.9
          );
          bctx.stroke();
          bctx.restore();

          // 星星本體：冒出來時從小變大
          const grow = Math.min(t / 0.12, 1);
          drawBubbleStar(x, y, star.size * grow, star.spin * t * 3, star.color, 1);
        } else {
          // ③ 爆開：星星消失，變成往外噴的小火花線
          const popT = Math.min((t - star.popAt) / 0.18, 1);
          if (popT >= 1) return;

          bctx.save();
          bctx.globalAlpha = 1 - popT;
          bctx.strokeStyle = star.color;
          bctx.lineWidth = 2;
          bctx.lineCap = "round";
          const rays = 8;
          for (let r = 0; r < rays; r++) {
            const angle = (Math.PI * 2 * r) / rays + star.wobble;
            const inner = star.size * (0.4 + popT * 1.1);
            const outer = star.size * (0.8 + popT * 1.6);
            bctx.beginPath();
            bctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
            bctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
            bctx.stroke();
          }
          bctx.restore();
        }
      });
    }

    if (bursts.length) {
      requestAnimationFrame(drawBubbles);
    } else {
      bubbleLoopRunning = false;
      bctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  // ----- 判斷目前在哪一區，切換時冒星星 -----
  const visibleRatio = new Map();
  let activeIndex = -1;

  const dotObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => visibleRatio.set(entry.target, entry.intersectionRatio));

      // 哪一區佔畫面最多，就是目前的區塊
      let bestIndex = 0;
      let best = -1;
      sections.forEach(({ el }, index) => {
        const ratio = visibleRatio.get(el) || 0;
        if (ratio > best) {
          best = ratio;
          bestIndex = index;
        }
      });

      if (bestIndex === activeIndex) return;

      const isFirst = activeIndex === -1;
      activeIndex = bestIndex;

      // 告訴 CSS 目前在哪一區（例如在紅色第一格時，文字要換成奶黃色）
      dotNav.dataset.section = sections[activeIndex].el.id;
      // 背景是淺色（作品收藏、其他場次）→ 點和字用深色；其他深色背景 → 奶黃色
      dotNav.dataset.tone = sections[activeIndex].el.matches(".da-collection, .da-more") ? "light" : "dark";


      dots.forEach((dot, index) => {
        dot.classList.toggle("is-active", index === activeIndex);
        if (index === activeIndex) {
          dot.setAttribute("aria-current", "true");
        } else {
          dot.removeAttribute("aria-current");
        }
      });

      // 剛打開網頁時不冒，之後每次切換才冒
      if (!isFirst) releaseBubbles(dots[activeIndex]);
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] }
  );

  sections.forEach(({ el }) => dotObserver.observe(el));

})();


(() => {
  // ---------- 2. 每一頁的東西依序浮上來 ----------
  const pages = document.querySelectorAll("main > section");

  pages.forEach((page) => {
    // 同一頁裡的東西一個接一個浮上來（每個晚 0.08 秒）
    page.querySelectorAll(".da-reveal").forEach((el, i) => {
      el.style.transitionDelay = Math.min(i, 8) * 0.08 + "s";
    });
  });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.querySelectorAll(".da-reveal").forEach((el) => {
          el.classList.toggle("is-in", entry.isIntersecting);
        });
      });
    }, { threshold: 0.35 });
    pages.forEach((page) => io.observe(page));
  } else {
    document.querySelectorAll(".da-reveal").forEach((el) => el.classList.add("is-in"));
  }

  // ---------- 3. 還沒有圖的畫框 ----------
  const frames = [...document.querySelectorAll(".da-frame, .da-lettering, .vd-ticket, .td-sketch")];   // 畫框＋標準字都可以放大

  frames.forEach((frame) => {
    const img = frame.querySelector("img");
    if (!img) return;
    const markEmpty = () => frame.classList.add("is-empty");
    if (img.complete && img.naturalWidth === 0) markEmpty();
    img.addEventListener("error", markEmpty);
    img.addEventListener("load", () => frame.classList.remove("is-empty"));
  });

  // ---------- 4. 放大看作品 ----------
  const box = document.querySelector(".da-lightbox");
  if (!box) return;

  const boxImg = box.querySelector(".da-lb-img");
  const boxTitle = box.querySelector(".da-lb-title");
  const boxDesc = box.querySelector(".da-lb-desc");
  let list = [];        // 目前有圖的畫框
  let index = 0;
  let lastFocus = null;

  function show(i) {
    index = (i + list.length) % list.length;
    const frame = list[index];
    // 有好幾張疊在一起的畫框（例如白雪公主）：放大目前正在看的那一張
    const img = frame.querySelector("img.is-shown") || frame.querySelector("img");
    boxImg.src = img.currentSrc || img.src;
    boxImg.alt = img.alt;
    boxTitle.textContent = frame.dataset.title || img.alt || "";
    boxDesc.textContent = frame.dataset.desc || "";
    // 重新播一次跳出來的動畫
    boxImg.style.animation = "none";
    void boxImg.offsetWidth;
    boxImg.style.animation = "";
  }

  function open(frame) {
    list = frames.filter((f) => !f.classList.contains("is-empty"));
    const i = list.indexOf(frame);
    if (i < 0) return;
    lastFocus = document.activeElement;
    box.hidden = false;
    document.body.classList.add("da-lb-open");
    document.body.style.overflow = "hidden";   // 打開時後面不要捲動
    show(i);
    box.querySelector(".da-lb-close").focus();
    window.dispatchEvent(new CustomEvent("lian:pageturn"));   // 翻紙的聲音
  }

  function close() {
    box.hidden = true;
    document.body.classList.remove("da-lb-open");
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }

  frames.forEach((frame) => {
    frame.setAttribute("tabindex", "0");
    frame.setAttribute("role", "button");
    frame.addEventListener("click", () => open(frame));
    frame.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open(frame);
      }
    });
  });

  // 「View full artwork」這種按鈕：data-open 寫要打開哪一幅
  document.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const frame = document.querySelector(btn.dataset.open);
      if (frame) open(frame);
    });
  });

  box.querySelector(".da-lb-close").addEventListener("click", close);
  box.querySelector(".da-lb-prev").addEventListener("click", () => show(index - 1));
  box.querySelector(".da-lb-next").addEventListener("click", () => show(index + 1));

  // 點大圖旁邊的暗色區域也會關掉
  box.addEventListener("click", (event) => {
    if (event.target === box) close();
  });

  document.addEventListener("keydown", (event) => {
    if (box.hidden) return;
    if (event.key === "Escape") close();
    if (event.key === "ArrowLeft") show(index - 1);
    if (event.key === "ArrowRight") show(index + 1);
  });
})();


// =============================================
// 5. 膠囊切換（Liquid Bulge）：線稿 → 平塗 → 完成
//    點一個點：膠囊上緣鼓起來的小包像液體一樣滑過去（會稍微拉長、晃一下）
//    同時左邊大畫框裡的圖換成那個階段
// =============================================
(() => {
  document.querySelectorAll(".da-bulge").forEach((bar) => {
    const svg = bar.querySelector(".da-bulge-svg");
    const shape = bar.querySelector(".da-bulge-shape");
    const dot = bar.querySelector(".da-bulge-dot");
    const tabs = [...bar.querySelectorAll("[data-stage]")];
    const frame = document.querySelector(bar.dataset.target);
    const images = frame ? [...frame.querySelectorAll(".da-stage-img")] : [];

    // ---------- 可以自己調整的數值 ----------
    const STIFF = 170;     // 彈簧有多硬：越大滑越快
    const DAMP = 17;       // 阻力：越小越會晃
    const BUMP_W = 28;     // 鼓包的半寬
    const BUMP_H = 18;     // 鼓包的高度

    // 膠囊的位置（viewBox 是 300 × 64）
    const TOP = 26, BOTTOM = 56, R = 15, LEFT = 15, RIGHT = 285;
    // 點的位置平均分配（三個點：50、150、250；兩個點：75、225）
    const stops = tabs.map((_, i) => (i + 0.5) * 300 / tabs.length);
    bar.querySelector(".da-bulge-tabs").style.gridTemplateColumns = `repeat(${tabs.length}, 1fr)`;

    // 背景的小點（沒選到的階段）
    const ns = "http://www.w3.org/2000/svg";
    const smallDots = stops.map((x) => {
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", x);
      c.setAttribute("cy", (TOP + BOTTOM) / 2);
      c.setAttribute("r", 2.6);
      c.setAttribute("class", "da-bulge-small");
      svg.insertBefore(c, dot);
      return c;
    });

    let index = Math.max(0, tabs.findIndex((t) => t.getAttribute("aria-selected") === "true"));
    let x = stops[index], v = 0, target = x;
    let raf = 0, last = 0;

    function draw() {
      const speed = Math.abs(v);
      const bw = BUMP_W + Math.min(speed * 0.03, 18);          // 跑越快拉越長
      const h = BUMP_H - Math.min(speed * 0.012, 7);           // 跑越快越扁
      const lean = Math.max(-9, Math.min(9, v * 0.012));       // 頂端稍微落後，像被拖著走
      const cx = Math.max(LEFT + bw, Math.min(RIGHT - bw, x));
      const peak = cx - lean;
      const y = TOP - h;
      shape.setAttribute("d",
        `M${LEFT} ${TOP} L${cx - bw} ${TOP} ` +
        `C${cx - bw * 0.45} ${TOP} ${peak - bw * 0.55} ${y} ${peak} ${y} ` +
        `C${peak + bw * 0.55} ${y} ${cx + bw * 0.45} ${TOP} ${cx + bw} ${TOP} ` +
        `L${RIGHT} ${TOP} A${R} ${R} 0 0 1 ${RIGHT} ${BOTTOM} L${LEFT} ${BOTTOM} A${R} ${R} 0 0 1 ${LEFT} ${TOP} Z`);
      dot.setAttribute("cx", peak.toFixed(1));
      dot.setAttribute("cy", (y + 9).toFixed(1));
      // 鼓包經過的小點藏起來
      smallDots.forEach((c, i) => c.style.opacity = Math.abs(stops[i] - x) < 22 ? 0 : 1);
    }

    function tick(now) {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const a = STIFF * (target - x) - DAMP * v;
      v += a * dt;
      x += v * dt;
      draw();
      if (Math.abs(target - x) < 0.2 && Math.abs(v) < 2) {
        x = target; v = 0; draw(); raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    function select(i) {
      index = i;
      target = stops[i];
      tabs.forEach((t, k) => {
        t.setAttribute("aria-selected", k === i ? "true" : "false");
        t.tabIndex = k === i ? 0 : -1;
      });
      const stage = tabs[i].dataset.stage;
      images.forEach((img) => img.classList.toggle("is-shown", img.dataset.stage === stage));
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => select(i));
      // 鍵盤 ← → 也可以切
      tab.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          const next = (i + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          select(next);
          tabs[next].focus();
        }
      });
    });

    // 點膠囊本身：選最靠近的那個點
    svg.addEventListener("click", (event) => {
      const r = svg.getBoundingClientRect();
      const px = ((event.clientX - r.left) / r.width) * 300;
      let best = 0;
      stops.forEach((s, k) => { if (Math.abs(s - px) < Math.abs(stops[best] - px)) best = k; });
      select(best);
    });

    tabs.forEach((t, k) => (t.tabIndex = k === index ? 0 : -1));
    draw();
  });
})();


// =============================================
// 6. 其他分類的票：點下去會從中間被不規則地撕開，撕完才跳到那一頁
//    每次撕開的鋸齒線都是隨機的；撕口會露出一點奶黃色的紙纖維
// =============================================
(() => {
  const TEAR_TIME = 750;      // 撕開後多久跳到下一頁（毫秒）

  // 做一條從上到下、在中間附近左右亂跳的鋸齒線（回傳每個點的 x%、y%）
  function tearLine() {
    const points = [];
    const steps = 10 + Math.floor(Math.random() * 4);
    for (let i = 0; i <= steps; i++) {
      const y = (i / steps) * 100;
      const x = 50 + (Math.random() - 0.5) * (i % 2 ? 14 : 8);   // 一大一小的鋸齒
      points.push([x, y]);
    }
    return points;
  }

  // 用鋸齒線切出左半或右半的形狀；shift 是把撕口往外推一點（給紙纖維用）
  function halfPolygon(points, side, shift) {
    const edge = points.map(([x, y]) => `${(x + shift).toFixed(2)}% ${y.toFixed(2)}%`);
    return side === "left"
      ? `polygon(0% 0%, ${edge.join(", ")}, 0% 100%)`
      : `polygon(${edge.join(", ")}, 100% 100%, 100% 0%)`;
  }

  document.querySelectorAll(".da-ticket").forEach((ticket) => {
    ticket.addEventListener("click", (event) => {
      // 按住 Ctrl 之類的（開新分頁）就照平常
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (ticket.classList.contains("is-tearing")) return;

      const points = tearLine();
      const pieces = ["left", "right"].map((side) => {
        const piece = document.createElement("span");
        piece.className = "da-tear-piece";
        piece.setAttribute("aria-hidden", "true");

        // 撕口的紙纖維（奶黃色，比票面多露出一點點）
        const fiber = document.createElement("span");
        fiber.className = "da-tear-fiber";
        fiber.style.clipPath = halfPolygon(points, side, side === "left" ? 1.6 : -1.6);

        // 票面（把原本票上的字複製一份過來）
        const face = document.createElement("span");
        face.className = "da-tear-face";
        face.innerHTML = ticket.innerHTML;
        face.style.clipPath = halfPolygon(points, side, 0);

        piece.append(fiber, face);
        ticket.appendChild(piece);
        return { piece, side };
      });

      ticket.classList.add("is-tearing");
      window.dispatchEvent(new CustomEvent("lian:tear"));   // 撕票聲

      // 兩半往外翻、往下掉、淡出
      pieces.forEach(({ piece, side }) => {
        const dir = side === "left" ? -1 : 1;
        const spin = (8 + Math.random() * 10) * dir;
        piece.style.transformOrigin = side === "left" ? "0% 100%" : "100% 100%";
        piece.animate([
          { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
          { transform: `translate(${dir * 6}px, -4px) rotate(${dir * 4}deg)`, opacity: 1, offset: 0.25 },
          { transform: `translate(${dir * 46}px, 90px) rotate(${spin * 2}deg)`, opacity: 0 }
        ], { duration: 900, easing: "cubic-bezier(0.5, 0, 0.75, 0.4)", fill: "forwards" });
      });

      setTimeout(() => { window.location.href = ticket.href; }, TEAR_TIME);
    });
  });

  // 按上一頁回來時，把票恢復成完整的
  window.addEventListener("pageshow", () => {
    document.querySelectorAll(".da-ticket.is-tearing").forEach((ticket) => {
      ticket.classList.remove("is-tearing");
      ticket.querySelectorAll(".da-tear-piece").forEach((p) => p.remove());
    });
  });
})();


// =============================================
// 7. 海報大字自動縮到放得進海報
//    （DESIGN、GAMES 這種比較長的字，會自動縮小；ART 這種短的維持原本大小）
// =============================================
(() => {
  const title = document.querySelector(".da-title");
  if (!title) return;
  const lines = [...title.querySelectorAll("span")];

  function fit() {
    const room = title.clientWidth * 0.96;            // 海報裡可以放字的寬度（留一點邊）
    lines.forEach((line) => {
      line.style.fontSize = "";                       // 先回到 CSS 原本的大小
      const width = line.getBoundingClientRect().width;
      if (width > room) {
        const size = parseFloat(getComputedStyle(line).fontSize);
        line.style.fontSize = Math.floor(size * room / width) + "px";
      }
    });
  }

  fit();
  window.addEventListener("resize", fit);
  // 字體（Alfa Slab One）載入完字會變寬，再量一次
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  window.addEventListener("load", fit);
})();


// =============================================
// 8. 可以拖的小物件（例如萬聖節的門票）
//    - 誰都可以用滑鼠拖著玩；只是點一下（沒拖）就放大看
//    - 編輯模式：網址加 ?edit，拖完右下角會顯示位置數字，按 Copy 貼回 HTML 的 style 就固定了
//    - 編輯模式下，按住 Shift 滾滑鼠滾輪可以轉角度
// =============================================
(() => {
  const editMode = new URLSearchParams(location.search).has("edit");

  document.querySelectorAll(".vd-ticket").forEach((item) => {
    const page = item.closest("section");
    if (!page) return;
    let pointerId = null, startX = 0, startY = 0, baseX = 0, baseY = 0, moved = false, justDragged = false;

    // 編輯模式的小面板
    let panel = null;
    function showValues() {
      if (!editMode) return;
      const text = `--tx: ${parseFloat(item.style.getPropertyValue("--tx")).toFixed(1)}%; ` +
                   `--ty: ${parseFloat(item.style.getPropertyValue("--ty")).toFixed(1)}%; ` +
                   `--rot: ${parseFloat(item.style.getPropertyValue("--rot") || 6).toFixed(0)}deg;`;
      if (!panel) {
        panel = document.createElement("div");
        panel.className = "vd-edit-panel";
        panel.innerHTML = "<span></span><button type=\"button\">Copy</button>";
        panel.querySelector("button").addEventListener("click", () => {
          navigator.clipboard && navigator.clipboard.writeText(panel.querySelector("span").textContent);
          panel.querySelector("button").textContent = "Copied!";
          setTimeout(() => (panel.querySelector("button").textContent = "Copy"), 1200);
        });
        document.body.appendChild(panel);
      }
      panel.querySelector("span").textContent = text;
    }

    item.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (window.matchMedia("(max-width: 900px)").matches) return;   // 手機上不拖
      pointerId = event.pointerId;
      item.setPointerCapture(pointerId);
      startX = event.clientX;
      startY = event.clientY;
      baseX = parseFloat(getComputedStyle(item).left);
      baseY = parseFloat(getComputedStyle(item).top);
      moved = false;
    });

    item.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId) return;
      const dx = event.clientX - startX, dy = event.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true;
      item.classList.add("is-grabbed");
      // 換算成整頁的百分比，不能拖出這一頁
      const w = page.clientWidth, h = page.clientHeight;
      const x = Math.max(0, Math.min(w - item.offsetWidth, baseX + dx));
      const y = Math.max(0, Math.min(h - item.offsetHeight, baseY + dy));
      item.style.setProperty("--tx", (x / w * 100).toFixed(2) + "%");
      item.style.setProperty("--ty", (y / h * 100).toFixed(2) + "%");
      showValues();
    });

    function release(event) {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      item.classList.remove("is-grabbed");
      if (moved) justDragged = true;
    }
    item.addEventListener("pointerup", release);
    item.addEventListener("pointercancel", release);

    // 拖完放開時不要打開放大視窗
    item.addEventListener("click", (event) => {
      if (justDragged) {
        event.stopImmediatePropagation();
        justDragged = false;
      }
    }, true);

    // 編輯模式：Shift＋滾輪轉角度
    if (editMode) {
      item.addEventListener("wheel", (event) => {
        if (!event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        const rot = parseFloat(item.style.getPropertyValue("--rot") || 6) + (event.deltaY > 0 ? 1 : -1);
        item.style.setProperty("--rot", rot + "deg");
        showValues();
      }, { passive: false });
      showValues();
    }
  });
})();


// =============================================
// 9. Pixel Games：主線故事的書
//    - 上面的書籤直接跳章節，下面 Prev / Next 翻頁（有翻頁聲）
//    - 翻到的那一頁，文字會一個字一個字冒出來（有打字機聲）
//    - 劇透的章節有封蠟，點了才打開
// =============================================
(() => {
  const book = document.querySelector(".pg-book");
  if (!book) return;

  const spreads = [...book.querySelectorAll(".pg-spread")];
  const marks = [...document.querySelectorAll(".pg-bookmark")];
  const turns = [...document.querySelectorAll(".pg-turn")];
  const count = document.querySelector(".pg-book-count");
  let current = 0;

  // 把文字拆成一個一個字（保留粗體、斜體這些標籤），之後才能一個字一個字冒出來
  spreads.forEach((spread) => {
    const text = spread.querySelector(".pg-text");
    let i = 0;
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (!node.textContent.trim()) return;
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        // 中文沒有空格分詞，改成每兩個字一組冒出來
        const pieces = /[\u3400-\u9fff]/.test(part) ? part.match(/[A-Za-z0-9’'\-]+|[^A-Za-z0-9’'\-]{1,2}/g) : [part];   // 英文名字（例如 Isolde）不會被拆開
        pieces.forEach((piece) => {
          const w = document.createElement("span");
          w.className = "pg-w";
          w.textContent = piece;
          w.style.setProperty("--i", i++);
          frag.appendChild(w);
        });
      });
      node.replaceWith(frag);
    });
    spread.dataset.words = i;
  });

  // 開始寫字（重新播一次動畫＋打字機聲）
  let typeTimer = 0;
  function write(spread) {
    clearInterval(typeTimer);
    if (spread.classList.contains("is-sealed")) return;
    spread.querySelectorAll(".pg-w").forEach((w) => {
      w.style.animation = "none";
      void w.offsetWidth;
      w.style.animation = "";
    });
    // 每寫幾個字響一下打字機
    let ticks = Math.ceil((+spread.dataset.words || 0) / 5);
    typeTimer = setInterval(() => {
      if (ticks-- <= 0) return clearInterval(typeTimer);
      window.dispatchEvent(new CustomEvent("lian:gear-tick"));
    }, 80);
  }

  function show(index) {
    index = Math.max(0, Math.min(spreads.length - 1, index));
    if (index === current) return;
    const dir = index > current ? "is-next" : "is-prev";
    spreads[current].hidden = true;
    spreads[current].classList.remove("is-open", "is-next", "is-prev");
    current = index;
    const spread = spreads[current];
    spread.hidden = false;
    spread.classList.add("is-open", dir);
    setTimeout(() => spread.classList.remove("is-next", "is-prev"), 650);
    marks.forEach((m, k) => m.classList.toggle("is-active", k === current));
    count.textContent = `${current + 1} / ${spreads.length}`;
    turns[0].disabled = current === 0;
    turns[1].disabled = current === spreads.length - 1;
    window.dispatchEvent(new CustomEvent("lian:pageturn"));
    setTimeout(() => write(spread), 250);
  }

  marks.forEach((m, k) => m.addEventListener("click", () => show(k)));
  turns.forEach((t) => t.addEventListener("click", () => show(current + Number(t.dataset.turn))));
  turns[0].disabled = true;

  // 封蠟：點了裂開，再開始寫字
  book.querySelectorAll(".pg-seal").forEach((seal) => {
    seal.addEventListener("click", () => {
      const spread = seal.closest(".pg-spread");
      spread.classList.add("is-breaking");
      window.dispatchEvent(new CustomEvent("lian:tear"));
      setTimeout(() => {
        spread.classList.remove("is-sealed", "is-breaking");
        write(spread);
      }, 500);
    });
  });

  // 第一次捲到書的時候，第一頁開始寫字
  const io = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      write(spreads[current]);
      io.disconnect();
    }
  }, { threshold: 0.5 });
  io.observe(book);
})();


// =============================================
// 10. Pixel Games：Isolde 的小舞台
//     - 方向鍵走路：← → 側面走、↑ 背面往裡面走、↓ 正面往前走（也可以按畫面上的十字鍵）
//     - 停下來時播 idle，面向最後走的方向
//     - 資料卡上：膠囊切換 Idle / Walk、Front / Side / Back，下面把每一格攤開
//     - 圖是「橫的一整條」sprite sheet，每格大小一樣
// =============================================
(() => {
  const stage = document.querySelector(".pg-stage");
  if (!stage) return;

  const canvas = stage.querySelector(".pg-sprite");
  const ctx = canvas.getContext("2d");
  const framesBox = document.querySelector(".pg-frames");
  const info = document.querySelector(".pg-frames-info");
  const section = stage.closest("section");
  const counts = JSON.parse(stage.dataset.frames || "{}");
  const fpsOf = JSON.parse(stage.dataset.fps || '{"idle":4,"walk":10}');
  const facingRight = (stage.dataset.facing || "right") === "right";

  // ---------- 可以自己調整的數值 ----------
  const SPEED = 170;          // 走路速度（px／每秒）
  const FLOOR_BACK = 44;      // 走到最裡面時，腳在舞台底部往上幾 %（要跟 CSS 的地板高度差不多）
  const FLOOR_FRONT = 3;      // 走到最前面時
  const WANDER_AFTER = 4000;  // 多久沒人操作，她就自己開始閒晃（毫秒）

  // 載入六條動畫
  const sheets = {};
  let loaded = 0, total = 0;
  Object.keys(counts).forEach((key) => {
    const [anim, view] = key.split("-");
    const img = new Image();
    sheets[key] = { img, frames: counts[key], ok: false };
    total++;
    img.onload = () => { sheets[key].ok = true; done(); };
    img.onerror = done;
    img.src = stage.dataset.src.replace("{anim}", anim).replace("{view}", view);
  });

  let fw = 48, fh = 48, scale = 1;
  let previewAnim = "idle";
  let view = "front";         // 目前面向：front / side / back
  let facing = 1;             // 側面時：1 往右、-1 往左
  let dx = 0, dy = 0;
  let x = 0.5, y = 0.6;       // 舞台上的位置（左右 0～1、前後 0 裡面～1 前面）
  let target = null;          // 點舞台／閒晃時要走去的位置 {x, y}
  let lastInput = performance.now();
  let pauseUntil = 0;
  let frame = 0, acc = 0, last = 0, running = false, lastKey = "";

  function done() {
    if (++loaded < total) return;
    const any = Object.values(sheets).find((s) => s.ok);
    stage.classList.toggle("is-empty", !any);
    if (!any) return;
    fw = Math.round(any.img.width / any.frames);
    fh = any.img.height;
    canvas.width = fw;
    canvas.height = fh;
    resize();
    buildStrip();
    if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(loop);
    }
  }

  // 放大成整數倍（像素才會清楚），大約是舞台高度的一半
  function resize() {
    scale = Math.max(1, Math.floor((stage.clientHeight * 0.52) / fh));
    canvas.style.width = fw * scale + "px";
    canvas.style.height = fh * scale + "px";
  }
  window.addEventListener("resize", resize);

  function sheet(anim, v) {
    return sheets[`${anim}-${v}`] && sheets[`${anim}-${v}`].ok ? sheets[`${anim}-${v}`] : sheets["idle-front"];
  }

  function currentKey() {
    const moving = dx !== 0 || dy !== 0;
    return (moving ? "walk" : previewAnim) + "-" + view;
  }

  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    // 有目標點（點了舞台，或自己閒晃）：朝目標走
    const W = stage.clientWidth;
    const D = stage.clientHeight * (FLOOR_BACK - FLOOR_FRONT) / 100;   // 地板的深度（px）
    if (target) {
      const vx = (target.x - x) * W, vy = (target.y - y) * D;
      const dist = Math.hypot(vx, vy);
      if (dist < 3) {
        target = null;
        steer(0, 0);
        pauseUntil = now + 1200 + Math.random() * 2500;
      } else {
        steer(vx / dist, vy / dist, true);
      }
    } else if (dx === 0 && dy === 0 && now - lastInput > WANDER_AFTER && now > pauseUntil && inView) {
      // 自己閒晃：隨便挑一個地方走過去
      target = { x: 0.15 + Math.random() * 0.7, y: Math.random() };
    }

    const moving = dx !== 0 || dy !== 0;
    const anim = moving ? "walk" : previewAnim;
    const s = sheet(anim, view);

    // 換動畫時從第一格開始
    const key = currentKey();
    if (key !== lastKey) { lastKey = key; frame = 0; acc = 0; buildStrip(); }

    acc += dt;
    if (acc >= 1 / (fpsOf[anim] || 8)) {
      acc = 0;
      frame = (frame + 1) % s.frames;
      highlight();
    }

    if (moving) {
      const half = (fw * scale) / 2 / W;
      x = Math.max(half, Math.min(1 - half, x + (dx * SPEED * dt) / W));
      y = Math.max(0, Math.min(1, y + (dy * SPEED * dt) / Math.max(D, 1)));
    }

    ctx.clearRect(0, 0, fw, fh);
    ctx.save();
    if (view === "side" && (facing === 1) !== facingRight) { ctx.translate(fw, 0); ctx.scale(-1, 1); }
    ctx.drawImage(s.img, (frame % s.frames) * fw, 0, fw, fh, 0, 0, fw, fh);
    ctx.restore();
    canvas.style.left = `calc(${(x * 100).toFixed(2)}% - ${(fw * scale) / 2}px)`;
    canvas.style.bottom = (FLOOR_BACK - (FLOOR_BACK - FLOOR_FRONT) * y).toFixed(2) + "%";

    requestAnimationFrame(loop);
  }

  // 把目前動畫的每一格攤開
  function buildStrip() {
    if (!framesBox) return;
    const moving = dx !== 0 || dy !== 0;
    const anim = moving ? "walk" : previewAnim;
    const s = sheet(anim, view);
    if (!s || !s.ok) return;
    framesBox.innerHTML = "";
    for (let i = 0; i < s.frames; i++) {
      const c = document.createElement("canvas");
      c.width = fw;
      c.height = fh;
      const cx = c.getContext("2d");
      if (view === "side" && (facing === 1) !== facingRight) { cx.translate(fw, 0); cx.scale(-1, 1); }
      cx.drawImage(s.img, i * fw, 0, fw, fh, 0, 0, fw, fh);
      framesBox.appendChild(c);
    }
    if (info) info.textContent = `${anim} · ${view} — ${s.frames} frames · ${fpsOf[anim] || 8} fps · ${fw}×${fh} px`;
    highlight();
  }

  function highlight() {
    if (!framesBox) return;
    [...framesBox.children].forEach((c, i) => c.classList.toggle("is-current", i === frame));
  }

  // 資料卡：Idle / Walk
  document.querySelectorAll(".pg-anim-switch [data-stage]").forEach((tab) => {
    tab.addEventListener("click", () => { previewAnim = tab.dataset.stage; });
  });

  // 資料卡：Front / Side / Back
  const viewBtns = [...document.querySelectorAll(".pg-views [data-view]")];
  function setView(v) {
    view = v;
    viewBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.view === v));
  }
  viewBtns.forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

  // 依照走的方向換面向（斜著走時，看左右還是前後比較多）
  function steer(ndx, ndy, auto) {
    if (!auto) { target = null; lastInput = performance.now(); }
    dx = ndx;
    dy = ndy;
    if (dx === 0 && dy === 0) return;
    if (Math.abs(dx) >= Math.abs(dy) * 0.8) { facing = dx > 0 ? 1 : -1; setView("side"); }
    else if (dy < 0) setView("back");
    else setView("front");
  }

  // 點舞台：走到點的地方（點在牆上的話，走到地板最裡面那一排）
  stage.addEventListener("pointerdown", (event) => {
    if (stage.classList.contains("is-empty")) return;
    const r = stage.getBoundingClientRect();
    const fromBottom = (r.bottom - event.clientY) / r.height * 100;
    const ty = 1 - Math.max(0, Math.min(1, (fromBottom - FLOOR_FRONT) / (FLOOR_BACK - FLOOR_FRONT)));
    target = { x: (event.clientX - r.left) / r.width, y: ty };
    lastInput = performance.now();
    showMark(event.clientX - r.left, event.clientY - r.top);
  });

  // 點下去的地方冒一顆小星星
  function showMark(px, py) {
    const m = document.createElement("span");
    m.className = "pg-mark";
    m.textContent = "✦";
    m.style.left = px + "px";
    m.style.top = py + "px";
    stage.appendChild(m);
    setTimeout(() => m.remove(), 700);
  }

  // 鍵盤：只有這一格在畫面上、放大視窗沒開的時候才接收
  let inView = false;
  new IntersectionObserver((e) => { inView = e[0].intersectionRatio > 0.5; }, { threshold: [0, 0.5, 1] }).observe(section);

  const keyDir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const held = [];
  function fromHeld() {
    const k = held[held.length - 1];
    steer(k ? keyDir[k][0] : 0, k ? keyDir[k][1] : 0);
  }
  // 用「捕獲」先攔下來，才不會被卡頁的 ↑ ↓ 拿去捲頁面
  window.addEventListener("keydown", (event) => {
    if (!(event.key in keyDir) || !inView || document.body.classList.contains("da-lb-open")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!held.includes(event.key)) held.push(event.key);
    fromHeld();
  }, true);
  window.addEventListener("keyup", (event) => {
    if (!(event.key in keyDir)) return;
    const i = held.indexOf(event.key);
    if (i >= 0) held.splice(i, 1);
    fromHeld();
  }, true);

  // 畫面上的十字鍵（按住走路）
  document.querySelectorAll(".pg-key").forEach((btn) => {
    const go = (e) => { e.preventDefault(); btn.classList.add("is-pressed"); steer(Number(btn.dataset.dx), Number(btn.dataset.dy)); };
    const stop = () => {
      if (!btn.classList.contains("is-pressed")) return;
      btn.classList.remove("is-pressed");
      steer(0, 0);
    };
    btn.addEventListener("pointerdown", go);
    btn.addEventListener("pointerup", stop);
    btn.addEventListener("pointerleave", stop);
    btn.addEventListener("pointercancel", stop);
  });

  // =============================================
  // 資料卡上的六張小卡片（一直在動）＋動畫檢視器
  // =============================================
  const cards = [...document.querySelectorAll(".pg-anim-card")];
  const viewer = document.querySelector(".pg-viewer");

  // 小卡片：每張照自己的速度一直播
  function drawThumbs(now) {
    cards.forEach((card) => {
      const s = sheets[`${card.dataset.anim}-${card.dataset.view}`];
      if (!s || !s.ok) return;
      const c = card.querySelector("canvas");
      if (c.width !== fw) { c.width = fw; c.height = fh; }
      const f = Math.floor((now / 1000) * (fpsOf[card.dataset.anim] || 8)) % s.frames;
      const cx = c.getContext("2d");
      cx.clearRect(0, 0, fw, fh);
      cx.drawImage(s.img, f * fw, 0, fw, fh, 0, 0, fw, fh);
    });
    requestAnimationFrame(drawThumbs);
  }
  requestAnimationFrame(drawThumbs);

  if (!viewer) return;
  const vCanvas = viewer.querySelector(".pg-viewer-canvas");
  const vctx = vCanvas.getContext("2d");
  const vTitle = viewer.querySelector(".pg-viewer-title");
  const vMeta = viewer.querySelector(".pg-viewer-meta");
  const vCount = viewer.querySelector(".pg-viewer-count");
  const vStrip = viewer.querySelector(".pg-viewer-strip");
  const vPlay = viewer.querySelector(".pg-play");
  const vSpeed = viewer.querySelector(".pg-viewer-speed input");
  const vSpeedOut = viewer.querySelector(".pg-viewer-speed output");
  let vKey = "", vSheet = null, vFrame = 0, vPlaying = true, vFps = 10, vAcc = 0, vLast = 0, vOpen = false, lastFocus = null;

  function vDraw() {
    if (!vSheet) return;
    vctx.clearRect(0, 0, fw, fh);
    vctx.drawImage(vSheet.img, vFrame * fw, 0, fw, fh, 0, 0, fw, fh);
    vCount.textContent = `${vFrame + 1} / ${vSheet.frames}`;
    [...vStrip.children].forEach((b, i) => b.classList.toggle("is-current", i === vFrame));
  }

  function vLoop(now) {
    if (!vOpen) return;
    const dt = Math.min((now - vLast) / 1000, 0.1);
    vLast = now;
    if (vPlaying) {
      vAcc += dt;
      if (vAcc >= 1 / vFps) { vAcc = 0; vFrame = (vFrame + 1) % vSheet.frames; vDraw(); }
    }
    requestAnimationFrame(vLoop);
  }

  function setPlaying(on) {
    vPlaying = on;
    vPlay.textContent = on ? "❚❚" : "▶";
  }

  function step(d) {
    setPlaying(false);
    vFrame = (vFrame + d + vSheet.frames) % vSheet.frames;
    vDraw();
  }

  function openViewer(card) {
    vKey = `${card.dataset.anim}-${card.dataset.view}`;
    vSheet = sheets[vKey];
    if (!vSheet || !vSheet.ok) return;
    vCanvas.width = fw;
    vCanvas.height = fh;
    vFps = fpsOf[card.dataset.anim] || 8;
    vSpeed.value = vFps;
    vSpeedOut.textContent = vFps + " fps";
    vTitle.textContent = `${card.dataset.anim[0].toUpperCase() + card.dataset.anim.slice(1)} · ${card.dataset.view[0].toUpperCase() + card.dataset.view.slice(1)}`;
    vMeta.textContent = `${vSheet.frames} frames · ${fw} × ${fh} px`;

    // 每一格的小圖，點了直接跳到那一格
    vStrip.innerHTML = "";
    for (let i = 0; i < vSheet.frames; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", "Frame " + (i + 1));
      const c = document.createElement("canvas");
      c.width = fw;
      c.height = fh;
      c.getContext("2d").drawImage(vSheet.img, i * fw, 0, fw, fh, 0, 0, fw, fh);
      b.appendChild(c);
      b.addEventListener("click", () => { setPlaying(false); vFrame = i; vDraw(); });
      vStrip.appendChild(b);
    }

    vFrame = 0;
    setPlaying(true);
    lastFocus = document.activeElement;
    viewer.hidden = false;
    vOpen = true;
    document.body.classList.add("da-lb-open");      // 開著的時候不卡頁、角色不走
    document.body.style.overflow = "hidden";
    vDraw();
    vLast = performance.now();
    requestAnimationFrame(vLoop);
    viewer.querySelector(".pg-viewer-close").focus();
  }

  function closeViewer() {
    viewer.hidden = true;
    vOpen = false;
    document.body.classList.remove("da-lb-open");
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }

  cards.forEach((card) => card.addEventListener("click", () => openViewer(card)));
  viewer.querySelector(".pg-viewer-close").addEventListener("click", closeViewer);
  viewer.addEventListener("click", (e) => { if (e.target === viewer) closeViewer(); });
  viewer.querySelector('[data-act="prev"]').addEventListener("click", () => step(-1));
  viewer.querySelector('[data-act="next"]').addEventListener("click", () => step(1));
  vPlay.addEventListener("click", () => setPlaying(!vPlaying));
  vSpeed.addEventListener("input", () => {
    vFps = Number(vSpeed.value);
    vSpeedOut.textContent = vFps + " fps";
  });

  // 鍵盤：← → 一格一格、空白鍵播放／暫停、Esc 關掉（先攔下來，不讓角色走、不卡頁）
  window.addEventListener("keydown", (event) => {
    if (!vOpen) return;
    const k = event.key;
    if (k === "Escape") closeViewer();
    else if (k === "ArrowLeft") step(-1);
    else if (k === "ArrowRight") step(1);
    else if (k === " " && event.target.tagName !== "BUTTON") setPlaying(!vPlaying);
    else return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();


// =============================================
// 11. 3D Art：大螢幕＋底片小圖
//     - 點下面的小圖換張；滑鼠移到大圖上會出現左右箭頭
//     - 在這一頁時，鍵盤 ← → 也可以換張
//     - 點大圖可以放大看（用原本的放大視窗）
// =============================================
(() => {
  document.querySelectorAll(".td-gallery").forEach((gallery) => {
    const screen = gallery.querySelector(".td-screen");
    const img = screen.querySelector("img");
    const thumbs = [...gallery.querySelectorAll(".td-thumb")];
    const count = screen.querySelector(".td-count");
    const strip = gallery.querySelector(".td-strip");
    const section = gallery.closest("section");
    let index = 0, inView = false;

    // ---------- Liquid Wipe：下一張從旁邊推進來，交界是一條會晃、會發光的波浪 ----------
    const WIPE_TIME = 750;      // 推一次要多久（毫秒）
    const WAVE_AMP = 26;        // 波浪最大有多彎（px）
    const WAVES = 2.2;          // 從上到下有幾個波

    const over = document.createElement("img");          // 蓋在上面的「下一張」
    over.className = "td-wipe-img";
    over.alt = "";
    const svgNS = "http://www.w3.org/2000/svg";
    const edge = document.createElementNS(svgNS, "svg");  // 發光的波浪邊
    edge.setAttribute("class", "td-wipe-edge");
    const edgePath = document.createElementNS(svgNS, "path");
    edge.appendChild(edgePath);
    img.after(over, edge);

    let wiping = false, queued = null;

    function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    function wipe(src, dir, done) {
      wiping = true;
      window.dispatchEvent(new CustomEvent("lian:sfx", { detail: "swipe" }));   // 咻一聲
      over.src = src;
      const W = img.clientWidth, H = img.clientHeight;
      edge.setAttribute("viewBox", `0 0 ${W} ${H}`);
      over.style.display = edge.style.display = "block";
      const start = performance.now();
      const phase = Math.random() * Math.PI * 2;

      function frame(now) {
        const t = Math.min((now - start) / WIPE_TIME, 1);
        const e = easeInOut(t);
        const amp = WAVE_AMP * Math.sin(Math.PI * t);       // 中間最彎，頭尾變直
        // 波浪邊的 x 位置：往右推（dir=1）是從右邊進來
        const base = dir > 0 ? W * (1 - e) : W * e;
        const pts = [];
        const steps = 28;
        for (let k = 0; k <= steps; k++) {
          const y = (k / steps) * H;
          // 不能超出照片的左右兩邊
          const x = Math.max(0, Math.min(W, base + amp * Math.sin((k / steps) * Math.PI * 2 * WAVES + phase + t * 7)));
          pts.push([x, y]);
        }
        const edgeStr = pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(", ");
        over.style.clipPath = dir > 0
          ? `polygon(${edgeStr}, ${W + 40}px ${H}px, ${W + 40}px 0px)`
          : `polygon(-40px 0px, ${edgeStr}, -40px ${H}px)`;
        edgePath.setAttribute("d", "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L"));
        edge.style.opacity = Math.sin(Math.PI * t).toFixed(2);

        if (t < 1) return requestAnimationFrame(frame);
        img.src = src;
        // 等底下那張換好再拿掉上面那張，才不會閃一下
        const finish = () => {
          over.style.display = edge.style.display = "none";
          wiping = false;
          if (done) done();
        };
        img.complete ? finish() : img.addEventListener("load", finish, { once: true });
      }
      requestAnimationFrame(frame);
    }

    function show(i) {
      if (wiping) { queued = i; return; }
      const nextIndex = (i + thumbs.length) % thumbs.length;
      if (nextIndex === index) return;
      // 往後翻 → 從右邊推進來；往前翻 → 從左邊
      let dir = nextIndex > index ? 1 : -1;
      if (index === thumbs.length - 1 && nextIndex === 0) dir = 1;
      if (index === 0 && nextIndex === thumbs.length - 1) dir = -1;
      index = nextIndex;
      const src = thumbs[index].dataset.src;
      thumbs.forEach((t, k) => t.classList.toggle("is-active", k === index));
      count.textContent = `${index + 1} / ${thumbs.length}`;
      const t = thumbs[index];
      strip.scrollTo({ left: t.offsetLeft - strip.clientWidth / 2 + t.clientWidth / 2, behavior: "smooth" });

      const go = () => wipe(src, dir, () => {
        if (queued !== null) { const q = queued; queued = null; show(q); }
      });
      const pre = new Image();
      pre.onload = go;
      pre.onerror = go;
      pre.src = src;
    }

    thumbs.forEach((t, k) => t.addEventListener("click", () => show(k)));
    screen.querySelector(".td-prev").addEventListener("click", (e) => { e.stopPropagation(); show(index - 1); });
    screen.querySelector(".td-next").addEventListener("click", (e) => { e.stopPropagation(); show(index + 1); });

    // 只有這一頁在畫面上、放大視窗沒開的時候，← → 才換張
    new IntersectionObserver((e) => { inView = e[0].intersectionRatio > 0.5; }, { threshold: [0, 0.5, 1] }).observe(section);
    window.addEventListener("keydown", (event) => {
      if (!inView || document.body.classList.contains("da-lb-open")) return;
      if (event.key === "ArrowLeft") show(index - 1);
      else if (event.key === "ArrowRight") show(index + 1);
    });

    // 先把大圖都載下來，換張比較快
    window.addEventListener("load", () => thumbs.forEach((t) => { new Image().src = t.dataset.src; }));
  });
})();
