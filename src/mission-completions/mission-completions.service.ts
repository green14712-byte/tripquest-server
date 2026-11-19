import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { createHash } from 'crypto';

import { db } from '../prisma/db';

import { getChallengeOperatingState } from '../challenges/challenge-operation-time';

import {
  createMissionCompletionPhotoSignedUrl,
  deleteMissionCompletionPhoto,
  type MissionCompletionPhotoUploadFile,
  uploadMissionCompletionPhoto,
  validateMissionCompletionPhotoFile,
} from '../storage/supabase-storage';

import { VerifyMissionDto } from './dto/verify-mission.dto';

@Injectable()
export class MissionCompletionsService {
  async verify(userId: number, dto: VerifyMissionDto) {
    /*
     * QR 토큰이 전달된 경우에만
     * SHA-256 Hash를 만든다.
     */
    const qrTokenHash =
      dto.qrToken !== undefined
        ? createHash('sha256').update(dto.qrToken).digest('hex')
        : null;

    /*
     * Mission 찾기
     *
     * 1. missionId가 있으면 ID로 조회
     * 2. missionId가 없고 QR 토큰이 있으면 QR Hash로 조회
     */
    let mission;

    if (dto.missionId !== undefined) {
      mission = await db.orm.public.Mission.first({
        id: dto.missionId,
      });

      if (!mission) {
        throw new NotFoundException('미션을 찾을 수 없습니다.');
      }
    } else if (qrTokenHash !== null) {
      mission = await db.orm.public.Mission.first({
        qrTokenHash,
      });

      if (!mission) {
        throw new BadRequestException('유효하지 않은 QR 코드입니다.');
      }
    } else {
      throw new BadRequestException('미션 ID 또는 QR 인증 정보가 필요합니다.');
    }

    /*
     * Mission 자체 운영 상태 확인
     */
    if (mission.status !== 'ACTIVE') {
      throw new ConflictException('현재 비활성화된 미션은 인증할 수 없습니다.');
    }

    /*
     * Mission이 속한 Challenge 확인
     */
    const challenge = await db.orm.public.Challenge.first({
      id: mission.challengeId,
    });

    if (!challenge) {
      throw new NotFoundException('미션이 연결된 챌린지를 찾을 수 없습니다.');
    }

    /*
     * Challenge 실제 운영 상태 확인
     */
    const operatingState = getChallengeOperatingState(challenge);

    if (operatingState === 'NOT_ACTIVE') {
      throw new ConflictException('현재 인증할 수 없는 챌린지입니다.');
    }

    if (operatingState === 'UPCOMING') {
      throw new ConflictException('아직 시작되지 않은 챌린지입니다.');
    }

    if (operatingState === 'EXPIRED') {
      throw new ConflictException('이미 종료된 챌린지입니다.');
    }

    /*
     * Challenge 참여 여부 확인
     */
    const participation = await db.orm.public.ChallengeParticipation.first({
      userId,
      challengeId: challenge.id,
    });

    if (!participation) {
      throw new ForbiddenException(
        '참여한 챌린지의 미션만 인증할 수 있습니다.',
      );
    }

    /*
     * 이미 완료한 Mission인지 확인
     */
    const existingCompletion = await db.orm.public.MissionCompletion.first({
      userId,
      missionId: mission.id,
    });

    if (existingCompletion) {
      throw new ConflictException('이미 완료한 미션입니다.');
    }

    /*
     * 전달된 QR과 현재 Mission의
     * 활성 QR이 일치하는지 확인
     */
    const qrVerified =
      qrTokenHash !== null &&
      mission.qrActive &&
      mission.qrTokenHash !== null &&
      mission.qrTokenHash === qrTokenHash;

    /*
     * 위도와 경도는 반드시 함께 전달되어야 한다.
     */
    const hasLatitude = dto.latitude !== undefined;
    const hasLongitude = dto.longitude !== undefined;

    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException('위도와 경도는 함께 전달해야 합니다.');
    }

    const locationAttempted = hasLatitude && hasLongitude;

