// 자체 확인 모달 / 토스트
// (브라우저 기본 confirm/alert 은 임베드 환경에서 차단될 수 있어 직접 구현)

const UI = (() => {
  let confirmEl = null;
  let toastEl = null;
  let toastTimer = null;

  function buildConfirm() {
    confirmEl = document.createElement("div");
    confirmEl.className = "ui-confirm";
    confirmEl.hidden = true;
    confirmEl.innerHTML = `
      <div class="ui-confirm-box">
        <p class="ui-confirm-msg"></p>
        <div class="ui-confirm-actions">
          <button type="button" class="btn ghost ui-confirm-cancel">취소</button>
          <button type="button" class="btn primary ui-confirm-ok">확인</button>
        </div>
      </div>`;
    document.body.appendChild(confirmEl);
  }

  return {
    // Promise<boolean>
    confirm(msg) {
      if (!confirmEl) buildConfirm();
      confirmEl.querySelector(".ui-confirm-msg").textContent = msg;
      confirmEl.hidden = false;
      return new Promise((resolve) => {
        const ok = confirmEl.querySelector(".ui-confirm-ok");
        const cancel = confirmEl.querySelector(".ui-confirm-cancel");
        const done = (v) => {
          confirmEl.hidden = true;
          ok.onclick = cancel.onclick = null;
          resolve(v);
        };
        ok.onclick = () => done(true);
        cancel.onclick = () => done(false);
      });
    },

    toast(msg) {
      if (!toastEl) {
        toastEl = document.createElement("div");
        toastEl.className = "ui-toast";
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = msg;
      toastEl.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
    },
  };
})();
