import { IsString, MaxLength, MinLength } from 'class-validator';

export class SuspendUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reason: string;
}
