import { IsEmail } from 'class-validator';

export class SendPasswordResetCodeDto {
  @IsEmail()
  email: string;
}
