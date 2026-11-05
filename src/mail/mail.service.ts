import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.getOrThrow<string>('MAIL_HOST'),
      port: Number(this.configService.getOrThrow<string>('MAIL_PORT')),
      secure: this.configService.get<string>('MAIL_SECURE') === 'true',

      auth: {
        user: this.configService.getOrThrow<string>('MAIL_USER'),
        pass: this.configService.getOrThrow<string>('MAIL_PASS'),
      },
    });
  }

  /*
   * 회원가입 이메일 인증번호 발송
   */
  async sendVerificationCode(to: string, code: string): Promise<void> {
    const mailFrom = this.configService.getOrThrow<string>('MAIL_FROM');

    await this.transporter.sendMail({
      from: mailFrom,
      to,
      subject: '[Korea Trip Quest] 회원가입 이메일 인증번호',
      text:
        `Korea Trip Quest 회원가입 인증번호는 ${code}입니다.\n\n` +
        '인증번호는 10분 동안 유효합니다.',
    });
  }

  /*
   * 비밀번호 재설정 인증번호 발송
   */
  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    const mailFrom = this.configService.getOrThrow<string>('MAIL_FROM');

    await this.transporter.sendMail({
      from: mailFrom,
      to,
      subject: '[Korea Trip Quest] 비밀번호 재설정 인증번호',
      text:
        `Korea Trip Quest 비밀번호 재설정 인증번호는 ${code}입니다.\n\n` +
        '인증번호는 10분 동안 유효합니다.\n\n' +
        '본인이 요청하지 않았다면 이 메일을 무시해주세요.',
    });
  }
}
