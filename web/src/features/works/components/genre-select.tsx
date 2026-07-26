import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';

type GenreSelectProps = {
  items: { value: string; emoji: string }[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function GenreSelect({
  items,
  value,
  onChange,
  placeholder = '장르를 검색하거나 선택하세요',
}: GenreSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = items.find((item) => item.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-expanded={open}
        className={cn(
          'flex h-[42px] w-full items-center justify-between rounded-md border border-line-strong px-3.5 text-sm focus:border-primary focus:outline-none',
          selected ? 'text-ink' : 'text-faintest'
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {selected ? (
            <>
              <span className="text-base leading-none">{selected.emoji}</span>
              {selected.value}
            </>
          ) : (
            placeholder
          )}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-faint" strokeWidth={2} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-0">
        <Command>
          <CommandInput placeholder="장르 검색..." />
          <CommandList>
            <CommandEmpty>장르를 찾을 수 없습니다</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.value}
                  onSelect={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <span className="text-base leading-none">{item.emoji}</span>
                  {item.value}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
