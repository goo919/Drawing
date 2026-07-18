// 저장소 레이어
// - firebase-config.js 가 있고 FIREBASE_CONFIG 가 정의되어 있으면 → Firestore(공유 모드)
// - 없으면 → localStorage(이 기기에서만 보이는 로컬 모드)
// 두 모드 모두 같은 인터페이스를 제공하므로 앱 코드는 신경 쓸 필요가 없습니다.
//
// 그림 레코드 형태:
// { id, date: 'YYYY-MM-DD', user: 'A'|'B', name, topic, image(base64 PNG), submittedAt }

const Storage = (() => {
  const LOCAL_KEY = "aquarium_drawings_v1";
  const PROFILE_KEY = "aquarium_profiles_v1";

  let mode = "local";
  let changeCallbacks = [];
  let eventCallbacks = []; // 실시간 이벤트(밥/쓰다듬기) 수신용
  let fs = null; // firestore module
  let db = null;
  const CLIENT_ID = Math.random().toString(36).slice(2); // 내 이벤트 에코 방지

  // 실시간 구독 캐시 — 내 쓰기가 서버 왕복 전에도 바로 보이고,
  // 일부 컬렉션이 규칙 문제로 막혀도 앱이 죽지 않게 한다
  let cacheDrawings = null;
  let cacheComments = null;
  let cacheSettings = null;

  function notify() {
    changeCallbacks.forEach((cb) => cb());
  }

  function djb2(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  // ---------- 로컬 모드 ----------
  function localList() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY)) || [];
    } catch {
      return [];
    }
  }
  function localSave(list) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  }
  function localProfiles() {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {};
    } catch {
      return {};
    }
  }

  // ---------- 공개 API ----------
  return {
    get mode() {
      return mode;
    },

    async init() {
      if (typeof window.FIREBASE_CONFIG === "object" && window.FIREBASE_CONFIG) {
        try {
          const appMod = await import(
            "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"
          );
          fs = await import(
            "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
          );
          const app = appMod.initializeApp(window.FIREBASE_CONFIG);
          db = fs.getFirestore(app);
          mode = "firebase";

          // 실시간 반영: 그림/프로필/설정/댓글 구독 (오류가 나도 앱은 계속 동작)
          const warn = (name) => (err) =>
            console.warn(`${name} 구독 실패 — Firestore 규칙을 확인하세요 (README 참고)`, err);
          fs.onSnapshot(
            fs.collection(db, "drawings"),
            (snap) => {
              cacheDrawings = snap.docs.map((d) => d.data());
              notify();
            },
            warn("drawings")
          );
          fs.onSnapshot(fs.doc(db, "meta", "profiles"), () => notify(), warn("profiles"));
          fs.onSnapshot(
            fs.doc(db, "meta", "settings"),
            (snap) => {
              cacheSettings = snap.exists() ? snap.data() : {};
              notify();
            },
            warn("settings")
          );
          fs.onSnapshot(
            fs.collection(db, "comments"),
            (snap) => {
              cacheComments = snap.docs.map((d) => d.data());
              notify();
            },
            warn("comments")
          );
          // 실시간 이벤트(밥/쓰다듬기): 새 문서만 골라 콜백
          fs.onSnapshot(
            fs.collection(db, "events"),
            (snap) => {
              snap.docChanges().forEach((ch) => {
                if (ch.type !== "added") return;
                const d = ch.doc.data();
                if (d.client === CLIENT_ID) return; // 내가 보낸 건 이미 반영됨
                if (Date.now() - (d.createdAt || 0) > 15000) return; // 오래된 것 무시
                eventCallbacks.forEach((cb) => cb(d));
              });
            },
            warn("events")
          );
          return;
        } catch (e) {
          console.warn("Firebase 초기화 실패 — 로컬 모드로 전환합니다.", e);
        }
      }
      mode = "local";
      // 같은 브라우저의 다른 탭과 동기화 (로컬 테스트용)
      window.addEventListener("storage", (e) => {
        if (e.key === LOCAL_KEY || e.key === PROFILE_KEY) notify();
      });
    },

    onChange(cb) {
      changeCallbacks.push(cb);
    },

    // 모든 그림 목록 (구독 캐시 우선 — 읽기 실패해도 앱이 죽지 않음)
    async listDrawings() {
      if (mode === "firebase") {
        if (cacheDrawings) return cacheDrawings;
        try {
          const snap = await fs.getDocs(fs.collection(db, "drawings"));
          return snap.docs.map((d) => d.data());
        } catch (e) {
          console.warn("drawings 읽기 실패", e);
          return [];
        }
      }
      return localList();
    },

    // 그림 저장 (같은 날짜+사용자면 덮어씀 — 당일 수정 허용은 앱 쪽에서 제어)
    async saveDrawing(rec) {
      rec = { ...rec, id: `${rec.date}_${rec.user}` };
      if (mode === "firebase") {
        await fs.setDoc(fs.doc(db, "drawings", rec.id), rec);
        return rec;
      }
      const list = localList().filter((r) => r.id !== rec.id);
      list.push(rec);
      localSave(list);
      notify();
      return rec;
    },

    // 프로필 이름 { A: '이름', B: '이름' }
    async getProfiles() {
      if (mode === "firebase") {
        const snap = await fs.getDoc(fs.doc(db, "meta", "profiles"));
        return snap.exists() ? snap.data() : {};
      }
      return localProfiles();
    },

    // ---------- 공유 설정 (예: 주제 전환 시각) ----------
    async getSettings() {
      if (mode === "firebase") {
        if (cacheSettings) return cacheSettings;
        try {
          const snap = await fs.getDoc(fs.doc(db, "meta", "settings"));
          return snap.exists() ? snap.data() : {};
        } catch (e) {
          console.warn("settings 읽기 실패", e);
          return {};
        }
      }
      try {
        return JSON.parse(localStorage.getItem("aquarium_settings_v1")) || {};
      } catch {
        return {};
      }
    },

    async saveSettings(patch) {
      if (mode === "firebase") {
        await fs.setDoc(fs.doc(db, "meta", "settings"), patch, { merge: true });
        return;
      }
      const s = await this.getSettings();
      localStorage.setItem("aquarium_settings_v1", JSON.stringify({ ...s, ...patch }));
      notify();
    },

    // ---------- 댓글 ----------
    async listComments() {
      if (mode === "firebase") {
        if (cacheComments) return cacheComments; // 구독 캐시: 내 댓글이 즉시 반영됨
        try {
          const snap = await fs.getDocs(fs.collection(db, "comments"));
          return snap.docs.map((d) => d.data());
        } catch (e) {
          console.warn("comments 읽기 실패 — Firestore 규칙 확인 필요", e);
          return [];
        }
      }
      try {
        return JSON.parse(localStorage.getItem("aquarium_comments_v1")) || [];
      } catch {
        return [];
      }
    },

    async addComment(rec) {
      rec = { ...rec, id: rec.createdAt + "_" + Math.random().toString(36).slice(2, 7) };
      if (mode === "firebase") {
        await fs.setDoc(fs.doc(db, "comments", rec.id), rec);
        return rec;
      }
      const list = await this.listComments();
      list.push(rec);
      localStorage.setItem("aquarium_comments_v1", JSON.stringify(list));
      notify();
      return rec;
    },

    // ---------- 실시간 이벤트 (밥주기/쓰다듬기 동기화) ----------
    onEvent(cb) {
      eventCallbacks.push(cb);
    },

    async sendEvent(evt) {
      if (mode !== "firebase") return; // 로컬 모드는 한 기기뿐이라 공유 불필요
      const id = Date.now() + "_" + CLIENT_ID.slice(0, 4) + Math.random().toString(36).slice(2, 6);
      await fs.setDoc(fs.doc(db, "events", id), {
        ...evt,
        client: CLIENT_ID,
        createdAt: Date.now(),
      });
    },

    // ---------- 쪽 뽀뽀 (상대에게 "빨리 그려" 재촉) ----------
    // 1) 실시간 events 로 상대 앱이 켜져 있으면 즉시 반응
    // 2) kisses 큐에 넣어두면 알림 워크플로가 웹 푸시로 발송 (앱이 꺼져 있어도)
    async sendKiss(fromUser, toUser) {
      await this.sendEvent({ type: "kiss", from: fromUser, to: toUser });
      if (mode === "firebase") {
        const id = Date.now() + "_" + Math.random().toString(36).slice(2, 7);
        await fs.setDoc(fs.doc(db, "kisses", id), {
          from: fromUser,
          to: toUser,
          createdAt: Date.now(),
        });
      }
    },

    // ---------- 유리병 편지 (기존 kisses 구조를 참고) ----------
    // 실시간(events)으로 즉시 도착 알림 + bottles 컬렉션에 보관(앱 꺼져 있어도)
    async sendBottle(fromUser, toUser, text) {
      await this.sendEvent({ type: "bottle", from: fromUser, to: toUser });
      if (mode !== "firebase") return null;
      const id = Date.now() + "_" + Math.random().toString(36).slice(2, 7);
      const rec = { id, from: fromUser, to: toUser, text, createdAt: Date.now() };
      await fs.setDoc(fs.doc(db, "bottles", id), rec);
      return rec;
    },

    // 나에게 온 병 목록
    async listBottles(toUser) {
      if (mode !== "firebase") return [];
      try {
        const snap = await fs.getDocs(fs.collection(db, "bottles"));
        return snap.docs.map((d) => d.data()).filter((b) => b.to === toUser);
      } catch (e) {
        console.warn("bottles 읽기 실패 — 규칙 확인 필요", e);
        return [];
      }
    },

    async removeBottle(id) {
      if (mode !== "firebase") return;
      try {
        await fs.deleteDoc(fs.doc(db, "bottles", id));
      } catch {}
    },

    // ---------- 웹 푸시 구독 (공유 모드 전용) ----------
    async savePushSub(user, sub) {
      if (mode !== "firebase") throw new Error("공유 모드에서만 알림을 쓸 수 있어요");
      const id = user + "_" + djb2(sub.endpoint);
      await fs.setDoc(fs.doc(db, "push_subs", id), {
        user,
        endpoint: sub.endpoint,
        sub: JSON.stringify(sub),
        updatedAt: Date.now(),
      });
    },

    async removePushSub(user, endpoint) {
      if (mode !== "firebase") return;
      await fs.deleteDoc(fs.doc(db, "push_subs", user + "_" + djb2(endpoint)));
    },

    // 로그인 정보 { A: 해시, B: 해시 } — 첫 로그인 때 등록됨
    async getAuth() {
      if (mode === "firebase") {
        const snap = await fs.getDoc(fs.doc(db, "meta", "auth"));
        return snap.exists() ? snap.data() : {};
      }
      try {
        return JSON.parse(localStorage.getItem("aquarium_auth_db")) || {};
      } catch {
        return {};
      }
    },

    async setAuthHash(user, hash) {
      if (mode === "firebase") {
        await fs.setDoc(fs.doc(db, "meta", "auth"), { [user]: hash }, { merge: true });
        return;
      }
      const a = await this.getAuth();
      a[user] = hash;
      localStorage.setItem("aquarium_auth_db", JSON.stringify(a));
    },

    async setProfileName(user, name) {
      if (mode === "firebase") {
        await fs.setDoc(fs.doc(db, "meta", "profiles"), { [user]: name }, { merge: true });
        return;
      }
      const p = localProfiles();
      p[user] = name;
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
      notify();
    },
  };
})();
