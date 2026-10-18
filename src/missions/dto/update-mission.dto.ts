import { Type } from 'class-transformer';

import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import type { MissionVerificationMode } from './create-mission.dto';

export class UpdateMissionDto {
  @IsOptional()
  @IsString()
  @MinLength(2, {
    message: '미션 제목은 최소 2자 이상이어야 합니다.',
  })
  @MaxLength(100, {
    message: '미션 제목은 최대 100자까지 입력할 수 있습니다.',
  })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, {
    message: '미션 설명은 최대 2000자까지 입력할 수 있습니다.',
  })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, {
    message: '주소는 최대 200자까지 입력할 수 있습니다.',
  })
  address?: string;

  /*
   * Mission 관광지 대표사진 초점 X 위치
   *
   * 0   = 사진의 가장 왼쪽
   * 50  = 사진의 가로 중앙
   * 100 = 사진의 가장 오른쪽
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    {},
    {
      message: '관광지 대표사진 가로 초점 위치는 숫자여야 합니다.',
    },
  )
  @Min(0, {
    message: '관광지 대표사진 가로 초점 위치는 0 이상이어야 합니다.',
  })
  @Max(100, {
    message: '관광지 대표사진 가로 초점 위치는 100 이하여야 합니다.',
  })
  photoPositionX?: number;

  /*
   * Mission 관광지 대표사진 초점 Y 위치
   *
   * 0   = 사진의 가장 위쪽
   * 50  = 사진의 세로 중앙
   * 100 = 사진의 가장 아래쪽
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    {},
    {
      message: '관광지 대표사진 세로 초점 위치는 숫자여야 합니다.',
    },
  )
  @Min(0, {
    message: '관광지 대표사진 세로 초점 위치는 0 이상이어야 합니다.',
  })
  @Max(100, {
    message: '관광지 대표사진 세로 초점 위치는 100 이하여야 합니다.',
  })
  photoPositionY?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10, {
    message: '인증 반경은 최소 10m 이상이어야 합니다.',
  })
  @Max(1000, {
    message: '인증 반경은 최대 1000m까지 설정할 수 있습니다.',
  })
  verificationRadius?: number;

  @IsOptional()
  @IsIn(['LOCATION_ONLY', 'LOCATION_AND_QR', 'LOCATION_OR_QR'], {
    message: '올바른 Mission 인증 방식을 선택해주세요.',
  })
  verificationMode?: MissionVerificationMode;

  @IsOptional()
  @IsString()
  @MaxLength(300, {
    message: 'QR 설치 위치 설명은 최대 300자까지 입력할 수 있습니다.',
  })
  qrLocationNote?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
