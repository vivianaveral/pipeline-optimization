export const STAGE_IDS = {
  LEAD:             "appointmentscheduled",
  ENROLLED_IN_SEQ:  "28807353",
  ZOOM_CALL_BOOKED: "13542462",
  PARKING_LOT:      "1063655701",
  MISSED_ZOOM_CALL: "28817239",
  GETTING_BILLING:  "22600467",
  RECRUITING:       "5423787",
  RESUMES_SENT:     "5568500",
  INTERVIEW_SCHED:  "12635527",
  AGREEMENT_SENT:   "13812915",
  CLOSED_LOST:      "28817241",
  ACTIVE_CLIENT:    "12751919",
  DNC:              "16160504",
} as const;

// Properties to request from HubSpot on every deal
export const DEAL_PROPERTIES = [
  "pipeline",
  "dealstage",
  "createdate",
  `hs_v2_date_entered_${STAGE_IDS.LEAD}`,
  `hs_v2_date_entered_${STAGE_IDS.ENROLLED_IN_SEQ}`,
  `hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`,
  `hs_v2_date_entered_${STAGE_IDS.PARKING_LOT}`,
  `hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`,
  `hs_v2_date_entered_${STAGE_IDS.GETTING_BILLING}`,
  `hs_v2_date_entered_${STAGE_IDS.RECRUITING}`,
  `hs_v2_date_entered_${STAGE_IDS.RESUMES_SENT}`,
  `hs_v2_date_entered_${STAGE_IDS.INTERVIEW_SCHED}`,
  `hs_v2_date_entered_${STAGE_IDS.AGREEMENT_SENT}`,
  `hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`,
  `hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`,
  `hs_v2_date_entered_${STAGE_IDS.DNC}`,
];

export const EXCLUDED_CONTACT_IDS = ["9313151"]; // Jeremy Levitt / Baden Bower
