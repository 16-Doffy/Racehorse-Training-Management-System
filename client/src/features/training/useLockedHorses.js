import { useQuery } from '@tanstack/react-query';
import { horsesApi } from '../horses/horsesApi';

/**
 * Every horse's training clearance as the server computes it (the vet's level on the ongoing
 * treatments: none = locked, light / moderate = recovering, high = clear), as a Map by horse id.
 */
export function useHorseClearances() {
  const { data } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  return new Map((data?.data || []).map((h) => [String(h._id), h.trainingClearance || { level: 'high' }]));
}

/**
 * Horses that can't be trained at all right now: locked by the vet, or injured / quarantined.
 * A horse recovering at a reduced level is not in this set — it may still do lighter work.
 */
export function useLockedHorseIds() {
  const { data } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  return new Set(
    (data?.data || [])
      .filter((h) => h.trainingClearance?.level === 'none' || h.healthStatus === 'injured' || h.healthStatus === 'quarantined')
      .map((h) => String(h._id))
  );
}
