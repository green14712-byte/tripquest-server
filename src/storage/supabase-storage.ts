import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { randomUUID } from 'crypto';

export type StorageUploadFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

/*
 * 기존 기관 증빙자료 코드와의 호환을 위해
 * 기존 타입 이름을 그대로 유지한다.
 */
export type ProofUploadFile = StorageUploadFile;

/*
 * Challenge 대표사진 업로드용 타입
 */
export type ChallengeCoverUploadFile = StorageUploadFile;

/*
 * Challenge 완료 배지 중앙 이미지 업로드용 타입
 */
export type BadgeCenterImageUploadFile = StorageUploadFile;

/*
 * Mission 관광지 대표사진 업로드용 타입
 */
export type MissionPhotoUploadFile = StorageUploadFile;

/*
 * USER Mission 완료사진 업로드용 타입
 */
export type MissionCompletionPhotoUploadFile = StorageUploadFile;

/*
 * 기관 증빙자료 파일 제한
 */
export const MAX_PROOF_FILE_SIZE = 50 * 1024 * 1024;

export const MAX_APPLICATION_PROOF_TOTAL_SIZE = 300 * 1024 * 1024;

/*
 * Challenge 대표사진은
 * 한 장당 최대 10MB로 제한한다.
 */
export const MAX_CHALLENGE_COVER_FILE_SIZE = 10 * 1024 * 1024;

/*
 * Challenge 완료 배지 중앙 이미지도
 * 한 장당 최대 10MB로 제한한다.
 */
export const MAX_BADGE_CENTER_IMAGE_FILE_SIZE = 10 * 1024 * 1024;

/*
 * Mission 관광지 대표사진도
 * 한 장당 최대 10MB로 제한한다.
 */
export const MAX_MISSION_PHOTO_FILE_SIZE = 10 * 1024 * 1024;

/*
 * USER Mission 완료사진도
 * 한 장당 최대 10MB로 제한한다.
 */
export const MAX_MISSION_COMPLETION_PHOTO_FILE_SIZE = 10 * 1024 * 1024;

/*
 * 기관 증빙자료에서 허용하는 MIME 타입
 */
const ALLOWED_PROOF_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

/*
 * Challenge 대표사진에서 허용하는 MIME 타입
 *
 * SVG는 스크립트 등을 포함할 수 있으므로
 * 업로드 대상에서 제외한다.
 */
const ALLOWED_CHALLENGE_COVER_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/*
 * Challenge 완료 배지 중앙 이미지에서
 * 허용하는 MIME 타입
 *
 * SVG는 업로드 대상에서 제외하고
 * JPG / JPEG / PNG / WEBP만 허용한다.
 */
const ALLOWED_BADGE_CENTER_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/*
 * Mission 관광지 대표사진에서 허용하는 MIME 타입
 */
const ALLOWED_MISSION_PHOTO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/*
 * USER Mission 완료사진에서 허용하는 MIME 타입
 */
const ALLOWED_MISSION_COMPLETION_PHOTO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;

  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL 환경변수가 설정되어 있지 않습니다.');
  }

  if (!supabaseSecretKey) {
    throw new Error('SUPABASE_SECRET_KEY 환경변수가 설정되어 있지 않습니다.');
  }

  supabaseClient = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return supabaseClient;
}

function getBucketName() {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;

  if (!bucket) {
    throw new Error(
      'SUPABASE_STORAGE_BUCKET 환경변수가 설정되어 있지 않습니다.',
    );
  }

  return bucket;
}

/*
 * MIME 타입을 Storage 파일 확장자로 변환한다.
 */
function getExtension(mimetype: string) {
  switch (mimetype) {
    case 'application/pdf':
      return 'pdf';

    case 'image/jpeg':
      return 'jpg';

    case 'image/png':
      return 'png';

    case 'image/webp':
      return 'webp';

    default:
      throw new Error('지원하지 않는 파일 형식입니다.');
  }
}

/*
 * 파일이 실제 형식과 맞는지
 * 시작 바이트(File Signature)를 검사한다.
 *
 * 단순히 MIME 타입이나 확장자만 믿지 않는다.
 */
