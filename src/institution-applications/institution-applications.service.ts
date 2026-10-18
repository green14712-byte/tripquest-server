import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { db } from '../prisma/db';

import {
  createInstitutionProofSignedUrl,
  deleteInstitutionProof,
  MAX_APPLICATION_PROOF_TOTAL_SIZE,
  type ProofUploadFile,
  uploadInstitutionProof,
  validateProofFile,
} from '../storage/supabase-storage';

type CreateInstitutionApplicationData = {
  institutionName: string;
  representativeName: string;
  contactEmail: string;
  contactPhone?: string;
  address?: string;
  website?: string;
  description?: string;

  /*
   * 브라우저의 File.name 값을
   * multipart 문자열 필드로 별도 전달받는다.
   */
  proofOriginalName?: string;
};

@Injectable()
export class InstitutionApplicationsService {
  /*
   * Multer / Busboy를 거치면서
   * UTF-8 한글 파일명이 latin1 또는 Windows-1252처럼
   * 잘못 해석되는 경우를 복구한다.
   *
   * proofOriginalName이 전달되는 신규 요청에서는
   * 보통 이 복구가 필요하지 않다.
   *
   * 기존 클라이언트나 fallback 상황을 위해 유지한다.
   */
  private decodeOriginalName(originalName: string) {
    /*
     * 이미 정상적인 한글 파일명이면
     * 별도의 변환을 하지 않는다.
     */
    const hasHangul = /[\u3131-\u318E\uAC00-\uD7A3]/;

    if (hasHangul.test(originalName)) {
      return originalName;
    }

    /*
     * UTF-8 바이트가 Windows-1252 문자로
     * 잘못 해석된 경우를 복구하기 위한 역매핑
     */
    const windows1252ToByte: Record<number, number> = {
      0x20ac: 0x80,
      0x201a: 0x82,
      0x0192: 0x83,
      0x201e: 0x84,
      0x2026: 0x85,
      0x2020: 0x86,
      0x2021: 0x87,
      0x02c6: 0x88,
      0x2030: 0x89,
      0x0160: 0x8a,
      0x2039: 0x8b,
      0x0152: 0x8c,
      0x017d: 0x8e,

      0x2018: 0x91,
      0x2019: 0x92,
      0x201c: 0x93,
      0x201d: 0x94,
      0x2022: 0x95,
      0x2013: 0x96,
      0x2014: 0x97,
      0x02dc: 0x98,
      0x2122: 0x99,
      0x0161: 0x9a,
      0x203a: 0x9b,
      0x0153: 0x9c,
      0x017e: 0x9e,
      0x0178: 0x9f,
    };

    const bytes: number[] = [];

    for (const character of originalName) {
      const codePoint = character.codePointAt(0);

      if (codePoint === undefined) {
        return originalName;
      }

      /*
       * Latin-1 영역 문자는
       * 코드값을 원래 바이트로 사용한다.
       */
      if (codePoint <= 0xff) {
        bytes.push(codePoint);
        continue;
      }

      /*
       * Windows-1252 특수문자는
       * 원래 0x80~0x9F 바이트로 복구한다.
       */
      const mappedByte = windows1252ToByte[codePoint];

      if (mappedByte !== undefined) {
        bytes.push(mappedByte);
        continue;
      }

      /*
       * 복구할 수 없는 문자가 있으면
       * 무리하게 변환하지 않는다.
       */
      return originalName;
    }

    const decoded = Buffer.from(bytes).toString('utf8');

    /*
     * 잘못된 UTF-8 변환이면
     * replacement character가 들어간다.
     */
    if (decoded.includes('\uFFFD')) {
      return originalName;
    }

    /*
     * 복구 결과 한글이 확인되면
     * NFC 정규화 후 사용한다.
     */
    if (hasHangul.test(decoded)) {
      return decoded.normalize('NFC');
    }

    return originalName;
  }

