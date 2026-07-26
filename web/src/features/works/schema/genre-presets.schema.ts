import { z } from 'zod';
import genrePresetsJson from '../lib/genre-presets.json';

export const WRITING_STYLES = ['간결체', '만연체', '서정체'] as const;

export const WritingStyleSchema = z.enum(WRITING_STYLES);

export type WritingStyle = z.infer<typeof WritingStyleSchema>;

const GenrePresetSchema = z.object({
  emoji: z.string().min(1),
  keywords: z.array(z.string()).min(1),
  defaultStyle: WritingStyleSchema,
  styleSamples: z.object({
    간결체: z.string(),
    만연체: z.string(),
    서정체: z.string(),
  }),
});

export type GenrePreset = z.infer<typeof GenrePresetSchema>;

export const GenrePresetsSchema = z.record(GenrePresetSchema);

/** JSON이 단일 출처: 장르명은 원본 import의 리터럴 키에서 파생한다 */
export type Genre = keyof typeof genrePresetsJson;

// eco: 모듈 로드 시 1회 검증 — 실패하면 즉시 throw해 잘못된 프리셋 데이터를 조기에 드러낸다
export const GENRE_PRESETS = GenrePresetsSchema.parse(genrePresetsJson) as Record<
  Genre,
  GenrePreset
>;

export const GENRES = Object.keys(GENRE_PRESETS) as Genre[];
