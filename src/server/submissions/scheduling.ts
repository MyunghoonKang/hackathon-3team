import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';
import {
  addDays,
  getDay,
  setHours,
  setMilliseconds,
  setMinutes,
  setSeconds,
} from 'date-fns';

const TZ = 'Asia/Seoul';

// 다음 영업일 09:00 KST 를 계산해 UTC Date 로 돌려준다.
//
// 규칙:
//   - 오늘 09:00 KST 이전이면 오늘 09:00.
//   - 오늘 09:00 KST 이후(또는 정각)면 내일 09:00.
//   - 주말(토·일) 에 걸리면 월요일까지 밀어낸다.
//
// 스펙의 테스트 고정점 (2026-04-20~27, 월~월) 을 기준으로 동작을 검증한다.
export function nextBusinessDayNineAm(now: Date = new Date()): Date {
  const kstNow = utcToZonedTime(now, TZ);
  let candidate = setMilliseconds(setSeconds(setMinutes(setHours(kstNow, 9), 0), 0), 0);
  if (candidate.getTime() <= kstNow.getTime()) {
    candidate = addDays(candidate, 1);
  }
  while (getDay(candidate) === 0 || getDay(candidate) === 6) {
    candidate = addDays(candidate, 1);
  }
  return zonedTimeToUtc(candidate, TZ);
}
