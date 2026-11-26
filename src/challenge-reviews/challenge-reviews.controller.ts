import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';

import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ChallengeReviewsService } from './challenge-reviews.service';

@Controller('challenges/:challengeId/reviews')
export class ChallengeReviewsController {
  constructor(
    private readonly challengeReviewsService: ChallengeReviewsService,
  ) {}

  /*
   * 전체 후기 및 별점 통계 조회
   *
   * 비로그인 사용자도 조회할 수 있다.
   *
   * GET /challenges/:challengeId/reviews
   *
   * sort:
   * latest -> 최신순
   * highest -> 높은 별점순
   * lowest -> 낮은 별점순
   */
  @Get()
  getReviews(
    @Param('challengeId', ParseIntPipe)
    challengeId: number,

    @Query('sort')
    sort?: string,
  ) {
    return this.challengeReviewsService.getReviews(challengeId, sort);
  }

  /*
   * USER: 내 후기 및 후기 작성 자격 조회
   *
   * GET /challenges/:challengeId/reviews/me
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @Get('me')
  getMyReview(
    @Req()
    request: AuthenticatedRequest,

    @Param('challengeId', ParseIntPipe)
    challengeId: number,
  ) {
    return this.challengeReviewsService.getMyReview(
      request.user.id,
      challengeId,
    );
  }

  /*
   * USER: 별점 및 후기 등록
   *
   * Challenge를 최초 완료한 여행자만 등록 가능하다.
   *
   * POST /challenges/:challengeId/reviews
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @Post()
  createReview(
    @Req()
    request: AuthenticatedRequest,

    @Param('challengeId', ParseIntPipe)
    challengeId: number,

    @Body()
    dto: CreateReviewDto,
  ) {
    return this.challengeReviewsService.createReview(
      request.user.id,
      challengeId,
      dto,
    );
  }

  /*
   * USER: 자신이 작성한 후기 수정
   *
   * PATCH /challenges/:challengeId/reviews/me
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @Patch('me')
  updateMyReview(
    @Req()
    request: AuthenticatedRequest,

    @Param('challengeId', ParseIntPipe)
    challengeId: number,

    @Body()
    dto: UpdateReviewDto,
  ) {
    return this.challengeReviewsService.updateMyReview(
      request.user.id,
      challengeId,
      dto,
    );
  }

  /*
   * USER: 자신이 작성한 후기 삭제
   *
   * DELETE /challenges/:challengeId/reviews/me
   *
   * 후기만 삭제하며 Challenge 완료 기록이나
   * 획득한 배지에는 영향을 주지 않는다.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @Delete('me')
  deleteMyReview(
    @Req()
    request: AuthenticatedRequest,

    @Param('challengeId', ParseIntPipe)
    challengeId: number,
  ) {
    return this.challengeReviewsService.deleteMyReview(
      request.user.id,
      challengeId,
    );
  }
}
