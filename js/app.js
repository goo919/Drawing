// 앱 메인 로직: 오늘의 주제, 비공개 규칙, 탭 전환, 프로필, 모달

const App = (() => {
  const ME_KEY = "aquarium_me_v1";
  const TOPIC_EPOCH = new Date(2026, 0, 1); // 이 날짜 기준으로 주제가 순서대로 순환

  const state = {
    me: null, // 'A' | 'B'
    names: { A: "A", B: "B" },
    drawings: [],
    tab: "today",
    dogamSort: "newest",
    dogamWho: "all",
    aquariumDate: "all",
    todayKey: null,
  };

  // ---------- 날짜 / 주제 ----------
  function dateKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function topicForDate(key) {
    const [y, m, d] = key.split("-").map(Number);
    const days = Math.round((new Date(y, m - 1, d) - TOPIC_EPOCH) / 86400000);
    const idx = ((days % TOPICS.length) + TOPICS.length) % TOPICS.length;
    return TOPICS[idx];
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
    document.getElementById("today-topic").textContent = topic;

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

    if (!mine) {
      // 아직 안 그렸으면 캔버스 표시
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
          <p class="hint">수족관에서 헤엄치는 모습을 확인해보세요</p>`;
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
          <button type="button" class="btn ghost" id="btn-view-mine">내 그림 미리 보기</button>`;
        document.getElementById("btn-view-mine").addEventListener("click", () => openDrawingModal(mine));
      }
    }
  }

  async function submitDrawing() {
    if (DrawingCanvas.isEmpty()) {
      UI.toast("아직 아무것도 안 그렸어요!");
      return;
    }
    if (!(await UI.confirm("이대로 제출할까요? 제출 후에는 수정할 수 없어요!"))) return;

    const btn = document.getElementById("btn-submit");
    btn.disabled = true;
    btn.textContent = "저장 중…";
    try {
      await Storage.addDrawing({
        date: state.todayKey,
        user: state.me,
        name: displayName(state.me),
        topic: topicForDate(state.todayKey),
        image: DrawingCanvas.getImage(),
        submittedAt: Date.now(),
      });
      DrawingCanvas.reset();
      await refresh();
      window.scrollTo({ top: 0 });
      UI.toast("제출 완료! 오늘의 그림이 저장됐어요.");
    } catch (e) {
      UI.toast(e.message || "저장에 실패했어요. 다시 시도해주세요.");
    } finally {
      btn.disabled = false;
      btn.textContent = "완료! 수족관에 풀어주기";
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
    Aquarium.render(list);
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

  // ---------- 모달 ----------
  function openDrawingModal(d) {
    const modal = document.getElementById("modal");
    document.getElementById("modal-img").src = d.image;
    document.getElementById("modal-topic").textContent = d.topic;
    document.getElementById("modal-meta").textContent =
      `${d.date} · ${displayName(d.user)}${d.user === state.me ? " (나)" : ""} 그림`;
    modal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    document.getElementById("modal").hidden = true;
    document.body.classList.remove("modal-open");
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
    if (tab === "today") renderToday();
    window.scrollTo({ top: 0 });
  }

  // ---------- 프로필 ----------
  function showProfilePicker() {
    const overlay = document.getElementById("profile-overlay");
    overlay.hidden = false;
    document.getElementById("name-a").value = state.names.A === "A" ? "" : state.names.A;
    document.getElementById("name-b").value = state.names.B === "B" ? "" : state.names.B;

    overlay.querySelectorAll(".profile-card").forEach((btn) => {
      btn.onclick = async () => {
        const user = btn.dataset.user;
        const input = document.getElementById(user === "A" ? "name-a" : "name-b");
        const name = input.value.trim() || (user === "A" ? "A" : "B");
        state.me = user;
        localStorage.setItem(ME_KEY, user);
        await Storage.setProfileName(user, name);
        state.names[user] = name;
        overlay.hidden = true;
        updateHeader();
        await refresh();
      };
    });
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
    state.drawings = await Storage.listDrawings();
    const profiles = await Storage.getProfiles();
    state.names = { A: profiles.A || "A", B: profiles.B || "B" };
    updateHeader();
    switchTab(state.tab); // 현재 탭 다시 그리기
  }

  // ---------- 초기화 ----------
  async function init() {
    state.todayKey = dateKey();
    await Storage.init();
    DrawingCanvas.init();

    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.addEventListener("click", () => switchTab(b.dataset.tab));
    });
    document.getElementById("btn-submit").addEventListener("click", submitDrawing);
    document.getElementById("modal").addEventListener("click", (e) => {
      if (e.target.id === "modal" || e.target.closest(".modal-close")) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
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
    document.getElementById("btn-switch-user").addEventListener("click", showProfilePicker);

    Storage.onChange(() => refresh());

    // 자정이 지나면 자동으로 새 주제로 전환
    setInterval(() => {
      const now = dateKey();
      if (now !== state.todayKey) {
        state.todayKey = now;
        DrawingCanvas.reset();
        refresh();
      }
    }, 30 * 1000);

    state.me = localStorage.getItem(ME_KEY);
    await refresh();
    if (!state.me) showProfilePicker();
  }

  document.addEventListener("DOMContentLoaded", init);

  return { openDrawingModal };
})();
