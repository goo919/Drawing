// 공유 수족관 — 공개된 그림들이 물고기처럼 유영하는 화면

const Aquarium = (() => {
  let tank = null;
  let fishes = []; // { el, x, y, vx, baseY, bobAmp, bobSpeed, phase, size }
  let rafId = null;
  let lastTime = 0;

  function makeBubbles() {
    for (let i = 0; i < 14; i++) {
      const b = document.createElement("div");
      b.className = "bubble";
      b.style.left = Math.random() * 100 + "%";
      b.style.width = b.style.height = 6 + Math.random() * 16 + "px";
      b.style.animationDuration = 7 + Math.random() * 9 + "s";
      b.style.animationDelay = -Math.random() * 12 + "s";
      tank.appendChild(b);
    }
    for (let i = 0; i < 5; i++) {
      const s = document.createElement("div");
      s.className = "seaweed";
      s.style.left = 4 + i * 22 + Math.random() * 8 + "%";
      s.style.height = 60 + Math.random() * 70 + "px";
      s.style.animationDelay = -Math.random() * 4 + "s";
      tank.appendChild(s);
    }
  }

  function addFish(drawing, index) {
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

    const fish = {
      el,
      drawing,
      size,
      x: Math.random() * Math.max(1, W - size),
      baseY: 30 + Math.random() * Math.max(1, H - size - 90),
      vx: (18 + Math.random() * 22) * (Math.random() < 0.5 ? -1 : 1),
      bobAmp: 8 + Math.random() * 14,
      bobSpeed: 0.5 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
    };
    fishes.push(fish);
  }

  function tick(t) {
    const dt = Math.min(0.05, (t - lastTime) / 1000 || 0);
    lastTime = t;
    const W = tank.clientWidth;

    for (const f of fishes) {
      f.x += f.vx * dt;
      if (f.x < 0) {
        f.x = 0;
        f.vx = Math.abs(f.vx);
      } else if (f.x > W - f.size) {
        f.x = Math.max(0, W - f.size);
        f.vx = -Math.abs(f.vx);
      }
      const y = f.baseY + Math.sin(t / 1000 * f.bobSpeed + f.phase) * f.bobAmp;
      // 그림이 보통 오른쪽을 보고 그려졌다고 가정하지 않고, 진행 방향으로 살짝 기울임만
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
      makeBubbles();

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