function hasValidFileSignature(file: StorageUploadFile) {
  /*
   * PDF
   *
   * %PDF-
   */
  if (file.mimetype === 'application/pdf') {
    if (file.buffer.length < 5) {
      return false;
    }

    return file.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  }

  /*
   * JPEG
   *
   * FF D8 FF
   */
  if (file.mimetype === 'image/jpeg') {
    if (file.buffer.length < 3) {
      return false;
    }

    return (
      file.buffer[0] === 0xff &&
      file.buffer[1] === 0xd8 &&
      file.buffer[2] === 0xff
    );
  }

  /*
   * PNG
   */
  if (file.mimetype === 'image/png') {
    if (file.buffer.length < PNG_SIGNATURE.length) {
      return false;
    }

    return file.buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
  }

  /*
   * WEBP
   *
   * 0~3 : RIFF
   * 8~11: WEBP
   */
  if (file.mimetype === 'image/webp') {
    if (file.buffer.length < 12) {
      return false;
    }

    const riffSignature = file.buffer.subarray(0, 4).toString('ascii');

    const webpSignature = file.buffer.subarray(8, 12).toString('ascii');

    return riffSignature === 'RIFF' && webpSignature === 'WEBP';
  }

  return false;
}

/*
 * 기관 가입 증빙자료 검증
 */
export function validateProofFile(file: ProofUploadFile) {
  if (!ALLOWED_PROOF_MIME_TYPES.has(file.mimetype)) {
    throw new Error(
      '증빙자료는 PDF, JPG, JPEG, PNG 파일만 업로드할 수 있습니다.',
    );
  }

  if (file.size <= 0) {
    throw new Error('비어 있는 파일은 업로드할 수 없습니다.');
  }

  if (file.size > MAX_PROOF_FILE_SIZE) {
    throw new Error('증빙자료 한 개의 최대 크기는 50MB입니다.');
  }

  if (!hasValidFileSignature(file)) {
    throw new Error('파일 내용과 파일 형식이 일치하지 않습니다.');
  }
}

/*
 * Challenge 대표사진 검증
 *
 * 허용:
 * JPG / JPEG / PNG / WEBP
 *
 * 최대:
 * 10MB
 */
export function validateChallengeCoverFile(file: ChallengeCoverUploadFile) {
  if (!ALLOWED_CHALLENGE_COVER_MIME_TYPES.has(file.mimetype)) {
    throw new Error(
      'Challenge 대표사진은 JPG, JPEG, PNG, WEBP 파일만 업로드할 수 있습니다.',
    );
  }

  if (file.size <= 0) {
    throw new Error('비어 있는 이미지는 업로드할 수 없습니다.');
  }

  if (file.size > MAX_CHALLENGE_COVER_FILE_SIZE) {
    throw new Error('Challenge 대표사진의 최대 크기는 10MB입니다.');
  }

  if (!hasValidFileSignature(file)) {
    throw new Error('이미지 내용과 파일 형식이 일치하지 않습니다.');
  }
}

/*
 * Challenge 완료 배지 중앙 이미지 검증
 *
 * 허용:
 * JPG / JPEG / PNG / WEBP
 *
 * 최대:
 * 10MB
 */
export function validateBadgeCenterImageFile(file: BadgeCenterImageUploadFile) {
  if (!ALLOWED_BADGE_CENTER_IMAGE_MIME_TYPES.has(file.mimetype)) {
    throw new Error(
      '완료 배지 이미지는 JPG, JPEG, PNG, WEBP 파일만 업로드할 수 있습니다.',
    );
  }

  if (file.size <= 0) {
    throw new Error('비어 있는 이미지는 업로드할 수 없습니다.');
  }

  if (file.size > MAX_BADGE_CENTER_IMAGE_FILE_SIZE) {
    throw new Error('완료 배지 이미지의 최대 크기는 10MB입니다.');
  }

  if (!hasValidFileSignature(file)) {
    throw new Error('이미지 내용과 파일 형식이 일치하지 않습니다.');
  }
}

/*
 * Mission 관광지 대표사진 검증
 */
export function validateMissionPhotoFile(file: MissionPhotoUploadFile) {
  if (!ALLOWED_MISSION_PHOTO_MIME_TYPES.has(file.mimetype)) {
    throw new Error(
      'Mission 대표사진은 JPG, JPEG, PNG, WEBP 파일만 업로드할 수 있습니다.',
    );
  }

  if (file.size <= 0) {
    throw new Error('비어 있는 이미지는 업로드할 수 없습니다.');
  }

  if (file.size > MAX_MISSION_PHOTO_FILE_SIZE) {
    throw new Error('Mission 대표사진의 최대 크기는 10MB입니다.');
  }

  if (!hasValidFileSignature(file)) {
    throw new Error('이미지 내용과 파일 형식이 일치하지 않습니다.');
  }
}

