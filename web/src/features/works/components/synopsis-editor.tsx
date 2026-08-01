import { apiErrorMessage } from '@/features/auth/lib/api-error';
import { manuscriptMutations, manuscriptQueries } from '@/features/editor/api/manuscript.api';
import { SuggestionPicker } from '@/features/editor/components/suggestion-picker';
import { useWorksStore } from '@/features/shared/store/works.store';
import type { Work } from '@/features/shared/types';
import { useSynopsisContinueStream } from '@/features/works/api/synopsis-continue.api';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Save, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/** 시놉시스 화면의 제목·기획의도 편집 — 둘 다 blur 시 자동 저장(ADR-0011은 폐기, 이 두 필드로 대체). */
export function SynopsisEditor({ work }: { work: Work }) {
  const renameWork = useWorksStore((s) => s.renameWork);
  const [titleDraft, setTitleDraft] = useState(work.title);
  const [intentDraft, setIntentDraft] = useState('');
  // 마지막으로 저장에 성공한 값 — "취소"가 되돌아갈 기준점.
  const [savedIntent, setSavedIntent] = useState('');
  const [savedField, setSavedField] = useState<'title' | 'intent' | null>(null);
  const [showDraft, setShowDraft] = useState(false);
  const continueStream = useSynopsisContinueStream();
  const intentRef = useRef<HTMLTextAreaElement>(null);

  // 내용 길이에 맞춰 높이를 늘린다(상한 없음) — 높이를 초기화한 뒤 scrollHeight로
  // 다시 재는 표준 패턴. 로드·적용·취소 등 값이 바뀌는 모든 경로에서 동작한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentDraft가 바뀔 때만 높이 재계산
  useEffect(() => {
    const el = intentRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [intentDraft]);

  // eco: 시놉시스가 아직 없는 작품(404)은 흔한 정상 상태 — 에러 표시 없이 빈 값으로 시작한다.
  const synopsisQuery = useQuery({
    ...manuscriptQueries.synopsis({ path: { work_id: work.id } }),
    retry: false,
  });

  useEffect(() => {
    if (synopsisQuery.data) {
      setIntentDraft(synopsisQuery.data.body);
      setSavedIntent(synopsisQuery.data.body);
    }
  }, [synopsisQuery.data]);

  const updateSynopsis = useMutation(manuscriptMutations.updateSynopsis());

  const flashSaved = (field: 'title' | 'intent') => {
    setSavedField(field);
    setTimeout(() => setSavedField((f) => (f === field ? null : f)), 1500);
  };

  const commitTitle = () => {
    const title = titleDraft.trim() || '제목 없음';
    setTitleDraft(title);
    if (title === work.title) return;
    renameWork(work.id, title)
      .then(() => flashSaved('title'))
      .catch((err) => toast.error(apiErrorMessage(err, '제목을 저장하지 못했습니다')));
  };

  // 기획의도는 blur로 자동 저장하지 않는다 — "저장"/"취소" 버튼으로만 확정한다
  // (blur 자동 저장과 취소 버튼을 같이 두면, 취소 버튼을 누르는 클릭 자체가 먼저
  // blur를 발생시켜 취소가 무의미해진다).
  const commitIntent = () => {
    updateSynopsis.mutate(
      { path: { work_id: work.id }, body: { body: intentDraft } },
      {
        onSuccess: () => {
          setSavedIntent(intentDraft);
          flashSaved('intent');
        },
        onError: (err) => toast.error(apiErrorMessage(err, '기획의도를 저장하지 못했습니다')),
      }
    );
  };

  const cancelIntent = () => setIntentDraft(savedIntent);

  const runContinue = () => {
    if (!intentDraft.trim()) {
      toast.error('먼저 한두 문장을 써 주세요.');
      return;
    }
    setShowDraft(true);
    continueStream.start({ workId: work.id, payload: { text: intentDraft } });
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label="작품 제목"
          placeholder="제목 없음"
          className="min-w-0 flex-1 rounded-md bg-transparent px-1 font-serif text-[30px] font-bold leading-[1.3] tracking-[-0.01em] text-ink outline-none transition-colors placeholder:text-faintest hover:bg-surface focus:bg-surface"
        />
        {savedField === 'title' && <SavedBadge />}
      </div>

      <div className="mt-6">
        <label
          htmlFor="synopsis-intent"
          className="mb-1.5 block text-[12px] font-semibold tracking-[0.04em] text-muted-ink"
        >
          기획의도
        </label>
        <textarea
          ref={intentRef}
          id="synopsis-intent"
          value={intentDraft}
          onChange={(e) => setIntentDraft(e.target.value)}
          placeholder="왜 이 작품을 쓰나요? 독자에게 전하고 싶은 메시지는 무엇인가요?"
          rows={5}
          className="min-h-[120px] w-full resize-none overflow-hidden rounded-md border border-line bg-transparent p-3 font-serif text-[16.5px] leading-[1.9] text-ink outline-none placeholder:text-faintest focus:border-primary"
        />
        {showDraft ? (
          <div className="mt-2">
            <SuggestionPicker
              title="AI 이어쓰기"
              rawText={continueStream.text}
              isStreaming={continueStream.isStreaming}
              error={continueStream.error}
              onApply={(text) => {
                // eco: SuggestionPicker(parseSuggestions)가 후보 앞뒤 공백을 trim하므로,
                // 이어붙일 때 단어가 들러붙지 않도록 필요하면 공백을 하나 넣는다.
                setIntentDraft((prev) => {
                  const needsSpace = prev.length > 0 && !/\s$/.test(prev);
                  return prev + (needsSpace ? ' ' : '') + text;
                });
                setShowDraft(false);
              }}
              onCancel={() => {
                // 스트림을 먼저 끊는다 — 패널만 닫으면 SSE 생성이 끝까지 돌아 토큰이
                // 계속 탄다(편집기 이어쓰기의 dismissDraft와 같은 순서).
                continueStream.stop();
                setShowDraft(false);
              }}
            />
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={commitIntent}
              className="flex h-8 items-center gap-1.5 rounded-full border border-line bg-paper px-3.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface"
            >
              <Save className="size-[13px]" strokeWidth={2} />
              저장
            </button>
            <button
              type="button"
              onClick={cancelIntent}
              disabled={intentDraft === savedIntent}
              className="flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium text-faint transition-colors hover:bg-surface disabled:opacity-40"
            >
              취소
            </button>
            <button
              type="button"
              onClick={runContinue}
              className="flex h-8 items-center gap-1.5 rounded-full border border-ai/40 bg-ai/[0.06] px-3.5 text-[13px] font-medium text-ai transition-colors hover:bg-ai/[0.12]"
            >
              <Sparkles className="size-[13px]" strokeWidth={2} />
              AI 이어쓰기
            </button>
            {savedField === 'intent' && <SavedBadge />}
          </div>
        )}
      </div>
    </div>
  );
}

function SavedBadge() {
  return (
    <span className="flex shrink-0 items-center gap-1 text-[12px] text-success">
      <Check className="size-3.5" strokeWidth={2.4} />
      저장됨
    </span>
  );
}
