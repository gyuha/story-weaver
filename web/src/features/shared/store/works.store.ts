import type { UpdateSuggestionResponse } from '@/api';
import { manuscriptApi } from '@/features/editor/api/manuscript.api';
import { suggestionApi } from '@/features/memory/api/suggestion.api';
import { worksApi } from '@/features/works/api/works.api';
import { worldBibleApi } from '@/features/world-bible/api/world-bible.api';
import { toApiEntityType } from '@/features/world-bible/lib/attributes-mapping';
import { fromEntityResponse, toAttributesPayload } from '@/features/world-bible/lib/entity-mapping';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { seedUsage } from '../mock/works';
import type {
  Chapter,
  Conflict,
  Entity,
  EntityField,
  EntityRelation,
  EntityType,
  Paragraph,
  TimelineState,
  UpdateSuggestion,
  Usage,
  Work,
} from '../types';

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
  /** 서버에서 조회한 작품 목록으로 교체 — 기존에 로컬로 채워진 nested 배열(챕터·엔티티 등)은 보존, 새 id는 빈 배열로 시작 */
  setWorks: (serverWorks: Work[]) => void;
  /** 서버에 생성된 작품(빈 nested 배열 포함 완성된 Work)을 그대로 목록에 추가 */
  addWorkFromServer: (work: Work) => void;
  /** 서버에서 조회한 부·화·씬 계층으로 해당 work의 chapters를 전량 교체 */
  setWorkChapters: (workId: string, chapters: Chapter[]) => void;
  /** 서버에서 조회한 엔티티별 타임라인 상태로 해당 work의 timeline을 전량 교체 */
  setWorkTimeline: (workId: string, timeline: TimelineState[]) => void;
  /** 서버에서 조회한 설정 충돌 후보로 해당 work의 conflicts를 전량 교체 */
  setWorkConflicts: (workId: string, conflicts: Conflict[]) => void;
  /** 서버에서 조회한 엔티티 카드로 해당 work의 entities를 전량 교체 — emoji/imageUrl/relations는
   * 백엔드에 없어(entity-mapping.ts) 기존 로컬 값이 있으면 보존 */
  setWorkEntities: (workId: string, entities: Entity[]) => void;
  /** 씬 본문에서 신규 설정 후보를 추출·매칭시키고, 대기중(pending) 제안을 조회해 스토어에 반영 */
  extractSceneUpdates: (workId: string, sceneId: string) => Promise<void>;
  /** 제안을 실 API로 승인 — 엔티티/타임라인에 반영, 성공 시 대기 목록에서 제거 */
  acceptSuggestion: (workId: string, sceneId: string, suggestionId: string) => Promise<void>;
  /** 제안을 실 API로 거절 — 데이터 변경 없음, 성공 시 대기 목록에서 제거 */
  dismissSuggestion: (workId: string, sceneId: string, suggestionId: string) => Promise<void>;
  acceptInlineSuggestion: (workId: string, sceneId: string) => void;
  dismissConflict: (workId: string, conflictId: string) => void;
  renameChapter: (workId: string, chapterId: string, title: string) => Promise<void>;
  /** 작품 제목을 실 API로 수정 — 시놉시스 화면의 인라인 편집용 */
  renameWork: (workId: string, title: string) => Promise<void>;
  /** 지정한 부에 빈 화를 추가하고 새 화 id를 반환 (index = 작품 내 max+1) */
  addChapter: (workId: string, partLabel: string) => Promise<string>;
  /** 새 부(제N부) + 그 안의 첫 화를 함께 생성하고 새 부 라벨을 반환 */
  addPart: (workId: string) => Promise<string>;
  /** 한 부에 속한 모든 화의 partLabel을 일괄 교체 */
  renamePart: (workId: string, oldLabel: string, newLabel: string) => Promise<void>;
  /** 과거 버전의 본문으로 현재 씬 본문을 덮어쓰기 (버전 기록 — 현재로 보내기) */
  restoreSceneVersion: (workId: string, sceneId: string, versionId: string) => void;
  /** 씬 본문 저장(PATCH) 성공 후 로컬 캐시에도 반영 */
  setSceneParagraphs: (workId: string, sceneId: string, paragraphs: Paragraph[]) => void;
  /** 화 삭제 — 제거 후 같은 부의 남은 화를 1..n 연속 재번호 (복구 불가) */
  deleteChapter: (workId: string, chapterId: string) => Promise<void>;
  /** 부 삭제 — 속한 화·씬 cascade 제거 후 남은 "제N부" 라벨 숫자 당김 (복구 불가) */
  deletePart: (workId: string, partLabel: string) => Promise<void>;
  /** 트리 드래그로 재배열한 화 순서를 실 API로 반영 — 성공 시 같은 부 안에서 순서·번호를 갱신 */
  reorderChapters: (
    workId: string,
    episodeId: string,
    orderedChapterIds: string[]
  ) => Promise<void>;
  /** 트리 드래그로 재배열한 부 순서를 실 API로 반영 — 성공 시 부 단위 블록을 새 순서로 재배치 */
  reorderParts: (workId: string, orderedPartLabels: string[]) => Promise<void>;
  /** 씬에 엔티티(설정 참고)를 씬-엔티티 링크로 추가 — 중복 제외, 실 API 성공 후 스토어 반영 */
  addSceneEntityLinks: (workId: string, sceneId: string, entityIds: string[]) => Promise<void>;
  /** 씬의 씬-엔티티 링크(설정 참고) 하나 제거 — 실 API 성공 후 스토어 반영 */
  removeSceneEntityLink: (workId: string, sceneId: string, entityId: string) => Promise<void>;
  /** World Bible에 새 엔티티 카드를 실 API로 생성, 성공 시 스토어에 추가하고 새 id 반환 */
  addEntity: (workId: string, input: NewEntityInput) => Promise<string>;
  /** 엔티티 카드 내용을 실 API로 수정 — type(카테고리)은 변경 불가, 성공 시 스토어에 반영 */
  updateEntity: (workId: string, entityId: string, input: NewEntityInput) => Promise<void>;
}

