import { describe, expect, it } from 'vitest';
import genrePresetsJson from '../../lib/genre-presets.json';
import { GENRES, GENRE_PRESETS, GenrePresetsSchema, WRITING_STYLES } from '../genre-presets.schema';

describe('genre-presets.schema', () => {
  it('실제 JSON이 스키마를 통과하고 17개 장르를 포함한다', () => {
    expect(GenrePresetsSchema.safeParse(genrePresetsJson).success).toBe(true);
    expect(GENRES.length).toBe(17);
  });

  it('모든 프리셋이 defaultStyle을 문체 3종 중 하나로 갖는다', () => {
    for (const genre of GENRES) {
      expect(WRITING_STYLES).toContain(GENRE_PRESETS[genre].defaultStyle);
    }
  });

  it('모든 프리셋이 styleSamples 3키를 모두 갖는다', () => {
    for (const genre of GENRES) {
      const samples = GENRE_PRESETS[genre].styleSamples;
      for (const style of WRITING_STYLES) {
        expect(samples[style]).toBeTruthy();
      }
    }
  });

  it('styleSamples에 문체 키가 하나 누락되면 reject한다', () => {
    const broken = {
      ...genrePresetsJson,
      무협: {
        ...genrePresetsJson.무협,
        styleSamples: { 간결체: '샘플', 만연체: '샘플' },
      },
    };
    expect(GenrePresetsSchema.safeParse(broken).success).toBe(false);
  });

  it('keywords가 빈 배열이면 reject한다', () => {
    const broken = {
      ...genrePresetsJson,
      무협: { ...genrePresetsJson.무협, keywords: [] },
    };
    expect(GenrePresetsSchema.safeParse(broken).success).toBe(false);
  });

  it('defaultStyle이 정의되지 않은 문체면 reject한다', () => {
    const broken = {
      ...genrePresetsJson,
      무협: { ...genrePresetsJson.무협, defaultStyle: '없는문체' },
    };
    expect(GenrePresetsSchema.safeParse(broken).success).toBe(false);
  });
});
