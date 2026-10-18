#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1caf68d726c02ee7b3993fb1a7dffeb19b5a48dd0ff8c801a022f2258fb9d9c0/contract';
import endContract from '../../snapshots/1caf68d726c02ee7b3993fb1a7dffeb19b5a48dd0ff8c801a022f2258fb9d9c0/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/8a4977b09068de05f701a996b80b5ac6396ce832b6617aec636f7ff0a96e7ad8/contract';
import startContract from '../../snapshots/8a4977b09068de05f701a996b80b5ac6396ce832b6617aec636f7ff0a96e7ad8/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'challenges',
        constraint: 'challenges_status_check_9574a496',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'challenges',
        constraint: 'challenges_status_check_aba8b6a8',
        expression: `"status" IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED', 'ARCHIVED')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
