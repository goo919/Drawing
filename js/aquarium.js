// 공유 수족관 — 그림이 유형(type)에 따라 다르게 살아 움직이는 화면
//
//   swim    자유 유영, 밥을 발견하면 (조금 늦게, 가끔은 무시하며) 다가와 먹음
//   surface 수면 근처에서만 놂, 떨어지는 밥을 수면에서 받아먹음
//   jelly   둥실둥실 떠다님, 밥에 무관심
//   walker  바닥을 걸어다니고 가끔 헤엄쳐 올라감, 바닥에 떨어진 밥을 먹음
//   crawler 아주 느리게 기어다니다 멈추다 함, 코앞의 밥만 느긋하게 먹음
//   reef    배경 암초 — 옅은 색으로 가만히
//   plant   바닥에 뿌리내리고 살랑살랑
//   giant   멀리서(옅은 회색) 아주 천천히 지나가는 대형 생물
//
// 바닥: 수조 아래 1/5 (floorY = H * 0.8) 이 모랫바닥 영역

const Aquarium = (() => {
  const FOOD_LIFE = 20000;
  const MAX_FOOD = 12;
  const FLOOR_RATIO = 0.8;

  const SIZES = {
    swim: [80, 140],
    surface: [60, 100],
    jelly: [75, 115],
    walker: [85, 125],
    crawler: [55, 85],
    reef: [110, 175],
    plant: [90, 150],
    giant: [190, 290],
  };

  const LAYERS = { giant: 1, reef: 2, plant: 3, crawler: 4, walker: 4, swim: 5, jelly: 5, surface: 5 };

  const HEART_COLORS = ["#ffb3c6", "#e0b3ff", "#a8d8ff", "#b8f0d0", "#ffd9a8"]; // 파스텔 하트

  let tank = null;
  let actors = [];
  let foods = [];
  let rafId = null;
  let lastTime = 0;
  let W = 0, H = 0, floorY = 0;
  let renderGen = 0; // 렌더 세대 — 이전 렌더의 비동기 잔여 작업이 겹치지 않게 (복제 버그 방지)
  let eventUpdaters = []; // 이벤트 연출(잠수함 등) 프레임 업데이터 — 행동 엔진과 분리

  const rand = (a, b) => a + Math.random() * (b - a);

  // 그림 id 기반 고정 시드 난수 — 크기·성격이 접속할 때마다 바뀌지 않도록
  function seededRand(seedStr) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 15), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }

  // 위치 저장/복원 (비율 좌표라 화면 크기가 달라도 이어짐)
  const POS_KEY = "aquarium_positions_v1";
  let posStore = {};
  try {
    posStore = JSON.parse(localStorage.getItem(POS_KEY)) || {};
  } catch {}
  let lastPosSave = 0;

  function savePositions() {
    if (!W || !H) return;
    for (const a of actors) {
      if (a.ephemeral || !a.drawingId) continue; // 이벤트용 임시 액터는 저장 안 함
      posStore[a.drawingId] = {
        nx: a.x / W,
        ny: a.baseY / H,
        nfy: a.footY != null ? a.footY / H : undefined,
        dir: a.vx < 0 ? -1 : 1,
      };
    }
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(posStore));
    } catch {}
  }

  function makeBubbles() {
    for (let i = 0; i < 12; i++) {
      const b = document.createElement("div");
      b.className = "bubble";
      b.style.left = Math.random() * 100 + "%";
      b.style.width = b.style.height = 5 + Math.random() * 12 + "px";
      b.style.animationDuration = 7 + Math.random() * 9 + "s";
      b.style.animationDelay = -Math.random() * 12 + "s";
      tank.appendChild(b);
    }
  }

  // ---------- 그려진 영역만 잘라내기 (클릭 범위 = 그림의 실제 경계) ----------
  const cropCache = new Map();

  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function croppedImage(drawing) {
    const key = drawing.id + ":" + (drawing.submittedAt || 0);
    if (cropCache.has(key)) return cropCache.get(key);
    let result;
    try {
      const img = await loadImg(drawing.image);
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const cx = c.getContext("2d");
      cx.drawImage(img, 0, 0);
      const data = cx.getImageData(0, 0, c.width, c.height).data;
      let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (data[(y * c.width + x) * 4 + 3] > 10) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) {
        result = { src: drawing.image, ratio: 1 };
      } else {
        const pad = 4;
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(c.width - 1, maxX + pad);
        maxY = Math.min(c.height - 1, maxY + pad);
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        const out = document.createElement("canvas");
        out.width = w;
        out.height = h;
        out.getContext("2d").drawImage(c, minX, minY, w, h, 0, 0, w, h);
        result = { src: out.toDataURL("image/png"), ratio: h / w };
      }
    } catch {
      result = { src: drawing.image, ratio: 1 };
    }
    cropCache.set(key, result);
    return result;
  }

  // ---------- 쓰다듬기 ----------
  function spawnHeart(a) {
    const el = document.createElement("span");
    el.className = "pet-heart";
    el.textContent = "♥";
    el.style.color = HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)];
    el.style.left = a.x + a.size / 2 + rand(-12, 12) + "px";
    el.style.top = (a.ry ?? a.baseY) - 4 + "px";
    tank.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  function petActor(a, broadcast) {
    spawnHeart(a);
    a.petUntil = performance.now() + 700; // 몸을 살짝 흔드는 반응
    // 문지르는 동안 하트가 여러 번 떠도, 전송은 0.6초에 한 번만
    if (broadcast && Date.now() - (a.lastPetSent || 0) > 600) {
      a.lastPetSent = Date.now();
      Storage.sendEvent({ type: "pet", drawingId: a.drawingId }).catch(() => {});
    }
  }

  // ---------- 배우(그림) 생성 ----------
  async function addActor(drawing, commentTexts, gen) {
    const type = SIZES[drawing.type] ? drawing.type : "swim";
    const cropped = await croppedImage(drawing);
    // 크롭(비동기)이 끝나기 전에 수족관이 다시 그려졌다면 이 작업은 폐기
    if (gen !== renderGen) return;
    // 이 그림 고유의 고정 난수 (크기·성격이 매번 같음)
    const sr = seededRand(drawing.id);
    const srand = (a, b) => a + sr() * (b - a);

    const el = document.createElement("div");
    el.className = `fish fish-${type}`;
    const img = document.createElement("img");
    img.src = cropped.src;
    img.alt = drawing.topic;
    img.draggable = false;
    el.appendChild(img);
    el.style.zIndex = LAYERS[type];
    tank.appendChild(el);

    let size = srand(...SIZES[type]); // 가로 폭
    if (type === "giant") size = Math.min(size, W * 0.65);
    // 그림 비율이 극단적이어도 화면에서 적당한 크기가 되도록 보정
    let h = size * cropped.ratio;
    const maxH = type === "giant" ? H * 0.6 : H * 0.4;
    if (h > maxH) {
      size *= maxH / h;
      h = maxH;
    }
    el.style.width = size + "px";

    const a = {
      el, type, size, h,
      drawingId: drawing.id,
      x: srand(0, Math.max(1, W - size)),
      baseY: srand(20, Math.max(21, floorY - h - 30)),
      vx: srand(16, 40) * (sr() < 0.5 ? -1 : 1),
      cvx: 0, cvy: 0,
      chaseSp: srand(35, 62),
      bobAmp: srand(6, 18),
      bobSpeed: srand(0.4, 1.3),
      phase: srand(0, Math.PI * 2),
      state: "roam",
      stateUntil: 0,
      nextLook: 0,
      target: null,
      flip: 1,
      ry: 0,
      petUntil: 0,
    };
    a.ry = a.baseY;

    // 손가락으로 살살 문지르면 쓰다듬기, 가만히 톡 누르면 자세히 보기
    el.addEventListener("pointerdown", (e) => {
      a.rub = { lx: e.clientX, ly: e.clientY, total: 0, acc: 0, lastDir: 0, turns: 0 };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {}
    });
    el.addEventListener("pointermove", (e) => {
      const r = a.rub;
      if (!r) return;
      const dx = e.clientX - r.lx;
      const dy = e.clientY - r.ly;
      r.lx = e.clientX;
      r.ly = e.clientY;
      r.total += Math.abs(dx) + Math.abs(dy);
      r.acc += Math.abs(dx) + Math.abs(dy);
      if (dx) {
        const d = Math.sign(dx);
        if (r.lastDir && d !== r.lastDir) r.turns++; // 좌우로 비비는 왕복 감지
        r.lastDir = d;
      }
      if (r.turns >= 1 && r.acc > 34) {
        r.acc = 0; // 계속 비비면 하트가 계속
        petActor(a, true);
      }
    });
    const endRub = () => setTimeout(() => (a.rub = null), 0);
    el.addEventListener("pointerup", endRub);
    el.addEventListener("pointercancel", endRub);
    el.addEventListener("click", () => {
      if (a.rub && a.rub.total > 14) return; // 문지른 거면 모달 안 열기
      App.openDrawingModal(drawing);
    });

    // 댓글 말풍선 — 물고기를 따라다니되, 항상 뜨지 않고 랜덤하게 떴다 사라짐(침묵 구간 포함)
    if (commentTexts && commentTexts.length) {
      const bEl = document.createElement("div");
      bEl.className = "say-bubble";
      bEl.hidden = true;
      tank.appendChild(bEl);
      a.bubble = {
        el: bEl,
        texts: commentTexts,
        showing: false,
        nextShow: performance.now() + rand(1500, 7000), // 첫 등장까지 잠깐 침묵
        hideAt: 0,
      };
    }

    // 유형별 초기 배치 (그림별 고정 시드 → 매번 같은 자리 성향)
    if (type === "walker" || type === "crawler" || type === "reef" || type === "plant") {
      a.footY = floorY + srand(6, Math.max(8, H - floorY - 10)); // 발이 닿는 모랫바닥 위치
      a.baseY = a.footY - h;
      a.vx = type === "walker" ? srand(8, 15) * (sr() < 0.5 ? -1 : 1)
           : type === "crawler" ? srand(2, 5) * (sr() < 0.5 ? -1 : 1)
           : 0;
      a.state = type === "crawler" ? "pause" : "walk";
      a.stateUntil = performance.now() + rand(1000, 5000);
      a.nextSwim = performance.now() + rand(15000, 40000);
    } else if (type === "jelly") {
      a.bobAmp = srand(22, 45);
      a.bobSpeed = srand(0.25, 0.5);
      a.vx = srand(4, 9) * (sr() < 0.5 ? -1 : 1);
    } else if (type === "giant") {
      a.vx = srand(5, 9) * (sr() < 0.5 ? -1 : 1);
      a.baseY = srand(10, Math.max(11, H * 0.55 - h / 2));
      a.bobAmp = srand(4, 9);
      a.bobSpeed = srand(0.15, 0.3);
    } else if (type === "surface") {
      a.baseY = srand(4, Math.max(5, H * 0.14));
      a.bobAmp = srand(3, 7);
    }

    // 지난번 위치가 저장되어 있으면 이어서 시작 (나갔다 들어와도 그 자리)
    const saved = posStore[drawing.id];
    if (saved && typeof saved.nx === "number") {
      a.x = Math.min(Math.max(saved.nx * W, 0), Math.max(0, W - size));
      if (a.footY != null && typeof saved.nfy === "number") {
        a.footY = Math.min(Math.max(saved.nfy * H, floorY + 4), H - 4);
        a.baseY = a.footY - h;
      } else if (type !== "surface") {
        a.baseY = Math.min(Math.max(saved.ny * H, 4), Math.max(5, floorY - h - 4));
      }
      if (saved.dir) a.vx = Math.abs(a.vx) * saved.dir;
      a.ry = a.baseY;
    }
    actors.push(a);
  }

  // ---------- 밥 ----------
  function dropFood(x, y) {
    if (foods.length >= MAX_FOOD) removeFood(foods[0]);
    const el = document.createElement("div");
    el.className = "food";
    tank.appendChild(el);
    foods.push({
      el, x, y,
      vy: rand(20, 34),
      born: performance.now(),
      sway: rand(0, Math.PI * 2),
      restY: floorY + rand(2, Math.max(4, (H - floorY) * 0.5)), // 모랫바닥 위에 내려앉음
      resting: false,
    });
  }

  function removeFood(food) {
    food.el.remove();
    foods = foods.filter((f) => f !== food);
  }

  function nearestFood(cx, cy, filter) {
    let best = null, bestD = Infinity;
    for (const food of foods) {
      if (filter && !filter(food)) continue;
      const d = Math.hypot(food.x - cx, food.y - cy);
      if (d < bestD) { bestD = d; best = food; }
    }
    return best;
  }

  // ---------- 유형별 움직임 ----------
  function stepSwim(a, t, dt, isSurface) {
    // 실제로 화면에 그려지는 위치(위아래 흔들림 포함) 기준으로 판정
    const yNow = a.baseY + Math.sin((t / 1000) * a.bobSpeed + a.phase) * a.bobAmp;
    const cx = a.x + a.size / 2;
    const cy = yNow + a.h / 2;
    const foodFilter = isSurface ? (f) => f.y < H * 0.4 : null;

    if (a.state === "roam") {
      a.x += a.vx * dt;
      a.flip = a.vx < 0 ? -1 : 1;
      // 밥 눈치채기: 바로 반응하지 않고, 가끔은 관심도 없음
      if (foods.some((f) => !foodFilter || foodFilter(f))) {
        if (!a.nextLook) a.nextLook = t + rand(400, 2600);
        else if (t > a.nextLook) {
          if (Math.random() < 0.7) {
            a.target = nearestFood(cx, cy, foodFilter);
            if (a.target) {
              a.state = "curious";
              a.cvx = a.vx;
              a.cvy = 0;
            }
          } else {
            a.nextLook = t + rand(2500, 6000); // 못 본 척
          }
        }
      } else {
        a.nextLook = 0;
      }
    } else if (a.state === "curious") {
      const food = a.target;
      if (!food || !foods.includes(food) || (foodFilter && !foodFilter(food))) {
        a.state = "roam";
        a.nextLook = t + rand(600, 2000);
        a.vx = (a.cvx >= 0 ? 1 : -1) * Math.abs(a.vx);
      } else {
        const dx = food.x - cx;
        const dy = food.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        // 부드럽게 방향을 트는 추적 + 살짝 흔들리는 경로
        const wob = Math.sin(t / 260 + a.phase) * 14;
        const ux = dx / d, uy = dy / d;
        a.cvx += (ux * a.chaseSp - a.cvx) * Math.min(1, 1.7 * dt);
        a.cvy += ((uy * a.chaseSp + wob * 0.3) - a.cvy) * Math.min(1, 1.7 * dt);
        a.x += a.cvx * dt;
        a.baseY += a.cvy * dt;
        a.flip = a.cvx < 0 ? -1 : 1;
        if (d < Math.max(9, Math.min(a.size, a.h) * 0.2)) {
          // 입이 닿을 만큼 가까워졌을 때만 냠
          removeFood(food);
          a.target = null;
          a.state = "rest"; // 잠깐 쉬기
          a.stateUntil = t + rand(700, 1900);
        }
      }
    } else if (a.state === "rest") {
      a.x += a.cvx * 0.15 * dt;
      a.cvx *= 1 - Math.min(1, 1.5 * dt);
      if (t > a.stateUntil) {
        a.state = "roam";
        a.nextLook = t + rand(800, 2500);
        a.vx = (a.flip >= 0 ? 1 : -1) * Math.abs(a.vx);
      }
    }

    // 영역 제한
    const maxY = isSurface ? H * 0.16 : floorY - a.h * 0.55;
    a.baseY = Math.max(4, Math.min(maxY, a.baseY));
    bounce(a);
    const y = a.baseY + Math.sin((t / 1000) * a.bobSpeed + a.phase) * a.bobAmp;
    a.ry = y;
    a.el.style.transform = `translate(${a.x}px, ${y}px) scaleX(${a.flip})`;
  }

  function stepJelly(a, t, dt) {
    a.x += a.vx * dt;
    if (Math.random() < 0.002) a.vx *= -1; // 가끔 마음이 바뀜
    bounce(a);
    a.flip = a.vx < 0 ? -1 : 1;
    const y = a.baseY + Math.sin((t / 1000) * a.bobSpeed + a.phase) * a.bobAmp;
    const pulse = 1 + Math.sin(t / 480 + a.phase) * 0.035; // 몽글몽글 맥동
    a.ry = y;
    a.el.style.transform = `translate(${a.x}px, ${y}px) scaleX(${a.flip}) scale(${pulse})`;
  }

  function stepWalker(a, t, dt) {
    const cx = a.x + a.size / 2;

    if (a.state === "walk") {
      // 바닥에 떨어진 밥이 근처에 있으면 그쪽으로
      const food = nearestFood(cx, a.footY, (f) => f.resting);
      if (food && Math.abs(food.x - cx) < 170) {
        a.vx = (food.x > cx ? 1 : -1) * Math.abs(a.vx);
        if (Math.abs(food.x - cx) < Math.max(8, a.size * 0.16)) removeFood(food);
      } else if (t > a.nextSwim) {
        // 가끔은 헤엄치고 싶다
        a.state = "swimup";
        a.swimTarget = { x: rand(20, W - a.size - 20), y: rand(H * 0.2, floorY - a.h * 1.3) };
        a.stateUntil = t + rand(5000, 9000);
      }
      a.x += a.vx * dt;
      a.flip = a.vx < 0 ? -1 : 1;
      bounce(a);
      const y = a.footY - a.h + Math.sin(t / 320 + a.phase) * 1.5; // 뒤뚱뒤뚱
      a.ry = y;
      a.el.style.transform = `translate(${a.x}px, ${y}px) scaleX(${a.flip})`;
    } else if (a.state === "swimup") {
      const done = ease2D(a, a.swimTarget.x, a.swimTarget.y, 22, dt);
      if (t > a.stateUntil || done) {
        a.state = "swimdown";
      }
      renderEase(a, t);
    } else if (a.state === "swimdown") {
      const done = ease2D(a, a.x, a.footY - a.h, 26, dt);
      if (done) {
        a.state = "walk";
        a.nextSwim = t + rand(18000, 45000);
      }
      renderEase(a, t);
    }
  }

  function stepCrawler(a, t, dt) {
    const cx = a.x + a.size / 2;
    // 코앞의 밥은 느긋하게 접근
    const food = nearestFood(cx, a.footY, (f) => f.resting);
    const interested = food && Math.abs(food.x - cx) < 100;

    if (a.state === "pause" && !interested) {
      if (t > a.stateUntil) {
        a.state = "crawl";
        a.stateUntil = t + rand(4000, 11000);
        if (Math.random() < 0.4) a.vx *= -1;
      }
    } else {
      const dir = interested ? (food.x > cx ? 1 : -1) : (a.vx < 0 ? -1 : 1);
      a.x += dir * Math.abs(a.vx) * dt;
      a.flip = dir < 0 ? -1 : 1;
      if (interested && Math.abs(food.x - cx) < Math.max(7, a.size * 0.16)) removeFood(food);
      if (!interested && t > a.stateUntil) {
        a.state = "pause";
        a.stateUntil = t + rand(3000, 9000);
      }
      bounce(a);
    }
    const y = a.footY - a.h;
    a.ry = y;
    a.el.style.transform = `translate(${a.x}px, ${y}px) scaleX(${a.flip})`;
  }

  function stepPlant(a, t) {
    const sway = Math.sin((t / 1000) * 0.8 + a.phase) * 3.5;
    a.ry = a.footY - a.h;
    a.el.style.transformOrigin = "bottom center";
    a.el.style.transform = `translate(${a.x}px, ${a.ry}px) rotate(${sway}deg)`;
  }

  function stepReef(a) {
    a.ry = a.footY - a.h;
    a.el.style.transform = `translate(${a.x}px, ${a.ry}px)`;
  }

  function stepGiant(a, t, dt) {
    a.x += a.vx * dt;
    // 화면 밖까지 나갔다가 반대편에서 다시 등장
    if (a.vx > 0 && a.x > W + 40) a.x = -a.size - 40;
    if (a.vx < 0 && a.x < -a.size - 40) a.x = W + 40;
    a.flip = a.vx < 0 ? -1 : 1;
    const y = a.baseY + Math.sin((t / 1000) * a.bobSpeed + a.phase) * a.bobAmp;
    a.ry = y;
    a.el.style.transform = `translate(${a.x}px, ${y}px) scaleX(${a.flip})`;
  }

  // 공용 헬퍼
  function bounce(a) {
    if (a.x < 0) { a.x = 0; a.vx = Math.abs(a.vx); a.cvx = Math.abs(a.cvx); }
    else if (a.x > W - a.size) { a.x = Math.max(0, W - a.size); a.vx = -Math.abs(a.vx); a.cvx = -Math.abs(a.cvx); }
  }

  function ease2D(a, tx, ty, speed, dt) {
    const curY = a.easeY ?? a.baseY;
    const dx = tx - a.x, dy = ty - curY;
    const d = Math.hypot(dx, dy);
    if (d < 4) return true;
    a.x += (dx / d) * speed * dt;
    a.easeY = curY + (dy / d) * speed * dt;
    a.flip = dx < 0 ? -1 : 1;
    return false;
  }

  function renderEase(a, t) {
    const y = (a.easeY ?? a.baseY) + Math.sin(t / 420 + a.phase) * 2.5;
    a.ry = y;
    a.el.style.transform = `translate(${a.x}px, ${y}px) scaleX(${a.flip})`;
  }

  // ---------- 메인 루프 ----------
  function tick(t) {
    const dt = Math.min(0.05, (t - lastTime) / 1000 || 0);
    lastTime = t;
    W = tank.clientWidth;
    H = tank.clientHeight;
    floorY = H * FLOOR_RATIO;

    for (const food of [...foods]) {
      if (t - food.born > FOOD_LIFE) { removeFood(food); continue; }
      if (!food.resting) {
        food.y += food.vy * dt;
        food.x += Math.sin(t / 350 + food.sway) * 10 * dt;
        if (food.y >= food.restY) { food.y = food.restY; food.resting = true; }
      }
      food.el.style.transform = `translate(${food.x - 4}px, ${food.y - 4}px)`;
    }

    for (const a of actors) {
      switch (a.type) {
        case "swim": stepSwim(a, t, dt, false); break;
        case "surface": stepSwim(a, t, dt, true); break;
        case "jelly": stepJelly(a, t, dt); break;
        case "walker": stepWalker(a, t, dt); break;
        case "crawler": stepCrawler(a, t, dt); break;
        case "plant": stepPlant(a, t); break;
        case "reef": stepReef(a); break;
        case "giant": stepGiant(a, t, dt); break;
      }

      // 쓰다듬기 반응: 잠깐 몸을 살랑살랑
      if (a.petUntil > t) {
        a.el.firstChild.style.transform = `rotate(${Math.sin(t / 55) * 6}deg)`;
        a.petWiggling = true;
      } else if (a.petWiggling) {
        a.el.firstChild.style.transform = "";
        a.petWiggling = false;
      }

      // 댓글 말풍선: 랜덤하게 잠깐 떴다가 침묵했다가 (항상 뜨지 않음)
      if (a.bubble) {
        const b = a.bubble;
        if (b.showing) {
          if (t > b.hideAt) {
            b.showing = false;
            b.el.hidden = true;
            b.nextShow = t + rand(5000, 14000); // 침묵
          } else {
            const bx = Math.min(W - 10, Math.max(10, a.x + a.size / 2));
            const by = Math.max(4, a.ry - 6);
            b.el.style.transform = `translate(${bx}px, ${by}px) translate(-50%, -100%)`;
          }
        } else if (t > b.nextShow) {
          b.el.textContent = b.texts[Math.floor(Math.random() * b.texts.length)];
          b.el.hidden = false;
          b.showing = true;
          b.hideAt = t + rand(2600, 5200);
        }
      }
    }

    // 이벤트 연출 업데이터 (잠수함 등) — 행동 엔진과 분리된 별도 레이어
    for (const up of eventUpdaters) up(t, dt);

    // 위치를 주기적으로 저장 → 나갔다 들어와도 이어짐
    if (t - lastPosSave > 4000) {
      lastPosSave = t;
      savePositions();
    }
    // 분위기 연출(시간대 틴트/날씨 파티클)을 같은 RAF 루프에 얹음 (행동 엔진 무관)
    if (window.Ambience) Ambience.frame(t);
    rafId = requestAnimationFrame(tick);
  }

  // ============================================================
  // 희귀 이벤트 연출 (별도 레이어 — 행동 엔진과 분리)
  // ============================================================
  const NS = "http://www.w3.org/2000/svg";
  function svg(w, h, inner, cls) {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", `0 0 ${w} ${h}`);
    s.setAttribute("class", cls || "");
    s.innerHTML = inner;
    return s;
  }
  const STROKE = 'fill="none" stroke="#111" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"';

  // 잠수함 통과: 뒤쪽을 천천히 가로지름 (30초)
  function spawnSubmarine() {
    const el = document.createElement("div");
    el.className = "evt-submarine";
    el.innerHTML = svg(
      220, 120,
      `<ellipse cx="110" cy="78" rx="86" ry="30" ${STROKE}/>
       <path d="M150 54 q28 -6 40 8 q-14 12 -40 8" ${STROKE}/>
       <rect x="92" y="34" width="30" height="26" rx="6" ${STROKE}/>
       <line x1="107" y1="34" x2="107" y2="16" ${STROKE}/>
       <circle cx="107" cy="12" r="6" ${STROKE}/>
       <circle cx="78" cy="78" r="9" ${STROKE}/>
       <circle cx="110" cy="78" r="9" ${STROKE}/>
       <circle cx="142" cy="78" r="9" ${STROKE}/>`,
      "evt-svg"
    ).outerHTML;
    tank.appendChild(el);
    const size = Math.min(200, W * 0.5);
    el.style.width = size + "px";
    const dir = 1;
    let x = -size - 20;
    const y = H * (0.32 + Math.random() * 0.2);
    const speed = (W + size + 40) / 30; // 약 30초에 횡단
    let bubbleT = 0;
    const upd = (t, dt) => {
      x += speed * dir * dt;
      el.style.transform = `translate(${x}px, ${y + Math.sin(t / 1400) * 6}px)`;
      // 잠망경 물방울
      bubbleT -= dt;
      if (bubbleT <= 0 && x > 0 && x < W) {
        bubbleT = 0.5 + Math.random() * 0.6;
        const bb = document.createElement("div");
        bb.className = "evt-peri-bubble";
        bb.style.left = x + size * 0.49 + "px";
        bb.style.top = y + "px";
        tank.appendChild(bb);
        setTimeout(() => bb.remove(), 2600);
      }
      if (x > W + size + 40) {
        // 퇴장 후 정리
        eventUpdaters = eventUpdaters.filter((u) => u !== upd);
        el.remove();
      }
    };
    eventUpdaters.push(upd);
    eventEls.push(el);
  }

  const WHALE_SVG = `<path d="M20 60 q40 -46 120 -34 q40 6 70 30 q-30 6 -70 8 q-36 30 -74 8 q6 -14 2 -20 q-30 4 -48 8 q10 -4 -0 -8z" ${STROKE}/><circle cx="60" cy="52" r="4" fill="#111"/>`;
  function spawnWhalePod() {
    const n = 3 + Math.floor(Math.random() * 2); // 3~4마리
    for (let i = 0; i < n; i++) {
      const el = document.createElement("div");
      el.className = "evt-whale";
      const inner = document.createElement("div");
      inner.innerHTML = svg(220, 90, WHALE_SVG, "evt-svg").outerHTML;
      el.appendChild(inner);
      el.style.zIndex = 1;
      tank.appendChild(el);
      const size = 150 + Math.random() * 90;
      el.style.width = size + "px";
      actors.push({
        el, type: "giant", ephemeral: true,
        size, h: size * 0.4,
        x: -size - i * (size * 0.7) - rand(20, 60),
        baseY: H * (0.2 + i * 0.06) + rand(-10, 10),
        vx: rand(7, 10),
        bobAmp: rand(4, 8), bobSpeed: rand(0.15, 0.28), phase: rand(0, 6.28),
        flip: 1, ry: 0, petUntil: 0,
      });
    }
  }

  // 보물상자: 바닥에 나타나 탭하면 과거 그림 하나를 소환
  function spawnTreasure(memory, alreadyOpened, onOpen) {
    if (alreadyOpened) {
      if (memory) summonMemory(memory);
      return;
    }
    const el = document.createElement("div");
    el.className = "evt-chest";
    el.innerHTML = svg(
      90, 70,
      `<rect x="12" y="30" width="66" height="34" rx="4" ${STROKE}/>
       <path d="M12 30 q33 -26 66 0" ${STROKE}/>
       <line x1="12" y1="44" x2="78" y2="44" ${STROKE}/>
       <rect x="40" y="40" width="10" height="12" rx="2" ${STROKE}/>`,
      "evt-svg"
    ).outerHTML;
    tank.appendChild(el);
    const size = 74;
    el.style.width = size + "px";
    el.style.left = W * (0.3 + Math.random() * 0.4) + "px";
    el.style.top = floorY + (H - floorY) * 0.35 + "px";
    eventEls.push(el);
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      el.classList.add("opening");
      for (let i = 0; i < 8; i++) {
        const sp = document.createElement("div");
        sp.className = "evt-sparkle";
        sp.style.left = parseFloat(el.style.left) + size / 2 + "px";
        sp.style.top = parseFloat(el.style.top) + "px";
        sp.style.setProperty("--dx", rand(-40, 40) + "px");
        sp.style.setProperty("--dy", rand(-60, -20) + "px");
        tank.appendChild(sp);
        setTimeout(() => sp.remove(), 1200);
      }
      setTimeout(() => el.remove(), 500);
      if (memory) summonMemory(memory);
      if (onOpen) onOpen();
    });
  }

  async function summonMemory(memory) {
    // 과거 그림을 임시 액터로 추가 (원래 날짜/주제 소표시)
    await addActor(memory, null, renderGen);
    const a = actors[actors.length - 1];
    if (a) {
      a.ephemeral = true;
      const tag = document.createElement("div");
      tag.className = "evt-memory-tag say-bubble";
      tag.textContent = `🎁 ${memory.date} · ${memory.topic}`;
      tag.hidden = true;
      tank.appendChild(tag);
      a.bubble = { el: tag, texts: [tag.textContent], showing: false, nextShow: performance.now() + 400, hideAt: 0 };
    }
  }

  let eventEls = [];
  function clearEvents() {
    eventUpdaters = [];
    eventEls.forEach((el) => el.remove());
    eventEls = [];
  }

  // ============================================================
  // 보름달: 바다 위 세상 (스윕으로 오가는 위층). 아래층=수중은 그대로 유지.
  // ============================================================
  let above = null; // { panel, swimmers, waterY, shown, nextToggle, nextJump }
  let swipe = null; // 스윕 제스처 상태

  // 하늘/달/등대/육지 — 전부 연필 스케치(무채색). #pencil 필터는 CSS 로 적용됨.
  function skySVG() {
    const P = 'fill="none" stroke="#3a3f48" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"';
    const PT = 'fill="none" stroke="#4a5058" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
    const ST = 'fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
    return svg(
      600, 400,
      `<!-- 달: 흰색 (크레이터 없음) -->
       <circle cx="92" cy="72" r="34" fill="#ffffff" stroke="#cfd4da" stroke-width="2.6"/>
       <!-- 별(흰색 작은 십자) -->
       <path d="M300 46 l0 8 M296 50 l8 0" ${ST}/>
       <path d="M470 58 l0 6 M467 61 l6 0" ${ST}/>
       <path d="M200 132 l0 6 M197 135 l6 0" ${ST}/>
       <!-- 수평선 -->
       <path d="M0 300 q150 -6 300 0 T600 300" ${PT}/>
       <!-- 멀리 육지 실루엣(연필) -->
       <path d="M322 300 q44 -40 92 -32 q30 -34 72 -18 q46 -6 114 14 L600 300 Z"
         fill="rgba(58,63,72,0.16)" ${P}/>
       <!-- 등대(연필) -->
       <path d="M470 266 l8 -66 q11 -7 22 0 l8 66 Z" ${P}/>
       <path d="M471 244 l26 0 M472 222 l24 0" ${PT}/>
       <rect x="474" y="184" width="30" height="16" rx="3" ${P}/>
       <path d="M478 184 q11 -12 22 0" ${P}/>
       <line x1="489" y1="178" x2="489" y2="170" ${P}/>
       <circle class="lh-lamp" cx="489" cy="192" r="6.5" fill="#ffffff" stroke="#cfd4da" stroke-width="2"/>`,
      "above-sky-svg"
    ).outerHTML;
  }

  // 물결선(연필) SVG를 배경으로 쓰는 div
  function waveStrip(cls, topPx) {
    const el = document.createElement("div");
    el.className = cls;
    el.style.top = topPx + "px";
    return el;
  }

  function buildAboveWorld(drawings) {
    const shell = document.getElementById("above-world");
    if (!shell) return;
    shell.innerHTML = "";
    shell.hidden = false;
    shell.classList.remove("shown");

    const waterY = H * 0.76; // 위층 화면에서 아래 24%가 바다

    const sky = document.createElement("div");
    sky.className = "above-sky";
    sky.style.height = waterY + "px";
    sky.innerHTML = skySVG();
    shell.appendChild(sky);

    // 바다(아래 밴드) + 수면 물결선
    const sea = document.createElement("div");
    sea.className = "above-sea";
    sea.style.top = waterY + "px";
    shell.appendChild(sea);
    shell.appendChild(waveStrip("above-waveline", waterY - 5)); // 경계 물결선
    shell.appendChild(waveStrip("above-surfwave", waterY + 16)); // 수면 위 잔물결

    above = { panel: shell, swimmers: [], waterY, shown: false, nextToggle: 0, nextJump: 0 };

    Promise.all(
      drawings.map(async (d) => {
        const cropped = await croppedImage(d);
        const el = document.createElement("div");
        el.className = "fish";
        const img = document.createElement("img");
        img.src = cropped.src;
        img.draggable = false;
        el.appendChild(img);
        el.style.zIndex = 4;
        el.hidden = true;
        el.addEventListener("click", () => App.openDrawingModal(d));
        sea.appendChild(el);
        let w = 66 + Math.random() * 34;
        let hh = w * cropped.ratio;
        const bandH = H - waterY;
        if (hh > bandH * 0.8) { const k = (bandH * 0.8) / hh; w *= k; hh *= k; }
        el.style.width = w + "px";
        above.swimmers.push({
          el, w, h: hh,
          x: rand(0, Math.max(1, W - w)),
          y: waterY + rand(6, Math.max(8, H - waterY - hh - 6)),
          vx: rand(12, 24) * (Math.random() < 0.5 ? -1 : 1),
          bob: rand(0, 6.28),
          visible: false, jumping: false, jt: 0, jx: 0, jpeak: 0, jdur: 0,
        });
      })
    ).then(() => {
      // 처음엔 일부만 (중복/과밀 방지)
      const n = above.swimmers.length;
      const showCount = Math.max(1, Math.round(n * 0.4));
      [...above.swimmers].sort(() => Math.random() - 0.5).slice(0, showCount).forEach(showSwimmer);
    });

    // 위층 업데이터를 메인 tick 에 얹음
    eventUpdaters.push(updateAbove);
  }

  function showSwimmer(s) {
    if (!above) return;
    s.visible = true;
    s.el.hidden = false;
    s.y = above.waterY + rand(6, Math.max(8, H - above.waterY - s.h - 6));
    s.x = Math.min(Math.max(s.x, 0), Math.max(0, W - s.w));
  }
  function hideSwimmer(s) {
    if (s.jumping) return;
    s.visible = false;
    s.el.hidden = true;
  }
  function startJump(s) {
    s.jumping = true;
    s.visible = true;
    s.el.hidden = false;
    s.jt = 0;
    s.jdur = rand(1.1, 1.7);
    s.jx = rand(s.w, W - s.w);
    s.jpeak = rand(above.waterY * 0.3, above.waterY * 0.6);
    s.vx = (s.jx < W / 2 ? 1 : -1) * rand(18, 36);
    splash(s.jx, above.waterY);
  }
  function splash(x, y) {
    if (!above) return;
    const sp = document.createElement("div");
    sp.className = "above-splash";
    sp.style.left = x + "px";
    sp.style.top = y + "px";
    above.panel.appendChild(sp);
    setTimeout(() => sp.remove(), 900);
  }

  function updateAbove(t, dt) {
    if (!above) return;
    if (t > above.nextToggle) {
      above.nextToggle = t + rand(1600, 3600);
      const pool = above.swimmers.filter((s) => !s.jumping);
      if (pool.length) {
        const s = pool[Math.floor(Math.random() * pool.length)];
        s.visible ? hideSwimmer(s) : showSwimmer(s);
      }
    }
    if (t > above.nextJump) {
      above.nextJump = t + rand(3500, 8000);
      const hidden = above.swimmers.filter((s) => !s.visible && !s.jumping);
      if (hidden.length) startJump(hidden[Math.floor(Math.random() * hidden.length)]);
    }
    for (const s of above.swimmers) {
      if (s.jumping) {
        s.jt += dt;
        const p = s.jt / s.jdur;
        s.x = s.jx + s.vx * s.jt;
        const arc = Math.sin(Math.min(1, p) * Math.PI);
        const y = above.waterY - arc * s.jpeak - s.h * 0.5;
        s.el.style.transform = `translate(${s.x}px, ${y}px) rotate(${(p - 0.5) * 60}deg)`;
        if (p >= 1) { s.jumping = false; splash(s.x, above.waterY); hideSwimmer(s); }
      } else if (s.visible) {
        s.x += s.vx * dt;
        if (s.x < 0) { s.x = 0; s.vx = Math.abs(s.vx); }
        else if (s.x > W - s.w) { s.x = W - s.w; s.vx = -Math.abs(s.vx); }
        const yy = s.y - above.waterY + Math.sin(t / 900 + s.bob) * 4;
        s.el.style.transform = `translate(${s.x}px, ${yy}px) scaleX(${s.vx < 0 ? -1 : 1})`;
      }
    }
  }

  // ---- 스윕으로 위/아래 세상 오가기 (보름달일 때만 위층 활성) ----
  function setAboveShown(shown) {
    if (!above) return;
    above.shown = shown;
    above.panel.classList.toggle("shown", shown);
    document.body.classList.toggle("above-active", shown);
  }

  function enableSwipe() {
    const shell = document.getElementById("tank-shell") || tank.parentElement;
    if (!shell || shell._swipeBound) return;
    shell._swipeBound = true;
    shell.addEventListener("pointerdown", (e) => {
      if (!above) return;
      swipe = { y0: e.clientY, active: false, moved: false };
    });
    shell.addEventListener("pointermove", (e) => {
      if (!swipe || !above) return;
      const dy = e.clientY - swipe.y0;
      if (!swipe.active && Math.abs(dy) > 24) swipe.active = true;
      if (swipe.active) {
        swipe.moved = true;
        // 아래층(수중)에서 아래로 끌면 위층이 내려온다 / 위층에서 위로 끌면 올라간다
        const base = above.shown ? 0 : -100;
        let pct = base + (dy / shell.clientHeight) * 100;
        pct = Math.max(-100, Math.min(0, pct));
        above.panel.style.transition = "none";
        above.panel.style.transform = `translateY(${pct}%)`;
      }
    });
    const end = (e) => {
      if (!swipe || !above) { swipe = null; return; }
      if (swipe.active) {
        const dy = e.clientY - swipe.y0;
        above.panel.style.transition = "";
        above.panel.style.transform = "";
        if (!above.shown && dy > 60) setAboveShown(true); // 아래→위(바다 위로)
        else if (above.shown && dy < -60) setAboveShown(false); // 위→아래(수중으로)
        else setAboveShown(above.shown);
      }
      swipe = null;
    };
    shell.addEventListener("pointerup", end);
    shell.addEventListener("pointercancel", end);
  }

  function teardownAbove() {
    const shell = document.getElementById("above-world");
    if (shell) { shell.hidden = true; shell.innerHTML = ""; shell.classList.remove("shown"); shell.style.transform = ""; }
    above = null;
    document.body.classList.remove("above-active", "full-moon");
  }

  return {
    // drawings: 공개된 그림들 / comments: 전체 댓글 / opts: { event, fullMoon, startAbove, memoryPool, treasureOpened, onTreasureOpen }
    render(drawings, comments = [], opts = {}) {
      tank = document.getElementById("tank");
      renderGen += 1;
      const gen = renderGen;
      cancelAnimationFrame(rafId);
      clearEvents();
      teardownAbove();
      tank.innerHTML = "";
      actors = [];
      foods = [];
      W = tank.clientWidth;
      H = tank.clientHeight;
      floorY = H * FLOOR_RATIO;

      // 같은 그림이 여러 번 들어와도 한 마리만 (중복/복제 방지)
      const seen = new Set();
      drawings = drawings.filter((d) => (seen.has(d.id) ? false : seen.add(d.id)));

      makeBubbles();

      // 그림별 댓글 텍스트 모음
      const commentMap = new Map();
      for (const c of comments) {
        if (!commentMap.has(c.drawingId)) commentMap.set(c.drawingId, []);
        commentMap.get(c.drawingId).push(c.text);
      }

      // 밥주기: 빈 곳 클릭 → 내 화면에 떨어뜨리고 상대 화면에도 전송 (좌표는 비율로 공유)
      tank.onclick = (e) => {
        if (e.target !== tank) return;
        const rect = tank.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        dropFood(x, y);
        Storage.sendEvent({ type: "food", x: x / W, y: y / H }).catch(() => {});
      };

      if (!drawings.length) {
        const empty = document.createElement("div");
        empty.className = "tank-empty";
        empty.textContent = "아직 수족관이 비어 있어요. 둘 다 그림을 제출하면 여기에 나타나요!";
        tank.appendChild(empty);
      } else {
        drawings.forEach((d) => addActor(d, commentMap.get(d.id), gen));
      }

      // 오늘의 희귀 이벤트 연출
      if (opts.event) {
        const type = opts.event.type;
        if (type === "submarine") spawnSubmarine();
        else if (type === "whales") spawnWhalePod();
        else if (type === "treasure") {
          const mem = window.AquariumEvents.pickMemory(opts.event.seed, opts.memoryPool || []);
          spawnTreasure(mem, opts.treasureOpened, opts.onTreasureOpen);
        }
        // bottle 은 app.js 가 setBottles 로 관리
      }

      // 보름달: 위층(바다 위) 준비 + 스윕 활성 + 수중 상단에 빛 힌트
      document.body.classList.toggle("full-moon", !!opts.fullMoon);
      if (opts.fullMoon && drawings.length) {
        const hint = document.createElement("div");
        hint.className = "moon-hint";
        tank.appendChild(hint); // 위에서 빛이 새어드는 힌트 (스윕하면 위층으로)
        buildAboveWorld(drawings);
        enableSwipe();
        if (opts.startAbove) setTimeout(() => setAboveShown(true), 60); // 디버그용
      }

      lastTime = 0;
      rafId = requestAnimationFrame(tick);
    },

    // 상대방이 보낸 실시간 이벤트 반영 (밥 / 쓰다듬기)
    remoteEvent(evt) {
      if (!tank || !tank.isConnected) return;
      if (evt.type === "food" && typeof evt.x === "number") {
        dropFood(evt.x * W, evt.y * H);
      } else if (evt.type === "pet" && evt.drawingId) {
        const a = actors.find((x) => x.drawingId === evt.drawingId);
        if (a) petActor(a, false);
      }
    },

    // 유리병 편지: 수면에 떠다니는 병 (읽을 병 목록 + 작성 가능 여부)
    setBottles(incoming, composable, handlers) {
      if (!tank) return;
      tank.querySelectorAll(".evt-bottle").forEach((el) => el.remove());
      const make = (kind, onTap) => {
        const el = document.createElement("div");
        el.className = "evt-bottle" + (kind === "read" ? " has-msg" : "");
        el.innerHTML = svg(
          40, 60,
          `<rect x="14" y="6" width="12" height="10" rx="2" ${STROKE}/>
           <path d="M14 16 q-6 6 -6 20 v14 q0 8 12 8 q12 0 12 -8 v-14 q0 -14 -6 -20z" ${STROKE}/>
           <line x1="12" y1="40" x2="28" y2="40" ${STROKE}/>`,
          "evt-svg"
        ).outerHTML;
        el.style.left = rand(W * 0.12, W * 0.8) + "px";
        el.style.setProperty("--float", rand(2.4, 4).toFixed(2) + "s");
        el.addEventListener("click", (e) => { e.stopPropagation(); onTap(); });
        tank.appendChild(el);
        return el;
      };
      (incoming || []).forEach((b) => make("read", () => handlers.onRead(b)));
      if (composable) make("write", () => handlers.onWrite());
    },

    stop() {
      savePositions();
      cancelAnimationFrame(rafId);
      teardownAbove();
    },
  };
})();
