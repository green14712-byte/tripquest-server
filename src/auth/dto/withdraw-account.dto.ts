import { IsString, MaxLength, MinLength } from 'class-validator';

export class WithdrawAccountDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;
}
