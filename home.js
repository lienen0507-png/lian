// =============================================
// 首頁專用的滑動效果（只有 index.html 會載入）
// 1. 量出導覽列高度，讓每一格剛好卡在導覽列下方
// 2. 卡格：滾一下滑鼠就快速切到下一格，到位時稍微衝過頭再彈回來，並輕輕震一下（頓感）
//    （手機、平板用手指滑，改用瀏覽器內建的卡格，手感比較自然）
// 3. 每一區滑進畫面時，裡面的內容依序浮上來；離開後重置，下次回來會再播一次
// 4. 右側的區塊指示：一條線上的點，切換時冒出綁著細線的彩色星星（Bubble Float）
// =============================================

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

  // 首頁的四個區塊（順序就是由上到下）
  const sections = [
    { el: document.querySelector("#home"),    label: "Home" },
    { el: document.querySelector("#about"),   label: "About Me" },
    { el: document.querySelector("#works"),   label: "Arts" },
    { el: document.querySelector("#contact"), label: "Contact" }
  ].filter((s) => s.el);


  // =============================================
  // 1. 量導覽列高度
  //    把高度存成 CSS 變數 --nav-h，CSS 會用它來算每一格的高度和對齊位置
  // =============================================
  let navH = 0;

  function updateNavHeight() {
    navH = navbar ? navbar.offsetHeight : 0;
    root.style.setProperty("--nav-h", navH + "px");
    // 頁尾的高度也量一下：聯絡區會補滿「畫面 − 導覽列 − 頁尾」，滑到底才不會露出上面那格
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
  // 3. 內容依序浮上來
  // =============================================

  // 每一區裡，哪些東西要做「浮上來」的動畫
  const revealTargets = {
    home:    ".hero-content > *",
    about:   ".about-top, .about-strip, .about-card, .about-text-block",
    works:   ".works > .eyebrow, .works > h2, .works > .section-intro, .arts-ticket",
    contact: ".contact > *"
  };

  sections.forEach(({ el }) => {
    const items = el.querySelectorAll(revealTargets[el.id] || ":scope > *");

    items.forEach((item, index) => {
      item.classList.add("reveal");
      // --i 是第幾個，用來讓每個東西晚一點點出現（一個接一個）
      item.style.setProperty("--i", index);
    });
  });

  // 偵測每一區有沒有在畫面裡：進來就加上 is-in（播放動畫），離開就拿掉（重置）
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle("is-in", entry.isIntersecting);
      });
    },
    { threshold: 0.25 } // 該區有 25% 出現在畫面上才算「進來」
  );

  sections.forEach(({ el }) => revealObserver.observe(el));


  // =============================================
  // 4. 右側區塊指示（Bubble Float 效果）
  //    切換區塊時：
  //    ① 點的位置擴散出一圈波紋
  //    ② 冒出一串綁著細線的彩色星星，往左上飄、輕輕搖晃
  //    ③ 飄到最高點後，星星一顆顆爆開成小火花，細線跟著淡出
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
  dotNav.setAttribute("aria-label", "頁面區塊");

  const dots = sections.map(({ el, label }) => {
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

      // 上方導覽列：目前區塊的分頁凸起來
      document.querySelectorAll(".nav-tab").forEach((tab) => {
        tab.classList.toggle("is-active", tab.getAttribute("href") === "#" + sections[activeIndex].el.id);
      });

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

  // =============================================
  // About Me：在電腦上自動縮放，讓整格剛好在一個畫面裡看完
  // =============================================
  const aboutSection = document.querySelector("#about");
  const aboutInner = document.querySelector(".about-inner");

  function fitAbout() {
    if (!aboutSection || !aboutInner) return;
    aboutInner.style.zoom = "";

    // 手機、平板畫面窄，維持可以往下滑，不縮放
    if (window.innerWidth <= 860) return;

    const style = getComputedStyle(aboutSection);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const available = window.innerHeight - navH - padding;
    const needed = aboutInner.offsetHeight;

    if (needed > available) {
      // 等比例縮小，最多縮到 70%
      aboutInner.style.zoom = Math.max(available / needed, 0.7).toFixed(3);
    }
  }

  fitAbout();
  window.addEventListener("resize", fitAbout);
  window.addEventListener("load", fitAbout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAbout);


  // =============================================
  // About Me：My Skills 轉盤＋專長輪盤
  //   - 專長一個一個從下往上慢慢捲動（像拉霸機的滾筒），捲完無縫接回開頭
  //   - 左邊的轉盤跟著滾筒一起轉（像齒輪帶動）
  //   - 按住專長或轉盤上下拖，可以手動轉；放手後帶著慣性滑一下，再慢慢回到自動速度
  // =============================================
  (() => {
    const reel = document.querySelector(".about-skills-reel");
    const track = document.querySelector(".about-skills-track");
    const rosette = document.querySelector(".about-rosette");
    if (!reel || !track || !rosette) return;

    // ---------- 可以自己調整的數值 ----------
    const AUTO_SPEED = 22;        // 自動轉的速度（每秒幾 px），越大越快
    const FRICTION = 0.94;        // 放手後慣性減慢的程度（越接近 1 滑越久）
    const TICK_STEP = 24;         // 手動轉的時候，每轉過幾 px 就「喀」一聲（像齒輪，約半個專長的高度）
    const TICK_MIN_GAP = 50;      // 兩聲「喀」之間最少隔幾毫秒（最快每秒 20 下，才不會糊成一團）

    // 複製一份專長接在後面，轉到底時才能無縫接回開頭
    const firstSet = track.querySelector(".about-skills-set");
    track.appendChild(firstSet.cloneNode(true));

    let offset = 0;               // 目前轉了多遠（px）
    let velocity = AUTO_SPEED;    // 目前速度（每秒 px）
    let dragging = false;
    let lastY = 0;
    let lastMoveTime = 0;
    let dragVelocity = 0;
    let lastFrame = performance.now();
    let lastOffset = 0;           // 上一幀的位置（用來算這一幀轉了多少）
    let tickDistance = 0;         // 累積轉了多遠，滿 TICK_STEP 就「喀」一聲
    let lastTickTime = 0;
    let demoUntil = 0;            // 提示示範快轉的期間（這段時間不發出齒輪聲）

    // 手動轉的時候發出齒輪聲（通知 sound.js）
    function gearTicks(now) {
      const moved = Math.abs(offset - lastOffset);
      lastOffset = offset;

      // 只有「正在拖」或「放手後還在靠慣性滑」才響；自動慢慢轉的時候不響
      const manual = dragging || (Math.abs(velocity - AUTO_SPEED) > 40 && now > demoUntil);
      if (!manual) {
        tickDistance = 0;
        return;
      }

      tickDistance += moved;
      if (tickDistance >= TICK_STEP && now - lastTickTime >= TICK_MIN_GAP) {
        tickDistance %= TICK_STEP;
        lastTickTime = now;
        window.dispatchEvent(new CustomEvent("lian:gear-tick"));
      }
    }

    // 轉盤半徑：字移動多少，轉盤就轉多少角度
    function rosetteRadius() {
      return rosette.offsetWidth / 2 || 40;
    }

    function render() {
      const setHeight = firstSet.offsetHeight || 1;
      // 讓 offset 一直保持在 0～一組專長的高度之間，看起來就是無限循環
      const wrapped = ((offset % setHeight) + setHeight) % setHeight;
      track.style.transform = `translateY(${-wrapped}px)`;
      const angle = (offset / (2 * Math.PI * rosetteRadius())) * 360;
      rosette.style.transform = `translate(0, -50%) rotate(${angle}deg)`;
    }

    function frame(now) {
      const dt = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;

      if (!dragging) {
        if (reduceMotion) {
          velocity = 0;
        } else {
          // 放手後：速度慢慢回到自動速度（有慣性）
          velocity = AUTO_SPEED + (velocity - AUTO_SPEED) * Math.pow(FRICTION, dt * 60);
        }
        offset += velocity * dt;
      }

      render();
      gearTicks(now);
      requestAnimationFrame(frame);
    }

    // ----- 手動拖動 -----
    let dragMoved = 0;            // 這次拖動總共移動了多遠（用來分辨「拖」跟「點」）

    function startDrag(event) {
      dragging = true;
      demoUntil = 0;
      dragMoved = 0;
      lastY = event.clientY;
      lastMoveTime = performance.now();
      dragVelocity = 0;
      reel.classList.add("is-dragging");
      rosette.classList.add("is-dragging");
      event.preventDefault();

      // 用滑鼠拖的時候：把滑鼠「鎖」在原地（Pointer Lock），
      // 只讀滑鼠移動了多少來轉滾輪，滑鼠和星星游標都停在按下去的位置，放手後也不會跳走
      const el = event.currentTarget;
      if (event.pointerType === "mouse" && el.requestPointerLock) {
        try {
          const req = el.requestPointerLock();
          if (req && req.catch) req.catch(() => capture(el, event.pointerId));
        } catch (e) {
          capture(el, event.pointerId);
        }
      } else {
        capture(el, event.pointerId);
      }
    }

    // 鎖不了滑鼠時（例如瀏覽器不支援）：退回原本的做法
    function capture(el, id) {
      try { el.setPointerCapture(id); } catch (e) { /* 沒關係 */ }
    }

    function moveDrag(event) {
      if (!dragging) return;
      const now = performance.now();
      const locked = document.pointerLockElement === reel || document.pointerLockElement === rosette;
      const dy = locked ? -event.movementY : lastY - event.clientY;   // 往上拖 = 往前轉
      const dt = Math.max((now - lastMoveTime) / 1000, 0.001);
      offset += dy;
      dragMoved += Math.abs(dy);
      dragVelocity = dy / dt;
      lastY = event.clientY;
      lastMoveTime = now;
    }

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      // 放手時如果停了一下才放，就沒有慣性
      if (performance.now() - lastMoveTime > 80) dragVelocity = 0;
      velocity = Math.max(-2500, Math.min(2500, dragVelocity));
      reel.classList.remove("is-dragging");
      rosette.classList.remove("is-dragging");
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    }

    [reel, rosette].forEach((el) => {
      // 拖完放開時瀏覽器會當成一次點擊：真的有拖動的話就擋掉，才不會多響一聲「啵」、多炸一次星星
      el.addEventListener("click", (event) => {
        if (dragMoved > 4) event.stopPropagation();
      });
      el.addEventListener("pointerdown", startDrag);
      el.addEventListener("pointermove", moveDrag);
      el.addEventListener("pointerup", endDrag);
      el.addEventListener("pointercancel", endDrag);
      el.addEventListener("lostpointercapture", endDrag);
    });

    // 拖的時候按了 Esc 之類、滑鼠鎖被解開：當作放手
    document.addEventListener("pointerlockchange", () => {
      if (!document.pointerLockElement) endDrag();
    });

    requestAnimationFrame(frame);

    // ----- 提示：第一次碰到黃色區域時出現一次 -----
    //   紅色對話框彈出來＋轉盤外圍擴散黃色光圈＋轉盤自己示範快轉一下
    const strip = document.querySelector(".about-strip");
    const hint = document.querySelector(".about-spin-hint");
    const ring = document.querySelector(".about-spin-ring");
    let hintShown = false;

    function hideHint() {
      if (hint) hint.classList.remove("is-visible");
      if (ring) ring.classList.remove("is-visible");
    }

    if (strip && hint) {
      strip.addEventListener("pointerenter", () => {
        if (hintShown) return;           // 只出現一次
        hintShown = true;
        hint.classList.add("is-visible");
        if (ring) ring.classList.add("is-visible");

        // 示範：轉盤先往前快轉一下再慢下來（示範時不發出齒輪聲）
        if (!reduceMotion && !dragging) {
          demoUntil = performance.now() + 1400;
          velocity = 420;
        }

        setTimeout(hideHint, 4200);      // 幾秒後自己淡掉
      });
      // 一開始轉就收起來
      [reel, rosette].forEach((el) => el.addEventListener("pointerdown", hideHint));
    }
  })();


  // =============================================
  // About Me：照片輪播（自動淡入淡出切換，右邊的小圓點可以點）
  // =============================================
  (() => {
    const photos = [...document.querySelectorAll(".about-photo")];
    const dots = [...document.querySelectorAll(".about-dots button")];
    if (!photos.length) return;      // 只有一張照片時不輪播，但調整模式還是可以用

    const INTERVAL = 4500;      // 每張照片停多久（毫秒）
    let current = 0;
    let timer = null;

    function show(index) {
      current = (index + photos.length) % photos.length;
      photos.forEach((img, i) => img.classList.toggle("is-active", i === current));
      dots.forEach((dot, i) => {
        dot.classList.toggle("is-on", i === current);
        dot.setAttribute("aria-pressed", String(i === current));
      });
    }

    let restart = function () {
      clearInterval(timer);
      if (!reduceMotion && photos.length > 1) timer = setInterval(() => show(current + 1), INTERVAL);
    };

    dots.forEach((dot, i) => dot.addEventListener("click", () => {
      show(i);
      restart();   // 點了之後重新計時，才不會馬上又跳走
    }));

    restart();

    // =============================================
    // 照片調整模式：網址後面加上 ?edit 才會開啟（一般訪客看不到）
    //   - 用滑鼠拖照片：調整位置
    //   - 滾輪：放大縮小
    //   - 下方面板會顯示數字，按「複製設定」貼給 Claude，或自己貼到 index.html
    // =============================================
    if (!/[?&]edit\b/.test(location.search)) return;

    clearInterval(timer);                 // 調整時不要自動換照片
    restart = () => {};
    const frame = document.querySelector(".about-portrait");
    frame.classList.add("is-editing");

    function readPos(img) {
      const [x, y] = (img.style.getPropertyValue("--pos") || "50% 50%").split(" ").map(parseFloat);
      const z = parseFloat(img.style.getPropertyValue("--zoom")) || 1;
      return { x, y, z };
    }

    function writePos(img, p) {
      p.x = Math.max(0, Math.min(100, p.x));
      p.y = Math.max(0, Math.min(100, p.y));
      p.z = Math.max(1, Math.min(3, p.z));
      img.style.setProperty("--pos", `${p.x.toFixed(0)}% ${p.y.toFixed(0)}%`);
      img.style.setProperty("--zoom", p.z.toFixed(2));
      updatePanel();
    }

    // 下方的數字面板
    const panel = document.createElement("div");
    panel.className = "photo-edit-panel";
    panel.innerHTML = `
      <strong>照片調整模式</strong>
      <span>拖照片＝移動　滾輪＝放大縮小</span>
      <pre></pre>
      <button type="button">複製設定</button>
      <small></small>`;
    document.body.appendChild(panel);
    const pre = panel.querySelector("pre");
    const copyBtn = panel.querySelector("button");
    const copied = panel.querySelector("small");

    function settingsText() {
      return photos.map((img, i) => {
        const p = readPos(img);
        return `照片 ${i + 1}：--pos: ${p.x.toFixed(0)}% ${p.y.toFixed(0)}%; --zoom: ${p.z.toFixed(2)}`;
      }).join("\n");
    }

    function updatePanel() {
      pre.textContent = settingsText();
    }

    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(settingsText());
        copied.textContent = "已複製！貼給 Claude 就可以了";
      } catch (e) {
        copied.textContent = "沒辦法自動複製，請直接選取上面的文字";
      }
    });

    // 拖動：往右拖＝照片往右移
    let drag = null;
    frame.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".about-dots")) return;
      const img = photos[current];
      const rect = frame.getBoundingClientRect();
      drag = { img, startX: event.clientX, startY: event.clientY, start: readPos(img), w: rect.width, h: rect.height };
      frame.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    frame.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const dx = (event.clientX - drag.startX) / drag.w * 100;
      const dy = (event.clientY - drag.startY) / drag.h * 100;
      // object-position 的百分比方向跟拖的方向相反：拖向右，照片要往右，數字要變小
      writePos(drag.img, { x: drag.start.x - dx, y: drag.start.y - dy, z: drag.start.z });
    });

    frame.addEventListener("pointerup", () => { drag = null; });
    frame.addEventListener("pointercancel", () => { drag = null; });

    // 滾輪：放大縮小（攔下來，不要讓整頁捲動）
    frame.addEventListener("wheel", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const img = photos[current];
      const p = readPos(img);
      p.z *= event.deltaY < 0 ? 1.05 : 1 / 1.05;
      writePos(img, p);
    }, { passive: false });

    updatePanel();
  })();


  // =============================================
  // Arts 舞台：手電筒
  //   - 滑鼠在這一區時，舞台暗下來，只有滑鼠周圍一圈亮（游標變成手電筒的光）
  //   - 被光照到的票和標題會發出光暈、抖一抖
  //   - 手機、平板沒有滑鼠，不開手電筒
  // =============================================
  (() => {
    const stage = document.querySelector("#works");
    const dark = document.querySelector(".stage-dark");
    if (!stage || !dark || !hasMouse) return;

    const LIGHT_RADIUS = 170;   // 手電筒光圈的大小（px）
    const targets = [...stage.querySelectorAll(".arts-ticket, .arts-title")];
    stage.style.setProperty("--light-r", LIGHT_RADIUS + "px");
    stage.classList.add("has-flashlight");

    let inside = false;
    let mx = -999, my = -999;

    function update() {
      const rect = stage.getBoundingClientRect();
      stage.style.setProperty("--mx", (mx - rect.left) + "px");
      stage.style.setProperty("--my", (my - rect.top) + "px");

      // 光照到哪些東西：滑鼠離東西的距離比光圈小一點就算照到
      let ticketLit = false;
      targets.forEach((el) => {
        const r = el.getBoundingClientRect();
        const dx = Math.max(r.left - mx, 0, mx - r.right);
        const dy = Math.max(r.top - my, 0, my - r.bottom);
        const lit = inside && Math.hypot(dx, dy) < LIGHT_RADIUS * 0.35;
        el.classList.toggle("is-lit", lit);
        if (lit && el.classList.contains("arts-ticket")) ticketLit = true;
      });

      // 照到票：開始打鼓；光離開所有票：鼓聲停（通知 sound.js）
      if (ticketLit !== drumming) {
        drumming = ticketLit;
        window.dispatchEvent(new CustomEvent(drumming ? "lian:drum-start" : "lian:drum-stop"));
      }
    }

    let drumming = false;

    window.addEventListener("mousemove", (event) => {
      mx = event.clientX;
      my = event.clientY;
      const rect = stage.getBoundingClientRect();
      const nowInside = my >= rect.top && my <= rect.bottom && mx >= rect.left && mx <= rect.right;
      if (nowInside !== inside) {
        inside = nowInside;
        if (!inside) update();          // 離開舞台時把光暈和鼓聲都收掉
        document.body.classList.toggle("flashlight-on", inside);   // 游標星星藏起來
        stage.classList.toggle("is-dark", inside);
      }
      if (inside) update();
    });

    // 捲動時光圈要跟著滑鼠在畫面上的位置
    window.addEventListener("scroll", () => { if (inside) update(); }, { passive: true });

    document.documentElement.addEventListener("mouseleave", () => {
      inside = false;
      document.body.classList.remove("flashlight-on");
      stage.classList.remove("is-dark");
      targets.forEach((el) => el.classList.remove("is-lit"));
      if (drumming) { drumming = false; window.dispatchEvent(new CustomEvent("lian:drum-stop")); }
    });
  })();


  // =============================================
  // 5. 首頁的票根按鈕：按下去先沿著撕線撕開，再捲到作品區
  // =============================================

  // 捲到某一區（電腦用卡格動畫，手機用瀏覽器平滑捲動）
  function goToSection(id) {
    const target = document.getElementById(id);
    if (!target) return;
    if (hasMouse) {
      snapTo(Math.min(sectionTop(target), maxScroll()));
    } else {
      window.dispatchEvent(new CustomEvent("lian:pageturn"));
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    }
    history.replaceState(null, "", "#" + id);
  }

  const TEAR_TIME = 850;   // 撕開動畫多久之後開始捲動（毫秒）

  document.querySelectorAll(".ticket").forEach((ticket) => {
    ticket.addEventListener("click", (event) => {
      event.preventDefault(); // 先不要跳，等撕開動畫

      const href = ticket.getAttribute("href");
      if (ticket.classList.contains("is-torn")) return; // 正在撕，不重複

      // 連到同一頁的區塊（#works）就捲過去；連到別的頁面（digital-art.html…）就換頁
      const go = () => {
        if (href.startsWith("#")) goToSection(href.slice(1));
        else window.location.href = href;
      };

      if (reduceMotion) {
        go();
        return;
      }

      ticket.classList.add("is-torn");
      window.dispatchEvent(new CustomEvent("lian:tear")); // 通知 sound.js 播撕票聲
      setTimeout(go, TEAR_TIME);

      // 捲走之後把票根悄悄接回去，下次回來又是完整的一張票
      setTimeout(() => ticket.classList.remove("is-torn"), TEAR_TIME + 1200);
    });
  });
})();


