import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';

import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { UserBadgesService } from './user-badges.service';

@Controller('user-badges')
export class UserBadgesController {
  constructor(private readonly userBadgesService: UserBadgesService) {}

  /*
   * USER:
   * 내가 획득한 Challenge 완료 배지 조회
   *
   * 이 요청에서 과거 Challenge 완료 기록 중
   * 아직 UserBadge가 없는 경우도 함께 보정한다.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @Get('me')
  findMine(
    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.userBadgesService.findMine(request.user.id);
  }
}
