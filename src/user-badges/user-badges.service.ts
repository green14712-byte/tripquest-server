import { Injectable, NotFoundException } from '@nestjs/common';

import { db } from '../prisma/db';

import { createBadgeCenterImageSignedUrl } from '../storage/supabase-storage';

@Injectable()
export class UserBadgesService {
  /*
   * USER:
   * 본인이 획득한 완료 배지 목록 조회
   *
   * 조회하기 전에 UserBadge가 누락된
   * 과거 Challenge 완료 기록을 한 번 보정한다.
   */
  async findMine(userId: number) {
    const restoredBadgeCount =
      await this.restoreMissingBadgesForCompletedChallenges(userId);

    const userBadges = await db.orm.public.UserBadge.where({
      userId,
    }).all();

    const badges = [];

    for (const userBadge of userBadges) {
      const challenge = await db.orm.public.Challenge.first({
        id: userBadge.challengeId,
      });

      const badgeVersion = await db.orm.public.BadgeVersion.first({
        id: userBadge.badgeVersionId,
      });

      /*
       * 정상적인 FK 상태에서는 발생하지 않아야 하지만,
       * 관계 데이터가 없다면 잘못된 배지를 응답하지 않는다.
       */
      if (!challenge || !badgeVersion) {
        continue;
      }

      let centerImageUrl: string | null = null;

      /*
       * Private Storage 내부 key 자체는 노출하지 않고
       * Signed URL만 프론트에 전달한다.
       */
      if (badgeVersion.centerType === 'IMAGE' && badgeVersion.centerImageKey) {
        try {
          centerImageUrl = await createBadgeCenterImageSignedUrl(
            badgeVersion.centerImageKey,
          );
        } catch {
          centerImageUrl = null;
        }
      }

      /*
       * -----------------------------------------------------
       * BadgeVersion 보유율 계산
       * -----------------------------------------------------
       *
       * 보유율 =
       *
       * 해당 BadgeVersion을 실제 보유한 사용자 수
       * ---------------------------------------- × 100
       * 해당 Challenge 전체 참여자 수
       *
       *
       * 예:
       *
       * Challenge 참여자 = 20명
       * V1 보유자         = 5명
       *
       * -> V1 보유율 = 25%
       *
       *
       * 같은 Challenge라도 V1, V2의 보유율은
       * 서로 다를 수 있다.
       */

      const challengeParticipations =
        await db.orm.public.ChallengeParticipation.where({
          challengeId: userBadge.challengeId,
        }).all();

      const versionOwners = await db.orm.public.UserBadge.where({
        badgeVersionId: userBadge.badgeVersionId,
      }).all();

      const participantCount = challengeParticipations.length;

      const ownershipCount = versionOwners.length;

      /*
       * 참여자가 없는 상태에서 0으로 나누는 것을 방지한다.
       *
       * 정상적으로 UserBadge가 존재한다면
       * 최소 한 명의 참여자가 있어야 하지만,
       * 데이터 정합성 문제까지 고려하여 안전하게 처리한다.
       */
      const ownershipRate =
        participantCount > 0
          ? Math.round((ownershipCount / participantCount) * 1000) / 10
          : 0;

      /*
       * 사용자가 가진 BadgeVersion이
       * 현재 Challenge에서 지급 중인 최신 버전인지 표시한다.
       *
       * 예:
       *
       * 사용자는 V1 보유
       * Challenge 현재 버전은 V2
       *
       * -> false
       *
       * 사용자는 V2 보유
       * Challenge 현재 버전도 V2
       *
       * -> true
       */
      const isCurrentVersion =
        challenge.currentBadgeVersionId === badgeVersion.id;

      badges.push({
        id: userBadge.id,

        challengeId: userBadge.challengeId,

        badgeVersionId: userBadge.badgeVersionId,

        /*
         * 실제 Challenge 완료 시각
         */
        completedAt: userBadge.completedAt,

        /*
         * UserBadge 레코드가 실제 발급된 시각
         *
         * 과거 완료자를 나중에 복원한 경우
         * completedAt보다 늦을 수 있다.
         */
        issuedAt: userBadge.issuedAt,

        challenge: {
          id: challenge.id,

          title: challenge.title,

          status: challenge.status,
        },

        badge: {
          id: badgeVersion.id,

          version: badgeVersion.version,

          missionCount: badgeVersion.missionCount,

          shape: badgeVersion.shape,

          difficulty: badgeVersion.difficulty,

          borderColor: badgeVersion.borderColor,

          centerType: badgeVersion.centerType,

          hasCenterImage: badgeVersion.centerImageKey !== null,

          centerImageUrl,

          imageScale: badgeVersion.imageScale,

          imagePositionX: badgeVersion.imagePositionX,

          imagePositionY: badgeVersion.imagePositionY,

          icon: badgeVersion.icon,

          name: badgeVersion.name,

          description: badgeVersion.description,

          createdAt: badgeVersion.createdAt,

          /*
           * 해당 BadgeVersion의 실제 보유 사용자 수
           */
          ownershipCount,

          /*
           * 해당 Challenge에 참여한 전체 사용자 수
           */
          participantCount,

          /*
           * 해당 BadgeVersion 보유율
           *
           * 소수점 첫째 자리까지 반환한다.
           *
           * 예:
           * 12
           * 12.5
           * 100
           */
          ownershipRate,

          /*
           * 현재 Challenge에서 실제 지급 중인
           * BadgeVersion인지 여부
           */
          isCurrentVersion,
        },
      });
    }

    /*
     * 최근 완료한 Challenge의 배지를 위에 표시한다.
     */
    badges.sort((a, b) => {
      return (
        new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
      );
    });

    return {
      message:
        restoredBadgeCount > 0
          ? `내 배지를 조회했으며 과거 완료 배지 ${restoredBadgeCount}개를 복원했습니다.`
          : '내 배지를 조회했습니다.',

      restoredBadgeCount,

      badges,
    };
  }

