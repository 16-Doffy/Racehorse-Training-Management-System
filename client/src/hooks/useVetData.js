import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import vetApi from '../api/veterinarianApi';
import { isExamTool } from '../components/veterinarian/medicineCatalog';

/**
 * What the vet's pages read, through React Query: a page shows what it already has at once while it
 * refreshes, and moving between pages no longer reloads everything behind a full-page spinner.
 * Every key starts with 'vet', so one call (useVetRefresh) brings them all up to date after a change.
 */
const rows = (request) => request.then((res) => res?.data ?? []);

export const vetKeys = {
  horses: ['vet', 'horses'],
  horse: (id) => ['vet', 'horse', id],
  records: (horse) => ['vet', 'records', horse || 'all'],
  treatments: (horse) => ['vet', 'treatments', horse || 'all'],
  injuries: (horse) => ['vet', 'injuries', horse || 'all'],
  requests: ['vet', 'exam-requests'],
  incidents: ['vet', 'incidents'],
  clearances: ['vet', 'clearances'],
  careOrders: ['vet', 'care-orders'],
  careEvents: (horse) => ['vet', 'care-events', horse],
  inventory: ['vet', 'inventory'],
  rxTemplates: ['vet', 'rx-templates'],
};

export const useVetHorses = () => useQuery({ queryKey: vetKeys.horses, queryFn: () => rows(vetApi.getHorses()) });

export const useVetHorse = (id) =>
  useQuery({ queryKey: vetKeys.horse(id), queryFn: () => vetApi.getHorseById(id).then((res) => res.data), enabled: Boolean(id) });

export const useHealthRecords = (horse, { enabled = true } = {}) =>
  useQuery({ queryKey: vetKeys.records(horse), queryFn: () => rows(vetApi.getHealthRecords(horse ? { horse } : undefined)), enabled });

export const useTreatments = (horse) =>
  useQuery({ queryKey: vetKeys.treatments(horse), queryFn: () => rows(vetApi.getTreatments(horse ? { horse } : undefined)) });

export const useInjuries = (horse) =>
  useQuery({ queryKey: vetKeys.injuries(horse), queryFn: () => rows(vetApi.getInjuryMarkers(horse ? { horse } : undefined)) });

/** Open requests only: the vet's queue. */
export const useExamRequests = () => useQuery({ queryKey: vetKeys.requests, queryFn: () => rows(vetApi.getExamRequests({ status: 'pending' })) });

/** Groom reports the vet has not closed yet. */
export const useIncidents = () => useQuery({ queryKey: vetKeys.incidents, queryFn: () => rows(vetApi.getIncidents({ status: 'unresolved' })) });

/** One row per horse: its last exam and whether that exam still clears it for hard work. */
export const useClearances = () => useQuery({ queryKey: vetKeys.clearances, queryFn: () => rows(vetApi.getClearances({ all: true })) });

export const useCareOrders = () =>
  useQuery({ queryKey: vetKeys.careOrders, queryFn: () => rows(vetApi.getCareOrders()), refetchInterval: 60 * 1000 });

export const useCareEvents = (horse) =>
  useQuery({ queryKey: vetKeys.careEvents(horse), queryFn: () => rows(vetApi.getCareEvents(horse)), enabled: Boolean(horse) });

/** The club's whole stock list (the prescription form picks the medicines out of it). */
export const useInventory = (select) => useQuery({ queryKey: vetKeys.inventory, queryFn: () => rows(vetApi.getInventory()), select });
const pickTools = (items) => items.filter(isExamTool);

/** The examination tools the vet keeps (stethoscope, thermometer, needles…), with any the vet proposed. */
export const useExamTools = () => useInventory(pickTools);

/** Ready-made prescriptions the vets saved. */
export const useRxTemplates = () => useQuery({ queryKey: vetKeys.rxTemplates, queryFn: () => rows(vetApi.getPrescriptionTemplates()) });

/** Reads everything again after a change (the trainer's care-order card shares the server data). */
export function useVetRefresh() {
  const queryClient = useQueryClient();
  return useCallback(
    () => Promise.all([queryClient.invalidateQueries({ queryKey: ['vet'] }), queryClient.invalidateQueries({ queryKey: ['care-orders'] })]),
    [queryClient]
  );
}
