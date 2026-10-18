import { Body, Controller, Get, Post } from '@nestjs/common';

import { InstitutionsService } from './institutions.service';

@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  @Post()
  create(
    @Body()
    body: {
      name: string;
      description?: string;
    },
  ) {
    return this.institutionsService.create(body.name, body.description);
  }

  @Get()
  findAll() {
    return this.institutionsService.findAll();
  }
}
