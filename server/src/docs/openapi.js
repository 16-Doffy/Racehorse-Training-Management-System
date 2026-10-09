// Hand-maintained OpenAPI 3.0 spec for the whole API. Served as interactive docs at /api-docs
// (Swagger UI) and as raw JSON at /api-docs.json. Keep this in sync when routes change — there's
// no code-generation step, this file IS the source of truth for the docs.

const ok = (dataSchema) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: dataSchema,
    message: { type: 'string' },
  },
});

const fail = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    data: { nullable: true, example: null },
    message: { type: 'string', example: 'Something went wrong.' },
  },
};

const idParam = (name, description) => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description,
});

const horseQueryParam = {
  name: 'horse',
  in: 'query',
  required: false,
  schema: { type: 'string' },
  description: 'Filter by horse id',
};

const responses = {
  200: (schema) => ({ description: 'OK', content: { 'application/json': { schema: ok(schema) } } }),
  201: (schema) => ({ description: 'Created', content: { 'application/json': { schema: ok(schema) } } }),
  400: { description: 'Validation error', content: { 'application/json': { schema: fail } } },
  401: { description: 'Not authenticated', content: { 'application/json': { schema: fail } } },
  403: { description: 'Forbidden for this role', content: { 'application/json': { schema: fail } } },
  404: { description: 'Not found', content: { 'application/json': { schema: fail } } },
  409: { description: 'Conflict (e.g. duplicate, or horse under an active training lock)', content: { 'application/json': { schema: fail } } },
};

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Racehorse Training & Management System API',
    version: '1.0.0',
    description:
      'REST + Socket.io API for the Racehorse Training & Management System (5 roles: head_trainer, ' +
      'veterinarian, groom, owner, manager). All responses use the shape `{ success, data, message }`. ' +
      'Authenticate with `POST /auth/login`, then send `Authorization: Bearer <token>` on every other ' +
      'request. Socket.io connects to the server root (not under /api/v1) with `auth: { token }` and ' +
      'emits `fitness:alert` / `sensor:reading` — see README.md for details, not covered by this spec.',
  },
  servers: [
    { url: 'https://racehorse-tms-server.onrender.com/api/v1', description: 'Production (shared, Render + Atlas)' },
    { url: 'http://localhost:5000/api/v1', description: 'Local dev' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['head_trainer', 'veterinarian', 'groom', 'owner', 'manager'] },
          phone: { type: 'string' },
          avatarUrl: { type: 'string', description: 'Link from POST /uploads' },
          isActive: { type: 'boolean' },
          approvalStatus: { type: 'string', enum: ['pending', 'approved', 'rejected'], description: 'Distinguishes a self-registration awaiting a Manager decision from an existing member who was deactivated (both have isActive=false).' },
        },
      },
      Horse: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          trainingClearance: {
            type: 'object',
            readOnly: true,
            description: 'How hard the horse may be worked now, from the vet\'s level on its ongoing treatments (strictest applies)',
            properties: {
              level: { type: 'string', enum: ['none', 'light', 'moderate', 'high'], description: 'none = training lock; light / moderate = recovering; high = no restriction' },
              label: { type: 'string' },
              restricted: { type: 'boolean' },
              reason: { type: 'string', nullable: true },
              since: { type: 'string', format: 'date-time' },
              prescribedBy: { type: 'string', nullable: true },
            },
          },
          name: { type: 'string' },
          breed: { type: 'string' },
          dob: { type: 'string', format: 'date-time' },
          color: { type: 'string' },
          owner: { type: 'string', description: 'User id (populated as object on read)' },
          sire: { type: 'string', nullable: true },
          dam: { type: 'string', nullable: true },
          assignedTrainer: { type: 'string', nullable: true, description: 'Head Trainer user id responsible for this horse (Manager-set). Null = visible to every Head Trainer until assigned.' },
          assignedVet: { type: 'string', nullable: true, description: 'Veterinarian user id responsible for this horse (Manager-set). Null = visible to every Veterinarian until assigned.' },
          healthStatus: { type: 'string', enum: ['eligible', 'monitoring', 'injured', 'quarantined'] },
          weightKg: { type: 'number' },
          achievements: {
            type: 'array',
            items: {
              type: 'object',
              properties: { race: { type: 'string' }, result: { type: 'string' }, date: { type: 'string', format: 'date-time' } },
            },
          },
          careSchedule: {
            type: 'object',
            description: 'Recurring vet care due-dates; checked hourly by the care scheduler to notify the Veterinarian role.',
            properties: {
              nextVaccinationDue: { type: 'string', format: 'date-time', nullable: true },
              nextDewormingDue: { type: 'string', format: 'date-time', nullable: true },
              nextFarrierDue: { type: 'string', format: 'date-time', nullable: true },
              nextExamDue: { type: 'string', format: 'date-time', nullable: true, description: 'Periodic check-up; the vet is reminded when due' },
            },
          },
        },
      },
      TrainingPlan: {
        type: 'object',
        description:
          'A training cycle for one horse (one active plan per horse), usually aimed at a race: phases laid end to end from startDate. ' +
          'phase / distanceTarget / weeklyVolumeKm / intensity / surface describe the phase the horse is in now (kept in sync by the server). ' +
          'Plans from before phases existed read as one phase. List and get responses add progress.',
        properties: {
          _id: { type: 'string' },
          horse: { type: 'string' },
          createdBy: { type: 'string' },
          phase: { type: 'string', enum: ['base_building', 'strength', 'speed', 'peak', 'recovery'] },
          distanceTarget: { type: 'number', description: 'meters' },
          weeklyVolumeKm: { type: 'number', description: 'Total planned training km per week ("khối lượng")' },
          intensity: { type: 'string', enum: ['light', 'moderate', 'high'] },
          surface: { type: 'string', enum: ['turf', 'dirt', 'synthetic', 'sand'] },
          goal: { type: 'string', description: 'What the whole plan is building towards, in plain words' },
          targetRace: { type: 'string', nullable: true, description: 'RaceEntry this plan is preparing the horse for' },
          startDate: { type: 'string', format: 'date-time', description: 'Club calendar date (Vietnam time by default). New plans and changed start dates must be today or later; a draft whose start date has passed must be updated before activation.' },
          endDate: { type: 'string', format: 'date-time' },
          notes: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'active', 'completed', 'cancelled'], description: 'Only one active plan per horse (409 otherwise). Completing or cancelling cancels every unstarted scheduled/ready/blocked session, including bookings still within their start grace window.' },
          sessionTime: { type: 'string', pattern: '^(0\\d|1[01]):[0-5]\\d$', default: '07:30', example: '07:30', description: 'Morning booking time in the club timezone, HH:mm from 00:00 through 11:59.' },
          afternoonTime: { type: 'string', pattern: '^(1[2-9]|2[0-3]):[0-5]\\d$', default: '16:00', example: '16:00', description: 'Afternoon booking time in the club timezone, HH:mm from 12:00 through 23:59; only walk or canter in afternoon templates.' },
          phases: {
            type: 'array',
            items: {
              type: 'object',
              required: ['key', 'weeks'],
              properties: {
                key: { type: 'string', enum: ['base_building', 'strength', 'speed', 'peak', 'recovery'] },
                weeks: { type: 'integer', minimum: 1, maximum: 12 },
                startDate: { type: 'string', format: 'date-time', readOnly: true },
                endDate: { type: 'string', format: 'date-time', readOnly: true },
                distanceTarget: { type: 'number', minimum: 100, maximum: 6000 },
                weeklyVolumeKm: { type: 'number' },
                intensity: { type: 'string', enum: ['light', 'moderate', 'high'] },
                surface: { type: 'string', enum: ['turf', 'dirt', 'synthetic', 'sand'] },
                week: {
                  type: 'array',
                  description: 'The phase\'s normal week; days not listed are rest days',
                  items: {
                    type: 'object',
                    properties: {
                      day: { type: 'integer', minimum: 0, maximum: 6, description: '0 = Sunday … 6 = Saturday' },
                      slot: { type: 'string', enum: ['morning', 'afternoon'], default: 'morning', description: 'One morning and one afternoon entry per day at most; afternoon only walk or canter' },
                      kind: { type: 'string', enum: ['walk', 'canter', 'hill', 'breeze', 'trial'] },
                      distanceM: { type: 'number' },
                      reps: { type: 'number' },
                      targetSpeedKmh: { type: 'number' },
                      targetHeartRateMax: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
          progress: {
            type: 'object',
            readOnly: true,
            description: 'week (0 = not started) of totalWeeks, phaseIndex, phaseWeek, phaseSessions {planned, completed, met}, totalCompleted, raceInDays, upcoming (next 3 scheduled sessions)',
          },
        },
      },
      ExamRequest: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          horse: { type: 'string' },
          requestedBy: { type: 'string' },
          reason: { type: 'string' },
          priority: { type: 'string', enum: ['normal', 'high', 'urgent'] },
          status: { type: 'string', enum: ['pending', 'done', 'cancelled'] },
          resolvedBy: { type: 'string', nullable: true },
          resolvedAt: { type: 'string', format: 'date-time', nullable: true },
          healthRecord: { type: 'string', nullable: true, description: 'The exam that answered the request' },
          resolutionNote: { type: 'string' },
          trainingSession: {
            type: 'string',
            nullable: true,
            description: 'Set when the system raised the request itself: a finished session averaged 10%+ over its heart-rate limit',
          },
        },
      },
      Readiness: {
        type: 'object',
        description:
          'Whether a horse is fit to do a given piece of work. Four gates, each owned by a different role: ' +
          'medical (vet), vet_clearance (vet), nutrition (groom), care_assignment (manager). ' +
          '`medical` returns "blocked" on a vet order; `nutrition` returns "blocked" when the meal before the session was given under 60 min earlier ' +
          '(caution under 90 min; only the meal right before the session is judged). Other cautions are advisory and a trainer may proceed past them ' +
          'by supplying `overrideReason`, which is audit-logged and reported to the manager.',
        properties: {
          overall: { type: 'string', enum: ['ready', 'caution', 'blocked'] },
          scheduledAt: { type: 'string', format: 'date-time' },
          gates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string', enum: ['medical', 'vet_clearance', 'nutrition', 'care_assignment'] },
                label: { type: 'string', description: 'Vietnamese label, ready to render' },
                status: { type: 'string', enum: ['ok', 'caution', 'blocked'] },
                detail: { type: 'string', description: 'Vietnamese explanation of why, ready to render' },
                action: { type: 'string', nullable: true, enum: ['request_exam'], description: 'Suggested remedy, when there is one' },
              },
            },
          },
        },
      },
      TrainingSession: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          trainingPlan: { type: 'string' },
          horse: { type: 'string' },
          assignedTo: { type: 'string' },
          sessionType: { type: 'string', enum: ['training', 'trial_run'], description: '"lượt chạy thử" vs a normal training rep' },
          kind: {
            type: 'string',
            enum: ['walk', 'canter', 'hill', 'breeze', 'trial'],
            description:
              'Kind of work: walk (đi bộ & kiệu), canter (phi chậm), hill (tập dốc), breeze (phi nhanh), trial (chạy thử). On create it fills objective, intensity, ' +
              'sessionType and any prescription field left out with the kind\'s default workout.',
          },
          generated: { type: 'boolean', readOnly: true, description: 'Booked by "generate week" from the plan' },
          rescheduledTo: { type: 'string', nullable: true, readOnly: true, description: 'Replacement TrainingSession id after a missed session is rebooked; the original session remains missed as history.' },
          objective: {
            type: 'string',
            enum: ['endurance', 'speed', 'interval', 'recovery', 'technique', 'race_simulation'],
            description: 'What the session is for — decides distance, pace and the alert thresholds used',
          },
          intensity: { type: 'string', enum: ['light', 'moderate', 'high'], description: 'This session only; may differ from the plan default' },
          prescription: {
            type: 'object',
            description: 'The workout as planned; metrics are measured against it to produce `outcome`',
            properties: {
              distanceM: { type: 'number' },
              reps: { type: 'number' },
              restMinutes: { type: 'number' },
              targetSpeedKmh: { type: 'number' },
              targetHeartRateMax: { type: 'number' },
              durationMinutes: { type: 'number' },
            },
          },
          coachNote: { type: 'string', description: 'Briefing before the session (trainerComment is the debrief after)' },
          readiness: { $ref: '#/components/schemas/Readiness' },
          outcome: {
            type: 'object',
            properties: {
              met: { type: 'boolean', nullable: true, description: 'null when the session had no targets to judge against' },
              summary: { type: 'string' },
            },
          },
          scheduledAt: { type: 'string', format: 'date-time', description: 'A valid future instant is required when creating, moving or rebooking a session; use an ISO timestamp with a timezone offset.' },
          status: {
            type: 'string',
            enum: ['scheduled', 'ready', 'blocked', 'in_progress', 'completed', 'evaluated', 'aborted', 'cancelled', 'missed'],
            description:
              'Created as scheduled. Pre-check reaches ready or blocked; start reaches in_progress. The server marks an unstarted ' +
              'scheduled/blocked session missed after its 30-minute pre-check window, or a ready session after its pre-check expires ' +
              '(2 hours). Only completed/cancelled may be requested as a bare body status. Aborted/evaluated are reserved for later lifecycle endpoints.',
          },
          actualStartAt: { type: 'string', format: 'date-time', nullable: true, readOnly: true, description: 'Server time when the session was started; never sent by a client' },
          actualEndAt: { type: 'string', format: 'date-time', nullable: true, readOnly: true, description: 'Server time when the session ended or was stopped' },
          actualDurationSec: { type: 'integer', nullable: true, readOnly: true },
          simulatedWorkSec: { type: 'integer', nullable: true, readOnly: true, description: 'Work covered on the sensor simulator clock (5 s tick = 30 s of work); separate from the real times' },
          endedBy: { type: 'string', nullable: true, readOnly: true, description: 'Who ended or stopped the run; null when the sensor feed closed it' },
          evaluatedBy: { type: 'string', nullable: true, readOnly: true },
          abortReason: { type: 'string', readOnly: true },
          abortCategory: { type: 'string', enum: ['health', 'weather', 'equipment', 'other'], readOnly: true },
          blockedReason: { type: 'string', readOnly: true },
          cancelReason: { type: 'string', readOnly: true },
          evaluatedAt: { type: 'string', format: 'date-time', nullable: true, readOnly: true },
          metrics: {
            type: 'object',
            properties: {
              avgHeartRate: { type: 'number' },
              maxHeartRate: { type: 'number' },
              maxSpeed: { type: 'number', description: 'km/h' },
              distance: { type: 'number', description: 'meters' },
            },
          },
          trainerComment: { type: 'string' },
          performanceRating: { type: 'integer', minimum: 1, maximum: 10 },
          videoUrl: { type: 'string', description: 'Link (http/https) to a recording of the run, mainly for trial runs — set through the evaluation endpoint' },
        },
      },
      HealthRecord: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          horse: { type: 'string' },
          examinedBy: { type: 'string' },
          date: { type: 'string', format: 'date-time' },
          diagnosis: { type: 'string' },
          vitalSigns: {
            type: 'object',
            properties: { temperatureC: { type: 'number' }, heartRate: { type: 'number' }, respiratoryRate: { type: 'number' } },
          },
          resultStatus: { type: 'string', enum: ['eligible', 'monitoring', 'injured', 'quarantined'] },
          notes: { type: 'string' },
          attachments: {
            type: 'array',
            description: 'X-rays, lab results, scanned prescriptions (POST /health/records/{id}/attachments)',
            items: { type: 'object', properties: { _id: { type: 'string' }, url: { type: 'string' }, name: { type: 'string' }, contentType: { type: 'string' }, size: { type: 'number' }, uploadedBy: { type: 'string' }, uploadedAt: { type: 'string', format: 'date-time' } } },
          },
        },
      },
      Treatment: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          healthRecord: { type: 'string' },
          horse: { type: 'string' },
          prescribedBy: { type: 'string' },
          medications: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Defaults to the stock item\'s name when inventoryItem is given' },
                dosage: { type: 'string' },
                frequency: { type: 'string' },
                inventoryItem: { type: 'string', nullable: true, description: 'Medicine in stock (category medicine); giving a dose takes `amount` out of stock' },
                amount: { type: 'number', description: 'Per dose, in the stock item\'s unit (required with inventoryItem)' },
                times: { type: 'array', items: { type: 'string', example: '08:00' }, description: 'Times of day; one groom task per time, recordable 1h before to 4h after. Empty = taken from specificTimes, else timeSlots, else one task a day' },
                specificTimes: { type: 'string', example: '08:00, 16:00', description: 'Typed hours, used when times is empty' },
                timeSlots: { type: 'array', items: { type: 'string', enum: ['morning', 'noon', 'afternoon', 'evening'] }, description: 'Used when times and specificTimes are empty: morning 07:00, noon 11:30, afternoon 15:00, evening 19:00' },
                startDate: { type: 'string', format: 'date-time', description: 'This medicine only; no doses before it' },
                endDate: { type: 'string', format: 'date-time', description: 'This medicine only; no doses after it' },
                instructions: { type: 'string', description: 'How to give it (after food, mix with water…)' },
              },
            },
          },
          trainingLevel: {
            type: 'string',
            enum: ['none', 'light', 'moderate', 'high'],
            description:
              'How hard the horse may work while this treatment is ongoing (none = lock). Kept in step with isTrainingLocked. Lowering cancels booked sessions above the level; sessions above it are refused (409); racing needs high. Completing the treatment ends the restriction.',
          },
          careInstructions: {
            type: 'string',
            description:
              "What the stable must do during the treatment (box rest, watch the swelling…). While the treatment is ongoing, each medication becomes a daily `medication` task and this becomes a daily `monitoring` task for the horse's caretaker (DailyTask.source = vet), who is notified.",
          },
          isTrainingLocked: { type: 'boolean', description: 'While true, POST /training/sessions is refused for this horse (409), and so is a race registration. The trainer and the groom are notified.' },
          lockReason: { type: 'string' },
          status: { type: 'string', enum: ['ongoing', 'completed'] },
        },
      },
      InjuryMarker: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          horse: { type: 'string' },
          bodyPart: { type: 'string' },
          coordinates: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, description: 'Normalized 0-1 against a reference silhouette' },
          severity: { type: 'string', enum: ['mild', 'moderate', 'severe'] },
          recoveryStatus: { type: 'string', enum: ['new', 'in_treatment', 'recovering', 'recovered'] },
        },
      },
      DailyTask: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          horse: { type: 'string' },
          assignedTo: { type: 'string' },
          taskType: {
            type: 'string',
            enum: ['feeding', 'cleaning', 'bathing', 'icing', 'medication', 'monitoring', 'other'],
            description: 'medication / monitoring are created from a vet treatment only; they cannot be assigned by hand',
          },
          source: {
            type: 'string',
            enum: ['trainer', 'vet', 'system'],
            description: 'Who the work comes from: assigned by hand, ordered by the vet through a treatment, or generated (daily meals, post-session care). A trainer/manager cannot edit or delete a vet task (409).',
          },
          treatment: { type: 'string', nullable: true, description: 'The treatment a vet care order belongs to' },
          mealSlot: {
            type: 'string',
            nullable: true,
            enum: ['morning', 'noon', 'evening'],
            description: 'Which meal a feeding task covers; null for other task types',
          },
          trainingSession: {
            type: 'string',
            nullable: true,
            description: 'Set when the task was auto-generated by a completed hard session (icing/bathing)',
          },
          note: { type: 'string', description: "The trainer's instruction attached to the task" },
          scheduledDate: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['pending', 'completed', 'skipped'] },
          dueTime: { type: 'string', nullable: true, description: 'Time of day (HH:mm) of a vet\'s dose or a hand-given job; recordable from 1h before. A dose closes 4h after; a job past that shows as late but can still be recorded' },
          supplies: {
            type: 'array',
            description: 'What completing the task takes out of stock (ration items, a dose). Completing without enough stock → 409 with data.missing.',
            items: { type: 'object', properties: { inventoryItem: { type: 'string' }, name: { type: 'string' }, amount: { type: 'number' }, unit: { type: 'string' } } },
          },
          supplyStatus: {
            type: 'object',
            readOnly: true,
            description: 'On pending tasks with supplies (list endpoints): whether stock covers it now',
            properties: { ok: { type: 'boolean' }, missing: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, needed: { type: 'number' }, available: { type: 'number' }, short: { type: 'number' }, unit: { type: 'string' } } } } },
          },
          acknowledgedAt: { type: 'string', format: 'date-time', nullable: true, description: 'When the groom took the task on (PATCH /stable/tasks/{id}/acknowledge)' },
          skipReason: { type: 'string', description: 'Why it was not done, when the groom reported it (PATCH /stable/tasks/{id}/not-done)' },
          skippedBy: { type: 'string', nullable: true, description: 'Who called it off: the trainer, or the groom reporting it could not be done' },
          timing: {
            type: 'object',
            readOnly: true,
            description:
              'Computed on every response from the real clock. A meal can be recorded from 1h before to 4h after its time; ' +
              'medication / monitoring / an untimed feeding only on their own day; other chores can still be completed late. ' +
              'Completing, editing or skipping outside the window is refused with `reason`.',
            properties: {
              state: { type: 'string', enum: ['upcoming', 'open', 'late', 'missed', 'closed'] },
              canComplete: { type: 'boolean' },
              canChange: { type: 'boolean', description: 'Whether the trainer may still edit / skip it' },
              opensAt: { type: 'string', format: 'date-time' },
              closesAt: { type: 'string', format: 'date-time' },
              reason: { type: 'string' },
            },
          },
          observation: {
            type: 'object',
            nullable: true,
            description: 'What the groom saw while doing the work. Feeds the training readiness nutrition gate.',
            properties: {
              appetite: { type: 'string', nullable: true, enum: ['full', 'partial', 'refused'] },
              amountEatenPercent: { type: 'number', minimum: 0, maximum: 100 },
              behaviourNote: { type: 'string' },
              recordedAt: { type: 'string', format: 'date-time' },
            },
          },
          incidentReport: {
            type: 'object',
            nullable: true,
            properties: {
              description: { type: 'string' },
              images: { type: 'array', items: { type: 'string' }, description: 'Relative URLs under /uploads' },
              severity: { type: 'string', enum: ['low', 'medium', 'high'] },
              reportedAt: { type: 'string', format: 'date-time' },
              status: {
                type: 'string',
                enum: ['open', 'acknowledged', 'resolved'],
                description: 'Open until the vet picks it up and closes it. Reports filed before this field existed have none and count as open.',
              },
              handledBy: { type: 'string', nullable: true, description: 'The vet who acknowledged / resolved it' },
              response: { type: 'string', description: 'What the vet found or told the stable to do' },
              resolvedAt: { type: 'string', format: 'date-time', nullable: true },
              healthRecord: { type: 'string', nullable: true, description: 'Set when the report was closed by filing an exam' },
            },
          },
        },
      },
      TimelineEvent: {
        type: 'object',
        properties: {
          at: { type: 'string', format: 'date-time' },
          kind: { type: 'string', enum: ['session', 'exam', 'treatment', 'care', 'incident', 'exam_request', 'race'] },
          role: { type: 'string', description: 'The role the record came from (head_trainer, veterinarian, groom, manager)' },
          actor: { type: 'string', description: 'Name of the person, when known' },
          title: { type: 'string' },
          detail: { type: 'string' },
          severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
          upcoming: { type: 'boolean', description: 'A session or race still booked for the future' },
          refId: { type: 'string', description: 'Id of the underlying record' },
        },
      },
      StableAssignment: {
        type: 'object',
        properties: { _id: { type: 'string' }, horse: { type: 'string' }, stableBlock: { type: 'string' }, assignedCaretaker: { type: 'string' } },
      },
      FeedingSchedule: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          horse: { type: 'string' },
          mealTime: { type: 'string', enum: ['morning', 'noon', 'evening'] },
          timeOfDay: { type: 'string', example: '06:00' },
          items: {
            type: 'array',
            description: 'Send { inventoryItem, amount } (a food item in stock, amount per meal in its unit); the server fills type/quantity for display. Text-only { type, quantity } items from before are kept.',
            items: { type: 'object', properties: { inventoryItem: { type: 'string' }, amount: { type: 'number' }, unit: { type: 'string', readOnly: true }, type: { type: 'string' }, quantity: { type: 'string' } } },
          },
        },
      },
      InventoryItem: {
        type: 'object',
        description: 'Status (in stock / low / out / expiring / discontinued) is computed from quantity, reorderLevel, expiryDate and isActive.',
        properties: {
          _id: { type: 'string' },
          code: { type: 'string', readOnly: true, example: 'TA-001', description: 'Auto per category: TA (food), YT (medical), DC (equipment)' },
          name: { type: 'string' },
          category: { type: 'string', enum: ['feed', 'medicine', 'equipment'] },
          description: { type: 'string', description: 'What it is for' },
          quantity: { type: 'number' },
          unit: { type: 'string', description: 'Unit rations / doses and stock are counted in (kg, g, ml, viên…)' },
          packUnit: { type: 'string', description: 'Purchase unit, optional (bao, hộp, chai…)' },
          packSize: { type: 'number', description: 'Units per pack: 1 packUnit = packSize unit' },
          reorderLevel: { type: 'number', description: 'Minimum stock; at or below it the item counts as low' },
          price: { type: 'number', description: 'Reference price per purchase unit (pack, or unit), VND' },
          expiryDate: { type: 'string', format: 'date-time', nullable: true },
          isActive: { type: 'boolean', description: 'false = discontinued: kept on record, not selectable for new rations / prescriptions' },
          lastRestockedAt: { type: 'string', format: 'date-time', nullable: true, readOnly: true },
          stableBlock: { type: 'string', description: 'Area; empty = shared stock' },
          isProposed: { type: 'boolean', description: 'A new item someone asked to stock, not yet approved (quantity 0)' },
          proposedBy: { type: 'string', nullable: true },
          restockRequests: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                _id: { type: 'string' },
                requestedBy: { type: 'string' },
                quantity: { type: 'number' },
                note: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
                reviewedBy: { type: 'string', nullable: true },
                reviewedAt: { type: 'string', format: 'date-time', nullable: true },
                reviewNote: { type: 'string' },
              },
            },
          },
        },
      },
      RaceEntry: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          horse: { type: 'string' },
          raceName: { type: 'string' },
          raceDate: { type: 'string', format: 'date-time' },
          distance: { type: 'number', description: 'Required on create, 400-6000 m' },
          venue: { type: 'string', example: 'Trường đua Đại Nam' },
          surface: { type: 'string', enum: ['turf', 'dirt', 'synthetic', 'sand'] },
          status: { type: 'string', enum: ['registered', 'confirmed', 'completed', 'withdrawn'], description: 'completed only through PATCH /races/{id}/results' },
          result: { type: 'string' },
          position: { type: 'integer', minimum: 1 },
          finishTime: { type: 'string', example: '1:12.45' },
          prizeMoney: { type: 'number', description: 'VND; recorded as owner revenue (category prize)' },
          financeRecord: { type: 'string', nullable: true, description: 'The revenue record the prize became' },
        },
      },
      FinancialRecord: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          horse: { type: 'string' },
          type: { type: 'string', enum: ['cost', 'revenue'] },
          category: { type: 'string' },
          amount: { type: 'number' },
          date: { type: 'string', format: 'date-time' },
          note: { type: 'string' },
        },
      },
      Notification: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          recipientUser: { type: 'string', nullable: true },
          recipientRole: { type: 'string', nullable: true },
          horse: { type: 'string' },
          type: { type: 'string', enum: ['fitness_alert', 'injury_lock', 'vaccination_due', 'deworming_due', 'farrier_due', 'incident_report', 'exam_request', 'restock_decision', 'horse_assigned', 'session_completed', 'readiness_override', 'training_unlocked', 'system'] },
          trainingSession: { type: 'string', nullable: true, description: 'Set when the notification is about one specific session' },
          severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
          message: { type: 'string' },
          isRead: { type: 'boolean' },
        },
      },
      AuditLog: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          actor: { type: 'string' },
          action: { type: 'string', example: 'treatment.lock_training' },
          targetModel: { type: 'string' },
          targetId: { type: 'string' },
          metadata: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Auth' },
    { name: 'Users (Manager)' },
    { name: 'Horses' },
    { name: 'Training (Head Trainer)' },
    { name: 'Health (Veterinarian)' },
    { name: 'Stable (Groom)' },
    { name: 'Feeding (scaffold)' },
    { name: 'Inventory (scaffold)' },
    { name: 'Races (scaffold)' },
    { name: 'Finance (scaffold)' },
    { name: 'Notifications' },
    { name: 'Audit Log (Manager)' },
    { name: 'Reports (Manager)' },
    { name: 'System' },
  ],
  paths: {
    '/health-check': {
      get: {
        tags: ['System'],
        summary: 'Liveness check',
        security: [],
        responses: { 200: responses[200]({ type: 'object', properties: { message: { type: 'string' } } }) },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } },
        },
        responses: {
          200: responses[200]({ type: 'object', properties: { token: { type: 'string' }, user: { $ref: '#/components/schemas/User' } } }),
          401: responses[401],
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Self-register for any role — the account is created inactive (approvalStatus=pending) and cannot log in until a Club Manager approves it via PATCH /users/{id}/approval. No token is returned.',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['name', 'email', 'password', 'role'], properties: { name: { type: 'string' }, email: { type: 'string' }, password: { type: 'string' }, phone: { type: 'string' }, role: { type: 'string', enum: ['head_trainer', 'veterinarian', 'groom', 'owner', 'manager'], description: 'Requested role — a request, not an entitlement: the Manager can change it when approving.' } } } } },
        },
        responses: { 201: responses[201]({ type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } }), 400: responses[400], 409: responses[409] },
      },
    },
    '/auth/change-password': {
      put: {
        tags: ['Auth'],
        summary: 'Change your own password',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string', minLength: 6 } } } } } },
        responses: { 200: responses[200]({ nullable: true }), 400: responses[400], 401: responses[401] },
      },
    },
    '/auth/profile': {
      put: {
        tags: ['Auth'],
        summary: 'Edit your own name, phone and avatar (email and role are set by the Club Manager)',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, avatarUrl: { type: 'string', description: 'A URL returned by POST /uploads; empty string removes it' } } } } } },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/User' }), 400: responses[400], 401: responses[401] },
      },
    },
    '/uploads': {
      post: {
        tags: ['Files'],
        summary: 'Upload up to 5 files (images or PDF, 10 MB each) — any signed-in user',
        description: 'Files are stored in MongoDB GridFS (they survive redeploys). Returns each file\'s url (relative to the API host) to put on a record — avatar, attachment, etc.',
        requestBody: {
  required: true,
  content: {
    'multipart/form-data': {
      schema: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: {
              type: 'string',
              format: 'binary'
            },
            description: 'Up to 5 files'
          }
        }
      }
    }
  }
},
        responses: { 200: responses[200]({ type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, url: { type: 'string' }, name: { type: 'string' }, contentType: { type: 'string' }, size: { type: 'number' } } } }), 400: responses[400], 401: responses[401] },
      },
    },
    '/files/{id}': {
      get: {
        tags: ['Files'],
        summary: 'Download a stored file (no login; the signed URL from upload is required)',
        security: [],
        parameters: [idParam('id'), { name: 's', in: 'query', required: true, schema: { type: 'string' }, description: 'Signature included in the URL returned at upload' }],
        responses: { 200: { description: 'The file' }, 403: responses[403], 404: responses[404] },
      },
    },
    '/auth/me': {
      get: { tags: ['Auth'], summary: 'Current authenticated user', responses: { 200: responses[200]({ $ref: '#/components/schemas/User' }), 401: responses[401] } },
    },
    '/users': {
      get: {
        tags: ['Users (Manager)'],
        summary: 'List users (Manager or Head Trainer — the latter needs this to look up Groom staff for task assignment)',
        parameters: [
          { name: 'role', in: 'query', schema: { type: 'string' } },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
          { name: 'approvalStatus', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected'] }, description: 'Filter self-registrations awaiting a decision.' },
        ],
        responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/User' } }), 403: responses[403] },
      },
      post: {
        tags: ['Users (Manager)'],
        summary: 'Create a user (assign role — this is the RBAC provisioning surface)',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'email', 'password', 'role'], properties: { name: { type: 'string' }, email: { type: 'string' }, password: { type: 'string' }, role: { type: 'string' }, phone: { type: 'string' } } } } } },
        responses: { 201: responses[201]({ $ref: '#/components/schemas/User' }), 403: responses[403], 409: responses[409] },
      },
    },
    '/users/{id}': {
      get: { tags: ['Users (Manager)'], summary: 'Get user by id', parameters: [idParam('id')], responses: { 200: responses[200]({ $ref: '#/components/schemas/User' }), 404: responses[404] } },
      put: {
        tags: ['Users (Manager)'],
        summary: 'Update user (profile, role, isActive, or reset password)',
        parameters: [idParam('id')],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, role: { type: 'string' }, isActive: { type: 'boolean' }, password: { type: 'string' } } } } } },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/User' }), 404: responses[404] },
      },
      delete: { tags: ['Users (Manager)'], summary: 'Deactivate user (soft delete)', parameters: [idParam('id')], responses: { 200: responses[200]({ $ref: '#/components/schemas/User' }), 404: responses[404] } },
    },
    '/users/{id}/approval': {
      patch: {
        tags: ['Users (Manager)'],
        summary: 'Approve or reject a self-registered account (Manager only). Approving is what actually lets the person log in; the Manager may correct the role they requested.',
        parameters: [idParam('id')],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['approve'], properties: { approve: { type: 'boolean' }, role: { type: 'string', description: 'Optional override of the requested role, applied when approving.' } } } } },
        },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/User' }), 400: responses[400], 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/horses': {
      get: {
        tags: ['Horses'],
        summary: 'List horses (Owner: only their own; Head Trainer/Vet: only horses assigned to them plus any not yet assigned; Manager/Groom: all)',
        responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/Horse' } }) },
      },
      post: {
        tags: ['Horses'],
        summary: 'Create horse (Manager only)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Horse' } } } },
        responses: { 201: responses[201]({ $ref: '#/components/schemas/Horse' }), 403: responses[403] },
      },
    },
    '/horses/{id}': {
      get: { tags: ['Horses'], summary: 'Get horse by id', parameters: [idParam('id')], responses: { 200: responses[200]({ $ref: '#/components/schemas/Horse' }), 403: responses[403], 404: responses[404] } },
      put: { tags: ['Horses'], summary: 'Update horse (Manager only)', parameters: [idParam('id')], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Horse' } } } }, responses: { 200: responses[200]({ $ref: '#/components/schemas/Horse' }), 403: responses[403], 404: responses[404] } },
      delete: { tags: ['Horses'], summary: 'Delete horse (Manager only)', parameters: [idParam('id')], responses: { 200: responses[200]({ nullable: true }), 403: responses[403], 404: responses[404] } },
    },
    '/horses/{id}/archive': {
      patch: {
        tags: ['Horses'],
        summary: 'Stop managing a horse whose records must be kept (Manager)',
        description:
          'For a horse that can\'t be deleted (DELETE answers 409 with data.canArchive). Hides it from every working list, frees its stall, ' +
          'cancels booked sessions and open plans, withdraws future race entries and notifies the owner, trainer and vet. History stays. ' +
          'GET /horses?archived=true (Manager) lists archived horses.',
        parameters: [idParam('id')],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } } } },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/Horse' }), 400: responses[400], 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/horses/{id}/unarchive': {
      patch: {
        tags: ['Horses'],
        summary: 'Bring an archived horse back onto the working lists (Manager)',
        parameters: [idParam('id')],
        responses: { 200: responses[200]({ $ref: '#/components/schemas/Horse' }), 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/horses/{id}/lineage': {
      get: {
        tags: ['Horses'],
        summary: 'Pedigree tree: sire / dam, recursively (default 3 generations, max 4)',
        parameters: [idParam('id'), { name: 'generations', in: 'query', schema: { type: 'integer', default: 3, maximum: 4 } }],
        responses: { 200: responses[200]({ type: 'object', properties: { generations: { type: 'integer' }, tree: { type: 'object', description: '{ _id, name, breed, color, dob, achievements, sire, dam } — parents null when unknown' } } }), 403: responses[403], 404: responses[404] },
      },
    },
    '/horses/{id}/timeline': {
      get: {
        tags: ['Horses'],
        summary: 'Everything every role did to one horse, newest first',
        description:
          'Merges training sessions, exams, treatments and locks, completed care tasks with what the groom observed, ' +
          'incident reports, exam requests and race entries. Covers the last `days` days (default 14, max 90) plus ' +
          'sessions and races booked for the next 7. Same access rule as GET /horses/{id}.',
        parameters: [idParam('id'), { name: 'days', in: 'query', schema: { type: 'integer', default: 14, maximum: 90 } }],
        responses: {
          200: responses[200]({
            type: 'object',
            properties: {
              horse: { type: 'object' },
              from: { type: 'string', format: 'date-time' },
              to: { type: 'string', format: 'date-time' },
              days: { type: 'integer' },
              events: { type: 'array', items: { $ref: '#/components/schemas/TimelineEvent' } },
            },
          }),
          403: responses[403],
          404: responses[404],
        },
      },
    },
    '/horses/{id}/care-schedule': {
      patch: {
        tags: ['Horses'],
        summary: 'Set recurring vet care due-dates (Veterinarian only) — triggers automatic reminders when due',
        parameters: [idParam('id')],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  nextVaccinationDue: { type: 'string', format: 'date-time' },
                  nextDewormingDue: { type: 'string', format: 'date-time' },
                  nextFarrierDue: { type: 'string', format: 'date-time' },
                  nextExamDue: { type: 'string', format: 'date-time', description: 'Periodic check-up; the vet is reminded when due' },
                },
              },
            },
          },
        },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/Horse' }), 403: responses[403], 404: responses[404] },
      },
    },
    '/training/plans': {
      get: { tags: ['Training (Head Trainer)'], summary: 'List training plans', parameters: [horseQueryParam], responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/TrainingPlan' } }) } },
      post: { tags: ['Training (Head Trainer)'], summary: 'Create training plan', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TrainingPlan' } } } }, responses: { 201: responses[201]({ $ref: '#/components/schemas/TrainingPlan' }), 400: responses[400], 403: responses[403], 409: responses[409] } },
    },
    '/training/plans/suggest': {
      get: {
        tags: ['Training (Head Trainer)'],
        summary: 'Phases to propose for a new cycle, counted back from the race',
        description: 'Includes race week, followed by 2 weeks recovery. Base/strength/speed/peak shares depend on race distance: sprint <=1200 m 30/25/30/15%, middle <=2000 m 35/25/25/15%, long 45/25/15/15%. Short preparation keeps the last phases; without a race, proposes 4/3/3 weeks base/strength/speed. Each phase includes its normal AM/PM template. Returns error/warning advice for race alignment, phase order, short preparation and unusual distance.',
        parameters: [
          { name: 'horse', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'targetRace', in: 'query', schema: { type: 'string' } },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Today or later (400 otherwise)' },
          { name: 'distance', in: 'query', schema: { type: 'number' }, description: 'Race distance when no targetRace: decides the share (sprint ≤1200 / middle ≤2000 / long)' },
        ],
        responses: { 200: responses[200]({ type: 'object', properties: { startDate: { type: 'string' }, phases: { type: 'array', items: { type: 'object' } }, race: { type: 'object', nullable: true }, warnings: { type: 'array', items: { type: 'object', properties: { level: { type: 'string', enum: ['error', 'warning'] }, text: { type: 'string' } } } }, activePlan: { type: 'object', nullable: true } } }), 400: responses[400], 403: responses[403] },
      },
    },
    '/training/plans/{id}/generate-week': {
      post: {
        tags: ['Training (Head Trainer)'],
        summary: 'Book a week of the plan as scheduled sessions',
        description:
          'Requires an active plan. Morning entries use sessionTime and afternoon entries use afternoonTime in the club timezone. ' +
          'Eight days before the race, one morning trial over the race distance replaces that day\'s template. ' +
          'Skips past slots, slots already booked for this horse (including manual/other-plan sessions), dates outside the plan and race day. ' +
          'An elapsed morning is skipped while a future afternoon on the same day can still be booked. A locked/injured horse gets nothing (409); a recovering horse gets lighter work. ' +
          'Advisory readiness gates are checked when the session is started, not here. The groom gets one summary notification.',
        parameters: [idParam('id')],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { weekStart: { type: 'string', format: 'date', description: 'Any day of the week; default next week' } } } } } },
        responses: { 201: responses[201]({ type: 'object', properties: { weekStart: { type: 'string' }, created: { type: 'array', items: { $ref: '#/components/schemas/TrainingSession' } }, skipped: { type: 'array', items: { type: 'object' } } } }), 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/training/plans/{id}': {
      get: { tags: ['Training (Head Trainer)'], summary: 'Get training plan', parameters: [idParam('id')], responses: { 200: responses[200]({ $ref: '#/components/schemas/TrainingPlan' }), 404: responses[404] } },
      put: { tags: ['Training (Head Trainer)'], summary: 'Update training plan', parameters: [idParam('id')], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/TrainingPlan' } } } }, responses: { 200: responses[200]({ $ref: '#/components/schemas/TrainingPlan' }), 400: responses[400], 403: responses[403], 404: responses[404], 409: responses[409] } },
      delete: { tags: ['Training (Head Trainer)'], summary: 'Delete training plan', parameters: [idParam('id')], responses: { 200: responses[200]({ nullable: true }), 403: responses[403], 404: responses[404] } },
    },
    '/training/sessions': {
      get: {
        tags: ['Training (Head Trainer)'],
        summary: 'List training sessions',
        parameters: [horseQueryParam, { name: 'trainingPlan', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'sessionType', in: 'query', schema: { type: 'string', enum: ['training', 'trial_run'] } }],
        responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/TrainingSession' } }) },
      },
      post: {
        tags: ['Training (Head Trainer)'],
        summary: 'Create training session — runs the readiness gates first',
        description:
          'Refused with 409 when the medical gate is blocked (active training lock, or an injured/quarantined horse). ' +
          'Also refused with 409 when any advisory gate is amber and no `overrideReason` was supplied — the body then ' +
          'carries `{ readiness, requiresOverride: true }` so the client can show the warnings and ask for a reason. ' +
          'Resending with `overrideReason` creates the session, stores the readiness snapshot on it, writes an audit ' +
          'log entry, and notifies the Club Manager. ' +
          'The session is always created `scheduled`: a `status` in the body is ignored. Running a session is a ' +
          'separate step (`POST /training/sessions/{id}/start`), which is what switches the sensor feed on.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/TrainingSession' },
                  { type: 'object', properties: { overrideReason: { type: 'string', description: 'Required only when an advisory gate is amber' } } },
                ],
              },
            },
          },
        },
        responses: { 201: responses[201]({ $ref: '#/components/schemas/TrainingSession' }), 400: responses[400], 403: responses[403], 409: responses[409] },
      },
    },
    '/training/sessions/readiness': {
      get: {
        tags: ['Training (Head Trainer)'],
        summary: 'Is this horse fit to do this session? — the four-gate readiness board',
        description:
          'Open to every authenticated role so the vet, groom and owner screens can render the same answer. ' +
          'Scoped by horse assignment like the rest of the training module.',
        parameters: [
          { name: 'horse', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'scheduledAt', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Defaults to now' },
          { name: 'intensity', in: 'query', schema: { type: 'string', enum: ['light', 'moderate', 'high'] } },
          { name: 'sessionType', in: 'query', schema: { type: 'string', enum: ['training', 'trial_run'] } },
          { name: 'objective', in: 'query', schema: { type: 'string', enum: ['endurance', 'speed', 'interval', 'recovery', 'technique', 'race_simulation'] } },
        ],
        responses: { 200: responses[200]({ $ref: '#/components/schemas/Readiness' }), 403: responses[403], 404: responses[404] },
      },
    },
    '/training/sessions/{id}': {
      get: { tags: ['Training (Head Trainer)'], summary: 'Get training session', parameters: [idParam('id')], responses: { 200: responses[200]({ $ref: '#/components/schemas/TrainingSession' }), 404: responses[404] } },
      put: {
        tags: ['Training (Head Trainer)'], summary: 'Update a booking or move an unstarted session',
        description:
          'Sending only { scheduledAt } with no status moves a scheduled/ready/blocked session to a valid future time, resets it to scheduled, ' +
          'and clears readiness/blockedReason so a fresh pre-check is required. A concurrent start or booking change returns 409. ' +
          'Other booking edits (kind, sessionType, objective, intensity, prescription, coachNote, assignedTo) require scheduled status. ' +
          'Bare body status may request only cancelled (a booking that never ran; optional cancelReason). A running session is stopped with /abort, ended with /end; ready, blocked, in_progress, completed, aborted, evaluated and missed are server-owned.',
        parameters: [idParam('id')],
        requestBody: { content: { 'application/json': { schema: { allOf: [
          { $ref: '#/components/schemas/TrainingSession' },
          { type: 'object', properties: { status: { type: 'string', enum: ['cancelled'] }, cancelReason: { type: 'string' } } },
        ] }, examples: { moveTime: { summary: 'Move an unstarted booking and invalidate its pre-check', value: { scheduledAt: '2030-01-07T08:00:00+07:00' } } } } } },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/TrainingSession' }), 400: responses[400], 403: responses[403], 404: responses[404], 409: responses[409] },
      },
      delete: { tags: ['Training (Head Trainer)'], summary: 'Delete training session', description: 'Only a scheduled (never pre-checked) or cancelled session that was not rebooked; anything pre-checked, run or missed is training history (409).', parameters: [idParam('id')], responses: { 200: responses[200]({ nullable: true }), 404: responses[404], 409: responses[409] } },
    },
    '/training/sessions/{id}/pre-check': {
      post: {
        tags: ['Training (Head Trainer)'],
        summary: 'Pre-check: the trainer looks at the horse and the readiness gates re-run for now',
        description:
          'Moves a `scheduled` (or `blocked`) session to `ready`, or refreshes an existing ready session\'s check. Only allowed from 60 minutes before to 30 minutes after ' +
          '`scheduledAt`. `confirmed: true` is required: the trainer says the horse was seen. A medical block (vet lock, ' +
          'injury) makes the session `blocked` and answers 409 `READINESS_BLOCKED`; pre-check again once it is lifted. An ' +
          'amber gate answers 409 with `requiresOverride` until an `overrideReason` is sent (audited, the Manager is told). ' +
          'Other 409 codes: `INVALID_TRANSITION` (wrong status), `OUTSIDE_PRECHECK_WINDOW` (with `opensAt`/`closesAt`). ' +
          'The gates are judged at the booked time (or now, once it has passed). A bodyTempC of 38.6 °C or more is a fever: the session ' +
          'becomes `blocked` with the temperature on record and the vet gets a high-priority exam request (unless one is pending).',
        parameters: [idParam('id')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['confirmed'],
                properties: {
                  confirmed: { type: 'boolean', description: 'Must be true' },
                  overrideReason: { type: 'string', description: 'Required only when a gate is amber' },
                  bodyTempC: { type: 'number', description: 'Optional, 30-45; from 38.6 the session is blocked (fever)' },
                  trackCondition: { type: 'string' },
                  weather: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/TrainingSession' }), 400: responses[400], 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/training/sessions/{id}/reschedule': {
      post: {
        tags: ['Training (Head Trainer)'],
        summary: 'Book a missed session again at a new time',
        description: 'Only for status missed (set by the server after the pre-check window closes, or a ready pre-check expires after 2 h without a start; the watcher checks every 5 min). Requires a valid future scheduledAt, an existing plan not completed/cancelled and no current medical block. Creates one new scheduled session with the same work requiring a fresh pre-check; the missed original remains history and points to it through rescheduledTo. Duplicate or concurrent rebooking returns 409.',
        parameters: [idParam('id')],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['scheduledAt'], properties: { scheduledAt: { type: 'string', format: 'date-time' } } } } } },
        responses: { 201: responses[201]({ $ref: '#/components/schemas/TrainingSession' }), 400: responses[400], 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/training/sessions/{id}/start': {
      post: {
        tags: ['Training (Head Trainer)'],
        summary: 'Start a session now: only from ready, server stamps actualStartAt',
        description:
          'Moves a `ready` session to `in_progress`, sets `actualStartAt` to the server time and is what turns the sensor ' +
          'feed on. Refused with 409: `NOT_READY` (scheduled/blocked: do the pre-check first), `PRECHECK_EXPIRED` (pre-check ' +
          'older than 2 hours), `ANOTHER_SESSION_RUNNING` (the horse already has a running session), `READINESS_BLOCKED` ' +
          '(the horse is locked or injured now; the session becomes `blocked`), `INVALID_TRANSITION` (any other status, or ' +
          'started by someone else a moment earlier). A caution gate (e.g. fed twenty minutes ago) returns 409 with ' +
          '`{ readiness, requiresOverride: true }` until `overrideReason` is sent. In_progress can no longer be set through ' +
          'PUT or the evaluation endpoint.',
        parameters: [idParam('id')],
        requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', properties: { overrideReason: { type: 'string' } } } } } },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/TrainingSession' }), 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/training/sessions/{id}/end': {
      post: {
        tags: ['Training (Head Trainer)'],
        summary: 'End a running session (in_progress → completed)',
        description:
          'Claims in_progress atomically: a second call, a retry or the simulator finishing at the same time gets 409 and changes nothing. ' +
          'actualEndAt is the server time of the call and actualDurationSec = actualEndAt − actualStartAt (the simulator keeps its compressed work in simulatedWorkSec). ' +
          'Computes outcome against the prescription; for a hard session (high intensity or race simulation) creates icing (+15 min) and bathing (+45 min) tasks for the groom; ' +
          'raises a high-priority exam request when the average heart rate is 10% or more over the limit; notifies the owner. ' +
          '`metrics` (measured by hand) is accepted only when the sensor never reported on this run (400 otherwise).',
        parameters: [idParam('id')],
        requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', properties: { metrics: { type: 'object', properties: { distance: { type: 'number' }, maxSpeed: { type: 'number' }, avgHeartRate: { type: 'number' } } } } } } } },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/TrainingSession' }), 400: responses[400], 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/training/sessions/{id}/abort': {
      post: {
        tags: ['Training (Head Trainer)'],
        summary: 'Stop a running session part-way (in_progress → aborted)',
        description:
          'category (health, injury, behaviour, weather, equipment, other) and reason are required. Atomic like /end. Keeps the metrics measured so far and records the real end time. ' +
          'No care-after-work tasks. The owner is notified; health/injury also opens a high-priority exam request (unless one is pending). ' +
          'The system uses two more categories itself: medical_lock (a vet lock or lower training level landing while the session runs) and horse_left (archived horse).',
        parameters: [idParam('id')],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['category', 'reason'], properties: { category: { type: 'string', enum: ['health', 'injury', 'behaviour', 'weather', 'equipment', 'other'] }, reason: { type: 'string' } } } } } },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/TrainingSession' }), 400: responses[400], 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/training/sessions/{id}/evaluation': {
      patch: {
        tags: ['Training (Head Trainer)'],
        summary: "File the trainer's evaluation of a completed run (completed → evaluated)",
        description:
          'Only for completed or evaluated sessions (409 otherwise). Accepts performanceRating (integer 1–10), trainerComment and videoUrl only; ' +
          'metrics and status are refused (400) — what was measured is recorded when the run closes. Filing it again on an evaluated session is a correction: ' +
          'the audit entry trainingSession.evaluation_corrected keeps the old and new values.',
        parameters: [idParam('id')],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { performanceRating: { type: 'integer', minimum: 1, maximum: 10 }, trainerComment: { type: 'string' }, videoUrl: { type: 'string', description: 'http(s) link; empty string clears it' } } } } } },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/TrainingSession' }), 400: responses[400], 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/health/records': {
      get: { tags: ['Health (Veterinarian)'], summary: 'List health records', parameters: [horseQueryParam], responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/HealthRecord' } }) } },
      post: {
        tags: ['Health (Veterinarian)'],
        summary: 'Create health record (also updates Horse.healthStatus)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthRecord' } } } },
        responses: { 201: responses[201]({ $ref: '#/components/schemas/HealthRecord' }), 403: responses[403] },
      },
    },
    '/health/records/{id}/attachments': {
      post: {
        tags: ['Health (Veterinarian)'],
        summary: 'Attach files to an exam record (Veterinarian) — images or PDF, max 10 per record',
        parameters: [idParam('id')],
        requestBody: {
  required: true,
  content: {
    'multipart/form-data': {
      schema: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: {
              type: 'string',
              format: 'binary'
            },
            description: 'Up to 5 files per request'
          }
        }
      }
    }
  }
},
        responses: { 200: responses[200]({ $ref: '#/components/schemas/HealthRecord' }), 400: responses[400], 403: responses[403], 404: responses[404] },
      },
    },
    '/health/records/{id}/attachments/{attachmentId}': {
      delete: {
        tags: ['Health (Veterinarian)'],
        summary: 'Remove an attachment (Veterinarian) — the stored file is deleted too',
        parameters: [idParam('id'), idParam('attachmentId')],
        responses: { 200: responses[200]({ $ref: '#/components/schemas/HealthRecord' }), 403: responses[403], 404: responses[404] },
      },
    },
    '/health/records/{id}': {
      get: { tags: ['Health (Veterinarian)'], summary: 'Get health record', parameters: [idParam('id')], responses: { 200: responses[200]({ $ref: '#/components/schemas/HealthRecord' }), 404: responses[404] } },
      put: { tags: ['Health (Veterinarian)'], summary: 'Update health record', parameters: [idParam('id')], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthRecord' } } } }, responses: { 200: responses[200]({ $ref: '#/components/schemas/HealthRecord' }), 404: responses[404] } },
    },
    '/health/exam-requests': {
      post: {
        tags: ['Health (Veterinarian)'],
        summary: 'Head Trainer/Manager flags a horse for a vet check-up (Head Trainer, Manager only) — pushes a notification to the assigned vet, or the whole Veterinarian role if unassigned; does not create a HealthRecord',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['horse'],
                properties: {
                  horse: { type: 'string' },
                  reason: { type: 'string' },
                  priority: { type: 'string', enum: ['normal', 'high', 'urgent'], default: 'normal' },
                },
              },
            },
          },
        },
        responses: { 200: responses[200]({ nullable: true }), 403: responses[403], 404: responses[404] },
      },
      get: {
        tags: ['Health (Veterinarian)'],
        summary: 'Exam requests with their status — the vet\'s queue, or the requests a trainer sent',
        description:
          'Veterinarian: requests for the horses assigned to them. Head Trainer: the requests they sent, so they can ' +
          'see whether and how each was answered. Manager: all. Filing a health record for a horse closes its pending ' +
          'requests (status done, healthRecord set) and notifies each requester of the conclusion.',
        parameters: [horseQueryParam, { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'done', 'cancelled'] } }],
        responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/ExamRequest' } }), 403: responses[403] },
      },
    },
    '/health/exam-requests/{id}': {
      patch: {
        tags: ['Health (Veterinarian)'],
        summary: 'Close a request without filing an exam (Veterinarian)',
        parameters: [idParam('id')],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['done', 'cancelled'] }, note: { type: 'string' } } } } } },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/ExamRequest' }), 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/health/clearances': {
      get: {
        tags: ['Health (Veterinarian)'],
        summary: 'Which horses are overdue a check-up',
        description:
          'A hard training session requires an exam from within `clearanceDays`; these are the horses that would fail ' +
          'that gate. Sorted worst first (never examined, then expired, then due soon). Scoped by horse assignment. ' +
          'Returns only horses needing an exam unless ?all=true.',
        responses: {
          200: responses[200]({
            type: 'array',
            items: {
              type: 'object',
              properties: {
                horse: { $ref: '#/components/schemas/Horse' },
                lastExam: { $ref: '#/components/schemas/HealthRecord' },
                ageDays: { type: 'integer', nullable: true },
                status: { type: 'string', enum: ['never', 'expired', 'due_soon', 'valid'] },
                validUntil: { type: 'string', format: 'date-time', nullable: true },
                clearanceDays: { type: 'integer', example: 14 },
              },
            },
          }),
        },
      },
    },
    '/health/care-orders': {
      get: {
        tags: ['Health (Veterinarian)'],
        summary: "The vet's care orders and one day's progress on them",
        description:
          'Ongoing treatments with medications or careInstructions, each with that day\'s care tasks (populated assignedTo / ' +
          'skippedBy, with `timing`) and `progress` { total, done, notDone, missed, acknowledged, waiting }. Scoped by horse ' +
          'like the treatments list — used by the trainer and manager dashboards; the vet and owner can use it too.',
        parameters: [horseQueryParam, { name: 'date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Defaults to today' }],
        responses: { 200: responses[200]({ type: 'array', items: { type: 'object' } }), 400: responses[400] },
      },
    },
    '/health/treatments': {
      get: {
        tags: ['Health (Veterinarian)'],
        summary: 'List treatments — filter by isTrainingLocked/status to find horses currently under an active lock',
        parameters: [horseQueryParam, { name: 'isTrainingLocked', in: 'query', schema: { type: 'boolean' } }, { name: 'status', in: 'query', schema: { type: 'string', enum: ['ongoing', 'completed'] } }],
        responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/Treatment' } }) },
      },
      post: { tags: ['Health (Veterinarian)'], summary: 'Create treatment (optionally with isTrainingLocked)', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Treatment' } } } }, responses: { 201: responses[201]({ $ref: '#/components/schemas/Treatment' }), 403: responses[403] } },
    },
    '/health/treatments/{id}': {
      get: { tags: ['Health (Veterinarian)'], summary: 'Get treatment', parameters: [idParam('id')], responses: { 200: responses[200]({ $ref: '#/components/schemas/Treatment' }), 404: responses[404] } },
      put: { tags: ['Health (Veterinarian)'], summary: 'Update treatment', parameters: [idParam('id')], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Treatment' } } } }, responses: { 200: responses[200]({ $ref: '#/components/schemas/Treatment' }), 404: responses[404] } },
    },
    '/health/treatments/{id}/lock-training': {
      post: {
        tags: ['Health (Veterinarian)'],
        summary: 'Emergency: set or lift the training-lock order for a horse',
        parameters: [idParam('id')],
        description: 'Send { trainingLevel } to set the recovery level (none / light / moderate / high), or the older { isTrainingLocked }. The trainer, the groom and the owner are told; lowering cancels booked sessions above the level.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { trainingLevel: { type: 'string', enum: ['none', 'light', 'moderate', 'high'] }, isTrainingLocked: { type: 'boolean' }, lockReason: { type: 'string' } } } } } },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/Treatment' }), 400: responses[400], 404: responses[404] },
      },
    },
    '/health/injury-markers': {
      get: { tags: ['Health (Veterinarian)'], summary: 'List injury markers (2D placeholder for a future 3D viewer)', parameters: [horseQueryParam], responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/InjuryMarker' } }) } },
      post: { tags: ['Health (Veterinarian)'], summary: 'Create injury marker', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/InjuryMarker' } } } }, responses: { 201: responses[201]({ $ref: '#/components/schemas/InjuryMarker' }), 403: responses[403] } },
    },
    '/health/injury-markers/{id}': {
      put: { tags: ['Health (Veterinarian)'], summary: 'Update injury marker (e.g. recoveryStatus)', parameters: [idParam('id')], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/InjuryMarker' } } } }, responses: { 200: responses[200]({ $ref: '#/components/schemas/InjuryMarker' }), 404: responses[404] } },
      delete: { tags: ['Health (Veterinarian)'], summary: 'Delete injury marker — for one placed on the wrong body part, which previously could only be edited, never removed', parameters: [idParam('id')], responses: { 200: responses[200]({ nullable: true }), 403: responses[403], 404: responses[404] } },
    },
    '/stable/tasks': {
      get: {
        tags: ['Stable (Groom)'],
        summary: 'List daily tasks (Groom implicitly filtered to their own unless assignedTo is passed)',
        parameters: [horseQueryParam, { name: 'assignedTo', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'date', in: 'query', schema: { type: 'string', format: 'date' } }],
        responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/DailyTask' } }) },
      },
      post: { tags: ['Stable (Groom)'], summary: 'Assign a daily task (Head Trainer / Manager)', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/DailyTask' } } } }, responses: { 201: responses[201]({ $ref: '#/components/schemas/DailyTask' }), 403: responses[403] } },
    },
    '/stable/tasks/{id}': {
      get: { tags: ['Stable (Groom)'], summary: 'Get daily task', parameters: [idParam('id')], responses: { 200: responses[200]({ $ref: '#/components/schemas/DailyTask' }), 404: responses[404] } },
      put: {
        tags: ['Stable (Groom)'],
        summary: 'Edit an assigned task — reassign to another Groom, move the date, or correct the type (Head Trainer / Manager). Refused with 409 once the task is completed.',
        parameters: [idParam('id')],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { horse: { type: 'string' }, assignedTo: { type: 'string' }, taskType: { type: 'string', enum: ['feeding', 'cleaning', 'bathing', 'icing', 'other'] }, scheduledDate: { type: 'string', format: 'date-time', description: 'Day of the job' }, dueTime: { type: 'string', example: '09:30', description: 'Required for every type but feeding (whose time is its mealSlot)' }, mealSlot: { type: 'string', enum: ['morning', 'noon', 'evening'] }, note: { type: 'string', description: 'Required for "other": what the job is' } } } } } },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/DailyTask' }), 403: responses[403], 404: responses[404], 409: responses[409] },
      },
      delete: {
        tags: ['Stable (Groom)'],
        summary: 'Cancel an assigned task (Head Trainer / Manager). Completed tasks are kept — deleting one would erase the record that the work was done — so those return 409.',
        parameters: [idParam('id')],
        responses: { 200: responses[200]({ nullable: true }), 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/stable/tasks/{id}/acknowledge': {
      patch: {
        tags: ['Stable (Groom)'],
        summary: 'Take a task on (Groom) — idempotent',
        description: "Sets acknowledgedAt, so the trainer, manager and vet see the order was picked up before it is done. 409 if it is already done or its window is missed.",
        parameters: [idParam('id')],
        responses: { 200: responses[200]({ $ref: '#/components/schemas/DailyTask' }), 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/stable/tasks/{id}/not-done': {
      patch: {
        tags: ['Stable (Groom)'],
        summary: 'Report that a task could not be done, with the reason (Groom)',
        description:
          'Status becomes skipped with skipReason / skippedBy. For a vet care order (source vet) the vet and trainer are notified; ' +
          'otherwise the trainer.',
        parameters: [idParam('id')],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } } } },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/DailyTask' }), 400: responses[400], 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/stable/tasks/{id}/complete': {
      patch: {
        tags: ['Stable (Groom)'],
        summary: 'Mark task completed, optionally recording what was observed (Groom)',
        description:
          'The body is entirely optional — sending none behaves exactly as before. When supplied, the observation is ' +
          "what the training readiness nutrition gate reads to decide whether the horse is fit to work, since the groom " +
          'is the only person who sees it eat. `appetite: "refused"` additionally notifies the horse\'s assigned vet, ' +
          'because a horse going off its feed is an early sign of illness.',
        parameters: [idParam('id')],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  appetite: { type: 'string', description: 'full | partial | refused, or the groom screen labels (Bình thường, Tốt, Kém, Bỏ ăn)' },
                  amountEatenPercent: { type: 'number', minimum: 0, maximum: 100 },
                  manure: { type: 'string', description: 'normal | dry | loose | none, or the Vietnamese labels' },
                  waterIntake: { type: 'string', description: 'normal | high | low, or the Vietnamese labels' },
                  behaviourNote: { type: 'string' },
                  observation: { type: 'object', description: 'The same fields may instead be nested here' },
                  notes: { type: 'string', description: 'Alias of behaviourNote' },
                },
              },
            },
          },
        },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/DailyTask' }), 403: responses[403], 404: responses[404] },
      },
    },
    '/stable/tasks/{id}/incident': {
      post: {
        tags: ['Stable (Groom)'],
        summary: 'Report an incident with optional photo evidence (Groom)',
        description: "Opens the report (status open) and notifies the horse's vet and trainer.",
        parameters: [idParam('id')],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: { type: 'object', properties: { description: { type: 'string' }, severity: { type: 'string', enum: ['low', 'medium', 'high'] }, images: { type: 'array', items: { type: 'string', format: 'binary' }, description: 'Up to 5 images' } } },
            },
          },
        },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/DailyTask' }), 403: responses[403], 404: responses[404] },
      },
    },
    '/stable/my-care-plan': {
      get: {
        tags: ['Stable (Groom)'],
        summary: 'Per horse: rations and prescriptions with the stock behind each, and what is short',
        description:
          'Groom: the horses they look after. Other roles: the horses they can see (?horse= narrows). Each sheet: horse, stall, ' +
          'trainingClearance, rations [{ mealTime, timeOfDay, items: [{ name, amount, unit, stock, enough }] }], prescriptions ' +
          '[{ prescribedBy, trainingLevel, careInstructions, medications: [{ name, dosage, amount, times, stock, enough, dailyNeed }] }], ' +
          'shortages [{ name, needed, available, short, unit }] for one day.',
        parameters: [horseQueryParam],
        responses: { 200: responses[200]({ type: 'array', items: { type: 'object' } }) },
      },
    },
    '/stable/incidents': {
      get: {
        tags: ['Stable (Groom)'],
        summary: 'Incident reports as a working list',
        description:
          'Returns the DailyTasks that carry an incident report, newest report first. Veterinarian and Head Trainer: ' +
          'reports on the horses assigned to them. Groom: the ones they filed. Owner: their own horses. Manager: all. ' +
          'An unresolved medium/high report from the last 3 days turns the training readiness `medical` gate amber.',
        parameters: [
          horseQueryParam,
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'acknowledged', 'resolved', 'unresolved'] }, description: '`unresolved` = everything still waiting on a vet' },
        ],
        responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/DailyTask' } }) },
      },
    },
    '/stable/incidents/{id}': {
      patch: {
        tags: ['Stable (Groom)'],
        summary: "The vet's answer to an incident report (Veterinarian)",
        description:
          '`id` is the DailyTask id. `acknowledged` = seen, being looked at; `resolved` needs a `response`. The groom who ' +
          "reported it and the horse's trainer are notified. Filing a health record for the horse resolves its open " +
          'reports automatically.',
        parameters: [idParam('id')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { status: { type: 'string', enum: ['acknowledged', 'resolved'], default: 'resolved' }, response: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/DailyTask' }), 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/stable/assignments': {
      get: { tags: ['Stable (Groom)'], summary: 'List stable/stall assignments', responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/StableAssignment' } }) } },
      post: { tags: ['Stable (Groom)'], summary: 'Create/update stall assignment for a horse (Manager, Head Trainer)', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/StableAssignment' } } } }, responses: { 201: responses[201]({ $ref: '#/components/schemas/StableAssignment' }), 403: responses[403] } },
    },
    '/stable/assignments/{id}': {
      delete: { tags: ['Stable (Groom)'], summary: 'Remove stall assignment (Manager)', parameters: [idParam('id')], responses: { 200: responses[200]({ nullable: true }), 403: responses[403], 404: responses[404] } },
    },
    '/feeding': {
      get: { tags: ['Feeding (scaffold)'], summary: 'List feeding schedules', parameters: [horseQueryParam], responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/FeedingSchedule' } }) } },
      post: { tags: ['Feeding (scaffold)'], summary: 'Create feeding schedule (Head Trainer, Manager)', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/FeedingSchedule' } } } }, responses: { 201: responses[201]({ $ref: '#/components/schemas/FeedingSchedule' }), 403: responses[403] } },
    },
    '/feeding/{id}': {
      get: { tags: ['Feeding (scaffold)'], summary: 'Get feeding schedule', parameters: [idParam('id')], responses: { 200: responses[200]({ $ref: '#/components/schemas/FeedingSchedule' }), 404: responses[404] } },
      put: { tags: ['Feeding (scaffold)'], summary: 'Update feeding schedule (Head Trainer, Manager)', parameters: [idParam('id')], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/FeedingSchedule' } } } }, responses: { 200: responses[200]({ $ref: '#/components/schemas/FeedingSchedule' }), 404: responses[404] } },
      delete: { tags: ['Feeding (scaffold)'], summary: 'Delete feeding schedule (Manager)', parameters: [idParam('id')], responses: { 200: responses[200]({ nullable: true }), 404: responses[404] } },
    },
    '/inventory': {
      get: { tags: ['Inventory (scaffold)'], summary: 'List inventory items', responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/InventoryItem' } }) } },
      post: { tags: ['Inventory (scaffold)'], summary: 'Create inventory item (Manager)', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/InventoryItem' } } } }, responses: { 201: responses[201]({ $ref: '#/components/schemas/InventoryItem' }), 403: responses[403] } },
    },
    '/inventory/{id}': {
      get: { tags: ['Inventory (scaffold)'], summary: 'Get inventory item', parameters: [idParam('id')], responses: { 200: responses[200]({ $ref: '#/components/schemas/InventoryItem' }), 404: responses[404] } },
      put: { tags: ['Inventory (scaffold)'], summary: 'Update inventory item (Manager)', parameters: [idParam('id')], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/InventoryItem' } } } }, responses: { 200: responses[200]({ $ref: '#/components/schemas/InventoryItem' }), 404: responses[404] } },
      delete: { tags: ['Inventory (scaffold)'], summary: 'Delete inventory item (Manager)', parameters: [idParam('id')], responses: { 200: responses[200]({ nullable: true }), 404: responses[404] } },
    },
    '/inventory/{id}/restock-request': {
      post: { tags: ['Inventory (scaffold)'], summary: 'Request a restock (Groom, Head Trainer, Veterinarian) — the Manager is notified', parameters: [idParam('id')], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['quantity'], properties: { quantity: { type: 'number', minimum: 1 }, packs: { type: 'number', description: 'Alternative to quantity for items with a pack size' }, note: { type: 'string' }, task: { type: 'string', description: 'The meal/dose task this shortage is blocking — the Manager is told, and the groom is told when it is approved' } } } } } }, responses: { 200: responses[200]({ $ref: '#/components/schemas/InventoryItem' }), 400: responses[400], 404: responses[404] } },
    },
    '/inventory/{id}/receive': {
      post: {
        tags: ['Inventory (scaffold)'],
        summary: 'Record a delivery by quantity (in the item unit) or by packs (Manager)',
        parameters: [idParam('id')],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { quantity: { type: 'number' }, packs: { type: 'number' }, note: { type: 'string' } } } } } },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/InventoryItem' }), 400: responses[400], 403: responses[403], 404: responses[404] },
      },
    },
    '/inventory/forecast': {
      get: {
        tags: ['Inventory (scaffold)'],
        summary: 'Daily use of each stock item from rations and ongoing treatments, and days of stock left',
        responses: { 200: responses[200]({ type: 'array', items: { type: 'object', properties: { _id: { type: 'string' }, name: { type: 'string' }, unit: { type: 'string' }, quantity: { type: 'number' }, dailyUsage: { type: 'number' }, daysLeft: { type: 'integer', nullable: true }, usedBy: { type: 'array', items: { type: 'object' } } } } }) },
      },
    },
    '/inventory/proposals': {
      post: {
        tags: ['Inventory (scaffold)'],
        summary: 'Propose a new item that is not in the stock list yet (Groom, Head Trainer, Veterinarian)',
        description:
          'Creates the item as a proposal (isProposed, quantity 0) carrying one restock request; the Manager is notified. ' +
          'Approving that request (PATCH /inventory/{id}/restock-requests/{reqId}) makes it a regular item with the requested ' +
          'quantity; rejecting it removes the item. A name already in the list (case-insensitive) → 409 with data.itemId.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'category', 'unit', 'quantity'],
                properties: {
                  name: { type: 'string' },
                  category: { type: 'string', enum: ['feed', 'medicine', 'equipment'] },
                  unit: { type: 'string' },
                  quantity: { type: 'number', minimum: 1 },
                  note: { type: 'string' },
                  stableBlock: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/InventoryItem' }), 400: responses[400], 403: responses[403], 409: responses[409] },
      },
    },
    '/inventory/{id}/restock-requests/{reqId}': {
      patch: {
        tags: ['Inventory (scaffold)'],
        summary: 'Approve or reject a pending restock request (Manager) — approving adds the quantity to stock',
        parameters: [idParam('id'), idParam('reqId', 'The restockRequests sub-document id')],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['approved', 'rejected'] }, note: { type: 'string', description: 'Shown to the requester' } } } } },
        },
        description: 'Records who reviewed it. Approving a proposed item turns it into a regular item; rejecting a proposal with nothing else pending deletes it (data: null).',
        responses: { 200: responses[200]({ $ref: '#/components/schemas/InventoryItem' }), 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/races': {
      get: { tags: ['Races (scaffold)'], summary: 'List race entries', responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/RaceEntry' } }) } },
      post: { tags: ['Races (scaffold)'], summary: 'Register a horse for a race (Head Trainer) — 409 if the vet has grounded the horse (training lock, injured, quarantined)', description: 'Writable fields: horse, raceName, raceDate (today or later), distance (required, 400-6000 m), venue, surface, status. Results go through PATCH /races/{id}/results (400 otherwise).', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/RaceEntry' } } } }, responses: { 201: responses[201]({ $ref: '#/components/schemas/RaceEntry' }), 403: responses[403] } },
    },
    '/races/{id}/results': {
      patch: {
        tags: ['Races (scaffold)'],
        summary: 'Record the result: placing, time, prize money (Head Trainer, Manager)',
        description:
          'Refused (409) before race day or for a withdrawn entry. Completes the entry, builds `result` from placing and ' +
          'time when none is typed, updates the horse\'s achievements, and turns prizeMoney into one revenue record ' +
          '(category prize) linked to the entry — updated on correction, removed when set to 0. The owner is notified.',
        parameters: [idParam('id')],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { position: { type: 'integer', minimum: 1 }, finishTime: { type: 'string' }, prizeMoney: { type: 'number', minimum: 0 }, result: { type: 'string' } } } } } },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/RaceEntry' }), 400: responses[400], 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/races/{id}': {
      get: { tags: ['Races (scaffold)'], summary: 'Get race entry', parameters: [idParam('id')], responses: { 200: responses[200]({ $ref: '#/components/schemas/RaceEntry' }), 404: responses[404] } },
      put: { tags: ['Races (scaffold)'], summary: 'Update race entry (Head Trainer)', parameters: [idParam('id')], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/RaceEntry' } } } }, responses: { 200: responses[200]({ $ref: '#/components/schemas/RaceEntry' }), 404: responses[404] } },
      delete: { tags: ['Races (scaffold)'], summary: 'Delete race entry (Head Trainer, Manager)', parameters: [idParam('id')], responses: { 200: responses[200]({ nullable: true }), 404: responses[404] } },
    },
    '/finance/mine/summary': {
      get: {
        tags: ['Finance (scaffold)'],
        summary: "Owner's periodic statement: cost, medical and revenue per month or quarter",
        description:
          'Totals for the owner\'s horses over one year: `periods` (12 months or 4 quarters, each with cost, revenue, net, ' +
          'medicalCost, exams, treatments, byCategory), `byHorse`, `byCategory` and `totals`. medicalCost is spending in ' +
          'the "medical" category; exams / treatments count the health records and treatments in the period.',
        parameters: [
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['month', 'quarter'], default: 'month' } },
          { name: 'year', in: 'query', schema: { type: 'integer' }, description: 'Defaults to the current year' },
        ],
        responses: { 200: responses[200]({ type: 'object' }), 403: responses[403] },
      },
    },
    '/finance/mine': {
      get: { tags: ['Finance (scaffold)'], summary: "Owner's own cost/revenue records", responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/FinancialRecord' } }), 403: responses[403] } },
    },
    '/finance': {
      get: { tags: ['Finance (scaffold)'], summary: 'List all financial records (Manager)', responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/FinancialRecord' } }), 403: responses[403] } },
      post: { tags: ['Finance (scaffold)'], summary: 'Record a cost/revenue entry (Manager)', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/FinancialRecord' } } } }, responses: { 201: responses[201]({ $ref: '#/components/schemas/FinancialRecord' }), 403: responses[403] } },
    },
    '/finance/{id}': {
      get: { tags: ['Finance (scaffold)'], summary: 'Get financial record (Manager)', parameters: [idParam('id')], responses: { 200: responses[200]({ $ref: '#/components/schemas/FinancialRecord' }), 404: responses[404] } },
      put: { tags: ['Finance (scaffold)'], summary: 'Update financial record (Manager)', parameters: [idParam('id')], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/FinancialRecord' } } } }, responses: { 200: responses[200]({ $ref: '#/components/schemas/FinancialRecord' }), 404: responses[404] } },
      delete: { tags: ['Finance (scaffold)'], summary: 'Delete financial record (Manager)', parameters: [idParam('id')], responses: { 200: responses[200]({ nullable: true }), 404: responses[404] } },
    },
    '/notifications': {
      get: { tags: ['Notifications'], summary: 'List my notifications (addressed to me or to my role)', responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/Notification' } }) } },
    },
    '/notifications/read-all': {
      patch: { tags: ['Notifications'], summary: 'Mark all of my notifications as read', responses: { 200: responses[200]({ type: 'object', properties: { matched: { type: 'integer' } } }) } },
    },
    '/notifications/{id}/read': {
      patch: { tags: ['Notifications'], summary: 'Mark a notification as read', parameters: [idParam('id')], responses: { 200: responses[200]({ $ref: '#/components/schemas/Notification' }), 404: responses[404] } },
    },
    '/audit-logs': {
      get: {
        tags: ['Audit Log (Manager)'],
        summary: 'Paginated system audit trail',
        parameters: [{ name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }],
        responses: { 200: responses[200]({ type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/AuditLog' } }, total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' } } }), 403: responses[403] },
      },
    },
    // careCoordination in the response: incidents { reported, byStatus, avgHoursToResolve },
    // vetCareTasks { assigned, completed, pending }, autoExamRequests.
    '/reports/training-chart': {
      get: {
        tags: ['Reports (Manager)'],
        summary: 'Training progress per month, for charts (scoped: owner → own horses, trainer → assigned, manager → all)',
        parameters: [{ name: 'months', in: 'query', schema: { type: 'integer', default: 6, maximum: 24 } }, horseQueryParam],
        responses: { 200: responses[200]({ type: 'object', properties: { months: { type: 'array', items: { type: 'string', example: '2026-10' } }, totals: { type: 'array', items: { type: 'object', description: '{ month, sessions, avgRating, avgMaxSpeed, totalDistance, metTargets }' } }, series: { type: 'array', items: { type: 'object', description: '{ horse, points: [same shape as totals] }' } } } }) },
      },
    },
    '/reports/finance-chart': {
      get: {
        tags: ['Reports (Manager)'],
        summary: 'Club-wide cost / revenue / net per month or quarter (Manager)',
        parameters: [{ name: 'period', in: 'query', schema: { type: 'string', enum: ['month', 'quarter'] } }, { name: 'year', in: 'query', schema: { type: 'integer' } }],
        responses: { 200: responses[200]({ type: 'object', properties: { periods: { type: 'array', items: { type: 'object' } }, totals: { type: 'object' }, byCategory: { type: 'object' } } }), 403: responses[403] },
      },
    },
    '/export/finance': {
      get: {
        tags: ['Reports (Manager)'],
        summary: 'Download the financial ledger as CSV (Manager)',
        parameters: [{ name: 'from', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } }],
        responses: { 200: { description: 'text/csv (UTF-8 with BOM)' }, 403: responses[403] },
      },
    },
    '/export/horses': {
      get: {
        tags: ['Reports (Manager)'],
        summary: 'Download the horse roster with owners, staff and stalls as CSV (Manager)',
        responses: { 200: { description: 'text/csv (UTF-8 with BOM)' }, 403: responses[403] },
      },
    },
    '/reports/overview': {
      get: {
        tags: ['Reports (Manager)'],
        summary: 'Aggregated training performance, operating cost, and race revenue/participation report',
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Period start (ISO date), applied to session/finance/race dates' },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Period end (ISO date)' },
        ],
        responses: {
          200: responses[200]({
            type: 'object',
            properties: {
              period: { type: 'object', properties: { from: { type: 'string', nullable: true }, to: { type: 'string', nullable: true } } },
              trainingPerformance: {
                type: 'object',
                properties: {
                  totalSessions: { type: 'integer' },
                  sessionsByStatus: { type: 'object', additionalProperties: { type: 'integer' } },
                  avgPerformanceRating: { type: 'number', nullable: true },
                  ratedSessionCount: { type: 'integer' },
                },
              },
              operatingCost: {
                type: 'object',
                properties: { total: { type: 'number' }, byCategory: { type: 'array', items: { type: 'object', properties: { category: { type: 'string' }, total: { type: 'number' } } } } },
              },
              raceRevenue: {
                type: 'object',
                properties: { total: { type: 'number' }, byCategory: { type: 'array', items: { type: 'object', properties: { category: { type: 'string' }, total: { type: 'number' } } } } },
              },
              raceParticipation: {
                type: 'object',
                properties: { totalEntries: { type: 'integer' }, byStatus: { type: 'object', additionalProperties: { type: 'integer' } } },
              },
            },
          }),
          403: responses[403],
        },
      },
    },
  },
};
