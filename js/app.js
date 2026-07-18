// 앱 메인 로직: 오늘의 주제, 비공개 규칙, 탭 전환, 프로필, 모달

const App = (() => {
  const LOAD_START = Date.now(); // 로딩 화면 최소 표시 시간 계산용
  const AUTH_KEY = "aquarium_login_v1"; // 자동 로그인용 { user, hash }
  const KST_OFFSET = 9 * 3600 * 1000; // 앱의 "하루"는 항상 한국시간 기준

  // 두 사람 고정 계정: 아이디로 누구인지 판별
  const USERS = { A: "자성", B: "지수" };

  function idToUser(input) {
    const s = (input || "").trim().toLowerCase();
    if (s.startsWith("자성") || s === "jaseong") return "A";
    if (s.startsWith("지수") || s === "jisu") return "B";
    return null;
  }

  const state = {
    me: null, // 'A'(자성) | 'B'(지수)
    names: { ...USERS },
    drawings: [],
    tab: "aquarium", // 앱을 열면 수족관부터
    dogamSort: "newest",
    dogamWho: "all",
    aquariumDate: "all",
    todayKey: null,
    editing: false, // 당일 그림 수정 중
    comments: [],
    rolloverHour: 6, // 주제가 바뀌는 시각 (KST, 공유 설정)
    modalDrawing: null,
  };

  // 유형별 안내 문구 (수족관에서 어떻게 움직이는지)
  const TYPE_LABELS = {
    swim: "물속을 자유롭게 헤엄쳐 다녀요",
    surface: "수면 근처에서 놀아요",
    jelly: "둥실둥실 떠다녀요",
    walker: "바닥을 걸어다니고 가끔 헤엄도 쳐요",
    crawler: "느릿느릿 기어다녀요",
    reef: "배경이 되어 가만히 자리를 지켜요",
    plant: "바닥에서 살랑살랑 흔들려요",
    giant: "저 멀리서 아주 천천히 지나가요",
  };

  // ---------- 날짜 / 주제 ----------
  // 기기 시간대와 무관하게, 한국시간(KST) 기준으로 "앱의 오늘"을 계산.
  // 전환 시각(rolloverHour, 기본 오전 6시)이 지나야 다음 날로 넘어간다.
  function appDayKey() {
    const shifted = new Date(Date.now() + KST_OFFSET - state.rolloverHour * 3600 * 1000);
    return shifted.toISOString().slice(0, 10);
  }

  // 테스트용 주제 이동량 (Cmd/Ctrl+T 또는 주제 카드 3연타로 변경, 이 기기에서만 적용)
  let topicOffset = Number(localStorage.getItem("aquarium_topic_offset") || 0);

  function topicForDate(key) {
    const [y, m, d] = key.split("-").map(Number);
    const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86400000) + topicOffset;
    const idx = ((days % TOPICS.length) + TOPICS.length) % TOPICS.length;
    return TOPICS[idx];
  }

  function debugNextTopic() {
    topicOffset += 1;
    localStorage.setItem("aquarium_topic_offset", topicOffset);
    renderToday();
    UI.toast("테스트: 주제 변경 → " + topicForDate(state.todayKey).t);
  }

  // ---------- 디버그 파라미터 (?debug_hour=22&debug_weather=rain 등) ----------
  const DEBUG = (() => {
    const q = new URLSearchParams(location.search);
    const hour = q.has("debug_hour") ? Number(q.get("debug_hour")) : null;
    return {
      hour: Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : null,
      weather: q.get("debug_weather"), // clear|cloudy|rain|snow
      event: q.get("debug_event"), // submarine|whales|treasure|bottle
      fullmoon: q.has("debug_fullmoon"),
    };
  })();

  // ---------- 분위기: 상대방 세계(시간대 + 날씨) 연동 ----------
  const Ambient = (() => {
    const WEATHER_CACHE_KEY = "aquarium_weather_v1";
    let clockTimer = null;
    let weatherTimer = null;
    let started = false;
    let curWeather = "clear";

    function partnerLoc() {
      const loc = window.LOCATIONS || {};
      return loc[window.partnerOf(state.me)] || null;
    }

    // 상대 현지 시:분 (Intl 로 타임존 변환, 외부 API 불필요)
    function partnerNow(loc) {
      const fmt = new Intl.DateTimeFormat("ko-KR", {
        timeZone: loc.tz,
        hour: "2-digit", minute: "2-digit", hour12: false,
        year: "numeric", month: "numeric", day: "numeric", weekday: "short",
      });
      const parts = {};
      for (const p of fmt.formatToParts(new Date())) parts[p.type] = p.value;
      let hour = Number(parts.hour);
      if (hour === 24) hour = 0; // ko-KR 가 자정을 24로 주는 경우
      return {
        hour,
        minute: Number(parts.minute),
        y: Number(parts.year), m: Number(parts.month), d: Number(parts.day),
        weekday: parts.weekday,
        dateKey: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
      };
    }

    let curPhase = "day";
    function applyPhase(phase) {
      curPhase = phase;
      document.body.classList.remove("amb-dawn", "amb-day", "amb-dusk", "amb-night");
      document.body.classList.add("amb-" + phase);
      if (window.Ambience) Ambience.setPhase(phase);
    }

    function updateClock() {
      const loc = partnerLoc();
      const widget = document.getElementById("window-widget");
      if (!loc) {
        if (widget) widget.hidden = true;
        return;
      }
      const now = partnerNow(loc);
      const hour = DEBUG.hour != null ? DEBUG.hour : now.hour;
      applyPhase(window.phaseForHour(hour));

      // 위젯 갱신
      widget.hidden = false;
      document.getElementById("ww-name").textContent = displayName(window.partnerOf(state.me));
      const ampm = hour < 12 ? "오전" : "오후";
      const h12 = hour % 12 === 0 ? 12 : hour % 12;
      document.getElementById("ww-time").textContent =
        `${ampm} ${h12}:${String(now.minute).padStart(2, "0")}`;
      const dateEl = document.getElementById("ww-date");
      dateEl.textContent = `${now.m}/${now.d} (${now.weekday})`;
      // 내 현지 날짜와 다르면 강조 (시차로 하루 차이)
      const myKey = new Date().toISOString().slice(0, 10); // 근사(로컬)
      const myLocalDate = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
      dateEl.classList.toggle("ahead", now.dateKey !== myLocalDate);
    }

    async function fetchWeather(loc) {
      // 30분 캐시
      try {
        const c = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || "null");
        if (c && c.key === loc.tz && Date.now() - c.at < 30 * 60 * 1000) return c;
      } catch {}
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("weather " + res.status);
      const data = await res.json();
      const rec = {
        key: loc.tz,
        at: Date.now(),
        temp: Math.round(data.current?.temperature_2m ?? NaN),
        weather: window.wmoToWeather(data.current?.weather_code),
      };
      try {
        localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(rec));
      } catch {}
      return rec;
    }

    function applyWeather(weather, temp) {
      curWeather = weather;
      if (window.Ambience) Ambience.setWeather(weather);
      document.body.classList.toggle("amb-cloudy", weather === "cloudy");
      const wEl = document.getElementById("ww-weather");
      const icon = (window.WEATHER_ICON || {})[weather] || "";
      wEl.textContent = Number.isFinite(temp) ? `${icon} ${temp}°` : icon;
    }

    async function updateWeather() {
      const loc = partnerLoc();
      if (!loc) return;
      if (DEBUG.weather) {
        applyWeather(DEBUG.weather, NaN);
        return;
      }
      try {
        const rec = await fetchWeather(loc);
        applyWeather(rec.weather, rec.temp);
      } catch (e) {
        console.warn("날씨 불러오기 실패 — 맑음으로 폴백", e);
        applyWeather("clear", NaN); // 앱은 계속 동작
      }
    }

    return {
      start() {
        if (!state.me) return;
        if (window.Ambience) Ambience.init();
        updateClock();
        updateWeather();
        if (!started) {
          started = true;
          clockTimer = setInterval(updateClock, 60 * 1000); // 1분마다 시각/시간대
          weatherTimer = setInterval(updateWeather, 15 * 60 * 1000); // 15분마다 날씨(캐시 30분)
        }
      },
      refresh() {
        updateClock(); // 이름/설정 바뀌면 즉시
      },
      phase() {
        return DEBUG.hour != null ? window.phaseForHour(DEBUG.hour) : curPhase;
      },
    };
  })();

  // ---------- 파생 데이터 ----------
  function drawingsOf(date) {
    return state.drawings.filter((d) => d.date === date);
  }
  function isRevealed(date) {
    const list = drawingsOf(date);
    return list.some((d) => d.user === "A") && list.some((d) => d.user === "B");
  }
  // 공개된 그림 (수족관용)
  function revealedDrawings() {
    return state.drawings.filter((d) => isRevealed(d.date));
  }
  // 내가 볼 수 있는 그림 (도감용): 공개된 것 + 내 그림
  function visibleDrawings() {
    return state.drawings.filter((d) => isRevealed(d.date) || d.user === state.me);
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s ?? "";
    return div.innerHTML;
  }

  function displayName(user) {
    return state.names[user] || user;
  }

  // ---------- 오늘 탭 ----------
  function renderToday() {
    const key = state.todayKey;
    const topic = topicForDate(key);
    document.getElementById("today-date").textContent = key.replaceAll("-", ". ");
    document.getElementById("today-topic").textContent = topic.t;
    document.getElementById("today-type").textContent = TYPE_LABELS[topic.type] || "";

    const mine = drawingsOf(key).find((d) => d.user === state.me);
    const partner = state.me === "A" ? "B" : "A";
    const theirs = drawingsOf(key).find((d) => d.user === partner);

    // 상태 카드
    const status = document.getElementById("today-status");
    status.innerHTML = `
      <div class="status-card ${mine ? "done" : ""}">
        <span class="status-name">${escapeHtml(displayName(state.me))} (나)</span>
        <span class="status-text">${mine ? "제출 완료" : "아직 안 그렸어요"}</span>
      </div>
      <div class="status-card ${theirs ? "done" : ""}">
        <span class="status-name">${escapeHtml(displayName(partner))}</span>
        <span class="status-text">${theirs ? (mine ? "제출 완료" : "먼저 제출했어요!") : "아직 그리는 중…"}</span>
        ${theirs ? "" : `<button type="button" class="kiss-btn" id="btn-kiss">💋 뽀뽀로 재촉하기</button>`}
      </div>`;
    const kissBtn = document.getElementById("btn-kiss");
    if (kissBtn) kissBtn.addEventListener("click", () => sendKiss(partner));

    const drawArea = document.getElementById("draw-area");
    const donePanel = document.getElementById("done-panel");
    const submitBtn = document.getElementById("btn-submit");
    const cancelBtn = document.getElementById("btn-cancel-edit");
    submitBtn.textContent = state.editing ? "수정 완료!" : "완료! 수족관에 풀어주기";
    cancelBtn.hidden = !state.editing;

    if (!mine || state.editing) {
      // 아직 안 그렸거나 수정 중이면 캔버스 표시
      drawArea.hidden = false;
      donePanel.hidden = true;
    } else {
      drawArea.hidden = true;
      donePanel.hidden = false;

      if (mine && theirs) {
        donePanel.innerHTML = `
          <h3 class="reveal-title">오늘의 그림이 공개됐어요!</h3>
          <div class="reveal-pair">
            ${[mine, theirs]
              .map(
                (d) => `
              <figure class="reveal-item" data-id="${d.id}">
                <img src="${d.image}" alt="">
                <figcaption>${escapeHtml(displayName(d.user))}${d.user === state.me ? " (나)" : ""}</figcaption>
              </figure>`
              )
              .join("")}
          </div>
          <p class="hint">수족관에서 살아 움직이는 모습을 확인해보세요</p>
          <button type="button" class="btn ghost" id="btn-edit-mine">오늘 그림 수정하기</button>`;
        donePanel.querySelectorAll(".reveal-item").forEach((el) => {
          el.addEventListener("click", () => {
            const d = state.drawings.find((x) => x.id === el.dataset.id);
            if (d) openDrawingModal(d);
          });
        });
      } else {
        donePanel.innerHTML = `
          <h3 class="reveal-title">오늘의 그림 완료!</h3>
          <p class="hint">${escapeHtml(displayName(partner))}님이 제출하면 두 그림이 동시에 공개돼요.<br>내일 자정에 새로운 주제가 도착합니다.</p>
          <div class="done-actions">
            <button type="button" class="btn ghost" id="btn-view-mine">내 그림 보기</button>
            <button type="button" class="btn ghost" id="btn-edit-mine">수정하기</button>
          </div>`;
        document.getElementById("btn-view-mine").addEventListener("click", () => openDrawingModal(mine));
      }
      document.getElementById("btn-edit-mine").addEventListener("click", () => startEdit(mine));
    }
  }

  // ---------- 쪽 뽀뽀 (상대에게 빨리 그리라고 재촉) ----------
  const KISS_COOLDOWN_KEY = "aquarium_last_kiss_v1";

  async function sendKiss(partner) {
    if (Storage.mode !== "firebase") {
      UI.toast("뽀뽀 알림은 공유 모드(Firebase)에서만 보낼 수 있어요");
      return;
    }
    const last = Number(localStorage.getItem(KISS_COOLDOWN_KEY) || 0);
    const waitLeft = 3 * 60 * 1000 - (Date.now() - last);
    if (waitLeft > 0) {
      UI.toast(`방금 보냈어요! ${Math.ceil(waitLeft / 60000)}분 뒤에 또 보낼 수 있어요 💗`);
      return;
    }
    const btn = document.getElementById("btn-kiss");
    if (btn) btn.disabled = true;
    try {
      await Storage.sendKiss(state.me, partner);
      localStorage.setItem(KISS_COOLDOWN_KEY, String(Date.now()));
      flyKiss();
      UI.toast(`${displayName(partner)}님에게 뽀뽀를 보냈어요! 💋`);
    } catch (e) {
      console.warn("뽀뽀 전송 실패", e);
      UI.toast("뽀뽀 전송에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // 화면을 가로지르는 뽀뽀 애니메이션
  function flyKiss(fromName) {
    const el = document.createElement("div");
    el.className = "kiss-fly";
    el.textContent = "💋";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
    if (fromName) {
      const label = document.createElement("div");
      label.className = "kiss-banner";
      label.textContent = `💋 ${fromName}님이 뽀뽀를 보냈어요! 얼른 오늘 그림을 그려주세요`;
      document.body.appendChild(label);
      setTimeout(() => label.classList.add("show"), 20);
      setTimeout(() => {
        label.classList.remove("show");
        setTimeout(() => label.remove(), 400);
      }, 4000);
    }
  }

  // 상대가 보낸 뽀뽀를 받았을 때 (앱이 켜져 있는 경우 즉시)
  function onKiss(evt) {
    if (evt.to && evt.to !== state.me) return; // 나에게 온 것만
    const fromName = displayName(evt.from);
    flyKiss(fromName);
    // 앱이 백그라운드면 시스템 알림으로도
    if (document.hidden) {
      Push.localNotify("💋 " + fromName + "님의 뽀뽀!", "얼른 오늘 그림을 그려주세요 🎨");
    }
  }

  async function startEdit(mine) {
    state.editing = true;
    await DrawingCanvas.loadImage(mine.image);
    renderToday();
    UI.toast("오늘 자정 전까지 수정할 수 있어요");
  }

  function cancelEdit() {
    state.editing = false;
    DrawingCanvas.reset();
    renderToday();
  }

  async function submitDrawing() {
    if (DrawingCanvas.isEmpty()) {
      UI.toast("아직 아무것도 안 그렸어요!");
      return;
    }
    const msg = state.editing
      ? "이대로 수정할까요?"
      : "이대로 제출할까요? 오늘 자정 전까지는 수정할 수 있어요.";
    if (!(await UI.confirm(msg))) return;

    const btn = document.getElementById("btn-submit");
    const wasEditing = state.editing;
    btn.disabled = true;
    btn.textContent = "저장 중…";
    try {
      const topic = topicForDate(state.todayKey);
      await Storage.saveDrawing({
        date: state.todayKey,
        user: state.me,
        name: displayName(state.me),
        topic: topic.t,
        type: topic.type,
        image: DrawingCanvas.getImage(),
        submittedAt: Date.now(),
      });
      state.editing = false;
      DrawingCanvas.reset();
      await refresh();
      window.scrollTo({ top: 0 });
      UI.toast(wasEditing ? "수정 완료!" : "제출 완료! 오늘의 그림이 저장됐어요.");
    } catch (e) {
      UI.toast(e.message || "저장에 실패했어요. 다시 시도해주세요.");
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- 수족관 탭 ----------
  function renderAquarium() {
    let list = revealedDrawings();

    // 날짜 필터 셀렉트 채우기
    const sel = document.getElementById("aquarium-date-filter");
    const dates = [...new Set(list.map((d) => d.date))].sort().reverse();
    const prev = state.aquariumDate;
    sel.innerHTML =
      '<option value="all">전체 보기</option>' +
      dates.map((d) => `<option value="${d}">${d}</option>`).join("");
    sel.value = dates.includes(prev) ? prev : "all";
    state.aquariumDate = sel.value;

    if (state.aquariumDate !== "all") list = list.filter((d) => d.date === state.aquariumDate);

    // ---- 희귀 이벤트 / 보름달 판정 (전체 보기일 때만) ----
    const opts = {};
    if (state.aquariumDate === "all" && window.AquariumEvents) {
      const key = state.todayKey;
      const localMode = Storage.mode !== "firebase";
      let evt = DEBUG.event
        ? { type: DEBUG.event, seed: AquariumEvents.hashDate("evt:" + key), startUTCHour: 0 }
        : AquariumEvents.eventForDay(key, { localMode });
      if (evt && evt.type === "bottle" && localMode && !DEBUG.event) evt = null;

      const fullmoon = DEBUG.fullmoon || AquariumEvents.isFullMoon(key);
      opts.fullMoon = DEBUG.fullmoon || (fullmoon && Ambient.phase() === "night");
      opts.startAbove = DEBUG.fullmoon; // 디버그 시 바로 위층으로

      if (evt && evt.type !== "bottle") {
        opts.event = evt;
        if (evt.type === "treasure") {
          opts.memoryPool = revealedDrawings().filter((d) => d.date !== key);
          opts.treasureOpened = localStorage.getItem("treasure_" + key) === "1";
          opts.onTreasureOpen = () => localStorage.setItem("treasure_" + key, "1");
        }
      }
      state._bottleComposable = !!(evt && evt.type === "bottle");
    } else {
      state._bottleComposable = false;
    }

    Aquarium.render(list, state.comments, opts);

    // 유리병 — 받은 병 + 오늘 작성 가능 여부
    refreshBottles();
  }

  // ---------- 유리병 편지 ----------
  async function refreshBottles() {
    if (state.tab !== "aquarium") return;
    let incoming = [];
    try {
      incoming = await Storage.listBottles(state.me);
    } catch {}
    Aquarium.setBottles(incoming, state._bottleComposable, {
      onRead: openBottleRead,
      onWrite: openBottleCompose,
    });
  }

  function openBottleCompose() {
    const modal = document.getElementById("bottle-modal");
    modal.querySelector(".bottle-read").hidden = true;
    modal.querySelector(".bottle-write").hidden = false;
    document.getElementById("bottle-input").value = "";
    modal.hidden = false;
    document.body.classList.add("modal-open");
    setTimeout(() => document.getElementById("bottle-input").focus(), 50);
  }

  function openBottleRead(bottle) {
    const modal = document.getElementById("bottle-modal");
    modal.querySelector(".bottle-write").hidden = true;
    const rd = modal.querySelector(".bottle-read");
    rd.hidden = false;
    document.getElementById("bottle-msg").textContent = bottle.text;
    document.getElementById("bottle-from").textContent =
      `— ${displayName(bottle.from)} 님이 보냄`;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    modal._bottle = bottle;
  }

  function closeBottle() {
    document.getElementById("bottle-modal").hidden = true;
    document.body.classList.remove("modal-open");
  }

  async function submitBottle(e) {
    e.preventDefault();
    const text = document.getElementById("bottle-input").value.trim();
    if (!text) return;
    const partner = window.partnerOf(state.me);
    closeBottle();
    try {
      await Storage.sendBottle(state.me, partner, text);
      UI.toast(`${displayName(partner)}님에게 유리병을 띄워보냈어요 🍾`);
    } catch {
      UI.toast("병을 띄우지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  }

  async function readBottleDone() {
    const modal = document.getElementById("bottle-modal");
    const b = modal._bottle;
    closeBottle();
    if (b) {
      try {
        await Storage.removeBottle(b.id);
      } catch {}
      refreshBottles();
    }
  }

  // ---------- 도감 탭 ----------
  function renderDogam() {
    Dogam.render(visibleDrawings(), {
      sort: state.dogamSort,
      who: state.dogamWho,
      names: state.names,
      me: state.me,
      isRevealed,
    });
    // 필터의 이름 라벨 갱신
    const sel = document.getElementById("dogam-who");
    sel.options[1].textContent = displayName("A");
    sel.options[2].textContent = displayName("B");
  }

  // ---------- 모달 (그림 확대 + 댓글) ----------
  function fmtTime(ts) {
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${mm}.${dd} ${hh}:${mi}`;
  }

  function renderModalComments(d) {
    const list = document.getElementById("comment-list");
    const items = state.comments
      .filter((c) => c.drawingId === d.id)
      .sort((a, b) => a.createdAt - b.createdAt);
    list.innerHTML = items.length
      ? items
          .map(
            (c) => `
        <div class="comment-item">
          <span class="author-chip ${c.by === "A" ? "chip-a" : "chip-b"}">${escapeHtml(displayName(c.by))}</span>
          <span class="comment-text">${escapeHtml(c.text)}</span>
          <span class="comment-time">${fmtTime(c.createdAt)}</span>
        </div>`
          )
          .join("")
      : '<p class="comment-empty">아직 댓글이 없어요. 첫 마디를 남겨보세요!</p>';
    list.scrollTop = list.scrollHeight;
  }

  async function submitComment(e) {
    e.preventDefault();
    const input = document.getElementById("comment-input");
    const text = input.value.trim();
    if (!text || !state.modalDrawing || !state.me) return;
    const rec = { drawingId: state.modalDrawing.id, text, by: state.me, createdAt: Date.now() };
    input.value = "";
    state.comments.push(rec); // 낙관적 반영 (실시간 구독이 곧 최신화)
    renderModalComments(state.modalDrawing);
    try {
      await Storage.addComment(rec);
    } catch (e) {
      console.warn("댓글 저장 실패", e);
      const denied =
        e && (e.code === "permission-denied" || /permission|denied/i.test(e.message || ""));
      UI.toast(
        denied
          ? "Firestore 규칙이 댓글을 막고 있어요 — README의 최신 규칙으로 교체해주세요"
          : "댓글 저장 실패: " + (e?.code || e?.message || "알 수 없는 오류")
      );
    }
  }

  function openDrawingModal(d) {
    const modal = document.getElementById("modal");
    document.getElementById("modal-img").src = d.image;
    document.getElementById("modal-topic").textContent = d.topic;
    document.getElementById("modal-meta").textContent =
      `${d.date} · ${displayName(d.user)}${d.user === state.me ? " (나)" : ""} 그림`;
    state.modalDrawing = d;
    renderModalComments(d);
    modal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    document.getElementById("modal").hidden = true;
    state.modalDrawing = null;
    document.body.classList.remove("modal-open");
  }

  // ---------- 설정 모달 ----------
  function openSettings() {
    const sel = document.getElementById("rollover-select");
    sel.innerHTML = Array.from({ length: 24 }, (_, h) => {
      const label = h < 12 ? `오전 ${h === 0 ? 12 : h}시` : `오후 ${h === 12 ? 12 : h - 12}시`;
      return `<option value="${h}">${label} (KST)</option>`;
    }).join("");
    sel.value = String(state.rolloverHour);
    document.getElementById("settings-modal").hidden = false;
  }

  function closeSettings() {
    document.getElementById("settings-modal").hidden = true;
  }

  async function saveSettings() {
    const h = Number(document.getElementById("rollover-select").value);
    try {
      await Storage.saveSettings({ rolloverHour: h });
      closeSettings();
      await refresh();
      UI.toast(`이제 주제가 한국시간 ${h}시에 바뀌어요 (두 사람 모두 적용)`);
    } catch {
      UI.toast("설정 저장에 실패했어요.");
    }
  }

  // ---------- 탭 ----------
  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.hidden = p.id !== "tab-" + tab;
    });
    if (tab === "aquarium") renderAquarium();
    else Aquarium.stop();
    if (tab === "dogam") renderDogam();
    if (tab === "today") {
      renderToday();
      if (DrawingCanvas.refit) DrawingCanvas.refit(); // 처음 열릴 때 캔버스 크기 맞춤
    }
    window.scrollTo({ top: 0 });
  }

  // ---------- 로그인 ----------
  async function hashPw(user, pw) {
    const text = "aquarium:" + user + ":" + pw;
    if (crypto?.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    // 보안 컨텍스트가 아닐 때의 간단한 대체 해시
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    return "djb2_" + h.toString(16);
  }

  function showLogin() {
    state.me = null;
    updateHeader();
    document.getElementById("login-overlay").hidden = false;
    document.getElementById("login-error").hidden = true;
    document.getElementById("login-pw").value = "";
  }

  function loginError(msg) {
    const el = document.getElementById("login-error");
    el.textContent = msg;
    el.hidden = false;
  }

  async function handleLogin(e) {
    e.preventDefault();
    const user = idToUser(document.getElementById("login-id").value);
    const pw = document.getElementById("login-pw").value;
    if (!user) {
      loginError("아이디는 '자성' 또는 '지수'만 쓸 수 있어요");
      return;
    }
    if (pw.length < 2) {
      loginError("비밀번호를 2자 이상 입력해주세요");
      return;
    }
    const btn = document.querySelector(".login-btn");
    btn.disabled = true;
    try {
      const hash = await hashPw(user, pw);
      const auth = await Storage.getAuth();
      if (!auth[user]) {
        await Storage.setAuthHash(user, hash); // 첫 로그인 → 이 비밀번호로 등록
      } else if (auth[user] !== hash) {
        loginError("비밀번호가 맞지 않아요");
        return;
      }
      if (document.getElementById("login-auto").checked) {
        localStorage.setItem(AUTH_KEY, JSON.stringify({ user, hash }));
      } else {
        localStorage.removeItem(AUTH_KEY);
      }
      state.me = user;
      Storage.setProfileName(user, USERS[user]);
      document.getElementById("login-overlay").hidden = true;
      UI.toast(`${USERS[user]}님, 어서 오세요!`);
      await refresh();
      Push.init(state.me);
      Ambient.start();
    } finally {
      btn.disabled = false;
    }
  }

  // 저장된 로그인으로 자동 입장
  async function tryAutoLogin() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(AUTH_KEY));
    } catch {}
    if (!saved || !saved.user || !saved.hash) return false;
    const auth = await Storage.getAuth();
    if (!auth[saved.user]) {
      await Storage.setAuthHash(saved.user, saved.hash); // 공유 저장소에 아직 없으면 등록
    } else if (auth[saved.user] !== saved.hash) {
      localStorage.removeItem(AUTH_KEY); // 비밀번호가 바뀌었으면 다시 로그인
      return false;
    }
    state.me = saved.user;
    return true;
  }

  async function logout() {
    if (!(await UI.confirm("로그아웃할까요?"))) return;
    localStorage.removeItem(AUTH_KEY);
    showLogin();
  }

  function updateHeader() {
    const chip = document.getElementById("me-chip");
    if (state.me) {
      chip.textContent = `${displayName(state.me)} (나)`;
      chip.hidden = false;
    } else {
      chip.hidden = true;
    }
    const badge = document.getElementById("mode-badge");
    badge.textContent = Storage.mode === "firebase" ? "공유 모드" : "로컬 모드";
    badge.title =
      Storage.mode === "firebase"
        ? "Firebase에 연결되어 두 사람이 같은 수족관을 봅니다."
        : "이 기기에만 저장 중입니다. README를 따라 Firebase를 연결하면 함께 쓸 수 있어요.";
  }

  // ---------- 데이터 새로고침 ----------
  async function refresh() {
    const settings = await Storage.getSettings();
    const rh = Number(settings.rolloverHour);
    state.rolloverHour = Number.isFinite(rh) && rh >= 0 && rh <= 23 ? rh : 6;
    state.todayKey = appDayKey();
    state.drawings = await Storage.listDrawings();
    state.comments = await Storage.listComments();
    state.names = { ...USERS };
    updateHeader();
    switchTab(state.tab); // 현재 탭 다시 그리기
    if (state.modalDrawing) renderModalComments(state.modalDrawing);
    if (state.me) Ambient.refresh(); // 이름/설정 변화 반영
  }

  // ---------- 초기화 ----------
  async function init() {
    await Storage.init();
    state.todayKey = appDayKey();
    DrawingCanvas.init();

    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.addEventListener("click", () => switchTab(b.dataset.tab));
    });
    document.getElementById("btn-submit").addEventListener("click", submitDrawing);
    document.getElementById("btn-cancel-edit").addEventListener("click", cancelEdit);

    // 완료/취소 버튼 접기·펴기 (접으면 캔버스가 그만큼 커짐)
    document.getElementById("actions-toggle").addEventListener("click", (e) => {
      const area = document.getElementById("action-area");
      area.hidden = !area.hidden;
      e.currentTarget.classList.toggle("collapsed", area.hidden);
      if (DrawingCanvas.refit) DrawingCanvas.refit();
    });
    document.getElementById("modal").addEventListener("click", (e) => {
      if (e.target.id === "modal" || e.target.closest(".modal-close")) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
      // 테스트용: Cmd/Ctrl+T 로 주제 바꾸기
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        debugNextTopic();
      }
    });

    // 테스트용 백업 제스처: 주제 카드를 빠르게 3번 탭 (모바일용)
    let topicTaps = 0;
    let topicTapTimer = null;
    document.querySelector(".topic-card").addEventListener("click", () => {
      topicTaps += 1;
      clearTimeout(topicTapTimer);
      topicTapTimer = setTimeout(() => (topicTaps = 0), 600);
      if (topicTaps >= 3) {
        topicTaps = 0;
        debugNextTopic();
      }
    });
    document.getElementById("aquarium-date-filter").addEventListener("change", (e) => {
      state.aquariumDate = e.target.value;
      renderAquarium();
    });
    document.getElementById("dogam-sort").addEventListener("change", (e) => {
      state.dogamSort = e.target.value;
      renderDogam();
    });
    document.getElementById("dogam-who").addEventListener("change", (e) => {
      state.dogamWho = e.target.value;
      renderDogam();
    });
    document.getElementById("btn-switch-user").addEventListener("click", openSettings);
    document.getElementById("login-form").addEventListener("submit", handleLogin);
    document.getElementById("comment-form").addEventListener("submit", submitComment);

    // 상대방 창문 위젯 접기/펴기 (상태 기억)
    const widget = document.getElementById("window-widget");
    if (localStorage.getItem("aquarium_widget_collapsed") === "1") widget.classList.add("collapsed");
    widget.addEventListener("click", () => {
      widget.classList.toggle("collapsed");
      localStorage.setItem("aquarium_widget_collapsed", widget.classList.contains("collapsed") ? "1" : "0");
    });

    // 설정 모달
    document.getElementById("settings-modal").addEventListener("click", (e) => {
      if (e.target.id === "settings-modal" || e.target.closest(".settings-close")) closeSettings();
    });
    document.getElementById("btn-save-settings").addEventListener("click", saveSettings);
    document.getElementById("btn-logout").addEventListener("click", async () => {
      closeSettings();
      await logout();
    });

    // 상대방의 밥주기/쓰다듬기/뽀뽀/유리병을 실시간 반영
    Storage.onEvent((evt) => {
      if (evt.type === "kiss") {
        onKiss(evt);
        return;
      }
      if (evt.type === "bottle") {
        if (evt.to && evt.to !== state.me) return;
        UI.toast("🍾 유리병 편지가 도착했어요!");
        if (state.tab === "aquarium") refreshBottles();
        return;
      }
      if (state.tab === "aquarium") Aquarium.remoteEvent(evt);
    });

    // 유리병 모달
    const bottleModal = document.getElementById("bottle-modal");
    bottleModal.addEventListener("click", (e) => {
      if (e.target.id === "bottle-modal" || e.target.closest(".bottle-close")) closeBottle();
    });
    document.getElementById("bottle-form").addEventListener("submit", submitBottle);
    document.getElementById("bottle-read-done").addEventListener("click", readBottleDone);

    // 페이지 자체의 확대/축소 차단 (캔버스 칸만 자체 줌 지원)
    document.addEventListener("gesturestart", (e) => e.preventDefault()); // iOS 핀치
    document.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey && !e.target.closest("#canvas-viewport")) e.preventDefault();
      },
      { passive: false }
    );
    document.addEventListener("dblclick", (e) => {
      if (!e.target.closest("#canvas-viewport")) e.preventDefault(); // 더블탭 줌 방지
    });

    Storage.onChange(() => refresh());

    // 전환 시각(KST)이 지나면 자동으로 새 주제로 전환
    setInterval(() => {
      if (appDayKey() !== state.todayKey) {
        state.editing = false;
        DrawingCanvas.reset();
        refresh(); // refresh 가 todayKey 를 다시 계산
      }
    }, 30 * 1000);

    const loggedIn = await tryAutoLogin();
    await refresh();
    if (!loggedIn) showLogin();
    else {
      Push.init(state.me);
      Ambient.start();
    }
    hideLoading();
  }

  // 로딩 화면: 데이터가 준비되면 (물이 어느 정도 차오른 뒤) 부드럽게 걷어냄
  function hideLoading() {
    const el = document.getElementById("loading-overlay");
    if (!el || el.classList.contains("done")) return;
    const wait = Math.max(0, 1400 - (Date.now() - LOAD_START));
    setTimeout(() => {
      el.classList.add("done");
      setTimeout(() => el.remove(), 600);
    }, wait);
  }
  setTimeout(hideLoading, 8000); // 어떤 문제가 생겨도 로딩 화면이 계속 남지 않게

  document.addEventListener("DOMContentLoaded", init);

  return { openDrawingModal };
})();
