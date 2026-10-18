import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthService } from './auth.service';

import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedRequest } from './jwt-auth.guard';

import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';

import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SendEmailCodeDto } from './dto/send-email-code.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { VerifyEmailCodeDto } from './dto/verify-email-code.dto';
import { WithdrawAccountDto } from './dto/withdraw-account.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /*
   * 회원가입용 이메일 인증번호 발송
   */
  @Post('email/send-code')
  sendEmailCode(
    @Body()
    dto: SendEmailCodeDto,
  ) {
    return this.authService.sendEmailVerificationCode(dto.email);
  }

  /*
   * 이메일 인증번호 확인
   */
  @Post('email/verify-code')
  verifyEmailCode(
    @Body()
    dto: VerifyEmailCodeDto,
  ) {
    return this.authService.verifyEmailCode(dto.email, dto.code);
  }

  /*
   * 일반 사용자 회원가입
   */
  @Post('register')
  register(
    @Body()
    dto: RegisterDto,
  ) {
    return this.authService.register(
      dto.email,
      dto.verificationToken,
      dto.password,
      dto.nickname,
    );
  }

  /*
   * 로그인
   */
  @Post('login')
  login(
    @Body()
    dto: LoginDto,
  ) {
    return this.authService.login(dto.email, dto.password);
  }

  /*
   * 현재 로그인 사용자
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(
    @Req()
    request: AuthenticatedRequest,
  ) {
    return {
      user: request.user,
    };
  }

  /*
   * 회원 본인 탈퇴
   */
  @UseGuards(JwtAuthGuard)
  @Post('withdraw')
  withdraw(
    @Req()
    request: AuthenticatedRequest,

    @Body()
    dto: WithdrawAccountDto,
  ) {
    return this.authService.withdrawAccount(request.user.id, dto.password);
  }

  /*
   * ADMIN 권한 테스트
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin-test')
  adminTest() {
    return {
      message: 'ADMIN 권한 확인 성공',
    };
  }

  /*
   * ADMIN:
   * 회원 목록 및 검색
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/users')
  findUsersForAdmin(
    @Query()
    query: AdminUserQueryDto,
  ) {
    return this.authService.findUsersForAdmin(query);
  }

  /*
   * ADMIN:
   * 계정 정지
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/users/:id/suspend')
  suspendUser(
    @Req()
    request: AuthenticatedRequest,

    @Param('id', ParseIntPipe)
    userId: number,

    @Body()
    dto: SuspendUserDto,
  ) {
    return this.authService.suspendUserByAdmin(
      request.user.id,
      userId,
      dto.reason,
    );
  }

  /*
   * ADMIN:
   * 계정 정지 해제
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/users/:id/activate')
  activateUser(
    @Req()
    request: AuthenticatedRequest,

    @Param('id', ParseIntPipe)
    userId: number,
  ) {
    return this.authService.activateUserByAdmin(request.user.id, userId);
  }

  /*
   * ADMIN:
   * 일반 USER를 ADMIN으로 승격
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/users/:id/promote-admin')
  promoteUserToAdmin(
    @Req()
    request: AuthenticatedRequest,

    @Param('id', ParseIntPipe)
    userId: number,
  ) {
    return this.authService.promoteUserToAdminByAdmin(request.user.id, userId);
  }

  /*
   * ADMIN:
   * 사용자 계정 삭제
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/users/:id/delete')
  deleteUser(
    @Req()
    request: AuthenticatedRequest,

    @Param('id', ParseIntPipe)
    userId: number,
  ) {
    return this.authService.deleteUserByAdmin(request.user.id, userId);
  }
}
