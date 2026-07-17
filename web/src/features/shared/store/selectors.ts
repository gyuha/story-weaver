import { useAuthStore } from '@/features/auth/store/auth.store';
import { useShallow } from 'zustand/react/shallow';
import type { Chapter, Entity, Work } from '../types';
import { useWorksStore } from './works.store';

export function useWorks(): Work[] {
  return useWorksStore((s) => s.works);
}

export function useUsage() {
  return useWorksStore((s) => s.usage);
}

export function useWorkspaceMeta() {
  return useAuthStore(
    useShallow((s) => {
      const workspaceName = s.user?.display_name || '내 서재';
      return { workspaceName, authorInitial: workspaceName.charAt(0) };
    })
  );
}

export function useWork(workId: string | undefined): Work | undefined {
  return useWorksStore((s) => s.works.find((w) => w.id === workId));
}

export function useEntity(workId: string | undefined, entityId: string | undefined) {
  return useWorksStore((s) =>
    s.works.find((w) => w.id === workId)?.entities.find((e) => e.id === entityId)
  );
}

/** 지정한 id의 화를 찾는다 — 씬 계층 폐지 후 findSceneLocation의 화 버전. */
export function findChapter(
  work: Work | undefined,
  chapterId: string | undefined
): Chapter | undefined {
  return work?.chapters.find((c) => c.id === chapterId);
}

export interface ChapterNav {
  chapter: Chapter;
  /** 이전 화 챕터 id (없으면 undefined) */
  prevId?: string;
  /** 다음 화 챕터 id (없으면 undefined = 마지막 화) */
  nextId?: string;
}

/** 챕터(=화)와 그 이전/다음 화를 함께 도출한다. 읽기 모드의 챕터 내비 근거. */
export function findChapterNav(
  work: Work | undefined,
  chapterId: string | undefined
): ChapterNav | undefined {
  if (!work) return undefined;
  const idx = work.chapters.findIndex((c) => c.id === chapterId);
  if (idx === -1) return undefined;
  return {
    chapter: work.chapters[idx],
    prevId: idx > 0 ? work.chapters[idx - 1].id : undefined,
    nextId: idx < work.chapters.length - 1 ? work.chapters[idx + 1].id : undefined,
  };
}

/** 편집 대상으로 적합한 첫 화(빈 화 제외, 없으면 첫 화) — 씬 계층 폐지 후 defaultSceneId의 화 버전. */
export function defaultChapterId(work: Work | undefined): string | undefined {
  if (!work) return undefined;
  const draft = work.chapters.find((c) => c.status === 'draft');
  return (draft ?? work.chapters[0])?.id;
}

/** 작품의 챕터를 부(part) 단위로 묶는다. */
export function groupChaptersByPart(work: Work): { part: string; chapters: Chapter[] }[] {
  const order: string[] = [];
  const map = new Map<string, Chapter[]>();
  for (const chapter of work.chapters) {
    if (!map.has(chapter.partLabel)) {
      map.set(chapter.partLabel, []);
      order.push(chapter.partLabel);
    }
    map.get(chapter.partLabel)?.push(chapter);
  }
  return order.map((part) => ({ part, chapters: map.get(part) ?? [] }));
}

export function entitiesByType(entities: Entity[]) {
  const groups: { type: Entity['type']; items: Entity[] }[] = [];
  for (const type of ['인물', '장소', '사건', '아이템'] as const) {
    const items = entities.filter((e) => e.type === type);
    if (items.length) groups.push({ type, items });
  }
  return groups;
}
