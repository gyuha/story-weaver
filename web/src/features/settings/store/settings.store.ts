import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProfileSettings, QualityTier } from '../types/settings';

interface SettingsState {
  profile: ProfileSettings;
  qualityTier: QualityTier;
  setQualityTier: (tier: QualityTier) => void;
}

// 목업 사용자 설정: 백엔드 도입 전까지 localStorage에 영속화한다.
// (사용자별 설정 저장 API·LLMSettings 사용자화는 후속 작업 — ADR-0004)
// 프로필(displayName/avatarEmoji)은 서버(authApi.updateProfile)로 이전했고, 여기는 provider만 유지한다.
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      profile: { provider: 'email' },
      qualityTier: 'balanced',
      setQualityTier: (qualityTier) => set({ qualityTier }),
    }),
    { name: 'sw-settings' }
  )
);
