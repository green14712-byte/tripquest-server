import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';

import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { ChallengeParticipationsService } from './challenge-participations.service';

@Controller('challenges')
export class ChallengeParticipationsController {
  constructor(
    private readonly challengeParticipationsService: ChallengeParticipationsService,
  ) {}

  // USER: 내가 참여한 Challenge 목록 조회
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @Get('me/participations')
  findMine(
    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.challengeParticipationsService.findMine(request.user.id);
  }

  // USER: ACTIVE Challenge 참여
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @Post(':challengeId/join')
  join(
    @Param('challengeId', ParseIntPipe)
    challengeId: number,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.challengeParticipationsService.join(
      request.user.id,
      challengeId,
    );
  }
}
