import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(8, {
    message: '현재 비밀번호는 최소 8자 이상이어야 합니다.',
  })
  @MaxLength(64, {
    message: '현재 비밀번호는 최대 64자까지 사용할 수 있습니다.',
  })
  currentPassword: string;

  @IsString()
  @MinLength(8, {
    message: '새 비밀번호는 최소 8자 이상이어야 합니다.',
  })
  @MaxLength(64, {
    message: '새 비밀번호는 최대 64자까지 사용할 수 있습니다.',
  })
  newPassword: string;
}
