import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSettingsStore } from '../store/settings.store';
import type { QualityTier } from '../types/settings';
import { SettingsSection } from './settings-section';

const TIERS: { value: QualityTier; label: string; tagline: string; detail: string }[] = [
  {
    value: 'economy',
    label: '저비용',
    tagline: '빠르고 저렴하게',
    detail: '초안·아이디어 스케치에 적합합니다. 토큰 소모가 가장 적습니다.',
  },
  {
    value: 'balanced',
    label: '균형',
    tagline: '품질과 비용의 균형',
    detail: '대부분의 집필 작업에 권장하는 기본값입니다.',
  },
  {
    value: 'premium',
    label: '고품질',
    tagline: '최고 품질 우선',
    detail: '중요한 장면·퇴고에 적합합니다. 토큰 소모가 가장 큽니다.',
  },
];

export function LlmScreen() {
  const saved = useSettingsStore((s) => s.qualityTier);
  const setQualityTier = useSettingsStore((s) => s.setQualityTier);
  const [tier, setTier] = useState<QualityTier>(saved);

  const onSave = () => {
    setQualityTier(tier);
    toast.success('LLM 설정을 저장했습니다');
  };

  return (
    <div className="max-w-[660px] px-12 pt-[34px] pb-16">
      <h1 className="mb-7 font-serif text-[27px] font-bold leading-[1.1] text-ink">LLM 설정</h1>

      <SettingsSection
        title="생성 품질 티어"
        description="작품 전체에 적용됩니다. 구체적인 모델은 작업 종류(이어쓰기·교정·구조 생성)에 맞춰 자동으로 선택되며, 선택한 티어가 그 기준이 됩니다."
      >
        <div className="flex flex-col gap-2.5">
          {TIERS.map((t) => {
            const selected = tier === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTier(t.value)}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                  selected
                    ? 'border-primary bg-primary/[0.04]'
                    : 'border-line hover:border-line-strong'
                )}
              >
                <div
                  className={cn(
                    'mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border',
                    selected ? 'border-primary bg-primary text-white' : 'border-line-strong'
                  )}
                >
                  {selected && <Check className="size-3" strokeWidth={3} />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-ink">{t.label}</span>
                    <span className="text-[12.5px] text-faint">{t.tagline}</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-[1.5] text-muted-ink">{t.detail}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          <Button type="button" onClick={onSave} disabled={tier === saved}>
            저장
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
}