    /*
     * GPS accuracy만 단독으로 전달하는 것은 허용하지 않는다.
     */
    if (dto.accuracy !== undefined && !locationAttempted) {
      throw new BadRequestException(
        'GPS 정확도 값은 위치 좌표와 함께 전달해야 합니다.',
      );
    }

    /*
     * 위치 인증 결과
     */
    let locationVerified = false;
    let distanceMeters: number | null = null;
    let locationFailureMessage: string | null = null;

    if (locationAttempted) {
      const latitude = dto.latitude as number;
      const longitude = dto.longitude as number;

      /*
       * GPS 정확도가 Mission 인증 반경보다 크면
       * 신뢰하기 어려운 위치로 판단한다.
       */
      if (
        dto.accuracy !== undefined &&
        dto.accuracy > mission.verificationRadius
      ) {
        locationFailureMessage =
          'GPS 정확도가 충분하지 않습니다. 위치 신호가 더 정확한 곳에서 다시 시도해주세요.';
      } else {
        const distance = this.calculateDistanceMeters(
          latitude,
          longitude,
          mission.latitude,
          mission.longitude,
        );

        distanceMeters = Math.round(distance);

        if (distance <= mission.verificationRadius) {
          locationVerified = true;
        } else {
          locationFailureMessage = `미션 장소에서 너무 멀리 떨어져 있습니다. 현재 약 ${Math.round(
            distance,
          )}m 거리입니다.`;
        }
      }
    }

    /*
     * Mission 인증 정책에 따라
     * 최종 인증 성공 여부를 판단한다.
     */
    let verificationMethod: 'LOCATION' | 'QR' | 'BOTH';

    switch (mission.verificationMode) {
      case 'LOCATION_ONLY': {
        if (dto.missionId === undefined) {
          throw new BadRequestException(
            '위치 인증을 위해 미션 ID가 필요합니다.',
          );
        }

        if (!locationAttempted) {
          throw new BadRequestException('현재 위치 정보가 필요합니다.');
        }

        if (!locationVerified) {
          throw new BadRequestException(
            locationFailureMessage ?? '위치 인증에 실패했습니다.',
          );
        }

        verificationMethod = 'LOCATION';
        break;
      }

      case 'LOCATION_AND_QR': {
        if (dto.qrToken === undefined) {
          throw new BadRequestException('QR 인증이 필요합니다.');
        }

        if (!qrVerified) {
          throw new BadRequestException(
            '유효하지 않거나 비활성화된 QR 코드입니다.',
          );
        }

        if (!locationAttempted) {
          throw new BadRequestException('현재 위치 정보가 필요합니다.');
        }

        if (!locationVerified) {
          throw new BadRequestException(
            locationFailureMessage ?? '위치 인증에 실패했습니다.',
          );
        }

        verificationMethod = 'BOTH';
        break;
      }

      case 'LOCATION_OR_QR': {
        if (!locationVerified && !qrVerified) {
          if (!locationAttempted && dto.qrToken === undefined) {
            throw new BadRequestException(
              '위치 인증 또는 QR 인증 중 하나가 필요합니다.',
            );
          }

          if (locationAttempted && locationFailureMessage) {
            throw new BadRequestException(
              `${locationFailureMessage} 또는 유효한 QR 코드를 인증해주세요.`,
            );
          }

          throw new BadRequestException(
            '위치 인증 또는 QR 인증 중 하나가 성공해야 합니다.',
          );
        }

        if (locationVerified && qrVerified) {
          verificationMethod = 'BOTH';
        } else if (locationVerified) {
          verificationMethod = 'LOCATION';
        } else {
          verificationMethod = 'QR';
        }

        break;
      }

      default: {
        throw new BadRequestException('지원하지 않는 미션 인증 방식입니다.');
      }
    }

    /*
     * 모든 조건을 통과했을 때만
     * MissionCompletion 생성
     */
    const completion = await db.orm.public.MissionCompletion.create({
      userId,
      missionId: mission.id,
      verificationMethod,
    });

