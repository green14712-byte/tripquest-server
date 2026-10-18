import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectInstitutionApplicationDto {
  @IsString()
  @MinLength(2, {
    message: '거절 사유를 입력해주세요.',
  })
  @MaxLength(500, {
    message: '거절 사유는 최대 500자까지 입력할 수 있습니다.',
  })
  reason: string;
}
