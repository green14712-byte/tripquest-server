import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { ChallengeReviewsController } from './challenge-reviews.controller';
import { ChallengeReviewsService } from './challenge-reviews.service';

@Module({
  imports: [AuthModule],

  controllers: [ChallengeReviewsController],

  providers: [ChallengeReviewsService],

  exports: [ChallengeReviewsService],
})
export class ChallengeReviewsModule {}
