import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/, {
    message: '유효하지 않은 이메일 인증 토큰입니다.',
  })
  verificationToken: string;

  @IsString()
  @MinLength(8, {
    message: '비밀번호는 최소 8자 이상이어야 합니다.',
  })
  @MaxLength(64, {
    message: '비밀번호는 최대 64자까지 사용할 수 있습니다.',
  })
  password: string;

  @IsString()
  @MinLength(2, {
    message: '닉네임은 최소 2자 이상이어야 합니다.',
  })
  @MaxLength(30, {
    message: '닉네임은 최대 30자까지 사용할 수 있습니다.',
  })
  nickname: string;
}
