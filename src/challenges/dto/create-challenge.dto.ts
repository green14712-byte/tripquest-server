import { Type } from 'class-transformer';

import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateChallengeDto {
  @IsString()
  @MinLength(2, {
    message: '챌린지 제목은 최소 2자 이상이어야 합니다.',
  })
  @MaxLength(100, {
    message: '챌린지 제목은 최대 100자까지 입력할 수 있습니다.',
  })
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, {
    message: '챌린지 설명은 최대 2000자까지 입력할 수 있습니다.',
  })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, {
    message: '지역은 최대 100자까지 입력할 수 있습니다.',
  })
  region?: string;

  @IsOptional()
  @IsISO8601(
    {},
    {
      message: '시작일은 ISO 8601 형식이어야 합니다.',
    },
  )
  startAt?: string;

  @IsOptional()
  @IsISO8601(
    {},
    {
      message: '종료일은 ISO 8601 형식이어야 합니다.',
    },
  )
  endAt?: string;

  /*
   * Challenge 대표사진 초점 X 위치
   *
   * 0   = 사진의 가장 왼쪽
   * 50  = 사진의 가로 중앙
   * 100 = 사진의 가장 오른쪽
   *
   * Challenge 생성은 대표사진과 함께
   * multipart/form-data로 요청될 수 있으므로
   * 문자열로 전달된 값을 Number로 변환한다.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    {},
    {
      message: '대표사진 가로 초점 위치는 숫자여야 합니다.',
    },
  )
  @Min(0, {
    message: '대표사진 가로 초점 위치는 0 이상이어야 합니다.',
  })
  @Max(100, {
    message: '대표사진 가로 초점 위치는 100 이하여야 합니다.',
  })
  coverPositionX?: number;

  /*
   * Challenge 대표사진 초점 Y 위치
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
      message: '대표사진 세로 초점 위치는 숫자여야 합니다.',
    },
  )
  @Min(0, {
    message: '대표사진 세로 초점 위치는 0 이상이어야 합니다.',
  })
  @Max(100, {
    message: '대표사진 세로 초점 위치는 100 이하여야 합니다.',
  })
  coverPositionY?: number;
}
