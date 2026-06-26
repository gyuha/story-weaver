import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { authorInitial, seedUsage, seedWorks, workspaceName } from '../mock/works';
import type {
  Entity,
  EntityField,
  EntityRelation,
  EntityType,
  Genre,
  Usage,
  Work,
  WritingStyle,
} from '../types';

export interface NewWorkInput {
  title: string;
  genre: Genre;
  keywords: string[];
  style: WritingStyle;
}

/** 새 엔티티 입력 — 공통 필드 + 유형별 필드(fields)·인물 전용(sampleLines/relations) */
export interface NewEntityInput {
  type: EntityType;
  name: string;
  emoji: string;
  imageUrl?: string;
  alias?: string;
  summary: string;
  fields: EntityField[];
  sampleLines?: string[];
  relations?: EntityRelation[];
}

interface WorksState {
  works: Work[];
  usage: Usage;
  workspaceName: string;
  authorInitial: string;
  addWork: (input: NewWorkInput) => string;
  acceptSuggestion: (workId: string, sceneId: string) => void;
  dismissSuggestion: (workId: string, sceneId: string) => void;
  acceptInlineSuggestion: (workId: string, sceneId: string) => void;
  dismissConflict: (workId: string, conflictId: string) => void;
  renameChapter: (workId: string, chapterId: string, title: string) => void;
  /** 지정한 부에 빈 화를 추가하고 새 화 id를 반환 (index = 작품 내 max+1) */
  addChapter: (workId: string, partLabel: string) => string;
  /** 새 부(제N부) + 그 안의 첫 화를 함께 생성하고 새 부 라벨을 반환 */
  addPart: (workId: string) => string;
  /** 한 부에 속한 모든 화의 partLabel을 일괄 교체 */
  renamePart: (workId: string, oldLabel: string, newLabel: string) => void;
  /** 과거 버전의 본문으로 현재 씬 본문을 덮어쓰기 (버전 기록 — 현재로 보내기) */
  restoreSceneVersion: (workId: string, sceneId: string, versionId: string) => void;
  /** 화 삭제 — 제거 후 같은 부의 남은 화를 1..n 연속 재번호 (복구 불가) */
  deleteChapter: (workId: string, chapterId: string) => void;
  /** 부 삭제 — 속한 화·씬 cascade 제거 후 남은 "제N부" 라벨 숫자 당김 (복구 불가) */
  deletePart: (workId: string, partLabel: string) => void;
  /** 씬에 엔티티(설정 참고)를 씬-엔티티 링크로 추가 — 중복 제외 */
  addSceneEntityLinks: (workId: string, sceneId: string, entityIds: string[]) => void;
  /** 씬의 씬-엔티티 링크(설정 참고) 하나 제거 */
  removeSceneEntityLink: (workId: string, sceneId: string, entityId: string) => void;
  /** World Bible에 새 엔티티 카드 추가, 새 id 반환 */
  addEntity: (workId: string, input: NewEntityInput) => string;
}

const SHORT_LABEL = (title: string) => title.trim().charAt(0) || '작';

