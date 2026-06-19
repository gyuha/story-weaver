/** 사용자가 LLM 설정에서 작품 전체에 적용하는 생성 품질 수준 (ADR-0004). */
export type QualityTier = 'economy' | 'balanced' | 'premium';

/** 가입 경로 — 비밀번호 변경 노출 여부를 가른다. */
export type AuthProvider = 'email' | 'google' | 'kakao' | 'naver';

export interface ProfileSettings {
  displayName: string;
  avatarEmoji: string;
  provider: AuthProvider;
}
