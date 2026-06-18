import { cn } from '@/lib/utils';
import { Pencil } from 'lucide-react';

interface LogoMarkProps {
  size?: number;
  className?: string;
  withWordmark?: boolean;
}

/** StoryWeaver 로고 마크 — 먹빛 둥근 사각형 + 펜촉 */
export function LogoMark({ size = 30, className, withWordmark = false }: LogoMarkProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className="grid shrink-0 place-items-center rounded-[7px] bg-ink text-white"
        style={{ width: size, height: size }}
      >
        <Pencil style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={2} />
      </div>
      {withWordmark && (
        <span className="text-[20px] font-bold tracking-[-0.01em] text-ink">StoryWeaver</span>
      )}
    </div>
  );
}