    /*
     * Mission 완료 저장 직후
     * Challenge의 현재 ACTIVE Mission을 모두 완료했는지 확인한다.
     *
     * 최초 100% 완료 시에만
     * ChallengeParticipation.completedAt을 기록한다.
     *
     * 이미 completedAt이 존재하는 사용자는
     * 기관이 이후 Mission을 추가하거나 비활성화하더라도
     * 기존 완료 시각을 절대 변경하지 않는다.
     */
    const challengeCompletion = await this.markChallengeCompletedIfNeeded(
      userId,
      challenge.id,
      participation.id,
      participation.completedAt,
    );

    /*
     * 이번 Mission 인증으로 Challenge를
     * "처음" 완주한 경우에만 완료 배지를 지급한다.
     *
     * 기존 completedAt이 있던 사용자에게는
     * 소급 지급하지 않는다.
     */
    const badgeAward =
      challengeCompletion.justCompleted && challengeCompletion.completedAt
        ? await this.awardChallengeBadgeIfNeeded(
            userId,
            challenge.id,
            challenge.currentBadgeVersionId,
            challengeCompletion.completedAt,
          )
        : {
            awarded: false,
            userBadge: null,
          };

    return {
      message: badgeAward.awarded
        ? '미션 인증이 완료되었으며 Challenge를 완주하고 완료 배지를 획득했습니다.'
        : challengeCompletion.justCompleted
          ? '미션 인증이 완료되었으며 Challenge를 완주했습니다.'
          : '미션 인증이 완료되었습니다.',

      completion,

      challengeCompletion: {
        ...challengeCompletion,

        /*
         * 프론트에서 Challenge 완료 직후
         * 배지 획득 UI를 보여줄 때 사용할 수 있다.
         */
        badgeAwarded: badgeAward.awarded,

        userBadgeId: badgeAward.userBadge?.id ?? null,

        badgeVersionId: badgeAward.userBadge?.badgeVersionId ?? null,
      },

      verification: {
        missionId: mission.id,
        challengeId: challenge.id,
        verificationMode: mission.verificationMode,
        method: verificationMethod,
        locationVerified,
        qrVerified,
        distanceMeters,
        allowedRadiusMeters: mission.verificationRadius,
      },
    };
  }

  /*
   * USER: 완료한 Mission의
   * 본인 완료사진 조회
   */
  async getPhoto(userId: number, missionId: number) {
    const completion = await this.findUserCompletion(userId, missionId);

    if (!completion.photoImageKey) {
      return {
        missionId,
        completionId: completion.id,
        hasPhotoImage: false,
        photoImageUrl: null,
      };
    }

    const photoImageUrl = await createMissionCompletionPhotoSignedUrl(
      completion.photoImageKey,
    );

    return {
      missionId,
      completionId: completion.id,
      hasPhotoImage: true,
      photoImageUrl,
    };
  }

  /*
   * USER: 완료사진 등록 또는 교체
   */
  async replacePhoto(
    userId: number,
    missionId: number,
    file: MissionCompletionPhotoUploadFile,
  ) {
    const completion = await this.findUserCompletion(userId, missionId);

    try {
      validateMissionCompletionPhotoFile(file);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : '완료사진 파일을 확인할 수 없습니다.',
      );
    }

    const previousPhotoImageKey = completion.photoImageKey;

    const newPhotoImageKey = await uploadMissionCompletionPhoto(
      completion.id,
      file,
    );

    try {
      /*
       * 이 Prisma ORM에서는
       * where()를 먼저 호출한 뒤 update()한다.
       */
      const updatedCompletion = await db.orm.public.MissionCompletion.where({
        id: completion.id,
      }).update({
        photoImageKey: newPhotoImageKey,
      });

      if (!updatedCompletion) {
        throw new NotFoundException(
          '사진을 등록할 Mission 완료 기록을 찾을 수 없습니다.',
        );
      }
    } catch (error) {
      /*
       * DB 변경 실패 시 새 Storage 파일 정리
       */
      try {
        await deleteMissionCompletionPhoto(newPhotoImageKey);
      } catch {
        // cleanup 실패가 원래 오류를 덮어쓰지 않도록 한다.
      }

      throw error;
    }

    /*
     * DB 변경이 성공한 후 기존 사진 삭제
     */
    if (previousPhotoImageKey && previousPhotoImageKey !== newPhotoImageKey) {
      try {
        await deleteMissionCompletionPhoto(previousPhotoImageKey);
      } catch {
        // orphan 파일 정리는 추후 처리 가능
      }
    }

    let photoImageUrl: string | null = null;

    try {
      photoImageUrl =
        await createMissionCompletionPhotoSignedUrl(newPhotoImageKey);
    } catch {
      photoImageUrl = null;
    }

    return {
      message: previousPhotoImageKey
        ? 'Mission 완료사진이 교체되었습니다.'
        : 'Mission 완료사진이 등록되었습니다.',

      missionId,
      completionId: completion.id,
      hasPhotoImage: true,
      photoImageUrl,
    };
  }

  /*
   * USER: 본인의 Mission 완료사진 삭제
   */
  async removePhoto(userId: number, missionId: number) {
    const completion = await this.findUserCompletion(userId, missionId);

    if (!completion.photoImageKey) {
      return {
        message: '등록된 Mission 완료사진이 없습니다.',
        missionId,
        completionId: completion.id,
        hasPhotoImage: false,
        photoImageUrl: null,
      };
    }

    const previousPhotoImageKey = completion.photoImageKey;

    /*
     * 먼저 DB 연결 제거
     */
    const updatedCompletion = await db.orm.public.MissionCompletion.where({
      id: completion.id,
    }).update({
      photoImageKey: null,
    });

    if (!updatedCompletion) {
      throw new NotFoundException(
        '사진을 삭제할 Mission 완료 기록을 찾을 수 없습니다.',
      );
    }

    /*
     * DB 연결 제거 성공 후 Storage 파일 삭제
     */
    try {
      await deleteMissionCompletionPhoto(previousPhotoImageKey);
    } catch {
      // orphan 파일 정리는 추후 처리 가능
    }

    return {
      message: 'Mission 완료사진이 삭제되었습니다.',
      missionId,
      completionId: completion.id,
      hasPhotoImage: false,
      photoImageUrl: null,
    };
  }

  /*
   * USER가 Challenge의 현재 ACTIVE Mission을
   * 모두 완료했는지 확인하고 최초 완료 시각을 영구 보존한다.
   *
   * 반환값:
   * - completed: 영구 완료 상태인지 여부
   * - justCompleted: 이번 Mission 인증으로 최초 완료되었는지 여부
   * - completedAt: 최초 완료 시각
   */
  private async markChallengeCompletedIfNeeded(
    userId: number,
    challengeId: number,
    participationId: number,
    existingCompletedAt: string | null,
  ) {
    /*
     * 이미 과거에 한 번이라도 Challenge를 완료했다면
     * 현재 Mission 구성이 달라졌더라도 완료 기록을 다시 계산하거나
     * completedAt을 덮어쓰지 않는다.
     */
    if (existingCompletedAt) {
      return {
        completed: true,
        justCompleted: false,
        completedAt: existingCompletedAt,
      };
    }

    const missions = await db.orm.public.Mission.where({
      challengeId,
    }).all();

    const activeMissions = missions.filter(
      (mission) => mission.status === 'ACTIVE',
    );

    /*
     * ACTIVE Mission이 하나도 없는 Challenge는
     * 완료로 처리하지 않는다.
     */
    if (activeMissions.length === 0) {
      return {
        completed: false,
        justCompleted: false,
        completedAt: null,
      };
    }

    const userCompletions = await db.orm.public.MissionCompletion.where({
      userId,
    }).all();

    const completedMissionIds = new Set(
      userCompletions.map((completion) => completion.missionId),
    );

    const completedAllActiveMissions = activeMissions.every((mission) =>
      completedMissionIds.has(mission.id),
    );

    if (!completedAllActiveMissions) {
      return {
        completed: false,
        justCompleted: false,
        completedAt: null,
      };
    }

    const completedAt = new Date().toISOString();

    const updatedParticipation =
      await db.orm.public.ChallengeParticipation.where({
        id: participationId,
      }).update({
        completedAt,
      });

    if (!updatedParticipation) {
      throw new NotFoundException('Challenge 참여 기록을 찾을 수 없습니다.');
    }

    return {
      completed: true,
      justCompleted: true,
      completedAt,
    };
  }

  /*
   * USER가 Challenge를 최초 완주했을 때
   * 현재 지급 중인 BadgeVersion으로 UserBadge를 생성한다.
   *
   * 중요한 정책:
   *
   * 1. justCompleted인 경우에만 이 메서드를 호출한다.
   *    따라서 기존 완료자에게 자동으로 소급 지급하지 않는다.
   *
   * 2. 같은 USER + Challenge 조합은 한 번만 지급한다.
   *
   * 3. BadgeVersion은 새로 만들지 않는다.
   *    Challenge.currentBadgeVersionId가 가리키는
   *    현재 지급 중인 버전을 그대로 보존한다.
   *
   * 4. completedAt은 ChallengeParticipation의
   *    최초 완료 시각과 동일한 값을 저장한다.
   */
  private async awardChallengeBadgeIfNeeded(
    userId: number,
    challengeId: number,
    currentBadgeVersionId: number | null,
    completedAt: string,
  ) {
    /*
     * 혹시 이미 같은 Challenge의 배지를 가지고 있다면
     * 중복 생성하지 않는다.
     *
     * DB의 @@unique([userId, challengeId])와 함께
     * 이중으로 중복 지급을 방지한다.
     */
    const existingUserBadge = await db.orm.public.UserBadge.first({
      userId,
      challengeId,
    });

    if (existingUserBadge) {
      return {
        awarded: false,
        userBadge: existingUserBadge,
      };
    }

    /*
     * 현재 Challenge에 지급 중인 BadgeVersion이 없다면
     * Mission 완료와 Challenge 완료 자체는 그대로 유지하고
     * 배지만 생성하지 않는다.
     *
     * 정상적인 ACTIVE Challenge라면
     * 운영 시작/재개 시 currentBadgeVersionId가
     * 이미 설정되어 있어야 한다.
     */
    if (currentBadgeVersionId === null) {
      return {
        awarded: false,
        userBadge: null,
      };
    }

    /*
     * currentBadgeVersionId가 실제로 존재하며
     * 해당 Challenge의 BadgeVersion인지 한 번 더 확인한다.
     */
    const badgeVersion = await db.orm.public.BadgeVersion.first({
      id: currentBadgeVersionId,
    });

    if (!badgeVersion || badgeVersion.challengeId !== challengeId) {
      return {
        awarded: false,
        userBadge: null,
      };
    }

    /*
     * Challenge를 최초 완료한 시점의
     * BadgeVersion을 사용자에게 영구 지급한다.
     *
     * 이후 기관이 Mission이나 배지 디자인을 변경하여
     * 새로운 BadgeVersion을 만들어도
     * 이 사용자의 badgeVersionId는 변경하지 않는다.
     */
    const userBadge = await db.orm.public.UserBadge.create({
      userId,
      challengeId,
      badgeVersionId: badgeVersion.id,
      completedAt,
    });

    return {
      awarded: true,
      userBadge,
    };
  }

  /*
   * USER가 실제로 해당 Mission을 완료했는지 확인
   */
  private async findUserCompletion(userId: number, missionId: number) {
    const completion = await db.orm.public.MissionCompletion.first({
      userId,
      missionId,
    });

    if (!completion) {
      throw new NotFoundException(
        '완료한 미션에서만 완료사진을 사용할 수 있습니다.',
      );
    }

    return completion;
  }

  /*
   * 두 GPS 좌표 사이 거리 계산
   */
  private calculateDistanceMeters(
    latitude1: number,
    longitude1: number,
    latitude2: number,
    longitude2: number,
  ): number {
    const earthRadius = 6371000;

    const toRadians = (degree: number) => degree * (Math.PI / 180);

    const lat1 = toRadians(latitude1);
    const lat2 = toRadians(latitude2);

    const deltaLatitude = toRadians(latitude2 - latitude1);
    const deltaLongitude = toRadians(longitude2 - longitude1);

    const a =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLongitude / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadius * c;
  }
}
