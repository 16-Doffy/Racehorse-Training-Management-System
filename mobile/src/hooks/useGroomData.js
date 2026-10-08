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
import { useOutbox } from '../offline/OutboxContext';
import { applyOutbox } from '../offline/overlay';
import { isSameDay, parseStableBlock, refId } from '../utils/groom';

const list = (query) => query.data?.data || [];

/** The groom's own worklist — the API already filters it to the signed-in user. */
export function useTasks() {
  const query = useQuery({ queryKey: ['tasks'], queryFn: () => taskApi.list() });
  const { items } = useOutbox();
  const data = query.data?.data;
  // What was done offline already shows as done, marked "chờ gửi", until the server has it.
  const tasks = useMemo(() => applyOutbox(data || [], items), [data, items]);
  return { ...query, tasks };
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

/** Everything every role did to one horse, in order. */
export function useHorseTimeline(horseId) {
  const query = useQuery({
    queryKey: ['horse-timeline', horseId],
    queryFn: () => horseApi.timeline(horseId),
    enabled: !!horseId,
  });
  return { ...query, events: query.data?.data?.events || [] };
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

export function useFeedings() {
  const query = useQuery({ queryKey: ['feeding'], queryFn: () => feedingApi.list() });
  return { ...query, feedings: list(query) };
}

export function useInventory() {
  const query = useQuery({ queryKey: ['inventory'], queryFn: () => inventoryApi.list() });
  return { ...query, items: list(query) };
}

export function useNotifications() {
  const query = useQuery({ queryKey: ['notifications'], queryFn: () => notificationApi.list() });
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

/** Today's tasks, split the way the screens need them. */
export function useToday() {
  const { tasks, isLoading, refetch } = useTasks();
  return useMemo(() => {
    const today = tasks.filter((t) => isSameDay(t.scheduledDate, new Date()));
    return {
      isLoading,
      refetch,
      allTasks: tasks,
      todayTasks: today,
      done: today.filter((t) => t.status === 'completed'),
      pending: today.filter((t) => t.status === 'pending'),
      overdue: tasks.filter((t) => t.status === 'pending' && new Date(t.scheduledDate) < new Date(new Date().setHours(0, 0, 0, 0))),
      incidents: tasks.filter((t) => t.incidentReport),
    };
  }, [tasks, isLoading, refetch]);
}

/** Refetch everything the screens show — used by pull-to-refresh. */
export function useRefreshAll() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries();
}
