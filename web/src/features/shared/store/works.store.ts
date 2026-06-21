import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { authorInitial, seedUsage, seedWorks, workspaceName } from '../mock/works';
import type { Genre, Usage, Work, WritingStyle } from '../types';

export interface NewWorkInput {
  title: string;
  genre: Genre;
  keywords: string[];
  style: WritingStyle;
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
}

const SHORT_LABEL = (title: string) => title.trim().charAt(0) || '작';

export const useWorksStore = create<WorksState>()(
  immer((set) => ({
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
