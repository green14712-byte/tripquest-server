import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import { createHash, randomBytes, randomInt } from 'crypto';

import * as bcrypt from 'bcryptjs';

import { db } from '../prisma/db';
import { MailService } from '../mail/mail.service';

type AdminUserQuery = {
  search?: string;

  role?: 'USER' | 'INSTITUTION' | 'ADMIN';

  status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
};

@Injectable()
export class AuthService {
  constructor(
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
  ) {}

  /*
   * 관리자 회원관리 화면에 반환할 사용자 정보
   *
   * passwordHash, googleSub 등의 민감한 값은
   * 반환하지 않는다.
   */
  private toAdminPublicUser(user: {
    id: number;
    email: string;
    nickname: string | null;
    emailVerified: boolean;
    role: 'USER' | 'INSTITUTION' | 'ADMIN';
    status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
    suspendedAt: string | null;
    suspensionReason: string | null;
    deletedAt: string | null;
    institutionId: number | null;
    createdAt: string;
    updatedAt: string;
  }) {
    return {
      id: user.id,

      email: user.email,

      nickname: user.nickname,

      emailVerified: user.emailVerified,

      role: user.role,

      status: user.status,

      institutionId: user.institutionId,

      suspendedAt: user.suspendedAt,

      suspensionReason: user.suspensionReason,

      deletedAt: user.deletedAt,

      createdAt: user.createdAt,

      updatedAt: user.updatedAt,
    };
  }

  /*
   * 회원가입용 이메일 인증번호 발송
   */
  async sendEmailVerificationCode(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await db.orm.public.User.first({
      email: normalizedEmail,
    });

    if (existingUser) {
      throw new ConflictException('이미 가입된 이메일입니다.');
    }

    const code = randomInt(100000, 1000000).toString();

    const codeHash = await bcrypt.hash(code, 10);

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.orm.public.EmailVerification.upsert({
      create: {
        email: normalizedEmail,

        codeHash,

        expiresAt,

        attemptCount: 0,

        verifiedAt: null,

        verificationTokenHash: null,

        verificationTokenExpiresAt: null,
      },

      update: {
        codeHash,

        expiresAt,

        attemptCount: 0,

        verifiedAt: null,

        verificationTokenHash: null,

        verificationTokenExpiresAt: null,
      },

      conflictOn: {
        email: normalizedEmail,
      },
    });

    await this.mailService.sendVerificationCode(normalizedEmail, code);

    return {
      message: '인증번호를 이메일로 전송했습니다.',
    };
  }

  /*
   * 이메일 인증번호 확인
   */
  async verifyEmailCode(email: string, code: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const verification = await db.orm.public.EmailVerification.first({
      email: normalizedEmail,
    });

    if (!verification) {
      throw new BadRequestException('인증번호를 먼저 요청해주세요.');
    }

    if (new Date(verification.expiresAt).getTime() < Date.now()) {
      throw new BadRequestException(
        '인증번호가 만료되었습니다. 새 인증번호를 요청해주세요.',
      );
    }

    if (verification.attemptCount >= 5) {
      throw new BadRequestException(
        '인증번호 입력 횟수를 초과했습니다. 새 인증번호를 요청해주세요.',
      );
    }

    const matches = await bcrypt.compare(code, verification.codeHash);

    if (!matches) {
      await db.orm.public.EmailVerification.where({
        id: verification.id,
      }).update({
        attemptCount: verification.attemptCount + 1,
      });

      throw new BadRequestException('인증번호가 올바르지 않습니다.');
    }

    const verificationToken = randomBytes(32).toString('hex');

    const verificationTokenHash = createHash('sha256')
      .update(verificationToken)
      .digest('hex');

    const verificationTokenExpiresAt = new Date(
      Date.now() + 15 * 60 * 1000,
    ).toISOString();

    await db.orm.public.EmailVerification.where({
      id: verification.id,
    }).update({
      verifiedAt: new Date().toISOString(),

      verificationTokenHash,

      verificationTokenExpiresAt,
    });

    return {
      message: '이메일 인증이 완료되었습니다.',

      verificationToken,
    };
  }

