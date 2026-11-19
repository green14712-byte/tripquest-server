#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5fb318aa24e0374406527be1fdd9294a54709b91f4d2bb4cba3805a7d6587bbe/contract';
import startContract from '../../snapshots/5fb318aa24e0374406527be1fdd9294a54709b91f4d2bb4cba3805a7d6587bbe/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/9a5c64df38d920fa3a845cb5a0ef07dff33cebd8e2145be425c754bf0f986ac4/contract';
import endContract from '../../snapshots/9a5c64df38d920fa3a845cb5a0ef07dff33cebd8e2145be425c754bf0f986ac4/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'badge_versions',
        columns: [
          col('borderColor', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('centerImageKey', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('centerType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('challengeId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('difficulty', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('icon', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('missionCount', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('shape', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('version', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'badge_versions_centerType_check_b6357795',
            `"centerType" IN ('IMAGE', 'ICON')`,
          ),
          checkExpression(
            'badge_versions_shape_check_cfa41626',
            `"shape" IN ('CIRCLE', 'TRIANGLE', 'DIAMOND', 'PENTAGON', 'HEXAGON', 'SHIELD')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'user_badges',
        columns: [
          col('badgeVersionId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('challengeId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('completedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('issuedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'challenge_participations',
        column: col('completedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-string@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'challenges',
        column: col('badgeBorderColor', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'challenges',
        column: col('badgeCenterImageKey', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'challenges',
        column: col('badgeCenterType', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'challenges',
        column: col('badgeDescription', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'challenges',
        column: col('badgeIcon', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'challenges',
        column: col('badgeName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'challenges',
        column: col('currentBadgeVersionId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'challenges',
        column: col('difficulty', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'badge_versions',
        constraint: 'badge_versions_challengeId_version_key',
        columns: ['challengeId', 'version'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'challenges',
        constraint: 'challenges_badgeCenterType_check_db05ede8',
        expression: `"badgeCenterType" IN ('IMAGE', 'ICON')`,
      }),
      this.addUnique({
        schema: 'public',
        table: 'challenges',
        constraint: 'challenges_currentBadgeVersionId_key',
        columns: ['currentBadgeVersionId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'user_badges',
        constraint: 'user_badges_userId_challengeId_key',
        columns: ['userId', 'challengeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'badge_versions',
        index: 'badge_versions_challengeId_idx_73b8115d',
        columns: ['challengeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'user_badges',
        index: 'user_badges_badgeVersionId_idx_84875d7a',
        columns: ['badgeVersionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'user_badges',
        index: 'user_badges_challengeId_idx_73b8115d',
        columns: ['challengeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'user_badges',
        index: 'user_badges_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'badge_versions',
        foreignKey: {
          name: 'badge_versions_challengeId_fkey',
          columns: ['challengeId'],
          references: { schema: 'public', table: 'challenges', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'challenges',
        foreignKey: {
          name: 'challenges_currentBadgeVersionId_fkey',
          columns: ['currentBadgeVersionId'],
          references: { schema: 'public', table: 'badge_versions', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'user_badges',
        foreignKey: {
          name: 'user_badges_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'user_badges',
        foreignKey: {
          name: 'user_badges_challengeId_fkey',
          columns: ['challengeId'],
          references: { schema: 'public', table: 'challenges', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'user_badges',
        foreignKey: {
          name: 'user_badges_badgeVersionId_fkey',
          columns: ['badgeVersionId'],
          references: { schema: 'public', table: 'badge_versions', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
