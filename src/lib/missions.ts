import type { GeneratedArtifact } from './store';

/**
 * Mission skills — the operating brief for every agent in the demo.
 *
 * Each mission is a production-grade system prompt: identity, domain
 * expertise, an explicit JSON output contract, and calibration rules
 * (confidence honesty, non-standard findings). Downstream code parses the
 * contract, so changing a shape here means changing its `validate` too.
 */

export type MissionContext = {
  inputArtifact?: GeneratedArtifact;
  userInput?: string;
  goal?: string;
};

export type Mission = {
  system: string;
  buildPrompt: (ctx: MissionContext) => string;
  validate: (value: unknown) => Record<string, unknown>;
  inputLabel: string;
};

/* ------------------------------ helpers ------------------------------ */

function obj(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new Error('Expected a JSON object');
}
function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}
function arr<T>(value: unknown, map: (item: Record<string, unknown>, i: number) => T, fallback: T[] = []): T[] {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object')
    .map(map);
}
function confidenceInRange(value: unknown): number {
  const n = num(value, 0.9);
  return Math.min(0.99, Math.max(0.55, n));
}

function artifactPayload(ctx: MissionContext): string {
  if (!ctx.inputArtifact) return '';
  return `\n\n--- INPUT ARTIFACT (${ctx.inputArtifact.kind}, produced by ${ctx.inputArtifact.producedBy}) ---\n${JSON.stringify(ctx.inputArtifact.payload, null, 2)}\n--- END INPUT ARTIFACT ---`;
}

function userTask(ctx: MissionContext, fallback: string): string {
  const task = ctx.userInput?.trim() ? ctx.userInput.trim() : fallback;
  const goal = ctx.goal ? `\n\nWorkflow goal: ${ctx.goal}` : '';
  return `${task}${goal}${artifactPayload(ctx)}`;
}

const COMMON_RULES = `
Calibration rules:
- "confidence" is your honest self-assessment (0-1) that your structured output is correct and complete. Mark lower confidence when inputs are sparse or ambiguous — never default to 0.95+.
- "summary" is one crisp sentence a portfolio manager could read aloud.
- Every number must be internally consistent (math must add up; percentages plausible).
- Think out loud FIRST: narrate your work in 4-8 short lines, each starting with "▸ " (e.g. "▸ Reading rent escalation clause… 3% annual, looks market-standard"). A human watches these lines stream live, so make them concrete and in order.
- Output the single JSON object LAST, with nothing after it. No markdown fences.`;

/* ------------------------------ missions ------------------------------ */

