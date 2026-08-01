import { useAssistStream } from '@/features/editor/api/assist.api';
import { SuggestionPicker } from '@/features/editor/components/suggestion-picker';
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
  /** 팝오버 헤더 — 누른 액션을 가리킨다("AI 다시쓰기" 등). */
  title: string;
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
  chapterId,
}: {
  editor: Editor | null;
  workId: string;
  chapterId: string;
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
      title: `AI ${action.label}`,
      prefix: action.key === 'expand' ? `${text} ` : '',
      from,
      to,
      top: coords.bottom + 6,
      left: Math.min(coords.left, window.innerWidth - 320),
    });

    if (action.key === 'expand') {
      assist.start('continue', { workId, chapterId, payload: { cursorText: text } });
      return;
    }
    const targetStyle =
      action.key === 'shorten' ? SHORTEN_STYLE : action.key === 'tone' ? TONE_STYLE : REWRITE_STYLE;
    assist.start('style', { workId, chapterId, payload: { text, targetStyle } });
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
        <div className="fixed z-50 w-[300px]" style={{ top: preview.top, left: preview.left }}>
          <SuggestionPicker
            title={preview.title}
            rawText={assist.text}
            isStreaming={assist.isStreaming}
            error={assist.error}
            onApply={(text) => {
              // 적용 시점에도 스트리밍 중일 수 있다 — 남은 후보 생성을 끊는다.
              assist.stop();
              editor
                .chain()
                .focus()
                .insertContentAt({ from: preview.from, to: preview.to }, preview.prefix + text)
                .run();
              setPreview(null);
            }}
            onCancel={() => {
              assist.stop();
              setPreview(null);
            }}
          />
        </div>
      )}
    </>
  );
}
