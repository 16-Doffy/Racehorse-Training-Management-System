import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Card,
  Table,
  Button,
  Typography,
  Modal,
  Form,
  Select,
  DatePicker,
  Tag,
  InputNumber,
  Input,
  Segmented,
  Row,
  Col,
  Alert,
  Divider,
  Tooltip,
  Space,
  Dropdown,
  Radio,
} from 'antd';
import { message, notification } from '../../lib/antdStatic';
import {
  PlusOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  EditOutlined,
  CloseOutlined,
  FlagOutlined,
  AimOutlined,
  PlayCircleOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  UnorderedListOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
  CheckCircleOutlined,
  PauseCircleOutlined,
  MoreOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trainingSessionApi, trainingPlanApi } from './trainingApi';
import { horsesApi } from '../horses/horsesApi';
import { raceApi } from '../race/raceApi';
import RequestExamModal from '../health/RequestExamModal';
import { useLockedHorseIds, useHorseClearances } from './useLockedHorses';
import { TRAINING_LEVEL_META, LEVEL_RANK, INTENSITY_RANK, intensityAllowed } from '../../constants/health';
import ReadinessPanel from './ReadinessPanel';
import PreCheckModal from './PreCheckModal';
import { whereNow, raceLine } from './PlanFocusPanel';
import ChangeWorkoutModal from './ChangeWorkoutModal';
import LiveSessionMonitor from './LiveSessionMonitor';
import SessionReplay from './SessionReplay';
import MovingHorse3D from '../horses/horse3d/MovingHorse3D';
import { hourOf, motionOfKind, surfaceOf } from '../horses/horse3d/horseMotion';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import { useClubPolicy, precheckRuleText, afternoonProblem } from './useClubPolicy';
import { SESSION_STATUS_LABELS as STATUS_LABELS, SESSION_STATUS_COLORS as STATUS_COLORS } from './sessionStatus';
import SessionOutcome from './SessionOutcome';
import confirmReadinessOverride, { needsOverride } from './confirmReadinessOverride';
import WeekCalendar from './WeekCalendar';
import DayShiftView from './DayShiftView';
import {
  OBJECTIVE_LABELS,
  OBJECTIVE_DESCRIPTIONS,
  INTENSITY_LABELS,
  INTENSITY_COLORS,
  PHASE_LABELS,
  objectiveOptions,
  intensityOptions,
  SESSION_KINDS,
  kindOptions,
  KIND_SPEED_RANGES,
  PRESCRIPTION_LIMITS,
  METRIC_LIMITS,
  sessionTimeLabel,
  mondayOf,
  actualTimeLabel,
  TRAINER_ABORT_OPTIONS,
  TRIAL_MIN_RACE_SHARE,
  canReplay,
  segmentSafetyWarnings,
} from './trainingVocab';
import { newestFirst } from '../../utils/newestFirst';
import { coachNoteFor, kindAllowed, kindForObjective, phaseOn, recentDone, suggestWorkout, templateDayOn } from './workoutSuggest';
import { dayClash, horseDay, stateOf } from './sessionDay';

const { Text } = Typography;

const SESSION_TYPE_LABELS = { training: 'Buổi tập thường', trial_run: 'Lượt chạy thử' };
const futureTimeRule = {
  validator: (_, value) =>
    !value || value.isAfter(dayjs())
      ? Promise.resolve()
      : Promise.reject(new Error('Chọn giờ bắt đầu ở tương lai.')),
};

/** Renders the prescribed workout as a sentence a reader can follow without knowing the schema. */
function describePrescription(p) {
  if (!p) return null;
  const parts = [];
  if (p.distanceM) parts.push(`${p.distanceM}m`);
  if (p.reps && p.reps > 1) parts.push(`${p.reps} hiệp`);
  if (p.restMinutes) parts.push(`nghỉ ${p.restMinutes}'`);
  if (p.targetSpeedKmh) parts.push(`mục tiêu ${p.targetSpeedKmh} km/h`);
  if (p.targetHeartRateMax) parts.push(`nhịp tim ≤ ${p.targetHeartRateMax} bpm`);
  return parts.length ? parts.join(' · ') : null;
}

/** Under the week: the club's four checks for the next session booked today, as they stand now. */
function NextReadiness({ sessions }) {
  const next = sessions
    .filter((s) => ['scheduled', 'ready'].includes(s.status) && dayjs(s.scheduledAt).isAfter(dayjs()) && dayjs(s.scheduledAt).isSame(dayjs(), 'day'))
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0];
  if (!next) return null;
  return (
    <Card size="small" className="!mt-4" title={`Kiểm tra sẵn sàng buổi kế tiếp: ${next.horse?.name || 'Ngựa'}, ${dayjs(next.scheduledAt).format('HH:mm')}`}>
      <ReadinessPanel horse={next.horse?._id || next.horse} scheduledAt={next.scheduledAt} intensity={next.intensity} sessionType={next.sessionType} objective={next.objective} />
    </Card>
  );
}

