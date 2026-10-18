import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { MissionCompletionsController } from './mission-completions.controller';
import { MissionCompletionsService } from './mission-completions.service';

@Module({
  imports: [AuthModule],
  controllers: [MissionCompletionsController],
  providers: [MissionCompletionsService],
})
export class MissionCompletionsModule {}
