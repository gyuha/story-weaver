import type { Chapter, Work } from '@/features/shared/types';
import { cn } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react';

interface ReadingScreenProps {
  work: Work;
  chapter: Chapter;
  /** 이전 화 챕터 id */
  prevId?: string;
  /** 다음 화 챕터 id (없으면 마지막 화) */
  nextId?: string;
  /** "편집" 복귀 대상 — 이 챕터의 첫 씬 id */
  editSceneId?: string;
}

/**
 * 읽기 모드 — 작가용 read-only 몰입 뷰. 전역 TopBar·작업트리·메모리·AI를 모두
 * 걷어내고, 한 챕터(=화)의 비어있지 않은 씬을 씬 경계 없이 연속으로 보여준다.
 */
export function ReadingScreen({ work, chapter, prevId, nextId, editSceneId }: ReadingScreenProps) {
  // 비어있지 않은 씬만 이어 붙인다 — 독자 시점엔 빈 씬은 존재하지 않는다.
  const paragraphs = chapter.scenes
    .filter((s) => s.status !== 'empty' && s.paragraphs.length > 0)
    .flatMap((s) => s.paragraphs.map((p, i) => ({ ...p, key: `${s.id}-p${i}` })));

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      {/* 얇은 읽기 바 */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-5">
        <div className="flex min-w-0 items-center gap-2 text-[13.5px]">
          <span className="truncate text-muted-ink">{chapter.partLabel}</span>
          <ChevronRight className="size-3 shrink-0 text-line-strong" strokeWidth={2} />
          <span className="truncate font-medium text-ink">
            {chapter.index}화 · {chapter.title}
          </span>
        </div>
        <div className="flex-1" />
        <ChapterArrow work={work} chapterId={prevId} dir="prev" />
        <ChapterArrow work={work} chapterId={nextId} dir="next" />
        {editSceneId ? (
          <Link
            to="/works/$workId/write/$sceneId"
            params={{ workId: work.id, sceneId: editSceneId }}
            className="ml-1 flex h-7 items-center gap-1.5 rounded-[5px] bg-primary px-3 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Pencil className="size-[13px]" strokeWidth={2.2} />
            편집
          </Link>
        ) : (
          <Link
            to="/works/$workId/write"
            params={{ workId: work.id }}
            className="ml-1 flex h-7 items-center gap-1.5 rounded-[5px] bg-primary px-3 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Pencil className="size-[13px]" strokeWidth={2.2} />
            편집
          </Link>
        )}
      </header>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] px-6 pt-14 pb-24">
          <div className="mb-2.5 text-[12px] font-semibold tracking-[0.04em] text-genre">
            {chapter.partLabel.replace(/^(제\d+부)\s*/, '$1 · ')}
          </div>
          <h1 className="mb-9 font-serif text-[30px] font-bold leading-[1.3] tracking-[-0.01em] text-ink">
            {chapter.index}화 · {chapter.title}
          </h1>

          {paragraphs.length === 0 ? (
            <p className="font-serif text-[16.5px] leading-[1.95] text-faintest">
              아직 작성된 내용이 없습니다.
            </p>
          ) : (
            <div className="font-serif text-[16.5px] leading-[1.95] text-ink">
              {paragraphs.map((p) => (
                <p
                  key={p.key}
                  className={cn('mb-[17px]', p.text.startsWith('「') && 'text-ink-soft')}
                >
                  {p.text}
                </p>
              ))}
            </div>
          )}

          {/* 챕터 끝 — 다음 화 / 마지막 화 */}
          <div className="mt-16 flex items-center justify-center border-t border-line pt-8">
            {nextId ? (
              <Link
                to="/works/$workId/read/$chapterId"
                params={{ workId: work.id, chapterId: nextId }}
                className="flex h-9 items-center gap-1.5 rounded-md border border-line px-4 text-[13.5px] font-medium text-ink-soft transition-colors hover:bg-surface"
              >
                다음 화
                <ChevronRight className="size-4" strokeWidth={2} />
              </Link>
            ) : (
              <span className="text-[13px] text-faint">마지막 화입니다</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 읽기 바의 이전/다음 화 화살표. id가 없으면 비활성 표시. */
function ChapterArrow({
  work,
  chapterId,
  dir,
}: {
  work: Work;
  chapterId?: string;
  dir: 'prev' | 'next';
}) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight;
  const label = dir === 'prev' ? '이전 화' : '다음 화';
  const base =
    'grid size-7 place-items-center rounded-[5px] border border-line text-ink-soft transition-colors';
  if (!chapterId) {
    return (
      <span aria-label={label} className={cn(base, 'cursor-default opacity-30')}>
        <Icon className="size-4" strokeWidth={2} />
      </span>
    );
  }
  return (
    <Link
      to="/works/$workId/read/$chapterId"
      params={{ workId: work.id, chapterId }}
      aria-label={label}
      className={cn(base, 'hover:bg-surface')}
    >
      <Icon className="size-4" strokeWidth={2} />
    </Link>
  );
}
