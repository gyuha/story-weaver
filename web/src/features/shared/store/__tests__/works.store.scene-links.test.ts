import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Work } from '../../types';
import { useWorksStore } from '../works.store';

const mockCreateSceneLink = vi.fn();
const mockDeleteSceneLink = vi.fn();

vi.mock('@/features/world-bible/api/world-bible.api', () => ({
  worldBibleApi: {
    createSceneLink: (...args: unknown[]) => mockCreateSceneLink(...args),
    deleteSceneLink: (...args: unknown[]) => mockDeleteSceneLink(...args),
  },
}));

function makeWork(overrides: Partial<Work> & { id: string }): Work {
  return {
    title: '제목',
    shortLabel: '제',
    genre: '무협',
    subGenre: '회귀',
    keywords: [],
    style: '간결체',
    status: '구상',
    coverTheme: 'dark',
    stats: { chapters: 0, words: '0', wordsUnit: '천자', characters: 0, progress: 0 },
    lastEditedLabel: '방금',
    chapters: [],
    entities: [],
    timeline: [],
    conflicts: [],
    reviewSummary: { scenes: 0, states: 0, conflicts: 0 },
    ...overrides,
  };
}

const WORK_ID = 'w1';
const SCENE_ID = 'sc1';

beforeEach(() => {
  vi.clearAllMocks();
  useWorksStore.setState({
    works: [
      makeWork({
        id: WORK_ID,
        chapters: [
          {
            id: 'ch1',
            episodeId: 'ep1',
            partLabel: '제1부',
            index: 1,
            title: '1화',
            scenes: [
              {
                id: SCENE_ID,
                title: '씬',
                status: 'draft',
                paragraphs: [],
                linkedEntityIds: ['e-existing'],
                vectorMemory: [],
              },
            ],
          },
        ],
      }),
    ],
  });
});

function getScene() {
  return useWorksStore.getState().works[0].chapters[0].scenes[0];
}

describe('addSceneEntityLinks', () => {
  it('실 API로 링크를 생성하고 성공 시 스토어에 반영한다', async () => {
    mockCreateSceneLink.mockResolvedValue({
      id: 'link1',
      workId: WORK_ID,
      sceneId: SCENE_ID,
      entityId: 'e-new',
      source: 'author',
      createdAt: '2026-01-01T00:00:00Z',
    });

    await useWorksStore.getState().addSceneEntityLinks(WORK_ID, SCENE_ID, ['e-new']);

    expect(mockCreateSceneLink).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, scene_id: SCENE_ID },
      body: { entityId: 'e-new' },
    });
    expect(getScene().linkedEntityIds).toEqual(['e-existing', 'e-new']);
  });

  it('이미 링크된 엔티티는 API를 호출하지 않고 중복 추가하지 않는다', async () => {
    await useWorksStore.getState().addSceneEntityLinks(WORK_ID, SCENE_ID, ['e-existing']);

    expect(mockCreateSceneLink).not.toHaveBeenCalled();
    expect(getScene().linkedEntityIds).toEqual(['e-existing']);
  });

  it('실패(예: cross-tenant 403) 시 스토어를 바꾸지 않고 에러를 던진다', async () => {
    mockCreateSceneLink.mockRejectedValue(new Error('403 Forbidden'));

    await expect(
      useWorksStore.getState().addSceneEntityLinks(WORK_ID, SCENE_ID, ['e-new'])
    ).rejects.toThrow('403 Forbidden');
    expect(getScene().linkedEntityIds).toEqual(['e-existing']);
  });
});

describe('removeSceneEntityLink', () => {
  it('실 API로 링크를 삭제하고 성공 시 스토어에서 제거한다', async () => {
    mockDeleteSceneLink.mockResolvedValue(undefined);

    await useWorksStore.getState().removeSceneEntityLink(WORK_ID, SCENE_ID, 'e-existing');

    expect(mockDeleteSceneLink).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, scene_id: SCENE_ID, entity_id: 'e-existing' },
    });
    expect(getScene().linkedEntityIds).toEqual([]);
  });

  it('실패 시 스토어를 바꾸지 않고 에러를 던진다', async () => {
    mockDeleteSceneLink.mockRejectedValue(new Error('network error'));

    await expect(
      useWorksStore.getState().removeSceneEntityLink(WORK_ID, SCENE_ID, 'e-existing')
    ).rejects.toThrow('network error');
    expect(getScene().linkedEntityIds).toEqual(['e-existing']);
  });
});