  /*
   * 회원가입
   */
  async register(
    email: string,
    verificationToken: string,
    password: string,
    nickname: string,
  ) {
    const normalizedEmail = email.trim().toLowerCase();

    const normalizedNickname = nickname.trim();

    if (normalizedNickname.length < 2) {
      throw new BadRequestException('닉네임은 최소 2자 이상이어야 합니다.');
    }

    const existingUser = await db.orm.public.User.first({
      email: normalizedEmail,
    });

    if (existingUser) {
      throw new ConflictException('이미 가입된 이메일입니다.');
    }

    const verification = await db.orm.public.EmailVerification.first({
      email: normalizedEmail,
    });

    if (!verification) {
      throw new BadRequestException('이메일 인증을 먼저 진행해주세요.');
    }

    if (
      !verification.verifiedAt ||
      !verification.verificationTokenHash ||
      !verification.verificationTokenExpiresAt
    ) {
      throw new BadRequestException('이메일 인증이 완료되지 않았습니다.');
    }

    if (
      new Date(verification.verificationTokenExpiresAt).getTime() < Date.now()
    ) {
      throw new BadRequestException(
        '이메일 인증 정보가 만료되었습니다. 다시 인증해주세요.',
      );
    }

    const submittedTokenHash = createHash('sha256')
      .update(verificationToken)
      .digest('hex');

    if (submittedTokenHash !== verification.verificationTokenHash) {
      throw new BadRequestException('유효하지 않은 이메일 인증 정보입니다.');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const emailVerifiedAt = verification.verifiedAt;

    const user = await db.transaction(async (tx) => {
      const createdUser = await tx.orm.public.User.create({
        email: normalizedEmail,

        nickname: normalizedNickname,

        passwordHash,

        googleSub: null,

        emailVerified: true,

        emailVerifiedAt,

        institutionId: null,
      });

      await tx.orm.public.EmailVerification.where({
        id: verification.id,
      }).delete();

      return createdUser;
    });

    return {
      message: '회원가입이 완료되었습니다.',

      user: {
        id: user.id,

        email: user.email,

        nickname: user.nickname,

        role: user.role,

        status: user.status,

        emailVerified: user.emailVerified,

        createdAt: user.createdAt,
      },
    };
  }

  /*
   * 로그인
   */
  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await db.orm.public.User.first({
      email: normalizedEmail,
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('정지된 계정입니다.');
    }

    if (user.status === 'DELETED') {
      throw new ForbiddenException('사용할 수 없는 계정입니다.');
    }

    if (!user.emailVerified) {
      throw new ForbiddenException('이메일 인증이 완료되지 않은 계정입니다.');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,

      role: user.role,

      institutionId: user.institutionId,
    });

    return {
      message: '로그인에 성공했습니다.',

      accessToken,

      user: {
        id: user.id,

        email: user.email,

        nickname: user.nickname,

        role: user.role,

        status: user.status,

        institutionId: user.institutionId,
      },
    };
  }

  /*
   * 회원 본인 탈퇴
   */
  async withdrawAccount(userId: number, password: string) {
    const user = await db.orm.public.User.first({
      id: userId,
    });

    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    if (user.role === 'ADMIN') {
      throw new ForbiddenException('관리자 계정은 직접 탈퇴할 수 없습니다.');
    }

    if (user.status === 'DELETED') {
      throw new ForbiddenException('이미 탈퇴 처리된 계정입니다.');
    }

    if (!user.passwordHash) {
      throw new BadRequestException('비밀번호 확인이 필요한 계정입니다.');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('비밀번호가 올바르지 않습니다.');
    }

    const deletedAt = new Date().toISOString();

    const anonymizedEmail = `deleted-${user.id}-${Date.now()}@deleted.local`;

    const pendingApplications =
      await db.orm.public.InstitutionApplication.where({
        applicantId: user.id,

        status: 'PENDING',
      }).all();

    await db.transaction(async (tx) => {
      for (const application of pendingApplications) {
        await tx.orm.public.InstitutionApplication.where({
          id: application.id,
        }).update({
          status: 'REJECTED',

          reviewerId: null,

          reviewedAt: deletedAt,

          rejectionReason: '회원탈퇴로 기관 가입 신청이 종료되었습니다.',
        });
      }

      const updatedUser = await tx.orm.public.User.where({
        id: user.id,
      }).update({
        email: anonymizedEmail,

        nickname: null,

        passwordHash: null,

        googleSub: null,

        emailVerified: false,

        emailVerifiedAt: null,

        status: 'DELETED',

        suspendedAt: null,

        suspensionReason: null,

        deletedAt,
      });

      if (!updatedUser) {
        throw new BadRequestException('회원탈퇴 처리에 실패했습니다.');
      }
    });

    return {
      message: '회원탈퇴가 완료되었습니다.',
    };
  }

