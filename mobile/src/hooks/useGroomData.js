import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  feedingApi,
  healthApi,
  horseApi,
  inventoryApi,
  notificationApi,
  stableApi,
  taskApi,
  trainingApi,
} from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { getStockLevel, groupZones, myStallsOf, parseStableBlock, refId, summarizeTasks } from '../utils/groom';

const list = (query) => query.data?.data || [];

/** The groom's own worklist — the API already filters it to the signed-in user. */
export function useTasks() {
  const query = useQuery({ queryKey: ['tasks'], queryFn: () => taskApi.list() });
  return { ...query, tasks: list(query) };
}

/**
 * Incidents the groom filed, with the vet's handling on them. Served by its own endpoint now, so
 * reports stay visible even once the task they hang off has scrolled out of the worklist.
 */
export function useIncidents(status) {
  const query = useQuery({
    queryKey: ['incidents', status || 'all'],
    queryFn: () => stableApi.incidents(status ? { status } : undefined),
  });
  return { ...query, incidents: list(query) };
}

/**
 * Rations and prescriptions per horse with the stock behind each line, and what is short — the
 * server joins ration/dose items to inventory, so the app no longer matches names itself.
 */
export function useCarePlan(horseId) {
  const query = useQuery({
    queryKey: ['care-plan', horseId || 'all'],
    queryFn: () => stableApi.carePlan(horseId ? { horse: horseId } : undefined),
  });
  return { ...query, sheets: list(query) };
}

/** Everything every role did to one horse, in order. */
export function useHorseTimeline(horseId) {
  const query = useQuery({
    queryKey: ['horse-timeline', horseId],
    queryFn: () => horseApi.timeline(horseId),
    enabled: !!horseId,
  });
  return { ...query, events: query.data?.data?.events || [] };
}

/** Injuries the vet marked on one horse, shown on the 3D horse (components/HorseStage.jsx). */
export function useInjuryMarkers(horseId) {
  const query = useQuery({
    queryKey: ['injury-markers', horseId],
    queryFn: () => healthApi.injuryMarkers({ horse: horseId }),
    enabled: !!horseId,
    retry: false,
  });
  return { ...query, markers: list(query) };
}

/** The vet's record of routine care for one horse: vaccinations, deworming, farrier visits. */
export function useCareEvents(horseId) {
  const query = useQuery({
    queryKey: ['care-events', horseId],
    queryFn: () => horseApi.careEvents(horseId),
    enabled: !!horseId,
    retry: false,
  });
  return { ...query, careEvents: list(query) };
}

/**
 * The vet's treatments. Each ongoing one turns into today's medication / monitoring tasks for the
 * horse's caretaker (server/src/modules/health/treatmentCare.service.js), so the prescription and
 * the work to carry it out are two views of the same thing.
 */
export function useTreatments() {
  const query = useQuery({ queryKey: ['treatments'], queryFn: () => healthApi.treatments() });
  return { ...query, treatments: list(query) };
}

/**
 * The trainer's rations. `rations` is null until they have loaded, so a meal is never shown as
 * "no approved ration" just because the list hasn't arrived yet.
 */
export function useFeedings() {
  const query = useQuery({ queryKey: ['feeding'], queryFn: () => feedingApi.list() });
  return { ...query, feedings: list(query), rations: query.isSuccess ? list(query) : null };
}

/**
 * The store, each item carrying its level (`level`) by the same rule as the Manager's low-stock
 * warning: the minimum the Manager set, and how many days what the rations and prescriptions use
 * lasts (GET /inventory/forecast). Without the forecast the minimum alone decides.
 */
export function useInventory() {
  const query = useQuery({ queryKey: ['inventory'], queryFn: () => inventoryApi.list() });
  const forecastQuery = useQuery({ queryKey: ['inventory-forecast'], queryFn: () => inventoryApi.forecast(), retry: false });
  const items = useMemo(() => {
    const usage = new Map((forecastQuery.data?.data || []).map((f) => [String(f._id), f]));
    return (query.data?.data || []).map((item) => {
      const use = usage.get(String(item._id));
      return { ...item, dailyUsage: use?.dailyUsage ?? null, daysLeft: use?.daysLeft ?? null, level: getStockLevel(item, use) };
    });
  }, [query.data, forecastQuery.data]);
  return { ...query, items };
}