export const useWorksStore = create<WorksState>()(
  immer((set, get) => ({
    works: seedWorks,
    usage: seedUsage,
    workspaceName,
    authorInitial,

    addWork: (input) => {
      const id = `work-${Date.now().toString(36)}`;
      set((state) => {
        state.works.unshift({
          id,
          title: input.title,
          shortLabel: SHORT_LABEL(input.title),
          genre: input.genre,
          subGenre: input.keywords[0] ?? input.genre,
          keywords: input.keywords,
          style: input.style,
          status: '구상',
          coverTheme: 'dark',
          stats: { chapters: 0, words: '0', wordsUnit: '천자', characters: 0, progress: 0 },
          lastEditedLabel: '방금 · 새 작품',
          reviewSummary: { scenes: 0, states: 0, conflicts: 0 },
          chapters: [],
          entities: [],
          timeline: [],
          conflicts: [],
        });
      });
      return id;
    },

    acceptSuggestion: (workId, sceneId) =>
      set((state) => {
        const scene = findScene(state.works, workId, sceneId);
        const work = state.works.find((w) => w.id === workId);
        if (!scene?.updateSuggestion || !work) return;
        work.timeline.push({
          id: `t-${Date.now().toString(36)}`,
          entityId: scene.updateSuggestion.entityId,
          entityName:
            work.entities.find((e) => e.id === scene.updateSuggestion?.entityId)?.name ?? '엔티티',
          chapterRef: `${scene.id}`,
          chapterIndex: 7,
          key: 'power_level',
          value: '천뢰검 2식',
          source: 'ai',
        });
        scene.updateSuggestion = undefined;
      }),

    dismissSuggestion: (workId, sceneId) =>
      set((state) => {
        const scene = findScene(state.works, workId, sceneId);
        if (scene) scene.updateSuggestion = undefined;
      }),

    acceptInlineSuggestion: (workId, sceneId) =>
      set((state) => {
        const scene = findScene(state.works, workId, sceneId);
        if (!scene?.aiSuggestion) return;
        scene.paragraphs.push({ text: scene.aiSuggestion });
        scene.aiSuggestion = undefined;
      }),

    dismissConflict: (workId, conflictId) =>
      set((state) => {
        const work = state.works.find((w) => w.id === workId);
        if (work) work.conflicts = work.conflicts.filter((c) => c.id !== conflictId);
      }),

    renameChapter: (workId, chapterId, title) =>
      set((state) => {
        const chapter = state.works
          .find((w) => w.id === workId)
          ?.chapters.find((c) => c.id === chapterId);
        if (chapter) chapter.title = title;
      }),

    addChapter: (workId, partLabel) => {
      const id = `ch-${Date.now().toString(36)}`;
      set((state) => {
        const work = state.works.find((w) => w.id === workId);
        if (!work) return;
        // 화 번호는 부(partLabel)별로 독립 증가
        const nextIndex =
          work.chapters
            .filter((c) => c.partLabel === partLabel)
            .reduce((m, c) => Math.max(m, c.index), 0) + 1;
        work.chapters.push({
          id,
          partLabel,
          index: nextIndex,
          title: '새 화',
          scenes: [
            {
              id: `${id}-s1`,
              title: '새 씬',
              status: 'empty',
              paragraphs: [],
              linkedEntityIds: [],
              vectorMemory: [],
            },
          ],
        });
      });
      return id;
    },

    // ponytail: 부는 partLabel 문자열일 뿐이라 "제N부"가 이미 있으면 트리에서 병합됨. mock 단계 수용.
    addPart: (workId) => {
      const work = get().works.find((w) => w.id === workId);
      const partCount = new Set(work?.chapters.map((c) => c.partLabel)).size;
      const label = `제${partCount + 1}부`;
      get().addChapter(workId, label);
      return label;
    },

    renamePart: (workId, oldLabel, newLabel) =>
      set((state) => {
        const work = state.works.find((w) => w.id === workId);
        if (!work) return;
        for (const c of work.chapters) {
          if (c.partLabel === oldLabel) c.partLabel = newLabel;
        }
      }),

    restoreSceneVersion: (workId, sceneId, versionId) =>
      set((state) => {
        const scene = findScene(state.works, workId, sceneId);
        const version = scene?.versions?.find((v) => v.id === versionId);
        if (!scene || !version) return;
        // eco: 현재 본문만 덮어쓰기 (새 스냅샷 적재는 안 함)
        scene.paragraphs = version.paragraphs.map((p) => ({ ...p }));
      }),

    deleteChapter: (workId, chapterId) =>
      set((state) => {
        const work = state.works.find((w) => w.id === workId);
        if (!work) return;
        const target = work.chapters.find((c) => c.id === chapterId);
        if (!target) return;
        const part = target.partLabel;
        work.chapters = work.chapters.filter((c) => c.id !== chapterId);
        // 같은 부의 남은 화를 배열 순서대로 1..n 재번호 (표시 번호는 화면용)
        let n = 1;
        for (const c of work.chapters) {
          if (c.partLabel === part) c.index = n++;
        }
      }),

    deletePart: (workId, partLabel) =>
      set((state) => {
        const work = state.works.find((w) => w.id === workId);
        if (!work) return;
        // cascade: 그 부의 화·씬 모두 제거
        work.chapters = work.chapters.filter((c) => c.partLabel !== partLabel);
        // 남은 부 라벨을 표시 순서대로 수집 (변경 전에 먼저 — mid-iteration 재처리 방지)
        const order: string[] = [];
        for (const c of work.chapters) {
          if (!order.includes(c.partLabel)) order.push(c.partLabel);
        }
        // "제N부…" 패턴만 순서대로 당겨 재번호 (이름 유지, 미일치 라벨은 카운터 미소비)
        const remap = new Map<string, string>();
        let n = 1;
        for (const label of order) {
          const m = label.match(/^제(\d+)부(.*)$/);
          if (!m) continue;
          remap.set(label, `제${n}부${m[2]}`);
          n++;
        }
        for (const c of work.chapters) {
          const next = remap.get(c.partLabel);
          if (next) c.partLabel = next;
        }
      }),

    addSceneEntityLinks: (workId, sceneId, entityIds) =>
      set((state) => {
        const scene = findScene(state.works, workId, sceneId);
        if (!scene) return;
        for (const id of entityIds) {
          if (!scene.linkedEntityIds.includes(id)) scene.linkedEntityIds.push(id);
        }
      }),

    removeSceneEntityLink: (workId, sceneId, entityId) =>
      set((state) => {
        const scene = findScene(state.works, workId, sceneId);
        if (!scene) return;
        scene.linkedEntityIds = scene.linkedEntityIds.filter((id) => id !== entityId);
      }),

    addEntity: (workId, input) => {
      const id = `e-${Date.now().toString(36)}`;
      set((state) => {
        const work = state.works.find((w) => w.id === workId);
        if (!work) return;
        const entity: Entity = {
          id,
          type: input.type,
          name: input.name,
          emoji: input.emoji,
          ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
          alias: input.alias || undefined,
          summary: input.summary,
          fields: input.fields,
          ...(input.sampleLines?.length ? { sampleLines: input.sampleLines } : {}),
          ...(input.relations?.length ? { relations: input.relations } : {}),
        };
        work.entities.push(entity);
      });
      return id;
    },
  }))
);

function findScene(works: Work[], workId: string, sceneId: string) {
  const work = works.find((w) => w.id === workId);
  if (!work) return undefined;
  for (const ch of work.chapters) {
    const scene = ch.scenes.find((s) => s.id === sceneId);
    if (scene) return scene;
  }
  return undefined;
}
