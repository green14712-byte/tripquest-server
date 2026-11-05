import { IsEmail, IsString, Matches } from 'class-validator';

export class VerifyPasswordResetCodeDto {
  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^\d{6}$/, {
    message: '인증번호는 6자리 숫자여야 합니다.',
  })
  code: string;
}