// The bell is how a groom hears that a request was approved or a delivery arrived; it checks again
// every minute rather than only when a screen opens.
const NOTIFICATION_POLL_MS = 60_000;

export function useNotifications() {
  const query = useQuery({ queryKey: ['notifications'], queryFn: () => notificationApi.list(), refetchInterval: NOTIFICATION_POLL_MS });
  return { ...query, notifications: list(query) };
}

export function useSessions() {
  const query = useQuery({ queryKey: ['sessions'], queryFn: () => trainingApi.sessions() });
  return { ...query, sessions: list(query) };
}

export function useHorse(id) {
  return useQuery({ queryKey: ['horse', id], queryFn: () => horseApi.getOne(id), enabled: !!id });
}

export function useHealthRecords(horseId) {
  const query = useQuery({
    queryKey: ['health-records', horseId],
    queryFn: () => healthApi.records({ horse: horseId }),
    enabled: !!horseId,
  });
  return { ...query, records: list(query) };
}

/**
 * Stalls + horses joined together: which horses this groom looks after, which stall each is in,
 * and which are under a vet training lock. Every screen needs some of this.
 */
export function useStableOverview() {
  const { user } = useAuth();
  const assignmentsQuery = useQuery({ queryKey: ['assignments'], queryFn: () => stableApi.assignments() });
  const horsesQuery = useQuery({ queryKey: ['horses'], queryFn: () => horseApi.list() });
  const treatmentsQuery = useQuery({ queryKey: ['treatments'], queryFn: () => healthApi.treatments() });

  const derived = useMemo(() => {
    const assignments = assignmentsQuery.data?.data || [];
    const horses = horsesQuery.data?.data || [];
    const treatments = treatmentsQuery.data?.data || [];

    const horseById = new Map(horses.map((h) => [h._id, h]));
    const assignmentByHorseId = new Map(assignments.map((a) => [refId(a.horse), a]));
    const myAssignments = assignments.filter((a) => refId(a.assignedCaretaker) === user?._id);
    const myHorseIds = new Set(myAssignments.map((a) => refId(a.horse)));
    const myBlocks = [...new Set(myAssignments.map((a) => parseStableBlock(a.stableBlock).block))];
    const lockedHorseIds = new Set(
      treatments.filter((t) => t.isTrainingLocked && t.status === 'ongoing').map((t) => refId(t.horse))
    );

    return { assignments, horses, horseById, assignmentByHorseId, myAssignments, myHorseIds, myBlocks, lockedHorseIds };
  }, [assignmentsQuery.data, horsesQuery.data, treatmentsQuery.data, user?._id]);

  return { ...derived, isLoading: assignmentsQuery.isLoading || horsesQuery.isLoading };
}

/**
 * The stable map as the Manager laid it out (GET /stable/stalls): its zones with every stall, empty or
 * under maintenance too, and the stalls whose horse this groom looks after.
 */
export function useStalls() {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['stalls'], queryFn: () => stableApi.stalls() });
  const derived = useMemo(() => {
    const map = query.data?.data || {};
    const mine = myStallsOf(map, user?._id);
    return {
      stalls: map.stalls || [],
      unplaced: map.unplaced || [],
      zones: groupZones(map.stalls || []),
      myStalls: mine.stalls,
      myUnplaced: mine.unplaced,
    };
  }, [query.data, user?._id]);
  return { ...query, ...derived };
}

/**
 * The worklist read the same way everywhere: today's work, what carries over, what is blocked and
 * what was missed (utils/groom.js summarizeTasks). Every counter and badge comes from here.
 */
export function useToday() {
  const { tasks, isLoading, refetch } = useTasks();
  const { rations } = useFeedings();
  const { items: inventory } = useInventory();
  return useMemo(() => {
    const ctx = { rations, inventory };
    const summary = summarizeTasks(tasks, ctx);
    return {
      ...summary,
      ctx,
      isLoading,
      refetch,
      allTasks: tasks,
      todayTasks: summary.today,
      done: summary.completed,
      incidents: tasks.filter((t) => t.incidentReport),
    };
  }, [tasks, rations, inventory, isLoading, refetch]);
}

/** Refetch everything the screens show — used by pull-to-refresh. */
export function useRefreshAll() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries();
}
