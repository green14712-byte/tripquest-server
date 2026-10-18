import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

const IV_LENGTH = 12;

const AUTH_TAG_LENGTH = 16;

const ENCRYPTION_VERSION = 'v1';

/*
 * 서버 환경변수에서 Mission QR 암호화 키를 가져온다.
 *
 * 키는 반드시 32byte여야 하며,
 * Base64 문자열 형태로 .env에 저장한다.
 *
 * 생성 예:
 *
 * node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
function getEncryptionKey(): Buffer {
  const encodedKey = process.env.MISSION_QR_ENCRYPTION_KEY?.trim();

  if (!encodedKey) {
    throw new Error(
      'MISSION_QR_ENCRYPTION_KEY 환경변수가 설정되어 있지 않습니다.',
    );
  }

  const key = Buffer.from(encodedKey, 'base64');

  if (key.length !== 32) {
    throw new Error(
      'MISSION_QR_ENCRYPTION_KEY는 Base64로 인코딩된 32byte 키여야 합니다.',
    );
  }

  return key;
}

/*
 * Mission QR 원본 토큰 암호화
 *
 * AES-256-GCM 사용
 *
 * 저장 형식:
 *
 * v1.IV.AUTH_TAG.CIPHERTEXT
 *
 * 각각의 값은 base64url 형식으로 저장한다.
 *
 * 예:
 *
 * v1.xxx.xxx.xxx
 */
export function encryptQrToken(qrToken: string): string {
  const key = getEncryptionKey();

  /*
   * AES-GCM에서는 같은 키를 사용하더라도
   * 매 암호화마다 새로운 IV를 생성해야 한다.
   */
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(qrToken, 'utf8'),
    cipher.final(),
  ]);

  /*
   * GCM 인증 태그
   *
   * 암호문이 변조되지 않았는지
   * 복호화할 때 검증하는 값이다.
   */
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

/*
 * Mission QR 원본 토큰 복호화
 *
 * 기관의 QR 보기 API에서 사용한다.
 */
export function decryptQrToken(encryptedQrToken: string): string {
  const key = getEncryptionKey();

  const parts = encryptedQrToken.split('.');

  if (parts.length !== 4) {
    throw new Error('올바르지 않은 QR 암호화 데이터 형식입니다.');
  }

  const [version, ivEncoded, authTagEncoded, encryptedEncoded] = parts;

  if (version !== ENCRYPTION_VERSION) {
    throw new Error('지원하지 않는 QR 암호화 데이터 버전입니다.');
  }

  const iv = Buffer.from(ivEncoded, 'base64url');

  const authTag = Buffer.from(authTagEncoded, 'base64url');

  const encrypted = Buffer.from(encryptedEncoded, 'base64url');

  if (iv.length !== IV_LENGTH) {
    throw new Error('올바르지 않은 QR 암호화 IV입니다.');
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('올바르지 않은 QR 인증 태그입니다.');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
