import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/, {
    message: '유효하지 않은 비밀번호 재설정 토큰입니다.',
  })
  resetToken: string;

  @IsString()
  @MinLength(8, {
    message: '새 비밀번호는 최소 8자 이상이어야 합니다.',
  })
  @MaxLength(64, {
    message: '새 비밀번호는 최대 64자까지 사용할 수 있습니다.',
  })
  newPassword: string;
}
