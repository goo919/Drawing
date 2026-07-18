// 희귀 이벤트 시드 시스템 — 날짜 문자열 기반 결정론적 계산.
// 같은 날짜(KST 기준 앱-하루)면 어느 기기에서든 같은 결과 → A와 B가 같은 이벤트를 목격.
// 순수 함수만 (DOM/랜덤 없음). feature 4(회고 릴/기념일)도 이 해시를 재사용.

const AquariumEvents = (() => {
  // ---------- 발생 확률 / 가중치 (여기서 조절) ----------
  const EVENT_CHANCE = 0.4; // 이벤트가 있는 날의 비율
  const WEIGHTS = { submarine: 40, whales: 25, treasure: 25, bottle: 10 };

  // ---------- 해시 & 시드 난수 ----------
  function hashDate(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function weightedPick(rng, weights) {
    const total = Object.values(weights).reduce((s, w) => s + w, 0);
    let r = rng() * total;
    for (const [k, w] of Object.entries(weights)) {
      if ((r -= w) < 0) return k;
    }
    return Object.keys(weights)[0];
  }

  // ---------- 오늘의 이벤트 ----------
  // dateKey: 'YYYY-MM-DD' (KST 앱-하루). opts.localMode 면 bottle 제외.
  // 반환: { type, startUTCHour, seed } 또는 null
  function eventForDay(dateKey, opts = {}) {
    const seed = hashDate("evt:" + dateKey);
    const rng = mulberry32(seed);
    if (rng() >= EVENT_CHANCE) return null;

    let weights = WEIGHTS;
    if (opts.localMode) {
      weights = { ...WEIGHTS };
      delete weights.bottle; // 로컬 모드는 병 편지 불가
    }
    const type = weightedPick(rng, weights);
    const startUTCHour = Math.floor(rng() * 24);
    return { type, startUTCHour, seed };
  }

  // 보물상자: 과거 그림 풀에서 시드로 하나 선택 (두 사람이 같은 추억을 보게)
  function pickMemory(seed, pool) {
    if (!pool || !pool.length) return null;
    const rng = mulberry32(seed ^ 0x9e3779b9);
    return pool[Math.floor(rng() * pool.length)];
  }

  // ---------- 보름달 (음력 근사) ----------
  // 알려진 신월: 2000-01-06 18:14 UTC, 삭망월 29.530588853일
  const SYNODIC = 29.530588853;
  const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14) / 86400000; // 일 단위

  function moonAge(dateKey) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const days = Date.UTC(y, m - 1, d, 12) / 86400000; // 그날 정오 기준
    let age = (days - NEW_MOON_REF) % SYNODIC;
    if (age < 0) age += SYNODIC;
    return age; // 0=신월, ~14.77=보름
  }

  function isFullMoon(dateKey) {
    const age = moonAge(dateKey);
    return Math.abs(age - SYNODIC / 2) < 0.9; // 보름 ±0.9일
  }

  return { hashDate, mulberry32, eventForDay, pickMemory, isFullMoon, moonAge };
})();

window.AquariumEvents = AquariumEvents;
