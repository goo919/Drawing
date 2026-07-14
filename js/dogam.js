// 도감 — 지금까지 그린 동물들을 카드 그리드로 보는 화면

const Dogam = (() => {
  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s ?? "";
    return div.innerHTML;
  }

  return {
    // drawings: 내가 볼 수 있는 그림 목록 (공개된 것 + 내 미공개 그림)
    // opts: { sort: 'newest'|'oldest', who: 'all'|'A'|'B', names, me, isRevealed(date) }
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
        empty.textContent = "아직 도감에 등록된 동물이 없어요 📖";
        grid.appendChild(empty);
        return;
      }

      for (const d of list) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "dogam-card";

        const revealed = opts.isRevealed(d.date);
        const who = opts.names[d.user] || d.name || d.user;
        const mine = d.user === opts.me;

        card.innerHTML = `
          <div class="dogam-img"><img src="${d.image}" alt="" draggable="false"></div>
          <div class="dogam-info">
            <div class="dogam-topic">${escapeHtml(d.topic)}</div>
            <div class="dogam-meta">
              <span class="author-chip ${d.user === "A" ? "chip-a" : "chip-b"}">${escapeHtml(who)}${mine ? " (나)" : ""}</span>
              <span class="dogam-date">${d.date}</span>
            </div>
            ${revealed ? "" : '<div class="dogam-wait">🔒 상대방 제출 전 (나만 보여요)</div>'}
          </div>`;
        card.addEventListener("click", () => App.openDrawingModal(d));
        grid.appendChild(card);
      }
    },
  };
})();