/*
 * USER Mission 완료사진 검증
 */
export function validateMissionCompletionPhotoFile(
  file: MissionCompletionPhotoUploadFile,
) {
  if (!ALLOWED_MISSION_COMPLETION_PHOTO_MIME_TYPES.has(file.mimetype)) {
    throw new Error(
      'Mission 완료사진은 JPG, JPEG, PNG, WEBP 파일만 업로드할 수 있습니다.',
    );
  }

  if (file.size <= 0) {
    throw new Error('비어 있는 이미지는 업로드할 수 없습니다.');
  }

  if (file.size > MAX_MISSION_COMPLETION_PHOTO_FILE_SIZE) {
    throw new Error('Mission 완료사진의 최대 크기는 10MB입니다.');
  }

  if (!hasValidFileSignature(file)) {
    throw new Error('이미지 내용과 파일 형식이 일치하지 않습니다.');
  }
}

/*
 * 기관 가입 증빙자료 업로드
 */
export async function uploadInstitutionProof(
  applicationId: number,
  file: ProofUploadFile,
) {
  validateProofFile(file);

  const supabase = getSupabaseClient();
  const bucket = getBucketName();
  const extension = getExtension(file.mimetype);

  const fileKey =
    `applications/${applicationId}/` + `${randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileKey, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
      cacheControl: '3600',
    });

  if (error) {
    throw new Error(`증빙자료 업로드에 실패했습니다: ${error.message}`);
  }

  return fileKey;
}

/*
 * 기관 가입 증빙자료 삭제
 */
export async function deleteInstitutionProof(fileKey: string) {
  const supabase = getSupabaseClient();
  const bucket = getBucketName();

  const { error } = await supabase.storage.from(bucket).remove([fileKey]);

  if (error) {
    throw new Error(`증빙자료 삭제에 실패했습니다: ${error.message}`);
  }
}

/*
 * 기관 가입 증빙자료 열람용 Signed URL
 */
export async function createInstitutionProofSignedUrl(
  fileKey: string,
  expiresInSeconds = 2400,
) {
  const supabase = getSupabaseClient();
  const bucket = getBucketName();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(fileKey, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `증빙자료 열람 URL 생성에 실패했습니다: ${
        error?.message ?? '알 수 없는 오류'
      }`,
    );
  }

  return data.signedUrl;
}

/*
 * Challenge 대표사진 업로드
 *
 * 예:
 * challenge-covers/15/uuid.jpg
 */
export async function uploadChallengeCover(
  challengeId: number,
  file: ChallengeCoverUploadFile,
) {
  validateChallengeCoverFile(file);

  const supabase = getSupabaseClient();
  const bucket = getBucketName();
  const extension = getExtension(file.mimetype);

  const fileKey =
    `challenge-covers/${challengeId}/` + `${randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileKey, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
      cacheControl: '3600',
    });

  if (error) {
    throw new Error(
      `Challenge 대표사진 업로드에 실패했습니다: ${error.message}`,
    );
  }

  return fileKey;
}

/*
 * Challenge 대표사진 삭제
 */
export async function deleteChallengeCover(fileKey: string) {
  const supabase = getSupabaseClient();
  const bucket = getBucketName();

  const { error } = await supabase.storage.from(bucket).remove([fileKey]);

  if (error) {
    throw new Error(`Challenge 대표사진 삭제에 실패했습니다: ${error.message}`);
  }
}

/*
 * Challenge 대표사진 표시용 Signed URL
 */
export async function createChallengeCoverSignedUrl(
  fileKey: string,
  expiresInSeconds = 3600,
) {
  const supabase = getSupabaseClient();
  const bucket = getBucketName();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(fileKey, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Challenge 대표사진 URL 생성에 실패했습니다: ${
        error?.message ?? '알 수 없는 오류'
      }`,
    );
  }

  return data.signedUrl;
}

/*
 * Challenge 완료 배지 중앙 이미지 업로드
 *
 * 예:
 * challenge-badges/15/uuid.jpg
 *
 * Challenge.id를 기준으로 경로를 분리하고
 * 실제 파일명은 UUID를 사용한다.
 */
export async function uploadBadgeCenterImage(
  challengeId: number,
  file: BadgeCenterImageUploadFile,
) {
  validateBadgeCenterImageFile(file);

  const supabase = getSupabaseClient();
  const bucket = getBucketName();
  const extension = getExtension(file.mimetype);

  const fileKey =
    `challenge-badges/${challengeId}/` + `${randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileKey, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
      cacheControl: '3600',
    });

  if (error) {
    throw new Error(`완료 배지 이미지 업로드에 실패했습니다: ${error.message}`);
  }

  return fileKey;
}

