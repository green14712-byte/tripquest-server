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
  ValidateIf,
} from 'class-validator';

export class UpdateChallengeDto {
  /*
   * Challenge 제목
   *
   * 전달된 경우에만 수정한다.
   */
  @IsOptional()
  @IsString()
  @MinLength(2, {
    message: 'Challenge 제목은 최소 2자 이상이어야 합니다.',
  })
  @MaxLength(100, {
    message: 'Challenge 제목은 최대 100자까지 입력할 수 있습니다.',
  })
  title?: string;

  /*
   * Challenge 설명
   *
   * null을 보내면 기존 설명을 삭제할 수 있다.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000, {
    message: 'Challenge 설명은 최대 2000자까지 입력할 수 있습니다.',
  })
  description?: string | null;

  /*
   * 지역
   *
   * null을 보내면 기존 지역 정보를 삭제할 수 있다.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100, {
    message: '지역은 최대 100자까지 입력할 수 있습니다.',
  })
  region?: string | null;

  /*
   * 시작일
   *
   * ISO 8601 문자열을 사용한다.
   * null을 보내면 시작일을 미설정 상태로 변경한다.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsISO8601(
    {},
    {
      message: '시작일은 ISO 8601 형식이어야 합니다.',
    },
  )
  startAt?: string | null;

  /*
   * 종료일
   *
   * ISO 8601 문자열을 사용한다.
   * null을 보내면 종료일을 미설정 상태로 변경한다.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsISO8601(
    {},
    {
      message: '종료일은 ISO 8601 형식이어야 합니다.',
    },
  )
  endAt?: string | null;

  /*
   * Challenge 대표사진 초점 X 위치
   *
   * 0   = 가장 왼쪽
   * 50  = 가로 중앙
   * 100 = 가장 오른쪽
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
   * 0   = 가장 위쪽
   * 50  = 세로 중앙
   * 100 = 가장 아래쪽
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
