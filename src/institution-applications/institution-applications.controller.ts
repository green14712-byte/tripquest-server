import {
  Body,
  Controller,
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

import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

import { CreateInstitutionApplicationDto } from './dto/create-institution-application.dto';
import { RejectInstitutionApplicationDto } from './dto/reject-institution-application.dto';
import { InstitutionApplicationsService } from './institution-applications.service';

type UploadedProofFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('institution-applications')
export class InstitutionApplicationsController {
  constructor(
    private readonly institutionApplicationsService: InstitutionApplicationsService,
  ) {}

  /*
   * USER: 기관 가입 신청
   *
   * 첫 번째 증빙자료는 필수
   *
   * proofOriginalName은
   * CreateInstitutionApplicationDto 안에서 함께 전달받는다.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @Post()
  @UseInterceptors(
    FileInterceptor('proofFile', {
      limits: {
        fileSize: 50 * 1024 * 1024,
        files: 1,
      },
    }),
  )
  create(
    @Req()
    request: AuthenticatedRequest,

    @Body()
    dto: CreateInstitutionApplicationDto,

    @UploadedFile()
    proofFile: UploadedProofFile | undefined,
  ) {
    return this.institutionApplicationsService.create(
      request.user.id,
      dto,
      proofFile,
    );
  }

  /*
   * USER: 기존 PENDING 기관 신청에
   * 증빙자료 한 개 추가
   *
   * 브라우저에서 전달한 정상 파일명인
   * proofOriginalName도 함께 Service로 넘긴다.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @Post(':id/proofs')
  @UseInterceptors(
    FileInterceptor('proofFile', {
      limits: {
        fileSize: 50 * 1024 * 1024,
        files: 1,
      },
    }),
  )
  addProof(
    @Req()
    request: AuthenticatedRequest,

    @Param('id', ParseIntPipe)
    applicationId: number,

    @UploadedFile()
    proofFile: UploadedProofFile | undefined,

    @Body('proofOriginalName')
    proofOriginalName?: string,
  ) {
    return this.institutionApplicationsService.addProof(
      request.user.id,
      applicationId,
      proofFile,
      proofOriginalName,
    );
  }

  /*
   * USER / INSTITUTION:
   * 본인의 기관 가입 신청 조회
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'INSTITUTION')
  @Get('me')
  findMine(
    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.institutionApplicationsService.findMyApplications(
      request.user.id,
    );
  }

  /*
   * ADMIN:
   * 승인 대기 중인 기관 가입 신청
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/pending')
  findPendingApplications() {
    return this.institutionApplicationsService.findPendingApplications();
  }

  /*
   * ADMIN:
   * 전체 기관 가입 신청
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/all')
  findAllApplications() {
    return this.institutionApplicationsService.findAllApplications();
  }

  /*
   * ADMIN:
   * 새로운 다중 증빙자료 Signed URL 발급
   *
   * 특정 신청에 속한 특정 proof만 열 수 있다.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/:id/proofs/:proofId/url')
  createProofSignedUrl(
    @Param('id', ParseIntPipe)
    applicationId: number,

    @Param('proofId', ParseIntPipe)
    proofId: number,
  ) {
    return this.institutionApplicationsService.createProofSignedUrl(
      applicationId,
      proofId,
    );
  }

  /*
   * ADMIN:
   * 기존 단일 proofFileKey 방식 호환용
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/:id/proof-url')
  createLegacyProofSignedUrl(
    @Param('id', ParseIntPipe)
    applicationId: number,
  ) {
    return this.institutionApplicationsService.createLegacyProofSignedUrl(
      applicationId,
    );
  }

  /*
   * ADMIN:
   * 특정 기관 가입 신청 상세 조회
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/:id')
  findApplicationById(
    @Param('id', ParseIntPipe)
    applicationId: number,
  ) {
    return this.institutionApplicationsService.findApplicationById(
      applicationId,
    );
  }

  /*
   * ADMIN:
   * 기관 가입 신청 승인
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post(':id/approve')
  approve(
    @Param('id', ParseIntPipe)
    applicationId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.institutionApplicationsService.approve(
      applicationId,
      request.user.id,
    );
  }

  /*
   * ADMIN:
   * 기관 가입 신청 거절
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post(':id/reject')
  reject(
    @Param('id', ParseIntPipe)
    applicationId: number,

    @Req()
    request: AuthenticatedRequest,

    @Body()
    dto: RejectInstitutionApplicationDto,
  ) {
    return this.institutionApplicationsService.reject(
      applicationId,
      request.user.id,
      dto.reason,
    );
  }
}
