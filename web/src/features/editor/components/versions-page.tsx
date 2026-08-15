import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { apiErrorMessage } from '@/features/auth/lib/api-error';
import { manuscriptApi, manuscriptQueries } from '@/features/editor/api/manuscript.api';
import { VersionGroups } from '@/features/editor/components/version-list';
import { toParagraphs, useWorkChapters } from '@/features/editor/lib/hydrate-chapters';
import { findChapter, useWork } from '@/features/shared/store/selectors';
import { useWorksStore } from '@/features/shared/store/works.store';
import type { Chapter } from '@/features/shared/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import ReactDiffViewer, {
  DiffMethod,
  type ReactDiffViewerStylesOverride,
} from 'react-diff-viewer-continued';
import { toast } from 'sonner';

const PAGE_SIZE = 30;
// eco: version-history-modal.tsx와 동일한 "limit만 늘려 다시 받기" 방식 — 근거 주석은 그쪽 참조.
const MAX_LIMIT = 100;

// 라이브러리 기본값(모노스페이스·코드 배경)을 프로젝트 톤(paper/ink/line, 세리프 본문)으로 바꾸고,
// 단어 강조는 기존 모달 diff(version-history-modal.tsx의 DiffView)와 같은 초록/빨강 계열로 맞춘다.
// whiteSpace/lineBreak 등 줄바꿈 관련 기본값은 그대로 둔다(S1 스파이크 실측 — 이미 산문 줄바꿈 처리됨).
const diffViewerStyles: ReactDiffViewerStylesOverride = {
  // 라이브러리 diffContainer는 min-width:1000px을 걸고, 이를 푸는 미디어쿼리가 컨테이너가 아니라
  // 뷰포트(max-width:768px)를 본다. 이 페이지의 diff 창은 "뷰포트 − 사이드바 256px"이라
  // 뷰포트 769~1255px 구간에서 창이 1000px보다 좁아져 표가 넘치고 가로 스크롤이 생긴다.
  // 바닥을 없애면 창 폭을 그대로 따라가고 줄바꿈은 기본값(pre-wrap/lineBreak:anywhere)이 처리한다.
  diffContainer: { minWidth: 0 },
  variables: {
    light: {
      diffViewerBackground: 'var(--paper)',
      diffViewerColor: 'var(--ink)',
      addedBackground: 'color-mix(in srgb, var(--success) 8%, transparent)',
      addedColor: 'var(--success)',
      removedBackground: 'color-mix(in srgb, var(--danger) 8%, transparent)',
      removedColor: 'var(--danger)',
      wordAddedBackground: 'color-mix(in srgb, var(--success) 20%, transparent)',
      wordRemovedBackground: 'var(--danger-soft)',
      codeFoldGutterBackground: 'var(--surface)',
      codeFoldBackground: 'var(--surface-soft)',
      codeFoldContentColor: 'var(--muted-ink)',
      emptyLineBackground: 'var(--surface-soft)',
      diffViewerTitleBackground: 'var(--surface)',
      diffViewerTitleColor: 'var(--ink)',
      diffViewerTitleBorderColor: 'var(--line)',
    },
  },
  contentText: { fontFamily: 'var(--font-serif)', fontSize: '15px', lineHeight: '1.9' },
  // addedColor/removedColor(변수)는 marker(+/-)에만 적용된다 — 실제 단어 텍스트는 contentText가
  // 감싸 ink 색을 상속시키므로, 글자색은 wordAdded/wordRemoved에 직접 지정해야 한다(스크린샷 확인).
  // wordDiff 기본값이 textDecoration:none이라 <del>의 기본 취소선도 여기서 되살린다.
  wordAdded: { color: 'var(--success)' },
  wordRemoved: { color: 'var(--danger)', textDecoration: 'line-through !important' },
};

