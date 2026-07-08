import { useAssistStream } from '@/features/editor/api/assist.api';
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

// 다시쓰기/줄이기/톤변경은 "의미 보존 + 목표 문체로 재작성"인 style 태스크로 매핑하고
// targetStyle 지시문만 다르게 준다. 늘리기는 선택 영역을 커서 직전 텍스트로 보고
// continue 태스크로 다음 문장을 이어 생성해 선택 텍스트 뒤에 덧붙인다.
const REWRITE_STYLE = '같은 의미를 유지하되 표현과 문장 구조를 새롭게 바꿔줘';
const SHORTEN_STYLE = '같은 의미를 유지하며 더 간결하고 축약된 문장으로 줄여줘';
const TONE_STYLE = '더 정중하고 격식 있는 문어체로 바꿔줘';

interface Preview {
  label: string;
  prefix: string;
  from: number;
  to: number;
  top: number;
  left: number;
}

/** 본문 선택 시 뜨는 AI 액션 버블 메뉴 + 스트리밍 미리보기 팝오버. */
export function SelectionAiMenu({
  editor,
  workId,
  sceneId,
}: {
  editor: Editor | null;
  workId: string;
  sceneId: string;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const assist = useAssistStream();

  if (!editor) return null;

  const run = (action: AiAction) => {
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, ' ').trim();
    if (!text) return;
    const coords = editor.view.coordsAtPos(to);
    setPreview({
      label: action.label,
      prefix: action.key === 'expand' ? `${text} ` : '',
      from,
      to,
      top: coords.bottom + 6,
      left: Math.min(coords.left, window.innerWidth - 320),
    });

    if (action.key === 'expand') {
      assist.start('continue', { workId, sceneId, payload: { cursorText: text } });
      return;
    }
    const targetStyle =
      action.key === 'shorten' ? SHORTEN_STYLE : action.key === 'tone' ? TONE_STYLE : REWRITE_STYLE;
    assist.start('style', { workId, sceneId, payload: { text, targetStyle } });
  };

  const result = preview ? preview.prefix + assist.text : '';

  const apply = () => {
    if (!preview) return;
    editor.chain().focus().insertContentAt({ from: preview.from, to: preview.to }, result).run();
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
            AI 제안 · {preview.label}
            {assist.isStreaming ? ' · 생성 중…' : ''}
          </div>
          {assist.error ? (
            <div className="mb-2.5 text-[13px] text-danger">{assist.error.message}</div>
          ) : (
            <div className="mb-2.5 max-h-40 overflow-y-auto text-[13px] leading-[1.6] text-ink">
              {result}
            </div>
          )}
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
              disabled={assist.isStreaming || !!assist.error}
              className="h-8 rounded-[5px] bg-primary px-3 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
            >
              적용
            </button>
          </div>
        </div>
      )}
    </>
  );
}
