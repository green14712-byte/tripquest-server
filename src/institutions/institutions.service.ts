import { Injectable } from '@nestjs/common';

import { db } from '../prisma/db';

@Injectable()
export class InstitutionsService {
  async create(name: string, description?: string) {
    return db.orm.public.Institution.create({
      name,
      description: description ?? null,
    });
  }

  async findAll() {
    return db.orm.public.Institution.all();
  }
}
