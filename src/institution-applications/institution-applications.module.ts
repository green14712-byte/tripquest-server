import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { InstitutionApplicationsController } from './institution-applications.controller';

import { InstitutionApplicationsService } from './institution-applications.service';

@Module({
  imports: [AuthModule],

  controllers: [InstitutionApplicationsController],

  providers: [InstitutionApplicationsService],
})
export class InstitutionApplicationsModule {}