  /*
   * DB에 저장하기 전에 파일명을 정리한다.
   */
  private normalizeOriginalName(originalName: string) {
    const decodedName = this.decodeOriginalName(originalName);

    /*
     * 경로 문자열이 들어오더라도
     * 실제 파일명 부분만 사용한다.
     */
    const normalized =
      decodedName
        .replace(/\\/g, '/')
        .split('/')
        .pop()
        ?.replace(/[\u0000-\u001F\u007F]/g, '')
        .trim() || 'proof';

    return normalized.slice(0, 255);
  }

  /*
   * Storage의 실제 fileKey는
   * 프런트에 직접 노출하지 않는다.
   */
  private toPublicProof(proof: {
    id: number;
    applicationId: number;
    originalName: string;
    mimeType: string;
    fileSize: number;
    createdAt: string;
  }) {
    return {
      id: proof.id,
      applicationId: proof.applicationId,
      originalName: proof.originalName,
      mimeType: proof.mimeType,
      fileSize: proof.fileSize,
      createdAt: proof.createdAt,
    };
  }

  /*
   * 기관 가입 신청
   *
   * 첫 번째 증빙자료는 필수다.
   *
   * 1. 신청 DB 생성
   * 2. Storage 업로드
   * 3. InstitutionApplicationProof 생성
   *
   * 실패 시 생성된 데이터를 정리한다.
   */
  async create(
    applicantId: number,
    dto: CreateInstitutionApplicationData,
    proofFile: ProofUploadFile | undefined,
  ) {
    const user = await db.orm.public.User.first({
      id: applicantId,
    });

    if (!user) {
      throw new BadRequestException('사용자를 찾을 수 없습니다.');
    }

    if (user.role === 'INSTITUTION' || user.institutionId !== null) {
      throw new ConflictException('이미 기관 계정으로 승인된 사용자입니다.');
    }

    const existingPending = await db.orm.public.InstitutionApplication.first({
      applicantId,
      status: 'PENDING',
    });

    if (existingPending) {
      throw new ConflictException('이미 처리 중인 기관 가입 신청이 있습니다.');
    }

    if (!proofFile) {
      throw new BadRequestException('기관 증빙자료를 한 개 이상 첨부해주세요.');
    }

    try {
      validateProofFile(proofFile);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : '증빙자료를 확인할 수 없습니다.',
      );
    }

    if (proofFile.size > MAX_APPLICATION_PROOF_TOTAL_SIZE) {
      throw new BadRequestException(
        '기관 가입 신청 한 건에 등록할 수 있는 증빙자료 전체 용량은 최대 300MB입니다.',
      );
    }

    let application: Awaited<
      ReturnType<typeof db.orm.public.InstitutionApplication.create>
    > | null = null;

    let fileKey: string | null = null;

