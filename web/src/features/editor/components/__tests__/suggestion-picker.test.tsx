import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ContinueSuggestionModal, SuggestionPicker } from '../suggestion-picker';

describe('SuggestionPicker', () => {
  // 이어쓰기 모달과 연출을 통일 — 스트리밍 중 원문을 흘리지 않고 스켈레톤만 보인다.
  it('스트리밍 중에는 원문을 노출하지 않고 스켈레톤과 생성 중 라벨만 보여준다', () => {
    render(
      <SuggestionPicker
        title="AI 다시쓰기"
        rawText="1. 가는 중"
        isStreaming={true}
        error={null}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText(/생성 중/)).toBeInTheDocument();
    expect(screen.queryByText('1. 가는 중')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '적용' })).not.toBeInTheDocument();
  });

  it('스트리밍 중 완결된 JSONL 줄만 카드로 뜨고 뒤에 스켈레톤 1개가 남는다', () => {
    render(
      <SuggestionPicker
        title="AI 늘리기"
        rawText={'{"text":"가"}\n{"text":"나"}\n{"text":"다 쓰는'}
        isStreaming={true}
        error={null}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('가')).toBeInTheDocument();
    expect(screen.getByText('나')).toBeInTheDocument();
    expect(screen.queryByText('다 쓰는')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);
  });

  it('마커 없는 style 응답도 완료 시 후보 1개로 뜬다', () => {
    render(
      <SuggestionPicker
        title="AI 줄이기"
        rawText="그가 낮게 말했다"
        isStreaming={false}
        error={null}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('그가 낮게 말했다')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '적용' })).toHaveLength(1);
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
  });

  it('완료되면 후보별 카드와 적용 버튼을 렌더한다', () => {
    render(
      <SuggestionPicker
        title="AI 다시쓰기"
        rawText={'{"text":"가"}\n{"text":"나"}\n{"text":"다"}'}
        isStreaming={false}
        error={null}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('가')).toBeInTheDocument();
    expect(screen.getByText('나')).toBeInTheDocument();
    expect(screen.getByText('다')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '적용' })).toHaveLength(3);
  });

  it('두 번째 카드의 적용을 클릭하면 해당 후보 텍스트로 onApply가 호출된다', async () => {
    const onApply = vi.fn();
    render(
      <SuggestionPicker
        title="AI 다시쓰기"
        rawText={'{"text":"가"}\n{"text":"나"}\n{"text":"다"}'}
        isStreaming={false}
        error={null}
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );

    const applyButtons = screen.getAllByRole('button', { name: '적용' });
    await userEvent.click(applyButtons[1]);

    expect(onApply).toHaveBeenCalledWith('나');
  });

  it('취소를 클릭하면 onCancel이 호출된다', async () => {
    const onCancel = vi.fn();
    render(
      <SuggestionPicker
        title="AI 다시쓰기"
        rawText={'1. 가\n2. 나'}
        isStreaming={false}
        error={null}
        onApply={vi.fn()}
        onCancel={onCancel}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(onCancel).toHaveBeenCalled();
  });

  it('에러가 있으면 에러 메시지를 표시한다', () => {
    render(
      <SuggestionPicker
        title="AI 다시쓰기"
        rawText=""
        isStreaming={false}
        error={new Error('LLM provider error')}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('LLM provider error')).toBeInTheDocument();
  });
});