/*
 * Challenge 완료 배지 중앙 이미지 삭제
 *
 * 실제로 삭제해도 되는지 여부는
 * ChallengesService에서 과거 BadgeVersion 참조 여부를
 * 먼저 검사한 뒤 결정한다.
 */
export async function deleteBadgeCenterImage(fileKey: string) {
  const supabase = getSupabaseClient();
  const bucket = getBucketName();

  const { error } = await supabase.storage.from(bucket).remove([fileKey]);

  if (error) {
    throw new Error(`완료 배지 이미지 삭제에 실패했습니다: ${error.message}`);
  }
}

/*
 * Challenge 완료 배지 중앙 이미지 표시용 Signed URL
 *
 * private Storage이므로 원본 key 대신
 * Signed URL을 사용한다.
 */
export async function createBadgeCenterImageSignedUrl(
  fileKey: string,
  expiresInSeconds = 3600,
) {
  const supabase = getSupabaseClient();
  const bucket = getBucketName();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(fileKey, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `완료 배지 이미지 URL 생성에 실패했습니다: ${
        error?.message ?? '알 수 없는 오류'
      }`,
    );
  }

  return data.signedUrl;
}

/*
 * Mission 관광지 대표사진 업로드
 *
 * 예:
 * mission-photos/25/uuid.jpg
 */
export async function uploadMissionPhoto(
  missionId: number,
  file: MissionPhotoUploadFile,
) {
  validateMissionPhotoFile(file);

  const supabase = getSupabaseClient();
  const bucket = getBucketName();
  const extension = getExtension(file.mimetype);

  const fileKey =
    `mission-photos/${missionId}/` + `${randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileKey, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
      cacheControl: '3600',
    });

  if (error) {
    throw new Error(`Mission 대표사진 업로드에 실패했습니다: ${error.message}`);
  }

  return fileKey;
}

/*
 * Mission 관광지 대표사진 삭제
 */
export async function deleteMissionPhoto(fileKey: string) {
  const supabase = getSupabaseClient();
  const bucket = getBucketName();

  const { error } = await supabase.storage.from(bucket).remove([fileKey]);

  if (error) {
    throw new Error(`Mission 대표사진 삭제에 실패했습니다: ${error.message}`);
  }
}

/*
 * Mission 관광지 대표사진 표시용 Signed URL
 */
export async function createMissionPhotoSignedUrl(
  fileKey: string,
  expiresInSeconds = 3600,
) {
  const supabase = getSupabaseClient();
  const bucket = getBucketName();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(fileKey, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Mission 대표사진 URL 생성에 실패했습니다: ${
        error?.message ?? '알 수 없는 오류'
      }`,
    );
  }

  return data.signedUrl;
}

/*
 * USER Mission 완료사진 업로드
 *
 * 예:
 * mission-completion-photos/35/uuid.jpg
 */
export async function uploadMissionCompletionPhoto(
  completionId: number,
  file: MissionCompletionPhotoUploadFile,
) {
  validateMissionCompletionPhotoFile(file);

  const supabase = getSupabaseClient();
  const bucket = getBucketName();
  const extension = getExtension(file.mimetype);

  const fileKey =
    `mission-completion-photos/${completionId}/` +
    `${randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileKey, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
      cacheControl: '3600',
    });

  if (error) {
    throw new Error(`Mission 완료사진 업로드에 실패했습니다: ${error.message}`);
  }

  return fileKey;
}

/*
 * USER Mission 완료사진 삭제
 */
export async function deleteMissionCompletionPhoto(fileKey: string) {
  const supabase = getSupabaseClient();
  const bucket = getBucketName();

  const { error } = await supabase.storage.from(bucket).remove([fileKey]);

  if (error) {
    throw new Error(`Mission 완료사진 삭제에 실패했습니다: ${error.message}`);
  }
}

/*
 * USER Mission 완료사진 표시용 Signed URL
 */
export async function createMissionCompletionPhotoSignedUrl(
  fileKey: string,
  expiresInSeconds = 3600,
) {
  const supabase = getSupabaseClient();
  const bucket = getBucketName();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(fileKey, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Mission 완료사진 URL 생성에 실패했습니다: ${
        error?.message ?? '알 수 없는 오류'
      }`,
    );
  }

  return data.signedUrl;
}
