import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { db } from '../prisma/db';

import {
  createChallengeCoverSignedUrl,
  createMissionPhotoSignedUrl,
  deleteChallengeCover,
  type ChallengeCoverUploadFile,
  uploadChallengeCover,
  validateChallengeCoverFile,
} from '../storage/supabase-storage';

import {
  getChallengeOperatingState,
  isChallengeOpen,
} from './challenge-operation-time';

import { CreateChallengeDto } from './dto/create-challenge.dto';
import { UpdateChallengeDto } from './dto/update-challenge.dto';

@Injectable()
export class ChallengesService {
  /*
   * DB 내부에서 사용하는 coverImageKey는
   * API 응답으로 직접 노출하지 않는다.
   *
   * 화면에서는 짧은 유효시간을 가진
   * Signed URL만 사용한다.
   */
  private async toChallengeResponse<
    T extends {
      coverImageKey: string | null;
    },
  >(challenge: T) {
    const { coverImageKey, ...safeChallenge } = challenge;

    let coverImageUrl: string | null = null;

    if (coverImageKey) {
      try {
        coverImageUrl = await createChallengeCoverSignedUrl(coverImageKey);
      } catch {
        /*
         * Storage URL 생성 문제 때문에
         * Challenge 목록이나 상세 조회 전체가 실패하지 않도록 한다.
         *
         * URL 생성에 실패하면 대표사진이 없는 것처럼 표시한다.
         */
        coverImageUrl = null;
      }
    }

    return {
      ...safeChallenge,

      hasCoverImage: coverImageKey !== null,

      coverImageUrl,
    };
  }

