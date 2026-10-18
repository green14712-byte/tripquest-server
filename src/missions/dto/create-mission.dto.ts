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

export type MissionVerificationMode =
  'LOCATION_ONLY' | 'LOCATION_AND_QR' | 'LOCATION_OR_QR';

export class CreateMissionDto {
  @IsString()
  @MinLength(2, {
    message: '미션 제목은 최소 2자 이상이어야 합니다.',
  })
  @MaxLength(100, {
    message: '미션 제목은 최대 100자까지 입력할 수 있습니다.',
  })
  title: string;

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
   *
   * Mission 생성 요청은 multipart/form-data를 사용할 수 있으므로
   * 문자열로 전달된 값을 Number로 변환한다.
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

  // 지도에서 선택한 위도
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  // 지도에서 선택한 경도
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  // 위치 인증 가능 반경 (미터)
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

  /*
   * Mission 인증 방식
   *
   * LOCATION_ONLY
   * → 위치 인증만 성공하면 완료
   *
   * LOCATION_AND_QR
   * → 위치 인증과 QR 인증 모두 성공해야 완료
   *
   * LOCATION_OR_QR
   * → 위치 또는 QR 중 하나만 성공해도 완료
   */
  @IsOptional()
  @IsIn(['LOCATION_ONLY', 'LOCATION_AND_QR', 'LOCATION_OR_QR'], {
    message: '올바른 Mission 인증 방식을 선택해주세요.',
  })
  verificationMode?: MissionVerificationMode;

  /*
   * 실제 QR이 설치되어 있는 장소 설명
   * LOCATION_ONLY에서는 없어도 됨
   */
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
