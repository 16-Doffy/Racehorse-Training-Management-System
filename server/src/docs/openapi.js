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
          isActive: { type: 'boolean' },
          approvalStatus: { type: 'string', enum: ['pending', 'approved', 'rejected'], description: 'Distinguishes a self-registration awaiting a Manager decision from an existing member who was deactivated (both have isActive=false).' },
        },
      },
      Horse: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
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
            },
          },
        },
      },
      TrainingPlan: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          horse: { type: 'string' },
          createdBy: { type: 'string' },
          phase: { type: 'string', enum: ['base_building', 'strength', 'speed', 'peak', 'recovery'] },
          distanceTarget: { type: 'number', description: 'meters' },
          weeklyVolumeKm: { type: 'number', description: 'Total planned training km per week ("khối lượng")' },
          intensity: { type: 'string', enum: ['light', 'moderate', 'high'] },
          surface: { type: 'string', enum: ['turf', 'dirt', 'synthetic', 'sand'] },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          notes: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'active', 'completed', 'cancelled'] },
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
          scheduledAt: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['scheduled', 'in_progress', 'completed', 'cancelled'] },
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
            items: { type: 'object', properties: { name: { type: 'string' }, dosage: { type: 'string' }, frequency: { type: 'string' } } },
          },
          isTrainingLocked: { type: 'boolean', description: 'While true, POST /training/sessions is refused for this horse (409).' },
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
          taskType: { type: 'string', enum: ['feeding', 'cleaning', 'bathing', 'icing'] },
          scheduledDate: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['pending', 'completed', 'skipped'] },
          incidentReport: {
            type: 'object',
            nullable: true,
            properties: {
              description: { type: 'string' },
              images: { type: 'array', items: { type: 'string' }, description: 'Relative URLs under /uploads' },
              severity: { type: 'string', enum: ['low', 'medium', 'high'] },
            },
          },
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
          items: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, quantity: { type: 'string' } } } },
        },
      },
      InventoryItem: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string' },
          category: { type: 'string', enum: ['feed', 'medicine', 'equipment'] },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          stableBlock: { type: 'string' },
          restockRequests: {
            type: 'array',
            items: { type: 'object', properties: { _id: { type: 'string' }, requestedBy: { type: 'string' }, quantity: { type: 'number' }, status: { type: 'string', enum: ['pending', 'approved', 'rejected'] } } },
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
          distance: { type: 'number' },
          status: { type: 'string', enum: ['registered', 'confirmed', 'completed', 'withdrawn'] },
          result: { type: 'string' },
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
          type: { type: 'string', enum: ['fitness_alert', 'injury_lock', 'vaccination_due', 'deworming_due', 'farrier_due', 'incident_report', 'exam_request', 'restock_decision', 'horse_assigned', 'system'] },
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
      post: { tags: ['Training (Head Trainer)'], summary: 'Create training plan', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TrainingPlan' } } } }, responses: { 201: responses[201]({ $ref: '#/components/schemas/TrainingPlan' }), 403: responses[403] } },
    },
    '/training/plans/{id}': {
      get: { tags: ['Training (Head Trainer)'], summary: 'Get training plan', parameters: [idParam('id')], responses: { 200: responses[200]({ $ref: '#/components/schemas/TrainingPlan' }), 404: responses[404] } },
      put: { tags: ['Training (Head Trainer)'], summary: 'Update training plan', parameters: [idParam('id')], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/TrainingPlan' } } } }, responses: { 200: responses[200]({ $ref: '#/components/schemas/TrainingPlan' }), 403: responses[403], 404: responses[404] } },
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
        summary: 'Create training session — refused with 409 if the horse has an active training lock (see Treatment.isTrainingLocked)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TrainingSession' } } } },
        responses: { 201: responses[201]({ $ref: '#/components/schemas/TrainingSession' }), 403: responses[403], 409: responses[409] },
      },
    },
    '/training/sessions/{id}': {
      get: { tags: ['Training (Head Trainer)'], summary: 'Get training session', parameters: [idParam('id')], responses: { 200: responses[200]({ $ref: '#/components/schemas/TrainingSession' }), 404: responses[404] } },
      put: { tags: ['Training (Head Trainer)'], summary: 'Update training session', parameters: [idParam('id')], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/TrainingSession' } } } }, responses: { 200: responses[200]({ $ref: '#/components/schemas/TrainingSession' }), 404: responses[404] } },
      delete: { tags: ['Training (Head Trainer)'], summary: 'Delete training session', parameters: [idParam('id')], responses: { 200: responses[200]({ nullable: true }), 404: responses[404] } },
    },
    '/training/sessions/{id}/evaluation': {
      patch: {
        tags: ['Training (Head Trainer)'],
        summary: "Record the trainer's post-session evaluation (comment, rating, metrics, status)",
        parameters: [idParam('id')],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { trainerComment: { type: 'string' }, performanceRating: { type: 'integer' }, metrics: { type: 'object' }, status: { type: 'string' } } } } } },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/TrainingSession' }), 404: responses[404] },
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
                properties: { horse: { type: 'string' }, reason: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: responses[200]({ nullable: true }), 403: responses[403], 404: responses[404] },
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
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['isTrainingLocked'], properties: { isTrainingLocked: { type: 'boolean' }, lockReason: { type: 'string' } } } } } },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/Treatment' }), 404: responses[404] },
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
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { horse: { type: 'string' }, assignedTo: { type: 'string' }, taskType: { type: 'string', enum: ['feeding', 'cleaning', 'bathing', 'icing'] }, scheduledDate: { type: 'string', format: 'date-time' } } } } } },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/DailyTask' }), 403: responses[403], 404: responses[404], 409: responses[409] },
      },
      delete: {
        tags: ['Stable (Groom)'],
        summary: 'Cancel an assigned task (Head Trainer / Manager). Completed tasks are kept — deleting one would erase the record that the work was done — so those return 409.',
        parameters: [idParam('id')],
        responses: { 200: responses[200]({ nullable: true }), 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/stable/tasks/{id}/complete': {
      patch: { tags: ['Stable (Groom)'], summary: 'Mark task completed (Groom)', parameters: [idParam('id')], responses: { 200: responses[200]({ $ref: '#/components/schemas/DailyTask' }), 403: responses[403], 404: responses[404] } },
    },
    '/stable/tasks/{id}/incident': {
      post: {
        tags: ['Stable (Groom)'],
        summary: 'Report an incident with optional photo evidence (Groom)',
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
      post: { tags: ['Inventory (scaffold)'], summary: 'Request a restock (Groom, Head Trainer, Veterinarian)', parameters: [idParam('id')], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { quantity: { type: 'number' } } } } } }, responses: { 200: responses[200]({ $ref: '#/components/schemas/InventoryItem' }), 404: responses[404] } },
    },
    '/inventory/{id}/restock-requests/{reqId}': {
      patch: {
        tags: ['Inventory (scaffold)'],
        summary: 'Approve or reject a pending restock request (Manager) — approving adds the quantity to stock',
        parameters: [idParam('id'), idParam('reqId', 'The restockRequests sub-document id')],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['approved', 'rejected'] } } } } },
        },
        responses: { 200: responses[200]({ $ref: '#/components/schemas/InventoryItem' }), 403: responses[403], 404: responses[404], 409: responses[409] },
      },
    },
    '/races': {
      get: { tags: ['Races (scaffold)'], summary: 'List race entries', responses: { 200: responses[200]({ type: 'array', items: { $ref: '#/components/schemas/RaceEntry' } }) } },
      post: { tags: ['Races (scaffold)'], summary: 'Register a horse for a race (Head Trainer)', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/RaceEntry' } } } }, responses: { 201: responses[201]({ $ref: '#/components/schemas/RaceEntry' }), 403: responses[403] } },
    },
    '/races/{id}': {
      get: { tags: ['Races (scaffold)'], summary: 'Get race entry', parameters: [idParam('id')], responses: { 200: responses[200]({ $ref: '#/components/schemas/RaceEntry' }), 404: responses[404] } },
      put: { tags: ['Races (scaffold)'], summary: 'Update race entry (Head Trainer)', parameters: [idParam('id')], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/RaceEntry' } } } }, responses: { 200: responses[200]({ $ref: '#/components/schemas/RaceEntry' }), 404: responses[404] } },
      delete: { tags: ['Races (scaffold)'], summary: 'Delete race entry (Head Trainer, Manager)', parameters: [idParam('id')], responses: { 200: responses[200]({ nullable: true }), 404: responses[404] } },
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
