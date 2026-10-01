
window.onload = function() {
  // Build a system
  var url = window.location.search.match(/url=([^&]+)/);
  if (url && url.length > 1) {
    url = decodeURIComponent(url[1]);
  } else {
    url = window.location.origin;
  }
  var options = {
  "swaggerDoc": {
    "openapi": "3.0.3",
    "info": {
      "title": "Racehorse Training & Management System API",
      "version": "1.0.0",
      "description": "REST + Socket.io API for the Racehorse Training & Management System (5 roles: head_trainer, veterinarian, groom, owner, manager). All responses use the shape `{ success, data, message }`. Authenticate with `POST /auth/login`, then send `Authorization: Bearer <token>` on every other request. Socket.io connects to the server root (not under /api/v1) with `auth: { token }` and emits `fitness:alert` / `sensor:reading` — see README.md for details, not covered by this spec."
    },
    "servers": [
      {
        "url": "https://racehorse-tms-server.onrender.com/api/v1",
        "description": "Production (shared, Render + Atlas)"
      },
      {
        "url": "http://localhost:5000/api/v1",
        "description": "Local dev"
      }
    ],
    "components": {
      "securitySchemes": {
        "bearerAuth": {
          "type": "http",
          "scheme": "bearer",
          "bearerFormat": "JWT"
        }
      },
      "schemas": {
        "User": {
          "type": "object",
          "properties": {
            "_id": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "email": {
              "type": "string",
              "format": "email"
            },
            "role": {
              "type": "string",
              "enum": [
                "head_trainer",
                "veterinarian",
                "groom",
                "owner",
                "manager"
              ]
            },
            "phone": {
              "type": "string"
            },
            "isActive": {
              "type": "boolean"
            },
            "approvalStatus": {
              "type": "string",
              "enum": [
                "pending",
                "approved",
                "rejected"
              ],
              "description": "Distinguishes a self-registration awaiting a Manager decision from an existing member who was deactivated (both have isActive=false)."
            }
          }
        },
        "Horse": {
          "type": "object",
          "properties": {
            "_id": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "breed": {
              "type": "string"
            },
            "dob": {
              "type": "string",
              "format": "date-time"
            },
            "color": {
              "type": "string"
            },
            "owner": {
              "type": "string",
              "description": "User id (populated as object on read)"
            },
            "sire": {
              "type": "string",
              "nullable": true
            },
            "dam": {
              "type": "string",
              "nullable": true
            },
            "assignedTrainer": {
              "type": "string",
              "nullable": true,
              "description": "Head Trainer user id responsible for this horse (Manager-set). Null = visible to every Head Trainer until assigned."
            },
            "assignedVet": {
              "type": "string",
              "nullable": true,
              "description": "Veterinarian user id responsible for this horse (Manager-set). Null = visible to every Veterinarian until assigned."
            },
            "healthStatus": {
              "type": "string",
              "enum": [
                "eligible",
                "monitoring",
                "injured",
                "quarantined"
              ]
            },
            "weightKg": {
              "type": "number"
            },
            "achievements": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "race": {
                    "type": "string"
                  },
                  "result": {
                    "type": "string"
                  },
                  "date": {
                    "type": "string",
                    "format": "date-time"
                  }
                }
              }
            },
            "careSchedule": {
              "type": "object",
              "description": "Recurring vet care due-dates; checked hourly by the care scheduler to notify the Veterinarian role.",
              "properties": {
                "nextVaccinationDue": {
                  "type": "string",
                  "format": "date-time",
                  "nullable": true
                },
                "nextDewormingDue": {
                  "type": "string",
                  "format": "date-time",
                  "nullable": true
                },
                "nextFarrierDue": {
                  "type": "string",
                  "format": "date-time",
                  "nullable": true
                }
              }
            }
          }
        },
        "TrainingPlan": {
          "type": "object",
          "properties": {
            "_id": {
              "type": "string"
            },
            "horse": {
              "type": "string"
            },
            "createdBy": {
              "type": "string"
            },
            "phase": {
              "type": "string",
              "enum": [
                "base_building",
                "strength",
                "speed",
                "peak",
                "recovery"
              ]
            },
            "distanceTarget": {
              "type": "number",
              "description": "meters"
            },
            "weeklyVolumeKm": {
              "type": "number",
              "description": "Total planned training km per week (\"khối lượng\")"
            },
            "intensity": {
              "type": "string",
              "enum": [
                "light",
                "moderate",
                "high"
              ]
            },
            "surface": {
              "type": "string",
              "enum": [
                "turf",
                "dirt",
                "synthetic",
                "sand"
              ]
            },
            "goal": {
              "type": "string",
              "description": "What the whole plan is building towards, in plain words"
            },
            "targetRace": {
              "type": "string",
              "nullable": true,
              "description": "RaceEntry this plan is preparing the horse for"
            },
            "startDate": {
              "type": "string",
              "format": "date-time"
            },
            "endDate": {
              "type": "string",
              "format": "date-time"
            },
            "notes": {
              "type": "string"
            },
            "status": {
              "type": "string",
              "enum": [
                "draft",
                "active",
                "completed",
                "cancelled"
              ]
            }
          }
        },
        "ExamRequest": {
          "type": "object",
          "properties": {
            "_id": {
              "type": "string"
            },
            "horse": {
              "type": "string"
            },
            "requestedBy": {
              "type": "string"
            },
            "reason": {
              "type": "string"
            },
            "priority": {
              "type": "string",
              "enum": [
                "normal",
                "high",
                "urgent"
              ]
            },
            "status": {
              "type": "string",
              "enum": [
                "pending",
                "done",
                "cancelled"
              ]
            },
            "resolvedBy": {
              "type": "string",
              "nullable": true
            },
            "resolvedAt": {
              "type": "string",
              "format": "date-time",
              "nullable": true
            },
            "healthRecord": {
              "type": "string",
              "nullable": true,
              "description": "The exam that answered the request"
            },
            "resolutionNote": {
              "type": "string"
            },
            "trainingSession": {
              "type": "string",
              "nullable": true,
              "description": "Set when the system raised the request itself: a finished session averaged 10%+ over its heart-rate limit"
            }
          }
        },
        "Readiness": {
          "type": "object",
          "description": "Whether a horse is fit to do a given piece of work. Four gates, each owned by a different role: medical (vet), vet_clearance (vet), nutrition (groom), care_assignment (manager). Only `medical` can return \"blocked\"; the rest are advisory and a trainer may proceed past them by supplying `overrideReason`, which is audit-logged and reported to the manager.",
          "properties": {
            "overall": {
              "type": "string",
              "enum": [
                "ready",
                "caution",
                "blocked"
              ]
            },
            "scheduledAt": {
              "type": "string",
              "format": "date-time"
            },
            "gates": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "key": {
                    "type": "string",
                    "enum": [
                      "medical",
                      "vet_clearance",
                      "nutrition",
                      "care_assignment"
                    ]
                  },
                  "label": {
                    "type": "string",
                    "description": "Vietnamese label, ready to render"
                  },
                  "status": {
                    "type": "string",
                    "enum": [
                      "ok",
                      "caution",
                      "blocked"
                    ]
                  },
                  "detail": {
                    "type": "string",
                    "description": "Vietnamese explanation of why, ready to render"
                  },
                  "action": {
                    "type": "string",
                    "nullable": true,
                    "enum": [
                      "request_exam"
                    ],
                    "description": "Suggested remedy, when there is one"
                  }
                }
              }
            }
          }
        },
        "TrainingSession": {
          "type": "object",
          "properties": {
            "_id": {
              "type": "string"
            },
            "trainingPlan": {
              "type": "string"
            },
            "horse": {
              "type": "string"
            },
            "assignedTo": {
              "type": "string"
            },
            "sessionType": {
              "type": "string",
              "enum": [
                "training",
                "trial_run"
              ],
              "description": "\"lượt chạy thử\" vs a normal training rep"
            },
            "objective": {
              "type": "string",
              "enum": [
                "endurance",
                "speed",
                "interval",
                "recovery",
                "technique",
                "race_simulation"
              ],
              "description": "What the session is for — decides distance, pace and the alert thresholds used"
            },
            "intensity": {
              "type": "string",
              "enum": [
                "light",
                "moderate",
                "high"
              ],
              "description": "This session only; may differ from the plan default"
            },
            "prescription": {
              "type": "object",
              "description": "The workout as planned; metrics are measured against it to produce `outcome`",
              "properties": {
                "distanceM": {
                  "type": "number"
                },
                "reps": {
                  "type": "number"
                },
                "restMinutes": {
                  "type": "number"
                },
                "targetSpeedKmh": {
                  "type": "number"
                },
                "targetHeartRateMax": {
                  "type": "number"
                },
                "durationMinutes": {
                  "type": "number"
                }
              }
            },
            "coachNote": {
              "type": "string",
              "description": "Briefing before the session (trainerComment is the debrief after)"
            },
            "readiness": {
              "$ref": "#/components/schemas/Readiness"
            },
            "outcome": {
              "type": "object",
              "properties": {
                "met": {
                  "type": "boolean",
                  "nullable": true,
                  "description": "null when the session had no targets to judge against"
                },
                "summary": {
                  "type": "string"
                }
              }
            },
            "scheduledAt": {
              "type": "string",
              "format": "date-time"
            },
            "status": {
              "type": "string",
              "enum": [
                "scheduled",
                "in_progress",
                "completed",
                "cancelled"
              ]
            },
            "metrics": {
              "type": "object",
              "properties": {
                "avgHeartRate": {
                  "type": "number"
                },
                "maxHeartRate": {
                  "type": "number"
                },
                "maxSpeed": {
                  "type": "number",
                  "description": "km/h"
                },
                "distance": {
                  "type": "number",
                  "description": "meters"
                }
              }
            },
            "trainerComment": {
              "type": "string"
            },
            "performanceRating": {
              "type": "integer",
              "minimum": 1,
              "maximum": 10
            },
            "videoUrl": {
              "type": "string",
              "description": "Link (http/https) to a recording of the run, mainly for trial runs — set through the evaluation endpoint"
            }
          }
        },
        "HealthRecord": {
          "type": "object",
          "properties": {
            "_id": {
              "type": "string"
            },
            "horse": {
              "type": "string"
            },
            "examinedBy": {
              "type": "string"
            },
            "date": {
              "type": "string",
              "format": "date-time"
            },
            "diagnosis": {
              "type": "string"
            },
            "vitalSigns": {
              "type": "object",
              "properties": {
                "temperatureC": {
                  "type": "number"
                },
                "heartRate": {
                  "type": "number"
                },
                "respiratoryRate": {
                  "type": "number"
                }
              }
            },
            "resultStatus": {
              "type": "string",
              "enum": [
                "eligible",
                "monitoring",
                "injured",
                "quarantined"
              ]
            },
            "notes": {
              "type": "string"
            }
          }
        },
        "Treatment": {
          "type": "object",
          "properties": {
            "_id": {
              "type": "string"
            },
            "healthRecord": {
              "type": "string"
            },
            "horse": {
              "type": "string"
            },
            "prescribedBy": {
              "type": "string"
            },
            "medications": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "name": {
                    "type": "string"
                  },
                  "dosage": {
                    "type": "string"
                  },
                  "frequency": {
                    "type": "string"
                  }
                }
              }
            },
            "careInstructions": {
              "type": "string",
              "description": "What the stable must do during the treatment (box rest, watch the swelling…). While the treatment is ongoing, each medication becomes a daily `medication` task and this becomes a daily `monitoring` task for the horse's caretaker (DailyTask.source = vet), who is notified."
            },
            "isTrainingLocked": {
              "type": "boolean",
              "description": "While true, POST /training/sessions is refused for this horse (409), and so is a race registration. The trainer and the groom are notified."
            },
            "lockReason": {
              "type": "string"
            },
            "status": {
              "type": "string",
              "enum": [
                "ongoing",
                "completed"
              ]
            }
          }
        },
        "InjuryMarker": {
          "type": "object",
          "properties": {
            "_id": {
              "type": "string"
            },
            "horse": {
              "type": "string"
            },
            "bodyPart": {
              "type": "string"
            },
            "coordinates": {
              "type": "object",
              "properties": {
                "x": {
                  "type": "number"
                },
                "y": {
                  "type": "number"
                }
              },
              "description": "Normalized 0-1 against a reference silhouette"
            },
            "severity": {
              "type": "string",
              "enum": [
                "mild",
                "moderate",
                "severe"
              ]
            },
            "recoveryStatus": {
              "type": "string",
              "enum": [
                "new",
                "in_treatment",
                "recovering",
                "recovered"
              ]
            }
          }
        },
        "DailyTask": {
          "type": "object",
          "properties": {
            "_id": {
              "type": "string"
            },
            "horse": {
              "type": "string"
            },
            "assignedTo": {
              "type": "string"
            },
            "taskType": {
              "type": "string",
              "enum": [
                "feeding",
                "cleaning",
                "bathing",
                "icing",
                "medication",
                "monitoring"
              ],
              "description": "medication / monitoring are created from a vet treatment only; they cannot be assigned by hand"
            },
            "source": {
              "type": "string",
              "enum": [
                "trainer",
                "vet",
                "system"
              ],
              "description": "Who the work comes from: assigned by hand, ordered by the vet through a treatment, or generated (daily meals, post-session care). A trainer/manager cannot edit or delete a vet task (409)."
            },
            "treatment": {
              "type": "string",
              "nullable": true,
              "description": "The treatment a vet care order belongs to"
            },
            "mealSlot": {
              "type": "string",
              "nullable": true,
              "enum": [
                "morning",
                "noon",
                "evening"
              ],
              "description": "Which meal a feeding task covers; null for other task types"
            },
            "trainingSession": {
              "type": "string",
              "nullable": true,
              "description": "Set when the task was auto-generated by a completed hard session (icing/bathing)"
            },
            "note": {
              "type": "string",
              "description": "The trainer's instruction attached to the task"
            },
            "scheduledDate": {
              "type": "string",
              "format": "date-time"
            },
            "status": {
              "type": "string",
              "enum": [
                "pending",
                "completed",
                "skipped"
              ]
            },
            "observation": {
              "type": "object",
              "nullable": true,
              "description": "What the groom saw while doing the work. Feeds the training readiness nutrition gate.",
              "properties": {
                "appetite": {
                  "type": "string",
                  "nullable": true,
                  "enum": [
                    "full",
                    "partial",
                    "refused"
                  ]
                },
                "amountEatenPercent": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 100
                },
                "behaviourNote": {
                  "type": "string"
                },
                "recordedAt": {
                  "type": "string",
                  "format": "date-time"
                }
              }
            },
            "incidentReport": {
              "type": "object",
              "nullable": true,
              "properties": {
                "description": {
                  "type": "string"
                },
                "images": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "Relative URLs under /uploads"
                },
                "severity": {
                  "type": "string",
                  "enum": [
                    "low",
                    "medium",
                    "high"
                  ]
                },
                "reportedAt": {
                  "type": "string",
                  "format": "date-time"
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "open",
                    "acknowledged",
                    "resolved"
                  ],
                  "description": "Open until the vet picks it up and closes it. Reports filed before this field existed have none and count as open."
                },
                "handledBy": {
                  "type": "string",
                  "nullable": true,
                  "description": "The vet who acknowledged / resolved it"
                },
                "response": {
                  "type": "string",
                  "description": "What the vet found or told the stable to do"
                },
                "resolvedAt": {
                  "type": "string",
                  "format": "date-time",
                  "nullable": true
                },
                "healthRecord": {
                  "type": "string",
                  "nullable": true,
                  "description": "Set when the report was closed by filing an exam"
                }
              }
            }
          }
        },
        "TimelineEvent": {
          "type": "object",
          "properties": {
            "at": {
              "type": "string",
              "format": "date-time"
            },
            "kind": {
              "type": "string",
              "enum": [
                "session",
                "exam",
                "treatment",
                "care",
                "incident",
                "exam_request",
                "race"
              ]
            },
            "role": {
              "type": "string",
              "description": "The role the record came from (head_trainer, veterinarian, groom, manager)"
            },
            "actor": {
              "type": "string",
              "description": "Name of the person, when known"
            },
            "title": {
              "type": "string"
            },
            "detail": {
              "type": "string"
            },
            "severity": {
              "type": "string",
              "enum": [
                "info",
                "warning",
                "critical"
              ]
            },
            "upcoming": {
              "type": "boolean",
              "description": "A session or race still booked for the future"
            },
            "refId": {
              "type": "string",
              "description": "Id of the underlying record"
            }
          }
        },
        "StableAssignment": {
          "type": "object",
          "properties": {
            "_id": {
              "type": "string"
            },
            "horse": {
              "type": "string"
            },
            "stableBlock": {
              "type": "string"
            },
            "assignedCaretaker": {
              "type": "string"
            }
          }
        },
        "FeedingSchedule": {
          "type": "object",
          "properties": {
            "_id": {
              "type": "string"
            },
            "horse": {
              "type": "string"
            },
            "mealTime": {
              "type": "string",
              "enum": [
                "morning",
                "noon",
                "evening"
              ]
            },
            "items": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string"
                  },
                  "quantity": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "InventoryItem": {
          "type": "object",
          "properties": {
            "_id": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "category": {
              "type": "string",
              "enum": [
                "feed",
                "medicine",
                "equipment"
              ]
            },
            "quantity": {
              "type": "number"
            },
            "unit": {
              "type": "string"
            },
            "stableBlock": {
              "type": "string"
            },
            "restockRequests": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "_id": {
                    "type": "string"
                  },
                  "requestedBy": {
                    "type": "string"
                  },
                  "quantity": {
                    "type": "number"
                  },
                  "status": {
                    "type": "string",
                    "enum": [
                      "pending",
                      "approved",
                      "rejected"
                    ]
                  }
                }
              }
            }
          }
        },
        "RaceEntry": {
          "type": "object",
          "properties": {
            "_id": {
              "type": "string"
            },
            "horse": {
              "type": "string"
            },
            "raceName": {
              "type": "string"
            },
            "raceDate": {
              "type": "string",
              "format": "date-time"
            },
            "distance": {
              "type": "number"
            },
            "status": {
              "type": "string",
              "enum": [
                "registered",
                "confirmed",
                "completed",
                "withdrawn"
              ]
            },
            "result": {
              "type": "string"
            }
          }
        },
        "FinancialRecord": {
          "type": "object",
          "properties": {
            "_id": {
              "type": "string"
            },
            "horse": {
              "type": "string"
            },
            "type": {
              "type": "string",
              "enum": [
                "cost",
                "revenue"
              ]
            },
            "category": {
              "type": "string"
            },
            "amount": {
              "type": "number"
            },
            "date": {
              "type": "string",
              "format": "date-time"
            },
            "note": {
              "type": "string"
            }
          }
        },
        "Notification": {
          "type": "object",
          "properties": {
            "_id": {
              "type": "string"
            },
            "recipientUser": {
              "type": "string",
              "nullable": true
            },
            "recipientRole": {
              "type": "string",
              "nullable": true
            },
            "horse": {
              "type": "string"
            },
            "type": {
              "type": "string",
              "enum": [
                "fitness_alert",
                "injury_lock",
                "vaccination_due",
                "deworming_due",
                "farrier_due",
                "incident_report",
                "exam_request",
                "restock_decision",
                "horse_assigned",
                "session_completed",
                "readiness_override",
                "training_unlocked",
                "system"
              ]
            },
            "trainingSession": {
              "type": "string",
              "nullable": true,
              "description": "Set when the notification is about one specific session"
            },
            "severity": {
              "type": "string",
              "enum": [
                "info",
                "warning",
                "critical"
              ]
            },
            "message": {
              "type": "string"
            },
            "isRead": {
              "type": "boolean"
            }
          }
        },
        "AuditLog": {
          "type": "object",
          "properties": {
            "_id": {
              "type": "string"
            },
            "actor": {
              "type": "string"
            },
            "action": {
              "type": "string",
              "example": "treatment.lock_training"
            },
            "targetModel": {
              "type": "string"
            },
            "targetId": {
              "type": "string"
            },
            "metadata": {
              "type": "object"
            },
            "createdAt": {
              "type": "string",
              "format": "date-time"
            }
          }
        }
      }
    },
    "security": [
      {
        "bearerAuth": []
      }
    ],
    "tags": [
      {
        "name": "Auth"
      },
      {
        "name": "Users (Manager)"
      },
      {
        "name": "Horses"
      },
      {
        "name": "Training (Head Trainer)"
      },
      {
        "name": "Health (Veterinarian)"
      },
      {
        "name": "Stable (Groom)"
      },
      {
        "name": "Feeding (scaffold)"
      },
      {
        "name": "Inventory (scaffold)"
      },
      {
        "name": "Races (scaffold)"
      },
      {
        "name": "Finance (scaffold)"
      },
      {
        "name": "Notifications"
      },
      {
        "name": "Audit Log (Manager)"
      },
      {
        "name": "Reports (Manager)"
      },
      {
        "name": "System"
      }
    ],
    "paths": {
      "/health-check": {
        "get": {
          "tags": [
            "System"
          ],
          "summary": "Liveness check",
          "security": [],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "object",
                        "properties": {
                          "message": {
                            "type": "string"
                          }
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/auth/login": {
        "post": {
          "tags": [
            "Auth"
          ],
          "summary": "Log in",
          "security": [],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "email",
                    "password"
                  ],
                  "properties": {
                    "email": {
                      "type": "string"
                    },
                    "password": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "object",
                        "properties": {
                          "token": {
                            "type": "string"
                          },
                          "user": {
                            "$ref": "#/components/schemas/User"
                          }
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "401": {
              "description": "Not authenticated",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/auth/register": {
        "post": {
          "tags": [
            "Auth"
          ],
          "summary": "Self-register for any role — the account is created inactive (approvalStatus=pending) and cannot log in until a Club Manager approves it via PATCH /users/{id}/approval. No token is returned.",
          "security": [],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "name",
                    "email",
                    "password",
                    "role"
                  ],
                  "properties": {
                    "name": {
                      "type": "string"
                    },
                    "email": {
                      "type": "string"
                    },
                    "password": {
                      "type": "string"
                    },
                    "phone": {
                      "type": "string"
                    },
                    "role": {
                      "type": "string",
                      "enum": [
                        "head_trainer",
                        "veterinarian",
                        "groom",
                        "owner",
                        "manager"
                      ],
                      "description": "Requested role — a request, not an entitlement: the Manager can change it when approving."
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "Created",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "object",
                        "properties": {
                          "user": {
                            "$ref": "#/components/schemas/User"
                          }
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "400": {
              "description": "Validation error",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "409": {
              "description": "Conflict (e.g. duplicate, or horse under an active training lock)",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/auth/me": {
        "get": {
          "tags": [
            "Auth"
          ],
          "summary": "Current authenticated user",
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/User"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "401": {
              "description": "Not authenticated",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/users": {
        "get": {
          "tags": [
            "Users (Manager)"
          ],
          "summary": "List users (Manager or Head Trainer — the latter needs this to look up Groom staff for task assignment)",
          "parameters": [
            {
              "name": "role",
              "in": "query",
              "schema": {
                "type": "string"
              }
            },
            {
              "name": "isActive",
              "in": "query",
              "schema": {
                "type": "boolean"
              }
            },
            {
              "name": "approvalStatus",
              "in": "query",
              "schema": {
                "type": "string",
                "enum": [
                  "pending",
                  "approved",
                  "rejected"
                ]
              },
              "description": "Filter self-registrations awaiting a decision."
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/User"
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "post": {
          "tags": [
            "Users (Manager)"
          ],
          "summary": "Create a user (assign role — this is the RBAC provisioning surface)",
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "name",
                    "email",
                    "password",
                    "role"
                  ],
                  "properties": {
                    "name": {
                      "type": "string"
                    },
                    "email": {
                      "type": "string"
                    },
                    "password": {
                      "type": "string"
                    },
                    "role": {
                      "type": "string"
                    },
                    "phone": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "Created",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/User"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "409": {
              "description": "Conflict (e.g. duplicate, or horse under an active training lock)",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/users/{id}": {
        "get": {
          "tags": [
            "Users (Manager)"
          ],
          "summary": "Get user by id",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/User"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "put": {
          "tags": [
            "Users (Manager)"
          ],
          "summary": "Update user (profile, role, isActive, or reset password)",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "name": {
                      "type": "string"
                    },
                    "phone": {
                      "type": "string"
                    },
                    "role": {
                      "type": "string"
                    },
                    "isActive": {
                      "type": "boolean"
                    },
                    "password": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/User"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "delete": {
          "tags": [
            "Users (Manager)"
          ],
          "summary": "Deactivate user (soft delete)",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/User"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/users/{id}/approval": {
        "patch": {
          "tags": [
            "Users (Manager)"
          ],
          "summary": "Approve or reject a self-registered account (Manager only). Approving is what actually lets the person log in; the Manager may correct the role they requested.",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "approve"
                  ],
                  "properties": {
                    "approve": {
                      "type": "boolean"
                    },
                    "role": {
                      "type": "string",
                      "description": "Optional override of the requested role, applied when approving."
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/User"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "400": {
              "description": "Validation error",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "409": {
              "description": "Conflict (e.g. duplicate, or horse under an active training lock)",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/horses": {
        "get": {
          "tags": [
            "Horses"
          ],
          "summary": "List horses (Owner: only their own; Head Trainer/Vet: only horses assigned to them plus any not yet assigned; Manager/Groom: all)",
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/Horse"
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "post": {
          "tags": [
            "Horses"
          ],
          "summary": "Create horse (Manager only)",
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Horse"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "Created",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/Horse"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/horses/{id}": {
        "get": {
          "tags": [
            "Horses"
          ],
          "summary": "Get horse by id",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/Horse"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "put": {
          "tags": [
            "Horses"
          ],
          "summary": "Update horse (Manager only)",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Horse"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/Horse"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "delete": {
          "tags": [
            "Horses"
          ],
          "summary": "Delete horse (Manager only)",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "nullable": true
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/horses/{id}/timeline": {
        "get": {
          "tags": [
            "Horses"
          ],
          "summary": "Everything every role did to one horse, newest first",
          "description": "Merges training sessions, exams, treatments and locks, completed care tasks with what the groom observed, incident reports, exam requests and race entries. Covers the last `days` days (default 14, max 90) plus sessions and races booked for the next 7. Same access rule as GET /horses/{id}.",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            },
            {
              "name": "days",
              "in": "query",
              "schema": {
                "type": "integer",
                "default": 14,
                "maximum": 90
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "object",
                        "properties": {
                          "horse": {
                            "type": "object"
                          },
                          "from": {
                            "type": "string",
                            "format": "date-time"
                          },
                          "to": {
                            "type": "string",
                            "format": "date-time"
                          },
                          "days": {
                            "type": "integer"
                          },
                          "events": {
                            "type": "array",
                            "items": {
                              "$ref": "#/components/schemas/TimelineEvent"
                            }
                          }
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/horses/{id}/care-schedule": {
        "patch": {
          "tags": [
            "Horses"
          ],
          "summary": "Set recurring vet care due-dates (Veterinarian only) — triggers automatic reminders when due",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "nextVaccinationDue": {
                      "type": "string",
                      "format": "date-time"
                    },
                    "nextDewormingDue": {
                      "type": "string",
                      "format": "date-time"
                    },
                    "nextFarrierDue": {
                      "type": "string",
                      "format": "date-time"
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/Horse"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/training/plans": {
        "get": {
          "tags": [
            "Training (Head Trainer)"
          ],
          "summary": "List training plans",
          "parameters": [
            {
              "name": "horse",
              "in": "query",
              "required": false,
              "schema": {
                "type": "string"
              },
              "description": "Filter by horse id"
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/TrainingPlan"
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "post": {
          "tags": [
            "Training (Head Trainer)"
          ],
          "summary": "Create training plan",
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/TrainingPlan"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "Created",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/TrainingPlan"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/training/plans/{id}": {
        "get": {
          "tags": [
            "Training (Head Trainer)"
          ],
          "summary": "Get training plan",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/TrainingPlan"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "put": {
          "tags": [
            "Training (Head Trainer)"
          ],
          "summary": "Update training plan",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/TrainingPlan"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/TrainingPlan"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "delete": {
          "tags": [
            "Training (Head Trainer)"
          ],
          "summary": "Delete training plan",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "nullable": true
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/training/sessions": {
        "get": {
          "tags": [
            "Training (Head Trainer)"
          ],
          "summary": "List training sessions",
          "parameters": [
            {
              "name": "horse",
              "in": "query",
              "required": false,
              "schema": {
                "type": "string"
              },
              "description": "Filter by horse id"
            },
            {
              "name": "trainingPlan",
              "in": "query",
              "schema": {
                "type": "string"
              }
            },
            {
              "name": "status",
              "in": "query",
              "schema": {
                "type": "string"
              }
            },
            {
              "name": "sessionType",
              "in": "query",
              "schema": {
                "type": "string",
                "enum": [
                  "training",
                  "trial_run"
                ]
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/TrainingSession"
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "post": {
          "tags": [
            "Training (Head Trainer)"
          ],
          "summary": "Create training session — runs the readiness gates first",
          "description": "Refused with 409 when the medical gate is blocked (active training lock, or an injured/quarantined horse). Also refused with 409 when any advisory gate is amber and no `overrideReason` was supplied — the body then carries `{ readiness, requiresOverride: true }` so the client can show the warnings and ask for a reason. Resending with `overrideReason` creates the session, stores the readiness snapshot on it, writes an audit log entry, and notifies the Club Manager.",
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "allOf": [
                    {
                      "$ref": "#/components/schemas/TrainingSession"
                    },
                    {
                      "type": "object",
                      "properties": {
                        "overrideReason": {
                          "type": "string",
                          "description": "Required only when an advisory gate is amber"
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "Created",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/TrainingSession"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "409": {
              "description": "Conflict (e.g. duplicate, or horse under an active training lock)",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/training/sessions/readiness": {
        "get": {
          "tags": [
            "Training (Head Trainer)"
          ],
          "summary": "Is this horse fit to do this session? — the four-gate readiness board",
          "description": "Open to every authenticated role so the vet, groom and owner screens can render the same answer. Scoped by horse assignment like the rest of the training module.",
          "parameters": [
            {
              "name": "horse",
              "in": "query",
              "required": true,
              "schema": {
                "type": "string"
              }
            },
            {
              "name": "scheduledAt",
              "in": "query",
              "schema": {
                "type": "string",
                "format": "date-time"
              },
              "description": "Defaults to now"
            },
            {
              "name": "intensity",
              "in": "query",
              "schema": {
                "type": "string",
                "enum": [
                  "light",
                  "moderate",
                  "high"
                ]
              }
            },
            {
              "name": "sessionType",
              "in": "query",
              "schema": {
                "type": "string",
                "enum": [
                  "training",
                  "trial_run"
                ]
              }
            },
            {
              "name": "objective",
              "in": "query",
              "schema": {
                "type": "string",
                "enum": [
                  "endurance",
                  "speed",
                  "interval",
                  "recovery",
                  "technique",
                  "race_simulation"
                ]
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/Readiness"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/training/sessions/{id}": {
        "get": {
          "tags": [
            "Training (Head Trainer)"
          ],
          "summary": "Get training session",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/TrainingSession"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "put": {
          "tags": [
            "Training (Head Trainer)"
          ],
          "summary": "Update training session",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/TrainingSession"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/TrainingSession"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "delete": {
          "tags": [
            "Training (Head Trainer)"
          ],
          "summary": "Delete training session",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "nullable": true
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/training/sessions/{id}/start": {
        "post": {
          "tags": [
            "Training (Head Trainer)"
          ],
          "summary": "Start a session now — rechecks readiness against the current moment",
          "description": "Moves a scheduled session to in_progress. The readiness gates are re-run for *now*, not the booked time: a horse locked since booking is refused (409), and one fed twenty minutes ago returns 409 with `{ readiness, requiresOverride: true }` until `overrideReason` is sent. Completed and cancelled sessions cannot be restarted.",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": false,
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "overrideReason": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/TrainingSession"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "409": {
              "description": "Conflict (e.g. duplicate, or horse under an active training lock)",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/training/sessions/{id}/evaluation": {
        "patch": {
          "tags": [
            "Training (Head Trainer)"
          ],
          "summary": "Record the trainer's post-session evaluation (comment, rating, metrics, status)",
          "description": "Recomputes `outcome` by comparing the recorded metrics against the session prescription. When this moves the session to `completed` for the first time and the session was hard (intensity high, or a race simulation), it also creates the follow-up icing and bathing DailyTasks for the horse's caretaker (who is notified), and notifies the owner that their horse has trained. If the average heart rate is 10% or more over the prescribed limit, a high-priority exam request is raised for the horse's vet (once per session, and not while the horse already has one pending).",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "trainerComment": {
                      "type": "string"
                    },
                    "performanceRating": {
                      "type": "integer"
                    },
                    "metrics": {
                      "type": "object"
                    },
                    "status": {
                      "type": "string"
                    },
                    "videoUrl": {
                      "type": "string",
                      "description": "http(s) link; empty string clears it"
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/TrainingSession"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "400": {
              "description": "Validation error",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/health/records": {
        "get": {
          "tags": [
            "Health (Veterinarian)"
          ],
          "summary": "List health records",
          "parameters": [
            {
              "name": "horse",
              "in": "query",
              "required": false,
              "schema": {
                "type": "string"
              },
              "description": "Filter by horse id"
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/HealthRecord"
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "post": {
          "tags": [
            "Health (Veterinarian)"
          ],
          "summary": "Create health record (also updates Horse.healthStatus)",
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/HealthRecord"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "Created",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/HealthRecord"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/health/records/{id}": {
        "get": {
          "tags": [
            "Health (Veterinarian)"
          ],
          "summary": "Get health record",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/HealthRecord"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "put": {
          "tags": [
            "Health (Veterinarian)"
          ],
          "summary": "Update health record",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/HealthRecord"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/HealthRecord"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/health/exam-requests": {
        "post": {
          "tags": [
            "Health (Veterinarian)"
          ],
          "summary": "Head Trainer/Manager flags a horse for a vet check-up (Head Trainer, Manager only) — pushes a notification to the assigned vet, or the whole Veterinarian role if unassigned; does not create a HealthRecord",
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "horse"
                  ],
                  "properties": {
                    "horse": {
                      "type": "string"
                    },
                    "reason": {
                      "type": "string"
                    },
                    "priority": {
                      "type": "string",
                      "enum": [
                        "normal",
                        "high",
                        "urgent"
                      ],
                      "default": "normal"
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "nullable": true
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "get": {
          "tags": [
            "Health (Veterinarian)"
          ],
          "summary": "Exam requests with their status — the vet's queue, or the requests a trainer sent",
          "description": "Veterinarian: requests for the horses assigned to them. Head Trainer: the requests they sent, so they can see whether and how each was answered. Manager: all. Filing a health record for a horse closes its pending requests (status done, healthRecord set) and notifies each requester of the conclusion.",
          "parameters": [
            {
              "name": "horse",
              "in": "query",
              "required": false,
              "schema": {
                "type": "string"
              },
              "description": "Filter by horse id"
            },
            {
              "name": "status",
              "in": "query",
              "schema": {
                "type": "string",
                "enum": [
                  "pending",
                  "done",
                  "cancelled"
                ]
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/ExamRequest"
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/health/exam-requests/{id}": {
        "patch": {
          "tags": [
            "Health (Veterinarian)"
          ],
          "summary": "Close a request without filing an exam (Veterinarian)",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "enum": [
                        "done",
                        "cancelled"
                      ]
                    },
                    "note": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/ExamRequest"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "409": {
              "description": "Conflict (e.g. duplicate, or horse under an active training lock)",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/health/clearances": {
        "get": {
          "tags": [
            "Health (Veterinarian)"
          ],
          "summary": "Which horses are overdue a check-up",
          "description": "A hard training session requires an exam from within `clearanceDays`; these are the horses that would fail that gate. Sorted worst first (never examined, then expired, then due soon). Scoped by horse assignment. Returns only horses needing an exam unless ?all=true.",
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "horse": {
                              "$ref": "#/components/schemas/Horse"
                            },
                            "lastExam": {
                              "$ref": "#/components/schemas/HealthRecord"
                            },
                            "ageDays": {
                              "type": "integer",
                              "nullable": true
                            },
                            "status": {
                              "type": "string",
                              "enum": [
                                "never",
                                "expired",
                                "due_soon",
                                "valid"
                              ]
                            },
                            "validUntil": {
                              "type": "string",
                              "format": "date-time",
                              "nullable": true
                            },
                            "clearanceDays": {
                              "type": "integer",
                              "example": 14
                            }
                          }
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/health/treatments": {
        "get": {
          "tags": [
            "Health (Veterinarian)"
          ],
          "summary": "List treatments — filter by isTrainingLocked/status to find horses currently under an active lock",
          "parameters": [
            {
              "name": "horse",
              "in": "query",
              "required": false,
              "schema": {
                "type": "string"
              },
              "description": "Filter by horse id"
            },
            {
              "name": "isTrainingLocked",
              "in": "query",
              "schema": {
                "type": "boolean"
              }
            },
            {
              "name": "status",
              "in": "query",
              "schema": {
                "type": "string",
                "enum": [
                  "ongoing",
                  "completed"
                ]
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/Treatment"
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "post": {
          "tags": [
            "Health (Veterinarian)"
          ],
          "summary": "Create treatment (optionally with isTrainingLocked)",
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Treatment"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "Created",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/Treatment"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/health/treatments/{id}": {
        "get": {
          "tags": [
            "Health (Veterinarian)"
          ],
          "summary": "Get treatment",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/Treatment"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "put": {
          "tags": [
            "Health (Veterinarian)"
          ],
          "summary": "Update treatment",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Treatment"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/Treatment"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/health/treatments/{id}/lock-training": {
        "post": {
          "tags": [
            "Health (Veterinarian)"
          ],
          "summary": "Emergency: set or lift the training-lock order for a horse",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "isTrainingLocked"
                  ],
                  "properties": {
                    "isTrainingLocked": {
                      "type": "boolean"
                    },
                    "lockReason": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/Treatment"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/health/injury-markers": {
        "get": {
          "tags": [
            "Health (Veterinarian)"
          ],
          "summary": "List injury markers (2D placeholder for a future 3D viewer)",
          "parameters": [
            {
              "name": "horse",
              "in": "query",
              "required": false,
              "schema": {
                "type": "string"
              },
              "description": "Filter by horse id"
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/InjuryMarker"
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "post": {
          "tags": [
            "Health (Veterinarian)"
          ],
          "summary": "Create injury marker",
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/InjuryMarker"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "Created",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/InjuryMarker"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/health/injury-markers/{id}": {
        "put": {
          "tags": [
            "Health (Veterinarian)"
          ],
          "summary": "Update injury marker (e.g. recoveryStatus)",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/InjuryMarker"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/InjuryMarker"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "delete": {
          "tags": [
            "Health (Veterinarian)"
          ],
          "summary": "Delete injury marker — for one placed on the wrong body part, which previously could only be edited, never removed",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "nullable": true
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/stable/tasks": {
        "get": {
          "tags": [
            "Stable (Groom)"
          ],
          "summary": "List daily tasks (Groom implicitly filtered to their own unless assignedTo is passed)",
          "parameters": [
            {
              "name": "horse",
              "in": "query",
              "required": false,
              "schema": {
                "type": "string"
              },
              "description": "Filter by horse id"
            },
            {
              "name": "assignedTo",
              "in": "query",
              "schema": {
                "type": "string"
              }
            },
            {
              "name": "status",
              "in": "query",
              "schema": {
                "type": "string"
              }
            },
            {
              "name": "date",
              "in": "query",
              "schema": {
                "type": "string",
                "format": "date"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/DailyTask"
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "post": {
          "tags": [
            "Stable (Groom)"
          ],
          "summary": "Assign a daily task (Head Trainer / Manager)",
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/DailyTask"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "Created",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/DailyTask"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/stable/tasks/{id}": {
        "get": {
          "tags": [
            "Stable (Groom)"
          ],
          "summary": "Get daily task",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/DailyTask"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "put": {
          "tags": [
            "Stable (Groom)"
          ],
          "summary": "Edit an assigned task — reassign to another Groom, move the date, or correct the type (Head Trainer / Manager). Refused with 409 once the task is completed.",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "horse": {
                      "type": "string"
                    },
                    "assignedTo": {
                      "type": "string"
                    },
                    "taskType": {
                      "type": "string",
                      "enum": [
                        "feeding",
                        "cleaning",
                        "bathing",
                        "icing"
                      ]
                    },
                    "scheduledDate": {
                      "type": "string",
                      "format": "date-time"
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/DailyTask"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "409": {
              "description": "Conflict (e.g. duplicate, or horse under an active training lock)",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "delete": {
          "tags": [
            "Stable (Groom)"
          ],
          "summary": "Cancel an assigned task (Head Trainer / Manager). Completed tasks are kept — deleting one would erase the record that the work was done — so those return 409.",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "nullable": true
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "409": {
              "description": "Conflict (e.g. duplicate, or horse under an active training lock)",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/stable/tasks/{id}/complete": {
        "patch": {
          "tags": [
            "Stable (Groom)"
          ],
          "summary": "Mark task completed, optionally recording what was observed (Groom)",
          "description": "The body is entirely optional — sending none behaves exactly as before. When supplied, the observation is what the training readiness nutrition gate reads to decide whether the horse is fit to work, since the groom is the only person who sees it eat. `appetite: \"refused\"` additionally notifies the horse's assigned vet, because a horse going off its feed is an early sign of illness.",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": false,
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "appetite": {
                      "type": "string",
                      "description": "full | partial | refused, or the groom screen labels (Bình thường, Tốt, Kém, Bỏ ăn)"
                    },
                    "amountEatenPercent": {
                      "type": "number",
                      "minimum": 0,
                      "maximum": 100
                    },
                    "manure": {
                      "type": "string",
                      "description": "normal | dry | loose | none, or the Vietnamese labels"
                    },
                    "waterIntake": {
                      "type": "string",
                      "description": "normal | high | low, or the Vietnamese labels"
                    },
                    "behaviourNote": {
                      "type": "string"
                    },
                    "observation": {
                      "type": "object",
                      "description": "The same fields may instead be nested here"
                    },
                    "notes": {
                      "type": "string",
                      "description": "Alias of behaviourNote"
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/DailyTask"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/stable/tasks/{id}/incident": {
        "post": {
          "tags": [
            "Stable (Groom)"
          ],
          "summary": "Report an incident with optional photo evidence (Groom)",
          "description": "Opens the report (status open) and notifies the horse's vet and trainer.",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "multipart/form-data": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "description": {
                      "type": "string"
                    },
                    "severity": {
                      "type": "string",
                      "enum": [
                        "low",
                        "medium",
                        "high"
                      ]
                    },
                    "images": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "format": "binary"
                      },
                      "description": "Up to 5 images"
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/DailyTask"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/stable/incidents": {
        "get": {
          "tags": [
            "Stable (Groom)"
          ],
          "summary": "Incident reports as a working list",
          "description": "Returns the DailyTasks that carry an incident report, newest report first. Veterinarian and Head Trainer: reports on the horses assigned to them. Groom: the ones they filed. Owner: their own horses. Manager: all. An unresolved medium/high report from the last 3 days turns the training readiness `medical` gate amber.",
          "parameters": [
            {
              "name": "horse",
              "in": "query",
              "required": false,
              "schema": {
                "type": "string"
              },
              "description": "Filter by horse id"
            },
            {
              "name": "status",
              "in": "query",
              "schema": {
                "type": "string",
                "enum": [
                  "open",
                  "acknowledged",
                  "resolved",
                  "unresolved"
                ]
              },
              "description": "`unresolved` = everything still waiting on a vet"
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/DailyTask"
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/stable/incidents/{id}": {
        "patch": {
          "tags": [
            "Stable (Groom)"
          ],
          "summary": "The vet's answer to an incident report (Veterinarian)",
          "description": "`id` is the DailyTask id. `acknowledged` = seen, being looked at; `resolved` needs a `response`. The groom who reported it and the horse's trainer are notified. Filing a health record for the horse resolves its open reports automatically.",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "enum": [
                        "acknowledged",
                        "resolved"
                      ],
                      "default": "resolved"
                    },
                    "response": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/DailyTask"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "409": {
              "description": "Conflict (e.g. duplicate, or horse under an active training lock)",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/stable/assignments": {
        "get": {
          "tags": [
            "Stable (Groom)"
          ],
          "summary": "List stable/stall assignments",
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/StableAssignment"
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "post": {
          "tags": [
            "Stable (Groom)"
          ],
          "summary": "Create/update stall assignment for a horse (Manager, Head Trainer)",
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/StableAssignment"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "Created",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/StableAssignment"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/stable/assignments/{id}": {
        "delete": {
          "tags": [
            "Stable (Groom)"
          ],
          "summary": "Remove stall assignment (Manager)",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "nullable": true
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/feeding": {
        "get": {
          "tags": [
            "Feeding (scaffold)"
          ],
          "summary": "List feeding schedules",
          "parameters": [
            {
              "name": "horse",
              "in": "query",
              "required": false,
              "schema": {
                "type": "string"
              },
              "description": "Filter by horse id"
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/FeedingSchedule"
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "post": {
          "tags": [
            "Feeding (scaffold)"
          ],
          "summary": "Create feeding schedule (Head Trainer, Manager)",
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/FeedingSchedule"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "Created",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/FeedingSchedule"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/feeding/{id}": {
        "get": {
          "tags": [
            "Feeding (scaffold)"
          ],
          "summary": "Get feeding schedule",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/FeedingSchedule"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "put": {
          "tags": [
            "Feeding (scaffold)"
          ],
          "summary": "Update feeding schedule (Head Trainer, Manager)",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/FeedingSchedule"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/FeedingSchedule"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "delete": {
          "tags": [
            "Feeding (scaffold)"
          ],
          "summary": "Delete feeding schedule (Manager)",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "nullable": true
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/inventory": {
        "get": {
          "tags": [
            "Inventory (scaffold)"
          ],
          "summary": "List inventory items",
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/InventoryItem"
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "post": {
          "tags": [
            "Inventory (scaffold)"
          ],
          "summary": "Create inventory item (Manager)",
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/InventoryItem"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "Created",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/InventoryItem"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/inventory/{id}": {
        "get": {
          "tags": [
            "Inventory (scaffold)"
          ],
          "summary": "Get inventory item",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/InventoryItem"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "put": {
          "tags": [
            "Inventory (scaffold)"
          ],
          "summary": "Update inventory item (Manager)",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/InventoryItem"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/InventoryItem"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "delete": {
          "tags": [
            "Inventory (scaffold)"
          ],
          "summary": "Delete inventory item (Manager)",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "nullable": true
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/inventory/{id}/restock-request": {
        "post": {
          "tags": [
            "Inventory (scaffold)"
          ],
          "summary": "Request a restock (Groom, Head Trainer, Veterinarian)",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "quantity": {
                      "type": "number"
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/InventoryItem"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/inventory/{id}/restock-requests/{reqId}": {
        "patch": {
          "tags": [
            "Inventory (scaffold)"
          ],
          "summary": "Approve or reject a pending restock request (Manager) — approving adds the quantity to stock",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            },
            {
              "name": "reqId",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              },
              "description": "The restockRequests sub-document id"
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "status"
                  ],
                  "properties": {
                    "status": {
                      "type": "string",
                      "enum": [
                        "approved",
                        "rejected"
                      ]
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/InventoryItem"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            },
            "409": {
              "description": "Conflict (e.g. duplicate, or horse under an active training lock)",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/races": {
        "get": {
          "tags": [
            "Races (scaffold)"
          ],
          "summary": "List race entries",
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/RaceEntry"
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "post": {
          "tags": [
            "Races (scaffold)"
          ],
          "summary": "Register a horse for a race (Head Trainer) — 409 if the vet has grounded the horse (training lock, injured, quarantined)",
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/RaceEntry"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "Created",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/RaceEntry"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/races/{id}": {
        "get": {
          "tags": [
            "Races (scaffold)"
          ],
          "summary": "Get race entry",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/RaceEntry"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "put": {
          "tags": [
            "Races (scaffold)"
          ],
          "summary": "Update race entry (Head Trainer)",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/RaceEntry"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/RaceEntry"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "delete": {
          "tags": [
            "Races (scaffold)"
          ],
          "summary": "Delete race entry (Head Trainer, Manager)",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "nullable": true
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/finance/mine/summary": {
        "get": {
          "tags": [
            "Finance (scaffold)"
          ],
          "summary": "Owner's periodic statement: cost, medical and revenue per month or quarter",
          "description": "Totals for the owner's horses over one year: `periods` (12 months or 4 quarters, each with cost, revenue, net, medicalCost, exams, treatments, byCategory), `byHorse`, `byCategory` and `totals`. medicalCost is spending in the \"medical\" category; exams / treatments count the health records and treatments in the period.",
          "parameters": [
            {
              "name": "period",
              "in": "query",
              "schema": {
                "type": "string",
                "enum": [
                  "month",
                  "quarter"
                ],
                "default": "month"
              }
            },
            {
              "name": "year",
              "in": "query",
              "schema": {
                "type": "integer"
              },
              "description": "Defaults to the current year"
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "object"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/finance/mine": {
        "get": {
          "tags": [
            "Finance (scaffold)"
          ],
          "summary": "Owner's own cost/revenue records",
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/FinancialRecord"
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/finance": {
        "get": {
          "tags": [
            "Finance (scaffold)"
          ],
          "summary": "List all financial records (Manager)",
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/FinancialRecord"
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "post": {
          "tags": [
            "Finance (scaffold)"
          ],
          "summary": "Record a cost/revenue entry (Manager)",
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/FinancialRecord"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "Created",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/FinancialRecord"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/finance/{id}": {
        "get": {
          "tags": [
            "Finance (scaffold)"
          ],
          "summary": "Get financial record (Manager)",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/FinancialRecord"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "put": {
          "tags": [
            "Finance (scaffold)"
          ],
          "summary": "Update financial record (Manager)",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/FinancialRecord"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/FinancialRecord"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "delete": {
          "tags": [
            "Finance (scaffold)"
          ],
          "summary": "Delete financial record (Manager)",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "nullable": true
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/notifications": {
        "get": {
          "tags": [
            "Notifications"
          ],
          "summary": "List my notifications (addressed to me or to my role)",
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/Notification"
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/notifications/read-all": {
        "patch": {
          "tags": [
            "Notifications"
          ],
          "summary": "Mark all of my notifications as read",
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "object",
                        "properties": {
                          "matched": {
                            "type": "integer"
                          }
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/notifications/{id}/read": {
        "patch": {
          "tags": [
            "Notifications"
          ],
          "summary": "Mark a notification as read",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "$ref": "#/components/schemas/Notification"
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "404": {
              "description": "Not found",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/audit-logs": {
        "get": {
          "tags": [
            "Audit Log (Manager)"
          ],
          "summary": "Paginated system audit trail",
          "parameters": [
            {
              "name": "page",
              "in": "query",
              "schema": {
                "type": "integer",
                "default": 1
              }
            },
            {
              "name": "limit",
              "in": "query",
              "schema": {
                "type": "integer",
                "default": 50
              }
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "object",
                        "properties": {
                          "items": {
                            "type": "array",
                            "items": {
                              "$ref": "#/components/schemas/AuditLog"
                            }
                          },
                          "total": {
                            "type": "integer"
                          },
                          "page": {
                            "type": "integer"
                          },
                          "limit": {
                            "type": "integer"
                          }
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/reports/overview": {
        "get": {
          "tags": [
            "Reports (Manager)"
          ],
          "summary": "Aggregated training performance, operating cost, and race revenue/participation report",
          "parameters": [
            {
              "name": "from",
              "in": "query",
              "schema": {
                "type": "string",
                "format": "date"
              },
              "description": "Period start (ISO date), applied to session/finance/race dates"
            },
            {
              "name": "to",
              "in": "query",
              "schema": {
                "type": "string",
                "format": "date"
              },
              "description": "Period end (ISO date)"
            }
          ],
          "responses": {
            "200": {
              "description": "OK",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": true
                      },
                      "data": {
                        "type": "object",
                        "properties": {
                          "period": {
                            "type": "object",
                            "properties": {
                              "from": {
                                "type": "string",
                                "nullable": true
                              },
                              "to": {
                                "type": "string",
                                "nullable": true
                              }
                            }
                          },
                          "trainingPerformance": {
                            "type": "object",
                            "properties": {
                              "totalSessions": {
                                "type": "integer"
                              },
                              "sessionsByStatus": {
                                "type": "object",
                                "additionalProperties": {
                                  "type": "integer"
                                }
                              },
                              "avgPerformanceRating": {
                                "type": "number",
                                "nullable": true
                              },
                              "ratedSessionCount": {
                                "type": "integer"
                              }
                            }
                          },
                          "operatingCost": {
                            "type": "object",
                            "properties": {
                              "total": {
                                "type": "number"
                              },
                              "byCategory": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "properties": {
                                    "category": {
                                      "type": "string"
                                    },
                                    "total": {
                                      "type": "number"
                                    }
                                  }
                                }
                              }
                            }
                          },
                          "raceRevenue": {
                            "type": "object",
                            "properties": {
                              "total": {
                                "type": "number"
                              },
                              "byCategory": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "properties": {
                                    "category": {
                                      "type": "string"
                                    },
                                    "total": {
                                      "type": "number"
                                    }
                                  }
                                }
                              }
                            }
                          },
                          "raceParticipation": {
                            "type": "object",
                            "properties": {
                              "totalEntries": {
                                "type": "integer"
                              },
                              "byStatus": {
                                "type": "object",
                                "additionalProperties": {
                                  "type": "integer"
                                }
                              }
                            }
                          }
                        }
                      },
                      "message": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "403": {
              "description": "Forbidden for this role",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "success": {
                        "type": "boolean",
                        "example": false
                      },
                      "data": {
                        "nullable": true,
                        "example": null
                      },
                      "message": {
                        "type": "string",
                        "example": "Something went wrong."
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  "customOptions": {}
};
  url = options.swaggerUrl || url
  var urls = options.swaggerUrls
  var customOptions = options.customOptions
  var spec1 = options.swaggerDoc
  var swaggerOptions = {
    spec: spec1,
    url: url,
    urls: urls,
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [
      SwaggerUIBundle.presets.apis,
      SwaggerUIStandalonePreset
    ],
    plugins: [
      SwaggerUIBundle.plugins.DownloadUrl
    ],
    layout: "StandaloneLayout"
  }
  for (var attrname in customOptions) {
    swaggerOptions[attrname] = customOptions[attrname];
  }
  var ui = SwaggerUIBundle(swaggerOptions)

  if (customOptions.oauth) {
    ui.initOAuth(customOptions.oauth)
  }

  if (customOptions.preauthorizeApiKey) {
    const key = customOptions.preauthorizeApiKey.authDefinitionKey;
    const value = customOptions.preauthorizeApiKey.apiKeyValue;
    if (!!key && !!value) {
      const pid = setInterval(() => {
        const authorized = ui.preauthorizeApiKey(key, value);
        if(!!authorized) clearInterval(pid);
      }, 500)

    }
  }

  if (customOptions.authAction) {
    ui.authActions.authorize(customOptions.authAction)
  }

  window.ui = ui
}
