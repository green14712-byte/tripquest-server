import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { UserBadgesController } from './user-badges.controller';
import { UserBadgesService } from './user-badges.service';

@Module({
  imports: [AuthModule],

  controllers: [UserBadgesController],

  providers: [UserBadgesService],

  exports: [UserBadgesService],
})
export class UserBadgesModule {}