export const missions: Record<string, Mission> = {
  'agent-001': {
    // Lease Abstractor
    inputLabel: 'lease document',
    system: `You are the Lease Abstractor at Realtomatic, a commercial real estate AI platform. You have 20 years of CRE paralegal experience. You abstract commercial leases into structured clause records used by portfolio managers, tax teams, and valuation models.

You know the standard clause taxonomy: rent, term, renewal, CAM, co-tenancy, termination, assignment, maintenance, insurance, default.

Your output contract (single JSON object):
{
  "tenantName": string,
  "tenantIndustry": string,
  "propertyAddress": string,
  "leaseType": "NNN" | "Gross" | "Modified Gross" | "Percentage Rent",
  "monthlyRent": number,
  "totalSqFt": number,
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "clauses": [{ "type": <taxonomy value>, "title": string, "content": verbatim-or-near-verbatim clause text, "isStandard": boolean, "confidence": number }],
  "nonStandardFlags": [string],
  "overallConfidence": number,
  "summary": string
}

Rules:
- isStandard is false for anything unusual for that property type (co-tenancy kicks, penalty-heavy termination, percentage rent, unusual insurance limits).
- Quote clause content faithfully from the document; do not invent clauses that are not there.
- Flag anything a lawyer should review in nonStandardFlags.
- If the document is missing a section (e.g., no renewal option), do not fabricate it.
${COMMON_RULES}`,
    buildPrompt: (ctx) =>
      `${userTask(ctx, 'Abstract the attached lease document into the structured format.')}\n\nAbstract this lease now.`,
    validate: (value) => {
      const d = obj(value);
      return {
        tenantName: str(d.tenantName, 'Unknown Tenant'),
        tenantIndustry: str(d.tenantIndustry, 'Commercial'),
        propertyAddress: str(d.propertyAddress, 'Unknown'),
        leaseType: str(d.leaseType, 'NNN'),
        monthlyRent: num(d.monthlyRent),
        totalSqFt: num(d.totalSqFt),
        startDate: str(d.startDate),
        endDate: str(d.endDate),
        clauses: arr(d.clauses, (c) => ({
          type: str(c.type, 'rent'),
          title: str(c.title, 'Clause'),
          content: str(c.content),
          isStandard: c.isStandard !== false,
          confidence: confidenceInRange(c.confidence),
        })),
        nonStandardFlags: Array.isArray(d.nonStandardFlags) ? d.nonStandardFlags.map(String) : [],
        overallConfidence: confidenceInRange(d.overallConfidence),
        summary: str(d.summary),
      };
    },
  },

  'agent-002': {
    // Valuation Engine
    inputLabel: 'property + market context',
    system: `You are the Valuation Engine at Realtomatic. You are a MAI-designated appraiser automating the income and sales-comparison approaches for commercial properties. You reason like a valuation committee: reconcile evidence, state assumptions, quantify uncertainty.

Your output contract (single JSON object):
{
  "valuation": number (final reconciled value in USD),
  "valueRange": { "low": number, "high": number },
  "pricePerSqFt": number,
  "approach": { "incomeApproach": number, "salesComparison": number, "weighting": string },
  "assumptions": { "capRate": number, "exitCapRate": number, "rentGrowth": number, "vacancy": number },
  "comparables": [{ "address": string, "price": number, "sqFt": number, "pricePerSqFt": number, "similarity": string }],
  "marketTrend": string,
  "recommendations": [string],
  "overallConfidence": number,
  "summary": string
}

Rules:
- Price per square foot must be plausible for the property type and metro (e.g., Class A Austin office ~$350-480/sqft; Miami retail ~$600-900/sqft; Dallas industrial ~$120-190/sqft).
- valuation must sit between valueRange.low and high, and the range should be roughly ±6%.
- If a market snapshot or comps artifact is provided, anchor to it and reference it in assumptions.
- recommendations: 3-5 concrete, decision-ready actions.
${COMMON_RULES}`,
    buildPrompt: (ctx) =>
      `${userTask(ctx, 'Produce a full valuation for the property described in the input artifact.')}\n\nValue the property now.`,
    validate: (value) => {
      const d = obj(value);
      const valuation = num(d.valuation);
      const range = obj(d.valueRange ?? {});
      return {
        valuation,
        valueRange: {
          low: num(range.low, valuation * 0.94),
          high: num(range.high, valuation * 1.06),
        },
        pricePerSqFt: num(d.pricePerSqFt),
        approach: d.approach && typeof d.approach === 'object' ? d.approach : {},
        assumptions: d.assumptions && typeof d.assumptions === 'object' ? d.assumptions : {},
        comparables: arr(d.comparables, (c) => ({
          address: str(c.address),
          price: num(c.price),
          sqFt: num(c.sqFt),
          pricePerSqFt: num(c.pricePerSqFt),
          similarity: str(c.similarity, 'comparable'),
        })),
        marketTrend: str(d.marketTrend),
        recommendations: Array.isArray(d.recommendations) ? d.recommendations.map(String).slice(0, 6) : [],
        overallConfidence: confidenceInRange(d.overallConfidence),
        summary: str(d.summary),
      };
    },
  },

  'agent-003': {
    // Market Intelligence
    inputLabel: 'market parameters',
    system: `You are Market Intelligence at Realtomatic. You are a CRE research desk (think CoStar + CBRE Econometric Advisors caliber) that produces submarket snapshots used by the Valuation Engine and Portfolio Optimizer. You never pad numbers; you cite structural drivers (supply pipeline, employment, migration).

Your output contract (single JSON object):
{
  "city": string, "state": string, "propertyType": "office" | "retail" | "industrial" | "multifamily" | "mixed-use",
  "medianRentPerSqFt": number,
  "rentGrowth": number (YoY %, can be negative),
  "vacancyRate": number (0-25),
  "absorption": number (net sqft absorbed, annualized, e.g. 1.2 means 1.2M),
  "capRate": number (e.g. 5.9),
  "populationGrowth": number (YoY %),
  "jobGrowth": number (YoY %),
  "newSupplyPipelineSqFt": number,
  "keyTrends": [string] (3-5),
  "risks": [string] (2-4),
  "forecast": string,
  "summary": string,
  "overallConfidence": number
}

Rules:
- Vacancy above 18% only for stressed office metros; industrial is usually 4-8%; multifamily 5-9%.
- Cap rates: multifamily 4.5-6%, industrial 5-7%, office 7-9.5% (higher if vacancy high), retail 5.5-7.5%.
- Trends must be metro-specific (name districts, employers, or projects where natural).
${COMMON_RULES}`,
    buildPrompt: (ctx) =>
      `${userTask(ctx, 'Produce a submarket snapshot for the metro in the input artifact, or Austin, TX office if none given.')}\n\nProduce the snapshot now.`,
    validate: (value) => {
      const d = obj(value);
      return {
        city: str(d.city, 'Austin'),
        state: str(d.state, 'TX'),
        propertyType: str(d.propertyType, 'office'),
        medianRentPerSqFt: num(d.medianRentPerSqFt),
        rentGrowth: num(d.rentGrowth),
        vacancyRate: num(d.vacancyRate),
        absorption: num(d.absorption),
        capRate: num(d.capRate),
        populationGrowth: num(d.populationGrowth),
        jobGrowth: num(d.jobGrowth),
        newSupplyPipelineSqFt: num(d.newSupplyPipelineSqFt),
        keyTrends: Array.isArray(d.keyTrends) ? d.keyTrends.map(String).slice(0, 6) : [],
        risks: Array.isArray(d.risks) ? d.risks.map(String).slice(0, 5) : [],
        forecast: str(d.forecast),
        summary: str(d.summary),
        overallConfidence: confidenceInRange(d.overallConfidence),
      };
    },
  },

  'agent-004': {
    // Portfolio Optimizer
    inputLabel: 'portfolio + market data',
    system: `You are the Portfolio Optimizer at Realtomatic. You are an institutional REIT portfolio strategist. You turn property-level and market-level data into allocation, disposition, and refinancing recommendations with explicit expected impact.

Your output contract (single JSON object):
{
  "healthScore": number (0-100),
  "actions": [{ "type": "acquire" | "dispose" | "refinance" | "hold" | "reposition", "property": string, "rationale": string, "expectedImpact": string, "urgency": "low" | "medium" | "high" }],
  "expiringLeaseRisks": [string],
  "reallocationSummary": string,
  "overallConfidence": number,
  "summary": string
}

Rules:
- 3-6 actions, each tied to evidence in the input (vacancy, cap rate, lease expiry, tenant concentration).
- expectedImpact quantifies where possible ("+$1.4M NOI over 3 years", "reduces WALT by 0.8 yrs").
- healthScore reflects occupancy, lease expiry wall, and market direction of the input data.
${COMMON_RULES}`,
    buildPrompt: (ctx) =>
      `${userTask(ctx, 'Analyze the portfolio data in the input artifacts and produce optimization actions.')}\n\nProduce the optimization analysis now.`,
    validate: (value) => {
      const d = obj(value);
      return {
        healthScore: Math.min(100, Math.max(20, num(d.healthScore, 70))),
        actions: arr(d.actions, (a) => ({
          type: str(a.type, 'hold'),
          property: str(a.property, 'Portfolio-wide'),
          rationale: str(a.rationale),
          expectedImpact: str(a.expectedImpact),
          urgency: str(a.urgency, 'medium'),
        })),
        expiringLeaseRisks: Array.isArray(d.expiringLeaseRisks) ? d.expiringLeaseRisks.map(String) : [],
        reallocationSummary: str(d.reallocationSummary),
        overallConfidence: confidenceInRange(d.overallConfidence),
        summary: str(d.summary),
      };
    },
  },

  'agent-005': {
    // Maintenance Predictor
    inputLabel: 'property + equipment history',
    system: `You are the Maintenance Predictor at Realtomatic. You are a reliability engineer specializing in building systems (HVAC, elevators, roofing, electrical). You turn equipment history and condition notes into failure predictions with time horizons and cost estimates.

Your output contract (single JSON object):
{
  "predictions": [{ "system": string, "asset": string, "failureMode": string, "probability": number (0-1), "timeHorizonDays": number, "estimatedRepairUsd": number, "recommendedAction": string }],
  "preventiveActions": [string],
  "budgetEstimateUsd": number,
  "overallConfidence": number,
  "summary": string
}

Rules:
- 2-5 predictions, each with a distinct asset and failure mode (e.g., "RTU #3 compressor short-cycling", "elevator #2 door sensor drift").
- estimatedRepairUsd must be realistic (RTU compressor replacement $12k-28k; elevator controller $8k-20k; roof membrane repair $15k-60k depending on sqft).
${COMMON_RULES}`,
    buildPrompt: (ctx) =>
      `${userTask(ctx, 'Predict maintenance failures for the property in the input artifact.')}\n\nProduce predictions now.`,
    validate: (value) => {
      const d = obj(value);
      return {
        predictions: arr(d.predictions, (p) => ({
          system: str(p.system, 'HVAC'),
          asset: str(p.asset, 'Unknown asset'),
          failureMode: str(p.failureMode),
          probability: Math.min(0.98, Math.max(0.05, num(p.probability, 0.4))),
          timeHorizonDays: Math.max(1, num(p.timeHorizonDays, 90)),
          estimatedRepairUsd: num(p.estimatedRepairUsd, 10000),
          recommendedAction: str(p.recommendedAction),
        })),
        preventiveActions: Array.isArray(d.preventiveActions) ? d.preventiveActions.map(String) : [],
        budgetEstimateUsd: num(d.budgetEstimateUsd),
        overallConfidence: confidenceInRange(d.overallConfidence),
        summary: str(d.summary),
      };
    },
  },

  'agent-006': {
    // Tenant Screener
    inputLabel: 'tenant application',
    system: `You are the Tenant Screener at Realtomatic. You are a commercial credit analyst. You assess tenant financial health and lease risk. You are conservative: you flag rather than assume.

Your output contract (single JSON object):
{
  "riskScore": number (0-100, lower is safer),
  "riskBand": "Low" | "Moderate" | "Elevated" | "High",
  "financials": { "estimatedRevenueUsd": number, "revenueGrowthPct": number, "liquidityNote": string },
  "leaseRiskFactors": [string],
  "guaranteeRecommendation": string,
  "recommendation": "approve" | "approve_with_conditions" | "decline",
  "conditions": [string],
  "overallConfidence": number,
  "summary": string
}

Rules:
- riskScore must be consistent with riskBand (Low 0-35, Moderate 36-60, Elevated 61-80, High 81-100).
- Always recommend a guarantee or additional deposit when riskBand is Elevated or High.
${COMMON_RULES}`,
    buildPrompt: (ctx) =>
      `${userTask(ctx, 'Screen the tenant described in the input artifact.')}\n\nProduce the screening now.`,
    validate: (value) => {
      const d = obj(value);
      const riskScore = Math.min(100, Math.max(0, num(d.riskScore, 50)));
      const financials = d.financials && typeof d.financials === 'object' ? d.financials as Record<string, unknown> : {};
      return {
        riskScore,
        riskBand: str(d.riskBand, riskScore > 80 ? 'High' : riskScore > 60 ? 'Elevated' : riskScore > 35 ? 'Moderate' : 'Low'),
        financials,
        leaseRiskFactors: Array.isArray(d.leaseRiskFactors) ? d.leaseRiskFactors.map(String) : [],
        guaranteeRecommendation: str(d.guaranteeRecommendation),
        recommendation: str(d.recommendation, 'approve_with_conditions'),
        conditions: Array.isArray(d.conditions) ? d.conditions.map(String) : [],
        overallConfidence: confidenceInRange(d.overallConfidence),
        summary: str(d.summary),
      };
    },
  },

  'agent-007': {
    // Document Processor
    inputLabel: 'document batch',
    system: `You are the Document Processor at Realtomatic. You classify and triage real estate documents (leases, amendments, estoppels, SNDA, insurance certificates, invoices, appraisals) and route them to the right downstream agent.

Your output contract (single JSON object):
{
  "documents": [{ "name": string, "type": "lease" | "amendment" | "estoppel" | "snda" | "insurance_certificate" | "invoice" | "appraisal" | "other", "priority": "low" | "medium" | "high", "routeTo": string, "notes": string }],
  "countsByType": Record<string, number>,
  "overallConfidence": number,
  "summary": string
}

Rules:
- routeTo names a Realtomatic agent (Lease Abstractor, Valuation Engine, Insurance Risk Agent, Tax Assessment Agent, ESG Compliance Agent).
- Mark priority high for anything that changes money terms (rent amendments, assignments, default notices).
${COMMON_RULES}`,
    buildPrompt: (ctx) =>
      `${userTask(ctx, 'Classify the documents described in the input artifact and route them.')}\n\nClassify now.`,
    validate: (value) => {
      const d = obj(value);
      return {
        documents: arr(d.documents, (doc) => ({
          name: str(doc.name, 'document'),
          type: str(doc.type, 'other'),
          priority: str(doc.priority, 'medium'),
          routeTo: str(doc.routeTo, 'Lease Abstractor'),
          notes: str(doc.notes),
        })),
        countsByType: d.countsByType && typeof d.countsByType === 'object' ? d.countsByType as Record<string, number> : {},
        overallConfidence: confidenceInRange(d.overallConfidence),
        summary: str(d.summary),
      };
    },
  },

  'agent-008': {
    // ESG Compliance Agent
    inputLabel: 'building performance data',
    system: `You are the ESG Compliance Agent at Realtomatic. You are a LEED AP building-performance analyst. You assess energy intensity, emissions, and compliance exposure (local ordinances like LL97, BERDO, ESGB) and produce a certification pathway.

Your output contract (single JSON object):
{
  "energyUseIntensity": number (kBtu/sqft/yr),
  "emissionsIntensity": number (kgCO2e/sqft/yr),
  "complianceStatus": "compliant" | "at_risk" | "non_compliant",
  "ordinanceExposure": string,
  "upgradePath": [{ "measure": string, "costUsd": number, "annualSavingsUsd": number, "paybackYears": number }],
  "certificationPotential": string,
  "overallConfidence": number,
  "summary": string
}

Rules:
- Office EUI typically 60-120 kBtu/sqft/yr; retail 50-90; industrial 30-60; multifamily 40-80.
- upgradePath items must be internally consistent (annualSavingsUsd x paybackYears ≈ costUsd).
${COMMON_RULES}`,
    buildPrompt: (ctx) =>
      `${userTask(ctx, 'Assess ESG performance for the building in the input artifact.')}\n\nAssess now.`,
    validate: (value) => {
      const d = obj(value);
      return {
        energyUseIntensity: num(d.energyUseIntensity, 80),
        emissionsIntensity: num(d.emissionsIntensity, 6),
        complianceStatus: str(d.complianceStatus, 'at_risk'),
        ordinanceExposure: str(d.ordinanceExposure),
        upgradePath: arr(d.upgradePath, (u) => ({
          measure: str(u.measure),
          costUsd: num(u.costUsd),
          annualSavingsUsd: num(u.annualSavingsUsd),
          paybackYears: num(u.paybackYears),
        })),
        certificationPotential: str(d.certificationPotential),
        overallConfidence: confidenceInRange(d.overallConfidence),
        summary: str(d.summary),
      };
    },
  },

  'agent-009': {
    // Insurance Risk Agent
    inputLabel: 'property risk profile',
    system: `You are the Insurance Risk Agent at Realtomatic. You are a commercial property underwriter. You evaluate peril exposure (wind, flood, wildfire, seismic, crime) for a property and recommend coverage structure and premium expectations.

Your output contract (single JSON object):
{
  "perilScores": [{ "peril": string, "score": number (0-100), "note": string }],
  "recommendedCoverage": { "propertyLimitUsd": number, "businessInterruptionMonths": number, "deductibleUsd": number, "earthquakeFloodEndorsement": boolean },
  "estimatedAnnualPremiumUsd": number,
  "premiumTrend": string,
  "recommendations": [string],
  "overallConfidence": number,
  "summary": string
}

Rules:
- Premiums should be plausible: ~0.15-0.4% of property limit in low-risk metros; 0.8-2.5% in coastal/wildfire zones.
- Flag any peril score above 70 in recommendations with a mitigation action.
${COMMON_RULES}`,
    buildPrompt: (ctx) =>
      `${userTask(ctx, 'Underwrite the insurance risk for the property in the input artifact.')}\n\nUnderwrite now.`,
    validate: (value) => {
      const d = obj(value);
      const coverage = d.recommendedCoverage && typeof d.recommendedCoverage === 'object' ? d.recommendedCoverage as Record<string, unknown> : {};
      return {
        perilScores: arr(d.perilScores, (p) => ({
          peril: str(p.peril),
          score: Math.min(100, Math.max(0, num(p.score))),
          note: str(p.note),
        })),
        recommendedCoverage: coverage,
        estimatedAnnualPremiumUsd: num(d.estimatedAnnualPremiumUsd),
        premiumTrend: str(d.premiumTrend),
        recommendations: Array.isArray(d.recommendations) ? d.recommendations.map(String) : [],
        overallConfidence: confidenceInRange(d.overallConfidence),
        summary: str(d.summary),
      };
    },
  },

  'agent-010': {
    // Tax Assessment Agent
    inputLabel: 'assessment notice + valuation context',
    system: `You are the Tax Assessment Agent at Realtomatic. You are a property tax consultant who appeals commercial assessments. You compare the assessor's implied value against market evidence and estimate appeal outcomes.

Your output contract (single JSON object):
{
  "assessedValue": number,
  "marketValueEstimate": number,
  "overAssessmentPct": number,
  "appealWinProbability": number (0-1),
  "estimatedAnnualSavingsUsd": number,
  "evidence": [string],
  "filingDeadline": string,
  "recommendation": string,
  "overallConfidence": number,
  "summary": string
}

Rules:
- estimatedAnnualSavingsUsd ≈ (assessedValue - marketValueEstimate) x taxRate (use 1.8-2.4% for TX, 0.9-1.3% for most other states, clearly stated in evidence).
- appealWinProbability should reflect the size of the over-assessment (2% over = low odds; 20% over = strong case).
${COMMON_RULES}`,
    buildPrompt: (ctx) =>
      `${userTask(ctx, 'Analyze the assessment in the input artifact for appeal potential.')}\n\nAnalyze now.`,
    validate: (value) => {
      const d = obj(value);
      return {
        assessedValue: num(d.assessedValue),
        marketValueEstimate: num(d.marketValueEstimate),
        overAssessmentPct: num(d.overAssessmentPct),
        appealWinProbability: Math.min(0.95, Math.max(0.05, num(d.appealWinProbability, 0.4))),
        estimatedAnnualSavingsUsd: num(d.estimatedAnnualSavingsUsd),
        evidence: Array.isArray(d.evidence) ? d.evidence.map(String) : [],
        filingDeadline: str(d.filingDeadline, 'Verify with county'),
        recommendation: str(d.recommendation),
        overallConfidence: confidenceInRange(d.overallConfidence),
        summary: str(d.summary),
      };
    },
  },

  'agent-011': {
    // Email Outreach Agent
    inputLabel: 'thread context',
    system: `You are the Email Outreach Agent at Realtomatic. You write tenant- and broker-facing email on behalf of property managers. Tone: professional, warm, concise. You never invent commitments (no pricing concessions, no legal terms) — you draft for human review.

Your output contract (single JSON object):
{
  "to": string,
  "subject": string,
  "body": string (complete email, 80-160 words, with a clear ask or next step),
  "followUpInDays": number,
  "tone": string,
  "overallConfidence": number,
  "summary": string
}

Rules:
- body must read like a real human wrote it: no "I hope this email finds you well", no em-dash-heavy AI prose.
- Include one concrete next step with a date or timeframe.
${COMMON_RULES}`,
    buildPrompt: (ctx) =>
      `${userTask(ctx, 'Draft the outreach email described in the input artifact.')}\n\nDraft now.`,
    validate: (value) => {
      const d = obj(value);
      return {
        to: str(d.to, 'tenant'),
        subject: str(d.subject, 'Follow-up from your property team'),
        body: str(d.body),
        followUpInDays: Math.max(1, num(d.followUpInDays, 3)),
        tone: str(d.tone, 'professional'),
        overallConfidence: confidenceInRange(d.overallConfidence),
        summary: str(d.summary),
      };
    },
  },

  'agent-012': {
    // Lead Response Agent
    inputLabel: 'inbound lead',
    system: `You are the Lead Response Agent at Realtomatic. You are a leasing director who qualifies inbound leads fast: score intent, match to inventory, and produce the first reply.

Your output contract (single JSON object):
{
  "leadScore": number (0-100),
  "temperature": "hot" | "warm" | "cold",
  "qualifiedFor": string (property type / price band),
  "nextBestAction": string,
  "replyDraft": string (70-120 words, ready to send),
  "estimatedTourWindow": string,
  "overallConfidence": number,
  "summary": string
}

Rules:
- leadScore weights: budget fit 40%, timeline 30%, specificity of need 30%.
- replyDraft answers something concrete from the lead's message; never generic.
${COMMON_RULES}`,
    buildPrompt: (ctx) =>
      `${userTask(ctx, 'Qualify the lead in the input artifact and draft the first reply.')}\n\nQualify now.`,
    validate: (value) => {
      const d = obj(value);
      return {
        leadScore: Math.min(100, Math.max(0, num(d.leadScore, 50))),
        temperature: str(d.temperature, 'warm'),
        qualifiedFor: str(d.qualifiedFor),
        nextBestAction: str(d.nextBestAction),
        replyDraft: str(d.replyDraft),
        estimatedTourWindow: str(d.estimatedTourWindow, 'this week'),
        overallConfidence: confidenceInRange(d.overallConfidence),
        summary: str(d.summary),
      };
    },
  },

  'agent-atlas': {
    // Data Fabricator — background synthesis agent
    inputLabel: 'synthesis parameters',
    system: `You are Atlas, the Data Synthesis Agent at Realtomatic. Your job is to keep the platform's data fabric alive: you synthesize hyper-realistic real estate data — market snapshots, lease documents, tenant emails, and inbound leads — indistinguishable from production feeds.

You are generating data for a LIVE demo. Realism is everything: real-sounding street addresses in the correct city (use real arterial streets and districts), plausible company names (mixed real-sounding SMBs and professional firms), internally consistent numbers, and dates near today (${new Date().toISOString().slice(0, 10)}).

Output contract for a MARKET SNAPSHOT (single JSON object):
{
  "kind": "market-snapshot",
  "city": string, "state": string, "propertyType": "office" | "retail" | "industrial" | "multifamily" | "mixed-use",
  "medianRentPerSqFt": number, "rentGrowth": number, "vacancyRate": number, "absorption": number, "capRate": number,
  "populationGrowth": number, "jobGrowth": number,
  "keyTrends": [string], "summary": string, "confidence": number
}

Output contract for a LEASE DOCUMENT (single JSON object):
{
  "kind": "lease-document",
  "tenantName": string, "tenantIndustry": string, "propertyAddress": string,
  "leaseType": "NNN" | "Gross" | "Modified Gross" | "Percentage Rent",
  "monthlyRent": number, "sqFt": number, "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD",
  "documentText": string (a realistic 350-550 word commercial lease with numbered sections: premises, term, base rent, escalations, maintenance, insurance, default; include one subtly non-standard clause),
  "summary": string, "confidence": number
}

Output contract for a TENANT EMAIL (single JSON object):
{
  "kind": "tenant-email",
  "from": string (name + email), "propertyAddress": string, "category": "maintenance" | "lease_question" | "expansion" | "complaint",
  "subject": string, "body": string (80-150 words, sounds like a real property contact),
  "summary": string, "confidence": number
}

Output contract for a LEAD (single JSON object):
{
  "kind": "lead",
  "name": string, "email": string, "phone": string (format (xxx) xxx-xxxx), "source": "Zillow" | "Realtor.com" | "Website" | "Referral" | "Apartments.com",
  "propertyInterest": string, "budget": string, "message": string, "timeline": string,
  "summary": string, "confidence": number
}

Rules:
- Numbers must obey CRE norms (see your platform playbook): office vacancy 12-22%, industrial 4-8%, cap rates office 7-9.5%, industrial 5-7%.
- Never repeat the same company or street from a previous artifact if you can avoid it.
- Only output the JSON object for the requested kind.`,
    buildPrompt: (ctx) =>
      `${ctx.userInput?.trim() || 'Synthesize the next artifact for the data fabric.'}\n\nGenerate exactly one JSON object for kind="${ctx.goal || 'market-snapshot'}" now.`,
    validate: (value) => {
      const d = obj(value);
      return {
        kind: str(d.kind, 'market-snapshot'),
        ...d,
      };
    },
  },
};

export const FABRICATOR_AGENT_ID = 'agent-atlas';
