import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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
  MAX_MISSION_COMPLETION_PHOTO_FILE_SIZE,
  type MissionCompletionPhotoUploadFile,
} from '../storage/supabase-storage';

import { VerifyMissionDto } from './dto/verify-mission.dto';
import { MissionCompletionsService } from './mission-completions.service';

@Controller('mission-completions')
export class MissionCompletionsController {
  constructor(
    private readonly missionCompletionsService: MissionCompletionsService,
  ) {}

  /*
   * USER: Mission 인증
   *
   * Mission의 verificationMode에 따라
   * 위치 / QR / 위치+QR 인증을 수행한다.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @Post('verify')
  verify(
    @Req()
    request: AuthenticatedRequest,

    @Body()
    dto: VerifyMissionDto,
  ) {
    return this.missionCompletionsService.verify(request.user.id, dto);
  }

  /*
   * USER: 완료한 Mission의
   * 본인 완료사진 조회
   *
   * GET
   * /mission-completions/:missionId/photo
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @Get(':missionId/photo')
  getPhoto(
    @Req()
    request: AuthenticatedRequest,

    @Param('missionId', ParseIntPipe)
    missionId: number,
  ) {
    return this.missionCompletionsService.getPhoto(request.user.id, missionId);
  }

  /*
   * USER: 완료한 Mission에
   * 본인 완료사진 등록 또는 교체
   *
   * multipart/form-data
   *
   * field name:
   * photoImage
   *
   * POST
   * /mission-completions/:missionId/photo
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @Post(':missionId/photo')
  @UseInterceptors(
    FileInterceptor('photoImage', {
      limits: {
        fileSize: MAX_MISSION_COMPLETION_PHOTO_FILE_SIZE,
      },
    }),
  )
  replacePhoto(
    @Req()
    request: AuthenticatedRequest,

    @Param('missionId', ParseIntPipe)
    missionId: number,

    @UploadedFile()
    photoImage?: MissionCompletionPhotoUploadFile,
  ) {
    if (!photoImage) {
      throw new BadRequestException('완료사진 파일이 필요합니다.');
    }

    return this.missionCompletionsService.replacePhoto(
      request.user.id,
      missionId,
      photoImage,
    );
  }

  /*
   * USER: 본인의 Mission 완료사진 삭제
   *
   * MissionCompletion 자체는 삭제하지 않고
   * photoImageKey 연결만 제거한다.
   *
   * DELETE
   * /mission-completions/:missionId/photo
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @Delete(':missionId/photo')
  removePhoto(
    @Req()
    request: AuthenticatedRequest,

    @Param('missionId', ParseIntPipe)
    missionId: number,
  ) {
    return this.missionCompletionsService.removePhoto(
      request.user.id,
      missionId,
    );
  }
}
