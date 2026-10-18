import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { createHash, randomBytes } from 'crypto';

import { db } from '../prisma/db';

import {
  createMissionPhotoSignedUrl,
  deleteMissionPhoto,
  type MissionPhotoUploadFile,
  uploadMissionPhoto,
  validateMissionPhotoFile,
} from '../storage/supabase-storage';

import { CreateMissionDto } from './dto/create-mission.dto';
import { UpdateMissionDto } from './dto/update-mission.dto';

import { decryptQrToken, encryptQrToken } from './mission-qr-crypto';

@Injectable()
export class MissionsService {
  private createQrToken() {
    const qrToken = randomBytes(32).toString('hex');

    const qrTokenHash = createHash('sha256').update(qrToken).digest('hex');

    return {
      qrToken,
      qrTokenHash,
    };
  }

  /*
   * Mission 구성을 변경할 수 있는
   * Challenge 상태인지 확인한다.
   *
   * DRAFT / PAUSED만 허용한다.
   */
  private ensureMissionManagementAllowed(status: string) {
    if (status === 'DRAFT' || status === 'PAUSED') {
      return;
    }

    if (status === 'ACTIVE') {
      throw new ConflictException(
        '운영 중인 Challenge에서는 Mission을 변경할 수 없습니다. 먼저 Challenge 운영을 중단해주세요.',
      );
    }

    throw new ConflictException(
      '최종 종료되거나 보관된 Challenge에서는 Mission을 변경할 수 없습니다.',
    );
  }

  /*
   * Mission이 실제 요청 기관의
   * Challenge에 속하는지 확인한다.
   */
  private async getOwnedMission(missionId: number, institutionId: number) {
    const mission = await db.orm.public.Mission.first({
      id: missionId,
    });

    if (!mission) {
      throw new NotFoundException('Mission을 찾을 수 없습니다.');
    }

    const challenge = await db.orm.public.Challenge.first({
      id: mission.challengeId,
    });

    if (!challenge) {
      throw new NotFoundException(
        'Mission에 연결된 Challenge를 찾을 수 없습니다.',
      );
    }

    if (challenge.institutionId !== institutionId) {
      throw new ForbiddenException('본인 기관의 Mission만 관리할 수 있습니다.');
    }

    return {
      mission,
      challenge,
    };
  }

  /*
   * QR 사용 Mission인지 확인한다.
   */
  private ensureQrAvailable(mission: {
    verificationMode: string;
    qrTokenHash: string | null;
  }) {
    if (mission.verificationMode === 'LOCATION_ONLY') {
      throw new BadRequestException(
        '위치 인증 전용 Mission에는 QR이 없습니다.',
      );
    }

    if (!mission.qrTokenHash) {
      throw new ConflictException('아직 QR이 발급되지 않은 Mission입니다.');
    }
  }

