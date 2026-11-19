/** 한국 시간(Asia/Seoul) 날짜 표시와 영업일 계산. 브라우저 API 없이 쓰는 순수 함수(테스트에서 바로 쓴다) */
/** 서버 시각(UTC) → 한국 시간 조각. 기기 시간대와 무관하게 Asia/Seoul로 보여 준다 */
export function kst(value: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value).map(x => [x.type, x.value]));
  return { month: p.month, day: p.day, weekday: p.weekday, time: `${p.hour}:${p.minute}` };
}
/** 예: 11월 3일 (화) 21:00 */
export function kstSlot(value: number) { const k = kst(value); return `${k.month}월 ${k.day}일 (${k.weekday}) ${k.time}`; }
/** 예: 11.3 21:00 */
export function kstShort(value: number) { const k = kst(value); return `${k.month}.${k.day} ${k.time}`; }
/** 예: 11.23 (월) */
export function kstDay(value: number) { const k = kst(value); return `${k.month}.${String(k.day).padStart(2, '0')} (${k.weekday})`; }
/** 한국 시간 기준 days 영업일(토·일 제외) 뒤 날짜. 공휴일은 반영하지 않는다 */
export function addBusinessDays(from: number, days: number) {
  const day = 86_400_000, kstOffset = 9 * 3_600_000; let t = from, left = days;
  while (left > 0) { t += day; const w = new Date(t + kstOffset).getUTCDay(); if (w !== 0 && w !== 6) left--; }
  return t;
}
/** 판매 예정 표시: 한국 날짜 기준 오늘이면 "오늘 18:00 오픈", 아니면 "D-n · 11.21 (금) 18:00 오픈" */
export function openDay(startsAt: number, now: number) {
  const day = (t: number) => Math.floor((t + 9 * 3_600_000) / 86_400_000), diff = day(startsAt) - day(now), k = kst(startsAt);
  return diff <= 0 ? `오늘 ${k.time} 오픈` : `D-${diff} · ${kstDay(startsAt)} ${k.time} 오픈`;
}
