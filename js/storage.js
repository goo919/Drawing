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
  let fs = null; // firestore module
  let db = null;

  function notify() {
    changeCallbacks.forEach((cb) => cb());
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

          // 실시간 반영: 그림 컬렉션과 프로필 문서를 구독
          fs.onSnapshot(fs.collection(db, "drawings"), () => notify());
          fs.onSnapshot(fs.doc(db, "meta", "profiles"), () => notify());
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

    // 모든 그림 목록
    async listDrawings() {
      if (mode === "firebase") {
        const snap = await fs.getDocs(fs.collection(db, "drawings"));
        return snap.docs.map((d) => d.data());
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
