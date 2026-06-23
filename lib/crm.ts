import type { Lead, LeadTemperature } from "@/types/lead";

export function calculateLeadScore(lead: Lead): number {
  let score = 0;

  if (lead.phone.trim()) score += 15;
  if (lead.email.trim()) score += 10;
  if (lead.location.trim()) score += 10;

  if (["10-25", "25+"].includes(lead.monthlyLeadGoal)) score += 25;
  if (["putkiremontit", "taloyhtiotyot", "lammitysjarjestelmat"].includes(lead.serviceNeed)) score += 25;
  if (["500k-1.5m", "1.5m+"].includes(lead.revenueRange)) score += 15;

  return Math.min(score, 100);
}

export function getLeadTemperature(score: number): LeadTemperature {
  if (score >= 70) return "HOT";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}