export const useWorksStore = create<WorksState>()(
  immer((set, get) => ({
    works: [],
    usage: seedUsage,

    setWorks: (serverWorks) =>
      set((state) => {
        const existingById = new Map(state.works.map((w) => [w.id, w]));
        state.works = serverWorks.map((work) => {
          const existing = existingById.get(work.id);
          return {
            ...work,
            chapters: existing?.chapters ?? [],
            entities: existing?.entities ?? [],
            timeline: existing?.timeline ?? [],
            conflicts: existing?.conflicts ?? [],
          };
        });
      }),

    addWorkFromServer: (work) =>
      set((state) => {
        state.works.unshift(work);
      }),

    setWorkChapters: (workId, chapters) =>
      set((state) => {
        const work = state.works.find((w) => w.id === workId);
        if (work) work.chapters = chapters;
      }),

    setWorkTimeline: (workId, timeline) =>
      set((state) => {
        const work = state.works.find((w) => w.id === workId);
        if (work) work.timeline = timeline;
      }),

    setWorkConflicts: (workId, conflicts) =>
      set((state) => {
        const work = state.works.find((w) => w.id === workId);
        if (work) work.conflicts = conflicts;
      }),

    setWorkEntities: (workId, entities) =>
      set((state) => {
        const work = state.works.find((w) => w.id === workId);
        if (!work) return;
        const existingById = new Map(work.entities.map((e) => [e.id, e]));
        work.entities = entities.map((entity) => {
          const existing = existingById.get(entity.id);
          if (!existing) return entity;
          return {
            ...entity,
            emoji: existing.emoji,
            ...(existing.imageUrl ? { imageUrl: existing.imageUrl } : {}),
            ...(existing.hanja ? { hanja: existing.hanja } : {}),
            ...(existing.relations ? { relations: existing.relations } : {}),
          };
        });
      }),

    extractSceneUpdates: async (workId, sceneId) => {
      await suggestionApi.extract({ path: { work_id: workId, scene_id: sceneId } });
      const suggestions = await suggestionApi.list({
        path: { work_id: workId, scene_id: sceneId },
      });
      const pending = suggestions.filter((s) => s.status === 'pending').map(toUpdateSuggestion);
      set((state) => {
        const scene = findScene(state.works, workId, sceneId);
        if (scene) scene.pendingSuggestions = pending;
      });
    },

    acceptSuggestion: async (workId, sceneId, suggestionId) => {
      await suggestionApi.approve({
        path: { work_id: workId, scene_id: sceneId, suggestion_id: suggestionId },
      });
      set((state) => {
        const scene = findScene(state.works, workId, sceneId);
        if (scene) {
          scene.pendingSuggestions = scene.pendingSuggestions?.filter((s) => s.id !== suggestionId);
        }
      });
    },

    dismissSuggestion: async (workId, sceneId, suggestionId) => {
      await suggestionApi.reject({
        path: { work_id: workId, scene_id: sceneId, suggestion_id: suggestionId },
      });
      set((state) => {
        const scene = findScene(state.works, workId, sceneId);
        if (scene) {
          scene.pendingSuggestions = scene.pendingSuggestions?.filter((s) => s.id !== suggestionId);
        }
      });
    },

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

    renameChapter: async (workId, chapterId, title) => {
      const chapter = get()
        .works.find((w) => w.id === workId)
        ?.chapters.find((c) => c.id === chapterId);
      if (!chapter) return;
      await manuscriptApi.updateChapter({
        path: { work_id: workId, episode_id: chapter.episodeId, chapter_id: chapterId },
        body: { title },
      });
      set((state) => {
        const c = state.works
          .find((w) => w.id === workId)
          ?.chapters.find((c) => c.id === chapterId);
        if (c) c.title = title;
      });
    },

    renameWork: async (workId, title) => {
      await worksApi.update({ path: { work_id: workId }, body: { title } });
      set((state) => {
        const work = state.works.find((w) => w.id === workId);
        if (work) work.title = title;
      });
    },

    addChapter: async (workId, partLabel) => {
      const work = get().works.find((w) => w.id === workId);
      const episodeId = work?.chapters.find((c) => c.partLabel === partLabel)?.episodeId;
      if (!work || !episodeId) throw new Error(`부를 찾을 수 없습니다: ${partLabel}`);
      // 화 번호는 부(partLabel)별로 독립 증가
      const nextIndex =
        work.chapters
          .filter((c) => c.partLabel === partLabel)
          .reduce((m, c) => Math.max(m, c.index), 0) + 1;
      const chapter = await createChapterAndScene(workId, episodeId, partLabel, nextIndex);
      set((state) => {
        state.works.find((w) => w.id === workId)?.chapters.push(chapter);
      });
      return chapter.id;
    },

    // ponytail: 부는 partLabel 문자열일 뿐이라 "제N부"가 이미 있으면 트리에서 병합됨. mock 단계 수용.
    addPart: async (workId) => {
      const work = get().works.find((w) => w.id === workId);
      if (!work) throw new Error(`작품을 찾을 수 없습니다: ${workId}`);
      const partCount = new Set(work.chapters.map((c) => c.partLabel)).size;
      const episode = await manuscriptApi.createEpisode({
        path: { work_id: workId },
        body: { title: `제${partCount + 1}부`, orderIndex: partCount },
      });
      const chapter = await createChapterAndScene(workId, episode.id, episode.title, 1);
      set((state) => {
        state.works.find((w) => w.id === workId)?.chapters.push(chapter);
      });
      return episode.title;
    },

    renamePart: async (workId, oldLabel, newLabel) => {
      const episodeId = get()
        .works.find((w) => w.id === workId)
        ?.chapters.find((c) => c.partLabel === oldLabel)?.episodeId;
      if (!episodeId) return;
      await manuscriptApi.updateEpisode({
        path: { work_id: workId, episode_id: episodeId },
        body: { title: newLabel },
      });
      set((state) => {
        const work = state.works.find((w) => w.id === workId);
        if (!work) return;
        for (const c of work.chapters) {
          if (c.partLabel === oldLabel) c.partLabel = newLabel;
        }
      });
    },

    restoreSceneVersion: (workId, sceneId, versionId) =>
      set((state) => {
        const scene = findScene(state.works, workId, sceneId);
        const version = scene?.versions?.find((v) => v.id === versionId);
        if (!scene || !version) return;
        // eco: 현재 본문만 덮어쓰기 (새 스냅샷 적재는 안 함)
        scene.paragraphs = version.paragraphs.map((p) => ({ ...p }));
      }),

    setSceneParagraphs: (workId, sceneId, paragraphs) =>
      set((state) => {
        const scene = findScene(state.works, workId, sceneId);
        if (scene) scene.paragraphs = paragraphs;
      }),

    deleteChapter: async (workId, chapterId) => {
      const target = get()
        .works.find((w) => w.id === workId)
        ?.chapters.find((c) => c.id === chapterId);
      if (!target) return;
      await manuscriptApi.deleteChapter({
        path: { work_id: workId, episode_id: target.episodeId, chapter_id: chapterId },
      });
      set((state) => {
        const work = state.works.find((w) => w.id === workId);
        if (!work) return;
        const part = target.partLabel;
        work.chapters = work.chapters.filter((c) => c.id !== chapterId);
        // 같은 부의 남은 화를 배열 순서대로 1..n 재번호 (표시 번호는 화면용)
        let n = 1;
        for (const c of work.chapters) {
          if (c.partLabel === part) c.index = n++;
        }
      });
    },

    deletePart: async (workId, partLabel) => {
      const episodeId = get()
        .works.find((w) => w.id === workId)
        ?.chapters.find((c) => c.partLabel === partLabel)?.episodeId;
      if (!episodeId) return;
      // cascade: DB의 ON DELETE CASCADE로 해당 부의 화·씬이 함께 삭제됨(manuscript_models.py)
      await manuscriptApi.deleteEpisode({ path: { work_id: workId, episode_id: episodeId } });
      set((state) => {
        const work = state.works.find((w) => w.id === workId);
        if (!work) return;
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
      });
    },

    reorderChapters: async (workId, episodeId, orderedChapterIds) => {
      await manuscriptApi.reorderChapters({
        path: { work_id: workId, episode_id: episodeId },
        body: orderedChapterIds,
      });
      set((state) => {
        const work = state.works.find((w) => w.id === workId);
        if (!work) return;
        const byId = new Map(work.chapters.map((c) => [c.id, c]));
        const reordered = orderedChapterIds
          .map((id) => byId.get(id))
          .filter((c): c is Chapter => !!c);
        reordered.forEach((c, i) => {
          c.index = i + 1;
        });
        let cursor = 0;
        work.chapters = work.chapters.map((c) =>
          c.episodeId === episodeId ? reordered[cursor++] : c
        );
      });
    },

    reorderParts: async (workId, orderedPartLabels) => {
      const work = get().works.find((w) => w.id === workId);
      if (!work) return;
      const episodeIds = orderedPartLabels
        .map((label) => work.chapters.find((c) => c.partLabel === label)?.episodeId)
        .filter((id): id is string => !!id);
      await manuscriptApi.reorderEpisodes({ path: { work_id: workId }, body: episodeIds });
      set((state) => {
        const w = state.works.find((w) => w.id === workId);
        if (!w) return;
        const groups = new Map<string, Chapter[]>();
        for (const c of w.chapters) {
          if (!groups.has(c.partLabel)) groups.set(c.partLabel, []);
          groups.get(c.partLabel)?.push(c);
        }
        w.chapters = orderedPartLabels.flatMap((label) => groups.get(label) ?? []);
      });
    },

    addSceneEntityLinks: async (workId, sceneId, entityIds) => {
      const scene = findScene(get().works, workId, sceneId);
      if (!scene) return;
      const newIds = entityIds.filter((id) => !scene.linkedEntityIds.includes(id));
      if (newIds.length === 0) return;
      await Promise.all(
        newIds.map((entityId) =>
          worldBibleApi.createSceneLink({
            path: { work_id: workId, scene_id: sceneId },
            body: { entityId },
          })
        )
      );
      set((state) => {
        const scene = findScene(state.works, workId, sceneId);
        if (!scene) return;
        for (const id of newIds) {
          if (!scene.linkedEntityIds.includes(id)) scene.linkedEntityIds.push(id);
        }
      });
    },

    removeSceneEntityLink: async (workId, sceneId, entityId) => {
      await worldBibleApi.deleteSceneLink({
        path: { work_id: workId, scene_id: sceneId, entity_id: entityId },
      });
      set((state) => {
        const scene = findScene(state.works, workId, sceneId);
        if (scene) scene.linkedEntityIds = scene.linkedEntityIds.filter((id) => id !== entityId);
      });
    },

    addEntity: async (workId, input) => {
      const created = await worldBibleApi.createEntity({
        path: { work_id: workId },
        body: {
          entityType: toApiEntityType(input.type),
          name: input.name,
          aliases: input.alias ? [input.alias] : [],
          summary: input.summary,
          attributes: toAttributesPayload(input.type, input.fields, input.sampleLines),
        },
      });
      const entity = decorateFromInput(fromEntityResponse(created), input);
      set((state) => {
        state.works.find((w) => w.id === workId)?.entities.push(entity);
      });
      return entity.id;
    },

    updateEntity: async (workId, entityId, input) => {
      // entity_type은 생성 후 불변이라 EntityUpdate에 필드 자체가 없음(worldbible_schemas.py)
      const updated = await worldBibleApi.updateEntity({
        path: { work_id: workId, entity_id: entityId },
        body: {
          name: input.name,
          aliases: input.alias ? [input.alias] : [],
          summary: input.summary,
          attributes: toAttributesPayload(input.type, input.fields, input.sampleLines),
        },
      });
      const entity = decorateFromInput(fromEntityResponse(updated), input);
      set((state) => {
        const entities = state.works.find((w) => w.id === workId)?.entities;
        const idx = entities?.findIndex((e) => e.id === entityId);
        if (entities && idx !== undefined && idx !== -1) entities[idx] = entity;
      });
    },
  }))
);

