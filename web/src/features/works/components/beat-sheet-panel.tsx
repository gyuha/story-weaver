import { apiErrorMessage } from '@/features/auth/lib/api-error';
import { plotApi } from '@/features/works/api/plot.api';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';

interface BeatSheetPanelProps {
  workId: string;
}

/** 장르/키워드 기반 비트 시트 생성 — 작품에 이미 저장된 장르·스타일로 서버가 생성한다(요청 바디 없음). */
export function BeatSheetPanel({ workId }: BeatSheetPanelProps) {
  const [beats, setBeats] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await plotApi.generateBeatSheet({ path: { work_id: workId } });
      setBeats(result.beats);
    } catch (err) {
      setError(apiErrorMessage(err, '비트 시트 생성에 실패했습니다'));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="mt-8 rounded-[9px] border border-line p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-ink">비트 시트</h2>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="flex h-8 items-center gap-1.5 rounded-[5px] bg-primary px-3 text-[13px] font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <Sparkles className="size-3.5" strokeWidth={2.2} />
          {isGenerating ? '생성 중…' : '비트 시트 생성'}
        </button>
      </div>
      {error && <p className="text-[13px] text-danger">{error}</p>}
      {beats && (
        <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
          {beats.map((beat) => (
            <li key={beat}>{beat}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
