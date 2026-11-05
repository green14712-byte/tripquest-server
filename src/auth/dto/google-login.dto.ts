import { IsString, MinLength } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @MinLength(1, {
    message: 'Google 로그인 토큰이 필요합니다.',
  })
  accessToken: string;
}
