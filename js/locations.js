// 두 사람의 위치 설정 — 여기 좌표/타임존만 바꾸면 됩니다.
// (자성이 귀국하면 A의 tz/lat/lon 을 부산 값으로 바꾸면 끝)
//
// 수족관 분위기는 "상대방" 위치를 따라갑니다:
//   A(자성)가 보는 화면 = B(지수) 위치의 시간·날씨
//   B(지수)가 보는 화면 = A(자성) 위치의 시간·날씨
window.LOCATIONS = {
  A: { label: "밴쿠버", tz: "America/Vancouver", lat: 49.28, lon: -123.12 },
  B: { label: "부산", tz: "Asia/Seoul", lat: 35.18, lon: 129.075 },
};

// 상대방 키 (A↔B)
window.partnerOf = function (me) {
  return me === "A" ? "B" : "A";
};

// ---------- 시간대 4단계 경계 (현지 시각, 24h) ----------
// 새벽 5–8, 낮 8–17, 노을 17–20, 밤 20–5
window.TIME_BANDS = { DAWN: 5, DAY: 8, DUSK: 17, NIGHT: 20 };

window.phaseForHour = function (hour) {
  const b = window.TIME_BANDS;
  if (hour >= b.DAWN && hour < b.DAY) return "dawn";
  if (hour >= b.DAY && hour < b.DUSK) return "day";
  if (hour >= b.DUSK && hour < b.NIGHT) return "dusk";
  return "night";
};

// ---------- 날씨 파티클 상한 (모바일 성능 고려) ----------
window.PARTICLE_LIMITS = { RAIN: 40, SNOW: 25 };

// ---------- WMO weather code → 4분류 ----------
// https://open-meteo.com  current=weather_code
window.wmoToWeather = function (code) {
  if (code == null) return "clear";
  if (code === 0 || code === 1) return "clear"; // 맑음 / 대체로 맑음
  if (code === 2 || code === 3 || code === 45 || code === 48) return "cloudy"; // 구름/안개
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow"; // 눈
  if (
    (code >= 51 && code <= 67) || // 이슬비/비
    (code >= 80 && code <= 82) || // 소나기
    (code >= 95 && code <= 99) // 뇌우
  )
    return "rain";
  return "clear";
};

window.WEATHER_ICON = { clear: "☀️", cloudy: "☁️", rain: "☔", snow: "❄️" };
