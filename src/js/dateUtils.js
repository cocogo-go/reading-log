// Date를 다룰 때 toISOString()은 UTC 기준이라 한국 시간대에서 날짜가 하루 밀릴 수 있다.
// 항상 로컬 달력 날짜를 기준으로 문자열을 만든다.

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr() {
  return formatLocalDate(new Date());
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return formatLocalDate(dt);
}

export function formatLocalDateFromTimestamp(timestamp) {
  return formatLocalDate(new Date(timestamp));
}

export function thisMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
