import { Type } from 'class-transformer';

import {
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
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
   * Challenge 요약 지도 추천 이동수단
   *
   * WALKING
   * → 도보
   *
   * CYCLING
   * → 자전거
   *
   * DRIVING
   * → 자동차
   */
  @IsOptional()
  @IsString()
  @IsIn(['WALKING', 'CYCLING', 'DRIVING'], {
    message: '추천 이동수단은 도보, 자전거, 자동차 중 하나여야 합니다.',
  })
  routeMode?: 'WALKING' | 'CYCLING' | 'DRIVING';

  /*
   * Challenge 난이도
   *
   * 1 → ★
   * 2 → ★★
   * 3 → ★★★
   * 4 → ★★★★
   * 5 → ★★★★★
   *
   * null을 보내면 미설정 상태로 변경할 수 있다.
   * 단, 배지 설정이 완성되지 않은 Challenge는 운영할 수 없다.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsInt({
    message: 'Challenge 난이도는 정수여야 합니다.',
  })
  @Min(1, {
    message: 'Challenge 난이도는 최소 1단계여야 합니다.',
  })
  @Max(5, {
    message: 'Challenge 난이도는 최대 5단계여야 합니다.',
  })
  difficulty?: number | null;

  /*
   * 완료 배지 테두리 색상
   *
   * 단색 HEX 형식을 사용한다.
   *
   * 예:
   * #7C3AED
   *
   * null을 보내면 미설정 상태로 변경할 수 있다.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: '배지 테두리 색상은 #RRGGBB 형식이어야 합니다.',
  })
  badgeBorderColor?: string | null;

  /*
   * 완료 배지 중앙 디자인 방식
   *
   * IMAGE
   * → 기관이 직접 업로드한 이미지
   *
   * ICON
   * → Korea Trip Quest가 제공하는 기본 아이콘
   *
   * null을 보내면 미설정 상태로 변경할 수 있다.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @IsIn(['IMAGE', 'ICON'], {
    message: '배지 중앙 디자인 방식은 이미지 또는 아이콘이어야 합니다.',
  })
  badgeCenterType?: 'IMAGE' | 'ICON' | null;

  /*
   * 기본 아이콘 식별자
   *
   * 예:
   * PALACE
   * BICYCLE
   * MOUNTAIN
   * SEA
   *
   * IMAGE 방식에서는 사용하지 않는다.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(50, {
    message: '배지 아이콘 식별자는 최대 50자까지 입력할 수 있습니다.',
  })
  badgeIcon?: string | null;

  /*
   * 완료 배지 이름
   *
   * 예:
   * 서울 역사 탐험가
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MinLength(1, {
    message: '배지 이름을 입력해주세요.',
  })
  @MaxLength(100, {
    message: '배지 이름은 최대 100자까지 입력할 수 있습니다.',
  })
  badgeName?: string | null;

  /*
   * 완료 배지 설명
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MinLength(1, {
    message: '배지 설명을 입력해주세요.',
  })
  @MaxLength(500, {
    message: '배지 설명은 최대 500자까지 입력할 수 있습니다.',
  })
  badgeDescription?: string | null;

  /*
   * 완료 배지 중앙 이미지 크기
   *
   * 40 ~ 100 범위로 사용한다.
   *
   * 100
   * → 배지 영역에 가장 크게 표시
   *
   * 40
   * → 배지 안쪽에 여백을 많이 두고 작게 표시
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    {},
    {
      message: '배지 이미지 크기는 숫자여야 합니다.',
    },
  )
  @Min(40, {
    message: '배지 이미지 크기는 최소 40 이상이어야 합니다.',
  })
  @Max(100, {
    message: '배지 이미지 크기는 최대 100 이하여야 합니다.',
  })
  badgeImageScale?: number;

  /*
   * 완료 배지 중앙 이미지 가로 위치
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
      message: '배지 이미지 가로 위치는 숫자여야 합니다.',
    },
  )
  @Min(0, {
    message: '배지 이미지 가로 위치는 0 이상이어야 합니다.',
  })
  @Max(100, {
    message: '배지 이미지 가로 위치는 100 이하여야 합니다.',
  })
  badgeImagePositionX?: number;

  /*
   * 완료 배지 중앙 이미지 세로 위치
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
      message: '배지 이미지 세로 위치는 숫자여야 합니다.',
    },
  )
  @Min(0, {
    message: '배지 이미지 세로 위치는 0 이상이어야 합니다.',
  })
  @Max(100, {
    message: '배지 이미지 세로 위치는 100 이하여야 합니다.',
  })
  badgeImagePositionY?: number;

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
