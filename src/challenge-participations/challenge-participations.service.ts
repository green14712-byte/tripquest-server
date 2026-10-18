import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { db } from '../prisma/db';

import { getChallengeOperatingState } from '../challenges/challenge-operation-time';

@Injectable()
export class ChallengeParticipationsService {
  /*
   * USER:
   * Challenge 참여
   */
  async join(userId: number, challengeId: number) {
    /*
     * 참여하려는 Challenge 확인
     */
    const challenge = await db.orm.public.Challenge.first({
      id: challengeId,
    });

    if (!challenge) {
      throw new NotFoundException('챌린지를 찾을 수 없습니다.');
    }

    /*
     * DB status + startAt + endAt을
     * 함께 사용해서 실제 운영 상태를 판단한다.
     */
    const operatingState = getChallengeOperatingState(challenge);

    if (operatingState === 'NOT_ACTIVE') {
      throw new ConflictException('현재 참여할 수 없는 챌린지입니다.');
    }

    if (operatingState === 'UPCOMING') {
      throw new ConflictException('아직 시작되지 않은 챌린지입니다.');
    }

    if (operatingState === 'EXPIRED') {
      throw new ConflictException('이미 종료된 챌린지입니다.');
    }

    /*
     * 여기까지 통과하면
     * 실제 운영 중인 OPEN Challenge다.
     */

    /*
     * 이미 참여 중인지 확인
     */
    const existingParticipation =
      await db.orm.public.ChallengeParticipation.first({
        userId,
        challengeId,
      });

    if (existingParticipation) {
      throw new ConflictException('이미 참여 중인 챌린지입니다.');
    }

    const participation = await db.orm.public.ChallengeParticipation.create({
      userId,
      challengeId,
    });

    return {
      message: '챌린지 참여가 완료되었습니다.',

      participation,
    };
  }

  /*
   * USER:
   * 내가 참여한 Challenge 목록
   *
   * 이미 참여했던 Challenge는
   * 운영이 종료되어도 기록을 확인할 수 있어야 하므로
   * 운영시간 때문에 목록에서 제거하지 않는다.
   */
  async findMine(userId: number) {
    const participations = await db.orm.public.ChallengeParticipation.where({
      userId,
    }).all();

    const results = [];

    for (const participation of participations) {
      const challenge = await db.orm.public.Challenge.first({
        id: participation.challengeId,
      });

      if (!challenge) {
        continue;
      }

      const missions = await db.orm.public.Mission.where({
        challengeId: challenge.id,
      }).all();

      const missionIds = new Set(missions.map((mission) => mission.id));

      const completions = await db.orm.public.MissionCompletion.where({
        userId,
      }).all();

      const challengeCompletions = completions.filter((completion) =>
        missionIds.has(completion.missionId),
      );

      const totalMissionCount = missions.length;

      const completedMissionCount = challengeCompletions.length;

      const progressPercent =
        totalMissionCount === 0
          ? 0
          : Math.round((completedMissionCount / totalMissionCount) * 100);

      const completed =
        totalMissionCount > 0 && completedMissionCount === totalMissionCount;

      results.push({
        participationId: participation.id,

        joinedAt: participation.joinedAt,

        challenge: {
          id: challenge.id,

          title: challenge.title,

          description: challenge.description,

          region: challenge.region,

          status: challenge.status,

          startAt: challenge.startAt,

          endAt: challenge.endAt,

          institutionId: challenge.institutionId,
        },

        progress: {
          totalMissionCount,

          completedMissionCount,

          progressPercent,

          completed,
        },
      });
    }

    return {
      challenges: results,
    };
  }
}
