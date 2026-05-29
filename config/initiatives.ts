export interface Motion {
  label: string;
  dateFrom: string;
  dateTo?: string;
  seqCostPerMeeting: number;
  description: string;
  sequenceName?: string;
  maturityDays?: number;
  taskQueue?: string;
}

export interface EntryStage {
  stageId: string;
  property: string;
  name: string;
}

export interface Baseline {
  show_rate_proxy: number;
  no_show_rate_proxy: number;
  zoom_booked_april: number;
  missed_zoom_april: number;
  measurement_note: string;
}

export interface Initiative {
  id: string;
  name: string;
  entryStageId?: string;
  entryProperty?: string;
  entryStages?: EntryStage[];
  distinguishingProperty?: {
    level: string;
    propertyName: string;
    filter: string;
  };
  oldMotion: Motion;
  newMotion: Motion;
  primaryMetrics?: string[];
  baseline?: Baseline;
  notYetLaunched?: boolean;
  meetingAfterEntryOnly?: boolean;
}

export const INITIATIVES: Initiative[] = [
  {
    id: "01",
    name: "Form Fill / No Call Booked",
    entryStageId: "28807353",
    entryProperty: "hs_v2_date_entered_28807353",
    oldMotion: {
      label: "Old process",
      dateFrom: "2026-01-06",
      dateTo: "2026-05-16",
      seqCostPerMeeting: 0,
      description: "Email-only sequence, inbound AE ownership",
    },
    newMotion: {
      label: "New initiative",
      dateFrom: "2026-05-19",
      seqCostPerMeeting: 60,
      description: "Email + 3 call tasks, outbound SDR ownership, 5hr trigger",
      sequenceName: "Form Submitted – No Call Booked",
      maturityDays: 42,
    },
  },
  {
    id: "02",
    name: "Missed Zoom Call",
    entryStageId: "28817239",
    entryProperty: "hs_v2_date_entered_28817239",
    meetingAfterEntryOnly: true, // only count rebooked meetings (zoom date AFTER missed zoom date)
    oldMotion: {
      label: "Old process",
      dateFrom: "2026-01-01",
      dateTo: "2026-05-27",
      seqCostPerMeeting: 0,
      description: "Email-only, inbound AE ownership",
    },
    newMotion: {
      label: "New initiative",
      dateFrom: "2026-05-28",
      seqCostPerMeeting: 60,
      description: "Email + call tasks, outbound SDR ownership",
      maturityDays: 42,
    },
  },
  {
    id: "03",
    name: "TZ Rebook",
    entryStageId: "28817239",
    entryProperty: "hs_v2_date_entered_28817239",
    distinguishingProperty: {
      level: "contact",
      propertyName: "check_discovery_call_time___email_content",
      filter: "HAS_PROPERTY",
    },
    oldMotion: {
      label: "Old process (email only)",
      dateFrom: "2026-02-22",
      dateTo: "2026-04-07",
      seqCostPerMeeting: 0,
      description: "Email advising contact to rebook if timezone was incorrect. No calls.",
    },
    newMotion: {
      label: "New initiative (outbound calls)",
      dateFrom: "2026-04-08",
      seqCostPerMeeting: 60,
      description: "SDR call tasks via 'Rebook TZ' task queue. Active outreach to rebook.",
      maturityDays: 42,
      taskQueue: "Rebook TZ",
    },
  },
  {
    id: "04",
    name: "48hr Call Tasks",
    entryStages: [
      { stageId: "22600467", property: "hs_v2_date_entered_22600467", name: "Getting Billing Details" },
      { stageId: "5423787", property: "hs_v2_date_entered_5423787", name: "Recruiting" },
    ],
    oldMotion: {
      label: "Old process",
      dateFrom: "2026-01-01",
      dateTo: "2026-04-27",
      seqCostPerMeeting: 0,
      description: "No automated follow-up for stuck deals. Manual AE responsibility.",
    },
    newMotion: {
      label: "New initiative",
      dateFrom: "2026-04-28",
      seqCostPerMeeting: 0,
      description: "48hr task reminder created for deal owner when no client response",
      maturityDays: 42,
    },
    primaryMetrics: ["median_days_to_advance", "cl_rate_from_stage", "active_client_conversion"],
  },
  {
    id: "05",
    name: "Pre-Meeting Email",
    entryStageId: "13542462",
    entryProperty: "hs_v2_date_entered_13542462",
    notYetLaunched: true,
    oldMotion: {
      label: "Current state (no pre-meeting email)",
      dateFrom: "2026-01-01",
      dateTo: "TBD",
      seqCostPerMeeting: 0,
      description: "Generic post-booking confirmation email only",
    },
    newMotion: {
      label: "New initiative (personalised pre-meeting email + video)",
      dateFrom: "TBD",
      seqCostPerMeeting: 0,
      description: "Branded video + top 3 FAQs + trust content sent after booking",
      maturityDays: 14,
    },
    baseline: {
      show_rate_proxy: 58.7,
      no_show_rate_proxy: 41.3,
      zoom_booked_april: 1708,
      missed_zoom_april: 706,
      measurement_note:
        "Proxy only — Missed Zoom in April includes some March bookings. True rate requires matching booking and miss dates within same window.",
    },
  },
];

export const STAGE_IDS = {
  LEAD: "appointmentscheduled",
  ENROLLED_IN_SEQUENCE: "28807353",
  ZOOM_CALL_BOOKED: "13542462",
  MISSED_ZOOM_CALL: "28817239",
  GETTING_BILLING_DETAILS: "22600467",
  RECRUITING: "5423787",
  RESUMES_SENT: "5568500",
  INTERVIEW_SCHEDULED: "12635527",
  AGREEMENT_SENT: "13812915",
  CLOSED_LOST: "28817241",
  DO_NOT_CONTACT: "16160504",
  ACTIVE_CLIENT: "12751919",
  TERMINATED: "12751924",
} as const;

export const POST_BILLING_STAGES = [
  STAGE_IDS.RECRUITING,
  STAGE_IDS.RESUMES_SENT,
  STAGE_IDS.INTERVIEW_SCHEDULED,
  STAGE_IDS.AGREEMENT_SENT,
];
