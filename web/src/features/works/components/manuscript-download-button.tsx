import { apiErrorMessage } from '@/features/auth/lib/api-error';
import type { Work } from '@/features/shared/types';
import { downloadManuscriptZip } from '@/features/works/api/manuscript-export.api';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/** 소설 전체를 zip으로 내려받는 버튼 — 사이드바 하단 고정용(모든 작품 화면에서 노출). */
export function ManuscriptDownloadButton({ work }: { work: Work }) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = () => {
    setIsDownloading(true);
    downloadManuscriptZip(work.id, work.title)
      .catch((err) => toast.error(apiErrorMessage(err, '다운로드에 실패했습니다')))
      .finally(() => setIsDownloading(false));
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={isDownloading}
      className="flex h-8 w-full items-center gap-2 rounded-[5px] px-2.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-ink/[0.04] disabled:opacity-40"
    >
      <Download className="size-3.5 shrink-0 text-faint" strokeWidth={2} />
      <span className="truncate">{isDownloading ? '다운로드 중…' : '소설 다운로드(.zip)'}</span>
    </button>
  );
}
