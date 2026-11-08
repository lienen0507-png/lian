// =============================================
// 網站互動特效（每一頁都會載入）
// 1. 游標換成黃色、拉長的 ✦ 星星，帶有慣性（會慢半拍、沉沉地跟著滑鼠）
//    碰到按鍵會晃、按下去會抖
// 2. 移動時，星星後面拖著一串大小、顏色都不同的圓形粉塵，粉塵也有慣性
// 3. 點擊時，不同顏色的小星星往四周爆開
// 粉塵和爆開的星星畫在一張透明的全螢幕畫布（canvas）上，比較順暢
// =============================================

// ---------- 參考色 ----------
const PALETTE = {
  red: "#C03A22",        // Retro Red
  copper: "#D58A4B",     // Copper
  dandelion: "#F0BE57",  // Dandelion
  cornflower: "#82AAC7", // Cornflower
  cream: "#F8EFD5"       // Cream（底色）
};

// 粉塵和爆開的星星會從這四色隨機挑（Cream 和底色一樣看不到，所以不用）
const EFFECT_COLORS = [PALETTE.red, PALETTE.copper, PALETTE.dandelion, PALETTE.cornflower];

// 隨機挑一個顏色
function randomColor() {
  return EFFECT_COLORS[Math.floor(Math.random() * EFFECT_COLORS.length)];
}

// 使用者在系統設定開啟「減少動態效果」時，特效會變少、變短
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 只有用滑鼠的裝置才換游標、才有粉塵（手機、平板用手指點，不需要）
const hasMouse = window.matchMedia("(pointer: fine)").matches;


// =============================================
// 可以自己調整的數值
// =============================================

// 游標星星的大小（寬 x 高，px）
const CURSOR_WIDTH = 38;
const CURSOR_HEIGHT = 56;

// 慣性：每一幀星星往滑鼠靠近多少（0～1）
// 數字越小越「重」、拖得越久；越大越跟手。0.12 左右是沉沉的感覺
const CURSOR_FOLLOW = 0.12;

// 移動時星星會往移動方向傾斜，這是最大傾斜角度（度）
const CURSOR_MAX_TILT = 22;

// 粉塵大小範圍（半徑，px）
const DUST_MIN_SIZE = 4;
const DUST_MAX_SIZE = 14;

// 點擊爆開的星星大小範圍（px）
const BURST_MIN_SIZE = 16;
const BURST_MAX_SIZE = 28;

// 粉塵密度：星星每移動多少 px 才噴一顆（數字越大越稀疏）
const DUST_SPACING = 16;

// 每一幀最多噴幾顆
const DUST_MAX_PER_FRAME = 3;

// 粉塵繼承星星速度的比例：越大，粉塵越會順著移動方向「甩」出去
const DUST_INHERIT = 0.35;

// 哪些東西算「按鍵」：碰到時星星會晃動
const INTERACTIVE = "a, button, input, label, select, textarea, [role='button']";


// =============================================
// 1. 星星游標
// =============================================

// 滑鼠實際位置（目標）
let mouseX = 0;
let mouseY = 0;

// 星星目前位置（會慢慢追向滑鼠）
let starX = 0;
let starY = 0;
let starTilt = 0;          // 目前傾斜角度
let hasMoved = false;      // 滑鼠是否已經進到畫面
let cursorHold = false;    // 正在拖 About Me 的技能滾輪：星星停在原地，放手後直接出現在滑鼠位置
const CURSOR_HOLD_TARGETS = ".about-skills-reel, .about-rosette";

let cursor = null;         // 星星元素，沒有滑鼠的裝置會是 null

