export interface Deal {
  id: string;
  properties: {
    pipeline: string | null;
    dealstage: string | null;
    createdate: string | null;
    // Stage entry dates
    hs_v2_date_entered_appointmentscheduled: string | null; // Lead
    hs_v2_date_entered_28807353: string | null;             // Enrolled in Sequence
    hs_v2_date_entered_13542462: string | null;             // Zoom Call Booked
    hs_v2_date_entered_1063655701: string | null;           // Parking Lot
    hs_v2_date_entered_28817239: string | null;             // Missed Zoom Call
    hs_v2_date_entered_22600467: string | null;             // Getting Billing Details
    hs_v2_date_entered_5423787: string | null;              // Recruiting
    hs_v2_date_entered_5568500: string | null;              // Resumes Sent
    hs_v2_date_entered_12635527: string | null;             // Interview Scheduled
    hs_v2_date_entered_13812915: string | null;             // Agreement Sent
    hs_v2_date_entered_28817241: string | null;             // Closed Lost
    hs_v2_date_entered_12751919: string | null;             // Active Client
    hs_v2_date_entered_16160504: string | null;             // DNC
  };
}

export interface MonthlyMetrics {
  month: string; // "2026-05"
  // Sales Pipeline Activity (each metric anchored on its own stage date)
  callsBooked: number;
  noShows: number;
  attended: number;
  billingEntered: number;
  parkingLot: number;
  dropOffs: number;
  dropRate: number;
  closedWon: number;
  activeClient: number;
  closedLost: number;
  // Missed Zoom breakdown (for deals where missed zoom date is in this month)
  missedZoom_cl: number;
  missedZoom_rebooked: number;
  missedZoom_open: number;
  // Billing breakdown (for deals where billing date is in this month)
  billing_cl: number;
  billing_progressed: number;
  billing_active: number;
  // Post-billing sub-stage activity
  recruiting: number;
  resumesSent: number;
  interviewScheduled: number;
  agreementSent: number;
  // Cohort: deals where Lead date is in this month
  cohort_leads: number;
  cohort_bookRate: number;
  cohort_noShowRate: number;
  cohort_pipelineRate: number;
  cohort_activeRate: number;
  cohort_daysOld: number;
  cohort_maturity: "too_early" | "immature" | "partial" | "mature";
}

export interface CohortMetrics {
  enrolled: number;
  meetingRate: number;
  pipelineRate: number;
  activeRate: number;
  clNoMeetingRate: number;
  rebookRate: number;       // Init 02, 03
  billingClRate: number;    // Init 04
  avgDaysToPipeline: number; // Init 04
  cohortAgeDays: number;
  isMature: boolean;
}

export interface InitiativeSnapshot {
  id: string;
  old: CohortMetrics;
  new: CohortMetrics;
}

export interface CacheData {
  lastRefreshed: string;
  dealCount: number;
  defaultPipelineDealCount: number;
  activeClientDealCount: number;
  deals: Deal[];
  computed: {
    byMonth: Record<string, MonthlyMetrics>;
  };
  initiatives: Record<string, InitiativeSnapshot>;
}
