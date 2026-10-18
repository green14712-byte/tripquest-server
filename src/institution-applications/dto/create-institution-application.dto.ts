import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateInstitutionApplicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  institutionName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  representativeName: string;

  @IsEmail()
  contactEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  @MaxLength(300)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /*
   * 브라우저의 File.name을 별도로 전달받는다.
   *
   * Multer의 originalname에서 발생할 수 있는
   * 한글 파일명 인코딩 문제를 피하기 위해 사용한다.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  proofOriginalName?: string;
}
