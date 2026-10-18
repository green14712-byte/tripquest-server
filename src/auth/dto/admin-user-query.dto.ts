import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminUserQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['USER', 'INSTITUTION', 'ADMIN'])
  role?: 'USER' | 'INSTITUTION' | 'ADMIN';

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED', 'DELETED'])
  status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
}
