import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Work } from '../../types';
import type { NewEntityInput } from '../works.store';
import { useWorksStore } from '../works.store';

const mockCreateEntity = vi.fn();
const mockUpdateEntity = vi.fn();

vi.mock('@/features/world-bible/api/world-bible.api', () => ({
  worldBibleApi: {
    createEntity: (...args: unknown[]) => mockCreateEntity(...args),
    updateEntity: (...args: unknown[]) => mockUpdateEntity(...args),
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

const CHARACTER_INPUT: NewEntityInput = {
  type: '인물',
  name: '이서하',
  emoji: '🧝',
  alias: '서하',
  summary: '주인공',
  fields: [
    { label: '외모', value: '흑발' },
    { label: '성격', value: '냉철함' },
  ],
  sampleLines: ['안녕'],
  relations: [{ name: '악역', role: '원수' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  useWorksStore.setState({ works: [makeWork({ id: WORK_ID })] });
});

describe('addEntity', () => {
  it('실 API로 EntityField[]->attributes 매핑된 attributes를 전송하고 성공 시 스토어에 추가한다', async () => {
    mockCreateEntity.mockResolvedValue({
      id: 'en1',
      workId: WORK_ID,
      entityType: 'character',
      name: '이서하',
      aliases: ['서하'],
      summary: '주인공',
      attributes: { appearance: '흑발', personality: '냉철함', sample_lines: ['안녕'] },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    const id = await useWorksStore.getState().addEntity(WORK_ID, CHARACTER_INPUT);

    expect(id).toBe('en1');
    expect(mockCreateEntity).toHaveBeenCalledWith({
      path: { work_id: WORK_ID },
      body: {
        entityType: 'character',
        name: '이서하',
        aliases: ['서하'],
        summary: '주인공',
        attributes: { appearance: '흑발', personality: '냉철함', sample_lines: ['안녕'] },
      },
    });
    const entities = useWorksStore.getState().works[0].entities;
    expect(entities).toHaveLength(1);
    expect(entities[0]).toEqual({
      id: 'en1',
      type: '인물',
      name: '이서하',
      emoji: '🧝', // eco: 백엔드에 emoji 컬럼이 없어 입력값을 로컬에만 병합
      alias: '서하',
      summary: '주인공',
      fields: [
        { label: '외모', value: '흑발' },
        { label: '성격', value: '냉철함' },
      ],
      sampleLines: ['안녕'],
      relations: [{ name: '악역', role: '원수' }], // eco: 백엔드 relations는 target_entity_id 참조라 미전송, 로컬만 병합
    });
  });

  it('참여자/발생 시점처럼 UUID를 요구하는 필드는 attributes에서 제외된다', async () => {
    mockCreateEntity.mockResolvedValue({
      id: 'en2',
      workId: WORK_ID,
      entityType: 'event',
      name: '문파 멸망',
      aliases: [],
      summary: '',
      attributes: { description: '멸망' },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    await useWorksStore.getState().addEntity(WORK_ID, {
      type: '사건',
      name: '문파 멸망',
      emoji: '⚔️',
      summary: '',
      fields: [
        { label: '묘사', value: '멸망' },
        { label: '참여자', value: '주인공, 사부' },
        { label: '발생 시점', value: '3화' },
      ],
    });

    expect(mockCreateEntity).toHaveBeenCalledWith({
      path: { work_id: WORK_ID },
      body: {
        entityType: 'event',
        name: '문파 멸망',
        aliases: [],
        summary: '',
        attributes: { description: '멸망' },
      },
    });
  });

  it('실패 시 스토어를 바꾸지 않고 에러를 던진다', async () => {
    mockCreateEntity.mockRejectedValue(new Error('network error'));

    await expect(useWorksStore.getState().addEntity(WORK_ID, CHARACTER_INPUT)).rejects.toThrow(
      'network error'
    );
    expect(useWorksStore.getState().works[0].entities).toHaveLength(0);
  });
});

describe('updateEntity', () => {
  beforeEach(() => {
    useWorksStore.setState({
      works: [
        makeWork({
          id: WORK_ID,
          entities: [
            {
              id: 'en1',
              type: '인물',
              name: '이서하',
              emoji: '🧝',
              summary: '주인공',
              fields: [],
            },
          ],
        }),
      ],
    });
  });

  it('실 API로 수정하고 성공 시 스토어의 엔티티를 교체한다', async () => {
    mockUpdateEntity.mockResolvedValue({
      id: 'en1',
      workId: WORK_ID,
      entityType: 'character',
      name: '이서하(개정)',
      aliases: [],
      summary: '주인공(개정)',
      attributes: { speech_style: '반말' },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    });

    await useWorksStore.getState().updateEntity(WORK_ID, 'en1', {
      type: '인물',
      name: '이서하(개정)',
      emoji: '🧝',
      summary: '주인공(개정)',
      fields: [{ label: '말투', value: '반말' }],
    });

    expect(mockUpdateEntity).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, entity_id: 'en1' },
      body: {
        name: '이서하(개정)',
        aliases: [],
        summary: '주인공(개정)',
        attributes: { speech_style: '반말' },
      },
    });
    expect(useWorksStore.getState().works[0].entities[0]).toEqual({
      id: 'en1',
      type: '인물',
      name: '이서하(개정)',
      emoji: '🧝',
      summary: '주인공(개정)',
      fields: [{ label: '말투', value: '반말' }],
    });
  });

  it('실패 시 스토어를 바꾸지 않고 에러를 던진다', async () => {
    mockUpdateEntity.mockRejectedValue(new Error('403 Forbidden'));

    await expect(
      useWorksStore.getState().updateEntity(WORK_ID, 'en1', CHARACTER_INPUT)
    ).rejects.toThrow('403 Forbidden');
    expect(useWorksStore.getState().works[0].entities[0].name).toBe('이서하');
  });
});

describe('setWorkEntities', () => {
  it('서버 목록으로 교체하되 백엔드에 없는 emoji/imageUrl/relations는 기존 로컬 값을 보존한다', () => {
    useWorksStore.setState({
      works: [
        makeWork({
          id: WORK_ID,
          entities: [
            {
              id: 'en1',
              type: '인물',
              name: '이서하',
              emoji: '🧝',
              imageUrl: 'data:image/svg+xml,local',
              summary: '주인공',
              fields: [],
              relations: [{ name: '악역', role: '원수' }],
            },
          ],
        }),
      ],
    });

    useWorksStore.getState().setWorkEntities(WORK_ID, [
      {
        id: 'en1',
        type: '인물',
        name: '이서하(서버)',
        emoji: '👤', // 서버 조회 경로의 기본값 — 로컬 값으로 덮여야 함
        summary: '주인공(서버)',
        fields: [{ label: '외모', value: '흑발' }],
      },
      { id: 'en2', type: '장소', name: '혈산문', emoji: '🏔️', summary: '', fields: [] },
    ]);

    const entities = useWorksStore.getState().works[0].entities;
    expect(entities).toEqual([
      {
        id: 'en1',
        type: '인물',
        name: '이서하(서버)',
        emoji: '🧝',
        imageUrl: 'data:image/svg+xml,local',
        summary: '주인공(서버)',
        fields: [{ label: '외모', value: '흑발' }],
        relations: [{ name: '악역', role: '원수' }],
      },
      { id: 'en2', type: '장소', name: '혈산문', emoji: '🏔️', summary: '', fields: [] },
    ]);
  });
});
