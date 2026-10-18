import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { db } from '../prisma/db';

export interface AuthenticatedUser {
  id: number;
  email: string;
  nickname: string | null;
  role: 'USER' | 'INSTITUTION' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  institutionId: number | null;
}

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      Request & {
        user?: AuthenticatedUser;
      }
    >();

    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException('로그인이 필요합니다.');
    }

    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('올바른 인증 토큰이 필요합니다.');
    }

    let payload: {
      sub: number;
    };

    try {
      payload = await this.jwtService.verifyAsync<{
        sub: number;
      }>(token);
    } catch {
      throw new UnauthorizedException('유효하지 않거나 만료된 토큰입니다.');
    }

    const user = await db.orm.public.User.first({
      id: payload.sub,
    });

    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
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

    request.user = {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      role: user.role,
      status: user.status,
      institutionId: user.institutionId,
    };

    return true;
  }
}
