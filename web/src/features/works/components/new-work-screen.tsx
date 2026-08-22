import { apiErrorMessage } from '@/features/auth/lib/api-error';
import { useWorksStore } from '@/features/shared/store/works.store';
import type { Work, WritingStyle } from '@/features/shared/types';
import { worksMutations } from '@/features/works/api/works.api';
import { GenreSelect } from '@/features/works/components/genre-select';
import { KeywordTagInput } from '@/features/works/components/keyword-tag-input';
import {
  GENRES,
  GENRE_PRESETS,
  type Genre,
  WRITING_STYLES,
} from '@/features/works/schema/genre-presets.schema';
import { cn } from '@/lib/utils';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const GENRE_ITEMS = GENRES.map((value) => ({ value, emoji: GENRE_PRESETS[value].emoji }));

/** 프리셋 선택 + 자유 태그를 대소문자 무시로 중복 제거해 병합 */
function mergeKeywords(preset: string[], free: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const k of [...preset, ...free]) {
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(k);
  }
  return merged;
}

export function NewWorkScreen() {
  const navigate = useNavigate();
  const addWorkFromServer = useWorksStore((s) => s.addWorkFromServer);
  const createWork = useMutation(worksMutations.create());

  const [step, setStep] = useState(1);
  const [genre, setGenre] = useState<Genre | null>(null);
  const [presetKeywords, setPresetKeywords] = useState<string[]>([]);
  const [freeTags, setFreeTags] = useState<string[]>([]);
  const [style, setStyle] = useState<WritingStyle>(WRITING_STYLES[0]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  const close = useCallback(() => navigate({ to: '/works' }), [navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const preset = genre ? GENRE_PRESETS[genre] : null;

  const selectGenre = (value: string) => {
    const nextGenre = value as Genre;
    if (nextGenre === genre) return; // 동일 장르 재선택 시 기존 프리셋 키워드·문체 유지
    setGenre(nextGenre);
    setPresetKeywords([]);
    setStyle(GENRE_PRESETS[nextGenre].defaultStyle);
  };

  const togglePresetKeyword = (k: string) =>
    setPresetKeywords((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const canGoNext = step === 1 ? !!genre : true;
  const canSubmit = title.trim().length > 0 && !createWork.isPending;

  const goToStep = (target: number) => {
    if (target < step) setStep(target);
  };

  const goPrev = () => {
    if (step > 1) setStep(step - 1);
  };

  const goNext = () => {
    if (!canGoNext) return;
    if (step < 3) {
      setStep(step + 1);
    } else {
      submit();
    }
  };

  const submit = async () => {
    if (!genre || !canSubmit) return;
    setError('');
    try {
      const created = await createWork.mutateAsync({
        body: {
          title: title.trim(),
          genre,
          keywords: mergeKeywords(presetKeywords, freeTags),
          style,
        },
      });
      const work: Work = {
        id: created.id,
        title: created.title,
        shortLabel: created.shortLabel,
        genre,
        subGenre: created.subGenre,
        keywords: created.keywords,
        style,
        styleNote: created.styleNote,
        status: created.status as Work['status'], // 새 작품은 서버에서 항상 '구상' (works_service.py)
        coverTheme: created.coverTheme as Work['coverTheme'], // 새 작품은 항상 'dark'
        stats: {
          chapters: created.stats.chapters ?? 0,
          words: created.stats.words ?? '0',
          wordsUnit: created.stats.wordsUnit ?? '천자',
          characters: created.stats.characters ?? 0,
          progress: created.stats.progress ?? 0,
        },
        lastEditedLabel: created.lastEditedLabel,
        chapters: [],
        entities: [],
        timeline: [],
        conflicts: [],
        reviewSummary: {
          scenes: created.reviewSummary.scenes ?? 0,
          states: created.reviewSummary.states ?? 0,
          conflicts: created.reviewSummary.conflicts ?? 0,
        },
      };
      addWorkFromServer(work);
      navigate({ to: '/works/$workId/write', params: { workId: work.id } });
    } catch (err) {
      setError(apiErrorMessage(err, '작품 생성에 실패했습니다. 잠시 후 다시 시도해주세요.'));
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-board p-6">
      <div className="relative flex max-h-[88vh] w-[660px] flex-col overflow-hidden rounded-xl bg-paper shadow-lg">
        {/* header */}
        <div className="border-b border-ink/[0.07] px-[30px] pt-6 pb-[18px]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[21px] font-bold tracking-[-0.01em]">새 작품 만들기</h2>
            <button type="button" onClick={close} aria-label="닫기">
              <X className="size-[19px] text-faint" strokeWidth={2} />
            </button>
          </div>
          <Steps current={step} onStepClick={goToStep} />
        </div>

        {/* body */}
        <div className="overflow-y-auto px-[30px] pt-6 pb-1">
          {step === 1 && (
            <>
              <FieldLabel>장르를 고르세요</FieldLabel>
              <div className="mb-[22px]">
                <GenreSelect items={GENRE_ITEMS} value={genre} onChange={selectGenre} />
              </div>

              {preset && (
                <>
                  <FieldLabel>
                    세부 키워드 <span className="font-normal text-faint">· 중복 선택</span>
                  </FieldLabel>
                  <div className="mb-[23px] flex flex-wrap gap-2">
                    {preset.keywords.map((k) => {
                      const on = presetKeywords.includes(k);
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => togglePresetKeyword(k)}
                          className={cn(
                            'rounded-full px-[13px] py-[7px] text-[13px] transition-colors',
                            on
                              ? 'bg-ink font-medium text-white'
                              : 'border border-line text-ink-soft hover:bg-surface'
                          )}
                        >
                          {k}
                        </button>
                      );
                    })}
                  </div>

                  <FieldLabel>
                    자유 키워드 <span className="font-normal text-faint">· 직접 입력</span>
                  </FieldLabel>
                  <div className="mb-6">
                    <KeywordTagInput
                      tags={freeTags}
                      onChange={setFreeTags}
                      reserved={presetKeywords}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {step === 2 && preset && (
            <>
              <FieldLabel>기본 문체</FieldLabel>
              <div className="mb-6 flex gap-2.5">
                {WRITING_STYLES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStyle(s)}
                    className={cn(
                      'flex-1 rounded-lg border px-3.5 py-3 text-left transition-colors',
                      style === s
                        ? 'border-[1.5px] border-primary bg-primary/[0.06]'
                        : 'border-line hover:bg-surface'
                    )}
                  >
                    <div
                      className={cn(
                        'mb-1.5 text-[13.5px]',
                        style === s ? 'font-semibold text-ink' : 'font-medium text-ink-soft'
                      )}
                    >
                      {s}
                    </div>
                    <div className="font-serif text-[12.5px] leading-[1.5] text-muted-ink">
                      {preset.styleSamples[s]}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <FieldLabel>작품 제목</FieldLabel>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                // 조합 중 Enter는 한글 확정용 — 여기서 제출하면 작품이 조기 생성된다
                onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()}
                placeholder="예: 검을 거꾸로 쥔 회귀자"
                className="h-[42px] w-full rounded-md border border-line-strong px-3.5 font-serif text-base font-semibold text-ink placeholder:font-normal placeholder:text-faintest focus:border-primary focus:shadow-[inset_0_0_0_2px_rgba(35,131,226,0.18)] focus:outline-none"
              />
              {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
            </>
          )}
        </div>

        {/* footer */}
        <div className="mt-1.5 flex items-center justify-between border-t border-ink/[0.07] px-[30px] pt-[18px] pb-[22px]">
          <span className="text-[12.5px] text-faint">전체이용가 수위로 생성됩니다</span>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={close}
              className="flex h-9 items-center rounded-[5px] border border-line-strong px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-surface"
            >
              취소
            </button>
            {step > 1 && (
              <button
                type="button"
                onClick={goPrev}
                className="flex h-9 items-center rounded-[5px] border border-line-strong px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-surface"
              >
                이전
              </button>
            )}
            <button
              type="button"
              onClick={goNext}
              disabled={step === 3 ? !canSubmit : !canGoNext}
              className="flex h-9 items-center gap-2 rounded-[5px] bg-primary px-[18px] text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {step === 3 ? (createWork.isPending ? '만드는 중…' : '작품 시작') : '다음'}
              <ArrowRight className="size-4" strokeWidth={2.2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 text-[13px] font-semibold text-ink">{children}</div>;
}

function Steps({
  current,
  onStepClick,
}: {
  current: number;
  onStepClick: (step: number) => void;
}) {
  const steps = ['장르', '문체', '제목'];
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <div key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onStepClick(n)}
              disabled={!done}
              className={cn(
                'flex items-center gap-[7px] text-[12.5px]',
                active || done ? 'font-semibold text-primary' : 'font-medium text-faint',
                done ? 'cursor-pointer' : 'cursor-default'
              )}
            >
              <span
                className={cn(
                  'grid size-5 place-items-center rounded-full text-[11px] font-semibold',
                  active || done
                    ? 'bg-primary text-white'
                    : 'border-[1.5px] border-line-strong text-faint'
                )}
              >
                {n}
              </span>
              {label}
            </button>
            {i < steps.length - 1 && <span className="h-px w-[22px] bg-line" />}
          </div>
        );
      })}
    </div>
  );
}
