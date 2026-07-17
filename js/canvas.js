// 캔버스 드로잉 도구
// - 기본 8색 / 파스텔 8색 토글, 브러시 굵기, 지우개, 좌우 반전
// - 줌 (버튼 / 마우스 휠 / 두 손가락 핀치 + 팬)
// - 실행 취소, 전체 지우기
// - 캔버스 비율은 기기 화면(그리는 칸)에 맞춰 세로로 길어짐
// - 도구 패널은 접이식: 펼쳐도 캔버스 위에 겹칠 뿐, 캔버스 크기/상태에 영향 없음
// - 투명 배경으로 저장 → 수족관/도감에서 동물만 또렷하게 보임

const DrawingCanvas = (() => {
  const CW = 600; // 논리 캔버스 가로 (px)
  let CH = 600; //  논리 캔버스 세로 — init 때 화면 비율에 맞춰 결정
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

  let canvas, ctx, viewport, panel, toggleBtn;
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
  let userZoomed = false; // 사용자가 줌을 직접 조작했는지

  function currentColor() {
    return PALETTES[paletteName][colorIndex].color;
  }

  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CW,
      y: ((e.clientY - rect.top) / rect.height) * CH,
    };
  }

  function pushUndo() {
    undoStack.push(ctx.getImageData(0, 0, CW, CH));
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
    ctx.clearRect(0, 0, CW, CH);
    updateButtons();
  }

  function flipHorizontal() {
    if (!hasDrawn) return;
    pushUndo();
    const tmp = document.createElement("canvas");
    tmp.width = CW;
    tmp.height = CH;
    tmp.getContext("2d").drawImage(canvas, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, CW, CH);
    ctx.translate(CW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }

  function setZoom(z, focus) {
    const prev = zoom;
    zoom = Math.min(4, Math.max(0.3, z));
    canvas.style.width = CW * zoom + "px";
    canvas.style.height = CH * zoom + "px";
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

  // ---------- 도구 패널 (접이식 오버레이) ----------
  function setPanel(open) {
    panel.hidden = !open;
    toggleBtn.classList.toggle("open", open);
    toggleBtn.setAttribute("aria-expanded", String(open));
  }

  function updateCurrentColor() {
    const dot = document.getElementById("current-color");
    if (!dot) return;
    dot.classList.toggle("eraser", eraser);
    dot.style.background = eraser ? "" : currentColor();
  }

  // ---------- 포인터 ----------
  function onPointerDown(e) {
    setPanel(false); // 그리기 시작하면 도구 패널 접기
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
      userZoomed = true;
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
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      // 손가락 사이 지점을 중심으로 확대/축소
      const rect = viewport.getBoundingClientRect();
      setZoom(pinchStart.zoom * (dist / pinchStart.dist), {
        x: cx - rect.left,
        y: cy - rect.top,
      });
      // 두 손가락 이동으로 화면 이동(팬)
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
    updateCurrentColor();
  }

  return {
    init() {
      canvas = document.getElementById("draw-canvas");
      viewport = document.getElementById("canvas-viewport");
      panel = document.getElementById("tool-panel");
      toggleBtn = document.getElementById("tools-toggle");

      canvas.width = CW;
      canvas.height = CH;
      ctx = canvas.getContext("2d");

      const fitToViewport = () => {
        const vw = viewport.clientWidth - 16;
        const vh = viewport.clientHeight - 16;
        if (vw < 50 || vh < 50) return;
        setZoom(Math.min(1, vw / CW, vh / CH));
      };

      // 그리는 칸의 비율에 맞춰 캔버스 세로 길이 결정 (세로가 길면 세로형 캔버스)
      // 첫 획을 긋기 전까지는 화면 변화(버튼 접기 등)에 맞춰 비율을 계속 갱신
      const sizeCanvasIfNeeded = () => {
        if (hasDrawn) return;
        const availW = viewport.clientWidth - 16;
        const availH = viewport.clientHeight - 16;
        if (availW < 50 || availH < 50) return; // 아직 숨겨져 있음
        const newCH = availH > availW
          ? Math.min(1100, Math.round(CW * (availH / availW)))
          : 600;
        if (newCH !== CH) {
          CH = newCH;
          canvas.height = CH; // (그리기 전이라 내용 손실 없음)
        }
        fitToViewport();
      };
      sizeCanvasIfNeeded();

      this.refit = () => {
        sizeCanvasIfNeeded();
        if (!userZoomed) fitToViewport();
      };
      window.addEventListener("resize", () => {
        sizeCanvasIfNeeded();
        if (!userZoomed) fitToViewport();
      });

      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);

      // 마우스 휠 줌
      viewport.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          userZoomed = true;
          const rect = viewport.getBoundingClientRect();
          setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9), {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          });
        },
        { passive: false }
      );

      toggleBtn.addEventListener("click", () => setPanel(panel.hidden));

      // 패널이 열린 상태에서 도구 바깥(캔버스 등)을 누르면 자동으로 접기
      document.addEventListener(
        "pointerdown",
        (e) => {
          if (!panel.hidden && !e.target.closest(".toolbar")) setPanel(false);
        },
        true
      );

      // 버튼 줌은 보이는 화면의 정중앙을 기준으로
      const centerFocus = () => ({
        x: viewport.clientWidth / 2,
        y: viewport.clientHeight / 2,
      });
      document.getElementById("btn-zoom-in").addEventListener("click", () => {
        userZoomed = true;
        setZoom(zoom + 0.25, centerFocus());
      });
      document.getElementById("btn-zoom-out").addEventListener("click", () => {
        userZoomed = true;
        setZoom(zoom - 0.25, centerFocus());
      });
      document.getElementById("btn-undo").addEventListener("click", undo);
      document.getElementById("btn-clear").addEventListener("click", clearAll);
      document.getElementById("btn-flip").addEventListener("click", flipHorizontal);

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
      return !hasDrawn || !ctx.getImageData(0, 0, CW, CH).data.some((v) => v !== 0);
    },

    // 투명 배경 PNG (base64)
    getImage() {
      return canvas.toDataURL("image/png");
    },

    reset() {
      if (ctx) ctx.clearRect(0, 0, CW, CH);
      undoStack = [];
      hasDrawn = false;
      updateButtons();
    },

    // 기존 그림을 캔버스에 불러오기 (당일 수정용)
    // 캔버스 비율이 달라도 그림이 들어가도록 맞춰서 그림
    loadImage(src) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, CW, CH);
          ctx.globalCompositeOperation = "source-over";
          const s = Math.min(CW / img.width, CH / img.height);
          const w = img.width * s;
          const h = img.height * s;
          ctx.drawImage(img, (CW - w) / 2, 0, w, h);
          undoStack = [];
          hasDrawn = true;
          updateButtons();
          resolve();
        };
        img.onerror = () => resolve();
        img.src = src;
      });
    },
  };
})();
