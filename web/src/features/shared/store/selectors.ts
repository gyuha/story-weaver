import { useShallow } from 'zustand/react/shallow';
import type { Chapter, Entity, Scene, Work } from '../types';
import { useWorksStore } from './works.store';

export function useWorks(): Work[] {
  return useWorksStore((s) => s.works);
}

export function useUsage() {
  return useWorksStore((s) => s.usage);
}

export function useWorkspaceMeta() {
  return useWorksStore(
    useShallow((s) => ({
      workspaceName: s.workspaceName,
      authorInitial: s.authorInitial,
    }))
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

export interface SceneLocation {
  scene: Scene;
  chapter: Chapter;
}

/** 작품 내 모든 씬을 (씬, 챕터) 쌍으로 펼친다. */
export function flattenScenes(work: Work): SceneLocation[] {
  return work.chapters.flatMap((chapter) => chapter.scenes.map((scene) => ({ scene, chapter })));
}

export function findSceneLocation(
  work: Work | undefined,
  sceneId: string | undefined
): SceneLocation | undefined {
  if (!work) return undefined;
  for (const chapter of work.chapters) {
    const scene = chapter.scenes.find((s) => s.id === sceneId);
    if (scene) return { scene, chapter };
  }
  return undefined;
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

/** 편집 대상으로 적합한 첫 씬(빈 씬 제외, 없으면 첫 씬) */
export function defaultSceneId(work: Work | undefined): string | undefined {
  if (!work) return undefined;
  const all = flattenScenes(work);
  const draft = all.find((l) => l.scene.status === 'draft');
  return (draft ?? all[0])?.scene.id;
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
