import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from '../horses/horsesApi';
import { stallApi, dailyTaskApi } from '../stable/stableApi';
import { healthRecordApi, treatmentApi, injuryMarkerApi, careEventApi } from '../health/healthApi';
import { trainingPlanApi, trainingSessionApi } from '../training/trainingApi';
import { raceApi } from '../race/raceApi';
import { financeApi } from '../finance/financeApi';
import { feedingApi } from '../feeding/feedingApi';
import { reportsApi } from '../reports/reportsApi';
import { idOf } from './ownerFormat';

/**
 * The Horse Owner's data, one hook per list. The server already keeps every list to the owner's own
 * horses; the query keys are the ones the other screens use, so a change made elsewhere refreshes here.
 */
const listOf = (query) => query.data?.data || [];
const NONE = [];

export function useMyHorses() {
  const query = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  return { ...query, horses: query.data?.data || NONE };
}
export function useOwnerSummary() {
  const query = useQuery({ queryKey: ['owner-summary'], queryFn: () => horsesApi.ownerSummary() });
  return { ...query, rows: query.data?.data || NONE };
}
export function useOwnerOverview() {
  const query = useQuery({ queryKey: ['owner-overview'], queryFn: () => horsesApi.ownerOverview() });
  return { ...query, overview: query.data?.data || null };
}
export function useHorse(id) {
  const query = useQuery({ queryKey: ['horses', id], queryFn: () => horsesApi.getOne(id), enabled: Boolean(id) });
  return { ...query, horse: query.data?.data || null };
}

/** Where each horse stands: its stall code and zone, from the stable map (one call for all); `stalls` is the map itself. */
export function useStallsByHorse() {
  const query = useQuery({ queryKey: ['stalls'], queryFn: () => stallApi.map() });
  const stalls = query.data?.data?.stalls || NONE;
  const byHorse = useMemo(() => {
    const map = new Map();
    (query.data?.data?.stalls || []).forEach((s) => {
      if (s.occupant?.horse?._id) map.set(String(s.occupant.horse._id), { code: s.code, zone: s.zoneName, caretaker: s.occupant.caretaker?.name || s.caretaker?.name || null });
    });
    (query.data?.data?.unplaced || []).forEach((u) => {
      if (u.horse?._id) map.set(String(u.horse._id), { code: u.stableBlock, zone: null, handwritten: true, caretaker: u.caretaker?.name || null });
    });
    return map;
  }, [query.data]);
  return { ...query, byHorse, stalls };
}
/** "Chuồng A-01 · Khu A", or the hand-written stall, or null. */
export const stallText = (stall) => (!stall ? null : stall.handwritten ? `Chuồng ${stall.code} (ghi tay)` : `Chuồng ${stall.code}${stall.zone ? ` · ${stall.zone}` : ''}`);

export function useSessions() {
  const query = useQuery({ queryKey: ['training-sessions'], queryFn: () => trainingSessionApi.list() });
  return { ...query, sessions: listOf(query) };
}
export function usePlans() {
  const query = useQuery({ queryKey: ['training-plans'], queryFn: () => trainingPlanApi.list() });
  return { ...query, plans: listOf(query) };
}
export function useHealthRecords() {
  const query = useQuery({ queryKey: ['health-records'], queryFn: () => healthRecordApi.list() });
  const records = useMemo(() => [...listOf(query)].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)), [query.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...query, records };
}
export function useTreatments() {
  const query = useQuery({ queryKey: ['treatments'], queryFn: () => treatmentApi.list() });
  return { ...query, treatments: listOf(query) };
}
export function useInjuries() {
  const query = useQuery({ queryKey: ['injuries'], queryFn: () => injuryMarkerApi.list() });
  return { ...query, injuries: listOf(query) };
}
export function useCareEvents(horseId) {
  const query = useQuery({ queryKey: ['care-events', horseId], queryFn: () => careEventApi.list(horseId), enabled: Boolean(horseId) });
  return { ...query, events: listOf(query) };
}
export function useRaces() {
  const query = useQuery({ queryKey: ['races'], queryFn: () => raceApi.list() });
  return { ...query, races: listOf(query) };
}
export function useMyFinance() {
  const query = useQuery({ queryKey: ['finance', 'mine'], queryFn: () => financeApi.listMine() });
  return { ...query, entries: listOf(query) };
}
export function useDailyTasks() {
  const query = useQuery({ queryKey: ['daily-tasks'], queryFn: () => dailyTaskApi.list() });
  return { ...query, tasks: listOf(query) };
}
export function useFeedings() {
  const query = useQuery({ queryKey: ['feeding-schedules'], queryFn: () => feedingApi.list() });
  return { ...query, feedings: listOf(query) };
}
export function useTrainingChart(params) {
  const query = useQuery({ queryKey: ['training-chart', 'owner', params], queryFn: () => reportsApi.trainingChart(params) });
  return { ...query, chart: query.data?.data || null };
}

/**
 * The horse a page is narrowed to, kept in the URL (?horse=<id>) so a link or a reload keeps it.
 * Returns [horseId | null, setHorse].
 */
export function useHorseParam(horses) {
  const [params, setParams] = useSearchParams();
  const wanted = params.get('horse');
  const horseId = wanted && horses.some((h) => idOf(h) === wanted) ? wanted : null;
  const setHorse = (id) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (id) next.set('horse', id);
        else next.delete('horse');
        return next;
      },
      { replace: true },
    );
  return [horseId, setHorse];
}

/**
 * The tab a page shows, kept in the URL (?tab=<key>, or another `name` for a tab row inside a tab);
 * the first key is the default and leaves no param.
 */
export function useTabParam(keys, name = 'tab') {
  const [params, setParams] = useSearchParams();
  const wanted = params.get(name);
  const tab = keys.includes(wanted) ? wanted : keys[0];
  const setTab = (key) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (key === keys[0]) next.delete(name);
        else next.set(name, key);
        return next;
      },
      { replace: true },
    );
  return [tab, setTab];
}
