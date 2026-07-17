// 웹 푸시 알림 관리
// - 헤더의 종(🔔) 버튼 + 첫 방문 시 부드러운 안내 배너 (바로 권한 팝업을 띄우지 않음)
// - 아이폰 사파리: "홈 화면에 추가" 후에만 푸시가 가능하므로 설치 안내를 먼저 보여줌
// - 구독 정보는 Firestore(push_subs)에 저장되고, GitHub Actions 가 매일/수시로 발송

const Push = (() => {
  const DISMISS_KEY = "aquarium_push_banner_v1"; // 배너 "나중에" 기억

  let me = null;
  let reg = null;

  const supported = () =>
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  function urlB64ToUint8(base64) {
    const pad = "=".repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  async function ensureSW() {
    if (!reg) reg = await navigator.serviceWorker.register("sw.js");
    await navigator.serviceWorker.ready;
    return reg;
  }

  async function currentSub() {
    if (!supported()) return null;
    try {
      const r = await navigator.serviceWorker.getRegistration();
      return r ? await r.pushManager.getSubscription() : null;
    } catch {
      return null;
    }
  }

  async function updateBell() {
    const bell = document.getElementById("btn-push");
    if (!bell) return;
    const sub = await currentSub();
    bell.classList.toggle("on", !!sub && Notification.permission === "granted");
    bell.title = bell.classList.contains("on") ? "알림 켜짐 (누르면 끄기)" : "알림 받기";
  }

  async function subscribe() {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      UI.toast("알림 권한이 거부됐어요. 브라우저 설정에서 허용해주세요.");
      return false;
    }
    await ensureSW();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8(window.VAPID_PUBLIC_KEY),
    });
    await Storage.savePushSub(me, sub.toJSON());
    UI.toast("알림이 켜졌어요! 매일 자정 새 주제를 알려드릴게요 🔔");
    return true;
  }

  async function unsubscribe() {
    const sub = await currentSub();
    if (sub) {
      try {
        await Storage.removePushSub(me, sub.endpoint);
      } catch {}
      await sub.unsubscribe();
    }
    UI.toast("알림을 껐어요");
  }

  // 종 버튼 / 배너의 "켜기" 공통 진입점
  async function enableFlow(fromBanner) {
    if (!me) return;

    // 아이폰 사파리에서 아직 홈 화면에 추가 안 한 경우 → 설치 안내
    if (isIOS() && !isStandalone()) {
      await UI.confirm(
        "아이폰은 홈 화면에 추가해야 알림을 받을 수 있어요.\n\n" +
          "① 사파리 하단의 공유 버튼(⬆︎)\n② '홈 화면에 추가'\n③ 홈 화면의 🐠 아이콘으로 열기\n④ 다시 이 버튼을 누르면 끝!"
      );
      return;
    }
    if (!supported()) {
      UI.toast("이 브라우저는 웹 푸시를 지원하지 않아요.");
      return;
    }
    if (Storage.mode !== "firebase") {
      UI.toast("알림은 공유 모드(Firebase 연결)에서만 쓸 수 있어요.");
      return;
    }

    // 바로 권한 팝업을 띄우지 않고, 무엇을 보내는지 먼저 설명
    if (fromBanner || Notification.permission !== "granted") {
      const ok = await UI.confirm(
        "이런 알림을 보내드려요:\n\n· 매일 자정, 오늘의 새 주제\n· 상대방이 그림을 완성했을 때\n· 둘 다 제출해서 수족관에 공개됐을 때\n\n알림을 켤까요?"
      );
      if (!ok) return;
    }
    try {
      await subscribe();
      hideBanner(true);
    } catch (e) {
      console.warn("푸시 구독 실패", e);
      UI.toast("알림 설정에 실패했어요. 잠시 후 다시 시도해주세요.");
    }
    updateBell();
  }

  async function toggle() {
    const sub = await currentSub();
    if (sub && Notification.permission === "granted") {
      if (await UI.confirm("알림을 끌까요?")) await unsubscribe();
    } else {
      await enableFlow(false);
    }
    updateBell();
  }

  // ---------- 안내 배너 ----------
  function hideBanner(remember) {
    const banner = document.getElementById("push-banner");
    if (banner) banner.hidden = true;
    if (remember) localStorage.setItem(DISMISS_KEY, "1");
  }

  async function maybeShowBanner() {
    const banner = document.getElementById("push-banner");
    if (!banner || !me) return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (Storage.mode !== "firebase") return; // 로컬 모드에선 의미 없음
    const sub = await currentSub();
    if (sub && Notification.permission === "granted") return; // 이미 켜짐
    // iOS 미설치 포함: 안내가 필요한 상태 → 배너 노출
    banner.hidden = false;
  }

  return {
    async init(user) {
      me = user;
      if (supported()) {
        try {
          await ensureSW(); // 설치형 PWA 에서 푸시 유지를 위해 미리 등록
        } catch (e) {
          console.warn("서비스 워커 등록 실패", e);
        }
      }
      const bell = document.getElementById("btn-push");
      if (bell && !bell.dataset.bound) {
        bell.dataset.bound = "1";
        bell.addEventListener("click", toggle);
        document.getElementById("push-banner-on").addEventListener("click", () => enableFlow(true));
        document.getElementById("push-banner-later").addEventListener("click", () => hideBanner(true));
      }
      updateBell();
      maybeShowBanner();
    },
  };
})();