  /*
   * 이미 Challenge를 완료했지만
   * UserBadge가 없는 사용자의 배지 기록을 복원한다.
   *
   * 크게 두 경우를 처리한다.
   *
   * A. completedAt이 이미 존재하는 경우
   *
   *    - 완료 당시 존재했던 BadgeVersion 중
   *      가장 최신 버전을 지급한다.
   *
   *    - 완료 시점보다 이전 BadgeVersion이 하나도 없다면
   *      배지 시스템 도입 전 완료자로 보고
   *      가장 오래된 BadgeVersion을 지급한다.
   *
   *
   * B. completedAt이 NULL인 과거 데이터
   *
   *    - 가장 오래된 BadgeVersion이 생성되기 전에
   *      해당 Challenge의 Mission을
   *      V1.missionCount만큼 완료했는지 확인한다.
   *
   *    - 조건을 만족하면 배지 시스템 도입 전에
   *      실제로 Challenge를 완료했던 사용자로 복원한다.
   *
   *    - 완료 시각은 필요한 Mission 수를 채운 순간,
   *      즉 N번째 MissionCompletion.verifiedAt을 사용한다.
   *
   *    - ChallengeParticipation.completedAt도
   *      해당 과거 시각으로 복원한다.
   *
   *    - 그리고 가장 오래된 BadgeVersion을 지급한다.
   */
  private async restoreMissingBadgesForCompletedChallenges(userId: number) {
    const participations = await db.orm.public.ChallengeParticipation.where({
      userId,
    }).all();

    if (participations.length === 0) {
      return 0;
    }

    /*
     * 사용자가 이미 가지고 있는 배지를 한 번에 조회한다.
     */
    const existingUserBadges = await db.orm.public.UserBadge.where({
      userId,
    }).all();

    const issuedChallengeIds = new Set(
      existingUserBadges.map((userBadge) => userBadge.challengeId),
    );

    /*
     * 사용자의 모든 MissionCompletion도 한 번에 조회한다.
     *
     * 이후 각 Challenge의 Mission ID를 이용해서
     * Challenge별 완료 기록만 필터링한다.
     */
    const allUserCompletions = await db.orm.public.MissionCompletion.where({
      userId,
    }).all();

    let restoredBadgeCount = 0;

    for (const participation of participations) {
      /*
       * 이미 해당 Challenge의 UserBadge를 가지고 있다면
       * 다시 지급하지 않는다.
       */
      if (issuedChallengeIds.has(participation.challengeId)) {
        continue;
      }

      /*
       * 해당 Challenge의 모든 BadgeVersion 조회
       */
      const badgeVersions = await db.orm.public.BadgeVersion.where({
        challengeId: participation.challengeId,
      }).all();

      /*
       * BadgeVersion 자체가 아직 없다면
       * 지급할 배지가 없으므로 건너뛴다.
       */
      if (badgeVersions.length === 0) {
        continue;
      }

      /*
       * Challenge 내부 version 번호를 기준으로
       * 오래된 버전부터 정렬한다.
       */
      const sortedVersions = [...badgeVersions].sort(
        (a, b) => a.version - b.version,
      );

      const firstBadgeVersion = sortedVersions[0];

      if (!firstBadgeVersion) {
        continue;
      }

      let completedAt = participation.completedAt;

      let selectedBadgeVersion = firstBadgeVersion;

      /*
       * =====================================================
       * CASE 1
       *
       * ChallengeParticipation.completedAt이 이미 존재
       * =====================================================
       */
      if (completedAt) {
        const completedAtTime = new Date(completedAt).getTime();

        /*
         * 사용자가 완료한 시점까지 이미 존재했던
         * BadgeVersion만 찾는다.
         */
        const versionsAvailableAtCompletion = sortedVersions.filter(
          (badgeVersion) => {
            return (
              new Date(badgeVersion.createdAt).getTime() <= completedAtTime
            );
          },
        );

        if (versionsAvailableAtCompletion.length > 0) {
          /*
           * 완료 당시 여러 버전이 존재했다면
           * 가장 높은 version을 선택한다.
           *
           * 예:
           *
           * V1 생성
           * V2 생성
           * 사용자 완료
           * V3 생성
           *
           * -> V2 지급
           */
          selectedBadgeVersion = versionsAvailableAtCompletion.reduce(
            (latestVersion, currentVersion) => {
              return currentVersion.version > latestVersion.version
                ? currentVersion
                : latestVersion;
            },
          );
        } else {
          /*
           * completedAt은 있지만
           * 완료 당시 BadgeVersion이 하나도 없었다.
           *
           * 즉 배지 시스템 도입 전에 완료한 사용자다.
           *
           * -> 가장 오래된 최초 BadgeVersion 지급
           */
          selectedBadgeVersion = firstBadgeVersion;
        }
      } else {
        /*
         * =====================================================
         * CASE 2
         *
         * completedAt 자체가 NULL인 구형 완료 데이터
         * =====================================================
         *
         * 배지 기능뿐만 아니라 completedAt 기능도
         * 도입되기 전에 Challenge를 완료했을 가능성이 있다.
         */

        /*
         * 해당 Challenge에 속하는 Mission 목록 조회
         */
        const challengeMissions = await db.orm.public.Mission.where({
          challengeId: participation.challengeId,
        }).all();

        if (challengeMissions.length === 0) {
          continue;
        }

        const challengeMissionIds = new Set(
          challengeMissions.map((mission) => mission.id),
        );

        /*
         * 이 사용자가 해당 Challenge에서 완료한
         * MissionCompletion만 골라낸다.
         */
        const challengeCompletions = allUserCompletions.filter((completion) =>
          challengeMissionIds.has(completion.missionId),
        );

        /*
         * V1이 만들어지기 전에 완료한 기록만 사용한다.
         *
         * 이렇게 해야 사용자가 V1 생성 이후 새로 추가된
         * Mission을 나중에 완료한 기록 때문에
         * 과거 완료자로 잘못 판정되는 것을 막을 수 있다.
         */
        const firstBadgeVersionCreatedAt = new Date(
          firstBadgeVersion.createdAt,
        ).getTime();

        const completionsBeforeFirstBadgeVersion = challengeCompletions
          .filter((completion) => {
            return (
              new Date(completion.verifiedAt).getTime() <=
              firstBadgeVersionCreatedAt
            );
          })
          .sort((a, b) => {
            return (
              new Date(a.verifiedAt).getTime() -
              new Date(b.verifiedAt).getTime()
            );
          });

        /*
         * V1의 missionCount는
         * 최초 BadgeVersion이 확정될 당시의
         * ACTIVE Mission 수다.
         *
         * V1 생성 전에 그 수만큼 Mission을 완료했다면
         * 배지 시스템 도입 전에 Challenge를
         * 이미 완주했던 것으로 복원한다.
         */
        if (
          completionsBeforeFirstBadgeVersion.length <
          firstBadgeVersion.missionCount
        ) {
          /*
           * 완료 근거가 부족하므로
           * 임의로 Challenge 완료 처리하지 않는다.
           */
          continue;
        }

        /*
         * 필요한 Mission 수를 처음 채운 시점이
         * 과거 Challenge 완료 시각이다.
         *
         * 예:
         *
         * V1 missionCount = 5
         *
         * Mission 완료:
         * 1번째 10:00
         * 2번째 10:10
         * 3번째 10:20
         * 4번째 10:30
         * 5번째 10:40
         *
         * -> completedAt = 10:40
         */
        const completionThatFinishedChallenge =
          completionsBeforeFirstBadgeVersion[
            firstBadgeVersion.missionCount - 1
          ];

        if (!completionThatFinishedChallenge) {
          continue;
        }

        completedAt = completionThatFinishedChallenge.verifiedAt;

        /*
         * ChallengeParticipation의 과거 완료 시각도
         * 함께 복원한다.
         *
         * 현재 시간이 아니라 실제 Mission 기록에서
         * 계산한 과거 완료 시각을 사용한다.
         */
        const updatedParticipation =
          await db.orm.public.ChallengeParticipation.where({
            id: participation.id,
          }).update({
            completedAt,
          });

        if (!updatedParticipation) {
          throw new NotFoundException(
            '과거 Challenge 완료 기록을 복원할 참여 정보를 찾을 수 없습니다.',
          );
        }

        /*
         * completedAt 기능과 BadgeVersion 기능 이전에
         * 완료한 사용자이므로 최초 BadgeVersion을 지급한다.
         */
        selectedBadgeVersion = firstBadgeVersion;
      }

      /*
       * 여기까지 왔는데 completedAt이 없다면
       * 안전을 위해 UserBadge를 생성하지 않는다.
       */
      if (!completedAt) {
        continue;
      }

      /*
       * 실제 생성 직전에 한 번 더 중복 확인한다.
       *
       * 같은 요청이 빠르게 여러 번 들어오는 상황에서도
       * 최대한 중복 생성을 막는다.
       */
      const existingUserBadge = await db.orm.public.UserBadge.first({
        userId,

        challengeId: participation.challengeId,
      });

      if (existingUserBadge) {
        issuedChallengeIds.add(participation.challengeId);

        continue;
      }

      try {
        /*
         * 실제 UserBadge 생성
         *
         * completedAt
         * -> 실제 Challenge 완료 시각
         *
         * issuedAt
         * -> UserBadge 모델의 @default(now()) 사용
         */
        await db.orm.public.UserBadge.create({
          userId,

          challengeId: participation.challengeId,

          badgeVersionId: selectedBadgeVersion.id,

          completedAt,
        });

        issuedChallengeIds.add(participation.challengeId);

        restoredBadgeCount += 1;
      } catch (error) {
        /*
         * 동시에 두 요청이 들어온 경우
         * DB의 @@unique([userId, challengeId]) 때문에
         * 한 요청만 성공할 수 있다.
         *
         * 생성 실패 후 이미 UserBadge가 존재한다면
         * 정상적인 동시 요청으로 보고 넘어간다.
         */
        const duplicateUserBadge = await db.orm.public.UserBadge.first({
          userId,

          challengeId: participation.challengeId,
        });

        if (duplicateUserBadge) {
          issuedChallengeIds.add(participation.challengeId);

          continue;
        }

        throw error;
      }
    }

    return restoredBadgeCount;
  }
}
