import { beforeEach, describe, expect, it } from 'vitest';
import type { Work } from '../../types';
import { useWorksStore } from '../works.store';

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

beforeEach(() => {
  useWorksStore.setState({ works: [] });
});

describe('works store', () => {
  it('setWorks preserves existing nested collections for known ids', () => {
    const localWork = makeWork({
      id: 'w1',
      title: '로컬 제목',
      chapters: [{ id: 'ch1', partLabel: '제1부', index: 1, title: '화', scenes: [] }],
      entities: [
        {
          id: 'e1',
          type: '인물',
          name: '캐릭터',
          emoji: '👤',
          summary: '요약',
          fields: [],
        },
      ],
      timeline: [
        {
          id: 't1',
          entityId: 'e1',
          entityName: '캐릭터',
          chapterRef: '1화',
          chapterIndex: 1,
          key: 'k',
          value: 'v',
          source: 'author',
        },
      ],
      conflicts: [
        {
          id: 'cf1',
          entityName: '캐릭터',
          deadChapter: 1,
          appearChapter: 2,
          deadKey: 'k',
          deadValue: 'v',
          note: '노트',
          axis: { from: 1, to: 2, total: 3 },
        },
      ],
    });
    useWorksStore.setState({ works: [localWork] });

    const serverWork = makeWork({ id: 'w1', title: '서버 제목' });
    useWorksStore.getState().setWorks([serverWork]);

    const result = useWorksStore.getState().works.find((w) => w.id === 'w1');
    expect(result?.title).toBe('서버 제목');
    expect(result?.chapters).toBe(localWork.chapters);
    expect(result?.entities).toBe(localWork.entities);
    expect(result?.timeline).toBe(localWork.timeline);
    expect(result?.conflicts).toBe(localWork.conflicts);
  });

  it('setWorks initializes empty nested arrays for new ids', () => {
    useWorksStore.getState().setWorks([makeWork({ id: 'w2' })]);

    const result = useWorksStore.getState().works.find((w) => w.id === 'w2');
    expect(result?.chapters).toEqual([]);
    expect(result?.entities).toEqual([]);
    expect(result?.timeline).toEqual([]);
    expect(result?.conflicts).toEqual([]);
  });

  it('addWorkFromServer pushes the given work as-is', () => {
    const work = makeWork({ id: 'w3', title: '서버에서 생성된 작품' });
    useWorksStore.getState().addWorkFromServer(work);

    const works = useWorksStore.getState().works;
    expect(works).toHaveLength(1);
    expect(works[0]).toBe(work);
  });
});
