import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class VerifyMissionDto {
  /*
   * 위치 인증을 할 때 어떤 Mission을
   * 인증하려는지 식별하기 위해 사용한다.
   *
   * QR 인증만 사용하는 경우에는
   * qrToken 자체로 Mission을 찾을 수 있으므로
   * missionId가 없어도 된다.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  missionId?: number;

  /*
   * QR 인증이 필요한 경우 전달한다.
   *
   * QR 원본 토큰은 32바이트 randomBytes를
   * hex 문자열로 만든 64자리 값이다.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i, {
    message: '유효하지 않은 QR 토큰입니다.',
  })
  qrToken?: string;

  /*
   * 위치 인증을 시도하는 경우 전달한다.
   *
   * LOCATION_ONLY
   * → 필요
   *
   * LOCATION_AND_QR
   * → 필요
   *
   * LOCATION_OR_QR
   * → 위치 인증을 사용할 때만 필요
   */
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  /*
   * 브라우저 Geolocation API가 알려주는
   * 현재 위치 정확도(m).
   *
   * 위치 인증을 사용할 때 서버에서
   * 추가 검증에 사용한다.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number;
}
