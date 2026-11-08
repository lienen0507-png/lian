// =============================================
// 互動音效（每一頁都會載入）
// 盡量做成「真實」的紙張聲音，全部用瀏覽器的 Web Audio 即時合成，不需要音效檔
//
// - 碰到會彈跳的物件（分頁、票根、作品卡、名牌…）：老式打字機的一下按鍵聲
// - 翻頁（首頁切換格子、點連結到別的頁面）：紙張滑動聲
// - 點擊：泡泡「啵」（sounds/click.mp3）
// - 手動轉 My Skills 滾筒：像齒輪一樣連續的打字機聲
// - 手電筒照到 Arts 的票：鼓聲（光離開就淡出）
// - 撕票：真實的撕紙聲（很多細小的紙纖維斷裂聲組成）
// - 左下角直立的控制：可以開關音效、調音量；設定會記住
// - 想換成自己找的真實音效：把檔案放進 sounds 資料夾（檔名見下面 SOUND_FILES）
// - 瀏覽器規定網頁不能自己出聲，所以要等訪客第一次點擊或按鍵後，音效才會開始
// =============================================

(() => {
  // ---------- 可以自己調整的數值 ----------
  const DEFAULT_VOLUME = 0.8;   // 預設音量（0～1）
  const MAX_GAIN = 0.9;         // 音量開到最大時的實際響度
  const START_ON = true;        // 第一次來的訪客，預設要不要開音效

  // 哪些東西碰到會響：只有滑過時會「彈跳、抬起、轉動」的物件
  const PAPER_TARGETS = [
    ".nav-tab",              // 上方分頁（會往上長）
    ".ticket",               // 首頁票根（會跳出來）
    ".work-card",            // 作品分類卡（會往上浮）
    ".about-plaque",         // About 的名牌（會轉一下）
    ".about-board",          // About 的看板（上面的小牌子會轉）
    ".about-ribbon-nav a",   // About 緞帶上的標籤（會跳）
    ".about-card-blue",      // Currently 小卡（會往上浮）
    ".about-cta",            // Read My Story（箭頭會彈）
    ".contact-button",       // 聯絡按鈕（會壓下去）
    ".cx-item",              // 聯絡區可以拖的馬戲團小物
    ".da-frame",             // Digital Art：掛起來的畫
    ".da-admit",             // Digital Art：海報上的票
    ".da-button",            // Digital Art：按鈕
    ".da-step",              // Digital Art：創作過程的告示牌
    ".da-ticket",            // Digital Art：其他分類的票
    ".td-sketch",            // 3D Art：貼在旁邊的角色設計圖
    ".td-thumb",             // 3D Art：底片小圖
    ".vd-ticket",            // Visual Design：萬聖節門票
    ".pg-anim-card"          // Pixel Games：Isolde 的動畫小卡片
  ].join(", ");

  // ---------- 想用自己找的真實音效檔 ----------
  // 把音效檔放進 sounds 資料夾，檔名照下面取，就會自動改用你的音效檔；
  // 沒有放的話，會用這個檔案裡合成的聲音代替
  // 同一種聲音可以放好幾個檔案（用 [ ] 列出來），每次會隨機挑一個，聽起來比較自然
  const SOUND_FILES = {
    hover:    ["./sounds/hover.mp3"],  // 碰到會彈跳的物件（老式打字機的一下按鍵聲）
    pageturn: ["./sounds/hover1.mp3", "./sounds/hover2.mp3", "./sounds/hover3.mp3"],  // 翻頁：換到別的畫面時（紙張滑動聲）
    click:    ["./sounds/click.mp3"],  // 點擊（沒放檔案就不出聲）
    tear:     ["./sounds/tear.mp3"],   // 撕票
    drumroll: ["./sounds/drumroll.wav"], // 手電筒照到 Arts 的票時：鼓聲（可以無縫循環，用 wav 才不會有空隙）
    balloon:  ["./sounds/balloon-pop.mp3"], // Contact：點氣球爆炸
    popcorn:  ["./sounds/popcorn.mp3"],     // Contact：點爆米花（噼哩啪啦）
    swipe:    ["./sounds/swipe.mp3"],       // 3D Art：換照片（Liquid Wipe）時咻一聲
    curtain:  ["./sounds/curtain.mp3"]      // 作品頁點上方導覽列：布幕拉上的「唰」（curtain.js）
  };

  // 點連結換到別的頁面時，等多久才真的跳過去（毫秒），讓翻頁聲播得出來
  const PAGE_LEAVE_DELAY = 260;

  // ---------- 同一時間只播一個音效 ----------
  // 優先順序：撕票 > 翻頁 > 游標（碰到東西、點擊）
  // 高優先的音效在播時，低優先的不會出聲；高優先的一開始，正在播的低優先音效會被停掉
  const PRIORITY = { tear: 3, pageturn: 2, drum: 1.5, fx: 1.2, cursor: 1 };   // fx = 氣球、爆米花

  // 每種音效「佔用」多久（毫秒），這段時間內比它低或一樣的音效不會出聲
  // 撕票設長一點，蓋過撕完後捲到作品區的翻頁聲，整段只聽到撕票聲
  const BUSY_TIME = { tear: 1400, pageturn: 650, drum: 1e9, fx: 300, cursor: 150 };   // 鼓聲會一直響到停為止


  // ---------- 記住設定 ----------
  const STORAGE_KEY = "lian-sound";

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved.volume === "number") return saved;
    } catch (e) { /* 讀不到就用預設值 */ }
    return { on: START_ON, volume: DEFAULT_VOLUME };
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) { /* 存不了也沒關係 */ }
  }

  const settings = loadSettings();


  // =============================================
  // 同一時間只播一個音效：排隊與插隊
  // =============================================
  let busyUntil = 0;       // 目前的音效佔用到什麼時候
  let busyLevel = 0;       // 目前佔用中的音效優先等級
  let activeSounds = [];   // 正在播的音效（用來把低優先的停掉）

  // 想播某種音效時先問一下：可以播就回傳 true
  function claim(kind) {
    const level = PRIORITY[kind];
    const now = performance.now();

    // 游標音效（碰到東西、點擊）：新的直接取代舊的，不會疊在一起，也不會被自己擋住
    if (kind === "cursor" && now < busyUntil && busyLevel === level) {
      activeSounds.forEach((sound) => { if (sound.level === level) sound.stop(); });
      activeSounds = activeSounds.filter((sound) => sound.level !== level);
      busyUntil = now + BUSY_TIME[kind];
      return true;
    }

    // 氣球、爆米花：連續點可以疊在一起播（不會把上一個停掉）
    if (kind === "fx" && now < busyUntil && busyLevel === level) {
      busyUntil = now + BUSY_TIME[kind];
      return true;
    }

    // 有同等級或更高等級的音效正在佔用 → 不播
    if (now < busyUntil && level <= busyLevel) return false;

    // 插隊：把正在播的、比較低優先的音效停掉
    if (now < busyUntil && level > busyLevel) {
      activeSounds.forEach((sound) => { if (sound.level < level) sound.stop(); });
    }

    activeSounds = activeSounds.filter((sound) => sound.level >= level && now < sound.until);
    busyLevel = level;
    busyUntil = now + BUSY_TIME[kind];
    return true;
  }

  // 記下正在播的音效，之後被插隊時可以停掉
  function track(kind, stop) {
    activeSounds.push({ level: PRIORITY[kind], until: performance.now() + BUSY_TIME[kind] + 1500, stop });
  }


  // =============================================
  // 音效引擎
  // =============================================
  let ctx = null;
  let master = null;
  let unlocked = false;   // 訪客互動過了，瀏覽器才允許出聲

  function setupAudio() {
    if (ctx) return true;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = settings.volume * MAX_GAIN;
    master.connect(ctx.destination);
    return true;
  }

  // 能不能出聲：音效開著、瀏覽器允許、而且音量不是 0
  function canPlay() {
    return settings.on && unlocked && ctx && settings.volume > 0;
  }

  // 建立一段聲音資料：fill(i, 秒數) 回傳每一個取樣點的值
  function makeBuffer(seconds, fill) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = fill(i, i / ctx.sampleRate);
    return buffer;
  }

  // 播放一段聲音資料，中間可以接濾波器
  function playBuffer(buffer, filters, volume, kind, when = ctx.currentTime) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    let node = src;
    filters.forEach((f) => { node.connect(f); node = f; });
    node.connect(gain);
    gain.connect(master);
    src.start(when);
    track(kind, () => { try { src.stop(); } catch (e) { /* 已經播完 */ } });
  }

  function filter(type, frequency, q = 0.7) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    return f;
  }

  // ---------- 碰到厚紙：低低的「啪沙」 ----------
  // 一小段很快消失的雜音（紙面摩擦）＋ 一個很輕的低頻「咚」（紙板的厚度）
  // 每次的音色、長短都隨機一點點，聽起來比較自然
  let lastPaperTime = 0;

  function playPaper(kind = "cursor") {
    if (!canPlay()) return;
    const now = ctx.currentTime;
    if (now - lastPaperTime < 0.05) return;   // 太密集就跳過，避免糊成一團
    if (!claim(kind)) return;
    lastPaperTime = now;

    const length = 0.05 + Math.random() * 0.03;
    const decay = 70 + Math.random() * 40;
    const rustle = makeBuffer(length, (i, t) =>
      (Math.random() * 2 - 1) * Math.exp(-t * decay) * Math.min(t * 900, 1)
    );
    playBuffer(rustle, [
      filter("highpass", 180),
      filter("lowpass", 1400 + Math.random() * 900),
    ], 0.55, kind);

    // 紙板的厚度：很短的低頻「咚」
    const pitch = 120 + Math.random() * 50;
    const thump = makeBuffer(0.06, (i, t) =>
      Math.sin(2 * Math.PI * pitch * t * (1 - t * 3)) * Math.exp(-t * 60)
    );
    playBuffer(thump, [], 0.35, kind);
  }

  // ---------- 點擊：像戳破小泡泡的「啵」 ----------
  // 一個音高快速往下掉的圓潤聲音
  function playPop() {
    if (!canPlay() || !claim("cursor")) return;
    const start = 700 + Math.random() * 250;
    const end = 260;
    const duration = 0.09;
    let phase = 0;
    const pop = makeBuffer(duration, (i, t) => {
      const freq = end + (start - end) * Math.exp(-t * 45);
      phase += (2 * Math.PI * freq) / ctx.sampleRate;
      const env = Math.min(t * 2000, 1) * Math.exp(-t * 38);
      return Math.sin(phase) * env;
    });
    playBuffer(pop, [filter("lowpass", 2500)], 0.5, "cursor");
  }

  // ---------- 撕票：真實的撕紙聲 ----------
  // 撕紙其實是很多「紙纖維一根一根斷掉」的細小聲音連在一起，
  // 所以這裡在 0.5 秒內隨機撒上大量很短的雜音顆粒：
  // 一開始稀疏、中間密集、最後一下比較用力（整條撕開）
  function playTear() {
    if (!canPlay() || !claim("tear")) return;
    const total = 0.55;
    const rate = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, Math.floor(rate * total), rate);
    const data = buffer.getChannelData(0);

    // 撒顆粒
    let t = 0.01;
    while (t < total - 0.02) {
      const progress = t / total;
      // 越到中段越密集
      const gap = 0.0015 + 0.009 * Math.pow(Math.abs(progress - 0.55) * 1.8, 1.5);
      const grainLength = 0.0008 + Math.random() * 0.004;
      // 整體音量：慢慢變大，最後一段最用力，然後收掉
      const loud = (0.25 + 0.75 * Math.sin(Math.PI * Math.min(progress / 0.9, 1)))
                   * (0.4 + Math.random() * 0.6);
      const startIndex = Math.floor(t * rate);
      const grainSamples = Math.floor(grainLength * rate);
      for (let j = 0; j < grainSamples && startIndex + j < data.length; j++) {
        const env = Math.sin((Math.PI * j) / grainSamples);
        data[startIndex + j] += (Math.random() * 2 - 1) * env * loud;
      }
      t += gap * (0.4 + Math.random() * 1.2);
    }

    // 紙張的「沙沙」底噪，讓顆粒之間連起來
    for (let i = 0; i < data.length; i++) {
      const p = i / data.length;
      data[i] += (Math.random() * 2 - 1) * 0.08 * Math.sin(Math.PI * p);
    }

    playBuffer(buffer, [
      filter("highpass", 700),
      filter("peaking", 3000, 0.8),
      filter("lowpass", 7500),
    ], 0.9, "tear", ctx.currentTime + 0.04);
  }


  // =============================================
  // 音效檔：有放就用檔案，沒放就用上面合成的聲音
  // =============================================
  const fileSounds = {};     // 每種聲音載入成功的檔案清單
  const lastPicked = {};     // 每種聲音上一次挑到第幾個（避免連續兩次一樣）

  Object.entries(SOUND_FILES).forEach(([name, urls]) => {
    fileSounds[name] = [];
    urls.forEach((url) => {
      const audio = new Audio();
      audio.preload = "auto";
      audio.addEventListener("canplaythrough", () => {
        if (!fileSounds[name].includes(audio)) fileSounds[name].push(audio);
      }, { once: true });
      audio.src = url;
    });
  });

  // 播放音效檔：從同一種聲音裡隨機挑一個（不跟上一次重複），
  // 每次複製一份播放，連續觸發時才能疊在一起；沒有檔案就回傳 false
  // kind 是優先等級（tear / pageturn / cursor）；被更高優先的音效擋住時也回傳 true（代表「處理過了，不用改播合成聲」）
  // rate 是播放速度（同時改變音高），1 是原本的樣子
  function playFile(name, kind, volume = 1, rate = 1) {
    const list = fileSounds[name];
    if (!list || !list.length || !settings.on || settings.volume <= 0) return false;
    if (!claim(kind)) return true;

    let index = Math.floor(Math.random() * list.length);
    if (list.length > 1 && index === lastPicked[name]) index = (index + 1) % list.length;
    lastPicked[name] = index;

    const copy = list[index].cloneNode();
    copy.volume = Math.min(settings.volume * volume, 1);
    if (rate !== 1) {
      copy.preservesPitch = false;   // 讓音高跟著速度一起變
      copy.playbackRate = rate;
    }
    copy.play().catch(() => {});
    track(kind, () => copy.pause());
    return true;
  }


  // =============================================
  // 什麼時候響
  // =============================================

  // 第一次點擊或按鍵：建立音效引擎（瀏覽器規定一定要等互動）
  function unlock() {
    if (!setupAudio()) return;
    if (ctx.state === "suspended") ctx.resume();
    unlocked = true;
  }
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);

  // 碰到像紙的東西：只有「換到另一個東西」時才響，在同一個東西上移動不會一直響
  let lastHovered = null;
  document.addEventListener("mouseover", (event) => {
    if (panel.contains(event.target)) return;
    const target = event.target.closest && event.target.closest(PAPER_TARGETS);
    if (target && target !== lastHovered) {
      if (!unlocked || !playFile("hover", "cursor")) playPaper("cursor");
    }
    lastHovered = target;
  });

  // 點擊（點音效控制本身不響）
  document.addEventListener("click", (event) => {
    if (panel.contains(event.target)) return;

    // 點的是「換到別的頁面」的連結：播翻頁聲，稍微等一下再跳過去
    const link = event.target.closest && event.target.closest("a[href]");
    if (link && isPageLink(link, event) && !event.defaultPrevented) {
      if (canPlay() && fileSounds.pageturn.length && playFile("pageturn", "pageturn")) {
        event.preventDefault();
        setTimeout(() => { window.location.href = link.href; }, PAGE_LEAVE_DELAY);
        return;
      }
    }

    // 3D 頁換照片的小圖、箭頭：只要「咻」一聲，不要再多一個「啵」
    if (event.target.closest && event.target.closest(".td-thumb, .td-arrow")) return;

    // 點擊：只有在 sounds 資料夾放了 click.mp3 才會響（不再用合成的「啵」）
    playFile("click", "cursor");
  });

  // 判斷是不是「換到別的頁面」的連結（同一頁的 #區塊、開新分頁、按住 Ctrl 點的都不算）
  function isPageLink(link, event) {
    const href = link.getAttribute("href") || "";
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
    if (link.target && link.target !== "_self") return false;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return false;
    return true;
  }

  // 首頁切換到別的格子時（home.js 會發出這個通知）：播翻頁聲
  window.addEventListener("lian:pageturn", () => {
    if (!playFile("pageturn", "pageturn")) playPaper("pageturn");
  });

  // 手動轉 My Skills 滾筒時的齒輪聲（home.js 會一格一格發出通知）
  // 用跟「碰到東西」一樣的打字機聲，每一聲的音高隨機高低一點點，比較像真的齒輪
  window.addEventListener("lian:gear-tick", () => {
    if (!canPlay()) return;
    const rate = 0.9 + Math.random() * 0.25;
    if (!playFile("hover", "cursor", 0.85, rate)) playPaper("cursor");
  });

  // 手電筒照到 Arts 的票：開始打鼓；光離開所有票：鼓聲淡出（home.js 會發出通知）
  // 鼓聲在響的時候，碰到東西的聲音不會出來；撕票、翻頁會直接把鼓聲蓋掉
  let drumAudio = null;

  function stopDrum(fade = 250) {
    if (!drumAudio) return;
    const audio = drumAudio;
    drumAudio = null;
    const startVol = audio.volume;
    const t0 = performance.now();
    (function step() {
      const k = Math.max(0, Math.min((performance.now() - t0) / fade, 1));
      audio.volume = startVol * (1 - k);
      if (k < 1) requestAnimationFrame(step);
      else audio.pause();
    })();
    if (busyLevel === PRIORITY.drum) busyUntil = 0;
  }

  // Contact 的氣球、爆米花（home.js 會發出 lian:sfx，detail 是音效名稱）
  // 比點擊的「啵」優先，所以點下去只會聽到爆炸聲／爆米花聲
  window.addEventListener("lian:sfx", (event) => {
    playFile(event.detail, "fx");
  });

  window.addEventListener("lian:drum-start", () => {
    if (drumAudio || !canPlay()) return;
    const list = fileSounds.drumroll;
    if (!list || !list.length || !claim("drum")) return;
    drumAudio = list[0].cloneNode();
    drumAudio.loop = true;             // 一直循環，直到光離開票才停
    drumAudio.volume = 0;
    drumAudio.play().catch(() => {});
    // 開始時 0.15 秒淡入，不會突然很大聲
    const audio = drumAudio, target = Math.min(settings.volume, 1), t0 = performance.now();
    (function fadeIn() {
      if (drumAudio !== audio) return;
      const k = Math.max(0, Math.min((performance.now() - t0) / 150, 1));
      audio.volume = target * k;
      if (k < 1) requestAnimationFrame(fadeIn);
    })();
    track("drum", () => stopDrum(120));
  });

  window.addEventListener("lian:drum-stop", () => stopDrum());

  // 撕票（home.js 撕票時會發出這個通知）
  window.addEventListener("lian:tear", () => {
    if (!playFile("tear", "tear")) playTear();
  });


  // =============================================
  // 左下角直立的音效控制
  // =============================================
  const panel = document.createElement("div");
  panel.className = "sound-control";
  panel.innerHTML = `
    <input class="sound-volume" type="range" min="0" max="100" step="1" aria-label="Sound volume">
    <button class="sound-toggle" type="button" aria-label="Sound on / off">
      <span class="sound-icon" aria-hidden="true">♪</span>
    </button>
  `;
  document.body.appendChild(panel);

  const toggleButton = panel.querySelector(".sound-toggle");
  const volumeSlider = panel.querySelector(".sound-volume");

  function updateUI() {
    panel.classList.toggle("is-on", settings.on);
    toggleButton.setAttribute("aria-pressed", String(settings.on));
    toggleButton.title = settings.on ? "Mute sound" : "Turn sound on";
    volumeSlider.value = Math.round(settings.volume * 100);
    panel.style.setProperty("--vol", `${Math.round(settings.volume * 100)}%`);
    if (master) master.gain.setTargetAtTime(settings.volume * MAX_GAIN, ctx.currentTime, 0.03);
  }

  // 按鈕：開 / 關（打開時響一聲讓人知道）
  toggleButton.addEventListener("click", () => {
    settings.on = !settings.on;
    if (settings.on && settings.volume === 0) settings.volume = DEFAULT_VOLUME;
    saveSettings();
    updateUI();
    if (settings.on) {
      unlock();
      busyUntil = 0;   // 自己按開關時響一聲打字機聲，讓人知道音效打開了
      if (!playFile("hover", "cursor")) playPaper("cursor");
    }
  });

  // 滑桿：調音量（放開時響一聲試聽；拉到 0 等於靜音）
  volumeSlider.addEventListener("input", () => {
    settings.volume = Number(volumeSlider.value) / 100;
    if (settings.volume > 0) settings.on = true;
    saveSettings();
    updateUI();
  });
  volumeSlider.addEventListener("change", () => {
    unlock();
    busyUntil = 0;
    if (!playFile("hover", "cursor")) playPaper("cursor");   // 試聽目前的音量
  });

  updateUI();
})();
