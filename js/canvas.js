// 캔버스 드로잉 도구
// - 기본 8색 / 파스텔 8색 토글
// - 브러시 굵기 슬라이더, 지우개
// - 줌 (버튼 / 마우스 휠 / 두 손가락 핀치)
// - 실행 취소, 전체 지우기
// - 투명 배경으로 저장 → 수족관/도감에서 동물만 또렷하게 보임

const DrawingCanvas = (() => {
  const SIZE = 600; // 논리 캔버스 크기 (px)
  const MAX_UNDO = 40;

  const PALETTES = {
    basic: [
      { name: "빨강", color: "#e63946" },
      { name: "주황", color: "#f77f00" },
      { name: "노랑", color: "#ffd60a" },
      { name: "초록", color: "#38b000" },
      { name: "파랑", color: "#1982c4" },
      { name: "남색", color: "#3a0ca3" },
      { name: "보라", color: "#9d4edd" },
      { name: "검정", color: "#2b2d31" },
    ],
    pastel: [
      { name: "파스텔 빨강", color: "#ffadad" },
      { name: "파스텔 주황", color: "#ffd6a5" },
      { name: "파스텔 노랑", color: "#fdffb6" },
      { name: "파스텔 초록", color: "#caffbf" },
      { name: "파스텔 파랑", color: "#a0c4ff" },
      { name: "파스텔 남색", color: "#bdb2ff" },
      { name: "파스텔 보라", color: "#ffc6ff" },
      { name: "회색", color: "#a8a8b3" },
    ],
  };

  let canvas, ctx, viewport;
  let paletteName = "basic";
  let colorIndex = 7; // 검정으로 시작
  let brushSize = 8;
  let eraser = false;
  let zoom = 1;
  let drawing = false;
  let last = null;
  let hasDrawn = false;
  let undoStack = [];
  let pointers = new Map(); // 핀치 감지용
  let pinchStart = null;

  function currentColor() {
    return PALETTES[paletteName][colorIndex].color;
  }

  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SIZE,
      y: ((e.clientY - rect.top) / rect.height) * SIZE,
    };
  }

  function pushUndo() {
    undoStack.push(ctx.getImageData(0, 0, SIZE, SIZE));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    updateButtons();
  }

  function undo() {
    if (!undoStack.length) return;
    ctx.putImageData(undoStack.pop(), 0, 0);
    hasDrawn = undoStack.length > 0 || hasDrawn;
    updateButtons();
  }

  async function clearAll() {
    if (!hasDrawn) return;
    if (!(await UI.confirm("정말 전부 지울까요?"))) return;
    pushUndo();
    ctx.clearRect(0, 0, SIZE, SIZE);
    updateButtons();
  }

  function setZoom(z, focus) {
    const prev = zoom;
    zoom = Math.min(4, Math.max(0.4, z));
    canvas.style.width = SIZE * zoom + "px";
    canvas.style.height = SIZE * zoom + "px";
    // 포커스 지점(뷰포트 기준)이 유지되도록 스크롤 보정
    if (focus && viewport) {
      const scale = zoom / prev;
      viewport.scrollLeft = (viewport.scrollLeft + focus.x) * scale - focus.x;
      viewport.scrollTop = (viewport.scrollTop + focus.y) * scale - focus.y;
    }
    const label = document.getElementById("zoom-label");
    if (label) label.textContent = Math.round(zoom * 100) + "%";
  }

  // 살짝 삐뚤빼뚤한 낙서 느낌: 점마다 미세한 흔들림 + 굵기 변화
  function jitter(p) {
    const j = Math.min(2.2, 0.6 + brushSize * 0.05);
    return {
      x: p.x + (Math.random() - 0.5) * 2 * j,
      y: p.y + (Math.random() - 0.5) * 2 * j,
    };
  }

  function strokeTo(rawP) {
    const p = jitter(rawP);
    ctx.globalCompositeOperation = eraser ? "destination-out" : "source-over";
    ctx.strokeStyle = currentColor();
    ctx.lineWidth = brushSize * (0.92 + Math.random() * 0.16);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  }

  function onPointerDown(e) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      // 두 손가락 → 그리던 선을 취소하고 핀치 줌 시작
      if (drawing) {
        drawing = false;
        if (undoStack.length) ctx.putImageData(undoStack.pop(), 0, 0);
        updateButtons();
      }
      const pts = [...pointers.values()];
      pinchStart = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        zoom,
        cx: (pts[0].x + pts[1].x) / 2,
        cy: (pts[0].y + pts[1].y) / 2,
      };
      return;
    }
    if (pointers.size > 2) return;

    drawing = true;
    pushUndo();
    last = canvasPoint(e);
    strokeTo(canvasPoint(e)); // 점 하나도 찍히게
    hasDrawn = true;
    updateButtons();
  }

  function onPointerMove(e) {
    if (pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinchStart && pointers.size === 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      setZoom(pinchStart.zoom * (dist / pinchStart.dist));
      // 두 손가락 이동으로 화면 이동(팬)
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      viewport.scrollLeft += pinchStart.cx - cx;
      viewport.scrollTop += pinchStart.cy - cy;
      pinchStart.cx = cx;
      pinchStart.cy = cy;
      return;
    }
    if (!drawing) return;
    strokeTo(canvasPoint(e));
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    drawing = false;
  }

  function updateButtons() {
    const undoBtn = document.getElementById("btn-undo");
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  }

  function renderPalette() {
    const wrap = document.getElementById("palette");
    wrap.innerHTML = "";
    PALETTES[paletteName].forEach((c, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch" + (i === colorIndex && !eraser ? " active" : "");
      b.style.background = c.color;
      b.title = c.name;
      b.setAttribute("aria-label", c.name);
      b.addEventListener("click", () => {
        colorIndex = i;
        eraser = false;
        document.getElementById("btn-eraser").classList.remove("active");
        renderPalette();
      });
      wrap.appendChild(b);
    });
  }

  return {
    init() {
      canvas = document.getElementById("draw-canvas");
      viewport = document.getElementById("canvas-viewport");
      canvas.width = SIZE;
      canvas.height = SIZE;
      ctx = canvas.getContext("2d");

      // 모바일에서 화면 폭에 맞게 시작
      const fit = Math.min(1, (viewport.clientWidth - 16) / SIZE);
      setZoom(fit || 1);

      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);

      // 마우스 휠 줌
      viewport.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          const rect = viewport.getBoundingClientRect();
          setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9), {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          });
        },
        { passive: false }
      );

      document.getElementById("btn-zoom-in").addEventListener("click", () => setZoom(zoom + 0.25));
      document.getElementById("btn-zoom-out").addEventListener("click", () => setZoom(zoom - 0.25));
      document.getElementById("btn-undo").addEventListener("click", undo);
      document.getElementById("btn-clear").addEventListener("click", clearAll);

      const brush = document.getElementById("brush-size");
      const brushLabel = document.getElementById("brush-label");
      brush.addEventListener("input", () => {
        brushSize = Number(brush.value);
        brushLabel.textContent = brushSize;
      });
      brushSize = Number(brush.value);
      brushLabel.textContent = brushSize;

      document.getElementById("pastel-toggle").addEventListener("change", (e) => {
        paletteName = e.target.checked ? "pastel" : "basic";
        renderPalette();
      });

      document.getElementById("btn-eraser").addEventListener("click", (e) => {
        eraser = !eraser;
        e.currentTarget.classList.toggle("active", eraser);
        renderPalette();
      });

      renderPalette();
      updateButtons();
    },

    isEmpty() {
      return !hasDrawn || !ctx.getImageData(0, 0, SIZE, SIZE).data.some((v) => v !== 0);
    },

    // 투명 배경 PNG (base64)
    getImage() {
      return canvas.toDataURL("image/png");
    },

    reset() {
      if (ctx) ctx.clearRect(0, 0, SIZE, SIZE);
      undoStack = [];
      hasDrawn = false;
      updateButtons();
    },
  };
})();
