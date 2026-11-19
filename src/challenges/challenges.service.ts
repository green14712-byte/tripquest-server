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
  createBadgeCenterImageSignedUrl,
  createChallengeCoverSignedUrl,
  createMissionPhotoSignedUrl,
  deleteBadgeCenterImage,
  deleteChallengeCover,
  type BadgeCenterImageUploadFile,
  type ChallengeCoverUploadFile,
  uploadBadgeCenterImage,
  uploadChallengeCover,
  validateBadgeCenterImageFile,
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
   * Storage 내부 key는 API 응답으로 직접 노출하지 않는다.
   *
   * Challenge 대표사진과 배지 중앙 이미지는
   * Signed URL만 클라이언트에 전달한다.
   */
  private async toChallengeResponse<
    T extends {
      coverImageKey: string | null;
      badgeCenterImageKey: string | null;
    },
  >(challenge: T) {
    const { coverImageKey, badgeCenterImageKey, ...safeChallenge } = challenge;

    let coverImageUrl: string | null = null;

    if (coverImageKey) {
      try {
        coverImageUrl = await createChallengeCoverSignedUrl(coverImageKey);
      } catch {
        coverImageUrl = null;
      }
    }

    let badgeCenterImageUrl: string | null = null;

    if (badgeCenterImageKey) {
      try {
        badgeCenterImageUrl =
          await createBadgeCenterImageSignedUrl(badgeCenterImageKey);
      } catch {
        badgeCenterImageUrl = null;
      }
    }

    return {
      ...safeChallenge,

      hasCoverImage: coverImageKey !== null,
      coverImageUrl,

      hasBadgeCenterImage: badgeCenterImageKey !== null,
      badgeCenterImageUrl,
    };
  }

  /*
   * Challenge 대표사진 검증
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
   * Challenge 완료 배지 중앙 이미지 검증
   */
  private validateBadgeImage(file: BadgeCenterImageUploadFile) {
    try {
      validateBadgeCenterImageFile(file);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : '완료 배지 이미지를 확인할 수 없습니다.',
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
   * ACTIVE Mission 수에 따라
   * 배지 형태를 자동 결정한다.
   */
  private getBadgeShape(activeMissionCount: number) {
    if (activeMissionCount <= 2) {
      return 'CIRCLE' as const;
    }

    if (activeMissionCount === 3) {
      return 'TRIANGLE' as const;
    }

    if (activeMissionCount === 4) {
      return 'DIAMOND' as const;
    }

    if (activeMissionCount === 5) {
      return 'PENTAGON' as const;
    }

    if (activeMissionCount === 6) {
      return 'HEXAGON' as const;
    }

    return 'SHIELD' as const;
  }

  /*
   * Challenge 운영 시작 / 재개 전에
   * 완료 배지 설정을 검사한다.
   */
  private validateBadgeSettings(challenge: {
    difficulty: number | null;
    badgeBorderColor: string | null;
    badgeCenterType: 'IMAGE' | 'ICON' | null;
    badgeCenterImageKey: string | null;
    badgeImageScale: number;
    badgeImagePositionX: number;
    badgeImagePositionY: number;
    badgeIcon: string | null;
    badgeName: string | null;
    badgeDescription: string | null;
  }) {
    if (
      challenge.difficulty === null ||
      !Number.isInteger(challenge.difficulty) ||
      challenge.difficulty < 1 ||
      challenge.difficulty > 5
    ) {
      throw new ConflictException(
        'Challenge 운영 전에 난이도를 1~5단계로 설정해주세요.',
      );
    }

    if (
      !challenge.badgeBorderColor ||
      !/^#[0-9A-Fa-f]{6}$/.test(challenge.badgeBorderColor)
    ) {
      throw new ConflictException(
        'Challenge 운영 전에 완료 배지의 테두리 색상을 설정해주세요.',
      );
    }

    if (!challenge.badgeName?.trim()) {
      throw new ConflictException(
        'Challenge 운영 전에 완료 배지 이름을 설정해주세요.',
      );
    }

    if (!challenge.badgeDescription?.trim()) {
      throw new ConflictException(
        'Challenge 운영 전에 완료 배지 설명을 설정해주세요.',
      );
    }

    if (!challenge.badgeCenterType) {
      throw new ConflictException(
        'Challenge 운영 전에 완료 배지의 중앙 디자인을 설정해주세요.',
      );
    }

    if (
      challenge.badgeCenterType === 'IMAGE' &&
      !challenge.badgeCenterImageKey
    ) {
      throw new ConflictException(
        '이미지형 완료 배지를 사용하려면 중앙 이미지를 먼저 등록해주세요.',
      );
    }

    if (challenge.badgeCenterType === 'ICON' && !challenge.badgeIcon?.trim()) {
      throw new ConflictException(
        '아이콘형 완료 배지를 사용하려면 중앙 아이콘을 선택해주세요.',
      );
    }

    if (
      !Number.isFinite(challenge.badgeImageScale) ||
      challenge.badgeImageScale < 40 ||
      challenge.badgeImageScale > 100
    ) {
      throw new ConflictException(
        '배지 이미지 크기는 40에서 100 사이로 설정해주세요.',
      );
    }

    if (
      !Number.isFinite(challenge.badgeImagePositionX) ||
      challenge.badgeImagePositionX < 0 ||
      challenge.badgeImagePositionX > 100
    ) {
      throw new ConflictException(
        '배지 이미지 가로 위치는 0에서 100 사이로 설정해주세요.',
      );
    }

    if (
      !Number.isFinite(challenge.badgeImagePositionY) ||
      challenge.badgeImagePositionY < 0 ||
      challenge.badgeImagePositionY > 100
    ) {
      throw new ConflictException(
        '배지 이미지 세로 위치는 0에서 100 사이로 설정해주세요.',
      );
    }
  }

  /*
   * 특정 Storage 이미지가 과거 BadgeVersion에
   * 이미 사용되고 있는지 확인한다.
   *
   * 과거 BadgeVersion이 참조하고 있다면
   * 그 이미지는 역사적인 배지 스냅샷의 일부이므로 삭제하면 안 된다.
   */
  private async isBadgeImageUsedByVersion(fileKey: string) {
    const badgeVersion = await db.orm.public.BadgeVersion.first({
      centerImageKey: fileKey,
    });

    return badgeVersion !== null;
  }

  /*
   * Challenge를 ACTIVE로 전환하기 직전에
   * 현재 Mission 구성 + 현재 배지 설정으로
   * BadgeVersion을 확정한다.
   */
  private async ensureCurrentBadgeVersion(challengeId: number) {
    const challenge = await db.orm.public.Challenge.first({
      id: challengeId,
    });

    if (!challenge) {
      throw new NotFoundException('Challenge를 찾을 수 없습니다.');
    }

    this.validateBadgeSettings(challenge);

    const missions = await db.orm.public.Mission.where({
      challengeId,
    }).all();

    const activeMissionCount = missions.filter(
      (mission) => mission.status === 'ACTIVE',
    ).length;

    if (activeMissionCount === 0) {
      throw new ConflictException(
        '활성화된 Mission을 하나 이상 등록해야 완료 배지를 확정할 수 있습니다.',
      );
    }

    const shape = this.getBadgeShape(activeMissionCount);

    let currentBadgeVersion = null;

    if (challenge.currentBadgeVersionId !== null) {
      currentBadgeVersion = await db.orm.public.BadgeVersion.first({
        id: challenge.currentBadgeVersionId,
      });
    }

    const normalizedBadgeName = challenge.badgeName!.trim();

    const normalizedBadgeDescription = challenge.badgeDescription!.trim();

    const normalizedBadgeIcon = challenge.badgeIcon?.trim() || null;

    const currentVersionMatches =
      currentBadgeVersion !== null &&
      currentBadgeVersion.missionCount === activeMissionCount &&
      currentBadgeVersion.shape === shape &&
      currentBadgeVersion.difficulty === challenge.difficulty &&
      currentBadgeVersion.borderColor === challenge.badgeBorderColor &&
      currentBadgeVersion.centerType === challenge.badgeCenterType &&
      currentBadgeVersion.centerImageKey === challenge.badgeCenterImageKey &&
      currentBadgeVersion.imageScale === challenge.badgeImageScale &&
      currentBadgeVersion.imagePositionX === challenge.badgeImagePositionX &&
      currentBadgeVersion.imagePositionY === challenge.badgeImagePositionY &&
      currentBadgeVersion.icon === normalizedBadgeIcon &&
      currentBadgeVersion.name === normalizedBadgeName &&
      currentBadgeVersion.description === normalizedBadgeDescription;

    if (currentVersionMatches) {
      return currentBadgeVersion;
    }

    const existingVersions = await db.orm.public.BadgeVersion.where({
      challengeId,
    }).all();

    const nextVersion =
      existingVersions.reduce(
        (highest, version) => Math.max(highest, version.version),
        0,
      ) + 1;

    const createdBadgeVersion = await db.orm.public.BadgeVersion.create({
      challengeId,

      version: nextVersion,

      missionCount: activeMissionCount,

      shape,

      difficulty: challenge.difficulty!,

      borderColor: challenge.badgeBorderColor!,

      centerType: challenge.badgeCenterType!,

      centerImageKey:
        challenge.badgeCenterType === 'IMAGE'
          ? challenge.badgeCenterImageKey
          : null,

      imageScale: challenge.badgeImageScale,

      imagePositionX: challenge.badgeImagePositionX,

      imagePositionY: challenge.badgeImagePositionY,

      icon: challenge.badgeCenterType === 'ICON' ? normalizedBadgeIcon : null,

      name: normalizedBadgeName,

      description: normalizedBadgeDescription,
    });

    const updatedChallenge = await db.orm.public.Challenge.where({
      id: challengeId,
    }).update({
      currentBadgeVersionId: createdBadgeVersion.id,
    });

    if (!updatedChallenge) {
      throw new NotFoundException(
        '현재 완료 배지 버전을 연결할 Challenge를 찾을 수 없습니다.',
      );
    }

    return createdBadgeVersion;
  }

  /*
   * INSTITUTION:
   * Challenge 생성
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
      if (uploadedFileKey) {
        try {
          await deleteChallengeCover(uploadedFileKey);
        } catch {}
      }

      try {
        await db.orm.public.Challenge.where({
          id: challenge.id,
        }).delete();
      } catch {}

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
      const completions = await db.orm.public.MissionCompletion.where({
        missionId: mission.id,
      }).all();

      const completionCount = completions.length;

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
   * Challenge 기본 정보 및 배지 설정 수정
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

    const hasRouteMode = dto.routeMode !== undefined;

    const hasDifficulty = dto.difficulty !== undefined;

    const hasBadgeBorderColor = dto.badgeBorderColor !== undefined;

    const hasBadgeCenterType = dto.badgeCenterType !== undefined;

    const hasBadgeIcon = dto.badgeIcon !== undefined;

    const hasBadgeName = dto.badgeName !== undefined;

    const hasBadgeDescription = dto.badgeDescription !== undefined;

    const hasBadgeImageScale = dto.badgeImageScale !== undefined;

    const hasBadgeImagePositionX = dto.badgeImagePositionX !== undefined;

    const hasBadgeImagePositionY = dto.badgeImagePositionY !== undefined;

    const hasCoverPositionX = dto.coverPositionX !== undefined;

    const hasCoverPositionY = dto.coverPositionY !== undefined;

    if (
      !hasTitle &&
      !hasDescription &&
      !hasRegion &&
      !hasStartAt &&
      !hasEndAt &&
      !hasRouteMode &&
      !hasDifficulty &&
      !hasBadgeBorderColor &&
      !hasBadgeCenterType &&
      !hasBadgeIcon &&
      !hasBadgeName &&
      !hasBadgeDescription &&
      !hasBadgeImageScale &&
      !hasBadgeImagePositionX &&
      !hasBadgeImagePositionY &&
      !hasCoverPositionX &&
      !hasCoverPositionY
    ) {
      throw new BadRequestException('수정할 정보를 하나 이상 입력해주세요.');
    }

    if (challenge.status === 'ACTIVE' && (hasStartAt || hasEndAt)) {
      throw new ConflictException(
        '활성화된 Challenge의 운영기간은 변경할 수 없습니다. 먼저 운영을 일시 중단해주세요.',
      );
    }

    const hasBadgeSettingChange =
      hasDifficulty ||
      hasBadgeBorderColor ||
      hasBadgeCenterType ||
      hasBadgeIcon ||
      hasBadgeName ||
      hasBadgeDescription ||
      hasBadgeImageScale ||
      hasBadgeImagePositionX ||
      hasBadgeImagePositionY;

    if (challenge.status === 'ACTIVE' && hasBadgeSettingChange) {
      throw new ConflictException(
        '운영 중인 Challenge의 난이도와 완료 배지 설정은 변경할 수 없습니다. 먼저 운영을 일시 중단해주세요.',
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

    const nextRouteMode =
      dto.routeMode !== undefined ? dto.routeMode : challenge.routeMode;

    const nextDifficulty =
      dto.difficulty !== undefined
        ? (dto.difficulty ?? null)
        : challenge.difficulty;

    const nextBadgeBorderColor =
      dto.badgeBorderColor !== undefined
        ? dto.badgeBorderColor === null
          ? null
          : dto.badgeBorderColor.trim().toUpperCase()
        : challenge.badgeBorderColor;

    const nextBadgeCenterType =
      dto.badgeCenterType !== undefined
        ? (dto.badgeCenterType ?? null)
        : challenge.badgeCenterType;

    const nextBadgeIcon =
      dto.badgeIcon !== undefined
        ? dto.badgeIcon === null
          ? null
          : dto.badgeIcon.trim() || null
        : challenge.badgeIcon;

    const nextBadgeName =
      dto.badgeName !== undefined
        ? dto.badgeName === null
          ? null
          : dto.badgeName.trim() || null
        : challenge.badgeName;

    const nextBadgeDescription =
      dto.badgeDescription !== undefined
        ? dto.badgeDescription === null
          ? null
          : dto.badgeDescription.trim() || null
        : challenge.badgeDescription;

    const nextBadgeImageScale =
      dto.badgeImageScale !== undefined
        ? dto.badgeImageScale
        : challenge.badgeImageScale;

    const nextBadgeImagePositionX =
      dto.badgeImagePositionX !== undefined
        ? dto.badgeImagePositionX
        : challenge.badgeImagePositionX;

    const nextBadgeImagePositionY =
      dto.badgeImagePositionY !== undefined
        ? dto.badgeImagePositionY
        : challenge.badgeImagePositionY;

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

      routeMode: nextRouteMode,

      difficulty: nextDifficulty,

      badgeBorderColor: nextBadgeBorderColor,

      badgeCenterType: nextBadgeCenterType,

      badgeIcon: nextBadgeIcon,

      badgeName: nextBadgeName,

      badgeDescription: nextBadgeDescription,

      badgeImageScale: nextBadgeImageScale,

      badgeImagePositionX: nextBadgeImagePositionX,

      badgeImagePositionY: nextBadgeImagePositionY,

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
      newFileKey = await uploadChallengeCover(challenge.id, coverImage);

      const updatedChallenge = await db.orm.public.Challenge.where({
        id: challenge.id,
      }).update({
        coverImageKey: newFileKey,
      });

      if (!updatedChallenge) {
        throw new Error('대표사진을 수정할 Challenge를 찾을 수 없습니다.');
      }

      if (oldFileKey && oldFileKey !== newFileKey) {
        try {
          await deleteChallengeCover(oldFileKey);
        } catch {}
      }

      return {
        message: oldFileKey
          ? 'Challenge 대표사진이 교체되었습니다.'
          : 'Challenge 대표사진이 등록되었습니다.',

        challenge: await this.toChallengeResponse(updatedChallenge),
      };
    } catch {
      if (newFileKey) {
        try {
          await deleteChallengeCover(newFileKey);
        } catch {}
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

    if (!challenge.coverImageKey) {
      return {
        message: '등록된 Challenge 대표사진이 없습니다.',

        challenge: await this.toChallengeResponse(challenge),
      };
    }

    const oldFileKey = challenge.coverImageKey;

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

    try {
      await deleteChallengeCover(oldFileKey);
    } catch {}

    return {
      message: 'Challenge 대표사진이 삭제되었습니다.',

      challenge: await this.toChallengeResponse(updatedChallenge),
    };
  }

  /*
   * INSTITUTION:
   * 완료 배지 중앙 이미지 등록 또는 교체
   *
   * 배지 이미지는 BadgeVersion에 포함되는
   * 역사적인 디자인 자료이므로
   * 과거 버전에서 사용 중인 이미지는
   * 새 이미지로 교체하더라도 Storage에서 삭제하지 않는다.
   *
   * ACTIVE 상태에서는 배지 구성을 변경할 수 없다.
   */
  async replaceBadgeCenterImage(
    challengeId: number,
    institutionId: number,
    badgeImage?: BadgeCenterImageUploadFile,
  ) {
    if (!badgeImage) {
      throw new BadRequestException('등록할 완료 배지 이미지를 선택해주세요.');
    }

    this.validateBadgeImage(badgeImage);

    const challenge = await this.findOwnedChallenge(challengeId, institutionId);

    if (challenge.status === 'ACTIVE') {
      throw new ConflictException(
        '운영 중인 Challenge의 완료 배지 이미지는 변경할 수 없습니다. 먼저 운영을 일시 중단해주세요.',
      );
    }

    if (challenge.status === 'ENDED' || challenge.status === 'ARCHIVED') {
      throw new ConflictException(
        '종료되거나 보관된 Challenge의 완료 배지는 수정할 수 없습니다.',
      );
    }

    const oldFileKey = challenge.badgeCenterImageKey;

    let newFileKey: string | null = null;

    try {
      newFileKey = await uploadBadgeCenterImage(challenge.id, badgeImage);

      const updatedChallenge = await db.orm.public.Challenge.where({
        id: challenge.id,
      }).update({
        badgeCenterImageKey: newFileKey,
      });

      if (!updatedChallenge) {
        throw new Error(
          '완료 배지 이미지를 저장할 Challenge를 찾을 수 없습니다.',
        );
      }

      /*
       * 기존 이미지가 있는 경우
       * 과거 BadgeVersion이 사용하고 있는지 검사한다.
       */
      if (oldFileKey && oldFileKey !== newFileKey) {
        const usedByVersion = await this.isBadgeImageUsedByVersion(oldFileKey);

        /*
         * 과거 버전이 사용하지 않는 이미지일 때만
         * Storage에서 실제 삭제한다.
         */
        if (!usedByVersion) {
          try {
            await deleteBadgeCenterImage(oldFileKey);
          } catch {}
        }
      }

      return {
        message: oldFileKey
          ? '완료 배지 이미지가 교체되었습니다.'
          : '완료 배지 이미지가 등록되었습니다.',

        challenge: await this.toChallengeResponse(updatedChallenge),
      };
    } catch (error) {
      /*
       * 새 이미지 업로드 이후 DB 반영에 실패한 경우
       * 새 파일은 어떤 BadgeVersion도 아직 사용하지 않으므로
       * 안전하게 삭제한다.
       */
      if (newFileKey) {
        try {
          await deleteBadgeCenterImage(newFileKey);
        } catch {}
      }

      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        '완료 배지 이미지를 저장하는 중 오류가 발생했습니다.',
      );
    }
  }

  /*
   * INSTITUTION:
   * 현재 Challenge의 완료 배지 중앙 이미지 연결 제거
   *
   * 과거 BadgeVersion이 해당 이미지를 사용 중이면
   * DB의 현재 Challenge 연결만 제거하고
   * Storage 파일 자체는 보존한다.
   */
  async removeBadgeCenterImage(challengeId: number, institutionId: number) {
    const challenge = await this.findOwnedChallenge(challengeId, institutionId);

    if (challenge.status === 'ACTIVE') {
      throw new ConflictException(
        '운영 중인 Challenge의 완료 배지 이미지는 삭제할 수 없습니다. 먼저 운영을 일시 중단해주세요.',
      );
    }

    if (challenge.status === 'ENDED' || challenge.status === 'ARCHIVED') {
      throw new ConflictException(
        '종료되거나 보관된 Challenge의 완료 배지는 수정할 수 없습니다.',
      );
    }

    if (!challenge.badgeCenterImageKey) {
      return {
        message: '등록된 완료 배지 이미지가 없습니다.',

        challenge: await this.toChallengeResponse(challenge),
      };
    }

    const oldFileKey = challenge.badgeCenterImageKey;

    const updatedChallenge = await db.orm.public.Challenge.where({
      id: challenge.id,
    }).update({
      badgeCenterImageKey: null,
    });

    if (!updatedChallenge) {
      throw new NotFoundException(
        '완료 배지 이미지를 삭제할 Challenge를 찾을 수 없습니다.',
      );
    }

    const usedByVersion = await this.isBadgeImageUsedByVersion(oldFileKey);

    if (!usedByVersion) {
      try {
        await deleteBadgeCenterImage(oldFileKey);
      } catch {}
    }

    return {
      message: usedByVersion
        ? '현재 완료 배지 이미지 연결이 제거되었습니다. 과거 배지 버전에서 사용 중인 원본 이미지는 보존됩니다.'
        : '완료 배지 이미지가 삭제되었습니다.',

      challenge: await this.toChallengeResponse(updatedChallenge),
    };
  }

  /*
   * PUBLIC:
   * 현재 실제 운영 중인 Challenge 목록
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

    const activeMissions = missions
      .filter((mission) => mission.status === 'ACTIVE')
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const publicMissions = await Promise.all(
      activeMissions.map(async (mission) => {
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
   * completedAt이 존재하면
   * 현재 Mission 구성이 달라졌더라도
   * Challenge 완료 상태는 영구 유지한다.
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

        completedAt: null,

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

    const currentMissionSetCompleted =
      totalMissionCount > 0 && completedMissionCount === totalMissionCount;

    const completed =
      participation.completedAt !== null || currentMissionSetCompleted;

    return {
      challengeId,

      joined: true,

      joinedAt: participation.joinedAt,

      completedAt: participation.completedAt,

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
   * BadgeVersion을 먼저 확정한 뒤
   * ACTIVE로 변경한다.
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

    await this.ensureCurrentBadgeVersion(challengeId);

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
   * PAUSED 상태에서 변경된 Mission과
   * 배지 설정을 기준으로 새 BadgeVersion 필요 여부를
   * 판단한 뒤 ACTIVE로 변경한다.
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

    await this.ensureCurrentBadgeVersion(challengeId);

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

    const badgeCenterImageKey = challenge.badgeCenterImageKey;

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

    if (coverImageKey) {
      try {
        await deleteChallengeCover(coverImageKey);
      } catch {}
    }

    /*
     * DRAFT Challenge는 아직 BadgeVersion이
     * 생성되지 않은 상태이므로
     * 배지 중앙 이미지도 안전하게 정리한다.
     */
    if (badgeCenterImageKey) {
      try {
        await deleteBadgeCenterImage(badgeCenterImageKey);
      } catch {}
    }

    return {
      message: 'Challenge가 삭제되었습니다.',

      deletedChallengeId: challengeId,
    };
  }
}
