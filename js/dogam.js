// 도감 — 지금까지 그린 동물들을 카드 그리드로 보는 화면
// 카드마다 "수족관에 풀기/빼기" 토글이 있어 수족관에 내보낼 동물을 고를 수 있다.

const Dogam = (() => {
  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s ?? "";
    return div.innerHTML;
  }

  return {
    // drawings: 내가 볼 수 있는 그림 목록 (공개된 것 + 내 미공개 그림)
    // opts: { sort, who, names, me, isRevealed(date), picks:Set, maxPicks, onTogglePick(id) }
    render(drawings, opts) {
      const grid = document.getElementById("dogam-grid");
      grid.innerHTML = "";

      let list = [...drawings];
      if (opts.who !== "all") list = list.filter((d) => d.user === opts.who);
      list.sort((a, b) =>
        opts.sort === "oldest" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)
      );

      if (!list.length) {
        const empty = document.createElement("p");
        empty.className = "dogam-empty";
        empty.textContent = "아직 도감에 등록된 동물이 없어요";
        grid.appendChild(empty);
        return;
      }

      const picks = opts.picks || new Set();
      const full = picks.size >= (opts.maxPicks || 8);

      for (const d of list) {
        const card = document.createElement("div");
        card.className = "dogam-card" + (picks.has(d.id) ? " picked" : "");
        card.setAttribute("role", "button");
        card.tabIndex = 0;

        const revealed = opts.isRevealed(d.date);
        const who = opts.names[d.user] || d.name || d.user;
        const mine = d.user === opts.me;
        const picked = picks.has(d.id);
        // 공개된 그림만 수족관에 풀 수 있음 (비공개 규칙 유지)
        const canPick = revealed;

        card.innerHTML = `
          ${canPick ? `<button type="button" class="dogam-pick${picked ? " on" : ""}"${!picked && full ? " disabled" : ""}>${picked ? "수족관 ✓" : "풀기 +"}</button>` : ""}
          <div class="dogam-img"><img src="${d.image}" alt="" draggable="false"></div>
          <div class="dogam-info">
            <div class="dogam-topic">${escapeHtml(d.topic)}</div>
            <div class="dogam-meta">
              <span class="author-chip ${d.user === "A" ? "chip-a" : "chip-b"}">${escapeHtml(who)}${mine ? " (나)" : ""}</span>
              <span class="dogam-date">${d.date}</span>
            </div>
            ${revealed ? "" : '<div class="dogam-wait">상대방 제출 전 · 나만 보여요</div>'}
          </div>`;

        const pickBtn = card.querySelector(".dogam-pick");
        if (pickBtn) {
          pickBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (pickBtn.disabled) return;
            opts.onTogglePick(d.id);
          });
        }
        card.addEventListener("click", () => App.openDrawingModal(d));
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            App.openDrawingModal(d);
          }
        });
        grid.appendChild(card);
      }
    },
  };
})();
