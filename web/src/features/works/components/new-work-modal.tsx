import { useWorksStore } from '@/features/shared/store/works.store';
import type { Genre, WritingStyle } from '@/features/shared/types';
import { cn } from '@/lib/utils';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const GENRES: { value: Genre; emoji: string }[] = [
  { value: '무협', emoji: '⚔️' },
  { value: '로맨스 판타지', emoji: '🌹' },
  { value: '정통 판타지', emoji: '🐉' },
  { value: '현대 판타지', emoji: '🌆' },
  { value: 'SF', emoji: '🛸' },
  { value: '미스터리', emoji: '🕯️' },
];

const KEYWORDS = ['회귀 / 환생', '성장', '복수극', '정파 / 사파', '힐링'];

const STYLES: { value: WritingStyle; sample: string }[] = [
  { value: '간결체', sample: '"그는 검을 들었다. 망설임은 없었다."' },
  { value: '만연체', sample: '"그는 오래도록 검을 응시하다, 끝내…"' },
  { value: '서정체', sample: '"검끝에 새벽 서리가 맺혔다."' },
];

export function NewWorkModal() {
  const navigate = useNavigate();
  const addWork = useWorksStore((s) => s.addWork);

  const [genre, setGenre] = useState<Genre | null>('무협');
  const [keywords, setKeywords] = useState<string[]>(['회귀 / 환생']);
  const [style, setStyle] = useState<WritingStyle>('간결체');
  const [title, setTitle] = useState('');

  const close = useCallback(() => navigate({ to: '/works' }), [navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const step = !genre ? 1 : !style ? 2 : 3;
  const canSubmit = !!genre && !!style && title.trim().length > 0;

  const submit = () => {
    if (!canSubmit || !genre) return;
    const id = addWork({ title: title.trim(), genre, keywords, style });
    navigate({ to: '/works/$workId/write', params: { workId: id } });
  };

  const toggleKeyword = (k: string) =>
    setKeywords((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(15,15,15,0.30)] p-6">
      <button type="button" aria-label="닫기" className="absolute inset-0" onClick={close} />
      <div className="relative flex max-h-[88vh] w-[660px] flex-col overflow-hidden rounded-xl bg-paper shadow-lg">
        {/* header */}
        <div className="border-b border-ink/[0.07] px-[30px] pt-6 pb-[18px]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[21px] font-bold tracking-[-0.01em]">새 작품 만들기</h2>
            <button type="button" onClick={close} aria-label="닫기">
              <X className="size-[19px] text-faint" strokeWidth={2} />
            </button>
          </div>
          <Steps current={step} />
        </div>

        {/* body */}
        <div className="overflow-y-auto px-[30px] pt-6 pb-1">
          <FieldLabel>장르를 고르세요</FieldLabel>
          <div className="mb-[22px] grid grid-cols-3 gap-2.5">
            {GENRES.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGenre(g.value)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg border px-3 py-3.5 text-sm transition-colors',
                  genre === g.value
                    ? 'border-[1.5px] border-primary bg-primary/[0.06] font-semibold text-ink'
                    : 'border-line text-ink-soft hover:bg-surface'
                )}
              >
                <span className="text-xl leading-none">{g.emoji}</span>
                {g.value}
              </button>
            ))}
          </div>

          <FieldLabel>
            세부 키워드 <span className="font-normal text-faint">· 중복 선택</span>
          </FieldLabel>
          <div className="mb-[23px] flex flex-wrap gap-2">
            {KEYWORDS.map((k) => {
              const on = keywords.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleKeyword(k)}
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

          <FieldLabel>기본 문체</FieldLabel>
          <div className="mb-6 flex gap-2.5">
            {STYLES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStyle(s.value)}
                className={cn(
                  'flex-1 rounded-lg border px-3.5 py-3 text-left transition-colors',
                  style === s.value
                    ? 'border-[1.5px] border-primary bg-primary/[0.06]'
                    : 'border-line hover:bg-surface'
                )}
              >
                <div
                  className={cn(
                    'mb-1.5 text-[13.5px]',
                    style === s.value ? 'font-semibold text-ink' : 'font-medium text-ink-soft'
                  )}
                >
                  {s.value}
                </div>
                <div className="font-serif text-[12.5px] leading-[1.5] text-muted-ink">
                  {s.sample}
                </div>
              </button>
            ))}
          </div>

          <FieldLabel>작품 제목</FieldLabel>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="예: 검을 거꾸로 쥔 회귀자"
            className="h-[42px] w-full rounded-md border border-line-strong px-3.5 font-serif text-base font-semibold text-ink placeholder:font-normal placeholder:text-faintest focus:border-primary focus:shadow-[inset_0_0_0_2px_rgba(35,131,226,0.18)] focus:outline-none"
          />
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
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="flex h-9 items-center gap-2 rounded-[5px] bg-primary px-[18px] text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              작품 시작
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

function Steps({ current }: { current: number }) {
  const steps = ['장르', '문체', '제목'];
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <div key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'flex items-center gap-[7px] text-[12.5px]',
                active || done ? 'font-semibold text-primary' : 'font-medium text-faint'
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
            </span>
            {i < steps.length - 1 && <span className="h-px w-[22px] bg-line" />}
          </div>
        );
      })}
    </div>
  );
}
