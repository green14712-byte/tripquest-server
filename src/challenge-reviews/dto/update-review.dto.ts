import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateReviewDto {
  // 별점 수정
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt({
    message: '별점은 정수여야 합니다.',
  })
  @Min(1, {
    message: '별점은 최소 1점이어야 합니다.',
  })
  @Max(5, {
    message: '별점은 최대 5점이어야 합니다.',
  })
  rating?: number;

  // 후기 내용 수정 또는 제거
  @IsOptional()
  @IsString({
    message: '후기 내용은 문자열이어야 합니다.',
  })
  @MaxLength(500, {
    message: '후기는 최대 500자까지 작성할 수 있습니다.',
  })
  comment?: string | null;
}
