import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';

import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import {
  MAX_MISSION_PHOTO_FILE_SIZE,
  type MissionPhotoUploadFile,
} from '../storage/supabase-storage';

import { CreateMissionDto } from './dto/create-mission.dto';
import { UpdateMissionDto } from './dto/update-mission.dto';
import { MissionsService } from './missions.service';

@Controller()
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  /*
   * INSTITUTION:
   * 본인 기관 Challenge에 Mission 생성
   *
   * multipart/form-data 지원
   *
   * 일반 Mission 정보:
   * title
   * description
   * address
   * latitude
   * longitude
   * verificationRadius
   * verificationMode
   * qrLocationNote
   * sortOrder
   *
   * 선택 파일:
   * photoImage
   *
   * 대표사진이 없으면
   * 기존 Mission 생성 흐름과 동일하게 동작한다.
   *
   * 대표사진이 있으면:
   *
   * Mission 생성
   * → 기존 대표사진 등록 로직 실행
   * → 실패 시 방금 생성한 Mission 정리
   *
   * 기존 QR 생성 / 암호화 / 응답 구조는 유지한다.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Post('challenges/:challengeId/missions')
  @UseInterceptors(
    FileInterceptor('photoImage', {
      limits: {
        fileSize: MAX_MISSION_PHOTO_FILE_SIZE,
      },
    }),
  )
  async create(
    @Param('challengeId', ParseIntPipe)
    challengeId: number,

    @Req()
    request: AuthenticatedRequest,

    @Body()
    dto: CreateMissionDto,

    @UploadedFile()
    photoImage?: MissionPhotoUploadFile,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관에 연결된 계정만 Mission을 생성할 수 있습니다.',
      );
    }

    /*
     * 기존 Mission 생성 로직을 그대로 사용한다.
     *
     * 여기에서 기존 QR 생성 / 암호화 / DB 저장이 모두 수행된다.
     */
    const createResult = await this.missionsService.create(
      challengeId,
      institutionId,
      dto,
    );

    /*
     * 대표사진을 선택하지 않았다면
     * 기존 Mission 생성 응답을 그대로 반환한다.
     */
    if (!photoImage) {
      return createResult;
    }

    try {
      /*
       * 이미 구현된 대표사진 등록 로직을 재사용한다.
       *
       * 내부에서:
       * - 파일 MIME 검사
       * - 파일 크기 검사
       * - 파일 시그니처 검사
       * - Supabase Storage 업로드
       * - photoImageKey DB 저장
       * - 실패 시 Storage cleanup
       *
       * 을 처리한다.
       */
      const photoResult = await this.missionsService.replacePhoto(
        createResult.mission.id,
        institutionId,
        photoImage,
      );

      /*
       * 기존 create 응답의 qrToken / qrPath 구조를 그대로 유지하면서
       * 사진 등록 결과만 Mission 응답에 반영한다.
       */
      return {
        ...createResult,

        mission: {
          ...createResult.mission,

          hasPhotoImage: photoResult.mission.hasPhotoImage,

          photoImageUrl: photoResult.mission.photoImageUrl,

          updatedAt: photoResult.mission.updatedAt,
        },
      };
    } catch (error) {
      /*
       * Mission 생성 직후 사진 등록이 실패하면
       * 사진 없는 Mission이 DB에 남지 않도록
       * 방금 생성한 Mission을 정리한다.
       *
       * 새 Mission이므로 아직 MissionCompletion이 없기 때문에
       * 기존 remove() 정책으로 정상 삭제할 수 있다.
       */
      try {
        await this.missionsService.remove(
          createResult.mission.id,
          institutionId,
        );
      } catch {
        /*
         * cleanup 실패가
         * 실제 사진 등록 오류를 덮어쓰지 않게 한다.
         */
      }

      throw error;
    }
  }

  /*
   * INSTITUTION:
   * 본인 기관 Mission 수정
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Patch('missions/:missionId')
  update(
    @Param('missionId', ParseIntPipe)
    missionId: number,

    @Req()
    request: AuthenticatedRequest,

    @Body()
    dto: UpdateMissionDto,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관에 연결된 계정만 Mission을 수정할 수 있습니다.',
      );
    }

    return this.missionsService.update(missionId, institutionId, dto);
  }

  /*
   * INSTITUTION:
   * 본인 기관 Mission 대표사진 조회
   *
   * 조회 자체는 Challenge가
   * ACTIVE / ENDED / ARCHIVED 상태여도 가능하다.
   *
   * 변경만 DRAFT / PAUSED에서 제한한다.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Get('missions/:missionId/photo')
  getPhoto(
    @Param('missionId', ParseIntPipe)
    missionId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관에 연결된 계정만 Mission 대표사진을 확인할 수 있습니다.',
      );
    }

    return this.missionsService.getPhoto(missionId, institutionId);
  }

  /*
   * INSTITUTION:
   * Mission 관광지 대표사진 등록 / 교체
   *
   * multipart/form-data
   *
   * field:
   * photoImage
   *
   * 최대:
   * 10MB
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Post('missions/:missionId/photo')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('photoImage', {
      limits: {
        fileSize: MAX_MISSION_PHOTO_FILE_SIZE,
      },
    }),
  )
  replacePhoto(
    @Param('missionId', ParseIntPipe)
    missionId: number,

    @Req()
    request: AuthenticatedRequest,

    @UploadedFile()
    photoImage?: MissionPhotoUploadFile,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관에 연결된 계정만 Mission 대표사진을 변경할 수 있습니다.',
      );
    }

    return this.missionsService.replacePhoto(
      missionId,
      institutionId,
      photoImage,
    );
  }

  /*
   * INSTITUTION:
   * Mission 관광지 대표사진 삭제
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Delete('missions/:missionId/photo')
  removePhoto(
    @Param('missionId', ParseIntPipe)
    missionId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관에 연결된 계정만 Mission 대표사진을 삭제할 수 있습니다.',
      );
    }

    return this.missionsService.removePhoto(missionId, institutionId);
  }

  /*
   * INSTITUTION:
   * 완료 기록이 없는 Mission 물리 삭제
   *
   * DRAFT / PAUSED Challenge에서만 가능
   * MissionCompletion이 하나라도 있으면 삭제할 수 없음
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Delete('missions/:missionId')
  remove(
    @Param('missionId', ParseIntPipe)
    missionId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관에 연결된 계정만 Mission을 삭제할 수 있습니다.',
      );
    }

    return this.missionsService.remove(missionId, institutionId);
  }

  /*
   * INSTITUTION:
   * Mission 자체를 비활성화
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Post('missions/:missionId/deactivate')
  @HttpCode(200)
  deactivate(
    @Param('missionId', ParseIntPipe)
    missionId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관에 연결된 계정만 Mission을 비활성화할 수 있습니다.',
      );
    }

    return this.missionsService.deactivate(missionId, institutionId);
  }

  /*
   * INSTITUTION:
   * 비활성화된 Mission을 다시 활성화
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Post('missions/:missionId/activate')
  @HttpCode(200)
  activate(
    @Param('missionId', ParseIntPipe)
    missionId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관에 연결된 계정만 Mission을 활성화할 수 있습니다.',
      );
    }

    return this.missionsService.activate(missionId, institutionId);
  }

  /*
   * INSTITUTION:
   * 본인 기관 Mission의 기존 QR 다시 보기
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Get('missions/:missionId/qr')
  getQrToken(
    @Param('missionId', ParseIntPipe)
    missionId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관에 연결된 계정만 QR을 확인할 수 있습니다.',
      );
    }

    return this.missionsService.getQrToken(missionId, institutionId);
  }

  /*
   * INSTITUTION:
   * 본인 기관 Mission의 QR 토큰 재발급
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Post('missions/:missionId/qr')
  issueQrToken(
    @Param('missionId', ParseIntPipe)
    missionId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관에 연결된 계정만 QR을 발급할 수 있습니다.',
      );
    }

    return this.missionsService.issueQrToken(missionId, institutionId);
  }

  /*
   * INSTITUTION:
   * Mission의 QR 기능 활성화
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Post('missions/:missionId/qr/activate')
  @HttpCode(200)
  activateQr(
    @Param('missionId', ParseIntPipe)
    missionId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관에 연결된 계정만 QR을 활성화할 수 있습니다.',
      );
    }

    return this.missionsService.activateQr(missionId, institutionId);
  }

  /*
   * INSTITUTION:
   * Mission의 QR 기능 비활성화
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Post('missions/:missionId/qr/deactivate')
  @HttpCode(200)
  deactivateQr(
    @Param('missionId', ParseIntPipe)
    missionId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관에 연결된 계정만 QR을 비활성화할 수 있습니다.',
      );
    }

    return this.missionsService.deactivateQr(missionId, institutionId);
  }
}