    try {
      /*
       * 먼저 기관 가입 신청을 만든다.
       */
      application = await db.orm.public.InstitutionApplication.create({
        applicantId,

        institutionName: dto.institutionName.trim(),

        representativeName: dto.representativeName.trim(),

        contactEmail: dto.contactEmail.trim().toLowerCase(),

        contactPhone: dto.contactPhone?.trim() || null,

        address: dto.address?.trim() || null,

        website: dto.website?.trim() || null,

        description: dto.description?.trim() || null,

        /*
         * 기존 단일 증빙자료 필드는
         * 호환성을 위해 유지한다.
         */
        proofFileKey: null,
      });

      /*
       * application.id 기준으로
       * Storage에 첫 번째 파일 업로드
       */
      fileKey = await uploadInstitutionProof(application.id, proofFile);

      /*
       * 파일 메타데이터 DB 저장
       *
       * 핵심:
       * Multer의 proofFile.originalname보다
       * 브라우저에서 별도로 보낸 proofOriginalName을
       * 우선 사용한다.
       */
      const proof = await db.orm.public.InstitutionApplicationProof.create({
        applicationId: application.id,

        fileKey,

        originalName: this.normalizeOriginalName(
          dto.proofOriginalName?.trim() || proofFile.originalname,
        ),

        mimeType: proofFile.mimetype,

        fileSize: proofFile.size,
      });

      return {
        message: '기관 가입 신청이 접수되었습니다.',

        application: {
          id: application.id,

          applicantId: application.applicantId,

          institutionName: application.institutionName,

          representativeName: application.representativeName,

          contactEmail: application.contactEmail,

          contactPhone: application.contactPhone,

          address: application.address,

          website: application.website,

          description: application.description,

          status: application.status,

          createdAt: application.createdAt,

          updatedAt: application.updatedAt,
        },

        proof: this.toPublicProof(proof),
      };
    } catch (error) {
      /*
       * Storage에 파일이 올라간 뒤
       * DB 저장이 실패했다면 Storage 파일 삭제
       */
      if (fileKey) {
        try {
          await deleteInstitutionProof(fileKey);
        } catch {
          /*
           * cleanup 오류가
           * 원래 오류를 덮어쓰지 않도록 한다.
           */
        }
      }

      /*
       * 신청은 만들어졌지만
       * 첫 증빙자료 등록이 실패했다면
       * 불완전한 신청도 삭제한다.
       */
      if (application) {
        try {
          await db.orm.public.InstitutionApplication.where({
            id: application.id,
          }).delete();
        } catch {
          /*
           * cleanup 오류가
           * 원래 오류를 덮어쓰지 않도록 한다.
           */
        }
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(
        '기관 가입 신청 처리 중 오류가 발생했습니다.',
      );
    }
  }

  /*
   * 기존 PENDING 신청에
   * 증빙자료 한 개 추가
   */
  async addProof(
    applicantId: number,
    applicationId: number,
    proofFile: ProofUploadFile | undefined,
    proofOriginalName?: string,
  ) {
    const application = await db.orm.public.InstitutionApplication.first({
      id: applicationId,
    });

    if (!application) {
      throw new NotFoundException('기관 가입 신청을 찾을 수 없습니다.');
    }

    /*
     * 다른 사용자의 신청 번호를 넣어도
     * 존재 여부를 노출하지 않는다.
     */
    if (application.applicantId !== applicantId) {
      throw new NotFoundException('기관 가입 신청을 찾을 수 없습니다.');
    }

    if (application.status !== 'PENDING') {
      throw new ConflictException(
        '이미 처리된 기관 가입 신청에는 증빙자료를 추가할 수 없습니다.',
      );
    }

    if (!proofFile) {
      throw new BadRequestException('추가할 증빙자료를 선택해주세요.');
    }

    try {
      validateProofFile(proofFile);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : '증빙자료를 확인할 수 없습니다.',
      );
    }

    /*
     * 현재 신청에 등록된 증빙자료의
     * 총 파일 크기를 계산한다.
     */
    const existingProofs =
      await db.orm.public.InstitutionApplicationProof.where({
        applicationId,
      }).all();

    const currentTotalSize = existingProofs.reduce(
      (total, proof) => total + proof.fileSize,
      0,
    );

    const nextTotalSize = currentTotalSize + proofFile.size;

    if (nextTotalSize > MAX_APPLICATION_PROOF_TOTAL_SIZE) {
      const currentMb = (currentTotalSize / (1024 * 1024)).toFixed(1);

      const newFileMb = (proofFile.size / (1024 * 1024)).toFixed(1);

      throw new BadRequestException(
        `증빙자료 전체 용량은 최대 300MB입니다. 현재 ${currentMb}MB가 등록되어 있으며 선택한 파일은 ${newFileMb}MB입니다.`,
      );
    }

    let fileKey: string | null = null;

