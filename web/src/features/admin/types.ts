// 관리자 화면 도메인 타입 (목업)

/** 계정 승인 상태 — 가입(pending) → 관리자 승인(approved) 또는 거부(rejected) */
export type MemberStatus = 'pending' | 'approved' | 'rejected';

/** 회원 — 관리자 관점의 가입 계정 (승인·집계 단위) */
export interface Member {
  id: string;
  email: string;
  displayName: string;
  signupDate: string; // '2026-06-24'
  status: MemberStatus;
  workCount: number;
}
