import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { db } from '../prisma/db';

import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

type ReviewSort = 'latest' | 'highest' | 'lowest';

@Injectable()
export class ChallengeReviewsService {
  /*
   * 전체 후기 및 별점 통계 조회
   *
   * 비로그인 사용자도 조회할 수 있다.
   */
  async getReviews(challengeId: number, sort?: string) {
    await this.findChallenge(challengeId);

    const sortType = this.normalizeSort(sort);

    const reviews = await db.orm.public.ChallengeReview.where({
      challengeId,
    }).all();

    /*
     * 전체 후기 개수 및 평균 별점 계산
     */
    const reviewCount = reviews.length;

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);

    const averageRating =
      reviewCount > 0 ? Number((totalRating / reviewCount).toFixed(1)) : 0;

    /*
     * 별점별 후기 개수
     */
    const ratingDistribution = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    for (const review of reviews) {
      if (
        review.rating >= 1 &&
        review.rating <= 5 &&
        Number.isInteger(review.rating)
      ) {
        const rating = review.rating as 1 | 2 | 3 | 4 | 5;

        ratingDistribution[rating] += 1;
      }
    }

    /*
     * 후기 정렬
     *
     * 별점이 같은 경우 최신순으로 정렬한다.
     */
    const sortedReviews = [...reviews].sort((a, b) => {
      if (sortType === 'highest') {
        const ratingDifference = b.rating - a.rating;

        if (ratingDifference !== 0) {
          return ratingDifference;
        }
      }

      if (sortType === 'lowest') {
        const ratingDifference = a.rating - b.rating;

        if (ratingDifference !== 0) {
          return ratingDifference;
        }
      }

      const dateDifference =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

      if (dateDifference !== 0) {
        return dateDifference;
      }

      return b.id - a.id;
    });

    /*
     * 작성자 정보 조회
     *
     * 같은 작성자를 반복 조회하지 않도록
     * userId를 중복 제거한다.
     */
    const userIds = [...new Set(sortedReviews.map((review) => review.userId))];

    const authors = await Promise.all(
      userIds.map(async (userId) => {
        return db.orm.public.User.first({
          id: userId,
        });
      }),
    );

    const authorMap = new Map<number, string>();

    for (const author of authors) {
      if (!author) {
        continue;
      }

      /*
       * 탈퇴한 사용자의 기존 후기는 보존하되
       * 닉네임을 노출하지 않는다.
       */
      const nickname =
        author.status === 'DELETED'
          ? '탈퇴한 여행자'
          : author.nickname?.trim() || '여행자';

      authorMap.set(author.id, nickname);
    }

    /*
     * 공개 응답에서는 작성자의 이메일,
     * 비밀번호 및 계정 관련 정보를 제외한다.
     */
    const publicReviews = sortedReviews.map((review) => ({
      id: review.id,
      challengeId: review.challengeId,

      rating: review.rating,
      comment: review.comment,

      createdAt: review.createdAt,
      updatedAt: review.updatedAt,

      isEdited:
        new Date(review.updatedAt).getTime() >
        new Date(review.createdAt).getTime() + 1000,

      author: {
        nickname: authorMap.get(review.userId) ?? '여행자',
      },

      isVerifiedTraveler: true,
    }));