export default function TrainingSessionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // ?new=1 (the dashboard's "Lập buổi tập mới") lands with the create form already open.
  const [createOpen, setCreateOpen] = useState(() => searchParams.get('new') === '1');
  const [evalOpen, setEvalOpen] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  // The week view is always the primary entry point; a ?session=<id> deep-link jumps to that session's week
  // and highlights/opens its chip right on the calendar instead of forcing the flat list view.
  const focusSession = searchParams.get('session');
  const [view, setView] = useState('week');
  const [weekStart, setWeekStart] = useState(() => mondayOf(dayjs()));
  const [selectedDay, setSelectedDay] = useState(() => dayjs());
  const [createForm] = Form.useForm();
  const [evalForm] = Form.useForm();
  const [endSession, setEndSession] = useState(null);
  const [endForm] = Form.useForm();
  const [abortSession, setAbortSession] = useState(null);
  // The finished run being played back.
  const [replaySession, setReplaySession] = useState(null);
  const [abortForm] = Form.useForm();
  const draftKind = Form.useWatch('kind', createForm);
  const draftObjective = Form.useWatch('objective', createForm);
  const draftSpeed = Form.useWatch(['prescription', 'targetSpeedKmh'], createForm);
  const draftPlanId = Form.useWatch('trainingPlan', createForm);
  // The exam request being written: { horseId, session?, defaults? }.
  const [examFor, setExamFor] = useState(null);
  const [preCheckSession, setPreCheckSession] = useState(null);
  const [scheduleSession, setScheduleSession] = useState(null);
  // The booked session whose work the trainer is changing ("Đổi bài tập").
  const [workSession, setWorkSession] = useState(null);
  const [scheduleForm] = Form.useForm();
  const [cancelSession, setCancelSession] = useState(null);
  const [cancelForm] = Form.useForm();
  const queryClient = useQueryClient();
  const planFilter = searchParams.get('plan');
  // Drop ?new=1 once read, so a reload or Back does not open the form again.
  useEffect(() => {
    if (!searchParams.has('new')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const horseFilter = searchParams.get('horse');
  const lockedHorseIds = useLockedHorseIds();
  const clearances = useHorseClearances();

  // The readiness board has to follow what the trainer is currently typing, so these mirror the
  // form fields it depends on.
  const [draft, setDraft] = useState({});
  // The workout filled in for the horse, and why (workoutSuggest.js). `rxEdited`: the trainer changed the
  // numbers by hand, so a later change of horse or time no longer rewrites them.
  const [suggestion, setSuggestion] = useState(null);
  const [rxEdited, setRxEdited] = useState(false);
  const auto = useRef({ rxEdited: false, kindFromPlan: false, note: '' });
  const markEdited = (value) => {
    auto.current.rxEdited = value;
    setRxEdited(value);
  };
  useEffect(() => {
    if (!createOpen) return;
    auto.current = { rxEdited: false, kindFromPlan: false, note: '' };
    setRxEdited(false);
    setSuggestion(null);
  }, [createOpen]);

  const { data: sessionsData, isLoading, isError, error, refetch } = useQuery({
    // Re-fetches whenever the filter changes, letting the server do the filtering rather than
    // hiding rows client-side — keeps this consistent with every other list page in the app.
    queryKey: ['training-sessions', typeFilter, planFilter, horseFilter],
    queryFn: () =>
      trainingSessionApi.list({
        ...(typeFilter !== 'all' ? { sessionType: typeFilter } : {}),
        ...(planFilter ? { trainingPlan: planFilter } : {}),
        ...(horseFilter ? { horse: horseFilter } : {}),
      }),
    // A running session fills in from the sensor feed and closes itself: keep the board current.
    refetchInterval: (query) => {
      const sessions = query.state.data?.data || [];
      if (sessions.some((x) => x.status === 'in_progress')) return 5000;
      return sessions.some((x) => ['scheduled', 'ready', 'blocked'].includes(x.status)) ? 30000 : false;
    },
  });
  const { data: plansData } = useQuery({ queryKey: ['training-plans'], queryFn: () => trainingPlanApi.list() });
  const listRows = newestFirst(sessionsData?.data);
  const focusIndex = focusSession ? listRows.findIndex((r) => r._id === focusSession) : -1;
  const focusedSessionObj = focusIndex >= 0 ? listRows[focusIndex] : null;
  useEffect(() => {
    if (!focusedSessionObj?.scheduledAt) return undefined;
    setWeekStart(mondayOf(dayjs(focusedSessionObj.scheduledAt)));
    setView('week');
    const timer = setTimeout(() => document.querySelector('[data-focus="session"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
    return () => clearTimeout(timer);
  }, [focusedSessionObj?._id, focusedSessionObj?.scheduledAt]);
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const { data: racesData } = useQuery({ queryKey: ['races'], queryFn: () => raceApi.list() });
  const draftSessionType = Form.useWatch('sessionType', createForm);
  const draftIsTrial = draftKind === 'trial' || draftSessionType === 'trial_run';
  // A trial is run for one of the horse's entries still to come.
  const trialRaceOptions = (racesData?.data || [])
    .filter((r) => String(r.horse?._id || r.horse) === String(draft.horse) && ['registered', 'confirmed'].includes(r.status) && dayjs(r.raceDate).isAfter(dayjs()))
    .map((r) => ({ value: r._id, label: `${r.raceName} — ${dayjs(r.raceDate).format('DD/MM/YYYY')}${r.distance ? ` · ${r.distance}m` : ''}` }));
  // The trial's distance against its race's: shown beside the field, with a warning when much shorter.
  const draftRaceId = Form.useWatch('raceEntry', createForm);
  const draftDistance = Form.useWatch(['prescription', 'distanceM'], createForm);
  const draftRace = draftIsTrial ? (racesData?.data || []).find((r) => String(r._id) === String(draftRaceId)) : null;
  const trialShare = draftRace?.distance && draftDistance ? draftDistance / draftRace.distance : null;
  const trialTooShort = trialShare !== null && trialShare < TRIAL_MIN_RACE_SHARE;
  const firstWeek = searchParams.get('first') === '1';
  const policy = useClubPolicy();
  const draftAt = Form.useWatch('scheduledAt', createForm);
  const draftEndAt = Form.useWatch('endAt', createForm);
  const draftDuration = Form.useWatch(['prescription', 'durationMinutes'], createForm);
  const draftSegments = Form.useWatch('segments', createForm);
  const segmentWarnings = segmentSafetyWarnings(draftSegments);
  const draftSlotProblem = afternoonProblem(policy, draftKind, draftAt);

  const filteredPlan = planFilter ? (plansData?.data || []).find((p) => p._id === planFilter) : null;
  const filteredHorse = horseFilter ? (horsesData?.data || []).find((h) => h._id === horseFilter) : null;
  // The plan behind what is shown: the one filtered on, else the horse's running plan.
  const contextPlan = filteredPlan || (filteredHorse ? (plansData?.data || []).find((p) => p.status === 'active' && String(p.horse?._id) === String(filteredHorse._id)) : null);
  const contextPhase = contextPlan?.phases?.[contextPlan.progress?.phaseIndex ?? 0];
  const contextNoWeek = Boolean(contextPlan && contextPlan.status === 'active' && contextPlan.progress?.started && !contextPlan.progress?.ended && !contextPhase?.week?.length);
  const draftHorse = draft.horse ? (horsesData?.data || []).find((h) => String(h._id) === String(draft.horse)) : null;
  const allSessions = sessionsData?.data || [];

  const horseOptions = (horsesData?.data || []).map((h) => ({
    value: h._id,
    label: lockedHorseIds.has(h._id)
      ? `${h.name} (đang bị khóa huấn luyện)`
      : h.trainingClearance?.restricted
        ? `${h.name} (hồi phục — ${h.trainingClearance.label})`
        : h.name,
    disabled: lockedHorseIds.has(h._id),
  }));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['session-readiness'] });
  };

  const syncSegmentsToForm = (rawSegments, { resetWhenEmpty = false } = {}) => {
    const segs = (rawSegments || []).filter((s) => s?.kind);
    const start = createForm.getFieldValue('scheduledAt');
    if (segs.length > 0) {
      const nextMin = segs.reduce((s, x) => s + (Number(x?.durationMinutes) || 0), 0);
      const nextDist = segs.reduce((s, x) => s + (Number(x?.distanceM) || 0), 0);
      if (nextMin > 0) {
        createForm.setFieldValue(['prescription', 'durationMinutes'], nextMin);
        if (start) createForm.setFieldValue('endAt', dayjs(start).add(nextMin, 'minute'));
      }
      if (nextDist > 0) createForm.setFieldValue(['prescription', 'distanceM'], nextDist);
      return;
    }
    if (resetWhenEmpty) {
      const currentKind = createForm.getFieldValue('kind');
      const baseRx = SESSION_KINDS[currentKind]?.prescription;
      if (baseRx?.durationMinutes) {
        createForm.setFieldValue(['prescription', 'durationMinutes'], baseRx.durationMinutes);
        if (start) createForm.setFieldValue('endAt', dayjs(start).add(baseRx.durationMinutes, 'minute'));
      }
      if (baseRx?.distanceM !== undefined) {
        createForm.setFieldValue(['prescription', 'distanceM'], baseRx.distanceM);
      }
    }
  };

  // The horse's own past sessions (whatever the list is filtered on), for what it did in the last days.
  const { data: horseSessionsData } = useQuery({
    queryKey: ['training-sessions', 'horse-recent', draft.horse],
    queryFn: () => trainingSessionApi.list({ horse: draft.horse }),
    enabled: Boolean(createOpen && draft.horse),
  });
  const activePlanOf = (horseId) => (plansData?.data || []).find((p) => String(p.horse?._id) === String(horseId) && p.status === 'active');

  /**
   * Fills the workout for `kind` and `objective`, fitted to the horse picked and the time: intensity, type and
   * every number of the prescription, and the rider's brief while the trainer has not written one. Returns the
   * values it set, for the change handler to carry on with.
   */
  const applySuggestion = ({ kind, objective, values }) => {
    const horseId = values.horse;
    const horse = (horsesData?.data || []).find((h) => String(h._id) === String(horseId));
    const plan = (plansData?.data || []).find((p) => String(p._id) === String(values.trainingPlan)) || activePlanOf(horseId);
    const phase = phaseOn(plan, values.scheduledAt);
    const raceId = values.raceEntry || plan?.targetRace?._id || plan?.targetRace;
    const race = (racesData?.data || []).find((r) => String(r._id) === String(raceId));
    const s = suggestWorkout({
      kind,
      objective,
      horse,
      clearance: clearances.get(String(horseId)),
      phase,
      templateDay: templateDayOn(phase, values.scheduledAt),
      race,
      recent: recentDone(horseSessionsData?.data, horseId, values.scheduledAt),
      at: values.scheduledAt,
    });
    if (!s) return {};
    createForm.setFieldsValue({ kind: s.kind, objective: s.objective, intensity: s.intensity, sessionType: s.sessionType });
    // One field at a time, so a number the new workout does not use (rest between reps…) is cleared.
    Object.entries(s.prescription).forEach(([field, value]) => createForm.setFieldValue(['prescription', field], value));
    const note = createForm.getFieldValue('coachNote');
    if (!note || note === auto.current.note) {
      const brief = coachNoteFor({ kind: s.kind, prescription: s.prescription, horse });
      createForm.setFieldValue('coachNote', brief);
      auto.current.note = brief;
    }
    markEdited(false);
    setSuggestion({ ...s, horseName: horse?.name, phaseKey: phase?.key });
    return { kind: s.kind, objective: s.objective, intensity: s.intensity, sessionType: s.sessionType, prescription: { ...(values.prescription || {}), ...s.prescription } };
  };

  /** Everything the form works out by itself when a field changes (antd onValuesChange). */
  const onCreateChange = (changed, allValues) => {
    let all = allValues;
    // The trainer's own numbers from now on.
    if (changed.prescription || changed.intensity) markEdited(true);
    // A horse follows one plan at a time: file the session under it.
    if (changed.horse) {
      const plan = activePlanOf(changed.horse);
      createForm.setFieldValue('trainingPlan', plan?._id);
      // A trial defaults to the race the plan prepares for.
      createForm.setFieldValue('raceEntry', plan?.targetRace?._id || plan?.targetRace || undefined);
      all = { ...all, trainingPlan: plan?._id, raceEntry: plan?.targetRace?._id || plan?.targetRace || undefined };
    }
    // What to fill in: the kind picked; the kind that serves the purpose picked; or, for a new horse or time,
    // the plan's normal week for that day (when no kind was chosen by hand) or the same work fitted again.
    const clearance = clearances.get(String(all.horse));
    let pick = null;
    if (changed.kind) {
      auto.current.kindFromPlan = false;
      pick = { kind: changed.kind, objective: SESSION_KINDS[changed.kind]?.objective };
    } else if (changed.objective) {
      const kind = kindForObjective(changed.objective, all.kind, clearance);
      if (kind) pick = { kind, objective: changed.objective };
      else {
        message.warning('Bác sĩ đang giới hạn mức tập của ngựa này — chưa tập cho mục đích đó được.');
        const back = all.kind ? SESSION_KINDS[all.kind].objective : 'recovery';
        createForm.setFieldValue('objective', back);
        all = { ...all, objective: back };
      }
    } else if (changed.horse || changed.scheduledAt || changed.raceEntry) {
      const template = templateDayOn(phaseOn(activePlanOf(all.horse), all.scheduledAt), all.scheduledAt);
      if ((!all.kind || auto.current.kindFromPlan) && template && kindAllowed(clearance, template.kind)) {
        auto.current.kindFromPlan = true;
        pick = { kind: template.kind, objective: SESSION_KINDS[template.kind].objective };
      } else if (all.kind && !auto.current.rxEdited) {
        pick = { kind: all.kind, objective: all.objective };
      }
    }
    if (pick) all = { ...all, ...applySuggestion({ ...pick, values: all }) };
    // A trial is run over its race's distance, even when the other numbers were set by hand.
    else if (changed.raceEntry && (all.kind === 'trial' || all.sessionType === 'trial_run')) {
      const r = (racesData?.data || []).find((x) => String(x._id) === String(changed.raceEntry));
      if (r?.distance) createForm.setFieldValue(['prescription', 'distanceM'], r.distance);
    }

    // A recovering horse can't be booked above the vet's level: pull the intensity down to
    // the highest one allowed as soon as the horse is picked — never below what the kind of
    // work is (a canter stays moderate; the readiness panel then says it isn't allowed).
    let intensity = all.intensity;
    if (changed.horse || changed.kind) {
      const kindFloor = INTENSITY_RANK[SESSION_KINDS[all.kind]?.intensity] || 0;
      if (clearance?.restricted && !intensityAllowed(clearance, intensity)) {
        const allowed = Object.keys(INTENSITY_RANK).filter((i) => INTENSITY_RANK[i] <= LEVEL_RANK[clearance.level] && INTENSITY_RANK[i] >= kindFloor);
        if (allowed.length) {
          intensity = allowed[allowed.length - 1];
          createForm.setFieldValue('intensity', intensity);
        }
      }
    }
    const activeSegments = (all.segments || []).filter((seg) => seg?.kind);
    if ((changed.segments || changed.scheduledAt || pick) && activeSegments.length > 0) {
      const totalMin = activeSegments.reduce((s, seg) => s + (Number(seg?.durationMinutes) || 0), 0);
      const totalDist = activeSegments.reduce((s, seg) => s + (Number(seg?.distanceM) || 0), 0);
      if (totalMin > 0) {
        createForm.setFieldValue(['prescription', 'durationMinutes'], totalMin);
        if (all.scheduledAt) createForm.setFieldValue('endAt', dayjs(all.scheduledAt).add(totalMin, 'minute'));
      }
      if (totalDist > 0) createForm.setFieldValue(['prescription', 'distanceM'], totalDist);
    } else if ((changed.scheduledAt || pick || changed.prescription?.durationMinutes !== undefined) && all.scheduledAt) {
      const mins = Number(all.prescription?.durationMinutes);
      if (mins > 0) createForm.setFieldValue('endAt', dayjs(all.scheduledAt).add(mins, 'minute'));
      // A distance workout ends when the distance is run: an end time left from a timed one would mislead.
      else if (pick) createForm.setFieldValue('endAt', undefined);
    } else if (changed.endAt && all.endAt && all.scheduledAt) {
      const diff = dayjs(all.endAt).diff(dayjs(all.scheduledAt), 'minute');
      if (diff > 0) createForm.setFieldValue(['prescription', 'durationMinutes'], diff);
    }
    setDraft({
      horse: all.horse,
      scheduledAt: all.scheduledAt?.toISOString(),
      // The adjusted value: setFieldValue doesn't re-trigger this handler.
      intensity,
      sessionType: all.sessionType,
      objective: all.objective,
    });
  };

  // The horse's last sessions arrive after it is picked: fit the workout again with them, unless edited by hand.
  const recentKey = (horseSessionsData?.data || []).length;
  useEffect(() => {
    if (!createOpen || !draft.horse || auto.current.rxEdited) return;
    const values = createForm.getFieldsValue(true);
    if (values.kind) applySuggestion({ kind: values.kind, objective: values.objective, values });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentKey, draft.horse, createOpen]);

  /** "Điền lại theo gợi ý": the numbers worked out again for the kind and purpose on the form. */
  const refillSuggestion = () => {
    const values = createForm.getFieldsValue(true);
    if (!values.kind && !values.objective) return;
    onCreateChange(values.objective ? { objective: values.objective } : { kind: values.kind }, values);
  };

  // Start times in one press: immediate upcoming slot (+5 min) for quick booking/demo, next free slot after
  // today's runs, plus the club's morning and afternoon slots (today & tomorrow).
  const horseSessions = horseSessionsData?.data || [];
  const startChoices = (() => {
    const now = dayjs();
    const at = (day, hhmm) => {
      const [h, m] = String(hhmm).split(':').map(Number);
      return day.hour(h).minute(m || 0).second(0).millisecond(0);
    };
    const soon = now.add(5, 'minute').second(0).millisecond(0);
    const items = [{ label: 'Sắp tới', value: soon }];
    // If this horse already has sessions today, suggest a clean slot 15 minutes after its latest one ends.
    if (draft.horse) {
      const todayDay = horseDay(horseSessions, draft.horse, now);
      if (todayDay.all.length > 0) {
        const latestEnd = todayDay.all.reduce((max, s) => {
          const end = s.actualEndAt
            ? dayjs(s.actualEndAt)
            : s.endAt
              ? dayjs(s.endAt)
              : dayjs(s.actualStartAt || s.scheduledAt).add(Number(s.prescription?.durationMinutes) || 60, 'minute');
          return end.isAfter(max) ? end : max;
        }, now);
        const nextFree = latestEnd.add(15, 'minute').second(0).millisecond(0);
        if (nextFree.isAfter(soon.add(5, 'minute')) && nextFree.hour() < 21) {
          items.push({ label: 'Trống tiếp', value: nextFree });
        }
      }
    }
    const fixed = [
      { label: 'Sáng nay', value: at(now, policy.morningTime) },
      { label: 'Chiều nay', value: at(now, policy.afternoonTime) },
      { label: 'Sáng mai', value: at(now.add(1, 'day'), policy.morningTime) },
      { label: 'Chiều mai', value: at(now.add(1, 'day'), policy.afternoonTime) },
    ].filter((c) => c.value.isAfter(now.add(10, 'minute')));
    return [...items, ...fixed];
  })();
  const pickStart = (value) => {
    createForm.setFieldValue('scheduledAt', value);
    createForm.validateFields(['scheduledAt']).catch(() => {});
    onCreateChange({ scheduledAt: value }, createForm.getFieldsValue(true));
  };

  // The horse's day at the time picked (sessionDay.js): what it already has, and whether this booking fits.
  const draftMinutes = draftAt && draftEndAt && dayjs(draftEndAt).isAfter(draftAt) ? dayjs(draftEndAt).diff(draftAt, 'minute') : draftDuration;
  const clashAt = (at) => (draft.horse && at ? dayClash(horseSessions, draft.horse, { at, minutes: draftMinutes }) : null);
  const draftClash = clashAt(draftAt);
  const draftDay = draft.horse && draftAt ? horseDay(horseSessions, draft.horse, draftAt) : null;
  const daySlotText = (list) => (list.length ? list.map((s) => `${SESSION_KINDS[s.kind]?.short || SESSION_KINDS[s.kind]?.label || 'Buổi tập'} (${stateOf(s)})`).join(', ') : 'trống');

  const submitCreate = (values, overrideReason) => {
    const { prescription, segments, ...rest } = values;
    const rawSegments = Array.isArray(segments) ? segments : createForm.getFieldValue('segments') || [];
    const cleanSegments = rawSegments.filter((s) => s?.kind).map((s) => ({ ...s }));
    createMutation.mutate({
      ...rest,
      scheduledAt: values.scheduledAt?.toISOString(),
      ...(values.endAt ? { endAt: values.endAt.toISOString() } : {}),
      ...(cleanSegments.length ? { segments: cleanSegments } : {}),
      // Mongoose ignores a prescription of all-undefined, so an untargeted session stays untargeted
      // rather than being stored as a set of empty targets.
      prescription,
      ...(overrideReason ? { overrideReason } : {}),
    });
  };

  const createMutation = useMutation({
    mutationFn: (payload) => trainingSessionApi.create(payload),
    onSuccess: () => {
      message.success('Đã tạo buổi tập.');
      invalidate();
      setCreateOpen(false);
      createForm.resetFields();
      setDraft({});
    },
    onError: (err) => {
      // A blocked medical gate is final. An amber gate is the trainer's call: show the warnings and
      // ask for a reason for the record, rather than silently refusing or silently allowing.
      if (needsOverride(err)) {
        const values = createForm.getFieldsValue(true);
        confirmReadinessOverride({
          readiness: err.data.readiness,
          okText: 'Vẫn tạo buổi tập',
          onConfirm: (reason) => submitCreate(values, reason),
        });
        return;
      }
      message.error(err.message || 'Không thể tạo buổi tập.');
    },
  });

  // Starting is checked again against the current moment: the horse may have been fed or locked
  // since the session was booked.
  const startMutation = useMutation({
    mutationFn: ({ id, overrideReason }) => trainingSessionApi.start(id, overrideReason ? { overrideReason } : {}),
    onSuccess: () => {
      message.success('Buổi tập đã bắt đầu — số liệu cảm biến hiện ở đầu trang.');
      invalidate();
      // The live board sits above the calendar and the list: bring it into view.
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (err, variables) => {
      // A refusal usually means the session is no longer in the state the table shows (held back by
      // a lock, pre-check too old): show it as it is now.
      if (err?.status === 409) invalidate();
      if (needsOverride(err)) {
        confirmReadinessOverride({
          readiness: err.data.readiness,
          okText: 'Vẫn bắt đầu',
          onConfirm: (reason) => startMutation.mutate({ id: variables.id, overrideReason: reason }),
        });
        return;
      }
      message.error(err.message || 'Không thể bắt đầu buổi tập.');
    },
  });

  const evalMutation = useMutation({
    mutationFn: ({ id, payload }) => trainingSessionApi.recordEvaluation(id, payload),
    onSuccess: (res) => {
      const outcome = res?.data?.outcome;
      message.success(outcome?.summary ? `Đã ghi nhận đánh giá. ${outcome.summary}` : 'Đã ghi nhận đánh giá.');
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['daily-tasks-all'] });
      setEvalOpen(false);
    },
    onError: (err) => message.error(err.message || 'Ghi nhận thất bại.'),
  });

  const openEvaluation = (record) => {
    setActiveSession(record);
    evalForm.setFieldsValue({
      trainerComment: record.trainerComment,
      videoUrl: record.videoUrl,
      performanceRating: record.performanceRating,
    });
    setEvalOpen(true);
  };

  // Ending a run (the work is done) leads straight to its evaluation.
  const endMutation = useMutation({
    mutationFn: ({ id, metrics }) => trainingSessionApi.end(id, metrics ? { metrics } : {}),
    onSuccess: (res) => {
      const done = res?.data;
      message.success(done?.outcome?.summary ? `Đã kết thúc buổi tập. ${done.outcome.summary}` : 'Đã kết thúc buổi tập.');
      invalidate();
      setEndSession(null);
      endForm.resetFields();
      if (done) openEvaluation({ ...done, horse: endSession?.horse || done.horse });
    },
    onError: (err) => {
      if (err?.status === 409) invalidate();
      message.error(err.message || 'Không kết thúc được buổi tập.');
    },
  });

  const abortMutation = useMutation({
    mutationFn: ({ id, category, reason }) => trainingSessionApi.abort(id, { category, reason }),
    onSuccess: () => {
      message.success('Đã dừng buổi tập. Số liệu đến lúc dừng được giữ lại.');
      invalidate();
      setAbortSession(null);
      abortForm.resetFields();
    },
    onError: (err) => {
      if (err?.status === 409) invalidate();
      message.error(err.message || 'Không dừng được buổi tập.');
    },
  });

  // The sensor feed finished a run: offer its evaluation straight away.
  const offerEvaluation = useCallback(
    async (sessionId) => {
      const res = await trainingSessionApi.getOne(sessionId).catch(() => null);
      const done = res?.data;
      if (!done || done.status !== 'completed') return;
      const key = `done-${sessionId}`;
      notification.success({
        key,
        title: `${done.horse?.name || 'Ngựa'} đã xong buổi tập`,
        description: done.outcome?.summary || 'Buổi tập đã hoàn thành.',
        // Bottom right, and it goes by itself: the page's own actions are top right.
        placement: 'bottomRight',
        duration: 15,
        actions: (
          <Button
            type="primary"
            size="small"
            onClick={() => {
              notification.destroy(key);
              openEvaluation(done);
            }}
          >
            Đánh giá ngay
          </Button>
        ),
      });
    },
    // openEvaluation only sets state on this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // A session held back by a medical gate: ask the vet straight from it.
  const requestExamFor = (session) =>
    setExamFor({
      horseId: session.horse?._id || session.horse,
      session,
      defaults: { priority: 'high', reason: `Buổi tập ${sessionTimeLabel(session.scheduledAt)} bị chặn: ${session.blockedReason || 'chưa đủ điều kiện'}` },
    });

  const cancelMutation = useMutation({
    mutationFn: ({ id, cancelReason }) => trainingSessionApi.update(id, { status: 'cancelled', cancelReason }),
    onSuccess: () => {
      message.success('Đã hủy buổi tập. Buổi được giữ trong lịch sử.');
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      setCancelSession(null);
      cancelForm.resetFields();
    },
    onError: (err) => {
      if (err?.status === 409) invalidate();
      message.error(err.message || 'Không hủy được buổi tập.');
    },
  });

  // An hour from now, unless that falls in the afternoon for work the club keeps to the morning:
  // then the next morning at the club's session time.
  const suggestedTime = (record) => {
    const soon = dayjs().add(1, 'hour').startOf('minute');
    if (!afternoonProblem(policy, record.kind, soon)) return soon;
    const [h, m] = (policy.morningTime || '07:30').split(':').map(Number);
    const morning = soon.hour(h).minute(m).second(0);
    return morning.isAfter(dayjs()) ? morning : morning.add(1, 'day');
  };
  const openSchedule = (record) => {
    setScheduleSession(record);
    scheduleForm.setFieldsValue({ scheduledAt: suggestedTime(record) });
  };
  const scheduleAt = Form.useWatch('scheduledAt', scheduleForm);
  const scheduleSlotProblem = afternoonProblem(policy, scheduleSession?.kind, scheduleAt);

  const scheduleMutation = useMutation({
    mutationFn: ({ session, scheduledAt, overrideReason }) =>
      session.status === 'missed'
        ? trainingSessionApi.reschedule(session._id, { scheduledAt, ...(overrideReason ? { overrideReason } : {}) })
        : trainingSessionApi.update(session._id, { scheduledAt, ...(overrideReason ? { overrideReason } : {}) }),
    onSuccess: (res, { session, scheduledAt }) => {
      message.success(session.status === 'missed' ? 'Đã xếp lại buổi tập. Buổi lỡ giờ được giữ trong lịch sử.' : 'Đã đổi giờ. Hãy kiểm tra sẵn sàng lại trước khi bắt đầu.');
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      setWeekStart(mondayOf(dayjs(res.data?.scheduledAt || scheduledAt)));
      setScheduleSession(null);
      scheduleForm.resetFields();
    },
    onError: (err, vars) => {
      // A part of the day that already has a session: the trainer's call, with a reason (sessionDay.js).
      if (needsOverride(err)) {
        confirmReadinessOverride({
          readiness: err.data.readiness,
          okText: 'Vẫn đổi giờ',
          onConfirm: (reason) => scheduleMutation.mutate({ ...vars, overrideReason: reason }),
        });
        return;
      }
      if (err?.status === 409) invalidate();
      message.error(err.message || 'Không đổi được giờ tập.');
    },
  });

  const generateMutation = useMutation({
    mutationFn: ({ plan, start }) => trainingPlanApi.generateWeek(plan._id, { weekStart: start.toISOString() }),
    onSuccess: (res, { plan }) => {
      const { created = [], skipped = [] } = res.data || {};
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      const extra = skipped.length ? ` Không xếp: ${skipped.map((x) => x.reason).join(' ')}` : '';
      message.success(`Đã xếp ${created.length} buổi tập cho ${plan.horse?.name}.${extra}`, skipped.length ? 6 : 3);
    },
    onError: (err) => message.error(err.message || 'Không sinh được lịch tuần.'),
  });

  const columns = [
    {
      title: 'Ngựa',
      dataIndex: ['horse', 'name'],
      key: 'horse',
      width: 140,
      render: (name, record) => (
        <div className="min-w-0">
          <Link to={`?horse=${record.horse?._id}`} title="Xem lịch của riêng ngựa này" className="font-semibold !text-[var(--st-ink,#0F172A)] hover:!text-[var(--st-primary,#B45309)] break-words">
            {name}
          </Link>
          {lockedHorseIds.has(record.horse?._id) ? (
            <Tag color="red" className="ml-1.5 !text-xs">
              Khóa tập
            </Tag>
          ) : (
            clearances.get(String(record.horse?._id))?.restricted && (
              <Tag color={TRAINING_LEVEL_META[clearances.get(String(record.horse?._id)).level]?.color} className="ml-1.5 !text-xs">
                {TRAINING_LEVEL_META[clearances.get(String(record.horse?._id)).level]?.short}
              </Tag>
            )
          )}
        </div>
      ),
    },
    {
      title: 'Bài tập & Mục tiêu',
      key: 'objective',
      width: 185,
      render: (_, r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">
              {SESSION_KINDS[r.kind]?.label || r.kind || 'Buổi tập'}
            </span>
            {r.sessionType === 'trial_run' && (
              <Tag color="purple" className="!m-0 text-[11px] leading-tight">
                Chạy thử
              </Tag>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <Tooltip title={OBJECTIVE_DESCRIPTIONS[r.objective]}>
              <span className="cursor-help hover:text-gray-700 underline decoration-dotted">
                {OBJECTIVE_LABELS[r.objective] || '—'}
              </span>
            </Tooltip>
            {r.intensity && (
              <>
                <span className="text-gray-300">·</span>
                <Tag color={INTENSITY_COLORS[r.intensity]} className="!m-0 text-[11px] leading-tight px-1.5 py-0">
                  {INTENSITY_LABELS[r.intensity]}
                </Tag>
              </>
            )}
          </div>
          {describePrescription(r.prescription) && (
            <Tooltip title={describePrescription(r.prescription)}>
              <Text type="secondary" className="block !text-[11px] text-gray-400 mt-0.5 truncate cursor-default">
                {describePrescription(r.prescription)}
              </Text>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: 'Thời gian',
      dataIndex: 'scheduledAt',
      key: 'scheduledAt',
      width: 155,
      render: (d, r) => {
        const end = r.endAt ? dayjs(r.endAt) : r.prescription?.durationMinutes ? dayjs(d).add(r.prescription.durationMinutes, 'minute') : null;
        return (
          <div className="tabular-nums text-xs leading-snug">
            <div>
              <Text type="secondary" className="!text-xs">
                Dự kiến{' '}
              </Text>
              <span className="font-medium text-gray-800 whitespace-nowrap">
                {sessionTimeLabel(d)}
                {end ? ` – ${end.format('HH:mm')}` : ''}
              </span>
            </div>
            {Array.isArray(r.segments) && r.segments.length > 0 && (
              <div className="mt-0.5 flex flex-wrap gap-1 whitespace-normal">
                {r.segments.map((seg, idx) => (
                  <Tag key={idx} className="!m-0 !text-[10px]">
                    {SESSION_KINDS[seg.kind]?.short || seg.kind}
                    {seg.durationMinutes ? ` ${seg.durationMinutes}'` : ''}
                  </Tag>
                ))}
              </div>
            )}
            {actualTimeLabel(r) ? (
              <div className="text-gray-500 mt-0.5">
                <Text type="secondary" className="!text-xs">
                  Thực tế{' '}
                </Text>
                {actualTimeLabel(r)}
              </div>
            ) : (
              ['completed', 'evaluated'].includes(r.status) && (
                <Text type="secondary" className="!text-xs text-gray-400">
                  Chưa ghi giờ thực tế
                </Text>
              )
            )}
          </div>
        );
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 112,
      render: (s, r) => (
        <div>
          {s === 'blocked' && r.blockedReason ? (
            <Tooltip title={r.blockedReason}>
              <Tag color={STATUS_COLORS[s]} className="font-medium">
                {STATUS_LABELS[s]}
              </Tag>
            </Tooltip>
          ) : (
            <Tag color={STATUS_COLORS[s]} className="font-medium">
              {STATUS_LABELS[s] || s}
            </Tag>
          )}
          {s === 'missed' && (
            <Text type="secondary" className="block !text-xs mt-0.5">
              {r.rescheduledTo ? 'Đã xếp lại lịch' : 'Lỡ thời hạn; hãy xếp lại.'}
            </Text>
          )}
          {r.readiness?.overrideReason && (
            <Tooltip title={`Đã ghi đè cảnh báo: ${r.readiness.overrideReason}`}>
              <Tag color="orange" className="!mt-1 !text-xs">
                ⚠️ Ghi đè
              </Tag>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: 'Kết quả',
      key: 'outcome',
      width: 215,
      render: (_, r) => <SessionOutcome session={r} />,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 175,
      render: (_, record) => {
        const moreItems = [];
        const canSchedule = (['scheduled', 'ready', 'blocked'].includes(record.status) || (record.status === 'missed' && !record.rescheduledTo));
        const canCancel = ['scheduled', 'ready', 'blocked'].includes(record.status);

        if (canCancel && record.kind !== 'trial') {
          moreItems.push({
            key: 'change-work',
            icon: <EditOutlined />,
            label: 'Đổi bài tập',
            onClick: () => setWorkSession(record),
          });
        }
        if (canSchedule && record.status !== 'missed') {
          moreItems.push({
            key: 'schedule',
            icon: <CalendarOutlined />,
            label: 'Đổi giờ tập',
            onClick: () => openSchedule(record),
          });
        }
        if (canCancel) {
          moreItems.push({
            key: 'cancel',
            icon: <StopOutlined />,
            danger: true,
            label: 'Hủy buổi tập',
            onClick: () => setCancelSession(record),
          });
        }

        return (
          <Space size={6} wrap>
            {/* 1. Primary Action by status */}
            {['scheduled', 'blocked'].includes(record.status) && (
              <Button
                size="small"
                type="primary"
                icon={<SafetyCertificateOutlined />}
                onClick={() => setPreCheckSession(record)}
              >
                {record.status === 'blocked' ? 'Kiểm tra lại' : 'Kiểm tra sẵn sàng'}
              </Button>
            )}
            {record.status === 'blocked' && (
              <Button
                size="small"
                icon={<SafetyCertificateOutlined />}
                onClick={() => requestExamFor(record)}
              >
                Yêu cầu bác sĩ khám
              </Button>
            )}
            {record.status === 'ready' && (
              <Button
                size="small"
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={startMutation.isPending && startMutation.variables?.id === record._id}
                onClick={() => startMutation.mutate({ id: record._id })}
              >
                Bắt đầu
              </Button>
            )}
            {record.status === 'in_progress' && (
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => setEndSession(record)}
              >
                Kết thúc
              </Button>
            )}
            {/* 2. Direct Danger action for in_progress */}
            {record.status === 'in_progress' && (
              <Button
                size="small"
                danger
                icon={<PauseCircleOutlined />}
                onClick={() => setAbortSession(record)}
              >
                Dừng giữa chừng
              </Button>
            )}
            {/* 3. Completed / Evaluated */}
            {record.status === 'completed' && (
              <Button
                size="small"
                type="primary"
                icon={<EditOutlined />}
                onClick={() => openEvaluation(record)}
              >
                Đánh giá
              </Button>
            )}
            {record.status === 'evaluated' && (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEvaluation(record)}
              >
                Sửa đánh giá
              </Button>
            )}
            {canReplay(record) && (
              <Button size="small" icon={<HistoryOutlined />} onClick={() => setReplaySession(record)}>
                Xem lại buổi chạy
              </Button>
            )}
            {/* 4. Missed reschedule primary */}
            {record.status === 'missed' && !record.rescheduledTo && (
              <Button
                size="small"
                type="primary"
                icon={<CalendarOutlined />}
                onClick={() => openSchedule(record)}
              >
                Xếp lại lịch
              </Button>
            )}

            {/* 5. Dropdown for secondary actions */}
            {moreItems.length > 0 && (
              <Dropdown menu={{ items: moreItems }} trigger={['click']} placement="bottomRight">
                <Button size="small" icon={<MoreOutlined />} aria-label="Thao tác khác" />
              </Dropdown>
            )}
          </Space>
        );
      },
    },
  ];

  const activePrescription = activeSession?.prescription;
  const preCheckModal = (
    <PreCheckModal
      session={preCheckSession}
      open={Boolean(preCheckSession)}
      onClose={() => setPreCheckSession(null)}
      onDone={invalidate}
      onRequestExam={() => setExamFor({ horseId: preCheckSession?.horse?._id, session: preCheckSession, defaults: { priority: 'high' } })}
    />
  );
  // The view and the kind of session: on the week picker's row in the week view, on their own over the list.
  const toolbar = (
    <>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'week', label: 'Lịch tuần', icon: <CalendarOutlined /> },
          { value: 'day', label: 'Trong ngày (3 ca)', icon: <ClockCircleOutlined /> },
          { value: 'list', label: 'Danh sách', icon: <UnorderedListOutlined /> },
        ]}
      />
      <Segmented
        value={typeFilter}
        onChange={setTypeFilter}
        options={[
          { value: 'all', label: 'Tất cả' },
          { value: 'training', label: SESSION_TYPE_LABELS.training },
          { value: 'trial_run', label: SESSION_TYPE_LABELS.trial_run },
        ]}
      />
    </>
  );

  return (
    <div>
      {preCheckModal}
      <PageHeroBanner
        eyebrow="Lịch tập & đường đua"
        roleLabel="HLV trưởng"
        title="Buổi tập & đánh giá thể lực"
        stats={[
          { label: 'Tổng số buổi', value: `${allSessions.length} buổi` },
          { label: 'Hôm nay', value: `${allSessions.filter((s) => dayjs(s.scheduledAt).isSame(dayjs(), 'day')).length} buổi` },
          { label: 'Đang diễn ra', value: `${allSessions.filter((s) => s.status === 'in_progress').length} buổi` },
        ]}
        actionButton={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
            className="!h-9 !px-4 !rounded-lg !bg-[#D4AF37] hover:!bg-[#E2C058] !border-[#D4AF37] !text-[#061812] font-semibold cursor-pointer shrink-0"
          >
            Tạo buổi tập mới
          </Button>
        }
      />

      {/* The club's rule in one line; the steps of a session open on demand. */}
      <details className="light-surface-box mb-4 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs text-gray-700 shadow-xs">
        <summary className="cursor-pointer select-none">
          <SafetyCertificateOutlined className="mr-1.5" style={{ color: 'var(--st-primary)' }} />
          <span className="font-bold text-gray-900">Quy định CLB:</span> kiểm tra sẵn sàng từ {policy.precheckOpensBeforeMin} phút trước đến{' '}
          {policy.precheckClosesAfterMin} phút sau giờ tập{policy.afternoonLightOnly ? ', buổi chiều chỉ tập nhẹ' : ''}.{' '}
          <span className="font-bold" style={{ color: 'var(--st-primary)' }}>Xem các bước</span>
        </summary>
        <ol className="m-0 mt-2 pl-5 space-y-0.5 leading-relaxed">
          <li>Xếp lịch: kế hoạch tự xếp tuần này và tuần sau; buổi lỡ giờ xếp lại được ngay trên lịch.</li>
          <li>Kiểm tra sẵn sàng. {precheckRuleText(policy)}</li>
          <li>Bắt đầu: số liệu cảm biến và ngựa chạy 3D hiện ở đầu trang.</li>
          <li>Kết thúc khi đủ cự ly, hoặc dừng giữa chừng để giữ số liệu; rồi đánh giá buổi.</li>
        </ol>
      </details>

      {isError && (
        <Alert
          type="error"
          showIcon
          className="!mb-4"
          title="Chưa tải được danh sách buổi tập"
          description={error?.message || 'Không thể lấy dữ liệu buổi tập lúc này.'}
          action={
            <Button size="small" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      )}

      {/* What is being looked at, and the way to its plan: the plan and the sessions are two views of one cycle. */}
      {(filteredPlan || filteredHorse) && (
        <div className="light-surface-box mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5">
          <div className="min-w-0 text-sm">
            <span className="text-gray-500">{filteredPlan ? 'Lịch tập theo kế hoạch: ' : 'Lịch tập của ngựa: '}</span>
            <b className="text-gray-900">{filteredPlan?.horse?.name || filteredHorse?.name}</b>
            {contextPlan && <span className="text-gray-600"> · {whereNow(contextPlan)}</span>}
            {contextPlan && raceLine(contextPlan) && (
              <span className="ml-3 whitespace-nowrap text-pink-700">
                <FlagOutlined className="mr-1" />
                {raceLine(contextPlan)}
              </span>
            )}
            {contextNoWeek && <div className="text-xs text-amber-700">Giai đoạn hiện tại chưa có tuần mẫu nên hệ thống chưa tự xếp được buổi tập.</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {contextPlan && (
              <Link to={`/training/plans?plan=${contextPlan._id}`}>
                <Button size="small">Xem kế hoạch</Button>
              </Link>
            )}
            {contextPlan && contextPlan.status === 'active' && (
              <Link to={`/training/plans?plan=${contextPlan._id}&week=edit`}>
                <Button size="small" type={contextNoWeek ? 'primary' : 'default'}>
                  {contextNoWeek ? 'Thiết lập tuần mẫu' : 'Sửa tuần mẫu'}
                </Button>
              </Link>
            )}
            {filteredHorse && (
              <Link to={`/horses/${filteredHorse._id}`}>
                <Button size="small">Hồ sơ ngựa</Button>
              </Link>
            )}
            <Button
              size="small"
              type="text"
              icon={<CloseOutlined />}
              onClick={() => {
                setSearchParams({});
                setWeekStart(mondayOf(dayjs()));
                setView('week');
              }}
            >
              Bỏ lọc
            </Button>
          </div>
        </div>
      )}

      {firstWeek && filteredPlan && !(sessionsData?.data || []).length && (
        <Alert
          className="!mb-4"
          type="info"
          showIcon
          title={`Kế hoạch của ${filteredPlan.horse?.name || 'ngựa'} chưa có buổi tập nào`}
          description="Lịch tuần này và tuần sau được xếp tự động khi áp dụng kế hoạch. Chưa có buổi nào nghĩa là kế hoạch bắt đầu muộn hơn; bấm để xếp tuần đầu tiên ngay."
          action={
            <Button
              type="primary"
              loading={generateMutation.isPending}
              onClick={() => {
                const start = dayjs(filteredPlan.phases?.[0]?.startDate || filteredPlan.startDate || undefined);
                const week = mondayOf(start.isBefore(dayjs()) ? dayjs() : start);
                setWeekStart(week);
                generateMutation.mutate({ plan: filteredPlan, start: week.toDate() });
              }}
            >
              Xếp tuần đầu tiên
            </Button>
          }
        />
      )}
      <LiveSessionMonitor
        sessions={sessionsData?.data || []}
        horses={horsesData?.data || []}
        plans={plansData?.data || []}
        onSessionCompleted={offerEvaluation}
        onEnd={setEndSession}
        onAbort={setAbortSession}
      />

      {view === 'list' && <div className="st-toolbar mb-4">{toolbar}</div>}

      {view === 'week' && (
        <WeekCalendar
          toolbar={toolbar}
          weekStart={weekStart}
          onWeekChange={(w) => setWeekStart(w || mondayOf(dayjs()))}
          sessions={sessionsData?.data || []}
          plans={(plansData?.data || []).filter((p) => (!planFilter || p._id === planFilter) && (!horseFilter || String(p.horse?._id) === horseFilter))}
          focusSessionId={focusSession}
          onGenerate={(plan, start) => generateMutation.mutate({ plan, start })}
          generatingPlanId={generateMutation.isPending ? generateMutation.variables?.plan._id : null}
          onStart={(session) => startMutation.mutate({ id: session._id })}
          onPreCheck={setPreCheckSession}
          startingId={startMutation.isPending ? startMutation.variables?.id : null}
          onEvaluate={openEvaluation}
          onSchedule={openSchedule}
          onChangeWork={setWorkSession}
          onCancel={setCancelSession}
          onEnd={setEndSession}
          onAbort={setAbortSession}
          onRequestExam={requestExamFor}
          onReplay={setReplaySession}
          schedulingId={scheduleMutation.isPending ? scheduleMutation.variables?.session._id : null}
        />
      )}
      {view === 'day' && (
        <DayShiftView
          toolbar={toolbar}
          selectedDate={selectedDay}
          onDateChange={(d) => setSelectedDay(d || dayjs())}
          sessions={sessionsData?.data || []}
          plans={(plansData?.data || []).filter((p) => (!planFilter || p._id === planFilter) && (!horseFilter || String(p.horse?._id) === horseFilter))}
          onStart={(session) => startMutation.mutate({ id: session._id })}
          onPreCheck={setPreCheckSession}
          startingId={startMutation.isPending ? startMutation.variables?.id : null}
          onEvaluate={openEvaluation}
          onSchedule={openSchedule}
          onChangeWork={setWorkSession}
          onCancel={setCancelSession}
          onEnd={setEndSession}
          onAbort={setAbortSession}
          onReplay={setReplaySession}
        />
      )}
      {(view === 'week' || view === 'day') && <NextReadiness sessions={sessionsData?.data || []} />}

      <Table
        size="middle"
        tableLayout="fixed"
        className={view === 'list' ? '' : 'hidden'}
        rowClassName={(r) => (focusSession && r._id === focusSession ? 'row-focus' : '')}
        onRow={(r) => (focusSession && r._id === focusSession ? { 'data-focus': 'session' } : {})}
        rowKey="_id"
        columns={columns}
        dataSource={listRows}
        loading={isLoading && !sessionsData}
        // Opened on the page holding the session a notification points at (remounted once it is found).
        key={focusIndex >= 0 ? `focus-${focusSession}` : 'list'}
        pagination={focusIndex >= 0 ? { defaultCurrent: Math.floor(focusIndex / 10) + 1 } : undefined}
        scroll={{ x: 960 }}
        expandable={{
          expandedRowRender: (r) => (
            <div className="text-sm">
              {r.coachNote ? (
                <p className="!mb-1">
                  <Text strong>Dặn dò trước buổi: </Text>
                  {r.coachNote}
                </p>
              ) : null}
              {r.trainerComment ? (
                <p className="!mb-1">
                  <Text strong>Nhận xét sau buổi: </Text>
                  {r.trainerComment}
                </p>
              ) : null}
              {r.readiness?.gates?.length ? (
                <p className="!mb-0">
                  <Text strong>Tình trạng lúc xếp lịch: </Text>
                  {r.readiness.gates
                    .filter((g) => g.status !== 'ok')
                    .map((g) => `${g.label} — ${g.detail}`)
                    .join(' | ') || 'Tất cả điều kiện đều đạt.'}
                </p>
              ) : null}
              {!r.coachNote && !r.trainerComment && !r.readiness?.gates?.length && (
                <Text type="secondary">Buổi tập này chưa ghi chú gì thêm.</Text>
              )}
            </div>
          ),
        }}
        locale={{ emptyText: 'Chưa có buổi tập nào. Nhấn "Tạo buổi tập" để thêm buổi tập cho một kế hoạch.' }}
      />

      <Modal
        title="Tạo buổi tập mới"
        open={createOpen}
        width={1080}
        okText="Tạo buổi tập"
        cancelText="Hủy"
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={(values) => submitCreate(values)}
          onValuesChange={onCreateChange}
        >
          {/* Two columns on desktop so the readiness board stays in view and visibly reacts as the
              trainer picks a horse and a time — that live feedback is the point of the board. */}
          <Row gutter={24}>
            <Col xs={24} lg={15}>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="horse" label="Ngựa" rules={[{ required: true }]}>
                    <Select placeholder="Chọn ngựa" options={horseOptions} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="trainingPlan"
                    label="Thuộc kế hoạch"
                    rules={[{ required: true, message: 'Ngựa này chưa có kế hoạch đang chạy — hãy lập kế hoạch trước' }]}
                  >
                    <Select
                      placeholder="Tự chọn theo ngựa"
                      options={(plansData?.data || [])
                        .filter((p) => ['active', 'draft'].includes(p.status) && (!draft.horse || String(p.horse?._id) === String(draft.horse)))
                        .map((p) => ({
                          value: p._id,
                          label: `${p.horse?.name} — ${p.goal || PHASE_LABELS[p.phase] || p.phase}`,
                        }))}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="kind"
                label="Loại buổi tập"
                extra={SESSION_KINDS[draftKind]?.hint || 'Bấm một loại buổi: mục đích, cường độ và thông số bên dưới tự điền theo tình trạng của ngựa.'}
              >
                <Radio.Group
                  className="choice-chips"
                  optionType="button"
                  buttonStyle="solid"
                  // A recovering horse: work above the vet's level is not offered (the kind is the work).
                  options={kindOptions.map((o) => {
                    const allowed = kindAllowed(clearances.get(String(draft.horse)), o.value);
                    return {
                      value: o.value,
                      label: <Tooltip title={allowed ? o.hint : 'Vượt mức tập bác sĩ đang cho phép'}>{o.label}</Tooltip>,
                      disabled: !allowed,
                    };
                  })}
                />
              </Form.Item>

              {draftIsTrial && (
                <Form.Item
                  name="raceEntry"
                  label="Chạy thử cho giải"
                  rules={[{ required: true, message: 'Chọn giải mà buổi chạy thử này chuẩn bị' }]}
                  extra={trialRaceOptions.length ? 'Kết quả chạy thử hiện trên trang Đăng ký giải, cạnh đúng giải này.' : 'Ngựa chưa có giải sắp tới — đăng ký giải trước khi chạy thử.'}
                >
                  <Select placeholder="Chọn giải" options={trialRaceOptions} />
                </Form.Item>
              )}

              <Form.Item
                name="objective"
                label="Mục đích buổi tập"
                initialValue="endurance"
                rules={[{ required: true }]}
                extra={OBJECTIVE_DESCRIPTIONS[draftObjective]}
              >
                <Radio.Group
                  className="choice-chips"
                  optionType="button"
                  // A purpose no allowed kind of work serves (a horse on light work only) is not offered.
                  options={objectiveOptions.map((o) => ({
                    value: o.value,
                    label: <Tooltip title={o.description}>{o.label}</Tooltip>,
                    disabled: !kindForObjective(o.value, null, clearances.get(String(draft.horse))),
                  }))}
                />
              </Form.Item>

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="intensity"
                    label="Cường độ"
                    initialValue="moderate"
                    extra={
                      clearances.get(String(draft.horse))?.restricted
                        ? `Bác sĩ chỉ cho ${clearances.get(String(draft.horse)).label} trong thời gian hồi phục.`
                        : null
                    }
                  >
                    <Radio.Group
                      className="choice-chips"
                      optionType="button"
                      buttonStyle="solid"
                      options={intensityOptions.map((o) => ({
                        ...o,
                        disabled: !intensityAllowed(clearances.get(String(draft.horse)), o.value) || INTENSITY_RANK[o.value] < (INTENSITY_RANK[SESSION_KINDS[draftKind]?.intensity] || 0),
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="sessionType" label="Hình thức" initialValue="training">
                    <Radio.Group className="choice-chips" optionType="button" options={Object.entries(SESSION_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="scheduledAt"
                    label="Giờ bắt đầu dự kiến"
                    tooltip="Giờ thực tế được ghi khi bấm Bắt đầu."
                    rules={[{ required: true, message: 'Chọn ngày giờ dự kiến bắt đầu' }, futureTimeRule]}
                    extra={
                      startChoices.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {startChoices.map((c) => {
                            // Over another session: not offered; a part of the day already used: offered, marked.
                            const clash = clashAt(c.value);
                            const problem = afternoonProblem(policy, draftKind, c.value) || (clash?.hard ? clash.message : null);
                            const on = Boolean(draftAt) && dayjs(draftAt).isSame(c.value, 'minute');
                            return (
                              <Tooltip key={c.label} title={problem || clash?.message}>
                                <Button size="small" type={on ? 'primary' : 'default'} disabled={Boolean(problem)} onClick={() => pickStart(c.value)}>
                                  {c.label} {c.value.format('HH:mm')}
                                  {clash && !clash.hard && <span className="ml-1 text-[11px] text-amber-600">· đã có buổi</span>}
                                </Button>
                              </Tooltip>
                            );
                          })}
                        </div>
                      )
                    }
                  >
                    <DatePicker showTime format="DD/MM/YYYY HH:mm" className="w-full" disabledDate={(d) => d && d.isBefore(dayjs(), 'day')} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="endAt"
                    label="Giờ kết thúc dự kiến"
                    extra={
                      draftAt && draftEndAt && dayjs(draftEndAt).isAfter(draftAt)
                        ? `Khung đặt sân ${dayjs(draftEndAt).diff(draftAt, 'minute')} phút (tự tính từ đoạn ghép/thời lượng). Khi chạy mô phỏng: 5s thực = 30s tập.`
                        : 'Tự tính từ thời lượng/đoạn ghép, hoặc để trống hệ thống giữ khung 30–75 phút theo loại bài (mô phỏng: 5s thực = 30s tập).'
                    }
                  >
                    <DatePicker showTime format="DD/MM/YYYY HH:mm" className="w-full" disabledDate={(d) => d && d.isBefore(dayjs(), 'day')} />
                  </Form.Item>
                </Col>
              </Row>

              {/* The horse's day: one session a morning, one an afternoon (a session run early still counts). */}
              {draftDay && (
                <div className="-mt-1 mb-3 text-xs text-gray-600">
                  Lịch {dayjs(draftAt).format('DD/MM')} của {draftHorse?.name || 'ngựa'}: <span className="font-medium">Sáng</span> — {daySlotText(draftDay.morning)} ·{' '}
                  <span className="font-medium">Chiều</span> — {daySlotText(draftDay.afternoon)}
                </div>
              )}
              {draftClash && (
                <Alert
                  className="!mb-3"
                  type={draftClash.hard ? 'error' : 'warning'}
                  showIcon
                  title={draftClash.hard ? 'Trùng giờ với buổi khác của ngựa' : 'Buổi này ngựa đã có buổi tập'}
                  description={
                    <span className="text-xs">
                      {draftClash.message} {draftClash.hard ? 'Chọn giờ khác.' : 'Vẫn tạo được nếu cần — hệ thống sẽ hỏi lý do để lưu vào hồ sơ buổi tập.'}
                    </span>
                  }
                />
              )}
              {draftSlotProblem && <Alert className="!mb-3" type="error" showIcon title={draftSlotProblem} />}

              <Divider titlePlacement="left" className="!my-2 !text-sm">
                <AimOutlined className="mr-1" />
                Nội dung dự kiến
              </Divider>
              {/* Why the numbers are what they are: the kind's usual workout, fitted to this horse. */}
              {suggestion ? (
                <Alert
                  className="!mb-3"
                  type={rxEdited ? 'info' : suggestion.notes.some((n) => n.tone === 'warning') ? 'warning' : 'success'}
                  showIcon
                  title={
                    rxEdited
                      ? 'Bạn đã sửa thông số bằng tay — đổi ngựa hoặc giờ sẽ không ghi đè nữa.'
                      : `Đã điền sẵn: ${SESSION_KINDS[suggestion.kind]?.label} · ${OBJECTIVE_LABELS[suggestion.objective] || ''}${suggestion.horseName ? ` cho ${suggestion.horseName}` : ''}`
                  }
                  description={
                    rxEdited ? null : suggestion.notes.length ? (
                      <ul className="m-0 pl-4 text-xs">
                        {suggestion.notes.map((n) => (
                          <li key={n.text}>{n.text}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs">
                        {suggestion.horseName
                          ? 'Thông số chuẩn của bài — tuổi, sức khỏe và lịch tập gần đây của ngựa không cần điều chỉnh gì.'
                          : 'Thông số chuẩn của bài — chọn ngựa để điều chỉnh theo tuổi, sức khỏe và lịch tập gần đây.'}
                      </span>
                    )
                  }
                  action={
                    rxEdited ? (
                      <Button size="small" onClick={refillSuggestion}>
                        Điền lại theo gợi ý
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <Text type="secondary" className="!text-xs block mb-2">
                  Bấm loại buổi hoặc mục đích ở trên để điền sẵn. Sau buổi tập hệ thống đối chiếu thực tế với các mục tiêu này để kết luận đạt hay chưa đạt.
                </Text>
              )}
              <Row gutter={16}>
                <Col xs={12} md={8}>
                  <Form.Item
                    name={['prescription', 'distanceM']}
                    label="Cự ly (m)"
                    validateStatus={trialTooShort ? 'warning' : undefined}
                    help={trialTooShort ? `Chỉ bằng ${Math.round(trialShare * 100)}% cự ly giải (${draftRace.distance} m): khó nói lên sức bền cho giải. Vẫn lưu được.` : undefined}
                    extra={draftRace?.distance && !trialTooShort ? `Cự ly giải: ${draftRace.distance} m` : undefined}
                  >
                    <InputNumber min={PRESCRIPTION_LIMITS.distanceM[0]} max={PRESCRIPTION_LIMITS.distanceM[1]} step={100} className="w-full" placeholder="1200" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name={['prescription', 'reps']} label="Số hiệp">
                    <InputNumber min={PRESCRIPTION_LIMITS.reps[0]} max={PRESCRIPTION_LIMITS.reps[1]} className="w-full" placeholder="3" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name={['prescription', 'restMinutes']} label="Nghỉ giữa hiệp (phút)">
                    <InputNumber min={PRESCRIPTION_LIMITS.restMinutes[0]} max={PRESCRIPTION_LIMITS.restMinutes[1]} className="w-full" placeholder="8" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item
                    name={['prescription', 'targetSpeedKmh']}
                    label="Tốc độ mục tiêu (km/h)"
                    extra={KIND_SPEED_RANGES[draftKind] ? `${SESSION_KINDS[draftKind].label}: ${KIND_SPEED_RANGES[draftKind][0]}–${KIND_SPEED_RANGES[draftKind][1]} km/h` : null}
                  >
                    <InputNumber min={PRESCRIPTION_LIMITS.targetSpeedKmh[0]} max={PRESCRIPTION_LIMITS.targetSpeedKmh[1]} className="w-full" placeholder="35" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name={['prescription', 'targetHeartRateMax']} label="Nhịp tim tối đa (bpm)">
                    <InputNumber min={PRESCRIPTION_LIMITS.targetHeartRateMax[0]} max={PRESCRIPTION_LIMITS.targetHeartRateMax[1]} className="w-full" placeholder="170" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item
                    name={['prescription', 'durationMinutes']}
                    label="Thời lượng dự kiến (phút)"
                    extra="Cho bài tính theo thời gian (đi bộ). Bài phi kết thúc khi đủ cự ly."
                  >
                    <InputNumber min={PRESCRIPTION_LIMITS.durationMinutes[0]} max={PRESCRIPTION_LIMITS.durationMinutes[1]} className="w-full" placeholder="45" />
                  </Form.Item>
                </Col>
              </Row>

              <Divider titlePlacement="left" className="!my-2 !text-sm">
                Ghép nhiều bài tập trong buổi (tùy chọn)
              </Divider>
              <Form.List name="segments">
                {(fields, { add, remove, move }) => {
                  const cleanSegs = (draftSegments || []).filter((s) => s?.kind);
                  const totalSegMin = cleanSegs.reduce((s, x) => s + (Number(x.durationMinutes) || 0), 0);
                  const totalSegDist = cleanSegs.reduce((s, x) => s + (Number(x.distanceM) || 0), 0);
                  const seedThreeSteps = () => {
                    const mainKind = createForm.getFieldValue('kind') || draftKind || 'canter';
                    const rx = createForm.getFieldValue('prescription') || {};
                    const kRx = SESSION_KINDS[mainKind]?.prescription || {};
                    const useKindDefaults = fields.length > 0;
                    const mainMin = (!useKindDefaults && Number(rx.durationMinutes)) || kRx.durationMinutes || 20;
                    const mainDist = (!useKindDefaults && Number(rx.distanceM)) || kRx.distanceM || undefined;
                    const next = [
                      { kind: 'walk', durationMinutes: 15, note: 'Khởi động' },
                      { kind: mainKind, durationMinutes: mainMin, ...(mainDist ? { distanceM: mainDist } : {}), note: 'Bài chính' },
                      { kind: 'walk', durationMinutes: 10, note: 'Thả lỏng' },
                    ];
                    createForm.setFieldValue('segments', next);
                    syncSegmentsToForm(next);
                  };
                  const addSegmentSmart = () => {
                    if (fields.length === 0) {
                      const mainKind = createForm.getFieldValue('kind') || draftKind || 'canter';
                      const rx = createForm.getFieldValue('prescription') || {};
                      const kRx = SESSION_KINDS[mainKind]?.prescription || {};
                      const mainMin = Number(rx.durationMinutes) || kRx.durationMinutes || 20;
                      const mainDist = Number(rx.distanceM) || kRx.distanceM || undefined;
                      const next = [
                        { kind: mainKind, durationMinutes: mainMin, ...(mainDist ? { distanceM: mainDist } : {}), note: 'Bài chính' },
                        { kind: 'walk', durationMinutes: 15, note: 'Thả lỏng / bổ sung' },
                      ];
                      createForm.setFieldValue('segments', next);
                      syncSegmentsToForm(next);
                      return;
                    }
                    add({ kind: 'walk', durationMinutes: 15 });
                    queueMicrotask(() => syncSegmentsToForm(createForm.getFieldValue('segments')));
                  };

                  return (
                    <div className="mb-3 rounded-lg border border-black/10 p-2.5">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <Text type="secondary" className="!text-xs">
                          Thêm các đoạn nối tiếp (VD: Khởi động 15&apos; → Bài chính 20&apos; → Thả lỏng 10&apos;) — bấm Thêm bài để giữ sẵn bài chính đang chọn và ghép tiếp đoạn mới.
                        </Text>
                        <div className="flex gap-1.5">
                          <Button size="small" type="dashed" onClick={seedThreeSteps}>
                            Mẫu 3 đoạn (45&apos;)
                          </Button>
                          <Button size="small" icon={<PlusOutlined />} onClick={addSegmentSmart}>
                            Thêm bài
                          </Button>
                        </div>
                      </div>
                      {fields.map(({ key, name, ...restField }, idx) => (
                        <div key={key} className="mb-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="w-5 text-xs text-gray-400">#{idx + 1}</span>
                          <Form.Item {...restField} name={[name, 'kind']} className="!mb-0 min-w-[125px] flex-1" rules={[{ required: true, message: 'Chọn bài' }]}>
                            <Select
                              size="small"
                              placeholder="Loại bài"
                              options={Object.entries(SESSION_KINDS).map(([k, v]) => ({ value: k, label: v.short || v.label }))}
                              onChange={(nextKind) => {
                                const sRx = SESSION_KINDS[nextKind]?.prescription || {};
                                createForm.setFieldValue(['segments', name, 'durationMinutes'], sRx.durationMinutes ?? 15);
                                createForm.setFieldValue(['segments', name, 'distanceM'], sRx.distanceM ?? undefined);
                                queueMicrotask(() => syncSegmentsToForm(createForm.getFieldValue('segments')));
                              }}
                            />
                          </Form.Item>
                          <Form.Item {...restField} name={[name, 'durationMinutes']} className="!mb-0 w-24">
                            <InputNumber size="small" min={1} max={180} placeholder="Phút" suffix="ph" className="w-full" />
                          </Form.Item>
                          <Form.Item {...restField} name={[name, 'distanceM']} className="!mb-0 w-24">
                            <InputNumber size="small" min={0} step={100} placeholder="Cự ly" suffix="m" className="w-full" />
                          </Form.Item>
                          <Form.Item {...restField} name={[name, 'note']} className="!mb-0 min-w-[115px] flex-1">
                            <Input size="small" placeholder="Ghi chú (Khởi động…)" />
                          </Form.Item>
                          <div className="flex items-center">
                            {fields.length > 1 && (
                              <>
                                <Button
                                  size="small"
                                  type="text"
                                  icon={<ArrowUpOutlined />}
                                  disabled={idx === 0}
                                  onClick={() => {
                                    move(idx, idx - 1);
                                    queueMicrotask(() => syncSegmentsToForm(createForm.getFieldValue('segments')));
                                  }}
                                  aria-label="Đưa lên"
                                />
                                <Button
                                  size="small"
                                  type="text"
                                  icon={<ArrowDownOutlined />}
                                  disabled={idx === fields.length - 1}
                                  onClick={() => {
                                    move(idx, idx + 1);
                                    queueMicrotask(() => syncSegmentsToForm(createForm.getFieldValue('segments')));
                                  }}
                                  aria-label="Đưa xuống"
                                />
                              </>
                            )}
                            <Button
                              size="small"
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => {
                                remove(name);
                                queueMicrotask(() => syncSegmentsToForm(createForm.getFieldValue('segments'), { resetWhenEmpty: true }));
                              }}
                              aria-label="Xóa đoạn"
                            />
                          </div>
                        </div>
                      ))}
                      {cleanSegs.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded bg-black/[0.03] px-2.5 py-1.5 text-xs">
                          <span className="font-medium text-gray-800">
                            Tổng ghép: {cleanSegs.length} bài · {totalSegMin} phút
                            {totalSegDist > 0 ? ` · ${totalSegDist.toLocaleString('vi-VN')} m` : ''}
                          </span>
                          {draftAt && draftEndAt && (
                            <span className="tabular-nums text-gray-600">
                              Khung giờ: {dayjs(draftAt).format('HH:mm')}–{dayjs(draftEndAt).format('HH:mm')}
                            </span>
                          )}
                        </div>
                      )}
                      {segmentWarnings.length > 0 && (
                        <Alert
                          className="!mt-2"
                          type="warning"
                          showIcon
                          title="Lưu ý an toàn khi ghép bài"
                          description={
                            <ul className="m-0 pl-4 text-xs">
                              {segmentWarnings.map((w) => (
                                <li key={w}>{w}</li>
                              ))}
                            </ul>
                          }
                        />
                      )}
                    </div>
                  );
                }}
              </Form.List>

              <Form.Item name="coachNote" label="Dặn dò trước buổi tập" extra="Tự soạn theo bài đã chọn — sửa thêm nếu cần, hệ thống sẽ không ghi đè phần bạn đã viết.">
                <Input.TextArea rows={2} placeholder="VD: Giữ nhịp đều 2 hiệp đầu, bung sức hiệp cuối. Chú ý chân trước phải." />
              </Form.Item>
            </Col>
            <Col xs={24} lg={9}>
              <div className="lg:sticky lg:top-0">
                {/* Always keep the 3D horse preview visible beside ReadinessPanel: stands alert until a workout kind is chosen, then runs live at the target speed. */}
                <div className="mb-3">
                  <MovingHorse3D
                    breed={draftHorse?.breed}
                    color={draftHorse?.color}
                    motion={
                      draftKind
                        ? motionOfKind(draftKind, draftSpeed)
                        : { clip: 'Idle_Look', label: draftHorse ? `${draftHorse.name} · chọn loại buổi để xem dáng chạy` : 'Chọn ngựa và loại buổi tập' }
                    }
                    surface={surfaceOf((plansData?.data || []).find((p) => p._id === draftPlanId), draft.scheduledAt || undefined)}
                    hour={hourOf(draft.scheduledAt)}
                    height={175}
                    compact
                  />
                </div>
                <ReadinessPanel
                  horse={draft.horse}
                  scheduledAt={draft.scheduledAt}
                  intensity={draft.intensity}
                  sessionType={draft.sessionType}
                  objective={draft.objective}
                  onRequestExam={() => setExamFor({ horseId: draft.horse })}
                />
                <Text type="secondary" className="!text-xs block mt-2">
                  Mỗi dòng do một người khác nắm giữ. Khóa y tế của bác sĩ, sốt, hoặc ngựa vừa ăn bữa có thức ăn tinh chưa
                  đủ {policy.digestHardMinutes} phút (theo quy định CLB) sẽ chặn hẳn buổi tập; các cảnh báo còn lại bạn vẫn có thể bỏ qua nhưng phải ghi lý do.
                </Text>
              </div>
            </Col>
          </Row>
        </Form>
      </Modal>

      <SessionReplay
        session={replaySession}
        horse={replaySession && (horsesData?.data || []).find((h) => String(h._id) === String(replaySession.horse?._id || replaySession.horse))}
        plan={replaySession && (plansData?.data || []).find((p) => String(p._id) === String(replaySession.trainingPlan?._id || replaySession.trainingPlan))}
        onClose={() => setReplaySession(null)}
      />

      <Modal
        title={`${activeSession?.status === 'evaluated' ? 'Sửa đánh giá' : 'Đánh giá buổi tập'} — ${activeSession?.horse?.name || ''}`}
        open={evalOpen}
        okText="Lưu đánh giá"
        cancelText="Hủy"
        width={620}
        onCancel={() => setEvalOpen(false)}
        onOk={() => evalForm.submit()}
        confirmLoading={evalMutation.isPending}
        destroyOnHidden
      >
        {activeSession && (
          <Alert
            className="!mb-3"
            type="info"
            showIcon
            title={`Mục đích: ${OBJECTIVE_LABELS[activeSession.objective] || '—'}`}
            description={
              <div className="text-xs">
                {describePrescription(activePrescription) || 'Buổi tập này không đặt mục tiêu cụ thể.'}
                <div className="mt-1">
                  Dự kiến {sessionTimeLabel(activeSession.scheduledAt)}
                  {actualTimeLabel(activeSession) ? ` · Thực tế ${actualTimeLabel(activeSession)}` : ' · Chưa chạy (chưa bấm Bắt đầu)'}
                </div>
                {activeSession.coachNote && <div className="mt-1">Dặn dò: {activeSession.coachNote}</div>}
              </div>
            }
          />
        )}
        <Form
          form={evalForm}
          layout="vertical"
          onFinish={(values) =>
            // An emptied field must reach the server as '' so the link is cleared, not ignored.
            evalMutation.mutate({ id: activeSession._id, payload: { ...values, videoUrl: values.videoUrl || '', trainerComment: values.trainerComment || '' } })
          }
        >
          {activeSession && (
            <div className="mb-3">
              <Text strong className="!text-sm block mb-1">
                Kết quả đo được
              </Text>
              <SessionOutcome session={activeSession} />
            </div>
          )}
          <Form.Item name="performanceRating" label="Điểm phong độ (1 = kém, 10 = xuất sắc)" rules={[{ required: true, message: 'Chấm điểm phong độ' }]}>
            <InputNumber min={1} max={10} precision={0} className="w-full" placeholder="VD: 8" />
          </Form.Item>
          <Form.Item
            name="trainerComment"
            label="Nhận xét chuyên môn"
            extra="Ghi lại quan sát của bạn về phong độ, kỹ thuật, hoặc bất thường trong buổi tập này."
          >
            <Input.TextArea rows={3} placeholder="VD: Ngựa chạy ổn định, nên tăng nhẹ cường độ tuần tới." />
          </Form.Item>
          <Form.Item
            name="videoUrl"
            label="Link video buổi chạy"
            extra="Dán đường link YouTube/Drive để chủ sở hữu xem lại — nhất là với lượt chạy thử."
            rules={[{ type: 'url', message: 'Hãy nhập một đường link hợp lệ (bắt đầu bằng http:// hoặc https://).' }]}
          >
            <Input placeholder="https://..." allowClear />
          </Form.Item>
          {activeSession?.status === 'evaluated' && (
            <Alert type="info" showIcon title="Buổi này đã được đánh giá. Lưu lại sẽ sửa đánh giá; giá trị cũ được giữ trong nhật ký hệ thống." />
          )}
        </Form>
      </Modal>

      {workSession && (
        <ChangeWorkoutModal
          session={workSession}
          clearance={clearances.get(String(workSession.horse?._id || workSession.horse))}
          onClose={() => setWorkSession(null)}
        />
      )}

      <Modal
        title={scheduleSession?.status === 'missed' ? 'Xếp lại buổi tập đã lỡ giờ' : 'Đổi giờ buổi tập'}
        open={Boolean(scheduleSession)}
        onCancel={() => setScheduleSession(null)}
        onOk={() => scheduleForm.submit()}
        okText="Lưu giờ tập mới"
        cancelText="Hủy"
        confirmLoading={scheduleMutation.isPending}
        destroyOnHidden
      >
        <Text className="block mb-3">
          {scheduleSession?.horse?.name} · Dự kiến cũ {scheduleSession ? sessionTimeLabel(scheduleSession.scheduledAt) : ''}
        </Text>
        <Alert
          className="!mb-3"
          type="info"
          showIcon
          title={scheduleSession?.status === 'missed' ? 'Buổi cũ được giữ làm lịch sử; hệ thống tạo buổi mới với cùng bài tập.' : 'Đổi giờ sẽ đưa buổi về Đã lên lịch. Bạn cần kiểm tra sẵn sàng lại.'}
        />
        {scheduleSlotProblem && <Alert className="!mb-3" type="error" showIcon title={scheduleSlotProblem} />}
        <Form
          form={scheduleForm}
          layout="vertical"
          onFinish={(values) => scheduleMutation.mutate({ session: scheduleSession, scheduledAt: values.scheduledAt.toISOString() })}
        >
          <Form.Item name="scheduledAt" label="Giờ bắt đầu dự kiến mới" rules={[{ required: true, message: 'Chọn ngày giờ mới' }, futureTimeRule]}>
            <DatePicker showTime format="DD/MM/YYYY HH:mm" className="w-full" disabledDate={(d) => d && d.isBefore(dayjs(), 'day')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Kết thúc buổi tập — ${endSession?.horse?.name || ''}`}
        open={Boolean(endSession)}
        onCancel={() => setEndSession(null)}
        onOk={() => endForm.submit()}
        okText="Kết thúc buổi tập"
        cancelText="Đóng"
        confirmLoading={endMutation.isPending}
        destroyOnHidden
      >
        {endSession && (
          <Form
            form={endForm}
            layout="vertical"
            onFinish={(values) => {
              const typed = Object.fromEntries(Object.entries(values.metrics || {}).filter(([, v]) => v !== undefined && v !== null));
              endMutation.mutate({ id: endSession._id, metrics: Object.keys(typed).length ? typed : undefined });
            }}
          >
            <Text className="block mb-2">
              Kết thúc ngay bây giờ: giờ kết thúc thực tế là lúc bấm, số liệu được đối chiếu với mục tiêu, buổi nặng sẽ giao việc chăm sóc sau tập cho nhân viên.
            </Text>
            {endSession.metrics?.sampleCount ? (
              <SessionOutcome session={endSession} />
            ) : (
              <>
                <Alert className="!mb-3" type="info" showIcon title="Buổi này chưa có số liệu cảm biến. Nhập số đo tay nếu có (không bắt buộc)." />
                <Row gutter={12}>
                  <Col xs={8}>
                    <Form.Item name={['metrics', 'distance']} label="Cự ly (m)">
                      <InputNumber min={METRIC_LIMITS.distance[0]} max={METRIC_LIMITS.distance[1]} step={100} className="w-full" />
                    </Form.Item>
                  </Col>
                  <Col xs={8}>
                    <Form.Item name={['metrics', 'maxSpeed']} label="Tốc độ tối đa">
                      <InputNumber min={METRIC_LIMITS.maxSpeed[0]} max={METRIC_LIMITS.maxSpeed[1]} className="w-full" />
                    </Form.Item>
                  </Col>
                  <Col xs={8}>
                    <Form.Item name={['metrics', 'avgHeartRate']} label="Nhịp tim TB">
                      <InputNumber min={METRIC_LIMITS.avgHeartRate[0]} max={METRIC_LIMITS.avgHeartRate[1]} className="w-full" />
                    </Form.Item>
                  </Col>
                </Row>
              </>
            )}
          </Form>
        )}
      </Modal>

      <Modal
        title={`Dừng giữa chừng — ${abortSession?.horse?.name || ''}`}
        open={Boolean(abortSession)}
        onCancel={() => setAbortSession(null)}
        onOk={() => abortForm.submit()}
        okText="Dừng buổi tập"
        okButtonProps={{ danger: true }}
        cancelText="Đóng"
        confirmLoading={abortMutation.isPending}
        destroyOnHidden
      >
        <Text className="block mb-3">
          Số liệu đo được đến lúc dừng và giờ dừng thực tế được giữ lại. Chọn "Sức khỏe" hoặc "Nghi chấn thương" thì bác sĩ nhận yêu cầu khám ưu tiên cao.
        </Text>
        <Form form={abortForm} layout="vertical" onFinish={(values) => abortMutation.mutate({ id: abortSession._id, ...values })}>
          <Form.Item name="category" label="Nhóm nguyên nhân" rules={[{ required: true, message: 'Chọn nhóm nguyên nhân' }]}>
            <Select options={TRAINER_ABORT_OPTIONS} placeholder="Chọn nhóm nguyên nhân" />
          </Form.Item>
          <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, message: 'Ghi lý do dừng' }]}>
            <Input.TextArea rows={2} placeholder="VD: Ngựa khập khiễng chân trước trái sau 300 m." />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Hủy buổi tập"
        open={Boolean(cancelSession)}
        onCancel={() => setCancelSession(null)}
        onOk={() => cancelForm.submit()}
        okText="Hủy buổi tập"
        okButtonProps={{ danger: true }}
        cancelText="Đóng"
        confirmLoading={cancelMutation.isPending}
        destroyOnHidden
      >
        <Text className="block mb-3">
          {cancelSession?.horse?.name} · {cancelSession ? sessionTimeLabel(cancelSession.scheduledAt) : ''}
        </Text>
        <Form
          form={cancelForm}
          layout="vertical"
          onFinish={(values) => cancelMutation.mutate({ id: cancelSession._id, cancelReason: values.cancelReason })}
        >
          <Form.Item name="cancelReason" label="Lý do hủy" rules={[{ required: true, whitespace: true, message: 'Ghi lý do để giữ trong lịch sử' }]}>
            <Input.TextArea rows={2} placeholder="VD: Trời mưa lớn, sân trơn." />
          </Form.Item>
        </Form>
      </Modal>

      {examFor?.horseId && (
        <RequestExamModal
          horse={(horsesData?.data || []).find((h) => String(h._id) === String(examFor.horseId)) || examFor.session?.horse || { _id: examFor.horseId }}
          session={examFor.session}
          defaults={examFor.defaults}
          onClose={() => setExamFor(null)}
        />
      )}
    </div>
  );
}
