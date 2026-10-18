import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
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
  MAX_CHALLENGE_COVER_FILE_SIZE,
  type ChallengeCoverUploadFile,
} from '../storage/supabase-storage';

import { ChallengesService } from './challenges.service';

import { CreateChallengeDto } from './dto/create-challenge.dto';
import { UpdateChallengeDto } from './dto/update-challenge.dto';

@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  // 누구나 현재 실제 운영 중인 Challenge 목록 조회
  @Get()
  findActive() {
    return this.challengesService.findActive();
  }

  // INSTITUTION: 본인 기관 Challenge 전체 조회
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Get('institution/me')
  findInstitutionChallenges(
    @Req()
    request: AuthenticatedRequest,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관과 연결된 계정만 Challenge를 관리할 수 있습니다.',
      );
    }

    return this.challengesService.findInstitutionChallenges(institutionId);
  }

  // INSTITUTION: 본인 기관의 특정 Challenge 상세 조회
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Get('institution/:id')
  findInstitutionChallengeById(
    @Param('id', ParseIntPipe)
    challengeId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관과 연결된 계정만 Challenge를 관리할 수 있습니다.',
      );
    }

    return this.challengesService.findInstitutionChallengeById(
      challengeId,
      institutionId,
    );
  }

  // USER: 특정 Challenge의 본인 진행률 조회
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @Get(':id/progress')
  findProgress(
    @Param('id', ParseIntPipe)
    challengeId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.challengesService.findProgress(request.user.id, challengeId);
  }

  // 누구나 현재 실제 운영 중인 Challenge 상세 조회
  @Get(':id')
  findActiveById(
    @Param('id', ParseIntPipe)
    challengeId: number,
  ) {
    return this.challengesService.findActiveById(challengeId);
  }

  /*
   * INSTITUTION:
   * Challenge 생성
   *
   * JSON 요청도 그대로 지원한다.
   *
   * 대표사진을 함께 등록하는 경우에는
   * multipart/form-data를 사용하고
   * 파일 필드명은 coverImage를 사용한다.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @UseInterceptors(
    FileInterceptor('coverImage', {
      limits: {
        fileSize: MAX_CHALLENGE_COVER_FILE_SIZE,
      },
    }),
  )
  @Post()
  create(
    @Req()
    request: AuthenticatedRequest,

    @Body()
    dto: CreateChallengeDto,

    @UploadedFile()
    coverImage?: ChallengeCoverUploadFile,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관과 연결된 계정만 Challenge를 생성할 수 있습니다.',
      );
    }

    return this.challengesService.create(institutionId, dto, coverImage);
  }

  // INSTITUTION: Challenge 기본 정보 수정
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe)
    challengeId: number,

    @Req()
    request: AuthenticatedRequest,

    @Body()
    dto: UpdateChallengeDto,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관과 연결된 계정만 Challenge를 수정할 수 있습니다.',
      );
    }

    return this.challengesService.update(challengeId, institutionId, dto);
  }

  /*
   * INSTITUTION:
   * Challenge 대표사진 등록 또는 교체
   *
   * multipart/form-data
   * coverImage = 이미지 파일
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @UseInterceptors(
    FileInterceptor('coverImage', {
      limits: {
        fileSize: MAX_CHALLENGE_COVER_FILE_SIZE,
      },
    }),
  )
  @Post(':id/cover')
  replaceCover(
    @Param('id', ParseIntPipe)
    challengeId: number,

    @Req()
    request: AuthenticatedRequest,

    @UploadedFile()
    coverImage?: ChallengeCoverUploadFile,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관과 연결된 계정만 Challenge 대표사진을 수정할 수 있습니다.',
      );
    }

    return this.challengesService.replaceCover(
      challengeId,
      institutionId,
      coverImage,
    );
  }

  /*
   * INSTITUTION:
   * Challenge 대표사진 삭제
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Delete(':id/cover')
  removeCover(
    @Param('id', ParseIntPipe)
    challengeId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관과 연결된 계정만 Challenge 대표사진을 삭제할 수 있습니다.',
      );
    }

    return this.challengesService.removeCover(challengeId, institutionId);
  }

  // INSTITUTION: 최초 운영 시작
  // DRAFT → ACTIVE
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Post(':id/activate')
  activate(
    @Param('id', ParseIntPipe)
    challengeId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관과 연결된 계정만 Challenge를 운영할 수 있습니다.',
      );
    }

    return this.challengesService.activate(challengeId, institutionId);
  }

  // INSTITUTION: 운영 일시 중단
  // ACTIVE → PAUSED
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Post(':id/pause')
  pause(
    @Param('id', ParseIntPipe)
    challengeId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관과 연결된 계정만 Challenge 운영을 중단할 수 있습니다.',
      );
    }

    return this.challengesService.pause(challengeId, institutionId);
  }

  // INSTITUTION: 운영 재개
  // PAUSED → ACTIVE
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Post(':id/resume')
  resume(
    @Param('id', ParseIntPipe)
    challengeId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관과 연결된 계정만 Challenge 운영을 재개할 수 있습니다.',
      );
    }

    return this.challengesService.resume(challengeId, institutionId);
  }

  // INSTITUTION: Challenge 최종 종료
  // ACTIVE 또는 PAUSED → ENDED
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Post(':id/end')
  end(
    @Param('id', ParseIntPipe)
    challengeId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관과 연결된 계정만 Challenge를 종료할 수 있습니다.',
      );
    }

    return this.challengesService.end(challengeId, institutionId);
  }

  // INSTITUTION: DRAFT Challenge 삭제
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTITUTION')
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe)
    challengeId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const institutionId = request.user.institutionId;

    if (institutionId === null) {
      throw new ForbiddenException(
        '기관과 연결된 계정만 Challenge를 삭제할 수 있습니다.',
      );
    }

    return this.challengesService.remove(challengeId, institutionId);
  }
}
