export type ChallengeOperatingState =
  'NOT_ACTIVE' | 'UPCOMING' | 'OPEN' | 'EXPIRED';

type ChallengeOperatingTarget = {
  status: string;
  startAt: string | null;
  endAt: string | null;
};

/*
 * Challenge의 "DB 상태"와 "실제 운영시간"을 함께 판단한다.
 *
 * ACTIVE라고 해서 항상 여행자에게 공개되는 것은 아니다.
 *
 * ACTIVE + 시작 전
 * -> UPCOMING
 *
 * ACTIVE + 운영시간 안
 * -> OPEN
 *
 * ACTIVE + 종료시간 도달/초과
 * -> EXPIRED
 *
 * DRAFT / PAUSED / ENDED / ARCHIVED
 * -> NOT_ACTIVE
 */
export function getChallengeOperatingState(
  challenge: ChallengeOperatingTarget,
  now: Date = new Date(),
): ChallengeOperatingState {
  if (challenge.status !== 'ACTIVE') {
    return 'NOT_ACTIVE';
  }

  if (challenge.startAt && now < new Date(challenge.startAt)) {
    return 'UPCOMING';
  }

  if (challenge.endAt && now >= new Date(challenge.endAt)) {
    return 'EXPIRED';
  }

  return 'OPEN';
}

export function isChallengeOpen(
  challenge: ChallengeOperatingTarget,
  now: Date = new Date(),
) {
  return getChallengeOperatingState(challenge, now) === 'OPEN';
}
