import { Suspense, lazy } from 'react';
import type { Control, FieldValues } from 'react-hook-form';

// Vite tree-shakes the entire branch (and the @hookform/devtools chunk)
// from production builds because import.meta.env.DEV is statically false.
const LazyDevTool = import.meta.env.DEV
  ? lazy(() => import('@hookform/devtools').then((m) => ({ default: m.DevTool })))
  : null;

interface FormDevtoolProps<T extends FieldValues> {
  control: Control<T>;
}

export function FormDevtool<T extends FieldValues>({ control }: FormDevtoolProps<T>) {
  if (!LazyDevTool) return null;
  return (
    <Suspense fallback={null}>
      <LazyDevTool control={control as unknown as Control<FieldValues>} />
    </Suspense>
  );
}
