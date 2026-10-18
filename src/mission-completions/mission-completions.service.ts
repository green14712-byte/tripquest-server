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

    return {
      message: '미션 인증이 완료되었습니다.',

      completion,

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