describe('ContinueSuggestionModal', () => {
  it('헤더에 호출부가 준 액션 이름을 쓴다 — 선택 영역 액션도 이 모달을 공유한다', () => {
    render(
      <ContinueSuggestionModal
        open={true}
        title="AI 다시쓰기"
        rawText=""
        isStreaming={true}
        error={null}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('AI 다시쓰기')).toBeInTheDocument();
    expect(screen.queryByText('AI 이어쓰기')).not.toBeInTheDocument();
  });

  it('열린 동안 바깥 영역은 접근성 트리에서 숨겨져 상호작용할 수 없다', () => {
    render(
      <div>
        <button type="button">편집 영역 버튼</button>
        <ContinueSuggestionModal
          open={true}
          title="AI 이어쓰기"
          rawText=""
          isStreaming={true}
          error={null}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      </div>
    );

    expect(screen.queryByRole('button', { name: '편집 영역 버튼' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '편집 영역 버튼', hidden: true })
    ).toBeInTheDocument();
  });

  it('닫혀 있으면 바깥 영역이 정상적으로 접근 가능하다', () => {
    render(
      <div>
        <button type="button">편집 영역 버튼</button>
        <ContinueSuggestionModal
          open={false}
          title="AI 이어쓰기"
          rawText=""
          isStreaming={true}
          error={null}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      </div>
    );

    expect(screen.getByRole('button', { name: '편집 영역 버튼' })).toBeInTheDocument();
  });

  it('스트리밍 중에는 원문 텍스트가 화면에 존재하지 않는다', () => {
    render(
      <ContinueSuggestionModal
        open={true}
        title="AI 이어쓰기"
        rawText="1. 가는 중"
        isStreaming={true}
        error={null}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByText('1. 가는 중')).not.toBeInTheDocument();
    expect(screen.queryByText(/가는 중/)).not.toBeInTheDocument();
  });

  it('완성 후보 수만큼 카드가 렌더되고, 자라는 중이면 스켈레톤이 1개 있다', () => {
    render(
      <ContinueSuggestionModal
        open={true}
        title="AI 이어쓰기"
        rawText={'{"text":"가"}\n{"text":"나"}\n{"text":"자라는 중'}
        isStreaming={true}
        error={null}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('가')).toBeInTheDocument();
    expect(screen.getByText('나')).toBeInTheDocument();
    expect(screen.queryByText(/자라는 중/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '적용' })).toHaveLength(2);
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);
  });

  it('완료되면 스켈레톤 없이 완성 후보만 카드로 남는다', () => {
    render(
      <ContinueSuggestionModal
        open={true}
        title="AI 이어쓰기"
        rawText={'{"text":"가"}\n{"text":"나"}\n{"text":"다"}'}
        isStreaming={false}
        error={null}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getAllByRole('button', { name: '적용' })).toHaveLength(3);
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
  });

  it('마커가 없는 응답도 완료 시 후보 1개로 뜬다', () => {
    render(
      <ContinueSuggestionModal
        open={true}
        title="AI 이어쓰기"
        rawText={'가나다\n라마바'}
        isStreaming={false}
        error={null}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getAllByRole('button', { name: '적용' })).toHaveLength(1);
  });

  it('적용을 클릭하면 해당 후보 텍스트로 onApply가 호출된다', async () => {
    const onApply = vi.fn();
    render(
      <ContinueSuggestionModal
        open={true}
        title="AI 이어쓰기"
        rawText={'1. 가\n2. 나'}
        isStreaming={false}
        error={null}
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );

    await userEvent.click(screen.getAllByRole('button', { name: '적용' })[1]);

    expect(onApply).toHaveBeenCalledWith('나');
  });

  it('취소를 클릭하면 onCancel이 호출된다', async () => {
    const onCancel = vi.fn();
    render(
      <ContinueSuggestionModal
        open={true}
        title="AI 이어쓰기"
        rawText=""
        isStreaming={true}
        error={null}
        onApply={vi.fn()}
        onCancel={onCancel}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(onCancel).toHaveBeenCalled();
  });

  it('ESC를 누르면 onCancel이 호출된다', async () => {
    const onCancel = vi.fn();
    render(
      <ContinueSuggestionModal
        open={true}
        title="AI 이어쓰기"
        rawText=""
        isStreaming={true}
        error={null}
        onApply={vi.fn()}
        onCancel={onCancel}
      />
    );

    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalled();
  });

  it('바깥(배경 딤)을 클릭하면 onCancel이 호출된다', async () => {
    // 실제 화면에서는 딤 배경이 편집 영역 전체를 덮어 클릭을 가로챈다 —
    // jsdom은 레이아웃을 계산하지 않으므로 배경 딤 엘리먼트를 직접 클릭해 이를 재현한다.
    const onCancel = vi.fn();
    render(
      <ContinueSuggestionModal
        open={true}
        title="AI 이어쓰기"
        rawText=""
        isStreaming={true}
        error={null}
        onApply={vi.fn()}
        onCancel={onCancel}
      />
    );

    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    if (!overlay) throw new Error('dialog-overlay not found');
    await userEvent.click(overlay);

    expect(onCancel).toHaveBeenCalled();
  });

  it('에러가 있으면 에러 메시지를 표시하고 후보 카드는 렌더하지 않는다', () => {
    render(
      <ContinueSuggestionModal
        open={true}
        title="AI 이어쓰기"
        rawText=""
        isStreaming={false}
        error={new Error('LLM provider error')}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('LLM provider error')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '적용' })).not.toBeInTheDocument();
  });
});

// manuscript.tsx의 onApply 패턴(editor?.chain().focus().insertContent(text).run())을 실제
// TipTap 편집기 + 실제 Base UI Dialog 조합으로 재현한다. manuscript.test.tsx는 editor를 통째로
// mock하기 때문에 "모달이 포커스를 가져가도 커서 위치가 유지되는지"는 실제 검증이 불가능하다 —
// 여기서만 실물로 확인한다.
function ContinueHarness() {
  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>가나다라마바사아자차카</p>',
  });
  const [open, setOpen] = useState(false);

  if (!editor) return null;

  return (
    <div>
      <EditorContent editor={editor} />
      <button
        type="button"
        onClick={() => {
          // 본문 중간, '바'와 '사' 사이에 커서를 둔 상태를 재현.
          editor.commands.setTextSelection(7);
          setOpen(true);
        }}
      >
        이어쓰기 시작
      </button>
      <ContinueSuggestionModal
        open={open}
        title="AI 이어쓰기"
        rawText="[이어진문장]"
        isStreaming={false}
        error={null}
        onApply={(text) => {
          // scrollIntoView: jsdom엔 Range.getClientRects가 없어 TipTap의 스크롤 계산이
          // 던진다 — 이 하네스가 검증하는 "커서 위치 보존"과는 무관하므로 꺼서 피해간다.
          editor.chain().focus(undefined, { scrollIntoView: false }).insertContent(text).run();
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

describe('ContinueSuggestionModal + 실제 TipTap 편집기', () => {
  it('모달이 포커스를 가져가도, 본문 중간에 둔 커서 위치에 정확히 삽입된다', async () => {
    render(<ContinueHarness />);

    await userEvent.click(screen.getByRole('button', { name: '이어쓰기 시작' }));

    // 모달이 실제로 DOM 포커스를 가져갔는지 확인(Base UI Dialog의 포커스 트랩) —
    // 그렇지 않다면 이 테스트는 애초에 "포커스가 옮겨간 상황"을 재현하지 못한 것이라
    // 검증 가치가 없다.
    const dialogPopup = document.querySelector('[data-slot="dialog-content"]') as HTMLElement;
    await waitFor(() => expect(dialogPopup.contains(document.activeElement)).toBe(true));

    const proseMirror = document.querySelector('.ProseMirror') as HTMLElement;
    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(proseMirror.textContent).toBe('가나다라마바[이어진문장]사아자차카');
  });
});