  /*
   * Mission 생성
   *
   * Mission 기본정보와 QR 생성은
   * 기존 JSON 흐름을 유지한다.
   *
   * 대표사진은 생성 후
   * /missions/:missionId/photo API로 등록한다.
   *
   * 관광지 대표사진 초점은
   * photoPositionX / photoPositionY에 저장한다.
   *
   * 값이 없으면 중앙인 50 / 50을 사용한다.
   */
  async create(
    challengeId: number,
    institutionId: number,
    dto: CreateMissionDto,
  ) {
    const challenge = await db.orm.public.Challenge.first({
      id: challengeId,
    });

    if (!challenge) {
      throw new NotFoundException('Challenge를 찾을 수 없습니다.');
    }

    if (challenge.institutionId !== institutionId) {
      throw new ForbiddenException(
        '본인 기관의 Challenge에만 Mission을 생성할 수 있습니다.',
      );
    }

    this.ensureMissionManagementAllowed(challenge.status);

    const verificationMode = dto.verificationMode ?? 'LOCATION_AND_QR';

    const requiresQr =
      verificationMode === 'LOCATION_AND_QR' ||
      verificationMode === 'LOCATION_OR_QR';

    let qrToken: string | null = null;

    let qrTokenHash: string | null = null;

    let qrTokenEncrypted: string | null = null;

    if (requiresQr) {
      const generatedQr = this.createQrToken();

      qrToken = generatedQr.qrToken;

      qrTokenHash = generatedQr.qrTokenHash;

      qrTokenEncrypted = encryptQrToken(qrToken);
    }

    const mission = await db.orm.public.Mission.create({
      title: dto.title.trim(),

      description: dto.description?.trim() || null,

      address: dto.address?.trim() || null,

      photoImageKey: null,

      photoPositionX: dto.photoPositionX ?? 50,

      photoPositionY: dto.photoPositionY ?? 50,

      status: 'ACTIVE',

      latitude: dto.latitude,

      longitude: dto.longitude,

      verificationRadius: dto.verificationRadius ?? 100,

      verificationMode,

      qrLocationNote: requiresQr ? dto.qrLocationNote?.trim() || null : null,

      qrTokenHash,

      qrTokenEncrypted,

      qrActive: requiresQr,

      sortOrder: dto.sortOrder ?? 0,

      challengeId,
    });

    return {
      message: 'Mission이 생성되었습니다.',

      mission: {
        id: mission.id,

        title: mission.title,

        description: mission.description,

        address: mission.address,

        status: mission.status,

        latitude: mission.latitude,

        longitude: mission.longitude,

        verificationRadius: mission.verificationRadius,

        verificationMode: mission.verificationMode,

        qrLocationNote: mission.qrLocationNote,

        qrActive: mission.qrActive,

        qrAvailable: mission.qrTokenHash !== null,

        qrRetrievable: mission.qrTokenEncrypted !== null,

        hasPhotoImage: mission.photoImageKey !== null,

        photoImageUrl: null,

        photoPositionX: mission.photoPositionX,

        photoPositionY: mission.photoPositionY,

        sortOrder: mission.sortOrder,

        challengeId: mission.challengeId,

        createdAt: mission.createdAt,

        updatedAt: mission.updatedAt,
      },

      qrToken,

      qrPath: qrToken !== null ? `/checkin/${qrToken}` : null,
    };
  }

  /*
   * Mission 기본정보 수정
   *
   * 관광지 대표사진 초점 위치도
   * 이 API를 통해 수정한다.
   *
   * 사진 파일 자체의 업로드 / 교체 / 삭제는
   * 기존 photo API를 그대로 사용한다.
   */
  async update(
    missionId: number,
    institutionId: number,
    dto: UpdateMissionDto,
  ) {
    const { mission, challenge } = await this.getOwnedMission(
      missionId,
      institutionId,
    );

    this.ensureMissionManagementAllowed(challenge.status);

    const hasTitle = dto.title !== undefined;

    const hasDescription = dto.description !== undefined;

    const hasAddress = dto.address !== undefined;

    const hasPhotoPositionX = dto.photoPositionX !== undefined;

    const hasPhotoPositionY = dto.photoPositionY !== undefined;

    const hasLatitude = dto.latitude !== undefined;

    const hasLongitude = dto.longitude !== undefined;

    const hasVerificationRadius = dto.verificationRadius !== undefined;

    const hasVerificationMode = dto.verificationMode !== undefined;

    const hasQrLocationNote = dto.qrLocationNote !== undefined;

    const hasSortOrder = dto.sortOrder !== undefined;

    if (
      !hasTitle &&
      !hasDescription &&
      !hasAddress &&
      !hasPhotoPositionX &&
      !hasPhotoPositionY &&
      !hasLatitude &&
      !hasLongitude &&
      !hasVerificationRadius &&
      !hasVerificationMode &&
      !hasQrLocationNote &&
      !hasSortOrder
    ) {
      throw new BadRequestException(
        '수정할 Mission 정보를 하나 이상 입력해주세요.',
      );
    }

    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException('위도와 경도는 함께 입력해주세요.');
    }

    const nextTitle =
      dto.title !== undefined ? dto.title.trim() : mission.title;

    if (!nextTitle) {
      throw new BadRequestException('Mission 제목을 입력해주세요.');
    }

    const nextDescription =
      dto.description !== undefined
        ? dto.description.trim() || null
        : mission.description;