export function VersionsPage() {
  const { workId, chapterId } = useParams({ from: '/works/$workId/versions/$chapterId' });
  const work = useWork(workId);
  const { isPending, isError } = useWorkChapters(workId);
  const chapter = findChapter(work, chapterId);

  if (!work) return null;

  if (isPending) {
    return (
      <output
        aria-label="버전 기록을 불러오는 중"
        className="grid h-screen place-items-center p-10"
      >
        <div className="w-full max-w-md">
          <Skeleton className="mb-4 h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </output>
    );
  }

  if (isError) {
    return (
      <div className="grid h-screen place-items-center p-10">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>버전 기록을 불러오지 못했습니다</AlertTitle>
          <AlertDescription>잠시 후 다시 시도해 주세요.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="grid h-screen place-items-center px-6 text-center">
        <div>
          <div className="mb-2 text-sm text-muted-ink">화를 찾을 수 없습니다.</div>
          <Link
            to="/works/$workId/write"
            params={{ workId }}
            className="text-sm font-medium text-primary"
          >
            집필로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return <VersionsView workId={workId} chapter={chapter} />;
}

function VersionsView({ workId, chapter }: { workId: string; chapter: Chapter }) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  // 좌(기준)=항목 클릭으로 이동, 우(비교)="우로 지정" 마커로만 이동(기본값은 현재=최신 버전).
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);
  // 되돌리기 진행 중 — 버튼을 disabled로 만들어 더블클릭 재진입을 막는다.
  const [reverting, setReverting] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setChapterParagraphs = useWorksStore((s) => s.setChapterParagraphs);

  const chapterPath = { work_id: workId, episode_id: chapter.episodeId, chapter_id: chapter.id };

  const versionsQuery = useQuery(
    manuscriptQueries.chapterVersions({
      path: chapterPath,
      query: { limit, offset: 0 },
    })
  );
  const items = versionsQuery.data?.items ?? [];
  const total = versionsQuery.data?.total ?? 0;
  const latestId = items[0]?.id ?? null;
  const remaining = total - items.length;

  // 목록이 처음 로드되면 우=현재(최신 버전), 좌=그 직전 버전을 기본 선택한다.
  useEffect(() => {
    if (rightId === null && latestId !== null) {
      setRightId(latestId);
      setLeftId(items[1]?.id ?? null);
    }
  }, [rightId, latestId, items]);

  const rightQuery = useQuery({
    ...manuscriptQueries.chapterVersion({ path: { ...chapterPath, version_id: rightId ?? '' } }),
    enabled: rightId !== null,
  });
  const leftQuery = useQuery({
    ...manuscriptQueries.chapterVersion({ path: { ...chapterPath, version_id: leftId ?? '' } }),
    enabled: leftId !== null,
  });
  const rightBody = rightQuery.data?.body;
  // eco: 최초 버전(그 이전이 없는 좌)은 빈 문자열과 비교해 "전부 새로 추가됨"으로 보여준다.
  const leftBody = leftId === null ? '' : leftQuery.data?.body;
  const bodiesError = rightQuery.isError || (leftId !== null && leftQuery.isError);
  const sameVersion = leftId !== null && leftId === rightId;

  // 이 버전으로 되돌리기 — 좌(기준)로 찍힌 버전의 본문을 PATCH 한 번으로 되쓴다. 선저장은
  // 없다: 이 페이지에 들어올 때 집필 화면이 이미 저장을 보장했다(task #75 S1). 서버가 모든
  // 본문 PATCH에서 버전을 append하므로(ADR 260805-214733) 지금 본문도 새 버전으로 남는다.
  const revert = async () => {
    if (leftId === null || leftBody === undefined || reverting) return;
    setReverting(true);
    try {
      await manuscriptApi.updateChapter({ path: chapterPath, body: { body: leftBody } });
    } catch (err) {
      toast.error(apiErrorMessage(err, '이전 버전으로 되돌리지 못했습니다'));
      setReverting(false);
      return;
    }
    // 복귀한 집필 화면이 옛 본문을 보지 않도록 스토어를 먼저 갱신한다.
    setChapterParagraphs(workId, chapter.id, toParagraphs(leftBody));
    queryClient.invalidateQueries({
      queryKey: manuscriptQueries.chapterVersionsKey({ path: chapterPath }),
    });
    toast.success('이전 버전으로 되돌렸습니다');
    navigate({
      to: '/works/$workId/write/$chapterId',
      params: { workId, chapterId: chapter.id },
    });
  };

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-5">
        <Link
          to="/works/$workId/write/$chapterId"
          params={{ workId, chapterId: chapter.id }}
          className="flex h-7 items-center gap-1.5 rounded-[5px] px-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface"
        >
          <ArrowLeft className="size-4" strokeWidth={2} />
          집필로 돌아가기
        </Link>
        <span className="text-sm font-semibold text-ink">버전 기록 · {chapter.title}</span>

        <div className="ml-auto flex items-center gap-2.5">
          <span className="text-[12px] text-faint">현재 본문은 새 버전으로 보존됩니다</span>
          <button
            type="button"
            onClick={revert}
            disabled={reverting || leftId === null || leftBody === undefined}
            className="flex h-7 items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface disabled:opacity-40"
          >
            <Undo2 className="size-4" strokeWidth={2} />이 버전으로 되돌리기
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 좌: 버전 목록 — version-history-modal.tsx와 동일 컴포넌트(VersionGroups) 재사용 */}
        <div className="w-64 shrink-0 overflow-y-auto border-r border-line bg-surface-soft p-2">
          {versionsQuery.isPending ? (
            <div className="px-2.5 py-2 text-[12px] text-faint">불러오는 중…</div>
          ) : versionsQuery.isError ? (
            <div className="px-2.5 py-2 text-[12px] text-danger">
              버전 기록을 불러오지 못했습니다.
            </div>
          ) : items.length === 0 ? (
            <div className="px-2.5 py-2 text-[12px] text-faint">기록 없음</div>
          ) : (
            <>
              <VersionGroups
                items={items}
                latestId={latestId}
                selectedId={leftId}
                onSelect={setLeftId}
                rightId={rightId}
                onSetRight={setRightId}
              />
              {remaining > 0 && (
                <button
                  type="button"
                  onClick={() => setLimit((l) => Math.min(l + PAGE_SIZE, MAX_LIMIT))}
                  disabled={limit >= MAX_LIMIT}
                  className="mt-1 w-full rounded-md border border-line px-2.5 py-1.5 text-center text-[10.5px] text-ink-soft transition-colors hover:bg-surface disabled:opacity-40"
                >
                  더 보기 ({remaining}개 남음)
                </button>
              )}
            </>
          )}
        </div>

        {/* 우: 좌(기준) ↔ 우(비교) diff */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          {!rightId ? (
            <div className="flex h-full items-center justify-center text-[13px] text-faint">
              왼쪽에서 버전을 선택하면 본문이 표시됩니다.
            </div>
          ) : sameVersion ? (
            <div className="flex h-full items-center justify-center text-[13px] text-faint">
              변경 없음
            </div>
          ) : bodiesError ? (
            <div className="flex h-full items-center justify-center text-[13px] text-danger">
              버전을 불러오지 못했습니다.
            </div>
          ) : rightBody === undefined || leftBody === undefined ? (
            <div className="flex h-full items-center justify-center text-[13px] text-faint">
              불러오는 중…
            </div>
          ) : (
            <ReactDiffViewer
              oldValue={leftBody}
              newValue={rightBody}
              splitView
              compareMethod={DiffMethod.WORDS}
              hideLineNumbers
              showDiffOnly
              extraLinesSurroundingDiff={3}
              styles={diffViewerStyles}
            />
          )}
        </div>
      </div>
    </div>
  );
}
