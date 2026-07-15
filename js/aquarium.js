// 공유 수족관 — 공개된 그림들이 물고기처럼 유영하는 화면
// 빈 곳을 클릭하면 밥이 떨어지고, 물고기들이 다가와서 먹는다.

const Aquarium = (() => {
  const FOOD_LIFE = 12000; // 밥이 사라지기까지 (ms)
  const MAX_FOOD = 12;
  const CHASE_SPEED = 65; // 밥 쫓아갈 때 속도 (px/s)

  let tank = null;
  let fishes = []; // { el, x, baseY, vx, bobAmp, bobSpeed, phase, size }
  let foods = []; // { el, x, y, vy, born, sway, resting }
  let rafId = null;
  let lastTime = 0;

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

  function addFish(drawing) {
    const el = document.createElement("div");
    el.className = "fish";
    const img = document.createElement("img");
    img.src = drawing.image;
    img.alt = drawing.topic;
    img.draggable = false;
    el.appendChild(img);
    el.addEventListener("click", () => App.openDrawingModal(drawing));
    tank.appendChild(el);

    const W = tank.clientWidth;
    const H = tank.clientHeight;
    const size = 80 + Math.random() * 60;
    el.style.width = size + "px";

    fishes.push({
      el,
      size,
      x: Math.random() * Math.max(1, W - size),
      baseY: 30 + Math.random() * Math.max(1, H - size - 90),
      vx: (18 + Math.random() * 22) * (Math.random() < 0.5 ? -1 : 1),
      bobAmp: 8 + Math.random() * 14,
      bobSpeed: 0.5 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
    });
  }

  // ---------- 밥 주기 ----------
  function dropFood(x, y) {
    if (foods.length >= MAX_FOOD) removeFood(foods[0]);
    const el = document.createElement("div");
    el.className = "food";
    tank.appendChild(el);
    foods.push({
      el,
      x,
      y,
      vy: 22 + Math.random() * 12,
      born: performance.now(),
      sway: Math.random() * Math.PI * 2,
      resting: false,
    });
  }

  function removeFood(food) {
    food.el.remove();
    foods = foods.filter((f) => f !== food);
  }

  function nearestFood(cx, cy) {
    let best = null;
    let bestDist = Infinity;
    for (const food of foods) {
      const d = Math.hypot(food.x - cx, food.y - cy);
      if (d < bestDist) {
        bestDist = d;
        best = food;
      }
    }
    return best;
  }

  // ---------- 애니메이션 ----------
  function tick(t) {
    const dt = Math.min(0.05, (t - lastTime) / 1000 || 0);
    lastTime = t;
    const W = tank.clientWidth;
    const H = tank.clientHeight;

    // 밥: 천천히 흔들리며 가라앉기
    for (const food of [...foods]) {
      if (t - food.born > FOOD_LIFE) {
        removeFood(food);
        continue;
      }
      if (!food.resting) {
        food.y += food.vy * dt;
        food.x += Math.sin(t / 350 + food.sway) * 10 * dt;
        if (food.y >= H - 12) {
          food.y = H - 12;
          food.resting = true;
        }
      }
      food.el.style.transform = `translate(${food.x - 4}px, ${food.y - 4}px)`;
    }

    // 물고기
    for (const f of fishes) {
      const cx = f.x + f.size / 2;
      const cy = f.baseY + f.size * 0.35;
      const target = foods.length ? nearestFood(cx, cy) : null;

      if (target) {
        // 밥을 향해 헤엄치기
        const dx = target.x - cx;
        const dy = target.y - cy;
        if (Math.abs(dx) > 4) {
          f.x += Math.sign(dx) * CHASE_SPEED * dt;
          f.vx = Math.sign(dx) * Math.abs(f.vx); // 진행 방향 갱신
        }
        f.baseY += Math.max(-CHASE_SPEED * dt, Math.min(CHASE_SPEED * dt, dy));
        if (Math.hypot(dx, dy) < Math.max(24, f.size * 0.35)) {
          removeFood(target); // 냠
        }
      } else {
        f.x += f.vx * dt;
      }

      if (f.x < 0) {
        f.x = 0;
        f.vx = Math.abs(f.vx);
      } else if (f.x > W - f.size) {
        f.x = Math.max(0, W - f.size);
        f.vx = -Math.abs(f.vx);
      }
      f.baseY = Math.max(6, Math.min(H - f.size - 6, f.baseY));

      const y = f.baseY + Math.sin((t / 1000) * f.bobSpeed + f.phase) * f.bobAmp;
      const flip = f.vx < 0 ? -1 : 1;
      f.el.style.transform = `translate(${f.x}px, ${y}px) scaleX(${flip})`;
    }
    rafId = requestAnimationFrame(tick);
  }

  return {
    // drawings: 공개된(둘 다 제출 완료) 그림 목록
    render(drawings) {
      tank = document.getElementById("tank");
      cancelAnimationFrame(rafId);
      tank.innerHTML = "";
      fishes = [];
      foods = [];
      makeBubbles();

      // 빈 곳 클릭 → 밥 떨어뜨리기 (물고기 클릭은 그림 보기 유지)
      tank.onclick = (e) => {
        if (e.target !== tank) return;
        const rect = tank.getBoundingClientRect();
        dropFood(e.clientX - rect.left, e.clientY - rect.top);
      };

      if (!drawings.length) {
        const empty = document.createElement("div");
        empty.className = "tank-empty";
        empty.textContent = "아직 수족관이 비어 있어요. 둘 다 그림을 제출하면 여기에 나타나요!";
        tank.appendChild(empty);
      } else {
        drawings.forEach(addFish);
      }
      lastTime = 0;
      rafId = requestAnimationFrame(tick);
    },

    stop() {
      cancelAnimationFrame(rafId);
    },
  };
})();