    const nextAddress =
      dto.address !== undefined ? dto.address.trim() || null : mission.address;

    const nextPhotoPositionX =
      dto.photoPositionX !== undefined
        ? dto.photoPositionX
        : mission.photoPositionX;

    const nextPhotoPositionY =
      dto.photoPositionY !== undefined
        ? dto.photoPositionY
        : mission.photoPositionY;

    const nextLatitude =
      dto.latitude !== undefined ? dto.latitude : mission.latitude;

    const nextLongitude =
      dto.longitude !== undefined ? dto.longitude : mission.longitude;

    const nextVerificationRadius =
      dto.verificationRadius !== undefined
        ? dto.verificationRadius
        : mission.verificationRadius;

    const nextVerificationMode =
      dto.verificationMode ?? mission.verificationMode;

    const nextSortOrder =
      dto.sortOrder !== undefined ? dto.sortOrder : mission.sortOrder;

    const oldRequiresQr =
      mission.verificationMode === 'LOCATION_AND_QR' ||
      mission.verificationMode === 'LOCATION_OR_QR';

    const nextRequiresQr =
      nextVerificationMode === 'LOCATION_AND_QR' ||
      nextVerificationMode === 'LOCATION_OR_QR';

    let nextQrLocationNote: string | null;

    if (nextRequiresQr) {
      nextQrLocationNote =
        dto.qrLocationNote !== undefined
          ? dto.qrLocationNote.trim() || null
          : mission.qrLocationNote;

      if (!nextQrLocationNote) {
        throw new BadRequestException(
          'QR을 사용하는 Mission은 QR 설치 위치를 입력해주세요.',
        );
      }
    } else {
      nextQrLocationNote = null;
    }

    let nextQrTokenHash = mission.qrTokenHash;

    let nextQrTokenEncrypted = mission.qrTokenEncrypted;

    let nextQrActive = mission.qrActive;

    let issuedQrToken: string | null = null;

    /*
     * LOCATION_ONLY -> QR 사용 방식
     */
    if (!oldRequiresQr && nextRequiresQr) {
      const { qrToken, qrTokenHash } = this.createQrToken();

      issuedQrToken = qrToken;

      nextQrTokenHash = qrTokenHash;

      nextQrTokenEncrypted = encryptQrToken(qrToken);

      nextQrActive = true;
    }

    /*
     * QR 사용 방식 -> LOCATION_ONLY
     *
     * 기존 QR은 완전히 무효화한다.
     */
    if (oldRequiresQr && !nextRequiresQr) {
      nextQrTokenHash = null;

      nextQrTokenEncrypted = null;

      nextQrActive = false;
    }

    const updatedMission = await db.orm.public.Mission.where({
      id: mission.id,
    }).update({
      title: nextTitle,

      description: nextDescription,

      address: nextAddress,

      photoPositionX: nextPhotoPositionX,

      photoPositionY: nextPhotoPositionY,

      latitude: nextLatitude,

      longitude: nextLongitude,

      verificationRadius: nextVerificationRadius,

      verificationMode: nextVerificationMode,

      qrLocationNote: nextQrLocationNote,

      qrTokenHash: nextQrTokenHash,

      qrTokenEncrypted: nextQrTokenEncrypted,

      qrActive: nextQrActive,

      sortOrder: nextSortOrder,
    });

    if (!updatedMission) {
      throw new NotFoundException('수정할 Mission을 찾을 수 없습니다.');
    }