// =============================================
// 聯絡區：馬戲團小物（有地心引力）
// - 一進到這一格：小物先停在半空中輕輕飄，過幾秒才受地心引力往下掉
// - 掉到最下面那條黑線（頁尾的上緣）就停，掉在別的小物上面會疊起來
// - 可以用滑鼠（或手指）抓起來拖、甩出去，放開後會再掉下來
// - 只是點一下（沒有拖）：才會打開連結
// - 離開這一格再回來，會重新飄在半空中再掉一次
// =============================================
(() => {
  const area = document.querySelector(".contact-circus");
  if (!area) return;

  // ---------- 可以自己調整的數值 ----------
  const FLOAT_TIME = 2200;   // 進到畫面後，在半空中停多久才開始掉（毫秒）
  const GRAVITY = 2600;      // 地心引力有多強：越大掉越快
  const BOUNCE = 0.3;        // 落地彈多高：0 = 不彈，1 = 彈回一樣高
  const SINK = 0.14;         // 疊在別的小物上時，可以陷進去多少（比例），看起來比較自然
  const DRAG_START = 6;      // 移動超過幾 px 才算「拖」，不然算「點」

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let topZ = 10;
  let gravityOn = false;
  let dropTimer = 0;
  let rafId = 0;
  let lastTime = 0;

  const bodies = [...area.querySelectorAll(".cx-item")].map((el) => ({
    el,
    dx: 0, dy: 0,        // 離開原本位置多少（px）
    vx: 0, vy: 0,        // 速度（px／秒）
    bx: 0, by: 0,        // 原本的位置（相對聯絡區的左上角）
    w: 0, h: 0,
    active: false,       // 有沒有受地心引力
    held: false          // 是不是正被抓著
  }));

  // 量出小物原本的位置和大小
  function measure(b) {
    const a = area.getBoundingClientRect();
    const r = b.el.getBoundingClientRect();
    b.w = r.width;
    b.h = r.height;
    b.bx = r.left - a.left - b.dx;
    b.by = r.top - a.top - b.dy;
  }

  function render(b) {
    b.el.style.setProperty("--dx", b.dx.toFixed(1) + "px");
    b.el.style.setProperty("--dy", b.dy.toFixed(1) + "px");
    // 往旁邊飛的時候會歪一點
    const tilt = Math.max(-20, Math.min(20, b.vx * 0.02));
    b.el.style.setProperty("--tilt", tilt.toFixed(1) + "deg");
  }

  // ---------- 每一格畫面算一次物理 ----------
  function step(dt) {
    const W = area.clientWidth;
    const floor = area.clientHeight;   // 聯絡區的最下面 = 黑線的位置

    bodies.forEach((b) => {
      if (!b.active || b.held || b.ghost) return;

      const prevBottom = b.by + b.dy + b.h;
      b.vy += GRAVITY * dt;
      b.dx += b.vx * dt;
      b.dy += b.vy * dt;

      // 左右的牆：撞到會彈回來
      const left = b.bx + b.dx;
      if (left < 0) { b.dx = -b.bx; b.vx = Math.abs(b.vx) * 0.4; }
      if (left + b.w > W) { b.dx = W - b.w - b.bx; b.vx = -Math.abs(b.vx) * 0.4; }

      // 找下面接得住的東西：地板，或是正下方的其他小物
      let ground = floor;
      const l = b.bx + b.dx, r = l + b.w;
      bodies.forEach((o) => {
        if (o === b || o.held || o.ghost) return;
        const ol = o.bx + o.dx, or = ol + o.w;
        const overlap = Math.min(r, or) - Math.max(l, ol);
        if (overlap < Math.min(b.w, o.w) * 0.35) return;   // 只擦到一點邊不算
        const top = o.by + o.dy + o.h * SINK;
        if (prevBottom <= top + 2 && top < ground) ground = top;
      });

      if (b.by + b.dy + b.h >= ground) {
        b.dy = ground - b.h - b.by;
        if (b.vy > 420) {
          if (b.vy > 900) squash(b);
          b.vy = -b.vy * BOUNCE;
        } else {
          b.vy = 0;
        }
        b.vx *= 0.82;                       // 在地上會慢慢停下來
        if (Math.abs(b.vx) < 5) b.vx = 0;
      }

      render(b);
    });
  }

  function loop(time) {
    const dt = Math.min((time - lastTime) / 1000, 1 / 30);
    lastTime = time;
    if (dt > 0) step(dt);
    rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // 落地壓扁一下
  function squash(b) {
    b.el.classList.remove("is-dropped");
    void b.el.offsetWidth;
    b.el.classList.add("is-dropped");
  }

  // ---------- 開始掉／重新飄起來 ----------
  function startGravity() {
    gravityOn = true;
    area.classList.remove("cx-floating");
    area.classList.add("cx-fallen");
    bodies.forEach((b) => {
      if (b.held) return;
      measure(b);
      // 每個小物晚一點點才掉，不會全部同時落下
      setTimeout(() => { if (gravityOn) b.active = true; }, Math.random() * 450);
    });
    startLoop();
  }

  function resetFloat() {
    clearTimeout(dropTimer);
    stopLoop();
    gravityOn = false;
    area.classList.remove("cx-fallen");
    area.classList.add("cx-floating");
    bodies.forEach((b) => {
      b.dx = b.dy = b.vx = b.vy = 0;
      b.active = false;
      b.held = false;
      b.ghost = false;
      b.el.classList.remove("is-grabbed", "is-dropped", "is-popping", "is-popped", "is-inflating");
      render(b);
    });
  }

  // 進到這一格：先飄著，過幾秒才掉；離開：重置
  new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        resetFloat();
        dropTimer = setTimeout(startGravity, reduceMotion ? 300 : FLOAT_TIME);
      } else {
        resetFloat();
      }
    });
  }, { threshold: 0.4 }).observe(area);

  window.addEventListener("resize", () => {
    bodies.forEach(measure);
  });

  // ---------- 拖拉 ----------
  bodies.forEach((b) => {
    const item = b.el;
    let pointerId = null;
    let startX = 0, startY = 0, baseDx = 0, baseDy = 0;
    let lastX = 0, lastY = 0, lastT = 0, velX = 0, velY = 0;
    let moved = false;
    let justDragged = false;

    item.addEventListener("dragstart", (event) => event.preventDefault());

    item.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || b.ghost) return;   // 爆掉的氣球抓不起來
      pointerId = event.pointerId;
      item.setPointerCapture(pointerId);
      startX = lastX = event.clientX;
      startY = lastY = event.clientY;
      lastT = performance.now();
      baseDx = b.dx;
      baseDy = b.dy;
      velX = velY = 0;
      moved = false;
      measure(b);
    });

    item.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId) return;
      const mx = event.clientX - startX;
      const my = event.clientY - startY;

      if (!moved) {
        if (Math.hypot(mx, my) < DRAG_START) return;
        moved = true;
        b.held = true;
        b.vx = b.vy = 0;
        item.style.zIndex = ++topZ;
        item.classList.remove("is-dropped");
        item.classList.add("is-grabbed");
      }

      // 不能拖出聯絡區
      const W = area.clientWidth, H = area.clientHeight;
      b.dx = Math.max(-b.bx, Math.min(W - b.w - b.bx, baseDx + mx));
      b.dy = Math.max(-b.by, Math.min(H - b.h - b.by, baseDy + my));

      // 記住甩的速度，放開時用
      const now = performance.now();
      const t = Math.max((now - lastT) / 1000, 0.001);
      velX = velX * 0.6 + ((event.clientX - lastX) / t) * 0.4;
      velY = velY * 0.6 + ((event.clientY - lastY) / t) * 0.4;
      lastX = event.clientX;
      lastY = event.clientY;
      lastT = now;

      item.style.setProperty("--dx", b.dx + "px");
      item.style.setProperty("--dy", b.dy + "px");
      item.style.setProperty("--tilt", Math.max(-18, Math.min(18, velX * 0.015)).toFixed(1) + "deg");
    });

    function release(event) {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      if (!moved) return;
      justDragged = true;
      b.held = false;
      item.classList.remove("is-grabbed");
      // 停太久才放開就不算甩
      if (performance.now() - lastT > 80) velX = velY = 0;
      b.vx = Math.max(-1600, Math.min(1600, velX));
      b.vy = Math.max(-1600, Math.min(1600, velY));
      // 放開之後就受地心引力（還在飄的時候抓下來的，也會自己掉）
      b.active = true;
      startLoop();
    }
    item.addEventListener("pointerup", release);
    item.addEventListener("pointercancel", release);

    item.addEventListener("animationend", (event) => {
      if (event.animationName === "cx-drop") item.classList.remove("is-dropped");
    });

    // 剛拖完放開時，瀏覽器會以為是「點擊」：擋掉，才不會一放開就打開連結
    item.addEventListener("click", (event) => {
      if (justDragged) {
        event.preventDefault();
        event.stopImmediatePropagation();   // 也不要觸發下面的「複製 Email」
        justDragged = false;
      }
    });
  });

  // ---------- 點票：複製 Email，跳出「Copied!」 ----------
  // 想換信箱：改 index.html 票上面的 data-copy（href 的 mailto: 也一起改）
  area.querySelectorAll("[data-copy]").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      const text = item.dataset.copy;
      copyText(text).then(
        () => showBubble(item, "Copied!", text),
        () => showBubble(item, "Oops!", text)
      );
    });
  });

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    return fallbackCopy(text);
  }

  // 舊瀏覽器用的複製方法
  function fallbackCopy(text) {
    return new Promise((resolve, reject) => {
      const box = document.createElement("textarea");
      box.value = text;
      box.setAttribute("readonly", "");
      box.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
      document.body.appendChild(box);
      box.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      box.remove();
      ok ? resolve() : reject();
    });
  }

  // 在小物上方冒出一個奶黃色對話泡泡，過一下就消失
  let bubble = null, bubbleTimer = 0;
  function showBubble(item, title, small) {
    if (bubble) bubble.remove();
    clearTimeout(bubbleTimer);

    bubble = document.createElement("div");
    bubble.className = "cx-bubble";
    bubble.setAttribute("role", "status");
    bubble.innerHTML = "<strong></strong><small></small>";
    bubble.querySelector("strong").textContent = title + " ✦";
    bubble.querySelector("small").textContent = small;
    area.appendChild(bubble);

    const a = area.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    const w = bubble.offsetWidth;
    const x = Math.max(8, Math.min(a.width - w - 8, r.left - a.left + r.width / 2 - w / 2));
    const y = Math.max(8, r.top - a.top - bubble.offsetHeight - 14);
    bubble.style.left = x + "px";
    bubble.style.top = y + "px";
    // 泡泡下面的小尖角對準票的中間
    bubble.style.setProperty("--tail", (r.left - a.left + r.width / 2 - x) + "px");

    const current = bubble;
    bubbleTimer = setTimeout(() => {
      current.classList.add("is-leaving");
      setTimeout(() => current.remove(), 350);
    }, 1800);
  }

  // =============================================
  // 點氣球：爆炸；點爆米花：跳出爆米花
  // （碎片和爆米花都會受地心引力掉到黑線上，過一下就淡掉）
  // =============================================
  const particles = [];
  let particleRaf = 0, particleLast = 0;

  // 產生一個會飛的小東西：x、y 是聯絡區裡的位置，vx、vy 是速度
  function addParticle(el, x, y, vx, vy, life, spin) {
    el.classList.add("cx-particle");
    area.appendChild(el);
    particles.push({ el, x, y, vx, vy, life, age: 0, rot: Math.random() * 360, spin, w: el.offsetWidth, h: el.offsetHeight });
    if (!particleRaf) {
      particleLast = performance.now();
      particleRaf = requestAnimationFrame(particleLoop);
    }
  }

  function particleLoop(time) {
    const dt = Math.min((time - particleLast) / 1000, 1 / 30);
    particleLast = time;
    const floor = area.clientHeight, W = area.clientWidth;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      p.vy += GRAVITY * 0.8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      // 掉到黑線上：彈一下、在地上滑一點點
      if (p.y + p.h > floor) {
        p.y = floor - p.h;
        p.vy = -p.vy * 0.35;
        p.vx *= 0.7;
        p.spin *= 0.6;
      }
      if (p.x < 0 || p.x + p.w > W) p.vx = -p.vx * 0.5;
      // 最後 0.5 秒淡掉
      const fade = Math.max(0, Math.min(1, (p.life - p.age) / 0.5));
      p.el.style.transform = "translate(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px) rotate(" + p.rot.toFixed(0) + "deg)";
      p.el.style.opacity = fade;
      if (p.age >= p.life) {
        p.el.remove();
        particles.splice(i, 1);
      }
    }
    particleRaf = particles.length ? requestAnimationFrame(particleLoop) : 0;
  }

  const rand = (min, max) => min + Math.random() * (max - min);

  // ----- 氣球 -----
  bodies.filter((b) => b.el.classList.contains("cx-balloon")).forEach((b) => {
    b.el.addEventListener("click", () => {
      if (b.ghost) return;
      const a = area.getBoundingClientRect();
      const r = b.el.getBoundingClientRect();
      const cx = r.left - a.left + r.width / 2;
      const cy = r.top - a.top + r.height * 0.33;   // 氣球圓圓的那一塊的中心

      b.ghost = true;                   // 爆掉後：上面的東西會掉下來，也抓不起來
      window.dispatchEvent(new CustomEvent("lian:sfx", { detail: "balloon" }));   // 爆炸聲
      b.el.classList.add("is-popping");
      setTimeout(() => {
        b.el.classList.remove("is-popping");
        b.el.classList.add("is-popped");
      }, 140);

      // 藍色碎片往四面八方飛
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2 + rand(-0.2, 0.2);
        const sp = rand(350, 750);
        const el = document.createElement("span");
        el.className = "cx-shard";
        addParticle(el, cx, cy, Math.cos(ang) * sp, Math.sin(ang) * sp - 200, rand(1.6, 2.4), rand(-720, 720));
      }
      // 彩色紙花
      const colors = ["#F0BE57", "#F8EFD5", "#C03A22", "#C8C078"];
      for (let i = 0; i < 16; i++) {
        const el = document.createElement("span");
        el.className = "cx-confetti";
        el.style.background = colors[i % colors.length];
        addParticle(el, cx, cy, rand(-450, 450), rand(-900, -300), rand(2, 2.8), rand(-540, 540));
      }
      // 中間冒出 POP!
      const word = document.createElement("span");
      word.className = "cx-pop-word";
      word.textContent = "POP!";
      addParticle(word, cx - 45, cy - 20, 0, -500, 0.9, 0);

      // 過 3 秒，氣球再吹回來
      setTimeout(() => {
        if (!b.ghost) return;           // 已經被重置了
        b.ghost = false;
        b.vx = b.vy = 0;
        b.el.classList.remove("is-popped");
        b.el.classList.add("is-inflating");
        setTimeout(() => b.el.classList.remove("is-inflating"), 700);
        if (gravityOn) { b.active = true; startLoop(); }
      }, 3000);
    });
  });

  // ----- 爆米花 -----
  bodies.filter((b) => b.el.classList.contains("cx-popcorn")).forEach((b) => {
    b.el.addEventListener("click", () => {
      const a = area.getBoundingClientRect();
      const r = b.el.getBoundingClientRect();
      const cx = r.left - a.left + r.width / 2;
      const top = r.top - a.top + r.height * 0.2;

      window.dispatchEvent(new CustomEvent("lian:sfx", { detail: "popcorn" }));   // 噼哩啪啦
      b.el.classList.remove("is-popping");
      void b.el.offsetWidth;
      b.el.classList.add("is-popping");
      setTimeout(() => b.el.classList.remove("is-popping"), 450);

      // 一顆一顆跳出來（有一點點時間差）
      for (let i = 0; i < 9; i++) {
        setTimeout(() => {
          const el = document.createElement("span");
          el.className = "cx-kernel";
          addParticle(el, cx + rand(-30, 20), top + rand(-10, 10), rand(-380, 380), rand(-1300, -800), rand(2.6, 3.6), rand(-400, 400));
        }, i * 45);
      }
    });
  });
})();