  /*
   * ADMIN:
   * 사용자 전체 조회 및 검색
   */
  async findUsersForAdmin(query: AdminUserQuery) {
    const users = await db.orm.public.User.all();

    const normalizedSearch = query.search?.trim().toLowerCase();

    let filteredUsers = users;

    if (normalizedSearch) {
      filteredUsers = filteredUsers.filter(
        (user) =>
          user.email.toLowerCase().includes(normalizedSearch) ||
          (user.nickname ?? '').toLowerCase().includes(normalizedSearch),
      );
    }

    if (query.role) {
      filteredUsers = filteredUsers.filter((user) => user.role === query.role);
    }

    if (query.status) {
      filteredUsers = filteredUsers.filter(
        (user) => user.status === query.status,
      );
    }

    filteredUsers.sort((a, b) => b.id - a.id);

    return {
      total: filteredUsers.length,

      users: filteredUsers.map((user) => this.toAdminPublicUser(user)),
    };
  }

  /*
   * ADMIN:
   * 계정 정지
   */
  async suspendUserByAdmin(adminId: number, userId: number, reason: string) {
    if (adminId === userId) {
      throw new ForbiddenException(
        '현재 로그인한 관리자 본인 계정은 정지할 수 없습니다.',
      );
    }

    const user = await db.orm.public.User.first({
      id: userId,
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    if (user.status === 'DELETED') {
      throw new ConflictException('이미 삭제된 계정은 정지할 수 없습니다.');
    }

    if (user.status === 'SUSPENDED') {
      throw new ConflictException('이미 정지된 계정입니다.');
    }

    const normalizedReason = reason.trim();

    if (normalizedReason.length < 2) {
      throw new BadRequestException('정지 사유를 입력해주세요.');
    }

    const updatedUser = await db.orm.public.User.where({
      id: user.id,
    }).update({
      status: 'SUSPENDED',

      suspendedAt: new Date().toISOString(),

      suspensionReason: normalizedReason,
    });

    if (!updatedUser) {
      throw new NotFoundException('정지할 사용자를 찾을 수 없습니다.');
    }

    return {
      message: '계정을 정지했습니다.',

      user: this.toAdminPublicUser(updatedUser),
    };
  }

  /*
   * ADMIN:
   * 계정 정지 해제
   */
  async activateUserByAdmin(adminId: number, userId: number) {
    if (adminId === userId) {
      throw new ForbiddenException(
        '현재 로그인한 관리자 본인 계정의 상태는 변경할 수 없습니다.',
      );
    }

    const user = await db.orm.public.User.first({
      id: userId,
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    if (user.status === 'DELETED') {
      throw new ConflictException('삭제된 계정은 복구할 수 없습니다.');
    }

    if (user.status !== 'SUSPENDED') {
      throw new ConflictException('정지된 계정만 정지 해제할 수 있습니다.');
    }

    const updatedUser = await db.orm.public.User.where({
      id: user.id,
    }).update({
      status: 'ACTIVE',

      suspendedAt: null,

      suspensionReason: null,
    });

    if (!updatedUser) {
      throw new NotFoundException('정지 해제할 사용자를 찾을 수 없습니다.');
    }

    return {
      message: '계정 정지를 해제했습니다.',

      user: this.toAdminPublicUser(updatedUser),
    };
  }

  /*
   * ADMIN:
   * 일반 USER를 ADMIN으로 승격
   */
  async promoteUserToAdminByAdmin(adminId: number, userId: number) {
    if (adminId === userId) {
      throw new ForbiddenException(
        '현재 로그인한 관리자 본인 계정은 승격 대상이 될 수 없습니다.',
      );
    }

    const user = await db.orm.public.User.first({
      id: userId,
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    /*
     * 활성 상태에서만 관리자 승격 허용
     */
    if (user.status !== 'ACTIVE') {
      throw new ConflictException(
        '활성 상태의 계정만 관리자로 승격할 수 있습니다.',
      );
    }

    /*
     * 이미 관리자
     */
    if (user.role === 'ADMIN') {
      throw new ConflictException('이미 관리자 계정입니다.');
    }

    /*
     * 기관 계정은 관리자 승격 대상에서 제외
     */
    if (user.role === 'INSTITUTION' || user.institutionId !== null) {
      throw new ConflictException(
        '기관 계정은 바로 관리자로 승격할 수 없습니다.',
      );
    }

    /*
     * 현재는 일반 USER만 승격
     */
    if (user.role !== 'USER') {
      throw new ConflictException(
        '일반 사용자 계정만 관리자로 승격할 수 있습니다.',
      );
    }

    /*
     * 이메일 인증된 계정만 관리자 가능
     */
    if (!user.emailVerified) {
      throw new ConflictException(
        '이메일 인증이 완료된 계정만 관리자로 승격할 수 있습니다.',
      );
    }

    /*
     * 처리 중인 기관 가입 신청이 있다면
     * 관리자 승격 전에 먼저 신청을 처리한다.
     *
     * USER → ADMIN 변경과
     * 기관 가입 심사가 동시에 존재하는
     * 모순 상태를 방지한다.
     */
    const pendingInstitutionApplication =
      await db.orm.public.InstitutionApplication.first({
        applicantId: user.id,

        status: 'PENDING',
      });

    if (pendingInstitutionApplication) {
      throw new ConflictException(
        '처리 중인 기관 가입 신청이 있습니다. 기관 신청을 먼저 승인 또는 거절한 뒤 관리자 승격을 진행해주세요.',
      );
    }

    const updatedUser = await db.orm.public.User.where({
      id: user.id,
    }).update({
      role: 'ADMIN',
    });

    if (!updatedUser) {
      throw new NotFoundException('관리자로 승격할 사용자를 찾을 수 없습니다.');
    }

    return {
      message: '사용자를 관리자로 승격했습니다.',

      user: this.toAdminPublicUser(updatedUser),
    };
  }

  /*
   * ADMIN:
   * 사용자 계정 삭제
   */
  async deleteUserByAdmin(adminId: number, userId: number) {
    if (adminId === userId) {
      throw new ForbiddenException(
        '현재 로그인한 관리자 본인 계정은 삭제할 수 없습니다.',
      );
    }

    const user = await db.orm.public.User.first({
      id: userId,
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    if (user.status === 'DELETED') {
      throw new ConflictException('이미 삭제된 계정입니다.');
    }

    const deletedAt = new Date().toISOString();

    const anonymizedEmail = `deleted-${user.id}-${Date.now()}@deleted.local`;

    const pendingApplications =
      await db.orm.public.InstitutionApplication.where({
        applicantId: user.id,

        status: 'PENDING',
      }).all();

    await db.transaction(async (tx) => {
      for (const application of pendingApplications) {
        await tx.orm.public.InstitutionApplication.where({
          id: application.id,
        }).update({
          status: 'REJECTED',

          reviewerId: adminId,

          reviewedAt: deletedAt,

          rejectionReason:
            '관리자에 의해 계정이 삭제되어 기관 가입 신청이 종료되었습니다.',
        });
      }

      const updatedUser = await tx.orm.public.User.where({
        id: user.id,
      }).update({
        email: anonymizedEmail,

        nickname: null,

        passwordHash: null,

        googleSub: null,

        emailVerified: false,

        emailVerifiedAt: null,

        status: 'DELETED',

        suspendedAt: null,

        suspensionReason: null,

        deletedAt,
      });

      if (!updatedUser) {
        throw new NotFoundException('삭제할 사용자를 찾을 수 없습니다.');
      }
    });

    return {
      message: '계정을 삭제했습니다.',
    };
  }
}
