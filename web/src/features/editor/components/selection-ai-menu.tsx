import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useState } from 'react';

interface AiAction {
  key: string;
  label: string;
}

const ACTIONS: AiAction[] = [
  { key: 'rewrite', label: '다시쓰기' },
  { key: 'expand', label: '늘리기' },
  { key: 'shorten', label: '줄이기' },
  { key: 'tone', label: '톤 변경' },
];

// eco: mock 변환. 실제 AI 연동 시 교체. expand/shorten은 입력 기반, rewrite/tone은 고정 예시.
function mockTransform(key: string, text: string): string {
  const s = text.trim();
  switch (key) {
    case 'expand':
      return `${s} 그 한마디에 주변의 공기마저 무겁게 가라앉았다.`;
    case 'shorten':
      return s.length > 24 ? `${s.slice(0, Math.ceil(s.length * 0.6)).trim()}…` : s;
    case 'rewrite':
      return '그는 잠시 말을 멈췄다가, 낮고 단단한 목소리로 다시 입을 열었다.';
    case 'tone':
      return '그리하여 그는 한참을 침묵한 끝에, 비로소 정중히 말문을 여시었다.';
    default:
      return s;
  }
}

interface Preview {
  label: string;
  result: string;
  from: number;
  to: number;
  top: number;
  left: number;
}

/** 본문 선택 시 뜨는 AI 액션 버블 메뉴 + 미리보기 팝오버 (mock) */
export function SelectionAiMenu({ editor }: { editor: Editor | null }) {
  const [preview, setPreview] = useState<Preview | null>(null);

  if (!editor) return null;

  const run = (action: AiAction) => {
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, ' ');
    if (!text.trim()) return;
    const coords = editor.view.coordsAtPos(to);
    setPreview({
      label: action.label,
      result: mockTransform(action.key, text),
      from,
      to,
      top: coords.bottom + 6,
      left: Math.min(coords.left, window.innerWidth - 320),
    });
  };

  const apply = () => {
    if (!preview) return;
    editor
      .chain()
      .focus()
      .insertContentAt({ from: preview.from, to: preview.to }, preview.result)
      .run();
    setPreview(null);
  };

  return (
    <>
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-0.5 rounded-lg border border-line bg-paper p-1 shadow-md"
      >
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => run(a)}
            className="rounded-md px-2 py-1 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-surface hover:text-ink"
          >
            {a.label}
          </button>
        ))}
      </BubbleMenu>

      {preview && (
        <div
          className="fixed z-50 w-[300px] rounded-lg border border-line bg-paper p-3 shadow-lg"
          style={{ top: preview.top, left: preview.left }}
        >
          <div className="mb-1.5 text-[11.5px] font-semibold text-ai">
            AI 제안 · {preview.label} (목업)
          </div>
          <div className="mb-2.5 max-h-40 overflow-y-auto text-[13px] leading-[1.6] text-ink">
            {preview.result}
          </div>
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="h-8 rounded-[5px] border border-line-strong px-3 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-surface"
            >
              취소
            </button>
            <button
              type="button"
              onClick={apply}
              className="h-8 rounded-[5px] bg-primary px-3 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              적용
            </button>
          </div>
        </div>
      )}
    </>
  );
}