    return {
      challengeId,

      averageRating,
      reviewCount,
      ratingDistribution,

      sort: sortType,

      reviews: publicReviews,
    };
  }

  /*
   * USER: 내 후기 및 작성 자격 조회
   */
  async getMyReview(userId: number, challengeId: number) {
    await this.findChallenge(challengeId);
    await this.ensureActiveTraveler(userId);

    const participation = await db.orm.public.ChallengeParticipation.first({
      userId,
      challengeId,
    });

    const review = await db.orm.public.ChallengeReview.first({
      userId,
      challengeId,
    });

    /*
     * 현재 Mission 진행률이 아니라
     * 영구적으로 보존된 최초 완료 기록을 사용한다.
     */
    const hasCompletedChallenge = Boolean(participation?.completedAt);

    const hasReview = Boolean(review);

    return {
      challengeId,

      hasCompletedChallenge,

      completedAt: participation?.completedAt ?? null,

      hasReview,

      canWriteReview: hasCompletedChallenge && !hasReview,

      canEditReview: hasCompletedChallenge && hasReview,

      canDeleteReview: hasReview,

      review: review
        ? {
            id: review.id,
            challengeId: review.challengeId,
            rating: review.rating,
            comment: review.comment,
            createdAt: review.createdAt,
            updatedAt: review.updatedAt,
          }
        : null,
    };
  }

  /*
   * USER: 별점 및 후기 등록
   */
  async createReview(
    userId: number,
    challengeId: number,
    dto: CreateReviewDto,
  ) {
    await this.findChallenge(challengeId);
    await this.ensureActiveTraveler(userId);

    /*
     * Challenge를 완료한 USER만 작성 가능하다.
     */
    await this.ensureCompletedChallenge(userId, challengeId);

    /*
     * 사용자당 Challenge별 후기 한 개
     */
    const existingReview = await db.orm.public.ChallengeReview.first({
      userId,
      challengeId,
    });

    if (existingReview) {
      throw new ConflictException(
        '이미 작성한 후기가 있습니다. 기존 후기를 수정해주세요.',
      );
    }

    this.validateRating(dto.rating);

    const comment = this.normalizeComment(dto.comment);

    let review;

    try {
      review = await db.orm.public.ChallengeReview.create({
        userId,
        challengeId,

        rating: dto.rating,
        comment,
      });
    } catch (error) {
      /*
       * 동시에 등록 요청이 들어온 경우에도
       * DB UNIQUE 제약조건으로 중복 생성을 차단한다.
       */
      const duplicatedReview = await db.orm.public.ChallengeReview.first({
        userId,
        challengeId,
      });

      if (duplicatedReview) {
        throw new ConflictException('이미 작성한 후기가 있습니다.');
      }

      throw error;
    }

    return {
      message: '후기가 등록되었습니다.',

      review: {
        id: review.id,
        challengeId: review.challengeId,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
      },
    };
  }

  /*
   * USER: 본인이 작성한 후기 수정
   */
  async updateMyReview(
    userId: number,
    challengeId: number,
    dto: UpdateReviewDto,
  ) {
    await this.findChallenge(challengeId);
    await this.ensureActiveTraveler(userId);

    await this.ensureCompletedChallenge(userId, challengeId);

    const existingReview = await db.orm.public.ChallengeReview.first({
      userId,
      challengeId,
    });

    if (!existingReview) {
      throw new NotFoundException('작성한 후기를 찾을 수 없습니다.');
    }

    /*
     * 별점과 후기 내용을 선택적으로 수정한다.
     *
     * comment가 undefined라면 기존 내용 유지
     * comment가 null 또는 빈 문자열이면 내용 제거
     */
    if (dto.rating === undefined && dto.comment === undefined) {
      throw new BadRequestException('수정할 내용이 필요합니다.');
    }

    const updateData: {
      rating?: number;
      comment?: string | null;
    } = {};

    if (dto.rating !== undefined) {
      this.validateRating(dto.rating);

      updateData.rating = dto.rating;
    }

    if (dto.comment !== undefined) {
      updateData.comment = this.normalizeComment(dto.comment);
    }

    /*
     * 실제 값이 바뀌지 않았다면
     * 불필요한 updatedAt 변경을 방지한다.
     */
    const nextRating = updateData.rating ?? existingReview.rating;

    const nextComment =
      updateData.comment !== undefined
        ? updateData.comment
        : existingReview.comment;

    if (
      nextRating === existingReview.rating &&
      nextComment === existingReview.comment
    ) {
      return {
        message: '변경된 내용이 없습니다.',

        review: {
          id: existingReview.id,
          challengeId: existingReview.challengeId,
          rating: existingReview.rating,
          comment: existingReview.comment,
          createdAt: existingReview.createdAt,
          updatedAt: existingReview.updatedAt,
        },
      };
    }

    /*
     * 사용자 ID와 Challenge ID를 함께 검사하여
     * 다른 사용자의 후기 수정 요청을 방지한다.
     */
    const updatedReview = await db.orm.public.ChallengeReview.where({
      id: existingReview.id,
      userId,
      challengeId,
    }).update(updateData);

    if (!updatedReview) {
      throw new NotFoundException('수정할 후기를 찾을 수 없습니다.');
    }

    return {
      message: '후기가 수정되었습니다.',

      review: {
        id: updatedReview.id,
        challengeId: updatedReview.challengeId,
        rating: updatedReview.rating,
        comment: updatedReview.comment,
        createdAt: updatedReview.createdAt,
        updatedAt: updatedReview.updatedAt,
      },
    };
  }

  /*
   * USER: 본인이 작성한 후기 삭제
   *
   * ChallengeParticipation,
   * MissionCompletion,
   * UserBadge에는 영향을 주지 않는다.
   */
  async deleteMyReview(userId: number, challengeId: number) {
    await this.findChallenge(challengeId);
    await this.ensureActiveTraveler(userId);

    const existingReview = await db.orm.public.ChallengeReview.first({
      userId,
      challengeId,
    });

    if (!existingReview) {
      throw new NotFoundException('삭제할 후기를 찾을 수 없습니다.');
    }

    await db.orm.public.ChallengeReview.where({
      id: existingReview.id,
      userId,
      challengeId,
    }).delete();

    return {
      message: '후기가 삭제되었습니다.',

      challengeId,

      deletedReviewId: existingReview.id,
    };
  }

  /*
   * Challenge 존재 여부 및 공개 상태 검사
   */
  private async findChallenge(challengeId: number) {
    if (!Number.isInteger(challengeId) || challengeId <= 0) {
      throw new BadRequestException('유효하지 않은 챌린지 ID입니다.');
    }

    const challenge = await db.orm.public.Challenge.first({
      id: challengeId,
    });

    if (!challenge) {
      throw new NotFoundException('챌린지를 찾을 수 없습니다.');
    }

    /*
     * 공개되지 않은 DRAFT Challenge의
     * 후기 정보는 외부에 노출하지 않는다.
     */
    if (challenge.status === 'DRAFT') {
      throw new NotFoundException('챌린지를 찾을 수 없습니다.');
    }

    return challenge;
  }

  /*
   * 일반 여행자 및 활성 계정 검사
   */
  private async ensureActiveTraveler(userId: number) {
    const user = await db.orm.public.User.first({
      id: userId,
    });

    if (!user) {
      throw new ForbiddenException('사용자 정보를 확인할 수 없습니다.');
    }

    if (user.role !== 'USER') {
      throw new ForbiddenException(
        '일반 여행자만 후기를 작성하거나 관리할 수 있습니다.',
      );
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('현재 사용할 수 없는 계정입니다.');
    }

    return user;
  }

  /*
   * Challenge 최초 완료 기록 검사
   *
   * 배지 획득 여부와는 무관하다.
   *
   * completedAt을 수정하거나
   * UserBadge를 생성하지 않는다.
   */
  private async ensureCompletedChallenge(userId: number, challengeId: number) {
    const participation = await db.orm.public.ChallengeParticipation.first({
      userId,
      challengeId,
    });

    if (!participation?.completedAt) {
      throw new ForbiddenException(
        '챌린지를 완료한 여행자만 후기를 작성할 수 있습니다.',
      );
    }

    return participation;
  }

  /*
   * 별점 범위 검사
   *
   * DTO 검증과 별도로 Service에서도 검사한다.
   */
  private validateRating(rating: number) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('별점은 1~5 사이의 정수여야 합니다.');
    }
  }

  /*
   * 후기 내용 정리
   *
   * 공백만 입력하면 NULL로 저장한다.
   */
  private normalizeComment(comment?: string | null): string | null {
    if (comment === undefined || comment === null) {
      return null;
    }

    if (typeof comment !== 'string') {
      throw new BadRequestException('후기 내용은 문자열이어야 합니다.');
    }

    if (Array.from(comment).length > 500) {
      throw new BadRequestException(
        '후기는 최대 500자까지 작성할 수 있습니다.',
      );
    }

    const normalized = comment.trim();

    if (normalized.length === 0) {
      return null;
    }

    return normalized;
  }

  /*
   * 후기 정렬 옵션
   */
  private normalizeSort(sort?: string): ReviewSort {
    if (sort === undefined || sort === '') {
      return 'latest';
    }

    if (sort === 'latest' || sort === 'highest' || sort === 'lowest') {
      return sort;
    }

    throw new BadRequestException('지원하지 않는 후기 정렬 방식입니다.');
  }
}
