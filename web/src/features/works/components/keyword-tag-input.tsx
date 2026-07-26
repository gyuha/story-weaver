import { X } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';

type KeywordTagInputProps = {
  tags: string[];
  onChange: (next: string[]) => void;
  reserved?: string[];
  placeholder?: string;
};

export function KeywordTagInput({
  tags,
  onChange,
  reserved = [],
  placeholder = '키워드를 입력하고 Enter',
}: KeywordTagInputProps) {
  const [input, setInput] = useState('');

  const commit = () => {
    const value = input.trim();
    setInput('');
    if (!value) return;
    const isDuplicate = [...tags, ...reserved].some((t) => t.toLowerCase() === value.toLowerCase());
    if (isDuplicate) return;
    onChange([...tags, value]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 한글 등 IME 조합 중의 Enter는 조합 확정용이다. 여기서 커밋하면 확정 후 남는 마지막 음절이
    // 두 번째 태그로 새어 나온다('먼치킨' → '먼치킨' + '킨'). Backspace도 조합 중엔 자모 삭제이므로 태그를 지우면 안 된다.
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/[0.06] px-[13px] py-[7px] text-[13px] text-ink"
        >
          {tag}
          <button
            type="button"
            aria-label={`${tag} 삭제`}
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="text-faint hover:text-ink"
          >
            <X className="size-3" strokeWidth={2.2} />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="h-[30px] min-w-[140px] flex-1 rounded-full border border-line bg-transparent px-3 text-[13px] text-ink placeholder:text-faintest focus:border-primary focus:outline-none"
      />
    </div>
  );
}
