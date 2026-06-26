import { WorkShell } from '@/components/layout/work-shell';
import { useWorksStore } from '@/features/shared/store/works.store';
import type { EntityField, EntityType, Work } from '@/features/shared/types';
import { useNavigate } from '@tanstack/react-router';
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';
import { Plus, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const TYPES: EntityType[] = ['인물', '장소', '사건', '아이템'];
const DEFAULT_EMOJI: Record<EntityType, string> = {
  인물: '👤',
  장소: '🏔️',
  사건: '⚔️',
  아이템: '🗡️',
};

// 유형별 필드 (docs/data-model.md 3.2). textarea = 긴 서술 필드
const TYPE_FIELDS: Record<EntityType, { label: string; textarea?: boolean }[]> = {
  인물: [{ label: '외모', textarea: true }, { label: '성격', textarea: true }, { label: '말투' }],
  장소: [{ label: '묘사', textarea: true }, { label: '지역' }, { label: '분위기' }],
  사건: [{ label: '묘사', textarea: true }, { label: '참여자' }, { label: '발생 시점' }],
  아이템: [{ label: '묘사', textarea: true }, { label: '소유자' }, { label: '속성' }],
};

export function NewEntityScreen({ work }: { work: Work }) {
  const navigate = useNavigate();
  const addEntity = useWorksStore((s) => s.addEntity);

  const [type, setType] = useState<EntityType>('인물');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(DEFAULT_EMOJI.인물);
  const [showPicker, setShowPicker] = useState(false);
  const [alias, setAlias] = useState('');
  const [summary, setSummary] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [sampleLines, setSampleLines] = useState<string[]>(['']);
  const [relations, setRelations] = useState<{ name: string; role: string }[]>([
    { name: '', role: '' },
  ]);
  const [prompt, setPrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const generateImage = () => {
    const desc = fieldValues.외모 ?? fieldValues.묘사 ?? '';
    const finalPrompt = prompt.trim() || `${type} ${name || '엔티티'}${desc ? ` — ${desc}` : ''}`;
    if (!prompt.trim()) setPrompt(finalPrompt);
    // eco: 결정적 mock 플레이스홀더(data-uri SVG). 실 생성 API로 교체.
    setGeneratedImage(makePlaceholder(name || type, emoji.trim() || DEFAULT_EMOJI[type]));
    toast.success('이미지를 생성했습니다 (목업)');
  };

  const changeType = (t: EntityType) => {
    setType(t);
    setEmoji(DEFAULT_EMOJI[t]);
    setFieldValues({});
  };

  const save = () => {
    if (!name.trim()) return;
    const fields: EntityField[] = TYPE_FIELDS[type]
      .map((f) => ({ label: f.label, value: (fieldValues[f.label] ?? '').trim() }))
      .filter((f) => f.value);
    const id = addEntity(work.id, {
      type,
      name: name.trim(),
      emoji: emoji.trim() || DEFAULT_EMOJI[type],
      alias: alias.trim(),
      summary: summary.trim(),
      fields,
      sampleLines: type === '인물' ? sampleLines.map((s) => s.trim()).filter(Boolean) : undefined,
      relations:
        type === '인물'
          ? relations
              .map((r) => ({ name: r.name.trim(), role: r.role.trim() }))
              .filter((r) => r.name)
          : undefined,
      imageUrl: generatedImage ?? undefined,
    });
    toast.success(`'${name.trim()}' 엔티티를 추가했습니다`);
    navigate({ to: '/works/$workId/bible', params: { workId: work.id }, search: { entity: id } });
  };

  return (
    <WorkShell work={work} active="bible">
      <div className="h-full overflow-y-auto bg-paper">
        <div className="mx-auto max-w-[640px] px-10 pt-9 pb-16">
          <h1 className="mb-1 font-serif text-[26px] font-bold tracking-[-0.01em] text-ink">
            새 엔티티
          </h1>
          <p className="mb-6 text-[13px] text-faint">World Bible에 새 설정 카드를 추가합니다.</p>

          {/* 유형 선택 */}
          <Label>유형</Label>
          <div className="mb-5 flex gap-2">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => changeType(t)}
                className={
                  type === t
                    ? 'h-9 rounded-md bg-ink px-4 text-[13px] font-semibold text-white'
                    : 'h-9 rounded-md border border-line px-4 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface'
                }
              >
                {t}
              </button>
            ))}
          </div>

          {/* 공통 필드 */}
          <div className="mb-5 flex gap-3">
            <div className="relative w-[64px] shrink-0">
              <Label>이모지</Label>
              <button
                type="button"
                onClick={() => setShowPicker((v) => !v)}
                aria-label="이모지 선택"
                className="grid h-10 w-full place-items-center rounded-md border border-line bg-paper text-[20px] transition-colors hover:border-primary"
              >
                {emoji}
              </button>
              {showPicker && (
                <>
                  <button
                    type="button"
                    aria-label="이모지 선택 닫기"
                    onClick={() => setShowPicker(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <div className="absolute top-[74px] left-0 z-50">
                    <EmojiPicker
                      onEmojiClick={(d: EmojiClickData) => {
                        setEmoji(d.emoji);
                        setShowPicker(false);
                      }}
                      width={320}
                      height={380}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex-1">
              <Label>이름 *</Label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="엔티티 이름"
                className="h-10 w-full rounded-md border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-primary"
              />
            </div>
          </div>

          <Label>별칭</Label>
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="별칭·이명 (선택)"
            className="mb-5 h-10 w-full rounded-md border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-primary"
          />

          <Label>한 줄 요약</Label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            placeholder="이 엔티티를 한 줄로"
            className="mb-6 w-full resize-none rounded-md border border-line bg-paper px-3 py-2 text-sm leading-[1.6] text-ink outline-none focus:border-primary"
          />

          {/* 유형별 필드 */}
          <div className="mb-2 text-[13px] font-semibold text-muted-ink">{type} 설정</div>
          {TYPE_FIELDS[type].map((f) => (
            <div key={f.label}>
              <Label>{f.label}</Label>
              {f.textarea ? (
                <textarea
                  value={fieldValues[f.label] ?? ''}
                  onChange={(e) => setFieldValues((v) => ({ ...v, [f.label]: e.target.value }))}
                  rows={3}
                  className="mb-4 w-full resize-none rounded-md border border-line bg-paper px-3 py-2 text-sm leading-[1.6] text-ink outline-none focus:border-primary"
                />
              ) : (
                <input
                  value={fieldValues[f.label] ?? ''}
                  onChange={(e) => setFieldValues((v) => ({ ...v, [f.label]: e.target.value }))}
                  className="mb-4 h-10 w-full rounded-md border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-primary"
                />
              )}
            </div>
          ))}

          {/* 인물 전용 반복 에디터 */}
          {type === '인물' && (
            <>
              <RepeatEditor
                label="샘플 대사"
                rows={sampleLines}
                onAdd={() => setSampleLines((s) => [...s, ''])}
                onRemove={(i) => setSampleLines((s) => s.filter((_, idx) => idx !== i))}
                render={(line, i) => (
                  <input
                    value={line}
                    onChange={(e) =>
                      setSampleLines((s) => s.map((v, idx) => (idx === i ? e.target.value : v)))
                    }
                    placeholder="대사 한 줄"
                    className="h-9 flex-1 rounded-md border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-primary"
                  />
                )}
              />
              <RepeatEditor
                label="주요 관계"
                rows={relations}
                onAdd={() => setRelations((r) => [...r, { name: '', role: '' }])}
                onRemove={(i) => setRelations((r) => r.filter((_, idx) => idx !== i))}
                render={(rel, i) => (
                  <>
                    <input
                      value={rel.name}
                      onChange={(e) =>
                        setRelations((r) =>
                          r.map((v, idx) => (idx === i ? { ...v, name: e.target.value } : v))
                        )
                      }
                      placeholder="상대 이름"
                      className="h-9 flex-1 rounded-md border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-primary"
                    />
                    <input
                      value={rel.role}
                      onChange={(e) =>
                        setRelations((r) =>
                          r.map((v, idx) => (idx === i ? { ...v, role: e.target.value } : v))
                        )
                      }
                      placeholder="관계 (예: 사매)"
                      className="h-9 w-[120px] shrink-0 rounded-md border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-primary"
                    />
                  </>
                )}
              />
            </>
          )}

          {/* 이미지 생성 */}
          <div className="mt-7 border-t border-line pt-5">
            <div className="mb-2 text-[13px] font-semibold text-muted-ink">이미지 생성</div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder="이미지 프롬프트 (비우면 유형·이름·외모로 자동 구성)"
              className="mb-2 w-full resize-none rounded-md border border-line bg-paper px-3 py-2 text-sm leading-[1.6] text-ink outline-none focus:border-primary"
            />
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={generateImage}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-ai/40 bg-ai/[0.06] px-3.5 text-[13px] font-medium text-ai transition-colors hover:bg-ai/[0.12]"
              >
                <Sparkles className="size-4" strokeWidth={2} />
                생성
              </button>
              {generatedImage && (
                <img
                  src={generatedImage}
                  alt="생성 미리보기"
                  className="h-[120px] rounded-lg border border-line object-cover"
                />
              )}
            </div>
          </div>

          {/* 액션 */}
          <div className="mt-8 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!name.trim()}
              className="h-10 rounded-md bg-primary px-5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: '/works/$workId/bible', params: { workId: work.id } })}
              className="h-10 rounded-md border border-line-strong px-4 text-[14px] font-medium text-ink-soft transition-colors hover:bg-surface"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </WorkShell>
  );
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// eco: 결정적 mock 플레이스홀더 이미지(data-uri SVG). 실 생성 API로 교체.
function makePlaceholder(name: string, emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#e9e6df"/><text x="160" y="104" font-size="68" text-anchor="middle">${escapeXml(emoji)}</text><text x="160" y="156" font-size="18" text-anchor="middle" fill="#3a3a36" font-family="sans-serif">${escapeXml(name)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[12.5px] font-medium text-muted-ink">{children}</div>;
}

function RepeatEditor<T>({
  label,
  rows,
  onAdd,
  onRemove,
  render,
}: {
  label: string;
  rows: T[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  render: (row: T, i: number) => React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <Label>{label}</Label>
      <div className="flex flex-col gap-1.5">
        {rows.map((row, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 순서 있는 편집 행 — 인덱스가 곧 식별자
          <div key={i} className="flex items-center gap-1.5">
            {render(row, i)}
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={`${label} 행 삭제`}
              className="grid size-9 shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-[#fdebec] hover:text-[#c4554d]"
            >
              <X className="size-4" strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-1.5 flex h-8 items-center gap-1.5 rounded-md border border-dashed border-line-strong px-3 text-[12.5px] font-medium text-muted-ink transition-colors hover:border-primary/60 hover:text-primary"
      >
        <Plus className="size-3.5" strokeWidth={2} />
        {label} 추가
      </button>
    </div>
  );
}
