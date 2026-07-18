// 분위기 연출 레이어 — 상대방 위치의 시간대(틴트)와 날씨(파티클)를 수족관 위에 얹는다.
// 동물 행동 엔진(aquarium.js)은 건드리지 않고, 별도 캔버스 오버레이 + CSS 로만 처리.
// aquarium.js 의 tick() 이 프레임마다 Ambience.frame(t) 을 호출해 같은 RAF 루프를 공유한다.

const Ambience = (() => {
  const L = window.PARTICLE_LIMITS || { RAIN: 40, SNOW: 25 };

  let tank = null;
  let canvas = null;
  let ctx = null;
  let W = 0, H = 0, dpr = 1;
  let weather = "clear";
  let phase = "day";
  let rain = []; // { x, y, len, sp }
  let ripples = []; // { x, y, r, max, life }
  let snow = []; // { x, y, r, sp, drift, ph }
  let rays = false;
  let lastT = 0;
  let rippleTimer = 0;

  const rand = (a, b) => a + Math.random() * (b - a);

  function resize() {
    if (!tank || !canvas) return;
    W = tank.clientWidth;
    H = tank.clientHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seedRain() {
    rain = [];
    const n = Math.min(L.RAIN, 40);
    for (let i = 0; i < n; i++) {
      rain.push({ x: rand(0, W), y: rand(0, H), len: rand(8, 16), sp: rand(360, 560) });
    }
  }

  function seedSnow() {
    snow = [];
    const n = Math.min(L.SNOW, 25);
    for (let i = 0; i < n; i++) {
      snow.push({
        x: rand(0, W),
        y: rand(0, H),
        r: rand(1.5, 3.2),
        sp: rand(18, 42),
        drift: rand(8, 22),
        ph: rand(0, Math.PI * 2),
      });
    }
  }

  const surfaceY = () => H * 0.06; // 수면 대략 높이(파문 생성 지점)

  function stepRain(dt) {
    ctx.strokeStyle = "rgba(40,44,52,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of rain) {
      d.y += d.sp * dt;
      d.x -= d.sp * 0.12 * dt; // 살짝 비스듬히
      if (d.y > H) {
        d.y = -d.len;
        d.x = rand(0, W + 60);
      }
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 1.5, d.y + d.len);
    }
    ctx.stroke();

    // 수면 파문을 이따금 생성
    rippleTimer -= dt;
    if (rippleTimer <= 0) {
      rippleTimer = rand(0.12, 0.32);
      ripples.push({ x: rand(0, W), y: surfaceY() + rand(0, H * 0.05), r: 1, max: rand(9, 20), life: 1 });
    }
    ctx.lineWidth = 1.2;
    for (const rp of ripples) {
      rp.r += 26 * dt;
      rp.life -= dt * 1.1;
      ctx.strokeStyle = `rgba(40,44,52,${Math.max(0, rp.life) * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ripples = ripples.filter((r) => r.life > 0 && r.r < r.max);
  }

  function stepSnow(t, dt) {
    ctx.fillStyle = "rgba(70,74,82,0.5)";
    for (const s of snow) {
      s.y += s.sp * dt;
      s.x += Math.sin(t / 1000 + s.ph) * s.drift * dt;
      if (s.y > H + 4) {
        s.y = -4;
        s.x = rand(0, W);
      }
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRays() {
    // 낮+맑음: 수면에서 비치는 아주 옅은 광선 (원색 없이 흰빛)
    const bands = [0.18, 0.42, 0.68];
    for (const bx of bands) {
      const x = W * bx;
      const grad = ctx.createLinearGradient(x, 0, x + W * 0.12, H * 0.7);
      grad.addColorStop(0, "rgba(255,255,255,0.16)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + W * 0.06, 0);
      ctx.lineTo(x + W * 0.16, H * 0.7);
      ctx.lineTo(x + W * 0.02, H * 0.7);
      ctx.closePath();
      ctx.fill();
    }
  }

  return {
    init() {
      tank = document.getElementById("tank");
      canvas = document.getElementById("ambience-fx");
      if (!tank || !canvas) return;
      resize();
      window.addEventListener("resize", resize);
    },

    setPhase(p) {
      phase = p;
      rays = phase === "day" && weather === "clear";
      // 밤 발광 등은 CSS 가 body 클래스로 처리 (app.js 가 설정)
    },

    setWeather(w) {
      if (w === weather) return;
      weather = w;
      rays = phase === "day" && weather === "clear";
      if (w === "rain") seedRain();
      else if (w === "snow") seedSnow();
      if (canvas && ctx) ctx.clearRect(0, 0, W, H);
    },

    // aquarium.js tick 에서 매 프레임 호출
    frame(t) {
      if (!ctx) return;
      const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
      lastT = t;
      // 크기 변동 대응
      if (tank && (tank.clientWidth !== W || tank.clientHeight !== H)) resize();
      ctx.clearRect(0, 0, W, H);
      if (rays) drawRays();
      if (weather === "rain") stepRain(dt);
      else if (weather === "snow") stepSnow(t, dt);
    },

    // 수족관을 떠날 때 캔버스 정리
    clear() {
      if (ctx) ctx.clearRect(0, 0, W, H);
    },
  };
})();

// aquarium.js 등 다른 스크립트에서 window.Ambience 로 접근 (const 는 window 속성이 아니므로 명시 노출)
window.Ambience = Ambience;