  /*
   * 업로드된 Challenge 대표사진을 검증하고
   * Storage 유틸의 일반 Error를
   * 클라이언트가 이해할 수 있는 400 오류로 변환한다.
   */
  private validateCoverImage(file: ChallengeCoverUploadFile) {
    try {
      validateChallengeCoverFile(file);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Challenge 대표사진을 확인할 수 없습니다.',
      );
    }
  }

  /*
   * Challenge가 현재 기관 소유인지 확인한다.
   */
  private async findOwnedChallenge(challengeId: number, institutionId: number) {
    const challenge = await db.orm.public.Challenge.first({
      id: challengeId,
    });

    if (!challenge) {
      throw new NotFoundException('Challenge를 찾을 수 없습니다.');
    }

    if (challenge.institutionId !== institutionId) {
      throw new ForbiddenException(
        '본인 기관의 Challenge만 관리할 수 있습니다.',
      );
    }

    return challenge;
  }

  /*
   * INSTITUTION:
   * Challenge 생성
   *
   * 생성 직후에는 DRAFT 상태다.
   *
   * 대표사진은 선택사항이다.
   *
   * 대표사진 초점은 0 ~ 100 백분율 좌표로 저장한다.
   * 값이 전달되지 않으면 중앙인 50 / 50을 사용한다.
   *
   * 사진 업로드가 요청된 경우:
   *
   * 1. 입력 파일 검증
   * 2. Challenge 생성
   * 3. Storage 업로드
   * 4. coverImageKey DB 저장
   *
   * 업로드나 DB 저장에 실패하면
   * 불완전하게 생성된 데이터와 Storage 파일을 정리한다.
   */
  async create(
    institutionId: number,
    dto: CreateChallengeDto,
    coverImage?: ChallengeCoverUploadFile,
  ) {
    if (
      dto.startAt &&
      dto.endAt &&
      new Date(dto.startAt) >= new Date(dto.endAt)
    ) {
      throw new BadRequestException('종료일시는 시작일시보다 이후여야 합니다.');
    }

    const title = dto.title.trim();

    if (title.length < 2) {
      throw new BadRequestException(
        'Challenge 제목은 최소 2자 이상이어야 합니다.',
      );
    }

    if (coverImage) {
      this.validateCoverImage(coverImage);
    }

    const challenge = await db.orm.public.Challenge.create({
      title,

      description: dto.description?.trim() || null,

      region: dto.region?.trim() || null,

      status: 'DRAFT',

      startAt: dto.startAt || null,

      endAt: dto.endAt || null,

      coverImageKey: null,

      coverPositionX: dto.coverPositionX ?? 50,

      coverPositionY: dto.coverPositionY ?? 50,

      institutionId,
    });

    /*
     * 대표사진을 선택하지 않은 경우에는
     * 기존 Challenge 생성 흐름과 동일하게 종료한다.
     */
    if (!coverImage) {
      return {
        message: 'Challenge가 생성되었습니다.',

        challenge: await this.toChallengeResponse(challenge),
      };
    }

    let uploadedFileKey: string | null = null;

    try {
      uploadedFileKey = await uploadChallengeCover(challenge.id, coverImage);

      const updatedChallenge = await db.orm.public.Challenge.where({
        id: challenge.id,
      }).update({
        coverImageKey: uploadedFileKey,
      });

      if (!updatedChallenge) {
        throw new Error('대표사진 정보를 저장할 Challenge를 찾을 수 없습니다.');
      }

      return {
        message: 'Challenge와 대표사진이 생성되었습니다.',

        challenge: await this.toChallengeResponse(updatedChallenge),
      };
    } catch {
      /*
       * Storage 업로드까지 성공했지만
       * 이후 처리가 실패한 경우 새 파일 정리
       */
      if (uploadedFileKey) {
        try {
          await deleteChallengeCover(uploadedFileKey);
        } catch {
          // cleanup 오류가 원래 오류를 덮어쓰지 않도록 한다.
        }
      }

      /*
       * 사진 등록까지 하나의 Challenge 생성 과정으로 취급한다.
       *
       * 대표사진 등록에 실패하면
       * 불완전한 새 Challenge도 제거한다.
       */
      try {
        await db.orm.public.Challenge.where({
          id: challenge.id,
        }).delete();
      } catch {
        // cleanup 오류가 원래 오류를 덮어쓰지 않도록 한다.
      }

      throw new InternalServerErrorException(
        'Challenge 대표사진 업로드 중 오류가 발생했습니다.',
      );
    }
  }

  /*
   * INSTITUTION:
   * 본인 기관 Challenge 전체 조회
   */
  async findInstitutionChallenges(institutionId: number) {
    const challenges = await db.orm.public.Challenge.where({
      institutionId,
    }).all();

    challenges.sort((a, b) => b.id - a.id);

    const responseChallenges = await Promise.all(
      challenges.map((challenge) => this.toChallengeResponse(challenge)),
    );

    return {
      challenges: responseChallenges,
    };
  }

  /*
   * INSTITUTION:
   * 본인 기관 Challenge 상세 조회
   *
   * 기관 관리 화면에서는
   * ACTIVE / INACTIVE Mission을 모두 보여준다.
   *
   * 각 Mission의 완료 기록 수도 함께 계산한다.
   *
   * 완료 기록이 없는 Mission:
   * → 물리 삭제 가능
   *
   * 완료 기록이 있는 Mission:
   * → 물리 삭제 불가
   * → 비활성화 방식으로 관리
   *
   * Mission 관광지 대표사진 정보도 함께 제공한다.
   *
   * Storage 내부 key는 노출하지 않고,
   * Signed URL만 응답한다.
   */
  async findInstitutionChallengeById(
    challengeId: number,
    institutionId: number,
  ) {
    const challenge = await db.orm.public.Challenge.first({
      id: challengeId,
    });

    if (!challenge) {
      throw new NotFoundException('Challenge를 찾을 수 없습니다.');
    }

    if (challenge.institutionId !== institutionId) {
      throw new ForbiddenException(
        '본인 기관의 Challenge만 조회할 수 있습니다.',
      );
    }

    const missions = await db.orm.public.Mission.where({
      challengeId,
    }).all();

    missions.sort((a, b) => a.sortOrder - b.sortOrder);

    const managementMissions = [];

    for (const mission of missions) {
      /*
       * 해당 Mission의 완료 기록 수를 계산한다.
       *
       * MissionCompletion이 하나라도 존재하면
       * Mission 물리 삭제는 허용하지 않는다.
       */
      const completions = await db.orm.public.MissionCompletion.where({
        missionId: mission.id,
      }).all();

      const completionCount = completions.length;

      /*
       * Mission 관광지 대표사진 Signed URL 생성
       *
       * 사진이 없다면 null.
       *
       * URL 생성에 실패하더라도
       * Challenge 상세 조회 전체를 실패시키지 않는다.
       */
      let photoImageUrl: string | null = null;

      if (mission.photoImageKey) {
        try {
          photoImageUrl = await createMissionPhotoSignedUrl(
            mission.photoImageKey,
          );
        } catch {
          photoImageUrl = null;
        }
      }

      managementMissions.push({
        id: mission.id,

        title: mission.title,

        description: mission.description,

        address: mission.address,

        hasPhotoImage: mission.photoImageKey !== null,

        photoImageUrl,

        photoPositionX: mission.photoPositionX,

        photoPositionY: mission.photoPositionY,

        status: mission.status,

        latitude: mission.latitude,

        longitude: mission.longitude,

        verificationRadius: mission.verificationRadius,

        verificationMode: mission.verificationMode,

        qrLocationNote: mission.qrLocationNote,

        qrActive: mission.qrActive,

        qrAvailable: mission.qrTokenHash !== null,

        sortOrder: mission.sortOrder,

        challengeId: mission.challengeId,

        completionCount,

        hasCompletion: completionCount > 0,

        createdAt: mission.createdAt,

        updatedAt: mission.updatedAt,
      });
    }

    return {
      challenge: await this.toChallengeResponse(challenge),

      missions: managementMissions,
    };
  }

  /*
   * INSTITUTION:
   * Challenge 기본 정보 수정
   *
   * 대표사진 초점 위치도 이 API를 통해 수정한다.
   *
   * 사진 파일 자체의 업로드/교체/삭제는
   * 기존 대표사진 전용 API를 그대로 사용한다.
   */
  async update(
    challengeId: number,
    institutionId: number,
    dto: UpdateChallengeDto,
  ) {
    const challenge = await db.orm.public.Challenge.first({
      id: challengeId,
    });

    if (!challenge) {
      throw new NotFoundException('Challenge를 찾을 수 없습니다.');
    }

    if (challenge.institutionId !== institutionId) {
      throw new ForbiddenException(
        '본인 기관의 Challenge만 수정할 수 있습니다.',
      );
    }

    if (challenge.status === 'ENDED' || challenge.status === 'ARCHIVED') {
      throw new ConflictException(
        '종료되거나 보관된 Challenge는 수정할 수 없습니다.',
      );
    }

    const hasTitle = dto.title !== undefined;

    const hasDescription = dto.description !== undefined;

    const hasRegion = dto.region !== undefined;

    const hasStartAt = dto.startAt !== undefined;

    const hasEndAt = dto.endAt !== undefined;

    const hasCoverPositionX = dto.coverPositionX !== undefined;

    const hasCoverPositionY = dto.coverPositionY !== undefined;

    if (
      !hasTitle &&
      !hasDescription &&
      !hasRegion &&
      !hasStartAt &&
      !hasEndAt &&
      !hasCoverPositionX &&
      !hasCoverPositionY
    ) {
      throw new BadRequestException('수정할 정보를 하나 이상 입력해주세요.');
    }

    /*
     * ACTIVE 상태에서는 운영기간 변경 금지.
     *
     * 운영시간을 변경하려면
     * 먼저 PAUSED로 전환해야 한다.
     *
     * 대표사진 초점 위치는 운영 중에도 수정 가능하다.
     */
    if (challenge.status === 'ACTIVE' && (hasStartAt || hasEndAt)) {
      throw new ConflictException(
        '활성화된 Challenge의 운영기간은 변경할 수 없습니다. 먼저 운영을 일시 중단해주세요.',
      );
    }

    let nextTitle = challenge.title;

    if (dto.title !== undefined) {
      const trimmedTitle = dto.title.trim();

      if (trimmedTitle.length < 2) {
        throw new BadRequestException(
          'Challenge 제목은 최소 2자 이상이어야 합니다.',
        );
      }

      nextTitle = trimmedTitle;
    }

    let nextDescription = challenge.description;

    if (dto.description !== undefined) {
      nextDescription =
        dto.description === null ? null : dto.description.trim() || null;
    }

    let nextRegion = challenge.region;

    if (dto.region !== undefined) {
      nextRegion = dto.region === null ? null : dto.region.trim() || null;
    }

    const nextStartAt =
      dto.startAt !== undefined ? (dto.startAt ?? null) : challenge.startAt;

    const nextEndAt =
      dto.endAt !== undefined ? (dto.endAt ?? null) : challenge.endAt;

    const nextCoverPositionX =
      dto.coverPositionX !== undefined
        ? dto.coverPositionX
        : challenge.coverPositionX;

    const nextCoverPositionY =
      dto.coverPositionY !== undefined
        ? dto.coverPositionY
        : challenge.coverPositionY;

    if (
      nextStartAt &&
      nextEndAt &&
      new Date(nextStartAt) >= new Date(nextEndAt)
    ) {
      throw new BadRequestException('종료일시는 시작일시보다 이후여야 합니다.');
    }

    /*
     * PAUSED 상태에서 운영기간을 수정할 때
     * 이미 종료된 시각을 endAt으로 설정하면
     * 다시 활성화할 수 없으므로 막는다.
     */
    if (
      challenge.status === 'PAUSED' &&
      nextEndAt &&
      new Date(nextEndAt) <= new Date()
    ) {
      throw new BadRequestException(
        '운영 중단 상태에서 다시 운영하려면 종료일시는 현재보다 이후여야 합니다.',
      );
    }

    const updatedChallenge = await db.orm.public.Challenge.where({
      id: challengeId,
    }).update({
      title: nextTitle,

      description: nextDescription,

      region: nextRegion,

      startAt: nextStartAt,

      endAt: nextEndAt,

      coverPositionX: nextCoverPositionX,

      coverPositionY: nextCoverPositionY,
    });

    if (!updatedChallenge) {
      throw new NotFoundException('수정할 Challenge를 찾을 수 없습니다.');
    }

    return {
      message: 'Challenge 기본 정보가 수정되었습니다.',

      challenge: await this.toChallengeResponse(updatedChallenge),
    };
  }

  /*
   * INSTITUTION:
   * Challenge 대표사진 등록 또는 교체
   *
   * DRAFT / ACTIVE / PAUSED 상태에서 허용한다.
   *
   * 대표사진은 Challenge 수행 조건에 영향을 주지 않는
   * 화면용 콘텐츠이므로 ACTIVE 상태에서도 변경할 수 있다.
   *
   * 기존 사진 업로드/교체 방식은 그대로 유지한다.
   */
  async replaceCover(
    challengeId: number,
    institutionId: number,
    coverImage?: ChallengeCoverUploadFile,
  ) {
    if (!coverImage) {
      throw new BadRequestException('등록할 대표사진을 선택해주세요.');
    }

    this.validateCoverImage(coverImage);

    const challenge = await this.findOwnedChallenge(challengeId, institutionId);

    if (challenge.status === 'ENDED' || challenge.status === 'ARCHIVED') {
      throw new ConflictException(
        '종료되거나 보관된 Challenge의 대표사진은 수정할 수 없습니다.',
      );
    }

    const oldFileKey = challenge.coverImageKey;

    let newFileKey: string | null = null;

    try {
      /*
       * 새 이미지를 먼저 Storage에 업로드한다.
       *
       * 기존 이미지를 먼저 지우지 않기 때문에
       * 새 이미지 등록이 실패해도 기존 사진은 유지된다.
       */
      newFileKey = await uploadChallengeCover(challenge.id, coverImage);

      const updatedChallenge = await db.orm.public.Challenge.where({
        id: challenge.id,
      }).update({
        coverImageKey: newFileKey,
      });

      if (!updatedChallenge) {
        throw new Error('대표사진을 수정할 Challenge를 찾을 수 없습니다.');
      }

      /*
       * DB가 새 사진을 가리키도록 변경된 뒤
       * 기존 Storage 파일을 정리한다.
       *
       * 기존 파일 삭제 실패가
       * 새 사진 등록 성공을 취소하지는 않는다.
       */
      if (oldFileKey && oldFileKey !== newFileKey) {
        try {
          await deleteChallengeCover(oldFileKey);
        } catch {
          // 추후 Storage 정리 대상으로 남을 수 있다.
        }
      }

      return {
        message: oldFileKey
          ? 'Challenge 대표사진이 교체되었습니다.'
          : 'Challenge 대표사진이 등록되었습니다.',

        challenge: await this.toChallengeResponse(updatedChallenge),
      };
    } catch {
      /*
       * 새 Storage 업로드까지 성공했으나
       * DB 반영이 실패한 경우 새 파일을 삭제한다.
       */
      if (newFileKey) {
        try {
          await deleteChallengeCover(newFileKey);
        } catch {
          // cleanup 오류가 원래 오류를 덮어쓰지 않도록 한다.
        }
      }

      throw new InternalServerErrorException(
        'Challenge 대표사진을 저장하는 중 오류가 발생했습니다.',
      );
    }
  }

  /*
   * INSTITUTION:
   * Challenge 대표사진 삭제
   */
  async removeCover(challengeId: number, institutionId: number) {
    const challenge = await this.findOwnedChallenge(challengeId, institutionId);

    if (challenge.status === 'ENDED' || challenge.status === 'ARCHIVED') {
      throw new ConflictException(
        '종료되거나 보관된 Challenge의 대표사진은 삭제할 수 없습니다.',
      );
    }

    /*
     * 이미 대표사진이 없는 경우에도
     * 안전하게 성공 응답을 돌려준다.
     */
    if (!challenge.coverImageKey) {
      return {
        message: '등록된 Challenge 대표사진이 없습니다.',

        challenge: await this.toChallengeResponse(challenge),
      };
    }

    const oldFileKey = challenge.coverImageKey;

    /*
     * 먼저 DB에서 연결을 제거한다.
     *
     * Storage를 먼저 지운 뒤 DB 수정에 실패하면
     * DB가 존재하지 않는 파일을 가리킬 수 있기 때문이다.
     */
    const updatedChallenge = await db.orm.public.Challenge.where({
      id: challenge.id,
    }).update({
      coverImageKey: null,
    });

    if (!updatedChallenge) {
      throw new NotFoundException(
        '대표사진을 삭제할 Challenge를 찾을 수 없습니다.',
      );
    }

    /*
     * Storage 파일 삭제는 후처리한다.
     *
     * Storage 정리에 실패하더라도
     * 사용자 화면에서는 삭제된 상태가 유지된다.
     */
    try {
      await deleteChallengeCover(oldFileKey);
    } catch {
      // 추후 Storage 정리 대상으로 남을 수 있다.
    }

    return {
      message: 'Challenge 대표사진이 삭제되었습니다.',

      challenge: await this.toChallengeResponse(updatedChallenge),
    };
  }

  /*
   * PUBLIC:
   * 현재 실제 운영 중인 Challenge 목록
   *
   * 단순히 status === ACTIVE만 보는 것이 아니라
   * startAt / endAt까지 함께 검사한다.
   *
   * 미래 시작 ACTIVE:
   * 목록에서 숨김
   *
   * 종료시간이 지난 ACTIVE:
   * 목록에서 숨김
   */
  async findActive() {
    const activeChallenges = await db.orm.public.Challenge.where({
      status: 'ACTIVE',
    }).all();

    const now = new Date();

    const visibleChallenges = activeChallenges.filter((challenge) =>
      isChallengeOpen(challenge, now),
    );

    const challenges = await Promise.all(
      visibleChallenges.map((challenge) => this.toChallengeResponse(challenge)),
    );

    return {
      challenges,
    };
  }

  /*
   * PUBLIC:
   * 현재 실제 운영 중인 Challenge 상세 조회
   *
   * 여행자에게는 ACTIVE Mission만 공개한다.
   *
   * Challenge 대표사진과 마찬가지로
   * Mission 관광지 대표사진도
   * Storage 내부 key는 노출하지 않는다.
   *
   * Mission 사진이 있는 경우
   * Signed URL만 응답한다.
   *
   * Signed URL 생성에 실패해도
   * Challenge 상세 조회 전체는 유지한다.
   */
  async findActiveById(challengeId: number) {
    const challenge = await db.orm.public.Challenge.first({
      id: challengeId,
    });

    if (!challenge || !isChallengeOpen(challenge)) {
      throw new NotFoundException(
        '현재 이용 가능한 Challenge를 찾을 수 없습니다.',
      );
    }

    const missions = await db.orm.public.Mission.where({
      challengeId,
    }).all();

    /*
     * USER에게 공개할 ACTIVE Mission만 남긴 뒤
     * 기관이 지정한 sortOrder 순으로 정렬한다.
     */
    const activeMissions = missions
      .filter((mission) => mission.status === 'ACTIVE')
      .sort((a, b) => a.sortOrder - b.sortOrder);

    /*
     * Mission별 대표사진 Signed URL 생성은
     * 비동기 작업이므로 Promise.all()을 사용한다.
     *
     * photoImageKey 자체는 응답하지 않는다.
     */
    const publicMissions = await Promise.all(
      activeMissions.map(async (mission) => {
        let photoImageUrl: string | null = null;

        if (mission.photoImageKey) {
          try {
            photoImageUrl = await createMissionPhotoSignedUrl(
              mission.photoImageKey,
            );
          } catch {
            /*
             * Storage URL 생성 실패 때문에
             * Challenge 상세 조회 전체가
             * 실패하지 않도록 한다.
             */
            photoImageUrl = null;
          }
        }

        return {
          id: mission.id,

          title: mission.title,

          description: mission.description,

          address: mission.address,

          hasPhotoImage: mission.photoImageKey !== null,

          photoImageUrl,

          photoPositionX: mission.photoPositionX,

          photoPositionY: mission.photoPositionY,

          status: mission.status,

          latitude: mission.latitude,

          longitude: mission.longitude,

          verificationRadius: mission.verificationRadius,

          verificationMode: mission.verificationMode,

          qrLocationNote: mission.qrLocationNote,

          qrActive: mission.qrActive,

          qrAvailable: mission.qrActive && mission.qrTokenHash !== null,

          sortOrder: mission.sortOrder,

          challengeId: mission.challengeId,

          createdAt: mission.createdAt,

          updatedAt: mission.updatedAt,
        };
      }),
    );

    return {
      challenge: await this.toChallengeResponse(challenge),

      missions: publicMissions,
    };
  }

  /*
   * USER:
   * 특정 Challenge의 본인 진행률 조회
   *
   * 이미 참여한 사용자의 기록은
   * Challenge 운영이 끝나더라도 보존한다.
   *
   * 현재 Challenge 완료 조건은
   * ACTIVE Mission만 기준으로 계산한다.
   */
  async findProgress(userId: number, challengeId: number) {
    const challenge = await db.orm.public.Challenge.first({
      id: challengeId,
    });

    if (!challenge) {
      throw new NotFoundException('Challenge를 찾을 수 없습니다.');
    }

    const participation = await db.orm.public.ChallengeParticipation.first({
      userId,

      challengeId,
    });

    const missions = await db.orm.public.Mission.where({
      challengeId,
    }).all();

    const activeMissions = missions.filter(
      (mission) => mission.status === 'ACTIVE',
    );

    const totalMissionCount = activeMissions.length;

    if (!participation) {
      return {
        challengeId,

        joined: false,

        joinedAt: null,

        totalMissionCount,

        completedMissionCount: 0,

        progressPercent: 0,

        completed: false,

        completedMissionIds: [],
      };
    }

    const userCompletions = await db.orm.public.MissionCompletion.where({
      userId,
    }).all();

    const activeMissionIds = new Set(
      activeMissions.map((mission) => mission.id),
    );

    const challengeCompletions = userCompletions.filter((completion) =>
      activeMissionIds.has(completion.missionId),
    );

    const completedMissionCount = challengeCompletions.length;

    const progressPercent =
      totalMissionCount === 0
        ? 0
        : Math.round((completedMissionCount / totalMissionCount) * 100);

    const completed =
      totalMissionCount > 0 && completedMissionCount === totalMissionCount;

    return {
      challengeId,

      joined: true,

      joinedAt: participation.joinedAt,

      totalMissionCount,

      completedMissionCount,

      progressPercent,

      completed,

      completedMissionIds: challengeCompletions.map(
        (completion) => completion.missionId,
      ),
    };
  }

  /*
   * INSTITUTION:
   * 최초 운영 활성화
   *
   * DRAFT -> ACTIVE
   *
   * 미래 시작시간도 허용한다.
   *
   * 현재 ACTIVE Mission이 최소 하나는 있어야 한다.
   */
  async activate(challengeId: number, institutionId: number) {
    const challenge = await db.orm.public.Challenge.first({
      id: challengeId,
    });

    if (!challenge) {
      throw new NotFoundException('Challenge를 찾을 수 없습니다.');
    }

    if (challenge.institutionId !== institutionId) {
      throw new ForbiddenException(
        '본인 기관의 Challenge만 운영할 수 있습니다.',
      );
    }

    if (challenge.status !== 'DRAFT') {
      throw new ConflictException(
        '운영 준비 중인 DRAFT Challenge만 최초 운영을 활성화할 수 있습니다.',
      );
    }

    const activeMission = await db.orm.public.Mission.first({
      challengeId,

      status: 'ACTIVE',
    });

    if (!activeMission) {
      throw new ConflictException(
        '활성화된 Mission을 하나 이상 등록해야 Challenge 운영을 활성화할 수 있습니다.',
      );
    }

    const now = new Date();

    if (challenge.endAt && now >= new Date(challenge.endAt)) {
      throw new ConflictException(
        '운영 종료일시가 이미 지난 Challenge는 운영을 활성화할 수 없습니다.',
      );
    }

    const updatedChallenge = await db.orm.public.Challenge.where({
      id: challengeId,
    }).update({
      status: 'ACTIVE',
    });

    if (!updatedChallenge) {
      throw new NotFoundException(
        '운영을 활성화할 Challenge를 찾을 수 없습니다.',
      );
    }

    const operatingState = getChallengeOperatingState(updatedChallenge);

    return {
      message:
        operatingState === 'UPCOMING'
          ? 'Challenge 운영 예약이 활성화되었습니다. 설정된 시작일시가 되면 여행자에게 자동으로 공개됩니다.'
          : 'Challenge 운영이 시작되었습니다.',

      challenge: await this.toChallengeResponse(updatedChallenge),
    };
  }

  /*
   * INSTITUTION:
   * 운영 일시 중단
   *
   * ACTIVE -> PAUSED
   */
  async pause(challengeId: number, institutionId: number) {
    const challenge = await db.orm.public.Challenge.first({
      id: challengeId,
    });

    if (!challenge) {
      throw new NotFoundException('Challenge를 찾을 수 없습니다.');
    }

    if (challenge.institutionId !== institutionId) {
      throw new ForbiddenException(
        '본인 기관의 Challenge만 운영을 중단할 수 있습니다.',
      );
    }

    if (challenge.status !== 'ACTIVE') {
      throw new ConflictException(
        '활성화된 Challenge만 운영을 일시 중단할 수 있습니다.',
      );
    }

    const updatedChallenge = await db.orm.public.Challenge.where({
      id: challengeId,
    }).update({
      status: 'PAUSED',
    });

    if (!updatedChallenge) {
      throw new NotFoundException(
        '운영을 중단할 Challenge를 찾을 수 없습니다.',
      );
    }

    return {
      message: 'Challenge 운영을 일시 중단했습니다.',

      challenge: await this.toChallengeResponse(updatedChallenge),
    };
  }

  /*
   * INSTITUTION:
   * 운영 재활성화
   *
   * PAUSED -> ACTIVE
   *
   * 현재 ACTIVE Mission이 최소 하나는 있어야 한다.
   */
  async resume(challengeId: number, institutionId: number) {
    const challenge = await db.orm.public.Challenge.first({
      id: challengeId,
    });

    if (!challenge) {
      throw new NotFoundException('Challenge를 찾을 수 없습니다.');
    }

    if (challenge.institutionId !== institutionId) {
      throw new ForbiddenException(
        '본인 기관의 Challenge만 다시 운영할 수 있습니다.',
      );
    }

    if (challenge.status !== 'PAUSED') {
      throw new ConflictException(
        '운영 중단 상태인 Challenge만 다시 활성화할 수 있습니다.',
      );
    }

    const activeMission = await db.orm.public.Mission.first({
      challengeId,

      status: 'ACTIVE',
    });

    if (!activeMission) {
      throw new ConflictException(
        '활성화된 Mission을 하나 이상 등록해야 Challenge 운영을 재개할 수 있습니다.',
      );
    }

    const now = new Date();

    if (challenge.endAt && now >= new Date(challenge.endAt)) {
      throw new ConflictException(
        '운영 종료일시가 이미 지난 Challenge는 다시 운영할 수 없습니다.',
      );
    }

    const updatedChallenge = await db.orm.public.Challenge.where({
      id: challengeId,
    }).update({
      status: 'ACTIVE',
    });

    if (!updatedChallenge) {
      throw new NotFoundException('다시 운영할 Challenge를 찾을 수 없습니다.');
    }

    const operatingState = getChallengeOperatingState(updatedChallenge);

    return {
      message:
        operatingState === 'UPCOMING'
          ? 'Challenge 운영 예약이 다시 활성화되었습니다. 설정된 시작일시가 되면 여행자에게 자동으로 공개됩니다.'
          : 'Challenge 운영이 다시 시작되었습니다.',

      challenge: await this.toChallengeResponse(updatedChallenge),
    };
  }

  /*
   * INSTITUTION:
   * Challenge 최종 종료
   */
  async end(challengeId: number, institutionId: number) {
    const challenge = await db.orm.public.Challenge.first({
      id: challengeId,
    });

    if (!challenge) {
      throw new NotFoundException('Challenge를 찾을 수 없습니다.');
    }

    if (challenge.institutionId !== institutionId) {
      throw new ForbiddenException(
        '본인 기관의 Challenge만 종료할 수 있습니다.',
      );
    }

    if (challenge.status !== 'ACTIVE' && challenge.status !== 'PAUSED') {
      throw new ConflictException(
        '활성화되었거나 운영 중단 상태인 Challenge만 최종 종료할 수 있습니다.',
      );
    }

    const updatedChallenge = await db.orm.public.Challenge.where({
      id: challengeId,
    }).update({
      status: 'ENDED',
    });

    if (!updatedChallenge) {
      throw new NotFoundException('종료할 Challenge를 찾을 수 없습니다.');
    }

    return {
      message: 'Challenge 운영을 최종 종료했습니다.',

      challenge: await this.toChallengeResponse(updatedChallenge),
    };
  }

  /*
   * INSTITUTION:
   * DRAFT Challenge 삭제
   *
   * 한 번이라도 운영한 Challenge는
   * 기록 보존을 위해 물리 삭제하지 않는다.
   */
  async remove(challengeId: number, institutionId: number) {
    const challenge = await db.orm.public.Challenge.first({
      id: challengeId,
    });

    if (!challenge) {
      throw new NotFoundException('Challenge를 찾을 수 없습니다.');
    }

    if (challenge.institutionId !== institutionId) {
      throw new ForbiddenException(
        '본인 기관의 Challenge만 삭제할 수 있습니다.',
      );
    }

    if (challenge.status !== 'DRAFT') {
      throw new ConflictException(
        '운영 전인 DRAFT Challenge만 삭제할 수 있습니다. 한 번이라도 운영한 Challenge는 기록 보존을 위해 삭제할 수 없습니다.',
      );
    }

    const participation = await db.orm.public.ChallengeParticipation.first({
      challengeId,
    });

    if (participation) {
      throw new ConflictException(
        '참여 기록이 존재하는 Challenge는 삭제할 수 없습니다.',
      );
    }

    const missions = await db.orm.public.Mission.where({
      challengeId,
    }).all();

    for (const mission of missions) {
      const completion = await db.orm.public.MissionCompletion.first({
        missionId: mission.id,
      });

      if (completion) {
        throw new ConflictException(
          'Mission 완료 기록이 존재하는 Challenge는 삭제할 수 없습니다.',
        );
      }
    }

    const coverImageKey = challenge.coverImageKey;

    await db.transaction(async (tx) => {
      for (const mission of missions) {
        await tx.orm.public.Mission.where({
          id: mission.id,
        }).delete();
      }

      await tx.orm.public.Challenge.where({
        id: challengeId,
      }).delete();
    });

    /*
     * DB 삭제가 완료된 뒤
     * Challenge 대표사진도 Storage에서 정리한다.
     *
     * Storage 정리 실패 때문에 이미 완료된
     * Challenge 삭제 결과를 실패로 되돌리지는 않는다.
     */
    if (coverImageKey) {
      try {
        await deleteChallengeCover(coverImageKey);
      } catch {
        // 추후 Storage 정리 대상으로 남을 수 있다.
      }
    }

    return {
      message: 'Challenge가 삭제되었습니다.',

      deletedChallengeId: challengeId,
    };
  }
}