/** emoji/imageUrl/relations는 백엔드에 없어(entity-mapping.ts) 폼 입력값을 로컬에만 병합. */
function decorateFromInput(entity: Entity, input: NewEntityInput): Entity {
  entity.emoji = input.emoji;
  if (input.imageUrl) entity.imageUrl = input.imageUrl;
  if (input.relations?.length) entity.relations = input.relations;
  return entity;
}

/** 지정한 부(episodeId)에 화 하나 + 그 안의 첫 씬을 실 API로 생성해 웹 mock Chapter 모양으로 반환. */
async function createChapterAndScene(
  workId: string,
  episodeId: string,
  partLabel: string,
  orderIndex: number
): Promise<Chapter> {
  const chapter = await manuscriptApi.createChapter({
    path: { work_id: workId, episode_id: episodeId },
    body: { title: '새 화', orderIndex },
  });
  const scene = await manuscriptApi.createScene({
    path: { work_id: workId, episode_id: episodeId, chapter_id: chapter.id },
    body: { orderIndex: 0, title: '새 씬', body: '' },
  });
  return {
    id: chapter.id,
    episodeId,
    partLabel,
    index: chapter.orderIndex,
    title: chapter.title,
    scenes: [
      {
        id: scene.id,
        title: scene.title ?? '새 씬',
        status: 'empty',
        paragraphs: [],
        linkedEntityIds: [],
        vectorMemory: [],
      },
    ],
  };
}

/** 서버 응답(payload: 미분류 JSON)을 kind별로 좁힌 로컬 UpdateSuggestion 모양으로 매핑한다. */
function toUpdateSuggestion(s: UpdateSuggestionResponse): UpdateSuggestion {
  return { id: s.id, kind: s.kind, payload: s.payload } as UpdateSuggestion;
}

function findScene(works: Work[], workId: string, sceneId: string) {
  const work = works.find((w) => w.id === workId);
  if (!work) return undefined;
  for (const ch of work.chapters) {
    const scene = ch.scenes.find((s) => s.id === sceneId);
    if (scene) return scene;
  }
  return undefined;
}
