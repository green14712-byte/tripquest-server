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
import { ChangePasswordDto } from './dto/change-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LinkGoogleDto } from './dto/link-google.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SendEmailCodeDto } from './dto/send-email-code.dto';
import { SendPasswordResetCodeDto } from './dto/send-password-reset-code.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { VerifyEmailCodeDto } from './dto/verify-email-code.dto';
import { VerifyPasswordResetCodeDto } from './dto/verify-password-reset-code.dto';
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
   * 이메일 / 비밀번호 로그인
   */
  @Post('login')
  login(
    @Body()
    dto: LoginDto,
  ) {
    return this.authService.login(dto.email, dto.password);
  }

  /*
   * Google 간편가입 / 로그인
   *
   * 프론트에서 Supabase Auth가 발급한
   * access token을 전달받는다.
   */
  @Post('google')
  googleLogin(
    @Body()
    dto: GoogleLoginDto,
  ) {
    return this.authService.googleLogin(dto.accessToken);
  }

  /*
   * 로그인된 기존 계정에 Google 계정 연결
   */
  @UseGuards(JwtAuthGuard)
  @Post('google/link')
  linkGoogleAccount(
    @Req()
    request: AuthenticatedRequest,

    @Body()
    dto: LinkGoogleDto,
  ) {
    return this.authService.linkGoogleAccount(request.user.id, dto.accessToken);
  }

  /*
   * 비밀번호 재설정 인증번호 발송
   */
  @Post('password-reset/send-code')
  sendPasswordResetCode(
    @Body()
    dto: SendPasswordResetCodeDto,
  ) {
    return this.authService.sendPasswordResetCode(dto.email);
  }

  /*
   * 비밀번호 재설정 인증번호 확인
   */
  @Post('password-reset/verify-code')
  verifyPasswordResetCode(
    @Body()
    dto: VerifyPasswordResetCodeDto,
  ) {
    return this.authService.verifyPasswordResetCode(dto.email, dto.code);
  }

  /*
   * 비밀번호 재설정
   */
  @Post('password-reset/reset')
  resetPassword(
    @Body()
    dto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(
      dto.email,
      dto.resetToken,
      dto.newPassword,
    );
  }

  /*
   * 현재 로그인 사용자
   *
   * JWT에 들어 있는 사용자 정보를 그대로 반환하지 않고
   * DB에서 현재 사용자 정보를 다시 조회한다.
   *
   * Google 계정 연결 여부는
   * googleSub 실제 값 대신 googleConnected boolean만 반환한다.
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(
    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.authService.getCurrentUser(request.user.id);
  }

  /*
   * 로그인 사용자 비밀번호 변경
   */
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(
    @Req()
    request: AuthenticatedRequest,

    @Body()
    dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      request.user.id,
      dto.currentPassword,
      dto.newPassword,
    );
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
