import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { ChallengeParticipationsController } from './challenge-participations.controller';
import { ChallengeParticipationsService } from './challenge-participations.service';

@Module({
  imports: [AuthModule],
  controllers: [ChallengeParticipationsController],
  providers: [ChallengeParticipationsService],
})
export class ChallengeParticipationsModule {}
