// 앱 메인 로직: 오늘의 주제, 비공개 규칙, 탭 전환, 프로필, 모달

const App = (() => {
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
      </div>`;

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
    Aquarium.render(list, state.comments);
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
    } catch {
      UI.toast("댓글 저장에 실패했어요. 다시 시도해주세요.");
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

    // 설정 모달
    document.getElementById("settings-modal").addEventListener("click", (e) => {
      if (e.target.id === "settings-modal" || e.target.closest(".settings-close")) closeSettings();
    });
    document.getElementById("btn-save-settings").addEventListener("click", saveSettings);
    document.getElementById("btn-logout").addEventListener("click", async () => {
      closeSettings();
      await logout();
    });

    // 상대방의 밥주기/쓰다듬기를 실시간 반영
    Storage.onEvent((evt) => {
      if (state.tab === "aquarium") Aquarium.remoteEvent(evt);
    });

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
    else Push.init(state.me);
  }

  document.addEventListener("DOMContentLoaded", init);

  return { openDrawingModal };
})();
