export interface ExcludedContact {
  contactId: string;
  name: string;
  reason: string;
  excludedSince: string;
}

export const EXCLUDED_CONTACTS: ExcludedContact[] = [
  {
    contactId: "9313151",
    name: "Jeremy Levitt / Baden Bower",
    reason: "Partner and existing client. Deals reflect workflow testing and automated re-enrollment sweeps (bulk timestamp 2026-05-13 09:00), not genuine form-fill activity.",
    excludedSince: "2026-05-28",
  },
];
