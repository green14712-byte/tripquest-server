import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InstitutionsModule } from './institutions/institutions.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { InstitutionApplicationsModule } from './institution-applications/institution-applications.module';
import { ChallengesModule } from './challenges/challenges.module';
import { MissionsModule } from './missions/missions.module';
import { ChallengeParticipationsModule } from './challenge-participations/challenge-participations.module';
import { MissionCompletionsModule } from './mission-completions/mission-completions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    InstitutionsModule,
    MailModule,
    AuthModule,
    InstitutionApplicationsModule,
    ChallengesModule,
    MissionsModule,
    ChallengeParticipationsModule,
    MissionCompletionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
