#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/9448082effe798e08c3b9c4cc57d336e96ea1eaa82a081755dd160be56a313c9/contract';
import endContract from '../../snapshots/9448082effe798e08c3b9c4cc57d336e96ea1eaa82a081755dd160be56a313c9/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'challenge_participations',
        columns: [
          col('challengeId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('joinedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'challenges',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('endAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('institutionId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('region', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('startAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('DRAFT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'challenges_status_check_9574a496',
            `"status" IN ('DRAFT', 'ACTIVE', 'ENDED', 'ARCHIVED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'institutions',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'mission_completions',
        columns: [
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('missionId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('verificationMethod', 'text', {
            notNull: true,
            default: lit('QR_GPS'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('verifiedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'missions',
        columns: [
          col('address', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('challengeId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('latitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('longitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('qrActive', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('qrLocationNote', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('qrTokenHash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('sortOrder', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('verificationRadius', 'int4', {
            notNull: true,
            default: lit(100),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'users',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('institutionId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('nickname', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', {
            notNull: true,
            default: lit('USER'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'users_role_check_e85e4f41',
            `"role" IN ('USER', 'INSTITUTION', 'ADMIN')`,
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'challenge_participations',
        constraint: 'challenge_participations_userId_challengeId_key',
        columns: ['userId', 'challengeId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'mission_completions',
        constraint: 'mission_completions_userId_missionId_key',
        columns: ['userId', 'missionId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'missions',
        constraint: 'missions_qrTokenHash_key',
        columns: ['qrTokenHash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'users',
        constraint: 'users_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'challenge_participations',
        index: 'challenge_participations_challengeId_idx_73b8115d',
        columns: ['challengeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'challenge_participations',
        index: 'challenge_participations_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'challenges',
        index: 'challenges_institutionId_idx_bab0e331',
        columns: ['institutionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mission_completions',
        index: 'mission_completions_missionId_idx_25ef2118',
        columns: ['missionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mission_completions',
        index: 'mission_completions_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'missions',
        index: 'missions_challengeId_idx_73b8115d',
        columns: ['challengeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'users',
        index: 'users_institutionId_idx_bab0e331',
        columns: ['institutionId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'challenge_participations',
        foreignKey: {
          name: 'challenge_participations_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'challenge_participations',
        foreignKey: {
          name: 'challenge_participations_challengeId_fkey',
          columns: ['challengeId'],
          references: { schema: 'public', table: 'challenges', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'challenges',
        foreignKey: {
          name: 'challenges_institutionId_fkey',
          columns: ['institutionId'],
          references: { schema: 'public', table: 'institutions', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mission_completions',
        foreignKey: {
          name: 'mission_completions_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mission_completions',
        foreignKey: {
          name: 'mission_completions_missionId_fkey',
          columns: ['missionId'],
          references: { schema: 'public', table: 'missions', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'missions',
        foreignKey: {
          name: 'missions_challengeId_fkey',
          columns: ['challengeId'],
          references: { schema: 'public', table: 'challenges', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'users',
        foreignKey: {
          name: 'users_institutionId_fkey',
          columns: ['institutionId'],
          references: { schema: 'public', table: 'institutions', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
