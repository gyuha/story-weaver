// World Bible 엔티티 카드를 서버에서 조회해 웹 Entity[] 모양으로 하이드레이션한다
// (editor/lib/hydrate-chapters.ts와 동일 패턴).
import { useWorksStore } from '@/features/shared/store/works.store';
import type { Entity } from '@/features/shared/types';
import { worldBibleApi } from '@/features/world-bible/api/world-bible.api';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { fromEntityResponse } from './entity-mapping';

/** 작품의 엔티티 카드를 전부 조회해 웹 Entity[] 모양으로 조립한다. */
export async function fetchWorkEntities(workId: string): Promise<Entity[]> {
  const entities = await worldBibleApi.entities({ path: { work_id: workId } });
  return entities.map(fromEntityResponse);
}

/** World Bible 화면 진입 시 서버의 엔티티 카드를 조회해 works.store의 해당 work.entities로 반영한다. */
export function useWorkEntities(workId: string) {
  const setWorkEntities = useWorksStore((s) => s.setWorkEntities);
  const { data, isPending, isError } = useQuery({
    queryKey: ['world-bible-entities', workId],
    queryFn: () => fetchWorkEntities(workId),
  });

  useEffect(() => {
    if (data) setWorkEntities(workId, data);
  }, [data, workId, setWorkEntities]);

  return { isPending, isError };
}