    try {
      /*
       * Storage에 파일 업로드
       */
      fileKey = await uploadInstitutionProof(applicationId, proofFile);

      /*
       * 추가 파일 메타데이터 저장
       *
       * 브라우저에서 전달한 정상 파일명을
       * Multer originalname보다 우선 사용한다.
       */
      const proof = await db.orm.public.InstitutionApplicationProof.create({
        applicationId,

        fileKey,

        originalName: this.normalizeOriginalName(
          proofOriginalName?.trim() || proofFile.originalname,
        ),

        mimeType: proofFile.mimetype,

        fileSize: proofFile.size,
      });

      return {
        message: '증빙자료가 추가되었습니다.',

        proof: this.toPublicProof(proof),

        totalSize: nextTotalSize,
      };
    } catch (error) {
      /*
       * DB 저장 실패 시
       * Storage에 올라간 파일 정리
       */
      if (fileKey) {
        try {
          await deleteInstitutionProof(fileKey);
        } catch {
          /*
           * cleanup 오류가
           * 원래 오류를 덮어쓰지 않도록 한다.
           */
        }
      }

      throw new InternalServerErrorException(
        '증빙자료 추가 중 오류가 발생했습니다.',
      );
    }
  }

  /*
   * 본인이 제출한 기관 가입 신청 조회
   */
  async findMyApplications(applicantId: number) {
    return db.orm.public.InstitutionApplication.where({
      applicantId,
    }).all();
  }

  /*
   * ADMIN: 승인 대기 신청
   */
  async findPendingApplications() {
    return db.orm.public.InstitutionApplication.where({
      status: 'PENDING',
    }).all();
  }

  /*
   * ADMIN: 전체 신청 이력
   */
  async findAllApplications() {
    return db.orm.public.InstitutionApplication.all();
  }

  /*
   * ADMIN: 특정 신청 상세
   *
   * 다중 증빙자료 목록도 함께 반환한다.
   */
  async findApplicationById(applicationId: number) {
    const application = await db.orm.public.InstitutionApplication.first({
      id: applicationId,
    });

    if (!application) {
      throw new NotFoundException('기관 가입 신청을 찾을 수 없습니다.');
    }

    const proofs = await db.orm.public.InstitutionApplicationProof.where({
      applicationId,
    }).all();

    return {
      ...application,

      proofs: proofs.map((proof) => this.toPublicProof(proof)),
    };
  }

  /*
   * ADMIN: 다중 증빙자료 Signed URL
   *
   * URL 유효시간:
   * 40분 = 2400초
   */
  async createProofSignedUrl(applicationId: number, proofId: number) {
    const application = await db.orm.public.InstitutionApplication.first({
      id: applicationId,
    });

    if (!application) {
      throw new NotFoundException('기관 가입 신청을 찾을 수 없습니다.');
    }

    /*
     * proofId와 applicationId를 함께 검사해서
     * 다른 신청의 파일을 조회하지 못하게 한다.
     */
    const proof = await db.orm.public.InstitutionApplicationProof.first({
      id: proofId,
      applicationId,
    });

    if (!proof) {
      throw new NotFoundException('증빙자료를 찾을 수 없습니다.');
    }

    const expiresIn = 2400;

    try {
      const signedUrl = await createInstitutionProofSignedUrl(
        proof.fileKey,
        expiresIn,
      );

      return {
        signedUrl,
        expiresIn,

        proof: {
          id: proof.id,

          originalName: proof.originalName,

          mimeType: proof.mimeType,

          fileSize: proof.fileSize,
        },
      };
    } catch {
      throw new InternalServerErrorException(
        '증빙자료 열람 URL 생성에 실패했습니다.',
      );
    }
  }

  /*
   * 기존 단일 proofFileKey 데이터 호환
   */
  async createLegacyProofSignedUrl(applicationId: number) {
    const application = await db.orm.public.InstitutionApplication.first({
      id: applicationId,
    });

    if (!application) {
      throw new NotFoundException('기관 가입 신청을 찾을 수 없습니다.');
    }

    if (!application.proofFileKey) {
      throw new NotFoundException('기존 방식으로 등록된 증빙자료가 없습니다.');
    }

    const expiresIn = 2400;

    try {
      const signedUrl = await createInstitutionProofSignedUrl(
        application.proofFileKey,
        expiresIn,
      );

      return {
        signedUrl,
        expiresIn,
      };
    } catch {
      throw new InternalServerErrorException(
        '증빙자료 열람 URL 생성에 실패했습니다.',
      );
    }
  }

  /*
   * ADMIN: 기관 가입 신청 승인
   */
  async approve(applicationId: number, reviewerId: number) {
    const application = await db.orm.public.InstitutionApplication.first({
      id: applicationId,
    });

    if (!application) {
      throw new NotFoundException('기관 가입 신청을 찾을 수 없습니다.');
    }

    if (application.status !== 'PENDING') {
      throw new ConflictException('이미 처리된 기관 가입 신청입니다.');
    }

    /*
     * 새 다중 증빙자료 또는
     * 기존 legacy 증빙자료가
     * 최소 한 개는 있어야 한다.
     */
    const proofs = await db.orm.public.InstitutionApplicationProof.where({
      applicationId,
    }).all();

    if (proofs.length === 0 && !application.proofFileKey) {
      throw new ConflictException(
        '증빙자료가 없는 기관 가입 신청은 승인할 수 없습니다.',
      );
    }

    const applicant = await db.orm.public.User.first({
      id: application.applicantId,
    });

    if (!applicant) {
      throw new NotFoundException('신청자 계정을 찾을 수 없습니다.');
    }

    if (applicant.role === 'INSTITUTION' || applicant.institutionId !== null) {
      throw new ConflictException('이미 기관 계정으로 승인된 사용자입니다.');
    }

    const reviewedAt = new Date().toISOString();

    /*
     * 기관 생성,
     * 사용자 권한 변경,
     * 신청 승인 처리를
     * 하나의 DB 트랜잭션으로 처리한다.
     */
    const result = await db.transaction(async (tx) => {
      const institution = await tx.orm.public.Institution.create({
        name: application.institutionName,

        description: application.description,
      });

      const updatedUser = await tx.orm.public.User.where({
        id: application.applicantId,
      }).update({
        role: 'INSTITUTION',

        institutionId: institution.id,
      });

      if (!updatedUser) {
        throw new NotFoundException(
          '기관 사용자로 변경할 계정을 찾을 수 없습니다.',
        );
      }

      const updatedApplication =
        await tx.orm.public.InstitutionApplication.where({
          id: application.id,
        }).update({
          status: 'APPROVED',

          reviewerId,

          reviewedAt,

          rejectionReason: null,
        });

      if (!updatedApplication) {
        throw new NotFoundException(
          '승인 처리할 기관 가입 신청을 찾을 수 없습니다.',
        );
      }

      return {
        institution,
        user: updatedUser,
        application: updatedApplication,
      };
    });

    return {
      message: '기관 가입 신청을 승인했습니다.',

      institution: result.institution,

      application: result.application,

      user: {
        id: result.user.id,

        email: result.user.email,

        nickname: result.user.nickname,

        role: result.user.role,

        institutionId: result.user.institutionId,
      },
    };
  }

  /*
   * ADMIN: 기관 가입 신청 거절
   */
  async reject(applicationId: number, reviewerId: number, reason: string) {
    const application = await db.orm.public.InstitutionApplication.first({
      id: applicationId,
    });

    if (!application) {
      throw new NotFoundException('기관 가입 신청을 찾을 수 없습니다.');
    }

    if (application.status !== 'PENDING') {
      throw new ConflictException('이미 처리된 기관 가입 신청입니다.');
    }

    const rejectionReason = reason.trim();

    if (rejectionReason.length < 2) {
      throw new BadRequestException('거절 사유를 입력해주세요.');
    }

    const updatedApplication = await db.orm.public.InstitutionApplication.where(
      {
        id: application.id,
      },
    ).update({
      status: 'REJECTED',

      reviewerId,

      reviewedAt: new Date().toISOString(),

      rejectionReason,
    });

    if (!updatedApplication) {
      throw new NotFoundException(
        '거절 처리할 기관 가입 신청을 찾을 수 없습니다.',
      );
    }

    return {
      message: '기관 가입 신청을 거절했습니다.',

      application: updatedApplication,
    };
  }
}