// 用 SVG 畫一顆上下拉長的四角星（沒有外框）
function starSVG(width, height, fill) {
  const cx = width / 2;
  const cy = height / 2;
  const arm = width * 0.48;   // 左右兩角的長度（比上下短，所以看起來是拉長的）
  const pinch = width * 0.07; // 中間收腰的程度，越小越尖

  const path =
    `M${cx} 0 ` +
    `Q${cx + pinch} ${cy - pinch} ${cx + arm} ${cy} ` +
    `Q${cx + pinch} ${cy + pinch} ${cx} ${height} ` +
    `Q${cx - pinch} ${cy + pinch} ${cx - arm} ${cy} ` +
    `Q${cx - pinch} ${cy - pinch} ${cx} 0 Z`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<path d="${path}" fill="${fill}"/>` +
    `</svg>`
  );
}

if (hasMouse) {
  // ----- 游標需要的樣式（隱藏系統游標＋晃動動畫） -----
  const cursorStyle = document.createElement("style");
  cursorStyle.textContent = `
    /* 把系統原本的游標藏起來 */
    html, body, * {
      cursor: none !important;
    }

    /* 星星游標本體：固定在畫面上、不擋點擊、在最上層 */
    .star-cursor {
      position: fixed;
      left: 0;
      top: 0;
      z-index: 2147483647;
      pointer-events: none;
      opacity: 0;                 /* 滑鼠還沒進到畫面前先藏起來 */
      transition: opacity 150ms ease;
      will-change: transform;
    }

    .star-cursor.is-visible {
      opacity: 1;
    }

    /* 裡面這層負責放大、晃動，外層只負責位置和傾斜，兩者才不會互相打架 */
    .star-cursor-inner {
      display: block;
      transform-origin: 50% 50%;
      transition: transform 160ms ease;
      /* 沒有黑邊，改用銅色光暈讓星星在米白底上也看得清楚 */
      filter:
        drop-shadow(0 0 3px rgba(213, 138, 75, 0.9))
        drop-shadow(0 0 9px rgba(240, 190, 87, 0.8));
    }

    .star-cursor-inner svg {
      display: block;
    }

    /* 碰到按鍵：放大＋持續左右晃動 */
    .star-cursor.is-hover .star-cursor-inner {
      animation: star-wiggle 0.32s ease-in-out infinite;
    }

    /* 按下去：用力抖一下（優先於晃動） */
    .star-cursor.is-press .star-cursor-inner {
      animation: star-press 0.36s ease-out;
    }

    @keyframes star-wiggle {
      0%, 100% { transform: scale(1.25) rotate(0deg); }
      25%      { transform: scale(1.25) rotate(-14deg); }
      75%      { transform: scale(1.25) rotate(14deg); }
    }

    @keyframes star-press {
      0%   { transform: scale(1.25) rotate(0deg); }
      15%  { transform: scale(0.8, 0.7) translateX(-4px) rotate(-20deg); }
      35%  { transform: scale(1.45) translateX(4px) rotate(18deg); }
      55%  { transform: scale(1.1) translateX(-3px) rotate(-10deg); }
      75%  { transform: scale(1.3) translateX(2px) rotate(6deg); }
      100% { transform: scale(1.25) rotate(0deg); }
    }

    /* 使用者開啟「減少動態效果」時，不晃動，只放大 */
    @media (prefers-reduced-motion: reduce) {
      .star-cursor.is-hover .star-cursor-inner,
      .star-cursor.is-press .star-cursor-inner {
        animation: none;
        transform: scale(1.25);
      }
    }
  `;
  document.head.appendChild(cursorStyle);

  // ----- 建立星星游標 -----
  cursor = document.createElement("div");
  cursor.className = "star-cursor";
  cursor.setAttribute("aria-hidden", "true");
  cursor.innerHTML =
    `<span class="star-cursor-inner">${starSVG(CURSOR_WIDTH, CURSOR_HEIGHT, PALETTE.dandelion)}</span>`;
  document.body.appendChild(cursor);

  // ----- 記錄滑鼠位置（星星的實際移動在下方動畫迴圈裡處理） -----
  // 用 pointermove 而不是 mousemove：拖轉盤、拖聯絡區小物這類「按住拖」的時候，
  // 瀏覽器會暫停送 mousemove，星星就會卡住、放手時再飛過去
  document.addEventListener("pointermove", (event) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    mouseX = event.clientX;
    mouseY = event.clientY;

    // 第一次進到畫面時，星星直接出現在滑鼠位置，不要從角落飛過來
    if (!hasMoved) {
      starX = mouseX;
      starY = mouseY;
      hasMoved = true;
    }

    cursor.classList.add("is-visible");
  });

  // 滑鼠離開視窗就藏起來；回來時星星直接出現在新位置
  document.documentElement.addEventListener("mouseleave", () => {
    cursor.classList.remove("is-visible");
    hasMoved = false;
  });

  // ----- 碰到按鍵時開始晃動，離開時停止 -----
  document.addEventListener("mouseover", (event) => {
    const onButton = event.target.closest && event.target.closest(INTERACTIVE);
    cursor.classList.toggle("is-hover", Boolean(onButton));
  });

  // ----- 按下去時抖一下 -----
  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    if (event.target.closest && event.target.closest(CURSOR_HOLD_TARGETS)) cursorHold = true;
    cursor.classList.remove("is-press");
    void cursor.offsetWidth; // 讓瀏覽器重新計算，連續快速點擊時動畫才會重新播放
    cursor.classList.add("is-press");
  });

  // 放開滾輪：星星直接出現在滑鼠的位置（不要飛過去）
  const releaseHold = () => {
    if (!cursorHold) return;
    cursorHold = false;
    starX = mouseX;
    starY = mouseY;
  };
  document.addEventListener("pointerup", releaseHold);
  document.addEventListener("pointercancel", releaseHold);

  // 抖完就把「按下」的狀態拿掉，回到原本的樣子
  cursor.addEventListener("animationend", (event) => {
    if (event.animationName === "star-press") {
      cursor.classList.remove("is-press");
    }
  });
}


// =============================================
// 特效畫布：蓋在整個畫面上、不會擋到點擊
// =============================================
const canvas = document.createElement("canvas");
canvas.setAttribute("aria-hidden", "true");
canvas.style.cssText =
  "position:fixed; inset:0; width:100vw; height:100vh;" +
  "pointer-events:none; z-index:2147483646;";
document.body.appendChild(canvas);

const ctx = canvas.getContext("2d");

// 依螢幕大小與解析度調整畫布，避免在高解析螢幕上糊掉
function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * ratio;
  canvas.height = window.innerHeight * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// 畫面上所有的粉塵和星星都放在這個陣列裡
const particles = [];


// =============================================
// 2. 粉塵：從星星的位置噴出（在動畫迴圈裡呼叫）
// =============================================
let dustDistance = 0; // 累積的移動距離，用來控制密度

function spawnDust(fromX, fromY, toX, toY, moveX, moveY) {
  const distance = Math.hypot(toX - fromX, toY - fromY);

  // 累積移動距離，每走 DUST_SPACING px 噴一顆；移動越快噴越多（但有上限）
  dustDistance += distance;
  const count = Math.min(reduceMotion ? 1 : DUST_MAX_PER_FRAME, Math.floor(dustDistance / DUST_SPACING));
  dustDistance -= count * DUST_SPACING;
  if (dustDistance > DUST_SPACING) dustDistance = 0; // 超過上限的部分直接捨棄，避免累積

  for (let i = 0; i < count; i++) {
    const t = i / count; // 0～1，沿著這一段路徑平均分布

    // 大小：多數是小顆，偶爾出現大顆，看起來比較自然
    const size = DUST_MIN_SIZE + Math.pow(Math.random(), 2) * (DUST_MAX_SIZE - DUST_MIN_SIZE);

    particles.push({
      type: "dust",
      x: fromX + (toX - fromX) * t + (Math.random() - 0.5) * 12,
      y: fromY + (toY - fromY) * t + (Math.random() - 0.5) * 12,
      // 慣性：粉塵繼承星星的移動速度，會順著方向滑出去再慢慢停下
      vx: moveX * DUST_INHERIT + (Math.random() - 0.5) * 1.4,
      vy: moveY * DUST_INHERIT + (Math.random() - 0.5) * 1.4,
      size: size,
      color: randomColor(),
      life: 0,
      maxLife: 600 + Math.random() * 500 // 存活 0.6～1.1 秒
    });
  }
}


// =============================================
// 3. 點擊時彩色星星爆開
// =============================================
document.addEventListener("click", (event) => {
  const count = reduceMotion ? 6 : 14;

  for (let i = 0; i < count; i++) {
    // 平均分布在 360 度，再加一點隨機角度，比較自然
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 4.5 + Math.random() * 5.5;

    particles.push({
      type: "star",
      x: event.clientX,
      y: event.clientY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: BURST_MIN_SIZE + Math.random() * (BURST_MAX_SIZE - BURST_MIN_SIZE), // 星星大小
      rotation: Math.random() * Math.PI,    // 一開始的角度
      spin: (Math.random() - 0.5) * 0.3,    // 旋轉速度
      color: randomColor(),
      life: 0,
      maxLife: 700 + Math.random() * 300
    });
  }
});


// =============================================
// 畫圖用的小工具
// =============================================

// 畫一顆四角星 ✦（上下比左右長一點）
function drawStar(x, y, size, rotation, color, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;

  const long = size;          // 上下的長度
  const short = size * 0.7;   // 左右的長度
  const pinch = size * 0.16;  // 收腰

  ctx.beginPath();
  ctx.moveTo(0, -long);
  ctx.quadraticCurveTo(pinch, -pinch, short, 0);
  ctx.quadraticCurveTo(pinch, pinch, 0, long);
  ctx.quadraticCurveTo(-pinch, pinch, -short, 0);
  ctx.quadraticCurveTo(-pinch, -pinch, 0, -long);
  ctx.fill();
  ctx.restore();
}

// 每種顏色的「發光圓點」先畫好一張小圖存起來，之後直接貼上去
// （每一幀都即時算光暈很耗效能，會讓游標變卡）
const dustSprites = {};
const DUST_SPRITE_SIZE = 64;

function getDustSprite(color) {
  if (dustSprites[color]) return dustSprites[color];

  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = DUST_SPRITE_SIZE;
  const sctx = sprite.getContext("2d");
  const c = DUST_SPRITE_SIZE / 2;

  // 外圈光暈：同色、往外漸漸透明
  const glow = sctx.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, color);
  glow.addColorStop(0.4, color);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  sctx.globalAlpha = 0.45;
  sctx.fillStyle = glow;
  sctx.fillRect(0, 0, DUST_SPRITE_SIZE, DUST_SPRITE_SIZE);

  // 中間的實心圓點
  sctx.globalAlpha = 1;
  sctx.fillStyle = color;
  sctx.beginPath();
  sctx.arc(c, c, c * 0.4, 0, Math.PI * 2);
  sctx.fill();

  dustSprites[color] = sprite;
  return sprite;
}

// 畫一顆圓形粉塵（貼上預先畫好的發光圓點）
function drawDust(x, y, size, color, alpha) {
  const sprite = getDustSprite(color);
  const drawSize = size * 2.5; // 圓點半徑是圖的 0.4 倍，所以放大 2.5 倍讓圓點剛好是 size
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - drawSize, y - drawSize, drawSize * 2, drawSize * 2);
  ctx.globalAlpha = 1;
}


// =============================================
// 動畫主迴圈：每一幀移動星星游標、更新粉塵和星星、畫出來
// =============================================
let lastTime = performance.now();

function animate(now) {
  // 距離上一幀過了多久（限制最大值，避免切換分頁回來時跳很遠）
  const delta = Math.min(now - lastTime, 50);
  lastTime = now;
  const step = Math.max(delta / 16.67, 0.01); // 以 60fps 為基準的倍率

  // ----- 星星游標：帶慣性地追向滑鼠 -----
  if (cursor && hasMoved && !cursorHold) {
    const prevX = starX;
    const prevY = starY;

    // 每一幀往滑鼠靠近一部分距離 → 離得遠時移動快，接近時慢慢停下，有「重量感」
    const follow = 1 - Math.pow(1 - CURSOR_FOLLOW, step);
    starX += (mouseX - starX) * follow;
    starY += (mouseY - starY) * follow;

    // 這一幀星星移動了多少
    const moveX = starX - prevX;
    const moveY = starY - prevY;

    // 往移動方向傾斜，像被拖著走；停下來時慢慢回正
    const targetTilt = Math.max(-CURSOR_MAX_TILT, Math.min(CURSOR_MAX_TILT, (moveX / step) * 1.5));
    starTilt += (targetTilt - starTilt) * (1 - Math.pow(0.8, step));

    cursor.style.transform =
      `translate(${starX - CURSOR_WIDTH / 2}px, ${starY - CURSOR_HEIGHT / 2}px) rotate(${starTilt}deg)`;

    // 從星星走過的路徑噴出粉塵
    spawnDust(prevX, prevY, starX, starY, moveX / step, moveY / step);
  }

  // ----- 更新並畫出所有粉塵和星星 -----
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  // 從後面往前跑，這樣刪除時不會影響到還沒處理的
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += delta;

    // 壽命到了就移除
    if (p.life >= p.maxLife) {
      particles.splice(i, 1);
      continue;
    }

    const progress = p.life / p.maxLife; // 0 → 1

    if (p.type === "dust") {
      // 粉塵：順著慣性滑出去、慢慢減速、微微往下飄，越來越小、越來越透明
      p.vx *= Math.pow(0.95, step);
      p.vy = p.vy * Math.pow(0.95, step) + 0.03 * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      drawDust(p.x, p.y, p.size * (1 - progress * 0.75), p.color, 1 - progress);
    } else {
      // 星星：往外飛、受一點重力往下掉、一邊旋轉，最後淡出
      p.vx *= Math.pow(0.95, step);
      p.vy = p.vy * Math.pow(0.95, step) + 0.12 * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.rotation += p.spin * step;
      // 一開始快速放大，之後慢慢縮小
      const scale = progress < 0.15 ? progress / 0.15 : 1 - (progress - 0.15) * 0.6;
      drawStar(p.x, p.y, p.size * scale, p.rotation, p.color, 1 - progress * progress);
    }
  }

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