    return {
      message: 'Mission이 수정되었습니다.',

      mission: {
        id: updatedMission.id,

        title: updatedMission.title,

        description: updatedMission.description,

        address: updatedMission.address,

        status: updatedMission.status,

        latitude: updatedMission.latitude,

        longitude: updatedMission.longitude,

        verificationRadius: updatedMission.verificationRadius,

        verificationMode: updatedMission.verificationMode,

        qrLocationNote: updatedMission.qrLocationNote,

        qrActive: updatedMission.qrActive,

        qrAvailable: updatedMission.qrTokenHash !== null,

        qrRetrievable: updatedMission.qrTokenEncrypted !== null,

        hasPhotoImage: updatedMission.photoImageKey !== null,

        photoPositionX: updatedMission.photoPositionX,

        photoPositionY: updatedMission.photoPositionY,

        sortOrder: updatedMission.sortOrder,

        challengeId: updatedMission.challengeId,

        createdAt: updatedMission.createdAt,

        updatedAt: updatedMission.updatedAt,
      },

      qrToken: issuedQrToken,

      qrPath: issuedQrToken !== null ? `/checkin/${issuedQrToken}` : null,
    };
  }

  /*
   * INSTITUTION:
   * Mission 관광지 대표사진 조회
   *
   * 조회는 Challenge 운영 상태와 관계없이 허용한다.
   * 단, 본인 기관 Mission이어야 한다.
   */
  async getPhoto(missionId: number, institutionId: number) {
    const { mission } = await this.getOwnedMission(missionId, institutionId);

    if (!mission.photoImageKey) {
      throw new NotFoundException('등록된 Mission 대표사진이 없습니다.');
    }

    try {
      const photoImageUrl = await createMissionPhotoSignedUrl(
        mission.photoImageKey,
      );

      return {
        message: 'Mission 대표사진을 불러왔습니다.',

        mission: {
          id: mission.id,

          title: mission.title,

          challengeId: mission.challengeId,

          hasPhotoImage: true,

          photoImageUrl,

          photoPositionX: mission.photoPositionX,

          photoPositionY: mission.photoPositionY,
        },
      };
    } catch {
      throw new InternalServerErrorException(
        'Mission 대표사진 URL을 생성할 수 없습니다.',
      );
    }
  }

  /*
   * INSTITUTION:
   * Mission 관광지 대표사진 등록 / 교체
   *
   * Mission 구성 변경 정책과 동일하게
   * DRAFT / PAUSED Challenge에서만 가능하다.
   *
   * 기존 사진 업로드 / 교체 기능은 그대로 유지한다.
   * 초점 위치는 update API를 통해 별도로 변경할 수 있다.
   */
  async replacePhoto(
    missionId: number,
    institutionId: number,
    file?: MissionPhotoUploadFile,
  ) {
    const { mission, challenge } = await this.getOwnedMission(
      missionId,
      institutionId,
    );

    this.ensureMissionManagementAllowed(challenge.status);

    if (!file) {
      throw new BadRequestException('등록할 Mission 대표사진을 선택해주세요.');
    }

    /*
     * Storage helper 내부에서도 다시 검증하지만,
     * 여기서는 사용자 입력 오류를
     * 400 Bad Request로 명확하게 반환하기 위해
     * 선검증한다.
     */
    try {
      validateMissionPhotoFile(file);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Mission 대표사진이 올바르지 않습니다.';

      throw new BadRequestException(message);
    }

    let newPhotoImageKey: string;

    try {
      newPhotoImageKey = await uploadMissionPhoto(mission.id, file);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '알 수 없는 오류';

      throw new InternalServerErrorException(
        `Mission 대표사진 업로드에 실패했습니다: ${message}`,
      );
    }

    let updatedMission;

    try {
      updatedMission = await db.orm.public.Mission.where({
        id: mission.id,
      }).update({
        photoImageKey: newPhotoImageKey,
      });

      if (!updatedMission) {
        throw new NotFoundException(
          '대표사진을 변경할 Mission을 찾을 수 없습니다.',
        );
      }
    } catch (error) {
      /*
       * 새 이미지는 Storage에 올라갔는데
       * DB 변경에 실패한 경우
       * 새 파일을 정리한다.
       */
      try {
        await deleteMissionPhoto(newPhotoImageKey);
      } catch {
        /*
         * cleanup 실패가
         * 원래 DB 오류를 덮어쓰지 않게 한다.
         */
      }

      throw error;
    }

    /*
     * DB가 새 파일을 가리키도록
     * 정상 변경된 뒤 기존 파일을 삭제한다.
     *
     * 기존 파일 삭제가 실패하더라도
     * 새 대표사진 등록 자체는 성공한 상태이므로
     * 사용자 요청 전체를 실패시키지 않는다.
     */
    if (mission.photoImageKey) {
      try {
        await deleteMissionPhoto(mission.photoImageKey);
      } catch {
        /*
         * orphan 파일 정리는
         * 추후 관리 작업으로 처리 가능하다.
         */
      }
    }

    let photoImageUrl: string | null = null;

    try {
      photoImageUrl = await createMissionPhotoSignedUrl(newPhotoImageKey);
    } catch {
      /*
       * 파일 저장과 DB 연결 자체는 성공했다.
       * Signed URL 생성 실패 때문에
       * 등록 요청 전체를 실패시키지는 않는다.
       */
    }

    return {
      message: mission.photoImageKey
        ? 'Mission 대표사진이 교체되었습니다.'
        : 'Mission 대표사진이 등록되었습니다.',

      mission: {
        id: updatedMission.id,

        title: updatedMission.title,

        challengeId: updatedMission.challengeId,

        hasPhotoImage: true,

        photoImageUrl,

        photoPositionX: updatedMission.photoPositionX,

        photoPositionY: updatedMission.photoPositionY,

        updatedAt: updatedMission.updatedAt,
      },
    };
  }

  /*
   * INSTITUTION:
   * Mission 관광지 대표사진 삭제
   *
   * DB의 photoImageKey를 먼저 제거하고
   * Storage 파일을 정리한다.
   */
  async removePhoto(missionId: number, institutionId: number) {
    const { mission, challenge } = await this.getOwnedMission(
      missionId,
      institutionId,
    );

    this.ensureMissionManagementAllowed(challenge.status);

    if (!mission.photoImageKey) {
      throw new NotFoundException('삭제할 Mission 대표사진이 없습니다.');
    }

    const oldPhotoImageKey = mission.photoImageKey;

    const updatedMission = await db.orm.public.Mission.where({
      id: mission.id,
    }).update({
      photoImageKey: null,
    });

    if (!updatedMission) {
      throw new NotFoundException(
        '대표사진을 삭제할 Mission을 찾을 수 없습니다.',
      );
    }

    /*
     * DB에서는 이미 대표사진 연결을 제거했다.
     *
     * Storage 삭제가 실패하더라도
     * 사용자가 삭제한 사진이 다시 노출되지는 않는다.
     */
    try {
      await deleteMissionPhoto(oldPhotoImageKey);
    } catch {
      /*
       * Storage orphan 정리는
       * 별도 유지보수 대상으로 남길 수 있다.
       */
    }

    return {
      message: 'Mission 대표사진이 삭제되었습니다.',

      mission: {
        id: updatedMission.id,

        title: updatedMission.title,

        challengeId: updatedMission.challengeId,

        hasPhotoImage: false,

        photoImageUrl: null,

        photoPositionX: updatedMission.photoPositionX,

        photoPositionY: updatedMission.photoPositionY,

        updatedAt: updatedMission.updatedAt,
      },
    };
  }

  /*
   * Mission 물리 삭제
   *
   * 삭제 가능 조건:
   *
   * 1. 본인 기관 Mission
   * 2. Challenge가 DRAFT 또는 PAUSED
   * 3. 해당 Mission의 MissionCompletion이 0개
   *
   * 완료 기록이 하나라도 존재하면
   * Mission 자체를 삭제하지 않고
   * 비활성화 방식으로 관리해야 한다.
   */
  async remove(missionId: number, institutionId: number) {
    const { mission, challenge } = await this.getOwnedMission(
      missionId,
      institutionId,
    );

    this.ensureMissionManagementAllowed(challenge.status);

    const completion = await db.orm.public.MissionCompletion.first({
      missionId: mission.id,
    });

    if (completion) {
      throw new ConflictException(
        '이 Mission을 완료한 사용자가 있어 삭제할 수 없습니다. 기존 기록 보존을 위해 Mission 비활성화를 사용해주세요.',
      );
    }

    /*
     * DB 삭제 전에 Storage key를 보관한다.
     */
    const photoImageKey = mission.photoImageKey;

    await db.orm.public.Mission.where({
      id: mission.id,
    }).delete();

    /*
     * Mission DB 삭제가 성공한 뒤
     * 연결되어 있던 관광지 대표사진도 정리한다.
     */
    if (photoImageKey) {
      try {
        await deleteMissionPhoto(photoImageKey);
      } catch {
        /*
         * DB 삭제는 이미 성공했으므로
         * Storage 정리 실패 때문에
         * 사용자 요청을 실패시키지는 않는다.
         */
      }
    }

    return {
      message: 'Mission이 삭제되었습니다.',

      deletedMissionId: mission.id,

      challengeId: mission.challengeId,
    };
  }

  /*
   * Mission 자체 비활성화
   *
   * MissionCompletion과 QR 정보는 보존한다.
   * 관광지 대표사진도 그대로 보존한다.
   */
  async deactivate(missionId: number, institutionId: number) {
    const { mission, challenge } = await this.getOwnedMission(
      missionId,
      institutionId,
    );

    this.ensureMissionManagementAllowed(challenge.status);

    if (mission.status === 'INACTIVE') {
      throw new ConflictException('이미 비활성화된 Mission입니다.');
    }

    const updatedMission = await db.orm.public.Mission.where({
      id: mission.id,
    }).update({
      status: 'INACTIVE',
    });

    if (!updatedMission) {
      throw new NotFoundException('비활성화할 Mission을 찾을 수 없습니다.');
    }

    return {
      message:
        'Mission이 비활성화되었습니다. 기존 완료 기록은 그대로 보존됩니다.',

      mission: {
        id: updatedMission.id,

        title: updatedMission.title,

        status: updatedMission.status,

        challengeId: updatedMission.challengeId,

        qrActive: updatedMission.qrActive,

        hasPhotoImage: updatedMission.photoImageKey !== null,

        photoPositionX: updatedMission.photoPositionX,

        photoPositionY: updatedMission.photoPositionY,

        updatedAt: updatedMission.updatedAt,
      },
    };
  }

  /*
   * Mission 다시 활성화
   */
  async activate(missionId: number, institutionId: number) {
    const { mission, challenge } = await this.getOwnedMission(
      missionId,
      institutionId,
    );

    this.ensureMissionManagementAllowed(challenge.status);

    if (mission.status === 'ACTIVE') {
      throw new ConflictException('이미 활성화된 Mission입니다.');
    }

    const updatedMission = await db.orm.public.Mission.where({
      id: mission.id,
    }).update({
      status: 'ACTIVE',
    });

    if (!updatedMission) {
      throw new NotFoundException('활성화할 Mission을 찾을 수 없습니다.');
    }

    return {
      message: 'Mission이 다시 활성화되었습니다.',

      mission: {
        id: updatedMission.id,

        title: updatedMission.title,

        status: updatedMission.status,

        challengeId: updatedMission.challengeId,

        qrActive: updatedMission.qrActive,

        hasPhotoImage: updatedMission.photoImageKey !== null,

        photoPositionX: updatedMission.photoPositionX,

        photoPositionY: updatedMission.photoPositionY,

        updatedAt: updatedMission.updatedAt,
      },
    };
  }

  /*
   * INSTITUTION:
   * 기존 QR 다시 보기
   */
  async getQrToken(missionId: number, institutionId: number) {
    const { mission } = await this.getOwnedMission(missionId, institutionId);

    this.ensureQrAvailable(mission);

    if (!mission.qrTokenEncrypted) {
      throw new ConflictException(
        '기존 방식으로 생성된 QR은 다시 확인할 수 없습니다. Challenge 운영을 중단한 뒤 QR을 재발급해주세요.',
      );
    }

    let qrToken: string;

    try {
      qrToken = decryptQrToken(mission.qrTokenEncrypted);
    } catch {
      throw new InternalServerErrorException('QR 데이터를 불러올 수 없습니다.');
    }

    const decryptedTokenHash = createHash('sha256')
      .update(qrToken)
      .digest('hex');

    if (decryptedTokenHash !== mission.qrTokenHash) {
      throw new InternalServerErrorException(
        'QR 데이터의 무결성을 확인할 수 없습니다.',
      );
    }

    return {
      message: 'Mission QR을 불러왔습니다.',

      mission: {
        id: mission.id,

        title: mission.title,

        status: mission.status,

        challengeId: mission.challengeId,

        verificationMode: mission.verificationMode,

        qrLocationNote: mission.qrLocationNote,

        qrActive: mission.qrActive,

        qrAvailable: true,

        qrRetrievable: true,
      },

      qrToken,

      qrPath: `/checkin/${qrToken}`,
    };
  }

  /*
   * INSTITUTION:
   * QR 재발급
   */
  async issueQrToken(missionId: number, institutionId: number) {
    const { mission, challenge } = await this.getOwnedMission(
      missionId,
      institutionId,
    );

    this.ensureMissionManagementAllowed(challenge.status);

    if (mission.verificationMode === 'LOCATION_ONLY') {
      throw new BadRequestException(
        '위치 인증 전용 Mission에는 QR을 발급할 수 없습니다.',
      );
    }

    const { qrToken, qrTokenHash } = this.createQrToken();

    const qrTokenEncrypted = encryptQrToken(qrToken);

    const updatedMission = await db.orm.public.Mission.where({
      id: mission.id,
    }).update({
      qrTokenHash,

      qrTokenEncrypted,

      qrActive: true,
    });

    if (!updatedMission) {
      throw new NotFoundException('QR을 발급할 Mission을 찾을 수 없습니다.');
    }

    return {
      message: 'Mission QR이 재발급되었습니다.',

      mission: {
        id: updatedMission.id,

        title: updatedMission.title,

        status: updatedMission.status,

        challengeId: updatedMission.challengeId,

        verificationMode: updatedMission.verificationMode,

        qrLocationNote: updatedMission.qrLocationNote,

        qrActive: updatedMission.qrActive,

        qrAvailable: true,

        qrRetrievable: true,
      },

      qrToken,

      qrPath: `/checkin/${qrToken}`,
    };
  }

  /*
   * INSTITUTION:
   * QR 활성화
   */
  async activateQr(missionId: number, institutionId: number) {
    const { mission, challenge } = await this.getOwnedMission(
      missionId,
      institutionId,
    );

    this.ensureMissionManagementAllowed(challenge.status);

    this.ensureQrAvailable(mission);

    if (mission.qrActive) {
      throw new ConflictException('이미 활성화된 QR입니다.');
    }

    const updatedMission = await db.orm.public.Mission.where({
      id: mission.id,
    }).update({
      qrActive: true,
    });

    if (!updatedMission) {
      throw new NotFoundException('QR을 활성화할 Mission을 찾을 수 없습니다.');
    }

    return {
      message: 'Mission QR이 활성화되었습니다.',

      mission: {
        id: updatedMission.id,

        title: updatedMission.title,

        status: updatedMission.status,

        challengeId: updatedMission.challengeId,

        verificationMode: updatedMission.verificationMode,

        qrActive: updatedMission.qrActive,

        qrAvailable: updatedMission.qrTokenHash !== null,

        qrRetrievable: updatedMission.qrTokenEncrypted !== null,
      },
    };
  }

  /*
   * INSTITUTION:
   * QR 비활성화
   */
  async deactivateQr(missionId: number, institutionId: number) {
    const { mission, challenge } = await this.getOwnedMission(
      missionId,
      institutionId,
    );

    this.ensureMissionManagementAllowed(challenge.status);

    this.ensureQrAvailable(mission);

    if (!mission.qrActive) {
      throw new ConflictException('이미 비활성화된 QR입니다.');
    }

    const updatedMission = await db.orm.public.Mission.where({
      id: mission.id,
    }).update({
      qrActive: false,
    });

    if (!updatedMission) {
      throw new NotFoundException(
        'QR을 비활성화할 Mission을 찾을 수 없습니다.',
      );
    }

    return {
      message: 'Mission QR이 비활성화되었습니다.',

      mission: {
        id: updatedMission.id,

        title: updatedMission.title,

        status: updatedMission.status,

        challengeId: updatedMission.challengeId,

        verificationMode: updatedMission.verificationMode,

        qrActive: updatedMission.qrActive,

        qrAvailable: updatedMission.qrTokenHash !== null,

        qrRetrievable: updatedMission.qrTokenEncrypted !== null,
      },
    };
  }
}
