export type ContactMethod = "email" | "phone" | "whatsapp";

export type LeadTemperature = "LOW" | "MEDIUM" | "HOT";

export type LeadStatus =
  | "NEW"
  | "QUALIFIED"
  | "CONTACTED"
  | "MEETING_BOOKED"
  | "PROPOSAL_SENT"
  | "WON"
  | "LOST"
  | "BAD_FIT";

export type Lead = {
  name: string;
  company: string;
  email: string;
  phone: string;
  location: string;
  serviceNeed: string;
  monthlyLeadGoal: string;
  revenueRange: string;
  employeeCount: string;
  biggestChallenge: string;
  preferredContactMethod: ContactMethod;
  honeypot?: string;
  message?: string;
};

export type StoredLead = Lead & {
  id: string;
  score: number;
  temperature: LeadTemperature;
  status: LeadStatus;
  created_at: string;
};
