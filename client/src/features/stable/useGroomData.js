import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useQuery } from '@tanstack/react-query';
import { dailyTaskApi, stableAssignmentApi } from './stableApi';
import { horsesApi } from '../horses/horsesApi';
import { treatmentApi } from '../health/healthApi';
import { feedingApi } from '../feeding/feedingApi';
import { trainingSessionApi } from '../training/trainingApi';
import { parseStableBlock, refId } from './groomConfig';

/** The logged-in Groom's own worklist (the API filters to assignedTo = me for the Groom role). */
export function useMyTasks() {
  const query = useQuery({ queryKey: ['my-daily-tasks'], queryFn: () => dailyTaskApi.list() });
  return { ...query, tasks: query.data?.data || [] };
}

/**
 * Stall assignments + horse roster, joined and split into "mine" vs. the whole stable.
 * Every Groom screen needs the same lookups (which stall a horse is in, which horses/blocks
 * this groom is responsible for), so they are derived once here.
 */
export function useStableOverview() {
  const userId = useSelector((state) => state.auth.user?._id);

  const assignmentsQuery = useQuery({ queryKey: ['stable-assignments'], queryFn: () => stableAssignmentApi.list() });
  const horsesQuery = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  // Treatments are readable by every role; only the active training locks matter here.
  const treatmentsQuery = useQuery({ queryKey: ['treatments'], queryFn: () => treatmentApi.list() });

  const derived = useMemo(() => {
    const assignments = assignmentsQuery.data?.data || [];
    const horses = horsesQuery.data?.data || [];
    const treatments = treatmentsQuery.data?.data || [];

    const horseById = new Map(horses.map((h) => [h._id, h]));
    const assignmentByHorseId = new Map(assignments.map((a) => [refId(a.horse), a]));
    const myAssignments = assignments.filter((a) => refId(a.assignedCaretaker) === userId);
    const myHorseIds = new Set(myAssignments.map((a) => refId(a.horse)));
    const myBlocks = [...new Set(myAssignments.map((a) => parseStableBlock(a.stableBlock).block))];
    const lockedHorseIds = new Set(
      treatments.filter((t) => t.isTrainingLocked && t.status === 'ongoing').map((t) => refId(t.horse))
    );

    return { assignments, horses, horseById, assignmentByHorseId, myAssignments, myHorseIds, myBlocks, lockedHorseIds };
  }, [assignmentsQuery.data, horsesQuery.data, treatmentsQuery.data, userId]);

  return {
    ...derived,
    userId,
    isLoading: assignmentsQuery.isLoading || horsesQuery.isLoading,
  };
}

export function useFeedingSchedules() {
  const query = useQuery({ queryKey: ['feeding-schedules'], queryFn: () => feedingApi.list() });
  return { ...query, feedings: query.data?.data || [] };
}

export function useTrainingSessions() {
  const query = useQuery({ queryKey: ['training-sessions'], queryFn: () => trainingSessionApi.list() });
  return { ...query, sessions: query.data?.data || [] };
}
